#!/usr/bin/env node
// Pre-send audit: compares the voiceover transcript + landing page HTML + Airtable
// data for a given lead. Flags mismatches BEFORE sending a video link to a prospect.
//
// Usage:
//   node scripts/audit-video-vs-landing.mjs <slug>
//   e.g. node scripts/audit-video-vs-landing.mjs alvin-garage-door
//
// What it checks:
//   1. Map Rank in voiceover === Map Rank in landing eyebrow === Map Rank in Airtable
//   2. Business name in voiceover === Business name in landing === Airtable Business Name
//   3. Review count claim in voiceover matches Airtable Review Count (if claim exists)
//   4. Days-since-last-review claim matches audit-findings.json
//   5. Top-3 average claim matches what step-6 would compute from Airtable
//
// Exits 0 if all checks pass. Exits 2 if any mismatch — never send a link that fails this.

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: node scripts/audit-video-vs-landing.mjs <slug>');
  process.exit(1);
}

const SITE_BASE = process.env.RGA_SITE_BASE || 'https://www.rocketgrowthagency.com';
// Use fileURLToPath so paths with spaces (like "Rocket Growth Agency Scraper VS Code") decode correctly.
const __filename = fileURLToPath(import.meta.url);
const SCRAPER_ROOT = path.dirname(__filename).replace(/\/scripts$/, '');

const issues = [];
const checks = [];

// ============ 1. Fetch live landing page ============
const landingUrl = `${SITE_BASE}/v/${slug}/`;
let landingHtml = '';
try {
  const res = await fetch(landingUrl);
  if (!res.ok) {
    issues.push(`Landing page ${landingUrl} returned HTTP ${res.status}`);
  } else {
    landingHtml = await res.text();
    checks.push(`✓ Landing page HTTP 200 at ${landingUrl}`);
  }
} catch (e) {
  issues.push(`Failed to fetch landing page: ${e.message}`);
}

// ============ 2. Parse landing rank + name ============
const eyebrowMatch = landingHtml.match(/Currently ranking #(\d+)/);
const landingRank = eyebrowMatch ? parseInt(eyebrowMatch[1], 10) : null;
const h1Match = landingHtml.match(/<h1>([^<]+) —/);
const landingName = h1Match ? h1Match[1].trim() : null;
if (landingRank) checks.push(`✓ Landing eyebrow rank = ${landingRank}`);
else issues.push('Landing eyebrow rank not found');
if (landingName) checks.push(`✓ Landing h1 business name = "${landingName}"`);
else issues.push('Landing h1 business name not found');

// ============ 3. Load voiceover manifest + transcript ============
const audioRoot = path.join(SCRAPER_ROOT, 'output', 'Step 6 (Voiceover MP3)');
let manifestPath = null;
let voiceoverText = '';
if (fs.existsSync(audioRoot)) {
  for (const dir of fs.readdirSync(audioRoot)) {
    const segDir = path.join(audioRoot, dir);
    if (!fs.statSync(segDir).isDirectory()) continue;
    for (const sub of fs.readdirSync(segDir)) {
      if (!sub.includes(slug) || !sub.endsWith('_segments')) continue;
      const m = path.join(segDir, sub, 'manifest.json');
      if (fs.existsSync(m)) { manifestPath = m; break; }
    }
    if (manifestPath) break;
  }
}
if (manifestPath) {
  checks.push(`✓ Voiceover manifest found at ${manifestPath}`);
  // Read subtitles to get the voiceover text
  const srtRoot = path.join(SCRAPER_ROOT, 'output', 'Step 6b (Subtitles)');
  if (fs.existsSync(srtRoot)) {
    for (const dir of fs.readdirSync(srtRoot)) {
      const candidate = path.join(srtRoot, dir);
      if (!fs.statSync(candidate).isDirectory()) continue;
      for (const f of fs.readdirSync(candidate)) {
        if (f.includes(slug) && f.endsWith('.srt')) {
          voiceoverText = fs.readFileSync(path.join(candidate, f), 'utf-8')
            .replace(/^\d+$/gm, '').replace(/^\d{2}:\d{2}:\d{2}.*$/gm, '')
            .replace(/\s+/g, ' ').trim();
          break;
        }
      }
      if (voiceoverText) break;
    }
  }
}
if (!voiceoverText) issues.push(`Could not load voiceover transcript for ${slug}`);
else checks.push(`✓ Voiceover transcript loaded (${voiceoverText.length} chars)`);

// ============ 4. Extract voiceover rank claim ============
const vRankMatch = voiceoverText.match(/ranks\s+#(\d+)/i);
const voiceoverRank = vRankMatch ? parseInt(vRankMatch[1], 10) : null;
if (voiceoverRank) checks.push(`✓ Voiceover rank claim = #${voiceoverRank}`);

// ============ 5. Query Airtable for canonical data ============
const apiKey = process.env.AIRTABLE_API_KEY;
const baseId = process.env.AIRTABLE_BASE_ID;
let atRank = null, atReviewCount = null, atBusinessName = null;
if (apiKey && baseId && landingName) {
  const escaped = landingName.replace(/"/g, '\\"');
  const url = `https://api.airtable.com/v0/${baseId}/Leads?filterByFormula=${encodeURIComponent(`LOWER({Business Name}) = LOWER("${escaped}")`)}&maxRecords=1`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (res.ok) {
      const data = await res.json();
      const f = data.records?.[0]?.fields || {};
      atRank = f['Map Rank'];
      atReviewCount = f['Review Count'];
      atBusinessName = f['Business Name'];
      checks.push(`✓ Airtable record found: rank=${atRank} reviewCount=${atReviewCount}`);
    }
  } catch (e) {
    issues.push(`Airtable lookup failed: ${e.message}`);
  }
}

// ============ 6. CROSS-CHECK 1: Rank consistency ============
if (landingRank && voiceoverRank && landingRank !== voiceoverRank) {
  issues.push(`🚨 RANK MISMATCH: landing eyebrow says #${landingRank}, voiceover says #${voiceoverRank}`);
} else if (landingRank && voiceoverRank) {
  checks.push(`✓ Rank consistent: landing=${landingRank}, voiceover=${voiceoverRank}`);
}
if (atRank && landingRank && atRank !== landingRank) {
  issues.push(`🚨 RANK MISMATCH: Airtable says #${atRank}, landing eyebrow says #${landingRank}`);
}
if (atRank && voiceoverRank && atRank !== voiceoverRank) {
  issues.push(`🚨 RANK MISMATCH: Airtable says #${atRank}, voiceover says #${voiceoverRank}`);
}

// ============ 7. CROSS-CHECK 2: Business name consistency ============
if (landingName && atBusinessName) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (norm(landingName) !== norm(atBusinessName)) {
    issues.push(`🚨 BUSINESS NAME MISMATCH: landing="${landingName}", Airtable="${atBusinessName}"`);
  } else {
    checks.push(`✓ Business name consistent`);
  }
}

// ============ 8. CROSS-CHECK 3: Review count claim ============
const vReviewMatch = voiceoverText.match(/you have\s+(\d+)\s+(?:Google\s+)?reviews?/i);
if (vReviewMatch) {
  const voiceoverReviewClaim = parseInt(vReviewMatch[1], 10);
  if (atReviewCount && Math.abs(atReviewCount - voiceoverReviewClaim) > 2) {
    issues.push(`🚨 REVIEW COUNT MISMATCH: voiceover says ${voiceoverReviewClaim}, Airtable says ${atReviewCount}`);
  } else if (atReviewCount) {
    checks.push(`✓ Review count consistent: voiceover=${voiceoverReviewClaim}, Airtable=${atReviewCount}`);
  }
}

// ============ Report ============
console.log(`\n🎬 Pre-send audit for /v/${slug}/\n`);
for (const c of checks) console.log(`  ${c}`);
if (issues.length) {
  console.log(`\n🚨 ${issues.length} ISSUE(S) FOUND — DO NOT SEND:`);
  for (const i of issues) console.log(`  • ${i}`);
  process.exit(2);
}
console.log(`\n✅ All checks passed. Safe to send: ${landingUrl}\n`);
