#!/usr/bin/env node
/**
 * recover-lost-leads.mjs — find every lead a past run FAILED that still has no video, and turn them
 * back into work. (2026-08-19)
 *
 * THE HOLE THIS FILLS
 * A lead that dies before step-8 never gets an Airtable row. `reconcile-missing-videos.mjs` queries
 * Airtable, and `parole-permafails.mjs` needs a parked row — so **neither can see it**. Nothing in the
 * system knows it ever existed. The only record is the overnight REPORT that listed it as failed.
 *
 * Measured 2026-08-19: 367 failure rows across the reports. The 2026-08-15 CPA run alone lost 23 leads
 * to `scroll-find captures froze on the results list` — a bug FIXED two days later in 984346e. Those
 * leads were buildable from the moment of the fix, and nothing was ever going to rebuild them.
 *
 * WHAT IT DOES
 *   1. Parses every `reports/overnight/**.md` for its search term + the businesses it listed as failed.
 *   2. Slugifies each and asks the LIVE SITE whether a video is being served
 *      (content-type must be `video/mp4` — a status code proves nothing here, every absent path 200s
 *      through the SPA catch-all → feedback_curl_status_is_useless_check_content_type).
 *   3. Reports the still-missing ones grouped by SEARCH, because re-running the search is the only way
 *      to rebuild a lead that has no Airtable row.
 *   4. `--queue` appends those searches to output/pending-rebuild-searches.txt (next-search returns
 *      queued rebuilds first), and un-ledgers them so they are re-pickable.
 *
 * Deliberately conservative: it only ever ADDS searches to the rebuild queue. It never edits a lead,
 * never un-suppresses, never deletes.
 *
 * Usage:
 *   node scripts/recover-lost-leads.mjs                 # report only
 *   node scripts/recover-lost-leads.mjs --queue         # also queue the searches
 *   node scripts/recover-lost-leads.mjs --since 2026-08-01
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEBSITE = '/Users/chris/RGA/Rocket Growth Agency Website VS Code';
const REPORTS = path.join(WEBSITE, 'reports', 'overnight');
const SITE = 'https://www.rocketgrowthagency.com';
const QUEUE = path.join(ROOT, 'output', 'pending-rebuild-searches.txt');
const LEDGER = path.join(ROOT, 'output', 'attempted-searches.log');
const DO_QUEUE = process.argv.includes('--queue');
const SINCE = (process.argv.find((a) => a.startsWith('--since')) || '').split('=')[1]
  || (process.argv[process.argv.indexOf('--since') + 1] || '').match(/^\d{4}-\d{2}-\d{2}$/)?.[0] || '';
const CONC = 6;   // the site rate-limits above ~10; a throttled probe is worse than none

// Must match build-video-landing's slug rule, or every lookup misses and everything looks lost.
const slugify = (s) => String(s).toLowerCase()
  .replace(/&/g, ' and ').replace(/\|/g, ' or ')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const INDETERMINATE = (c) => c === 403 || c === 429 || c === 408 || (typeof c === 'number' && c >= 500) || c === 'ERR';

async function probeOnce(slug) {
  try {
    const r = await fetch(`${SITE}/v/${slug}/video.mp4`, { headers: { Range: 'bytes=0-0' } });
    return { code: r.status, ct: r.headers.get('content-type') || '' };
  } catch (e) { return { code: 'ERR', ct: String(e.message).slice(0, 40) }; }
}
// 🔴 2026-08-19 — THE CODEBASE HAS TWO SLUG RULES, so one probe form is not enough.
// This file turns "Dr. Augusto Rojas, M.D." into `dr-augusto-rojas-m-d` (every non-alphanumeric run
// becomes a hyphen), which matches the step-2 CSV and the capture directory. But the DEPLOYED page and
// the gate's failure message use a COLLAPSED form, `dr-augusto-rojas-md`. Evidence: of the live /v/
// directories, 45 use collapsed initials (md/dds/pc/llp) and ZERO use the hyphen-separated form.
// Probing only the hyphen form therefore reports a live video as MISSING.
// Measured impact here: 1 of 252 (face-and-skin-l-a vs face-and-skin-la) — small, but a false "missing"
// sends a lead back for a rebuild it does not need, and it is what made a manual retry skip a lead.
// Trying both forms is the proportionate fix; unifying the two slug rules across step-2 / step-3 /
// build-video-landing is a much riskier change for a 1-in-252 defect.
const collapseInitials = (s) => s.replace(/(?:^|-)((?:[a-z]-){1,3}[a-z])(?=-|$)/g,
  (m, g) => (m.startsWith('-') ? '-' : '') + g.replace(/-/g, ''));

async function probeSlug(slug) {
  let res = await probeOnce(slug);
  for (let a = 1; a <= 4 && INDETERMINATE(res.code); a++) { await sleep(a * 1500); res = await probeOnce(slug); }
  return res;
}

async function hasVideo(slug) {
  let res = await probeSlug(slug);
  if (INDETERMINATE(res.code)) return null;            // unknown — never counted as lost
  if (/video\/mp4/i.test(res.ct)) return true;
  // Not found under this form — try the collapsed-initials variant before declaring it lost.
  const alt = collapseInitials(slug);
  if (alt !== slug) {
    const res2 = await probeSlug(alt);
    if (INDETERMINATE(res2.code)) return null;
    if (/video\/mp4/i.test(res2.ct)) return true;
  }
  return false;
}

// ---- sensor self-test: a slug that cannot exist must not look like a video ----
const control = await hasVideo('zzz-control-slug-that-cannot-exist');
if (control !== false) {
  console.error(`❌ PROBE BROKEN (control returned ${control}). Refusing to run — a false "N lost" list is worse than none.`);
  process.exit(2);
}

// ---- collect (search, business) pairs from every report ----
const files = [];
(function walk(d) {
  for (const e of fs.existsSync(d) ? fs.readdirSync(d) : []) {
    const p = path.join(d, e);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/_overnight-report_\d{4}-\d{2}-\d{2}\.md$/.test(e)) files.push(p);
  }
})(REPORTS);

const bySearch = new Map();
for (const f of files.sort()) {
  const date = f.match(/(\d{4}-\d{2}-\d{2})\.md$/)[1];
  if (SINCE && date < SINCE) continue;
  const s = fs.readFileSync(f, 'utf8');
  const cat = (s.match(/^\*\*Category:\*\*\s*(.+)$/m) || [])[1]?.trim();
  const loc = (s.match(/^\*\*Location:\*\*\s*(.+)$/m) || [])[1]?.trim();
  if (!cat || !loc || loc === 'n/a') continue;
  const term = `${cat} in ${loc}`;
  // "## Issues / errors" rows look like:  - **Business Name** — reason
  const sec = (s.split(/^##\s+Issues \/ errors\s*$/m)[1] || '').split(/^##\s+/m)[0];
  for (const line of sec.split('\n')) {
    const m = line.match(/^-\s+\*\*(.+?)\*\*\s*—/);
    if (!m) continue;
    const name = m[1].trim();
    if (/^none\b/i.test(name)) continue;
    if (!bySearch.has(term)) bySearch.set(term, new Set());
    bySearch.get(term).add(name);
  }
}

const pairs = [];
for (const [term, names] of bySearch) for (const n of names) pairs.push({ term, name: n, slug: slugify(n) });
// One business can fail on several nights; probe each slug once.
const uniq = [...new Map(pairs.map((p) => [p.slug, p])).values()];
const JSON_MODE = process.argv.includes('--json');
if (!JSON_MODE) {
  console.log(`Reports scanned: ${files.length}${SINCE ? ` (since ${SINCE})` : ''}`);
  console.log(`Distinct failed businesses: ${uniq.length} across ${bySearch.size} search(es)\n`);
}

let i = 0; const lost = [], have = [], unknown = [];
await Promise.all(Array.from({ length: CONC }, async () => {
  while (i < uniq.length) {
    const p = uniq[i++];
    const v = await hasVideo(p.slug);
    if (v === null) unknown.push(p); else if (v) have.push(p); else lost.push(p);
  }
}));

// --json: machine-readable, for scripts/recovery-rounds.sh. Everything else this file prints goes to
// stdout too, so the JSON mode must be the ONLY thing on stdout — hence the early exit.
if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify({
    scanned: files.length,
    missing: lost.map((p) => ({ slug: p.slug, name: p.name, search: p.term })),
    have: have.length,
    indeterminate: unknown.length,
  }));
  process.exit(0);
}

console.log(`  ✅ now have a video : ${have.length}`);
console.log(`  🔴 STILL missing    : ${lost.length}`);
if (unknown.length) console.log(`  ❓ indeterminate    : ${unknown.length} (rate-limited — not counted as lost)`);

const lostBySearch = new Map();
for (const p of lost) { if (!lostBySearch.has(p.term)) lostBySearch.set(p.term, []); lostBySearch.get(p.term).push(p); }
const ordered = [...lostBySearch.entries()].sort((a, b) => b[1].length - a[1].length);

console.log(`\nStill-missing leads by search (re-running the search is the ONLY way to rebuild a lead with no Airtable row):`);
for (const [term, ps] of ordered) console.log(`  ${String(ps.length).padStart(3)}  ${term}`);

if (!DO_QUEUE) { console.log(`\nRe-run with --queue to add these ${ordered.length} search(es) to the rebuild queue.`); process.exit(0); }

const norm = (s) => String(s).toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
let queued = 0;
const existing = new Set((() => { try { return fs.readFileSync(QUEUE, 'utf8').split('\n').map((l) => norm(l)).filter(Boolean); } catch { return []; } })());
const add = [];
for (const [term] of ordered) { if (!existing.has(norm(term))) { add.push(term); queued++; } }
if (add.length) fs.appendFileSync(QUEUE, add.join('\n') + '\n');
// Un-ledger them too, so the attempted-log can't veto the re-pick.
try {
  const keep = fs.readFileSync(LEDGER, 'utf8').split('\n').filter((l) => l.trim() && !ordered.some(([t]) => norm(t) === norm(l)));
  fs.writeFileSync(LEDGER, keep.join('\n') + '\n');
} catch { /* no ledger */ }
console.log(`\n[queue] added ${queued} search(es); ${ordered.length - queued} already queued. Un-ledgered them so next-search can re-pick.`);
console.log(`[queue] These rebuild at the nightly cadence — raise it with: echo 8 > output/CLEAR-BACKLOG`);
