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

# PRODUCTION PAUSE GATE (2026-07-03). The production governor (or Chris) pauses nightly video
# production when the send side is caught up (sendable buffer >> daily send rate) or deliverability
# is unsafe. If paused, exit immediately WITHOUT caffeinating or scraping. The governor removes
# output/PRODUCTION-PAUSED to resume when buffer drains + bounce is GREEN. See feedback_production_governor.
if [ -f "$SCRAPER_DIR/output/PRODUCTION-PAUSED" ]; then
  # AUTO-RESUME (2026-07-09): the flag promised the governor would clear it when "buffer drains + bounce is
  # GREEN", but nothing ever evaluated that → production silently stalled to 0 sendable leads. Now we
  # re-check those exact conditions here. Domain protection = rule #1, so this FAILS SAFE: only a clean
  # RESUME (exit 0) clears the flag; any doubt (exit 1/2) stays paused.
  node "$SCRAPER_DIR/scripts/check-resume-production.mjs" 2>&1 | tee -a "$LOG"
  RESUME_RC=${PIPESTATUS[0]}
  if [ "$RESUME_RC" -eq 0 ]; then
    echo "=== production governor AUTO-RESUME $(date) — conditions met; clearing PRODUCTION-PAUSED + proceeding. ===" | tee -a "$LOG"
    rm -f "$SCRAPER_DIR/output/PRODUCTION-PAUSED"
  else
    echo "=== overnight-local PAUSED $(date) — resume conditions NOT met (rc=$RESUME_RC). Not running. ===" | tee -a "$LOG"
    cat "$SCRAPER_DIR/output/PRODUCTION-PAUSED" 2>/dev/null | tee -a "$LOG"
    exit 0
  fi
fi

# HARD CAP (locked 2026-07-03 — Chris: "this is too long we need a cap"). The loop used to run up
# to 99 searches over ~10h, which dragged on all night. Now bounded THREE ways, all env-tunable:
#   MAX_SEARCHES  — max cities/searches this run (default 3 — each ~2h, so ~6h total)
#   MAX_RUN_HOURS — wall-clock cap; no NEW search starts past this (default 6h — matches 3 searches)
#   output/STOP-OVERNIGHT — touch this file to gracefully stop after the current search finishes
MAX_SEARCHES="${MAX_SEARCHES:-3}"
MAX_RUN_HOURS="${MAX_RUN_HOURS:-6}"
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

# File the night's deployed-video list into the dated reports/overnight-videos/YYYY/MM-Month/ tree.
# Pass the run's START date (DATE_STAMP) — a run that finishes after midnight must still file under
# the night it started (the log is named by start date).
echo ">>> filing overnight videos to dated report" | tee -a "$LOG"
DATE="$DATE_STAMP" node scripts/file-overnight-videos.mjs 2>&1 | tee -a "$LOG"

# OpenAI quota alert (HARD RULE): notify Chris if voiceover generation hit an OpenAI balance error.
bash scripts/notify-openai-quota.sh "/tmp/overnight-pipeline-$(date +%Y-%m-%d).log" 2>&1 | tee -a "$LOG"
