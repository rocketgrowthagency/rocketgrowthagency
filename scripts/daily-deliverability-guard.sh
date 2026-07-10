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

# 0) REGRESSION GUARD (locked 2026-07-07): verify the whole email-verification system is intact —
#    free layers, disposable list, layered pipeline, AND the send path still filters NOT({Suppressed}).
#    If anything regressed, ABORT before the sweep so we never send against a broken verifier.
echo ">>> verification-system self-check" | tee -a "$LOG"
node scripts/check-verification-system.mjs 2>&1 | tee -a "$LOG" | tail -3
if [ "${PIPESTATUS[0]}" -ne 0 ]; then
  echo "!!! VERIFICATION SYSTEM REGRESSION — deliverability guard ABORTED (no sweep, no sends touched)." | tee -a "$LOG"
  exit 1
fi

# 1) Pre-send mailbox sweep — DROP undeliverable (no-mx + invalid, permanent) before they can send.
#    Set VERIFY_POLICY=strict to ALSO quarantine catch-all + unknown (held for a later 2nd-domain
#    strategy). Preview impact first on a port-25-open network: VERIFY_POLICY=strict DRY_RUN=1 node …
echo ">>> mailbox sweep (drop undeliverable${VERIFY_POLICY:+, policy=$VERIFY_POLICY})" | tee -a "$LOG"
VERIFY_POLICY="${VERIFY_POLICY:-}" node scripts/verify-sendable-mailboxes.mjs 2>&1 | tee -a "$LOG" | grep -E "DROP|HOLD|Results:|Dropped|Quarantined|policy=" | tail -8

# 1.5) Quarantine report — the durable NOTE of every held/undeliverable email (2nd-domain candidates).
echo ">>> quarantine report (held-emails note)" | tee -a "$LOG"
node scripts/quarantine-report.mjs 2>&1 | tee -a "$LOG" | tail -3

# 1.7) Self-improving send-verification audit: leak check (re-verify recently-sent → auto-suppress any
#      that now fail), bounce gap-learning (auto-denylist domains that bounced ≥2×, flag single bounces),
#      and the free-vs-Bouncer scorecard trend. All FREE (no Bouncer credits). See project_send_audit_system.
echo ">>> send-verification audit (leak check + bounce gap-learning)" | tee -a "$LOG"
node scripts/daily-send-audit.mjs 2>&1 | tee -a "$LOG" | grep -E "Leak check|LEAK|gap|AUTO-LEARNED|FLAGGED|scorecard" | tail -12

# 2) Deliverability health snapshot (auto-detect AMBER/RED) + append the daily row to the
#    "Deliverability Log" Airtable table (long-term bounce-rate trend record).
echo ">>> health snapshot + Airtable log" | tee -a "$LOG"
LOG_TO_AIRTABLE=1 node scripts/deliverability-snapshot.mjs 2>&1 | tee -a "$LOG"
HEALTH=${PIPESTATUS[0]}

# 2.5) Redo-flagged videos: ARM any {Redo Video} lead PROMPTLY (remove + block the bad video)
#      even on non-overnight days; FINALIZE re-rendered ones. Don't wait for the next overnight.
echo ">>> redo-flagged-videos (arm/finalize)" | tee -a "$LOG"
node scripts/redo-flagged-videos.mjs 2>&1 | tee -a "$LOG" | tail -5

# 3) Lead scoring + categorization — refresh Lead Score + Lead Category on every lead from the
#    latest engagement data. Keeps the CRM live.
echo ">>> lead scoring + categorization" | tee -a "$LOG"
node scripts/score-and-categorize-leads.mjs 2>&1 | tee -a "$LOG" | tail -10

# 3.5) OUTREACH-HEALTH BRAIN (added 2026-07-10): watch RUNWAY (sendable buffer ÷ daily send rate),
#      send-stall, and overproduction. On a real problem it writes a STANDING alert
#      (reports/alerts/OUTREACH-HEALTH-ALERT.md + ~/rga-ALERT-outreach.log) + a macOS notification, so
#      Chris is told the moment the pool is starving / sends stalled — never again finds out by noticing.
#      Claude surfaces the alert at session boot. Self-clears when healthy. Built because on 2026-07-10
#      the pool drained to 0 and nobody was told. See project_production_governor_and_deliverability.
echo ">>> outreach-health brain (runway / send-stall / overproduction alarm)" | tee -a "$LOG"
node scripts/outreach-health-monitor.mjs 2>&1 | tee -a "$LOG"

# 4) Daily action report (M-F) — dated 'what to do today' briefing into the year/month/day tree.
echo ">>> daily action report" | tee -a "$LOG"
node scripts/daily-action-report.mjs 2>&1 | tee -a "$LOG"

if [ "$HEALTH" = "3" ]; then
  echo "!!! DELIVERABILITY RED — the Apps Script auto-pause should have fired. Investigate the bounce source before resuming." | tee -a "$LOG"
elif [ "$HEALTH" = "2" ]; then
  echo ">>> DELIVERABILITY AMBER — swept dead mailboxes; monitor. If it climbs, the Apps Script auto-pauses at RED." | tee -a "$LOG"
fi
# 5) Off-machine backup is handled by TIME MACHINE (the X10 Pro is a TM destination that includes
#    all RGA folders + memory, with version history). No custom backup step needed — TM runs
#    automatically when the drive is connected. Just confirm TM auto-backup stays enabled.
echo ">>> backup: handled by Time Machine → X10 Pro (auto=$(defaults read /Library/Preferences/com.apple.TimeMachine.plist AutoBackup 2>/dev/null || echo '?'))" | tee -a "$LOG"

# OpenAI quota alert re-surface (HARD RULE): if a standing alert exists, re-notify until funds added.
if [ -f "$HOME/rga-ALERT-openai.log" ] && [ -f "/Users/chris/RGA/Rocket Growth Agency Website VS Code/reports/alerts/OPENAI-QUOTA-ALERT.md" ]; then
  echo ">>> ⚠ STANDING OpenAI quota alert — add funds (see reports/alerts/OPENAI-QUOTA-ALERT.md)" | tee -a "$LOG"
  osascript -e 'display notification "OpenAI still needs funds — content/videos blocked" with title "🚨 RGA: OpenAI needs funds"' 2>/dev/null
fi

echo "=== deliverability guard DONE $(date) — health=$HEALTH ===" | tee -a "$LOG"
