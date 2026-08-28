#!/usr/bin/env node
/**
 * check-og-images-tracked.mjs — every OG card a page references must actually be deployable.
 *
 * ─── WHY (2026-08-28) ────────────────────────────────────────────────────────────────────────────
 * `drip-content.sh` generates a page AND its OG card, but its `git add` list named only
 * `industries/ blog/ local-seo/ state-of-local-seo/ sitemap.xml` — never `images/assets/og/`.
 * So the HTML shipped and the image did not. The page went live referencing an image that was never
 * deployed, and Netlify answered with the 404 fallback.
 *
 * **This failure is invisible from the page itself.** The post renders perfectly; only the link
 * preview on LinkedIn / Slack / iMessage is blank, and nobody previews their own posts. 4 of 119 were
 * broken before anyone looked.
 *
 * > A 200 on a `.jpg` proves nothing. `text/html` on an image URL is the fallback page.
 * > ([[feedback-curl-status-is-useless-check-content-type]])
 *
 * This is the CHEAP static half: every `og/*.jpg` referenced by committed HTML must be tracked in
 * git. It needs no network, so it can run pre-flight. The live half is a content-type curl, which
 * belongs in the drift report, not a build gate.
 *
 * Usage:  node scripts/check-og-images-tracked.mjs [--json]
 * Exit 0 = every referenced card is tracked · 1 = one or more would 404 · 2 = could not tell.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER = path.dirname(HERE);
const WEBSITE = path.join(path.dirname(SCRAPER), 'Rocket Growth Agency Website VS Code');
const JSON_OUT = process.argv.includes('--json');

if (!fs.existsSync(WEBSITE)) { console.error(`✗ website repo not found at ${WEBSITE}`); process.exit(2); }

const git = (args) => execFileSync('git', args, { cwd: WEBSITE, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

let tracked, htmlFiles;
try {
  tracked = new Set(git(['ls-files', 'images/assets/og/']).split('\n').filter(Boolean).map((p) => path.basename(p)));
  htmlFiles = git(['ls-files', '*.html']).split('\n').filter(Boolean);
} catch (e) {
  console.error(`✗ could not read git state: ${String(e.message).slice(0, 120)}`);
  process.exit(2);
}

// 🔴 If nothing comes back, the query is wrong — reporting "all clear" on an empty set is the
// classic dead-check pass ([[feedback-dead-check-selector-gap]]).
if (!htmlFiles.length) { console.error('✗ no tracked .html files found — the git query is wrong, refusing to judge.'); process.exit(2); }
if (!tracked.size) { console.error('✗ no tracked OG images found — refusing to report every reference broken on a bad query.'); process.exit(2); }

const missing = new Map();   // image -> [pages]
let refCount = 0;
for (const f of htmlFiles) {
  let body;
  try { body = fs.readFileSync(path.join(WEBSITE, f), 'utf8'); } catch { continue; }
  for (const m of body.matchAll(/og\/([a-z0-9-]+\.jpg)/gi)) {
    refCount++;
    const img = m[1];
    if (!tracked.has(img)) {
      if (!missing.has(img)) missing.set(img, []);
      if (!missing.get(img).includes(f)) missing.get(img).push(f);
    }
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify({ htmlFiles: htmlFiles.length, references: refCount, tracked: tracked.size, missing: [...missing].map(([img, pages]) => ({ img, pages })) }, null, 2));
  process.exit(missing.size ? 1 : 0);
}

console.log(`\n===== OG CARDS =====`);
console.log(`  pages scanned    ${htmlFiles.length}`);
console.log(`  og references    ${refCount}`);
console.log(`  images tracked   ${tracked.size}`);

if (!missing.size) {
  console.log(`\n✅ every referenced OG card is tracked and will deploy.`);
  process.exit(0);
}

console.error(`\n✗ ${missing.size} OG CARD(S) REFERENCED BUT NOT IN GIT — those pages ship a blank preview.`);
for (const [img, pages] of missing) {
  console.error(`\n   ${img}`);
  for (const p of pages.slice(0, 4)) console.error(`     ← ${p}`);
  if (pages.length > 4) console.error(`     … and ${pages.length - 4} more page(s)`);
}
console.error(`\n   Fix: git add images/assets/og/ && commit && deploy.`);
console.error(`   Root cause was drip-content.sh staging the HTML but not images/assets/og/.`);
process.exit(1);
