#!/usr/bin/env node
/**
 * next-search.mjs — picks the next OUTREACH search: CITY-FIRST, proximity-ordered.
 *
 * Strategy (Chris, locked 2026-07-01): dominate SoCal locally — do ALL 50 business types in the
 * nearest city, then the next nearest city, radiating out from the Westside; exhaust ALL of SoCal
 * before any NorCal. Sources: config/socal-cities.json (proximity-ordered) × config/outreach-verticals.json.
 * Returns the first "<vertical> in <city> CA" that hasn't been scraped yet (no Airtable lead for it).
 * Prints ONLY that query (or exits 3 when SoCal is fully exhausted).
 *
 * Launch nightly:  Q=$(node scripts/next-search.mjs) && WORKER_COUNT=2 ./scripts/overnight-pipeline.sh "$Q"
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRAPER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(fs.readFileSync(path.join(SCRAPER_DIR, '.env'), 'utf8').split('\n').filter(Boolean).map((l) => { const i = l.indexOf('='); return i < 0 ? [l, ''] : [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const KEY = env.AIRTABLE_API_KEY, BASE = env.AIRTABLE_BASE_ID || 'appSKOMBz6OpGf3qu';

let cities, verticals;
try { cities = JSON.parse(fs.readFileSync(path.join(SCRAPER_DIR, 'config', 'socal-cities.json'), 'utf8')).cities; }
catch (e) { console.error('[next-search] cannot read socal-cities.json:', e.message); process.exit(2); }
try { verticals = JSON.parse(fs.readFileSync(path.join(SCRAPER_DIR, 'config', 'outreach-verticals.json'), 'utf8')).verticals; }
catch (e) { console.error('[next-search] cannot read outreach-verticals.json:', e.message); process.exit(2); }

// Normalize a Search Term so "HVAC in Culver City, CA" == "HVAC in Culver City CA" == "hvac in culver
// city  ca" — Airtable stores the comma form, older runs used no comma. Compare on the normalized key.
const norm = (s) => String(s).toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ').trim();

// Pull every Search Term already scraped (a lead exists → that city+vertical is done).
async function scrapedSet() {
  const set = new Set(); let off = null;
  do {
    const u = new URL(`https://api.airtable.com/v0/${BASE}/Leads`);
    u.searchParams.set('pageSize', '100'); u.searchParams.append('fields[]', 'Search Term');
    if (off) u.searchParams.set('offset', off);
    const r = await fetch(u, { headers: { Authorization: `Bearer ${KEY}` } });
    if (!r.ok) { console.error('[next-search] Airtable error', r.status); process.exit(2); }
    const d = await r.json();
    for (const rec of (d.records || [])) { const s = rec.fields['Search Term']; if (s) set.add(norm(s)); }
    off = d.offset;
  } while (off);
  return set;
}

const done = await scrapedSet();

// ALSO treat any search already ATTEMPTED (recorded in the ledger by overnight-local.sh)
// as done — even if it yielded ZERO leads. Without this, a search that legitimately produces
// no writable leads (all no-email / dedup / landing-not-built, e.g. "Painters in Culver City"
// = art studios) leaves no Lead row, so scrapedSet() never sees it and next-search picks it
// again FOREVER. Cost 2026-07-01: 17 re-runs / ~13h stuck on Painters. The ledger closes the
// loop on attempt, not on output. See feedback_next_search_must_track_attempts.md.
const LEDGER = path.join(SCRAPER_DIR, 'output', 'attempted-searches.log');
try {
  for (const line of fs.readFileSync(LEDGER, 'utf8').split('\n')) {
    const q = line.trim(); if (q) done.add(norm(q));
  }
} catch { /* no ledger yet — first run */ }

for (const city of cities) {
  for (const v of verticals) {
    const q = `${v} in ${city}, CA`;              // match Airtable's stored comma format
    if (!done.has(norm(q))) { process.stdout.write(q); process.exit(0); }
  }
}
console.error(`[next-search] SoCal exhausted — all ${cities.length} cities × ${verticals.length} verticals scraped. Time for NorCal.`);
process.exit(3);
