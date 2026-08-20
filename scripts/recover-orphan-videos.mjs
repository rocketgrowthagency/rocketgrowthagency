#!/usr/bin/env node
/**
 * recover-orphan-videos.mjs — give an orphaned video its lead back. (2026-08-20)
 *
 * An ORPHAN is a deployed, serving video with no Airtable lead, so it can never be emailed. Cause:
 * `rebuild-broken-videos.sh` never ran step-8, so a lead that died BEFORE step-8 in its original night
 * got a rebuilt video and still no row. See [[project-orphaned-videos]]. That is fixed forward; this
 * script cleans up the ones already on disk.
 *
 * For each orphan that still has its step-2 CSV:
 *   1. require the video to actually serve `content-type: video/mp4` — never publish a lead for a page
 *      that is not really there (the /* SPA catch-all answers 200 text/html for every absent path)
 *   2. run step-8 to create the lead (an upsert — it skips duplicate creates)
 *   3. PATCH the Video URL, because step-8 only writes it for pages built in that same run. Without
 *      this the lead exists but has no video link, which is a half-recovery that looks complete.
 *
 * Step 3 was found by recovering ONE lead first and inspecting it. Batching all 22 immediately would
 * have created 22 leads with no video link.
 *
 * Usage: node scripts/recover-orphan-videos.mjs [--apply] [--limit N]
 * Default is a dry run.
 */
import 'dotenv/config';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, NOT new URL(...).pathname — the repo path contains spaces ("Rocket Growth Agency
// Scraper VS Code") and pathname percent-encodes them as %20, producing a path that does not exist.
// The child process then silently produced no stdout and this script reported "could not read the
// orphan list" — a wrong-path failure wearing the mask of a parsing failure.
const SCRAPER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://www.rocketgrowthagency.com';
const KEY = process.env.AIRTABLE_API_KEY;
const BASE = process.env.AIRTABLE_BASE_ID;
const TABLE = process.env.AIRTABLE_TABLE_NAME || 'Leads';
const APPLY = process.argv.includes('--apply');
const LIMIT = Number((process.argv.find((a) => a.startsWith('--limit=')) || '').split('=')[1] || 0);
if (!KEY || !BASE) { console.error('✗ missing Airtable creds'); process.exit(2); }

const serves = async (slug) => {
  try {
    const r = await fetch(`${SITE}/v/${slug}/video.mp4`, { headers: { Range: 'bytes=0-0' } });
    return /video\/mp4/i.test(r.headers.get('content-type') || '');
  } catch { return false; }
};

// Sensor self-test — a slug that cannot exist must NOT read as serving.
if (await serves('zzz-control-slug-that-cannot-exist')) {
  console.error('✗ probe broken (control looks live) — refusing to publish anything.'); process.exit(2);
}

// spawnSync, not execFileSync: check-orphan-videos exits 1 WHEN ORPHANS EXIST, which is the normal
// case here. execFileSync throws on a non-zero exit and the thrown error did not carry stdout reliably,
// so the list came back empty and the script reported "could not read the orphan list".
let orphans = [];
{
  const r = spawnSync('node', [path.join(SCRAPER, 'scripts/check-orphan-videos.mjs'), '--json'],
    { cwd: SCRAPER, encoding: 'utf8' });
  const out = String(r.stdout || '').trim();
  const line = out.split('\n').filter((l) => l.trim().startsWith('{')).pop();
  if (!line) {
    console.error('✗ could not read the orphan list');
    console.error(`  exit=${r.status} stderr=${String(r.stderr || '').trim().slice(0, 200)}`);
    process.exit(2);
  }
  orphans = JSON.parse(line).recent || [];
}
if (LIMIT) orphans = orphans.slice(0, LIMIT);
console.log(`  recent orphans: ${orphans.length}`);

const csvFor = (slug) => {
  const dir = path.join(SCRAPER, 'output', 'Step 2');
  let files = [];
  try { files = fs.readdirSync(dir); } catch { return null; }
  const m = files.filter((f) => f.includes(`_${slug}-only-`) && f.endsWith('-[step-2].csv')).sort();
  return m.length ? path.join(dir, m[m.length - 1]) : null;
};

const api = (suffix = '') => `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLE)}${suffix}`;
const key = (s) => String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');

let recovered = 0, skippedNoCsv = 0, skippedNotServing = 0, failed = 0;
for (const slug of orphans) {
  const csv = csvFor(slug);
  if (!csv) { skippedNoCsv++; console.log(`  ⏭  ${slug} — no step-2 CSV (needs a re-scrape)`); continue; }
  if (!(await serves(slug))) { skippedNotServing++; console.log(`  ⏭  ${slug} — video not serving`); continue; }
  if (!APPLY) { console.log(`  ○  ${slug} — would publish lead + set Video URL`); recovered++; continue; }

  try {
    execFileSync('node', [path.join(SCRAPER, 'step-8-publish-to-airtable.mjs')],
      { cwd: SCRAPER, env: { ...process.env, STEP2_CSV: csv }, encoding: 'utf8', stdio: 'pipe' });
  } catch { failed++; console.log(`  ✗  ${slug} — step-8 failed`); continue; }

  // step-8 only writes Video URL for pages built in the same run, so set it explicitly.
  let all = [], offset;
  do {
    const r = await fetch(api(`?pageSize=100${offset ? `&offset=${offset}` : ''}`), { headers: { Authorization: `Bearer ${KEY}` } });
    const j = await r.json(); all.push(...(j.records || [])); offset = j.offset;
  } while (offset);
  const rec = all.find((r) => key(r.fields['Business Name'] || '') === key(slug));
  if (!rec) { failed++; console.log(`  ✗  ${slug} — lead not found after step-8`); continue; }
  if (rec.fields['Video URL']) { recovered++; console.log(`  ✓  ${slug} — lead present, Video URL already set`); continue; }

  const p = await fetch(api(`/${rec.id}`), {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { 'Video URL': `${SITE}/v/${slug}/` } }),
  });
  if (p.ok) { recovered++; console.log(`  ✓  ${slug} — lead created + Video URL set`); }
  else { failed++; console.log(`  ✗  ${slug} — Video URL patch failed`); }
}

console.log(`\n  ${APPLY ? 'recovered' : 'would recover'}: ${recovered}`);
console.log(`  skipped (no CSV): ${skippedNoCsv}  ·  skipped (not serving): ${skippedNotServing}  ·  failed: ${failed}`);
if (!APPLY) console.log('  (dry run — pass --apply to write)');
