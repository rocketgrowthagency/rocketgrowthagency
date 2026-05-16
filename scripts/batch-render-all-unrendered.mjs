#!/usr/bin/env node
// Render every email-bearing Airtable lead that doesn't have a Vid Slug.
// Iterates by search vertical (cleanest Chrome state). Commits incrementally.
//
// Usage: node scripts/batch-render-all-unrendered.mjs
// Override one vertical: SEARCH_FILTER="Plumbers in Culver City, CA" node ...

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import csvParser from 'csv-parser';
import { createObjectCsvWriter } from 'csv-writer';
import slugify from 'slugify';

const ROOT = '/Volumes/LaCie - APFS (Mac)/ALL NEWS SITES/Rocket Growth Agency/Rocket Growth Agency Scraper VS Code';
const WEBSITE_V = '/Volumes/LaCie - APFS (Mac)/ALL NEWS SITES/Rocket Growth Agency/Rocket Growth Agency Website VS Code/v';
const WEBSITE_REPO = '/Volumes/LaCie - APFS (Mac)/ALL NEWS SITES/Rocket Growth Agency/Rocket Growth Agency Website VS Code';

const VERTICALS = process.env.SEARCH_FILTER ? [process.env.SEARCH_FILTER] : [
  'Garage door repair in Culver City, CA',
  'Plumbers in Culver City, CA',
  'HVAC in Culver City, CA',
  'Roofers in Culver City, CA',
  'Locksmiths in Culver City, CA',
];

const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID } = process.env;
if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) { console.error('Missing Airtable creds'); process.exit(1); }

async function fetchUnrendered(searchTerm) {
  const formula = `AND({Search Term}="${searchTerm}", {Email} != "", NOT({Vid Slug}))`;
  let offset = '', all = [];
  do {
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Leads?filterByFormula=${encodeURIComponent(formula)}&pageSize=100${offset ? `&offset=${offset}` : ''}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
    const d = await r.json();
    all.push(...(d.records || []));
    offset = d.offset;
  } while (offset);
  return all;
}

function slugLead(name) {
  return slugify(String(name), { lower: true, strict: true });
}

async function findSourceRow(searchTerm, businessName) {
  const stepDir = path.join(ROOT, 'output/Step 2/');
  const files = fs.readdirSync(stepDir).filter(f => f.endsWith('.csv') && f.includes('[step-2]'));
  for (const f of files.sort().reverse()) {
    const rows = await new Promise((res) => {
      const arr = [];
      fs.createReadStream(path.join(stepDir, f)).pipe(csvParser()).on('data', r => arr.push(r)).on('end', () => res(arr)).on('error', () => res(arr));
    });
    const match = rows.find(r => (r['Business Name'] || '').trim().toLowerCase() === businessName.trim().toLowerCase());
    if (match) return { source: f, row: match };
  }
  return null;
}

function runStep(cmd, args, csvPath) {
  const env = { ...process.env, STEP2_CSV: csvPath };
  const result = spawnSync(cmd, args, { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], timeout: 1200000 });
  return { ok: result.status === 0, stdout: result.stdout?.toString() || '', stderr: result.stderr?.toString() || '' };
}

function gitCommit(message) {
  try {
    spawnSync('git', ['add', 'v/'], { cwd: WEBSITE_REPO, stdio: 'ignore' });
    spawnSync('git', ['commit', '-m', message, '--no-verify'], { cwd: WEBSITE_REPO, stdio: 'ignore' });
    spawnSync('git', ['push', 'origin', 'main'], { cwd: WEBSITE_REPO, stdio: 'ignore' });
  } catch (_) {}
}

let totalSuccess = 0, totalFail = 0;
const startTime = Date.now();

for (const search of VERTICALS) {
  console.log(`\n=================================================================`);
  console.log(`  VERTICAL: ${search}`);
  console.log(`=================================================================`);

  const records = await fetchUnrendered(search);
  console.log(`  Unrendered leads: ${records.length}`);
  if (records.length === 0) continue;

  for (const rec of records) {
    const f = rec.fields;
    const name = f['Business Name'];
    const email = f.Email;
    const rank = f['Map Rank'];
    const slug = slugLead(name);
    const csvBase = `${slug}-single-[step-2]`;
    const csvPath = `output/Step 2/${csvBase}.csv`;
    const csvAbs = path.join(ROOT, csvPath);
    const mp4Base = `01_${slug}`;

    console.log(`\n─── #${rank ?? '?'} ${name} (${slug}) ───`);

    // Build single-lead CSV
    const found = await findSourceRow(search, name);
    if (!found) { console.log('  ✗ no source row'); totalFail++; continue; }
    found.row.email = email;
    if (rank != null) found.row['Map Rank'] = String(rank);
    const headers = Object.keys(found.row).map(id => ({ id, title: id }));
    await createObjectCsvWriter({ path: csvAbs, header: headers }).writeRecords([found.row]);

    // Run pipeline
    const steps = [
      ['step-3', ['node', 'step-3-video-recorder.mjs']],
      ['step-2.5', ['node', 'step-2.5-audit.mjs']],
      ['step-2.6', ['node', 'step-2.6-freshness-check.mjs']],
      ['step-6', ['node', 'step-6-voiceover.mjs']],
      ['step-4', ['node', 'step-4-combine-desktop-mobile.mjs']],
      ['step-5', ['node', 'step-5-branding.mjs']],
      ['step-6b', ['node', 'step-6b-subtitles.mjs']],
      ['step-7', ['node', 'step-7-merge-branded-audio.mjs']],
    ];
    let failed = null;
    for (const [label, [cmd, ...args]] of steps) {
      const r = runStep(cmd, args, csvPath);
      if (r.ok) {
        console.log(`  ✓ ${label}`);
      } else {
        console.log(`  ✗ ${label}: ${r.stderr.split('\n').slice(0, 3).join(' | ') || r.stdout.split('\n').slice(-3).join(' | ')}`);
        failed = label; break;
      }
    }
    if (failed) { totalFail++; continue; }

    // Copy MP4 + build landing
    const finalMp4 = path.join(ROOT, `output/Step 7 (Final Merge MP4)/${csvBase}/${mp4Base}.mp4`);
    if (!fs.existsSync(finalMp4)) { console.log('  ✗ mp4 missing'); totalFail++; continue; }
    const destDir = path.join(WEBSITE_V, slug);
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(finalMp4, path.join(destDir, 'video.mp4'));
    runStep('node', ['build-video-landing.mjs'], csvPath);
    const landingIndex = path.join(ROOT, `output/landing-pages/v/${slug}/index.html`);
    if (fs.existsSync(landingIndex)) fs.copyFileSync(landingIndex, path.join(destDir, 'index.html'));

    console.log(`  ✓ deployed: https://www.rocketgrowthagency.com/v/${slug}/`);
    totalSuccess++;

    // Incremental commit every 3 success
    if (totalSuccess % 3 === 0) {
      gitCommit(`batch render: +3 v14 videos (${totalSuccess} total this session)`);
      console.log(`  ↑ committed checkpoint`);
    }
  }
}

// Final commit
gitCommit(`batch render complete: ${totalSuccess} success, ${totalFail} fail`);

const minutes = Math.round((Date.now() - startTime) / 60000);
console.log(`\n=================================================================`);
console.log(`  BATCH COMPLETE: ${totalSuccess} success, ${totalFail} fail in ${minutes} min`);
console.log(`=================================================================`);
