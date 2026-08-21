#!/usr/bin/env node
/**
 * heal-unpublished-leads.mjs — find leads that were SCRAPED but never became anything, and rebuild them.
 *
 * ─── WHY (2026-08-21) ────────────────────────────────────────────────────────────────────────────
 * On 2026-08-20 a latched OpenAI guard skipped 12 consecutive searches. The next morning, of the 7
 * emailable Dermatologists leads in that night's step-2 CSV:
 *
 *     0 of 7 had an Airtable row.   0 of 7 had a video.
 *
 * Every self-healing pass in this repo starts from the Airtable LEAD list and asks "which lead is
 * missing a video?" — reconcile-missing-videos, parole, audit-failed-videos, recovery-rounds, the
 * verdict. A lead skipped before step-8 ever wrote a row is unreachable from that direction, so NONE of
 * them could ever see these seven. They were invisible to the entire system, permanently.
 *
 * This is the third time the same lesson has cost real work:
 *   • a deployed video with no lead        → project_orphaned_videos.md
 *   • a night that produced nothing        → check-run-productivity.mjs
 *   • a scraped lead that never published  → this script
 * 👉 RECONCILE FROM THE ARTEFACT, NOT ONLY FROM THE RECORD.
 *
 * Truth source here is the step-2 CSV — the record of what was actually scraped — checked against two
 * independent artefacts: a video on disk, and an Airtable row. A lead missing BOTH was scraped and then
 * silently dropped, and is exactly what should be rebuilt.
 *
 * Usage:
 *   node scripts/heal-unpublished-leads.mjs                 # report only
 *   node scripts/heal-unpublished-leads.mjs --apply         # rebuild them (night window only)
 *   node scripts/heal-unpublished-leads.mjs --days=14 --max=25
 *
 * Exit 0 always when reporting — this is post-hoc reconciliation and must never abort a finished night.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const csvParser = require('csv-parser');
// fileURLToPath, never new URL().pathname — this repo's path has spaces (project_orphaned_videos.md).
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER = path.dirname(HERE);
const SITE_V = path.join(path.dirname(SCRAPER), 'Rocket Growth Agency Website VS Code', 'v');
const STEP2 = path.join(SCRAPER, 'output', 'Step 2');
const { extractValidEmail, isUsableLeadRow } = require(path.join(SCRAPER, 'lib', 'email-validation.cjs'));

const arg = (n, d) => {
  const m = process.argv.find((a) => a.startsWith(`--${n}=`));
  const v = m ? Number(m.split('=')[1]) : NaN;
  return Number.isFinite(v) ? v : d;
};
const APPLY = process.argv.includes('--apply');
const DAYS = arg('days', 7);
// Cap the batch. A rebuild is ~6 minutes, so an uncapped backlog would eat the whole night and starve
// the fresh scrape. Anything over the cap is REPORTED, never silently dropped — a silent truncation
// reads as "covered everything" when it didn't.
const MAX = arg('max', 20);

const slugify = (n) => String(n || '').toLowerCase().replace(/&/g, 'and')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const readCsv = (file) => new Promise((resolve) => {
  const rows = []; let header = null;
  fs.createReadStream(file).pipe(csvParser())
    .on('headers', (h) => { header = h; })
    .on('data', (r) => rows.push(r))
    .on('end', () => resolve({ header, rows }))
    .on('error', () => resolve({ header: null, rows: [] }));
});

// ── 1. What was scraped recently, and is actually emailable ──────────────────────────────────────
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

const scraped = new Map();   // slug -> {name, file}
for (const { f } of files) {
  const { header, rows } = await readCsv(path.join(STEP2, f));
  if (!header) continue;
  const nameKey = header.find((h) => /business\s*name/i.test(h)) || header.find((h) => /^name$/i.test(h));
  if (!nameKey) continue;
  for (const row of rows) {
    const name = row[nameKey];
    if (!name) continue;
    // BOTH step-8 tests, via step-8's own code — never a second rule for the same question.
    if (!isUsableLeadRow(row)) continue;
    let ok = false;
    for (const [k, v] of Object.entries(row)) {
      if (/email/i.test(k || '') && extractValidEmail(v)) { ok = true; break; }
    }
    if (!ok) continue;
    const s = slugify(name);
    if (s && !scraped.has(s)) scraped.set(s, { name, file: f });
  }
}

// ── 2. Artefact 1: is there a video on disk? ─────────────────────────────────────────────────────
const hasVideo = (slug) => {
  try { return fs.statSync(path.join(SITE_V, slug, 'video.mp4')).size > 0; } catch { return false; }
};

// ── 3. Artefact 2: is there an Airtable row? ─────────────────────────────────────────────────────
// Failure here must NOT be read as "no lead exists" — that would rebuild every healthy lead in the
// backlog. An indeterminate probe is not a finding (feedback_indeterminate_is_not_a_finding).
async function airtableNames() {
  const env = Object.fromEntries(
    fs.readFileSync(path.join(SCRAPER, '.env'), 'utf8').split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
  const names = new Set();
  let offset;
  do {
    const u = new URL(`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(env.AIRTABLE_TABLE_NAME)}`);
    u.searchParams.set('pageSize', '100');
    if (offset) u.searchParams.set('offset', offset);
    const r = await fetch(u, { headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` } });
    if (!r.ok) throw new Error(`Airtable HTTP ${r.status}`);
    const j = await r.json();
    offset = j.offset;
    for (const rec of j.records) {
      const s = slugify(rec.fields['Business Name']);
      if (s) names.add(s);
    }
  } while (offset);
  return names;
}

let known;
try {
  known = await airtableNames();
} catch (e) {
  console.log(`heal-unpublished: ABORT — could not read Airtable (${e.message}).`);
  console.log('  Refusing to guess: treating an unreachable CRM as "no leads exist" would rebuild the entire backlog.');
  process.exit(0);
}

// ── 4. Scraped, emailable, but NO video AND NO lead ──────────────────────────────────────────────
const orphanLeads = [];
for (const [slug, info] of scraped) {
  if (hasVideo(slug)) continue;
  if (known.has(slug)) continue;   // a lead exists — the lead-based reconcilers own it
  orphanLeads.push({ slug, ...info });
}

console.log('===== UNPUBLISHED LEADS (scraped, emailable, no video, no CRM row) =====');
console.log(`scanned      : ${files.length} batch CSV(s) from the last ${DAYS} day(s)`);
console.log(`emailable    : ${scraped.size}`);
console.log(`unpublished  : ${orphanLeads.length}`);

if (!orphanLeads.length) {
  console.log('\n✅ Nothing scraped in this window was silently dropped.');
  process.exit(0);
}

const batch = orphanLeads.slice(0, MAX);
for (const o of batch) console.log(`  • ${o.slug}`);
if (orphanLeads.length > batch.length) {
  // Say what was left out. Silent truncation is how a partial pass gets read as complete.
  console.log(`\n  ⚠️  ${orphanLeads.length - batch.length} more beyond the --max=${MAX} cap — they carry to the next run.`);
}

if (!APPLY) {
  console.log('\n(report only — pass --apply to rebuild them)');
  process.exit(0);
}

// ── 5. Rebuild ───────────────────────────────────────────────────────────────────────────────────
// rebuild-broken-videos.sh can now carve a per-lead CSV out of the batch file, which is what makes
// healing a NEVER-PUBLISHED lead possible at all (feedback_the_repair_path_must_repair_a_fresh_lead).
console.log(`\n>>> rebuilding ${batch.length} lead(s)…`);
try {
  execFileSync('bash', [path.join(HERE, 'rebuild-broken-videos.sh'), ...batch.map((b) => b.slug)],
    { cwd: SCRAPER, stdio: 'inherit', env: { ...process.env } });
} catch (e) {
  // A failed rebuild must not abort the night; the ledger records per-lead failures.
  console.log(`>>> rebuild returned non-zero (${e.status ?? '?'}) — per-lead outcomes are in the failure ledger.`);
}

const after = batch.filter((b) => hasVideo(b.slug));
console.log(`\n>>> healed ${after.length}/${batch.length}.`);
process.exit(0);
