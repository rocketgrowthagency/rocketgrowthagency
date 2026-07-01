#!/bin/bash
# Re-render the held rank>20 deep-rank leads with the fixed step-3 capture.
# Logs per-lead outcome (card / blank-fail / error) to /tmp/batch-results.txt.
cd "/Users/chris/RGA/Rocket Growth Agency Scraper VS Code" || exit 1
RESULTS=/tmp/batch-results.txt
: > "$RESULTS"
TOTAL=$(wc -l < /tmp/held-final.txt | tr -d ' ')
i=0
while IFS= read -r BASE; do
  [ -z "$BASE" ] && continue
  i=$((i+1))
  echo "===== [$i/$TOTAL] $BASE ====="
  LOG="/tmp/batch-log-$i.log"
  bash /tmp/render-lead.sh "$BASE" > "$LOG" 2>&1
  # classify outcome from the step-3 maps result + downstream completion
  if grep -q "froze 1 early frame\|detail-hold froze" "$LOG" && grep -q "RENDER COMPLETE" "$LOG"; then
    OUT="CARD"
  elif grep -q "RENDER COMPLETE" "$LOG" && ! grep -q "Result: detail" "$LOG"; then
    OUT="NO-DETAIL"
  elif grep -qc "Result: blank" "$LOG" && ! grep -q "Result: detail" "$LOG"; then
    OUT="BLANK-FAIL"
  elif grep -q "RENDER COMPLETE" "$LOG"; then
    OUT="DONE"
  else
    OUT="ERROR"
  fi
  echo "$OUT	$BASE" >> "$RESULTS"
  echo "  -> $OUT"
done < /tmp/held-final.txt
echo "===== BATCH COMPLETE ====="
echo "Summary:"; sort "$RESULTS" | awk -F'\t' '{c[$1]++} END{for(k in c) print "  "k": "c[k]}'
