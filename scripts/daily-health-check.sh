#!/usr/bin/env bash
# daily-health-check.sh — run the OPERATIONAL gates that nothing else was running.
#
# ─── WHY (2026-09-02) ─────────────────────────────────────────────────────────────────────────────
# An audit found 11 gates that existed and passed but were wired into NO runner. Every one of them
# guards something that fails SILENTLY and off-schedule — a webhook that vanished, a third-party
# subscription that lapsed, a duplicate identity re-opening a door a prospect closed. Those do not
# break a build, so the deploy gates never see them; they just quietly stop working.
#
# "A test nobody runs is not a guard." These now run every morning.
#
#   bash scripts/daily-health-check.sh              # human output
#   bash scripts/daily-health-check.sh --quiet      # only failures (for cron)
#
# Exit 0 = everything healthy · 1 = a real failure · 2 = something could not be determined.
#
# 🔑 Exit 2 (indeterminate) is NOT treated as healthy. A gate that cannot reach Airtable must never
# report green — that is how a dead check reads as a pass.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" || { echo "✗ cannot enter scraper repo"; exit 2; }

QUIET=0; [ "${1:-}" = "--quiet" ] && QUIET=1
FAIL=0; INDET=0; OK=0
say() { [ "$QUIET" -eq 1 ] || printf "%s\n" "$1"; }

# Each entry: script | what it protects | how to treat a non-zero exit
#   abort  = a real problem, exit 1
#   status = a legitimate ongoing state, report but do not fail the run
run() {
  local script="$1" what="$2" mode="${3:-abort}"
  if [ ! -f "scripts/$script" ]; then printf "  ✗  %-38s MISSING\n" "$script"; FAIL=$((FAIL+1)); return; fi
  local out rc
  out=$(node "scripts/$script" 2>&1); rc=$?
  if [ "$rc" -eq 0 ]; then OK=$((OK+1)); say "  ✅ $(printf '%-38s' "$script") $what"
  elif [ "$rc" -eq 2 ]; then
    INDET=$((INDET+1))
    printf "  ⚠️  %-38s INDETERMINATE — %s\n" "$script" "$what"
    echo "$out" | grep -E '✗|Error|error' | head -2 | sed 's/^/        /'
  elif [ "$mode" = "status" ]; then
    say "  ℹ️  $(printf '%-38s' "$script") ongoing state, not a fault"
    [ "$QUIET" -eq 1 ] || echo "$out" | tail -2 | sed 's/^/        /'
  else
    FAIL=$((FAIL+1))
    printf "  🔴 %-38s %s\n" "$script" "$what"
    echo "$out" | grep -E '✗|🔴' | head -3 | sed 's/^/        /'
  fi
}

say ""
say "═══ DAILY HEALTH CHECK — $(date '+%Y-%m-%d %H:%M %Z') ═══"
say ""
say "── integrations that vanish silently ──"
run check-quo-webhooks-live.mjs        "call + SMS webhooks still registered with Quo"
run check-integration-subscriptions.mjs "third-party subscriptions still active"
run check-inbound-sms-flowing.mjs      "inbound texts still reaching Airtable"

say ""
say "── outreach safety ──"
run check-send-cap-held.mjs            "the 50/day send cap actually held"
run check-no-duplicate-send-rows.mjs   "no double-counted sends in the Outreach Log"
run check-duplicate-identity-leads.mjs "no live lead shares an identity with an opted-out one"

say ""
say "── pipeline state ──"
run check-day1-reservation-took.mjs    "day-1 reservation applied as configured"
run check-operational-drift.mjs        "config on disk matches what is running"
run check-apps-script-paste-owed.mjs   "no Apps Script edit waiting to be pasted"
run check-orphaned-airtable-fields.mjs "no Airtable field reads as coverage while holding nothing"
run check-send-queue-drained.mjs       "queue drain progress" status

say ""
say "── the sales surface ──"
run check-playbook-integrity.mjs       "playbook, guided call, and the Airtable contract"
run check-playbook-renders.mjs         "the playbook actually renders in a browser"

# ── production pause: lift it automatically the day every condition clears ────────────────────────
# Removing the pause was a MANUAL step waiting on a human to notice a condition had cleared, and a
# manual step nobody is watching is how a pause outlives its reason. This checks and resumes on its
# own; it is conservative — anything indeterminate counts as blocking.
# ── GBP hours backfill: chip away within the daily Places quota ───────────────────────────────────
# ~1,420 leads scraped before step-2.5 captured hours. The Cloud project has a low daily SearchText
# quota (deliberate spend control), so a single run cannot finish it. Rather than ask Chris to babysit
# it, run a capped batch each morning — it completes itself and stops the moment quota is hit.
# Non-fatal by design: a completeness task must never fail the health check.
say ""
say "── gbp hours backfill ──"
if [ -n "${QUO_WEBHOOK_TOKEN:-}" ] || grep -q '^QUO_WEBHOOK_TOKEN' .env 2>/dev/null; then
  _t="${QUO_WEBHOOK_TOKEN:-$(grep '^QUO_WEBHOOK_TOKEN' .env | cut -d= -f2- | tr -d '"'"'"'"'"'"'"')}"
  _r=$(curl -s --max-time 200 "https://www.rocketgrowthagency.com/.netlify/functions/backfill-gbp-hours?token=${_t}&limit=400&commit=1" 2>/dev/null)
  _w=$(echo "$_r" | grep -oE '"written": *[0-9]+' | grep -oE '[0-9]+' | head -1)
  _f=$(echo "$_r" | grep -oE '"found": *[0-9]+' | grep -oE '[0-9]+' | head -1)
  if [ -n "${_w:-}" ]; then
    say "  ✅ wrote ${_w} lead(s) this run (found ${_f:-0})"
    echo "$_r" | grep -q 'Quota exceeded' && say "     daily Places quota reached — resumes tomorrow, this is expected"
  else
    say "  ⚠️  backfill did not report a count (non-fatal)"
  fi
else
  say "  ⚠️  QUO_WEBHOOK_TOKEN not available — backfill skipped"
fi

say ""
say "── production pause ──"
if [ -f output/PRODUCTION-PAUSED ]; then
  ar=$(bash scripts/auto-resume-production.sh 2>&1)
  if echo "$ar" | grep -q 'PRODUCTION RESUMED'; then
    echo "  🚀 PRODUCTION AUTO-RESUMED — every pause condition cleared."
    echo "$ar" | grep -E 'RESUMED|RESUME-FIRST-NIGHT' | sed 's/^/     /'
  else
    say "  ⏸️  still paused — $(echo "$ar" | grep -cE '^        · ') condition(s) open"
    [ "$QUIET" -eq 1 ] || echo "$ar" | grep -E '^        · ' | sed 's/^/  /'
  fi
else
  say "  ✅ production running (no pause flag)"
fi

say ""
if [ "$FAIL" -gt 0 ]; then
  echo "🔴 $FAIL FAILING · $INDET indeterminate · $OK healthy"
  exit 1
fi
if [ "$INDET" -gt 0 ]; then
  echo "⚠️  $INDET INDETERMINATE (could not verify — NOT the same as healthy) · $OK healthy"
  exit 2
fi
say "✅ all $OK checks healthy"
exit 0
