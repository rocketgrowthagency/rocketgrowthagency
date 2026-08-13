#!/bin/bash
# rebuild-broken-videos.sh — re-capture the videos that shipped BROKEN, one lead at a time, and deploy
# them in ONE batch at the end.
#
# WHY a dedicated runner: _batch-resume/redo-lead.sh only re-renders DOWNSTREAM (it reuses the existing
# step-3 WebMs), so it can't fix a blank hero or a wrong map zoom — those are capture defects. This does a
# FRESH step-3 capture, then the normal render chain, then the acceptance gate decides whether it publishes.
#
# Deploys are batched because each `netlify deploy --prod` costs build credits (the account hit its limit
# mid-session 2026-08-11). One deploy for the whole batch, with the locked unlock → deploy → verify → relock.
#
# Usage:  DAYTIME_SAFE_CAPTURE=1 ./scripts/rebuild-broken-videos.sh <slug> [<slug> ...]
#   DAYTIME_SAFE_CAPTURE=1 uses page.screenshot instead of the macOS desktop grab — it CANNOT capture
#   Chris's screen, so it is the only capture path allowed in daylight.
set -uo pipefail
SCRAPER="/Users/chris/RGA/Rocket Growth Agency Scraper VS Code"
WEBSITE="/Users/chris/RGA/Rocket Growth Agency Website VS Code"
cd "$SCRAPER"
DATE=$(date +%Y-%m-%d)
LOG="/tmp/rebuild-broken-${DATE}.log"
: > "$LOG"
say(){ echo "$*" | tee -a "$LOG"; }

[ $# -gt 0 ] || { say "usage: $0 <slug> [<slug> ...]"; exit 1; }
caffeinate -dimsu -t 5400 </dev/null >/dev/null 2>&1 & CAFF=$!

OK=(); FAILED=(); TEMP_CSVS=()
# The overnight pipeline picks its step-2 CSV with `ls -t "output/Step 2/"*"-[step-2].csv" | head -1`.
# Any today-dated file we leave there can win that race and make the night build the WRONG lead — it did
# exactly that on 2026-08-11 (an estate-planning run built a chiropractor). Clean up on the way out.
cleanup_csvs(){ for c in "${TEMP_CSVS[@]:-}"; do [ -n "$c" ] && rm -f "$c"; done; }
trap 'kill $CAFF 2>/dev/null; cleanup_csvs' EXIT
for SLUG in "$@"; do
  say ""; say "════ $SLUG — $(date +%H:%M:%S) ════"

  # Pick the newest step-2 CSV for this lead THAT ACTUALLY CARRIES AN EMAIL, and re-date it so today's run
  # owns the output dirs.
  #
  # 2026-08-13: plain `ls -t | head -1` is the anti-pattern from feedback_pipeline_must_own_its_inputs — the
  # one that lost the 08-11 night. It bit here too: william-spiller has two CSVs, and the NEWER one (a
  # bankruptcy search) has no email while the older estate-planning one does. step-3 then correctly skipped
  # the lead ("no rows with email") and exited 0, and step-4 failed hunting for output that was never going
  # to exist — a confusing error three steps downstream of the real cause.
  # A video exists to be emailed (feedback_every_email_gets_a_video), so a CSV with no email is not a
  # candidate at all.
  # NOTE: `for CAND in $(ls …)` word-splits on the space in "Step 2" and shreds every path — read lines instead.
  SRC=""
  while IFS= read -r CAND; do
    [ -n "$CAND" ] || continue
    if python3 - "$CAND" <<'PYEOF'
import csv, sys
with open(sys.argv[1], newline="") as fh:
    for row in csv.DictReader(fh):
        if any("email" in (k or "").lower() and (v or "").strip() for k, v in row.items()):
            sys.exit(0)
sys.exit(1)
PYEOF
    then SRC="$CAND"; break; fi
    say "  ↷ skipping $(basename "$CAND") — no email in it"
  done < <(ls -t "output/Step 2/"*"_${SLUG}-only-"*"-[step-2].csv" 2>/dev/null)
  if [ -z "$SRC" ]; then say "  ✗ no step-2 CSV WITH AN EMAIL for $SLUG — skipping (a video is only built for a lead we can email)"; FAILED+=("$SLUG:no-emailable-csv"); continue; fi
  BASE=$(basename "$SRC"); SUFFIX=${BASE#*_}
  CSV="output/Step 2/${DATE}_${SUFFIX}"
  cp "$SRC" "$CSV"; TEMP_CSVS+=("$CSV")
  say "  csv: $CSV"

  RUN="${DATE}_${SUFFIX%.csv}"
  # step-2.5 audit — reuse if today's already exists, else fresh (the voiceover needs its findings)
  if [ -f "output/Step 2.5 (Audit)/${RUN}/audit-findings.json" ]; then say "  step-2.5 cached"
  else say "  step-2.5 audit"; STEP2_CSV="$CSV" node step-2.5-audit.mjs >>"$LOG" 2>&1 || { say "  ✗ step-2.5"; FAILED+=("$SLUG:step-2.5"); continue; }; fi

  say "  step-3 capture (fresh)"
  # FORCE_RECAPTURE=1 — this script exists to fix CAPTURE defects, so it must never reuse existing WebMs.
  # Without it step-3 prints "all 3 videos already exist", skips, and the redo re-renders the SAME broken
  # footage while reporting success (hit 2026-08-13 redoing the blank-hero videos — step-4 in 20 seconds).
  STEP2_CSV="$CSV" MAX_VIDEOS=1 FORCE_RECAPTURE=1 node step-3-video-recorder.mjs >>"$LOG" 2>&1 || { say "  ✗ step-3 (guardrail or capture failure)"; FAILED+=("$SLUG:step-3"); continue; }

  say "  step-6 voiceover (6/6 gate)"
  STEP2_CSV="$CSV" node step-6-voiceover.mjs >>"$LOG" 2>&1; RC=$?
  if [ "$RC" = "3" ]; then say "  ⚠ below 6/6 — correctly blocked"; FAILED+=("$SLUG:below-6of6"); continue; fi
  [ "$RC" = "0" ] || { say "  ✗ step-6 (rc=$RC)"; FAILED+=("$SLUG:step-6"); continue; }

  for STEP in "step-4-combine-desktop-mobile" "step-5-branding" "step-6b-subtitles" "step-7-merge-branded-audio"; do
    say "  ${STEP}"
    STEP2_CSV="$CSV" MAX_BRANDS=1 MAX_RECORDINGS=1 node "${STEP}.mjs" >>"$LOG" 2>&1 || { say "  ✗ ${STEP}"; FAILED+=("$SLUG:${STEP}"); continue 2; }
  done

  MP4=$(find "output/Step 7 (Final Merge MP4)/${RUN}" -maxdepth 1 -name '*.mp4' 2>/dev/null | head -1)
  [ -n "$MP4" ] || { say "  ✗ no step-7 mp4"; FAILED+=("$SLUG:no-mp4"); continue; }
  BUILD_SLUG=$(basename "$MP4" .mp4 | sed 's/^[0-9]*_//')

  # The acceptance gate runs inside build-video-landing — a broken rebuild simply won't publish.
  say "  build landing (acceptance + visual gates)"
  OUT=$(REQUIRE_SLUG=1 BUILD_ONLY_SLUG="$BUILD_SLUG" node build-video-landing.mjs 2>&1); echo "$OUT" >>"$LOG"
  if echo "$OUT" | grep -q "GATE FAILED"; then
    say "  🚫 $(echo "$OUT" | grep -oE '(ACCEPTANCE|VISUAL) GATE FAILED.*' | head -1 | cut -c1-140)"
    FAILED+=("$SLUG:gate"); continue
  fi
  [ -d "output/landing-pages/v/$BUILD_SLUG" ] || { say "  ✗ no landing dir"; FAILED+=("$SLUG:no-landing"); continue; }
  rsync -a --delete "output/landing-pages/v/$BUILD_SLUG/" "$WEBSITE/v/$BUILD_SLUG/"
  say "  ✓ staged /v/$BUILD_SLUG/"
  OK+=("$BUILD_SLUG")
done

say ""; say "════ rebuilt ${#OK[@]} · failed ${#FAILED[@]} ════"
[ ${#FAILED[@]} -gt 0 ] && say "failed: ${FAILED[*]}"
[ ${#OK[@]} -eq 0 ] && { say "nothing to deploy"; exit 0; }

# ── ONE batched deploy: the locked unlock → deploy → verify-serves → relock dance ──
say "deploying ${#OK[@]} rebuilt video(s)…"
TOK=$(grep -E '^NETLIFY_AUTH_TOKEN=' "$SCRAPER/.env" | head -1 | cut -d= -f2-)
SITE="38f275c7-a4a8-4531-9989-1fc1ccb78f9e"
CUR=$(curl -s -H "Authorization: Bearer $TOK" "https://api.netlify.com/api/v1/sites/$SITE" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{console.log(JSON.parse(d).published_deploy?.id||'')})")
curl -s -X POST -H "Authorization: Bearer $TOK" "https://api.netlify.com/api/v1/deploys/$CUR/unlock" -o /dev/null
( cd "$WEBSITE" && NETLIFY_AUTH_TOKEN="$TOK" netlify deploy --prod --dir="." --site="$SITE" --message="rebuild broken videos: ${OK[*]}" 2>&1 | grep -iE "Unique deploy|error" ) | tee -a "$LOG"
for s in "${OK[@]}"; do
  say "  verify /v/$s/ → $(curl -s -o /dev/null -w '%{http_code} %{content_type}' "https://www.rocketgrowthagency.com/v/$s/video.mp4")"
done
NEW=$(curl -s -H "Authorization: Bearer $TOK" "https://api.netlify.com/api/v1/sites/$SITE" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{console.log(JSON.parse(d).published_deploy?.id||'')})")
curl -s -X POST -H "Authorization: Bearer $TOK" "https://api.netlify.com/api/v1/deploys/$NEW/lock" -o /dev/null
say "relocked $NEW"
say "DONE $(date +%H:%M:%S)"
