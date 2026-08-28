#!/usr/bin/env node
/**
 * check-nav-breakpoint.mjs — the desktop nav must never be shown at a width where it does not fit.
 *
 * ─── WHY (2026-08-28) ────────────────────────────────────────────────────────────────────────────
 * The header nav collided with the "Free Growth Audit" button: below ~1210px the last link
 * ("Contact") overflows the nav pill and slides UNDER the CTA, rendering both on top of each other.
 * The hamburger only took over at 1120px, leaving an ~85px band of visibly broken header on the
 * homepage and every other page that shares it.
 *
 * 🔑 THE MEASUREMENT TRAP, because it is what made this easy to miss:
 * the nav CONTAINER keeps a healthy ~22px gap from the CTA all the way down. Measuring the container
 * says everything is fine at every width. It is the LAST LINK that overflows — its right edge freezes
 * while the container keeps shrinking.
 *
 *     1240px  gap +29  clean          1205px  gap +19  3px past the pill
 *     1210px  gap +24  clean  ← last  1160px  gap -26  OVERLAPPING
 *
 * So the hamburger threshold must stay at or above 1210px. This is a STATIC check of that number —
 * no browser, no network, instant — so it can run pre-flight. Re-measure with a headless probe if the
 * nav's contents ever change (a 7th link would push the failure width higher).
 *
 * Exit 0 = threshold safe · 1 = the nav is shown at a width where it overflows.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER = path.dirname(HERE);
const CSS = path.join(path.dirname(SCRAPER), 'Rocket Growth Agency Website VS Code', 'style.css');

// The widest width at which the nav was MEASURED to overflow. The hamburger must engage at or above
// this, or the broken band reopens.
const MIN_SAFE_BREAKPOINT = 1210;

const fail = (m) => { console.error(`✗ FATAL: ${m}`); process.exit(1); };
if (!fs.existsSync(CSS)) fail(`style.css not found at ${CSS}`);
const css = fs.readFileSync(CSS, 'utf8');

// Find every media query that hides .desktop-nav, and take the LARGEST max-width among them — that is
// the width at which the hamburger actually takes over.
const thresholds = [];
const re = /@media\s*\(\s*width\s*<=\s*(\d+)px\s*\)\s*\{/g;
let m;
while ((m = re.exec(css)) !== null) {
  const start = m.index + m[0].length - 1;
  let depth = 0, end = start;
  for (let i = start; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const block = css.slice(start, end);
  if (/\.desktop-nav\s*\{[^}]*display:\s*none/.test(block)) thresholds.push(Number(m[1]));
}

if (!thresholds.length) {
  fail('no media query hides .desktop-nav at all — either the selector was renamed or the hamburger\n' +
       '         breakpoint was deleted. Refusing to pass: the nav would render at every width.');
}

const hides = Math.max(...thresholds);
console.log(`\n===== HEADER NAV BREAKPOINT =====`);
console.log(`  hamburger takes over at   <= ${hides}px`);
console.log(`  nav measured to overflow  <  ${MIN_SAFE_BREAKPOINT}px`);

if (hides < MIN_SAFE_BREAKPOINT) {
  fail(`the desktop nav is shown between ${hides + 1}px and ${MIN_SAFE_BREAKPOINT}px, where "Contact"\n` +
       `         overflows the nav pill and renders UNDERNEATH the Free Growth Audit button.\n` +
       `         Raise the hamburger media query to (width <= ${MIN_SAFE_BREAKPOINT}px) or higher.\n` +
       `         Do NOT "fix" it by shrinking the nav — the pill is part of the locked header design.`);
}
console.log(`\n✅ the nav is only shown at widths where it fits.`);
