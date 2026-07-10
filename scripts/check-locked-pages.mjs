#!/usr/bin/env node
/**
 * HARD LOCK GUARD (locked 2026-07-07) — fail LOUDLY if any Chris-approved page regressed (lost its
 * design markers). Wired into drip-content.sh BEFORE the deploy step, so an auto-generator that
 * reverts a locked page can NEVER ship it. This exists because on 2026-07-07 the nightly drip's
 * buildHub() reverted the industries hub from a stale template. See [[project-locked-pages-guard]].
 *
 * Run manually anytime:  node scripts/check-locked-pages.mjs
 * Exit 0 = all good. Exit 1 = a locked page regressed (details printed) — deploy must abort.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SCRAPER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(path.dirname(SCRAPER_DIR), 'Rocket Growth Agency Website VS Code');

// Pinned pages → substrings that MUST all be present (design + chrome markers).
const LOCKS = {
  'index.html': ['footer-address', 'style.css?v=20260710a', 'class="promo-bar"', '"streetAddress"'],
  'pricing/index.html': ['footer-address', 'style.css?v=20260710a', 'class="promo-bar"'],
  'contact/index.html': ['footer-address', 'contact-card', 'form-trust'],
  'start-growth-plan/index.html': ['gp-hero', 'footer-address', 'form-trust'],
  'free-growth-audit/index.html': ['form-trust', 'footer-address'],
  'privacy/index.html': ['lg-hero', 'lg-toc', '9937 Jefferson', 'footer-address'],
  'terms/index.html': ['lg-hero', 'lg-toc', '9937 Jefferson'],
  'industries/index.html': ['ih-hero', 'ind-cat-icon', 'ind-cat-name', 'style.css?v=20260710a'],
  'blog/index.html': ['bloghub-grid', 'bloghub-filters', 'bc-card'],
  'process/index.html': ['footer-address', 'style.css?v=20260710a'],
  'faq/index.html': ['footer-address', 'style.css?v=20260710a', 'faq-redesign', 'faq-layout', 'faq-help'],
  'services/index.html': ['footer-address', 'style.css?v=20260710a'],
};

// Directory rules: EVERY <dir>/<slug>/index.html (except skips) must contain ALL markers.
const GLOBS = [
  { dir: 'industries', skip: ['index.html'], markers: ['ix-hero', 'footer-address', 'scrollRestoration'] },  // redesign + address + open-at-top
  { dir: 'blog', skip: ['index.html'], markers: ['blog-redesign', 'footer-address', 'scrollRestoration'] },   // reading-experience + address + open-at-top
];

const failures = [];
function check(rel, markers) {
  const f = path.join(WEB, rel);
  if (!fs.existsSync(f)) { failures.push(`${rel} — MISSING FILE`); return; }
  const s = fs.readFileSync(f, 'utf8');
  const miss = markers.filter((m) => !s.includes(m));
  if (miss.length) failures.push(`${rel} — missing: ${miss.join(' | ')}`);
}

for (const [rel, markers] of Object.entries(LOCKS)) check(rel, markers);
for (const g of GLOBS) {
  const base = path.join(WEB, g.dir);
  if (!fs.existsSync(base)) continue;
  for (const d of fs.readdirSync(base)) {
    if (g.skip.includes(d)) continue;
    if (fs.existsSync(path.join(base, d, 'index.html'))) check(path.join(g.dir, d, 'index.html'), g.markers);
  }
}

if (failures.length) {
  console.error(`\n❌ LOCKED-PAGE REGRESSION — ${failures.length} page(s) lost approved markers:`);
  failures.forEach((f) => console.error('   • ' + f));
  console.error('\nDEPLOY BLOCKED. A locked/approved page reverted. Fix the page (and the generator that');
  console.error('rebuilt it) before deploying. See memory: project_locked_pages_guard.\n');
  process.exit(1);
}
const globCount = GLOBS.reduce((n, g) => {
  const b = path.join(WEB, g.dir); if (!fs.existsSync(b)) return n;
  return n + fs.readdirSync(b).filter((d) => !g.skip.includes(d) && fs.existsSync(path.join(b, d, 'index.html'))).length;
}, 0);
console.log(`✅ locked-page guard PASS — ${Object.keys(LOCKS).length} pinned pages + ${globCount} detail/post pages all intact.`);
