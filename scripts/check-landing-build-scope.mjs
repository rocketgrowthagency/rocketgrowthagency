#!/usr/bin/env node
/**
 * check-landing-build-scope.mjs — REGRESSION GUARD (locked 2026-07-11).
 *
 * Root-caused this day: the per-lead pipeline called build-video-landing.mjs with an EMPTY
 * BUILD_ONLY_SLUG when a lead's step-7 made no MP4. Empty slug → build-video-landing rebuilt the
 * ENTIRE ~500-page corpus (+~450 Airtable writes, ~8min), which tripped the 8-min per-lead watchdog
 * and SIGKILLed otherwise-good leads — silently losing videos for emails we'd already paid to find.
 *
 * This guard fails the pre-flight (aborts the run) if either safety net is missing:
 *   1. build-video-landing.mjs must honor REQUIRE_SLUG=1 by returning early when BUILD_ONLY_SLUG is empty.
 *   2. EVERY `node build-video-landing.mjs` invocation in overnight-pipeline.sh must set REQUIRE_SLUG=1
 *      on the same line (so a per-lead call can never fall through to a full-corpus rebuild).
 *
 * Exit 0 = safe, exit 1 = regression. Wired into overnight-pipeline.sh pre-flight.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const fail = (m) => { console.error('  ✗ ' + m); failed++; };
const ok = (m) => console.log('  ✓ ' + m);

// ---- Check 1: build-video-landing.mjs has the REQUIRE_SLUG early-return guard ----
const bvl = fs.readFileSync(path.join(ROOT, 'build-video-landing.mjs'), 'utf8');
if (/REQUIRE_SLUG\s*=\s*process\.env\.REQUIRE_SLUG\s*===\s*["']1["']/.test(bvl)
    && /if\s*\(\s*REQUIRE_SLUG\s*&&\s*!ONLY_SLUG\s*\)/.test(bvl)
    && /return;/.test(bvl.slice(bvl.indexOf('REQUIRE_SLUG && !ONLY_SLUG')))) {
  ok('build-video-landing.mjs: REQUIRE_SLUG=1 + empty slug returns early (no full-corpus rebuild)');
} else {
  fail('build-video-landing.mjs is MISSING the REQUIRE_SLUG early-return guard — an empty slug could rebuild all ~500 pages and trip the watchdog.');
}

// ---- Check 2: every build-video-landing invocation in overnight-pipeline.sh sets REQUIRE_SLUG=1 ----
const pipe = fs.readFileSync(path.join(ROOT, 'scripts', 'overnight-pipeline.sh'), 'utf8');
const lines = pipe.split('\n');
let calls = 0, bad = 0;
lines.forEach((ln, i) => {
  const code = ln.replace(/#.*$/, '');                    // ignore comments
  if (/\bnode\s+build-video-landing\.mjs/.test(code)) {
    calls++;
    if (!/REQUIRE_SLUG=1/.test(code)) { bad++; fail(`overnight-pipeline.sh:${i + 1} calls build-video-landing.mjs WITHOUT REQUIRE_SLUG=1 → can trigger a full-corpus rebuild.`); }
  }
});
if (calls > 0 && bad === 0) ok(`overnight-pipeline.sh: all ${calls} build-video-landing calls set REQUIRE_SLUG=1`);
if (calls === 0) fail('overnight-pipeline.sh: found NO build-video-landing invocation — did the file move? Guard can’t verify scoping.');

if (failed) { console.error(`\nFAIL: ${failed} landing-build-scope check(s) failed — do NOT run the pipeline until fixed.`); process.exit(1); }
console.log('\nPASS: landing build is strictly per-lead scoped; no full-corpus rebuild can run inside the per-lead loop.');
