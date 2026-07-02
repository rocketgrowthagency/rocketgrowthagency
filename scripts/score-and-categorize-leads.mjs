#!/usr/bin/env node
/**
 * score-and-categorize-leads.mjs — audits ALL leads (using the GA4-engagement data synced into
 * Airtable), assigns an industry-standard Lead Score (0-100) + Lead Category, writes both back to
 * Airtable (so they drive the daily call list), and emits an MD report to the Website repo.
 *
 * Model (standard B2B lead scoring = FIT + ENGAGEMENT, mapped to MQL/SQL lifecycle + Hot/Warm/Cold
 * temperature). Run daily (idempotent). DRY=1 to preview without writing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n').filter(Boolean).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const KEY = env.AIRTABLE_API_KEY, BASE = env.AIRTABLE_BASE_ID || 'appSKOMBz6OpGf3qu';
const WEBSITE_DIR = env.WEBSITE_DIR || '/Users/chris/RGA/Rocket Growth Agency Website VS Code';
const H = { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
const DRY = process.env.DRY === '1';
const TERM = /invalid|bounced|no-replacement|permanent|soft-bounced|unsubscrib/i;

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

const FIELDS = ['Business Name', 'Email', 'Email Status', 'Suppressed', 'Email Sent Date',
  'Day 1 Opened At', 'Email Opened', 'Day 1 Clicked At', 'Thumbnail Clicked', 'Video Started At',
  'Highest Video Pct Watched', 'Video Completed At', 'CTA Clicked At', 'Replied', 'Audit Form Submitted',
  'Map Rank', 'Review Count', 'Search Term', 'Day 45 Sent At', 'Video URL', 'Phone',
  'Day 4 Sent At', 'Day 9 Sent At', 'Day 16 Sent At', 'Call Outcome', 'Last Call At', 'Last Text At', 'Call Count'];
const leads = await all(FIELDS);
const f = (r, k) => r.fields[k];
const has = (r, k) => { const v = f(r, k); return v !== undefined && v !== null && v !== '' && v !== false; };

function scoreLead(r) {
  let s = 0;
  if (has(r, 'Email Sent Date')) s += 5;
  if (has(r, 'Day 1 Opened At') || has(r, 'Email Opened')) s += 10;
  if (has(r, 'Day 1 Clicked At') || has(r, 'Thumbnail Clicked')) s += 15;
  if (has(r, 'Video Started At')) s += 10;
  const pct = Number(f(r, 'Highest Video Pct Watched') || 0);
  s += Math.round(pct * 0.3);              // 0-30
  if (has(r, 'CTA Clicked At')) s += 25;
  if (has(r, 'Replied')) s += 40;
  if (has(r, 'Audit Form Submitted')) s += 50;
  // manual call/text outreach signals
  const co = f(r, 'Call Outcome') || '';
  if (co === 'Interested') s += 45; else if (co === 'Callback scheduled') s += 35;
  else if (co === 'Connected') s += 20; else if (co === 'Left voicemail' || co === 'No answer') s += 5;
  // fit
  if (Number(f(r, 'Map Rank') || 0) >= 4) s += 5;   // rank 4+ = needs us more
  if (Number(f(r, 'Review Count') || 0) > 0) s += 5;
  return Math.min(100, s);
}
function categorize(r) {
  const es = f(r, 'Email Status') || '';
  const co = f(r, 'Call Outcome') || '';
  const replied = has(r, 'Replied'), audit = has(r, 'Audit Form Submitted');
  if (co === 'Not interested' || co === 'Do not call' || co === 'Wrong number') return 'Dead / Terminal';
  if (TERM.test(es)) return 'Dead / Terminal';
  if (f(r, 'Suppressed') === true && !replied) return 'Dead / Terminal';   // held/off-vertical/bounced
  if (co === 'Interested' || co === 'Callback scheduled') return 'Hot (SQL)';
  if (replied || audit || has(r, 'CTA Clicked At') || has(r, 'Video Completed At')) return 'Hot (SQL)';
  if (co === 'Connected') return 'Warm (MQL)';
  const pct = Number(f(r, 'Highest Video Pct Watched') || 0);
  if (has(r, 'Day 1 Clicked At') || has(r, 'Thumbnail Clicked') || pct >= 50) return 'Warm (MQL)';
  if (has(r, 'Day 1 Opened At') || has(r, 'Email Opened') || has(r, 'Video Started At')) return 'Engaged';
  if (!has(r, 'Email Sent Date')) return has(r, 'Video URL') ? 'New / Queued' : 'Dead / Terminal';
  if (has(r, 'Day 45 Sent At')) return 'Nurture';   // full sequence sent, no engagement
  return 'Contacted';
}

const scored = leads.map((r) => ({ r, id: r.id, name: f(r, 'Business Name'), score: scoreLead(r), cat: categorize(r),
  vertical: (f(r, 'Search Term') || '').split(/\s+in\s+/)[0], phone: f(r, 'Phone'),
  engaged: [
    has(r, 'Replied') && 'replied', has(r, 'Audit Form Submitted') && 'audit-submitted',
    has(r, 'CTA Clicked At') && 'CTA-clicked', has(r, 'Video Completed At') && 'video-100%',
    (Number(f(r, 'Highest Video Pct Watched') || 0) && !has(r, 'Video Completed At')) && `video-${f(r, 'Highest Video Pct Watched')}%`,
    (has(r, 'Day 1 Clicked At') || has(r, 'Thumbnail Clicked')) && 'clicked',
    (has(r, 'Day 1 Opened At') || has(r, 'Email Opened')) && 'opened',
  ].filter(Boolean).join(', ') || '—' }));

// write back Lead Score + Lead Category
if (!DRY) {
  for (let i = 0; i < scored.length; i += 10) {
    const body = { records: scored.slice(i, i + 10).map((x) => ({ id: x.id, fields: { 'Lead Score': x.score, 'Lead Category': x.cat } })), typecast: true };
    const r = await fetch(`https://api.airtable.com/v0/${BASE}/Leads`, { method: 'PATCH', headers: H, body: JSON.stringify(body) });
    const d = await r.json(); if (d.error) console.error('write err', JSON.stringify(d.error));
  }
}

// ---- build the report ----
const ORDER = ['Hot (SQL)', 'Warm (MQL)', 'Engaged', 'Contacted', 'Nurture', 'New / Queued', 'Dead / Terminal'];
const by = {}; ORDER.forEach((c) => by[c] = []);
scored.forEach((x) => (by[x.cat] = by[x.cat] || []).push(x));
const today = new Date().toISOString().slice(0, 10);
const avg = (a) => a.length ? Math.round(a.reduce((s, x) => s + x.score, 0) / a.length) : 0;
const NEXT = {
  'Hot (SQL)': 'CALL within 24h — reference their exact engagement (they watched/clicked). Reply-velocity matters (fastest responders close ~9x more). Book the audit review.',
  'Warm (MQL)': 'Prioritized follow-up: personal email today; call if no reply in 2 days. They clicked/half-watched — nudge to the CTA.',
  'Engaged': 'Keep them in the automated Email #2–#5 sequence. They opened — the next touch (Day 4 video re-push) is doing its job.',
  'Contacted': 'Continue the automated sequence. If not opening by Email #3, the subject line / send-time is the lever.',
  'Nurture': 'Full sequence sent, no bite. Park in long-term nurture (quarterly re-touch) or expansion offer. Do not burn more cadence now.',
  'New / Queued': 'Ensure a verified email + they enter the send queue. These are your fuel — keep the overnight render pipeline feeding this.',
  'Dead / Terminal': 'Excluded from selling (bounced / suppressed / off-vertical). No action. Kept for dedup + audit trail only.',
};
let md = `# RGA Lead Scoring & Categorization — ${today}\n\n`;
md += `**${leads.length} total leads** audited and scored (0-100) from the engagement data GA4 syncs into Airtable. Score + Category are now written on every lead — sortable/filterable in the CRM, recomputed each run.\n\n`;
md += `## The scoring model (industry standard: Fit + Engagement → MQL/SQL lifecycle × Hot/Warm/Cold temperature)\n\n`;
md += `Score = ENGAGEMENT (behavioral, the strong signal) + FIT (a small demographic bonus):\n\n`;
md += `| Signal | Points | Why |\n|---|---|---|\n`;
md += `| Audit form submitted | +50 | highest intent — they asked for the analysis |\n| Replied | +40 | direct interest |\n| CTA clicked | +25 | ready to act |\n| Video watched (× % / ×0.3) | up to +30 | depth of interest |\n| Link/thumbnail clicked | +15 | curiosity |\n| Video started | +10 | — |\n| Email opened | +10 | top of funnel |\n| Email sent (contacted) | +5 | baseline |\n| Fit: Maps rank 4+ (needs us) | +5 | better prospect |\n| Fit: has Google reviews | +5 | established/credible |\n\n`;
md += `## Categories — where every lead sits right now\n\n`;
md += `| Category | Lifecycle | Leads | Avg score | What it means | Next step |\n|---|---|---|---|---|---|\n`;
const LIFE = { 'Hot (SQL)': 'Sales-Qualified', 'Warm (MQL)': 'Marketing-Qualified', 'Engaged': 'Aware', 'Contacted': 'Reached', 'Nurture': 'Cold-hold', 'New / Queued': 'Prospect', 'Dead / Terminal': 'Out' };
for (const c of ORDER) { const a = by[c] || []; md += `| **${c}** | ${LIFE[c]} | ${a.length} | ${avg(a)} | ${{'Hot (SQL)':'replied / CTA / audit / watched-100%','Warm (MQL)':'clicked or watched ≥50%','Engaged':'opened / started video','Contacted':'sent, no engagement yet','Nurture':'full sequence, no bite','New / Queued':'not yet emailed','Dead / Terminal':'bounced / suppressed / off-vertical'}[c]} | ${NEXT[c].split('.')[0]}. |\n`; }
md += `\n## 🔥 Call list — Hot & Warm, ranked by score\n\n`;
for (const c of ['Hot (SQL)', 'Warm (MQL)']) {
  const a = (by[c] || []).sort((x, y) => y.score - x.score);
  md += `\n### ${c} (${a.length})\n\n`;
  if (!a.length) { md += `_none right now_\n`; continue; }
  md += `| Score | Business | Vertical | Engagement | Phone |\n|---|---|---|---|---|\n`;
  a.slice(0, 40).forEach((x) => md += `| ${x.score} | ${x.name} | ${x.vertical || '—'} | ${x.engaged} | ${x.phone || '—'} |\n`);
}
md += `\n## Next steps by category\n\n`;
for (const c of ORDER) md += `- **${c}** (${(by[c] || []).length}): ${NEXT[c]}\n`;
md += `\n---\n_Score + Category are written to Airtable on every lead. Re-run \`node scripts/score-and-categorize-leads.mjs\` (or let it run daily) to refresh as engagement changes._\n`;

const outDir = path.join(WEBSITE_DIR, 'reports');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `lead-scoring-${today}.md`);
fs.writeFileSync(outPath, md);
console.log(`${DRY ? '[DRY] ' : ''}scored ${leads.length} leads. Category counts:`);
ORDER.forEach((c) => console.log(`  ${c.padEnd(18)} ${(by[c] || []).length}  (avg ${avg(by[c] || [])})`));
console.log(`\nreport → reports/lead-scoring-${today}.md`);
