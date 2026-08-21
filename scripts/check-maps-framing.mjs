#!/usr/bin/env node
/**
 * check-maps-framing.mjs — the Maps card must be CENTRED and the detail panel TOP-ALIGNED.
 *
 * ─── WHY (2026-08-21, both caught by Chris watching a finished video) ────────────────────────────
 *
 * 1. "blue box too low not centered"
 *    The highlight ring was centred with `scrollIntoView({ block:'center', behavior:'smooth' })`.
 *    `smooth` is an ANIMATION: the recorder starts capturing before it lands, so the frames show the
 *    card wherever it happened to be. On California Dermatology Institute (rank #4, last in the visible
 *    list) that meant jammed against the bottom edge with the ring clipped.
 *
 *    🔑 This is the SAME root cause as the black outline in the same function — a CSS animation still
 *    in flight when the frame is taken (feedback_video_creation_correctness_locked). The rule that
 *    generalises: NOTHING THAT AFFECTS WHAT A FRAME LOOKS LIKE MAY BE ANIMATED.
 *
 * 2. "the card detail pull out scrolls down so you cannot see the image"
 *    `settleDetailPanel` settled OPACITY but never scroll position, so a panel Maps opened already
 *    scrolled down recorded with the business hero photo out of frame.
 *
 * ⚠️ The website/mobile scroll-throughs are DELIBERATELY smooth — that animation is the point of the
 * footage, and each is followed by a settle sleep. This guard protects them from an over-eager "remove
 * all smooth scrolling" fix, which is exactly the kind of correction that breaks a working feature
 * while fixing an unrelated one.
 *
 * Exit 0 = healthy, 1 = regression.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER = path.dirname(HERE);
const REC = path.join(SCRAPER, 'step-3-video-recorder.mjs');

const fail = (m) => { console.error(`✗ FATAL: ${m}`); process.exit(1); };
const ok = (m) => console.log(`  ✓ ${m}`);

if (!fs.existsSync(REC)) fail('step-3-video-recorder.mjs not found.');
const src = fs.readFileSync(REC, 'utf8');
const lines = src.split('\n');

// ── 1. The CARD centring must be instant ─────────────────────────────────────────────────────────
const centreLines = lines
  .map((l, i) => ({ l, n: i + 1 }))
  .filter(({ l }) => /match\.scrollIntoView\s*\(/.test(l) && !/^\s*(\/\/|\*)/.test(l));

if (!centreLines.length) fail('the matched Maps card is never scrolled into view — it may be off-screen entirely.');
for (const { l, n } of centreLines) {
  if (/behavior\s*:\s*['"]smooth['"]/.test(l)) {
    fail(`line ${n}: the card is centred with behavior:'smooth'. That animation is still running when\n` +
         `         recording starts, so the card is captured wherever it was — bottom-edge and clipped\n` +
         `         for any low-ranked lead. Use 'instant'.`);
  }
}
if (!/behavior:\s*['"]instant['"]/.test(src)) {
  fail('no instant scrollIntoView found for the Maps card.');
}
ok('Maps card is centred instantly, never with a smooth animation');

// ── 2. Centring must be RE-APPLIED — Maps re-renders the result list ─────────────────────────────
if (!/setInterval\(\s*\(\)\s*=>\s*\{[^}]*centreCard\(\)/s.test(src)) {
  fail('the card is centred once but not re-centred in the reapply loop. Maps re-renders the result\n' +
       '         list mid-recording and scrolls it back, which is why the outline already needed a\n' +
       '         250ms reapply — the scroll position needs exactly the same treatment.');
}
ok('centring is re-applied alongside the outline (survives Maps re-renders)');

// ── 3. The DETAIL PANEL must be top-aligned in settleDetailPanel ─────────────────────────────────
const sdIdx = src.indexOf('async function settleDetailPanel');
if (sdIdx === -1) fail('settleDetailPanel is gone.');
const sdEnd = src.indexOf('\nasync function', sdIdx + 10);
const sdRaw = src.slice(sdIdx, sdEnd === -1 ? sdIdx + 4000 : sdEnd);
// 🔴 STRIP COMMENTS BEFORE MATCHING. The first version of this check passed a sabotage that deleted
// the real `el.scrollTop = 0` — because the explanatory comment above it contains the literal text
// "scrollTop=0", so the regex matched prose instead of code. That is the same comment-anchoring trap
// that made check-rebuild-csv-fallback.mjs fail on correct code earlier the same day. A static check
// must only ever look at CODE.
const sdBody = sdRaw
  .replace(/\/\*[\s\S]*?\*\//g, '')      // block comments
  .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');   // line comments
if (!/\.scrollTop\s*=\s*0/.test(sdBody)) {
  fail('settleDetailPanel never top-aligns the panel. A panel Maps opens already scrolled down records\n' +
       '         with the business hero photo out of frame — "you cannot see the image".');
}
if (!/setInterval/.test(sdBody)) {
  fail('the top-align is one-shot. Maps re-renders the panel after first paint and scrolls it back, so\n' +
       '         a single scrollTop=0 loses the race — it must be held for a beat.');
}
ok('detail panel is top-aligned and held against Maps re-renders');

// ── 4. The website/mobile scroll-throughs must STAY smooth ───────────────────────────────────────
// Encoded deliberately: that animation IS the footage. A future "kill all smooth scrolling" edit would
// silently turn the site walkthrough into a jump-cut.
const walkthrough = lines.filter((l) => /window\.scrollTo\(\{[^}]*behavior:\s*['"]smooth['"]/.test(l));
if (walkthrough.length < 2) {
  fail(`the website/mobile scroll-throughs are no longer smooth (${walkthrough.length} found, expected >=2).\n` +
       `         Those animations are the POINT of that footage — only the Maps card framing must be\n` +
       `         instant. Do not "fix" them.`);
}
ok(`website/mobile scroll-throughs remain smooth (${walkthrough.length} sites) — deliberate`);

console.log('✅ Maps framing: card centred instantly + re-centred, panel top-aligned, walkthroughs untouched.');
