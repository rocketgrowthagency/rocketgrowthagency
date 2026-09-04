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
//
// 🔴 2026-09-02 — THIS REPORTED A FALSE FAILURE FOR AN UNKNOWN NUMBER OF DAYS.
// The timeout was 60s. The detector now makes enough live Airtable/network calls to take ~77s, so it
// was being killed by SIGTERM — and the catch block reported that as "exited non-zero (status null)".
// The detector was healthy the whole time; the gate was accusing it of the wrong crime.
//
// `status` is null on a signal kill. Reporting a TIMEOUT as a non-zero exit sends you looking for a
// bug in the detector that does not exist ([[feedback-a-failure-reason-can-be-a-mask]]). Distinguish
// them, and say which one happened.
const DRIFT_TIMEOUT_MS = 180000;   // ~2.3x the measured 77s, so normal growth does not trip it
try {
  execFileSync('node', [DRIFT, '--json'], { encoding: 'utf8', timeout: DRIFT_TIMEOUT_MS });
  ok('drift detector exits 0 (cannot break the locked report format)');
} catch (e) {
  if (e.code === 'ETIMEDOUT' || e.signal) {
    fail(`drift detector did NOT exit non-zero — it was KILLED after ${DRIFT_TIMEOUT_MS / 1000}s ` +
         `(signal ${e.signal || 'n/a'}). It is too slow, not broken. Time it with\n` +
         '         `time node scripts/check-operational-drift.mjs --json` and either speed it up or\n' +
         '         raise DRIFT_TIMEOUT_MS here — do NOT go looking for a bug in the detector.');
  }
  fail(`drift detector exited ${e.status} — an advisory extra must never block the report.`);
}

// 4. Behavioural — it must actually catch a stale flag.
const flag = path.join(SCRAPER, 'output', '.drift-selftest-CLEAR-BACKLOG');
try {
  // Use the real detector against a real stale file by temporarily creating the flag it watches.
  const realFlag = path.join(SCRAPER, 'output', 'CLEAR-BACKLOG');

  // 🔴🔴 SELF-HEAL: recognise and remove OUR OWN orphaned fixture.
  //
  // `finally` unwinds on an exception but NOT on process termination. When this gate was killed
  // (SIGTERM from a harness timeout) the fixture survived as a LIVE flag, and the next run then
  // "skipped" the behavioural test because a flag was present — so one leak silently disabled this
  // check indefinitely. That is how four leaked flags accumulated unnoticed.
  //
  // The fixture is identifiable: contents exactly `14` AND an mtime ~5 days old, because we backdate
  // it ourselves. A REAL flag set by hand has a CURRENT mtime, so this cannot eat a deliberate one.
  if (fs.existsSync(realFlag)) {
    try {
      const body = fs.readFileSync(realFlag, 'utf8').trim();
      const ageDays = (Date.now() - fs.statSync(realFlag).mtimeMs) / 86400000;
      if (body === '14' && ageDays > 4.5 && ageDays < 5.5) {
        fs.unlinkSync(realFlag);
        ok('cleaned an orphaned self-test fixture (a previous run was killed before cleanup)');
      }
    } catch { /* unreadable — leave it alone and let the skip below handle it */ }
  }

  // Cleanup must survive a kill, not just a throw. SIGKILL cannot be caught — the self-heal above is
  // the backstop for that case.
  //
  // 🔴 `ours` is load-bearing. A first version armed this unconditionally and DELETED A FLAG CHRIS
  // HAD SET DELIBERATELY — the cleanup ran on exit even when we never wrote anything. A scrubber must
  // only ever remove what IT created. Caught by testing the safety case, not the happy path.
  let ours = false;
  const scrub = () => { if (ours) { try { fs.unlinkSync(realFlag); } catch { /* fine */ } } };
  process.on('exit', scrub);
  process.on('SIGINT', () => { scrub(); process.exit(130); });
  process.on('SIGTERM', () => { scrub(); process.exit(143); });

  const had = fs.existsSync(realFlag);
  if (had) { ok('behavioural check skipped — a real CLEAR-BACKLOG flag is currently set'); }
  else {
    // 🔴🔴 2026-09-04 — THIS BLOCK PLANTED THE EXACT LANDMINE IT EXISTS TO DETECT.
    //
    // It writes a REAL `output/CLEAR-BACKLOG` (value 14, backdated 5 days), runs the detector, then
    // deletes it on the NEXT line. The inner timeout was still 60s against a detector that had grown
    // to ~78s, so execFileSync threw and the unlink never ran — leaking a LIVE flag on every run.
    //
    // THREE leaked flags were found on 2026-09-04 (Aug 28, Aug 30 x2), every one containing `14`.
    // A stale CLEAR-BACKLOG overrides the nightly search count; one did exactly that on 2026-08-23,
    // exhausted every worked pair and tripped the circuit breaker. They had been recorded as
    // hand-created during the production pause. They were not — this gate made them.
    //
    // Two fixes, both required:
    //   1. the inner timeout must track the outer one, so a detector that gets slower cannot orphan a file
    //   2. cleanup belongs in a `finally`, so a throw can NEVER leave the flag behind
    let out;
    try {
      fs.writeFileSync(realFlag, '14\n');
      ours = true;                       // only from here may the scrubber touch it
      const old = Date.now() / 1000 - 5 * 86400;
      fs.utimesSync(realFlag, old, old);
      out = execFileSync('node', [DRIFT, '--json'], { encoding: 'utf8', timeout: DRIFT_TIMEOUT_MS });
    } finally {
      try { fs.unlinkSync(realFlag); } catch { /* already gone — fine */ }
      ours = false;
    }
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
