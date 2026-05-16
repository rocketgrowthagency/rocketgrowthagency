#!/usr/bin/env bash
# Render every email-bearing lead in Airtable Leads that doesn't yet have a
# Vid Slug. Iterates by search vertical to keep step-3 Chrome state clean.
# Continues on per-lead failure; commits + pushes incrementally so progress
# is preserved if the run is interrupted.
#
# Order:
#   1. Garage door repair Culver City (20)
#   2. Plumbers Culver City (12)
#   3. HVAC Culver City (11)
#   4. Roofers Culver City (11)
#   5. Locksmiths Culver City (24)
#
# Each lead: build single-lead CSV (email backfill from Airtable if empty)
# → step-3 → step-2.5 → step-2.6 → step-6 → step-4 → step-5 → step-6b → step-7
# → copy MP4 → build landing → commit.
#
# ETA: ~20-30 hours wall clock for full 81-lead run.

set -uo pipefail
cd "/Volumes/LaCie - APFS (Mac)/ALL NEWS SITES/Rocket Growth Agency/Rocket Growth Agency Scraper VS Code"
WEBSITE_REPO="/Volumes/LaCie - APFS (Mac)/ALL NEWS SITES/Rocket Growth Agency/Rocket Growth Agency Website VS Code"
WEBSITE_V="$WEBSITE_REPO/v"

# Per-vertical search terms (process in this order)
SEARCHES=(
  "Garage door repair in Culver City, CA"
  "Plumbers in Culver City, CA"
  "HVAC in Culver City, CA"
  "Roofers in Culver City, CA"
  "Locksmiths in Culver City, CA"
)

# Slugify a business name
slugify() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g'
}

TOTAL_SUCCESS=0
TOTAL_FAIL=0

for SEARCH in "${SEARCHES[@]}"; do
  echo ""
  echo "================================================================="
  echo "  VERTICAL: $SEARCH"
  echo "================================================================="

  # Pull unrendered email-bearing leads for this search from Airtable
  LEADS_JSON=$(node -e "
import('dotenv/config').then(async () => {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const apiKey = process.env.AIRTABLE_API_KEY;
  let offset = '', all = [];
  do {
    const formula = encodeURIComponent(\`AND({Search Term}=\\\"\$SEARCH\\\", {Email} != \\\"\\\", NOT({Vid Slug}))\`);
    const url = \`https://api.airtable.com/v0/\${baseId}/Leads?filterByFormula=\${formula}&fields[]=Business Name&fields[]=Email&fields[]=Map Rank&pageSize=100\${offset?'&offset='+offset:''}\`;
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + apiKey }});
    const d = await r.json();
    all.push(...(d.records||[]));
    offset = d.offset;
  } while (offset);
  console.log(JSON.stringify(all.map(r => ({ name: r.fields['Business Name'], email: r.fields['Email'], rank: r.fields['Map Rank'] }))));
});
" 2>/dev/null)

  LEAD_COUNT=$(echo "$LEADS_JSON" | python3 -c "import json,sys;print(len(json.load(sys.stdin)))")
  echo "  Unrendered leads in this vertical: $LEAD_COUNT"

  if [ "$LEAD_COUNT" -eq 0 ]; then continue; fi

  # Iterate
  echo "$LEADS_JSON" | python3 -c "
import json, sys
for r in json.load(sys.stdin):
  print(f\"{r['name']}|{r['email']}|{r['rank']}\")
" | while IFS='|' read -r NAME EMAIL RANK; do
    SLUG=$(slugify "$NAME")
    CSV_BASE="${SLUG}-single-[step-2]"
    CSV="output/Step 2/${CSV_BASE}.csv"
    MP4_BASE="01_${SLUG}"

    echo ""
    echo "─── #${RANK} ${NAME} (${SLUG}) ───"

    # Build single-lead CSV with email backfilled
    node -e "
import('dotenv/config').then(async () => {
  const fs = await import('fs');
  const path = await import('path');
  const { createObjectCsvWriter } = await import('csv-writer');
  const csvParser = (await import('csv-parser')).default;
  // Find a source CSV for this search
  const dir = 'output/Step 2/';
  const candidates = fs.readdirSync(dir).filter(f => f.includes('[step-2]') && f.endsWith('.csv'));
  let sourceRows = null;
  for (const f of candidates.sort().reverse()) {
    const rows = await new Promise((res) => {
      const arr = [];
      fs.createReadStream(path.join(dir, f)).pipe(csvParser()).on('data', r => arr.push(r)).on('end', () => res(arr)).on('error', () => res(arr));
    });
    const match = rows.find(r => (r['Business Name']||'').trim().toLowerCase() === \`$NAME\`.trim().toLowerCase());
    if (match) { sourceRows = [match]; break; }
  }
  if (!sourceRows) { console.error('NO_SOURCE'); process.exit(1); }
  // Backfill email + map rank from Airtable
  sourceRows[0].email = '$EMAIL';
  sourceRows[0]['Map Rank'] = '$RANK';
  const headers = Object.keys(sourceRows[0]).map(id => ({ id, title: id }));
  await createObjectCsvWriter({ path: '$CSV', header: headers }).writeRecords(sourceRows);
  console.log('CSV_OK');
});
" 2>&1 | tail -3

    if [ ! -f "$CSV" ]; then echo "  ✗ CSV build failed"; TOTAL_FAIL=$((TOTAL_FAIL+1)); continue; fi

    # Run pipeline steps
    FAILED=""
    for step in 3 2.5 2.6 6 4 5 6b 7; do
      case "$step" in
        3)   CMD=(node step-3-video-recorder.mjs) ;;
        2.5) CMD=(node step-2.5-audit.mjs) ;;
        2.6) CMD=(node step-2.6-freshness-check.mjs) ;;
        6)   CMD=(node step-6-voiceover.mjs) ;;
        4)   CMD=(node step-4-combine-desktop-mobile.mjs) ;;
        5)   CMD=(node step-5-branding.mjs) ;;
        6b)  CMD=(node step-6b-subtitles.mjs) ;;
        7)   CMD=(node step-7-merge-branded-audio.mjs) ;;
      esac
      if STEP2_CSV="$CSV" "${CMD[@]}" > /tmp/render.log 2>&1; then
        echo "  ✓ step-$step"
      else
        echo "  ✗ step-$step (tail:)"
        tail -5 /tmp/render.log
        FAILED="step-$step"; break
      fi
    done
    if [ -n "$FAILED" ]; then TOTAL_FAIL=$((TOTAL_FAIL+1)); continue; fi

    # Copy MP4 + build landing
    FINAL_MP4="output/Step 7 (Final Merge MP4)/${CSV_BASE}/${MP4_BASE}.mp4"
    if [ -f "$FINAL_MP4" ]; then
      mkdir -p "${WEBSITE_V}/${SLUG}"
      cp "$FINAL_MP4" "${WEBSITE_V}/${SLUG}/video.mp4"
      STEP2_CSV="$CSV" node build-video-landing.mjs > /tmp/render.log 2>&1
      [ -f "output/landing-pages/v/${SLUG}/index.html" ] && cp "output/landing-pages/v/${SLUG}/index.html" "${WEBSITE_V}/${SLUG}/index.html"
      echo "  ✓ deployed: https://www.rocketgrowthagency.com/v/${SLUG}/"
      TOTAL_SUCCESS=$((TOTAL_SUCCESS+1))

      # Incremental commit every 3 successes per vertical
      if [ $((TOTAL_SUCCESS % 3)) -eq 0 ]; then
        cd "$WEBSITE_REPO"
        git add v/ 2>/dev/null
        git commit -m "batch render: +3 v14 videos ($TOTAL_SUCCESS total)" --no-verify 2>/dev/null
        git push origin main 2>/dev/null
        cd - > /dev/null
        echo "  ↑ committed batch checkpoint ($TOTAL_SUCCESS)"
      fi
    else
      echo "  ✗ mp4 missing"
      TOTAL_FAIL=$((TOTAL_FAIL+1))
    fi
  done
done

# Final commit
cd "$WEBSITE_REPO"
git add v/ 2>/dev/null
git commit -m "batch render: final commit — $TOTAL_SUCCESS success, $TOTAL_FAIL fail" --no-verify 2>/dev/null
git push origin main 2>/dev/null

echo ""
echo "================================================================="
echo "  BATCH COMPLETE: $TOTAL_SUCCESS success, $TOTAL_FAIL fail"
echo "================================================================="
