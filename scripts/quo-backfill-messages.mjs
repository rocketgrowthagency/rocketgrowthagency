#!/usr/bin/env node
/**
 * quo-backfill-messages.mjs — recover inbound texts that were never logged.
 *
 * ─── WHY ─────────────────────────────────────────────────────────────────────────────────────────
 * For 19 days (2026-08-12 → 08-31) the Quo account had NO message webhook, so every inbound text
 * was invisible to the CRM: no lead, no Outreach Log row, no follow-up. The messages themselves
 * still exist in Quo, so they can be replayed.
 *
 * ─── HOW ─────────────────────────────────────────────────────────────────────────────────────────
 * Each missing message is POSTed to our OWN webhook as a `message.received` event, rather than
 * written to Airtable here.
 *
 * > **Replaying through the live handler means backfilled rows are produced by exactly the same code
 * > as live ones.** A second import path would drift from the first and nobody would notice until
 * > the two disagreed.
 *
 * It also inherits the handler's idempotency for free: it skips anything whose `quoMessageId` is
 * already in the Outreach Log, so this is safe to re-run.
 *
 * Usage:
 *   node scripts/quo-backfill-messages.mjs            # dry run — show what WOULD be replayed
 *   node scripts/quo-backfill-messages.mjs --apply    # replay them
 *
 * Exit 0 = nothing owed / done · 1 = replays failed · 2 = cannot tell.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRAPER = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APPLY = process.argv.includes('--apply');
try { (await import('dotenv')).config({ path: path.join(SCRAPER, '.env') }); } catch {}

const QUO = process.env.QUO_API_KEY;
const AT_KEY = process.env.AIRTABLE_API_KEY;
const AT_BASE = process.env.AIRTABLE_BASE_ID;
const HOOK_TOKEN = process.env.QUO_WEBHOOK_TOKEN || 'c7c76352b117e69f98cd74cd7afd8833ef886529ad36b6e8';
const HOOK = `https://www.rocketgrowthagency.com/.netlify/functions/quo-call-webhook?token=${HOOK_TOKEN}`;

if (!QUO)    { console.error('✗ QUO_API_KEY not set'); process.exit(2); }
if (!AT_KEY || !AT_BASE) { console.error('✗ Airtable creds not set'); process.exit(2); }

const H = { Authorization: QUO };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Quo rate-limits aggressively (429 after ~10 rapid calls), so every call is spaced and retried.
async function quo(pathname, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch('https://api.openphone.com/v1/' + pathname, { headers: H });
    if (r.ok) return r.json();
    if (r.status === 429) { await sleep(2500 * (i + 1)); continue; }
    throw new Error(`${r.status} ${(await r.text()).slice(0, 140)}`);
  }
  throw new Error('rate limited after retries');
}

// ── what is already logged? ──────────────────────────────────────────────────────────────────────
const logged = new Set();
{
  let offset;
  do {
    const u = `https://api.airtable.com/v0/${AT_BASE}/${encodeURIComponent('Outreach Log')}`
      + `?filterByFormula=${encodeURIComponent('LOWER({Channel})="sms"')}&pageSize=100${offset ? `&offset=${offset}` : ''}`;
    const r = await fetch(u, { headers: { Authorization: `Bearer ${AT_KEY}` } });
    if (!r.ok) { console.error(`✗ Airtable read failed: ${r.status}`); process.exit(2); }
    const d = await r.json();
    for (const rec of d.records || []) {
      const m = String(rec.fields.Notes || '').match(/quoMessageId=(\S+)/);
      if (m) logged.add(m[1]);
    }
    offset = d.offset;
  } while (offset);
}

// ── everything Quo has ───────────────────────────────────────────────────────────────────────────
const pn = await quo('phone-numbers');
const phoneId = (pn.data || [])[0]?.id;
if (!phoneId) { console.error('✗ no phone number on the account'); process.exit(2); }

const conv = await quo(`conversations?phoneNumberId=${phoneId}&maxResults=50`);
const parties = [...new Set((conv.data || []).flatMap((c) => c.participants || []))];
console.log(`\n===== QUO INBOUND BACKFILL =====`);
console.log(`  conversations       ${(conv.data || []).length}`);
console.log(`  already logged      ${logged.size} sms row(s)`);

const missing = [];
let seen = 0;
for (const p of parties) {
  await sleep(1400);
  let msgs;
  try {
    msgs = await quo(`messages?phoneNumberId=${phoneId}&participants=${encodeURIComponent(p)}&maxResults=100`);
  } catch (e) { console.warn(`  ⚠ ${p}: ${String(e.message).slice(0, 70)}`); continue; }
  for (const m of msgs.data || []) {
    seen++;
    const inbound = String(m.direction || '').toLowerCase().startsWith('in');
    if (!inbound) continue;
    if (logged.has(m.id)) continue;
    missing.push({ id: m.id, from: p, at: m.createdAt, body: String(m.text || m.body || '').slice(0, 70) });
  }
}

console.log(`  messages scanned    ${seen}`);
console.log(`  inbound NOT logged  ${missing.length}`);

if (!missing.length) { console.log(`\n✅ nothing owed — every inbound text is in the CRM.`); process.exit(0); }

missing.sort((a, b) => String(a.at).localeCompare(String(b.at)));
console.log(`\n  ── inbound texts missing from the CRM ──`);
for (const m of missing) console.log(`    ${String(m.at).slice(0, 19)}  ${m.from.padEnd(14)} "${m.body}"`);

if (!APPLY) {
  console.log(`\n  Dry run. Re-run with --apply to replay them through the live webhook.`);
  process.exit(0);
}

// ── replay through our own handler ───────────────────────────────────────────────────────────────
let ok = 0, fail = 0;
for (const m of missing) {
  const payload = {
    id: `EVbackfill-${m.id}`, object: 'event', apiVersion: 'v3', type: 'message.received',
    createdAt: m.at,
    data: { object: { id: m.id, object: 'message', from: m.from, to: [], direction: 'incoming',
      body: m.body, createdAt: m.at } },
  };
  const r = await fetch(HOOK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  const t = (await r.text()).trim();
  if (r.ok && t !== 'no-lead') { ok++; console.log(`    ✅ ${String(m.at).slice(0,19)} ${m.from} -> ${t}`); }
  else { fail++; console.error(`    ✗ ${m.from}: HTTP ${r.status} ${t.slice(0, 60)}`); }
  await sleep(400);
}
console.log(`\n  replayed ${ok}, failed ${fail}`);
process.exit(fail ? 1 : 0);
