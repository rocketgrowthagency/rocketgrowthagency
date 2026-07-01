#!/bin/bash
# Smart re-render runner. Per lead: Maps-only if a real voiceover mp3+manifest exists (reuse
# website/mobile/voiceover), else FULL render (regenerate voiceover). Sequential (WC=1) here; the
# Maps-capture lock makes WC>1 safe too but parallel dispatch is a separate runner.
# Extracts a QA card frame per lead to /tmp/smart-frames/ for spot-checking (catches desktop-grabs).
cd "/Users/chris/RGA/Rocket Growth Agency Scraper VS Code"
LIST="${1:-/tmp/redo70.txt}"
RES=/tmp/smart-results.txt
mkdir -p /tmp/smart-frames
: > "$RES"
W3="output/Step 3 (Video Recorder - Raw WebM)"
W6="output/Step 6 (Voiceover MP3)"
TOTAL=$(grep -c . "$LIST")
i=0
while IFS= read -r BASE; do
  [ -z "$BASE" ] && continue
  i=$((i+1))
  MP3=$(find "$W6/$BASE" -name '*.mp3' 2>/dev/null | head -1)
  MAN=$(find "$W6/$BASE" -name 'manifest.json' 2>/dev/null | head -1)
  WEB=$(find "$W3/$BASE" -name '*_desktop_website.webm' 2>/dev/null | head -1)
  MOB=$(find "$W3/$BASE" -name '*_mobile.webm' 2>/dev/null | head -1)
  if [ -n "$MP3" ] && [ -n "$MAN" ] && [ -n "$WEB" ] && [ -n "$MOB" ]; then MODE="maps-only"; else MODE="full"; fi
  echo "===== SMART [$i/$TOTAL] ($MODE) $BASE ====="
  LOG="/tmp/smart-$i.log"
  if [ "$MODE" = "maps-only" ]; then bash _batch-resume/render-lead-mapsonly.sh "$BASE" > "$LOG" 2>&1
  else bash _batch-resume/render-lead.sh "$BASE" > "$LOG" 2>&1; fi
  slug=$(grep "DONE —" "$LOG" | sed 's/.*DONE — //' | head -1)
  if grep -q "DONE —" "$LOG"; then OUT="DONE"; elif grep -qi "is a directory/marketplace" "$LOG"; then OUT="SKIP-DIR"; else OUT="FAIL"; fi
  echo "$OUT	$MODE	$BASE	$slug" >> "$RES"
  WM=$(find "$W3/$BASE" -name '*_desktop_maps.webm' 2>/dev/null | head -1)
  [ -n "$WM" ] && ffmpeg -y -loglevel error -ss 45 -i "$WM" -frames:v 1 "/tmp/smart-frames/$(printf '%02d' $i)-${slug:-$OUT}.png" 2>/dev/null
  echo "  -> $OUT ($MODE) $slug"
done < "$LIST"
echo "===== SMART ALL COMPLETE ====="
awk -F'\t' '{c[$1" "$2]++} END{for(k in c) print "  "k": "c[k]}' "$RES"
