#!/usr/bin/env node
/**
 * fix-bogus-review-counts.mjs — clear review counts that were read off a different business.
 *
 * ─── WHY (2026-08-24) ────────────────────────────────────────────────────────────────────────────
 * step-1's findReviews() had an unscoped fallback that scanned the WHOLE page for any aria-label
 * containing a parenthesised number, and returned the first hit. For a business with no reviews that
 * is typically a DIFFERENT business still rendered in the results sidebar. The extractor is fixed
 * (scripts/check-review-count-probe-is-scoped.mjs guards it), but rows written before the fix are
 * already in the CRM.
 *
 * THE SIGNATURE: `Review Count > 0` with an EMPTY `Rating`. Impossible on real Google data — a
 * business with even one review always renders a rating. Confirmed on Hive Pro Bee Removal Inc.
 * (written as 310) against three independent SerpApi endpoints, including google_maps_reviews
 * returning **0 actual review records**.
 *
 * WHY THIS MATTERS BEYOND ONE FIELD: step-6-voiceover.mjs builds COMPETITOR comparisons from
 * Airtable `Review Count` (line ~205). A bogus count is not inert — it can be spoken aloud as a
 * competitor's review count in a different business's video.
 *
 * WHAT IT DOES: clears `Review Count` to empty on matching leads. Empty means UNKNOWN, which is
 * honest; the old value was a confident falsehood. It never invents a replacement — the true count
 * comes back on the next scrape with the fixed extractor.
 *
 * Leads already emailed are reported separately and still cleared: the email cannot be retracted
 * ([[feedback-suppression-does-not-retract-sent-emails]]) but the value must not be reused as
 * competitor data in future videos.
 *
 * Usage:
 *   node scripts/fix-bogus-review-counts.mjs            # report only (default, no writes)
 *   node scripts/fix-bogus-review-counts.mjs --apply    # clear them
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const APPLY = process.argv.includes('--apply');

const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));

const { AIRTABLE_API_KEY: KEY, AIRTABLE_BASE_ID: BASE } = env;
const TABLE = env.AIRTABLE_TABLE_NAME || 'Leads';
if (!KEY || !BASE) { console.error('✗ missing AIRTABLE_API_KEY / AIRTABLE_BASE_ID'); process.exit(1); }

const API = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLE)}`;
const H = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function all() {
  const out = []; let offset;
  do {
    const u = `${API}?pageSize=100${offset ? `&offset=${offset}` : ''}`;
    const r = await fetch(u, { headers: H });
    const j = await r.json();
    // 🔴 An unreachable CRM must ABORT, never be read as "no bad rows"
    // ([[feedback-indeterminate-is-not-a-finding]]).
    if (j.error) { console.error(`✗ ABORT — Airtable read failed: ${JSON.stringify(j.error).slice(0, 160)}`); process.exit(1); }
    out.push(...j.records); offset = j.offset;
    await sleep(220);
  } while (offset);
  return out;
}

const isBogus = (f) => {
  const rv = String(f['Review Count'] ?? '').trim();
  const rt = String(f.Rating ?? '').trim();
  return /^\d+$/.test(rv) && Number(rv) > 0 && !rt;
};

const records = await all();
const bad = records.filter((r) => isBogus(r.fields));
const emailed = bad.filter((r) => r.fields['Email Sent Date']);

console.log(`\n===== BOGUS REVIEW COUNTS =====`);
console.log(`  leads scanned            ${records.length}`);
console.log(`  review count > 0, no rating  ${bad.length}`);
console.log(`  ...already emailed       ${emailed.length}`);

if (!bad.length) { console.log('\n✅ none found.'); process.exit(0); }

// The repeated-value signature — proof this is a probe defect rather than odd businesses.
const counts = {};
for (const r of bad) { const v = String(r.fields['Review Count']); counts[v] = (counts[v] || 0) + 1; }
const repeats = Object.entries(counts).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
if (repeats.length) {
  console.log(`\n  repeated values (one number on unrelated businesses = a PROBE defect, not data):`);
  for (const [v, n] of repeats) console.log(`     ${v} → ${n} leads`);
}

console.log(`\n  affected:`);
for (const r of bad.slice(0, 25)) {
  const f = r.fields;
  console.log(`     ${String(f['Business Name'] || '(no name)').slice(0, 38).padEnd(40)} count=${String(f['Review Count']).padStart(5)}${f['Email Sent Date'] ? '   [EMAILED]' : ''}`);
}
if (bad.length > 25) console.log(`     … and ${bad.length - 25} more`);

if (!APPLY) {
  console.log(`\n(report only — re-run with --apply to clear these to empty)`);
  process.exit(0);
}

let done = 0;
for (let i = 0; i < bad.length; i += 10) {
  const chunk = bad.slice(i, i + 10);
  const body = { records: chunk.map((r) => ({ id: r.id, fields: { 'Review Count': null } })) };
  const res = await fetch(API, { method: 'PATCH', headers: H, body: JSON.stringify(body) });
  const j = await res.json();
  if (j.error) { console.error(`✗ patch failed: ${JSON.stringify(j.error).slice(0, 160)}`); process.exit(1); }
  done += chunk.length;
  console.log(`  cleared ${done}/${bad.length}`);
  await sleep(260);
}

console.log(`\n✅ cleared ${done} bogus review count(s) to empty (unknown, not a false number).`);
if (emailed.length) {
  console.log(`⚠️  ${emailed.length} of them had already been emailed — that cannot be retracted.`);
  console.log(`   Clearing still matters: the value would otherwise be reused as COMPETITOR data`);
  console.log(`   in other businesses' videos (step-6-voiceover.mjs builds competitor sets from this field).`);
}
console.log(`   True counts return on the next scrape, now that the extractor is scoped.`);
