#!/bin/bash
# overnight-local.sh — CITY-FIRST local-domination overnight runner (locked 2026-07-01).
#
# When Chris says "I'm leaving for the night", THIS is what runs. It:
#   1. Asks next-search.mjs for the nearest unscraped city+business (proximity order, SoCal-first).
#   2. Runs the full video pipeline on it (scrape → render → deploy → publish to Airtable).
#   3. Loops to the NEXT nearest city+business — building a buffer of ready-to-send local videos
#      through the night. The ~50/day send cap drips them out; a backlog of ready videos is good.
# Stops when: the night window (caffeinate) ends, MAX_SEARCHES hit, or SoCal is fully exhausted.
#
# Usage (Chris away only — needs the screen for Maps capture):
#   ./scripts/overnight-local.sh            # loop until window/queue ends
#   MAX_SEARCHES=3 ./scripts/overnight-local.sh
set -u
SCRAPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRAPER_DIR"
DATE_STAMP=$(date +%Y-%m-%d)
LOG="/tmp/overnight-local-${DATE_STAMP}.log"

# NIGHT-ONLY INTERLOCK (locked 2026-07-10 — Chris: "we only do at night"). The Maps segment is a live
# SCREEN recording; running it while the Mac is in use bleeds the desktop (other apps, private notes,
# FORBIDDEN Liberty Tribune content) into the outreach videos, and the 6/6 gate does NOT catch that.
# This HARD guard refuses to capture outside the night window (21:00–06:59) so a manual/cron daytime
# trigger can NEVER film the desktop. 10#$ forces base-10 (avoids the "08"/"09" octal trap).
# NO OVERRIDE (locked 2026-07-20): the old ALLOW_DAYTIME_CAPTURE=1 escape hatch was used on 07-18 and
# filmed Chris's VS Code desktop (Echory/Liberty-Tribune) into a public video that got emailed. A rule a
# human can bypass under pressure WILL be bypassed — so the override is deleted. Capture is night-only, full stop.
HOUR=$(( 10#$(date +%H) ))
if [ "$HOUR" -ge 7 ] && [ "$HOUR" -lt 21 ]; then
  echo "=== overnight-local BLOCKED $(date) — night-only interlock: video capture runs 21:00–06:59 to avoid filming the desktop. No override. ===" | tee -a "$LOG"
  exit 0
fi

# PRODUCTION PAUSE GATE (2026-07-03). The production governor (or Chris) pauses nightly video
# production when the send side is caught up (sendable buffer >> daily send rate) or deliverability
# is unsafe. If paused, exit immediately WITHOUT caffeinating or scraping. The governor removes
# output/PRODUCTION-PAUSED to resume when buffer drains + bounce is GREEN. See feedback_production_governor.
# AUTONOMOUS SELF-REGULATION (2026-07-10): consult the production governor on EVERY run so nightly
# production MATCHES SEND OUTPUT with zero human involvement. Build ONLY when the send side needs fuel
# (sendable buffer <= RESUME_BUFFER_MAX) AND bounce is GREEN (< RESUME_BOUNCE_MAX). This replaces the
# old "only check the governor IF a manual pause-flag happens to exist" logic — which meant that once
# the flag was auto-cleared, production ran unconditionally every night and OVERPRODUCED. Domain
# protection = rule #1 → FAILS SAFE: only a clean RESUME (exit 0) proceeds; STAY-PAUSED / undecidable
# (exit 1 / 2) skips the night. A manual output/PRODUCTION-PAUSED file is a HARD override that
# force-skips regardless of what the governor says (Chris's kill switch). See feedback_production_governor.
if [ -f "$SCRAPER_DIR/output/PRODUCTION-PAUSED" ]; then
  echo "=== overnight-local SKIP $(date) — manual PRODUCTION-PAUSED override present; not producing. ===" | tee -a "$LOG"
  cat "$SCRAPER_DIR/output/PRODUCTION-PAUSED" 2>/dev/null | tee -a "$LOG"
  exit 0
fi
# PRODUCTION IS NOT THROTTLED (Chris 2026-07-21: "we don't throttle video production, we only throttle
# sending"). Scrape + build the ENTIRE list every night. Excess videos become inventory that the SEND side
# meters out at its daily cap — building videos costs nothing on deliverability; only SENDING does. So the
# send-capacity governor NO LONGER limits how many searches we build. The send throttle lives entirely on
# the send side (Apps Script daily cap + follow-up pacing) — untouched here. Production runs until one of the
# REAL stops: night-only capture window ends (07:00), SoCal exhausted, wall-clock cap, or the manual
# PRODUCTION-PAUSED kill switch above. We still run the governor once for VISIBILITY (bounce/room logging).
node "$SCRAPER_DIR/scripts/check-resume-production.mjs" 2>&1 | tee -a "$LOG" || true
echo "=== production NOT throttled — building the entire list tonight (send side stays capacity-throttled). ===" | tee -a "$LOG"
MAX_SEARCHES=999   # run the whole list until the night window ends (07:00) or SoCal is exhausted

# RUN THE WHOLE LIST (Chris 2026-07-21: "every scraped lead that has an email MUST get a video — no less").
# Video production is UNCAPPED — it runs the entire scraped+emailable list every night. The old 3-search
# governor cap is gone (that throttled PRODUCTION; we only throttle SENDING now). Remaining bounds:
#   MAX_SEARCHES  — set to 999 above (effectively "the whole list"); real stop is the night window / SoCal.
#   MAX_RUN_HOURS — wall-clock cap; covers the full night window so it doesn't stop before 07:00 (default 10h).
#   NIGHT-ONLY interlock (07:00) — the true stop; capture can't cross into the workday.
#   output/STOP-OVERNIGHT — touch this file to gracefully stop after the current search finishes.
# Anything not finished in one night resumes the next (reconciler + next-search pick up where we left off),
# so EVERY emailable lead ends up with a video — see feedback_every_email_gets_a_video.
MAX_SEARCHES="${MAX_SEARCHES:-999}"
MAX_RUN_HOURS="${MAX_RUN_HOURS:-10}"
WORKER_COUNT="${WORKER_COUNT:-2}"
STOP_FLAG="$SCRAPER_DIR/output/STOP-OVERNIGHT"

RUN_START=$(date +%s)
DEADLINE=$(( RUN_START + MAX_RUN_HOURS * 3600 ))
rm -f "$STOP_FLAG" 2>/dev/null   # clear any stale flag from a prior run

# Keep the machine awake only for the capped window (+30m buffer). Pipeline self-caffeinates too.
caffeinate -dimsu -t $(( MAX_RUN_HOURS * 3600 + 1800 )) &
CAFF_PID=$!
trap 'kill $CAFF_PID 2>/dev/null' EXIT

echo "=== overnight-local START $(date) — city-first, cap: ${MAX_SEARCHES} searches / ${MAX_RUN_HOURS}h, WC=${WORKER_COUNT} ===" | tee -a "$LOG"

# Manually-flagged bad videos: ARM them (remove + block send + re-queue their search) and FINALIZE
# any that were re-rendered on a prior night. Chris ticks {Redo Video} in Airtable; this self-heals.
echo ">>> redo-flagged-videos: processing {Redo Video} flags" | tee -a "$LOG"
node scripts/redo-flagged-videos.mjs 2>&1 | tee -a "$LOG"

n=0
while [ "$n" -lt "$MAX_SEARCHES" ]; do
  # Wall-clock cap + graceful stop flag — checked BEFORE starting each new search.
  if [ "$(date +%s)" -ge "$DEADLINE" ]; then echo ">>> wall-clock cap (${MAX_RUN_HOURS}h) reached — stopping after $n search(es)." | tee -a "$LOG"; break; fi
  # NIGHT-ONLY (per-search): the startup interlock checks once; re-check before EACH new capture so a
  # long run that crosses into the workday (>=07:00) STOPS instead of filming the desktop. See feedback_video_capture_screen_must_be_clear.
  NH=$(( 10#$(date +%H) )); if [ "$NH" -ge 7 ] && [ "$NH" -lt 21 ]; then echo ">>> night window ended ($(date +%H:%M)) — stopping before the workday (after $n search(es)); no desktop-bleed risk." | tee -a "$LOG"; break; fi
  if [ -f "$STOP_FLAG" ]; then echo ">>> STOP-OVERNIGHT flag found — graceful stop after $n search(es)." | tee -a "$LOG"; rm -f "$STOP_FLAG"; break; fi
  Q=$(node scripts/next-search.mjs 2>>"$LOG"); RC=$?
  if [ "$RC" -eq 3 ]; then echo ">>> SoCal fully exhausted — nothing left to scrape. Done." | tee -a "$LOG"; break; fi
  if [ "$RC" -ne 0 ] || [ -z "$Q" ]; then echo "!!! next-search failed (rc=$RC) — stopping." | tee -a "$LOG"; break; fi
  n=$((n+1))
  echo "" | tee -a "$LOG"
  echo ">>> [$n/${MAX_SEARCHES}] $(date +%H:%M) — scraping: \"$Q\"" | tee -a "$LOG"
  # Record the ATTEMPT before running, so a zero-yield search (no Lead rows written, e.g. an
  # all-art-studio "Painters" query) is never re-picked by next-search.mjs. Without this the
  # loop spins forever on such a search (cost 2026-07-01: 17 re-runs / ~13h on Painters).
  # See feedback_next_search_must_track_attempts.md.
  mkdir -p "$SCRAPER_DIR/output"
  echo "$Q" >> "$SCRAPER_DIR/output/attempted-searches.log"
  WORKER_COUNT="$WORKER_COUNT" ./scripts/overnight-pipeline.sh "$Q" 2>&1 | tee -a "$LOG"
done
echo "=== overnight-local DONE $(date) — ran $n search(es) ===" | tee -a "$LOG"

# ============================================================
# RECOVERY PASS — GUARANTEE every emailed lead has a video (2026-07-11, Chris: "ALL emails we get MUST
# have a video"). The fast parallel loop above is pass 1. Now find any emailable lead that STILL has no
# Video URL and re-render it on a SLOWER pass: WORKER_COUNT=1 (no screen-lock contention between workers)
# + a longer per-lead timeout. Idempotency-skip means ONLY the missing leads render. Bounded by
# MAX_RECOVERY_SEARCHES, the wall-clock DEADLINE, and the night window. Leads that fail MAX_VIDEO_ATTEMPTS
# times are surfaced (Skip Reasons=video-unrenderable-Nx), never silently dropped or looped forever.
# See feedback_every_email_gets_a_video.md + feedback_landing_build_must_be_scoped.md.
# ============================================================
echo ">>> reconcile-missing-videos: finding emailable leads with no video" | tee -a "$LOG"
node scripts/reconcile-missing-videos.mjs 2>&1 | tee -a "$LOG"
MV_SEARCHES="$SCRAPER_DIR/output/missing-video-searches.txt"
MAX_RECOVERY_SEARCHES="${MAX_RECOVERY_SEARCHES:-3}"
if [ -s "$MV_SEARCHES" ]; then
  rc=0
  while IFS= read -r Q; do
    [ -z "$Q" ] && continue
    rc=$((rc+1))
    if [ "$rc" -gt "$MAX_RECOVERY_SEARCHES" ]; then echo ">>> recovery cap ($MAX_RECOVERY_SEARCHES) reached — remaining missing-video searches retried tomorrow." | tee -a "$LOG"; break; fi
    if [ "$(date +%s)" -ge "$DEADLINE" ]; then echo ">>> wall-clock cap reached — deferring remaining recovery to tomorrow." | tee -a "$LOG"; break; fi
    NH=$(( 10#$(date +%H) )); if [ "$NH" -ge 7 ] && [ "$NH" -lt 21 ]; then echo ">>> night window ended — deferring remaining recovery to tomorrow." | tee -a "$LOG"; break; fi
    echo "" | tee -a "$LOG"
    echo ">>> [recovery $rc] $(date +%H:%M) — slow single-worker re-render: \"$Q\"" | tee -a "$LOG"
    WORKER_COUNT=1 PER_LEAD_TIMEOUT_MIN="${RECOVERY_PER_LEAD_TIMEOUT_MIN:-15}" ./scripts/overnight-pipeline.sh "$Q" 2>&1 | tee -a "$LOG"
  done < "$MV_SEARCHES"
else
  echo ">>> no missing-video gap — every emailable lead has a video. ✓" | tee -a "$LOG"
fi

# ============================================================
# AUTO-AUDIT — verify NO failed videos, notify Chris if any (Chris 2026-07-11: "an auto audit to verify there
# are no failed videos and if there are ever to notify me and we fix the issue"). Runs AFTER the recovery pass
# so it audits the FINAL state. Alerts (macOS + persistent file) only on leads the system CAN'T self-heal
# (retries exhausted / no search term) — transient gaps that the next recovery pass will drain don't alarm.
# See feedback_failed_video_audit.md + feedback_every_email_gets_a_video.md.
# ============================================================
echo ">>> auto-audit: verifying no failed videos" | tee -a "$LOG"
node scripts/audit-failed-videos.mjs 2>&1 | tee -a "$LOG" || true

# File the night's deployed-video list into the dated reports/overnight-videos/YYYY/MM-Month/ tree.
# Pass the run's START date (DATE_STAMP) — a run that finishes after midnight must still file under
# the night it started (the log is named by start date).
echo ">>> filing overnight videos to dated report" | tee -a "$LOG"
DATE="$DATE_STAMP" node scripts/file-overnight-videos.mjs 2>&1 | tee -a "$LOG"

# OpenAI quota alert (HARD RULE): notify Chris if voiceover generation hit an OpenAI balance error.
bash scripts/notify-openai-quota.sh "/tmp/overnight-pipeline-$(date +%Y-%m-%d).log" 2>&1 | tee -a "$LOG"
