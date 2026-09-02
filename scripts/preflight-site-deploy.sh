#!/usr/bin/env bash
# preflight-site-deploy.sh — run every site-facing gate BEFORE a manual `netlify deploy`.
#
# ─── WHY (2026-09-02) ─────────────────────────────────────────────────────────────────────────────
# The site gates were wired into scripts/drip-content.sh, which is the AUTOMATED deploy path. A
# MANUAL `netlify deploy --prod --dir=.` — how Chris ships anything outside the 09:00 drip — ran none
# of them. So the exact deploy most likely to carry a hand-edit was the one with no checks.
#
# `netlify deploy --dir=.` also reads the WORKING TREE, not git. Uncommitted or unrelated dirty files
# ship too, which is why this refuses to pass quietly when the tree is dirty.
#
#   bash scripts/preflight-site-deploy.sh
#
# Exit 0 = safe to deploy · 1 = a gate failed · 2 = could not run the checks.
set -uo pipefail

WEBSITE="/Users/chris/RGA/Rocket Growth Agency Website VS Code"
SCRAPER="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRAPER" || { echo "✗ cannot enter scraper repo"; exit 2; }

FAILED=0
pass() { printf "  ✅ %s\n" "$1"; }
fail() { printf "  ✗  %-42s %s\n" "$1" "$2"; FAILED=$((FAILED + 1)); }

gate() {                                   # $1 = script  $2 = what it protects
  if [ ! -f "scripts/$1" ]; then fail "$1" "MISSING — cannot verify $2"; return; fi
  local out rc
  out=$(node "scripts/$1" 2>&1); rc=$?
  if [ "$rc" -eq 0 ]; then pass "$1"
  else
    fail "$1" "$2"
    echo "$out" | grep -E '^\s+(✗|[a-z-]+ )' | head -4 | sed 's/^/        /'
  fi
}

echo
echo "═══ PRE-DEPLOY GATES ═══"
gate check-playbook-integrity.mjs      "the sales playbook + guided call + Airtable contract"
gate check-playbook-renders.mjs        "the playbook actually RENDERS — a structural gate cannot see a blank screen"
gate check-locked-pages.mjs            "pages Chris has locked"
gate check-header-consistency.mjs      "shared header/promo chrome"
gate check-shared-components-not-forked.mjs "components silently forking"
gate check-offer-prices-consistent.mjs "prices on live pages"
gate check-no-markup-in-text.mjs       "markup leaking into visible text"

echo
echo "═══ WORKING TREE ═══"
echo "  netlify deploy --dir=. ships the WORKING TREE, not the last commit."
DIRTY=$(cd "$WEBSITE" && git status --porcelain | wc -l | tr -d ' ')
if [ "${DIRTY:-0}" -eq 0 ]; then
  pass "tree clean — what deploys is what is committed"
else
  printf "  ⚠️  %s uncommitted path(s) WILL be deployed:\n" "${DIRTY:-0}"
  (cd "$WEBSITE" && git status --porcelain | head -8 | sed 's/^/        /')
  [ "${DIRTY:-0}" -gt 8 ] && echo "        … and $(( DIRTY - 8 )) more"
  echo "        Not a failure — but confirm every one of these is meant to go live."
fi

echo
if [ "$FAILED" -gt 0 ]; then
  echo "🔴 $FAILED gate(s) failed — DO NOT DEPLOY."
  exit 1
fi
echo "✅ All gates pass. Deploy dance: unlock → netlify deploy --prod --dir=. → verify content-type → relock."
exit 0
