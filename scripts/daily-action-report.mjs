#!/usr/bin/env node
/**
 * daily-action-report.mjs — a dated daily "what to do today" briefing, saved to a
 * year/month/day folder tree so reports accumulate as history (never overwritten across days).
 *
 *   reports/daily/<YYYY>/<MM-Month>/<DD>_daily-action-report_<YYYY-MM-DD>.md
 *
 * Reads the live Lead Score / Lead Category (written by score-and-categorize-leads.mjs) + the
 * deliverability + queue state. M-F only (skips weekends unless FORCE=1). Idempotent per day
 * (re-running the same day overwrites that day's file; a NEW file is created each new day).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n').filter(Boolean).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const KEY = env.AIRTABLE_API_KEY, BASE = env.AIRTABLE_BASE_ID || 'appSKOMBz6OpGf3qu';
const WEBSITE_DIR = env.WEBSITE_DIR || '/Users/chris/RGA/Rocket Growth Agency Website VS Code';
const H = { Authorization: 'Bearer ' + KEY };
const now = new Date(), D = 864e5, nowMs = now.getTime();
const dow = now.getDay(); // 0=Sun 6=Sat
if ((dow === 0 || dow === 6) && process.env.FORCE !== '1') { console.log('weekend — no daily action report (M-F only). FORCE=1 to override.'); process.exit(0); }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const yyyy = now.getFullYear(), mm = String(now.getMonth() + 1).padStart(2, '0'), dd = String(now.getDate()).padStart(2, '0');
const iso = `${yyyy}-${mm}-${dd}`;

async function all(fields) {
  let recs = [], off = null;
  do {
    const u = new URL(`https://api.airtable.com/v0/${BASE}/Leads`);
    u.searchParams.set('pageSize', '100');
    fields.forEach((f) => u.searchParams.append('fields[]', f));
    if (off) u.searchParams.set('offset', off);
    const r = await fetch(u, { headers: H }); const d = await r.json();
    if (d.error) throw new Error(JSON.stringify(d.error));
    recs = recs.concat(d.records || []); off = d.offset;
  } while (off);
  return recs;
}
const L = await all(['Business Name', 'Email', 'Phone', 'Lead Score', 'Lead Category', 'Search Term',
  'Highest Video Pct Watched', 'CTA Clicked At', 'Day 1 Clicked At', 'Replied', 'Audit Form Submitted',
  'Call Outcome', 'Last Call At', 'Email Sent Date', 'Email Status', 'Suppressed', 'Video URL', 'Status', 'Draft Created']);
const f = (r, k) => r.fields[k];
const has = (r, k) => { const v = f(r, k); return v !== undefined && v !== null && v !== '' && v !== false; };
const TERM = /invalid|bounced|no-replacement|permanent|soft-bounced/i;

const cat = (c) => L.filter((r) => f(r, 'Lead Category') === c).sort((a, b) => (f(b, 'Lead Score') || 0) - (f(a, 'Lead Score') || 0));
const hot = cat('Hot (SQL)'), warm = cat('Warm (MQL)'), engaged = cat('Engaged');
const sendable = L.filter((r) => { const s = String(f(r, 'Status') || 'new').toLowerCase(); return !f(r, 'Suppressed') && has(r, 'Email') && !TERM.test(f(r, 'Email Status') || '') && f(r, 'Video URL') && (s === 'new' || s === '') && !f(r, 'Draft Created') && !has(r, 'Replied'); });
// deliverability
const sent7 = L.filter((r) => { const d = f(r, 'Email Sent Date'); return d && Date.parse(d) >= nowMs - 7 * D; });
const bounced7 = sent7.filter((r) => TERM.test(f(r, 'Email Status') || ''));
const rate7 = sent7.length ? (bounced7.length / sent7.length * 100) : 0;
const relDest = rate7 >= 5 ? 'RED' : rate7 >= 2 ? 'AMBER' : 'GREEN';
const engSummary = (r) => [has(r, 'Replied') && 'replied', has(r, 'Audit Form Submitted') && 'audit-submitted', has(r, 'CTA Clicked At') && 'CTA-clicked', (Number(f(r, 'Highest Video Pct Watched') || 0)) && `video-${f(r, 'Highest Video Pct Watched')}%`, has(r, 'Day 1 Clicked At') && 'clicked', has(r, 'Call Outcome') && `call:${f(r, 'Call Outcome')}`].filter(Boolean).join(', ') || 'opened';
const called = (r) => has(r, 'Last Call At') ? `called ${String(f(r, 'Last Call At')).slice(0, 10)}` : 'not called yet';

let md = `# Daily Action Report — ${WEEK[dow]} ${MONTHS[now.getMonth()]} ${now.getDate()}, ${yyyy}\n\n`;
md += `_Generated ${iso}. Priorities are ranked by what moves revenue today._\n\n`;
md += `## ⚡ Today's top actions\n\n`;
let n = 1;
if (hot.length) md += `${n++}. **Call ${hot.length} HOT lead${hot.length > 1 ? 's' : ''} now** — they replied / clicked the CTA / said interested. Fastest callers close ~9× more.\n`;
if (warm.length) md += `${n++}. **Follow up ${warm.length} WARM lead${warm.length > 1 ? 's' : ''}** — clicked or half-watched; personal email today, call if quiet 2 days.\n`;
if (relDest !== 'GREEN') md += `${n++}. **Deliverability ${relDest}** (bounce 7d ${rate7.toFixed(1)}%) — the daily guard already swept dead mailboxes; monitor.\n`;
if (sendable.length) md += `${n++}. **${sendable.length} verified leads queued** to send — pipeline is fueled.\n`;
if (n === 1) md += `- No hot/warm leads today — keep the outreach + render engines running to build the queue.\n`;

md += `\n## 🔥 HOT — call today (${hot.length})\n\n`;
if (hot.length) { md += `| Score | Business | Vertical | Why hot | Phone | Status |\n|---|---|---|---|---|---|\n`; hot.forEach((r) => md += `| ${f(r, 'Lead Score') || 0} | ${f(r, 'Business Name')} | ${(f(r, 'Search Term') || '').split(/\s+in\s+/)[0] || '—'} | ${engSummary(r)} | ${f(r, 'Phone') || '—'} | ${called(r)} |\n`); }
else md += `_none today_\n`;

md += `\n## 🌤 WARM — follow up today (${warm.length})\n\n`;
if (warm.length) { md += `| Score | Business | Vertical | Signal | Phone | Status |\n|---|---|---|---|---|---|\n`; warm.slice(0, 25).forEach((r) => md += `| ${f(r, 'Lead Score') || 0} | ${f(r, 'Business Name')} | ${(f(r, 'Search Term') || '').split(/\s+in\s+/)[0] || '—'} | ${engSummary(r)} | ${f(r, 'Phone') || '—'} | ${called(r)} |\n`); }
else md += `_none today_\n`;

md += `\n## Pipeline at a glance\n\n`;
md += `| Metric | Value |\n|---|---|\n`;
md += `| Hot (SQL) | ${hot.length} |\n| Warm (MQL) | ${warm.length} |\n| Engaged (nurturing) | ${engaged.length} |\n| Sendable queue | ${sendable.length} |\n| Bounce rate 7d | ${rate7.toFixed(1)}% (${relDest}) |\n`;
md += `\n## How to work this list\n`;
md += `- Update each lead in Airtable as you go: set **Last Call At / Call Outcome / Manual Notes** (or **Texted**). The score + category auto-update tomorrow.\n`;
md += `- Mark a bad video **Redo Video**; a bad email **Suppressed** — the system self-heals.\n`;
md += `- This report is a snapshot of ${iso}. A fresh one is generated each weekday; browse \`reports/daily/${yyyy}/${mm}-${MONTHS[now.getMonth()]}/\` for history.\n`;

const dir = path.join(WEBSITE_DIR, 'reports', 'daily', String(yyyy), `${mm}-${MONTHS[now.getMonth()]}`);
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${dd}_daily-action-report_${iso}.md`);
fs.writeFileSync(file, md);
console.log(`daily action report → reports/daily/${yyyy}/${mm}-${MONTHS[now.getMonth()]}/${dd}_daily-action-report_${iso}.md`);
console.log(`  hot ${hot.length}, warm ${warm.length}, engaged ${engaged.length}, queue ${sendable.length}, bounce7d ${rate7.toFixed(1)}% ${relDest}`);
