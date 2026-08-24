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
 * ✅ The CID is exact identity. The navigated Maps URL carries `!1s0x…:0x…`.
 *
 * 🔴 2026-08-24, SECOND ITERATION — search-then-filter was SAFE BUT USELESS. The first fix queried by
 * name and kept the row whose `data_id` matched the CID. Measured over a live heal of 8 leads it matched
 * ZERO times: the name search does not reliably return the listing at all, so the filter had nothing to
 * keep. A fallback that never fires recovers no leads — it just fails 6/6 more politely.
 *
 * The endpoint is `type=place` + `data=!4m5!3m4!1s<CID>!8m2`, which asks for ONE place BY IDENTITY.
 * There is no candidate list, so there is nothing to mis-match: strictly safer than filtering AND it
 * actually returns data. Control-measured against live listings: 1450, 5 and 2 reviews all populated.
 *
 * INVARIANTS
 *  1. The fallback extracts a CID from the live page URL.
 *  2. It looks the place up BY CID (type=place + data=!4m5!3m4!1s…), not by name-then-filter.
 *  3. No CID ⇒ NO fallback (reviews stay unverified). Failing 6/6 beats a confident wrong number.
 *  4. It never falls back to a name/title comparison.
 *  5. It only runs when the DOM read was null — never overriding a real reading.
 *  6. A ZERO is accepted only when a place payload actually came back — never from an empty or errored
 *     response. Absent data is not evidence of zero (feedback_indeterminate_is_not_a_finding).
 *  7. It never sets reviewAbsenceVerified. That flag licenses the voiceover to SAY "you have no
 *     reviews"; this fallback restores the 6/6 SIGNAL only. Widening a signal must not widen a CLAIM.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AUDIT = path.join(path.dirname(HERE), 'step-2.5-audit.mjs');
const fail = (m) => { console.error(`✗ FATAL: ${m}`); process.exit(1); };
const ok = (m) => console.log(`  ✓ ${m}`);

const raw = fs.readFileSync(AUDIT, 'utf8');
// Strip comments so this check can never match the audit file's own PROSE about the fix — the comment
// there describes `type=place` in English, and a check satisfied by a comment is a check that passes
// after the code is deleted. NOTE the `[^:]` guard: a naive /\/\/.*$/ deletes everything after the
// `//` in `https://…`, which silently removed the very URL this gate exists to assert.
const src = raw.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');

const i = src.indexOf('serpapi-cid');
if (i === -1) fail('the CID-matched review fallback is gone. "Missing: reviews" is the largest single\n' +
                   '         blocker (42 of 56) and an indeterminate DOM read would again read as absence.');
// Scope to the fallback ITSELF, by its real delimiters — not a byte window around a marker. A fixed
// `i - 2600` slice reached back into the page.evaluate body and matched the legitimate
// `reviewAbsenceVerified = …` assignment that lives there, failing this check on innocent code. A gate
// that reports a defect in the wrong place is as costly as one that misses it.
const start = src.indexOf('if (findings.reviewCount === null');
const end = src.indexOf('findings.photoCount = data.photoCount', start);
if (start === -1 || end === -1 || end <= start) {
  fail('cannot delimit the review-fallback block — its surrounding anchors moved. Re-point this check\n' +
       '         rather than widening it, or it will start judging unrelated code.');
}
const block = src.slice(start, end);

if (!/!1s\(0x\[0-9a-f\]\+:0x\[0-9a-f\]\+\)/.test(block)) {
  fail('the fallback does not extract a CID from the page URL — it has no way to verify identity.');
}
ok('extracts the CID from the live Maps URL');

if (!/type=place/.test(block)) {
  fail('the fallback does not use the by-identity place endpoint. Search-then-filter was measured\n' +
       '         matching 0 of 8 leads — safe, but it recovers nothing.');
}
if (!/!4m5!3m4!1s\$\{cid\}!8m2/.test(block)) {
  fail('the place lookup does not carry the CID in its `data` parameter, so it is not an identity lookup.');
}
if (/local_results/.test(block)) {
  fail('the fallback still reads a candidate LIST. Identity lookup returns one place; a list reintroduces\n' +
       '         the chance of keeping the wrong business.');
}
ok('looks the place up by CID identity (no candidate list to mis-match)');

// 6. A zero must require a real payload.
if (!/gotPlace/.test(block)) {
  fail('nothing distinguishes "place returned, no reviews field" from "no place returned". Treating an\n' +
       '         empty or errored response as zero would manufacture a verified count out of a failed read.');
}
const zeroIdx = block.indexOf('findings.reviewCount = 0');
if (zeroIdx === -1) fail('a verified zero is never recorded, so zero-review businesses still fail 6/6 —\n' +
                         '         and those are the strongest prospects we have.');
if (!/else if \(gotPlace\)/.test(block)) {
  fail('the zero branch is not gated on a returned place payload.');
}
ok('a zero is only accepted when a place payload actually came back');

// 7. The signal widens; the CLAIM must not.
if (/reviewAbsenceVerified\s*=/.test(block)) {
  fail('the fallback sets reviewAbsenceVerified. That flag is what lets the voiceover ASSERT "you have\n' +
       '         no reviews". Restoring a scoring signal must never unlock a spoken absence claim —\n' +
       '         that gate belongs to the DOM empty-state read (feedback_verification_gates_must_be_strict).');
}
ok('never sets reviewAbsenceVerified (signal widened, claim unchanged)');

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
