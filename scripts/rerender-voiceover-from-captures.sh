#!/bin/bash
# rerender-voiceover-from-captures.sh (2026-07-27)
# Complete videos that CAPTURED fine (step-3) but failed at voiceover (OpenAI quota 429).
# Reuses the existing step-3 WebMs — runs step-6 (voiceover) → step-4/5/6b/7 → build-landing.
# NO step-3 = NO screen capture = safe to run in DAYTIME. Deploy is batched at the end.
#
# Usage:
#   scripts/rerender-voiceover-from-captures.sh <slug-substr>   # ONE lead (test)
#   scripts/rerender-voiceover-from-captures.sh all             # every unrendered 07-27 DUI lead
set -u
cd "/Users/chris/RGA/Rocket Growth Agency Scraper VS Code"
WEBSITE_DIR="/Users/chris/RGA/Rocket Growth Agency Website VS Code"
DATE_STAMP="${DATE_STAMP:-2026-07-27}"
SEARCH_SLUG="${SEARCH_SLUG:-dui-lawyers-in-culver-city-ca}"
ONLY="${1:-all}"
DEPLOYED=(); count=0; skipped=0; failed=0

for CSV in "output/Step 2/${DATE_STAMP}_"*"-only-${SEARCH_SLUG}-[step-2].csv"; do
  [ -f "$CSV" ] || continue
  BASE=$(basename "$CSV" .csv)
  BIZ_SLUG=$(echo "$BASE" | sed "s/^${DATE_STAMP}_//; s/-only-.*//")
  [ "$ONLY" != "all" ] && [[ "$BIZ_SLUG" != *"$ONLY"* ]] && continue
  # already rendered? (step-7 MP4 exists) → leave it
  if ls "output/Step 7 (Final Merge MP4)/${DATE_STAMP}_${BIZ_SLUG}-only-"*"-[step-2]"/*.mp4 >/dev/null 2>&1; then
    echo "SKIP already-rendered: $BIZ_SLUG"; skipped=$((skipped+1)); continue
  fi
  # capture must exist to reuse
  if ! ls "output/Step 3 (Video Recorder - Raw WebM)/${DATE_STAMP}_${BIZ_SLUG}-only-"*"-[step-2]"/*.webm >/dev/null 2>&1; then
    echo "SKIP no-capture: $BIZ_SLUG"; skipped=$((skipped+1)); continue
  fi
  echo "=== RENDER $BIZ_SLUG ==="
  STEP2_CSV="$CSV" node step-6-voiceover.mjs > /tmp/rr-s6.log 2>&1; rc=$?
  if [ "$rc" = "3" ]; then echo "  skip: below 6/6 gate"; skipped=$((skipped+1)); continue; fi
  if [ "$rc" != "0" ]; then echo "  ✗ step-6 rc=$rc: $(grep -iE '429|quota|error' /tmp/rr-s6.log | head -1)"; failed=$((failed+1)); continue; fi
  STEP2_CSV="$CSV" MAX_COMBINES=1 node step-4-combine-desktop-mobile.mjs >/dev/null 2>&1
  STEP2_CSV="$CSV" MAX_BRANDS=1 node step-5-branding.mjs >/dev/null 2>&1
  STEP2_CSV="$CSV" MAX_RECORDINGS=1 node step-6b-subtitles.mjs >/dev/null 2>&1
  STEP2_CSV="$CSV" MAX_MERGES=1 node step-7-merge-branded-audio.mjs >/dev/null 2>&1
  MP4=$(ls -t "output/Step 7 (Final Merge MP4)/${DATE_STAMP}_${BIZ_SLUG}-only-"*"-[step-2]"/*.mp4 2>/dev/null | head -1)
  if [ -z "$MP4" ]; then echo "  ✗ no MP4 produced"; failed=$((failed+1)); continue; fi
  SLUG=$(basename "$MP4" .mp4 | sed 's/^[0-9]*_//')
  REQUIRE_SLUG=1 BUILD_ONLY_SLUG="$SLUG" node build-video-landing.mjs > /tmp/rr-land.log 2>&1
  if [ -d "output/landing-pages/v/$SLUG" ]; then
    rsync -a --delete "output/landing-pages/v/$SLUG/" "$WEBSITE_DIR/v/$SLUG/"
    echo "  ✓ DONE /v/$SLUG"
    DEPLOYED+=("$SLUG"); count=$((count+1))
  else
    echo "  ✗ landing NOT built for $SLUG: $(grep -iE 'visual-gate|FAIL|QUARANTINE|reason' /tmp/rr-land.log | head -1)"; failed=$((failed+1))
  fi
done
echo ""
echo "=== SUMMARY: rendered=$count skipped=$skipped failed=$failed ==="
[ "$count" -gt 0 ] && { echo "New /v/ slugs:"; printf '  %s\n' "${DEPLOYED[@]}"; }
