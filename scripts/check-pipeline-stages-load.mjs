#!/usr/bin/env node
/**
 * check-pipeline-stages-load.mjs — PRE-FLIGHT: every pipeline stage must PARSE and its top-level module
 * body must EXECUTE without throwing, before the night run starts.
 *
 * WHY THIS EXISTS (2026-08-14): `step-2-email-scraper.mjs` declared `const files` and then reassigned it
 * inside the search-scoping block added by 623ab59. That is a `TypeError: Assignment to constant variable.`
 * thrown on the FIRST call of the stage — not a syntax error, so `node --check` passes it happily. It killed
 * the 2026-08-12 AND 2026-08-13 nights outright: crash at 21:05, zero leads, zero videos, no report, twice,
 * and nobody noticed until Chris asked. Two nights for a one-word bug.
 *
 * `node --check` is NOT enough — it only parses. This actually IMPORTS each stage, which runs its top-level
 * body (imports, const/let init, helper definitions) and surfaces exactly this class of error. Stages are
 * imported with a guard env var so they don't start real work.
 *
 * Exit 0 = every stage loads. Exit 2 = a stage throws → the night run must ABORT rather than burn the window.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Every stage the overnight pipeline invokes, in order.
// Kept in sync with `grep -oE "node [a-z0-9._-]+\.mjs" scripts/overnight-pipeline.sh`.
const STAGES = [
  'step-2-email-scraper.mjs',
  'step-2.5-audit.mjs',
  'step-3-video-recorder.mjs',
  'step-4-combine-desktop-mobile.mjs',
  'step-5-branding.mjs',
  'step-6-voiceover.mjs',
  'step-6b-subtitles.mjs',
  'step-7-merge-branded-audio.mjs',
  'step-8-publish-to-airtable.mjs',
  'build-video-landing.mjs',
];

let failed = 0, checked = 0, missing = 0;
for (const s of STAGES) {
  const p = path.join(ROOT, s);
  if (!fs.existsSync(p)) { console.log(`  ⚠ ${s} — not found (skipped)`); missing++; continue; }
  checked++;

  // 1) parse
  const parse = spawnSync('node', ['--check', p], { encoding: 'utf8' });
  if (parse.status !== 0) {
    console.error(`  ❌ ${s} — SYNTAX ERROR\n${(parse.stderr || '').split('\n').slice(0, 4).map(l => '     ' + l).join('\n')}`);
    failed++; continue;
  }

  // 2) execute the module body. STAGE_LOAD_CHECK=1 tells a stage to bail before doing real work; stages that
  //    don't honour it are killed by the timeout, which still proves the top-level body ran clean.
  const run = spawnSync('node', ['-e', `import(${JSON.stringify('file://' + p)}).then(()=>process.exit(0)).catch(e=>{console.error(String(e&&e.stack||e));process.exit(3)})`], {
    encoding: 'utf8', timeout: 12000,
    // ⚠️ SEARCH_QUERY MUST be set. The bug that killed 08-12 + 08-13 lives inside `if (_searchSlug) {…}`,
    // which only runs when the caller exported SEARCH_QUERY — exactly as overnight-pipeline.sh does. Without
    // it this check loaded step-2 happily WITH the bug still present and reported a green tick. A pre-flight
    // that passes a known-broken build is worse than no pre-flight: verified by re-introducing the const and
    // confirming this check now FAILS. Keep these env vars representative of a real run.
    env: {
      ...process.env,
      STAGE_LOAD_CHECK: '1', DRY_RUN: '1', MAX_VIDEOS: '0', MAX_BRANDS: '0', MAX_RECORDINGS: '0',
      SEARCH_QUERY: process.env.SEARCH_QUERY || 'Insurance agents in Culver City, CA',
    },
  });
  const err = String(run.stderr || '');
  // A stage that starts real work and gets killed by the timeout is FINE — its module body loaded.
  const hardError = run.status === 3 || /TypeError|ReferenceError|SyntaxError|is not a function|Cannot read propert/.test(err);
  if (hardError) {
    const first = err.split('\n').filter(Boolean).slice(0, 3).map(l => '     ' + l).join('\n');
    console.error(`  ❌ ${s} — THROWS ON LOAD\n${first}`);
    failed++;
  } else {
    console.log(`  ✅ ${s}`);
  }
}

console.log(`\n[stages-load] ${checked - failed}/${checked} stages load clean${missing ? ` (${missing} not found)` : ''}`);
if (failed) {
  console.error(`[stages-load] ❌ ${failed} stage(s) would crash the run. ABORT — do not burn the capture window.`);
  process.exit(2);
}
process.exit(0);
