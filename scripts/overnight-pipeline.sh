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

# ============================================================
# Pre-flight: verification-gate regression + static absence-finding scan.
# Locked 2026-05-21 alongside the universal verification-gate hardening.
# If these fail, step-6 has either a broken gate or a new ungated absence
# finding — DO NOT scrape/render/ship until fixed.
# Memory: feedback_verification_gates_must_be_strict.md.
# ============================================================
echo ">>> pre-flight: regression suite (step-6 gate behavior)" | tee -a "$LOGFILE"
if ! node scripts/regression-audit-detectors.mjs 2>&1 | tee -a "$LOGFILE"; then
  echo "✗ FATAL: regression suite failed — aborting overnight run to prevent shipping false claims." | tee -a "$LOGFILE"
  exit 1
fi
echo ">>> pre-flight: static absence-gate scanner" | tee -a "$LOGFILE"
if ! node scripts/check-absence-finding-gates.mjs 2>&1 | tee -a "$LOGFILE"; then
  echo "✗ FATAL: static absence-gate scan failed — an ungated absence finding exists in step-6. Aborting." | tee -a "$LOGFILE"
  exit 1
fi
echo "✓ pre-flight gates passed" | tee -a "$LOGFILE"
echo "" | tee -a "$LOGFILE"

# === Bounce recovery (locked 2026-05-22) ===
# Process any leads flagged 'queued-recovery' by Apps Script processBouncedLeads.
# Re-scrapes the website + SerpAPI for a replacement email. On success: clears
# Email Status, sets Status='new', resets Draft Created — lead re-enters funnel.
# On failure: marks Email Status='no-replacement-found' (terminal).
# Safe to run before the scrape since it operates on the existing Airtable
# Leads table — no dependency on tonight's new leads.
echo ">>> bounce recovery (queued-recovery → recovered OR no-replacement-found)" | tee -a "$LOGFILE"
node scripts/recover-bounced-emails.mjs 2>&1 | tee -a "$LOGFILE" | tail -10
echo "" | tee -a "$LOGFILE"

# === Tier 1 #3 (locked 2026-05-26) — Cache step-1 + step-2 master CSVs for 12hr ===
# When a restart happens within 12 hours of a fresh scrape, both step-1 (Maps
# scrape, ~10 min) and master step-2 (email scrape, ~5 min) re-run from scratch
# under the prior logic. This eats ~15 min per restart for zero new info. The
# CACHE_TTL_MIN check below skips both if a recent CSV for the same search-
# query slug exists. Combined with the idempotency guard (line ~117), this
# makes pause/resume effectively free instead of expensive. Empirical baseline:
# 8.5hr/48-lead run (2026-05-26 Electricians-in-Long-Beach). See
# project_pending_tasks.md P1.
SLUG=$(echo "$SEARCH_QUERY" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//')
CACHE_TTL_MIN=${CACHE_TTL_MIN:-720}  # 720 min = 12 hr
CACHED_S1=$(find "output/Step 1" -name "*${SLUG}*-[step-1].csv" -mmin "-${CACHE_TTL_MIN}" 2>/dev/null | head -1)
CACHED_S2=$(find "output/Step 2" -name "*${SLUG}*-[step-2].csv" -mmin "-${CACHE_TTL_MIN}" 2>/dev/null | head -1)
SKIP_SCRAPE=""
if [ -n "$CACHED_S1" ] && [ -n "$CACHED_S2" ]; then
  echo ">>> CACHE HIT — using cached Step 1 + Step 2 CSVs (<${CACHE_TTL_MIN}min old)" | tee -a "$LOGFILE"
  echo "    Step-1: $CACHED_S1" | tee -a "$LOGFILE"
  echo "    Step-2: $CACHED_S2" | tee -a "$LOGFILE"
  LATEST_S1="$CACHED_S1"
  LATEST_S2="$CACHED_S2"
  SKIP_SCRAPE=1
fi

# === Step 1: scrape ===
# PRODUCTION mode — uses step-1's default TARGET_UNIQUE_PLACES=55 to scrape
# the full first page of Maps results, not a test-mode 5-cap. Memory:
# feedback_overnight_autonomous_workflow.md (locked 2026-05-21 after Chris
# caught us running in test mode and producing only 4 videos overnight).
# To run smaller batch for testing: TARGET_UNIQUE_PLACES=5 ./overnight-pipeline.sh ...
if [ -z "$SKIP_SCRAPE" ]; then
  echo ">>> step-1 scrape (production — full default ~55 leads)" | tee -a "$LOGFILE"
  SEARCH_QUERY="$SEARCH_QUERY" node step-1-maps-scraper.cjs --skip-freshness 2>&1 | tee -a "$LOGFILE"

  # === Determine the latest CSV ===
  LATEST_S1=$(ls -t "output/Step 1/"*"-[step-1].csv" | head -1)
fi
echo "Step-1 CSV: $LATEST_S1" | tee -a "$LOGFILE"

# === Build vertical benchmark if missing ===
BENCHMARK_FILE="data/vertical-benchmarks/${SLUG}.json"
if [ ! -f "$BENCHMARK_FILE" ]; then
  echo ">>> Building vertical benchmark" | tee -a "$LOGFILE"
  node scripts/build-vertical-benchmark.mjs "$SEARCH_QUERY" 2>&1 | tee -a "$LOGFILE"
fi

# === Step 2: email scrape (master) ===
if [ -z "$SKIP_SCRAPE" ]; then
  echo "" | tee -a "$LOGFILE"
  echo ">>> step-2 email scrape" | tee -a "$LOGFILE"
  node step-2-email-scraper.mjs 2>&1 | tee -a "$LOGFILE"
  LATEST_S2=$(ls -t "output/Step 2/"*"-[step-2].csv" | head -1)
fi
echo "Step-2 CSV: $LATEST_S2" | tee -a "$LOGFILE"

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

  # IDEMPOTENCY GUARD (locked 2026-05-23) — skip if Airtable already has a Video URL
  # for this Business Name + Search Term. Without this, every restart re-renders
  # leads that already have working videos, wasting hours of compute. Caught
  # 2026-05-23 after a pause/resume re-did the first 10 Electricians leads
  # from scratch. See feedback_pipeline_must_skip_already_deployed.md.
  #
  # PERMANENT-FAIL EXTENSION (Tier 1 #6 locked 2026-05-27) — also skip if Email
  # Status='build-failed' to avoid burning ~5 min on each retry of the same
  # leads. The 2026-05-26 Electricians run had 3 leads (Long Beach Electric,
  # Johns electric, Croff Electric) fail 3-4 times each at landing build. After
  # MAX_BUILD_FAILS attempts, scripts/mark-permanent-fail.mjs sets the lead's
  # Email Status to 'build-failed' and that's what this query catches.
  CHECK_RESULT=$(AIRTABLE_API_KEY="$(grep AIRTABLE_API_KEY .env | cut -d= -f2-)" \
                 AIRTABLE_BASE_ID="$(grep AIRTABLE_BASE_ID .env | cut -d= -f2-)" \
                 BIZ_NAME_ARG="$BIZ_NAME" \
                 SEARCH_QUERY_ARG="$SEARCH_QUERY" \
                 node -e '
    const k = process.env.AIRTABLE_API_KEY, b = process.env.AIRTABLE_BASE_ID;
    if (!k || !b) { console.log("NO_CREDS"); process.exit(0); }
    const escapeQ = (s) => String(s).replace(/"/g, "\\\"");
    const biz = process.env.BIZ_NAME_ARG, term = process.env.SEARCH_QUERY_ARG;
    // Match the lead; we want both Video-URL-present (deployed) AND build-failed states.
    const formula = `AND({Business Name}="${escapeQ(biz)}", {Search Term}="${escapeQ(term)}")`;
    const url = "https://api.airtable.com/v0/" + b + "/Leads?pageSize=1&filterByFormula=" + encodeURIComponent(formula);
    fetch(url, { headers: { Authorization: "Bearer " + k } })
      .then(r => r.json())
      .then(d => {
        if (!d.records || !d.records.length) { console.log("NO"); return; }
        const f = d.records[0].fields || {};
        if (f["Video URL"]) { console.log("DEPLOYED"); return; }
        if (f["Email Status"] === "build-failed") { console.log("PERMA_FAIL"); return; }
        console.log("NO");
      })
      .catch(() => console.log("ERR"));
  ' 2>/dev/null)
  if [ "$CHECK_RESULT" = "DEPLOYED" ]; then
    echo "" | tee -a "$LOGFILE"
    echo ">>> SKIP (already in Airtable with Video URL): $BIZ_NAME" | tee -a "$LOGFILE"
    continue
  fi
  if [ "$CHECK_RESULT" = "PERMA_FAIL" ]; then
    echo "" | tee -a "$LOGFILE"
    echo ">>> SKIP (Email Status=build-failed — permanently retired after N landing-not-built attempts): $BIZ_NAME" | tee -a "$LOGFILE"
    continue
  fi

  # Log-based fail-count check (Tier 1 #6 fallback) — for leads that have failed
  # "landing not built" MAX_BUILD_FAILS+ times across recent pipeline runs, skip
  # rather than burn ~5 min retrying the same broken path. Counts failures
  # across all /tmp/overnight-*.log files. Without this, the 3 problem leads
  # from 2026-05-26 (Long Beach Electric, Johns electric, Croff Electric) would
  # each burn 5 min per run forever (they have no Airtable row to mark, since
  # step-8 only writes on success).
  MAX_BUILD_FAILS="${MAX_BUILD_FAILS:-3}"
  PAST_FAILS=$(grep -h "✗ FAILED: ${BIZ_NAME} — landing not built" /tmp/overnight-*.log 2>/dev/null | wc -l | tr -d ' ')
  if [ "$PAST_FAILS" -ge "$MAX_BUILD_FAILS" ]; then
    echo "" | tee -a "$LOGFILE"
    echo ">>> SKIP (log-count ${PAST_FAILS} ≥ MAX_BUILD_FAILS=${MAX_BUILD_FAILS} landing-not-built fails — permanently retired): $BIZ_NAME" | tee -a "$LOGFILE"
    continue
  fi

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
print(f"  wrote {len(keep)} step-1 rows")
EOPY

  # Tier 1 #2 (locked 2026-05-26): the master step-2 (line ~88) already
  # populated email for every emailable lead in this run. Instead of re-running
  # step-2-email-scraper for a single row (~10s × N leads = ~5-8min waste per
  # run), filter the master step-2 CSV in-place. Same output, ~0s.
  python3 <<EOPY 2>&1 | tee -a "$LOGFILE"
import csv
with open("$LATEST_S2") as f:
    rows = list(csv.DictReader(f))
    fn = list(rows[0].keys()) if rows else []
keep = [r for r in rows if r.get('Business Name') == "$BIZ_NAME"]
with open("$S2_FILTERED", 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=fn)
    w.writeheader(); w.writerows(keep)
print(f"  wrote {len(keep)} step-2 rows (filtered from master, no re-scrape)")
EOPY

  # Chain steps
  STEP2_CSV="$S2_FILTERED" node step-2.5-audit.mjs 2>&1 | tee -a "$LOGFILE" | tail -2
  STEP2_CSV="$S2_FILTERED" MAX_VIDEOS=1 node step-3-video-recorder.mjs 2>&1 | tee -a "$LOGFILE" | tail -2

  # Tier 2 #9 fast-fail (locked 2026-05-27) — root cause of "landing not built"
  # is step-3 producing INCOMPLETE WebMs (e.g., Maps recording succeeds but
  # Website + Mobile recordings silently fail for leads with bot-blocking
  # sites). Without this guard, the pipeline burns ~5 min running step-4/5/6/
  # 6b/7 on empty input. Check that step-3 produced all 3 expected WebM files
  # before continuing the chain. If not, fail fast.
  STEP3_DIR_PATTERN="output/Step 3 (Video Recorder - Raw WebM)/${DATE_STAMP}_${BIZ_SLUG}-only-*-[step-2]"
  STEP3_DIR=$(ls -d $STEP3_DIR_PATTERN 2>/dev/null | head -1)
  if [ -n "$STEP3_DIR" ]; then
    WEBM_COUNT=$(ls "$STEP3_DIR"/*.webm 2>/dev/null | wc -l | tr -d ' ')
  else
    WEBM_COUNT=0
  fi
  if [ "$WEBM_COUNT" -lt 3 ]; then
    echo "" | tee -a "$LOGFILE"
    echo ">>> step-3 produced only ${WEBM_COUNT}/3 WebMs (website or mobile recording failed — likely bot-blocked site)" | tee -a "$LOGFILE"
    FAILED_LEADS+=("$BIZ_NAME|step-3 incomplete (${WEBM_COUNT}/3 WebMs)")
    echo "  ✗ FAILED: $BIZ_NAME — landing not built" | tee -a "$LOGFILE"
    continue
  fi

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
# A8 fix 2026-05-22: bash-safe empty-array expansion under `set -u`.
# Without the `${arr[@]+...}` guard, an empty DEPLOYED_URLS array trips
# "unbound variable" and aborts the whole script before report-write.
# Caused Pipeline 2 (Electricians Long Beach) crash overnight 2026-05-21.
for entry in "${DEPLOYED_URLS[@]+"${DEPLOYED_URLS[@]}"}"; do
  IFS='|' read -r name url <<< "$entry"
  # Locate this lead's voiceover manifest to pull verification summary.
  BIZ_SLUG_FOR_MANIFEST=$(echo "$name" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9' '-' | sed 's/--*/-/g' | sed 's/^-//;s/-$//')
  VERIF=$(python3 -c "
import glob, json, sys
files = sorted(glob.glob('output/Step 6 (Voiceover MP3)/${DATE_STAMP}_*${BIZ_SLUG_FOR_MANIFEST:0:25}*/*_segments/manifest.json'))
if not files: sys.exit(0)
m = json.load(open(files[-1]))
vs = m.get('verificationState', {})
print(vs.get('summary', ''))
" 2>/dev/null)
  if [ -n "$VERIF" ]; then
    echo "$N. **$name** — $url   _($VERIF)_" >> "$REPORT"
  else
    echo "$N. **$name** — $url" >> "$REPORT"
  fi
  N=$((N + 1))
done
if [ ${#FAILED_LEADS[@]} -gt 0 ]; then
  echo "" >> "$REPORT"
  echo "## Failed leads" >> "$REPORT"
  for entry in "${FAILED_LEADS[@]+"${FAILED_LEADS[@]}"}"; do
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
