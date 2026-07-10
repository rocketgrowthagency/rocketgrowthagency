#!/usr/bin/env node
/**
 * build-og-cards.mjs — generate the per-page link-preview (OG) images for industry pages, blog posts,
 * and the industries hub, then point each page's og:image/twitter:image at its card.
 *
 * HOW (100% design match): screenshots scripts/og-card-render.html (the APPROVED mockup CSS, verbatim)
 * through real Chrome at 1200x630 @2x — so the output is pixel-identical to the mockup Chris approved,
 * with the same Inter webfont the live site uses. Static .jpg written to the Website repo
 * images/assets/og/, committed + deployed like the existing og-image.jpg. Approved 2026-07-10.
 *
 * Usage:
 *   node scripts/build-og-cards.mjs --all                 # backfill every industry + hub + blog post
 *   node scripts/build-og-cards.mjs --industry dentists   # one industry
 *   node scripts/build-og-cards.mjs --blog <slug>         # one blog post
 *   node scripts/build-og-cards.mjs --hub
 *   add --dry to render images WITHOUT rewriting any page meta.
 *
 * Run AFTER any overnight video batch (fresh headless Chrome; won't touch the headed Maps capture).
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRAPER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(path.dirname(SCRAPER_DIR), 'Rocket Growth Agency Website VS Code');
const TEMPLATE = 'file://' + path.join(SCRAPER_DIR, 'scripts', 'og-card-render.html');
const IND_DIR = path.join(WEB, 'industries');
const BLOG_DIR = path.join(WEB, 'blog');
const OUT_DIR = path.join(WEB, 'images', 'assets', 'og');
const BASE = 'https://www.rocketgrowthagency.com/images/assets/og';
const STAMP = new Date().toISOString().slice(0, 10).replace(/-/g, '');   // e.g. 20260710 — cache-bust

const ARGS = process.argv.slice(2);
const has = (f) => ARGS.includes(f);
const val = (f) => { const i = ARGS.indexOf(f); return i >= 0 ? ARGS[i + 1] : null; };
const DRY = has('--dry');

// nicer "#1" label for the Maps panel (matches the approved mock); default "Your Business".
const WIN = {
  dentists: 'Your Practice', orthodontists: 'Your Practice', 'plastic-surgeons': 'Your Practice',
  lawyers: 'Your Firm', 'dui-lawyers': 'Your Firm', 'family-lawyers': 'Your Firm', 'personal-injury-lawyers': 'Your Firm',
};
const titleCase = (s) => s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function industryName(slug) {
  try {
    const html = fs.readFileSync(path.join(IND_DIR, slug, 'index.html'), 'utf8');
    const m = html.match(/Industries\s*[•·]\s*([^<]+?)\s*</i);
    if (m) return m[1].trim();
  } catch { /* fall through */ }
  return titleCase(slug);
}
function blogTitle(slug) {
  const html = fs.readFileSync(path.join(BLOG_DIR, slug, 'index.html'), 'utf8');
  const m = html.match(/<title>([^<]*?)\s*\|\s*(?:RGA|Rocket Growth Agency)/i) || html.match(/<title>([^<]*)</i);
  return (m ? m[1] : slug).trim();
}

// Ensure og:image + twitter:image (+ card + width/height) point at imgUrl. INSERTS any that are missing
// (some blog posts had no og:image tag at all), REPLACES any that exist. Returns true if changed.
function patchMeta(pageFile, imgUrl) {
  let s = fs.readFileSync(pageFile, 'utf8');
  const before = s;
  // 1) insert whichever tags are absent, just before </head>.
  const adds = [];
  if (!/property="og:image"/i.test(s)) adds.push(
    `<meta property="og:image" content="${imgUrl}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`);
  if (!/name="twitter:card"/i.test(s)) adds.push(`<meta name="twitter:card" content="summary_large_image" />`);
  if (!/name="twitter:image"/i.test(s)) adds.push(`<meta name="twitter:image" content="${imgUrl}" />`);
  if (adds.length) s = s.replace(/<\/head>/i, '  ' + adds.join('\n  ') + '\n</head>');
  // 2) point any pre-existing tags at the new URL.
  s = s.replace(/(<meta\s+property="og:image"\s+content=")[^"]*(")/i, `$1${imgUrl}$2`);
  s = s.replace(/(<meta\s+name="twitter:image"\s+content=")[^"]*(")/i, `$1${imgUrl}$2`);
  if (/og:image:width/i.test(s)) {
    s = s.replace(/(<meta\s+property="og:image:width"\s+content=")[^"]*(")/i, `$11200$2`)
         .replace(/(<meta\s+property="og:image:height"\s+content=")[^"]*(")/i, `$1630$2`);
  }
  if (s !== before) { fs.writeFileSync(pageFile, s); return true; }
  return false;
}

async function shoot(page, params, outName) {
  const url = TEMPLATE + '?' + new URLSearchParams(params).toString();
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.evaluate(async () => { if (document.fonts && document.fonts.ready) await document.fonts.ready; });
  await new Promise((r) => setTimeout(r, 150));   // settle webfont paint
  const out = path.join(OUT_DIR, outName);
  await page.screenshot({ path: out, type: 'jpeg', quality: 92 });
  return out;
}

function collectTargets() {
  const t = [];
  const wantAll = has('--all');
  if (wantAll || has('--hub')) t.push({ kind: 'hub', slug: 'industries-hub', params: { type: 'hub' }, page: path.join(IND_DIR, 'index.html'), file: 'industries-hub.jpg' });
  const oneInd = val('--industry');
  if (wantAll || oneInd) {
    const slugs = oneInd ? [oneInd] : fs.readdirSync(IND_DIR).filter((d) => d !== 'index.html' && fs.existsSync(path.join(IND_DIR, d, 'index.html')));
    for (const slug of slugs) t.push({ kind: 'industry', slug, params: { type: 'industry', name: industryName(slug), win: WIN[slug] || 'Your Business' }, page: path.join(IND_DIR, slug, 'index.html'), file: `industry-${slug}.jpg` });
  }
  const oneBlog = val('--blog');
  if (wantAll || oneBlog) {
    const slugs = oneBlog ? [oneBlog] : fs.readdirSync(BLOG_DIR).filter((d) => d !== 'index.html' && fs.existsSync(path.join(BLOG_DIR, d, 'index.html')));
    for (const slug of slugs) t.push({ kind: 'blog', slug, params: { type: 'blog', title: blogTitle(slug) }, page: path.join(BLOG_DIR, slug, 'index.html'), file: `blog-${slug}.jpg` });
  }
  return t;
}

(async () => {
  const targets = collectTargets();
  if (!targets.length) { console.error('No targets. Use --all | --industry <slug> | --blog <slug> | --hub'); process.exit(1); }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--force-color-profile=srgb'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 });
  let rendered = 0, patched = 0;
  const bulk = has('--all') && !has('--force');   // nightly --all only fills gaps (no churn / re-commit of identical cards)
  for (const t of targets) {
    try {
      if (bulk && fs.existsSync(path.join(OUT_DIR, t.file))) { console.log(`· skip (exists)  ${t.slug}`); continue; }
      await shoot(page, t.params, t.file);
      rendered++;
      const imgUrl = `${BASE}/${t.file}?v=${STAMP}`;
      if (!DRY && fs.existsSync(t.page) && patchMeta(t.page, imgUrl)) patched++;
      console.log(`✓ ${t.kind.padEnd(8)} ${t.slug}  → images/assets/og/${t.file}${DRY ? '  (dry, meta unchanged)' : ''}`);
    } catch (e) {
      console.error(`✗ ${t.kind} ${t.slug} — ${e.message}`);
    }
  }
  await browser.close();
  console.log(`\nDone: ${rendered} card(s) rendered, ${patched} page meta updated${DRY ? ' (dry run)' : ''}. Stamp v=${STAMP}.`);
})().catch((e) => { console.error('build-og-cards fatal:', e.stack || e.message); process.exit(1); });
