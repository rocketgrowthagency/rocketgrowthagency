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

# 🔴 2026-08-19 (Chris: "if it fails close the browser of the failed") — REAP CHROME ON EVERY FAILURE.
# A failed lead used to leave its Chrome window open, often parked on the site's own error page
# (ERR_SSL_VERSION_OR_CIPHER_MISMATCH, ERR_ADDRESS_UNREACHABLE). Two costs: the windows pile up across a
# long batch, and — the expensive one — an orphaned Chrome keeps its profile dir LOCKED, which wedges the
# NEXT lead's capture. That is the 2026-07-27 orphaned-Chrome stall.
# Scoped to the step-3/step-2.5 capture profiles so a browser Chris has open himself is never touched.
reap_chrome(){ pkill -9 -f 'chrome-profile-step3' 2>/dev/null; pkill -9 -f 'chrome-profile-step25' 2>/dev/null; true; }

# 🔴 2026-08-19 (Chris: "list the reason and what failed so we know and can tally fail reasons").
# The run log holds the reasons in prose, which cannot be counted without grepping ad hoc every time.
# This writes ONE TSV row per failure — date, slug, reason, detail — so a tally is a one-liner and the
# same reason string is used everywhere. Reasons are the SHORT codes already used in FAILED[]
# (site-unreachable, step-3-timeout, below-6of6, gate, no-mp4, ...) so they stay stable and countable.
FAILLOG="$SCRAPER/output/rebuild-failures.tsv"
[ -f "$FAILLOG" ] || printf 'date\tslug\treason\tdetail\n' > "$FAILLOG"
note_fail(){ printf '%s\t%s\t%s\t%s\n' "$(date +%F\ %H:%M)" "$1" "$2" "${3:-}" >> "$FAILLOG"; }



[ $# -gt 0 ] || { say "usage: $0 <slug> [<slug> ...]"; exit 1; }
caffeinate -dimsu -t 5400 </dev/null >/dev/null 2>&1 & CAFF=$!

OK=(); OK_CSV=(); FAILED=(); TEMP_CSVS=()
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
    # 🔴 2026-08-20 — ask the SAME question step-8 asks, via the SAME code.
    # This used to test "any non-empty value in a column whose name contains email" — a SECOND rule for a
    # question step-8 already answers, and two rules for one question WILL drift. It did: Katie B Creative
    # had a valid email but no phone and no website, so step-8 filtered her row as a directory/generic
    # listing. This script had already built and deployed her video, leaving a live video with no lead
    # that can never be emailed ([[project-orphaned-videos]]).
    # csv-has-emailable-row.mjs uses a REAL csv parser and calls isUsableLeadRow + extractValidEmail from
    # lib/email-validation.cjs — the same rules step-8 applies.
    if node scripts/csv-has-emailable-row.mjs "$CAND"; then SRC="$CAND"; break; fi
    say "  ↷ skipping $(basename "$CAND") — no email in it"
  done < <(ls -t "output/Step 2/"*"_${SLUG}-only-"*"-[step-2].csv" 2>/dev/null)

  # 🔴 2026-08-21 — FALL BACK TO THE BATCH CSV. The glob above only finds PER-LEAD "-only-" files, which
  # exist solely for leads already rebuilt once. A lead from a fresh scrape lives in the BATCH csv and has
  # no per-lead file, so this script reported `no-emailable-csv` and skipped it — meaning it could never
  # heal a NEW lead, only re-heal an old one.
  # That is exactly the dead-window case: after the 2026-08-20 latched-guard night, 6 of the 7
  # Dermatologists leads were unhealable by hand purely because the healer couldn't read the only file
  # they existed in. Discovered by actually running it (Chris: "that's why we test now") — the static
  # read of this loop looked fine.
  # extract-lead-csv.mjs carves a per-lead CSV out of the newest batch that contains the slug, applying
  # the SAME isUsableLeadRow + extractValidEmail rules step-8 uses.
  if [ -z "$SRC" ]; then
    say "  ↷ no per-lead CSV for $SLUG — trying the batch step-2 CSVs"
    EXTRACTED=$(node scripts/extract-lead-csv.mjs "$SLUG" 2>>"$LOG")
    if [ -n "$EXTRACTED" ] && [ -f "$EXTRACTED" ]; then
      SRC="$EXTRACTED"; TEMP_CSVS+=("$EXTRACTED")
      say "  ✓ carved per-lead CSV from batch: $(basename "$SRC")"
    fi
  fi

  if [ -z "$SRC" ]; then say "  ✗ no step-2 CSV WITH AN EMAIL for $SLUG — skipping (a video is only built for a lead we can email)"; reap_chrome; note_fail "$SLUG" "no-emailable-csv"; FAILED+=("$SLUG:no-emailable-csv"); continue; fi
  BASE=$(basename "$SRC"); SUFFIX=${BASE#*_}
  CSV="output/Step 2/${DATE}_${SUFFIX}"
  cp "$SRC" "$CSV"; TEMP_CSVS+=("$CSV")
  say "  csv: $CSV"

  RUN="${DATE}_${SUFFIX%.csv}"

  # 🔴 2026-08-21 — A CACHED AUDIT MAKES A 6/6 FAILURE PERMANENT.
  # The cache below reuses today's audit-findings.json. That is right for a step-3/step-4 retry, but
  # catastrophic when the LAST failure was a verification signal: the retry re-reads the same bad scrape
  # and fails identically, forever, so a bad scrape is indistinguishable from a genuinely thin listing.
  # California Dermatology Institute failed 5/6 "Missing: reviews" three times (09:35, 10:26, 11:25).
  # SerpApi independently reports rating 4.5 with 6 reviews — the business HAS reviews; our first scrape
  # returned `review cards found: 0, widget=true, emptyState=false` and every retry reused that zero.
  # "Missing: reviews" is the single biggest rejection reason (7 of 11), so this silently caps output.
  # Re-running is also the documented first move for a blank scrape (feedback_blank_photos_is_transient)
  # — but it only means anything if the retry actually re-scrapes.
  _prior_verif_fail=$(awk -F'\t' -v s="$SLUG" '$2==s && $3 ~ /below-6of6|gate/ {n++} END{print n+0}' output/rebuild-failures.tsv 2>/dev/null)
  _prior_verif_fail=${_prior_verif_fail:-0}
  if [ "$_prior_verif_fail" -gt 0 ] && [ -f "output/Step 2.5 (Audit)/${RUN}/audit-findings.json" ]; then
    say "  ↻ prior 6/6 failure (${_prior_verif_fail}×) — discarding the cached audit so reviews are re-scraped"
    rm -f "output/Step 2.5 (Audit)/${RUN}/audit-findings.json"
  fi

  # step-2.5 audit — reuse if today's already exists, else fresh (the voiceover needs its findings)
  if [ -f "output/Step 2.5 (Audit)/${RUN}/audit-findings.json" ]; then say "  step-2.5 cached"
  else say "  step-2.5 audit"; STEP2_CSV="$CSV" node step-2.5-audit.mjs >>"$LOG" 2>&1 || { say "  ✗ step-2.5"; reap_chrome; note_fail "$SLUG" "step-2.5"; FAILED+=("$SLUG:step-2.5"); continue; }; fi

  # 🔴 2026-08-19 — SKIP A LEAD WHOSE OWN SITE CANNOT BE LOADED BY ANY CLIENT.
  # step-3 records three segments (Maps, desktop site, mobile site). If the site cannot connect at all,
  # the lead can NEVER produce 3/3 WebMs and can never pass the 6/6 gate — so every retry burns ~6 minutes
  # of capture and one of its three lifetime attempts, forever.
  # PROVEN: davidostrovelaw.com serves ERR_SSL_VERSION_OR_CIPHER_MISMATCH in Chrome and fails curl with
  # `sslv3 alert handshake failure` — an obsolete TLS config on THEIR server. It failed 08-10, failed again
  # 08-19, and Chris confirmed it as a true fail. Nothing on our side can fix it.
  # Only HARD failures park a lead (TLS handshake / DNS / connection refused). A timeout, 403 or bot-block
  # is TRANSIENT — a real browser may still succeed — so those still get their capture.
  SITE_URL=$(tail -n +2 "$CSV" 2>/dev/null | grep -oE 'https?://[^ ",]+' | head -1)
  if [ -n "$SITE_URL" ]; then
    REACH=$(node scripts/check-site-reachable.mjs "$SITE_URL" 2>/dev/null | cut -f1)
    if [ "$REACH" = "unbuildable" ]; then
      say "  ⛔ site unreachable by ANY client ($SITE_URL) — permanently unbuildable, skipping without spending a capture"
      echo "$SLUG	$SITE_URL	$(date +%F)" >> "$SCRAPER/output/unbuildable-leads.tsv"
      reap_chrome; note_fail "$SLUG" "site-unreachable"; FAILED+=("$SLUG:site-unreachable"); continue
    fi
  fi

  say "  step-3 capture (fresh)"
  # FORCE_RECAPTURE=1 — this script exists to fix CAPTURE defects, so it must never reuse existing WebMs.
  # Without it step-3 prints "all 3 videos already exist", skips, and the redo re-renders the SAME broken
  # footage while reporting success (hit 2026-08-13 redoing the blank-hero videos — step-4 in 20 seconds).
  #
  # 🔴 2026-08-19 — PER-LEAD WATCHDOG. This script had none, while overnight-pipeline.sh has had one for
  # months (PER_LEAD_TIMEOUT_SEC=600). Capture is a SILENT phase — it records three videos and prints
  # nothing for ~5 minutes — so a genuine hang is indistinguishable from normal progress. Chris asked "is
  # it stuck?" during a 314-second silence that was in fact a lead whose site (davidostrovelaw.com)
  # serves a broken TLS handshake; without a bound, a real hang would have sat there forever and taken the
  # rest of the batch with it. `timeout` sends TERM then KILL, and 124 is its distinct exit code.
  # Chrome must be reaped explicitly: killing node orphans the browser, which then holds the profile dir
  # and wedges the NEXT lead (the 2026-07-27 orphaned-Chrome stall).
  # ⚠️ `timeout` is GNU coreutils and is NOT on stock macOS — using it here would have made this watchdog
  # a silent no-op (verified: `command -v timeout` is empty on this machine). So this is the same manual
  # PID + poll watchdog overnight-pipeline.sh already runs in production.
  STEP3_TIMEOUT_SEC="${STEP3_TIMEOUT_SEC:-600}"
  STEP2_CSV="$CSV" MAX_VIDEOS=1 FORCE_RECAPTURE=1 node step-3-video-recorder.mjs >>"$LOG" 2>&1 &
  S3PID=$!
  S3START=$(date +%s); S3TIMEDOUT=0
  while kill -0 "$S3PID" 2>/dev/null; do
    sleep 3
    if [ "$(( $(date +%s) - S3START ))" -gt "$STEP3_TIMEOUT_SEC" ]; then
      S3TIMEDOUT=1
      say "  ⏱ step-3 exceeded ${STEP3_TIMEOUT_SEC}s — killing (hung capture, usually an unreachable/slow site)"
      # Kill the node process AND the browser it spawned. Killing only node orphans Chrome, which keeps
      # the profile dir locked and wedges the NEXT lead (the 2026-07-27 orphaned-Chrome stall).
      kill -9 "$S3PID" 2>/dev/null
      pkill -9 -f 'chrome-profile-step3' 2>/dev/null; pkill -9 -f 'chrome-profile-step25' 2>/dev/null
      break
    fi
  done
  wait "$S3PID" 2>/dev/null; S3RC=$?
  if [ "$S3TIMEDOUT" = "1" ]; then reap_chrome; note_fail "$SLUG" "step-3-timeout"; FAILED+=("$SLUG:step-3-timeout"); continue; fi
  [ "$S3RC" = "0" ] || { say "  ✗ step-3 (guardrail or capture failure)"; reap_chrome; note_fail "$SLUG" "step-3"; FAILED+=("$SLUG:step-3"); continue; }

  say "  step-6 voiceover (6/6 gate)"
  STEP2_CSV="$CSV" node step-6-voiceover.mjs >>"$LOG" 2>&1; RC=$?
  if [ "$RC" = "3" ]; then say "  ⚠ below 6/6 — correctly blocked"; reap_chrome; note_fail "$SLUG" "below-6of6"; FAILED+=("$SLUG:below-6of6"); continue; fi
  [ "$RC" = "0" ] || { say "  ✗ step-6 (rc=$RC)"; reap_chrome; note_fail "$SLUG" "step-6"; FAILED+=("$SLUG:step-6"); continue; }

  for STEP in "step-4-combine-desktop-mobile" "step-5-branding" "step-6b-subtitles" "step-7-merge-branded-audio"; do
    say "  ${STEP}"
    STEP2_CSV="$CSV" MAX_BRANDS=1 MAX_RECORDINGS=1 node "${STEP}.mjs" >>"$LOG" 2>&1 || { say "  ✗ ${STEP}"; reap_chrome; note_fail "$SLUG" "${STEP}"; FAILED+=("$SLUG:${STEP}"); continue 2; }
  done

  MP4=$(find "output/Step 7 (Final Merge MP4)/${RUN}" -maxdepth 1 -name '*.mp4' 2>/dev/null | head -1)
  [ -n "$MP4" ] || { say "  ✗ no step-7 mp4"; reap_chrome; note_fail "$SLUG" "no-mp4"; FAILED+=("$SLUG:no-mp4"); continue; }
  BUILD_SLUG=$(basename "$MP4" .mp4 | sed 's/^[0-9]*_//')

  # The acceptance gate runs inside build-video-landing — a broken rebuild simply won't publish.
  say "  build landing (acceptance + visual gates)"
  OUT=$(REQUIRE_SLUG=1 BUILD_ONLY_SLUG="$BUILD_SLUG" node build-video-landing.mjs 2>&1); echo "$OUT" >>"$LOG"
  if echo "$OUT" | grep -q "GATE FAILED"; then
    say "  🚫 $(echo "$OUT" | grep -oE '(ACCEPTANCE|VISUAL) GATE FAILED.*' | head -1 | cut -c1-140)"
    reap_chrome; note_fail "$SLUG" "gate"; FAILED+=("$SLUG:gate"); continue
  fi
  [ -d "output/landing-pages/v/$BUILD_SLUG" ] || { say "  ✗ no landing dir"; reap_chrome; note_fail "$SLUG" "no-landing"; FAILED+=("$SLUG:no-landing"); continue; }
  rsync -a --delete "output/landing-pages/v/$BUILD_SLUG/" "$WEBSITE/v/$BUILD_SLUG/"
  say "  ✓ staged /v/$BUILD_SLUG/"
  OK+=("$BUILD_SLUG")
  OK_CSV+=("$CSV")        # kept so step-8 can publish this lead AFTER the deploy proves the video serves
done

say ""; say "════ rebuilt ${#OK[@]} · failed ${#FAILED[@]} ════"
# Tally THIS batch's failures by reason, so the cause mix is visible without grepping the log.
if [ "${#FAILED[@]}" -gt 0 ]; then
  say "  failure reasons this batch:"
  printf '%s\n' "${FAILED[@]}" | sed 's/.*://' | sort | uniq -c | sort -rn | while read -r n r; do say "    ${n}  ${r}"; done
  say "  (full history: output/rebuild-failures.tsv — tally with:"
  say "     cut -f3 output/rebuild-failures.tsv | tail -n +2 | sort | uniq -c | sort -rn )"
fi
[ ${#FAILED[@]} -gt 0 ] && say "failed: ${FAILED[*]}"
[ ${#OK[@]} -eq 0 ] && { say "nothing to deploy"; exit 0; }

# ── ONE batched deploy: the locked unlock → deploy → verify-serves → relock dance ──
say "deploying ${#OK[@]} rebuilt video(s)…"
TOK=$(grep -E '^NETLIFY_AUTH_TOKEN=' "$SCRAPER/.env" | head -1 | cut -d= -f2-)
SITE="38f275c7-a4a8-4531-9989-1fc1ccb78f9e"
CUR=$(curl -s -H "Authorization: Bearer $TOK" "https://api.netlify.com/api/v1/sites/$SITE" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{console.log(JSON.parse(d).published_deploy?.id||'')})")
curl -s -X POST -H "Authorization: Bearer $TOK" "https://api.netlify.com/api/v1/deploys/$CUR/unlock" -o /dev/null
# 🔴 The deploy's exit code must be the DEPLOY's, not grep's. Same trap that hid a whole failed night on
# 2026-08-19 (Netlify out of credits → JSONHTTPError: Forbidden → 53 pages silently served the homepage).
( cd "$WEBSITE" && NETLIFY_AUTH_TOKEN="$TOK" netlify deploy --prod --dir="." --site="$SITE" --message="rebuild broken videos: ${OK[*]}" 2>&1 | tee -a "$LOG" | grep -iE "Unique deploy|error"; exit "${PIPESTATUS[0]}" )
DRC=$?
[ "${DRC:-1}" -ne 0 ] && say "🚨 DEPLOY FAILED (exit $DRC) — videos are NOT live. Check Netlify credits/token."

# Verify each one SERVES before publishing anything to Airtable. content_type is the only proof:
# netlify.toml ends in a /* SPA catch-all, so an absent path answers 200 text/html.
SERVED=(); SERVED_CSV=()
for i in "${!OK[@]}"; do
  s="${OK[$i]}"
  CT=$(curl -s -o /dev/null -w '%{content_type}' "https://www.rocketgrowthagency.com/v/$s/video.mp4")
  say "  verify /v/$s/ → $CT"
  case "$CT" in video/*) SERVED+=("$s"); SERVED_CSV+=("${OK_CSV[$i]}") ;; esac
done

# 🔴 2026-08-20 — PUBLISH THE LEAD. This script never ran step-8, so a lead that died BEFORE step-8 in
# its original night got a rebuilt, deployed video and STILL no Airtable row. The result is a video that
# can never be emailed, and nothing reported it: every reconciliation starts from the lead list, so a
# video with no lead is invisible to all of them. The orphan sweep found 27 such videos built in 14 days
# (67 across 977 deployed). recovery-rounds.sh even documents the precondition — "they died before
# step-8" — without anyone closing the loop.
# Runs only for videos PROVEN to serve, so the Video URL written to Airtable is a fact, not a claim.
# step-8 is an upsert (it skips duplicate creates), so re-running for an existing lead is a no-op.
for i in "${!SERVED[@]}"; do
  s="${SERVED[$i]}"; c="${SERVED_CSV[$i]}"
  [ -f "$c" ] || { say "  ⚠ no CSV for $s — cannot publish lead"; continue; }
  if STEP2_CSV="$c" node step-8-publish-to-airtable.mjs >>"$LOG" 2>&1; then
    say "  ✓ lead published/updated in Airtable — $s"
  else
    say "  ⚠ step-8 failed for $s — video is live but the lead may not exist (orphan). See $LOG"
  fi
done
NEW=$(curl -s -H "Authorization: Bearer $TOK" "https://api.netlify.com/api/v1/sites/$SITE" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{console.log(JSON.parse(d).published_deploy?.id||'')})")
curl -s -X POST -H "Authorization: Bearer $TOK" "https://api.netlify.com/api/v1/deploys/$NEW/lock" -o /dev/null
say "relocked $NEW"
say "DONE $(date +%H:%M:%S)"
