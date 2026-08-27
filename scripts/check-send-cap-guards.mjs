#!/usr/bin/env node
/**
 * check-send-cap-guards.mjs — the two guards that keep the daily send cap honest must stay in the script.
 *
 * ─── WHY (2026-08-26) ────────────────────────────────────────────────────────────────────────────
 * The 50/day cap was breached every weekday for two weeks (55–56 sends). Two defects, both fail-OPEN
 * on the #1 standing constraint:
 *
 * 1. **A second run.** `runMorningOutreach` guards with `LockService.tryLock`, which blocks only
 *    CONCURRENT execution. The measured second run started 15–44 minutes AFTER the first finished, so
 *    the lock never engaged. Fixed with a once-per-day date stamp (`LAST_OUTREACH_RUN_DATE`).
 *
 * 2. **`countSentToday()` failing open.** It `break`-ed out of pagination on a non-200 (returning a
 *    PARTIAL count) and `return 0` in its catch. Either re-opens the budget: `cap - 45 = 5 more`, or
 *    `cap - 0 = a whole fresh cap`. Returning 0 is precisely what let 60 emails out on a 50 cap in
 *    2026-06-29. Now retries, then returns COUNT_UNKNOWN so the budget computes to ZERO.
 *
 * > **A control that fails open is not a control.** An unknown count must mean "stop", never "plenty
 * > left" — a missed send day is recoverable, a domain-reputation breach is not.
 *
 * ⚠️ THIS CHECKS THE REPO COPY ONLY. Apps Script is pasted into the live editor by hand and the local
 * `.gs` drifts behind live ([[feedback-apps-script-manual-paste]]). Passing here does NOT prove the
 * guards are running. `check-send-cap-held.mjs` measures the live outcome; this protects the source.
 *
 * Exit 0 = both guards present, 1 = a guard is missing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEBSITE = path.join(path.dirname(path.dirname(HERE)), 'Rocket Growth Agency Website VS Code');
const GS = path.join(WEBSITE, 'docs', 'apps-scripts', 'gmail-to-airtable.gs');

const fail = (m) => { console.error(`✗ FATAL: ${m}`); process.exit(1); };
const ok = (m) => console.log(`  ✓ ${m}`);

if (!fs.existsSync(GS)) fail(`gmail-to-airtable.gs not found at ${GS}`);
const raw = fs.readFileSync(GS, 'utf8');
// Strip comments so a check can never be satisfied by the prose explaining it. The `[^:]` guard keeps
// https:// intact — a naive //-stripper eats URLs and half the line after them.
const src = raw.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');

// ── 1. Once-per-day guard ───────────────────────────────────────────────────────────────────────
if (!/LAST_OUTREACH_RUN_DATE/.test(src)) {
  fail('the once-per-day guard is gone. tryLock only blocks CONCURRENT runs — a second run 15-44\n' +
       '         minutes later sent 5 more Day-1 emails every day, breaching the cap.');
}
if (!/setProperty\('LAST_OUTREACH_RUN_DATE'/.test(src)) fail('the run date is never STORED, so the guard can never trip.');
if (!/getProperty\('LAST_OUTREACH_RUN_DATE'\)\s*===\s*__today/.test(src)) fail('the stored date is never COMPARED to today.');
// Scope to the guard's own block. `releaseLock()` also appears in the normal finally, so a
// whole-file search passes even when the guard leaks the lock — the sabotage proved it.
{
  const gi = src.indexOf("getProperty('LAST_OUTREACH_RUN_DATE')");
  const guardBlock = gi === -1 ? '' : src.slice(gi, src.indexOf('return;', gi) + 8);
  if (!/__runLock\.releaseLock\(\)/.test(guardBlock)) {
    fail('the guard returns WITHOUT releasing the script lock. Every later run would then bail on\n' +
         '         tryLock, silently halting outreach entirely — a worse outage than the breach.');
  }
}
ok('once-per-day guard: stores, compares, and releases the lock');

if (!/OUTREACH_FORCE_RUN/.test(src)) fail('no manual override — a legitimate re-run would be impossible.');
if (!/deleteProperty\('OUTREACH_FORCE_RUN'\)/.test(src)) {
  fail('OUTREACH_FORCE_RUN is never cleared. A sticky override disables the guard permanently, which\n' +
       '         is worse than not having one — it looks protected and is not.');
}
ok('the manual override is one-shot, never sticky');

// ── 2. countSentToday must fail CLOSED ──────────────────────────────────────────────────────────
const i = src.indexOf('function countSentToday');
if (i === -1) fail('countSentToday() is gone.');
const body = src.slice(i, src.indexOf('\n}', src.indexOf('catch', i)) + 2);

if (/return 0;/.test(body)) {
  fail('countSentToday can still return 0 on failure. Then budget = cap - 0 = a FULL fresh cap. That\n' +
       '         is exactly the 2026-06-29 breach (60 sent on a 50 cap).');
}
if (!/COUNT_UNKNOWN/.test(body)) fail('countSentToday does not return the COUNT_UNKNOWN sentinel on failure.');
if (/getResponseCode\(\) !== 200\)\s*break;/.test(body)) {
  fail('pagination still `break`s on a non-200, returning a PARTIAL count — which re-opens the budget\n' +
       '         by exactly the number of rows it failed to read.');
}
if (!/attempt < 3/.test(body)) fail('no retry before failing closed — a single blip would halt the whole send day.');
ok('countSentToday retries, then fails CLOSED (never 0, never partial)');

// ── 3. The sentinel must actually produce a zero budget ─────────────────────────────────────────
if (!/const COUNT_UNKNOWN = Number\.MAX_SAFE_INTEGER/.test(src)) {
  fail('COUNT_UNKNOWN is not MAX_SAFE_INTEGER, so `Math.max(0, cap - already)` may not clamp to 0.');
}
if (!/Math\.max\(0, cap - already\)/.test(src)) fail('the budget no longer clamps at 0.');
const cap = 50;
if (Math.max(0, cap - Number.MAX_SAFE_INTEGER) !== 0) fail('arithmetic check failed — sentinel does not zero the budget.');
ok('behavioural: COUNT_UNKNOWN drives the budget to 0 on both the shared and standalone paths');

// ── 4. The live-outcome detector must still exist ───────────────────────────────────────────────
if (!fs.existsSync(path.join(HERE, 'check-send-cap-held.mjs'))) {
  fail('check-send-cap-held.mjs is missing. The repo guards protect the SOURCE; only that script\n' +
       '         measures whether the cap actually held in production.');
}
ok('the live-outcome detector is present');

console.log('✅ both cap guards are in the source. ⚠️ Paste into the live Apps Script — this cannot verify that.');
