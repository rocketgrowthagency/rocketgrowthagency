#!/bin/bash
# notify-openai-quota.sh <logfile> — HARD RULE (Chris, 2026-07-02): Chris MUST be notified the
# moment OpenAI runs out of quota/balance, because it silently kills the content engine + video
# voiceovers. Scans a run log for the OpenAI quota/billing error and, if found, fires:
#   1. a real-time macOS notification (with sound) — seen immediately when at the Mac
#   2. a persistent alert file ($HOME/rga-ALERT-openai.log + reports/alerts/) — surfaced at the
#      next session boot / in the daily report if he was away
# Called by drip-content.sh (content engine), overnight-pipeline.sh (voiceover), and the daily guard.
set -u
LOG="${1:-}"
[ -n "$LOG" ] && [ -f "$LOG" ] || exit 0
if grep -qiE "exceeded your current quota|insufficient_quota|no credits remaining|429 .*no credits|add credits to continue|check your plan and billing|billing details|invalid_api_key|401 .*(quota|billing)" "$LOG"; then
  MSG="OpenAI balance/quota exceeded — a run FAILED (no content/videos generated). Add funds: platform.openai.com/settings/organization/billing"
  STAMP=$(date '+%Y-%m-%d %H:%M')
  echo "🚨🚨 ALERT: $MSG" | tee -a "$LOG"
  echo "$STAMP — $MSG (log: $LOG)" >> "$HOME/rga-ALERT-openai.log"
  # persistent, human-visible alert file (cleared once funds are added)
  WEB="/Users/chris/RGA/Rocket Growth Agency Website VS Code"
  mkdir -p "$WEB/reports/alerts" 2>/dev/null
  printf '# 🚨 OpenAI QUOTA/BALANCE ALERT — %s\n\n%s\n\nThe content engine and/or video voiceovers cannot run until funds are added.\nAdd funds → https://platform.openai.com/settings/organization/billing\n\n(Delete this file once resolved.)\n' "$STAMP" "$MSG" > "$WEB/reports/alerts/OPENAI-QUOTA-ALERT.md"
  # real-time macOS notification with sound
  osascript -e "display notification \"$MSG\" with title \"🚨 RGA: OpenAI needs funds\" sound name \"Sosumi\"" 2>/dev/null
  exit 2
fi
exit 0
