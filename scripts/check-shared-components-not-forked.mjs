#!/usr/bin/env node
/**
 * check-shared-components-not-forked.mjs — a shared component may be defined in ONE place.
 *
 * ─── WHY ─────────────────────────────────────────────────────────────────────────────────────────
 * The same bug shipped SIX times in four days, each time invisible until one page looked wrong:
 *
 *   .section gutter    two implementations (width vs padding) → 10px out at 1024px on 8 pages
 *   .promo-bar         EIGHT variants across 138 inline blocks → 12 pages rendered a blue banner
 *   .section-head      centring existed only inline on index.html, unreachable elsewhere
 *   promo mobile rule  inline-only, so 138 pages shrank on phones and 65 did not
 *   FAQ accordion      FOUR names for one card, already drifting (.9 vs .95rem padding)
 *   .metric            two wholesale overrides of the base, inline on separate pages
 *
 * Every one had the same shape: a component defined per page instead of once, with nothing forcing
 * the copies to agree. They do not drift immediately — they drift the next time someone edits one.
 *
 * > **A component defined in N places is N components that merely look alike today.** The cost is
 * > not the duplication; it is that a fix applied to one of them silently misses the rest.
 *
 * This fails when a SHARED component (one that exists in style.css) is ALSO redefined in a page's
 * inline <style>. Page-local components — things only that page has — are fine and ignored.
 *
 * Usage:  node scripts/check-shared-components-not-forked.mjs [--json]
 * Exit 0 = no forks · 1 = a shared component is redefined per page · 2 = could not tell.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER = path.dirname(HERE);
const WEBSITE = path.join(path.dirname(SCRAPER), 'Rocket Growth Agency Website VS Code');
const JSON_OUT = process.argv.includes('--json');

// Components that are SHARED CHROME or a shared design primitive. Redefining any of these in a page
// is what caused every incident above. Add to this list when a component becomes shared.
const GUARDED = [
  'promo-bar', 'brand', 'topbar', 'header-inner', 'desktop-nav', 'nav-link',
  'section-head', 'faq-card', 'proc-faq', 'sfaq', 'qa', 'gp-faq',
  'metric', 'metrics-row', 'metric-value', 'metric-label',
];

if (!fs.existsSync(path.join(WEBSITE, 'style.css'))) { console.error('✗ style.css not found'); process.exit(2); }
const css = fs.readFileSync(path.join(WEBSITE, 'style.css'), 'utf8');

let files;
try {
  files = execFileSync('git', ['ls-files', '*.html'], { cwd: WEBSITE, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 })
    .split('\n').filter(Boolean)
    // frozen snapshots, /v/ outreach landings, and standalone mockups inline everything by necessity
    .filter((f) => !f.startsWith('_site-snapshots/') && !f.startsWith('v/') && !path.basename(f).startsWith('mockup'));
} catch (e) { console.error(`✗ git ls-files failed: ${String(e.message).slice(0, 80)}`); process.exit(2); }
if (!files.length) { console.error('✗ no tracked pages — refusing to judge over an empty set.'); process.exit(2); }

// only guard components that genuinely live in style.css; anything else is page-local by definition
const shared = GUARDED.filter((c) => new RegExp(`\\.${c}(?![\\w-])[^{}]*\\{`).test(css));
if (!shared.length) { console.error('✗ none of the guarded components exist in style.css — the list is stale.'); process.exit(2); }

const forks = [];
for (const f of files) {
  let body;
  try { body = fs.readFileSync(path.join(WEBSITE, f), 'utf8'); } catch { continue; }
  // A page that does not LINK style.css cannot be overriding it. Standalone documents
  // (new-client-playbook/*) style themselves from scratch and reuse names like .topbar for an
  // entirely different component — a name collision, not a fork.
  if (!/href="[^"]*\/?style\.css/.test(body)) continue;
  for (const raw of body.match(/<style[^>]*>[\s\S]*?<\/style>/g) || []) {
    // strip comments first — otherwise a comment MENTIONING a component reads as a selector
    const block = raw.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const rule of block.match(/[^{}@]+\{[^}]*\}/g) || []) {
      const sel = rule.slice(0, rule.indexOf('{')).trim();
      // An ID-scoped override (#gp-page .metric-value) is a deliberate page variant: it cannot leak
      // to another page and cannot be "the" definition. Only UNSCOPED redefinitions are forks.
      if (/#[\w-]+/.test(sel)) continue;
      for (const c of shared) {
        if (new RegExp(`\\.${c}(?![\\w-])`).test(sel)) {
          forks.push({ file: f, component: c, selector: sel.replace(/\s+/g, ' ').slice(0, 60) });
        }
      }
    }
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify({ guarded: shared, scanned: files.length, forks }, null, 2));
  process.exit(forks.length ? 1 : 0);
}

console.log(`\n===== SHARED COMPONENTS =====`);
console.log(`  pages scanned      ${files.length}`);
console.log(`  components guarded ${shared.length}  (${shared.join(', ')})`);

if (!forks.length) {
  console.log(`\n✅ every shared component is defined once, in style.css.`);
  process.exit(0);
}

const byComp = new Map();
for (const f of forks) { if (!byComp.has(f.component)) byComp.set(f.component, []); byComp.get(f.component).push(f); }
console.error(`\n✗ ${forks.length} per-page redefinition(s) of a shared component:`);
for (const [c, list] of byComp) {
  console.error(`\n     .${c} — ${list.length} rule(s) across ${new Set(list.map((x) => x.file)).size} page(s)`);
  for (const x of list.slice(0, 4)) console.error(`        ${x.file}  {${x.selector}}`);
  if (list.length > 4) console.error(`        … and ${list.length - 4} more`);
}
console.error(`\n   An inline copy sits LATER in the cascade than style.css, so it wins — the page stops`);
console.error(`   matching the site and nothing errors. Move the rule into style.css, or give the`);
console.error(`   variant its own modifier class there (see .metrics-row--lg / --sm).`);
process.exit(1);
