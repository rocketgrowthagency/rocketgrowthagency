#!/usr/bin/env bash
# Full v14 pipeline for top-3 Culver City plumber leads.
# Each lead: step-3 (fresh Maps + Website + Mobile recordings) → step-2.5
# → step-2.6 → step-6 → step-4 → step-5 → step-6b → step-7 → copy MP4.
# Continues on per-step failure; logs status at the end.

set -uo pipefail
cd "/Volumes/LaCie - APFS (Mac)/ALL NEWS SITES/Rocket Growth Agency/Rocket Growth Agency Scraper VS Code"
WEBSITE_V="/Volumes/LaCie - APFS (Mac)/ALL NEWS SITES/Rocket Growth Agency/Rocket Growth Agency Website VS Code/v"

LEADS=(
  "lincoln-industries-plumbing-single-[step-2]|lincoln-industries-plumbing|01_lincoln-industries-plumbing"
  "lords-of-plumbing-single-[step-2]|lords-of-plumbing|01_lords-of-plumbing"
  "pacific-plumbing-team-single-[step-2]|pacific-plumbing-team|01_pacific-plumbing-team"
)

declare -a RESULTS

for entry in "${LEADS[@]}"; do
  CSV_BASE="${entry%%|*}"
  rest="${entry#*|}"
  V_SLUG="${rest%%|*}"
  MP4_BASE="${rest#*|}"
  CSV="output/Step 2/${CSV_BASE}.csv"

  echo "==================================================================="
  echo "▶ ${V_SLUG}"
  echo "==================================================================="

  if [ ! -f "$CSV" ]; then echo "  ✗ csv missing"; RESULTS+=("✗ ${V_SLUG}: csv"); continue; fi

  for step in 3 2.5 2.6 6 4 5 6b 7; do
    case $step in
      3)   cmd="node step-3-video-recorder.mjs" ;;
      2.5) cmd="node step-2.5-audit.mjs" ;;
      2.6) cmd="node step-2.6-freshness-check.mjs" ;;
      6)   cmd="node step-6-voiceover.mjs" ;;
      4)   cmd="node step-4-combine-desktop-mobile.mjs" ;;
      5)   cmd="node step-5-branding.mjs" ;;
      6b)  cmd="node step-6b-subtitles.mjs" ;;
      7)   cmd="node step-7-merge-branded-audio.mjs" ;;
    esac
    if STEP2_CSV="$CSV" $cmd > /tmp/plumber.log 2>&1; then
      echo "  ✓ step-${step}"
    else
      echo "  ✗ step-${step} failed (tail):"
      tail -8 /tmp/plumber.log
      RESULTS+=("✗ ${V_SLUG}: step-${step}")
      continue 2
    fi
  done

  FINAL_MP4="output/Step 7 (Final Merge MP4)/${CSV_BASE}/${MP4_BASE}.mp4"
  if [ -f "$FINAL_MP4" ]; then
    mkdir -p "${WEBSITE_V}/${V_SLUG}"
    cp "$FINAL_MP4" "${WEBSITE_V}/${V_SLUG}/video.mp4"
    echo "  ✓ copied MP4 to ${WEBSITE_V}/${V_SLUG}/"
    RESULTS+=("✓ ${V_SLUG}")
  else
    echo "  ✗ mp4 missing at $FINAL_MP4"
    RESULTS+=("✗ ${V_SLUG}: mp4-missing")
  fi
  echo ""
done

echo "=== Plumber batch results ==="
for r in "${RESULTS[@]}"; do echo "  $r"; done
