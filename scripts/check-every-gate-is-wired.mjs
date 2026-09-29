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
  'check-acceptance-is-what-completes-the-kickoff.mjs': 'kickoff-lifecycle gate; runs in daily-health-check.sh — step completion cannot make a video unsafe',
  'check-a-jump-moves-the-page.mjs': 'admin-UI gate; runs in daily-health-check.sh — a dead jump button cannot make a video unsafe',
  'check-the-kickoff-call-fits-its-slot.mjs': 'admin-UI gate; runs in daily-health-check.sh — the call console cannot make a video unsafe',
  'check-the-recap-sends-what-you-saw.mjs': 'admin-UI gate; runs in daily-health-check.sh — the recap composer cannot make a video unsafe',
  'check-the-join-link-is-the-invites-link.mjs': 'admin+portal gate; runs in daily-health-check.sh — a meeting link cannot make a video unsafe',
  'check-a-past-call-never-claims-it-happened.mjs': 'portal-UI gate; runs in daily-health-check.sh — a past-call card cannot make a video unsafe',
  'check-a-settled-booking-corrects-every-sentence.mjs': 'portal-UI gate; runs in daily-health-check.sh — a settled step card cannot make a video unsafe',
  'check-a-sentence-never-points-where-it-cannot-see.mjs': 'portal-copy gate; runs in daily-health-check.sh — a direction word cannot make a video unsafe',
  'check-a-client-action-reaches-the-admin.mjs': 'admin-UI gate; runs in daily-health-check.sh — a next-action card cannot make a video unsafe',
  'check-booked-and-accepted-are-different-words.mjs': 'admin/portal copy gate; runs in daily-health-check.sh — a contradicting status line cannot make a video unsafe',
  'check-a-reschedule-never-looks-like-a-first-booking.mjs': 'admin-UI gate; runs in daily-health-check.sh — kickoff card copy cannot make a video unsafe',
  'check-an-abandoned-oauth-grant-is-never-silent.mjs': 'admin+portal gate; runs in daily-health-check.sh — a silent OAuth abandonment cannot make a video unsafe',
  'check-live-matches-the-approved-mockup.mjs': 'client-portal UI gate; runs in daily-health-check.sh — approved wording cannot make a video unsafe',
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
  'check-inbound-sms-flowing.mjs': 'third-party webhook subscription state, not code health; surfaced via operational drift (3f2). Must never block a build — an unregistered SMS event has nothing to do with tonight\'s videos',
  'check-apps-script-paste-owed.mjs': 'deployment state of a DIFFERENT repo (the website .gs files vs the live Apps Script projects); surfaced via operational drift (3f). Must not block a scraper build — an unpasted auto-reply script has nothing to do with tonight\'s videos',
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

console.log(`✅ ${gates.length} gates: ${wired} wired, ${Object.keys(NOT_PREFLIGHT).length} excused with a reason, 0 dormant.`);
