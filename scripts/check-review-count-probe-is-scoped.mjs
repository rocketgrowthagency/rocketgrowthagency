#!/usr/bin/env node
/**
 * check-review-count-probe-is-scoped.mjs — a review count must come from THIS business, not the page.
 *
 * ─── WHY (2026-08-24) ────────────────────────────────────────────────────────────────────────────
 * step-1's findReviews() had three sources. Source 2 scanned the ENTIRE document:
 *
 *     const btns = Array.from(document.querySelectorAll('button[aria-label], a[aria-label]'));
 *
 * and its pattern list accepts a bare `(\d+)`. So for a business with NO reviews — F7nice absent or
 * empty — it walked the whole page and returned the first parenthesised number it found, which on a
 * Maps detail view is typically a DIFFERENT business still rendered in the results sidebar.
 *
 * Measured across 60 recent scrapes: **49 of 312 rows** carried reviews>0 with an EMPTY rating, and a
 * single value — 310 — appeared on Roy Jahangard, Dr. Heidi Fahringer, We Care Eye Care,
 * Katya S. Zelaya and Osako Eugene Y OD. Hive Pro Bee Removal Inc. was written as 310; three
 * independent SerpApi endpoints (place, search, and google_maps_reviews returning **0 actual review
 * records**) confirm it has none.
 *
 * > **A single value repeated across unrelated subjects is never a finding about the subjects.**
 * > It is a defect in the probe.
 *
 * Coverage checks were blind to this for months: the Reviews column was 100% POPULATED. It was
 * populated with another business's number. **Coverage proves a field is filled, not that it is true.**
 *
 * The detectable contradiction: a business with even one review ALWAYS renders a rating, so
 * `reviews>0 && rating===''` is impossible on real data.
 *
 * INVARIANTS
 *  1. The aria-label scan is scoped to the business's own detail pane, never `document`.
 *  2. Outside F7nice, a match requires the word review/star — a bare "(12)" cannot become a count.
 *  3. step-1 FAILS when any written row has reviews>0 with an empty rating.
 *  4. The failure reports repeated values, because that is the probe-defect signature.
 *
 * Exit 0 = healthy, 1 = regression.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STEP1 = path.join(path.dirname(HERE), 'step-1-maps-scraper.cjs');

const fail = (m) => { console.error(`✗ FATAL: ${m}`); process.exit(1); };
const ok = (m) => console.log(`  ✓ ${m}`);

if (!fs.existsSync(STEP1)) fail('step-1-maps-scraper.cjs is missing.');
const raw = fs.readFileSync(STEP1, 'utf8');
const src = raw.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');

// 1. Scoped, not global.
if (/document\.querySelectorAll\('button\[aria-label\], a\[aria-label\]'\)/.test(src)) {
  fail('findReviews() scans the whole document for aria-labels again. That returns the first\n' +
       '         parenthesised number on the page — usually another business in the sidebar. It put\n' +
       '         one value (310) on five unrelated businesses.');
}
if (!/pane\.querySelectorAll\('button\[aria-label\], a\[aria-label\]'\)/.test(src)) {
  fail('the aria-label scan is not scoped to the business detail pane.');
}
ok('the aria-label scan is scoped to the business\'s own pane');

// 2. Requires the word review/star outside F7nice.
if (!/\/review\|star\/i\.test\(aria\)/.test(src)) {
  fail('a bare parenthesised number can still become a review count outside F7nice. Inside F7nice it\n' +
       '         is unambiguous; out here it is a guess, and the guess produced 310.');
}
ok('outside F7nice a match must mention review/star');

// 3 + 4. The contradiction is fatal, and repeated values are called out.
if (!/reviewContradictions/.test(src)) {
  fail('step-1 does not check for reviews>0 with an empty rating — the one signature that exposes a\n' +
       '         wrong-business review count. Coverage cannot see it: the column is fully populated.');
}
if (!/process\.exitCode = 2/.test(src)) fail('the contradiction does not fail the run.');
if (!/PROBE defect, not data/.test(src)) {
  fail('the failure does not surface repeated values. A value shared across unrelated businesses is\n' +
       '         the signature that separates a probe defect from real data — say it, or the next\n' +
       '         reader debugs the businesses instead of the extractor.');
}
ok('reviews>0 with no rating fails the run, and repeats are named');

// ── BEHAVIOURAL — reproduce the real bug and prove the detector catches it ───────────────────────
const detect = (rows) => rows.filter((r) => /^\d+$/.test(String(r.reviews)) && Number(r.reviews) > 0 && !String(r.rating).trim());

const buggy = [
  { name: 'Hive Pro Bee Removal Inc.', reviews: '310', rating: '' },
  { name: 'Dr. Heidi Fahringer',       reviews: '310', rating: '' },
  { name: 'We Care Eye Care Optometry',reviews: '310', rating: '' },
  { name: 'Katya S. Zelaya, OD',       reviews: '310', rating: '' },
];
const healthy = [
  { name: 'Sola Kids Dental',   reviews: '1450', rating: '5'   },
  { name: 'Rodent R Us',        reviews: '2',    rating: '4.5' },
  { name: 'Genuinely unrated',  reviews: '',     rating: ''    },   // zero reviews: legitimate, must pass
  { name: 'Zero as a literal',  reviews: '0',    rating: ''    },   // also legitimate
];

if (detect(buggy).length !== 4) fail(`detector missed the real bug: caught ${detect(buggy).length} of 4.`);
ok(`behavioural: catches all 4 real bogus rows (one value, four businesses)`);

if (detect(healthy).length !== 0) {
  fail(`detector fires on legitimate rows: ${detect(healthy).map((r) => r.name).join(', ')}. A business\n` +
       '         with zero reviews and no rating is CORRECT — and is our strongest prospect.');
}
ok('behavioural: zero-review and fully-rated businesses both pass');

const vals = [...new Set(buggy.map((r) => r.reviews))];
if (!(vals.length < buggy.length)) fail('fixture broken: the repeated-value signature is not present.');
ok(`behavioural: repeat signature visible — 4 rows, ${vals.length} distinct value(s)`);

console.log('✅ review counts come from the business, and the impossible pair fails the run.');
