#!/usr/bin/env node
/**
 * check-audio-budget-trim.mjs — an over-long script must be SHORTENED, not failed after the spend.
 *
 * ─── WHY (2026-08-21) ────────────────────────────────────────────────────────────────────────────
 * step-6 caps combined audio at 165s, but the check ran AFTER every segment had been sent to OpenAI
 * TTS and concatenated. An over-long script therefore cost the full API spend and then killed the lead.
 *
 * Measured across recent logs: **16 leads lost this way — 165.3s min, 169.2s median, 174.4s max.**
 * Every one was barely over, and every one was recoverable by dropping a single finding.
 * William J. Wickwire, MD failed at 170.81s while three other Dermatologists videos shipped fine.
 *
 * The fix is a pre-TTS budget trim: estimate duration from word count, and drop the last numbered
 * finding from the longest section until the projection fits.
 *
 * INVARIANTS
 *  1. The trim exists and runs BEFORE the TTS spend (i.e. before the script is returned for synthesis).
 *  2. It never trims INTRO or OUTRO — the intro is length-locked at 13–15s
 *     (feedback_intro_voiceover_13_15_seconds) and the outro carries the CTA.
 *  3. It is bounded — a runaway loop must not strip a section to nothing.
 *  4. The hard 165s guardrail SURVIVES as a backstop. The trim is an estimate; if it is ever wrong the
 *     real measured duration must still stop a 3-minute video shipping.
 *
 * Exit 0 = healthy, 1 = regression.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER = path.dirname(HERE);
const STEP6 = path.join(SCRAPER, 'step-6-voiceover.mjs');

const fail = (m) => { console.error(`✗ FATAL: ${m}`); process.exit(1); };
const ok = (m) => console.log(`  ✓ ${m}`);

if (!fs.existsSync(STEP6)) fail('step-6-voiceover.mjs not found.');
const src = fs.readFileSync(STEP6, 'utf8');

// 1. EXISTS, and before the synthesis path.
const trimIdx = src.indexOf('budget-trim');
if (trimIdx === -1) {
  fail('no pre-TTS budget trim. An over-long script will cost the full OpenAI TTS spend and then fail\n' +
       '         the lead — 16 leads were lost that way before 2026-08-21.');
}
const hardIdx = src.indexOf('Combined audio is');
if (hardIdx === -1) fail('the hard 165s guardrail is gone — nothing would stop a 3-minute video shipping.');
if (!(trimIdx < hardIdx)) {
  fail('the budget trim runs AFTER the hard guardrail. It must shorten the script BEFORE synthesis,\n' +
       '         otherwise the spend is already made and the lead still dies.');
}
ok('pre-TTS budget trim exists and precedes the hard guardrail');

// 4. The backstop must remain a THROW, not a warning.
const hardBlock = src.slice(hardIdx - 400, hardIdx + 400);
if (!/throw new Error/.test(hardBlock)) {
  fail('the 165s guardrail no longer throws. The trim is an ESTIMATE; the measured duration is the only\n' +
       '         thing that can prove a video is short enough, so it must still fail closed.');
}
ok('hard 165s guardrail retained as a measured backstop');

// 2. Intro/outro must be excluded from trimming.
const trimBlock = src.slice(trimIdx - 2200, trimIdx + 2600);
const segSet = trimBlock.match(/\[\s*['"]maps['"]\s*,\s*['"]website['"]\s*,\s*['"]mobile['"]\s*\]/);
if (!segSet) {
  fail('the trim does not operate on exactly [maps, website, mobile]. Trimming the intro breaks its\n' +
       '         locked 13–15s window; trimming the outro drops the call to action.');
}
if (/dropLastFinding\(\s*intro\s*\)|dropLastFinding\(\s*outroText\s*\)/.test(trimBlock)) {
  fail('the trim touches intro or outro — both are off-limits.');
}
ok('trims only maps/website/mobile — never intro or outro');

// 3. Bounded.
if (!/trims\s*<\s*\d+/.test(trimBlock)) {
  fail('the trim loop has no iteration bound. An unbounded loop could strip every finding, leaving a\n' +
       '         section that reads as broken to the prospect.');
}
if (!/if \(!trimmed\) break;/.test(trimBlock)) {
  fail('the trim does not stop when a section has nothing left to shed — it must leave at least the\n' +
       '         first finding and defer to the hard guardrail.');
}
ok('trim loop is bounded and preserves each section\'s first finding');

// ── BEHAVIOURAL — the trim arithmetic must actually converge ─────────────────────────────────────
// Replays the documented Wickwire failure shape (intro 14.5s, maps 46.3s, website 46.2s, mobile 39.8s,
// outro 24.0s = 170.81s) through the same rules and asserts it lands under budget.
const WPS = 3.5, BUDGET = 165, SAFETY = 5;
const wc = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;
const est = (s) => wc(s) / WPS;
const mk = (sec, n) => {
  const words = Math.max(n * 3, Math.round(sec * 3.66));
  const per = Math.max(1, Math.floor(words / n));
  const labels = ['First', 'Second', 'Third'];
  let s = 'Base line.';
  for (let i = 0; i < n; i++) s += ` ${labels[i]}: ${'word '.repeat(per).trim()}.`;
  return s;
};
const intro = mk(14.5, 1), outro = mk(24.0, 1);
const seg = { maps: mk(46.3, 3), website: mk(46.2, 3), mobile: mk(39.8, 3) };
const fixed = est(intro) + est(outro);
const total = () => fixed + est(seg.maps) + est(seg.website) + est(seg.mobile);
const before = total();
if (before <= BUDGET) fail('behavioural fixture is not over budget — the test would pass vacuously.');
const drop = (s) => {
  for (const l of ['Third', 'Second']) { const i = s.lastIndexOf(` ${l}: `); if (i > -1) return s.slice(0, i).trimEnd(); }
  return null;
};
let t = 0;
while (total() > BUDGET - SAFETY && t < 6) {
  const longest = ['maps', 'website', 'mobile'].sort((a, b) => est(seg[b]) - est(seg[a]))[0];
  const nx = drop(seg[longest]);
  if (!nx) break;
  seg[longest] = nx; t++;
}
if (total() > BUDGET) fail(`trim did not converge: ${before.toFixed(1)}s → ${total().toFixed(1)}s after ${t} trim(s).`);
for (const k of ['maps', 'website', 'mobile']) {
  if (!/First: /.test(seg[k])) fail(`section "${k}" lost its first finding — a section with no finding reads as broken.`);
}
ok(`behavioural: ${before.toFixed(1)}s → ${total().toFixed(1)}s in ${t} trim(s), every section keeps a finding`);

// ── 5. The intro advisory must track SECONDS, and the hard word cap must survive ─────────────────
// The old advisory fired whenever the intro exceeded a 48-word target + 4. Measured across 188 real
// intros: min 53, median 53, max 54 — so it fired on EVERY lead, every run. A warning that is always
// on is a warning nobody reads. The locked rule is 13–15 SECONDS, and 53 words ≈ 14.5s is inside it.
if (!/INTRO_MAX_WORDS/.test(src) || !/introWordCount > INTRO_MAX_WORDS/.test(src)) {
  fail('the hard intro word cap (INTRO_MAX_WORDS ≈ 16s) is gone. Re-tuning the ADVISORY must never\n' +
       '         remove the guardrail that actually throws.');
}
const introThrow = src.slice(src.indexOf('introWordCount > INTRO_MAX_WORDS'), src.indexOf('introWordCount > INTRO_MAX_WORDS') + 400);
if (!/throw new Error/.test(introThrow)) fail('the intro word cap no longer throws.');
// 🔴 Anchor on the CONDITION, not the identifier. A first version checked only that "introEstSec"
// appeared somewhere in the file — and a sabotage that reverted the `if` to the word-count proxy still
// passed, because the identifier survived inside the warning's message string. Assert the comparison
// that actually decides whether the warning fires.
if (!/if\s*\(\s*introEstSec\s*<\s*INTRO_MIN_SEC\s*\|\|\s*introEstSec\s*>\s*INTRO_MAX_SEC\s*\)/.test(src)) {
  fail('the intro advisory condition is not duration-based. A word-count advisory fired on 188 of 188\n' +
       '         real intros, which trains everyone to ignore it — and it cannot detect an intro that\n' +
       '         drifts SHORT, only long.');
}
ok('intro advisory is duration-based; hard word cap still throws');

console.log('✅ audio budget: trims before the spend, bounded, intro/outro safe, hard cap retained.');
