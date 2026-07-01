#!/bin/bash
# Resume the held rank>20 top-aligned re-render from where it stopped.
# Renders only the leads still in remaining.txt; appends outcomes to batch-results.txt.
cd "/Users/chris/RGA/Rocket Growth Agency Scraper VS Code" || exit 1
RESULTS=_batch-resume/batch-results.txt
REMAIN=_batch-resume/remaining.txt
TOTAL=$(wc -l < "$REMAIN" | tr -d ' '); i=0
while IFS= read -r BASE; do
  [ -z "$BASE" ] && continue
  i=$((i+1)); echo "===== RESUME [$i/$TOTAL] $BASE ====="
  LOG="/tmp/resume-log-$i.log"
  bash /tmp/render-lead.sh "$BASE" > "$LOG" 2>&1
  if grep -q "froze 1 early frame\|detail-hold froze" "$LOG" && grep -q "RENDER COMPLETE" "$LOG"; then OUT="CARD"
  elif grep -q "RENDER COMPLETE" "$LOG" && ! grep -q "Result: detail" "$LOG"; then OUT="NO-DETAIL"
  elif grep -q "RENDER COMPLETE" "$LOG"; then OUT="DONE"; else OUT="ERROR"; fi
  echo "$OUT	$BASE" >> "$RESULTS"
  echo "  -> $OUT"
done < "$REMAIN"
echo "===== RESUME COMPLETE ====="
