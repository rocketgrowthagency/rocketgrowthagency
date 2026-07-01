#!/bin/bash
# Re-render the remaining 70-batch leads with the LOCKED video code (2026-06-26 fixes).
cd "/Users/chris/RGA/Rocket Growth Agency Scraper VS Code"
LIST=/tmp/redo70.txt
RES=/tmp/redo70-results.txt
: > "$RES"
TOTAL=$(wc -l < "$LIST" | tr -d ' ')
i=0
while IFS= read -r BASE; do
  [ -z "$BASE" ] && continue
  i=$((i+1))
  echo "===== REDO70 [$i/$TOTAL] $BASE ====="
  LOG="/tmp/redo70-$i.log"
  bash _batch-resume/render-lead.sh "$BASE" > "$LOG" 2>&1
  # outcome
  if grep -q "DONE —" "$LOG"; then OUT="DONE"; slug=$(grep "DONE —" "$LOG" | sed 's/.*DONE — //' | head -1);
  elif grep -qi "is a directory/marketplace" "$LOG"; then OUT="SKIP-DIRECTORY"; slug="";
  elif grep -qi "no website or Google Maps" "$LOG"; then OUT="SKIP-NODATA"; slug="";
  else OUT="FAIL"; slug=""; fi
  echo "$OUT	$BASE	$slug" >> "$RES"
  # extract a card-hold frame for QA spot-check (if a maps webm exists)
  WM=$(find "output/Step 3 (Video Recorder - Raw WebM)/$BASE" -name '*_desktop_maps.webm' 2>/dev/null | head -1)
  [ -n "$WM" ] && ffmpeg -y -loglevel error -sseof -6 -i "$WM" -frames:v 1 "/tmp/redo70-frames/$(printf '%02d' $i)-${slug:-$OUT}.png" 2>/dev/null
  echo "  -> $OUT $slug"
done < "$LIST"
echo "===== REDO70 ALL COMPLETE ====="
echo "Summary:"; awk -F'\t' '{c[$1]++} END{for(k in c) print "  "k": "c[k]}' "$RES"
