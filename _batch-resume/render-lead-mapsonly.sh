#!/bin/bash
cd "/Users/chris/RGA/Rocket Growth Agency Scraper VS Code"
BASE="$1"
CSV="output/Step 2/${BASE}.csv"
echo ">>> deleting ONLY maps webm (keep website+mobile): $BASE"
rm -f "output/Step 3 (Video Recorder - Raw WebM)/${BASE}/"*_desktop_maps.webm
echo ">>> step-3 maps-only (reuse existing website+mobile)"
STEP2_CSV="${CSV}" REUSE_EXISTING_SEGMENTS=1 node step-3-video-recorder.mjs
echo ">>> downstream (reuse voiceover, no step-6)"
BASE="${BASE}" bash _batch-resume/redo-lead-mapsonly.sh
echo ">>> RENDER COMPLETE: $BASE"
