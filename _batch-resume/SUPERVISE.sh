#!/bin/bash
# Night-run supervisor v3: render remaining held leads to completion.
# Bash-native per-lead watchdog (macOS has no `timeout`): run render in bg, kill if it exceeds cap.
cd "/Users/chris/RGA/Rocket Growth Agency Scraper VS Code" || exit 1
HELD=_batch-resume/held-final.txt
RES=_batch-resume/batch-results.txt
REMAIN=_batch-resume/remaining.txt
PER_LEAD_SECS=540   # 9 min hard cap per lead
log(){ echo "[$(date '+%H:%M:%S')] $*" >> /tmp/supervise.log; }
log "supervisor v3 start"
while :; do
  comm -23 <(sort "$HELD") <(awk -F'\t' '{print $2}' "$RES" | sort -u) > "$REMAIN"
  BASE=$(head -1 "$REMAIN")
  [ -z "$BASE" ] && { log "ALL DONE"; echo "SUPERVISOR: ALL DONE" >> /tmp/resume-master.log; break; }
  n=$(grep -c . "$REMAIN")
  log "rendering ($n left): $BASE"
  echo "===== $BASE =====" >> /tmp/resume-master.log
  LOG="/tmp/lead-$(date +%s).log"
  bash /tmp/render-lead.sh "$BASE" > "$LOG" 2>&1 &
  RPID=$!
  waited=0; TIMED_OUT=0
  while kill -0 "$RPID" 2>/dev/null; do
    sleep 15; waited=$((waited+15))
    if [ "$waited" -ge "$PER_LEAD_SECS" ]; then
      log "TIMEOUT ${PER_LEAD_SECS}s -> killing $BASE"
      pkill -P "$RPID" 2>/dev/null; kill "$RPID" 2>/dev/null
      pkill -f "node step-3-video-recorder" 2>/dev/null
      TIMED_OUT=1; sleep 3; break
    fi
  done
  wait "$RPID" 2>/dev/null
  pkill -f "node step-3-video-recorder" 2>/dev/null; sleep 1
  if [ "$TIMED_OUT" -eq 1 ]; then
    echo "STALL-SKIP	$BASE" >> "$RES"; log "STALL-SKIP $BASE"
  elif grep -q "froze 1 early frame\|detail-hold froze" "$LOG" && grep -q "RENDER COMPLETE" "$LOG"; then
    echo "CARD	$BASE" >> "$RES"; log "CARD $BASE"
  elif grep -q "RENDER COMPLETE" "$LOG" && ! grep -q "Result: detail" "$LOG"; then
    echo "NO-DETAIL	$BASE" >> "$RES"; log "NO-DETAIL $BASE"
  elif grep -q "RENDER COMPLETE" "$LOG"; then
    echo "DONE	$BASE" >> "$RES"; log "DONE $BASE"
  else
    echo "ERROR	$BASE" >> "$RES"; log "ERROR $BASE"
  fi
done
log "supervisor v3 done"
