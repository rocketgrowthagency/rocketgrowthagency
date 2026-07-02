#!/bin/bash
# daily-deliverability-guard.sh — automated pre-send domain protection (locked 2026-07-02).
#
# Runs ~6am PT DAILY, BEFORE the 7am Apps Script outreach send, so only mailbox-verified-clean
# addresses can send. Prevents dead/bad emails from bouncing and dragging sender reputation toward
# the RED auto-pause line. Two steps:
#   1. verify-sendable-mailboxes.mjs — SMTP-verifies every currently-sendable lead + auto-suppresses
#      definitively-dead (550) mailboxes (fail-open: catch-all/unknown kept).
#   2. deliverability-snapshot.mjs — logs bounce rate 7d/24h + queue size; exit 2=AMBER, 3=RED.
#
# The cloud side (Apps Script monitorReputationHealth) is the always-on backstop that AUTO-PAUSES
# on RED even if this local job doesn't run (Mac asleep). This local job is the PROACTIVE layer.
#
# Scheduled by launchd: ~/Library/LaunchAgents/com.rga.deliverability-guard.plist (daily 06:00 PT).
set -u
SCRAPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRAPER_DIR"
DATE_STAMP=$(date +%Y-%m-%d)
LOG="/tmp/deliverability-guard-${DATE_STAMP}.log"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

echo "=== deliverability guard START $(date) ===" | tee -a "$LOG"

# 1) Pre-send mailbox sweep — suppress dead mailboxes before they can send.
echo ">>> mailbox sweep (suppress dead)" | tee -a "$LOG"
node scripts/verify-sendable-mailboxes.mjs 2>&1 | tee -a "$LOG" | grep -E "SUPPRESS|Results:|suppressed" | tail -5

# 2) Deliverability health snapshot (auto-detect AMBER/RED) + append the daily row to the
#    "Deliverability Log" Airtable table (long-term bounce-rate trend record).
echo ">>> health snapshot + Airtable log" | tee -a "$LOG"
LOG_TO_AIRTABLE=1 node scripts/deliverability-snapshot.mjs 2>&1 | tee -a "$LOG"
HEALTH=${PIPESTATUS[0]}

# 3) Lead scoring + categorization — refresh Lead Score + Lead Category on every lead from the
#    latest engagement data. Keeps the CRM live.
echo ">>> lead scoring + categorization" | tee -a "$LOG"
node scripts/score-and-categorize-leads.mjs 2>&1 | tee -a "$LOG" | tail -10

# 4) Daily action report (M-F) — dated 'what to do today' briefing into the year/month/day tree.
echo ">>> daily action report" | tee -a "$LOG"
node scripts/daily-action-report.mjs 2>&1 | tee -a "$LOG"

if [ "$HEALTH" = "3" ]; then
  echo "!!! DELIVERABILITY RED — the Apps Script auto-pause should have fired. Investigate the bounce source before resuming." | tee -a "$LOG"
elif [ "$HEALTH" = "2" ]; then
  echo ">>> DELIVERABILITY AMBER — swept dead mailboxes; monitor. If it climbs, the Apps Script auto-pauses at RED." | tee -a "$LOG"
fi
echo "=== deliverability guard DONE $(date) — health=$HEALTH ===" | tee -a "$LOG"
