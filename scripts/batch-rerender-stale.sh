#!/usr/bin/env bash
# Batch re-render the 7 stale-deployed videos under the v14 framework
# (vertical benchmark DB-gated, step-2.6 freshness, GBP socials, etc.).
#
# Usage: bash scripts/batch-rerender-stale.sh
#
# For each lead:
#   1. step-2.5 (re-audit with current extractors)
#   2. step-6  (voiceover — DB-gated, will throw if no benchmark exists)
#   3. step-4 → step-5 → step-6b → step-7 (full re-render in correct order)
#   4. copy MP4 to website repo /v/<slug>/
#
# Continues on per-lead failures; logs status per lead.

set -uo pipefail
cd "/Volumes/LaCie - APFS (Mac)/ALL NEWS SITES/Rocket Growth Agency/Rocket Growth Agency Scraper VS Code"

WEBSITE_V="/Volumes/LaCie - APFS (Mac)/ALL NEWS SITES/Rocket Growth Agency/Rocket Growth Agency Website VS Code/v"

LEADS=(
  "an_integrity_garage_door_repai-single-[step-2]|an-integrity-garage-door-repair-los-angeles-la|01_an-integrity-garage-door-repair-los-angeles-la"
  "brgd_garage_door_repair_marina-single-[step-2]|brgd-garage-door-repair-marina-del-rey|01_brgd-garage-door-repair-marina-del-rey"
  "garage-gurus-single-[step-2]|garage-gurus|01_garage-gurus"
  "knr_sliding_-_glass_doors_culv-single-[step-2]|knr-sliding-and-glass-doors-culver-city|01_knr-sliding-and-glass-doors-culver-city"
  "sun-garage-door-single-[step-2]|sun-garage-doors-repair|01_sun-garage-doors-repair"
  "sliding-door-co-single-[step-2]|the-sliding-door-company-los-angeles-appointments-recommended|01_the-sliding-door-company-los-angeles-appointments-recommended"
)

echo "=== Batch re-render: ${#LEADS[@]} stale leads ==="
echo ""

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
    echo "  ✗ CSV missing — skipping"
    RESULTS+=("✗ ${V_SLUG}: csv-missing")
    continue
  fi

  STEP="step-2.5"
  if STEP2_CSV="$CSV" node step-2.5-audit.mjs > /tmp/render.log 2>&1; then
    echo "  ✓ step-2.5"
  else
    echo "  ✗ step-2.5 failed (tail of log):"
    tail -5 /tmp/render.log
    RESULTS+=("✗ ${V_SLUG}: step-2.5")
    continue
  fi

  if STEP2_CSV="$CSV" node step-6-voiceover.mjs > /tmp/render.log 2>&1; then
    echo "  ✓ step-6"
  else
    echo "  ✗ step-6 failed (tail of log):"
    tail -10 /tmp/render.log
    RESULTS+=("✗ ${V_SLUG}: step-6")
    continue
  fi

  if STEP2_CSV="$CSV" node step-4-combine-desktop-mobile.mjs > /tmp/render.log 2>&1; then
    echo "  ✓ step-4"
  else
    echo "  ✗ step-4 failed"
    tail -5 /tmp/render.log
    RESULTS+=("✗ ${V_SLUG}: step-4")
    continue
  fi

  if STEP2_CSV="$CSV" node step-5-branding.mjs > /tmp/render.log 2>&1; then
    echo "  ✓ step-5"
  else
    echo "  ✗ step-5 failed"
    tail -5 /tmp/render.log
    RESULTS+=("✗ ${V_SLUG}: step-5")
    continue
  fi

  if STEP2_CSV="$CSV" node step-6b-subtitles.mjs > /tmp/render.log 2>&1; then
    echo "  ✓ step-6b"
  else
    echo "  ✗ step-6b failed"
    tail -5 /tmp/render.log
    RESULTS+=("✗ ${V_SLUG}: step-6b")
    continue
  fi

  if STEP2_CSV="$CSV" node step-7-merge-branded-audio.mjs > /tmp/render.log 2>&1; then
    echo "  ✓ step-7"
    TRIM_INFO=$(grep -E "Padding|Trimming" /tmp/render.log | tail -1)
    echo "    $TRIM_INFO"
  else
    echo "  ✗ step-7 failed"
    tail -5 /tmp/render.log
    RESULTS+=("✗ ${V_SLUG}: step-7")
    continue
  fi

  FINAL_MP4="output/Step 7 (Final Merge MP4)/${CSV_BASE}/${MP4_BASE}.mp4"
  if [ -f "$FINAL_MP4" ]; then
    mkdir -p "${WEBSITE_V}/${V_SLUG}"
    cp "$FINAL_MP4" "${WEBSITE_V}/${V_SLUG}/video.mp4"
    echo "  ✓ copied MP4 to ${WEBSITE_V}/${V_SLUG}/video.mp4"
    RESULTS+=("✓ ${V_SLUG}")
  else
    echo "  ✗ final MP4 not found at $FINAL_MP4"
    RESULTS+=("✗ ${V_SLUG}: mp4-missing")
  fi

  echo ""
done

echo ""
echo "=== Batch results ==="
for r in "${RESULTS[@]}"; do echo "  $r"; done
