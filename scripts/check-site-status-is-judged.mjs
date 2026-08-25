#!/usr/bin/env node
/**
 * check-site-status-is-judged.mjs — "reachable" must mean auditable, not merely connectable.
 *
 * ─── WHY (2026-08-25) ────────────────────────────────────────────────────────────────────────────
 * check-site-reachable.mjs asked one question: can a client open a connection? A live server handing
 * back an error page answered yes, so it was called `reachable` and the lead went on to spend a full
 * step-2.5 audit, a step-3 capture and a step-6 voiceover before dying at `missing: website`.
 *
 * Measured on the solar-installers batch — 6 of the 9 failures that night:
 *
 *     gosolarwithaugust.com            402   payment required, site suspended
 *     www.bruinsolar.com               404
 *     bestlosangelessolarpanels.com    timeout
 *
 * A permanent status can never become a website audit, and filming it would show a prospect their own
 * broken page.
 *
 * > **Connectable is not the same as usable.** A check that stops at the connection cannot tell a
 * > working site from a suspended one.
 *
 * 🔒 THE TRANSIENT LIST IS DELIBERATE AND MUST SURVIVE. 403 / 429 / 5xx mean the server is fending off
 * a bot but still serves a real browser — the file's own long-standing rule. Parking those would drop
 * good prospects, which is the opposite failure and a more expensive one.
 *
 * INVARIANTS
 *  1. The status code is actually captured (`-w %{http_code}`), not just curl's exit status.
 *  2. 402 / 404 / 410 / 451 are UNBUILDABLE.
 *  3. 403 / 429 / 500 / 502 / 503 stay REACHABLE — a bot-block is not a dead site.
 *  4. 200 stays reachable.
 *  5. Connection-level failures (TLS, DNS, refused, double timeout) still park, as before.
 *
 * Exit 0 = healthy, 1 = regression.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TARGET = path.join(HERE, 'check-site-reachable.mjs');
const RUNNER = path.join(HERE, 'rebuild-broken-videos.sh');

const fail = (m) => { console.error(`✗ FATAL: ${m}`); process.exit(1); };
const ok = (m) => console.log(`  ✓ ${m}`);

if (!fs.existsSync(TARGET)) fail('check-site-reachable.mjs is missing.');
const raw = fs.readFileSync(TARGET, 'utf8');
const src = raw.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

// 1 — the status must be captured in CODE, not merely described in a comment.
if (!/'-w',\s*'%\{http_code\}'/.test(src)) {
  fail('curl does not capture %{http_code}. Without the status, a 404 is indistinguishable from a\n' +
       '         working site — which is exactly how three dead sites each burned a full build.');
}
ok('the HTTP status is captured, not just curl\'s exit code');

// 2 — permanent statuses park.
if (!/export const permanentReason/.test(src)) {
  fail('permanentReason() is gone — 402/404 would read as reachable again. It is EXPORTED on purpose so\n' +
       '         this gate can test the shipped classifier rather than a copy of the table.');
}
for (const code of [402, 404, 410, 451]) {
  if (!new RegExp(`\\b${code}\\b`).test(src)) fail(`HTTP ${code} is not treated as permanently unbuildable.`);
}
ok('402 / 404 / 410 / 451 are unbuildable');

// 3 — 🔒 the transient list must NOT have been widened.
for (const code of [403, 429, 500, 502, 503]) {
  if (new RegExp(`PERMANENT[\\s\\S]{0,220}\\b${code}\\b`).test(src)) {
    fail(`HTTP ${code} was added to the permanent list. A bot-block or a brief 5xx still serves a real\n` +
         '         browser — parking those drops good prospects, the more expensive mistake.');
  }
}
ok('403 / 429 / 5xx remain transient (bot-block ≠ dead site)');

// 5 — connection-level rules intact.
for (const [re, what] of [[/handshake failure/i, 'TLS'], [/Could not resolve host/i, 'DNS'],
                          [/Connection refused/i, 'refused'], [/one retry|tryOnce\(url\)/, 'timeout retry']]) {
  if (!re.test(src)) fail(`the ${what} rule is gone — connection-level failures must still park.`);
}
ok('TLS / DNS / refused / double-timeout still park');

// Wired where it saves the spend.
if (!fs.existsSync(RUNNER) || !/check-site-reachable\.mjs/.test(fs.readFileSync(RUNNER, 'utf8'))) {
  fail('rebuild-broken-videos.sh does not run the reachability pre-check.');
}
ok('the runner consults it before capturing');

// ── BEHAVIOURAL — the REAL classifier, imported. No network, no fixture server.
// httpstat.us returns an empty reply from this machine, and the sandbox blocks curl to localhost too,
// so BOTH fixture approaches reported someone else's rules as our regression. Importing the actual
// function tests the shipped logic instead of a copy of it.
const { permanentReason } = await import(pathToFileURL(TARGET).href);
const cases = [
  [200, false, 'a working site'],
  [404, true,  'a 404'],
  [402, true,  'a 402 (suspended)'],
  [410, true,  'a 410 (gone)'],
  [451, true,  'a 451'],
  [403, false, 'a 403 (bot-block — must NOT park)'],
  [429, false, 'a 429 (rate-limit — must NOT park)'],
  [503, false, 'a 503 (transient — must NOT park)'],
  [500, false, 'a 500 (transient — must NOT park)'],
];
for (const [code, shouldPark, label] of cases) {
  const got = !!permanentReason(code);
  if (got !== shouldPark) {
    fail(`behavioural: ${label} → ${got ? 'unbuildable' : 'reachable'}, expected ${shouldPark ? 'unbuildable' : 'reachable'}.`);
  }
  ok(`behavioural: ${label} → ${got ? 'unbuildable' : 'reachable'}`);
}

console.log('✅ a live server serving an error page is no longer mistaken for a working website.');
