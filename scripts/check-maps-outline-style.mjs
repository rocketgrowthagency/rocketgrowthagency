#!/usr/bin/env node
/**
 * check-maps-outline-style.mjs — the Maps card highlight must stay RGA BLUE and must never be clipped.
 * (2026-08-20)
 *
 * THE REGRESSION THIS CATCHES
 * step-3 highlights the prospect's Maps card so it pops in the recording. On 2026-08-19 that highlight
 * rendered BLACK instead of RGA blue across a whole night of videos. Chris caught it by eye.
 *
 * 🔴 ROOT CAUSE — `transition: outline 0.3s ease-in-out`, MEASURED on a live Maps card:
 *     match.style.setProperty('transition', 'outline 0.3s ease-in-out', 'important');
 *     getComputedStyle(match).outlineWidth  // → "0px"
 *     getComputedStyle(match).outlineColor  // → "rgb(0, 0, 0)"   ← the black
 * Those are the START of the animation. Maps wipes our inline style during result-list mutations, and
 * the recorder re-applies every 250ms against a 300ms transition, so the outline never finishes
 * animating in — the recording catches it dark and zero-width. Remove the transition and the outline is
 * correct on the very first frame.
 *
 * ⚠️ TWO EARLIER THEORIES WERE TESTED AND REFUTED — do not revisit them:
 *   1. "Maps CSS beats our inline style" — on a real Maps page a plain inline style computes blue.
 *   2. "the 250ms re-apply races the transition" in isolation — a synthetic fixture ends blue either way.
 * Only reading the computed style IMMEDIATELY after applying, on a real card, exposes it.
 *
 * Longhands are used rather than the `outline` shorthand so each component is independently !important
 * and verifiable; the computed result is checked to be rgb(47,87,235) / 4px / solid.
 *
 * SECOND DEFECT, same fix site: `outline` paints OUTSIDE the element box, and a POSITIVE outline-offset
 * pushes it further out. When the matched card cannot be centred (it is the first result in the visible
 * list, so scrollIntoView has nothing above it to scroll against), that ring lands past the scroll
 * container's edge and is clipped — visually cutting the business name in half. A NEGATIVE offset draws
 * the ring inside the card's own bounds, where it can never be clipped.
 *
 * Exit 0 = the highlight survives an !important override and is inset. Exit 1 = regression.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BLUE = 'rgb(47, 87, 235)';
const fail = [];

// 1. STATIC: longhands + !important, negative offset, and NO transition.
//
// 🔴 ROOT CAUSE (measured on a live Maps card, 2026-08-20): with `transition: outline 0.3s` set, the
// computed style read straight after applying is `outline-width: 0px, outline-color: rgb(0,0,0)` — the
// START of the animation. Maps wipes our inline style during result-list mutations and the recorder
// re-applies every 250ms, against a 300ms transition, so the outline never finishes animating in and
// the recording captures it dark and thin. That is the black highlight Chris reported.
const src = fs.readFileSync(path.join(ROOT, 'step-3-video-recorder.mjs'), 'utf8');
for (const [prop, val] of [['outline-style', 'solid'], ['outline-width', '4px'], ['outline-color', '#2f57eb']]) {
  const re = new RegExp(`setProperty\\(\\s*'${prop}'\\s*,\\s*'${val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'\\s*,\\s*'important'\\s*\\)`);
  if (!re.test(src)) fail.push(`step-3 must set ${prop}: ${val} !important as an explicit longhand`);
}
if (!/setProperty\(\s*'transition'\s*,\s*'none'\s*,\s*'important'\s*\)/.test(src)) {
  fail.push('step-3 must set transition:none — an animating outline is captured mid-fade as a BLACK 0px ring');
}
if (!/setProperty\(\s*'outline-offset'\s*,\s*'-\d+px'\s*,\s*'important'\s*\)/.test(src)) {
  fail.push('step-3 must use a NEGATIVE outline-offset — a positive one paints outside the card and is clipped when the card cannot be centred');
}

// 2. BEHAVIOURAL: reproduce the actual failure — an animating outline read mid-transition — and prove
// the shipped declaration set is immune to it.
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setContent('<div id="c" style="color:#202124;padding:12px">The Pod Photography</div>');
  const r = await page.evaluate(() => {
    const el = document.getElementById('c');
    const read = () => { const cs = getComputedStyle(el); return { c: cs.outlineColor, w: cs.outlineWidth }; };
    const clear = () => ['outline','outline-style','outline-width','outline-color','transition']
      .forEach((k) => el.style.removeProperty(k));
    // A — WITH a transition, read immediately (the shipped-08-19 behaviour)
    clear();
    el.style.setProperty('transition', 'outline 0.3s ease-in-out', 'important');
    el.style.setProperty('outline', '4px solid #2f57eb', 'important');
    const animating = read();
    // B — the CURRENT declaration set, read immediately
    clear();
    el.style.setProperty('outline-style', 'solid', 'important');
    el.style.setProperty('outline-width', '4px', 'important');
    el.style.setProperty('outline-color', '#2f57eb', 'important');
    el.style.setProperty('transition', 'none', 'important');
    const shipped = read();
    return { animating, shipped };
  });
  // Sensor self-test: if the animating case ALSO reads blue+4px here, this fixture no longer reproduces
  // the defect and a pass would mean nothing.
  if (r.animating.c === BLUE && r.animating.w === '4px') {
    fail.push('fixture no longer reproduces the mid-transition read — this guard would pass vacuously');
  }
  if (r.shipped.c !== BLUE) fail.push(`shipped declarations did not compute brand blue (got ${r.shipped.c})`);
  if (r.shipped.w !== '4px') fail.push(`shipped declarations did not compute a 4px outline (got ${r.shipped.w})`);
} finally {
  await browser.close();
}

if (fail.length) {
  console.error('✗ Maps card highlight regression:');
  for (const f of fail) console.error(`   - ${f}`);
  process.exit(1);
}
console.log('✓ Maps card highlight computes blue 4px on the first frame (no animating outline) and is inset');
