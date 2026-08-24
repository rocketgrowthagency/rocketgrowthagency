#!/usr/bin/env node
/**
 * check-rating-coverage-excludes-zero-review.mjs — a zero-review business must not read as missing data.
 *
 * ─── WHY (2026-08-24) ────────────────────────────────────────────────────────────────────────────
 * The CID review fallback restored the 6/6 reviews signal for businesses Google shows no rating widget
 * for — i.e. businesses with ZERO reviews. Those are the strongest prospects we have. The very first
 * lead it recovered then died two stages later:
 *
 *     [step-6 verification-state] Hive Pro Bee Removal Inc.: 6/6
 *     ❌ FATAL: refusing to publish — 1 critical field(s) at 0% coverage: rating
 *     ⚠ step-8 failed — video is live but the lead may not exist (orphan)
 *
 * A business with no reviews HAS NO RATING. The empty cell is the correct value, not a scrape gap.
 * But step-8's coverage guard counted it as 0% and refused to publish — **after the video had already
 * gone live**, producing exactly the orphan we spent the month eliminating: a public video with no CRM
 * row, invisible to every lead-based heal.
 *
 * The guard itself is worth keeping: it exists to catch a SYSTEMIC column loss across a scrape (the bug
 * class that hid the pre-2026-05-14 gap). The defect was the DENOMINATOR — scoring `rating` over every
 * row instead of over the rows that could have one.
 *
 * > A statistic computed over the wrong population is not a weaker check. It is a different check.
 *
 * INVARIANTS
 *  1. `rating` is scored only over rows with at least one review.
 *  2. An empty denominator is reported N/A — never as a 0% failure. Absent data is not evidence of loss.
 *  3. The guard KEEPS ITS TEETH: reviewed businesses that all lost their rating still fail.
 *  4. Every other critical field is still scored over ALL rows.
 *
 * Exit 0 = healthy, 1 = regression.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STEP8 = path.join(path.dirname(HERE), 'step-8-publish-to-airtable.mjs');

const fail = (m) => { console.error(`✗ FATAL: ${m}`); process.exit(1); };
const ok = (m) => console.log(`  ✓ ${m}`);

if (!fs.existsSync(STEP8)) fail('step-8-publish-to-airtable.mjs is missing.');
const raw = fs.readFileSync(STEP8, 'utf8');
// Strip comments so this can never be satisfied by the prose above the code. The `[^:]` guard keeps
// `https://…` intact — a naive //-stripper silently deletes URLs and half the line after them.
const src = raw.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');

// 1. rating gets its own population.
if (!/ratingEligible/.test(src)) {
  fail('`rating` is still scored over every row. A zero-review business has no rating, so the guard\n' +
       '         fires on the best prospects we have — and it fires AFTER the video is live, orphaning it.');
}
if (!/reviewsOf\(r\)\s*\?\?\s*0\)\s*>\s*0/.test(src)) {
  fail('the rating population is not "rows with at least one review".');
}
ok('rating is scored only over rows that could have one');

// 2. Empty denominator ⇒ N/A, never 0%.
if (!/denom === 0/.test(src)) {
  fail('an empty denominator is not special-cased. 0/0 would render as a 0% CRITICAL failure and block\n' +
       '         publication of a perfectly good single-lead rebuild.');
}
const naIdx = src.indexOf('denom === 0');
if (!/continue/.test(src.slice(naIdx, naIdx + 320))) {
  fail('the empty-denominator branch does not skip the field — it can still reach the atZero push.');
}
ok('an empty denominator is reported N/A, not as a failure');

// 3. Teeth intact.
if (!/if \(n === 0\) atZero\.push\(f\)/.test(src)) {
  fail('the 0%-coverage failure path is gone. This guard must still catch a systemic column loss.');
}
if (!/process\.exit\(2\)/.test(src)) fail('step-8 no longer exits non-zero on a real coverage failure.');
ok('a genuine 0% coverage still refuses to publish');

// 4. Other fields unchanged.
if (!/f === 'rating' \? ratingEligible : rows/.test(src)) {
  fail('the row population is not narrowed for `rating` ALONE — other critical fields must still be\n' +
       '         scored across every row.');
}
ok('every other critical field is still scored over all rows');

// ── BEHAVIOURAL — replay the three cases that matter ─────────────────────────────────────────────
const reviewsOf = (r) => {
  const n = Number(String(r.reviews ?? '').replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const score = (rows) => {
  const eligible = rows.filter((r) => (reviewsOf(r) ?? 0) > 0);
  const denom = eligible.length;
  if (denom === 0) return 'n/a';
  const n = eligible.filter((r) => r.rating && String(r.rating).trim()).length;
  return n === 0 ? 'FATAL' : 'ok';
};

const zeroReviewLead = [{ reviews: '0', rating: '' }];                       // Hive Pro — the real case
const systemicLoss = Array.from({ length: 12 }, () => ({ reviews: '48', rating: '' }));
const healthy = Array.from({ length: 12 }, () => ({ reviews: '48', rating: '4.7' }));
const mixed = [{ reviews: '0', rating: '' }, { reviews: '48', rating: '4.7' }];

const cases = [
  ['zero-review lead publishes', zeroReviewLead, 'n/a'],
  ['12 reviewed businesses all missing rating still FATAL', systemicLoss, 'FATAL'],
  ['healthy batch passes', healthy, 'ok'],
  ['zero-review row does not drag a healthy batch down', mixed, 'ok'],
];
for (const [label, rows, want] of cases) {
  const got = score(rows);
  if (got !== want) fail(`behavioural: ${label} — expected ${want}, got ${got}.`);
  ok(`behavioural: ${label} → ${got}`);
}

console.log('✅ rating coverage judges the right population; honest absence no longer orphans a video.');
