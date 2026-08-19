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
// EXCEPTION: an armed redo (Skip Reasons='redo-armed', Video URL cleared, send blocked) leaves its lead
// row in place — so its Search Term must NOT count as scraped, or next-search would permanently skip it
// and the redo could never re-scrape / re-render (the pending video would be stuck forever). We collect
// those separately and subtract them below so the search becomes re-pickable; a re-scrape re-renders that
// lead through the 6/6 gate and every already-good lead in the search idempotency-skips. See
// redo-flagged-videos.mjs (ARM/PENDING/FINALIZE) + feedback_verify_run_gates_before_arming.md.
async function scrapedSet() {
  const set = new Set(), redoPending = new Set(); let off = null;
  do {
    const u = new URL(`https://api.airtable.com/v0/${BASE}/Leads`);
    u.searchParams.set('pageSize', '100');
    u.searchParams.append('fields[]', 'Search Term');
    u.searchParams.append('fields[]', 'Skip Reasons');
    u.searchParams.append('fields[]', 'Video URL');
    if (off) u.searchParams.set('offset', off);
    const r = await fetch(u, { headers: { Authorization: `Bearer ${KEY}` } });
    if (!r.ok) { console.error('[next-search] Airtable error', r.status); process.exit(2); }
    const d = await r.json();
    for (const rec of (d.records || [])) {
      const s = rec.fields['Search Term']; if (!s) continue;
      const key = norm(s);
      const armed = /redo-armed/.test(rec.fields['Skip Reasons'] || '') && !rec.fields['Video URL'];
      if (armed) redoPending.add(key); else set.add(key);
    }
    off = d.offset;
  } while (off);
  return { done: set, redoPending };
}

const { done, redoPending } = await scrapedSet();

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

// A pending armed-redo overrides BOTH the lead check and the attempted-log: its search MUST be
// re-pickable so the overnight run re-scrapes it and heals the stuck video.
for (const k of redoPending) done.delete(k);

// 🔴 2026-08-18 — THE SAME OVERRIDE, FOR LEADS THAT NEVER GOT AN AIRTABLE ROW.
// `redoPending` above can only rescue a lead that HAS a row tagged redo-armed. But the three loss
// paths that run before step-8 (6/6 verification gate, per-lead watchdog, step-3 WebM count) kill the
// lead before its row is ever written — so they can never appear in redoPending, and the `done` set
// above still contains their search because the leads that DID deploy in that same search each add it.
//
// Net effect before this: un-ledgering such a search accomplished nothing at all. Measured on
// "Yoga studios in Culver City, CA" (2026-08-17) — ledger line removed, yet done.has(term) was still
// true from the 5 deployed rows, so YogaSix, [solidcore], CorePower and Homebody were unreachable.
// This also silently defeated build-video-landing.mjs's un-ledger (the 2026-08-11 leg-3 fix) for every
// search that produced at least one deployed lead.
//
// overnight-pipeline.sh writes the search here when it re-arms a lead. Self-clearing: the pipeline
// removes the term when it starts processing it, and only re-adds it if a lead fails again — bounded
// by the per-lead 3-attempt cap, so a permanently-broken lead cannot pin the pipeline to one category.
const PENDING_REBUILD = path.join(SCRAPER_DIR, 'output', 'pending-rebuild-searches.txt');
let queuedRebuilds = [];
try {
  queuedRebuilds = fs.readFileSync(PENDING_REBUILD, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
  for (const q of queuedRebuilds) done.delete(norm(q));
} catch { /* nothing queued — the normal case */ }

// 🔴 2026-08-18 — A QUEUED REBUILD MUST JUMP THE QUEUE, not merely become eligible.
// Removing the term from `done` only makes it *pickable*; the walk below still visits city × vertical in
// a fixed order, so a queued search competes on its POSITION in that list. "Yoga studios" sits at #45 of
// 48, behind ~44 categories that have never been scraped — so the four leads lost on 2026-08-17 would
// have waited weeks while brand-new categories were scraped ahead of them, even with the override in
// place. A lead with NO video is more urgent than a category with no leads yet.
// Safe against looping: overnight-pipeline.sh removes the entry when it STARTS that search, and only a
// fresh failure re-adds it (capped per lead) — so this cannot pin the run to one category.
//
// A queued entry is AUTHORITATIVE — it is returned even though the category counts as "done", because
// "done" is exactly the wrong answer here: the category was scraped, some leads deployed, and the ones
// that failed are the reason it's queued. (Guarding this with `!done.has(...)` would be dead code: the
// loop above already deleted these terms from `done`, so the condition could never be false — the same
// always-passes shape as feedback_dead_check_selector_gap.)
if (queuedRebuilds.length) {
  process.stdout.write(queuedRebuilds[0]);
  process.exit(0);
}

for (const city of cities) {
  for (const v of verticals) {
    const q = `${v} in ${city}, CA`;              // match Airtable's stored comma format
    if (!done.has(norm(q))) { process.stdout.write(q); process.exit(0); }
  }
}
console.error(`[next-search] SoCal exhausted — all ${cities.length} cities × ${verticals.length} verticals scraped. Time for NorCal.`);
process.exit(3);
