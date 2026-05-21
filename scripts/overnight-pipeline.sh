#!/bin/bash
# scripts/overnight-pipeline.sh
# Autonomous overnight pipeline: scrape → audit → record → voiceover → combine →
# brand → subtitle → merge → landing → rsync → deploy → step-8 publish for
# every emailable lead in a single search query.
#
# Usage:
#   ./scripts/overnight-pipeline.sh "Plumbers in Santa Monica CA" 2>&1 | tee /tmp/overnight-<date>.log
#
# Output: /tmp/overnight-report-<date>.md with numbered list of deployed URLs.

set -u  # error on unset vars; tolerate command failures with explicit checks
SEARCH_QUERY="${1:-Plumbers in Santa Monica CA}"
DATE_STAMP=$(date +%Y-%m-%d)
TIME_START=$(date +%H:%M)
SCRAPER_DIR="/Volumes/LaCie - APFS (Mac)/ALL NEWS SITES/Rocket Growth Agency/Rocket Growth Agency Scraper VS Code"
WEBSITE_DIR="/Volumes/LaCie - APFS (Mac)/ALL NEWS SITES/Rocket Growth Agency/Rocket Growth Agency Website VS Code"
REPORT="/tmp/overnight-report-${DATE_STAMP}.md"
LOGFILE="/tmp/overnight-pipeline-${DATE_STAMP}.log"

cd "$SCRAPER_DIR"

# Caffeinate to prevent Mac sleep during the run
caffeinate -dimsu -t 14400 &
CAF_PID=$!
trap "kill $CAF_PID 2>/dev/null" EXIT

echo "=== Overnight pipeline: $SEARCH_QUERY ===" | tee -a "$LOGFILE"
echo "Started: $TIME_START" | tee -a "$LOGFILE"
echo "" | tee -a "$LOGFILE"

# === Step 1: scrape ===
# PRODUCTION mode — uses step-1's default TARGET_UNIQUE_PLACES=55 to scrape
# the full first page of Maps results, not a test-mode 5-cap. Memory:
# feedback_overnight_autonomous_workflow.md (locked 2026-05-21 after Chris
# caught us running in test mode and producing only 4 videos overnight).
# To run smaller batch for testing: TARGET_UNIQUE_PLACES=5 ./overnight-pipeline.sh ...
echo ">>> step-1 scrape (production — full default ~55 leads)" | tee -a "$LOGFILE"
SEARCH_QUERY="$SEARCH_QUERY" node step-1-maps-scraper.cjs --skip-freshness 2>&1 | tee -a "$LOGFILE"

# === Determine the latest CSV ===
LATEST_S1=$(ls -t "output/Step 1/"*"-[step-1].csv" | head -1)
echo "Step-1 CSV: $LATEST_S1" | tee -a "$LOGFILE"

# === Build vertical benchmark if missing ===
SLUG=$(echo "$SEARCH_QUERY" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//')
BENCHMARK_FILE="data/vertical-benchmarks/${SLUG}.json"
if [ ! -f "$BENCHMARK_FILE" ]; then
  echo ">>> Building vertical benchmark" | tee -a "$LOGFILE"
  node scripts/build-vertical-benchmark.mjs "$SEARCH_QUERY" 2>&1 | tee -a "$LOGFILE"
fi

# === Step 2: email scrape ===
echo "" | tee -a "$LOGFILE"
echo ">>> step-2 email scrape" | tee -a "$LOGFILE"
node step-2-email-scraper.mjs 2>&1 | tee -a "$LOGFILE"

LATEST_S2=$(ls -t "output/Step 2/"*"-[step-2].csv" | head -1)

# === For each emailable lead, run individual chain ===
DEPLOYED_URLS=()
FAILED_LEADS=()

python3 <<EOPY > /tmp/emailable_leads.txt
import csv
with open("$LATEST_S2") as f:
    for r in csv.DictReader(f):
        email = (r.get('email','') or '').strip()
        if email and '@' in email and not email.startswith('user@') and not email.endswith('.our'):
            print(f"{r['Business Name']}")
EOPY

echo "" | tee -a "$LOGFILE"
echo ">>> Emailable leads to process:" | tee -a "$LOGFILE"
cat /tmp/emailable_leads.txt | tee -a "$LOGFILE"
echo "" | tee -a "$LOGFILE"

while IFS= read -r BIZ_NAME; do
  [ -z "$BIZ_NAME" ] && continue
  echo "" | tee -a "$LOGFILE"
  echo "============================================" | tee -a "$LOGFILE"
  echo ">>> Processing: $BIZ_NAME" | tee -a "$LOGFILE"
  echo "============================================" | tee -a "$LOGFILE"

  # Filter to single-lead CSV
  BIZ_SLUG=$(echo "$BIZ_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//' | cut -c1-40)
  S1_BASENAME=$(basename "$LATEST_S1" "-[step-1].csv")
  S1_FILTERED="output/Step 1/${DATE_STAMP}_${BIZ_SLUG}-only-${S1_BASENAME#${DATE_STAMP}_}-[step-1].csv"
  S2_FILTERED="output/Step 2/${DATE_STAMP}_${BIZ_SLUG}-only-${S1_BASENAME#${DATE_STAMP}_}-[step-2].csv"

  python3 <<EOPY 2>&1 | tee -a "$LOGFILE"
import csv
with open("$LATEST_S1") as f:
    rows = list(csv.DictReader(f))
    fn = list(rows[0].keys())
keep = [r for r in rows if r['Business Name'] == "$BIZ_NAME"]
with open("$S1_FILTERED", 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=fn)
    w.writeheader(); w.writerows(keep)
print(f"  wrote {len(keep)} rows")
EOPY

  touch "$S1_FILTERED"
  node step-2-email-scraper.mjs 2>&1 | tee -a "$LOGFILE" | tail -3

  # Chain steps
  STEP2_CSV="$S2_FILTERED" node step-2.5-audit.mjs 2>&1 | tee -a "$LOGFILE" | tail -2
  STEP2_CSV="$S2_FILTERED" MAX_VIDEOS=1 node step-3-video-recorder.mjs 2>&1 | tee -a "$LOGFILE" | tail -2
  STEP2_CSV="$S2_FILTERED" node step-6-voiceover.mjs 2>&1 | tee -a "$LOGFILE" | tail -5
  STEP2_CSV="$S2_FILTERED" MAX_COMBINES=1 node step-4-combine-desktop-mobile.mjs 2>&1 | tee -a "$LOGFILE" | tail -1
  STEP2_CSV="$S2_FILTERED" MAX_BRANDS=1 node step-5-branding.mjs 2>&1 | tee -a "$LOGFILE" | tail -1
  STEP2_CSV="$S2_FILTERED" MAX_RECORDINGS=1 node step-6b-subtitles.mjs 2>&1 | tee -a "$LOGFILE" | tail -1
  STEP2_CSV="$S2_FILTERED" MAX_MERGES=1 node step-7-merge-branded-audio.mjs 2>&1 | tee -a "$LOGFILE" | tail -1

  # Build landing
  node build-video-landing.mjs 2>&1 | tee -a "$LOGFILE" | grep -i "$BIZ_SLUG" | head -1

  # Find the deployed slug
  DEPLOY_SLUG=$(node build-video-landing.mjs 2>&1 | grep -oE "/v/[a-z0-9-]+/ →" | head -1 | sed 's|/v/||;s|/.*||')

  # Find a slug matching this business
  SLUG_PATTERN=$(echo "$BIZ_NAME" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9' '-' | sed 's/--*/-/g' | sed 's/^-//;s/-$//')
  ACTUAL_SLUG=$(ls "output/landing-pages/v/" 2>/dev/null | grep -F "$(echo $SLUG_PATTERN | cut -c1-10)" | head -1)

  if [ -n "$ACTUAL_SLUG" ] && [ -d "output/landing-pages/v/$ACTUAL_SLUG" ]; then
    # rsync + deploy
    DST="$WEBSITE_DIR/v/$ACTUAL_SLUG"
    mkdir -p "$DST"
    rsync -a --delete "output/landing-pages/v/$ACTUAL_SLUG/" "$DST/"
    cd "$WEBSITE_DIR"
    git add "v/$ACTUAL_SLUG" && git commit -m "Overnight deploy: $BIZ_NAME" 2>&1 | tee -a "$LOGFILE" | tail -2
    netlify deploy --prod --dir=. 2>&1 | tee -a "$LOGFILE" | grep -E "Production deploy|rocketgrowth" | head -2
    cd "$SCRAPER_DIR"
    # step-8 publish
    STEP2_CSV="$S2_FILTERED" node step-8-publish-to-airtable.mjs 2>&1 | tee -a "$LOGFILE" | tail -2
    # Re-run build-video-landing to patch Video URL
    node build-video-landing.mjs 2>&1 | tee -a "$LOGFILE" | grep -i "$ACTUAL_SLUG" | head -1

    DEPLOYED_URLS+=("$BIZ_NAME|https://www.rocketgrowthagency.com/v/$ACTUAL_SLUG/")
    echo "  ✓ DEPLOYED: $BIZ_NAME" | tee -a "$LOGFILE"
  else
    FAILED_LEADS+=("$BIZ_NAME|landing page not built")
    echo "  ✗ FAILED: $BIZ_NAME — landing not built" | tee -a "$LOGFILE"
  fi
done < /tmp/emailable_leads.txt

# === Write morning report ===
TIME_END=$(date +%H:%M)
cat > "$REPORT" <<EOF
# Overnight run — $DATE_STAMP — $SEARCH_QUERY

Started: $TIME_START
Finished: $TIME_END

## Videos deployed (${#DEPLOYED_URLS[@]} total)

EOF
N=1
for entry in "${DEPLOYED_URLS[@]}"; do
  IFS='|' read -r name url <<< "$entry"
  echo "$N. **$name** — $url" >> "$REPORT"
  N=$((N + 1))
done
if [ ${#FAILED_LEADS[@]} -gt 0 ]; then
  echo "" >> "$REPORT"
  echo "## Failed leads" >> "$REPORT"
  for entry in "${FAILED_LEADS[@]}"; do
    IFS='|' read -r name reason <<< "$entry"
    echo "- $name — $reason" >> "$REPORT"
  done
fi
echo "" >> "$REPORT"
echo "## Apps Script drafts" >> "$REPORT"
echo "- The Apps Script \`createOutreachDrafts\` cron runs every 2hrs and picks up new leads with Email + Video URL. Drafts should appear in Chris's Gmail within 2hrs of step-8 publish." >> "$REPORT"
echo "" >> "$REPORT"
echo "Full pipeline log: $LOGFILE" >> "$REPORT"

echo "" | tee -a "$LOGFILE"
echo "=== DONE ===" | tee -a "$LOGFILE"
echo "Report: $REPORT" | tee -a "$LOGFILE"
cat "$REPORT" | tee -a "$LOGFILE"
