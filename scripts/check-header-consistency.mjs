#!/usr/bin/env node
/**
 * check-header-consistency.mjs — the shared header must actually be shared.
 *
 * ─── WHY (2026-08-28) ────────────────────────────────────────────────────────────────────────────
 * Chris opened a blog post and the red offer banner was gone — plain underlined text jammed against
 * the top of the window. Two independent drifts, both invisible in the source:
 *
 *   1. `.promo-bar` CSS lived in an inline `<style id="promo-bar-style">` block. The MARKUP was on
 *      203 pages; the STYLE on only 138. **65 pages rendered the banner unstyled.**
 *   2. The `Demo` nav link was on 168 of 204 pages. **36 pages silently dropped it.**
 *
 * > **Shared chrome belongs in the shared stylesheet.** A component styled inline is a component that
 * > loses its styling on every page that forgets to copy the block — and nothing in the source looks
 * > wrong, because both the markup and *a* style block are present on whichever page you happen to
 * > open.
 *
 * These pages are generated (blog + industry templates), so a template that drifts multiplies across
 * dozens of pages at once. Static + offline, so it runs pre-flight.
 *
 * Usage:  node scripts/check-header-consistency.mjs [--json]
 * Exit 0 = header consistent · 1 = drift · 2 = could not tell.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER = path.dirname(HERE);
const WEBSITE = path.join(path.dirname(SCRAPER), 'Rocket Growth Agency Website VS Code');
const JSON_OUT = process.argv.includes('--json');

if (!fs.existsSync(WEBSITE)) { console.error(`✗ website repo not found`); process.exit(2); }

let files;
try {
  files = execFileSync('git', ['ls-files', '*.html'], { cwd: WEBSITE, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n').filter(Boolean);
} catch (e) { console.error(`✗ git ls-files failed: ${String(e.message).slice(0, 90)}`); process.exit(2); }
// 🔴 An empty file list must not read as "everything consistent" ([[feedback-dead-check-selector-gap]]).
if (!files.length) { console.error('✗ no tracked .html files found — the query is wrong, refusing to judge.'); process.exit(2); }

// 1. The promo-bar style must be in the SHARED stylesheet, not only inline.
const cssPath = path.join(WEBSITE, 'style.css');
if (!fs.existsSync(cssPath)) { console.error('✗ style.css not found'); process.exit(2); }
const css = fs.readFileSync(cssPath, 'utf8');
const promoShared = /^\.promo-bar\s*\{[^}]*background:\s*#dc2626/m.test(css)
                 && /^\.promo-bar\s*\{[^}]*text-align:\s*center/m.test(css);

// 2. Every page carrying the nav must carry the same nav destinations.
const NAV_PATHS = ['/industries/', '/process/', '/demo/', '/pricing/', '/faq/', '/contact/'];
const missingNav = new Map();   // path -> count
let navPages = 0, promoPages = 0;

for (const f of files) {
  let body;
  try { body = fs.readFileSync(path.join(WEBSITE, f), 'utf8'); } catch { continue; }
  if (body.includes('class="promo-bar"')) promoPages++;
  if (!body.includes('class="desktop-nav"')) continue;
  navPages++;
  for (const p of NAV_PATHS) {
    if (!body.includes(`data-path="${p}"`)) missingNav.set(p, (missingNav.get(p) || 0) + 1);
  }
}
if (!navPages) { console.error('✗ no page carries .desktop-nav — the selector changed; refusing to judge.'); process.exit(2); }

const navDrift = [...missingNav.entries()].sort((a, b) => b[1] - a[1]);

if (JSON_OUT) {
  console.log(JSON.stringify({ navPages, promoPages, promoStyleShared: promoShared, navDrift }, null, 2));
  process.exit((!promoShared || navDrift.length) ? 1 : 0);
}

console.log(`\n===== HEADER CONSISTENCY =====`);
console.log(`  pages with the nav        ${navPages}`);
console.log(`  pages with the promo bar  ${promoPages}`);
console.log(`  promo-bar CSS in style.css ${promoShared ? '✅ yes' : '🔴 NO'}`);

let bad = false;
if (!promoShared) {
  bad = true;
  console.error(`\n✗ .promo-bar is NOT styled in the shared stylesheet.`);
  console.error(`   If it only exists in an inline <style> block, every page generated without that`);
  console.error(`   block renders the offer banner as plain text instead of the red band — which is`);
  console.error(`   exactly what happened to 65 pages, the whole blog among them.`);
}
if (navDrift.length) {
  bad = true;
  console.error(`\n✗ nav links missing from some pages:`);
  for (const [p, n] of navDrift) console.error(`     ${p.padEnd(14)} missing from ${n} of ${navPages} pages`);
  console.error(`   The header is meant to be identical sitewide. A generated template that drops a`);
  console.error(`   link multiplies across every page it produces.`);
}
if (bad) process.exit(1);
console.log(`\n✅ header is consistent: shared promo-bar styling, and all ${NAV_PATHS.length} nav links on all ${navPages} pages.`);
