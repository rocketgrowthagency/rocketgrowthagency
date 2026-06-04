// lib/dedup-by-email.mjs
//
// Cross-search dedup + appearance tracking. Locked 2026-06-03 after Chris
// asked for it: when a business surfaces in MULTIPLE search queries (e.g.,
// Lords of Plumbing showing up in both "Plumbers in Santa Monica CA" and
// "Plumbers in Beverly Hills CA"), we want to:
//   1. SKIP rendering/outreach for the duplicate (don't send 2 emails to
//      the same address; trust-kill)
//   2. CAPTURE the new appearance as data on the EXISTING Airtable record
//      (Appearances JSON, Appearance Count, Best/Worst Rank, Cities, etc.)
//   3. Use the accumulated data later for: regional-dominator reports,
//      client geo-expansion pitches, vertical competitive benchmarks.
//
// Memory: feedback_dedup_by_email_with_intel_capture.md.
//
// Forward-only: existing records get appearance updates starting from when
// this module ships. We don't backfill prior runs.

import 'dotenv/config';

const BASE_ID = process.env.AIRTABLE_BASE_ID;
const API_KEY = process.env.AIRTABLE_API_KEY;
const LEADS_TABLE = process.env.AIRTABLE_LEADS_TABLE || 'Leads';
const AUTH = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };

// Normalize email for case-insensitive matching.
function normalizeEmail(e) {
  return String(e || '').trim().toLowerCase();
}

// Preload ALL existing Airtable leads' emails + Place IDs into in-memory Sets.
// Called once per overnight run before step-2 starts processing CSV rows.
// Returns { emailToRecord: Map<email, recordId>, placeIdToRecord: Map<placeId, recordId> }
export async function preloadDedupIndex({ verbose = false } = {}) {
  const emailToRecord = new Map();
  const placeIdToRecord = new Map();
  let offset = null;
  let pages = 0;
  do {
    pages++;
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(LEADS_TABLE)}`);
    url.searchParams.set('pageSize', '100');
    url.searchParams.append('fields[]', 'Email');
    url.searchParams.append('fields[]', 'Place ID');
    url.searchParams.append('fields[]', 'Business Name');
    url.searchParams.append('fields[]', 'Appearances');
    if (offset) url.searchParams.set('offset', offset);
    const r = await fetch(url, { headers: AUTH });
    const d = await r.json();
    if (d.error) throw new Error(`Airtable dedup preload error: ${JSON.stringify(d.error)}`);
    for (const rec of (d.records || [])) {
      const email = normalizeEmail(rec.fields.Email);
      const placeId = (rec.fields['Place ID'] || '').trim();
      if (email) emailToRecord.set(email, rec.id);
      if (placeId) placeIdToRecord.set(placeId, rec.id);
    }
    offset = d.offset;
    if (pages > 50) break; // safety cap (5000 leads)
  } while (offset);
  if (verbose) {
    console.log(`  [dedup] preloaded ${emailToRecord.size} emails + ${placeIdToRecord.size} Place IDs from Airtable (${pages} pages)`);
  }
  return { emailToRecord, placeIdToRecord };
}

// Check if a candidate lead is a duplicate.
// Returns { isDuplicate: bool, matchedRecordId: string | null, matchedBy: 'email' | 'placeId' | null }
export function checkDuplicate({ email, placeId }, index) {
  const normEmail = normalizeEmail(email);
  if (normEmail && index.emailToRecord.has(normEmail)) {
    return { isDuplicate: true, matchedRecordId: index.emailToRecord.get(normEmail), matchedBy: 'email' };
  }
  if (placeId && index.placeIdToRecord.has(placeId)) {
    return { isDuplicate: true, matchedRecordId: index.placeIdToRecord.get(placeId), matchedBy: 'placeId' };
  }
  return { isDuplicate: false, matchedRecordId: null, matchedBy: null };
}

// Append a new appearance to an existing Airtable record. Patches:
//   - Appearances JSON (append new {searchTerm, city, rank, date})
//   - Appearance Count (incremented)
//   - Best Rank / Worst Rank (recomputed from full Appearances)
//   - Cities Appeared In (deduplicated comma-separated list)
//   - Latest Appearance Date
//   - Skip Reasons (newline-appended log entry)
export async function appendAppearance({
  recordId,
  searchTerm,
  city,
  rank,
  date = new Date().toISOString().slice(0, 10),
  matchedBy,
}) {
  // Fetch current record to read existing Appearances JSON
  const fetchUrl = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(LEADS_TABLE)}/${recordId}`;
  const r1 = await fetch(fetchUrl, { headers: AUTH });
  const rec = await r1.json();
  if (rec.error) throw new Error(`Airtable fetch error for ${recordId}: ${JSON.stringify(rec.error)}`);
  const f = rec.fields || {};

  let appearances = [];
  try {
    if (f.Appearances) appearances = JSON.parse(f.Appearances);
    if (!Array.isArray(appearances)) appearances = [];
  } catch (_) {
    appearances = [];
  }

  // Skip if THIS exact appearance was already logged (rare but possible if
  // an overnight is re-run on the same CSV).
  const alreadyLogged = appearances.some(
    (a) => a.searchTerm === searchTerm && Number(a.rank) === Number(rank)
  );
  if (alreadyLogged) {
    return { skippedNoop: true };
  }

  appearances.push({ searchTerm, city, rank: Number(rank), date });

  const ranks = appearances.map((a) => Number(a.rank)).filter(Number.isFinite);
  const bestRank = ranks.length ? Math.min(...ranks) : null;
  const worstRank = ranks.length ? Math.max(...ranks) : null;
  const cities = Array.from(new Set(appearances.map((a) => (a.city || '').trim()).filter(Boolean)));

  const existingSkipReasons = (f['Skip Reasons'] || '').trim();
  const newSkipLine = `${date} — dedup-skip: matched by ${matchedBy}; appeared again in "${searchTerm}" at rank #${rank} (${city})`;
  const skipReasons = existingSkipReasons ? `${existingSkipReasons}\n${newSkipLine}` : newSkipLine;

  const fields = {
    'Appearances': JSON.stringify(appearances, null, 0),
    'Appearance Count': appearances.length,
    'Best Rank': bestRank,
    'Worst Rank': worstRank,
    'Cities Appeared In': cities.join(', '),
    'Latest Appearance Date': date,
    'Skip Reasons': skipReasons,
  };

  // Only set First Search if it isn't already set (first-time backfill).
  if (!f['First Search'] && appearances.length > 0) {
    fields['First Search'] = appearances[0].searchTerm;
  }

  const r2 = await fetch(fetchUrl, {
    method: 'PATCH',
    headers: AUTH,
    body: JSON.stringify({ fields, typecast: true }),
  });
  const d = await r2.json();
  if (d.error) throw new Error(`Airtable patch error for ${recordId}: ${JSON.stringify(d.error)}`);
  return { skippedNoop: false, appearanceCount: appearances.length, bestRank, worstRank };
}

// Convenience: seed the appearance fields on a brand-NEW lead's record so
// the JSON shape is consistent from day one. Called after step-8 publishes
// a new lead. Idempotent: only writes if Appearances is empty.
export async function seedFirstAppearance({ recordId, searchTerm, city, rank, date = new Date().toISOString().slice(0, 10) }) {
  const fetchUrl = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(LEADS_TABLE)}/${recordId}`;
  const r1 = await fetch(fetchUrl, { headers: AUTH });
  const rec = await r1.json();
  if (rec.error) return; // non-fatal
  const f = rec.fields || {};
  if (f.Appearances) return; // already seeded
  const appearances = [{ searchTerm, city, rank: Number(rank), date }];
  const fields = {
    'Appearances': JSON.stringify(appearances),
    'Appearance Count': 1,
    'Best Rank': Number(rank),
    'Worst Rank': Number(rank),
    'Cities Appeared In': city || '',
    'First Search': searchTerm,
    'Latest Appearance Date': date,
  };
  await fetch(fetchUrl, { method: 'PATCH', headers: AUTH, body: JSON.stringify({ fields, typecast: true }) });
}
