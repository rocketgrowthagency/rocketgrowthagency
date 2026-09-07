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
  'check-detail-card-opaque.mjs': 'per-video tool — takes <video.mp4>; runs inside the visual gate',
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
  'check-every-gate-is-wired.mjs': 'this meta-gate itself',
  'check-playbook-integrity.mjs': 'the sales playbook is website code, not tonight\'s videos — a bad block must never abort a video build. Runs in drip-content.sh (the deploy that ships admin/) and daily-health-check.sh',
  'check-onboarding-errors-surfaced.mjs': 'live Supabase client state, not code health; needs network. Runs in daily-health-check.sh — a delivery failure must never block a video build',
  'check-orphaned-airtable-fields.mjs': 'live Airtable schema+population, not code health; needs network and reads every row. Runs in daily-health-check.sh — must never block a video build',
  'check-playbook-renders.mjs': 'needs a headless BROWSER (playwright) — far too slow and too environment-dependent to gate a nightly video build. Runs in preflight-site-deploy.sh and daily-health-check.sh',
  'check-client-dedupe-gate.mjs': 'live Supabase schema + indexes, not code health; needs network. Runs in daily-health-check.sh — a duplicate-client risk must never abort a video build',
  'check-almanac-accruing.mjs': 'aggregates the vertical-benchmark corpus on disk; slow and unrelated to tonight\'s videos. Runs in daily-health-check.sh, straight after the rebuild it verifies',
  'check-rank-tracking-sane.mjs': 'live Supabase rank snapshots, not code health; needs network. Runs in daily-health-check.sh — a badly tracked keyword must never abort a video build',
  'check-orphan-functions.mjs': 'scans the WEBSITE repo\'s netlify/functions and cross-references two repos — unrelated to tonight\'s videos, and an unwired function must never abort a video build. Runs in daily-health-check.sh',
  'check-portal-data-boundary.mjs': 'static scan of the WEBSITE repo\'s portal/ — a commercial/architectural boundary, not video health, and it must never abort a video build. Runs in daily-health-check.sh',
  'check-sop-sources-agree.mjs': 'compares the delivery SOP across two repos and imports the playbook module — unrelated to tonight\'s videos, and SOP drift must never abort a video build. Runs in daily-health-check.sh',
  'check-price-consistency.mjs': 'reads pricing out of the WEBSITE repo (contract generator, admin email draft, rep playbook) — a commercial correctness check, not video health. Runs in daily-health-check.sh',
  'check-no-or-echo-append.mjs': 'static lint of our own shell scripts — a code-hygiene guard, not a video gate, and it must never abort a build. Runs in daily-health-check.sh',
  'check-google-api-cost-safety.mjs': 'reads the WEBSITE repo\'s netlify/functions to enforce the billing boundary — a commercial safety check. It must NOT gate the nightly build (a billing question should never abort a video run). Runs in daily-health-check.sh',
  'check-send-queue-drained.mjs': 'manual restart probe for the 2026-08-25 production pause; not a nightly gate',
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
