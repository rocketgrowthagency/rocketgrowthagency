#!/usr/bin/env node
/**
 * check-section-gutter-alignment.mjs — every content band must share one left edge.
 *
 * ─── WHY (2026-08-28) ────────────────────────────────────────────────────────────────────────────
 * Chris, pointing at the Services pages: "alignment issues". Reproduced on all four, and then on
 * the homepage, /pricing/, /process/ and /contact/ too — 24 broken (page, width) combinations.
 *
 * The site draws a full-bleed band two different ways:
 *
 *   A   <section class="section section-surface">      full-bleed; PADDING insets the content
 *   B   <div class="section-surface"><section class="section">   wrapper bleeds; inner is centred
 *
 * A centred `.section` insets its content by setting `width: min(--max-width, 100% - Nrem)`.
 * A full-bleed band cannot — it is 100% wide by definition, so it insets with `padding-left/right`.
 * Two different mechanisms for one visual result, which means every responsive tweak has to be
 * written TWICE, in agreement. It wasn't:
 *
 *     width      centred .section        .section-surface        result
 *     >1080px    max(1.75rem, …)         max(1.75rem, …)         aligned
 *     <=1080px   1.1rem  (2.2rem wide)   1.75rem                 ✗ 10px out
 *     <=860px    1rem    (2rem wide)     1rem                    aligned
 *     <=640px    1rem    (2rem wide)     0.75rem                 ✗ 4px out
 *
 * > **When one visual result has two implementations, a change to either one silently desynchronises
 * > them.** The breakpoints where they happened to agree (>1080px, <=860px) are exactly why this
 * > survived so long — check a page at 1440 or 768 and it looks perfect.
 *
 * It is invisible to any static/grep check: both declarations are individually valid CSS, on
 * different selectors, hundreds of lines apart, inside different media blocks. Only the rendered
 * geometry shows it. So this gate MEASURES rather than reads.
 *
 * Measures the true content-box left (`rect.left + padding-left`), which is immune to `text-align`
 * — a centred <h2> legitimately sits at a different x than a left-aligned one, and an earlier
 * version of this probe produced false positives on the homepage for exactly that reason.
 *
 * Headless only — never opens a window, so it is safe to run at any hour.
 *
 * Usage:  node scripts/check-section-gutter-alignment.mjs [--json]
 * Exit 0 = every band aligns · 1 = misaligned · 2 = could not tell.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER = path.dirname(HERE);
const WEBSITE = path.join(path.dirname(SCRAPER), 'Rocket Growth Agency Website VS Code');
const JSON_OUT = process.argv.includes('--json');

const WIDTHS = [1440, 1280, 1024, 860, 768, 640, 390];
// One page per band pattern per template family. Locked pages included on purpose: the fix lives in
// the SHARED stylesheet, so a regression there hits them too.
const PAGES = [
  '/', '/contact/', '/pricing/', '/process/', '/services/',
  '/services/google-maps-local-seo/', '/services/gbp-optimization/',
  '/services/local-seo-website-support/', '/start-growth-plan/',
];

if (!fs.existsSync(WEBSITE)) { console.error('✗ website repo not found'); process.exit(2); }
if (!fs.existsSync(path.join(WEBSITE, 'style.css'))) { console.error('✗ style.css not found'); process.exit(2); }

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('✗ playwright unavailable — cannot measure, refusing to report aligned.');
  process.exit(2);
}

// ── tiny static server over the website repo ─────────────────────────────────────────────────────
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  let f = path.join(WEBSITE, p);
  try { if (fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); } catch {}
  fs.readFile(f, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const bail = async (msg, code) => { try { server.close(); } catch {} console.error(msg); process.exit(code); };

let browser;
try { browser = await chromium.launch(); }
catch (e) { await bail(`✗ could not launch chromium: ${String(e.message).slice(0, 90)}`, 2); }

const rows = [];
let measured = 0;
try {
  for (const p of PAGES) {
    for (const w of WIDTHS) {
      const page = await browser.newPage({ viewport: { width: w, height: 900 } });
      let gutters;
      try {
        const resp = await page.goto(BASE + p, { waitUntil: 'load', timeout: 20000 });
        if (!resp || resp.status() !== 200) { await page.close(); continue; }
        await page.waitForTimeout(120);
        gutters = await page.evaluate(() => {
          const g = new Set();
          const add = (e) => {
            const r = e.getBoundingClientRect();
            if (r.width < 200) return; // skip collapsed/hidden bands
            g.add(Math.round(r.left + parseFloat(getComputedStyle(e).paddingLeft)));
          };
          // pattern A + plain centred sections (skip pattern B's inner — counted below)
          document.querySelectorAll('.section:not(.hero)').forEach((e) => {
            if (e.closest('.section-surface') && !e.classList.contains('section-surface')) return;
            add(e);
          });
          // pattern B inner
          document.querySelectorAll('.section-surface > .section').forEach(add);
          return [...g].sort((a, b) => a - b);
        });
      } catch { await page.close(); continue; }
      await page.close();
      if (!gutters || !gutters.length) continue;
      measured++;
      if (gutters.length > 1) rows.push({ page: p, width: w, gutters });
    }
  }
} finally {
  try { await browser.close(); } catch {}
  try { server.close(); } catch {}
}

// Refuse to report clean over an empty measurement set — a broken server or a renamed class would
// otherwise read as a pass. (feedback_empty_output_breaks_the_test_not_the_command)
const EXPECTED = PAGES.length * WIDTHS.length;
if (measured < EXPECTED * 0.8) {
  console.error(`✗ only measured ${measured}/${EXPECTED} page-widths — refusing to judge alignment.`);
  process.exit(2);
}

if (JSON_OUT) {
  console.log(JSON.stringify({ measured, expected: EXPECTED, misaligned: rows }, null, 2));
  process.exit(rows.length ? 1 : 0);
}

console.log(`\n===== SECTION GUTTER ALIGNMENT =====`);
console.log(`  measured  ${measured}/${EXPECTED} page-widths across ${PAGES.length} pages`);

if (!rows.length) {
  console.log(`\n✅ every content band shares one left edge at every width.`);
  process.exit(0);
}

console.error(`\n✗ ${rows.length} page-width combination(s) where bands do not line up:`);
for (const r of rows.slice(0, 14)) {
  console.error(`     ${r.page}  @${r.width}px  content lefts: ${r.gutters.join(' / ')}`);
}
if (rows.length > 14) console.error(`     … and ${rows.length - 14} more`);
console.error(`\n   A full-bleed '.section.section-surface' insets with padding; a centred '.section'`);
console.error(`   insets with width. Both must be respelled at EVERY breakpoint that changes either.`);
console.error(`   Check the @media blocks in style.css that touch '.section' width and make sure a`);
console.error(`   matching '.section.section-surface' padding exists with half that inset.`);
process.exit(1);
