#!/usr/bin/env node
/**
 * check-step3-output-asserted.mjs — step-3's FILES must be checked, not just its exit code.
 *
 * ─── WHY (2026-08-24) ────────────────────────────────────────────────────────────────────────────
 * step-3 can discard a segment on a hard guardrail and still exit 0:
 *
 *     🚫 [step-3 GUARDRAIL] map centre is 30.4km from Accuracy Plus (limit 25km)
 *     ❌ Maps segment failed a hard guardrail — discarded
 *     → Website (desktop view): … ✓ Saved
 *
 * The guardrail is CORRECT (feedback_map_must_be_centred_on_business). The bug is what happened next:
 * the runner saw exit 0, spent a FULL OpenAI voiceover, and then failed two stages later with
 *
 *     "No desktop/mobile pairs found to combine"  →  ledger reason: step-4-combine-desktop-mobile
 *
 * — a message that names the wrong stage entirely. **17 ledger entries over three nights were this**,
 * each one a wasted TTS spend and a misattributed cause. Chasing "step-4-combine" as a failure class
 * was chasing a symptom; it is a MASK for step-3 producing no maps segment.
 *
 * 🔑 An exit code is a CLAIM. The files are the FACT. Where a stage can partially succeed, assert its
 * output ([[feedback-verify-dont-assume]] · [[feedback-finalize-needs-positive-proof]]).
 *
 * INVARIANTS
 *  1. The runner asserts a MAPS webm exists after step-3.
 *  2. That assertion runs BEFORE step-6, so a doomed lead never costs a voiceover.
 *  3. It fails with its own reason (`step-3-no-maps-segment`), not step-4's.
 *  4. The count is read safely (`${n:-0}`) — an empty dir must not make the test throw.
 *
 * Exit 0 = healthy, 1 = regression.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REBUILD = path.join(HERE, 'rebuild-broken-videos.sh');

const fail = (m) => { console.error(`✗ FATAL: ${m}`); process.exit(1); };
const ok = (m) => console.log(`  ✓ ${m}`);

if (!fs.existsSync(REBUILD)) fail('rebuild-broken-videos.sh not found.');
const raw = fs.readFileSync(REBUILD, 'utf8');
// Shell file — strip only `#` comments. (A JS block-comment stripper over a shell script once ate half
// a file because globs contain `/*`.)
const src = raw.split('\n').map((l) => l.replace(/^\s*#.*$/, '')).join('\n');

// 1. The assertion exists.
if (!/step-3-no-maps-segment/.test(src)) {
  fail('no post-step-3 output assertion. step-3 can discard the maps segment and still exit 0, so a\n' +
       '         doomed lead burns a full OpenAI voiceover and then fails as "step-4-combine".');
}
if (!/\*maps\*\.webm/.test(src)) {
  fail('the assertion does not look for a MAPS webm specifically. Maps is the opening of every video —\n' +
       '         website+mobile alone is not buildable.');
}
ok('runner asserts a maps webm exists after step-3');

// 2. It must precede step-6, or the spend already happened.
const iAssert = src.indexOf('step-3-no-maps-segment');
const iVoice = src.indexOf('step-6 voiceover');
if (iVoice === -1) fail('cannot locate the step-6 voiceover call.');
if (!(iAssert < iVoice)) {
  fail('the assertion runs AFTER step-6. The whole point is to fail BEFORE the voiceover spend — 17\n' +
       '         wasted voiceovers over three nights is what prompted this.');
}
ok('assertion precedes the voiceover spend');

// 3. Its own ledger reason, so the cause is not misattributed to step-4 again.
if (!/note_fail "\$SLUG" "step-3-no-maps-segment"/.test(src)) {
  fail('the failure is not recorded under its own reason. Reusing step-4\'s reason is what hid this for\n' +
       '         three nights — the ledger said step-4-combine and the real cause was step-3.');
}
ok('records its own ledger reason (step-3-no-maps-segment)');

// 4. Safe numeric read — the most-repeated bug in this repo.
const block = src.slice(Math.max(0, iAssert - 900), iAssert + 200);
if (/\|\|\s*echo 0/.test(block)) {
  fail('uses `… || echo 0`. On empty output BOTH sides fire and the substitution captures "0\\n0",\n' +
       '         which makes the test throw and the guard fail OPEN.');
}
if (!/_maps_n:-0|_maps_n=\$\{_maps_n:-0\}/.test(block)) {
  fail('the webm count is not defaulted with ${n:-0}; an empty directory would make the test throw.');
}
ok('count read safely with ${n:-0}');

console.log('✅ step-3 output asserted before the voiceover spend, with its own cause.');
