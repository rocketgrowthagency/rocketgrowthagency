#!/usr/bin/env bash
# auto-resume-production.sh — lift the 2026-08-25 production pause AUTOMATICALLY, when it is safe.
#
# ─── WHY (2026-09-02) ─────────────────────────────────────────────────────────────────────────────
# The pause was correct and is still correct. But removing it was a MANUAL step waiting on a human to
# notice a condition had cleared — and a manual step nobody is watching is how a pause outlives its
# reason. Chris's standing rule is that the system runs itself.
#
# So this checks EVERY condition the flag file itself lists, plus the restart checklist, and removes
# the flag only when all of them are green. Otherwise it says which one is blocking and changes
# nothing.
#
# 🔴 IT IS DELIBERATELY CONSERVATIVE. Any check that cannot be determined counts as BLOCKING, never
# as clear. Resuming production on an unverified assumption is exactly the failure the pause exists
# to prevent — and the cost of waiting one more night is nothing.
#
# 🔑 On resume it writes output/RESUME-FIRST-NIGHT, which the flag's own checklist requires: ONE
# category the first night, then read the per-category table before scaling back up.
#
#   bash scripts/auto-resume-production.sh            # check, and resume if safe
#   bash scripts/auto-resume-production.sh --dry-run  # never removes the flag
#
# Exit 0 = flag removed OR correctly still paused · 1 = something is wrong · 2 = could not determine.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" || { echo "✗ cannot enter scraper repo"; exit 2; }

DRY=0; [ "${1:-}" = "--dry-run" ] && DRY=1
FLAG="output/PRODUCTION-PAUSED"
BLOCKERS=()
note() { printf "  %-42s %s\n" "$1" "$2"; }

echo
echo "═══ AUTO-RESUME CHECK — $(date '+%Y-%m-%d %H:%M %Z') ═══"
echo

if [ ! -f "$FLAG" ]; then
  echo "  ℹ️  No PRODUCTION-PAUSED flag — production is already running. Nothing to do."
  exit 0
fi
echo "  flag age: $(( ( $(date +%s) - $(stat -f %m "$FLAG") ) / 86400 )) day(s)"
echo

# ── 1. THE condition the flag itself names: the send queue must be drained ────────────────────────
node scripts/check-send-queue-drained.mjs >/tmp/ar_queue.txt 2>&1; QRC=$?
QLEFT=$(grep -oE 'QUEUED +[0-9]+' /tmp/ar_queue.txt | grep -oE '[0-9]+' | head -1)
if [ "$QRC" -eq 0 ]; then note "send queue drained" "✅ 0 left"
elif [ "$QRC" -eq 1 ]; then note "send queue drained" "⏳ ${QLEFT:-?} still queued"; BLOCKERS+=("queue: ${QLEFT:-?} still to send")
else note "send queue drained" "⚠️ could not determine"; BLOCKERS+=("queue: INDETERMINATE"); fi

# ── 2. The governor must actually want to scrape ──────────────────────────────────────────────────
node scripts/check-resume-production.mjs >/tmp/ar_gov.txt 2>&1
REC=$(grep -oE 'RECOMMEND_SEARCHES=[0-9]+' /tmp/ar_gov.txt | grep -oE '[0-9]+' | head -1)
GOVWHY=$(grep -oE 'STAY-PAUSED[^,]*' /tmp/ar_gov.txt | head -1 | cut -c1-90)
if [ "${REC:-0}" -gt 0 ]; then note "governor recommends scraping" "✅ ${REC} search(es)"
else note "governor recommends scraping" "⏳ 0 — ${GOVWHY:-holding}"; BLOCKERS+=("governor: recommends 0 searches"); fi

# ── 3. SerpApi must be topped up (the run ABORTS below 100) ───────────────────────────────────────
SERP=$(node -e '
require("dotenv").config();
(async()=>{try{
const r=await fetch(`https://serpapi.com/account?api_key=${process.env.SERPAPI_KEY||process.env.SERP_API_KEY}`);
const j=await r.json();console.log(j.total_searches_left??j.plan_searches_left??"?");}catch(e){console.log("?")}})()' 2>/dev/null | tail -1)
if [ "$SERP" = "?" ] || [ -z "$SERP" ]; then note "SerpApi searches left" "⚠️ could not read"; BLOCKERS+=("serpapi: INDETERMINATE")
elif [ "$SERP" -ge 300 ] 2>/dev/null; then note "SerpApi searches left" "✅ $SERP"
else note "SerpApi searches left" "⏳ $SERP (want 300+)"; BLOCKERS+=("serpapi: only $SERP left"); fi

# ── 4. No stale mode flags that would distort a restart ───────────────────────────────────────────
STALE=0
for f in CLEAR-BACKLOG BACKFILL-MODE; do
  if [ -f "output/$f" ]; then note "stale $f flag" "🔴 present"; BLOCKERS+=("stale flag: $f"); STALE=1; fi
done
[ "$STALE" -eq 0 ] && note "no stale mode flags" "✅"

# ── 5. Pre-flight gates must be green ─────────────────────────────────────────────────────────────
node scripts/check-every-gate-is-wired.mjs >/dev/null 2>&1
if [ $? -eq 0 ]; then note "gate wiring intact" "✅"; else note "gate wiring intact" "🔴 dormant gate(s)"; BLOCKERS+=("gates: a gate is dormant"); fi

echo
if [ ${#BLOCKERS[@]} -gt 0 ]; then
  echo "  ⏸️  STAYING PAUSED — ${#BLOCKERS[@]} condition(s) not met:"
  for b in "${BLOCKERS[@]}"; do echo "        · $b"; done
  echo
  echo "  Nothing changed. This is the correct outcome, not a failure."
  exit 0
fi

echo "  ✅ EVERY condition met."
if [ "$DRY" -eq 1 ]; then echo "  (--dry-run: leaving the flag in place)"; exit 0; fi

cp "$FLAG" "output/PRODUCTION-PAUSED.lifted-$(date +%Y-%m-%d)"   # keep the reasoning, never just delete
rm -f "$FLAG"
cat > output/RESUME-FIRST-NIGHT <<EOF
FIRST NIGHT BACK — $(date '+%Y-%m-%d')
The pause was lifted automatically by scripts/auto-resume-production.sh after every condition in
output/PRODUCTION-PAUSED cleared.

The flag's own restart checklist requires easing back in:
  · ONE category tonight, not the full spread
  · read the per-category table in the morning report BEFORE scaling up
  · delete this file once that first night has been reviewed
EOF
echo "  🚀 PRODUCTION RESUMED — flag removed (reasoning kept as PRODUCTION-PAUSED.lifted-$(date +%Y-%m-%d))"
echo "  📌 output/RESUME-FIRST-NIGHT written: ONE category tonight, review before scaling."
exit 0
