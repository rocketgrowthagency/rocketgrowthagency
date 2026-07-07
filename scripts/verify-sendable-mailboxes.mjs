#!/usr/bin/env node
// scripts/verify-sendable-mailboxes.mjs
//
// PRE-SEND GATE. Mailbox-verifies EVERY currently-sendable lead and auto-suppresses
// the ones whose mailbox is definitively dead (SMTP 5xx). Run this before flipping
// OUTREACH_PAUSED back on, and before releasing any held batch (eval / backlog) — those
// leads were scraped before step-2 mailbox verification existed, so their emails are
// unverified and many are undeliverable (Jun-16: Doctor Pipe, Top LA, etc. all 550).
// Catches what the send-time MX check can't (passes MX, mailbox doesn't exist).
//
// FAIL OPEN: only suppresses on result==='invalid'. valid/catch-all/unknown are kept.
// Usage:  node scripts/verify-sendable-mailboxes.mjs            (suppress dead, report)
//         DRY_RUN=1 node scripts/verify-sendable-mailboxes.mjs  (report only, no writes)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// The canonical layered verifier: free denylist/disposable → free MX → Bouncer (see lib/verify-pipeline.cjs).
const { verifyEmailLayered } = require(path.join(ROOT, 'lib', 'verify-pipeline.cjs'));

const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')
  .filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const K = env.AIRTABLE_API_KEY, B = env.AIRTABLE_BASE_ID;
if (env.BOUNCER_API_KEY && !process.env.BOUNCER_API_KEY) process.env.BOUNCER_API_KEY = env.BOUNCER_API_KEY;
const USE_BOUNCER = !!process.env.BOUNCER_API_KEY && process.env.VERIFY_ENGINE !== 'free';
const DRY = process.env.DRY_RUN === '1';
const TERMINAL = ['bounced', 'blocked', 'invalid', 'unsubscribed', 'queued-recovery', 'no-replacement-found', 'permanent-bounce', 'soft-bounced', 'no-mx', 'held-catch-all', 'held-unknown'];

async function loadSendable() {
  let recs = [], offset = null;
  do {
    const u = new URL(`https://api.airtable.com/v0/${B}/Leads`);
    u.searchParams.set('pageSize', '100');
    ['Business Name', 'Email', 'Video URL', 'Suppressed', 'Email Status', 'Status', 'Draft Created'].forEach((f) => u.searchParams.append('fields[]', f));
    if (offset) u.searchParams.set('offset', offset);
    const r = await fetch(u, { headers: { Authorization: 'Bearer ' + K } });
    const d = await r.json();
    if (d.error) throw new Error(JSON.stringify(d.error));
    recs = recs.concat(d.records || []); offset = d.offset;
  } while (offset);
  // Covers BOTH paths that can dispatch an email:
  //  - Day-1 (createOutreachDrafts): Status new/'' + Video URL + not yet drafted
  //  - Follow-up (advanceFunnelState): already got Email #1 (Draft Created) + still in sequence
  // Any non-suppressed, non-replied, non-terminal lead with an email that could send.
  return recs.filter((r) => {
    const f = r.fields, s = String(f.Status || 'new').toLowerCase();
    if (!f.Email || f.Suppressed || f.Replied || TERMINAL.indexOf(f['Email Status']) >= 0) return false;
    const isDay1 = f['Video URL'] && (s === 'new' || s === '') && !f['Draft Created'];
    const isFollowUp = !!f['Draft Created']; // sent Email #1, still active (not replied/suppressed/terminal)
    return isDay1 || isFollowUp;
  });
}

// STRICT policy (opt-in) additionally QUARANTINES catch-all + unknown addresses — not deleted,
// not sent: Suppressed=true + Email Status='held-*' so they're retained for a later send strategy
// (e.g. a dedicated 2nd/test domain). Preview first: VERIFY_POLICY=strict DRY_RUN=1 node <this>.
// Map the pipeline's decision → Airtable action. drop = permanent suppress; hold = quarantine (retained,
// Suppressed + held-* for a later 2nd-domain strategy); send = leave sendable. The send/hold/drop policy
// itself lives in lib/verify-pipeline.cjs (tunable via VERIFY_HOLD_CATCHALL / VERIFY_HOLD_UNKNOWN / VERIFY_SEND_RISKY).
function toBucket(d) {
  if (d.decision === 'drop') return { bucket: 'drop', status: d.result, why: d.reason };
  if (d.decision === 'hold') return { bucket: 'quarantine', status: 'held-' + d.result, why: d.reason };
  return { bucket: 'keep', why: d.reason };
}

// Batch-patch Airtable Lead rows. typecast:true so new Email Status options ('no-mx','held-catch-all',
// 'held-unknown') auto-create. updates = [{ id, fields }].
async function patchLeads(updates) {
  for (let i = 0; i < updates.length; i += 10) {
    const body = { records: updates.slice(i, i + 10), typecast: true };
    const r = await fetch(`https://api.airtable.com/v0/${B}/Leads`, { method: 'PATCH', headers: { Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json(); if (d.error) throw new Error(JSON.stringify(d.error));
  }
}

(async () => {
  const sendable = await loadSendable();
  console.log(`Sendable leads to verify: ${sendable.length}  [engine=${USE_BOUNCER ? 'free→Bouncer' : 'free-only'}]${DRY ? '  (DRY RUN — no writes)' : ''}`);
  const tally = {};
  let freeCaught = 0, creditsSpent = 0;  // free layers cost 0 credits; only Bouncer calls charge
  const drops = [];        // { id } → Suppressed + status (permanent)
  const quarantines = [];  // { id } → Suppressed + held-* status (retained)
  const POOL = 6; let idx = 0;
  async function worker() {
    while (idx < sendable.length) {
      const r = sendable[idx++]; const f = r.fields;
      let d; try { d = await verifyEmailLayered(f.Email); }
      catch { d = { decision: 'send', tier: 'error', result: 'unknown', reason: 'error', creditSpent: false }; }
      if (d.creditSpent) creditsSpent++; else if (d.tier.startsWith('free')) freeCaught++;
      tally[d.result] = (tally[d.result] || 0) + 1;
      const c = toBucket(d);
      const mark = c.bucket === 'drop' ? '  → DROP' : c.bucket === 'quarantine' ? '  → HOLD' : '';
      console.log(`  ${String(d.result).padEnd(10)} ${d.tier.padEnd(18)} ${(f['Business Name'] || '').slice(0, 28).padEnd(30)} <${f.Email}>${mark}${c.status ? ' [' + c.status + ']' : ''}`);
      if (c.bucket === 'drop') drops.push({ id: r.id, fields: { Suppressed: true, 'Email Status': c.status } });
      else if (c.bucket === 'quarantine') quarantines.push({ id: r.id, fields: { Suppressed: true, 'Email Status': c.status } });
    }
  }
  await Promise.all(Array.from({ length: Math.min(POOL, sendable.length) }, worker));
  console.log(`\nResults: ${JSON.stringify(tally)}`);
  console.log(`  FREE-layer caught (0 credits): ${freeCaught}  |  Bouncer credits spent this run: ${creditsSpent}`);
  console.log(`  DROP (permanent, undeliverable): ${drops.length}`);
  console.log(`  QUARANTINE (held: risky, + catch-all/unknown if VERIFY_HOLD_*=1): ${quarantines.length}`);
  if (!DRY) {
    if (drops.length) { await patchLeads(drops); console.log(`Dropped ${drops.length} undeliverable lead(s).`); }
    if (quarantines.length) { await patchLeads(quarantines); console.log(`Quarantined ${quarantines.length} lead(s) — see scripts/quarantine-report.mjs.`); }
    if (!drops.length && !quarantines.length) console.log('Sendable set is clean — nothing to drop or hold.');
  } else {
    console.log(`(DRY RUN — would drop ${drops.length}, quarantine ${quarantines.length})`);
  }
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
