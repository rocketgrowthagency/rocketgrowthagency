#!/usr/bin/env node
/**
 * check-drift-surfaces.mjs — operational drift must reach the MORNING REPORT, not just a log.
 *
 * ─── WHY (2026-08-24) ────────────────────────────────────────────────────────────────────────────
 * A CLEAR-BACKLOG flag written for a one-off drain sat for four days. It drove 8–13 searches a night
 * instead of 1, exhausted every already-worked Culver City pair, dropped the build rate to 26% and
 * tripped the circuit breaker.
 *
 * The system NOTICED the whole time — `alert_skip()` appended to a log file and fired a macOS
 * notification. Chris saw neither. A notification vanishes; a log nobody opens is not an alert. The
 * morning report, the one thing he reads daily, was silent.
 *
 * > **An alert that lands somewhere nobody looks is not an alert.**
 *
 * INVARIANTS
 *  1. overnight-summary.mjs calls check-operational-drift.mjs.
 *  2. Its output is spread into the summary body (every night, not just the newest).
 *  3. The detector never exits non-zero — advisory extras must not break the locked report format.
 *  4. It actually detects a stale flag (behavioural, on a real fixture).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER = path.dirname(HERE);
const SUMMARY = path.join(HERE, 'overnight-summary.mjs');
const DRIFT = path.join(HERE, 'check-operational-drift.mjs');

const fail = (m) => { console.error(`✗ FATAL: ${m}`); process.exit(1); };
const ok = (m) => console.log(`  ✓ ${m}`);

if (!fs.existsSync(DRIFT)) fail('check-operational-drift.mjs is missing.');
const raw = fs.readFileSync(SUMMARY, 'utf8');
const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

if (!/check-operational-drift\.mjs/.test(src)) {
  fail('the morning summary never calls check-operational-drift.mjs. Drift would alert only to a log\n' +
       '         file and a macOS notification — neither of which Chris sees.');
}
if (!/\.\.\.drift/.test(src)) fail('driftLines() output is not spread into the summary body.');
ok('morning summary calls the drift detector and includes its output');

// 3. Must never exit non-zero.
try {
  execFileSync('node', [DRIFT, '--json'], { encoding: 'utf8', timeout: 60000 });
  ok('drift detector exits 0 (cannot break the locked report format)');
} catch (e) {
  fail(`drift detector exited non-zero (status ${e.status}) — an advisory extra must never block the report.`);
}

// 4. Behavioural — it must actually catch a stale flag.
const flag = path.join(SCRAPER, 'output', '.drift-selftest-CLEAR-BACKLOG');
try {
  // Use the real detector against a real stale file by temporarily creating the flag it watches.
  const realFlag = path.join(SCRAPER, 'output', 'CLEAR-BACKLOG');
  const had = fs.existsSync(realFlag);
  if (had) { ok('behavioural check skipped — a real CLEAR-BACKLOG flag is currently set'); }
  else {
    fs.writeFileSync(realFlag, '14\n');
    const old = Date.now() / 1000 - 5 * 86400;
    fs.utimesSync(realFlag, old, old);
    const out = execFileSync('node', [DRIFT, '--json'], { encoding: 'utf8', timeout: 60000 });
    fs.unlinkSync(realFlag);
    const d = JSON.parse(out);
    if (!(d.findings || []).some((f) => f.kind === 'stale-flag')) {
      fail('a 5-day-old CLEAR-BACKLOG flag was NOT detected — the exact drift that caused the 2026-08-23\n' +
           '         circuit-breaker trip would go unreported again.');
    }
    ok('behavioural: a stale CLEAR-BACKLOG flag is detected');
  }
} finally {
  try { fs.unlinkSync(flag); } catch { /* fixture cleanup */ }
}

console.log('✅ operational drift reaches the morning report.');
