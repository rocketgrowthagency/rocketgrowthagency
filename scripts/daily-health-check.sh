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

# 🔑 LOAD .env SO THE GATES CAN ACTUALLY CHECK. Several gates verify against LIVE Supabase — the
# admin's SELECT columns, its INSERT columns, rank sanity. Without credentials they exit 2
# ("could not tell"), which this runner reports as INDETERMINATE rather than a failure. That is
# honest, but it means the check never ran, every day, forever — a dead check wearing a warning
# label. Found 2026-09-09: check-inserts-use-real-columns had never once verified from here.
# 🔴 `set -a` only; never echo a value. These are the 13 secrets backup-secrets.sh exists to protect.
if [ -f .env ]; then set -a; . ./.env >/dev/null 2>&1 || true; set +a; fi


# 🔑 RECORD EVERY VERDICT. check-no-gate-is-permanently-indeterminate reads this to find gates that
# have NEVER once answered — wired, counted, and blind. Cheap: one line appended per gate per run.
# → feedback_dead_check_selector_gap
VERDICT_LOG="output/gate-verdicts.jsonl"
mkdir -p output
record_verdict() { printf '{"gate":"%s","exit":%s,"at":"%s"}\n' "$1" "$2" "$(date -u +%FT%TZ)" >> "$VERDICT_LOG"; }

QUIET=0; [ "${1:-}" = "--quiet" ] && QUIET=1
FAIL=0; INDET=0; OK=0
say() { [ "$QUIET" -eq 1 ] || printf "%s\n" "$1"; }

# Each entry: script | what it protects | how to treat a non-zero exit
#   abort  = a real problem, exit 1
#   status = a legitimate ongoing state, report but do not fail the run
# Same contract as run(), but passes a sub-command to the script. Kept separate rather than making
# run() variadic, because run()'s first arg is used as the display label everywhere and quietly
# changing that would misalign every existing line.
run_args() {
  local script="$1" args="$2" what="$3" mode="${4:-abort}"
  if [ ! -f "scripts/$script" ]; then printf "  ✗  %-38s MISSING\n" "$script"; FAIL=$((FAIL+1)); return; fi
  local out rc
  out=$(node "scripts/$script" $args 2>&1); rc=$?
  record_verdict "$script" "$rc"
  if [ "$rc" -eq 0 ]; then OK=$((OK+1)); say "  ✅ $(printf '%-38s' "$script") $what"
  elif [ "$rc" -eq 2 ]; then
    INDET=$((INDET+1))
    printf "  ⚠️  %-38s INDETERMINATE — %s\n" "$script" "$what"
    echo "$out" | grep -E '✗|Error|error' | head -2 | sed 's/^/        /'
  else
    FAIL=$((FAIL+1))
    printf "  🔴 %-38s %s\n" "$script" "$what"
    echo "$out" | grep -E '✗|🔴' | head -3 | sed 's/^/        /'
  fi
}

run() {
  local script="$1" what="$2" mode="${3:-abort}"
  if [ ! -f "scripts/$script" ]; then printf "  ✗  %-38s MISSING\n" "$script"; FAIL=$((FAIL+1)); return; fi
  local out rc
  out=$(node "scripts/$script" 2>&1); rc=$?
  record_verdict "$script" "$rc"
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
run check-scheduled-jobs-are-alive.mjs "the jobs that run RGA overnight are still loaded"
run check-client-email-senders-are-gated.mjs "nothing that emails a client is open to the internet"
run check-standing-alerts.mjs          "an alert nobody reads is not an alert"
run check-send-cap-held.mjs            "the 50/day send cap actually held"
run check-no-duplicate-send-rows.mjs   "no double-counted sends in the Outreach Log"
run check-duplicate-identity-leads.mjs "no live lead shares an identity with an opted-out one"

say ""
say "── pipeline state ──"
run check-day1-reservation-took.mjs    "day-1 reservation applied as configured"
run check-operational-drift.mjs        "config on disk matches what is running"
run check-no-or-echo-append.mjs        "no '|| echo N' that appends instead of defaulting"
run check-google-api-cost-safety.mjs   "every billed Google API caller is declared; video pipeline free"
run check-netlify-publishing-live.mjs  "pushed code actually reaches production (deploy not locked)"
run check-sop-fully-rendered.mjs       "every SOP step has a row + Run button in the admin"
run check-status-maps-fail-soft.mjs    "a status the app writes cannot crash the page that reads it"
run check-every-action-reports-a-result.mjs "every button reports a visible result (admin + portal)"
run check-archived-clients-excluded.mjs "an archived client is not work, revenue or a KPI"
run check-status-tools-see-the-run.mjs "the morning audit can actually see the night run"
run check-admin-selects-real-columns.mjs "every column the admin SELECTs exists in the live schema"
run check-video-serving-reconciled.mjs  "a 404 is a TAKEDOWN or a BREAKAGE — never confuse them"
run check-apps-script-paste-owed.mjs   "no Apps Script edit waiting to be pasted"
run check-orphaned-airtable-fields.mjs "no Airtable field reads as coverage while holding nothing"
run heal-onboarding-errors.mjs         "retry delivery steps whose cause was since fixed"
run check-onboarding-errors-surfaced.mjs "no client carries a caught-but-unsurfaced delivery failure"
run check-send-queue-drained.mjs       "queue drain progress" status
run check-send-queue-can-reach-zero.mjs "the send queue is DRAINABLE — no phantom lead can lock production"
run check-ai-drafts-do-not-invent-prices.mjs "no AI draft invents a price, stat or testimonial"
run check-every-playbook-step-can-run.mjs "every auto/hybrid onboarding step has something that can run it"
run check-no-invisible-controls.mjs   "no control can render invisible if a CSS variable fails"
run check-contract-doc-gets-every-field-it-renders.mjs "the contract document is given every field it renders"
run check-client-work-reaches-the-brain.mjs "every audited client teaches the client brain"
run check-admin-sees-what-the-client-sees.mjs "admin and the client portal share ONE deliverable list"
run check-drafts-use-real-services.mjs  "no draft describes a client using their search term"
run check-approval-matches-what-was-shown.mjs "an approval records the content that was shown"
run check-heavy-steps-cannot-time-out.mjs "no drafting step can exceed the 26s request ceiling"
run check-hosting-bandwidth-headroom.mjs "pages AND videos are serving — not out of allowance"
run export-approvals.mjs               "every client decision archived to markdown"

# 🔴 WRITING THE ARCHIVE IS NOT KEEPING IT. export-approvals writes markdown into the website repo,
# and until 2026-09-15 nothing committed it — so every approval record lived as an untracked file on
# one machine, one `git clean` from gone. The whole point is to outlive the database.
# Chris: "each mockup approved we save the file in an md file system in vs code and git, so we have
# reference." Committed is the only reading of "in git" that means anything.
SITE_REPO="/Users/chris/RGA/Rocket Growth Agency Website VS Code"
if [ -n "$(git -C "$SITE_REPO" status --porcelain -uall -- reports/approvals)" ]; then
  git -C "$SITE_REPO" add -A reports/approvals
  if git -C "$SITE_REPO" -c user.name=rocketgrowthagency -c user.email=hello@rocketgrowthagency.com \
       commit -qm "Archive client approvals ($(date +%Y-%m-%d))"; then
    echo "  ✅ committed new/changed approval archives"
  else
    echo "  🔴 approval archive changed but the commit FAILED — the record is not in git"
  fi
else
  echo "  ▫️  approval archive already committed, nothing new"
fi

run check-every-approval-is-archived.mjs "every decision is archived AND committed, with its content"
run check-artifacts-are-keyed-by-id.mjs "no archived mockup is keyed by, or lying about, a step position"
run check-change-ledger-is-append-only.mjs "the record of what we changed cannot itself be changed"
run check-no-horizontal-bleed.mjs "no card or page can be pushed sideways by its own content"
run check-one-palette.mjs               "colour comes from tokens; a rank scale is never coloured like a state"
run check-ga4-property-is-the-one-receiving-data.mjs "we read the GA4 property the site actually reports to"
run check-client-boundary-is-declared.mjs "one field decides what a client sees, and both portals read it"
run check-client-never-sees-our-internals.mjs "no client endpoint returns a step id, raw JSON or an error payload"
run check-nothing-reaches-a-client-unreviewed.mjs "nothing reaches a client until RGA has reviewed it"
run check-owner-facts-are-in-sync.mjs "the four owner questions mean the same thing in both portals"
run check-no-gate-is-permanently-indeterminate.mjs "no gate is wired, counted, and blind"

say ""
say "── the sales surface ──"
# 📊 The almanac is a long-horizon asset — worth little today, a lot in a year, but ONLY if it keeps
# accruing. Re-aggregate BEFORE checking, so the check judges the machinery rather than whether anyone
# remembered to run the build. Output is quiet unless it fails.
node scripts/local-search-almanac.mjs build >/dev/null 2>&1 || true
run check-orphan-functions.mjs         "no function was built and then never invoked"
run check-portal-data-boundary.mjs     "the client portal never touches RGA's work product"
run check-sop-sources-agree.mjs        "both delivery-SOP definitions still describe one process"
run check-robot-does-not-overclaim.mjs "the SOP run-all robot reports what actually ran"
run check-runners-never-swallow-errors.mjs "no SOP runner turns a failed fetch into a false finding"
run check-refusal-is-not-done.mjs      "a step that refused is never announced as Done"
run check-button-says-what-it-does.mjs "a button that emails a client says so, and asks first"
run check-finished-work-shows-finished.mjs "a step whose runner finished is marked done, not Active"
run check-email-headers-are-encoded.mjs "a client-facing Subject cannot arrive as mojibake"
run check-inserts-use-real-columns.mjs  "no write names a column the table does not have"
run check-kickoff-reader-matches-writer.mjs "the email reads the kickoff record the invite writes"
run check-deep-links-land-where-asked.mjs "a deep link opens the view it names, not Pipeline"
run check-no-shadowed-functions.mjs     "no admin/portal function is silently redefined"
run check-stage-changes-notify-client.mjs "a stage change tells the client, never silent"
run check-signed-in-user-never-sees-login-form.mjs "a working magic link never ends on a login form"
run check-price-summary-is-derived.mjs "a price summary is derived from the schedule, never restated"
run check-charge-equals-the-contract.mjs "we charge exactly what the agreement schedules"
run check-billing-history-is-derived.mjs "the payment step survives month 3, not just month 1"
run check-payment-path-is-safe.mjs "the client never grants; a replay changes nothing"
run check-no-module-tdz.mjs "no module binding is used above its declaration"
run check-price-surfaces-are-known.mjs "every place a price lives is in the inventory"
run check-price-excuses-are-still-true.mjs "an EXCLUDED classification is a CLAIM, not a pass"
run check-charges-use-the-right-stripe-account.mjs "a charge lands where the card actually is"
run check-no-test-card-path.mjs         "no client can pay us with a card that moves no money"
run check-decline-copy-is-client-facing.mjs "a refused card never explains our integration"
run check-every-stripe-charge-reached-our-ledger.mjs "money in Stripe equals money in our books"
run check-email-suppression-actually-reaches-the-sender.mjs "a test harness must not mail real clients"
run check-invoice-dates-are-business-time.mjs "two copies of one invoice must never disagree"
run check-memory-has-no-orphans.mjs "a memory nothing links to is a memory nobody will read"
run check-we-never-promise-what-we-dont-do.mjs "copy must not assert behaviour the system does not perform"
run check-post-payment-shows-real-data.mjs "after a payment the portal renders the ledger, or nothing"
run check-test-reset-clears-every-write.mjs "a partial reset makes the next run skip steps that look like defects"
run check-a-charge-settles-its-invoice.mjs "a charge is complete when OUR ledger says so, not when Stripe does"
run check-the-price-shown-is-the-price-charged.mjs "the number on the button must be the number taken"
run check-no-client-paid-without-a-receipt.mjs "money in, receipt out — a silent send failure is an outage"
run check-emails-clear-the-spam-floor.mjs "no client email is short enough to look like spam"
run check-one-action-one-button.mjs "arriving somewhere does not still show the way there"
run check-sign-flow-is-passable.mjs "a client can actually sign, and only a fresh session can"
run check-sent-contracts-match-current-terms.mjs "nobody is about to sign wording we retired"
run check-price-consistency.mjs       "phone, email and agreement state the same price"
run check-offer-matches-contract.mjs  "the price we advertise is the price the contract charges"
run_args audit-coverage.mjs verify     "no onboarding-audit check claims automation it lacks"
run check-rank-tracking-sane.mjs       "every tracked grid measures a real position"
run check-absent-rank-is-never-a-position.mjs "a business absent from the grid never renders as a rank"
run check-almanac-accruing.mjs         "the local-search almanac still reflects its corpus"
run check-no-two-clients-share-a-google-property.mjs "no client reports another business's Google data"
run_args check-no-duplicate-google-listing.mjs --all "no client has a SECOND Google listing splitting its ranking signals"
run check-client-dedupe-gate.mjs       "an archived client cannot be silently re-created"
run retry-place-id-backfill.mjs        "every client has a Google place id (strongest dedupe key)"
run refresh-review-metrics.mjs        "review counts observed daily (velocity needs a series)"
run refresh-pagespeed.mjs             "PageSpeed refreshed (background; verified by snapshot)" status
run check-report-matches-the-mockup.mjs "the client report has not drifted from its approved design"
run check-playbook-integrity.mjs       "playbook, guided call, and the Airtable contract"
run check-browser-js-parses-as-the-browser-does.mjs "every script the site loads actually parses"
run check-admin-tabs-render.mjs       "every admin tab renders for a signed-in admin"
run check-app-pages-boot.mjs          "admin, portal and the homepage actually come up in a browser"
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

# ── own the data: snapshot every active client's state, every day ────────────────────────────────
# Rankings and profile state are TIME-SERIES. A day not captured is gone permanently, so this runs
# daily whether or not anything changed — "we looked and it had not moved" is evidence too.
say ""
say "── client state snapshots ──"
_snap_n=0
# 🔴 dotenv v17 prints its banner to STDOUT, so an unfiltered `node -e` here returned the tip line as
# if it were client slugs — the loop then "snapshotted" words like "injecting". Silence it and accept
# only real slug characters. A list command must return ONLY the list.
for _slug in $(DOTENV_CONFIG_QUIET=true node -e '
require("dotenv").config({quiet:true});
(async()=>{const U=process.env.SUPABASE_URL,K=process.env.SUPABASE_SERVICE_ROLE_KEY;
const r=await fetch(`${U}/rest/v1/clients?archived_at=is.null&select=portal_slug`,{headers:{apikey:K,Authorization:`Bearer ${K}`}});
const d=await r.json(); if(Array.isArray(d)) console.log(d.map(c=>c.portal_slug).filter(Boolean).join(" "));})()' 2>/dev/null \
  | tr " " "\n" | grep -E "^[a-z0-9][a-z0-9-]{2,}$"); do
  if node scripts/client-state.mjs snapshot "$_slug" >/dev/null 2>&1; then _snap_n=$((_snap_n+1)); fi
done
say "  ✅ snapshotted ${_snap_n} active client(s)"
# 🔴 NOT `|| echo 0`: on ZERO matches grep prints "0" AND exits 1, so `|| echo 0` appends a SECOND
# line and the test below compares "0\n0" — "integer expression expected". Same shape as the bug
# documented in overnight-pipeline.sh:885 and recovery-rounds.sh:128. `|| true` swallows the exit
# code without printing anything; `:-0` covers the command dying outright.
_unver=$(node scripts/client-state.mjs unverified 2>/dev/null | grep -cE '^\s+⚠️' || true)
[ "${_unver:-0}" -gt 0 ] && say "  ⚠️  ${_unver} change(s) never confirmed by a read-back — an action that REPORTED success is not one that happened"

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
