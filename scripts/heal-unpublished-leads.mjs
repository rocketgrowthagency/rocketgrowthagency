#!/usr/bin/env node
/**
 * heal-unpublished-leads.mjs — leads that were SCRAPED and SELECTED, but never became anything.
 *
 * ─── WHY (2026-08-21) ────────────────────────────────────────────────────────────────────────────
 * On 2026-08-20 a latched OpenAI guard skipped 12 consecutive searches. Of the 7 emailable
 * Dermatologists leads in that night's step-2 CSV:
 *
 *     0 of 7 had an Airtable row.   0 of 7 had a video.
 *
 * Every self-healing pass here starts from the Airtable LEAD list — reconcile-missing-videos, parole,
 * audit-failed-videos, recovery-rounds, the verdict. A lead skipped before step-8 wrote a row is
 * unreachable from that direction, so NONE of them could ever see those seven. Invisible, permanently.
 *
 * Third instance of one lesson:
 *   • deployed video, no lead        → project_orphaned_videos.md
 *   • a night that produced nothing  → check-run-productivity.mjs
 *   • a scraped lead never published → this script
 * 👉 RECONCILE FROM THE ARTEFACT, NOT ONLY FROM THE RECORD.
 *
 * 🔑 "SHOULD HAVE BEEN BUILT" IS NOT MY OPINION — IT IS THE PIPELINE'S.
 * The first version of this script re-implemented the emailable test (isUsableLeadRow +
 * extractValidEmail). That is a SECOND rule for a question overnight-pipeline.sh already answers, and
 * two rules for one question WILL drift — precisely the bug that produced the orphaned videos. It also
 * silently ignored the >60-mile geographic filter, whose whole purpose is to reject leads whose Maps
 * card would render a blank or wrong-city map. Rebuilding those would manufacture bad videos.
 * So this now shells out to `scripts/select-emailable-leads.py` — the exact selector the night run
 * uses, geo filter included — and treats its output as the definition of a lead that should exist.
 *
 * Usage:
 *   node scripts/heal-unpublished-leads.mjs                  # report
 *   node scripts/heal-unpublished-leads.mjs --by-search      # group by the search that produced them
 *   node scripts/heal-unpublished-leads.mjs --apply          # rebuild (night window only)
 *   node scripts/heal-unpublished-leads.mjs --days=14 --max=20
 *
 * Exit 0 always — post-hoc reconciliation must never abort a finished night.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
// fileURLToPath, never new URL().pathname — this repo's path has spaces (project_orphaned_videos.md).
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER = path.dirname(HERE);
const SITE_V = path.join(path.dirname(SCRAPER), 'Rocket Growth Agency Website VS Code', 'v');
const STEP2 = path.join(SCRAPER, 'output', 'Step 2');

const numArg = (n, d) => {
  const m = process.argv.find((a) => a.startsWith(`--${n}=`));
  const v = m ? Number(m.split('=')[1]) : NaN;
  return Number.isFinite(v) ? v : d;
};
const APPLY = process.argv.includes('--apply');
const BY_SEARCH = process.argv.includes('--by-search');
const DAYS = numArg('days', 7);
// A rebuild is ~6 minutes. An uncapped backlog would eat the night and starve the fresh scrape.
// Anything over the cap is REPORTED, never silently dropped.
const MAX = numArg('max', 20);
const RADIUS = process.env.LEAD_RADIUS_MI || '60';

const slugify = (n) => String(n || '').toLowerCase().replace(/&/g, 'and')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ── 1. Ask the PIPELINE which leads each batch should have produced ──────────────────────────────
const cutoff = Date.now() - DAYS * 86400000;
let files = [];
try {
  files = fs.readdirSync(STEP2)
    .filter((f) => f.endsWith('-[step-2].csv') && !f.includes('-only-'))
    .map((f) => ({ f, t: fs.statSync(path.join(STEP2, f)).mtimeMs }))
    .filter((x) => x.t >= cutoff)
    .sort((a, b) => b.t - a.t);
} catch {
  console.log('heal-unpublished: no output/Step 2 directory — nothing to do.');
  process.exit(0);
}

const selected = new Map();   // slug -> { name, search }
for (const { f } of files) {
  let out = '';
  try {
    out = execFileSync('python3', [path.join(HERE, 'select-emailable-leads.py'), path.join(STEP2, f), RADIUS],
      { cwd: SCRAPER, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    // A selector that cannot read one CSV must not take the whole pass down.
    continue;
  }
  const search = f.replace(/^\d{4}-\d{2}-\d{2}_/, '').replace(/-\[step-2\]\.csv$/, '');
  for (const line of out.split('\n')) {
    const name = line.trim();
    if (!name) continue;
    const s = slugify(name);
    if (s && !selected.has(s)) selected.set(s, { name, search });
  }
}

// ── 2. Artefact 1 — a video on disk ──────────────────────────────────────────────────────────────
const hasVideo = (slug) => {
  try { return fs.statSync(path.join(SITE_V, slug, 'video.mp4')).size > 0; } catch { return false; }
};

// ── 3. Artefact 2 — an Airtable row ──────────────────────────────────────────────────────────────
// 🔴 An unreachable CRM is NOT "no leads exist". Treating a failed probe as absence would rebuild the
// entire backlog (feedback_indeterminate_is_not_a_finding). Abort instead.
async function airtableSlugs() {
  const env = Object.fromEntries(
    fs.readFileSync(path.join(SCRAPER, '.env'), 'utf8').split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
  const set = new Set();
  let offset;
  do {
    const u = new URL(`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(env.AIRTABLE_TABLE_NAME)}`);
    u.searchParams.set('pageSize', '100');
    if (offset) u.searchParams.set('offset', offset);
    const r = await fetch(u, { headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` } });
    if (!r.ok) throw new Error(`Airtable HTTP ${r.status}`);
    const j = await r.json();
    offset = j.offset;
    for (const rec of j.records) { const s = slugify(rec.fields['Business Name']); if (s) set.add(s); }
  } while (offset);
  return set;
}

let known;
try {
  known = await airtableSlugs();
} catch (e) {
  console.log(`heal-unpublished: ABORT — could not read Airtable (${e.message}).`);
  console.log('  Refusing to guess: an unreachable CRM read as "no leads" would rebuild everything.');
  process.exit(0);
}

// ── 4. Selected, but no video AND no lead ────────────────────────────────────────────────────────
const missing = [];
for (const [slug, info] of selected) {
  if (hasVideo(slug)) continue;
  if (known.has(slug)) continue;     // a lead exists — the lead-based reconcilers own it
  missing.push({ slug, ...info });
}

console.log('===== UNPUBLISHED LEADS (selected by the pipeline, but no video and no CRM row) =====');
console.log(`window        : last ${DAYS} day(s), ${files.length} batch CSV(s)`);
console.log(`selected      : ${selected.size}   (via select-emailable-leads.py, radius ${RADIUS}mi)`);
console.log(`unpublished   : ${missing.length}`);

if (!missing.length) {
  console.log('\n✅ Nothing the pipeline selected was silently dropped.');
  process.exit(0);
}

// Grouping by search is what tells a DEAD WINDOW (whole searches gone) apart from ordinary per-lead
// build failures (a few scattered across many searches). They need completely different responses.
const bySearch = new Map();
for (const m of missing) bySearch.set(m.search, (bySearch.get(m.search) || 0) + 1);
const sel = new Map();
for (const [, info] of selected) sel.set(info.search, (sel.get(info.search) || 0) + 1);

console.log('\n  by search  (unpublished / selected):');
for (const [s, n] of [...bySearch.entries()].sort((a, b) => b[1] - a[1])) {
  const total = sel.get(s) || 0;
  const whole = total > 0 && n === total ? '   ← ENTIRE search lost' : '';
  console.log(`    ${String(n).padStart(3)}/${String(total).padEnd(3)}  ${s}${whole}`);
}

if (BY_SEARCH) process.exit(0);

const batch = missing.slice(0, MAX);
if (missing.length > batch.length) {
  console.log(`\n  ⚠️  capped at --max=${MAX}; ${missing.length - batch.length} carry to the next run.`);
}

if (!APPLY) {
  console.log('\n(report only — pass --apply to rebuild)');
  process.exit(0);
}

// ── 5. Rebuild ───────────────────────────────────────────────────────────────────────────────────
// Possible at all only because rebuild-broken-videos.sh can now carve a per-lead CSV out of the batch
// file (feedback_the_repair_path_must_repair_a_fresh_lead) — these leads have never been built once.
console.log(`\n>>> rebuilding ${batch.length} lead(s)…`);
try {
  execFileSync('bash', [path.join(HERE, 'rebuild-broken-videos.sh'), ...batch.map((b) => b.slug)],
    { cwd: SCRAPER, stdio: 'inherit' });
} catch (e) {
  console.log(`>>> rebuild returned non-zero (${e.status ?? '?'}) — per-lead outcomes are in the failure ledger.`);
}
const healed = batch.filter((b) => hasVideo(b.slug)).length;
console.log(`\n>>> healed ${healed}/${batch.length}.`);
process.exit(0);
