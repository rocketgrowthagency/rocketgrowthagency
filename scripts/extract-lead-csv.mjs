#!/usr/bin/env node
/**
 * extract-lead-csv.mjs — carve a per-lead step-2 CSV out of a BATCH step-2 CSV.
 *
 * ─── WHY THIS EXISTS (2026-08-21) ────────────────────────────────────────────────────────────────
 * `rebuild-broken-videos.sh` could only ever find its input via:
 *
 *     ls -t "output/Step 2/"*"_${SLUG}-only-"*"-[step-2].csv"
 *
 * i.e. a PER-LEAD "-only-" CSV. Those exist only for leads that have already been rebuilt once. A lead
 * from a fresh scrape lives in the BATCH csv (`2026-08-20_dermatologists-in-culver-city-ca-[step-2].csv`)
 * and has no per-lead file at all — so the rebuild reported `no-emailable-csv` and skipped it.
 *
 * That is precisely the dead-window case. On 2026-08-20 a latched OpenAI guard skipped 12 searches; the
 * next morning 6 of the 7 Dermatologists leads could not be healed by hand, not because anything was
 * wrong with them, but because the healer could not read the only file they existed in. A repair path
 * that cannot repair a fresh lead is not a repair path.
 *
 * Matching is on the SLUGIFIED business name, the same transform the deploy path uses, so the slug the
 * operator types is the slug that gets matched.
 *
 * 🔴 Uses the real csv-parser and the SHARED email-validation lib — never hand-splits on ",". A naive
 * split misaligned columns once and REJECTED a good lead (Marissa Joy Photography); a false negative
 * here silently drops a real prospect. And the emailable test must AGREE with step-8 rather than being
 * stricter, or the build filter skips rows step-8 would happily publish (project_orphaned_videos.md).
 *
 * Usage:  node scripts/extract-lead-csv.mjs <slug>
 * Prints the written path on stdout. Exit 0 = written, 1 = no matching emailable row, 2 = bad input.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const csvParser = require('csv-parser');
// 🔴 fileURLToPath, not new URL().pathname — this repo's path contains spaces, which pathname
// percent-encodes into %20 and silently breaks every derived path.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER = path.dirname(HERE);
const { extractValidEmail, isUsableLeadRow } = require(path.join(SCRAPER, 'lib', 'email-validation.cjs'));

const STEP2 = path.join(SCRAPER, 'output', 'Step 2');
const slug = (process.argv[2] || '').trim();
if (!slug) { console.error('usage: extract-lead-csv.mjs <slug>'); process.exit(2); }

// Must match the slug rule used when the landing page is deployed.
const slugify = (n) => String(n || '').toLowerCase().replace(/&/g, 'and')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const readCsv = (file) => new Promise((resolve) => {
  const rows = []; let header = null;
  fs.createReadStream(file)
    .pipe(csvParser())
    .on('headers', (h) => { header = h; })
    .on('data', (r) => rows.push(r))
    .on('end', () => resolve({ header, rows }))
    .on('error', () => resolve({ header: null, rows: [] }));
});

const hasEmail = (row) => {
  for (const [k, v] of Object.entries(row)) {
    if (/email/i.test(k || '') && extractValidEmail(v)) return true;
  }
  return false;
};

let batches;
try {
  batches = fs.readdirSync(STEP2)
    .filter((f) => f.endsWith('-[step-2].csv') && !f.includes('-only-'))
    .map((f) => ({ f, t: fs.statSync(path.join(STEP2, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)          // newest first — the freshest record of this lead wins
    .map((x) => x.f);
} catch { console.error('no Step 2 directory'); process.exit(2); }

for (const file of batches) {
  const full = path.join(STEP2, file);
  const { header, rows } = await readCsv(full);
  if (!header || !rows.length) continue;
  const nameKey = header.find((h) => /business\s*name/i.test(h)) || header.find((h) => /^name$/i.test(h));
  if (!nameKey) continue;

  const match = rows.find((r) => slugify(r[nameKey]) === slug);
  if (!match) continue;

  // Found the lead — but only accept it if it passes BOTH tests step-8 applies, or the rebuild would
  // spend a full render on a row that can never become an emailable lead.
  if (!isUsableLeadRow(match) || !hasEmail(match)) {
    console.error(`found "${match[nameKey]}" in ${file} but it is not emailable (usable=${isUsableLeadRow(match)}, email=${hasEmail(match)})`);
    continue;
  }

  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  // Name the output the way the rebuild's own glob expects, and keep the batch's search-term suffix so
  // downstream steps still know which search this lead came from.
  const suffix = file.replace(/^\d{4}-\d{2}-\d{2}_/, '').replace(/-\[step-2\]\.csv$/, '');
  const stamp = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const dest = path.join(STEP2, `${stamp}_${slug}-only-${suffix}-[step-2].csv`);
  fs.writeFileSync(dest, [header.join(','), header.map((h) => esc(match[h])).join(',')].join('\n') + '\n');
  console.log(dest);
  process.exit(0);
}

console.error(`no emailable row for "${slug}" in any batch step-2 CSV`);
process.exit(1);
