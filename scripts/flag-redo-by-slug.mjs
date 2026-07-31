#!/usr/bin/env node
/**
 * flag-redo-by-slug.mjs — tick `Redo Video`=true on leads whose `Vid Slug` is in a given list.
 *
 * Used to queue a set of already-deployed-but-BROKEN videos for the self-healing redo path:
 * redo-flagged-videos.mjs (runs at the start of overnight-local.sh) then ARMs each — suppresses the
 * lead, deletes the live /v/<slug> page, clears Video URL + Vid Slug, and drops the Search Term from
 * the attempted-searches ledger so the next overnight run re-renders it on the FIXED pipeline.
 *
 * Usage: node scripts/flag-redo-by-slug.mjs slug1 slug2 ...   (or pass a newline/space list on stdin)
 *        DRY=1 to preview.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n').filter(Boolean).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const KEY = env.AIRTABLE_API_KEY, BASE = env.AIRTABLE_BASE_ID || 'appSKOMBz6OpGf3qu';
const TABLE = env.AIRTABLE_LEADS_TABLE || 'Leads';
const H = { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
const DRY = process.env.DRY === '1';

let slugs = process.argv.slice(2);
if (!slugs.length) { slugs = fs.readFileSync(0, 'utf8').split(/\s+/).filter(Boolean); }
const want = new Set(slugs.map((s) => s.trim()).filter(Boolean));
if (!want.size) { console.error('no slugs given'); process.exit(1); }

async function all(fields) {
  const out = []; let offset;
  do {
    const u = new URL(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLE)}`);
    fields.forEach((f) => u.searchParams.append('fields[]', f));
    u.searchParams.set('pageSize', '100');
    if (offset) u.searchParams.set('offset', offset);
    const r = await fetch(u, { headers: H }); const d = await r.json();
    if (d.error) throw new Error(JSON.stringify(d.error));
    out.push(...(d.records || [])); offset = d.offset;
  } while (offset);
  return out;
}
const f = (r, k) => r.fields[k];
async function patch(id, fields) {
  if (DRY) return;
  const r = await fetch(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLE)}/${id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields }) });
  const d = await r.json(); if (d.error) throw new Error(JSON.stringify(d.error));
}

const leads = await all(['Business Name', 'Vid Slug', 'Video URL', 'Redo Video']);
const bySlug = new Map(leads.filter((r) => f(r, 'Vid Slug')).map((r) => [f(r, 'Vid Slug'), r]));
let flagged = 0; const missing = [];
for (const slug of want) {
  const r = bySlug.get(slug);
  if (!r) { missing.push(slug); continue; }
  if (f(r, 'Redo Video')) { console.log(`  = already flagged: ${slug}`); continue; }
  await patch(r.id, { 'Redo Video': true });
  console.log(`  ${DRY ? '[DRY] ' : ''}✓ Redo Video=true: ${f(r, 'Business Name')} (${slug})`);
  flagged++;
}
if (missing.length) console.log(`\n  ⚠ no Airtable match for ${missing.length} slug(s): ${missing.join(', ')}`);
console.log(`\n${DRY ? '[DRY] ' : ''}Flagged ${flagged} lead(s) for redo. Next: redo-flagged-videos.mjs arms them (runs at overnight-local.sh start).`);
