#!/bin/bash
# stop-all-capture.sh — kill EVERY capture-related process, in the right order. (2026-08-19)
#
# WHY THIS EXISTS: on 2026-08-19 I killed `away-chain` and reported "0 running" — but
# `recovery-rounds.sh` was a CHILD that kept looping independently and launched a fresh batch minutes
# later. Chris saw Chrome windows still popping up while I was telling him nothing was running.
# Killing a wrapper does NOT kill the loop it spawned. Enumerate every layer, then VERIFY.
#
# Order matters: stop the LOOPS first, or they relaunch a batch while you are killing the batch.
#
# 🚫 NEVER `pkill -f 'Google Chrome'` — that kills Chris's own browser. Capture Chromes are identifiable
# by their --user-data-dir (chrome-profile-step3 / chrome-profile-step25); nothing else may be touched.
set -uo pipefail
echo "=== stopping capture work $(date '+%H:%M:%S') ==="

# 1) loops / orchestrators first so nothing relaunches
for p in away-chain chain-recovery recovery-rounds scan-mp4s build-landings; do
  pkill -9 -f "$p" 2>/dev/null && echo "  killed loop: $p"
done
sleep 1
# 2) the per-lead runner
pkill -9 -f 'rebuild-broken-videos' 2>/dev/null && echo "  killed runner"
# 3) the pipeline steps
for p in step-3-video-recorder step-2.5-audit step-6-voiceover build-video-landing; do
  pkill -9 -f "$p" 2>/dev/null && echo "  killed step: $p"
done
# 4) capture browsers ONLY (scoped by profile dir) + encoders + the sleep-blocker
pkill -9 -f 'chrome-profile-step' 2>/dev/null && echo "  killed capture Chrome"
pkill -9 -f ffmpeg 2>/dev/null
pkill -f 'caffeinate -dimsu' 2>/dev/null
sleep 2

# 5) VERIFY — the step I skipped last time. Report anything still alive.
echo "=== verification ==="
LEFT=0
for p in away-chain chain-recovery recovery-rounds rebuild-broken-videos step-3-video-recorder \
         step-2.5-audit build-video-landing chrome-profile-step ffmpeg; do
  n=$(pgrep -fc "$p" 2>/dev/null || echo 0); n=${n:-0}
  [ "$n" -gt 0 ] && { echo "  🔴 STILL RUNNING: $p ($n)"; LEFT=$((LEFT+n)); }
done
[ "$LEFT" -eq 0 ] && echo "  ✓ nothing capture-related is running"
echo "  (your own Chrome is untouched: $(ps aux | grep -c '[G]oogle Chrome') procs, $(ps aux | grep '[G]oogle Chrome' | grep -c 'chrome-profile-step') from capture profiles)"

# 6) clean the transient artifacts that can hijack the next run
cd "/Users/chris/RGA/Rocket Growth Agency Scraper VS Code"
N=$(find "output/Step 2" -maxdepth 1 -name "$(date +%Y-%m-%d)*" 2>/dev/null | wc -l | tr -d ' ')
find "output/Step 2" -maxdepth 1 -name "$(date +%Y-%m-%d)*" -delete 2>/dev/null
echo "  removed $N today-dated temp CSV(s) (they can hijack the night run's input)"
exit 0
