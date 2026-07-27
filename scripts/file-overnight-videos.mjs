#!/usr/bin/env node
/**
 * file-overnight-videos.mjs — files a night's deployed-video list into a dated folder tree so the
 * overnight video reports accumulate as history (mirrors the daily-action-report structure, but a
 * SEPARATE tree):
 *
 *   reports/overnight-videos/<YYYY>/<MM-Month>/<DD>_overnight-videos_<YYYY-MM-DD>.md
 *
 * Reads the night's /tmp/overnight-local-<date>.log (or DATE=YYYY-MM-DD), groups deployed videos by
 * vertical, keeps only pages that still exist on disk (deleted/off-vertical ones drop out), and
 * writes the dated report. Run at the END of overnight-local.sh.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n').filter(Boolean).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const WEBSITE_DIR = env.WEBSITE_DIR || '/Users/chris/RGA/Rocket Growth Agency Website VS Code';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const date = process.env.DATE || new Date().toISOString().slice(0, 10);
const d = new Date(date + 'T12:00:00');
const yyyy = d.getFullYear(), mm = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
const LOG = `/tmp/overnight-local-${date}.log`;
if (!fs.existsSync(LOG)) { console.log(`no overnight log for ${date} (${LOG}) — nothing to file.`); process.exit(0); }

const lines = fs.readFileSync(LOG, 'utf8').split('\n');
let cur = null; const groups = {}; const order = []; const seen = new Set(); let dropped = 0;
for (const ln of lines) {
  const h = ln.match(/^=== Overnight pipeline: (.+?) ===/);
  if (h) { cur = h[1]; if (!groups[cur]) { groups[cur] = []; order.push(cur); } continue; }
  const m = ln.match(/(https?:\/\/www\.rocketgrowthagency\.com\/v\/([a-z0-9-]+)\/?)/i);
  if (m && cur) {
    const url = m[1], slug = m[2];
    if (seen.has(url)) continue; seen.add(url);
    if (!fs.existsSync(path.join(WEBSITE_DIR, 'v', slug))) { dropped++; continue; }  // deleted/off-vertical
    let name = (ln.match(/\*\*(.+?)\*\*/) || [])[1];
    if (!name || /^free quote/i.test(name)) name = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const sig = (ln.match(/(\d\/6 signals verified)/) || [])[1] || '';
    groups[cur].push({ name: name.trim(), url, sig });
  }
}
let total = 0; const summary = [];
for (const g of order) { const v = groups[g]; if (v.length) { total += v.length; summary.push([g, v.length]); } }

// Was this a CLEAN end-of-run filing, or a partial/hung log? A complete run reaches the
// "overnight-local DONE" marker before this reporter runs. If it's absent (the log was truncated
// by a hang, or the reporter was run manually mid-run), the count below can UNDERCOUNT — say so
// loudly rather than silently under-reporting (the 2026-07-24 hung run showed 28 not 42 this way).
const runComplete = lines.some((l) => /=== overnight-local DONE/.test(l));

let md = `# Overnight Videos — ${WEEK[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}, ${yyyy}\n\n`;
if (!runComplete) md += `> ⚠️ **Run log is incomplete** (no clean end-of-run marker) — this count may be PARTIAL. Cross-check with \`node scripts/reconcile-missing-videos.mjs\` and \`node scripts/pipeline-status.mjs\`.\n\n`;
md += `**${total} videos deployed** across ${summary.length} search${summary.length === 1 ? '' : 'es'} (only live, in-vertical, 6/6-gated videos shown; ${dropped} off-vertical/removed filtered out).\n\n`;
if (summary.length) { md += `| Search | Videos |\n|---|---|\n`; summary.forEach(([g, n]) => md += `| ${g.replace(/, CA$/, '')} | ${n} |\n`); }
else md += `_No videos deployed this run._\n`;
for (const g of order) { const v = groups[g]; if (!v.length) continue; md += `\n## ${g.replace(/, CA$/, '')} — ${v.length}\n\n`; v.forEach((x, i) => md += `${i + 1}. [${x.name}](${x.url})${x.sig ? `  _(${x.sig})_` : ''}\n`); }
md += `\n---\n_Filed ${date}. Browse \`reports/overnight-videos/${yyyy}/${mm}-${MONTHS[d.getMonth()]}/\` for history._\n`;

const dir = path.join(WEBSITE_DIR, 'reports', 'overnight-videos', String(yyyy), `${mm}-${MONTHS[d.getMonth()]}`);
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${dd}_overnight-videos_${date}.md`);
fs.writeFileSync(file, md);
console.log(`overnight videos filed → reports/overnight-videos/${yyyy}/${mm}-${MONTHS[d.getMonth()]}/${dd}_overnight-videos_${date}.md  (${total} videos)`);
