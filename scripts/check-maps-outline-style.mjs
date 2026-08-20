#!/usr/bin/env node
/**
 * check-maps-outline-style.mjs — the Maps card highlight must stay RGA BLUE and must never be clipped.
 * (2026-08-20)
 *
 * THE REGRESSION THIS CATCHES
 * step-3 highlights the prospect's Maps card so it pops in the recording. It used to set a plain inline
 * style:
 *     match.style.outline = '4px solid #2f57eb'
 *
 * An inline style still LOSES to a stylesheet rule marked `!important`. Google Maps changed their CSS and
 * started winning the outline-color cascade, at which point CSS falls back to `currentColor` — which on a
 * Maps result card is their near-black body text (#202124). The highlight silently rendered BLACK.
 *
 * Nothing in our code changed, so nothing in our code could have flagged it. It was found only by
 * extracting a frame from an 08-19 video and comparing it against an older one. That is why this guard
 * tests the CASCADE rather than the source line: the failure lives in a stylesheet we do not control.
 *
 * Second regression, same fix site: `outline` paints OUTSIDE the element box, and a POSITIVE
 * outline-offset pushes it further out. When the matched card cannot be centred (it is the first result
 * in the visible list, so scrollIntoView has nothing above it to scroll against), that outer ring lands
 * past the scroll container's edge and gets clipped — visually cutting the business name in half. A
 * NEGATIVE offset draws the ring inside the card's own bounds, where it can never be clipped.
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

// 1. STATIC: the recorder must use setProperty(...,'important') and a negative offset.
const src = fs.readFileSync(path.join(ROOT, 'step-3-video-recorder.mjs'), 'utf8');
if (!/setProperty\(\s*'outline'\s*,\s*'4px solid #2f57eb'\s*,\s*'important'\s*\)/.test(src)) {
  fail.push("step-3 must set the outline via setProperty(...,'important') — a plain inline style loses to a stylesheet !important and falls back to black");
}
if (!/setProperty\(\s*'outline-offset'\s*,\s*'-\d+px'\s*,\s*'important'\s*\)/.test(src)) {
  fail.push('step-3 must use a NEGATIVE outline-offset — a positive one paints outside the card and is clipped when the card cannot be centred');
}

// 2. BEHAVIOURAL: prove it against a stylesheet that tries to win, the way Maps now does.
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setContent(`<style>
    .card { outline-color: currentColor !important; color: #202124; padding: 12px; }
  </style><div class="card" id="c">The Pod Photography</div>`);
  const r = await page.evaluate(() => {
    const el = document.getElementById('c');
    const out = {};
    el.style.outline = '4px solid #2f57eb';
    el.style.outlineOffset = '2px';
    out.plain = getComputedStyle(el).outlineColor;
    el.style.removeProperty('outline'); el.style.removeProperty('outline-offset');
    el.style.setProperty('outline', '4px solid #2f57eb', 'important');
    el.style.setProperty('outline-offset', '-4px', 'important');
    out.important = getComputedStyle(el).outlineColor;
    out.offset = getComputedStyle(el).outlineOffset;
    return out;
  });
  // Sensor self-test: if a plain inline style ALSO survives here, this fixture no longer reproduces the
  // cascade we are guarding against, so a pass would mean nothing. Fail loudly instead of passing.
  if (r.plain === BLUE) {
    fail.push('fixture no longer reproduces the override (plain inline stayed blue) — this guard would pass vacuously');
  }
  if (r.important !== BLUE) fail.push(`inline !important did NOT hold the brand blue (got ${r.important})`);
  if (!String(r.offset).startsWith('-')) fail.push(`outline-offset is not inset (got ${r.offset})`);
} finally {
  await browser.close();
}

if (fail.length) {
  console.error('✗ Maps card highlight regression:');
  for (const f of fail) console.error(`   - ${f}`);
  process.exit(1);
}
console.log('✓ Maps card highlight stays RGA blue under an !important override, and is inset (unclippable)');
