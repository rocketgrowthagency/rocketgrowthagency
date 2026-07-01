#!/bin/bash
# Downstream re-render reusing existing voiceover (NO step-6): step-4 -> step-5 -> step-6b -> step-7
# -> build landing -> rsync -> deploy. Used by the Maps-only redo.
set -e
SCRAPER="/Users/chris/RGA/Rocket Growth Agency Scraper VS Code"
WEBSITE_DIR="/Users/chris/RGA/Rocket Growth Agency Website VS Code"
cd "$SCRAPER"
CSV="output/Step 2/${BASE}.csv"
echo ">>> step-4 combine";    STEP2_CSV="$CSV" node step-4-combine-desktop-mobile.mjs
echo ">>> step-5 branding";   STEP2_CSV="$CSV" node step-5-branding.mjs
echo ">>> step-6b subtitles"; STEP2_CSV="$CSV" node step-6b-subtitles.mjs
echo ">>> step-7 merge";      STEP2_CSV="$CSV" node step-7-merge-branded-audio.mjs
MP4=$(find "output/Step 7 (Final Merge MP4)/${BASE}" -maxdepth 1 -name '01_*.mp4' 2>/dev/null | head -1)
[ -n "$MP4" ] || { echo "✗ no step-7 mp4"; exit 1; }
BUILD_SLUG=$(basename "$MP4" .mp4 | sed 's/^[0-9]*_//')
echo "  build-slug=$BUILD_SLUG"
echo ">>> build landing"; BUILD_ONLY_SLUG="$BUILD_SLUG" node build-video-landing.mjs
[ -d "output/landing-pages/v/$BUILD_SLUG" ] || { echo "✗ no landing dir"; exit 1; }
rsync -a --delete "output/landing-pages/v/$BUILD_SLUG/" "$WEBSITE_DIR/v/$BUILD_SLUG/"
export NETLIFY_AUTH_TOKEN="$(grep -E '^NETLIFY_AUTH_TOKEN=' "$SCRAPER/.env" | head -1 | cut -d= -f2-)"
export NETLIFY_SITE_ID="38f275c7-a4a8-4531-9989-1fc1ccb78f9e"
cd "$WEBSITE_DIR"
netlify deploy --prod --dir=. 2>&1 | grep -iE "Production URL|Unique deploy" || true
echo ">>> DONE — $BUILD_SLUG"
