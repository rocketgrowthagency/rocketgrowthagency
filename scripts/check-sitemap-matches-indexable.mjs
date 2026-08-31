#!/usr/bin/env node
/**
 * check-sitemap-matches-indexable.mjs — indexable pages and the sitemap must agree.
 *
 * ─── WHY (2026-08-31) ────────────────────────────────────────────────────────────────────────────
 * `/app/` declared `robots: index,follow` with a canonical — a real marketing page about connecting
 * Google Analytics and Search Console — and was **linked from zero pages AND absent from the
 * sitemap**. Orphaned from both the link graph and the discovery file, it was effectively invisible
 * to Google. `/demo/` was also missing despite being linked from 210 pages.
 *
 * The sitemap generator's own comment claimed /app/ was "a noindex product page". It never was.
 *
 * > **A page's robots tag is what decides whether it should be in the sitemap — not a comment, and
 * > not a hand-maintained list somebody forgot to update.** Two lists that must agree will drift
 * > unless something compares them. ([[feedback-a-comment-is-not-an-interlock]])
 *
 * Also catches the reverse: a noindex page listed in the sitemap (contradictory — asking Google to
 * crawl something you told it to ignore), and a sitemap URL with no file behind it (a 404 offered
 * up for indexing).
 *
 * Usage:  node scripts/check-sitemap-matches-indexable.mjs [--json]
 * Exit 0 = they agree · 1 = drift · 2 = could not tell.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER = path.dirname(HERE);
const WEBSITE = path.join(path.dirname(SCRAPER), 'Rocket Growth Agency Website VS Code');
const JSON_OUT = process.argv.includes('--json');
const BASE = 'https://www.rocketgrowthagency.com/';

const smPath = path.join(WEBSITE, 'sitemap.xml');
if (!fs.existsSync(smPath)) { console.error('✗ sitemap.xml not found'); process.exit(2); }
const sm = fs.readFileSync(smPath, 'utf8');
const listed = new Set([...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim()));
if (!listed.size) { console.error('✗ sitemap has no <loc> entries — refusing to judge.'); process.exit(2); }

let files;
try {
  files = execFileSync('git', ['ls-files', '*.html'], { cwd: WEBSITE, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 })
    .split('\n').filter(Boolean);
} catch (e) { console.error(`✗ git ls-files failed: ${String(e.message).slice(0, 80)}`); process.exit(2); }

// Excluded by design, not by oversight:
//   _site-snapshots/  frozen history               v/  cold-outreach landings (deliberately unindexed)
//   docs/, reports/   404'd at the edge in netlify.toml   mockup*  design files
// The two 404'd trees are derived from netlify.toml rather than hardcoded, so adding a new edge-404
// automatically excludes it here instead of producing a phantom finding.
let edge404 = [];
try {
  const toml = fs.readFileSync(path.join(WEBSITE, 'netlify.toml'), 'utf8');
  edge404 = [...toml.matchAll(/from\s*=\s*"\/([a-z0-9-]+)\/\*"[\s\S]{0,120}?status\s*=\s*404/gi)]
    .map((m) => m[1] + '/');
} catch {}
const EXCLUDE = (f) => f.startsWith('_site-snapshots/') || f.startsWith('v/')
  || edge404.some((p) => f.startsWith(p))
  || path.basename(f).startsWith('mockup');

const missing = [];   // indexable but not in the sitemap
const contradictory = []; // noindex but IS in the sitemap
for (const f of files) {
  if (EXCLUDE(f)) continue;
  let body;
  try { body = fs.readFileSync(path.join(WEBSITE, f), 'utf8'); } catch { continue; }
  const noindex = /name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(body);
  const dir = path.dirname(f) === '.' ? '' : path.dirname(f) + '/';
  const url = path.basename(f) === 'index.html' ? BASE + dir : BASE + f;
  const inSitemap = listed.has(url);
  if (!noindex && !inSitemap) missing.push({ file: f, url });
  if (noindex && inSitemap) contradictory.push({ file: f, url });
}

// sitemap entries with nothing behind them
const orphanUrls = [];
for (const u of listed) {
  const rel = u.replace(BASE, '').split(/[?#]/)[0];
  const cands = rel ? [rel, rel + 'index.html', rel.replace(/\/$/, '') + '.html'] : ['index.html'];
  if (!cands.some((c) => fs.existsSync(path.join(WEBSITE, c)))) orphanUrls.push(u);
}

const bad = missing.length + contradictory.length + orphanUrls.length;

if (JSON_OUT) {
  console.log(JSON.stringify({ sitemapEntries: listed.size, missing, contradictory, orphanUrls }, null, 2));
  process.exit(bad ? 1 : 0);
}

console.log(`\n===== SITEMAP vs INDEXABLE PAGES =====`);
console.log(`  sitemap entries  ${listed.size}`);
console.log(`  edge-404 trees   ${edge404.join(', ') || '(none)'}`);

if (!bad) { console.log(`\n✅ every indexable page is listed, and every listing has a page behind it.`); process.exit(0); }

if (missing.length) {
  console.error(`\n✗ ${missing.length} INDEXABLE page(s) missing from the sitemap:`);
  for (const m of missing.slice(0, 10)) console.error(`     ${m.file}`);
  console.error(`   These declare index,follow but are not offered to Google. If one is also unlinked`);
  console.error(`   (as /app/ was) it is invisible: add it here, or mark the page noindex.`);
}
if (contradictory.length) {
  console.error(`\n✗ ${contradictory.length} NOINDEX page(s) listed in the sitemap:`);
  for (const c of contradictory.slice(0, 10)) console.error(`     ${c.file}`);
  console.error(`   Contradictory — the sitemap invites crawling of a page the page itself refuses.`);
}
if (orphanUrls.length) {
  console.error(`\n✗ ${orphanUrls.length} sitemap URL(s) with no file behind them:`);
  for (const u of orphanUrls.slice(0, 10)) console.error(`     ${u}`);
}
process.exit(1);
