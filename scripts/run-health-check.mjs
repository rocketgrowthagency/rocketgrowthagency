#!/usr/bin/env node
/**
 * run-health-check.mjs — CIRCUIT BREAKER. Stop a night that has systemically broken, before it burns
 * the whole queue's retry budget. (2026-08-19)
 *
 * THE FAILURE THIS PREVENTS
 * Every lead gets 3 attempts, then it is PARKED and never retried automatically
 * ([[project-nightly-self-heal-loop]] — parole can recover it, but only after someone notices). That cap
 * assumes failures are independent, per-lead flakes. When something SYSTEMIC breaks — a Chrome update, a
 * Google Maps layout change, an expired credential, a gate regression — it isn't: the run grinds through
 * every lead, fails all of them, burns 3 attempts each, and parks the lot. One bad night becomes
 * permanent damage across dozens of leads, and the pipeline reports it as an ordinary set of failures.
 *
 * Measured baseline for comparison: **89% of emailable leads build successfully**
 * ([[project-video-build-rate-baseline]]). Real nights sit well above the floor below even when poor —
 * 2026-08-18 was 19/31 (61%) and 7/13 (54%). A systemic break looks like near-zero, not "worse than
 * usual", which is why the floor is deliberately far below the baseline: it must never fire on a merely
 * bad night, only on a broken one.
 *
 * Reads the accumulators overnight-pipeline.sh already writes:
 *   output/run-accum/<YYYY-MM-DD>_<search-slug>/{deployed,failed}.txt
 *
 * Usage:  node scripts/run-health-check.mjs [YYYY-MM-DD]
 * Exit 0 = healthy (or too little data to judge) → keep going.
 * Exit 1 = TRIPPED → the caller must stop the run.
 * Env: HEALTH_FLOOR_PCT (default 40), HEALTH_MIN_SAMPLE (default 8).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ACCUM = path.join(ROOT, 'output', 'run-accum');
const FLOOR = Number(process.env.HEALTH_FLOOR_PCT || 40);
// Below this many attempts the rate is noise — 0/3 is a normal run of bad luck, not evidence of breakage.
const MIN_SAMPLE = Number(process.env.HEALTH_MIN_SAMPLE || 8);
const date = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) || new Date().toISOString().slice(0, 10);

const lines = (p) => { try { return fs.readFileSync(p, 'utf8').split('\n').filter((l) => l.trim()).length; } catch { return 0; } };

let dirs = [];
try { dirs = fs.readdirSync(ACCUM).filter((d) => d.startsWith(date + '_')); } catch { /* none yet */ }
if (!dirs.length) { console.log(`[health] no accumulators for ${date} yet — nothing to judge. ✓`); process.exit(0); }

let deployed = 0, failed = 0;
const per = [];
for (const d of dirs) {
  const dep = lines(path.join(ACCUM, d, 'deployed.txt'));
  const fal = lines(path.join(ACCUM, d, 'failed.txt'));
  deployed += dep; failed += fal;
  per.push({ search: d.slice(date.length + 1), dep, fal });
}
const attempted = deployed + failed;
const pct = attempted ? Math.round((deployed / attempted) * 100) : 0;

console.log(`[health] ${date} — ${deployed}/${attempted} built (${pct}%), baseline 89%, floor ${FLOOR}%`);
for (const p of per) console.log(`[health]   ${String(p.dep).padStart(3)}✓ ${String(p.fal).padStart(3)}✗  ${p.search}`);

if (attempted < MIN_SAMPLE) {
  console.log(`[health] only ${attempted} attempt(s) — too few to judge (need ${MIN_SAMPLE}). Continuing. ✓`);
  process.exit(0);
}
if (pct >= FLOOR) { console.log(`[health] above the floor — continuing. ✓`); process.exit(0); }

// TRIPPED. Say plainly what this is and is not, so the morning reader doesn't mistake it for lead flake.
const msg = [
  ``,
  `🔴 CIRCUIT BREAKER TRIPPED — ${pct}% build rate over ${attempted} attempts (floor ${FLOOR}%, baseline 89%).`,
  `   This is NOT normal per-lead flakiness. A rate this low means something SYSTEMIC broke:`,
  `   a Chrome/Maps change, an expired credential, or a gate regression.`,
  ``,
  `   STOPPING so the rest of the queue keeps its retry budget. Every lead gets only 3 attempts before`,
  `   it is parked — continuing would burn that budget on ${'a broken pipeline'} and park dozens of`,
  `   perfectly good leads.`,
  ``,
  `   Already-failed leads tonight are armed and will retry once the cause is fixed. After fixing,`,
  `   \`node scripts/parole-permafails.mjs --apply\` gives anything already parked another attempt`,
  `   (the capture-code epoch will have moved).`,
  ``,
].join('\n');
console.error(msg);
try {
  const alertDir = path.join(ROOT, '..', 'Rocket Growth Agency Website VS Code', 'reports', 'alerts');
  fs.mkdirSync(alertDir, { recursive: true });
  fs.writeFileSync(path.join(alertDir, 'PIPELINE-HEALTH-ALERT.md'),
    `# 🔴 Pipeline circuit breaker tripped — ${date}\n\n` +
    `Build rate **${pct}%** over ${attempted} attempts (floor ${FLOOR}%, baseline 89%).\n\n` +
    per.map((p) => `- ${p.dep} built / ${p.fal} failed — ${p.search}`).join('\n') +
    `\n\nThe run STOPPED to protect the rest of the queue's retry budget.\n` +
    `Diagnose the systemic cause, then run \`node scripts/parole-permafails.mjs --apply\`.\n\n` +
    `(Delete this file once resolved.)\n`);
} catch { /* alert file is best-effort */ }
process.exit(1);
