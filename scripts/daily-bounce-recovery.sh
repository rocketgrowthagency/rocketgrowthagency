#!/bin/bash
# scripts/daily-bounce-recovery.sh
#
# Daily bounce-recovery driver. Runs scripts/recover-bounced-emails.mjs
# (which reads Airtable Leads where Email Status='queued-recovery', then
# re-scrapes the website + SerpAPI for a replacement email) without
# requiring an overnight-pipeline.sh run.
#
# WHY THIS EXISTS (locked 2026-05-27)
# The bounce-recovery flow is otherwise only triggered from inside the
# overnight pipeline. If you don't run a nightly scrape that day, any
# leads sitting in 'queued-recovery' wait indefinitely until you do.
# This standalone script lets the recovery loop fire daily on its own
# regardless of whether a scrape happens.
#
# CRON SETUP (one time, ~2 min)
# Add to crontab — runs M-F at 7:30am PT, AFTER the 7am Apps Script cron
# has flipped fresh bounces → queued-recovery state:
#
#   30 7 * * 1-5 /Users/chris/RGA/Rocket\ Growth\ Agency\ Scraper\ VS\ Code/scripts/daily-bounce-recovery.sh >> /tmp/daily-bounce-recovery.log 2>&1
#
# OR via launchd (~/Library/LaunchAgents/com.rga.bounce-recovery.plist) —
# more reliable than crontab on macOS since launchd handles missed runs
# (laptop closed at 7:30am → fires when it wakes).
#
# USAGE
#   ./scripts/daily-bounce-recovery.sh           # normal run
#   DRY_RUN=1 ./scripts/daily-bounce-recovery.sh # dry-run (no Airtable writes)

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
cd "$REPO_ROOT"

DATE_STAMP=$(date +%Y-%m-%d)
TIME_STAMP=$(date +%H:%M:%S)

echo ""
echo "============================================"
echo "Daily bounce recovery — $DATE_STAMP $TIME_STAMP PT"
echo "============================================"

# Caffeinate so the laptop doesn't sleep mid-scrape (typically <2 min run).
nohup caffeinate -dimsu -t 600 >/dev/null 2>&1 &
CAF_PID=$!
trap "kill $CAF_PID 2>/dev/null || true" EXIT

# Run the recovery scraper.
if [ "${DRY_RUN:-}" = "1" ]; then
  echo ">>> DRY_RUN=1 — script would run but no Airtable writes"
  DRY_RUN=1 node scripts/recover-bounced-emails.mjs
else
  node scripts/recover-bounced-emails.mjs
fi

echo ""
echo "Daily bounce recovery complete — $(date +%H:%M:%S) PT"
