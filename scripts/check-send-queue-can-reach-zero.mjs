#!/usr/bin/env node
/**
 * check-send-queue-can-reach-zero.mjs — the send queue must be DRAINABLE, not merely small.
 *
 * ─── WHY (2026-09-14) ────────────────────────────────────────────────────────────────────────────
 * `auto-resume-production.sh` lifts the production pause on exactly one condition: the send queue
 * reaches zero. So any lead that is counted as "sendable" but can never actually be sent is not a
 * queue entry — it is a permanent lock on production.
 *
 * That happened. `isSendable` never tested `Email Sent Date`, so **Revive Carpet Repair** — emailed
 * 2026-08-06, day-4 follow-up sent 08-14 — counted as "waiting to be emailed" forever. The sender
 * will not first-touch an already-emailed lead, and no field the rule watches would ever change.
 *
 * One phantom lead held the queue at "1 to go" and production sat paused for **19 consecutive
 * nights** — zero scrapes, zero videos — while every other resume condition was green.
 *
 * This is the SECOND time the same shape shipped. On 2026-08-26 the gate counted suppressed and
 * bounced leads, which also can never send. That was fixed by giving both callers one shared rule;
 * this one slipped through because the shared rule itself was incomplete.
 *
 * > **A restart condition that can never be satisfied is not a safety check. It is an outage.**
 *
 * ─── WHAT IT ASSERTS ─────────────────────────────────────────────────────────────────────────────
 *   1. FIXTURES — every "can never send" shape is excluded by the rule. Runs with no credentials.
 *   2. LIVE — no lead currently counted as sendable carries an Email Sent Date, and the queue is not
 *      stuck: if it is non-empty, at least one member is genuinely first-touchable.
 *
 * Exit 0 = drainable · 1 = a phantom lead is locking the queue · 2 = could not tell.
 */
import 'dotenv/config';
import { isSendable } from './lib/sendable.mjs';

const SELF_TEST_ONLY = process.argv.includes('--self-test');

// ── 1. Fixtures ──────────────────────────────────────────────────────────────────────────────────
// Each case is a record that MUST NOT be counted as sendable, because nothing could ever clear it.
const rec = (fields) => ({ id: 'recFIXTURE', fields });
const BASE = { Email: 'a@b.com', 'Video URL': 'https://x/v/y/' };

const CASES = [
  ['a fresh lead IS sendable', rec({ ...BASE }), true],
  ['blank Status counts as new', rec({ ...BASE, Status: '' }), true],
  // ── the shapes that can never leave the queue ──
  ['ALREADY EMAILED — the 19-night outage', rec({ ...BASE, 'Email Sent Date': '2026-08-06' }), false],
  ['already emailed AND mid follow-up', rec({ ...BASE, 'Email Sent Date': '2026-08-06', 'Funnel State': 'day_4_sent' }), false],
  ['suppressed', rec({ ...BASE, Suppressed: true }), false],
  ['bounced address', rec({ ...BASE, 'Email Status': 'bounced' }), false],
  ['invalid address', rec({ ...BASE, 'Email Status': 'invalid' }), false],
  ['draft already created', rec({ ...BASE, 'Draft Created': true }), false],
  ['already replied', rec({ ...BASE, Replied: '2026-09-01' }), false],
  ['moved out of new', rec({ ...BASE, Status: 'contacted' }), false],
  ['no email address', rec({ 'Video URL': 'https://x/v/y/' }), false],
  ['no video yet', rec({ Email: 'a@b.com' }), false],
];

let bad = 0;
for (const [label, r, want] of CASES) {
  const got = isSendable(r);
  if (got !== want) { bad++; console.log(`  FAIL  ${label} — want ${want}, got ${got}`); }
  else console.log(`  PASS  ${label}`);
}
console.log(`\n[queue] fixtures: ${CASES.length - bad}/${CASES.length} passed`);
if (bad) {
  console.error('✗ the sendable rule counts a lead that can never be sent — the queue cannot reach zero.');
  process.exit(1);
}
if (SELF_TEST_ONLY) process.exit(0);

// ── 2. Live ──────────────────────────────────────────────────────────────────────────────────────
const KEY = process.env.AIRTABLE_API_KEY;
const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE = process.env.AIRTABLE_TABLE_NAME || 'Leads';
if (!KEY || !BASE_ID) {
  console.error('[queue] INDETERMINATE — no Airtable credentials, cannot check the live queue');
  process.exit(2);
}

let all = [], offset;
try {
  do {
    const u = new URL(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE)}`);
    u.searchParams.set('pageSize', '100');
    if (offset) u.searchParams.set('offset', offset);
    const j = await (await fetch(u, { headers: { Authorization: `Bearer ${KEY}` } })).json();
    // 🔴 An unreachable CRM is never "drainable" — that would resume production on no evidence.
    if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 140));
    all = all.concat(j.records); offset = j.offset;
  } while (offset);
} catch (e) {
  console.error(`[queue] INDETERMINATE — could not read Airtable: ${String(e.message || e).slice(0, 120)}`);
  process.exit(2);
}

const queued = all.filter(isSendable);
const phantom = queued.filter((r) => r.fields['Email Sent Date']);

console.log(`\n[queue] ${all.length} leads · ${queued.length} sendable · ${phantom.length} phantom`);
if (phantom.length) {
  console.error('✗ these leads are counted as sendable but have ALREADY been emailed — they can never');
  console.error('  leave the queue, so production can never resume:');
  for (const p of phantom.slice(0, 10)) {
    console.error(`    ${p.id}  ${p.fields['Business Name'] || '?'}  sent ${p.fields['Email Sent Date']}`);
  }
  process.exit(1);
}

console.log('✅ every queued lead is genuinely awaiting a first email — the queue can reach zero.');
process.exit(0);
