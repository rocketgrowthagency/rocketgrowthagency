#!/usr/bin/env bash
# Run after a batch re-render to:
#   1. Run build-video-landing.mjs (regenerates all 18 landing index.html files
#      with fresh cache-bust query strings + writes Audit Summary to Airtable)
#   2. Copy the fresh index.html for each lead in CSVS to the website repo
#   3. Stage the website repo changes for commit
#
# Designed to be safe even when only some of the batch leads succeeded.

set -uo pipefail
cd "/Volumes/LaCie - APFS (Mac)/ALL NEWS SITES/Rocket Growth Agency/Rocket Growth Agency Scraper VS Code"
WEBSITE_V="/Volumes/LaCie - APFS (Mac)/ALL NEWS SITES/Rocket Growth Agency/Rocket Growth Agency Website VS Code/v"

CSVS=(
  "alvin-garage-door-single-[step-2]|alvin-garage-door"
  "rock-single-[step-2]|rock-garage-door-repair-inc"
  "an_integrity_garage_door_repai-single-[step-2]|an-integrity-garage-door-repair-los-angeles-la"
  "brgd_garage_door_repair_marina-single-[step-2]|brgd-garage-door-repair-marina-del-rey"
  "garage-gurus-single-[step-2]|garage-gurus"
  "knr_sliding_-_glass_doors_culv-single-[step-2]|knr-sliding-and-glass-doors-culver-city"
  "sun-garage-door-single-[step-2]|sun-garage-doors-repair"
  "sliding-door-co-single-[step-2]|the-sliding-door-company-los-angeles-appointments-recommended"
  "bright-garage-door-single-[step-2]|bright-garage-door-inc"
  "express-garage-door-single-[step-2]|express-garage-door-service"
)

echo "==================================================================="
echo "▶ Running build-video-landing for all CSVs"
echo "==================================================================="

for entry in "${CSVS[@]}"; do
  CSV_BASE="${entry%%|*}"
  V_SLUG="${entry##*|}"
  CSV="output/Step 2/${CSV_BASE}.csv"
  if [ ! -f "$CSV" ]; then
    echo "  ◌ skip ${V_SLUG} (no CSV)"
    continue
  fi
  # Run build-video-landing — it regenerates ALL 18 landing pages each invocation,
  # so running it once is enough. But running per-CSV ensures Airtable URL/Audit
  # Summary is set correctly for each lead.
  STEP2_CSV="$CSV" node build-video-landing.mjs > /tmp/landing.log 2>&1 || true
  break  # one run does all leads
done

echo ""
echo "==================================================================="
echo "▶ Copying fresh index.html files to website repo"
echo "==================================================================="

for entry in "${CSVS[@]}"; do
  V_SLUG="${entry##*|}"
  SRC="output/landing-pages/v/${V_SLUG}/index.html"
  DST="${WEBSITE_V}/${V_SLUG}/index.html"
  if [ -f "$SRC" ] && [ -d "${WEBSITE_V}/${V_SLUG}" ]; then
    cp "$SRC" "$DST"
    echo "  ✓ ${V_SLUG}"
  else
    echo "  ◌ skip ${V_SLUG} (src=${SRC} exists=$([ -f "$SRC" ] && echo y || echo n), dst-dir exists=$([ -d "${WEBSITE_V}/${V_SLUG}" ] && echo y || echo n))"
  fi
done

echo ""
echo "Done. Now: cd into website repo, review git diff, commit + push."
