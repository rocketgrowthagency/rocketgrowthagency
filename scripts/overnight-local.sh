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
MAX_SEARCHES="${MAX_SEARCHES:-99}"
WORKER_COUNT="${WORKER_COUNT:-2}"

# Keep the machine awake for the whole night (10h). Pipeline also self-caffeinates per search.
caffeinate -dimsu -t 36000 &
CAFF_PID=$!
trap 'kill $CAFF_PID 2>/dev/null' EXIT

echo "=== overnight-local START $(date) — city-first, max ${MAX_SEARCHES} searches, WC=${WORKER_COUNT} ===" | tee -a "$LOG"

# Manually-flagged bad videos: ARM them (remove + block send + re-queue their search) and FINALIZE
# any that were re-rendered on a prior night. Chris ticks {Redo Video} in Airtable; this self-heals.
echo ">>> redo-flagged-videos: processing {Redo Video} flags" | tee -a "$LOG"
node scripts/redo-flagged-videos.mjs 2>&1 | tee -a "$LOG"

n=0
while [ "$n" -lt "$MAX_SEARCHES" ]; do
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
