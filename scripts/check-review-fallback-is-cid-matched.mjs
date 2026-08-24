#!/usr/bin/env node
/**
 * check-review-fallback-is-cid-matched.mjs — the review fallback must match on CID, never on name.
 *
 * ─── WHY (2026-08-24) ────────────────────────────────────────────────────────────────────────────
 * "Missing: reviews" was 42 of 56 below-6of6 failures over three nights — the single biggest blocker.
 * 27 of those were an INDETERMINATE DOM read (widget present, no cards, no empty-state) being treated
 * as absence. The strict gate rightly refuses to claim "no reviews", so a good prospect gets dropped.
 *
 * 🚫 A NAME-MATCHED SerpApi fallback was built first and REVERTED. SerpApi returns FOUR businesses
 * called "California Dermatology Institute":
 *
 *     0x…e651  42 reviews  9150 Wilshire Blvd, Beverly Hills
 *     0x…6d91   6 reviews  9808 Venice Blvd Ste 707, Culver City   ← the real lead
 *     0x…3589  12 reviews  6200 Wilshire Blvd, LA
 *     0x…497c 583 reviews  5725 S Soto St, Huntington Park
 *
 * Name matching — even with `ll` coordinates — picked the Beverly Hills one. That would have stated a
 * COMPETITOR'S review count in the prospect's video as fact: the same class of error as filming the
 * wrong website, and worse, because the voiceover asserts the number.
 *
 * ✅ The CID is exact identity. The navigated Maps URL carries `!1s0x…:0x…`; SerpApi returns the same
 * value as `data_id`. Accept a count ONLY on an exact CID match.
 *
 * INVARIANTS
 *  1. The fallback extracts a CID from the live page URL.
 *  2. It matches SerpApi results on `data_id` — exactly, case-insensitively.
 *  3. No CID ⇒ NO fallback (reviews stay unverified). Failing 6/6 beats a confident wrong number.
 *  4. It never falls back to a name/title comparison.
 *  5. It only runs when the DOM read was null — never overriding a real reading.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AUDIT = path.join(path.dirname(HERE), 'step-2.5-audit.mjs');
const fail = (m) => { console.error(`✗ FATAL: ${m}`); process.exit(1); };
const ok = (m) => console.log(`  ✓ ${m}`);

const raw = fs.readFileSync(AUDIT, 'utf8');
const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

const i = src.indexOf('serpapi-cid');
if (i === -1) fail('the CID-matched review fallback is gone. "Missing: reviews" is the largest single\n' +
                   '         blocker (42 of 56) and an indeterminate DOM read would again read as absence.');
const block = src.slice(Math.max(0, i - 2600), i + 600);

if (!/!1s\(0x\[0-9a-f\]\+:0x\[0-9a-f\]\+\)/.test(block)) {
  fail('the fallback does not extract a CID from the page URL — it has no way to verify identity.');
}
ok('extracts the CID from the live Maps URL');

if (!/data_id/.test(block)) fail('the fallback does not match on SerpApi data_id.');
if (!/=== want|=== String\(/.test(block)) fail('data_id comparison is not an exact match.');
ok('matches SerpApi results on data_id, exactly');

if (!/if \(!cid\)/.test(block)) {
  fail('no CID ⇒ the fallback still runs. Without identity it can pick a same-named business in another\n' +
       '         city — SerpApi returns four "California Dermatology Institute" listings.');
}
ok('no CID ⇒ no fallback');

if (/norm\(c\?\.title\)|c\?\.title/.test(block)) {
  fail('the fallback still compares titles. Name matching picked the Beverly Hills listing (42 reviews)\n' +
       '         over the Culver City lead (6) — that is a competitor\'s number stated as fact.');
}
ok('never compares by name/title');

if (!/findings\.reviewCount === null \|\| findings\.reviewCount === undefined/.test(block)) {
  fail('the fallback is not gated on a null DOM read — it could override a real reading.');
}
ok('only runs when the DOM read was null');

// ── BEHAVIOURAL — replay the real four-listing case ──────────────────────────────────────────────
const cands = [
  { title: 'California Dermatology Institute', data_id: '0x80c2b95c4d2a5dcd:0xf60a98c3d904e651', reviews: 42 },
  { title: 'California Dermatology Institute', data_id: '0x80c2bb6258cf5415:0xb9a120c009ba6d91', reviews: 6 },
  { title: 'California Dermatology Institute', data_id: '0x80c2b9311ddde8bb:0x8d1b5aa00a023589', reviews: 12 },
  { title: 'California Dermatology Institute', data_id: '0x80c2c99977e7b563:0x4c5bcf37d379497c', reviews: 583 },
];
const cid = '0x80c2bb6258cf5415:0xb9a120c009ba6d91';   // the Culver City lead
const byCid = cands.find((c) => c.data_id.toLowerCase() === cid.toLowerCase())?.reviews;
const byName = cands.find((c) => c.title === 'California Dermatology Institute')?.reviews;
if (byCid !== 6) fail(`CID match returned ${byCid}, expected 6 (the Culver City listing).`);
if (byName === 6) fail('fixture broken: name matching should reproduce the WRONG answer.');
ok(`behavioural: CID → ${byCid} (correct) · name → ${byName} (a different business)`);

console.log('✅ review fallback is CID-matched; it can never borrow another business\'s reviews.');
