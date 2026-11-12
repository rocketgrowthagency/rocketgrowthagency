#!/usr/bin/env node
/**
 * serpapi-budget.mjs - the SerpAPI budget CLI the shell scripts call (2026-11-10).
 *
 *   preflight            read account.json (FREE), save the snapshot the wrapper enforces, judge the month.
 *                          exit 0  go. A projected overrun / 80% used RAISES AN ALERT but NEVER stops the night.
 *                          exit 3  fewer searches than the client RESERVE (250) remain: stop, alert, mark "not searched".
 *   gate --need N        may a rebuild batch costing about N searches start? exit 0 yes / 3 no (would go under the reserve).
 *   note --consumer X    record a non-search event (e.g. an audit re-read) in the ledger.
 *   report               this month's calls by consumer from the ledger (no network).
 *
 * Exit 0 is also what an UNREADABLE account returns: not knowing is not a reason to stop a night. Env: SERPAPI_RESERVE.
 * Memory: project_serpapi_budget.md
 */
import 'dotenv/config';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const B = require('../lib/serpapi-budget.cjs');

const [cmd = 'preflight', ...rest] = process.argv.slice(2);
const arg = (n, d) => { const i = rest.indexOf(`--${n}`); return i >= 0 ? rest[i + 1] : d; };
const KEY = process.env.SERPAPI_KEY || process.env.SERP_API_KEY || '';

if (cmd === 'report') {
  const now = new Date();
  const rows = B.readLedger(new Date(now.getFullYear(), now.getMonth(), 1).getTime());
  const by = {};
  for (const e of rows) { const k = `${e.consumer} (${e.kind})`; by[k] = by[k] || { calls: 0, stops: 0 }; if (e.counted) by[k].calls++; if (/^stop/.test(e.outcome)) by[k].stops++; }
  console.log(`SerpAPI calls recorded this month: ${rows.filter((e) => e.counted).length}`);
  for (const [k, v] of Object.entries(by).sort((a, b) => b[1].calls - a[1].calls)) console.log(`  ${String(v.calls).padStart(5)}  ${k}${v.stops ? `   (${v.stops} stopped by the budget)` : ''}`);
  process.exit(0);
}

if (cmd === 'note') {
  // Counts an event that is not itself a search (e.g. a 6/6 failure's single targeted audit re-read) so it shows in the meter.
  B.appendLedger({ consumer: arg('consumer', 'note'), kind: 'reread', ref: arg('ref', ''), outcome: 'note', counted: false });
  process.exit(0);
}

if (cmd === 'gate') {
  const need = Number(arg('need', '0')) || 0;
  const rem = B.estimateRemaining();
  const res = B.reserve();
  if (rem === null) { console.log(`[serpapi-budget] gate: no fresh account snapshot - allowing (not knowing is not a stop)`); process.exit(0); }
  if (rem - need < res) {
    console.log(`[serpapi-budget] gate: ${rem} left, this batch needs about ${need}, the client reserve is ${res} - NOT starting it`);
    process.exit(3);
  }
  console.log(`[serpapi-budget] gate: ${rem} left, batch needs about ${need}, reserve ${res} - ok`);
  process.exit(0);
}

if (cmd !== 'preflight') { console.error('usage: serpapi-budget.mjs preflight | gate --need N | note --consumer X --ref Y | report'); process.exit(2); }

const acct = await B.fetchAccount(KEY || (process.env.SERPAPI_ACCOUNT_FIXTURE ? 'fixture' : ''));
if (!acct) {
  console.log('[serpapi-budget] INDETERMINATE - could not read account.json (no key, or the call failed). Not stopping the night for that; the wrapper keeps enforcing the last fresh snapshot if there is one.');
  process.exit(0);
}
// 11-11 (tier3 decision 4): the client reserve grows with the active paying clients (the Website's formula). A fixture run never reads the database; an env
// SERPAPI_RESERVE override wins; a count that cannot be read keeps the base (the night is never stopped for not knowing).
const cr = process.env.SERPAPI_ACCOUNT_FIXTURE || process.env.SERPAPI_RESERVE ? null : await B.clientReserveNow();
if (cr) console.log(`[serpapi-budget] client reserve: ${cr.reserve} (${cr.active} active paying client${cr.active === 1 ? '' : 's'}, the Website's formula)`);
B.writeState({ remaining: acct.remaining, perMonth: acct.perMonth, usage: acct.usage, plan: acct.plan, renewal: acct.renewal, ...(cr ? { activeClients: cr.active, clientReserve: cr.reserve } : {}), reserve: cr ? cr.reserve : B.reserve(), snapshotAt: new Date().toISOString() });
const v = B.paceVerdict(acct);
console.log(`[serpapi-budget] plan=${acct.plan} | ${acct.remaining} left of ${acct.perMonth ?? '?'} | used ${acct.usage ?? '?'}${v.usedPct != null ? ` (${Math.round(v.usedPct * 100)}%)` : ''} | resets ${acct.renewal ?? '?'} (${v.daysLeft ?? '?'} days) | client reserve ${v.reserve}`);
if (v.perDay != null) console.log(`[serpapi-budget] this cycle: ${v.perDay.toFixed(1)}/day so far; the remaining days need about ${v.projectedNeed}, usable above the reserve: ${v.usableBeforeReset}`);

if (v.level === 'below-reserve') {
  const title = `Tonight's run STOPPED at the SerpAPI pre-flight: ${acct.remaining} searches left, under the ${v.reserve} kept for client work`;
  B.raiseAlert(title, [...v.reasons, 'Leads that needed a search are marked NOT SEARCHED - never "no email". Nothing is lost.', 'Fix: top up / upgrade the plan at serpapi.com/dashboard, or wait for the reset.']);
  console.log(`[serpapi-budget] BELOW RESERVE - ${v.reasons.join('; ')}`);
  process.exit(3);
}
if (v.level === 'warn-80' || v.level === 'projected-out') {
  B.raiseAlert(`SerpAPI budget warning: ${v.reasons.join('; ')}`, [...v.reasons, 'The night is NOT stopped. This is the early warning, well above the reserve.', 'Look at the meter: node scripts/serpapi-budget.mjs report']);
  console.log(`[serpapi-budget] ALERT RAISED (${v.level}) - the night continues`);
  process.exit(0);
}
B.clearAlert();
console.log('[serpapi-budget] healthy');
process.exit(0);
