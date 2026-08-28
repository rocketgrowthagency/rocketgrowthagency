#!/usr/bin/env node
/**
 * check-no-markup-in-text.mjs — escaped HTML must never appear as visible page text.
 *
 * ─── WHY (2026-08-28) ────────────────────────────────────────────────────────────────────────────
 * Eleven live blog posts rendered raw head markup inside their "Related industry guides" links:
 *
 *   Local SEO for Auto Detailing (2026 Guide)</title> <meta name="description" content="…" />
 *   <link rel="canonical" href="https
 *
 * `generate-blog-post.mjs` extracted the sibling post's vertical with
 * `/<title>Local SEO for ([^:]+):/`. `[^:]+` means "anything that is not a colon" — it does NOT stop
 * at `</title>`. A title WITHOUT a colon let the capture run out of the title element, through the
 * whole `<head>`, and halt at the first colon it met: the `https:` in the canonical URL. That blob
 * became the anchor text.
 *
 * > **A character class that excludes only ONE delimiter will happily cross every other boundary.**
 * > The capture must exclude the closing delimiter itself (`[^<:]`), not merely stop at some later
 * > character that usually appears first.
 *
 * It escaped review because the page LOOKED fine in source (`&lt;/title&gt;`, correctly escaped) —
 * grepping for `</title>` found nothing. Only the rendered page showed it.
 *
 * This is the general detector: escaped tag markup appearing where visible text belongs.
 *
 * Usage:  node scripts/check-no-markup-in-text.mjs [--json]
 * Exit 0 = clean · 1 = markup is being rendered as text · 2 = could not tell.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER = path.dirname(HERE);
const WEBSITE = path.join(path.dirname(SCRAPER), 'Rocket Growth Agency Website VS Code');
const JSON_OUT = process.argv.includes('--json');

if (!fs.existsSync(WEBSITE)) { console.error('✗ website repo not found'); process.exit(2); }

let files;
try {
  files = execFileSync('git', ['ls-files', '*.html'], { cwd: WEBSITE, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 })
    .split('\n').filter(Boolean);
} catch (e) { console.error(`✗ git ls-files failed: ${String(e.message).slice(0, 90)}`); process.exit(2); }
if (!files.length) { console.error('✗ no tracked .html files — refusing to report clean over an empty set.'); process.exit(2); }

// Escaped markup that has no legitimate reason to be VISIBLE text on a marketing page. Deliberately
// narrow: `&lt;p&gt;` in a code sample is fine, a leaked `</title>` or `<meta ...>` never is.
const LEAKS = [
  { re: /&lt;\/title&gt;/g,               what: 'a leaked </title> — a title regex escaped its element' },
  { re: /&lt;meta\s+name=&quot;/gi,       what: 'a leaked <meta> tag' },
  { re: /&lt;link\s+rel=&quot;canonical/gi, what: 'a leaked <link rel="canonical">' },
];

const hits = [];
for (const f of files) {
  let body;
  try { body = fs.readFileSync(path.join(WEBSITE, f), 'utf8'); } catch { continue; }
  for (const L of LEAKS) {
    const n = (body.match(L.re) || []).length;
    if (n) hits.push({ file: f, what: L.what, count: n });
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify({ scanned: files.length, hits }, null, 2));
  process.exit(hits.length ? 1 : 0);
}

console.log(`\n===== MARKUP LEAKING INTO VISIBLE TEXT =====`);
console.log(`  pages scanned  ${files.length}`);

if (!hits.length) {
  console.log(`\n✅ no escaped head markup is being rendered as page text.`);
  process.exit(0);
}

const byFile = [...new Set(hits.map((h) => h.file))];
console.error(`\n✗ ${hits.length} leak(s) across ${byFile.length} page(s) — raw markup is showing to visitors:`);
for (const h of hits.slice(0, 12)) console.error(`     ${h.file}  ×${h.count}  ${h.what}`);
if (hits.length > 12) console.error(`     … and ${hits.length - 12} more`);
console.error(`\n   Almost always a capture regex that escapes its element. Exclude the CLOSING`);
console.error(`   delimiter in the character class (e.g. [^<:] not [^:]) rather than relying on some`);
console.error(`   later character to stop the run.`);
process.exit(1);
