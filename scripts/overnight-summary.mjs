#!/usr/bin/env node
/*
 * overnight-summary.mjs — print the LOCKED in-chat summary for an overnight run, straight from its
 * report file. Use this ANY time Chris asks to "send the report" / "review the videos" — do NOT
 * hand-assemble a summary or an inline video list (that drifts from the locked format). The pipeline
 * already writes the full report; this just emits the fixed chat summary + the clickable link.
 *
 * The report lives in the WEBSITE workspace (NOT this Scraper repo):
 *   <website>/reports/overnight/<YYYY>/<MM-Month>/<DD>_overnight-report_<YYYY-MM-DD>.md
 *
 * Usage:
 *   node scripts/overnight-summary.mjs                 # latest report
 *   node scripts/overnight-summary.mjs 2026-08-09      # one specific date
 *   node scripts/overnight-summary.mjs 2026-08-08 2026-08-09   # several (each printed in order)
 *
 * Format spec (do-not-regress): feedback_overnight_report_format.md.
 */
import fs from 'fs';
import path from 'path';

const WEBSITE = '/Users/chris/RGA/Rocket Growth Agency Website VS Code';
const ROOT = path.join(WEBSITE, 'reports', 'overnight');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// relative path from the Website workspace root (what the clickable link must use)
const relFor = (d) => {
  const [y, m, dd] = d.split('-');
  return `reports/overnight/${y}/${m}-${MONTHS[+m - 1]}/${dd}_overnight-report_${d}.md`;
};

function latestDate() {
  const dates = [];
  for (const y of fs.existsSync(ROOT) ? fs.readdirSync(ROOT) : []) {
    const yd = path.join(ROOT, y);
    if (!fs.statSync(yd).isDirectory()) continue;
    for (const mm of fs.readdirSync(yd)) {
      const md = path.join(yd, mm);
      if (!fs.statSync(md).isDirectory()) continue;
      for (const f of fs.readdirSync(md)) {
        const m = f.match(/^(\d{2})_overnight-report_(\d{4}-\d{2}-\d{2})\.md$/);
        if (m) dates.push(m[2]);
      }
    }
  }
  return dates.sort().pop();
}

const field = (s, label) => (s.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*(.+)`)) || [])[1]?.trim() || '?';
const count = (s, row) => (s.match(new RegExp(`\\|\\s*${row}\\s*\\|\\s*(\\d+)\\s*\\|`)) || [])[1] || '?';

function summary(date) {
  const rel = relFor(date);
  const abs = path.join(WEBSITE, rel);
  if (!fs.existsSync(abs)) return `⚠️ No report file for ${date} (expected ${rel}).`;
  const s = fs.readFileSync(abs, 'utf8');
  const cat = field(s, 'Category'), loc = field(s, 'Location');
  return [
    `Overnight run — ${cat} in ${loc} (${date})`,
    ``,
    `| Stage | Count |`,
    `|---|---|`,
    `| Scraped | ${count(s, 'Scraped \\(total businesses\\)')} |`,
    `| Emailable | ${count(s, 'With email \\(emailable\\)')} |`,
    `| Completed videos | ${count(s, 'Videos deployed')} |`,
    `| Failed | ${count(s, 'Failed / gated')} |`,
    ``,
    `📄 [${rel}](${rel}) — Cmd+Shift+V for the clickable preview`,
    ``,
    `**Completed videos (${count(s, 'Videos deployed')})** — click to review:`,
    ...deployedLinks(s, count(s, 'Videos deployed')),
  ].join('\n');
}

// Pull the "## Videos deployed" list from the report and re-emit each as a clickable Markdown link.
// Source rows look like:  `1. **Business Name** — https://…/v/slug/   _(6/6 signals verified)_`
//
// 🔴 2026-08-18 — THE MISMATCH MUST BE LOUD.
// The 08-17 summary printed `**Completed videos (5)** — click to review:` immediately followed by
// `_(none)_` and flagged NOTHING. Two numbers in the same report contradicted each other and the tool
// read as if it had simply had a quiet night. (Root cause was upstream: overnight-pipeline.sh read the
// deployed rows with IFS='|' when the writer used $RSEP, so every row rendered as
// `**NameURL** — ` and this regex matched none of them.) That upstream bug is fixed, but the SENSOR
// must fail loudly on its own — a parser that silently returns "_(none)_" when the report says 5 is
// the same dead-check shape as `99/99 scale≈unreadable`: it can never distinguish "nothing deployed"
// from "I could not read the rows".
function deployedLinks(s, declared) {
  const sec = (s.split(/^##\s+Videos deployed[^\n]*$/m)[1] || '').split(/^##\s+/m)[0];
  const out = [];
  for (const line of sec.split('\n')) {
    const m = line.match(/^\s*\d+\.\s*\*\*(.+?)\*\*\s*—\s*(https?:\/\/\S+)/);
    if (m) out.push(`${out.length + 1}. [${m[1]}](${m[2]})`);
  }
  const n = Number(declared);
  if (Number.isFinite(n) && n !== out.length) {
    return [
      ...out,
      ``,
      `⚠️ **PARSE MISMATCH — the report says ${n} deployed but ${out.length} link row(s) could be read.**`,
      `The "## Videos deployed" rows in the report file are malformed, so this list is NOT the night's`,
      `real output. Open the report file itself and check how those rows were written before trusting`,
      `any count above.`,
    ];
  }
  return out.length ? out : ['_(none)_'];
}

const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const dates = args.length ? args : [latestDate()].filter(Boolean);
if (!dates.length) { console.error('No overnight report files found under ' + ROOT); process.exit(1); }
console.log(dates.map(summary).join('\n\n---\n\n'));
