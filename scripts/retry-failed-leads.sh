#!/usr/bin/env bash
# Retry leads that failed in batch-rerender-stale.sh.
# Identified failure modes so far:
#   - AN Integrity: maps.mp3 + website.mp3 truncated to ~0.3s (OpenAI TTS
#     returned partial response). Re-running step-6 regenerates fresh
#     audio. Then step-4 + step-5 + step-6b + step-7 in correct order.
#
# Also handles Bright Garage Door (held out of primary batch to avoid
# Chrome profile collision).

set -uo pipefail
cd "/Volumes/LaCie - APFS (Mac)/ALL NEWS SITES/Rocket Growth Agency/Rocket Growth Agency Scraper VS Code"
WEBSITE_V="/Volumes/LaCie - APFS (Mac)/ALL NEWS SITES/Rocket Growth Agency/Rocket Growth Agency Website VS Code/v"

LEADS=(
  "an_integrity_garage_door_repai-single-[step-2]|an-integrity-garage-door-repair-los-angeles-la|01_an-integrity-garage-door-repair-los-angeles-la"
  "knr_sliding_-_glass_doors_culv-single-[step-2]|knr-sliding-and-glass-doors-culver-city|01_knr-sliding-and-glass-doors-culver-city"
  "bright-garage-door-single-[step-2]|bright-garage-door-inc|01_bright-garage-door-inc"
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

  if [ ! -f "$CSV" ]; then
    echo "  ✗ CSV missing"; RESULTS+=("✗ ${V_SLUG}: csv-missing"); continue
  fi

  # Step-2.5: re-audit (skip if audit-findings.json already exists and is fresh)
  AUDIT_JSON="output/Step 2.5 (Audit)/${CSV_BASE}/audit-findings.json"
  if [ ! -f "$AUDIT_JSON" ]; then
    if STEP2_CSV="$CSV" node step-2.5-audit.mjs > /tmp/retry.log 2>&1; then
      echo "  ✓ step-2.5"
    else
      tail -10 /tmp/retry.log; RESULTS+=("✗ ${V_SLUG}: step-2.5"); continue
    fi
  else
    echo "  ◌ step-2.5 skipped (audit-findings.json exists)"
  fi

  for step in 6 4 5 6b 7; do
    case $step in
      6)  cmd="node step-6-voiceover.mjs" ;;
      4)  cmd="node step-4-combine-desktop-mobile.mjs" ;;
      5)  cmd="node step-5-branding.mjs" ;;
      6b) cmd="node step-6b-subtitles.mjs" ;;
      7)  cmd="node step-7-merge-branded-audio.mjs" ;;
    esac
    if STEP2_CSV="$CSV" $cmd > /tmp/retry.log 2>&1; then
      echo "  ✓ step-${step}"
    else
      tail -10 /tmp/retry.log; RESULTS+=("✗ ${V_SLUG}: step-${step}"); continue 2
    fi
  done

  FINAL_MP4="output/Step 7 (Final Merge MP4)/${CSV_BASE}/${MP4_BASE}.mp4"
  if [ -f "$FINAL_MP4" ]; then
    mkdir -p "${WEBSITE_V}/${V_SLUG}"
    cp "$FINAL_MP4" "${WEBSITE_V}/${V_SLUG}/video.mp4"
    echo "  ✓ copied MP4 to ${WEBSITE_V}/${V_SLUG}/video.mp4"
    RESULTS+=("✓ ${V_SLUG}")
  else
    echo "  ✗ final MP4 not found"; RESULTS+=("✗ ${V_SLUG}: mp4-missing")
  fi
  echo ""
done

echo ""
echo "=== Retry results ==="
for r in "${RESULTS[@]}"; do echo "  $r"; done
