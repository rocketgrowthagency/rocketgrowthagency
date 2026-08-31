#!/usr/bin/env node
/**
 * check-offer-prices-consistent.mjs — no live page may quote a price RGA does not honour.
 *
 * ─── WHY (2026-08-31) ────────────────────────────────────────────────────────────────────────────
 * The current price is a LIMITED-TIME 50% off, and it is quoted on SEVEN live pages:
 *
 *   index · pricing · faq · services · start-growth-plan · free-growth-audit/sample-report · demo
 *
 * So ending the offer is seven edits, not one. Miss one and that page quotes a price we no longer
 * honour — which a prospect finds before we do, and which is worse than any layout bug: it is a
 * commitment we did not intend to make.
 *
 * The same shape already caused two incidents: the promo bar drifted across 138 pages, and
 * /services/ became a third page hardcoding the offer while nothing tied them together.
 *
 * > **A number repeated across pages is a promise repeated across pages.** Whatever cannot be
 * > rendered from one source must at least be CHECKED against one source.
 *
 * ─── WHAT IT DOES ────────────────────────────────────────────────────────────────────────────────
 * `data/offer-pricing.json` (Website repo) is the reference. Every `$N` on a live page must be
 * either an offer price from that file, or listed in `non_offer_prices_allowed` with a reason.
 * Anything else is an unexplained number — usually a stale price left behind.
 *
 * Deliberately NOT an auto-rewriter: these figures sit inside prose in many shapes ("$625/mo",
 * "$2,500 total", "was $1,250"), and a regex editing live sales copy is a worse risk than a
 * checklist that cannot be skipped.
 *
 * /docs/* is excluded — owner-economics models, 404'd to the public, whose projections must NOT be
 * forced to match the offer.
 *
 * Usage:  node scripts/check-offer-prices-consistent.mjs [--json]
 * Exit 0 = every quoted price is accounted for · 1 = an unexplained price · 2 = could not tell.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER = path.dirname(HERE);
const WEBSITE = path.join(path.dirname(SCRAPER), 'Rocket Growth Agency Website VS Code');
const JSON_OUT = process.argv.includes('--json');

const REF = path.join(WEBSITE, 'data', 'offer-pricing.json');
if (!fs.existsSync(REF)) {
  console.error('✗ data/offer-pricing.json is missing — the price has no source of truth. Refusing to judge.');
  process.exit(2);
}
let ref;
try { ref = JSON.parse(fs.readFileSync(REF, 'utf8')); }
catch (e) { console.error(`✗ offer-pricing.json is not valid JSON: ${String(e.message).slice(0, 90)}`); process.exit(2); }

const allowed = new Set();
for (const p of Object.values(ref.prices || {})) {
  if (typeof p.was === 'number') allowed.add(p.was);
  if (typeof p.now === 'number') allowed.add(p.now);
}
if (!allowed.size) { console.error('✗ no prices in offer-pricing.json — the reference is empty.'); process.exit(2); }
for (const k of Object.keys(ref.non_offer_prices_allowed || {})) {
  if (/^\d+$/.test(k)) allowed.add(Number(k));
}

const pages = ref.pages_quoting_the_offer || [];
if (!pages.length) { console.error('✗ pages_quoting_the_offer is empty — nothing to check.'); process.exit(2); }

const bad = [];
const missingPage = [];
for (const rel of pages) {
  const f = path.join(WEBSITE, rel);
  if (!fs.existsSync(f)) { missingPage.push(rel); continue; }
  const body = fs.readFileSync(f, 'utf8');
  const seen = new Map();
  for (const m of body.match(/\$[0-9][0-9,]*/g) || []) {
    const n = Number(m.slice(1).replace(/,/g, ''));
    if (allowed.has(n)) continue;
    seen.set(m, (seen.get(m) || 0) + 1);
  }
  for (const [price, count] of seen) bad.push({ page: rel, price, count });
}

if (missingPage.length) {
  console.error(`✗ listed page(s) not found: ${missingPage.join(', ')} — the reference is stale.`);
  process.exit(2);
}

if (JSON_OUT) {
  console.log(JSON.stringify({ offerActive: ref.offer?.active, allowed: [...allowed].sort((a, b) => a - b), unexplained: bad }, null, 2));
  process.exit(bad.length ? 1 : 0);
}

console.log(`\n===== OFFER PRICE CONSISTENCY =====`);
console.log(`  offer active   ${ref.offer?.active ? 'yes — ' + (ref.offer.label || '') : 'no'}`);
console.log(`  pages checked  ${pages.length}`);
console.log(`  prices allowed ${[...allowed].sort((a, b) => a - b).map((n) => '$' + n.toLocaleString()).join(', ')}`);

if (!bad.length) {
  console.log(`\n✅ every price quoted on a live page comes from data/offer-pricing.json.`);
  process.exit(0);
}

console.error(`\n✗ ${bad.length} unexplained price(s) on live pages:`);
for (const b of bad) console.error(`     ${b.page.padEnd(44)} ${b.price} ×${b.count}`);
console.error(`\n   Either the offer changed and this page was missed, or the number is legitimate and`);
console.error(`   needs an entry in "non_offer_prices_allowed" (with the reason) in`);
console.error(`   data/offer-pricing.json. A price on a live page is a promise — it must be deliberate.`);
process.exit(1);
