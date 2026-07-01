#!/bin/bash
cd "/Users/chris/RGA/Rocket Growth Agency Scraper VS Code"
BASE="$1"
CSV="output/Step 2/${BASE}.csv"
echo ">>> deleting old webms for fresh step-3: $BASE"
rm -f "output/Step 3 (Video Recorder - Raw WebM)/${BASE}/"*.webm
echo ">>> step-3 (fresh)"
STEP2_CSV="${CSV}" node step-3-video-recorder.mjs
echo ">>> downstream"
BASE="${BASE}" bash /tmp/redo-lead.sh
echo ">>> RENDER COMPLETE: $BASE"
