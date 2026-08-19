#!/usr/bin/env node
/**
 * report-status-now.mjs — re-issue a past overnight report as it stands TODAY: which of its leads now
 * have a working video, and which still don't. (2026-08-19)
 *
 * The original report is a snapshot of one night. Leads get rebuilt afterwards by the recovery routes,
 * so days later the report no longer describes reality. This re-checks every lead it mentions against
 * the LIVE SITE and re-issues it as FIXED / STILL BROKEN.
 *
 * Liveness is decided by CONTENT TYPE, never a status code: netlify.toml ends in a /* SPA catch-all, so
 * every absent path answers 200 text/html — an invented slug returns 200 and so does its /video.mp4.
 * See feedback_curl_status_is_useless_check_content_type.
 *
 * Usage: node scripts/report-status-now.mjs 2026-08-15 [--write]
 *   --write also saves it next to the original as <DD>_status-now_<date>.md
 */
import fs from 'node:fs';
import path from 'node:path';

const WEBSITE = '/Users/chris/RGA/Rocket Growth Agency Website VS Code';
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const SITE = 'https://www.rocketgrowthagency.com';
const date = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
const WRITE = process.argv.includes('--write');
if (!date) { console.error('usage: node scripts/report-status-now.mjs YYYY-MM-DD [--write]'); process.exit(1); }

const [y, m, dd] = date.split('-');
const rel = `reports/overnight/${y}/${m}-${MONTHS[+m - 1]}/${dd}_overnight-report_${date}.md`;
const abs = path.join(WEBSITE, rel);
if (!fs.existsSync(abs)) { console.error(`No report at ${rel}`); process.exit(1); }
const src = fs.readFileSync(abs, 'utf8');

const slugify = (s) => String(s).toLowerCase()
  .replace(/&/g, ' and ').replace(/\|/g, ' or ')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const IND = (c) => c === 403 || c === 429 || c === 408 || (typeof c === 'number' && c >= 500) || c === 'ERR';
async function once(slug) {
  try { const r = await fetch(`${SITE}/v/${slug}/video.mp4`, { headers: { Range: 'bytes=0-0' } });
    return { code: r.status, ct: r.headers.get('content-type') || '' }; }
  catch (e) { return { code: 'ERR', ct: String(e.message).slice(0, 40) }; }
}
async function live(slug) {
  let r = await once(slug);
  for (let a = 1; a <= 4 && IND(r.code); a++) { await sleep(a * 1500); r = await once(slug); }
  if (IND(r.code)) return null;
  return /video\/mp4/i.test(r.ct);
}

// Sensor self-test — a slug that cannot exist must read as not-a-video, else refuse to report.
if (await live('zzz-control-slug-that-cannot-exist') !== false) {
  console.error('❌ probe broken (control looks like a video) — refusing to report.'); process.exit(2);
}

const cat = (src.match(/^\*\*Category:\*\*\s*(.+)$/m) || [])[1]?.trim() || '?';
const loc = (src.match(/^\*\*Location:\*\*\s*(.+)$/m) || [])[1]?.trim() || '?';

// Deployed rows:  N. **Name** — https://…/v/slug/
const deployed = [];
{
  const sec = (src.split(/^##\s+Videos deployed[^\n]*$/m)[1] || '').split(/^##\s+/m)[0];
  for (const line of sec.split('\n')) {
    const mm = line.match(/^\s*\d+\.\s*\*\*(.+?)\*\*\s*—\s*(https?:\/\/\S*?\/v\/([^/\s]+)\/?)/);
    if (mm) deployed.push({ name: mm[1].trim(), slug: mm[3] });
  }
}
// Failure rows:  - **Name** — reason
const failed = [];
{
  const sec = (src.split(/^##\s+Issues \/ errors\s*$/m)[1] || '').split(/^##\s+/m)[0];
  for (const line of sec.split('\n')) {
    const mm = line.match(/^-\s+\*\*(.+?)\*\*\s*—\s*(.+)$/);
    if (!mm || /^none\b/i.test(mm[1])) continue;
    failed.push({ name: mm[1].trim(), slug: slugify(mm[1].trim()), reason: mm[2].trim() });
  }
}
const seen = new Set();
const all = [...deployed.map((d) => ({ ...d, wasDeployed: true, reason: '' })), ...failed.map((f) => ({ ...f, wasDeployed: false }))]
  .filter((r) => (seen.has(r.slug) ? false : (seen.add(r.slug), true)));

const CONC = 6; let i = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  while (i < all.length) { const r = all[i++]; r.live = await live(r.slug); }
}));

const stillGood = all.filter((r) => r.wasDeployed && r.live === true);
const regressed = all.filter((r) => r.wasDeployed && r.live === false);
const fixed = all.filter((r) => !r.wasDeployed && r.live === true);
const broken = all.filter((r) => !r.wasDeployed && r.live === false);
const unknown = all.filter((r) => r.live === null);

const L = (r) => `[${r.name}](${SITE}/v/${r.slug}/)`;
const out = [];
out.push(`# Status now — ${cat} in ${loc} (original run ${date})`);
out.push(``);
out.push(`Re-checked ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC against the live site.`);
out.push(`Liveness = the video.mp4 responds with content-type \`video/mp4\`; a status code proves nothing here.`);
out.push(``);
out.push(`| | count |`);
out.push(`|---|---|`);
out.push(`| ✅ shipped that night, still good | ${stillGood.length} |`);
out.push(`| 🎉 failed that night, FIXED since | ${fixed.length} |`);
out.push(`| 🔴 failed that night, still broken | ${broken.length} |`);
if (regressed.length) out.push(`| ⚠️ shipped that night, now MISSING | ${regressed.length} |`);
if (unknown.length) out.push(`| ❓ could not determine | ${unknown.length} |`);
out.push(``);
if (fixed.length) { out.push(`## 🎉 Fixed since (${fixed.length}) — click to review`); fixed.forEach((r, n) => out.push(`${n + 1}. ${L(r)}`)); out.push(``); }
if (stillGood.length) { out.push(`## ✅ Shipped that night, still live (${stillGood.length})`); stillGood.forEach((r, n) => out.push(`${n + 1}. ${L(r)}`)); out.push(``); }
if (regressed.length) { out.push(`## ⚠️ Shipped that night but NO LONGER serving (${regressed.length})`); regressed.forEach((r) => out.push(`- ${r.name} — \`/v/${r.slug}/\``)); out.push(``); }
if (broken.length) {
  out.push(`## 🔴 Still broken (${broken.length}) — original reason`);
  const byReason = new Map();
  for (const r of broken) { const k = r.reason.replace(/^🚫 BLOCKED BY GATE — /, '').split(/ at |:/)[0].slice(0, 60); if (!byReason.has(k)) byReason.set(k, []); byReason.get(k).push(r); }
  for (const [k, rs] of [...byReason.entries()].sort((a, b) => b[1].length - a[1].length)) {
    out.push(`- **${k}** — ${rs.length}: ${rs.map((r) => r.name).join(', ')}`);
  }
  out.push(``);
}
if (unknown.length) { out.push(`## ❓ Indeterminate (${unknown.length}) — rate-limited, NOT counted as broken`); unknown.forEach((r) => out.push(`- ${r.name}`)); out.push(``); }

const text = out.join('\n');
console.log(text);
if (WRITE) {
  const outRel = `reports/overnight/${y}/${m}-${MONTHS[+m - 1]}/${dd}_status-now_${date}.md`;
  fs.writeFileSync(path.join(WEBSITE, outRel), text + '\n');
  console.log(`\n📄 written → ${outRel}`);
}
