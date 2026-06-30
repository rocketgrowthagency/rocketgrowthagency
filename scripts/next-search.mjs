#!/usr/bin/env node
/**
 * next-search.mjs — pick the next pending Search Queue query, restricted to APPROVED industries.
 *
 * Single source of truth for "what does the video pipeline scrape next." Reads
 * config/approved-industries.json and returns the highest-priority pending Search Queue row
 * whose Vertical is on the approved list. Prints ONLY the Query string to stdout (nothing else
 * on stdout) so callers can capture it:  Q=$(node scripts/next-search.mjs)
 *
 * Exit codes: 0 = printed a query; 3 = no approved pending searches left (queue exhausted).
 * Fail-closed: if the approved config can't load, it errors out (never picks off-list).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRAPER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(fs.readFileSync(path.join(SCRAPER_DIR, '.env'), 'utf8').split('\n').filter(Boolean).map((l) => { const i = l.indexOf('='); return i < 0 ? [l, ''] : [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const AIRTABLE_API_KEY = env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = env.AIRTABLE_BASE_ID || 'appSKOMBz6OpGf3qu';

let APPROVED;
try { APPROVED = new Set(JSON.parse(fs.readFileSync(path.join(SCRAPER_DIR, 'config', 'approved-industries.json'), 'utf8')).approved || []); }
catch (e) { console.error('[next-search] cannot load config/approved-industries.json — refusing to pick:', e.message); process.exit(2); }
if (!APPROVED.size) { console.error('[next-search] approved list is empty — nothing to pick.'); process.exit(2); }
if (!AIRTABLE_API_KEY) { console.error('[next-search] no AIRTABLE_API_KEY'); process.exit(2); }

const rows = []; let offset = null;
while (true) {
  const u = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent('Search Queue')}`);
  u.searchParams.set('pageSize', '100');
  u.searchParams.set('filterByFormula', "{Status}='pending'");
  ['Query', 'Vertical', 'City', 'Priority', 'Avg Ticket'].forEach((f) => u.searchParams.append('fields[]', f));
  if (offset) u.searchParams.set('offset', offset);
  const res = await fetch(u, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
  if (!res.ok) { console.error('[next-search] Airtable error', res.status); process.exit(2); }
  const d = await res.json();
  rows.push(...(d.records || []));
  offset = d.offset; if (!offset) break;
}

const approvedPending = rows
  .filter((r) => APPROVED.has(r.fields.Vertical) && r.fields.Query)
  // highest Avg Ticket first (then Priority) so we lead with the most valuable approved verticals
  .sort((a, b) => (Number(b.fields['Avg Ticket'] || 0) - Number(a.fields['Avg Ticket'] || 0)) || (Number(a.fields.Priority || 0) - Number(b.fields.Priority || 0)));

if (!approvedPending.length) { console.error('[next-search] no approved pending searches left — queue exhausted for the approved 10.'); process.exit(3); }
process.stdout.write(approvedPending[0].fields.Query);
