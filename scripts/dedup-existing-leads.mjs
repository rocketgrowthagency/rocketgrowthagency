#!/usr/bin/env node
/**
 * dedup-existing-leads.mjs — RETROACTIVE cleanup of duplicate leads already in Airtable (2026-07-11, Chris:
 * "duplicates we must delete to only 1 ... we don't want to create multiple videos / send multiple first
 * emails to the same company"). Scrape-time dedup ([[feedback-dedup-by-email-with-intel-capture]]) is
 * forward-only, so the clusters scraped BEFORE it existed (plus franchises sharing one corporate inbox) sit
 * in the table as a live send-risk. This collapses each shared-inbox cluster to ONE active canonical lead.
 *
 * A cluster = 2+ ACTIVE leads (not already suppressed/dead) sharing the SAME normalized email.
 * CANONICAL (kept active) = the most-progressed row, by priority:
 *   1) has Email Sent Date  2) Draft Created  3) Status past 'new'  4) has Video URL  5) best (lowest) Map Rank
 * All OTHERS in the cluster → Suppressed=true, Status=dead, Skip Reasons='dedup-duplicate-email: <canonical>'.
 * We DO NOT delete rows (preserves CRM history + the dedup index that blocks re-adds) and DO NOT touch the
 * canonical's deployed video. Send-time guard in createOutreachDrafts is the durable backstop; this just
 * cleans the standing backlog so the audit + send are correct today.
 *
 * Usage: DRY run by default (prints, writes nothing). `--apply` to write. Idempotent.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n').filter(Boolean).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const KEY = env.AIRTABLE_API_KEY, BASE = env.AIRTABLE_BASE_ID || 'appSKOMBz6OpGf3qu';
const H = { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
const APPLY = process.argv.includes('--apply');
const norm = (e) => String(e || '').trim().toLowerCase();

async function all() {
  let recs = [], off = null;
  const F = ['Business Name', 'Email', 'Video URL', 'Status', 'Suppressed', 'Draft Created', 'Email Sent Date', 'Map Rank', 'Skip Reasons'];
  do {
    const u = new URL(`https://api.airtable.com/v0/${BASE}/Leads`);
    u.searchParams.set('pageSize', '100');
    F.forEach((f) => u.searchParams.append('fields[]', f));
    if (off) u.searchParams.set('offset', off);
    const d = await (await fetch(u, { headers: H })).json();
    if (d.error) throw new Error(JSON.stringify(d.error));
    recs = recs.concat(d.records || []); off = d.offset;
  } while (off);
  return recs;
}
async function patch(id, fields) {
  if (!APPLY) return;
  const d = await (await fetch(`https://api.airtable.com/v0/${BASE}/Leads/${id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields }) })).json();
  if (d.error) throw new Error(JSON.stringify(d.error));
}
const f = (r, k) => r.fields[k];
const isInactive = (r) => f(r, 'Suppressed') || String(f(r, 'Status') || '').toLowerCase() === 'dead';
// canonical score — higher wins
function score(r) {
  let s = 0;
  if (f(r, 'Email Sent Date')) s += 1000;
  if (f(r, 'Draft Created')) s += 500;
  const st = String(f(r, 'Status') || 'new').toLowerCase();
  if (st && st !== 'new') s += 250;
  if (f(r, 'Video URL')) s += 100;
  const rank = parseInt(f(r, 'Map Rank'), 10);
  if (Number.isFinite(rank)) s += Math.max(0, 60 - rank); // better (lower) rank = higher
  return s;
}

const rows = await all();
const byEmail = {};
for (const r of rows) { const e = norm(f(r, 'Email')); if (!e) continue; (byEmail[e] = byEmail[e] || []).push(r); }

let clusters = 0, suppressed = 0;
for (const [email, rs] of Object.entries(byEmail)) {
  const active = rs.filter((r) => !isInactive(r));
  if (active.length < 2) continue; // no live duplicate risk for this inbox
  clusters++;
  active.sort((a, b) => score(b) - score(a));
  const canonical = active[0];
  const dupes = active.slice(1);
  console.log(`\n${email}  → keep: ${f(canonical, 'Business Name')} (vid=${f(canonical, 'Video URL') ? 'Y' : '-'}, status=${f(canonical, 'Status') || 'new'}, sent=${f(canonical, 'Email Sent Date') ? 'Y' : '-'})`);
  for (const d of dupes) {
    console.log(`   suppress: ${f(d, 'Business Name')} (vid=${f(d, 'Video URL') ? 'Y' : '-'}, status=${f(d, 'Status') || 'new'})`);
    const prevSkip = (f(d, 'Skip Reasons') || '').trim();
    const line = `dedup-duplicate-email: same inbox as "${f(canonical, 'Business Name')}" (kept canonical)`;
    await patch(d.id, { 'Suppressed': true, 'Status': 'dead', 'Skip Reasons': prevSkip ? `${prevSkip}\n${line}` : line });
    suppressed++;
  }
}
console.log(`\n${APPLY ? '' : '[DRY] '}Dedup existing leads: ${clusters} shared-inbox cluster(s) with a live duplicate → ${suppressed} row(s) ${APPLY ? 'suppressed' : 'WOULD be suppressed'} (kept 1 canonical each).`);
if (!APPLY) console.log('Re-run with --apply to write.');
