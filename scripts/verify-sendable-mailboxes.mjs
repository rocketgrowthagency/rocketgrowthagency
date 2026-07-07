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
const { verifyEmailBouncer } = require(path.join(ROOT, 'lib', 'verify-email-bouncer.cjs'));
const { isLikelyEmail, isDisposableDomain } = require(path.join(ROOT, 'lib', 'email-validation.cjs'));

// FREE pre-filter — runs BEFORE Bouncer so free-catchable bad addresses cost 0 credits.
// Returns a drop-reason string if our free layers can prove it bad, else null (→ Bouncer verifies).
function freeReject(email) {
  const addr = String(email || '').trim().toLowerCase();
  const domain = addr.slice(addr.lastIndexOf('@') + 1);
  if (isDisposableDomain(domain)) return 'disposable';
  if (!isLikelyEmail(addr)) return 'invalid';   // syntax/placeholder/aggregator/vendor/malformed/bad-dot
  return null;
}

const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')
  .filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const K = env.AIRTABLE_API_KEY, B = env.AIRTABLE_BASE_ID;
// Bouncer is the primary verifier when a key is configured (reliable catch-all/disposable/role/spam-trap
// detection); the free SMTP probe is the fallback. Force-fallback with VERIFY_ENGINE=smtp.
if (env.BOUNCER_API_KEY && !process.env.BOUNCER_API_KEY) process.env.BOUNCER_API_KEY = env.BOUNCER_API_KEY;
const USE_BOUNCER = !!process.env.BOUNCER_API_KEY && process.env.VERIFY_ENGINE !== 'smtp';

// One unified verify() → { result, code, detail }. Bouncer first (falls back to SMTP on a key/credit error).
async function verify(email) {
  if (USE_BOUNCER) {
    try {
      const b = await verifyEmailBouncer(email);
      return { result: b.result, code: b.status, detail: b.reason + (b.cached ? ' (cached)' : '') };
    } catch (e) {
      if (e.code === 'BOUNCER_AUTH' || e.code === 'BOUNCER_CREDITS') { console.error('  ! Bouncer error, falling back to SMTP:', e.message); }
      else throw e;
    }
  }
  return verifyMailbox(email);
}
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
const STRICT = process.env.VERIFY_POLICY === 'strict';

// Batch-patch Airtable Lead rows. typecast:true so new Email Status options ('no-mx','held-catch-all',
// 'held-unknown') auto-create. updates = [{ id, fields }].
async function patchLeads(updates) {
  for (let i = 0; i < updates.length; i += 10) {
    const body = { records: updates.slice(i, i + 10), typecast: true };
    const r = await fetch(`https://api.airtable.com/v0/${B}/Leads`, { method: 'PATCH', headers: { Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json(); if (d.error) throw new Error(JSON.stringify(d.error));
  }
}

// Map a verifyMailbox result → policy action. DROP = permanent suppress (definitively undeliverable).
// QUARANTINE = held for later (strict only). KEEP = leave sendable.
function classify(v) {
  const noMx = v.result === 'unknown' && (v.detail === 'no-mx' || v.detail === 'mx-lookup-failed');
  // DROP (permanent suppress — definitively undeliverable or unsafe to send):
  if (v.result === 'invalid')    return { bucket: 'drop', status: 'invalid', why: v.detail || 'undeliverable' };
  if (v.result === 'disposable') return { bucket: 'drop', status: 'disposable', why: 'disposable-domain' };  // Bouncer
  if (noMx)                      return { bucket: 'drop', status: 'no-mx', why: v.detail };
  // KEEP (send): valid, and role-based (send but deprioritized — playbook).
  if (v.result === 'role')       return { bucket: 'keep', why: 'role-based (send deprioritized)' };
  // HOLD in strict / keep in legacy: catch-all, risky, unknown (all bounce-prone but not proven dead).
  if (v.result === 'catch-all')  return STRICT ? { bucket: 'quarantine', status: 'held-catch-all', why: 'domain-accepts-all' }
                                               : { bucket: 'keep', why: 'catch-all (legacy: kept)' };
  if (v.result === 'risky')      return STRICT ? { bucket: 'quarantine', status: 'held-risky', why: v.detail || 'low-deliverability' }
                                               : { bucket: 'keep', why: 'risky (legacy: kept)' };  // Bouncer
  if (v.result === 'unknown')    return STRICT ? { bucket: 'quarantine', status: 'held-unknown', why: v.detail || 'unverifiable' }
                                               : { bucket: 'keep', why: 'unknown (legacy: kept)' };
  return { bucket: 'keep', why: 'valid' };
}

(async () => {
  const sendable = await loadSendable();
  console.log(`Sendable leads to verify: ${sendable.length}  [engine=${USE_BOUNCER ? 'Bouncer' : 'SMTP'}, policy=${STRICT ? 'STRICT' : 'legacy'}]${DRY ? '  (DRY RUN — no writes)' : ''}`);
  const tally = { valid: 0, invalid: 0, 'catch-all': 0, unknown: 0 };
  let freeCaught = 0;  // dropped by the free layer → 0 Bouncer credits spent on these
  const drops = [];        // { id } → Suppressed + status (permanent)
  const quarantines = [];  // { id } → Suppressed + held-* status (retained)
  const POOL = 6; let idx = 0;
  async function worker() {
    while (idx < sendable.length) {
      const r = sendable[idx++]; const f = r.fields;
      // FREE pre-filter first — if our own layers prove it bad, drop WITHOUT a Bouncer call.
      const fr = freeReject(f.Email);
      let v;
      if (fr) { v = { result: fr, detail: 'free-layer', code: 'free' }; freeCaught++; }
      else { try { v = await verify(f.Email); } catch { v = { result: 'unknown' }; } }
      tally[v.result] = (tally[v.result] || 0) + 1;
      const c = classify(v);
      const mark = c.bucket === 'drop' ? '  → DROP' : c.bucket === 'quarantine' ? '  → HOLD' : '';
      console.log(`  ${String(v.result).padEnd(9)} ${v.code || '-'}  ${(f['Business Name'] || '').slice(0, 30).padEnd(32)} <${f.Email}>${mark}${c.status ? ' [' + c.status + ']' : ''}`);
      if (c.bucket === 'drop') drops.push({ id: r.id, fields: { Suppressed: true, 'Email Status': c.status } });
      else if (c.bucket === 'quarantine') quarantines.push({ id: r.id, fields: { Suppressed: true, 'Email Status': c.status } });
    }
  }
  await Promise.all(Array.from({ length: Math.min(POOL, sendable.length) }, worker));
  console.log(`\nResults: ${JSON.stringify(tally)}`);
  console.log(`  FREE-layer caught (0 Bouncer credits): ${freeCaught}  |  Bouncer-verified: ${sendable.length - freeCaught}`);
  console.log(`  DROP (permanent, undeliverable): ${drops.length}`);
  console.log(`  QUARANTINE (held for later)${STRICT ? '' : ' [enable with VERIFY_POLICY=strict]'}: ${quarantines.length}`);
  if (!DRY) {
    if (drops.length) { await patchLeads(drops); console.log(`Dropped ${drops.length} undeliverable lead(s).`); }
    if (quarantines.length) { await patchLeads(quarantines); console.log(`Quarantined ${quarantines.length} lead(s) — see scripts/quarantine-report.mjs.`); }
    if (!drops.length && !quarantines.length) console.log('Sendable set is clean — nothing to drop or hold.');
  } else {
    console.log(`(DRY RUN — would drop ${drops.length}, quarantine ${quarantines.length})`);
  }
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
