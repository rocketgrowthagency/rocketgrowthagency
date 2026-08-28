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
  'check-every-gate-is-wired.mjs': 'this meta-gate itself',
  'check-send-queue-drained.mjs': 'manual restart probe for the 2026-08-25 production pause; not a nightly gate',
  'check-send-cap-held.mjs': 'reports a REAL cap breach from live data; surfaced via operational drift, must not block a build',
  'check-no-duplicate-send-rows.mjs': 'live Airtable state, not code health; surfaced via operational drift (3d). Watches the failure mode the 2026-08-27 inline-logging fix introduces — a double-write inflates countSentToday and SUPPRESSES sends, which looks like a quiet day, not an error',
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
