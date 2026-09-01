#!/usr/bin/env node
/**
 * check-duplicate-identity-leads.mjs — a do-not-contact applies to the BUSINESS, not one row.
 *
 * ─── WHY (2026-08-31) ────────────────────────────────────────────────────────────────────────────
 * 23 duplicate website-domains and 27 duplicate emails sit in the Leads table. Most are harmless —
 * both copies dead. **Ten were not**: a LIVE lead shared a domain or email with a twin that was
 * `closed_dnc` or `closed_bounced`.
 *
 *   Boris Cosmetic              not_yet_sent          twin closed_dnc
 *   Dr. Sean Plastic Surgery    day_4_opened          twin closed_dnc
 *   LA Roof Masters             reengagement_opened   twin closed_dnc
 *   …
 *
 * Four had not been emailed yet; six were **mid-sequence and would have kept sending follow-ups to
 * a business that had already asked us to stop.**
 *
 * > **Suppression must key on the BUSINESS IDENTITY, not the record.** Someone who unsubscribes has
 * > opted the company out. A second row for the same domain re-opens a door they closed — and a
 * > bounce on one address predicts a bounce on the next, which is a deliverability risk too.
 *
 * This is the enforcement half of "ONE WEBSITE = ONE PROSPECT"
 * ([[project-deep-dive-build-failures-2026-08-21]]): that rule stopped duplicates being CREATED;
 * this catches the ones already there, and any the dedupe misses.
 *
 * Usage:  node scripts/check-duplicate-identity-leads.mjs [--json]
 * Exit 0 = no live lead shares an identity with a dead one · 1 = found · 2 = could not tell.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRAPER = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const JSON_OUT = process.argv.includes('--json');
try { (await import('dotenv')).config({ path: path.join(SCRAPER, '.env') }); } catch {}

const KEY = process.env.AIRTABLE_API_KEY;
const BASE = process.env.AIRTABLE_BASE_ID;
const TABLE = process.env.AIRTABLE_TABLE_NAME;
if (!KEY || !BASE || !TABLE) { console.error('✗ Airtable creds missing — refusing to report healthy.'); process.exit(2); }

const DEAD = /dnc|bounce|unsub|closed/i;
const domain = (w) => String(w || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').trim();

let all = [], offset;
try {
  do {
    const u = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLE)}?pageSize=100${offset ? `&offset=${offset}` : ''}`;
    const r = await fetch(u, { headers: { Authorization: `Bearer ${KEY}` } });
    if (!r.ok) throw new Error(`${r.status}`);
    const d = await r.json();
    if (d.error) throw new Error(JSON.stringify(d.error).slice(0, 90));
    all = all.concat(d.records); offset = d.offset;
  } while (offset);
} catch (e) {
  console.error(`✗ Airtable read failed (${String(e.message).slice(0, 70)}) — indeterminate, not healthy.`);
  process.exit(2);
}
if (!all.length) { console.error('✗ zero leads returned — refusing to judge over an empty set.'); process.exit(2); }

const groups = new Map();
for (const x of all) {
  const d = domain(x.fields.Website);
  const e = String(x.fields.Email || '').toLowerCase().trim();
  for (const k of [d && 'domain:' + d, e && 'email:' + e]) {
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(x);
  }
}

const isDead = (x) => x.fields.Suppressed === true || DEAD.test(String(x.fields['Funnel State'] || ''));
const risky = new Map();
for (const [k, v] of groups) {
  if (v.length < 2) continue;
  const dead = v.filter(isDead), live = v.filter((x) => !isDead(x));
  if (!dead.length || !live.length) continue;
  for (const L of live) {
    risky.set(L.id, { id: L.id, name: L.fields['Business Name'] || '(none)', key: k,
      state: L.fields['Funnel State'] || '-', twin: dead[0].fields['Funnel State'] || 'suppressed' });
  }
}
const found = [...risky.values()];

if (JSON_OUT) {
  console.log(JSON.stringify({ leads: all.length, groups: groups.size, risky: found }, null, 2));
  process.exit(found.length ? 1 : 0);
}

console.log(`\n===== DUPLICATE-IDENTITY LEADS =====`);
console.log(`  leads scanned   ${all.length}`);

if (!found.length) { console.log(`\n✅ no live lead shares a website or email with an opted-out one.`); process.exit(0); }

console.error(`\n✗ ${found.length} LIVE lead(s) share an identity with a dead/opted-out lead:`);
for (const r of found.slice(0, 15)) console.error(`     ${String(r.name).slice(0, 34).padEnd(36)} ${r.state.padEnd(20)} twin=${r.twin}`);
if (found.length > 15) console.error(`     … and ${found.length - 15} more`);
console.error(`\n   A do-not-contact applies to the BUSINESS, not the record. These will keep receiving`);
console.error(`   follow-ups at a company that already asked us to stop — a compliance and`);
console.error(`   deliverability risk. Set Suppressed=true on the live row(s).`);
process.exit(1);
