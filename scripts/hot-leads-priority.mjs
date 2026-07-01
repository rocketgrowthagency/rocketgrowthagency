#!/usr/bin/env node
/**
 * hot-leads-priority.mjs — prioritized call/follow-up list from Airtable engagement.
 * Leads who CLICKED through to their video page (high intent) but have NOT replied → call them.
 * Once GA4's per-business dimension fills in (~48h post-registration), we can layer video-watch %.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const SCRAPER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(fs.readFileSync(path.join(SCRAPER_DIR, '.env'), 'utf8').split('\n').filter(Boolean).map((l) => { const i = l.indexOf('='); return i < 0 ? [l, ''] : [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const KEY = env.AIRTABLE_API_KEY, BASE = env.AIRTABLE_BASE_ID || 'appSKOMBz6OpGf3qu';

async function fetchAll(formula) {
  const out = []; let off = null;
  do {
    const u = new URL(`https://api.airtable.com/v0/${BASE}/Leads`);
    u.searchParams.set('pageSize', '100');
    u.searchParams.set('filterByFormula', formula);
    if (off) u.searchParams.set('offset', off);
    const r = await fetch(u, { headers: { Authorization: `Bearer ${KEY}` } });
    const d = await r.json(); out.push(...(d.records || [])); off = d.offset;
  } while (off);
  return out;
}

(async () => {
  // Clicked their video link (landed on /v/ page) = strongest available intent signal.
  const clicked = await fetchAll("{Day 1 Clicked At}!=''");
  // exclude replied / dead / suppressed
  const hot = clicked.filter((r) => {
    const f = r.fields;
    if (f.Replied || f['Reply Date']) return false;
    if (f.Status === 'dead' || f.Suppressed) return false;
    if ((f['Email Status'] || '').match(/bounce|invalid|blocked/)) return false;
    return true;
  }).sort((a, b) => new Date(b.fields['Day 1 Clicked At']) - new Date(a.fields['Day 1 Clicked At']));

  console.log(`\n🔥 HOT LEADS — clicked their video, no reply yet (${hot.length}) — call these:\n`);
  console.log(`${'Business'.padEnd(38)} ${'Clicked'.padEnd(11)} ${'Phone'.padEnd(15)} Email`);
  for (const r of hot.slice(0, 40)) {
    const f = r.fields;
    console.log(`${String(f['Business Name'] || '').slice(0, 37).padEnd(38)} ${String(f['Day 1 Clicked At'] || '').slice(0, 10).padEnd(11)} ${String(f.Phone || '—').padEnd(15)} ${f.Email || ''}`);
  }
  console.log(`\n  (${clicked.length} total clicked; ${clicked.length - hot.length} filtered out as replied/dead/bounced)`);
})().catch((e) => { console.error('failed:', e.message); process.exit(1); });
