#!/bin/bash
# rehearse-night-run.sh — PROVE THE NIGHT RUN WILL WORK, IN DAYLIGHT, IN ~2 MINUTES.
#
# WHY THIS EXISTS
# ==============================================================================================
# Output collapsed from 14 videos/night (08-06→08-09) to ZERO on 08-12 and 08-13. Cause: 15 commits
# to core pipeline stages in four days, each one a fix for the previous night's failure, and the ONLY
# place any of them got verified was the 21:00 run itself. That is a 24-hour feedback loop, so every
# mistake costs a whole night:
#
#   08-11  step-2 picked the wrong step-1 CSV (`ls -t | head -1`)          → built the wrong business
#   08-12  the FIX for that reassigned a `const`                           → TypeError, 0 videos
#   08-13  same bug, still unnoticed                                       → TypeError, 0 videos
#   08-13  a visual-gate threshold calibrated on a SYNTHETIC blank         → passed a real blank
#
# Every one was catchable in seconds without spending a night. Nothing checked that the pipeline could
# even START — twelve gates guarded video CORRECTNESS and not one asked "does step-2 load?".
#
# This runs any time of day (it never captures, so the 21:00–06:59 interlock does not apply) and covers
# the four failure classes that have actually happened.
#
# Usage:  ./scripts/rehearse-night-run.sh
# Exit:   0 = the night run should work. 1 = it would fail; the phase that failed is named.
# ==============================================================================================
set -uo pipefail
cd "$(dirname "$0")/.."
FAIL=0
pass(){ echo "  ✅ $*"; }
fail(){ echo "  ❌ $*"; FAIL=1; }
phase(){ echo; echo "── $* ──"; }

# ── PHASE A: can every stage even load? ───────────────────────────────────────────────────────
# Catches the 08-12/08-13 killer: `const files` reassigned = TypeError thrown on first call.
# `node --check` PARSES that fine, which is why nothing caught it for two nights.
phase "A. every pipeline stage loads"
if node scripts/check-pipeline-stages-load.mjs >/tmp/reh-a.log 2>&1; then
  pass "$(grep -oE "[0-9]+/[0-9]+ stages parse clean" /tmp/reh-a.log | head -1)"
else
  fail "a stage throws on load:"; grep -E "❌|THROWS|SYNTAX" /tmp/reh-a.log | head -4 | sed 's/^/       /'
fi

# ── PHASE B: does step-2 own its input? ───────────────────────────────────────────────────────
# Catches the 08-11 class: a stray/per-lead step-1 CSV winning by mtime and building the wrong business.
phase "B. step-2 selects the CSV that belongs to its search"
SQ="${REHEARSE_SEARCH:-Insurance agents in Culver City, CA}"
SLUG=$(echo "$SQ" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]\{1,\}/-/g; s/^-//; s/-$//')
# ⚠️ 2026-08-14 — REHEARSE, DO NOT RUN. The first version imported step-2-email-scraper.mjs, whose module
# body does not stop at CSV selection: it launched a REAL 55-lead scrape and opened a Chrome window on
# Chris's screen while he was at his station. A rehearsal that performs the work it is rehearsing is not a
# rehearsal. This now REPLICATES the selection rule (same slug-scope + per-lead exclusion as
# findLatestStep1Csv) against the real directory, touching nothing and starting no process.
PICKED=$(ls -t "output/Step 1"/*"[step-1].csv" 2>/dev/null \
  | grep -i -- "$SLUG" | grep -v -- "-only-" | head -1 | sed 's|.*/||')
if [ -z "$PICKED" ]; then
  fail "step-2 produced no CSV selection (see above)"
elif echo "$PICKED" | grep -q -- "-only-"; then
  fail "step-2 chose a PER-LEAD file: $PICKED  (this is the 08-11 failure)"
elif echo "$PICKED" | grep -qi "$SLUG"; then
  pass "chose $PICKED"
else
  fail "chose a CSV for a DIFFERENT search: $PICKED (expected slug '$SLUG')"
fi

# ── PHASE C: do the gates still discriminate? ─────────────────────────────────────────────────
# Catches the 08-13 class: a threshold calibrated on a synthetic defect that passed a REAL one.
# A gate is only useful if it FAILS bad input — testing only that it passes good input is how a
# broken gate looks healthy. So we assert BOTH directions against a real video.
phase "C. the gates still discriminate (both directions, real artifacts)"
# 2026-08-17 REWRITTEN. The old version sabotaged the band at x=iw*0.3156 w=iw*0.25 — the SAME
# coordinates as the fixed BAND constant in check-video-visual.mjs. Both were wrong in the same way:
# in the finished video the detail card occupies the LEFT ~30%, so that rectangle lands on the MAP.
# The test therefore painted the map white and asserted that a detector which measured the map noticed
# — a fixture built to match the bug, which is exactly why it stayed green while 18 good videos were
# rejected in three nights. Now: sabotage the REAL hero band, and assert the gate that actually OWNS
# the blank-hero verdict (check-video-acceptance.mjs, anchored on the OCR'd heading via hero-band.mjs).
#
# The fixture must also be genuinely good. `ls -t` alone once picked lexx-wake-photo — one of the
# videos that shipped with a blank ocean map — as the "known-good" baseline.
# NOTE: the fixture paths contain spaces ("Step 7 (Final Merge MP4)"), so this MUST read
# line-by-line — an unquoted $(ls ...) in a `for` word-splits every path into fragments.
GOOD=""
while IFS= read -r cand; do
  [ -z "$cand" ] && continue
  node scripts/check-video-acceptance.mjs "$cand" --json 2>/dev/null | grep -q '"pass": *true' || continue
  # Must pass the VISUAL gate too. Passing only the acceptance gate is not "good": gregory-mancuso
  # (2026-08-17) had a flawless card and a blank ocean map, so it cleared acceptance and was chosen as
  # the known-good baseline — then the visual gate was blamed for rejecting it.
  node scripts/check-video-visual.mjs "$cand" --no-vision >/dev/null 2>&1 || continue
  # A video can pass every gate and still be unusable: lexx-wake-photo passes the acceptance gate
  # with a SOLID BLANK OCEAN map (no coordinates → arbitrary centre). Require real cartographic
  # detail too, or the "known-good" baseline is itself a broken video — which it was.
  sd=$(ffmpeg -hide_banner -loglevel error -ss 33 -i "$cand" \
        -vf "crop=iw*0.45:ih*0.70:iw*0.33:ih*0.15,scale=64:48,format=gray" \
        -frames:v 1 -f rawvideo - 2>/dev/null | python3 -c "
import sys
d=sys.stdin.buffer.read()
if len(d)<64: print(0); raise SystemExit
m=sum(d)/len(d)
print(int((sum((x-m)**2 for x in d)/len(d))**0.5))
" 2>/dev/null)
  [ -n "$sd" ] && [ "$sd" -ge 12 ] 2>/dev/null || continue
  GOOD="$cand"; break
done < <(ls -t "output/Step 7 (Final Merge MP4)"/*/*.mp4 2>/dev/null | head -14)
if [ -z "$GOOD" ]; then
  fail "no video passes the acceptance gate — cannot build a trustworthy fixture"
else
  B=$(basename "$GOOD")
  pass "fixture is a video that PASSES the acceptance gate ($B)"
  if node scripts/check-video-visual.mjs "$GOOD" --no-vision >/tmp/reh-good.log 2>&1; then
    pass "visual gate passes it too"
  else
    fail "visual gate REJECTS a known-good video ($B):"; grep -E "✗" /tmp/reh-good.log | head -2 | sed 's/^/       /'
  fi

  # ── blank hero: paint the card's ACTUAL photo band flat white ────────────────────────────────
  # The card sits at the left edge; its hero photo spans roughly x 5-30%, y 0-26% of the frame.
  BAD=/tmp/reh-blank-hero.mp4
  # Cover the hero band in BOTH layouts (card-at-left AND results+card), or the sabotage silently
  # misses and the test reports a false "gate is not discriminating".
  ffmpeg -y -loglevel error -i "$GOOD" -vf "drawbox=x=iw*0.04:y=0:w=iw*0.54:h=ih*0.26:color=white@1.0:t=fill" \
         -c:v libx264 -preset ultrafast -crf 28 -an -t 60 "$BAD" >/dev/null 2>&1
  if [ -s "$BAD" ]; then
    if node scripts/check-video-acceptance.mjs "$BAD" --json >/tmp/reh-bad.log 2>&1 && grep -q '"pass": *true' /tmp/reh-bad.log; then
      fail "acceptance gate PASSES a blank-hero video — the blank-hero guard is not discriminating"
    else
      pass "acceptance gate rejects a blank hero ($(grep -oE 'BLANK HERO[^\"]{0,40}' /tmp/reh-bad.log | head -1))"
    fi
    rm -f "$BAD"
  else
    fail "could not build the blank-hero fixture (ffmpeg)"
  fi

  # ── quarter-scale: shrink the render into the top-left quadrant, white elsewhere ─────────────
  # This is the santa-monica-auto-body defect, and it is what the VISUAL gate owns deterministically.
  QS=/tmp/reh-quarter.mp4
  ffmpeg -y -loglevel error -i "$GOOD" -vf "scale=iw/2:ih/2,pad=iw*2:ih*2:0:0:white" \
         -c:v libx264 -preset ultrafast -crf 28 -an -t 60 "$QS" >/dev/null 2>&1
  if [ -s "$QS" ]; then
    if node scripts/check-video-visual.mjs "$QS" --no-vision >/tmp/reh-qs.log 2>&1; then
      fail "visual gate PASSES a quarter-scale render — check A is not discriminating"
    else
      pass "visual gate rejects a quarter-scale render"
    fi
    rm -f "$QS"
  else
    fail "could not build the quarter-scale fixture (ffmpeg)"
  fi
fi

# ── PHASE D: arming state ─────────────────────────────────────────────────────────────────────
# Catches "it silently never started": stale processes, a stop flag, stray today-dated inputs.
phase "D. arming state"
STRAY=$(find "output/Step 2" -maxdepth 1 -name "$(date +%F)_*only*step-2*.csv" 2>/dev/null | wc -l | tr -d ' ')
[ "$STRAY" = "0" ] && pass "no stray per-lead CSV dated today" || fail "$STRAY stray today-dated per-lead CSV(s) — these hijack the run"
# Match the ACTUAL stage/runner processes only. A bare substring match also hits log-watchers, tails and
# this script's own subshell, which reports a phantom "already running" — a false alarm in a pre-flight is
# how a real one gets ignored.
if pgrep -f "node .*step-[0-9b.]*-.*\.mjs" >/dev/null 2>&1 || pgrep -f "bash .*overnight-(local|pipeline)\.sh" >/dev/null 2>&1; then
  fail "a pipeline process is ALREADY running — the night run refuses to start:"
  pgrep -fl "node .*step-[0-9b.]*-.*\.mjs|bash .*overnight-(local|pipeline)\.sh" | head -2 | cut -c1-110 | sed 's/^/       /'
else
  pass "no stale pipeline processes"
fi
{ [ -f output/STOP-OVERNIGHT ] || [ -f STOP-OVERNIGHT ]; } && fail "a STOP-OVERNIGHT flag is present — the run will stop early" || pass "no stop flag"
launchctl list 2>/dev/null | grep -q "com.rga.overnight-build" \
  && pass "launchd job loaded (fires 21:00)" || fail "launchd job com.rga.overnight-build NOT loaded"

echo
if [ "$FAIL" = "0" ]; then
  echo "════ REHEARSAL PASSED — the night run should work ════"
  exit 0
else
  echo "════ REHEARSAL FAILED — fix the ❌ above BEFORE 21:00 ════"
  exit 1
fi
