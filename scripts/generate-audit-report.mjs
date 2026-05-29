#!/usr/bin/env node
// scripts/generate-audit-report.mjs
//
// End-of-session human-audit report. Reads each deployed lead's
// voiceover manifest + audit-findings.json and writes a markdown file
// that shows Chris (a) the EXACT findings that shipped in the voiceover
// and (b) the raw audit data behind each finding — so he can verify in
// 30 seconds per lead whether each claim is accurate.
//
// Usage:
//   node scripts/generate-audit-report.mjs <date-stamp> <search-slug> [outpath]
//   node scripts/generate-audit-report.mjs --latest                            # auto-detect latest run
//
// Examples:
//   node scripts/generate-audit-report.mjs 2026-05-29 plumbers-in-long-beach-ca
//   node scripts/generate-audit-report.mjs --latest /tmp/audit-report.md
//
// Memory: project_video_master.md § "What's working / known gaps"

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const STEP6_DIR = path.join(REPO, 'output', 'Step 6 (Voiceover MP3)');
const AUDIT_DIR = path.join(REPO, 'output', 'Step 2.5 (Audit)');

// ---- Arg parsing ----
const args = process.argv.slice(2);
let dateStamp = null;
let searchSlug = null;
let outPath = null;
if (args.includes('--latest')) {
  // Find most recent manifest.json
  const dirs = fs.existsSync(STEP6_DIR)
    ? fs.readdirSync(STEP6_DIR).filter(d => /^\d{4}-\d{2}-\d{2}_/.test(d))
    : [];
  if (!dirs.length) {
    console.error('No Step 6 dirs found.');
    process.exit(1);
  }
  // Sort by mtime
  dirs.sort((a, b) => fs.statSync(path.join(STEP6_DIR, b)).mtimeMs - fs.statSync(path.join(STEP6_DIR, a)).mtimeMs);
  const newest = dirs[0];
  const m = newest.match(/^(\d{4}-\d{2}-\d{2})_(.+?)-only-(.+?)-\[step-2\]$/);
  if (m) {
    dateStamp = m[1];
    searchSlug = m[3];
  }
  outPath = args.find(a => a.startsWith('/')) || `/tmp/audit-report-${dateStamp}-${searchSlug}.md`;
} else {
  dateStamp = args[0];
  searchSlug = args[1];
  outPath = args[2] || `/tmp/audit-report-${dateStamp}-${searchSlug}.md`;
}

if (!dateStamp || !searchSlug) {
  console.error('Usage: generate-audit-report.mjs <date-stamp> <search-slug> [outpath]');
  console.error('       generate-audit-report.mjs --latest [outpath]');
  process.exit(1);
}

// ---- Find all leads for this run ----
function findLeads() {
  if (!fs.existsSync(STEP6_DIR)) return [];
  const dirs = fs.readdirSync(STEP6_DIR);
  const matchingDirs = dirs.filter(d =>
    d.startsWith(`${dateStamp}_`) && d.includes(`-only-${searchSlug}-[step-2]`)
  );
  return matchingDirs.map(d => {
    const m = d.match(/^\d{4}-\d{2}-\d{2}_(.+?)-only-/);
    return {
      bizSlug: m ? m[1] : d,
      step6Dir: path.join(STEP6_DIR, d),
      auditDir: path.join(AUDIT_DIR, d),
    };
  });
}

// ---- Format helpers ----
function fmtField(v) {
  if (v === null) return '`null`';
  if (v === undefined) return '`undefined`';
  if (v === true || v === false) return `\`${v}\``;
  if (typeof v === 'number') return `\`${v}\``;
  if (typeof v === 'string') return v.length > 80 ? `\`${v.slice(0, 80)}…\`` : `\`${v}\``;
  if (Array.isArray(v)) return v.length === 0 ? '`[]`' : `\`[${v.length} items]\``;
  if (typeof v === 'object') return '`{…}`';
  return String(v);
}

function readManifest(step6Dir) {
  // Find the lead's manifest.json (one level deeper in segments/)
  const subs = fs.existsSync(step6Dir) ? fs.readdirSync(step6Dir) : [];
  for (const s of subs) {
    const p = path.join(step6Dir, s, 'manifest.json');
    if (fs.existsSync(p)) {
      try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch (_) { return null; }
    }
  }
  return null;
}

function readAudit(auditDir) {
  const p = path.join(auditDir, 'audit-findings.json');
  if (!fs.existsSync(p)) return null;
  try {
    const all = JSON.parse(fs.readFileSync(p, 'utf-8'));
    // The file is keyed by biz-slug → single object
    const keys = Object.keys(all);
    return keys.length ? all[keys[0]] : null;
  } catch (_) { return null; }
}

// ---- Build per-lead section ----
function leadSection(lead) {
  const manifest = readManifest(lead.step6Dir);
  const audit = readAudit(lead.auditDir);
  if (!manifest && !audit) {
    return `### ❌ ${lead.bizSlug}\n\nNo manifest + no audit JSON found — likely failed at step-3 (incomplete WebMs).\n`;
  }
  const lines = [];
  const bizName = manifest?.business_name || audit?.businessName || lead.bizSlug;
  const rank = audit?.rank || '—';
  const liveUrl = `https://www.rocketgrowthagency.com/v/${lead.bizSlug}/`;
  lines.push(`### ${bizName}`);
  lines.push('');
  lines.push(`- **URL:** ${liveUrl}`);
  lines.push(`- **Rank:** #${rank}`);
  if (manifest?.verificationSummary) {
    lines.push(`- **Verification:** ${manifest.verificationSummary}`);
  }
  lines.push('');

  if (manifest?.segments) {
    for (const segName of ['intro', 'maps', 'website', 'mobile', 'outro']) {
      const seg = manifest.segments[segName];
      if (!seg) continue;
      const dur = seg.durationSeconds ?? '—';
      lines.push(`#### ${segName.toUpperCase()} (${typeof dur === 'number' ? dur.toFixed(2) + 's' : dur})`);
      lines.push('');
      lines.push('> ' + (seg.text || '').replace(/\n+/g, ' ').trim());
      lines.push('');
    }
  } else {
    lines.push('_No voiceover manifest — likely failed before step-6._');
    lines.push('');
  }

  // Raw audit snapshot (key fields the prospect could fact-check)
  if (audit) {
    lines.push('#### Raw audit signals (for human verification)');
    lines.push('');
    lines.push('| Field | Value |');
    lines.push('|---|---|');
    const gbp = audit.gbp || {};
    const w = audit.website || {};
    const m = audit.mobile || {};
    const KEYS = [
      ['gbp.primaryCategory', gbp.primaryCategory],
      ['gbp.primaryCategoryMatchesSearch', gbp.primaryCategoryMatchesSearch],
      ['gbp.reviewCount', gbp.reviewCount],
      ['gbp.daysSinceLastReview', gbp.daysSinceLastReview],
      ['gbp.ownerResponseCount', gbp.ownerResponseCount],
      ['gbp.reviewsParsedCount', gbp.reviewsParsedCount],
      ['gbp.hasBusinessHours', gbp.hasBusinessHours],
      ['gbp.hasPosts (verified)', `${gbp.hasPosts} (verified=${!!gbp.postsVerified})`],
      ['gbp.description (verified)', `${gbp.descriptionLength}ch (verified=${!!gbp.descriptionVerified})`],
      ['gbp.gbpSocialProfileCount', gbp.gbpSocialProfileCount],
      ['website.websiteUrl', w.websiteUrl],
      ['website.suspectWebsiteMismatch', w.suspectWebsiteMismatch],
      ['website.websiteSuspectReason', w.websiteSuspectReason],
      ['website.prominentSitePhone', w.prominentSitePhone],
      ['website.prominentPhoneMatchesGbp', w.prominentPhoneMatchesGbp],
      ['website.distinctSitePhoneCount', w.distinctSitePhoneCount],
      ['website.hasLocalBusinessSchema', w.hasLocalBusinessSchema],
      ['website.pageLoadSeconds', w.pageLoadSeconds],
      ['website.napAboveFold', w.napAboveFold],
      ['mobile.pageLoadSeconds', m.pageLoadSeconds],
      ['mobile.primaryCtaTapTargetPx', m.primaryCtaTapTargetPx],
      ['mobile.hasStickyCta', m.hasStickyCta],
      ['mobile.hasChatWidget', m.hasChatWidget],
    ];
    for (const [k, v] of KEYS) {
      lines.push(`| \`${k}\` | ${fmtField(v)} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ---- Main ----
const leads = findLeads();
if (!leads.length) {
  console.error(`No leads found for ${dateStamp} / ${searchSlug}`);
  process.exit(1);
}

const out = [];
out.push(`# Audit report — ${dateStamp} — ${searchSlug.replace(/-/g, ' ')}`);
out.push('');
out.push(`Generated: ${new Date().toISOString()}`);
out.push(`Leads: ${leads.length}`);
out.push('');
out.push('---');
out.push('');
out.push('## How to use this report');
out.push('');
out.push('Each lead section shows the EXACT voiceover text that shipped in the video (per segment) ');
out.push('PLUS the raw audit signals that drove each finding. For each lead, spot-check:');
out.push('');
out.push('1. **Read the voiceover quotes** — do the claims sound right for this business?');
out.push('2. **Open the live URL** in another tab — does the website actually match what the script says?');
out.push('3. **Look at the raw signals** — if a claim seems wrong, check whether the underlying audit data is wrong (extractor bug) or whether the script misinterprets correct data (script bug).');
out.push('');
out.push('Report any flagged item back to me — I\'ll fix the extractor or the script logic.');
out.push('');
out.push('---');
out.push('');

for (const lead of leads) {
  out.push(leadSection(lead));
  out.push('---');
  out.push('');
}

fs.writeFileSync(outPath, out.join('\n'));
console.log(`✓ Audit report written: ${outPath}`);
console.log(`  ${leads.length} leads, ${(fs.statSync(outPath).size / 1024).toFixed(1)} KB`);
