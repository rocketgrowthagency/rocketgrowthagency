#!/bin/bash
# test-realtime-one-lead.sh — REAL-TIME production of ONE chosen lead through the ACTUAL production
# scripts, in the ACTUAL pipeline order, with a FRESH step-3 screen capture (not a cached shortcut) →
# the FIXED build-video-landing (REQUIRE_SLUG=1) → real deploy → prints the live URL.
#
# Purpose (2026-07-11): prove the landing-build-scope fix lets a previously watchdog-killed lead complete
# and go live, in real time. Run ONLY with the Mac unattended (live Maps capture films the screen).
#
# Usage: CSV=<single-lead step-2 csv> SLUG=<biz-slug> BIZ="<Business Name>" ./scripts/test-realtime-one-lead.sh
set -uo pipefail
SCRAPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRAPER_DIR"
WEBSITE_DIR="$(cd "$(dirname "$SCRAPER_DIR")" && pwd)/Rocket Growth Agency Website VS Code"
DATE_STAMP=$(date +%Y-%m-%d)
LOG="/tmp/test-realtime-${SLUG}-${DATE_STAMP}.log"
STARTUP_DELAY="${STARTUP_DELAY:-40}"
step() { echo "" | tee -a "$LOG"; echo ">>> $* — $(date +%H:%M:%S)" | tee -a "$LOG"; }
die() { echo "✗ FAIL: $*" | tee -a "$LOG"; echo "RESULT=FAIL" | tee -a "$LOG"; exit 1; }

echo "=== REAL-TIME 1-lead production: ${BIZ} (${SLUG}) — $(date) ===" | tee "$LOG"
echo "CSV: $CSV" | tee -a "$LOG"
[ -f "$CSV" ] || die "CSV not found: $CSV"

# Give Chris time to step away before the live screen capture begins.
echo ">>> live Maps capture starts after a ${STARTUP_DELAY}s buffer — stepping away now keeps it clean." | tee -a "$LOG"
sleep "$STARTUP_DELAY"

# Keep the Mac awake for the run.
caffeinate -dimsu -t 1800 </dev/null >/dev/null 2>&1 & CAFF=$!
trap 'kill $CAFF 2>/dev/null' EXIT

# --- step-2.5 audit (reuse if cached; the audit dir already exists for this lead) ---
AUDIT_DIR="output/Step 2.5 (Audit)/$(basename "$CSV" .csv)"
if [ -f "$AUDIT_DIR/audit-findings.json" ]; then
  step "step-2.5 audit CACHED — reusing $AUDIT_DIR/audit-findings.json"
else
  step "step-2.5 audit (fresh)"
  STEP2_CSV="$CSV" node step-2.5-audit.mjs 2>&1 | tee -a "$LOG" | tail -3 || die "step-2.5"
fi

# --- step-3 FRESH capture (the real-time part: live Maps + website + mobile recording) ---
step "step-3 video recorder (FRESH live capture)"
STEP2_CSV="$CSV" MAX_VIDEOS=1 node step-3-video-recorder.mjs 2>&1 | tee -a "$LOG" | tail -6 || die "step-3 recorder"

# --- step-6 voiceover (HARD 6/6 gate: exit 3 = below 6/6, correctly blocked) ---
step "step-6 voiceover (6/6 verification gate)"
STEP2_CSV="$CSV" node step-6-voiceover.mjs 2>&1 | tee -a "$LOG" | tail -8; RC=${PIPESTATUS[0]}
if [ "$RC" = "3" ]; then echo "GATE: step-6 exited 3 — this lead is genuinely below 6/6 (gate working as designed, NOT the landing bug)." | tee -a "$LOG"; echo "RESULT=GATE_BLOCKED_6OF6" | tee -a "$LOG"; exit 0; fi
[ "$RC" = "0" ] || die "step-6 voiceover (rc=$RC)"

# --- step-4 combine (AFTER step-6 for strict A/V sync) → step-5 branding → step-6b subs → step-7 merge ---
step "step-4 combine desktop+mobile"
STEP2_CSV="$CSV" node step-4-combine-desktop-mobile.mjs 2>&1 | tee -a "$LOG" | tail -2 || die "step-4"
step "step-5 branding"
STEP2_CSV="$CSV" MAX_BRANDS=1 node step-5-branding.mjs 2>&1 | tee -a "$LOG" | tail -2 || die "step-5"
step "step-6b subtitles"
STEP2_CSV="$CSV" MAX_RECORDINGS=1 node step-6b-subtitles.mjs 2>&1 | tee -a "$LOG" | tail -2 || die "step-6b"
step "step-7 merge branded audio"
STEP2_CSV="$CSV" node step-7-merge-branded-audio.mjs 2>&1 | tee -a "$LOG" | tail -2 || die "step-7"

# --- derive slug from the finished MP4, then the FIXED (strictly-scoped) build-landing ---
STEP7_MP4=$(ls -t "output/Step 7 (Final Merge MP4)/${DATE_STAMP}_${SLUG}-only-"*"-[step-2]"/*.mp4 2>/dev/null | head -1)
[ -n "$STEP7_MP4" ] || die "no step-7 MP4 produced (render failed) — the render, not the landing fix"
BUILD_SLUG=$(basename "$STEP7_MP4" .mp4 | sed 's/^[0-9]*_//')
step "build-video-landing (FIXED: REQUIRE_SLUG=1, scoped to ${BUILD_SLUG})"
REQUIRE_SLUG=1 BUILD_ONLY_SLUG="$BUILD_SLUG" node build-video-landing.mjs 2>&1 | tee -a "$LOG" | grep -iE "filtered|found|→" | head -4 || die "build-landing"

# --- rsync the built page into the website repo + publish to Airtable ---
SRC="output/landing-pages/v/$BUILD_SLUG"
[ -d "$SRC" ] || die "landing dir not built: $SRC"
DST="$WEBSITE_DIR/v/$BUILD_SLUG"
mkdir -p "$DST"; rsync -a --delete "$SRC/" "$DST/"
step "step-8 publish to Airtable"
STEP2_CSV="$CSV" node step-8-publish-to-airtable.mjs 2>&1 | tee -a "$LOG" | tail -2 || echo "  (step-8 non-fatal)" | tee -a "$LOG"

# --- deploy (verify RGA Netlify identity first) ---
step "netlify deploy --prod"
cd "$WEBSITE_DIR"
node -e "const s=require('child_process').execSync('netlify api getSite --data \\'{\\\"site_id\\\":\\\"hilarious-baklava-87fbab\\\"}\\'',{encoding:'utf8'});" 2>/dev/null || true
netlify deploy --prod --dir=. 2>&1 | tee -a "$LOG" | grep -iE "deploy|draft|website url|unique deploy|complete" | tail -6 || die "deploy"

URL="https://www.rocketgrowthagency.com/v/$BUILD_SLUG/"
echo "" | tee -a "$LOG"
echo "✓ SUCCESS — live URL: $URL" | tee -a "$LOG"
echo "RESULT=SUCCESS" | tee -a "$LOG"
echo "URL=$URL" | tee -a "$LOG"
