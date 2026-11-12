#!/usr/bin/env bash
# 🔒 AIRTABLE METER (2026-10-08): every node step below appends its Airtable call count to
# output/airtable-calls.log, so the monthly cap can be traced to the job that spends it. Read-only job, so
# repeat GETs within 30 min are served from /tmp (AIRTABLE_GET_CACHE=1).
_METER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--import=file://${_METER_DIR// /%20}/_airtable-meter.mjs"
export AIRTABLE_METER_JOB="daily-health-check"
export AIRTABLE_GET_CACHE=1

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
QUIET_WHY=""   # the quiet-period reason (scripts/db-quiet-until.txt); given a value before any gate reads it, for the same reason as the line below
DB_STOPPED=""   # 🔴 under set -u an unset variable KILLS the script: without this line every morning since 10-27 died at the first live gate (reviews, RSVPs, PageSpeed never ran)
SKIPPED_LIVE=$(mktemp)   # what the database made us skip; run once more at the end
RETRY_PASS=""
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" || { echo "✗ cannot enter scraper repo"; exit 2; }

# 🔑 LOAD .env SO THE GATES CAN ACTUALLY CHECK. Several gates verify against LIVE Supabase — the
# admin's SELECT columns, its INSERT columns, rank sanity. Without credentials they exit 2
# ("could not tell"), which this runner reports as INDETERMINATE rather than a failure. That is
# honest, but it means the check never ran, every day, forever — a dead check wearing a warning
# label. Found 2026-09-09: check-inserts-use-real-columns had never once verified from here.
# 🔴 `set -a` only; never echo a value. These are the 13 secrets backup-secrets.sh exists to protect.
if [ -f .env ]; then set -a; . ./.env >/dev/null 2>&1 || true; set +a; fi


# 🔒 SYSTEM HEALTH (approved admin_system_health_v1, Chris 10-31): this job says it ran. 10-27 to 10-30 it died four mornings running and nobody
# heard. Reaching the end counts as having run, however many gates are red: those are the gates' verdict and live in the morning report. Dying
# partway (the trap sees it) or gates that can't launch is "Failed", and nothing healthy is "Did nothing". The script always exits 0 and never
# breaks this job. The trap uses defaults because it can fire before the counters below exist, and `set -u` would kill it too.
JOB_REACHED_END=""
job_checkin_finish() {
  local rc=$? ok=0 err=""
  [ -n "$JOB_REACHED_END" ] && ok=1
  [ "$ok" = 1 ] || err="It stopped before the end (exit $rc)"
  [ "${UNRUNNABLE:-0}" -gt 0 ] && err="${UNRUNNABLE:-0} gates could not launch"
  node scripts/job-checkin.mjs finish daily-health-check --ok "$ok" --count "${OK:-0}" --note "${OK:-0} checks healthy · ${FAIL:-0} red · ${INDET:-0} could not tell" --error "$err" || true
}
trap job_checkin_finish EXIT
node scripts/job-checkin.mjs start daily-health-check || true

# 🔑 RECORD EVERY VERDICT. check-no-gate-is-permanently-indeterminate reads this to find gates that
# have NEVER once answered — wired, counted, and blind. Cheap: one line appended per gate per run.
# → feedback_dead_check_selector_gap
VERDICT_LOG="output/gate-verdicts.jsonl"
mkdir -p output
record_verdict() { printf '{"gate":"%s","exit":%s,"at":"%s"}\n' "$1" "$2" "$(date -u +%FT%TZ)" >> "$VERDICT_LOG"; }

QUIET=0; [ "${1:-}" = "--quiet" ] && QUIET=1
FAIL=0; INDET=0; OK=0
THREW=0        # gates that crashed rather than reported — harness faults, never product findings
# ═══════════════════════════════════════════════════════════════════════════════════════════════
# 🔴🔴 EXIT 127 IS NOT A VERDICT. IT MEANS THE GATE NEVER RAN.
#
# 2026-09-27. The verdict log showed 154 gates returning 127 at 07:30 every morning — every single
# one — and had done since 2026-09-16. On 09-20 and 09-23 the healthy count was ZERO: nothing was
# checked at all on those days. The cause was one line missing from the launchd plist: no PATH, so
# `node` (in /usr/local/bin) was not found, so every `node scripts/...` returned "command not found".
#
# The run reported it perfectly — "152 FAILING, 0 healthy" — into
# /tmp/com.rga.daily-health-check.out, which nobody opens. **The write is not the delivery.**
# Eleven days of a dead safety net, announced daily to no one.
#
# So 127 is counted SEPARATELY (150 gates that could not launch is ONE fault, not 150) and any run
# containing one RAISES A STANDING ALERT, which check-standing-alerts.mjs fails on until cleared —
# the one channel in this system that is actually read.
# → feedback_a_swallowed_send_failure_is_an_outage · feedback_a_gate_that_cannot_fail
# ═══════════════════════════════════════════════════════════════════════════════════════════════
UNRUNNABLE=0
ALERT_DIR="/Users/chris/RGA/Rocket Growth Agency Website VS Code/reports/alerts"
ALERT_FILE="$ALERT_DIR/HEALTH-CHECK-CANNOT-RUN.md"
# 🔑 ONE classifier, called by BOTH runners. They already had duplicate bodies; adding the 127 arm
# to only one of them is how half a fix ships.
classify() {
  local script="$1" rc="$2" what="$3" mode="$4" out="$5"
  if [ "$rc" -eq 0 ]; then OK=$((OK+1)); say "  ✅ $(printf '%-38s' "$script") $what"; return; fi
  if [ "$rc" -eq 127 ]; then
    UNRUNNABLE=$((UNRUNNABLE+1))
    printf "  ⛔ %-38s COULD NOT RUN — %s\n" "$script" "$(printf '%s' "$out" | head -1)"
    return
  fi
  if [ "$rc" -eq 2 ]; then
    INDET=$((INDET+1))
    printf "  ⚠️  %-38s INDETERMINATE — %s\n" "$script" "$what"
    printf '%s' "$out" | grep -E '✗|Error|error' | head -2 | sed 's/^/        /'
    return
  fi
  if [ "$mode" = "status" ]; then
    say "  ℹ️  $(printf '%-38s' "$script") ongoing state, not a fault"
    [ "$QUIET" -eq 1 ] || printf '%s' "$out" | tail -2 | sed 's/^/        /'
    return
  fi
  FAIL=$((FAIL+1))
  printf "  🔴 %-38s %s\n" "$script" "$what"
  printf '%s' "$out" | grep -E '✗|🔴' | head -3 | sed 's/^/        /'
}
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
  classify "$script" "$rc" "$what" "$mode" "$out"
}

run() {
  local script="$1" what="$2" mode="${3:-abort}"
  if [ ! -f "scripts/$script" ]; then printf "  ✗  %-38s MISSING\n" "$script"; FAIL=$((FAIL+1)); return; fi
  local out rc
  # ═══════════════════════════════════════════════════════════════════════════════════════════════
  # 🔴🔴 ONE GATE HUNG AND THE WHOLE SWEEP STOPPED (2026-10-06). `check-no-tab-flashes-a-wrong-answer`
  # drives a browser; it sat for SEVENTEEN MINUTES with no output and the nightly run simply stalled
  # behind it. Nothing failed, nothing was reported — the sweep just never reached the other 190
  # gates, which is worse than any single red, because it is silent.
  #
  # 🔑 THE SAME RULE THE PRODUCT NOW LIVES BY: every call gets a deadline, including the ones this
  # harness makes. A gate that exceeds it is INDETERMINATE (exit 2) — could-not-tell, never a product
  # finding. 🔴 `timeout` is not on macOS by default, so the bound is a background child and a kill.
  # → feedback_a_request_without_a_deadline_hangs_the_whole_run · feedback_a_gate_that_throws_is_not_a_gate_that_fails
  # ═══════════════════════════════════════════════════════════════════════════════════════════════
  # ═══════════════════════════════════════════════════════════════════════════════════════════════
  # 🔴🔴 A LIVE GATE NEVER PILES ON A STRUGGLING DATABASE (10-26: four full runs in an afternoon spent the clients' Supabase
  # disk-IO budget; database, sign-in and data API went UNHEALTHY and every portal sat on "Loading" until Chris restarted it).
  # Before any gate that touches the live site or the database: one cheap health read (scripts/lib/db-health.mjs). Slow or
  # failing → wait 30 s, look once more; still bad → this and every later live gate is skipped (INDETERMINATE), never run.
  # ═══════════════════════════════════════════════════════════════════════════════════════════════
  # 🔴 AUDIT 10-31: NOT A LATCH. One read of 7,623 ms skipped 74 later gates and the review read for the whole morning. Every live gate looks again;
  # the first bad look waits once, and while it stays bad nothing waits. What was skipped runs once more at the end. The browser walks hit the same
  # database but their source doesn't name it, so they're listed by name.
  local is_live=""
  case "$script" in acceptance-walk-*) is_live=1 ;; esac
  grep -qE "SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|_admin-session|rocketgrowthagency\.com" "scripts/$script" 2>/dev/null && is_live=1
  # 🔇 11-6: a QUIET PERIOD (scripts/db-quiet-until.txt, Free plan egress over its 5 GB until Nov 18): no live gate runs, each says why
  if [ -n "$is_live" ] && QUIET_WHY=$(node scripts/lib/db-quiet.mjs 2>/dev/null); then
    printf "  ⚠️  %-38s SKIPPED — %s\n" "$script" "$QUIET_WHY"; INDET=$((INDET+1))
    return
  fi
  if [ -n "$is_live" ]; then
    local h
    if h=$(node scripts/lib/db-health.mjs 2>/dev/null); then
      DB_STOPPED=""
    elif [ -n "$DB_STOPPED" ]; then
      DB_STOPPED="${h:-no answer}"
    else
      echo "  ⏸  the clients' database is struggling ($h) — waiting 30 s before $script"; sleep 30
      if h=$(node scripts/lib/db-health.mjs 2>/dev/null); then
        DB_STOPPED=""
      else
        DB_STOPPED="${h:-no answer}"
        printf "  🛑 LIVE GATES PAUSED: the clients' database is struggling (%s); skipped until it reads healthy, then run again at the end\n" "$DB_STOPPED"
      fi
    fi
    if [ -n "$DB_STOPPED" ]; then
      printf "  ⚠️  %-38s SKIPPED — the clients' database is struggling (%s); not adding load\n" "$script" "$DB_STOPPED"; INDET=$((INDET+1))
      [ -n "$RETRY_PASS" ] || printf '%s\t%s\t%s\n' "$script" "$what" "$mode" >> "$SKIPPED_LIVE"
      return
    fi
  fi
  local limit="${GATE_TIMEOUT_SECONDS:-300}" tmp
  tmp=$(mktemp)
  node "scripts/$script" >"$tmp" 2>&1 &
  local pid=$! waited=0
  while kill -0 "$pid" 2>/dev/null && [ "$waited" -lt "$limit" ]; do sleep 1; waited=$((waited+1)); done
  if kill -0 "$pid" 2>/dev/null; then
    kill -9 "$pid" 2>/dev/null; wait "$pid" 2>/dev/null
    out="⚠️  INDETERMINATE — this gate ran for ${limit}s without finishing and was stopped. It is not
     a product failure; nothing is checking: $what"
    rc=2
  else
    wait "$pid"; rc=$?
    out=$(cat "$tmp")
  fi
  rm -f "$tmp"
  # 🔑 THE LOG KEEPS THE REASON (audit 10-31 item 42): the screen shows only the first 3 failing lines, so a gate's full output is kept, one file per gate, overwritten each run.
  mkdir -p output/gate-last 2>/dev/null; printf '%s\n' "$out" > "output/gate-last/${script%.mjs}.txt" 2>/dev/null || true
  # ═══════════════════════════════════════════════════════════════════════════════════════════════
  # 🔴🔴 A GATE THAT THREW IS NOT A GATE THAT FAILED — AND IT HAD BEEN REPORTED AS ONE.
  #
  # Three gates went blind on 2026-10-05, each because a hand-written lift list went stale when the
  # product grew a helper (`obRespectDeps`, then `obPhaseIndexOf`, then `obDependsOn`). Node exits 1
  # on an uncaught throw, so the sweep recorded them as PRODUCT FAILURES, with a stack trace where a
  # finding should be. A red nobody can trust teaches the reader to ignore the ones that are true.
  #
  # 🔑 AN UNCAUGHT STACK TRACE IS A BROKEN HARNESS, NOT A BROKEN PRODUCT. Caught here, once, for
  # every gate — including ones written years from now — rather than in each gate's own try/catch.
  # → feedback_a_gate_that_throws_is_not_a_gate_that_fails · feedback_a_flaky_gate_is_worse_than_a_failing_one
  # ═══════════════════════════════════════════════════════════════════════════════════════════════
  if [ "$rc" != "0" ] && printf '%s' "$out" | grep -qE '^\s+at .*\(.*:[0-9]+:[0-9]+\)|^[A-Za-z]*Error: '; then
    printf "  ⚠️   %-38s GATE THREW — not a product failure\n" "$script"
    printf "       %s\n" "$(printf '%s' "$out" | grep -m1 -E '^[A-Za-z]*Error: ' | cut -c1-150)"
    printf "       Fix the gate. Until then nothing is checking: %s\n" "$what"
    THREW=$((THREW+1))
    record_verdict "$script" "2"
    return
  fi
  record_verdict "$script" "$rc"
  classify "$script" "$rc" "$what" "$mode" "$out"
}

say ""
say "═══ DAILY HEALTH CHECK — $(date '+%Y-%m-%d %H:%M %Z') ═══"
say ""
say "── integrations that vanish silently ──"
run check-quo-webhooks-live.mjs        "call + SMS webhooks still registered with Quo"
run check-quo-key-on-the-server.mjs "the LIVE server's QUO_API_KEY works (schedule-data tests it against Quo; 11-10 Netlify held a dead value)"
run check-reminder-texts.mjs "reminder texts: their clock, STOP line, US numbers only, off unless switched on, claimed before sent (11-11)"
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
run check-functions-select-real-columns.mjs "every column the NETLIFY FUNCTIONS select exists too — a 400 from a missing column reads as an empty result"
run check-video-serving-reconciled.mjs  "a 404 is a TAKEDOWN or a BREAKAGE — never confuse them"
run check-apps-script-paste-owed.mjs   "no Apps Script edit waiting to be pasted"
run check-orphaned-airtable-fields.mjs "no Airtable field reads as coverage while holding nothing"
run heal-onboarding-errors.mjs         "retry delivery steps whose cause was since fixed"
run check-onboarding-errors-surfaced.mjs "no client carries a caught-but-unsurfaced delivery failure"
run check-send-queue-drained.mjs       "queue drain progress" status
run check-send-queue-can-reach-zero.mjs "the send queue is DRAINABLE — no phantom lead can lock production"
run check-ai-drafts-do-not-invent-prices.mjs "no AI draft invents a price, stat or testimonial"
run check-every-playbook-step-can-run.mjs "every auto/hybrid onboarding step has something that can run it"
run check-no-step-redoes-an-automated-job.mjs "no checklist step tells a human to redo work the product already does"
run check-two-surfaces-one-sender.mjs "the Overview card and the checklist converge on one recorded sender — neither can bypass the other's guard"
run check-a-booking-can-be-unbooked.mjs "a booked kickoff can be moved to a named time and cancelled from inside the product"
run check-a-done-step-can-be-substantiated.mjs "a step marked done by hand is recorded and rendered as unverified, not passed off as proven"
run check-a-step-locks-on-its-whole-chain.mjs "a step stays locked until its WHOLE dependency chain is done, not just its parent"
run check-the-next-action-names-the-real-step.mjs "the next-action card names the actual next step, and the header % agrees with the checklist"
run check-the-confirmation-email-says-one-true-thing.mjs "the client welcome email never contradicts its own plan, and exists in exactly one place"
run check-step-instructions-are-not-shredded.mjs "every step card renders its instructions as written - nothing cut off, orphaned or truncated"
run check-a-withdrawn-contract-is-not-offered.mjs "a voided contract stops being offered in the client portal"
run check-every-report-section-is-composed.mjs "no client-report section is built and then never shown"
run check-a-loading-surface-does-not-lie.mjs "a surface that is still loading never renders a confident wrong answer"
run check-kickoff-booking-is-honest.mjs "the kickoff picker, the portal booking and the sender agree on what is free"
run check-no-tab-flashes-a-wrong-answer.mjs "no admin tab flashes a contradicting number on refresh (browser sweep)"
run check-no-invisible-controls.mjs   "no control can render invisible if a CSS variable fails"
run check-css-declarations-are-valid.mjs "no CSS declaration the browser would silently discard"
run check-no-new-dormant-css.mjs      "no NEW style rule that nothing on any page can match"
run check-the-setup-accordion-behaves.mjs "the client checklist folds without hiding a step or locking one"
run check-messages-have-a-shape.mjs   "no client-facing message is a loose grey sentence"
run check-no-native-browser-dialogs.mjs "no popup bypasses the dialog system"
run check-portal-prefetch-actually-fires.mjs "the portal boot prefetch is not a silent no-op"
run check-the-next-step-card-names-whats-next.mjs "the next-step card names the soonest concrete thing"
run check-the-client-reads-their-own-timezone.mjs "the client picks in their own timezone"
run check-the-client-can-release-their-booking.mjs "a confirmed call has a way out"
run check-an-abandoned-oauth-grant-is-never-silent.mjs "an abandoned Google grant reports itself"
run check-a-reschedule-never-looks-like-a-first-booking.mjs "a moved call never reads as a new one"
run check-booked-and-accepted-are-different-words.mjs "booked and accepted are two different facts"
run check-a-jump-moves-the-page.mjs "a jump button never does nothing"
run check-the-kickoff-call-fits-its-slot.mjs "the kickoff call fits its 30-minute slot"
run check-the-recap-sends-what-you-saw.mjs "the recap sends what you saw, to the person on the record"
run check-the-join-link-is-the-invites-link.mjs "one event, one room"
run check-a-past-call-never-claims-it-happened.mjs "a past call claims it happened only with a recap"
run check-the-countdown-agrees-across-portals.mjs "both portals count down in the same words"
run check-a-settled-booking-corrects-every-sentence.mjs "a confirmed booking settles every sentence"
run check-the-done-when-line-is-gone.mjs "the \"You are done when …\" strip is deleted and cannot return"
run check-the-clock-never-claims-the-call-happened.mjs "only a person says the kickoff call happened"
run check-the-phases-account-for-every-step.mjs "every Month-1 step lands in a phase and the counts are read"
run check-a-client-action-reaches-the-admin.mjs "a client waiting on us reaches the next-action card"
# 🔑 Not a gate — a CALLER. kickoff-rsvp-check could always read an acceptance; until 2026-09-27 the
# only thing that ever asked it was an admin page view, so a client could accept on Friday and the
# record still say "awaiting" on Monday. → feedback_a_capability_nobody_calls_looks_finished
run check-the-kickoff-is-booked-when-rga-confirms.mjs "the kickoff is booked when RGA confirms; the RSVP holds nothing up"
run check-the-kickoff-reads-one-state.mjs "every kickoff surface in the admin and portal reads one state and tells one story"
run check-a-sent-email-reads-as-an-email.mjs "a sent email shows as an email: envelope, plan in words, paragraphs, no Change, no Run again"
run check-a-step-title-has-one-home.mjs "no surface holds its own copy of a step title"
run check-every-control-has-a-style.mjs "no button wears a class the stylesheet has never heard of"
run check-the-portal-has-one-button-scale.mjs "the client portal has two button sizes, not six"
run check-a-failed-load-never-says-you-have-not-booked.mjs "a failed load never renders as \"you have not booked\""
run check-a-step-card-never-renders-itself-twice.mjs "a step card renders each string once"
run check-a-settled-step-never-says-do-it.mjs "a finished step never tells the client to do it"
run check-client-copy-is-american.mjs "client copy reads as American, not British"
run sweep-kickoff-rsvps.mjs "an acceptance is noticed without anyone opening a tab"
run check-contract-doc-gets-every-field-it-renders.mjs "the contract document is given every field it renders"
run check-client-work-reaches-the-brain.mjs "every audited client teaches the client brain"
run check-admin-sees-what-the-client-sees.mjs "admin and the client portal share ONE deliverable list"
run check-drafts-use-real-services.mjs  "no draft describes a client using their search term"
run check-approval-matches-what-was-shown.mjs "an approval records the content that was shown"
run check-heavy-steps-cannot-time-out.mjs "no drafting step can exceed the 26s request ceiling"
run check-a-queued-step-updates-the-card.mjs "a queued step updates the card when it lands"
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
run check-owner-facts-are-in-sync.mjs "the five owner questions mean the same thing in both portals"
run check-only-the-client-can-approve.mjs "admin may read a client's portal; only the client may approve"
run check-the-owner-questions-ui-contract.mjs "the owner-questions card behaves the way it was agreed"
run build-owner-questions-mockup.mjs "the approved mockup still matches the schema"
run check-setup-step-count-agrees.mjs "client and admin show the same setup step count"
run check-client-portal-renders.mjs "the signed-in client portal actually puts its cards on screen"
run check-every-client-step-can-be-finished.mjs "every client step declares how it finishes, and the portal honours it"
run check-the-sop-is-not-public.mjs "the raw SOP is staff-only; clients get the projection"
run check-portal-calls-stay-authenticated.mjs "no portal call sends a token captured at boot; every notification is sent and checked"
run check-every-jump-lands-somewhere-visible.mjs "every in-portal jump lands on something the client can see — not a card in a hidden tab"
run check-an-audit-cannot-write.mjs "no audit script can change production; the FGA score measures the record's own URL"
run check-a-question-gets-an-answer.mjs "a client question is stored, emailed and answerable from admin — and the answer lands in their portal"
run check-no-test-data-in-production.mjs "no test scaffolding is sitting in a client's portal"
run check-a-failure-reaches-a-human.mjs "every failure we log can actually reach the admin queue — no declined card or unsent receipt is invisible"
run check-a-truncated-scan-is-not-a-measurement.mjs "the rank baseline runs in-product, and an interrupted scan is never averaged as if it were a full one"
run check-an-unauthenticated-endpoint-leaks-nothing.mjs "an endpoint that cannot require auth never hands out a client email, phone or token"
run check-a-promise-of-automation-has-a-schedule.mjs "every 'we do this automatically' the client reads is kept by a function that is actually scheduled"
run check-no-gate-has-unreachable-code.mjs "no gate carries code after its own exit — in a gate, dead code reports as a PASS"
run check-internal-work-cannot-look-client-facing.mjs "internal audit findings cannot render as an ordinary client-facing card"
run check-review-requests-can-actually-be-sent.mjs "a review request we promise is one the client can actually send"
run check-every-view-survives-a-reload.mjs "every admin view survives a reload and a shared link — no login screen, no fallback to Pipeline"
run check-questions-fit-the-trade.mjs "every approved trade is asked questions that fit it"
run check-client-steps-explain-themselves.mjs "no client step offers instructions it does not have"
run check-we-only-name-tools-we-use.mjs "no client-facing copy names a tool we decided against"
run check-call-metrics-are-not-conflated.mjs "GBP calls and tracked calls are shown separately"
run check-leads-match-the-provider.mjs "tier3 item 1 (11-11): the lead rows equal the provider's own count of 30-second calls (CallRail, Quo, CTM, WhatConverts on fakes + this month's rows live), last 4 digits only, no lead twice, a day not read is never 0, cost per booked job only with a booked job, Quo = the business line, client_leads RLS in its SQL; fails on --against=f113d9c5"
run check-the-monthly-report-reads-true.mjs "the monthly report's numbers and sentences match their inputs, and a tap is never a lead"
run check-admin-step-text-reads-true.mjs "the admin step text carries no invented number, login ask, old cadence or terminal command, in both sources"
run check-no-duplicate-call-rows.mjs "one call, one log row, one lead"
run check-call-tracking-path-is-whole.mjs "opting in to call tracking actually leads somewhere"
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
run check-a-quiet-period-runs-no-live-check.mjs "while the clients' database is in a quiet period, no scheduled check reads it"
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

# ── ADMIN CHECKLIST + CLIENT PORTAL (built 2026-09-29 → 10-01, wired 10-01) ────────────────────
# 🔴 Ten gates existed and nothing invoked them — "a gate nobody invokes is indistinguishable from a
# gate that is always green". Found by check-every-gate-is-wired, which is why that gate exists.
run check-the-checklist-is-one-list.mjs      "the onboarding checklist is ONE list of 60, not two"
run check-the-checklist-has-one-numbering-system.mjs "the disc carries state, .ob-sid carries the identifier"
run check-step-instructions-render-as-bands.mjs "a step's instructions render as bands, not a wall of prose"
run check-a-step-output-takes-its-own-weight.mjs "stored output is weighted, linkified and cannot scroll sideways"
run check-every-detected-step-is-actually-checked.mjs "every clientDone:detected step has a probe that runs"
run check-the-call-console-survives-a-manual-tick.mjs "ticking the kickoff step by hand never removes the console"
run check-the-picker-has-a-way-out.mjs       "the client can close the time picker without changing the time"
run check-the-live-call-surfaces-keep-up.mjs "the Join button and the clock track the call in real time"
# 🔑 These two drive a real browser signed in. No browser / no Supabase env → exit 2, INDETERMINATE,
# which is correct: not a pass, and not a design failure either.
run check-the-checklist-renders-one-list.mjs "60 rows, one pill each, the view switch filtering them — ON SCREEN"
run check-the-checklist-numbering-matches-the-mockup.mjs "the live render matches the approved mockup, property by property"
run check-what-this-produced-matches-the-mockup.mjs "a step's stored output matches the approved output mockup"
run check-a-designed-draft-escapes-exactly-once.mjs "a designed draft parses the raw source and escapes once"
run check-a-step-number-has-one-home.mjs "every surface naming a step number agrees with the page"
run check-the-next-action-performs-the-decision.mjs "the next-action card performs the decision it names"
run check-a-plain-text-output-is-designed.mjs "a plain-text step output keeps the structure its indentation carries"
run check-a-loose-list-keeps-its-numbers.mjs "a loose list stays one list and keeps its numbers"
run check-a-rebuilt-draft-keeps-its-fences.mjs "a rebuilt draft keeps the fence its card is built from"
run check-a-failed-scan-is-not-no-scan.mjs "a failed scan says it failed, never "no scan yet""
run check-a-callout-has-a-kind.mjs "the step's reference fold has one scale and named callout kinds"
run check-an-arrow-points-where-it-goes.mjs "an arrow points the way the content actually moves"
run check-a-local-plan-has-local-terms.mjs "a local client gets geo-modified keywords and in-market locations"
run check-a-keyword-plan-fits-the-business.mjs "the pool comes from the client record and a candidate must be their business"
run check-the-volume-chip-agrees-with-the-step.mjs "every label the step writes maps to a card state, and a kept term is not painted dead"
run check-a-keyword-draft-survives-the-round-trip.mjs "a keyword draft written by the step renders as the card the mockup approved"
run check-the-grid-says-what-it-centred-on.mjs "the rank grid can run, and says what it centred on"
run check-the-grid-measures-the-locked-plan.mjs "the geo grid scans the locked plan, and a scan older than the plan does not count"
run check-a-refusal-names-what-is-on-screen.mjs "a blocked step is refused by number and title, naming the action that clears it"
run check-now-set-to-says-what-the-step-set.mjs "the Now-set-to line summarises what the step settled, never a YAML key"
run check-a-confirmation-names-the-work-done.mjs "every step confirmation describes the work that step actually did"
run check-a-done-step-carries-the-time-it-was-done.mjs "one producer owns a task's shape: done carries its time, reopened clears it, started_at is the real start"
run check-a-note-never-contradicts-the-measurement.mjs "no note on the keyword card states something the measurement beside it contradicts"
run check-a-block-renders-from-the-record-not-the-prose.mjs "a designed panel renders from the stored record, not from whether the step's prose classifies"
run check-the-grid-summary-fits-its-design.mjs "the geo-grid summary is written in the shape its approved design reads"
run check-a-step-output-states-a-time-not-an-age.mjs "a step output says WHEN something happened, never how long ago"
run check-the-step-card-renders-in-a-browser.mjs "the step card renders right in a real browser, not just in a vm"
run check-a-step-declares-who-finishes-it.mjs "an act step declares who finishes it, and its copy agrees"
run check-a-client-step-number-is-declared.mjs "no two rows in the client portal carry the same number"
run check-a-locked-row-says-why.mjs "a locked row names the step it waits on, by number"
run check-the-card-says-what-finishes-the-step.mjs "an active card says what finishes the step, not just that it is active"
run check-a-citation-audit-never-invents-an-absence.mjs "a failed citation search is never reported as a missing listing"
run check-a-finished-step-stays-on-screen.mjs "the step you just acted on is the step you see afterwards"
run check-on-screen-copy-is-us-idiom.mjs "every word a human reads on screen is US English"
run check-a-client-rule-works-for-any-business.mjs "a rule about a client works for a client we do not have"
run check-gh-cannot-run-as-the-wrong-account.mjs "gh cannot act on RGA GitHub as another business's account"
run check-every-identity-points-at-rga.mjs "every live identity on this machine points at RGA"
run check-a-plan-can-satisfy-its-own-step.mjs "a drafted plan asks for enough to finish the step it belongs to"
run check-every-run-is-kept.mjs "every run of a step is kept, and no run is ever rewritten"
run check-a-detected-step-is-never-done-by-running-it.mjs "a step whose completion is detected is never finished by pressing Run"
run check-the-run-strip-matches-the-mockup.mjs "the run history on a step card matches the approved mockup, property for property"
run check-every-detection-is-kept.mjs "every measurement of a detected step is kept, and the number never comes out of the prose"
run check-the-detection-block-matches-the-mockup.mjs "the detection block matches the approved mockup, property for property"
run check-a-run-says-what-it-produced.mjs "a run says what it produced, and the drafted shape is parsed once on the server"
run check-the-gbp-parent-is-built-once.mjs "the Google Business Profile v4 parent is built in one place"
run check-a-photo-reaches-google.mjs "a client's photo reaches their Google profile by itself, or says exactly why not"
run check-a-jump-opens-what-it-lands-on.mjs "a portal button that jumps to a form opens the fold that holds it (browser)"
run check-waiting-on-the-client-is-built.mjs "a client-owned step says it waits on the client, and the nudge, the thread and the how-to each tell the truth"
run check-the-waiting-band-matches-the-mockup.mjs "the live waiting band and client how-to match the approved mockup, property by property (browser)"
run check-a-claim-about-another-surface-is-true.mjs "no surface claims something another surface does not do"
run check-the-deliverable-matches-the-mockup.mjs "the deliverable block and its list match the approved mockup, property for property"
run check-a-button-does-not-lie-about-where-it-runs.mjs "no step button claims it needs a terminal when it runs on the server"
run check-the-ads-api-cannot-run-away.mjs "the keyword planner runs on demand only, bounded, and its numbers stay locked"
run check-an-outbound-call-has-a-deadline.mjs "every outbound call has a deadline and a dead run records why"
run check-a-step-that-produced-something-can-rerun-it.mjs "a step holding a stored result can always re-run it"
run check-the-model-never-writes-the-numbers.mjs "every volume on the keyword card was measured by us, not written by the model"
run check-a-step-never-renders-before-its-dependency.mjs "the checklist never shows a step before something it depends on"
run check-a-confirmation-says-what-happened.mjs "every step confirmation says what happened, not what it produced"
run check-the-banner-matches-its-mockup.mjs "the live confirmation banner matches its approved mockup, property by property"
run check-a-keyword-card-matches-its-mockup.mjs "the keyword card matches its mockup, and a floor never passes for a measurement"
run check-the-step-notes-match-their-mockup.mjs "the step's measurement blocks match their approved mockup, property by property"
run check-a-finished-step-knows-its-input-moved.mjs "a finished step whose dependency re-ran says it is out of date"
run check-a-keyword-plan-is-decided-on-evidence.mjs "one searcher gets one slot, and the plan carries a keyword with reportable volume"
run check-a-keyword-knows-its-surface.mjs "every locked keyword is measured for whether Google shows a map pack for it"
run check-a-sub-location-is-a-real-place.mjs "a sub-location is a real place in this client's own market, not just a real place"
run check-every-marker-the-step-writes-is-classified.mjs "every marker a step writes lands in a panel instead of rendering as raw prose"
run check-the-next-step-card-matches-its-mockup.mjs "the portal next-step card has four states, the ledger beats the stamp, and every property matches its mockup"
run check-a-state-that-belongs-to-nobody-says-so.mjs "a next-action state nobody is holding up is owned by the clock, not blamed on a party"
run check-nothing-is-rga-shaped.mjs "the product is client-shaped, not RGA-shaped"
run check-a-step-email-is-sent-and-seen.mjs "a step's email can be sent, asks first, and reaches the client's portal"
run check-every-setting-can-be-changed.mjs "a step that decided something says so, and can be changed"
run check-signed-in-user-never-sees-login-form.mjs "a working magic link never ends on a login form"
run check-a-thread-email-reads-like-the-email.mjs "an email copy in a step's thread reads like the email (no ## or [link](url) on screen), and a test send says it's a test"
run check-step-12-review-requests.mjs "step 13 is option B (approved 10-23): one customer at a time in the plan card, the request shown as its text, one reminder from day 3, \"Is it James?\" only as the client's question, Done = 5 asked + Google's own count or nothing; never \"sent\""
run check-citations-additions.mjs "Citations additions (approved 11-01): the NAP check reads the listings the audit found, the list fits the client, the recheck ships off and never searches"
run check-ai-search-checks.mjs "AI search checks (approved 11-01): the crawler check reports facts, the readiness audit has no FAQ line and an admin-only score, the Yelp step makes no promise"
run check-onboarding-and-leaving.mjs "Onboarding and leaving (approved 11-01): wording, reminders off until approved and capped at two, the outcome control, the closing list, lower roles, first-week and day-50 notes, the client Cancel card"
run check-reviews-additions.mjs "Reviews additions (approved 11-01): wording, a reply is Replied only once Google shows it, the asked-to-reviewed funnel reads unknown as unknown"
run check-reviews-feed.mjs "live Google reviews on Ongoing work (approved 10-23): the morning read keeps the reviews, \"Is this Maria?\" only when one asked customer fits and only the client answers, no reading is never 0, admin claims no sends"
run check-plan-cards-match-the-mockup.mjs "the done plan cards of steps 1–5 are the approved mockup (no toggle or hairline above the card, \"Call held · Fri, Oct 9\" + time, quiet links)"
run check-setup-steps-read-in-order.mjs "the client's Setup list reads 1 to N in order, and a Done step keeps its number"
run check-a-refused-photo-says-how-to-fix.mjs "a photo that comes back says why and how to fix it; Google's raw text never reaches the client"
run check-profile-answers-reach-google.mjs "steps 8/10/11 put the answer on Google and are Done only when the read-back matches"
run check-step-6-verifies-in-the-portal.mjs "step 6 leads with the profile and verifies by code in the portal, only the ways Google offers"
run check-photos-fit-the-team.mjs "step 7 fits staff shots to the team size and leads with what can be taken today"
run check-back-restores-the-pressed-button.mjs "after Back, a button that left for Google or Stripe is the way it was before the press, in the portal and admin (real Chrome, real back/forward cache, local server)"
run check-the-sign-in-page-behaves.mjs "the client sign-in page does every state of the approved Shopify-style mockup, in a real browser (network mocked, no email sent)"
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
# 🔑 Nothing approved is forgotten (2026-10-08): rebuild the generated mockup registry, then require
# every new mockup to be cited by its system's memory; and run the memory audit STRICT (broken
# links, orphans, files not mirrored to git) so drift fails instead of being logged and ignored.
node scripts/build-mockup-registry.mjs >/dev/null 2>&1 || echo "  ⚠️  build-mockup-registry did not run — the next gate will say what is stale"
# 🔒 the CLIENT STEP LEDGER is generated from the code (Chris 10-20 "harden memory"): memory can't call a step built when the
# portal draws nothing for it. It FAILS (reported) while any client step has no done record.
run build-step-map.mjs "every step in both portals with the number each portal really prints (generated → memory reference_all_steps_map, website reports/steps/rga-step-map.html)"
run check-the-step-map-is-current.mjs "the sheet of every step in both portals matches the steps that exist, each with what it does (Chris 11-1: we can never get numbering wrong)"
run check-managed-portal-numbering.mjs "the managed client portal's numbers are whole and approved, reach a client only through shared/portal-mode.js, and nothing can set a client to managed until every surface is mode-aware (approved client_portal_slim_v1, 11-4)"
run check-managed-surfaces-by-mode.mjs "the 8 surfaces that print a client step number (admin, open moves, waits, Month 1 report, Day 50, open-step email, messages, To do progress) say the CLIENT'S portal's number: self-serve and not chosen identical to before, managed prints managed numbers, step 3 for the five checks, none for RGA cards; plus the admin mode switch, RGA-side hours/attributes save with Undo, and call tracking bought only on a recorded yes (approved client_portal_slim_v1 + admin_managed_move_v1, 11-4)"
run check-managed-portal-list.mjs "the managed client portal's Month 1 list is DRAWN in a real browser: 1 to 7 with step 3 Check what we found (every row from what the portal reads, blanks never guesses) and the five RGA cards; Looks right posts what each form posts; self-serve and no-mode draw today's list (approved client_portal_slim_v1, 11-4)"
run check-managed-admin-cards.mjs "RGA's managed-client admin cards are DRAWN and PRESSED in a real page: step 34 hours (week editor, source + note, Put on Google, Undo, drawn from the read-back), step 35 attributes (proven ticks only, about-you never tickable), step 24 kickoff answer; managed clients only, others draw as before; the shared hours editor; the server read (approved admin_managed_move_v1, 11-4)"
run check-managed-admin-working-cards.mjs "RGA's managed-client working cards on admin steps 27 verify, 28 facts, 19 plan, 32 services (told to RGA, who and when), 26 form tracking are DRAWN and PRESSED in a real page; the who tag and the Client sees chip; self-serve and not chosen draw byte-identical to before (approved admin_client_cards_moved_v1, 11-4)"
run check-managed-step-4-photos.mjs "a MANAGED client's step 4 photos are DRAWN in a real browser for three trades: not managed draws as before, the logo leaves the 20 for a business with no public address, one kind at a time, what counts under the band, the approved words, no overlap 360-1440 (approved client_step04_photos_v1, 11-4)"
run check-managed-steps-5-to-7.mjs "managed Setup steps 5, 6, 7 and one wording per status are DRAWN in a real browser at 375, 768 and 1280: customers already asked counted, Write the request never pale, Emails from RGA, videos in progress + the channel named + Skip this, step 7 waits on the Month 1 report (approved client_step05/06/07 + client_setup_status_protocol_v1, 11-4)"
run check-managed-ongoing-tab.mjs "a MANAGED client's Ongoing work tab is DRAWN and PRESSED in a real browser on a fixed clock: the grey empty reviews card with Go to step 5, step 8 held in Setup, ONE Starts after setup card numbered 8 to 12; Monthly 8/10/12 with 9 and 11 folded (Send a video now), the win story on step 12, step 8 due Monday + No jobs + Pause + the stop rule, step 10 Suggested with no quota, step 12 on the report's month and the late report, ONE Done by RGA panel at the bottom; self-serve and no mode unchanged; the 5th's report is the month just ended (approved 11-5)"
run check-managed-setup-fewer.mjs "a MANAGED client's Setup steps 4 and 5 can be FINISHED WITH FEWER, DRAWN and PRESSED in a real browser for three trades: below the minimum a line names what's still needed, at it the option + one in-card sheet, done with fewer green, moved to Ongoing work grey; self-serve and no mode none of it; the server finishes only managed clients at the minimum and reads back, the nightly check keeps them done, To do drops them, the Month 1 report says the count, admin 38/60 + Advance match (approved client_setup_fewer_v1, 11-5)"
run check-managed-step3-go-ahead.mjs "MANAGED step 3's 7-day go-ahead (approved client_step03_seven_day_rule_v1, 11-5): day counting in Pacific days, the day-5 heads-up, every row's rule for six business shapes, Hold, Undo restoring exactly, no website, a site that can't be read (3 nights then RGA's move), never name/phone/address/category, never a Google write (the real readers, every request a GET), the guards (self-serve, step 3 done, unverified), admin step 28 lifted and the portal DRAWN"
run check-managed-skip-rules.mjs "which client steps can be skipped (approved client_steps_skip_rules_v1, 11-5), DRAWN and PRESSED: step 7 asks RGA to skip the close-out call, step 12 skips one month, RGA's Skip reads Skipped by RGA for everyone and in the Month 1 report, form tracking reads No website form to count, To do never lists an RGA card as the managed client's move; the servers RUN on a stubbed fetch"
run build-client-step-ledger.mjs "every client step draws a DONE RECORD in the portal (generated ledger → memory reference_client_step_ledger)"
run check-every-mockup-is-in-memory.mjs "every new mockup is cited by the memory of its system, and every mockup is registered"
run check-memory-has-no-drift.mjs "memory is linked, reachable and mirrored to git"
run check-colours-come-from-the-system.mjs "every state colour comes from the one approved system, in both portals"
run check-client-emails-tell-the-truth.mjs "no client email says nothing is needed while steps are open; a beta client is never told it paid"
run check-the-client-journey-tells-one-story.mjs "the client sets up their Business Profile now, RGA sets up GA4/GSC in week 1, no Calendly, the playbook says Google before the kickoff"
run check-every-plan-is-wired-end-to-end.mjs "every contract plan: one price from agreement to charge, Accept emails, the welcome email unblocked, DFY balance billed"
run check-google-access-is-told-truthfully.mjs "the portal and privacy policy describe exactly the Google scopes the connect requests"
run check-the-audit-defects-stay-fixed.mjs "the eight Month-1 audit defects (#2–#9) stay fixed"
run check-airtable-calls-are-metered.mjs "every scheduled job meters its Airtable calls; only the read-only check caches"
run check-outreach-emails-went-out.mjs "the cold-outreach emails actually went out on the last weekday (Apps Script runs outside every machine we check)"
run check-the-kickoff-promises-agree.mjs "the call script and the recap promise the same timeline and only cadences that are scheduled"
run check-client-emails-have-one-format.mjs "every client email: letter markup, links as words, one sign-off, American copy"
run check-a-photo-preview-says-when-it-fails.mjs "a photo preview that cannot load says so, never a silent grey square"
run check-photo-lists-are-the-researched-ones.mjs "the photo shot lists are the researched ones for each trade; unknown categories pick nothing"
run check-the-portal-shows-the-trades-own-list.mjs "each trade's client sees its own photo list in the portal (real runner + real renderer)"
run check-photo-examples-match-the-lists.mjs "every photo shot has its own example drawing and people count, served as a fresh build"
run check-a-photo-is-what-rga-confirmed.mjs "a slot shows a photo already on Google only after RGA confirms it; rows hold their columns"
run check-a-done-step-is-never-the-headline.mjs "a step already done never flashes as the portal's next step"
run check-an-upload-confirms-in-its-slot.mjs "a photo upload confirms in its own slot and never reloads the portal"
run check-a-photo-never-goes-up-twice.mjs "the same photo never goes up to Google twice; the photos step leads with the right button"
run check-nothing-goes-on-a-listing-until-it-is-the-only-one.mjs "nothing goes on a Google listing until step 11 confirms it is the only one"
run check-a-client-step-waits-on-what-it-needs.mjs "a client step waits on what it needs: their own earlier step, the listing, or RGA"
run check-a-step-that-opens-is-told-once.mjs "a step that opens after waiting on RGA is emailed once, in the approved words"
run check-a-client-can-remove-their-own-duplicate.mjs "a client can remove their own duplicate Google listing in the portal, and nothing else (run end to end against stubs)"
run check-a-success-clears-the-failure-it-supersedes.mjs "no stored failure outlives the success that supersedes it (every failure field declared with its clear)"
run check-every-mutation-still-applies.mjs "every mutation in every suite still applies to today's code (an anchor that stopped matching proves nothing)"
# 🔒 10-16 — the Google steps' gates run DAILY too (Chris: "never forget, or regress"). Static + headless renders, no production
# reads: a regression in the Google card or steps 6/7/9/10 shows up in this morning's report, not in Chris's screenshot.
run check-one-google-card.mjs "every Google step draws the one approved card, portal and admin alike (tint, drawn icons, buttons under, admin rows take its state)"
run check-step-7-works-in-any-state.mjs "step 7 (business on Google) works for a business in any US state (TX/NY places match only in their own state)"
run check-business-facts-match-google.mjs "step 7 reads Google first, shows each fact beside what the client said, and RGA's changes reach Google"
run check-step-9-hours-card.mjs "step 9 hours: one card, Change hours opens Editing without a write, a switch per day, holidays with their dates"
run check-admin-ai-search-hand-check.mjs "the Month 6 AI check is one answer per tool, never added up; a wrong fact is RGA's finding only; the mentions step promises nothing"
run check-admin-see-what-client-sees.mjs "the admin See what the client sees preview cannot act as the client: scrubbed, inert, sandboxed, read-only, drawn by the client's own card function"
run check-kickoff-why-now-and-blog-choice.mjs "the kickoff why-now question saves only a real answer; the blog card keeps the client's no, owner-only, promising nothing"
run check-admin-photo-zoom-full-size.mjs "the admin photo zoom opens Google's full link, falls back and says so, and states its size"
run check-step-10-booking-link.mjs "step 10 booking link works for any business: Google's own link type, our tag, public pages only, website page finder"
run check-step-11-details.mjs "step 11 details for any business: Google's own groups, identity details only the owner's, RGA recommends only what step 10 proves"
run check-step-13-closeout-call.mjs "step 13 close-out call: every prerequisite with whose move, Month 1's end from the kickoff, admin row 60 lists them"
run check-a-closeout-booking-never-touches-the-kickoff.mjs "step 13 close-out booking: pick, confirm, list, read, withdraw, cancel each scoped to ONE call (kickoff_slot_holds.purpose); the kickoff path unchanged"
run check-step-23-competitors-find-the-listing.mjs "step 23 competitors: a short Maps link falls back to the connected profile pin, then its Place ID; own listing excluded by Place ID; nothing measurable → indeterminate"
run check-step-18-nap-is-confirmed-per-listing.mjs "step 18 citations: Done only when RGA confirmed the NAP of every listing found, on its own URL"
run check-monthly-posts-go-live-before-done.mjs "Monthly Google posts: approval freezes the posts, one goes live per week, read back, Done only when all are LIVE; never doubled; client's own site on the button"
run check-youtube-clips-come-from-the-client.mjs "YouTube clips: 2 validated scripts; the client uploads (own folder, verified, 50 MB) or links; Done needs both"
run check-legacy-runners-retired-and-reports-built-here.mjs "row 29 reads Google; rows 34/35 worksheets retired; Monthly 24 + Month 1 reports built server-side; the send stamps Monthly 25"
run check-the-mature-stage-reads-what-is-measured.mjs "Mature rules at their new home (Account health 28-30, quarter steps 31-33): churn needs 2 signals from 2 whole frozen months, unknown is never 0, letter inside the one report, referral ask only at a trust moment to a confirmed address, searches capped at 2, no area for a storefront"
run check-account-health.mjs "mature_account_health_v1 (11-10): the Mature checklist/endpoint/live Google read/Advance target/'Tell the client'/setup-era stage-6 cards are gone; steps 28-33 numbered after 27, universal fixtures (months 3/4/5/6/12, missing number, no sign-in, past due, notice, skipped+undone, closed month); fails on LIVE_BEFORE and on --against=ddfe1a8f"
run check-every-service-key-function-checks-its-caller.mjs "security: every function holding the service key checks its caller (auth helper, session, signed token, internal or fail-closed secret, schedule) or is public on the record"
run check-review-requests-ask-everyone.mjs "review requests ask EVERYONE: no gating, no incentives, no drafting notes reach a customer (Google review policy)"
run check-step3-website-access.mjs "step 3 website access: one audited 22-builder source, detector ties (Square>Weebly, Showit>WordPress), done never asks, tiles + Change, conversation at the bottom"
run check-step3-admin-identity.mjs "step 3 RGA Admin identity: clients invite access@ / GitHub rocketgrowthagency-admin, never hello@; data = portal = admin"
run check-step3-github-accept.mjs "step 3 GitHub accept from admin: runs only as rocketgrowthagency-admin, accept → Write + their domain (strict) → grant; admin row 8 states + access@ invite links"
run check-step3-admin-accept-buttons.mjs "step 3 admin row 8 GitHub card: every button clicked in Chrome, readable, sends the right request; Ask the client sends only after Send"
run check-step9-keeps-access-safe.mjs "step 9 keeps access safe: settles itself with step 8, asks RGA only to save a new builder login once, never the store-a-password draft"
run check-a-change-request-is-one-flow.mjs "ask for a change on a finished step: one Need a change?, our own inline error, one band, With RGA, RGA's same-day move in To do"
run check-a-new-city-page-is-planned-from-data.mjs "row 45 plans one city page from data (sitemap · Business Profile · plan), refuses invented numbers, a website change with every file on the client's card"
run check-a-real-page-publishes-safely.mjs "website_system_v2 builds 8-9: a real page built from their own template, exactly the approved files by pull request through every safety check, all on fakes"
run check-a-live-page-stays-true.mjs "website_system_v2 builds 10-12, 14, 16: read back on 7 checks, nightly drift reopens, Search Console at 2/4/8 weeks or not enough data yet, a step drafts itself once (off by default), a made-up address must 404, Google's link keeps its own checks"
run check-the-title-recipe-holds.mjs "title_meta_recipe_v1 (11-7): step 43 drafts by the locked recipe (evidence, three options from the pinned newest model, rule checks, rule pick, measured after); RGA, plumber with no price, no Search Console, long name, two cities"
run check-the-headline-recipe-holds.mjs "headline_cta_recipe_v1 (11-7): step 44 drafts by the locked recipe (today's headline, line, button read live so each replaces; three options; rule checks); RGA, plumber Call now, no line today, long name, booking button"
run check-a-new-page-wears-the-site-design.mjs "page_builder_site_design_v1 (11-7): a new page is built in the closest real page's whole layout, words swapped slot by slot, pictures and emptied cards dropped, the fit checked like a draft and following every fix; a stale fit falls back to the plain page with why"
run check-a-page-is-placed-and-linked.mjs "page_placement_and_links_v1 (11-7): step 45 reads every page before deciding (a service another page covers isn't built twice), ranks services by the plan, writes a page only for its own searches, and the client's link count is the built page's"
run check-business-details-start-from-the-page.mjs "schema_merge_v1 (11-7): step 41 starts from the business code already on the page (true details kept, missing added, only wrong ones changed with why, one block left, never drafted blind); the card says per detail already there / added / changed"
run check-code-changes-publish-themselves.mjs "schema_merge_v1 parts 2-3 (11-7): an approved code change goes up by itself (by pull request, or the Mac publisher for a site RGA deploys itself), is read back field by field and watched nightly"
run check-step-50-links-the-whole-site.mjs "page_placement_and_links_v1 part 3 (11-7): step 50 reads every page (menu apart from words), finds what nothing links to and thin service pages, drafts one checked sentence per link on the most related page, builds it exactly, reads each link back and watches it nightly"
run check-place-pages-follow-the-research.mjs "website_steps_46_50_research_v1 (11-7): steps 46 and 47 never make a doorway (business model first, never the home city, proof per place, a swapped-name copy refused, a service x place page only with its service page, searches and proof)"
run check-step-48-uses-first-hand-material.mjs "website_steps_46_50_research_v1 (11-7): step 48's posts are first-hand, from the client's result, customer words, published photos and searched questions"
run check-admin-code-result.mjs "admin_code_result_v1 (11-8): what a code step produced on several pages is a table (page, what Google reads it as, path, state), one footer, live and replaced runs marked"
run check-a-blocked-publish-warns-admin.mjs "admin_publish_blocked_warning (11-8): what stops a client's website changes going live is a red warning in admin (five cloud checks, nightly and before each pull request), and only a found problem warns"
run check-the-video-move-is-safe.mjs "rga_videos_to_storage_v1 (11-8): outreach videos move to file storage only when storage reads each back identical; resumable, one run at a time, nothing deleted; System health shows Running then Done"
run check-the-site-is-published-one-way.mjs "rga_videos_to_storage_v1 (11-8): nothing publishes RGA's site around deploy-site.sh; its GitHub mode waits for that commit's build and verifies by content; new and rebuilt videos go to storage first"
run check-every-outreach-video-plays.mjs "rga_videos_to_storage_v1 (11-8): every outreach video plays from file storage at its own address, full size, read LIVE; taken-down videos stay blocked"
run check-the-host-builds-rgas-changes.mjs "website_access_host_builds_v1 (11-8): setup proves the client's host builds RGA's changes (hidden test PR, the host's own GitHub report); a refusal offers merge-myself or add-RGA and blocks only while RGA merges"
run check-rga-acts-through-its-app.mjs "rga_github_app_v1 (11-8): RGA changes a client repository through its own GitHub app when installed (Netlify builds bot commits on every plan), else the RGA Admin key"
run check-a-client-installs-rgas-app.mjs "client_github_app_install_v1 (11-8): a client installs RGA's GitHub app from their portal; a signed state, GitHub confirms the install, only the repository that IS their website is recorded (via github_app, read back), else nothing written"
run check-website-access-gaps.mjs "website_access_gaps_v1 (11-8): a removed app is noticed in two reads and recorded; website work waits until access is proven; admin names who acts; the app removes itself only from this client's own repositories"
run check-the-access-test-runs-itself.mjs "auto_access_test_v1 (11-8): the access test is approved in the click that gives access (Install card / consent tick, word for word) and then drafts, sends, approves, publishes and comes down by itself; old consents never count"
run check-end-of-service-runs-itself.mjs "client_offboarding_v1 (11-8): end of service runs itself: files, real number back, stop, leave website + Google, delete Google figures, each read back; the confirmation sends only on a staff press once every line is marked"
run check-three-small-fixes.mjs "three_small_fixes_v1 (11-8): already right after an unsent draft reads Already right; the client reads Line N, admin keeps the reason; the portal knows a service ended from its end date alone"
run check-a-stuck-change-says-so.mjs "publish_failure_shows_v1 (11-8): an approved change whose snapshot / pull request / merge was refused is written on the step, shown in admin with the reason, listed in the red warning, retried hourly; the client reads only Going up soon after a day"
run check-citations-52-55.mjs "citations_52_55_v1 (11-9): admin steps 52-55: the list is data and fits the trade, the pack is read from Google, live only on a positive read, not-for only by a person, a skip counts as finished and is in the Month 1 report, the look is capped"
run check-a-mention-counts-only-when-seen-live.mjs "tier3_best_in_class_v1 section 3 (11-11): best of lists and mentions: Listed only on a 200 read under 35 days naming the business, a page that wouldn't open is Could not check, pay-to-be-listed never pitched, searches above the reserve only (2 to 4 a quarter), nothing sends by itself, nothing runs before the SQL"
run check-steps-59-63.mjs "steps_59_63_v1 (11-9): admin steps 59, 60, 63: the review message is the one sms_1 the product sends (Edit, Rewrite checked by the review rules before it replaces), their review link, the count of customers asked and who marked it, a skipped close-out call is a plain card with Undo, no Run again, a count's noun agrees with its number"
run check-step56-reads-step52.mjs "step56_reads_step52_v1 (11-9): admin step 56 is step 52's Bing Places + Apple Maps rows (one record, settled in the same write and nightly), a hand tick they don't prove reads Done, but not proven, Skip/Undo only on 56, no runner; the service area lists each town once with the state once"
run check-a-step-result-is-never-lost.mjs "11-9: two steps saving at once both keep their result (flow-execute saveTaskState writes only if the record is unchanged, re-reads and retries, throws rather than overwrite; _step-record writes move updated_at)"
run check-steps-57-64.mjs "steps_57_64_v1 (11-9): every admin step skips (one shared Skip: a reason, the 52-56 record, Undo exact, refused on done and on the hand-off) and every row opens with What it does / When it moves (never Press X); 57 is one search with no model and only a positive match is their profile; 58 is one card done by channel + Pasted; 61 reads Google (0 reviews done by itself); 62 builds itself and Send names the recipient; 64 runs itself and names what carries over; the morning run starts each in its turn, claimed first, with a search reserve, leaving test clients and skipped steps alone"
run check-the-morning-run.mjs "steps_57_64_v1 (11-9): the morning run: a step starts when its dependencies are settled (skipped counts), the knowledge panel re-runs a quarter later, the handoff waits on the report and the close call, test clients out, searches stop at the reserve, a throw is never done, the stamp is read before and after"
run check-the-months-are-kept.mjs "monthly_v1 (11-9): every month is kept: numbers (Month 1 closed Nov 9 -> December = 2), openMonth idempotent + read back + carry-over, the hand-offs open the next month and close the finished one, a closed month refuses writes, works before and after the SQL, a report row on a real send only and never the test, the removed Monthly blocks are gone"
run check-monthly-start.mjs "monthly_start_v1 (11-9): Start of month: the focus rule from last month's real numbers (no model, a missing number is never zero), the tasks from RGA's own list, Open the month (no Skip, no buttons, carried-over listed, couldn't-open says why), Use this plan writes and reads back, Change the focus, Skip, the done card, tasks_for_month gone, the portal focus line, every Monthly step open by its own dependencies"
run check-monthly-weekly.mjs "monthly_s2_weekly_v1 (11-9): Every week: week strips from data, asks counted and reviews a result, an approved reply posts itself and is read back (never unapproved, failures say why and retry, Month 1 step 61 the same), posts plan vs live, photos optional, Skip this week / step, titles"
run check-monthly-weekly.mjs "monthly_s2_weekly_v1 (11-9): Every week: week strips from data, asks counted and reviews a result, an approved reply posts itself and is read back (never unapproved, failures say why and retry, Month 1 step 61 the same), posts plan vs live, photos optional, Skip this week / step, titles"
run check-monthly-quarter.mjs "monthly_s4_quarterly_v1 (11-9): Every quarter: shown only in months 3/6/9/12, the link steps merged, Not sure never blocks, links count only when seen live, profile changes need the client and are read back, overlap runs itself, a story needs the one-tap yes, a video counts only when live, the lead test hides without call tracking, the quarter block in the report, nothing blocks the close"
run check-monthly-before-january.mjs "monthly_before_january_v1 (11-9): RGA's live tracking case reads Working with its data date, a quiet month is a neutral line and Check it needs evidence, the client's yes cards call portal-quarter-answer, holiday hours go through the existing write path, the posts-per-month choice is saved/read back/drafted to, a link is live only when the page names the business and links to its website"
run check-supabase-security-advisor.mjs "11-10: no ERROR in Supabase's security advisor (a table with RLS off was found by Supabase, not us) and every new table in our SQL enables RLS"
run check-scheduled-jobs-find-claude.mjs "11-10: every Mac schedule that runs claude finds it with its own PATH (the weekly audit failed \"claude not found\" after Claude Code moved to ~/.npm-global/bin)"
run check-email-engagement-is-counted.mjs "11-10: a Gmail open counts, a click proves an open (Email Opened, so the Apps Script never suppresses a clicker), and Calls takes back auto-suppressed clickers only"
run check-every-outreach-link-resolves.mjs "11-10: every page link the outreach emails build (audit button, video page) opens a live page; /growth-audit/ 404'd for 10 days after the catch-all went"
run check-admin-dashboard-opens-on-itself.mjs "admin_dashboard_top_v2 (11-9): the admin Dashboard opens on itself: no to-do card above it, System health on its own tab, the Blog card on its client's Website Work tab, the blog's presses counted once (To do rows + one Dashboard line)"
run check-client-monthly.mjs "client_monthly_v1 (11-9): the client's monthly side: between months (any kickoff day, a skipped report, any timezone), posts chosen never a fixed 4, the next step reads the same open steps as Ongoing work, the Month 1 letter in client words with its window or no baseline line, month rows numbered and closed by the morning run; fails on the before state"
run check-one-current-month.mjs "master map Tier 1 (11-11): ONE current month: one rule (shared/month-now.js) read by the portal, the admin, admin-months, _step-record and the hand-off; the morning run writes only to that month (between months: replies only, in Month 2); monthly work only in the month row; retired ids acted on by no code; Stage 6 starts by itself at Month 4"
run check-tier2-steps-run-themselves.mjs "master map Tier 2 (11-11): a signed Standard Plan accepts itself after 15 minutes (RGA can Hold); Setup moves on when Google found a service; Monthly blog posts on the website autopilot; categories only through admin-gbp-categories once the client saw them; form tracking settles itself; Bing imports only when it copies the truth"
run check-setup-vs-month1.mjs "setup_vs_month1_v1 (11-10): Setup is Getting started (3 steps, each skippable with a reason and Undo; Setup complete = those 3 done or skipped, never RGA's own tasks); Month 1 work is the first month card (reviews optional with first-review wording, videos counted only on the client's own channel, call-tracking choice, close-out call at the end); a client's unanswered question is a late RGA To do row after 2 business days; fails on the build's before state"
run check-portal-has-no-em-dash.mjs "11-10: no em dash in any text a client can read in the portal (strings, templates, toasts, stage labels, index.html, portal.css); an empty number tile is the en dash; fails on the build's before state (153 hits at 87c6fdbe)"
run check-call-to-client.mjs "call_to_client_v1 + call2_console_v1 (11-10): a walkthrough is booked from the call card into the one ledger (purpose walkthrough, press = send), reminders at 24 h / 1 h only for an accepted walkthrough or booked kickoff and each sent once, Call them now at +2 min, texts OFF while Quo is down, the console beats come from the playbook, Start as a client is one press (founding places from the real cap, standard when full, beta admin-only and never public), Opened-not-signed gets one reminder, and the FAQ agrees with the pricing page"
run check-master-schedule.mjs "master_schedule_v1 v5 (11-10): no call row is ever deleted, a taken time is greyed not hidden, one slot finder, every time shows its zone (Eastern/Central/Arizona/Hawaii, DST), the Schedule tab has its views/filters/panel/banners, nothing errors before the SQL is run, two staff keep separate hours, and a call-card booking and a client pick on one slot at once give exactly one winner"
run check-schedule-matches-mockup.mjs "the live Schedule tab renders like the approved mockup (11-10): one admin card, human range, hourly Week grid on the working hours and days, one colour per call kind, Day list, Month counts, click panel buttons, admin button classes, no old day boxes or native controls"
run check-schedule-system-v6.mjs "every control and popup in the admin Schedule opens and matches the approved v6 mockup (11-10): top bar, Go to date, Day grid, empty-time menu, Set your hours visible, Block time in Pacific, every call panel, the orange Reschedule/Cancel dialogs, status lines, badge; the gate never sends anything"
run check-dialog-tone.mjs "admin dialogs wear the right kind: a redirect to Google is INTERNAL, mail and invites THIS REACHES THE CLIENT (11-10 free/busy pill)"
run check-business-phone-never-a-contact-cell.mjs "business_phone_only_v1 (11-11): the business phone is identity_phone; a contact's cell never stands in for it (duplicate cleanup, account health, step notices, call tracking, end of service)"
run check-twin-suppress-job.mjs "11-11 opted-out twins: the website's daily lead-twin-suppress (13:00 UTC, before the 7 AM Pacific send) suppresses a live lead sharing a website or inbox with an opted-out one, by check-duplicate-identity-leads' exact rule; set-only, cap 50 (51 = none + an error), platform and free-mail domains skipped, TWIN_SUPPRESS=0 off, a refusal is its System health error; fixtures only"
run check-places-cap-is-said.mjs "11-11 Places SearchText 32/day (never raised): every caller asks the shared daily budget first (map ranking, then the profile watch, then free audits, then the backfills), and Google's 429 is said and recorded, never read as not found / not ranked / no hours; fixtures only"
run check-call-names.mjs "call_names_v1 (11-10): the six call names (Intro call, Audit walkthrough, Kickoff call, Month 1 review, Monthly check-in, Quarterly review) everywhere a person reads, no close-out or bare Call 1 / Call 2, internal ids unchanged"
run check-one-wording-per-fact.mjs "master map 11-11 (decisions 1-5 + Tier 1 wording): one wording per fact in client text: the monthly check-in is about 20 minutes (we hold 30) from the ONE call-length setting every booking path reads; photos done at 3 of each kind, 20 the goal; first reviews ask at least 1, aim for 5, sent to the 5 most recent; the win story quarterly; one video from two scripts, about 60 seconds, no editing promised; canceled; texts promised only when on"
run check-master-sop-is-current.mjs "master SOP 11-11 (reference_master_sop): the website's docs/master-sop never goes stale: the steps data is the playbook + managed steps + closing list + stages exactly, every scheduled job is in the checkers schedule, every table named in code is in the database area once its data lands, an approved area has its artifact URL, SOP.md / index.html / chapters.json equal a rebuild from today's data, the data lives in one place, /docs/* is 404; could-not-tell until website branch master-sop is merged"
run check-monthly-close.mjs "monthly_s5_close_v1 (11-9): Close the month: freeze (not given never 0, the 30-day rule), the letter from the frozen record refuses a missing number, send (named confirm, kept, listed in the portal, test to the admin only), NOTHING sends by itself (the 5th builds only), the To do on the 5th, the optional call + Quarterly review, send/skip then open next then close this"
run check-monthly-once.mjs "monthly_s3_monthly_v1 (11-9): Once a month: the merges (no dangling id), no Run button or hand tick, scans compared like for like, numbers not measured never 0, new competitor flagged, site health says what it did not check, blog 0 is fine, focus work settles from its tied steps, listing upkeep from the jobs, the settle proves before it writes, the morning run starts monthly replies on a new review"
run check-step58-reads-youtube.mjs "step58_youtube_readback_v1 (11-9): admin step 58 reads the channel description back from YouTube (API key, no sign-in): a match finishes the step by itself, a difference is RGA's move beside what YouTube has, a read that cannot be made says why and is never matches or missing, Pasted only while there is no key, Check now read back, the morning run is a free read, Copy is exactly what Studio takes"
run check-step-25-reads-google.mjs "step25_tracking_from_google_v1 (11-8): step 25 verifies GA4 + Search Console from Google's own data (14 days), names what is missing, re-checks daily, admin draws the lines"
run check-out-of-date-means-something-new.mjs "out_of_date_means_changed_v1 (11-8): out of date only after something new; a found-nothing re-check never; baselines say The starting …"
run check-step-17-judges-speed-like-google.mjs "step17_speed_and_send_now_v1 (11-7): real visits decide, the lab on Google's same lines otherwise, a hair over = Done watched, clearly over = a fix naming the cause; a shared banner is the site's"
run check-the-page-builder.mjs "website_system_v2 builds 3 to 6, 15: brief from Search Console + competitors (unknown is never a finding), proof only from the client, one pipeline for any client, stuffing blocks the send, an edit changes only named lines"
run check-website-pages-are-website-changes.mjs "website_system_v2 builds 1-2: page steps wait on what makes them true (both SOP copies), are website changes, stay open until the last page is live, an edit names its lines"
run check-website-rows-are-step-8-cards.mjs "the admin website rows are the approved step 8 cards (11 states rendered in Chrome): draft ready, a guarantee flagged, editing without Kind/Where boxes, with the client, publish, live"
run check-the-access-test-publishes.mjs "the access test page: built in the site's own template (no sibling words), published as a pull request from RGA Admin with exactly the approved file, only after the client approved"
run check-every-website-change-is-built-labelled-approved.mjs "the hard rule: every website change built → labelled (adding / editing / removing a page · code) → approved → only that build uploads; the private preview; §5A in the agreement"
run check-the-nav-badge-matches-the-mockup.mjs "the client menu's number badges = the mockup's solid circle (approval_tab_and_sent_card_v1), and no menu label ever wraps (\"For your approval\" split once)"
run check-an-approval-shows-its-receipt.mjs "after Approve the client sees the receipt (approval_confirmed_v1): what, who, the exact version, what happens next; never \"Nothing is waiting\" or \"You asked for a change\""
run check-admin-fixes-1028-hold.mjs "admin_fixes_1028_v1: an approved website change is RGA's move; Check Google now never writes to Google; the plain file list; no \"row\" in admin text"
run check-an-upload-proves-it-is-the-right-website.mjs "publish_safety_checks_v1: six checks before any pull request, its files read back, who merged, the rest of their site re-read after live"
run check-the-payment-welcome.mjs "admin_last_research_items_v1 item 4: the welcome at payment, exact words, the reminder line only when on with a computed date, once per client, never for a test client or when suppressed, nothing when Google is connected, a failed send never fails the webhook"
run check-approvals-page.mjs "For your approval: Needs you (open only) · With RGA · Done (collapsed while something needs them); the duplicate confirmation is a Done row"
run check-website-change-approvals.mjs "every website change goes through For your approval: all Month 1 website steps; draft → send → the client approves THAT version → Mark live reads the page back → done; no run or Mark done skips it; the inbox"
run check-site-snapshot.mjs "before-snapshot + access ledger: read-only snapshot of the client's public pages (sitemap, top pages first, capped, blocked pages with a reason), re-read before write, removal recorded with when + how"
run check-step-37-describes-real-photos.mjs "step 37 describes the photos really on their website: each photo read and looked at, never guessed, up to 40, Done on its own only on a full read, each description read back on its photo, the card's six states"
run check-a-held-kickoff-cannot-be-reopened.mjs "a kickoff call that happened (recap sent or time passed) can't be reopened from the portal: \"Not right?\" instead of Change; the server refuses"
run check-a-confirmed-step-is-locked.mjs "a step RGA confirmed is locked for the client: no reopen/overwrite, Not right? always, Request a change, admin Unlock with a reason; every portal writer goes through shared/step-lock.js"
run check-a-toggle-names-what-it-opens.mjs "every step toggle names what it opens (How to do this / How this step works / What RGA does here), and RGA's email in instructions is a copy chip"
run check-admin-steps-29-38-match-mockups.mjs "admin steps 29–38 + client step 4 done card match the 11 mockups Chris approved 10-29 (week tiles, live description, one Draft button, service area first)"
run check-a-stray-rejection-never-blanks-the-admin.mjs "a stray promise rejection never blanks a loaded admin (the boot-failed view is for a failed BOOT only; found 10-29)"
run check-step-36-booking-every-scenario.mjs "admin step 36 every scenario + Put it on Google + the client's Keep it / Change it + the Remind popup (business name, real email, X) + an X on every popup (step36_booking_rga_does_it_v1, approved 10-29)"
run check-client-step6-card.mjs "client step 6 says what's on Google AND what RGA is still adding (client_step6_categories_services_v1, approved 10-29)"
run check-client-card-system-batch1.mjs "client steps 2–9 draw ONE card design (client_card_system_v1, approved 10-29): the state icon, the foot, one Change something under; step 4 all five facts, step 5 too specific to count, step 9 no Book preview + Keep it on data-bk-putkeep; a Denver, a Toronto and a London business"
run check-client-card-system-batch2.mjs "client steps 1 and 10–15 on the ONE card design (approved 10-30: client_step11–15_v1, client_step01_kickoff_v3, client_step10_photos_v3): the 15-step set, the 11/12/14/15 pills, step 11 Cancel, step 12 green None yet, step 14 Optional + grey skipped card, step 15 only what's left, step 1 the calendar in the card (tap marks, Request this time without a dialog, every hook kept), step 10 the tiles + one shot keeping every upload hook; a Denver, a Toronto and a London business"
run check-client-steps-3-4-8-forms.mjs "client steps 3, 4, 8 inner forms on the ONE card design (approved 10-30: client_step03_builder_v2, client_step04_fact_check_v2, client_step08_details_v2): the consent + promise words verbatim, the button under the card and off until consent, the builder's own time on the band, one How, the save bodies key by key, nothing wider than a phone, for a builder site, no website, a storefront and a service area"
run check-client-steps-6-9-forms.mjs "client steps 6 and 9 open forms on the ONE card design (approved 10-30: client_step06_services_v2, client_step09_form_v2): one card, the button says what's true, same save bodies, Google lists none finishes, past 10 categories refused"
run check-client-portal-tabs.mjs "the client portal tabs (approved 10-30: client_portal_tabs_v1): Ongoing during setup says what the real steps say, one count, Setup shrinks only when signed, paid and connected"
run check-client-data-backup-works.mjs "the nightly client data backup copies every table and file whole, leaves no key on the drive, keeps old copies, fails loudly, and ran in the last 36 hours (rga_data_backup_plan_v1, Chris 10-31)"
run check-internal-files-are-not-public.mjs "everything in the website repo is public by decision or blocked at the edge: server code, scripts and SQL were readable by anyone until 10-31"
run check-a-backup-restore-check-can-fail.mjs "the monthly restore check passes a whole backup, fails a damaged one, says can not tell without a drive, prints no row and writes nothing"
# Monthly restore test: only on the 1st to 7th, reads the newest real backup back from the drive (exit 2 = cannot tell, e.g. drive not mounted: reported as indeterminate)
if [ "$(date +%-d)" -le 7 ]; then run check-a-backup-restores.mjs "the newest client data backup restores: every table parses and its rows match its own manifest (monthly, 1st to 7th)"; fi
run check-lacie-backup-works.mjs "the daily backup of chats, memory and both repos to the Mac and LaCie copies, removes nothing, carries no .env, fails loudly, and ran in the last 36 hours (Chris 10-31)"
run check-google-keys-are-sealed.mjs "a Google sign-in key is never stored in the clear (pending_and_google_security_v1): sealed when saved, revealed only to use it, every stored key really is sealed"
run check-google-login-has-one-home.mjs "one function swaps a stored Google key for a token (approved 11-1): nothing else POSTs a refresh grant except the named exceptions, sealed keys are revealed and plain ones pass through, one request per call, and every merged copy keeps its words, its failure shape and who saves"
run check-core-changes-are-asked-each-time.mjs "a client's Google name, address, phone or main category changes only with their approval of that exact value (client_core_change_approval_v1): the guard refuses the rest, the send checks and reads back, put-back asks, the nightly check compares the main category"
run check-month-log-and-proof-links.mjs "the monthly report's what-else log and proof links hold (report_and_measurement_v1): hours and phone changes the nightly check saw are logged on the month's record only, the report prints them dated and says unlogged changes may still have happened, proof links are web addresses from the work log only"
run check-gbp-safety-steps.mjs "the Google profile safety steps do what the approved page says (gbp_protocols_v1): an open suspension stops every automated write, recheck dates reach To do, the website link stays on their site and is read back, the procedure matches contract 6A, the pin line and the taps label hold"
run check-google-changes-wait-for-consent.mjs "no Google profile write without the client's recorded OK (client_google_consent_v1): refused, withdrawn, unreadable all stop it; the tick is at Connect, the record in admin step 2; calls aren't recorded"
run check-the-founding-plan-and-billing-day.mjs "the contract's money terms are what the code does (contract_v2_redline + pricing_page_v3): founding bills 625 x3 with a real minimum, one calendar billing day, a notice prorates and stops billing, the invoice matches the charge"
run check-the-sale-and-the-name-stay-gone.mjs "no sale, no struck price, no Q&A on any public page; no owner's name in any served file (v/ excluded); one plan; the founding cap stops at 5"
run check-the-public-site-tells-the-truth.mjs "the public site says only what the contract and code back: approved words, no false lines, one footer with Google's notice, FAQ schema equals the page, exposed files blocked, wrong URLs 404, sitemap dates from history"
run check-the-weekly-audit-is-read-only.mjs "the weekly audit can only read, never change anything"
# 🔒 System health (admin_system_health_v1, 10-31): every automated job checks in, silence is an alarm, and the Mac watches the watcher.
# 🔒 What we keep (data_keep_v1, 10-31): raw copies, grid per pin, Search Console rows, dated benchmarks, frozen reports, the 30-day purge (OFF), the admin row. Fakes only, nothing real called.
run check-data-keep.mjs "what we keep is kept and can't quietly stop: raw store strips secrets and never overwrites, Search Console can't loop, the purge is off and deletes only after its ledger line, the admin row reads true"
run check-google-data-has-an-expiry.mjs "no copy of Google Business Profile content ships without an expiry: every Business Profile file is classified, every Google column and saved answer is on the 30-day delete list, the daily sweep is wired, checks in and ships OFF"
run check-rank-schedule.mjs "the map ranking really runs: the locked main keyword only, two scans a month at 10:00 client time, recorded so it cannot repeat or double-run, a failed pin never reads as not ranked, 25 searches a scan with the provider count read first"
run check-system-health-covers-every-job.mjs "every scheduled job is on the list, wrapped, on the right schedule, and the table and its guards match"
run check-job-status-reads-true.mjs "a job's state is worked out right, and empty, unknown and not-set-up never read as OK on the admin card"
run check-job-alert-path.mjs "break a job on a fake: the check-in records it, the watcher alerts once then daily, a success clears it, an undelivered alert is on record"
run check-job-watcher-ran.mjs "the hourly job watcher itself ran (the Mac watches the watcher)"
run check-airtable-refusals-are-never-silent.mjs "an Airtable refusal is never read as no records or done: every caller checks the answer through _airtable-ok, and the helper throws on every refusal shape (the Nov 3-6 outage)"
run check-the-contract-promises-only-what-the-code-does.mjs "the agreement promises only what the code does; the public pages drop the 60-day claim and the double price"
run check-audit-decisions.mjs "the seven audit decisions (approved 10-31): bulk photos at 5 a day, Everything on Google, a service-area client can finish step 10 in one count, the kept copy says what's true, one press for an approved description behind the two guards, up to 48 hours as an estimate, the listings check once per client"
run check-step10-photo-truth.mjs "step 10 says only what Google tells us (Chris 10-30): no green until a test proves it, the count leaves out a hidden logo and second copies, Keep undoes, the only visible photo stays, up to 5 a day, RGA notices really send"
run check-step11-photo-labels.mjs "step 11 photo labels (owner 11-4): the shot name under every tile, the status a chip on the photo, Saved not showing always says why, no Remove on logo or cover"
run check-step10-upload-help.mjs "step 10 upload help (client_step10_upload_help_v1): hint under every upload box, chips above the tiles, a size note, the AI look at upload once per photo as advice only"
run check-a-tick-never-sits-on-nothing.mjs "step 12 forms (client_step12_forms_v1): named for its result, and a tick never sits on None yet or a zero"
run check-a-blog-post-goes-through-the-website-pipeline.mjs "a blog post goes through the website pipeline (admin_blog_step_v1): material or 0, 2 a month, only the client's yes to that version, read back live; RGA's own needs someone reading it"
run check-the-social-profiles-step-says-only-what-it-saw.mjs "social profiles step (client_social_profiles_v1): reads only their website, linked / not linked / could not check, only the client answers, the links go through their approval"
run check-the-phone-lines-figures-square.mjs "monthly report phone line: total = answered + missed from one list, the 30-second count labelled apart, nothing shown that cannot be squared"
run check-the-blog-check-says-only-what-it-saw.mjs "step 47 blog check (admin_blog_step_v1): found / didn't find / couldn't check, never a flat no blog; a refusal is never none"
run check-the-site-archive-is-add-only.mjs "step 8 site archive (admin_site_archive_v1): 25 pages + the sitemap per capture, the rest counted, add-only, Not set up until the SQL is run"
run check-client-open-calls.mjs "client portal open calls (approved 10-30: client_open_calls_v1): Google unreadable says reload with no button, verify-again card and hold from the client's own profile, step 9 names the tool, on-Google words, said-no shows one button and the form opens on press"
run check-google-numbers-read-live.mjs "Google's numbers are read live (approved report_live_google_30_day_v2, Part A): one reader with a status per field, a failure is never a 0, 429 retried and every request bounded, the 30-day cache a fast path only, the door staff-or-owner with no key out, the email says so when Google fails, no screen reads a stored Google column"
run check-monthly-value.mjs "the monthly What we watched card (approved 10-31: client_monthly_value_v1): every line is a recorded reading or says it was not read, Google numbers read live and a failed read says so never 0, the website check refuses private addresses and is bounded + read only, no schema change"
run check-blog-system.mjs "the blog system (approved 10-31: blog_system_v1 steps 1-8 + blog_cleanup_v1): the 14 link rules, verdicts that refuse noise, an API error is never 'not indexed', no table = Google asked nothing, no noindex/redirect/auto-publish, posts + new pages clean, the press records and applies nothing"
run check-client-card-system-batch3.mjs "the Ongoing work tab on the ONE card design (approved 10-29: client_step16–20, client_ongoing_*): 16 period + due date follow the cadence, done keeps its controls, missed; 17 sent ≠ used; 18 no quota, With RGA, counted on Google; 19 skips itself; 20 wait is a card; posts live only when live; replies from Google; win story reaches the client"
run check-step-7-hours-editor-v2.mjs "client step 7's hours editor is the approved V2 (10-30): Set hours / By appointment first with its cost, holidays counted, closed days say —, phone rows stack"
run check-a-covered-area-never-touches-google.mjs "a service-area place inside a city already on the Google profile is COVERED (Google's own place list): nothing is sent to Google, the step finishes from the read; admin card A + the client's covered chip (step4_done_in_portal_v2)"
run check-step4-change-something-opens.mjs "client step 4's Change something opens the editor while RGA works, Need a change? once locked; Save = the same save as the first time (step4_done_in_portal_v2)"
run check-a-done-step-is-never-the-ask.mjs "every Month 1 client step marked done with nothing recorded shows the result: never the ask (a your-move card or the building tracker, by STATE), never empty, never our bookkeeping (Marked done / not on record / Not recorded) — done_without_record_v2 (live portal, page-only simulation, writes blocked)"
run check-done-row-measures-agree.mjs "the three done-row measures (portal fallback · browser gate · daily walk) strip the same chrome incl. the in-card how-to, and refuse our bookkeeping words — done_without_record_v2 (10-26)"
run check-open-moves-reach-every-surface.mjs "one list of open moves (whose move · since · promise · late) reaches the admin To do queue + late number + Next up, the portal pill + step 4, and the morning email; the client sees only their own steps — todo_inbox_v1 (10-26)"
run check-every-wait-spins.mjs "every waiting line (Loading… / Reading… / Checking…) in portal + admin spins via shared/busy.js + one master CSS rule; a new waiting verb fails here (Chris 10-26)"
run check-call-tracking-works-anywhere.mjs "call tracking works for a client in any US state: their time zone and area code, every page of calls read"
run check-call-tracking-upgrade.mjs "call tracking upgrade: recommendation from 3 answers, one GBP source number (recording notice, no texting), Done = test call + safe-setup checks, report keeps 3 call numbers apart"
run check-step3-loop.mjs "step 3 end to end: client invite → admin row 8 → Confirm access → locked → request/unlock, on a fake database"
run check-step3-auto-detect.mjs "step 3 auto-detect: proof per sign, linked footer credits only, Step 1 asks Yes/No with proof, yes/no saved + cleaned, admin row 8 flags a No"
run check-steps-6-and-7-confirm-in-the-portal.mjs "step 6 confirms the duplicate is gone IN THE PORTAL (no email, no photos line); step 7 shows the facts table + 48 h + done-when, stacked on a phone"
run check-client-steps-2-3-4-show-their-record.mjs "client steps 2 · 3 · 4 show their record: an invite never a password · an honest call-tracking decision · real form leads only (approved 10-20)"
run check-client-step-5-shows-the-plan.mjs "client step 5 shows the locked keyword plan for any business (approved 10-20)"
run check-done-records-steps-13-19.mjs "client steps 13–19 draw a done record (approved 10-20)"
run check-final-review-sop.mjs "final review R1: the SOP keeps the research-backed order in both sources (approved 10-20)"
run check-client-portal-phases.mjs "final review R2: 4 phases, renumber, Can't start yet, What RGA did, What to expect (approved 10-20)"
run check-phase1-get-started.mjs "final review R3: kickoff Booked, verify on Google, one change a week, Looks right, step 6 services (approved 10-20)"
run check-phase2-set-up.mjs "final review R4: hours rules, photos on Google, call + form tests (approved 10-20)"
run check-reviews-and-close.mjs "final review R5: review rules, optional videos, dated close-out, done fallback (approved 10-20)"
run check-monthly-asks.mjs "final review R6: monthly steps 16-20 ask less, never stall (approved 10-20)"
run check-the-foundation-card-finishes.mjs "the portal Foundation card says Done for Monthly + Mature clients (10-19: it read in progress forever)"
run check-no-review-gating.mjs "nothing RGA drafts or shows asks for reviews by rating/happiness (10-19: a NEGATIVE FILTER prompt + happy-customers copy)"
run check-step-54-knowledge-panel.mjs "step 54 measures first: panel → facts + checklist, none → No panel yet (open), failed search → indeterminate"
run check-step-49-schema.mjs "step 49: Service + BreadcrumbList + visible FAQ with FAQPage per page, never AggregateRating, never a guessed URL"
run check-gbp-landing-page.mjs "the Google landing page step: a failed Search Console read recommends nothing, any site works, a stale choice is ignored, the homepage is the fallback, it saves a decision and writes nothing to Google or the site"
run check-citation-brand-discovery.mjs "directories found by searching brand names for the industry-specific citations step: off by default, once per client, refuses when the plan is out, a failed search keeps the existing list and says so, no phone query"
run check-citation-runbook.mjs "the listings runbook after a name, address or phone change: recorded old and new, a search that refuses when the plan is out, never says fixed, writes to no listing"
run check-a-service-area-business-is-not-flagged-for-a-hidden-address.mjs "a service-area business is never flagged for a hidden street address; name, phone and service-area text are checked instead"
run check-the-schema-type-is-the-specific-one-or-local-business.mjs "the LocalBusiness schema step writes the most specific real schema.org type for the Google category, LocalBusiness for anything unknown"
run check-the-monthly-pagespeed-reads-field-data-honestly.mjs "the monthly audit sends the PageSpeed key, reads real-user data incl. INP, no data says none (never 0 or good), a failed call is not a score"
run check-hours-stay-true.mjs "hours / closed days stay true on Google; a change on Google shows Put back / Keep Google's in admin"
run check-no-step-asks-for-a-retired-google-feature.mjs "no step asks for a Google feature Google switched off (GBP chat ended 2024-07-31)"
run check-no-typed-step-numbers.mjs "no step number is typed where a person reads it (playbook text, admin, portal, function errors): name the step instead (approved admin_recommended_fixes_v1)"
run check-every-submission-is-recorded.mjs "every client submission is recorded (activity row with the answer, change-log row when it reached Google)"
run check-a-retake-can-be-cleared.mjs "a photo Google asked to retake can be cleared by the client"
run check-month-2-lives-in-the-monthly-record.mjs "a client's Month-2 answer lands in this month's monthly record, the one the admin and their portal read"
run check-the-night-run-stops-before-morning.mjs "the nightly video run starts nothing after 04:00 and stops at 06:30, recording what it stopped"
run check-netlify-credits-will-last.mjs "Netlify credits last until the cycle resets at the current deploy pace (5 outages from running out)"
run acceptance-walk.mjs "every Month-1 step clicks through in admin + portal (read-only), both sides agree — report: website reports/acceptance/latest.md"
run check-the-new-client-stays-new.mjs "the walk's brand-new test client is still day 0, and no cron that spends or moves steps reaches it"
run acceptance-walk-new-client.mjs "the same walk as a BRAND-NEW client (day 0): own-step waits + the kickoff row — report: website reports/acceptance/latest-new-client.md"
run check-month-2-is-on-ongoing-work.mjs "a Monthly-cycle client can do every Month-2 step on Ongoing work (one card each, one home per form)"
run check-the-month-2-client-stays-at-month-start.mjs "the walk's Month-2 test client is still at the start of a month, and no cron that spends or emails reaches it"
run acceptance-walk-month2.mjs "the walk on MONTH 2 (Monthly checklist vs the portal's Month-2 steps) — report: website reports/acceptance/latest-month2.md"
run check-no-emoji-in-stored-data.mjs "no emoji in stored data; the portal writes no row the database refuses"
run check-the-kickoff-agrees-on-every-surface.mjs "the kickoff tells one story in every state on every surface, admin and client"
run check-the-audit-report-is-fresh-and-in-hand.mjs "the client audit report is built at booking, never expires, is in their hands, and every build is bounded"
run check-the-call-has-a-start-and-an-end.mjs "the kickoff call starts and ends on the record; the portal honours it (10-09 test call)"
run check-activity-rows-use-real-columns.mjs "every client_activity write names real columns (10-09: the recap never reached the timeline)"
run check-photo-review-before-google.mjs "a client photo waits for RGA's review; every slot kind has an example; admin step 38 + Your action carry the review"
run check-no-catch-on-a-supabase-query.mjs "no Supabase query chains a .catch it does not have (10-09: it broke the photo upload after the photo saved)"
run check-the-daily-check-keeps-each-gates-output.mjs "the morning check keeps every gate's full output in output/gate-last, so a red never loses its reason"
run check-the-parked-excuse-names-its-reason.mjs "the parked video gate is excused by name, with its reason visible, exit 1 only"
run check-every-video-page-ships.mjs "every rebuilt video landing page is committed before deploy and actually serves (10-07/10-08: 9 served the homepage). PARKED (video parked, excused by name 11-1; not fixed while parked)" status
run check-every-control-spins.mjs "every press that starts a request turns busy, in the portal and the admin (hard rule)"
run check-a-client-can-change-or-remove-a-photo.mjs "Change and Remove on step 10 photos, the honest logo line, the done fold"
run check-a-client-can-choose-later.mjs "Remind me later on step 10: owner only, read back, cleared by a ready or an upload"
run check-an-email-is-not-a-conversation.mjs "each email RGA sent is one closed row, never a conversation heading"
run check-rga-tidies-a-second-logo.mjs "RGA recommends and removes a second logo copy, the client keeps a veto"
run check-step-7-kinds-fold.mjs "step 10 kinds fold and the tiles say what is true"
run check-step-7-top-is-calm.mjs "step 10's card keeps the approved order from top to tips"
run check-the-stylesheets-are-balanced.mjs "admin.css and portal.css have no stray brace or declaration between rules (a stray line once dropped the Messages control silently)"
run check-the-admin-step-accordion-behaves.mjs "admin Onboarding steps fold accordion-style: one open per card, live call never folds"
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
# 🔴 11-10 SERPAPI BUDGET: this check spends a LIVE Google Maps search per real client (plus a place lookup per suspected duplicate), and
# it used to run every morning. A duplicate listing changes rarely, so it now runs WEEKLY (a stamp file, 7 days) and the other six
# mornings spend nothing. It runs through the metered wrapper (consumer dupe-listing-health-check, client work).
_dup_stamp="output/.cache/dup-listing-weekly.stamp"
if [ -f "$_dup_stamp" ] && [ -z "$(find "$_dup_stamp" -mtime +6 2>/dev/null)" ]; then
  say "  ⏭  $(printf '%-38s' 'check-no-duplicate-google-listing.mjs') weekly - last live Maps check is under 7 days old, no search spent today"
else
  _dup_f0=$FAIL; _dup_i0=$INDET
  run_args check-no-duplicate-google-listing.mjs --all "no client has a SECOND Google listing splitting its ranking signals"
  [ "$FAIL" -eq "$_dup_f0" ] && [ "$INDET" -eq "$_dup_i0" ] && { mkdir -p output/.cache; touch "$_dup_stamp"; }
fi
# 🔴 11-10 SerpAPI: the free account read (saves the snapshot, raises the 80% / projected-to-run-out alert, retracts it when healthy) and its gate.
run_args serpapi-budget.mjs preflight "SerpAPI month is on track (alerts at 80% used or projected to run out; stops nothing above the client reserve)"
run check-serpapi-budget.mjs "SerpAPI guards: search memory, one query, reserve, meter, alerts, dead-night verdict (fakes only, can fail)"
run check-no-client-record-was-lost.mjs "NO CLIENT RECORD WAS LOST: every recorded answer, choice and done mark is still on its step; nothing vanished since yesterday's snapshot (Chris 10-20)"
run check-client-dedupe-gate.mjs       "an archived client cannot be silently re-created"
run retry-place-id-backfill.mjs        "every client has a Google place id (strongest dedupe key)"
run check-the-review-count-is-read.mjs "the review count is read from the client's own Google first, and an unread client fails"
run check-rating-history-is-written.mjs "the rating history: one client_gbp_snapshots row a day for every active connected client, from the cloud metrics job; a Google refusal is said, never written (master map 11-11)"
run refresh-review-metrics.mjs        "review counts observed daily (velocity needs a series)"
run refresh-pagespeed.mjs             "PageSpeed refreshed (background; verified by snapshot)" status
run check-report-matches-the-mockup.mjs "the client report has not drifted from its approved design"
run check-playbook-integrity.mjs       "playbook, guided call, and the Airtable contract"
run check-browser-js-parses-as-the-browser-does.mjs "every script the site loads actually parses"
run check-admin-tabs-render.mjs       "every admin tab renders for a signed-in admin"
run check-app-pages-boot.mjs          "admin, portal and the homepage actually come up in a browser"
run check-playbook-renders.mjs         "the playbook actually renders in a browser"

# 🔴 AUDIT 10-31: WHAT THE DATABASE MADE US SKIP GETS ONE MORE RUN, 15 MINUTES LATER (the review read, PageSpeed and the place ids are in here too)
if [ -s "$SKIPPED_LIVE" ]; then
  say ""
  say "── $(wc -l < "$SKIPPED_LIVE" | tr -d ' ') skipped while the database struggled: waiting, then one more run ──"
  sleep "${DB_RETRY_WAIT_SECONDS:-900}"
  RETRY_PASS=1
  while IFS=$'\t' read -r _rs _rw _rm <&3; do
    INDET=$((INDET-1))
    run "$_rs" "$_rw" "$_rm"
  done 3< "$SKIPPED_LIVE"
  RETRY_PASS=""
fi
rm -f "$SKIPPED_LIVE"

# ── production pause: lift it automatically the day every condition clears ────────────────────────
# Removing the pause was a MANUAL step waiting on a human to notice a condition had cleared, and a
# manual step nobody is watching is how a pause outlives its reason. This checks and resumes on its
# own; it is conservative — anything indeterminate counts as blocking.
# ── GBP hours backfill: chip away within the daily Places quota ───────────────────────────────────
# ~1,420 leads scraped before step-2.5 captured hours. The Cloud project has a low daily SearchText
# quota (deliberate spend control), so a single run cannot finish it. Rather than ask Chris to babysit
# it, run a capped batch each morning — it completes itself and stops the moment quota is hit.
# Non-fatal by design: a completeness task must never fail the health check.
# 🔴 11-11: THIS BLOCK SPENT THE WHOLE DAY. limit=400 let the function use ~41 Places lookups by 8:21 AM PT, Google refused every
# client-facing lookup after it, and this printed "this is expected". The function now asks the shared Places budget first
# (website netlify/functions/_places-budget.js) and gets only its share (6 a day, LAST in line), so 400 is a ceiling, not a spend.
# A refusal from Google is SAID here, never "expected" (gate: check-places-cap-is-said).
say ""
say "── gbp hours backfill ──"
if [ -n "${QUO_WEBHOOK_TOKEN:-}" ] || grep -q '^QUO_WEBHOOK_TOKEN' .env 2>/dev/null; then
  _t="${QUO_WEBHOOK_TOKEN:-$(grep '^QUO_WEBHOOK_TOKEN' .env | cut -d= -f2- | tr -d '"'"'"'"'"'"'"')}"
  _r=$(curl -s --max-time 200 "https://www.rocketgrowthagency.com/.netlify/functions/backfill-gbp-hours?token=${_t}&limit=400&commit=1" 2>/dev/null)
  _w=$(echo "$_r" | grep -oE '"written": *[0-9]+' | grep -oE '[0-9]+' | head -1)
  _f=$(echo "$_r" | grep -oE '"found": *[0-9]+' | grep -oE '[0-9]+' | head -1)
  _pstop=$(echo "$_r" | grep -oE '"stopped": *"[a-z]+"' | head -1 | sed -E 's/.*"([a-z]+)"$/\1/')
  _pwhy=$(echo "$_r" | grep -oE '"reason": *"[^"]*' | head -1 | sed -E 's/^"reason": *"//')
  if [ -n "${_w:-}" ]; then
    say "  ✅ wrote ${_w} lead(s) this run (found ${_f:-0})"
    if [ "${_pstop:-}" = "refused" ] || { [ -z "${_pstop:-}" ] && echo "$_r" | grep -q 'Quota exceeded'; }; then
      say "  🔴 Google REFUSED a Places lookup (its daily limit): ${_pwhy:-Quota exceeded} — client-facing lookups are refused too until midnight Pacific"
      INDET=$((INDET+1))
    elif [ "${_pstop:-}" = "budget" ]; then
      say "     stopped at its share of the daily Places budget; client work keeps the rest (${_pwhy:0:160})"
    fi
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

# ═══════════════════════════════════════════════════════════════════════════════════════════════
# 🔴 RECORD THE BRAIN WE JUST INVALIDATED (2026-09-22). Taking a snapshot makes every client's
# `brain_knowledge(type='client_audit')` row older than the newest snapshot it claims to summarise —
# so check-client-work-reaches-the-brain went red EVERY DAY, caused by this very loop. Only
# flow-execute recorded the brain, and only when an audit step ran.
#
# The gate's advice was "Run brain-record-audit for that client", which is a manual step naming a
# NETLIFY FUNCTION, not a script — there was nothing to run. A remediation instruction that names a
# tool you cannot invoke is not actionable.
#
# 🔑 A runner that invalidates state must refresh it. Writes here are consistent with what this
# block already does (snapshots, healing, review metrics) — this is the daily operations runner, not
# a read-only audit. → feedback_a_finding_must_be_actionable_inside_the_product
# ═══════════════════════════════════════════════════════════════════════════════════════════════
_brain_n=0; _brain_fail=0
for _cid in $(DOTENV_CONFIG_QUIET=true node -e '
require("dotenv").config({quiet:true});
(async()=>{const U=process.env.SUPABASE_URL,K=process.env.SUPABASE_SERVICE_ROLE_KEY;
const r=await fetch(`${U}/rest/v1/clients?archived_at=is.null&select=id`,{headers:{apikey:K,Authorization:`Bearer ${K}`}});
const d=await r.json(); if(Array.isArray(d)) console.log(d.map(c=>c.id).filter(Boolean).join(" "));})()' 2>/dev/null \
  | tr " " "\n" | grep -E "^[0-9a-f-]{36}$"); do
  _code=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
    "https://www.rocketgrowthagency.com/.netlify/functions/brain-record-audit" \
    -H "Content-Type: application/json" -H "x-internal-secret: ${INTERNAL_FN_SECRET:-}" \
    -d "{\"client_id\":\"${_cid}\"}" 2>/dev/null)
  # 🔴 A 200 is the only success. Anything else is counted and SAID — a swallowed failure here puts
  # the brain quietly out of date, which is the exact condition this block exists to prevent.
  if [ "$_code" = "200" ]; then _brain_n=$((_brain_n+1)); else _brain_fail=$((_brain_fail+1)); fi
done
if [ "$_brain_fail" -gt 0 ]; then
  printf "  🔴 brain recorded for %s client(s), %s FAILED — the brain will read stale tomorrow\n" "$_brain_n" "$_brain_fail"
  FAIL=$((FAIL+1))
else
  say "  ✅ brain re-recorded for ${_brain_n} client(s) (the snapshot above invalidated it)"
fi
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
# ── could the gates run AT ALL? ──────────────────────────────────────────────────────────────────
if [ "$UNRUNNABLE" -gt 0 ]; then
  mkdir -p "$ALERT_DIR"
  {
    echo "# 🔴 THE DAILY HEALTH CHECK CANNOT RUN"
    echo ""
    echo "**$UNRUNNABLE of its gates could not be launched** on $(date '+%Y-%m-%d %H:%M %Z')."
    echo "They did not fail — they never started. Exit 127 is \"command not found\"."
    echo ""
    echo "Almost always this is PATH. \`node\` lives in \`/usr/local/bin\`, and launchd gives a job only"
    echo "\`/usr/bin:/bin:/usr/sbin:/sbin\` unless its plist sets one."
    echo ""
    echo "**Look:** \`plutil -p ~/Library/LaunchAgents/com.rga.daily-health-check.plist\`"
    echo "**Prove it:** \`env -i PATH=/usr/bin:/bin bash -c 'node --version'\` — if that says"
    echo "\"command not found\", every gate in the scheduled run is returning 127."
    echo ""
    echo "🔑 While this file exists, \`check-standing-alerts.mjs\` fails. It is removed automatically by"
    echo "the first run in which every gate launches — never by hand, never on a timer."
    echo ""
    echo "Surface it at session boot."
  } > "$ALERT_FILE"
  echo "⛔ $UNRUNNABLE GATE(S) COULD NOT RUN — the safety net is not running. Alert raised: $ALERT_FILE"
  exit 3
fi
# 🔑 ONLY THIS WRITER RETRACTS IT, AND ONLY ON EVIDENCE: a run in which every gate launched.
if [ -f "$ALERT_FILE" ]; then
  rm -f "$ALERT_FILE"
  echo "✅ every gate launched — cleared $ALERT_FILE"
fi

JOB_REACHED_END=1   # every gate launched and the run got here: System health reads this as having run

# 🔑 A CRASHED GATE IS COUNTED AND NAMED SEPARATELY. Folding it into "indeterminate" hides the one
# fact that matters about it: somebody has to go and fix the gate, or that area is unguarded.
if [ "$THREW" -gt 0 ]; then
  echo "⚠️  $THREW GATE(S) THREW — harness faults, not product findings. Nothing is checking those areas."
fi
if [ "$FAIL" -gt 0 ]; then
  echo "🔴 $FAIL FAILING · $INDET indeterminate · $THREW threw · $OK healthy"
  exit 1
fi
if [ "$INDET" -gt 0 ]; then
  echo "⚠️  $INDET INDETERMINATE (could not verify — NOT the same as healthy) · $THREW threw · $OK healthy"
  exit 2
fi
say "✅ all $OK checks healthy"
exit 0
