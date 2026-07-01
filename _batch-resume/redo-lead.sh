#!/bin/bash
# Downstream-only re-render for one lead (reuses existing step-3 webms):
# step-6 voiceover -> step-4 combine -> step-5 branding -> step-6b subtitles -> step-7 merge
# -> build landing -> rsync to website repo -> netlify deploy.
set -e
SCRAPER="/Users/chris/RGA/Rocket Growth Agency Scraper VS Code"
WEBSITE_DIR="/Users/chris/RGA/Rocket Growth Agency Website VS Code"
cd "$SCRAPER"
CSV="output/Step 2/${BASE}.csv"
echo ">>> step-6 voiceover";   STEP2_CSV="$CSV" node step-6-voiceover.mjs
echo ">>> step-4 combine";     STEP2_CSV="$CSV" node step-4-combine-desktop-mobile.mjs
echo ">>> step-5 branding";    STEP2_CSV="$CSV" node step-5-branding.mjs
echo ">>> step-6b subtitles";  STEP2_CSV="$CSV" node step-6b-subtitles.mjs
echo ">>> step-7 merge";       STEP2_CSV="$CSV" node step-7-merge-branded-audio.mjs
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
netlify deploy --prod --dir=. 2>&1 | grep -iE "Production URL|Website URL|Deploy is live|Unique deploy" || true
echo ">>> DONE — $BUILD_SLUG"
