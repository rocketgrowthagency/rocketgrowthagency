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
const { verifyMailbox } = require(path.join(ROOT, 'lib', 'verify-mailbox.cjs'));

const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')
  .filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const K = env.AIRTABLE_API_KEY, B = env.AIRTABLE_BASE_ID;
const DRY = process.env.DRY_RUN === '1';
const TERMINAL = ['bounced', 'blocked', 'invalid', 'unsubscribed', 'queued-recovery', 'no-replacement-found', 'permanent-bounce', 'soft-bounced'];

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

async function suppress(ids) {
  for (let i = 0; i < ids.length; i += 10) {
    const body = { records: ids.slice(i, i + 10).map((id) => ({ id, fields: { Suppressed: true } })) };
    const r = await fetch(`https://api.airtable.com/v0/${B}/Leads`, { method: 'PATCH', headers: { Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json(); if (d.error) throw new Error(JSON.stringify(d.error));
  }
}

(async () => {
  const sendable = await loadSendable();
  console.log(`Sendable leads to verify: ${sendable.length}${DRY ? '  (DRY RUN — no writes)' : ''}`);
  const tally = { valid: 0, invalid: 0, 'catch-all': 0, unknown: 0 };
  const deadIds = [];
  // simple concurrency pool
  const POOL = 6; let idx = 0;
  async function worker() {
    while (idx < sendable.length) {
      const r = sendable[idx++]; const f = r.fields;
      let v; try { v = await verifyMailbox(f.Email); } catch { v = { result: 'unknown' }; }
      tally[v.result] = (tally[v.result] || 0) + 1;
      const mark = v.result === 'invalid' ? '  → SUPPRESS' : '';
      console.log(`  ${String(v.result).padEnd(9)} ${v.code || '-'}  ${(f['Business Name'] || '').slice(0, 32).padEnd(34)} <${f.Email}>${mark}`);
      if (v.result === 'invalid') deadIds.push(r.id);
    }
  }
  await Promise.all(Array.from({ length: Math.min(POOL, sendable.length) }, worker));
  console.log(`\nResults: ${JSON.stringify(tally)}`);
  if (deadIds.length && !DRY) { await suppress(deadIds); console.log(`Suppressed ${deadIds.length} dead-mailbox lead(s).`); }
  else if (deadIds.length) console.log(`Would suppress ${deadIds.length} (DRY RUN).`);
  else console.log('No dead mailboxes — sendable set is clean.');
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
