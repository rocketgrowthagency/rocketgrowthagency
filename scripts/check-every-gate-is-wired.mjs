#!/usr/bin/env node
/**
 * check-every-gate-is-wired.mjs — a gate nobody runs is documentation, not a guard.
 *
 * ─── WHY (2026-08-24) ────────────────────────────────────────────────────────────────────────────
 * `check-orphan-videos.mjs` was accurate, maintained, and wired into NOTHING. It failed only when
 * someone ran it by hand — so 48 orphaned videos accumulated in silence, each a complete build
 * (scrape → capture → voiceover → branding → deploy) that could never send an email.
 *
 * A sweep for the same shape found **three more** live gates dormant:
 *   check-send-dedup-guard      — enforces ONE first-email per inbox (deliverability-critical)
 *   check-verification-system   — the verification rules themselves
 *   check-locked-pages          — 12 pinned pages + 106 detail pages
 *
 * All three PASSED, which is exactly why nobody noticed: a gate that is never invoked is
 * indistinguishable from a gate that is always green.
 *
 * > **Writing a gate is half the work. Wiring it is the other half.**
 * > This meta-gate makes the second half impossible to forget.
 *
 * ─── HOW ─────────────────────────────────────────────────────────────────────────────────────────
 * Every `scripts/check-*.mjs` must be EITHER referenced by overnight-pipeline.sh, OR listed below in
 * NOT_PREFLIGHT with a reason. A new gate that is neither fails this check — the author must wire it
 * or consciously excuse it. Silence is not an option, which is the whole point.
 *
 * Exit 0 = healthy, 1 = an unwired, unexcused gate exists.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PIPELINE = path.join(HERE, 'overnight-pipeline.sh');

const fail = (m) => { console.error(`✗ FATAL: ${m}`); process.exit(1); };
const ok = (m) => console.log(`  ✓ ${m}`);

// Deliberately NOT pre-flight. Each needs a REASON, so excusing a gate is a decision on the record
// rather than an oversight. "It was failing" is never a valid reason — fix it or delete it.
const NOT_PREFLIGHT = {
  "check-a-quiet-period-runs-no-live-check.mjs": "a check of the scheduled checks themselves (the database quiet period, 11-6), not of the video pipeline: run every morning by daily-health-check.sh",
  // 🔴 THIS EXCUSE USED TO READ "runs inside the visual gate". It does not, and nothing else does
  // either (audit, 2026-09-22). The visual gate's checkD asks whether a detail card is PRESENT;
  // this asks whether it is OPAQUE — a different question, and still the only thing that would
  // catch the Dr. Augusto Rojas translucent card. It is deliberately not a gate (false positives,
  // reasoning in its own header), which is a sound call — but an excuse claiming a caller that
  // does not exist makes the defect look covered when it is not. State the real reason.
  // 🔑 Translucency remains UNGATED by design. → feedback_a_ledger_line_outlives_the_bug
  'check-detail-card-opaque.mjs': 'DIAGNOSTIC ONLY, never a gate — its saturation metric measures '
    + 'layout, not translucency, and flagged 3 videos Chris confirmed good. Run by hand to rank '
    + 'videos for eyeballing. Translucency is not gated by anything; fixing that needs per-frame '
    + 'card-region detection, not this threshold.',
  'check-video-acceptance.mjs':   'per-video tool — takes <video.mp4>; runs at build-landing time',
  'check-video-visual.mjs':       'per-video tool — takes <video.mp4>; runs at build-landing time',
  'check-site-reachable.mjs':     'per-lead tool — takes a URL; runs inside the rebuild runner',
  'check-resume-production.mjs':  'the production governor; runs as its own pipeline step, not a gate',
  'check-operational-drift.mjs':  'advisory; surfaces in the morning report and must never block a run',
  'check-orphan-videos.mjs':      'reported via check-operational-drift so orphans reach the morning report',
  // ── admin/delivery surface, added 2026-09-06. Both run in daily-health-check.sh, NOT in the
  // video pre-flight: neither can affect whether a video is safe to build or send, and blocking a
  // night's outreach on an admin-UI regression would be the wrong trade.
  'check-netlify-publishing-live.mjs': 'deploy-surface gate; runs in daily-health-check.sh — a locked deploy cannot make a video unsafe',
  'check-sop-fully-rendered.mjs':      'admin-UI gate; runs in daily-health-check.sh — SOP rendering does not gate video safety',
  'check-status-maps-fail-soft.mjs':   'admin/portal-UI gate; runs in daily-health-check.sh — a badge map cannot make a video unsafe',
  'check-every-action-reports-a-result.mjs': 'admin/portal-UI gate; runs in daily-health-check.sh — button feedback cannot make a video unsafe',

  // ── client-portal surface, added 2026-09-25. All four run in daily-health-check.sh. None can
  //    make a VIDEO unsafe, which is what the overnight pre-flight exists to protect — but every
  //    one of them guards something a client sees, so none may be silently dropped either.
  // ── admin checklist + client portal, built 2026-09-29 → 10-01, wired 10-01. All ten run in
  // daily-health-check.sh. 🔴 NONE belongs in overnight-pipeline.sh: video and scraper work is
  // PARKED, and a failing admin gate must never abort a video build.
  'check-the-checklist-is-one-list.mjs':          'admin-UI gate; runs in daily-health-check.sh — a checklist split in two cannot make a video unsafe',
  'check-the-checklist-has-one-numbering-system.mjs': 'admin-UI gate; runs in daily-health-check.sh — a step badge cannot make a video unsafe',
  'check-the-checklist-renders-one-list.mjs':     'admin-UI gate, drives a browser; runs in daily-health-check.sh — rendering cannot make a video unsafe',
  'check-every-setting-can-be-changed.mjs': 'admin-UI gate; runs in daily-health-check.sh — a Change control cannot make a video unsafe',
  'check-a-step-email-is-sent-and-seen.mjs': 'admin/portal gate; runs in daily-health-check.sh — whether a step email can be sent cannot make a video unsafe',
  'check-what-this-produced-matches-the-mockup.mjs': 'admin-UI gate, drives a browser; runs in daily-health-check.sh — how stored output is shown cannot make a video unsafe',
  'check-a-designed-draft-escapes-exactly-once.mjs': 'admin-UI gate, pure source+vm; runs in daily-health-check.sh — HTML escaping in an admin card cannot make a video unsafe',
  'check-a-step-number-has-one-home.mjs': 'admin-UI gate, pure source+vm; runs in daily-health-check.sh — what an admin surface calls a step cannot make a video unsafe',
  'check-the-next-action-performs-the-decision.mjs': 'admin-UI gate, pure source read; runs in daily-health-check.sh — an admin card button cannot make a video unsafe',

  // ── keyword + sub-location plan (step 26), built 2026-10-05. All run in daily-health-check.sh.
  //    🔴 NONE belongs in overnight-pipeline.sh: video and scraper work is PARKED, and a keyword-plan
  //    regression must never abort a video build.
  'check-a-failed-scan-is-not-no-scan.mjs': 'admin-UI gate; runs in daily-health-check.sh — how a failed rank scan is labelled cannot make a video unsafe',
  'check-a-keyword-draft-survives-the-round-trip.mjs': 'admin-UI gate, pure source+vm; runs in daily-health-check.sh — how a keyword draft renders cannot make a video unsafe',
  'check-a-finished-step-knows-its-input-moved.mjs': 'admin-UI gate, pure source+vm; runs in daily-health-check.sh — a stale-input warning on a checklist step cannot make a video unsafe',
  'check-the-step-notes-match-their-mockup.mjs': 'admin-UI gate, drives a browser; runs in daily-health-check.sh — how a step\'s output is laid out cannot make a video unsafe',
  'check-a-button-does-not-lie-about-where-it-runs.mjs': 'playbook gate, pure source read; runs in daily-health-check.sh — a button label cannot make a video unsafe',
  'check-a-confirmation-names-the-work-done.mjs': 'admin-UI gate, pure source+vm; runs in daily-health-check.sh — a confirmation sentence cannot make a video unsafe',
  'check-a-done-step-carries-the-time-it-was-done.mjs': 'onboarding-record gate, pure source+vm; runs in daily-health-check.sh — a task timestamp cannot make a video unsafe',
  'check-a-note-never-contradicts-the-measurement.mjs': 'admin-UI gate, pure source scan; runs in daily-health-check.sh — a note on a step card cannot make a video unsafe',
  'check-a-block-renders-from-the-record-not-the-prose.mjs': 'admin-UI gate, lifts and renders admin.js in a vm; runs in daily-health-check.sh — a step card panel cannot make a video unsafe',
  'check-the-grid-summary-fits-its-design.mjs': 'admin-UI gate, runs the producer template in a vm and parses it; runs in daily-health-check.sh — a step summary cannot make a video unsafe',
  'check-a-step-output-states-a-time-not-an-age.mjs': 'step-output gate, pure source scan; runs in daily-health-check.sh — the wording of a summary cannot make a video unsafe',
  'check-the-step-card-renders-in-a-browser.mjs': 'admin-UI gate, lifts the renderer into chromium with the real CSS; runs in daily-health-check.sh — a step card cannot make a video unsafe',
  'check-monthly-one-card-in-a-browser.mjs': 'admin-UI gate, reads the LIVE Monthly tab in chromium (read-only sign-in): run once after each admin deploy with node scripts/check-monthly-one-card-in-a-browser.mjs; it needs the live site so it cannot run pre-flight; a Monthly row cannot make a video unsafe',
  'check-a-step-declares-who-finishes-it.mjs': 'playbook+portal data gate, pure source scan; runs in daily-health-check.sh — a step completion mechanism cannot make a video unsafe',
  'check-a-client-step-number-is-declared.mjs': 'portal data gate, pure source scan; runs in daily-health-check.sh — a step number in the portal cannot make a video unsafe',
  'check-a-locked-row-says-why.mjs': 'admin-UI gate, pure source scan; runs in daily-health-check.sh — a lock reason cannot make a video unsafe',
  'check-the-card-says-what-finishes-the-step.mjs': 'admin-UI gate, lifts admin.js in a vm; runs in daily-health-check.sh — what a card says finishes a step cannot make a video unsafe',
  'check-a-citation-audit-never-invents-an-absence.mjs': 'admin/flow-execute gate, runs the executor against stubbed SERPs; runs in daily-health-check.sh — a citation measurement cannot make a video unsafe',
  'check-a-finished-step-stays-on-screen.mjs': 'admin-UI gate, pure source scan; runs in daily-health-check.sh — where the page scrolls cannot make a video unsafe',
  'check-on-screen-copy-is-us-idiom.mjs': 'copy gate over admin + portal + functions, pure source scan; runs in daily-health-check.sh — a spelling cannot make a video unsafe',
  'check-a-client-rule-works-for-any-business.mjs': 'client-data gate, lifts the real helpers and runs them against businesses we do not have; runs in daily-health-check.sh — a client rule cannot make a video unsafe',
  'check-gh-cannot-run-as-the-wrong-account.mjs': 'account-isolation gate over the gh CLI hook; runs in daily-health-check.sh — which GitHub account gh holds cannot make a video unsafe',
  'check-every-identity-points-at-rga.mjs': 'reads LIVE credential state (git, ssh, gh, netlify, gcloud); runs in daily-health-check.sh — an identity pointing elsewhere cannot make a video unsafe, and it must not block a build on a machine mid-login',
  'check-a-plan-can-satisfy-its-own-step.mjs': 'playbook + runner-prompt consistency, pure source scan; runs in daily-health-check.sh — a shot-list count cannot make a video unsafe',
  'check-every-run-is-kept.mjs': 'append-only history gate over flow-execute + the migration, pure source scan; runs in daily-health-check.sh — step history cannot make a video unsafe',
  'check-a-detected-step-is-never-done-by-running-it.mjs': 'lifts the done decision out of flow-execute and evaluates it against the real step definitions; runs in daily-health-check.sh — whether a checklist row says done cannot make a video unsafe',
  'check-the-run-strip-matches-the-mockup.mjs': 'renders the admin step card in chromium and diffs it against the approved mockup; runs in daily-health-check.sh — needs a browser and the live admin, and how a history strip looks cannot make a video unsafe',
  'check-every-detection-is-kept.mjs': 'append-only history gate over the detections migration, portal-step-recheck and the admin renderer, pure source scan; runs in daily-health-check.sh — whether a measurement is kept cannot make a video unsafe',
  'check-the-detection-block-matches-the-mockup.mjs': 'renders the admin step card in chromium and diffs the detection block against the approved mockup; runs in daily-health-check.sh — needs a browser and the live admin, and how a measurement looks cannot make a video unsafe',
  'check-a-run-says-what-it-produced.mjs': 'runs the draft parser and scans the admin renderers, pure source plus a lifted module; runs in daily-health-check.sh — how a run row is worded cannot make a video unsafe',
  'check-the-waiting-band-matches-the-mockup.mjs': 'renders the live admin card and the live client portal in a browser and diffs them against the approved mockup; runs in daily-health-check.sh — needs a browser and both live sites, and how a band looks cannot make a video unsafe',
  'check-a-sent-email-reads-as-an-email.mjs': 'runs the sent-email card against the real step-1 record and nine edge cases; runs in daily-health-check.sh — how a sent email is drawn cannot make a video unsafe',
  'check-every-mockup-is-in-memory.mjs': 'requires every new mockup to be cited by its system memory and every mockup to be in the generated registry; runs in daily-health-check.sh — memory hygiene cannot make a video unsafe',
  'check-no-emoji-in-stored-data.mjs': 'static + live: the no-emoji hard rule; runs in daily-health-check.sh — copy cannot make a video unsafe',
  'check-an-upload-confirms-in-its-slot.mjs': 'static: the photo upload confirmation; runs in daily-health-check.sh — copy cannot make a video unsafe',
  'check-netlify-credits-will-last.mjs': 'live-data: Netlify credit forecast (API); runs in daily-health-check.sh + after every deploy — billing, not video safety; self-tests its arithmetic (4 mut)',
  'check-nothing-goes-on-a-listing-until-it-is-the-only-one.mjs': 'behavioural: one-listing rule + writers + step 7/39 locks; runs in daily-health-check.sh — a listing gate cannot make a video unsafe',
  'check-the-night-run-stops-before-morning.mjs': 'behavioural: the night run\'s real clock lines on 6 start times + every start point + the watchdog; runs in daily-health-check.sh',
  'check-a-found-email-is-the-business.mjs': 'behavioural: the real name-match token filter on 6 trades and the real email validator; runs in daily-health-check.sh + the email-validation suite in the night pre-flight',
  'check-the-maps-frame-shows-the-business-and-the-search.mjs': 'static + behavioural: the results page is verified + framed before capture pauses on it, and the business must sit inside the visible map (the real businessFramePx on the 11-11 South Bay numbers); runs in daily-health-check.sh',
  'check-a-locked-screen-cannot-stop-a-video.mjs': 'static + behavioural: the Maps freeze grab on a locked screen, the N/3 WebMs line, and the night roll-up on a fixture night; runs in daily-health-check.sh',
  'check-a-step-that-opens-is-told-once.mjs': 'behavioural: the step-open email sweep (states, words, hours, guards, stamp order); runs in daily-health-check.sh — a client email gate cannot make a video unsafe',
  'check-a-client-can-remove-their-own-duplicate.mjs': 'behavioural: the real removal flow against stub Google/Supabase/SerpApi + static safety rules; runs in daily-health-check.sh — a listing gate cannot make a video unsafe',
  'check-a-success-clears-the-failure-it-supersedes.mjs': 'static + both merge rules run: every stored failure field has a declared clear; runs in daily-health-check.sh — a record-hygiene gate cannot make a video unsafe',
  'check-every-mutation-still-applies.mjs': 'static: every mutation anchor matches its file exactly once (shared target map lib/mutation-targets.mjs); runs in daily-health-check.sh — a meta-gate cannot make a video unsafe',
  'check-month-2-lives-in-the-monthly-record.mjs': 'behavioural: the real client writers against a stub database + the UTC month key in server/admin/portal; runs in daily-health-check.sh — a portal record gate cannot make a video unsafe',
  'check-month-2-is-on-ongoing-work.mjs': 'static + lifted helpers: Month 2 on Ongoing work (order, period, counted progress, one home per form, headline owner); runs in daily-health-check.sh — a portal layout gate cannot make a video unsafe',
  'check-the-month-2-client-stays-at-month-start.mjs': 'live-data: the Month-2 walk client (read-only) + the 4 crons that must skip it; runs in daily-health-check.sh before the Month-2 walk — a fixture gate cannot make a video unsafe',
  'check-the-new-client-stays-new.mjs': 'live-data: the acceptance walk\'s day-0 test client (read-only) + the crons that must skip it; runs in daily-health-check.sh before the new-client walk — a fixture gate cannot make a video unsafe',
  'check-a-client-step-waits-on-what-it-needs.mjs': 'behavioural: the RGA-wait rule vs an independent walk of the graph + 4 writers + portal rows; runs in daily-health-check.sh — a portal step gate cannot make a video unsafe',
  'check-a-photo-never-goes-up-twice.mjs': 'behavioural: step 39 duplicate guard + review cards; runs in daily-health-check.sh — a client photo cannot make a video unsafe',
  'check-a-done-step-is-never-the-headline.mjs': 'static: the portal headline never names a done step; runs in daily-health-check.sh — copy cannot make a video unsafe',
  'check-a-photo-is-what-rga-confirmed.mjs': 'static: which photo is which + the fixed slot row; runs in daily-health-check.sh — copy cannot make a video unsafe',
  'check-photo-examples-match-the-lists.mjs': 'static + render: the per-shot example drawings; runs in daily-health-check.sh — copy cannot make a video unsafe',
  'check-the-portal-shows-the-trades-own-list.mjs': 'render: the real runner + portal renderer per trade; runs in daily-health-check.sh — copy cannot make a video unsafe',
  'check-photo-lists-are-the-researched-ones.mjs': 'static + render: the photo shot lists and how they reach the client; runs in daily-health-check.sh — copy cannot make a video unsafe',
  'check-a-photo-preview-says-when-it-fails.mjs': 'static: the portal photo preview fails loudly; runs in daily-health-check.sh — copy cannot make a video unsafe',
  'check-client-emails-have-one-format.mjs': 'static + render: the format of client emails; runs in daily-health-check.sh — copy cannot make a video unsafe',
  'check-client-emails-have-no-em-dash.mjs': 'render + static (11-11): no em dash in the WEBSITE repo\'s client emails, on fakes (nothing sent); runs in daily-health-check.sh. Copy cannot make a video unsafe',
  'check-client-messages-build.mjs': 'the WEBSITE repo\'s client-messages build (11-11: hold window, per-occurrence notices, notes, notice acknowledgment, report check-in) on fakes, nothing sent; runs in daily-health-check.sh. It reads no video pipeline output',
  'check-the-kickoff-promises-agree.mjs': 'static: the kickoff script, the recap and the schedules agree; runs in daily-health-check.sh — copy cannot make a video unsafe',
  'check-the-kickoff-agrees-on-every-surface.mjs': 'runs every kickoff state through every surface (admin + portal) in a vm; runs in daily-health-check.sh — a call card cannot make a video unsafe',
  'check-the-audit-report-is-fresh-and-in-hand.mjs': 'pins the client report build/refresh wiring and its cost bounds; runs in daily-health-check.sh — reports are not videos',
  'check-the-call-has-a-start-and-an-end.mjs': 'pins the kickoff call start/end wiring across the function, admin and portal; runs in daily-health-check.sh — a call console cannot make a video unsafe',
  'check-activity-rows-use-real-columns.mjs': 'static scan of every client_activity write against the table columns; runs in daily-health-check.sh — a timeline row cannot make a video unsafe',
  'check-photo-review-before-google.mjs': 'pins the photo review UI (examples per kind, slot states, step 39, Your action); runs in daily-health-check.sh — a photo card cannot make a video unsafe',
  'check-no-catch-on-a-supabase-query.mjs': 'static scan of portal/admin browser code for .catch on a Supabase query builder; runs in daily-health-check.sh — browser code cannot make a video unsafe',
  'check-the-daily-check-keeps-each-gates-output.mjs': 'pins that daily-health-check.sh keeps every gate\'s full output in output/gate-last; runs in daily-health-check.sh',
  'check-the-parked-excuse-names-its-reason.mjs': 'pins the by-name excuse of the parked video gate in before-confirming.mjs and daily-health-check.sh; runs in daily-health-check.sh',
  'check-every-video-page-ships.mjs': 'pins the rebuild commit-before-deploy + page verify, and finds landing pages left uncommitted; runs in daily-health-check.sh at 7:30 AM — reads the website repo, not a video render',
  'check-the-admin-step-accordion-behaves.mjs': 'runs the real accordion block from admin.js in jsdom; runs in daily-health-check.sh — admin layout cannot make a video unsafe',
  'check-outreach-emails-went-out.mjs': 'reads the last 10 days of the Outreach Log; runs in daily-health-check.sh at 7:30 AM after the 7 AM sends',
  'check-airtable-calls-are-metered.mjs': 'pins the Airtable meter in the scheduled jobs + the call-queue filter; runs in daily-health-check.sh — metering cannot make a video unsafe',
  'check-the-audit-defects-stay-fixed.mjs': 'pins the eight Month-1 audit defect fixes in the runners, callback, fix plan and report; runs in daily-health-check.sh — runner wiring cannot make a video unsafe',
  'check-google-access-is-told-truthfully.mjs': 'compares the requested OAuth scopes to the portal + privacy wording; runs in daily-health-check.sh — consent copy cannot make a video unsafe',
  'check-every-plan-is-wired-end-to-end.mjs': 'renders every plan through the real email + pricing code and pins the billing wiring; runs in daily-health-check.sh — billing copy cannot make a video unsafe',
  'check-the-client-journey-tells-one-story.mjs': 'reads the portal Google setup step + the playbook after-yes order; runs in daily-health-check.sh — client-journey wording cannot make a video unsafe',
  'check-client-emails-tell-the-truth.mjs': 'renders every stage email (paid + beta) through messageFor; runs in daily-health-check.sh — email wording cannot make a video unsafe',
  'check-admin-two-step-sign-in.mjs': 'runs the real _auth.js with crafted aal1/aal2 tokens and the page\'s level logic; runs in daily-health-check.sh — admin sign-in cannot make a video unsafe',
  'check-colours-come-from-the-system.mjs': 'holds the approved UI state system (tokens, retired shades, decisions, ratchet); runs in daily-health-check.sh — colour cannot make a video unsafe',
  'check-memory-has-no-drift.mjs': 'runs memory-audit --strict (broken links, orphans, unmirrored files); runs in daily-health-check.sh — memory hygiene cannot make a video unsafe',
  'check-the-kickoff-reads-one-state.mjs': 'runs kickoffState and kickoffAlertFor through ten fact combinations and checks nine surfaces are wired to them; runs in daily-health-check.sh — which words a kickoff card uses cannot make a video unsafe',
  'check-waiting-on-the-client-is-built.mjs': 'lifts the nudge draft and waiting-since from admin.js and scans the send path, thread, probe and portal how-to; runs in daily-health-check.sh — whether a client step says whose move it is cannot make a video unsafe',
  'check-a-jump-opens-what-it-lands-on.mjs': 'renders the real photo card in chromium and clicks the real jump; runs in daily-health-check.sh — needs a browser, and whether a portal button reveals a form cannot make a video unsafe',
  'check-a-photo-reaches-google.mjs': 'runs the photo publisher against a fake Google and database, plus a source scan; runs in daily-health-check.sh — whether a photo reaches a Google profile cannot make a video unsafe',
  'check-the-gbp-parent-is-built-once.mjs': 'lifts gbpParent and scans every v4 call site, pure source; runs in daily-health-check.sh — a Google profile read returning zeros cannot make a video unsafe',
  'check-a-claim-about-another-surface-is-true.mjs': 'cross-surface claim table, pure source scan; runs in daily-health-check.sh — a sentence on the admin card cannot make a video unsafe',
  'check-the-deliverable-matches-the-mockup.mjs': 'renders the admin step card in chromium and diffs the deliverable block and its list against the approved mockup; runs in daily-health-check.sh — needs a browser and the live admin, and how a shot list looks cannot make a video unsafe',
  'check-now-set-to-says-what-the-step-set.mjs': 'admin-UI gate, pure source+vm; runs in daily-health-check.sh — a summary line on a step card cannot make a video unsafe',
  'check-a-refusal-names-what-is-on-screen.mjs': 'admin-UI gate, pure source read; runs in daily-health-check.sh — how a refusal is worded cannot make a video unsafe',
  'check-the-grid-measures-the-locked-plan.mjs': 'keyword/grid gate, pure source read; runs in daily-health-check.sh — what the geo grid scans cannot make a video unsafe',
  'check-a-keyword-knows-its-surface.mjs': 'keyword-plan gate, stubbed fetch; runs in daily-health-check.sh — whether a keyword triggers a map pack cannot make a video unsafe',
  'check-a-keyword-plan-fits-the-business.mjs': 'keyword-plan gate, pure source+vm; runs in daily-health-check.sh — a keyword pool cannot make a video unsafe',
  'check-a-keyword-plan-is-decided-on-evidence.mjs': 'keyword-plan gate, pure source+vm; runs in daily-health-check.sh — how plan slots are allocated cannot make a video unsafe',
  'check-a-loose-list-keeps-its-numbers.mjs': 'admin-UI gate; runs in daily-health-check.sh — markdown list rendering cannot make a video unsafe',
  'check-a-queued-step-updates-the-card.mjs': 'admin-UI gate, pure source read; runs in daily-health-check.sh — whether a queued step refreshes the card cannot make a video unsafe',
  'check-a-rebuilt-draft-keeps-its-fences.mjs': 'admin-UI gate, pure source+vm; runs in daily-health-check.sh — a draft fence cannot make a video unsafe',
  'check-a-state-that-belongs-to-nobody-says-so.mjs': 'admin/portal-UI gate; runs in daily-health-check.sh — whose turn a step shows cannot make a video unsafe',
  'check-a-sub-location-is-a-real-place.mjs': 'keyword-plan gate, stubbed fetch; runs in daily-health-check.sh — a wrong sub-location cannot make a video unsafe',
  'check-an-outbound-call-has-a-deadline.mjs': 'admin/API gate, pure source read; runs in daily-health-check.sh — a timeout on an admin step cannot make a video unsafe',
  'check-every-marker-the-step-writes-is-classified.mjs': 'admin-UI gate, pure source+vm; runs in daily-health-check.sh — how a step note is panelled cannot make a video unsafe',
  'check-the-next-step-card-matches-its-mockup.mjs': 'portal-UI gate, drives a browser; runs in daily-health-check.sh — the portal next-step card cannot make a video unsafe',
  'check-the-volume-chip-agrees-with-the-step.mjs': 'admin-UI gate, pure source+vm; runs in daily-health-check.sh — a volume chip colour cannot make a video unsafe',
  'check-a-plain-text-output-is-designed.mjs': 'admin-UI gate, pure source+vm; runs in daily-health-check.sh — how a stored output is laid out cannot make a video unsafe',
  'check-a-callout-has-a-kind.mjs': 'admin-UI gate, pure source read; runs in daily-health-check.sh — the layout of a step\'s reference fold cannot make a video unsafe',
  'check-an-arrow-points-where-it-goes.mjs': 'admin-UI gate, pure source read; runs in daily-health-check.sh — a glyph on an admin control cannot make a video unsafe',
  'check-a-local-plan-has-local-terms.mjs': 'admin-UI gate, pure source read; runs in daily-health-check.sh — the shape of a keyword prompt cannot make a video unsafe',
  'check-the-grid-says-what-it-centred-on.mjs': 'admin/rank gate, pure source read; runs in daily-health-check.sh — the rank grid is client reporting, not the video pipeline',
  'check-nothing-is-rga-shaped.mjs': 'product-wide gate, pure source read; runs in daily-health-check.sh — client-scoping in the admin/portal cannot make a video unsafe',
  'check-a-keyword-card-matches-its-mockup.mjs': 'admin-UI render gate, launches a browser and diffs the keyword card against its approved mockup; runs in daily-health-check.sh — a step card cannot make a video unsafe',
  'check-the-banner-matches-its-mockup.mjs': 'admin-UI render gate, launches a browser and diffs computed styles against the approved mockup; runs in daily-health-check.sh — a banner cannot make a video unsafe',
  'check-a-confirmation-says-what-happened.mjs': 'admin-UI gate, lifts and RUNS the banner producer; runs in daily-health-check.sh — a confirmation banner cannot make a video unsafe',
  'check-a-step-never-renders-before-its-dependency.mjs': 'admin-UI gate, lifts and RUNS the checklist ordering code; runs in daily-health-check.sh — the onboarding list is an admin surface and cannot make a video unsafe',
  'check-the-model-never-writes-the-numbers.mjs': 'admin/keyword-step gate, pure source read; runs in daily-health-check.sh — the keyword plan is an admin surface and cannot make a video unsafe',
  'check-a-step-that-produced-something-can-rerun-it.mjs': 'admin-UI gate, pure source read; runs in daily-health-check.sh — the onboarding checklist is an admin surface and cannot make a video unsafe',
  'check-the-ads-api-cannot-run-away.mjs': 'admin/cost-safety gate, pure source read; runs in daily-health-check.sh — the Keyword Planner is reached only from an admin step a human clicks Run on, and the video pipeline calls zero Google Cloud APIs by design',
  'check-the-checklist-numbering-matches-the-mockup.mjs': 'admin-UI gate, drives a browser; runs in daily-health-check.sh — computed styles cannot make a video unsafe',
  'check-step-instructions-render-as-bands.mjs':  'admin-UI gate; runs in daily-health-check.sh — instruction layout cannot make a video unsafe',
  'check-a-step-output-takes-its-own-weight.mjs': 'admin-UI gate; runs in daily-health-check.sh — how stored output is shown cannot make a video unsafe',
  'check-every-detected-step-is-actually-checked.mjs': 'onboarding-probe gate; runs in daily-health-check.sh — an unprobed client step stalls CLIENT WORK, not tonight\'s videos',
  'check-the-call-console-survives-a-manual-tick.mjs': 'admin-UI gate; runs in daily-health-check.sh — the kickoff console cannot make a video unsafe',
  'check-the-picker-has-a-way-out.mjs':           'client-portal UI gate; runs in daily-health-check.sh — a time picker cannot make a video unsafe',
  'check-the-live-call-surfaces-keep-up.mjs':     'client-portal UI gate; runs in daily-health-check.sh — a Join button cannot make a video unsafe',

  'check-the-setup-accordion-behaves.mjs':    'client-portal UI gate; runs in daily-health-check.sh — a folded checklist cannot make a video unsafe',
  'check-messages-have-a-shape.mjs':          'client-portal UI gate; runs in daily-health-check.sh — message styling cannot make a video unsafe',
  'check-no-native-browser-dialogs.mjs':      'UI gate; runs in daily-health-check.sh — a raw alert() is ugly and unbranded, it cannot make a video unsafe',
  'check-portal-prefetch-actually-fires.mjs': 'portal performance gate; runs in daily-health-check.sh — a slow boot cannot make a video unsafe',
  'check-the-next-step-card-names-whats-next.mjs': 'client-portal copy gate; runs in daily-health-check.sh — a stale next-step card cannot make a video unsafe',
  'check-the-client-reads-their-own-timezone.mjs': 'client-portal gate; runs in daily-health-check.sh — a mis-rendered hour cannot make a video unsafe',
  'check-the-client-can-release-their-booking.mjs': 'client-portal gate; runs in daily-health-check.sh — a missing cancel control cannot make a video unsafe',
  'check-client-copy-is-american.mjs': 'client-copy gate; runs in daily-health-check.sh — an idiom cannot make a video unsafe',
  'check-a-settled-step-never-says-do-it.mjs': 'client-portal copy gate; runs in daily-health-check.sh — a stale heading cannot make a video unsafe',
  'check-a-step-card-never-renders-itself-twice.mjs': 'admin-UI gate; runs in daily-health-check.sh — checklist card layout cannot make a video unsafe',
  'check-a-failed-load-never-says-you-have-not-booked.mjs': 'portal-honesty gate; runs in daily-health-check.sh',
  'check-the-portal-has-one-button-scale.mjs': 'UI-integrity gate; runs in daily-health-check.sh',
  'check-every-control-has-a-style.mjs': 'UI-integrity gate; runs in daily-health-check.sh',
  'check-a-step-title-has-one-home.mjs': 'SOP-integrity gate; runs in daily-health-check.sh',
  'check-the-kickoff-is-booked-when-rga-confirms.mjs': 'kickoff-lifecycle gate; runs in daily-health-check.sh — step completion cannot make a video unsafe',
  'check-a-jump-moves-the-page.mjs': 'admin-UI gate; runs in daily-health-check.sh — a dead jump button cannot make a video unsafe',
  'check-the-kickoff-call-fits-its-slot.mjs': 'admin-UI gate; runs in daily-health-check.sh — the call console cannot make a video unsafe',
  'check-the-recap-sends-what-you-saw.mjs': 'admin-UI gate; runs in daily-health-check.sh — the recap composer cannot make a video unsafe',
  'check-the-join-link-is-the-invites-link.mjs': 'admin+portal gate; runs in daily-health-check.sh — a meeting link cannot make a video unsafe',
  'check-a-past-call-never-claims-it-happened.mjs': 'portal-UI gate; runs in daily-health-check.sh — a past-call card cannot make a video unsafe',
  'check-the-countdown-agrees-across-portals.mjs': 'portal+admin UI gate; runs in daily-health-check.sh — a countdown cannot make a video unsafe',
  'check-a-settled-booking-corrects-every-sentence.mjs': 'portal-UI gate; runs in daily-health-check.sh — a settled step card cannot make a video unsafe',
  'check-the-phases-account-for-every-step.mjs': 'onboarding-structure gate; runs in daily-health-check.sh',
  'check-the-clock-never-claims-the-call-happened.mjs': 'kickoff-honesty gate; runs in daily-health-check.sh',
  'check-the-done-when-line-is-gone.mjs': 'portal-copy gate; runs in daily-health-check.sh — replaced check-a-sentence-never-points-where-it-cannot-see when Chris deleted that line',
  'check-a-client-action-reaches-the-admin.mjs': 'admin-UI gate; runs in daily-health-check.sh — a next-action card cannot make a video unsafe',
  'check-booked-and-accepted-are-different-words.mjs': 'admin/portal copy gate; runs in daily-health-check.sh — a contradicting status line cannot make a video unsafe',
  'check-a-reschedule-never-looks-like-a-first-booking.mjs': 'admin-UI gate; runs in daily-health-check.sh — kickoff card copy cannot make a video unsafe',
  'check-an-abandoned-oauth-grant-is-never-silent.mjs': 'admin+portal gate; runs in daily-health-check.sh — a silent OAuth abandonment cannot make a video unsafe',
  'check-live-matches-the-approved-mockup.mjs': 'REVIVED 11-11 (checkers build), data-driven from steps.json governing mockups + reports/mockups: the live admin and portal (every write blocked) against each approved mockup\'s wording, a drift ratchet (scripts/mockup-match-baseline.json); runs every night in nightly-full-check.sh, not the daily run, to spare production',
  'check-no-new-dormant-css.mjs':             'stylesheet-hygiene gate; runs in daily-health-check.sh — an unmatched CSS rule cannot make a video unsafe',
  'check-archived-clients-excluded.mjs': 'admin-UI gate; runs in daily-health-check.sh — client lifecycle state cannot make a video unsafe',
  'check-status-tools-see-the-run.mjs': 'diagnostic-layer gate; runs in daily-health-check.sh — it EXECUTES the status tools, too slow for per-run pre-flight',
  'check-admin-selects-real-columns.mjs': 'admin-schema gate; runs in daily-health-check.sh — needs live Supabase, and a schema drift cannot make a video unsafe',
  'check-video-serving-reconciled.mjs': 'live-serving gate; runs in daily-health-check.sh — samples production over the network, too slow for per-run pre-flight',
  'check-a-truncated-scan-is-not-a-measurement.mjs': 'rank-data gate; runs in daily-health-check.sh — static analysis of the site repo, and a truncated grid cannot make a video unsafe',
  'check-a-booking-can-be-unbooked.mjs': 'admin/calendar-surface gate; runs in daily-health-check.sh — a missing cancel control cannot make a video unsafe, and this analyses the site repo not the video pipeline',
  'check-a-done-step-can-be-substantiated.mjs': 'admin-UI/ledger gate; runs in daily-health-check.sh — static analysis of the site repo, and an unsubstantiated checklist tick cannot make a video unsafe',
  'check-no-tab-flashes-a-wrong-answer.mjs': 'admin-UI browser gate; runs in daily-health-check.sh — drives puppeteer across every tab, far too slow for per-run pre-flight, and a render flash cannot make a video unsafe',
  'check-kickoff-booking-is-honest.mjs': 'booking-surface gate; runs in daily-health-check.sh — static analysis of the site repo; a double-booked kickoff cannot make a video unsafe',
  'check-a-loading-surface-does-not-lie.mjs': 'admin-UI gate; runs in daily-health-check.sh — static analysis of the site repo; a loading flash cannot make a video unsafe',
  'check-every-report-section-is-composed.mjs': 'client-report gate; runs in daily-health-check.sh — static analysis of the site repo; an unshown report section cannot make a video unsafe',
  'check-a-withdrawn-contract-is-not-offered.mjs': 'contract-surface gate; runs in daily-health-check.sh — needs live Supabase, and an over-offered contract cannot make a video unsafe',
  'check-step-instructions-are-not-shredded.mjs': 'admin-UI gate; runs in daily-health-check.sh — RUNS the real instruction parser over both playbooks; a shredded instruction card cannot make a video unsafe',
  'check-the-confirmation-email-says-one-true-thing.mjs': 'client-email gate; runs in daily-health-check.sh — RENDERS the real template for every plan; a contradictory welcome email cannot make a video unsafe',
  'check-the-next-action-names-the-real-step.mjs': 'admin-UI gate; runs in daily-health-check.sh — static analysis of the site repo plus a live count cross-check; a mislabelled next-action card cannot make a video unsafe',
  'check-a-step-locks-on-its-whole-chain.mjs': 'admin-checklist gate; runs in daily-health-check.sh — executes the site repo\'s lock computation against synthetic graphs and the live records; a falsely unlocked onboarding step cannot make a video unsafe',
  'check-an-unauthenticated-endpoint-leaks-nothing.mjs': 'security gate; runs in daily-health-check.sh — static analysis of the site repo, and a public endpoint cannot make a video unsafe',
  'check-functions-select-real-columns.mjs': 'schema gate; runs in daily-health-check.sh — needs live Supabase, and a bad SELECT cannot make a video unsafe',
  'check-a-promise-of-automation-has-a-schedule.mjs': 'client-copy gate; runs in daily-health-check.sh — an unkept promise cannot make a video unsafe',
  'check-no-gate-has-unreachable-code.mjs': 'meta-gate; runs in daily-health-check.sh — it reads the other gates, and dead code in a gate cannot make a video unsafe',
  'check-internal-work-cannot-look-client-facing.mjs': 'admin-UI gate; runs in daily-health-check.sh — a screen-shared card cannot make a video unsafe',
  'check-no-step-redoes-an-automated-job.mjs': 'SOP-copy gate; runs in daily-health-check.sh — a duplicated instruction cannot make a video unsafe',
  'check-two-surfaces-one-sender.mjs': 'admin-flow gate; runs in daily-health-check.sh — a duplicate client email cannot make a video unsafe',
  'check-a-failure-reaches-a-human.mjs': 'admin-queue gate; runs in daily-health-check.sh — static analysis of the site repo, and an unreachable alert cannot make a video unsafe',
  // ── client-portal / delivery surface. All run in daily-health-check.sh. None of them can make
  //    tonight's VIDEO unsafe, which is what the per-run pre-flight exists to protect — so they are
  //    excused from pre-flight and checked every morning instead. Backfilled 2026-09-16: these had
  //    accumulated unexcused, so this gate's own "nobody invokes these" list was crying wolf on 14
  //    gates that run daily. → feedback_a_new_gate_must_be_wired_or_excused
  'check-call-metrics-are-not-conflated.mjs': 'reporting-label gate; runs in daily-health-check.sh',
  'check-a-running-month-is-never-compared.mjs': 'the WEBSITE repo\'s reporting (master audit #8, 11-11): every "vs last month" is worded in shared/metrics.js and drawn only between two complete months next to each other (portal, report page, admin, the email); static + shared/metrics.js and lifted portal producers on fixtures, self-proof on the before revision; run by daily-health-check.sh; it reads no video pipeline output.',
  'check-one-leads-formula.mjs': 'the WEBSITE repo\'s reporting (master audit #8, 11-11): Leads are one formula (forms plus tracked calls over the same calendar month) and their value one formula on every surface; static + fixtures, self-proof on the before revision; run by daily-health-check.sh; it reads no video pipeline output.',
  'check-leads-count-missed-callers.mjs': 'the WEBSITE repo\'s Leads (Chris 11-12): forms plus each caller once, missed calls included, one caller function, "including N missed" on every surface; runs in daily-health-check.sh',
  'check-an-account-ends-on-day-30.mjs': 'the WEBSITE repo\'s cancellation (Chris 11-12): the end date is the notice date plus 30 days in the one function, the Cancel card terms and the agreement; runs in daily-health-check.sh',
  'check-leads-match-the-provider.mjs': 'the WEBSITE repo\'s Leads to booked jobs (tier3_best_in_class_v1 §1, 11-11): provider adapters and the lead store on fakes, plus one read-only comparison of this month\'s lead rows in the database; run by daily-health-check.sh beside check-call-metrics-are-not-conflated; it reads no video pipeline output.',
  'check-call-tracking-path-is-whole.mjs': 'onboarding-path gate; runs in daily-health-check.sh',
  'check-client-boundary-is-declared.mjs': 'client-visibility gate; runs in daily-health-check.sh',
  'check-client-never-sees-our-internals.mjs': 'client-visibility gate; runs in daily-health-check.sh',
  'check-client-portal-renders.mjs': 'portal-render gate; needs playwright + a live magic link, too slow for per-run pre-flight',
  'check-we-only-name-tools-we-use.mjs': 'client-copy gate; runs in daily-health-check.sh — naming the wrong meeting tool cannot make a video unsafe',
  'check-client-steps-explain-themselves.mjs': 'client-copy gate; runs in daily-health-check.sh',
  'check-every-client-step-can-be-finished.mjs': 'client-checklist gate; runs in daily-health-check.sh — a dead-end step cannot make a video unsafe',
  'check-no-duplicate-call-rows.mjs': 'CRM-integrity gate; runs in daily-health-check.sh, needs live Airtable',
  'check-nothing-reaches-a-client-unreviewed.mjs': 'approval-gate check; runs in daily-health-check.sh',
  'check-only-the-client-can-approve.mjs': 'approval-authority gate; runs in daily-health-check.sh',
  'check-owner-facts-are-in-sync.mjs': 'owner-questions gate; runs in daily-health-check.sh',
  'check-questions-fit-the-trade.mjs': 'owner-questions gate; runs in daily-health-check.sh',
  'check-setup-step-count-agrees.mjs': 'admin/portal parity gate; runs in daily-health-check.sh',
  'check-the-owner-questions-ui-contract.mjs': 'portal-UI contract gate; runs in daily-health-check.sh',
  'check-css-declarations-are-valid.mjs': 'stylesheet gate; runs in daily-health-check.sh — a dropped declaration cannot make a video unsafe',
  'check-no-dropped-css-rule.mjs': 'stylesheet gate; runs in daily-health-check.sh — a rule swallowed by a broken comment cannot make a video unsafe',
  'check-a-messages-alert-closes-on-success.mjs': 'admin Messages gate; runs in daily-health-check.sh — an alert that never closes cannot make a video unsafe',
  'check-portal-calls-stay-authenticated.mjs': 'portal-auth gate; runs in daily-health-check.sh — a stale token cannot make a video unsafe',
  'check-every-jump-lands-somewhere-visible.mjs': 'portal-navigation gate; runs in daily-health-check.sh — a dead jump cannot make a video unsafe',
  'check-an-audit-cannot-write.mjs': 'audit-safety gate; runs in daily-health-check.sh — an audit that writes cannot make a video unsafe',
  'check-a-question-gets-an-answer.mjs': 'client-thread gate; runs in daily-health-check.sh — an unanswered question cannot make a video unsafe',
  'check-no-test-data-in-production.mjs': 'test-data gate; runs in daily-health-check.sh — a leftover test row cannot make a video unsafe',
  'check-review-requests-can-actually-be-sent.mjs': 'review-request gate; runs in daily-health-check.sh — an unsendable request cannot make a video unsafe',
  'check-every-view-survives-a-reload.mjs': 'admin-routing gate; runs in daily-health-check.sh — an unreachable admin view cannot make a video unsafe',
  'check-the-sop-is-not-public.mjs': 'boundary gate; runs in daily-health-check.sh — it fetches production, too slow for per-run pre-flight',
  'check-no-duplicate-google-listing.mjs': 'client-data gate; runs in daily-health-check.sh --all. Needs live SerpApi (one credit per client) and a duplicate LISTING cannot make tonight\'s video unsafe.',
  'check-every-gate-is-wired.mjs': 'this meta-gate itself',
  'check-playbook-integrity.mjs': 'the sales playbook is website code, not tonight\'s videos — a bad block must never abort a video build. Runs in drip-content.sh (the deploy that ships admin/) and daily-health-check.sh',
  'check-onboarding-errors-surfaced.mjs': 'live Supabase client state, not code health; needs network. Runs in daily-health-check.sh — a delivery failure must never block a video build',
  'check-orphaned-airtable-fields.mjs': 'live Airtable schema+population, not code health; needs network and reads every row. Runs in daily-health-check.sh — must never block a video build',
  'check-playbook-renders.mjs': 'needs a headless BROWSER (playwright) — far too slow and too environment-dependent to gate a nightly video build. Runs in preflight-site-deploy.sh and daily-health-check.sh',
  'check-client-dedupe-gate.mjs': 'live Supabase schema + indexes, not code health; needs network. Runs in daily-health-check.sh — a duplicate-client risk must never abort a video build',
  'check-almanac-accruing.mjs': 'aggregates the vertical-benchmark corpus on disk; slow and unrelated to tonight\'s videos. Runs in daily-health-check.sh, straight after the rebuild it verifies',
  'check-rank-tracking-sane.mjs': 'live Supabase rank snapshots, not code health; needs network. Runs in daily-health-check.sh — a badly tracked keyword must never abort a video build',
  'check-no-gate-is-permanently-indeterminate.mjs': 'reads the verdict history daily-health-check.sh writes and reports gates that have NEVER once answered — meta-integrity, not video health, and it must never abort a video build. Runs in daily-health-check.sh at the end, after every other gate has recorded its exit code',
  'check-ga4-property-is-the-one-receiving-data.mjs': 'calls the deployed ga4-property-check function (the Google OAuth creds live in Netlify, not here) and compares live GA4 properties — client-reporting correctness, needs network, and must never abort a video build. Runs in daily-health-check.sh',
  'check-one-palette.mjs': 'static scan of the WEBSITE repo\'s admin/portal JS for colour drift — design-system integrity, no bearing on tonight\'s videos, and a palette regression must never abort a video build. Runs in daily-health-check.sh',
  'check-no-horizontal-bleed.mjs': 'static scan of the WEBSITE repo\'s stylesheets — layout integrity, no bearing on tonight\'s videos, and a CSS overflow must never abort a video build. Runs in daily-health-check.sh',
  'check-change-ledger-is-append-only.mjs': 'static scan of the WEBSITE repo\'s ledger writers plus a live hash check — client-evidence integrity, unrelated to tonight\'s videos, and it must never abort a video build. Runs in daily-health-check.sh',
  'check-artifacts-are-keyed-by-id.mjs': 'reads the WEBSITE repo\'s archived mockups and playbook — documentation integrity, no bearing on tonight\'s videos, and a stale ordinal must never abort a video build. Runs in daily-health-check.sh right after the approval archive it sits beside',
  'check-every-approval-is-archived.mjs': 'compares LIVE Supabase approvals to committed markdown in the WEBSITE repo — needs network plus git, and an unarchived approval must never abort a video build. Runs in daily-health-check.sh, immediately after export-approvals writes and commits the files it verifies',
  'check-absent-rank-is-never-a-position.mjs': 'static scan of the WEBSITE repo\'s rank renderers (portal, admin, brain prompt, grid producer) — reporting correctness, not video health, and must never abort a video build. Runs in daily-health-check.sh',
  'check-orphan-functions.mjs': 'scans the WEBSITE repo\'s netlify/functions and cross-references two repos — unrelated to tonight\'s videos, and an unwired function must never abort a video build. Runs in daily-health-check.sh',
  'check-portal-data-boundary.mjs': 'static scan of the WEBSITE repo\'s portal/ — a commercial/architectural boundary, not video health, and it must never abort a video build. Runs in daily-health-check.sh',
  'check-sop-sources-agree.mjs': 'compares the delivery SOP across two repos and imports the playbook module — unrelated to tonight\'s videos, and SOP drift must never abort a video build. Runs in daily-health-check.sh',
  'check-runners-never-swallow-errors.mjs': 'static scan of the WEBSITE repo\'s flow-execute.js delivery-SOP runners — client-onboarding correctness, unrelated to tonight\'s videos, and it must never abort a video build. Runs in daily-health-check.sh',
  'check-button-says-what-it-does.mjs': 'static scan of the WEBSITE repo\'s SOP action labels against flow-execute runner bodies — client-delivery UI honesty, no bearing on tonight\'s videos, and it must never abort a video build. Runs in daily-health-check.sh',
  'check-finished-work-shows-finished.mjs': 'static scan of the WEBSITE repo\'s flow-execute status logic — client-delivery UI honesty, no bearing on tonight\'s videos, and it must never abort a video build. Runs in daily-health-check.sh',
  'check-email-headers-are-encoded.mjs': 'static scan of the WEBSITE repo\'s mail senders — client-facing email correctness, no bearing on tonight\'s videos, and it must never abort a video build. Runs in daily-health-check.sh',
  'check-inserts-use-real-columns.mjs': 'verifies WEBSITE-repo INSERT columns against the live Supabase schema — needs network, and a dropped admin write cannot make a video unsafe. Runs in daily-health-check.sh',
  'check-kickoff-reader-matches-writer.mjs': 'static cross-check of two WEBSITE-repo functions — client-onboarding copy correctness, no bearing on tonight\'s videos. Runs in daily-health-check.sh',
  'check-deep-links-land-where-asked.mjs': 'static scan of the WEBSITE repo\'s admin router — navigation correctness, no bearing on tonight\'s videos. Runs in daily-health-check.sh',
  'check-no-shadowed-functions.mjs': 'static scan of the WEBSITE repo\'s admin.js/portal.js for redefined top-level functions — a fix that never runs; unrelated to tonight\'s videos. Runs in daily-health-check.sh',
  'check-sent-contracts-match-current-terms.mjs': 'queries Supabase for unsigned sent contracts carrying retired wording — commercial/legal correctness, no bearing on tonight\'s videos. Runs in daily-health-check.sh',
  'check-sign-flow-is-passable.mjs': 'static scan of the WEBSITE repo\'s contract-signing flow — revenue-path correctness (no password gate on a passwordless product), no bearing on tonight\'s videos. Runs in daily-health-check.sh',
  'check-one-action-one-button.mjs': 'static scan of the WEBSITE repo\'s portal next-step banner — client-UI clarity, no bearing on tonight\'s videos. Runs in daily-health-check.sh',
  'check-emails-clear-the-spam-floor.mjs': 'renders the WEBSITE repo\'s stage-notification email bodies and fails any under 500 characters — client-communication deliverability, no bearing on tonight\'s videos. Runs in daily-health-check.sh',
  'check-price-surfaces-are-known.mjs': 'enumerates every price-bearing file in the WEBSITE repo and fails on an unclassified one — a price-change safety net, no bearing on tonight\'s videos. Runs in daily-health-check.sh',
  'check-no-module-tdz.mjs': 'static scan for module-scope let/const assigned above its own declaration — a runtime ReferenceError node --check cannot see. Front-end/app correctness, no bearing on tonight\'s videos. Runs in daily-health-check.sh',
  'check-payment-path-is-safe.mjs': 'static scan of the WEBSITE repo\'s inline-payment path (portal, intent function, webhook) — billing/security correctness, no bearing on tonight\'s videos. Runs in daily-health-check.sh',
  'check-charge-equals-the-contract.mjs': 'calls the WEBSITE repo\'s first-invoice code and compares it to the contract schedule — billing correctness, no bearing on tonight\'s videos. Runs in daily-health-check.sh',
  'check-no-client-paid-without-a-receipt.mjs': 'billing-correctness gate; runs in daily-health-check.sh — a missing receipt cannot make a video unsafe',
  'check-the-price-shown-is-the-price-charged.mjs': 'billing-correctness gate; runs in daily-health-check.sh — a portal/server price mismatch cannot make a video unsafe',
  'check-a-charge-settles-its-invoice.mjs': 'billing-correctness gate; runs in daily-health-check.sh — an unsettled invoice cannot make a video unsafe',
  'check-a-paid-invoice-always-settles.mjs': 'billing-correctness gate (master audit #9, 11-11): runs the real webhook, settle, reconciler and Pay-now on a fake world; runs in daily-health-check.sh — a payment path cannot make a video unsafe',
  'check-every-internal-call-carries-the-secret.mjs': 'static scan of the WEBSITE repo\'s function-to-function calls (11-11): a server\'s own call sends the internal secret, a forwarder never adds it unchecked; runs in daily-health-check.sh — no bearing on tonight\'s videos',
  'check-the-pause-follows-the-contract.mjs': 'billing-contract gate (master audit #9, 11-11): the late-payment ladder, notices and the portal banner against the signed agreement, on a fake world; runs in daily-health-check.sh — the billing ladder cannot make a video unsafe',
  'check-we-never-promise-what-we-dont-do.mjs': 'client-copy gate; runs in daily-health-check.sh — a false promise in the portal cannot make a video unsafe',
  'check-post-payment-shows-real-data.mjs': 'portal-UI gate; runs in daily-health-check.sh — what the payment screen renders cannot make a video unsafe',
  'check-test-reset-clears-every-write.mjs': 'test-harness gate; runs in daily-health-check.sh — the test reset never touches the video pipeline',
  'check-memory-has-no-orphans.mjs': 'memory-hygiene gate; runs in daily-health-check.sh — an unreachable memory file cannot make a video unsafe',
  'check-invoice-dates-are-business-time.mjs': 'client-document gate; runs in daily-health-check.sh — an invoice date cannot make a video unsafe',
  'check-email-suppression-actually-reaches-the-sender.mjs': 'client-email safety gate; runs in daily-health-check.sh — whether a harness can mail a client cannot make a video unsafe',
  'check-charges-use-the-right-stripe-account.mjs': 'billing-correctness gate; runs in daily-health-check.sh — which Stripe account a charge lands on cannot make a video unsafe',
  'check-no-test-card-path.mjs': 'billing-safety gate; runs in daily-health-check.sh — it asks the DEPLOYED site whether a test-card path is open, which has no bearing on tonight\'s videos',
  'check-no-two-clients-share-a-google-property.mjs': 'live Supabase OAuth rows, not code health; needs network, and a mis-bound client property cannot make a video unsafe. Runs in daily-health-check.sh',
  'check-client-email-senders-are-gated.mjs': 'security gate over the WEBSITE repo\'s mail senders; an open endpoint cannot make a video unsafe. Runs in daily-health-check.sh',
  'check-scheduled-jobs-are-alive.mjs': 'inspects the machine\'s launchd agents, not the code; it is the thing that INVOKES the pre-flight, so running it inside the pre-flight would be circular. Runs in daily-health-check.sh',
  'check-report-matches-the-mockup.mjs': 'client-facing design gate over the WEBSITE repo; a drifted report cannot make a video unsafe. Runs in daily-health-check.sh',
  'check-standing-alerts.mjs': 'reads the alerts directory the monitors write into; it reports an ALREADY-DETECTED condition rather than detecting one, and must never abort a video build. Runs in daily-health-check.sh',
  'check-admin-tabs-render.mjs': 'needs a headless BROWSER and an admin sign-in link; far too slow and credential-dependent for a nightly video build, and a blank admin cannot make a video unsafe. Runs in daily-health-check.sh',
  'check-app-pages-boot.mjs': 'needs a headless BROWSER and the LIVE site — too slow and too network-dependent to gate a nightly video build, and a blank admin cannot make a video unsafe. Runs in daily-health-check.sh',
  'check-browser-js-parses-as-the-browser-does.mjs': 'front-end gate; runs in daily-health-check.sh — a blank admin page cannot make a video unsafe, but it is checked every morning',
  'check-decline-copy-is-client-facing.mjs': 'client-copy gate; runs in daily-health-check.sh — what a refused card says to a client cannot make a video unsafe',
  'check-every-stripe-charge-reached-our-ledger.mjs': 'billing-reconciliation gate; runs in daily-health-check.sh — it pulls Stripe and compares to our ledger, which has no bearing on tonight\'s videos',
  'check-price-excuses-are-still-true.mjs': 'billing-correctness gate; runs in daily-health-check.sh — a stale price excuse cannot make a video unsafe',
  'check-billing-history-is-derived.mjs': 'portal-UI gate; runs in daily-health-check.sh — how the payment step renders month 3 cannot make a video unsafe',
  'check-price-summary-is-derived.mjs': 'derives every client-facing price summary from data/plans.json and compares it to the real schedule — commercial correctness, no bearing on tonight\'s videos. Runs in daily-health-check.sh',
  'check-setup-steps-read-in-order.mjs': 'file read + browser render of the WEBSITE repo\'s portal Setup list (one list 1 to N in number order, a Done step keeps its number with a tick, approved setup_numbers_in_order_v1) — files only, no bearing on tonight\'s videos. Runs in daily-health-check.sh',
  'check-a-refused-photo-says-how-to-fix.mjs': 'files + browser render of the WEBSITE repo\'s returned-photo note (Google said / From RGA + How to fix, approved photo_google_said_no_v1) and the admin turn-down reasons — files only, no bearing on tonight\'s videos. Runs in daily-health-check.sh',
  'check-profile-answers-reach-google.mjs': 'Google FAKED + browser render: steps 8/10/11 of the WEBSITE repo put the answer on the Google profile and settle by the read-back (approved profile_answers_reach_google_v1) — files only, no bearing on tonight\'s videos. Runs in daily-health-check.sh',
  'check-step-6-verifies-in-the-portal.mjs': 'Google FAKED + browser render of the WEBSITE repo\'s step 6 (verify the Google Business Profile in the portal, approved step6_verify_profile_v1) — files only, no bearing on tonight\'s videos. Runs in daily-health-check.sh',
  'check-photos-fit-the-team.mjs': 'files only (real runner + real portal renderer, faked I/O): step 7 of the WEBSITE repo fits staff shots to the team size and leads with what can be taken today (approved step7_photos_today_v1) — no bearing on tonight\'s videos. Runs in daily-health-check.sh',
  'check-rating-history-is-written.mjs': 'the WEBSITE repo\'s daily rating snapshot (client_gbp_snapshots from metrics-daily-refresh, master map 11-11) with Google and Supabase faked: a website-function check, not video preflight; runs in daily-health-check.sh beside the review-count check',
  'check-the-review-count-is-read.mjs': 'the WEBSITE repo\'s review-count refresher (Google profile first, Places fallback, an unread client fails the daily run) with Google and Supabase faked — a website-function check, not video preflight; runs in daily-health-check.sh beside the refresher',
  'check-an-email-is-not-a-conversation.mjs': 'runs in daily-health-check.sh (added 11-01, it ran nowhere regular before); the WEBSITE repo\'s step thread (approved step_emails_not_conversation_v1): the portal\'s own threadHtml drawn in Chrome with the shipped portal.css, plus portal-thread\'s filing of the duplicate letter — a portal check, not video preflight',
  'check-hours-stay-true.mjs': 'the WEBSITE repo\'s step 8/10/11 Google sync (approved hours_stay_true_v1): closed days read back + owner\'s kept, the nightly check + renewal, admin truth — Google faked, a portal check, not video preflight',
  'check-every-submission-is-recorded.mjs': 'the WEBSITE repo\'s recording of every client / admin / system submission (approved how_data_is_stored_v1): activity row with the answer, Google change-log row, every step-record writer uses _record.js — a portal check, not video preflight',
  'check-a-retake-can-be-cleared.mjs': 'the WEBSITE repo\'s step 7 Clear it (approved clear_a_retake_v1 v2): withdraw a turned-down photo, the cleared slot note, the thin retake line, quiet facts — a portal check, not video preflight',
  'check-client-step6-card.mjs': 'the WEBSITE repo\'s client step 6 card (client_step6_categories_services_v1, approved 10-29); run by daily-health-check.sh + its mutation suite',
  'check-client-card-system-batch1.mjs': 'the WEBSITE repo\'s client card system, batch 1 = client steps 2–9 (client_card_system_v1, approved 10-29); files only (vm-run renderers), no bearing on tonight\'s videos; run by daily-health-check.sh + its mutation suite',
  'check-client-card-system-batch2.mjs': 'the WEBSITE repo\'s client card system, batch 2 = client steps 1 and 10–15 (client_step11–15_v1 · client_step01_kickoff_v3 · client_step10_photos_v3, approved 10-30); files only (vm-run renderers + the kickoff calendar / pills drawn in Chrome), no bearing on tonight\'s videos; run by daily-health-check.sh + its mutation suite',
  'check-client-steps-6-9-forms.mjs': 'the WEBSITE repo\'s client steps 6 + 9 open forms (client_step06_services_v2, client_step09_form_v2, approved 10-30); file-only + fakes, runs in daily-health-check.sh',
  'check-client-portal-tabs.mjs': 'the WEBSITE repo\'s client portal tabs (client_portal_tabs_v1, approved 10-30); file-only, runs in daily-health-check.sh',
  'check-client-data-backup-works.mjs': 'the nightly client data backup: reads this Mac\'s own backup record and runs the script against a fake Supabase; daily, not a pre-flight',
  'check-internal-files-are-not-public.mjs': 'every top-level name in the website repo is public by decision or blocked at the edge; daily, not a pre-flight',
  'check-a-backup-restore-check-can-fail.mjs': 'proves the restore check on fake backups; daily, not a pre-flight',
  'check-a-backup-restores.mjs': 'reads the real drive: runs monthly (1st to 7th) from daily-health-check.sh, not a pre-flight',
  'check-lacie-backup-works.mjs': 'the daily LaCie backup: reads this Mac\'s own backup record and runs the script on throwaway folders; daily, not a pre-flight',
  'check-audit-decisions.mjs': 'the WEBSITE repo\'s seven audit decisions (audit_decisions_v1, approved 10-31); real modules on a stubbed network, nothing reaches Google or SerpAPI, runs in daily-health-check.sh',
  'check-step10-photo-truth.mjs': 'the WEBSITE repo\'s step 10 photo truth (client_step10_photo_truth_v1, 10-30); fakes only, runs in daily-health-check.sh',
  'check-step10-upload-help.mjs': 'the WEBSITE repo\'s step 10 upload help (client_step10_upload_help_v1, 11-01); fakes only, runs in daily-health-check.sh',
  'check-a-tick-never-sits-on-nothing.mjs': 'the WEBSITE repo\'s step 12 name and zero ticks (client_step12_forms_v1, 11-01); fakes only, runs in daily-health-check.sh',
  'check-a-blog-post-goes-through-the-website-pipeline.mjs': 'the WEBSITE repo\'s blog post loop (admin_blog_step_v1, 11-01); a fake database, GitHub, site and model, runs in daily-health-check',
  'check-the-social-profiles-step-says-only-what-it-saw.mjs': 'the WEBSITE repo\'s social profiles step (client_social_profiles_v1, 11-01); fake sites and a fake database, runs in daily-health-check',
  'check-the-phone-lines-figures-square.mjs': 'the WEBSITE repo\'s monthly report phone line (11-04); lifts two helpers from report.js, runs in daily-health-check.sh',
  'check-the-blog-check-says-only-what-it-saw.mjs': 'the WEBSITE repo\'s step 47 blog check (admin_blog_step_v1, 11-01); fake sites and a fake database, runs in daily-health-check.sh',
  'check-the-site-archive-is-add-only.mjs': 'the WEBSITE repo\'s step 8 site archive (admin_site_archive_v1, 11-01); fake sites and a fake store, runs in daily-health-check.sh',
  'check-client-open-calls.mjs': 'the WEBSITE repo\'s client portal open calls (client_open_calls_v1, approved 10-30); file-only + fake Google + fake database, runs in daily-health-check.sh',
  'check-client-steps-3-4-8-forms.mjs': 'the WEBSITE repo\'s client steps 3 · 4 · 8 inner forms (client_step03_builder_v2 · client_step04_fact_check_v2 · client_step08_details_v2, approved 10-30); files only (real renderers + handlers clicked in a blank Chrome page, every request refused), no bearing on tonight\'s videos; wired in daily-health-check beside batch 2 + its mutation suite',
  'check-google-numbers-read-live.mjs': 'the WEBSITE repo\'s live Google reader, door, email and screens (report_live_google_30_day_v2 Part A, approved 11-02); runs the real modules against a faked Google, no network, no browser, runs in daily-health-check.sh',
  'check-monthly-value.mjs': 'the WEBSITE repo\'s monthly What we watched card (client_monthly_value_v1, approved 10-31); runs the real modules + vm, no network, runs in daily-health-check.sh',
  'check-blog-system.mjs': 'the WEBSITE repo\'s blog system (blog_system_v1 + blog_cleanup_v1, approved 10-31); runs the real modules with fakes, no network, runs in daily-health-check.sh',
  'check-client-card-system-batch3.mjs': 'the WEBSITE repo\'s client card system, batch 3 = the Ongoing work tab (client_step16–20_v1 · client_ongoing_*_v1, approved 10-29); files only (vm-runs the real cards; Chrome only for the tile grid + the 400px width); wired in daily-health-check beside batch 2',
  'check-step-7-hours-editor-v2.mjs': 'the WEBSITE repo\'s client step 7 hours editor V2 (client_step07_hours_editor_v2, approved 10-30); files only — runs in daily-health-check.sh beside the card-system batches, not the video pre-flight',
  'check-the-contract-promises-only-what-the-code-does.mjs': 'the WEBSITE repo\'s agreement + public pricing (approved 10-31); files only, runs in daily-health-check.sh',
  'check-the-public-site-tells-the-truth.mjs': 'the WEBSITE repo\'s public pages (website_audit_v1_v2, approved 10-31); files only, runs in daily-health-check.sh',
  'check-google-keys-are-sealed.mjs': 'the WEBSITE repo\'s Google sign-in code plus one read-only column (pending_and_google_security_v1, approved 10-31), runs in daily-health-check.sh',
  'check-google-login-has-one-home.mjs': 'the WEBSITE repo\'s Google sign-in code (approved 11-1); runs the real functions against a stubbed network, no real values, runs in daily-health-check.sh',
  'check-core-changes-are-asked-each-time.mjs': 'the WEBSITE repo\'s Google writers and the portal + admin cards (client_core_change_approval_v1, approved 10-31); files only with a stubbed network, runs in daily-health-check.sh',
  'check-month-log-and-proof-links.mjs': 'the WEBSITE repo\'s monthly report page and the nightly profile watch (report_and_measurement_v1, approved 11-1); stubbed, files only, runs in daily-health-check.sh',
  'check-gbp-safety-steps.mjs':'the WEBSITE repo\'s Google writers and the portal + admin cards (gbp_protocols_v1, approved 11-1); files only, runs in daily-health-check.sh',
  'check-google-changes-wait-for-consent.mjs': 'the WEBSITE repo\'s Google writers and the portal + admin consent cards (client_google_consent_v1, approved 10-31); files only with a stubbed network, runs in daily-health-check.sh',
  'check-the-founding-plan-and-billing-day.mjs': 'the WEBSITE repo\'s contract, billing and founding pages (contract_v2_redline + pricing_page_v3, approved 10-31); files only, runs in daily-health-check.sh',
  'check-the-sale-and-the-name-stay-gone.mjs': 'the WEBSITE repo\'s public pages + contract plans (pricing_page_v2, approved 10-31); files only, runs in daily-health-check.sh',
  'check-data-keep.mjs': 'what we keep (data_keep_v1, 10-31): raw store, grid per pin, Search Console rows, dated benchmarks, frozen reports, the 30-day purge shipped OFF, the admin row; fakes only, nothing real called; runs in daily-health-check.sh',
  'check-google-data-has-an-expiry.mjs': 'no copy of Google Business Profile content without an expiry (google_30_day_part_b_v1): every file that calls a Business Profile API is classified, every Google column and saved answer is on the 30-day delete list, the daily sweep is wired and OFF; static, nothing called; runs in daily-health-check.sh',
  'check-rank-schedule.mjs': 'the map ranking really runs (rank grid park lifted, 10-31): locked main keyword, two scans a month at 10:00 client time, recorded, failed pin vs not ranked, cost and provider count; fakes only; runs in daily-health-check.sh',
  'check-system-health-covers-every-job.mjs': 'every scheduled job is on the System health list and wrapped (admin_system_health_v1, 10-31); files + the Mac\'s own plists, runs in daily-health-check.sh',
  'check-job-status-reads-true.mjs': 'the System health states and card on fakes (admin_system_health_v1, 10-31); files only, runs in daily-health-check.sh',
  'check-onboarding-writes-are-per-key.mjs': 'the WEBSITE repo\'s writers of the Month 1 record (master data audit G9, 11-11): the per-key database function and its helper agree, and the adopted writers keep another writer\'s change, on a fake database only (nothing read or written for real); run by daily-health-check.sh; it reads no video pipeline output.',
  'check-contracts-cannot-be-deleted.mjs': 'the WEBSITE repo\'s contracts, invoices and client deletes (master data audit G12 + G16, 11-11): the SQL file, a static scan of both repos, and the Stripe webhook\'s processed flag on a signed fake event; nothing read or written for real; run by daily-health-check.sh; it reads no video pipeline output.',
  'check-airtable-refusals-are-never-silent.mjs': 'website functions: every Airtable caller checks the answer (the Nov 3-6 outage, 11-7); static plus the helper on fakes, nothing real called; runs in daily-health-check.sh',
  'check-job-alert-path.mjs': 'the monthly test: a job broken on a fake proves the alert path (admin_system_health_v1, 10-31); nothing real called, runs in daily-health-check.sh',
  'check-job-watcher-ran.mjs': 'the Mac watches the watcher (admin_system_health_v1, 10-31); one read, guarded by db-health in daily-health-check.sh',
  // 11-11 automation clock + runbooks master pages: none of these can affect whether a video is safe to build or send
  'check-production-runs-take-turns.mjs': 'the one turn on the clients\' database between the morning check, the night full check and the backup (11-11); runs the lock in a temp dir and reads both repos; run by daily-health-check.sh. It proves the 9 PM pre-flight reads no client data, so it is not a pre-flight gate itself.',
  'check-alerts-have-a-second-channel.mjs': 'the WEBSITE repo\'s alert paths (Quo text, RGA-only email, outside ping, 11-11), fakes only; run by daily-health-check.sh; the video pipeline sends no alerts through them.',
  'check-billing-email-has-its-own-budget.mjs': 'the WEBSITE repo\'s billing email budget (11-11), fakes only; run by daily-health-check.sh; nothing in the video pipeline bills.',
  'check-system-health-shows-both-pacific-times.mjs': 'the WEBSITE repo\'s System health schedule words (UTC + PST + PDT, 11-11), pure; run by daily-health-check.sh; no bearing on a video.',
  'check-the-blind-spots-are-probed.mjs': 'the WEBSITE repo\'s cloud probes (Google Cloud billing, Supabase health, sign-in email delivery, 11-11), fakes only; run by daily-health-check.sh; the video pipeline calls none of them.',
  'check-backups-run-every-day.mjs': 'the client data backup\'s every-day LaunchAgent (11-11), files only; run by daily-health-check.sh; backups are not part of the video pipeline.',
  'check-the-weekly-audit-is-read-only.mjs': 'the weekly audit job stays read-only (Chris 10-31); files only, runs in daily-health-check.sh',
  'check-the-step-map-is-current.mjs': 'compares the step sheet with the playbook, and the sheet only changes after a deploy or the morning rebuild, so a pre-deploy stop would refuse every step change before the sheet could be rebuilt from the live page. Runs in the daily check right after the rebuild',
  'check-the-daily-check-is-alive.mjs': 'watches the morning job itself, so it cannot run only from inside that job: nightly-full-check.sh runs it every night; files only, not the video pre-flight',
  'check-the-monthly-report-reads-true.mjs': 'a client monthly-report rule: the real report.js in a browser on fixtures, and the metrics pull on fixed Google responses, no production read; runs in daily-health-check.sh, not the video pre-flight',
  'check-admin-step-text-reads-true.mjs': 'an admin SOP text rule, file-only; runs in daily-health-check.sh, not the video pre-flight',
  'check-the-monthly-report-opens-the-call.mjs': 'a client monthly-report rule, runs on a fake database: nightly-full-check.sh runs it every night; not the video pre-flight',
  'check-step-36-booking-every-scenario.mjs': 'the WEBSITE repo\'s admin step 36 + the booking-link veto + the Remind popup (step36_booking_rga_does_it_v1, approved 10-29); run by daily-health-check.sh + its mutation suite',
  'check-a-stray-rejection-never-blanks-the-admin.mjs': 'the WEBSITE repo\'s admin.js rejection handler (a stray rejection blanked a loaded admin, found 10-29); run by daily-health-check.sh + its mutation suite',
  'check-admin-steps-29-38-match-mockups.mjs': 'the WEBSITE repo\'s admin steps 29–38 + client step 4 done card (11 mockups approved 10-29); run by daily-health-check.sh + its mutation suite',
  'check-a-covered-area-never-touches-google.mjs': 'the WEBSITE repo\'s step 4 / admin step 28 service area (approved step4_done_in_portal_v2): a place inside a city already on the profile is covered and never sent to Google; run by daily-health-check.sh + its mutation suite',
  'check-step4-change-something-opens.mjs': 'the WEBSITE repo\'s client step 4 Change something (approved step4_done_in_portal_v2 part 2); run by daily-health-check.sh + its mutation suite',
  'check-business-facts-match-google.mjs': 'the WEBSITE repo\'s Check your business on Google step (approved business_on_google_v1): compare, write + read back, RGA items, client record sync, admin, nightly — Google faked, a portal check, not video preflight',
  'check-step-7-works-in-any-state.mjs': 'the WEBSITE repo\'s step 7 end to end for a Texas and a New York business (Google read → portal → save → record → nightly → admin) — Google + DB faked, a portal check, not video preflight',
  'check-step-9-hours-card.mjs': 'the WEBSITE repo\'s step 9 hours card (approved step9_hours_card_v1) — a portal check, not video preflight',
  'check-admin-ai-search-hand-check.mjs': 'the WEBSITE repos Month 6 AI hand check + mentions step (approved admin_ai_search_v2), file-only; runs in daily-health-check.sh, not video preflight',
  'check-admin-see-what-client-sees.mjs': 'the WEBSITE repos admin preview of the clients card (approved admin_see_what_client_sees_v1), file-only; runs in daily-health-check.sh, not video preflight',
  'check-kickoff-why-now-and-blog-choice.mjs': 'the WEBSITE repos kickoff why-now question + blog card (approved client_kickoff_why_now_v1), file-only; runs in daily-health-check.sh, not video preflight',
  'check-admin-photo-zoom-full-size.mjs': 'the WEBSITE repos admin photo zoom (approved admin_photo_zoom_v1), file-only; runs in daily-health-check.sh, not video preflight',
  'check-step-10-booking-link.mjs': 'the WEBSITE repo\'s step 10 booking link for any business (approved step10_booking_link_v1) — a portal/admin check, not video preflight',
  'check-step-11-details.mjs': 'the WEBSITE repo\'s step 11 details for any business (approved step11_details_v1) — a portal/admin check, not video preflight',
  'check-step-13-closeout-call.mjs': 'the WEBSITE repo\'s step 13 close-out call waits honestly (approved step13_closeout_call_v1) — a portal/admin check, not video preflight',
  'check-done-row-measures-agree.mjs': 'the WEBSITE repo\'s done-row measures (portal fallback · browser gate · daily walk) strip the same chrome — files only, no bearing on tonight\'s videos; daily-health-check.sh',
  'check-open-moves-reach-every-surface.mjs': 'the WEBSITE repo\'s one open-moves list reaching every To do surface — files only, no bearing on tonight\'s videos; daily-health-check.sh',
  'check-every-wait-spins.mjs': 'the WEBSITE repo\'s waiting lines spin via shared/busy.js — files only, no bearing on tonight\'s videos; daily-health-check.sh',
  'check-an-upload-proves-it-is-the-right-website.mjs': 'the WEBSITE repo\'s publish safety (_publish-safety.js) run against a fake GitHub + site — no bearing on tonight\'s run',
  'check-first-payment-sends-one-letter.mjs': 'behavioural (11-11 plans-and-emails): the WEBSITE repo\'s first payment run through the real webhook, send-invoice-email and notify-client-stage on a fake database and fake Gmail; runs in daily-health-check.sh, not video preflight',
  'check-one-price-everywhere.mjs': 'static (11-11 plans-and-emails): the one price sentence on every WEBSITE page that quotes the offer, derived from data/offer-pricing.json; runs in daily-health-check.sh, not video preflight',
  'check-a-new-agreement-says-only-what-exists.mjs': 'render (11-11 plans-and-emails): the WEBSITE repo\'s agreement for every plan names only the way to pay the code takes; runs in daily-health-check.sh, not video preflight',
  'check-a-late-account-ends-in-writing.mjs': 'behavioural (11-11 plans-and-emails): the WEBSITE repo\'s billing ladder, notices and alert on a fake database and fake Gmail; runs in daily-health-check.sh, not video preflight',
  'check-admin-fixes-1028-hold.mjs': 'the WEBSITE repo\'s admin fixes (open moves, the read-only Google check, the file list, wording) run offline with fakes — no bearing on tonight\'s run',
  'check-an-approval-shows-its-receipt.mjs': 'the WEBSITE repo\'s For your approval receipt, rendered offline in Chrome from portal.js + portal.css — no bearing on tonight\'s run',
  'check-the-nav-badge-matches-the-mockup.mjs': 'the WEBSITE repo\'s client portal menu (badge shape vs the approved mockup, labels on one line), rendered offline in Chrome — no bearing on tonight\'s run',
  'check-every-website-change-is-built-labelled-approved.mjs': 'the WEBSITE repo\'s built → labelled → approved → uploaded rule (for_your_approval_v2): shared rules, the PR remover on a fake GitHub, the preview handler — files only, no bearing on tonight\'s videos; daily-health-check.sh',
  'check-the-access-test-publishes.mjs': 'the WEBSITE repo\'s page-file builder + pull-request publisher (website_system_v2 builds 8–9) on the real homepage + a fake GitHub — files only, no bearing on tonight\'s videos; daily-health-check.sh',
  'check-website-rows-are-step-8-cards.mjs': 'the WEBSITE repo\'s admin website rows (admin_website_steps_v1) rendered in headless Chrome — files only, no bearing on tonight\'s videos; daily-health-check.sh',
  'check-a-real-page-publishes-safely.mjs': 'the WEBSITE repo\'s page build and pull request (website_system_v2 builds 8-9) on a fake database, GitHub and websites: no bearing on tonight\'s scrape or video run. Runs in daily-health-check.sh.',
  'check-step-17-judges-speed-like-google.mjs': 'the WEBSITE repo\'s step 17 speed recipe and the page builder banner rule (step17_speed_and_send_now_v1, 11-7) on fakes; no bearing on the video pipeline. Runs in daily-health-check.sh.',
  'check-the-headline-recipe-holds.mjs': 'the WEBSITE repo\'s step 44 recipe (headline_cta_recipe_v1, 11-7) on fakes; no bearing on tonight\'s video pipeline. Runs in daily-health-check.sh.',
  'check-a-new-page-wears-the-site-design.mjs': 'the WEBSITE repo\'s new-page design fit (page_builder_site_design_v1, 11-7) on fakes; no bearing on tonight\'s video pipeline.',
  'check-a-page-is-placed-and-linked.mjs': 'the WEBSITE repo\'s page choice, placement and links (page_placement_and_links_v1, 11-7) on fakes; no bearing on tonight\'s video pipeline.',
  'check-business-details-start-from-the-page.mjs': 'the WEBSITE repo\'s step 41 business-code merge (schema_merge_v1, 11-7) on fakes; no bearing on tonight\'s video pipeline.',
  'check-code-changes-publish-themselves.mjs': 'the WEBSITE repo\'s code-change publishing (schema_merge_v1 parts 2-3, 11-7) on fakes; no bearing on tonight\'s video pipeline.',
  'check-step-50-links-the-whole-site.mjs': 'the WEBSITE repo\'s step 50 whole-site links (page_placement_and_links_v1 part 3, 11-7) on fakes; no bearing on tonight\'s video pipeline.',
  'check-place-pages-follow-the-research.mjs': 'the WEBSITE repo\'s steps 46-47 place rules (website_steps_46_50_research_v1, 11-7) on fakes; no bearing on tonight\'s video pipeline.',
  'check-step-48-uses-first-hand-material.mjs': 'the WEBSITE repo\'s step 48 material sources (website_steps_46_50_research_v1, 11-7); no bearing on tonight\'s video pipeline.',
  'check-admin-code-result.mjs': 'the WEBSITE repo\'s admin code-result table (admin_code_result_v1, 11-8), rendered in Chrome; no bearing on tonight\'s video pipeline.',
  'check-a-blocked-publish-warns-admin.mjs': 'the WEBSITE repo\'s publish checks and the admin warning they draw (admin_publish_blocked_warning, 11-8), fakes + Chrome; no bearing on tonight\'s video pipeline.',
  'check-the-video-move-is-safe.mjs': 'the WEBSITE repo\'s outreach video move to file storage (rga_videos_to_storage_v1, 11-8), fakes + Chrome; it reads no video pipeline output.',
  'check-the-site-is-published-one-way.mjs': 'static read of the publish scripts in both repos (rga_videos_to_storage_v1, 11-8); it runs nothing.',
  'check-every-outreach-video-plays.mjs': 'a LIVE read of every outreach video address (HEAD only, rga_videos_to_storage_v1, 11-8); it does not run the pipeline.',
  'check-the-host-builds-rgas-changes.mjs': 'the WEBSITE repo\'s host check (website_access_host_builds_v1, 11-8), fakes + Chrome; it reads no video pipeline output.',
  'check-rga-acts-through-its-app.mjs': 'the WEBSITE repo\'s GitHub identity helper (rga_github_app_v1, 11-8), fakes; it reads no video pipeline output.',
  'check-a-client-installs-rgas-app.mjs': 'the WEBSITE repo\'s client GitHub app install (client_github_app_install_v1, 11-8), fakes + Chrome; it reads no video pipeline output.',
  'check-website-access-gaps.mjs': 'the WEBSITE repo\'s access fixes (website_access_gaps_v1, 11-8), fakes only; run by daily-health-check.sh; it reads no video pipeline output.',
  'check-out-of-date-means-something-new.mjs': 'the WEBSITE repo\'s out-of-date rule (out_of_date_means_changed_v1, 11-8), vm + pure; run by daily-health-check.sh; it reads no video pipeline output.',
  'check-step-25-reads-google.mjs': 'the WEBSITE repo\'s step 25 tracking check (step25_tracking_from_google_v1, 11-8), fakes only; run by daily-health-check.sh; it reads no video pipeline output.',
  'check-a-stuck-change-says-so.mjs': 'the WEBSITE repo\'s stuck-change fix (publish_failure_shows_v1, 11-8), fakes + source; run by daily-health-check.sh; it reads no video pipeline output.',
  'check-citations-52-55.mjs': 'the WEBSITE repo\'s admin steps 52-55 (citations_52_55_v1, 11-9), fakes only (database, Google profile, pages, SerpAPI, model); run by daily-health-check.sh; it reads no video pipeline output.',
  'check-a-mention-counts-only-when-seen-live.mjs': 'the WEBSITE repo\'s best of lists and mentions (tier3_best_in_class_v1 section 3, 11-11), fakes only (database, pages, SerpAPI, model, sender); run by daily-health-check.sh; it reads no video pipeline output.',
  'check-steps-57-64.mjs': 'the WEBSITE repo\'s admin steps 57-64 (steps_57_64_v1, 11-9), fakes + vm only (database, search, Google, model, admin card lifts); run by daily-health-check.sh; it reads no video pipeline output.',
  'check-setup-vs-month1.mjs': 'the WEBSITE repo\'s Getting started / Month 1 split (setup_vs_month1_v1, 11-10): shared/setup-split.js fixtures, the open-moves rules, the skip endpoint and the real portal drawn in headless chrome on our fake database; run by daily-health-check.sh; it reads no video pipeline output.',
  'check-call-to-client.mjs': 'the WEBSITE repo\'s call-to-client build (call_to_client_v1 + call2_console_v1, 11-10) on fakes only (database, Google, Airtable); run by daily-health-check.sh; it sends nothing and reads no video pipeline output.',
  'check-schedule-matches-mockup.mjs': 'renders the WEBSITE repo admin Schedule tab in headless Chrome and compares it with the approved mockup (11-10); run by daily-health-check.sh; no live data.',
  'check-schedule-system-v6.mjs': 'renders the WEBSITE repo admin Schedule (schedule.js + schedule-dialogs.js) in headless Chrome, opens every control and popup against the approved v6 mockup (11-10), with the browser in Tokyo time to prove Pacific; sends nothing; run by daily-health-check.sh',
  'check-dialog-tone.mjs': 'lifts rgaInferTone from the WEBSITE admin.js and holds dialog kinds both ways (11-10); run by daily-health-check.sh.',
  'check-master-schedule.mjs': 'the WEBSITE repo\'s master schedule (master_schedule_v1 v5, 11-10) on fakes only; run by daily-health-check.sh; it reads no video pipeline output.',
  'check-business-phone-never-a-contact-cell.mjs': 'static scan of the WEBSITE repo\'s netlify/functions for a contact\'s phone standing in for the business phone, plus the five messages (business_phone_only_v1, 11-11); run by daily-health-check.sh; it reads no video pipeline output.',
  'check-call-names.mjs': 'the WEBSITE repo\'s six call names (call_names_v1, 11-10), a static scan; run by daily-health-check.sh; it reads no video pipeline output.',
  'check-one-wording-per-fact.mjs': 'the WEBSITE repo\'s client wording, one per fact, and the one call-length setting (master map 11-11), static + the shared rules run on fixtures; run by daily-health-check.sh; it reads no video pipeline output.',
  'check-master-sop-is-current.mjs': 'the WEBSITE repo\'s Master SOP (docs/master-sop, 11-11) held against the playbook, the job manifest and the code: static, its own generator rebuilt in memory, 8 planted defects every run; run by daily-health-check.sh; it reads no video pipeline output.',
  'check-twin-suppress-job.mjs': 'the WEBSITE repo\'s daily lead-twin-suppress job (11-11), static + a fake Airtable only (nothing is read or written for real); run by daily-health-check.sh; it reads no video pipeline output.',
  'check-places-cap-is-said.mjs': 'the WEBSITE repo\'s Places SearchText callers and their shared daily budget (11-11), static + fakes only (no network, no key, nothing written); run by daily-health-check.sh; the video pipeline calls no Google Cloud API.',
  'check-integrations-are-watched-from-the-cloud.mjs': 'the WEBSITE repo\'s cloud integration checks and budgets (integrations_hardening_v1, 11-11), shipped code on fakes only (no network, no email, no text, nothing written to Google); it proves itself against the before state; run by daily-health-check.sh; it reads no video pipeline output.',
  'check-google-links-carry-the-campaign-tag.mjs': 'the WEBSITE repo\'s Google profile link tags and the Dashboard\'s two counters (tier3 item 9, 11-11), fakes only (a fake Google, a fake Analytics; no network, nothing written); run by daily-health-check.sh; it reads no video pipeline output.',
  'check-the-fix-plan-the-client-sees-matches-admin.mjs': 'the WEBSITE repo\'s client view of admin 30\'s fix plan (tier3 item 10a, 11-11), a fake database only; run by daily-health-check.sh; it reads no video pipeline output.',
  'check-your-numbers-prefill-matches-the-frozen-months.mjs': 'the WEBSITE repo\'s Monthly 14 pre-fill (tier3 item 10b, 11-11), a fake database only; run by daily-health-check.sh; it reads no video pipeline output.',
  'check-portal-has-no-em-dash.mjs': 'static scan of the WEBSITE repo\'s client portal source for an em dash in client-visible text (11-10); run by daily-health-check.sh; it reads no video pipeline output.',
  'check-the-morning-run.mjs': 'the WEBSITE repo\'s morning run (steps_57_64_v1, 11-9), fakes only (database, runners, search count); run by daily-health-check.sh; it reads no video pipeline output.',
  'check-the-months-are-kept.mjs': 'the WEBSITE repo\'s months (monthly_v1, 11-9), fakes only (a database behind a fake fetch); run by daily-health-check.sh; it reads no video pipeline output.',
  'check-monthly-weekly.mjs': 'the WEBSITE repo\'s Every week (monthly_s2_weekly_v1, 11-9), fakes only (a database behind a fake fetch, a fake Google); run by daily-health-check.sh; it reads no video pipeline output.',
  'check-account-health.mjs': 'the WEBSITE repo\'s Account health (Monthly 28-30) and the added quarter steps (31-33) (mature_account_health_v1, 11-10), fakes only (no network, no email, no model, no Google); run by daily-health-check.sh; it reads no video pipeline output.',
  'check-monthly-quarter.mjs':'the WEBSITE repo\'s Every quarter (monthly_s4_quarterly_v1, 11-9), fakes only (no network, no email, no search, no Google write); run by daily-health-check.sh; it reads no video pipeline output.',
  'check-monthly-before-january.mjs': 'the WEBSITE repo\'s Monthly before January (monthly_before_january_v1, 11-9), fakes only (no network, no email, no search, no Google write); run by daily-health-check.sh; it reads no video pipeline output.',
  'check-supabase-security-advisor.mjs': 'reads Supabase\'s own security advisor (read-only Management API) + our SQL files (11-10 kickoff_slot_holds had RLS off); no write; run by daily-health-check.sh; it reads no video pipeline output.',
  'check-scheduled-jobs-find-claude.mjs': 'reads this Mac\'s launchd schedules (11-10 weekly audit "claude not found") and runs only `command -v claude` with each plist\'s PATH; no write; run by daily-health-check.sh; it reads no video pipeline output.',
  'check-email-engagement-is-counted.mjs': 'the WEBSITE repo\'s email engagement rules (11-10: Gmail opens dropped, clickers suppressed as non-openers, Calls lost them), fakes only (no Airtable, no network); it proves itself against the before state; run by daily-health-check.sh; it reads no video pipeline output.',
  'check-a-signed-client-reaches-the-crm.mjs': 'the WEBSITE repo\'s sales-to-client hand-off (master audit #7 + #16, 11-11): runs the real start-as-client and contract-sign against a fake Supabase and a fake Airtable (no email, no real write), plus one live Airtable schema GET with --live-schema; run by daily-health-check.sh; it reads no video pipeline output.',
  'check-video-cta-keeps-the-lead.mjs': 'the WEBSITE repo\'s audit form and lead match (master audit #7 + #15, 11-11): the real script.js in jsdom, the v/ page links, and the real fga-intake match against a fake Airtable; run by daily-health-check.sh; it reads the video pages\' links, never a video render.',
  'check-every-outreach-link-resolves.mjs':'live check of the outreach EMAILS\' page links (11-10: /growth-audit/ 404\'d for 10 days), reads the Apps Script copy in the website repo and fetches each page on the live site; no write (function URLs skipped); run by daily-health-check.sh; it reads no video pipeline output.',
  'check-admin-dashboard-opens-on-itself.mjs': 'the WEBSITE repo\'s admin Dashboard placement (admin_dashboard_top_v2, 11-9), source only (no network); it proves itself against the before state; run by daily-health-check.sh; it reads no video pipeline output.',
  'check-one-current-month.mjs': 'the WEBSITE repo\'s one current month (master map Tier 1, 11-11), shipped code on fakes only (no network, no email, nothing written); run by daily-health-check.sh; it reads no video pipeline output.',
  'check-a-spam-report-has-evidence.mjs': 'the WEBSITE repo\'s Monthly 9 competitor watch and spam reports (tier3 item 4, 11-11), shipped code on fakes only (a fake database and page reader: no search, nothing reported to Google); run by daily-health-check.sh; it reads no video pipeline output.',
  'check-review-requests-never-ask-on-yelp.mjs': 'the WEBSITE repo\'s second review site in the one review request (tier3 item 5, 11-11, extends check-no-review-gating), shipped code + data/review-sites.json on fakes only (nothing sent, no search); run by daily-health-check.sh; it reads no video pipeline output.',
  'check-review-replies-within-two-days.mjs': 'the WEBSITE repo\'s Monthly 4 review replies (tier3 item 2, 11-11), shipped code on fakes only (a fake Google, a fake drafter, a fake database: nothing posted, no email); run by daily-health-check.sh; it reads no video pipeline output.',
  'check-tier2-steps-run-themselves.mjs': 'the WEBSITE repo\'s master map Tier 2 steps (contract auto-accept, Setup advance, Monthly blog posts, categories, form tracking, Bing import, 11-11), shipped code on fakes only (no network, no email, nothing written to Google); run by daily-health-check.sh; it reads no video pipeline output.',
  "check-every-client-message-is-in-the-list.mjs": "the WEBSITE repo: client notice list: every client sender (email, text, invite, portal) records its row; the copy as sent; a failed send for admin only, never the client; nightly every recorded send has its row (card_notice_designs_v1, 11-11), shipped code on fakes only (no email, no text, nothing written; read-only database check only with the nightly keys); run by daily-health-check.sh; it reads no video pipeline output.",
  "check-billing-and-service-notices-cannot-be-switched-off.mjs": "the WEBSITE repo: billing and service notices are always sent: the one gate says send, the API refuses the write, the portal draws them locked, the table refuses the row (card_notice_designs_v1, 11-11), shipped code on fakes only (no email, no text, nothing written; read-only database check only with the nightly keys); run by daily-health-check.sh; it reads no video pipeline output.",
  "check-a-switched-off-reminder-is-not-sent.mjs": "the WEBSITE repo: a reminder the client switched off is not sent (call reminders by email and text, step reminders, photos remind me later, the kickoff agenda); unreadable settings = not now (card_notice_designs_v1, 11-11), shipped code on fakes only (no email, no text, nothing written; read-only database check only with the nightly keys); run by daily-health-check.sh; it reads no video pipeline output.",
  "check-every-approval-comment-is-answered-or-listed.mjs": "the WEBSITE repo: one comment thread per approval item: each client comment is RGA's To do row (1 business day) and a Messages entry until RGA's reply; the role comes from the sign-in; the reply needs the outward dialog (card_notice_designs_v1, 11-11), shipped code on fakes only (no email, no text, nothing written; read-only database check only with the nightly keys); run by daily-health-check.sh; it reads no video pipeline output.",
  "check-the-mid-month-note-never-sends-itself.mjs": "the WEBSITE repo: the mid-month note is drafted by the morning run and sent only by RGA's signed-in Approve after the outward dialog; nightly every sent note was approved first (card_notice_designs_v1, 11-11), shipped code on fakes only (no email, no text, nothing written; read-only database check only with the nightly keys); run by daily-health-check.sh; it reads no video pipeline output.",
  "check-the-mid-month-note-says-only-what-was-seen-live.mjs": "the WEBSITE repo: the mid-month note claims only what was seen live since the last report; every number is a count of its items; an edit can only keep or remove a ticked line (card_notice_designs_v1, 11-11), shipped code on fakes only (no email, no text, nothing written; read-only database check only with the nightly keys); run by daily-health-check.sh; it reads no video pipeline output.",
  'check-client-health-matches-monthly-28.mjs': 'the WEBSITE repo\'s admin-only client health view (tier3_best_in_class_v1 item 7, 11-11) against each client\'s Monthly 28, shipped code on fakes only (no network, no database, no email); run by daily-health-check.sh; it reads no video pipeline output.',
  'check-ai-sample-says-date-and-runs.mjs': 'the WEBSITE repo\'s monthly AI sample (tier3_best_in_class_v1 item 6, 11-11, pilot on RGA\'s own business) and the client reserve formula the Scraper\'s SerpAPI preflight reads, fakes only (no SerpAPI search, no OpenAI request, no database); run by daily-health-check.sh; the night\'s reserve itself is held by check-serpapi-budget in pre-flight.',
  'check-a-link-counts-only-when-seen-live.mjs': 'the WEBSITE repo\'s link and local PR pilot (tier3_best_in_class_v1 item 8, 11-11), shipped code on fake pages only (no fetch, no search, no model, no database); run by daily-health-check.sh; it reads no video pipeline output.',
  'check-one-admin-card.mjs': 'the WEBSITE repo\'s one admin card (card_notice_designs_v1 section 1, 11-11), shipped renderer + admin.css drawn in local Chrome from fixtures, source scans for the moved shells (no network, nothing written); it proves itself against the before state; run by daily-health-check.sh; it reads no video pipeline output.',
  'check-client-monthly.mjs': 'the WEBSITE repo\'s client monthly side (client_monthly_v1, 11-9), source + fakes only (no network, no email, no search, no Google write); it proves itself against the before state; run by daily-health-check.sh; it reads no video pipeline output.',
  'check-client-monthly-in-a-browser.mjs': 'client-portal gate, reads the live portal as RGA in chromium (read-only sign-in, writes blocked by acceptance/guard.mjs) with THIS repo\'s portal files: run after each portal deploy with node --env-file=.env scripts/check-client-monthly-in-a-browser.mjs (exit 2 = flaky, retry); it needs the live site so it cannot run pre-flight; a client\'s Ongoing work card cannot make a video unsafe',
  'check-monthly-close.mjs': 'the WEBSITE repo\'s Close the month (monthly_s5_close_v1, 11-9), fakes only (no network, no email, no model); run by daily-health-check.sh; it reads no video pipeline output.',
  'check-monthly-once.mjs': 'the WEBSITE repo\'s Once a month (monthly_s3_monthly_v1, 11-9), fakes only (no network, no paid scan); run by daily-health-check.sh; it reads no video pipeline output.',
  'check-monthly-weekly.mjs': 'the WEBSITE repo\'s Every week (monthly_s2_weekly_v1, 11-9), fakes only (a database behind a fake fetch, a fake Google); run by daily-health-check.sh; it reads no video pipeline output.',
  'check-monthly-start.mjs': 'the WEBSITE repo\'s Start of month (monthly_start_v1, 11-9), fakes only (a database behind a fake fetch, no model); run by daily-health-check.sh; it reads no video pipeline output.',
  'check-step58-reads-youtube.mjs': 'the WEBSITE repo\'s admin step 58 YouTube read-back (step58_youtube_readback_v1, 11-9), fakes only (database, YouTube); run by daily-health-check.sh; it reads no video pipeline output.',
  'check-steps-59-63.mjs': 'the WEBSITE repo\'s admin steps 59, 60, 63 (steps_59_63_v1, 11-9), fakes + vm only (database, model, admin card lifts); run by daily-health-check.sh; it reads no video or pipeline file',
  'check-a-step-result-is-never-lost.mjs': 'the WEBSITE repo\'s step-result save (11-9 lost-write fix), fakes only (database); run by daily-health-check.sh; it reads no video or pipeline file',
  'check-step56-reads-step52.mjs': 'the WEBSITE repo\'s admin step 56 (step56_reads_step52_v1, 11-9), fakes + vm only (database, admin card lift); run by daily-health-check.sh; it reads no video or pipeline file',
  'check-three-small-fixes.mjs': 'the WEBSITE repo\'s three small fixes (three_small_fixes_v1, 11-8), source + vm only; run by daily-health-check.sh; it reads no video pipeline output.',
  'check-end-of-service-runs-itself.mjs': 'the WEBSITE repo\'s end-of-service runner (client_offboarding_v1, 11-8), fakes only; run by daily-health-check.sh; it reads no video pipeline output.',
  'check-the-access-test-runs-itself.mjs': 'the WEBSITE repo\'s automatic access test (auto_access_test_v1, 11-8), fakes only; run by daily-health-check.sh; it reads no video pipeline output.',
  'check-the-title-recipe-holds.mjs': 'the WEBSITE repo\'s step 43 recipe (title_meta_recipe_v1, 11-7) on fakes: evidence, pinned model, rule checks, rule pick, measured after; no bearing on tonight\'s video pipeline. Runs in daily-health-check.sh.',
  'check-a-live-page-stays-true.mjs': 'the WEBSITE repo\'s read-back, nightly watch, per-page Search Console and website auto-run (website_system_v2 builds 10-12, 14, 16) on fakes, no bearing on tonight\'s scrape or video run. Runs in daily-health-check.sh.',
  'check-the-page-builder.mjs': 'the WEBSITE repo\'s page builder, brief and quality rules (website_system_v2 builds 3 to 6, 15) on fixtures, files only, no bearing on tonight\'s scrape or video run. Runs in daily-health-check.sh.',
  'check-website-pages-are-website-changes.mjs': 'the WEBSITE repo\'s step blockers and shared website-change rules (website_system_v2 builds 1-2), files only, no bearing on tonight\'s scrape or video run. Runs in daily-health-check.sh.',
  'check-a-new-city-page-is-planned-from-data.mjs': 'the WEBSITE repo\'s row 45 city-page planner (rga_first_site_change_v1), run on fixtures + the repo sitemap — files only, no bearing on tonight\'s videos; daily-health-check.sh',
  'check-a-change-request-is-one-flow.mjs': 'the WEBSITE repo\'s client lock line (client_ask_for_a_change_v1) + open moves, run in a sandbox — files only, no bearing on tonight\'s videos; daily-health-check.sh',
  'check-step9-keeps-access-safe.mjs': 'the WEBSITE repo\'s step 9 (admin_row9_vault_v2): settle logic run on every case, the one writer, the retired draft, admin card states — files only, no bearing on tonight\'s videos; daily-health-check.sh',
  'check-step3-admin-accept-buttons.mjs': 'the WEBSITE repo\'s admin row 8 GitHub card, every button clicked in Chrome against a fake server — files only, no bearing on tonight\'s videos; daily-health-check.sh',
  'check-step3-github-accept.mjs': 'the WEBSITE repo\'s step 3 GitHub accept from admin (step3_admin_accept_v1), run against fake GitHub replies — files only, no bearing on tonight\'s videos; daily-health-check.sh',
  'check-step3-admin-identity.mjs': 'the WEBSITE repo\'s step 3 RGA Admin identity (access@ / GitHub rocketgrowthagency-admin) held equal across site-platforms.json, portal and admin — files only, no bearing on tonight\'s videos; daily-health-check.sh',
  'check-step3-website-access.mjs': 'the WEBSITE repo\'s step 3 card, builder data + detector (step3_website_access_v3) — files only, no bearing on tonight\'s videos; daily-health-check.sh',
  'check-step3-loop.mjs': 'the WEBSITE repo\'s step 3 loop (portal-step-input → admin row 8 → admin-access-confirm → lock/unlock) on a fake database — files only; daily-health-check.sh',
  'check-step3-auto-detect.mjs': 'the WEBSITE repo\'s step 3 auto-detect (detector proof lines, Step 1 ask, save, server clean, admin row 8) on fake data — files only; daily-health-check.sh',
  'check-call-tracking-upgrade.mjs': 'the WEBSITE repo\'s call tracking upgrade (portal step 11, admin-call-test, CallRail provision, sync, report) on a fake network — files only; daily-health-check.sh',
  'check-call-tracking-works-anywhere.mjs': 'the WEBSITE repo\'s call-tracking provisioning + provider adapters on a fake network — files only; daily-health-check.sh',
  'check-a-done-step-is-never-the-ask.mjs': 'the WEBSITE repo\'s portal done cards, run in a browser against the live test client with the page\'s record emptied (writes blocked) — daily-health-check.sh',
  'check-a-toggle-names-what-it-opens.mjs': 'the WEBSITE repo\'s portal row toggles + instruction email chips (step_toggle_labels_v1) — files only; daily-health-check.sh',
  'check-a-confirmed-step-is-locked.mjs': 'the WEBSITE repo\'s step lock (shared/step-lock.js + every portal writer + admin unlock, fake DB) — files only; daily-health-check.sh',
  'check-a-held-kickoff-cannot-be-reopened.mjs': 'the WEBSITE repo\'s portal-step-choice + portal kickoff row (fake DB) — files only; daily-health-check.sh',
  'check-approvals-page.mjs': 'the WEBSITE repo\'s For your approval page (approvals_page_v1) — files only; daily-health-check.sh',
  'check-site-snapshot.mjs': 'the WEBSITE repo\'s before-snapshot (_site-snapshot.js run on fake sites) + access ledger removal — files only; daily-health-check.sh',
  'check-step-37-describes-real-photos.mjs': 'the WEBSITE repo\'s step 37 (admin_step37_image_seo_v2): the photo read, the runner on fake sites with a fake vision call, the read-back, the admin card lifted — files only, no network; daily-health-check.sh',
  'check-website-change-approvals.mjs': 'the WEBSITE repo\'s website-change loop (shared/site-change.js + admin/portal-deliverables run against a fake DB + the inbox) — files only; daily-health-check.sh',
  'check-review-requests-ask-everyone.mjs': 'the WEBSITE repo\'s review-request policy (step 56/12, Monthly) — not video preflight; daily-health-check.sh',
  'check-no-client-record-was-lost.mjs': 'reads PRODUCTION records + activity (read-only, one at a time) — daily-health-check.sh, not preflight',
  'check-step11-photo-labels.mjs': 'the WEBSITE repo\'s client step 11 photo tiles (approved client_step11_photo_labels_v1, 11-4), read from files; not video preflight; daily-health-check.sh',
  'check-managed-portal-list.mjs': 'the managed client portal\'s Month 1 list DRAWN in a real browser: 1-7 with step 3 and the RGA cards, self-serve and no-mode unchanged (approved client_portal_slim_v1, 11-4); a browser gate, not video preflight; daily-health-check.sh',
  'check-managed-portal-numbering.mjs': 'the WEBSITE repo\'s managed client portal numbering (approved client_portal_slim_v1, 11-4), read from files; not video preflight; daily-health-check.sh',
  'check-two-writes-keep-an-approval.mjs': 'the WEBSITE repo (website-work W2, 11-11): master mockup #11 W2 (11-11): two writes cannot drop an approval (version-checked, merged per step and field, 409 on a clash; step rows after the SQL; publish watch puts one back); mutation suite in the same commit; run by daily-health-check.sh; it reads no video pipeline output.',
  'check-a-removed-access-is-never-has-access.mjs': 'the WEBSITE repo (website-work W4/W5, 11-11): master mockup #11 W4/W5 (11-11): a removed access (app or collaborator) is never has-access and tells RGA once; mutation suite in the same commit; run by daily-health-check.sh; it reads no video pipeline output.',
  'check-website-pages-measure-themselves.mjs': 'the WEBSITE repo (website-work W3, 11-11): master mockup #11 W3 (11-11): live pages measured weekly, a worse page is RGAs To do; mutation suite in the same commit; run by daily-health-check.sh; it reads no video pipeline output.',
  'check-a-failed-mode-read-names-no-number.mjs': 'the WEBSITE repo (portal modes, 11-11): master mockup #16 (11-11): a failed mode read sends no step number; managed is the one shared default; the daily walk covers both modes; mutation suite in the same commit; run by daily-health-check.sh; it reads no video pipeline output.',
  'check-every-form-reaches-the-crm.mjs': 'the WEBSITE repo (public site, 11-11): master mockup #15 (11-11): the daily form check, marked as a test, read back from the CRM and deleted; mutation suite in the same commit; run by daily-health-check.sh; it reads no video pipeline output.',
  'check-managed-surfaces-by-mode.mjs': 'the WEBSITE repo\'s managed-portal surfaces, RUN with fixtures (admin_managed_move_v1, 11-4); not video preflight; daily-health-check.sh',
  'check-managed-admin-working-cards.mjs': 'the WEBSITE repo\'s managed admin working cards (steps 27, 28, 19, 32, 26, who tag, chip), DRAWN and PRESSED in a real DOM, non-managed byte-identical to before (admin_client_cards_moved_v1, 11-4); not video preflight; daily-health-check.sh',
  'check-managed-step-4-photos.mjs': 'the WEBSITE repo\'s managed client step 4 photos, DRAWN in a real browser for three trades (approved client_step04_photos_v1, 11-4); a browser gate, not video preflight; daily-health-check.sh',
  'check-managed-step3-go-ahead.mjs': 'the WEBSITE repo\'s managed step 3 7-day go-ahead: the shared rule, the nightly pass, the endpoint, the website read RUN in memory, admin step 28 lifted, the portal DRAWN (approved client_step03_seven_day_rule_v1, 11-5); a browser gate, not video preflight; daily-health-check.sh',
  'check-managed-setup-fewer.mjs': 'the WEBSITE repo\'s managed Setup steps 4 and 5 finished with fewer, DRAWN and PRESSED in a real browser, plus portal-step-fewer, the nightly check, To do, the Month 1 report and admin 38/60 RUN (approved client_setup_fewer_v1, 11-5); a browser gate, not video preflight; daily-health-check.sh',
  'check-managed-skip-rules.mjs': 'the WEBSITE repo\'s skip rules (step 7 ask, step 12 skip, Skipped by RGA, form tracking with no website, To do and RGA cards), DRAWN and PRESSED, servers RUN on a stubbed fetch (approved client_steps_skip_rules_v1, 11-5); a browser gate, not video preflight; daily-health-check.sh',
  'check-managed-ongoing-tab.mjs': 'the WEBSITE repo\'s managed Ongoing work tab (Setup + Monthly + January), DRAWN and PRESSED in a real browser on a fixed clock, self-serve and no mode unchanged, plus the monthly report\'s month (approved ongoing_overview_v1 + ongoing_step08-12 + ongoing_win_story_v1, 11-5); a browser gate, not video preflight; daily-health-check.sh',
  'check-managed-steps-5-to-7.mjs': 'the WEBSITE repo\'s managed Setup steps 5, 6, 7 + one wording per status, DRAWN in a real browser at three widths (approved client_step05/06/07 + client_setup_status_protocol_v1, 11-4); not video preflight; daily-health-check.sh',
  'check-managed-admin-cards.mjs': 'the WEBSITE repo\'s managed admin cards (hours, attributes, kickoff answer), DRAWN and PRESSED in a real DOM (admin_managed_move_v1, 11-4); not video preflight; daily-health-check.sh',
  'check-client-portal-phases.mjs': 'the WEBSITE repo\'s client portal after the final review (approved 10-20) — not video preflight; daily-health-check.sh',
  'check-phase1-get-started.mjs': 'the WEBSITE repo\'s client portal after the final review (approved 10-20) — not video preflight; daily-health-check.sh',
  'check-phase2-set-up.mjs': 'the WEBSITE repo\'s client portal after the final review (approved 10-20) — not video preflight; daily-health-check.sh',
  'check-reviews-and-close.mjs': 'the WEBSITE repo\'s client portal after the final review (approved 10-20) — not video preflight; daily-health-check.sh',
  'check-monthly-asks.mjs': 'the WEBSITE repo\'s client portal after the final review (approved 10-20) — not video preflight; daily-health-check.sh',
  'check-final-review-sop.mjs': 'the WEBSITE repo\'s SOP (playbooks.json + the canonical flow/playbooks) after the final review (approved 10-20) — not video preflight; daily-health-check.sh',
  'check-done-records-steps-13-19.mjs': 'the WEBSITE repo\'s client steps 13-19 done cards (approved 10-20) — not video preflight; daily-health-check.sh',
  'check-client-step-5-shows-the-plan.mjs': 'the WEBSITE repo\'s client step 5 card (approved 10-20) — not video preflight; daily-health-check.sh',
  'check-client-steps-2-3-4-show-their-record.mjs': 'the WEBSITE repo\'s client steps 2-4 (approved 10-20) — not video preflight; daily-health-check.sh',
  'check-steps-6-and-7-confirm-in-the-portal.mjs': 'the WEBSITE repo\'s step 6 / step 7 portal cards (approved 10-20) — not video preflight; daily-health-check.sh',
  'check-every-service-key-function-checks-its-caller.mjs': 'the WEBSITE repo\'s function auth classification (security) — not video preflight; daily-health-check.sh',
  'check-the-mature-stage-reads-what-is-measured.mjs': 'the WEBSITE repo\'s Mature stage engine (batch 5) — not video preflight; daily-health-check.sh',
  'check-legacy-runners-retired-and-reports-built-here.mjs': 'the WEBSITE repo\'s retired legacy runners + server-side reports (batch 4) — not video preflight; daily-health-check.sh',
  'check-youtube-clips-come-from-the-client.mjs': 'the WEBSITE repo\'s YouTube clips client step (batch 4) — not video preflight; daily-health-check.sh',
  'check-monthly-posts-go-live-before-done.mjs': 'the WEBSITE repo\'s Monthly Google posts publish + read back (batch 4) — not video preflight; daily-health-check.sh',
  'check-step-18-nap-is-confirmed-per-listing.mjs': 'the WEBSITE repo\'s step 18 NAP confirmation (batch 4) — a runner/admin check, not video preflight; daily-health-check.sh',
  'check-step-23-competitors-find-the-listing.mjs': 'the WEBSITE repo\'s step 23 runner finds the client\'s listing without a full Maps link (batch 4) — a runner check, not video preflight; daily-health-check.sh',
  'check-a-closeout-booking-never-touches-the-kickoff.mjs': 'the WEBSITE repo\'s close-out booking is scoped to its own call (kickoff_slot_holds.purpose, batch 3) — a portal/admin check, not video preflight; run daily by daily-health-check.sh',
  'check-the-foundation-card-finishes.mjs': 'the WEBSITE repo\'s portal Foundation card says Done past onboarding — a portal check, not video preflight',
  'check-no-review-gating.mjs': 'the WEBSITE repo\'s prompts + step copy never ask for reviews by rating (Google policy, FTC 16 CFR 465) — a portal/admin check, not video preflight',
  'check-step-54-knowledge-panel.mjs': 'the WEBSITE repo\'s step 54 runner measures before it drafts — a portal/admin check, not video preflight',
  'check-gbp-landing-page.mjs': 'runs in daily-health-check.sh (11-01); the WEBSITE repo\'s admin step for which page the Google profile links to (approved admin_last_research_items_v1) — a portal/admin check, not video preflight',
  'check-citation-brand-discovery.mjs': 'runs in daily-health-check.sh (11-01); the WEBSITE repo\'s brand-name directory discovery for the industry-specific citations step (approved admin_last_research_items_v1) — a portal/admin check, not video preflight',
  'check-citation-runbook.mjs': 'runs in daily-health-check.sh (11-01); the WEBSITE repo\'s listings runbook card and its Search old and new control (approved admin_last_research_items_v1) — a portal/admin check, not video preflight',
  'check-step-49-schema.mjs': 'the WEBSITE repo\'s step 49 schema set — a portal/admin check, not video preflight',
  'check-a-service-area-business-is-not-flagged-for-a-hidden-address.mjs': 'the WEBSITE repo\'s audit and schema step for service-area clients, a portal/admin check, not video preflight',
  'check-the-schema-type-is-the-specific-one-or-local-business.mjs': 'the WEBSITE repo\'s schema step, a portal/admin check, not video preflight',
  'check-the-monthly-pagespeed-reads-field-data-honestly.mjs': 'the WEBSITE repo\'s monthly audit PageSpeed read, a portal/admin check, not video preflight',
  'check-one-google-card.mjs': 'the WEBSITE repo\'s one Google card on every Google step, portal + admin (approved one_google_card_v1) — a portal/admin check, not video preflight',
  'check-no-step-asks-for-a-retired-google-feature.mjs': 'the WEBSITE playbook never asks for a Google feature Google retired (approved retire_messaging_step_v1) — a playbook check, not video preflight',
  'check-no-typed-step-numbers.mjs': 'runs in daily-health-check.sh (11-01); the WEBSITE repo\'s step text, admin, portal and function errors never carry a typed step number (approved admin_recommended_fixes_v1) — a playbook/portal check, not video preflight',
  'check-every-control-spins.mjs': 'runs in daily-health-check.sh (added 11-01, it ran nowhere regular before); the WEBSITE repo\'s master busy state (Chris 10-15 "any button needs spinner"): shared/busy.js + the master CSS rule in portal and admin, clicked for real in Chrome — a portal check, not video preflight',
  'check-rga-tidies-a-second-logo.mjs': 'runs in daily-health-check.sh (added 11-01, it ran nowhere regular before); the WEBSITE repo\'s second-copy-of-the-logo flow (approved second_logo_cleanup_v1 → rga_manages_cleanup_v1: RGA recommends + removes, the client keeps a veto): the shared rule on cases across trades, portal-photo-keep against a faked database, the recheck hook, the portal\'s own renderer, admin lines — a portal check, not video preflight',
  'check-a-client-can-change-or-remove-a-photo.mjs': 'runs in daily-health-check.sh (added 11-01, it ran nowhere regular before); the WEBSITE repo\'s Change / Remove on step 7 photos, the honest logo line, the done fold and "With RGA" (approved photo_change_remove_v1): portal-photo-remove and _photo-retire against a faked database and Google, the portal\'s own renderer — a portal check, not video preflight',
  'check-a-client-can-choose-later.mjs': 'runs in daily-health-check.sh (added 11-01, it ran nowhere regular before); the WEBSITE repo\'s "Remind me later" on step 7 (approved step7_later_and_upload_v1 v2): portal-step-later against a faked database, the sweep\'s reminder helpers, the portal\'s own laterOf/renderer — a portal check, not video preflight',
  'check-step-7-kinds-fold.mjs': 'runs in daily-health-check.sh (added 11-01, it ran nowhere regular before); the WEBSITE repo\'s step 7 kind folds (approved step7_sections_fold_v1): the portal\'s own renderer and upload helpers, then Chrome with the shipped portal.css at 390–976px — a portal check, not video preflight',
  'check-the-stylesheets-are-balanced.mjs': 'runs in daily-health-check.sh: a stylesheet check on the two site sheets, nothing about a video',
  'check-step-7-top-is-calm.mjs': 'runs in daily-health-check.sh (added 11-01, it ran nowhere regular before); the WEBSITE repo\'s step 7 top (approved step7_streamlined_v1): the portal\'s own renderer, then Chrome with the shipped portal.css at 976 and 400px — a portal check, not video preflight',
  'check-plan-cards-match-the-mockup.mjs': 'browser render of the WEBSITE repo\'s done plan cards (steps 1–5) against steps_1_4_clean_v1 — files only, run by daily-health-check',
  'check-onboarding-and-leaving.mjs': 'the approved parts of Onboarding and Leaving (onboarding_and_offboarding_v1, 11-01): wording fixes, announced reminders (off until approved, two at most), the call outcome control, the closing list, lower GA4 and Search Console roles, the first-week and day-50 notes, and the client Cancel card run against fake Supabase with no email, Stripe or network; run by daily-health-check',
  'check-ai-search-checks.mjs': 'the build-now parts of the approved AI search checks (ai_search_checks_v1, 11-01): the crawler check reports facts and never reads an unreadable robots file as no block, the readiness audit has no FAQ line or mislabeled figures and an admin-only score, the Yelp step makes no promise; fake pages, no network, run by daily-health-check',
  'check-citations-additions.mjs': 'the build-now parts of the approved Citations additions (citations_additions_v1, 11-01): the NAP check reads the listings the listings check found and never calls an unreadable page wrong, the stale text is gone, the list fits the client\'s trade and country, the recheck ships off, claims first, never retries and never searches — fake Supabase and pages, no SerpAPI, run by daily-health-check',
  'check-reviews-additions.mjs': 'the build-now parts of the approved Reviews additions (reviews_additions_v1, 11-01): wording, a reply is Replied only once Google shows it (the morning read, told once, test clients quiet, nothing of the review kept), the asked-to-reviewed funnel reads unknown as unknown — fake Supabase and Google, run by daily-health-check',
  'check-reviews-feed.mjs': 'the live Google reviews on Ongoing work (approved reviews_ongoing_live_v1, 10-23): name + match rules, the morning read, the endpoint\'s Yes / Not her writes against a fake Supabase, the card in Chrome, admin claims — files only, run by daily-health-check',
  'check-step-12-review-requests.mjs': 'browser render of the WEBSITE repo\'s step 12 (review requests to 5 past customers, approved step12_review_requests_v1): the three states, the form, "you marked it sent" never "sent", reviews counted only when measured, the step-open email blocks — files only, no bearing on tonight\'s videos. Runs in daily-health-check.sh',
  'check-a-thread-email-reads-like-the-email.mjs': 'browser render of the WEBSITE repo\'s portal.js letterHtml (an email copy in a step\'s thread reads like the email; a test send is labelled) — files only, no bearing on tonight\'s videos. Runs in daily-health-check.sh',
  'check-back-restores-the-pressed-button.mjs': 'browser walk of the WEBSITE repo\'s portal.js + admin.js back/forward-cache restore (a button that leaves for Google or Stripe is not stuck after Back) — local http server, no bearing on tonight\'s videos. Runs in daily-health-check.sh',
  'check-the-sign-in-page-behaves.mjs': 'browser walk of the WEBSITE repo\'s /client-login/ (approved client_login_v3) against a stub Supabase — client sign-in, no bearing on tonight\'s videos. Runs in daily-health-check.sh',
  'check-signed-in-user-never-sees-login-form.mjs': 'static scan of the WEBSITE repo\'s client-login.js + portal.js — client-onboarding correctness (a working magic link must not land on a login form), no bearing on tonight\'s videos. Runs in daily-health-check.sh',
  'check-stage-changes-notify-client.mjs': 'static scan of WEBSITE-repo functions that advance a client stage — client-communication correctness, no bearing on tonight\'s videos. Runs in daily-health-check.sh',
  'check-refusal-is-not-done.mjs': 'static scan of the WEBSITE repo\'s admin banner logic against flow-execute\'s outcomes — admin honesty for client delivery, no bearing on tonight\'s videos, and it must never abort a video build. Runs in daily-health-check.sh',
  'check-robot-does-not-overclaim.mjs': 'static scan of the WEBSITE repo\'s admin/admin.js runFlowRobot() — an admin-honesty check about the client-delivery SOP, with no bearing on tonight\'s videos, and it must never abort a video build. Runs in daily-health-check.sh',
  'check-offer-matches-contract.mjs': 'compares the WEBSITE offer file to the contract PLANS — a commercial correctness check, not video health. Runs in daily-health-check.sh',
  'check-price-consistency.mjs': 'reads pricing out of the WEBSITE repo (contract generator, admin email draft, rep playbook) — a commercial correctness check, not video health. Runs in daily-health-check.sh',
  'check-no-or-echo-append.mjs': 'static lint of our own shell scripts — a code-hygiene guard, not a video gate, and it must never abort a build. Runs in daily-health-check.sh',
  'check-google-api-cost-safety.mjs': 'reads the WEBSITE repo\'s netlify/functions to enforce the billing boundary — a commercial safety check. It must NOT gate the nightly build (a billing question should never abort a video run). Runs in daily-health-check.sh',
  'check-send-queue-drained.mjs': 'manual restart probe for the 2026-08-25 production pause; not a nightly gate',
  'check-send-queue-can-reach-zero.mjs': 'restart-condition gate; runs in daily-health-check.sh. Reads the whole Airtable table, and a phantom queue entry cannot make tonight\'s video unsafe -- it makes production never START.',
  'check-ai-drafts-do-not-invent-prices.mjs': 'content-safety gate; runs in daily-health-check.sh. Reads the site repo and the onboarding records -- a fabricated price cannot make tonight\'s video unsafe, it makes a CLIENT PAGE false.',
  'check-every-playbook-step-can-run.mjs': 'onboarding-graph gate; runs in daily-health-check.sh. Reads the site repo playbook and runner -- a step with no executor cannot make tonight\'s video unsafe, it makes CLIENT WORK unable to start.',
  'check-no-invisible-controls.mjs': 'UI-contrast gate; runs in daily-health-check.sh. Reads the site repo stylesheets -- an invisible button cannot make tonight\'s video unsafe, it makes a CONTROL unusable.',
  'check-contract-doc-gets-every-field-it-renders.mjs': 'contract-projection gate; runs in daily-health-check.sh. Static read of the site repo -- a blank date on an agreement cannot make tonight\'s video unsafe, it makes a LEGAL DOCUMENT wrong.',
  'check-client-work-reaches-the-brain.mjs': 'client-knowledge gate; runs in daily-health-check.sh. Needs live Supabase, and stranded client knowledge cannot make tonight\'s video unsafe -- it makes the NEXT client\'s audit dumber than it should be.',
  'check-admin-sees-what-the-client-sees.mjs': 'approval-parity gate; runs in daily-health-check.sh. Static read of the site repo -- a drifted deliverable list cannot make tonight\'s video unsafe, it makes a client approve work the admin never displayed.',
  'check-drafts-use-real-services.mjs': 'content-correctness gate; runs in daily-health-check.sh. Static read of the site repo -- a draft describing the wrong business cannot make tonight\'s video unsafe, it puts false claims on a CLIENT\'S profile.',
  'check-approval-matches-what-was-shown.mjs': 'approval-integrity gate; runs in daily-health-check.sh. Needs live Supabase, and a drifted approval cannot make tonight\'s video unsafe -- it publishes something a CLIENT NEVER AGREED TO under their name.',
  'check-heavy-steps-cannot-time-out.mjs': 'platform-ceiling gate; runs in daily-health-check.sh. Static read of the site repo -- a 504 on a drafting step cannot make tonight\'s video unsafe, it makes a CLIENT\'S step impossible to run.',
  'check-hosting-bandwidth-headroom.mjs': 'availability gate; runs in daily-health-check.sh. Hits the live site, so it is too slow for per-run pre-flight -- but a hosting allowance running out takes the whole site down including the client portal.',
  'check-send-cap-held.mjs': 'reports a REAL cap breach from live data; surfaced via operational drift, must not block a build',
  'check-no-duplicate-send-rows.mjs': 'live Airtable state, not code health; surfaced via operational drift (3d). Watches the failure mode the 2026-08-27 inline-logging fix introduces — a double-write inflates countSentToday and SUPPRESSES sends, which looks like a quiet day, not an error',
  'check-day1-reservation-took.mjs': 'live Airtable state vs the last-pasted constant; surfaced via operational drift (3h). Not pre-flight - a thin Day-1 queue legitimately sends under the floor, so it must never fail a build',
  'check-integration-subscriptions.mjs': 'third-party subscription state (Netlify form hooks, Quo); surfaced via operational drift (3f0). Needs network + netlify CLI, so it must never gate a build',
  'check-duplicate-identity-leads.mjs': 'live CRM state, not code health; surfaced via operational drift (3e2). Must never block a build — a duplicate lead has nothing to do with tonight\'s videos',
  'check-quo-webhooks-live.mjs': 'third-party subscription state, not code health; surfaced via operational drift (3f1). Must never block a build — a missing Quo webhook has nothing to do with tonight\'s videos',
  'check-quo-key-on-the-server.mjs': 'asks the live schedule-data for its server-side Quo key test; fails on anything but ok (11-10); run by daily-health-check.sh.',
  'check-reminder-texts.mjs': 'holds the reminder text path in the WEBSITE call-reminders (11-11); run by daily-health-check.sh.',
  'check-inbound-sms-flowing.mjs': 'third-party webhook subscription state, not code health; surfaced via operational drift (3f2). Must never block a build — an unregistered SMS event has nothing to do with tonight\'s videos',
  'check-apps-script-paste-owed.mjs': 'deployment state of a DIFFERENT repo (the website .gs files vs the live Apps Script projects); surfaced via operational drift (3f). Must not block a scraper build — an unpasted auto-reply script has nothing to do with tonight\'s videos',
  // ── the checkers (11-11, master map approved: "every step with no checker gets one"), each with a mutation suite ──
  'check-daily-reds-reach-chris.mjs': 'the checkers (11-11, master map approved): the morning, rehearsal and night runs say N red as a System health error and the morning writes reports/daily-health/<date>.md; static + each runner\'s own finish run against a fake check-in server; runs in daily-health-check.sh; it reads no video pipeline output.',
  'check-every-mac-job-checks-in.mjs': 'the checkers (11-11): every com.rga.* LaunchAgent is a Mac job on the website _job-manifest and its script posts a start and a finish; files + the Mac\'s plists only; runs in daily-health-check.sh.',
  'check-every-step-names-its-gate.mjs': 'the checkers (11-11): every playbook, end-of-service and stage step id is named by a gate a scheduled runner runs; static; runs in daily-health-check.sh.',
  'check-the-audit-and-quarter-steps-hold.mjs': 'the checkers (11-11): the real runners of admin 12, 14, 30 and Monthly 15, 17 (flow-execute.js) on fakes only; runs in daily-health-check.sh; it reads no video pipeline output.',
  'check-no-secret-value-anywhere.mjs': 'the checkers (11-11): both repos, memory, reports and /tmp logs scanned for a secret VALUE by hash (names + file:line only), self-test on a planted fake secret; runs in daily-health-check.sh; a leak in a log cannot make a video unsafe.',
  'check-every-cache-buster-moved-with-its-file.mjs': 'the checkers (11-11): every admin/portal/shared file changed since origin/main has a moved ?v=; git + files, self-test on fixtures; runs in daily-health-check.sh.',
  'check-no-dormant-tables.mjs': 'the checkers (11-11): every table in the SQL files and the live schema (Management API, read-only) is named by code or kept with a reason; runs in daily-health-check.sh.',
  'check-no-dormant-exports.mjs': 'the checkers (11-11): every function exported from shared/, admin/ and portal/ has a caller, or is kept / on the 11-11 backlog; static, self-test on fixtures; runs in daily-health-check.sh.',
  'check-airtable-calls-will-last.mjs': 'the checkers (11-11): this month\'s metered Airtable calls (output/airtable-calls.log) forecast against the plan cap, red at 80%; self-test on a fixture log; runs in daily-health-check.sh.',
  'check-no-gate-flips.mjs': 'the checkers (11-11): no gate flipped pass and fail more than twice in 7 days (output/gate-verdicts.jsonl); self-test on a fixture log; runs in daily-health-check.sh.',
  'check-backups-leave-the-building.mjs': 'the checkers (11-11): the LaCie copies\' status files and Supabase\'s own backups (Management API, read-only) are fresh; unreadable = INDETERMINATE; self-test on fixtures; runs in daily-health-check.sh.',
  'check-no-one-is-staff-by-accident.mjs': 'the 11-11 database lockdown: is_internal_user() allow-lists roles, the role guard trigger exists, no public-role policy is true (Management API read-only SQL), and the portal client reads no staff rows and is refused role owner, and the role guard refuses a workspace on insert (read from its text, no probe); rules self-tested; runs in daily-health-check.sh.',
  'check-sign-ups-are-closed.mjs': 'security 11-11 gate: a typed email never becomes an account; runs in daily-health-check.sh',
  'check-no-secret-in-a-query-string.mjs': 'security 11-11 gate: no secret in a web address; runs in daily-health-check.sh',
  'check-ai-models-are-the-approved-setup.mjs': 'AI cost setup D 11-12 gate: models per tier, valid 5.x params, empty answer falls back, budget; runs in daily-health-check',
  'check-every-model-call-is-metered.mjs': 'content and AI 11-11 gate: every model call is a ledger row, key and month checked daily; runs in daily-health-check.sh',
  'check-a-gbp-description-ends-on-a-sentence.mjs': 'content and AI 11-11 gate: the Google description is never cut mid-sentence; runs in daily-health-check.sh',
  'check-gbp-words-need-the-clients-approval.mjs': 'content and AI 11-11 gate: Google description, services and details need the client approval; runs in daily-health-check.sh',
  'check-the-dead-content-engine-stays-gone.mjs': 'content and AI 11-11 gate: the dead content engine and the best-inference line stay gone; runs in daily-health-check.sh',
};

if (!fs.existsSync(PIPELINE)) fail('overnight-pipeline.sh not found.');
const pipeline = fs.readFileSync(PIPELINE, 'utf8');

const gates = fs.readdirSync(HERE).filter((f) => /^check-.*\.mjs$/.test(f)).sort();
if (!gates.length) fail('no check-*.mjs gates found at all — that cannot be right.');

const unwired = [];
let wired = 0;
for (const g of gates) {
  if (pipeline.includes(g)) { wired++; continue; }
  if (g in NOT_PREFLIGHT) continue;
  unwired.push(g);
}

// A stale excuse is its own drift: a file listed here that no longer exists means the list is being
// maintained by habit rather than by fact.
const ghosts = Object.keys(NOT_PREFLIGHT).filter((g) => !gates.includes(g));
if (ghosts.length) {
  fail(`NOT_PREFLIGHT lists ${ghosts.length} file(s) that no longer exist: ${ghosts.join(', ')}.\n` +
       '         Remove them — an excuse list that drifts from reality stops being read.');
}
ok(`every NOT_PREFLIGHT entry names a real file (${Object.keys(NOT_PREFLIGHT).length} excused)`);

// 🔴 An excuse is a CLAIM. If a reason says the gate "runs in <script>.sh", that must be verifiable —
// otherwise NOT_PREFLIGHT degrades into the place gates go to be forgotten, which is the exact failure
// this file exists to prevent. Added 2026-09-02 after check-playbook-integrity.mjs was excused with a
// reason naming two runners; nothing had ever checked that such a claim was true.
const brokenExcuses = [];
for (const [gate, reason] of Object.entries(NOT_PREFLIGHT)) {
  for (const m of String(reason).matchAll(/([a-z0-9-]+\.sh)/g)) {
    const runner = path.join(HERE, m[1]);
    if (!fs.existsSync(runner)) { brokenExcuses.push(`${gate}: names ${m[1]}, which does not exist`); continue; }
    if (!fs.readFileSync(runner, 'utf8').includes(gate)) {
      brokenExcuses.push(`${gate}: excuse claims it runs in ${m[1]}, but that script never invokes it`);
    }
  }
}
if (brokenExcuses.length) {
  console.error(`✗ FATAL: ${brokenExcuses.length} NOT_PREFLIGHT excuse(s) claim something untrue:`);
  for (const b of brokenExcuses) console.error(`     ${b}`);
  console.error('');
  console.error('   An excuse nobody verifies is how a gate stops running without anyone noticing.');
  process.exit(1);
}
ok('every excuse that names a runner was verified against that runner');

if (unwired.length) {
  console.error(`✗ FATAL: ${unwired.length} gate(s) exist but are never run:`);
  for (const g of unwired) console.error(`     ${g}`);
  console.error('');
  console.error('   A gate nobody invokes is indistinguishable from a gate that is always green.');
  console.error('   check-orphan-videos.mjs sat like this while 48 orphaned videos accumulated.');
  console.error('   Either add it to overnight-pipeline.sh, or add it to NOT_PREFLIGHT with a reason.');
  process.exit(1);
}
ok(`all ${wired} pre-flight gate(s) are referenced by overnight-pipeline.sh`);

// Wired is necessary but not sufficient: the reference must actually READ the exit code. `node x.mjs`
// on its own line inside a script without `set -e` runs the gate and ignores its verdict entirely.
const weak = [];
for (const line of pipeline.split('\n')) {
  const m = line.match(/node\s+scripts\/(check-[a-z0-9-]+\.mjs)/);
  if (!m) continue;
  if (NOT_PREFLIGHT[m[1]]) continue;
  const l = line.trim();
  if (l.startsWith('#')) continue;
  // A gate name inside an echo/printf is prose about the pipeline, not an invocation of it.
  if (/^(echo|printf)\b/.test(l)) continue;
  // Accept every real way this repo reads a verdict:
  //   `|| exit 1` · `if ! node …` · `&&` chains · `_rc=$(…)`
  //   `node … | tee -a "$LOGFILE"; _grc=${PIPESTATUS[0]}`  ← the DOMINANT pattern here, because a gate
  //   must be both logged and enforced. `$?` after a pipe is tee's status, so PIPESTATUS is the
  //   CORRECT idiom ([[feedback-empty-output-breaks-the-test-not-the-command]]).
  //
  // ⚠️ The first version of this check omitted PIPESTATUS and reported 35 correct invocations as
  // defects. A meta-gate that cries wolf gets muted, and then it guards nothing — so it must model
  // the codebase's real idioms, not an idealised subset.
  if (!/\|\||&&|^if\s|\bexit\b|=\$\(|\bthen\b|PIPESTATUS/.test(l)) weak.push(l.slice(0, 96));
}
if (weak.length) {
  console.error(`✗ FATAL: ${weak.length} gate invocation(s) ignore the exit code:`);
  weak.forEach((w) => console.error(`     ${w}`));
  console.error('   A gate whose verdict is discarded is a gate that cannot fail the run.');
  process.exit(1);
}
ok('every pre-flight gate invocation reads its exit code');

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴🔴 A GATE THAT CANNOT BE POINTED AT A COPY CANNOT BE MUTATION-TESTED.
//
// Found 2026-10-06, by accident: all three mutations of `check-refusal-is-not-done` came back GREEN.
// Its paths were hardcoded absolutes, so it read the real working tree and never saw the scratch
// copy the mutations were written into. The gate was not strict — it was BLIND, and had been since
// it was written. A census then found **86 of 180** gates in the same state.
//
// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT. Honouring APPROVAL_ARCHIVE_SITE_DIR costs nothing
// when it is unset — every one of the 86 produced an identical verdict after the swap — and it is
// the difference between a gate somebody has proven can fail and one nobody has ever tested.
// → feedback_a_gate_that_cannot_fail · feedback_the_harness_i_wrote_to_check_my_work_can_lie
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
const SITE_LITERAL = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const unredirectable = [];
for (const g of gates) {
  const src = fs.readFileSync(`${HERE}/${g}`, "utf8");
  // 🔴 Strip LINE comments before BLOCK comments — a `/*` that only ever existed inside a `//`
  // otherwise opens a scan that swallows the declaration this is looking for.
  // → feedback_a_comment_stripper_in_the_wrong_order_deletes_code
  const code = src.replace(/^[ \t]*\/\/.*$/gm, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
  if (!code.includes(SITE_LITERAL)) continue;          // does not read the site at all
  if (code.includes("APPROVAL_ARCHIVE_SITE_DIR")) continue;  // the hardcode is only a default
  unredirectable.push(g);
}
if (unredirectable.length) {
  console.error(`✗ ${unredirectable.length} gate(s) hardcode the site path with no APPROVAL_ARCHIVE_SITE_DIR override,`);
  console.error(`  so they can only ever read the real working tree and their mutations cannot be run:`);
  for (const g of unredirectable.slice(0, 20)) console.error(`    · ${g}`);
  if (unredirectable.length > 20) console.error(`    … and ${unredirectable.length - 20} more`);
  process.exit(1);
}
console.log(`  ✓ every gate that reads the site can be pointed at a copy, so its mutations can run`);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴🔴 A GATE NOBODY CAN MAKE FAIL IS A GATE NOBODY HAS CHECKED — AND UNTIL 2026-10-06 THE PROOF
// WAS THROWN AWAY. Every gate here is mutation-tested when it is written, but those runs lived in a
// scratch directory that vanished with the session. The NUMBER survived in a commit message
// ("9/9 mutations"); the ability to re-check it did not. So a gate that silently went blind months
// later looked exactly like one that still worked — and two did, in one day.
//
// The suites are in `scripts/mutations/` now and `node scripts/run-mutations.mjs` re-runs them.
//
// 🔑 A RATCHET, NOT A WALL. Most gates predate this and have no suite; failing on all of them would
// be permanently red, which teaches the reader to ignore every red — the one outcome worse than no
// check at all. So the backlog may only SHRINK, and a NEW gate must bring its suite.
// → feedback_a_gate_that_cannot_fail · feedback_a_flaky_gate_is_worse_than_a_failing_one
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
{
  const suiteDir = `${HERE}/mutations`;
  let suites = [];
  try { suites = fs.readdirSync(suiteDir).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)); }
  catch { /* no suites yet */ }
  for (const sfile of suites) {
    if (!gates.includes(`${sfile}.mjs`)) fail(`scripts/mutations/${sfile}.json has no gate`);
  }
  // 🔑 A GATE THAT READS LIVE SYSTEM STATE CANNOT BE MUTATION-TESTED BY THIS RUNNER — it mutates a
  // COPY of the site tree, and gates run from their real path, so there is no file to change. The
  // ratchet's purpose is "a new gate must prove it can fail", and such a gate can still prove it: by
  // running its own parsers against output whose answer is known and exiting 2 when they are wrong.
  //
  // 🔴 THE EXEMPTION IS VERIFIED, NOT TAKEN ON TRUST. A gate may only sit here if it actually
  // contains that self-test — otherwise this list becomes the place gates go to avoid being proven,
  // which is exactly what NOT_PREFLIGHT would have become without the same check.
  // → feedback_a_gate_i_never_wired_is_a_gate_that_is_always_green
  const SELF_PROVING = {
    "check-a-backup-restores.mjs":
      "reads the real backup drive, so its own suite cannot run it; check-a-backup-restore-check-can-fail.mjs runs it against fake backups and carries the 9 mutations on this file.",
    "check-every-identity-points-at-rga.mjs":
      "reads live credential state (git, ssh, gh, netlify, gcloud); no file for a mutation to change. "
      + "Proves itself by parsing known output and exiting 2 when its own reading is wrong.",
    "check-supabase-security-advisor.mjs":
      "reads the LIVE Supabase advisor, so no file copy can be mutated; proven 11-10 red on the real findings (kickoff_slot_holds RLS off, client_change_effect security definer) before the fix SQL ran. No token or API = INDETERMINATE (exit 2).",
    "check-scheduled-jobs-find-claude.mjs":
      "reads the live launchd plists and resolves claude with each one's own PATH, so no file copy can be mutated; proven 11-10 by removing the find-claude.sh line from weekly-audit.sh (exit 1) and restoring it (exit 0). No plist or no install = INDETERMINATE (exit 2).",
    "check-email-engagement-is-counted.mjs":
      "runs its own checker on the website at the build's before state (--against, 380620b1 by default) and MUST fail there in 3+ ways, else it exits 2 INDETERMINATE; proven on 11-10 against 380620b1.",
    "check-every-outreach-link-resolves.mjs":
      "fetches the LIVE site, so no file copy can be mutated; it proves itself every run on a made-up path that must 404 (else INDETERMINATE, exit 2), and it was proven red on 11-10 against the real /growth-audit/ 404 before the redirect shipped, and on 11-11 against the three live thank-you 404s (script.js pushState) before those pages shipped.",
    "check-admin-dashboard-opens-on-itself.mjs":
      "runs its own source checker on the website at the build's before state (--against, 380620b1 by default) and MUST fail there in 5+ ways, else it exits 2 INDETERMINATE; the 11-9 build proved it fails on 380620b1 in every placement rule.",
    "check-account-health.mjs":
      "runs its structural rules on LIVE_BEFORE (excerpts of the real pre-change code: the Mature checklist, admin-mature, the live Google read, the Advance target, 'Tell the client', the setup-era stage-6 cards), which it MUST fail, on an AFTER fixture, which it MUST pass, and on the real files; --against=<revision> reads the website at that git revision and MUST fail on main's HEAD from before the 11-10 build (ddfe1a8f); exits 2 INDETERMINATE when it cannot read; it also carries a 16-mutation suite for its runtime rules.",
    "check-client-monthly.mjs":
      "runs its own source checker on LIVE_BEFORE (today's strings, which it MUST fail), on an AFTER fixture and on the real files, and --against=<revision> runs it on the build's before state; it exits 1 when the checker cannot tell before from after (the 11-9 build proved it fails on 380620b1 in 31 ways).",
    "check-serpapi-budget.mjs":
      "runs every one of its 18 checks twice with FAKES ONLY (axios replaced, account.json a fixture): on this repo (all must pass) and on the pre-change commit (--against, f8f26ed1 by default), where at least 10 MUST fail, else it exits 2 INDETERMINATE; proven on 11-10 (16 of 17 fail on f8f26ed1; the 17th is the existing SERPAPI-HOLD guard that must keep holding).",
    "check-setup-vs-month1.mjs":
      "runs its source and fixture checks plus the real portal drawn in chromium on the website at the build's before state (LIVE_BEFORE, default 7f615889), where 8+ must fail or it exits 2 INDETERMINATE; --against=<revision> runs it on any revision (it exits 1 there when the old pieces are present: the Locked card on every onboarding task, a videos step Done from RGA's channel, review asks required, the close-out call in Setup); exits 2 with no browser.",
    "check-call-to-client.mjs":
      "runs its source rules and fixtures (reminders, the cap, the one-press start, the FAQ) on the website and then on the build's before state (LIVE_BEFORE, default 6c340245), where 10+ must fail or it exits 2 INDETERMINATE; --against=<revision> runs it on any revision.",
    "check-master-schedule.mjs":
      "runs its source rules, zone fixtures and a fake-database double booking (call card and client pick on one slot) on the website and then on the build's before state (LIVE_BEFORE, default 6c340245), where 8+ must fail or it exits 2 INDETERMINATE; --against=<revision> runs it on any revision.",
    "check-business-phone-never-a-contact-cell.mjs":
      "scans every netlify function for a fallback from identity_phone to a contact's phone and checks the five messages, on the website and then on the build's before state (LIVE_BEFORE, default df9de9b5), where 6+ must fail (24 on 11-11) or it exits 2 INDETERMINATE; --against=<revision> runs it on any revision.",
    "check-call-names.mjs":
      "scans every client- and admin-visible code line for close-out and a bare Call 1 / Call 2 and checks the six names, on the website and then on the build's before state (LIVE_BEFORE, default 6c340245), where 6+ must fail or it exits 2 INDETERMINATE; --against=<revision> runs it on any revision.",
    "check-portal-has-no-em-dash.mjs":
      "scans the website source with its own tokenizer (strings, template text, ${} expressions, comments, regex literals) and proves itself on 18 fixtures it must get right, then MUST find 100+ em dashes in the website at the build's before state (--against, 87c6fdbe by default; 153 there on 11-10), else it exits 2 INDETERMINATE; a copy of portal.js with one em dash put back is the mutation and it exits 1.",
    "check-client-monthly-in-a-browser.mjs":
      "reads the live portal as the walk client in chromium with this repo's portal files, so no file copy can be mutated; the 11-9 build proved it fails on the old portal.js (CM_DIR + SITE_DIR on the pre-build checkout: 30+ failures), and a page that does not load exits 2, never green.",
  };
  for (const [g, why] of Object.entries(SELF_PROVING)) {
    if (!gates.includes(g)) { fail(`SELF_PROVING names ${g}, which does not exist`); continue; }
    const src = fs.readFileSync(`${HERE}/${g}`, "utf8");
    if (!/INDETERMINATE/.test(src) || !/process\.exit\(2\)/.test(src)) {
      fail(`${g} claims a self-test but has no INDETERMINATE path that exits 2 — it is not proving anything`);
    }
    if (!why || why.length < 40) fail(`${g} is exempt from the mutation ratchet with no real reason recorded`);
  }

  const without = gates.filter((g) => !suites.includes(g.slice(0, -4)) && !(g in SELF_PROVING));
  let baseline;
  try { baseline = JSON.parse(fs.readFileSync(`${HERE}/_mutation-baseline.json`, "utf8")).count; }
  catch { baseline = null; }
  if (baseline == null) {
    console.error("✗ _mutation-baseline.json is missing — the mutation backlog has no ratchet");
    process.exit(1);
  }
  if (without.length > baseline) {
    console.error(`✗ ${without.length - baseline} gate(s) were added without a mutation suite proving they can fail.`);
    console.error(`  The backlog may only shrink (baseline ${baseline}). Add scripts/mutations/<gate>.json and`);
    console.error(`  run: node scripts/run-mutations.mjs <gate>`);
    const recent = without.slice(-8);
    for (const g of recent) console.error(`    · ${g}`);
    process.exit(1);
  }
  if (without.length < baseline) {
    console.log(`  ✓ ${suites.length} gate(s) carry a mutation suite — backlog ${without.length}, below the recorded ${baseline}; lower the baseline`);
  } else {
    console.log(`  ✓ ${suites.length} gate(s) carry a mutation suite that proves they can fail (backlog ${without.length}, not growing)`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE CATALOGUE IN MEMORY NAMES EVERY GATE, OR IT IS WORSE THAN NONE.
// A future session asking "is this already covered?" reads `reference_gate_catalogue.md`. If a gate
// is missing from it, the honest answer it gets is "no" — and it builds a duplicate, which is
// exactly how `check-no-dormant-endpoints` came to exist on top of `check-orphan-functions`.
// A stale index is a confident wrong answer. Regenerate: node scripts/build-gate-catalogue.mjs
// → feedback_preflight_before_you_build · feedback_a_lift_list_is_a_promise_somebody_will_remember
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
{
  const MEM = process.env.RGA_MEMORY_DIR
    || "/Users/chris/.claude/projects/-Users-chris-RGA-Rocket-Growth-Agency-Website-VS-Code/memory";
  let cat = null;
  try { cat = fs.readFileSync(`${MEM}/reference_gate_catalogue.md`, "utf8"); } catch { /* absent */ }
  if (cat == null) {
    console.error("✗ reference_gate_catalogue.md is missing from ops memory.");
    console.error("  Run: node scripts/build-gate-catalogue.mjs");
    process.exit(1);
  }
  const listed = new Set([...cat.matchAll(/^\| `(check-[a-z0-9-]+)`/gm)].map((m) => m[1]));
  const missing = gates.map((g) => g.slice(0, -4)).filter((n) => !listed.has(n));
  const extra = [...listed].filter((n) => !gates.includes(`${n}.mjs`));
  if (missing.length || extra.length) {
    console.error(`✗ the gate catalogue in ops memory is out of date.`);
    if (missing.length) console.error(`  ${missing.length} gate(s) missing from it: ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? " …" : ""}`);
    if (extra.length) console.error(`  ${extra.length} listed that no longer exist: ${extra.slice(0, 6).join(", ")}${extra.length > 6 ? " …" : ""}`);
    console.error(`  Run: node scripts/build-gate-catalogue.mjs`);
    process.exit(1);
  }
  console.log(`  ✓ ops memory's gate catalogue names all ${listed.size} gates`);
}

console.log(`✅ ${gates.length} gates: ${wired} wired, ${Object.keys(NOT_PREFLIGHT).length} excused with a reason, 0 dormant.`);
