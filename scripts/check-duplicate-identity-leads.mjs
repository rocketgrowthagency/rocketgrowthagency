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

// ── RULE START ── the website's daily job (netlify/functions/_twin-suppress.js) SUPPRESSES what this finds, by the same rule. The gate
// scripts/check-twin-suppress-job.mjs runs this block and that file on the same cases and fails if they ever disagree. Keep it pure.
const DEAD = /dnc|bounce|unsub|closed/i;
const domain = (w) => String(w || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').trim();
// 🔑 11-11: NOT A BUSINESS IDENTITY. facebook.com/joes and facebook.com/bobs are both "facebook.com" once the path is stripped, a
// shared host (joes.wixsite.com) is skipped with it, and a scraped "website" of gmail.com is two strangers. Matching these would
// suppress every live lead hosted there the day one opted out. An exact email still matches, gmail or not.
const PLATFORM_DOMAINS = [
  "facebook.com", "fb.com", "fb.me", "instagram.com", "linkedin.com", "twitter.com", "x.com", "tiktok.com", "youtube.com", "youtu.be",
  "pinterest.com", "nextdoor.com", "linktr.ee", "linkin.bio", "beacons.ai",
  "google.com", "goo.gl", "g.page", "business.site", "blogspot.com",
  "wixsite.com", "wix.com", "squarespace.com", "weebly.com", "godaddysites.com", "square.site", "wordpress.com", "webflow.io",
  "myshopify.com", "carrd.co", "jimdosite.com", "site123.me", "strikingly.com", "mystrikingly.com", "vistaprint.com", "duda.co",
  "yelp.com", "yellowpages.com", "bbb.org", "angi.com", "angieslist.com", "homeadvisor.com", "thumbtack.com", "houzz.com",
  "porch.com", "mapquest.com", "manta.com", "tripadvisor.com", "groupon.com", "zocdoc.com", "healthgrades.com", "vitals.com",
  "booksy.com", "vagaro.com", "styleseat.com", "schedulicity.com", "mindbodyonline.com", "fresha.com", "glossgenius.com",
  "square.com", "squareup.com", "setmore.com", "calendly.com", "acuityscheduling.com", "opentable.com", "doordash.com",
  "ubereats.com", "grubhub.com", "toasttab.com", "amazon.com", "etsy.com", "apple.com",
];
const FREE_EMAIL_DOMAINS = [
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "rocketmail.com", "hotmail.com", "outlook.com", "live.com", "msn.com",
  "aol.com", "icloud.com", "me.com", "mac.com", "protonmail.com", "proton.me", "gmx.com", "gmx.net", "mail.com", "zoho.com",
  "yandex.com", "comcast.net", "att.net", "sbcglobal.net", "verizon.net", "cox.net", "charter.net", "earthlink.net", "bellsouth.net",
  "frontier.com", "optonline.net", "yahoo.co.uk", "hotmail.co.uk",
];
const SKIP_DOMAINS = [...PLATFORM_DOMAINS, ...FREE_EMAIL_DOMAINS];
const skipDomain = (d) => !d || !d.includes('.') || SKIP_DOMAINS.some((p) => d === p || d.endsWith('.' + p));
const keysOf = (f) => {
  const d = domain(f.Website), e = String(f.Email || '').toLowerCase().trim();
  return [!skipDomain(d) && 'domain:' + d, e && e.includes('@') && 'email:' + e].filter(Boolean);
};
const isDead = (x) => x.fields.Suppressed === true || DEAD.test(String(x.fields['Funnel State'] || ''));
// ── RULE END ──

let all = [], offset;
try {
  do {
    const u = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLE)}?pageSize=100${offset ? `&offset=${offset}` : ''}`;
    const r = await fetch(u, { headers: { Authorization: `Bearer ${KEY}` } });
    if (!r.ok) throw new Error(`${r.status}`);
    const d = await r.json();
    // 🔴 11-6: Airtable's monthly limit answers `errors` (PLURAL). → project_airtable_outage_2026_11
    if (d.error || (Array.isArray(d.errors) && d.errors.length)) throw new Error(JSON.stringify(d.error || d.errors).slice(0, 90));
    if (!Array.isArray(d.records)) throw new Error('no records list in the answer');
    all = all.concat(d.records); offset = d.offset;
  } while (offset);
} catch (e) {
  console.error(`✗ Airtable read failed (${String(e.message).slice(0, 70)}) — indeterminate, not healthy.`);
  process.exit(2);
}
if (!all.length) { console.error('✗ zero leads returned — refusing to judge over an empty set.'); process.exit(2); }

const groups = new Map();
for (const x of all) {
  for (const k of keysOf(x.fields)) {
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(x);
  }
}

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
