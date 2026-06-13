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
# 2026-06-11: portable paths — derive from the script's own location instead of
# hardcoding (was machine-specific; old Mac=LaCie, new M4=~/RGA). Works on any
# machine where Scraper + Website repos are siblings. Removes the per-Mac sed.
SCRAPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEBSITE_DIR="$(cd "$(dirname "$SCRAPER_DIR")" && pwd)/Rocket Growth Agency Website VS Code"
# 2026-06-11: report now lands in the git-tracked Website reports/ dir per the
# locked protocol (feedback_overnight_report_format), not /tmp.
mkdir -p "${WEBSITE_DIR}/reports" 2>/dev/null || true
REPORT="${WEBSITE_DIR}/reports/overnight-report-${DATE_STAMP}.md"
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
# 2026-06-02 — Sponsored-card filter regression. Locked after BHRC test
# shipped with the blue outline on a Sponsored card. Validates that step-3's
# isSponsoredBlock + getListingHrefByName + clickListingInResultsByName
# centering pass all correctly filter sponsored Maps listings for BOTH
# rank 1-3 + rank 4+ flows. Memory: feedback_never_match_sponsored_maps_listing.md.
echo ">>> pre-flight: sponsored-card filter regression" | tee -a "$LOGFILE"
if ! node scripts/check-sponsored-card-filter.mjs 2>&1 | tee -a "$LOGFILE"; then
  echo "✗ FATAL: sponsored-card filter regression failed — step-3 may match/outline a Sponsored Maps listing. Aborting." | tee -a "$LOGFILE"
  exit 1
fi
# 2026-06-02 — Mobile finding priority lock. Asserts local-SEO conversion
# levers (stickyCta, c2cFold, clickToText, etc.) stay at score <= 10 and
# tech-spec findings (mobileLoad, pageWeight, renderBlock, lazyImg) stay
# at score >= 25. If anyone ever flips the order back, this aborts the
# overnight before a single video gets rendered with the wrong priorities.
# Memory: feedback_audit_focus_local_seo_over_tech_specs.md.
echo ">>> pre-flight: mobile finding priority lock (local-SEO > tech-spec)" | tee -a "$LOGFILE"
if ! node scripts/check-mobile-finding-priority.mjs 2>&1 | tee -a "$LOGFILE"; then
  echo "✗ FATAL: mobile finding priority regressed — tech-spec findings would dominate the voiceover. Aborting." | tee -a "$LOGFILE"
  exit 1
fi
# 2026-06-11 — step-8 Airtable create-payload shape. Locks edf2eb9: the create POST
# must be { fields }-only; a leaked _skipReason (or any non-fields key) 422s every
# brand-new-lead batch silently (created=0, videos still deploy). Memory:
# feedback_step8_create_payload_fields_only.md.
echo ">>> pre-flight: step-8 create-payload shape (fields-only)" | tee -a "$LOGFILE"
if ! node scripts/check-step8-create-shape.mjs 2>&1 | tee -a "$LOGFILE"; then
  echo "✗ FATAL: step-8 create payload would leak non-fields keys → Airtable 422 on new-lead batches. Aborting." | tee -a "$LOGFILE"
  exit 1
fi
# 2026-06-12 — stale-suspect guard. Ensures step-6/step-2.5 never fire a false
# "you don't have a website" / "your domain doesn't match your business name" claim
# when the search-discovery fallback already substituted the real first-party brand
# site (Chris caught Richards Rooter, Advanced HVAC, Murphy, etc.). Memory:
# feedback_audit_stale_suspect_false_no_website.md.
echo ">>> pre-flight: stale-suspect guard (no false no-website/domain-mismatch claims)" | tee -a "$LOGFILE"
if ! node scripts/check-stale-suspect-guard.mjs 2>&1 | tee -a "$LOGFILE"; then
  echo "✗ FATAL: stale-suspect guard regressed → false no-website/domain-mismatch claims would ship to prospects. Aborting." | tee -a "$LOGFILE"
  exit 1
fi
# 2026-06-12 — duplicate-listing same-business guard. Ensures similarly-named DIFFERENT
# competitors aren't counted as "duplicates of you" (Chris caught Doctor Pipe vs Pipe
# Doctor Rooter). Memory: feedback_audit_duplicate_listing_same_business.md.
echo ">>> pre-flight: duplicate-listing same-business guard" | tee -a "$LOGFILE"
if ! node scripts/check-duplicate-listing-same-business.mjs 2>&1 | tee -a "$LOGFILE"; then
  echo "✗ FATAL: duplicate-listing guard regressed → false 'Google shows N other listings' claims would ship. Aborting." | tee -a "$LOGFILE"
  exit 1
fi
# 2026-06-12 — Maps card-open self-check. Verifies the recording environment can
# actually match + open a detail card, so we never silently ship a whole batch of
# cardless results-list videos (caught when the sponsored detector over-matched on
# the logged-in Maps layout). FATAL only on the definitive-broken state (all cards
# flagged sponsored / scorer matches nothing); transient (consent/CAPTCHA/no anchors)
# warns + passes. Skip with SKIP_CARD_CHECK=1. Memory: feedback_video_quality_fixes_2026-06-11.
if [ "${SKIP_CARD_CHECK:-0}" != "1" ]; then
  echo ">>> pre-flight: Maps card-open self-check" | tee -a "$LOGFILE"
  if ! node scripts/check-maps-card-open.mjs 2>&1 | tee -a "$LOGFILE"; then
    echo "✗ FATAL: Maps card-open is broken in this environment — every lead would ship a cardless results-list video. Fix (logged-out profile / sponsored detector / selectors) before running. Override with SKIP_CARD_CHECK=1." | tee -a "$LOGFILE"
    exit 1
  fi
fi
# 2026-06-02 — SerpAPI quota pre-flight. Locked after 2026-06-01 overnight
# wasted 10 hours retrying against an exhausted monthly quota. Abort
# cleanly if remaining is below MIN_SERPAPI_REMAINING (default 100, which
# covers step-1 scrape + step-2 email fallback for ~55 leads with margin).
# Set MIN_SERPAPI_REMAINING=0 to bypass.
MIN_SERPAPI_REMAINING="${MIN_SERPAPI_REMAINING:-100}"
# Read SERPAPI_KEY from .env if not exported. The script runs under `set -u`
# so any unset var would crash — use the :- default-empty pattern.
SERPAPI_KEY_LOCAL="${SERPAPI_KEY:-$(grep -E '^SERPAPI_KEY=' .env 2>/dev/null | head -1 | cut -d= -f2-)}"
if [ -n "${SERPAPI_KEY_LOCAL:-}" ] && [ "$MIN_SERPAPI_REMAINING" -gt 0 ]; then
  echo ">>> pre-flight: SerpAPI quota check (need ≥${MIN_SERPAPI_REMAINING} remaining)" | tee -a "$LOGFILE"
  REMAINING=$(curl -s --max-time 10 "https://serpapi.com/account?api_key=${SERPAPI_KEY_LOCAL}" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('total_searches_left', 0))" 2>/dev/null || echo 0)
  echo "    SerpAPI total_searches_left = $REMAINING" | tee -a "$LOGFILE"
  if [ "$REMAINING" -lt "$MIN_SERPAPI_REMAINING" ]; then
    echo "✗ FATAL: SerpAPI quota below threshold (${REMAINING} < ${MIN_SERPAPI_REMAINING}). Monthly quota likely exhausted." | tee -a "$LOGFILE"
    echo "    Wait for billing cycle reset OR upgrade plan OR set MIN_SERPAPI_REMAINING=0 to bypass." | tee -a "$LOGFILE"
    exit 1
  fi
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
# 2026-05-27: `find -name` interprets `[step-N]` as a character class — escape
# the brackets so they match literally. Without this, the cache never matched
# even when valid CSVs were on disk.
CACHED_S1=$(find "output/Step 1" -name "*${SLUG}*-\[step-1\].csv" -not -name "*-only-*" -mmin "-${CACHE_TTL_MIN}" 2>/dev/null | head -1)
CACHED_S2=$(find "output/Step 2" -name "*${SLUG}*-\[step-2\].csv" -not -name "*-only-*" -mmin "-${CACHE_TTL_MIN}" 2>/dev/null | head -1)
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
# Tier 2 batched-deploy queue (locked 2026-05-27) — collect slugs to deploy
# to Netlify in a single end-of-run action instead of per-lead.
PENDING_DEPLOY_SLUGS=()
PENDING_DEPLOY_NAMES=()

# ============================================================
# Tier 2 #7 (locked 2026-05-27) — CROSS-LEAD WORKER POOL infrastructure
# ============================================================
# Default WORKER_COUNT=1 preserves the legacy sequential behavior exactly.
# Set WORKER_COUNT=3 (or other N) to enable N parallel workers, each running
# the per-lead chain on a separate lead concurrently. Cuts wall time roughly
# in half (was 4hr after within-lead parallelism, target ~2hr with 3 workers).
#
# Each worker uses its own Chrome user-data-dir (output/chrome-profile-step3-wN)
# so step-3 + step-2.5 puppeteer instances don't lock-contend.
#
# State aggregation: bash subshells can't modify parent-scope arrays, so each
# worker writes per-lead results to O_APPEND-atomic /tmp files. After all
# workers finish, the main process reads these back into the existing
# DEPLOYED_URLS / FAILED_LEADS / PENDING_DEPLOY_* arrays for end-of-run
# report + batched deploy.
WORKER_COUNT="${WORKER_COUNT:-1}"
# Per-lead wall-time watchdog (locked 2026-06-01) — if any lead's full
# pipeline exceeds PER_LEAD_TIMEOUT_MIN, kill the lead's processes + mark
# failed + move to the next lead. Saves the elapsed time for human audit.
# WC=2 average is ~6 min/lead; 8 min = 30% margin. Anything beyond that
# is a real hang (stuck site, zombie browser, ffmpeg deadlock).
# Set PER_LEAD_TIMEOUT_MIN=0 to disable watchdog entirely.
# Memory: feedback_per_lead_wall_time_watchdog.md.
PER_LEAD_TIMEOUT_MIN="${PER_LEAD_TIMEOUT_MIN:-8}"
PER_LEAD_TIMEOUT_SEC=$(( PER_LEAD_TIMEOUT_MIN * 60 ))
# Failure audit file — one row per timed-out or failed lead so Chris can
# spot-check quickly in the morning instead of re-running blind.
FAILURE_AUDIT="/tmp/overnight-failures-${DATE_STAMP}.md"
if [ ! -f "$FAILURE_AUDIT" ]; then
  echo "# Overnight failures audit — ${DATE_STAMP}" > "$FAILURE_AUDIT"
  echo "" >> "$FAILURE_AUDIT"
  echo "One row per failed/timed-out lead. Open the linked log line for the full stack." >> "$FAILURE_AUDIT"
  echo "" >> "$FAILURE_AUDIT"
  echo "| Time | Lead | Worker | Reason | Elapsed |" >> "$FAILURE_AUDIT"
  echo "|---|---|---|---|---|" >> "$FAILURE_AUDIT"
fi
RESULTS_DIR="/tmp/overnight-results-$$"
mkdir -p "$RESULTS_DIR"
RESULTS_DEPLOYED="$RESULTS_DIR/deployed.txt"
RESULTS_FAILED="$RESULTS_DIR/failed.txt"
RESULTS_PENDING_SLUGS="$RESULTS_DIR/pending-slugs.txt"
RESULTS_PENDING_NAMES="$RESULTS_DIR/pending-names.txt"
: > "$RESULTS_DEPLOYED"
: > "$RESULTS_FAILED"
: > "$RESULTS_PENDING_SLUGS"
: > "$RESULTS_PENDING_NAMES"
# Cleanup state files on exit (success or failure)
trap 'rm -rf "$RESULTS_DIR" 2>/dev/null' EXIT

# Helper: append a line to a shared results file. macOS doesn't ship with
# `flock`, but bash's `>>` uses O_APPEND which the kernel guarantees atomic
# for writes < PIPE_BUF (4096 bytes on macOS+Linux). All our lines are short
# (business name + URL or reason, well under 4KB), so concurrent appends
# from N workers are safe without an external lock.
# See: write(2) POSIX spec — "If the O_APPEND flag of the file status flags
# is set, the file offset shall be set to the end of the file prior to each
# write, and all writes shall complete atomically with respect to each other."
append_result() {
  local file="$1"; shift
  local line="$*"
  printf '%s\n' "$line" >> "$file"
}

python3 <<EOPY > /tmp/emailable_leads.txt
import csv
with open("$LATEST_S2") as f:
    for r in csv.DictReader(f):
        email = (r.get('email','') or '').strip()
        if email and '@' in email and not email.startswith('user@') and not email.endswith('.our'):
            print(f"{r['Business Name']}")
EOPY

# 2026-06-11: optional MAX_LEADS cap for sample/test runs (e.g. MAX_LEADS=5).
# Caps the emailable list to the first N leads so quality can be validated before
# committing to a full batch. Unset = process ALL emailable leads (default).
if [ -n "${MAX_LEADS:-}" ]; then
  head -n "$MAX_LEADS" /tmp/emailable_leads.txt > /tmp/emailable_leads.capped.txt \
    && mv /tmp/emailable_leads.capped.txt /tmp/emailable_leads.txt
  echo ">>> MAX_LEADS=$MAX_LEADS — sample run, capped to first $MAX_LEADS emailable leads" | tee -a "$LOGFILE"
fi

echo "" | tee -a "$LOGFILE"
echo ">>> Emailable leads to process:" | tee -a "$LOGFILE"
cat /tmp/emailable_leads.txt | tee -a "$LOGFILE"
echo "" | tee -a "$LOGFILE"

# ============================================================
# Per-lead processing function (Tier 2 #7 — locked 2026-05-27)
# Called either sequentially (WORKER_COUNT=1) or by N parallel workers.
#
# Inputs:
#   $1 = BIZ_NAME — the business name from emailable_leads.txt
#   $2 = WORKER_ID (1..N) — used to pick a unique Chrome profile dir
#
# Outputs (via O_APPEND-atomic file appends):
#   $RESULTS_DEPLOYED, $RESULTS_FAILED, $RESULTS_PENDING_SLUGS/_NAMES
#
# Uses 'return 0' (not 'continue') for skip paths since we're in a function.
# Inherits LATEST_S1/LATEST_S2/DATE_STAMP/LOGFILE etc. from outer scope
# via bash's dynamic-scope lookup.
# ============================================================
process_one_lead() {
  local BIZ_NAME="$1"
  local WORKER_ID="${2:-1}"
  # Per-worker Chrome profile dir — only override when running parallel.
  # WORKER_COUNT=1 keeps the legacy default (env var unset → step-3 falls
  # back to the hardcoded output/chrome-profile-step3).
  if [ "$WORKER_COUNT" != "1" ]; then
    export CHROME_PROFILE_DIR="$(pwd)/output/chrome-profile-step3-w${WORKER_ID}"
  fi
  [ -z "$BIZ_NAME" ] && return 0

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
  # 2026-05-29: FORCE_RERUN=1 bypasses the idempotency skip-check. Use for
  # comparison tests where we DELIBERATELY want to re-render already-deployed
  # leads (e.g., WC=2 vs WC=3 quality comparison).
  if [ "${FORCE_RERUN:-0}" = "1" ]; then
    echo ">>> FORCE_RERUN=1 — bypassing idempotency check, will re-render every lead" | tee -a "$LOGFILE"
    CHECK_RESULT="NO"
  else
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
  fi  # end FORCE_RERUN bypass
  if [ "$CHECK_RESULT" = "DEPLOYED" ]; then
    echo "" | tee -a "$LOGFILE"
    echo ">>> SKIP (already in Airtable with Video URL): $BIZ_NAME" | tee -a "$LOGFILE"
    return 0
  fi
  if [ "$CHECK_RESULT" = "PERMA_FAIL" ]; then
    echo "" | tee -a "$LOGFILE"
    echo ">>> SKIP (Email Status=build-failed — permanently retired after N landing-not-built attempts): $BIZ_NAME" | tee -a "$LOGFILE"
    return 0
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
    return 0
  fi

  echo "" | tee -a "$LOGFILE"
  echo "============================================" | tee -a "$LOGFILE"
  echo ">>> Processing: $BIZ_NAME" | tee -a "$LOGFILE"
  echo "============================================" | tee -a "$LOGFILE"

  # Filter to single-lead CSV
  # 2026-05-28 SLUG FIX: must match slugify(name, {strict:true}) used by
  # step-3/6/7/build-video-landing — otherwise the per-lead directory uses one
  # slug while the MP4 filename + Airtable Video URL use a different one.
  # Caught 2026-05-28 on "Royal Moving & Storage Marina Del Rey" — bash dir
  # used "royal-moving-storage..." (& dropped), slugify used "royal-moving-and-
  # storage..." (& → "and"). Airtable URL pointed to slugify slug, but the
  # build-video-landing source-lookup failed → silent miss → no v/ subdir
  # deployed to website → recipient saw RGA homepage fallback.
  # Fix: substitute '&' with ' and ' BEFORE the sed pass so both paths produce
  # the same slug. Note: keep cut -c1-40 to bound directory name length.
  BIZ_SLUG=$(echo "$BIZ_NAME" | sed 's/&/ and /g' | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//' | cut -c1-40)
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

  # ============================================================
  # WITHIN-LEAD DAG PARALLELIZATION (Tier 2.5 locked 2026-05-27)
  # ============================================================
  # Original sequential chain: step-2.5 → step-3 → step-6 → step-4 → step-5
  # → step-6b → step-7 = ~320s critical path. Most of those have independent
  # inputs.
  #
  # Actual dependency graph:
  #   step-2.5 (audit) → step-6 (voiceover, needs audit-findings.json)
  #   step-3 (record)  → step-4 (combine, needs WebMs)
  #   step-6 → step-6b (subtitles, needs voiceover MP3)
  #   step-4 → step-5 (branding, needs combined.mp4 + step-6 manifest)
  #   step-6 → step-5 (branding, needs intro audio length from manifest)
  #   step-5 + step-6 + step-6b → step-7 (merge)
  #
  # Optimal scheduling:
  #   level 0: step-2.5 || step-3                                  (parallel)
  #   level 1: step-6 (after 2.5)   ||  step-4 (after 3)           (parallel)
  #   level 2: step-5 (after 4 + 6) ||  step-6b (after 6)          (parallel)
  #   level 3: step-7 (after 5 + 6 + 6b)                           (single)
  #
  # New critical path ≈ 120s + 30s + 30s + 15s = ~195s (vs 320s sequential).
  # Saves ~125s/lead × 30 deployed = ~62 min/run.
  #
  # Risk: 2 Chrome instances (step-2.5 + step-3) + ffmpeg overlap may stress
  # smaller Macs. Each step uses a different user-data-dir so they don't
  # collide. Set SERIAL_STEPS=1 env var to fall back to sequential if
  # parallelism causes issues.
  # Tier 2 (locked 2026-05-27) — Skip step-2.5 audit if a fresh
  # audit-findings.json (<24h) already exists for this lead's slug. The audit
  # pulls GBP data which is stable on the scale of hours; re-auditing burns
  # ~60-90s/lead. The audit output dir is named after the filtered Step 2
  # CSV basename (e.g., output/Step 2.5 (Audit)/2026-05-26_<biz-slug>-only-
  # <search>-[step-2]/audit-findings.json).
  AUDIT_CACHE_TTL_MIN="${AUDIT_CACHE_TTL_MIN:-1440}"  # 24 hr default
  # 2026-05-27: avoid bash glob char-class interpretation of `[step-2]` by
  # searching from the audit root and filtering by directory name.
  CACHED_AUDIT=$(find "output/Step 2.5 (Audit)" -maxdepth 2 -name "audit-findings.json" -path "*${DATE_STAMP}_${BIZ_SLUG}-only-*" -mmin "-${AUDIT_CACHE_TTL_MIN}" 2>/dev/null | head -1)
  AUDIT_SKIP=""
  if [ -n "$CACHED_AUDIT" ]; then
    AUDIT_SKIP="1"
    echo "  [audit-cache HIT] reusing $CACHED_AUDIT (< ${AUDIT_CACHE_TTL_MIN}min old)" | tee -a "$LOGFILE"
  fi

  # 2026-05-27 CRITICAL BUGFIX: step-2.5 and step-3 both default to
  # CHROME_PROFILE_DIR (inherited from the worker-level export at line ~208,
  # `output/chrome-profile-step3-wN`). When they launch in parallel on the
  # SAME lead, BOTH Chrome instances try to lock the same user-data-dir.
  # Puppeteer's losing process silently fails (no findings.json written),
  # which lets step-6 voiceover run with verified=false on all signals,
  # so every absence-finding gate skips → the voiceover loses ~50% of its
  # content → final video is 1:24 instead of ~2:30. Give step-2.5 its own
  # profile dir so the two browsers don't fight.
  STEP25_PROFILE_DIR="$(pwd)/output/chrome-profile-step25-w${WORKER_ID:-1}"
  if [ "${SERIAL_STEPS:-}" = "1" ]; then
    # Legacy sequential path — kept for emergency fallback
    [ -z "$AUDIT_SKIP" ] && CHROME_PROFILE_DIR="$STEP25_PROFILE_DIR" STEP2_CSV="$S2_FILTERED" node step-2.5-audit.mjs 2>&1 | tee -a "$LOGFILE" | tail -2
    STEP2_CSV="$S2_FILTERED" MAX_VIDEOS=1 node step-3-video-recorder.mjs 2>&1 | tee -a "$LOGFILE" | tail -2
  else
    # Level 0: step-2.5 || step-3 (both read only from $S2_FILTERED, no conflict)
    if [ -z "$AUDIT_SKIP" ]; then
      echo "  >> level-0 parallel: step-2.5 audit || step-3 video" | tee -a "$LOGFILE"
      ( CHROME_PROFILE_DIR="$STEP25_PROFILE_DIR" STEP2_CSV="$S2_FILTERED" node step-2.5-audit.mjs 2>&1 | tee -a "$LOGFILE" | tail -2 ) &
      PID_25=$!
      ( STEP2_CSV="$S2_FILTERED" MAX_VIDEOS=1 node step-3-video-recorder.mjs 2>&1 | tee -a "$LOGFILE" | tail -2 ) &
      PID_3=$!
      wait $PID_25 $PID_3
    else
      # Audit cached — only run step-3
      echo "  >> level-0: step-2.5 skipped (cached), running step-3 video alone" | tee -a "$LOGFILE"
      STEP2_CSV="$S2_FILTERED" MAX_VIDEOS=1 node step-3-video-recorder.mjs 2>&1 | tee -a "$LOGFILE" | tail -2
    fi
  fi

  # Tier 2 #9 fast-fail (locked 2026-05-27) — root cause of "landing not built"
  # is step-3 producing INCOMPLETE WebMs (e.g., Maps recording succeeds but
  # Website + Mobile recordings silently fail for leads with bot-blocking
  # sites). Without this guard, the pipeline burns ~5 min running step-4/5/6/
  # 6b/7 on empty input. Check that step-3 produced all 3 expected WebM files
  # before continuing the chain. If not, fail fast.
  # 2026-05-27 BUGFIX: the original glob suffix `-[step-2]` was being parsed
  # as a bash character class (any of {s,t,e,p,-,2}) — so it never matched the
  # literal directory suffix `[step-2]`. STEP3_DIR was always empty, so
  # WEBM_COUNT was always 0, so this fast-fail incorrectly tripped on every
  # lead. Switch to `find` which does NOT do shell glob expansion on its -path
  # argument, and match by the unique `-only-` middle marker instead of the
  # bracketed suffix. Note the literal `[step-2]` directly in the find -path
  # is also a glob, so we drop it.
  STEP3_DIR=$(find "output/Step 3 (Video Recorder - Raw WebM)" -maxdepth 1 -type d -name "${DATE_STAMP}_${BIZ_SLUG}-only-*" 2>/dev/null | head -1)
  if [ -n "$STEP3_DIR" ]; then
    WEBM_COUNT=$(find "$STEP3_DIR" -maxdepth 1 -type f -name "*.webm" -size +0c 2>/dev/null | wc -l | tr -d ' ')
  else
    WEBM_COUNT=0
  fi
  if [ "$WEBM_COUNT" -lt 3 ]; then
    echo "" | tee -a "$LOGFILE"
    echo ">>> step-3 produced only ${WEBM_COUNT}/3 WebMs (website or mobile recording failed — likely bot-blocked site)" | tee -a "$LOGFILE"
    append_result "$RESULTS_FAILED" "$BIZ_NAME|step-3 incomplete (${WEBM_COUNT}/3 WebMs)"
    echo "  ✗ FAILED: $BIZ_NAME — landing not built" | tee -a "$LOGFILE"
    return 0
  fi

  if [ "${SERIAL_STEPS:-}" = "1" ]; then
    STEP2_CSV="$S2_FILTERED" node step-6-voiceover.mjs 2>&1 | tee -a "$LOGFILE" | tail -5
    STEP2_CSV="$S2_FILTERED" MAX_COMBINES=1 node step-4-combine-desktop-mobile.mjs 2>&1 | tee -a "$LOGFILE" | tail -1
    STEP2_CSV="$S2_FILTERED" MAX_BRANDS=1 node step-5-branding.mjs 2>&1 | tee -a "$LOGFILE" | tail -1
    STEP2_CSV="$S2_FILTERED" MAX_RECORDINGS=1 node step-6b-subtitles.mjs 2>&1 | tee -a "$LOGFILE" | tail -1
    STEP2_CSV="$S2_FILTERED" MAX_MERGES=1 node step-7-merge-branded-audio.mjs 2>&1 | tee -a "$LOGFILE" | tail -1
  else
    # 2026-05-27 A/V SYNC FIX: step-4 (combine) MUST run AFTER step-6 (voice-
    # over). Step-4 reads step-6's audio manifest to determine per-segment
    # durations (intro/maps/website/mobile/outro) and trims each WebM to match
    # its corresponding voiceover length. Without strict sync, step-4 falls
    # into the "no-manifest concat" path which uses the natural WebM duration
    # — that produces audio bleed across video segment boundaries (maps voice
    # bleeds into website video, mobile voice bleeds into outro). Chris caught
    # this on New Systems v5. The ~30s parallelism win is not worth the A/V
    # desync. Make level-1 sequential.
    echo "  >> level-1 sequential: step-6 voiceover → step-4 combine (strict A/V sync)" | tee -a "$LOGFILE"
    STEP2_CSV="$S2_FILTERED" node step-6-voiceover.mjs 2>&1 | tee -a "$LOGFILE" | tail -5
    STEP2_CSV="$S2_FILTERED" MAX_COMBINES=1 node step-4-combine-desktop-mobile.mjs 2>&1 | tee -a "$LOGFILE" | tail -1

    # Level 2: step-5 (needs step-4 + step-6) || step-6b (needs step-6)
    echo "  >> level-2 parallel: step-5 branding || step-6b subtitles" | tee -a "$LOGFILE"
    ( STEP2_CSV="$S2_FILTERED" MAX_BRANDS=1 node step-5-branding.mjs 2>&1 | tee -a "$LOGFILE" | tail -1 ) &
    PID_5=$!
    ( STEP2_CSV="$S2_FILTERED" MAX_RECORDINGS=1 node step-6b-subtitles.mjs 2>&1 | tee -a "$LOGFILE" | tail -1 ) &
    PID_6b=$!
    wait $PID_5 $PID_6b

    # Level 3: step-7 (final merge — needs everything above)
    STEP2_CSV="$S2_FILTERED" MAX_MERGES=1 node step-7-merge-branded-audio.mjs 2>&1 | tee -a "$LOGFILE" | tail -1
  fi

  # Tier 1 #1 (locked 2026-05-27): scope build-video-landing to JUST this lead's
  # slug. The slug must match what step-7's MP4 filename contains, which is
  # `slugify(BusinessName, {strict:true})` — bash equivalents drift (e.g., `&`
  # → `-` in bash but `-and-` in slugify, unicode handling differs). Safest:
  # READ the actual Step 7 MP4 filename and extract the slug from it. If
  # step-7 didn't produce an MP4, BUILD_ONLY_SLUG falls back to empty →
  # legacy behavior preserved.
  STEP7_MP4=$(ls -t "output/Step 7 (Final Merge MP4)/${DATE_STAMP}_${BIZ_SLUG}-only-"*"-[step-2]"/*.mp4 2>/dev/null | head -1)
  if [ -n "$STEP7_MP4" ]; then
    BUILD_SLUG=$(basename "$STEP7_MP4" .mp4 | sed 's/^[0-9]*_//')
    echo "  Tier 1 #1: scoping landing build to slug=${BUILD_SLUG}" | tee -a "$LOGFILE"
  else
    BUILD_SLUG=""
  fi

  # Build landing (scoped if we discovered a slug, otherwise legacy iterate-all)
  BUILD_ONLY_SLUG="$BUILD_SLUG" node build-video-landing.mjs 2>&1 | tee -a "$LOGFILE" | grep -i "${BUILD_SLUG:-$BIZ_SLUG}" | head -1

  # Find the deployed slug
  DEPLOY_SLUG=$(BUILD_ONLY_SLUG="$BUILD_SLUG" node build-video-landing.mjs 2>&1 | grep -oE "/v/[a-z0-9-]+/ →" | head -1 | sed 's|/v/||;s|/.*||')

  # 2026-05-28 BUG FIX: this used to derive its own SLUG_PATTERN from BIZ_NAME
  # (dropping '&' entirely) then fuzzy-grep the first 10 chars to find a
  # directory in output/landing-pages/v/. For names sharing a prefix with
  # another deployed lead (e.g. "Royal Moving & Storage Marina Del Rey" vs
  # "Royal Moving & Storage Culver City"), grep returned BOTH directories
  # and `head -1` picked the wrong one alphabetically. Result: Marina Del
  # Rey content rsync'd into Culver City's directory, overwriting Culver
  # City's index.html. Marina Del Rey's actual dir was never deployed.
  #
  # Fix: prefer an EXACT match against the build-video-landing slug
  # (BUILD_SLUG, parsed from the Step 7 MP4 filename earlier). Fall back to
  # BIZ_SLUG (now identical to slugify after the f2966dc fix). Both produce
  # the slugify-equivalent slug with '&' → 'and'.
  if [ -n "$BUILD_SLUG" ] && [ -d "output/landing-pages/v/$BUILD_SLUG" ]; then
    ACTUAL_SLUG="$BUILD_SLUG"
  elif [ -d "output/landing-pages/v/$BIZ_SLUG" ]; then
    ACTUAL_SLUG="$BIZ_SLUG"
  else
    ACTUAL_SLUG=""
  fi

  if [ -n "$ACTUAL_SLUG" ] && [ -d "output/landing-pages/v/$ACTUAL_SLUG" ]; then
    # Per-lead: rsync landing page contents into the website repo. Defer the
    # netlify deploy + git commit to ONE batched action at end-of-run (Tier 2
    # locked 2026-05-27). Per-lead deploy was ~30s × N leads = ~15 min wasted
    # per 48-lead run on duplicate Netlify CDN propagation. Batch deploy =
    # ~1 min total. Per-lead git commits are still slow (verification-gate
    # hooks run on each), so we batch those too.
    DST="$WEBSITE_DIR/v/$ACTUAL_SLUG"
    mkdir -p "$DST"
    rsync -a --delete "output/landing-pages/v/$ACTUAL_SLUG/" "$DST/"
    append_result "$RESULTS_PENDING_SLUGS" "$ACTUAL_SLUG"
    append_result "$RESULTS_PENDING_NAMES" "$BIZ_NAME"

    # step-8 publish to Airtable — keep per-lead so the lead immediately
    # becomes eligible for tomorrow's 7am cron. Cheap (~3s/lead).
    STEP2_CSV="$S2_FILTERED" node step-8-publish-to-airtable.mjs 2>&1 | tee -a "$LOGFILE" | tail -2
    # Re-run build-video-landing to patch the Lead's Video URL with the live
    # URL (this writes to Airtable, not Netlify) — scoped via BUILD_ONLY_SLUG
    BUILD_ONLY_SLUG="$BUILD_SLUG" node build-video-landing.mjs 2>&1 | tee -a "$LOGFILE" | grep -i "$ACTUAL_SLUG" | head -1

    append_result "$RESULTS_DEPLOYED" "$BIZ_NAME|https://www.rocketgrowthagency.com/v/$ACTUAL_SLUG/"
    echo "  ✓ STAGED: $BIZ_NAME (deploy batched to end-of-run)" | tee -a "$LOGFILE"
    echo "  ✓ DEPLOYED: $BIZ_NAME" | tee -a "$LOGFILE"  # keep marker for grep idempotency
  else
    append_result "$RESULTS_FAILED" "$BIZ_NAME|landing page not built"
    echo "  ✗ FAILED: $BIZ_NAME — landing not built" | tee -a "$LOGFILE"
  fi
}  # end process_one_lead

# ============================================================
# DISPATCHER — sequential (WORKER_COUNT=1) or parallel worker pool (>1)
# ============================================================
if [ "$WORKER_COUNT" = "1" ]; then
  # Legacy sequential mode — preserves exact pre-Tier-2-#7 behavior
  while IFS= read -r BIZ_NAME; do
    [ -z "$BIZ_NAME" ] && continue
    process_one_lead "$BIZ_NAME" 1
  done < /tmp/emailable_leads.txt
else
  echo "" | tee -a "$LOGFILE"
  echo ">>> PARALLEL MODE — ${WORKER_COUNT} workers (Tier 2 #7)" | tee -a "$LOGFILE"
  echo "" | tee -a "$LOGFILE"
  # bash 3.2 has no `wait -n`; use poll-based PID tracking.
  WORKER_PIDS=()
  WORKER_IDS_IN_USE=()
  WORKER_START_TIMES=()
  WORKER_BIZ_NAMES=()
  # 2026-06-01 — per-worker watchdog. If a worker exceeds PER_LEAD_TIMEOUT_SEC,
  # kill its process tree + log a failure-audit row + free the slot for the
  # next lead. Locked memory: feedback_per_lead_wall_time_watchdog.md.
  reap_finished_workers() {
    local i NEW_PIDS=() NEW_IDS=() NEW_STARTS=() NEW_BIZ=()
    local now=$(date +%s)
    for i in $(seq 0 $((${#WORKER_PIDS[@]} - 1))); do
      local pid="${WORKER_PIDS[$i]}"
      local wid="${WORKER_IDS_IN_USE[$i]}"
      local start="${WORKER_START_TIMES[$i]}"
      local biz="${WORKER_BIZ_NAMES[$i]}"
      if kill -0 "$pid" 2>/dev/null; then
        # Still alive. Check watchdog.
        if [ "$PER_LEAD_TIMEOUT_SEC" -gt 0 ] && [ "$(( now - start ))" -gt "$PER_LEAD_TIMEOUT_SEC" ]; then
          local elapsed=$(( now - start ))
          echo ">>> [worker-${wid}] WATCHDOG: $biz exceeded ${PER_LEAD_TIMEOUT_MIN} min (elapsed ${elapsed}s) — killing + skipping" | tee -a "$LOGFILE"
          # Kill the process tree (the per-lead shell + its children)
          pkill -9 -P "$pid" 2>/dev/null
          kill -9 "$pid" 2>/dev/null
          append_result "$RESULTS_FAILED" "$biz|watchdog-timeout (${elapsed}s > ${PER_LEAD_TIMEOUT_SEC}s)"
          printf "| %s | %s | %s | watchdog-timeout | %ds |\n" "$(date '+%H:%M:%S')" "$biz" "$wid" "$elapsed" >> "$FAILURE_AUDIT"
          continue  # don't carry forward, slot is free
        fi
        NEW_PIDS+=("$pid")
        NEW_IDS+=("$wid")
        NEW_STARTS+=("$start")
        NEW_BIZ+=("$biz")
      fi
    done
    WORKER_PIDS=("${NEW_PIDS[@]+"${NEW_PIDS[@]}"}")
    WORKER_IDS_IN_USE=("${NEW_IDS[@]+"${NEW_IDS[@]}"}")
    WORKER_START_TIMES=("${NEW_STARTS[@]+"${NEW_STARTS[@]}"}")
    WORKER_BIZ_NAMES=("${NEW_BIZ[@]+"${NEW_BIZ[@]}"}")
  }
  find_free_worker_id() {
    local candidate u
    for candidate in $(seq 1 "$WORKER_COUNT"); do
      local USED=0
      for u in "${WORKER_IDS_IN_USE[@]+"${WORKER_IDS_IN_USE[@]}"}"; do
        if [ "$u" = "$candidate" ]; then USED=1; break; fi
      done
      if [ $USED -eq 0 ]; then echo "$candidate"; return; fi
    done
    echo 1  # fallback (shouldn't happen)
  }
  while IFS= read -r BIZ_NAME; do
    [ -z "$BIZ_NAME" ] && continue
    # Block until a worker slot is free
    while [ "${#WORKER_PIDS[@]}" -ge "$WORKER_COUNT" ]; do
      sleep 2
      reap_finished_workers
    done
    NEW_ID=$(find_free_worker_id)
    echo ">>> [worker-${NEW_ID}] dispatching: $BIZ_NAME" | tee -a "$LOGFILE"
    process_one_lead "$BIZ_NAME" "$NEW_ID" &
    WORKER_PIDS+=($!)
    WORKER_IDS_IN_USE+=("$NEW_ID")
    WORKER_START_TIMES+=("$(date +%s)")
    WORKER_BIZ_NAMES+=("$BIZ_NAME")
    # 2026-05-29: stagger worker startup by 20s so the heavy step-3
    # (recording) phases don't all hit the CPU at the same moment under
    # WC=3. Without this, three browsers all enter step-3 within ~5s of
    # each other and the libx264 encoders contend hard. A 20s stagger
    # spreads the encoder peaks across the run.
    # Memory: feedback_worker_count_concurrency_limit.md
    if [ "$WORKER_COUNT" -gt 1 ] && [ "${#WORKER_PIDS[@]}" -lt "$WORKER_COUNT" ]; then
      sleep 20
    fi
  done < /tmp/emailable_leads.txt
  echo "" | tee -a "$LOGFILE"
  echo ">>> Waiting for ${#WORKER_PIDS[@]} remaining worker(s) to finish..." | tee -a "$LOGFILE"
  wait "${WORKER_PIDS[@]+"${WORKER_PIDS[@]}"}"
  echo ">>> All workers complete." | tee -a "$LOGFILE"
fi

# ============================================================
# Aggregate per-worker state files back into the legacy arrays so the
# downstream batched-deploy + report sections (unchanged) continue to work.
# ============================================================
while IFS= read -r line; do [ -n "$line" ] && DEPLOYED_URLS+=("$line"); done < "$RESULTS_DEPLOYED"
while IFS= read -r line; do [ -n "$line" ] && FAILED_LEADS+=("$line"); done < "$RESULTS_FAILED"
while IFS= read -r line; do [ -n "$line" ] && PENDING_DEPLOY_SLUGS+=("$line"); done < "$RESULTS_PENDING_SLUGS"
while IFS= read -r line; do [ -n "$line" ] && PENDING_DEPLOY_NAMES+=("$line"); done < "$RESULTS_PENDING_NAMES"

# === Tier 2 (locked 2026-05-27) — BATCHED end-of-run deploy ===
# Replace per-lead `git commit` + `netlify deploy --prod` (~30s/lead × N) with
# one final git commit + one final netlify deploy. Netlify's CDN
# invalidation/propagation only runs once per deploy, so running it 30x is
# pure waste. Same end-state for the user.
if [ "${#PENDING_DEPLOY_SLUGS[@]+x}" ] && [ ${#PENDING_DEPLOY_SLUGS[@]} -gt 0 ]; then
  echo "" | tee -a "$LOGFILE"
  echo "============================================" | tee -a "$LOGFILE"
  echo ">>> Batched deploy: ${#PENDING_DEPLOY_SLUGS[@]} new landing pages" | tee -a "$LOGFILE"
  echo "============================================" | tee -a "$LOGFILE"
  cd "$WEBSITE_DIR"
  for slug in "${PENDING_DEPLOY_SLUGS[@]}"; do
    git add "v/$slug" 2>&1 | tee -a "$LOGFILE" | tail -2
  done
  COMMIT_MSG="Overnight deploy batch: ${#PENDING_DEPLOY_NAMES[@]} new videos ($(date +%Y-%m-%d))"
  git commit -m "$COMMIT_MSG" 2>&1 | tee -a "$LOGFILE" | tail -3
  # 2026-06-11 (new-Mac takeover): auth netlify non-interactively from the Scraper
  # .env so unattended overnight runs deploy without a ~/.netlify login session.
  # Defensive: keeps any already-exported value, else reads .env, else empty (a Mac
  # authed via `netlify login` falls through to its stored session unchanged).
  export NETLIFY_AUTH_TOKEN="${NETLIFY_AUTH_TOKEN:-$(grep -E '^NETLIFY_AUTH_TOKEN=' "$SCRAPER_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2-)}"
  export NETLIFY_SITE_ID="${NETLIFY_SITE_ID:-$(grep -E '^NETLIFY_SITE_ID=' "$SCRAPER_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2-)}"
  netlify deploy --prod --dir=. 2>&1 | tee -a "$LOGFILE" | grep -E "Production deploy|rocketgrowth|Deployed" | head -3
  cd "$SCRAPER_DIR"
else
  echo "" | tee -a "$LOGFILE"
  echo ">>> No new landing pages to deploy this run" | tee -a "$LOGFILE"
fi

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

# 2026-05-29: end-of-session human-audit report. For each deployed lead,
# dumps the EXACT voiceover text per segment + raw audit signals so Chris
# can spot-check whether the script's claims are accurate when he reviews
# the videos in the morning. Output path is logged so he can open it
# directly. Memory: project_video_master.md § "Recovery playbook".
AUDIT_REPORT="/tmp/audit-report-${DATE_STAMP}-${SLUG}.md"
if node scripts/generate-audit-report.mjs "$DATE_STAMP" "$SLUG" "$AUDIT_REPORT" 2>&1 | tee -a "$LOGFILE"; then
  echo "" >> "$REPORT"
  echo "## Human-audit report (for morning review)" >> "$REPORT"
  echo "- Per-lead voiceover + raw audit signals: \`$AUDIT_REPORT\`" >> "$REPORT"
fi

echo "" | tee -a "$LOGFILE"
echo "=== DONE ===" | tee -a "$LOGFILE"
echo "Report: $REPORT" | tee -a "$LOGFILE"
[ -f "$AUDIT_REPORT" ] && echo "Audit:  $AUDIT_REPORT" | tee -a "$LOGFILE"
cat "$REPORT" | tee -a "$LOGFILE"
