#!/usr/bin/env node
/**
 * ℹ️ ONE-OFF BACKFILL (2026-05-21) — no caller by design. Already run; kept for reference only.
 *    Re-running it rewrites Day-1 Map Rank across Leads, so do not run casually.
 */
// scripts/backfill-day1-maprank.mjs
//
// One-time script: populate Day 1 Map Rank for any lead that has been sent
// an email (Email Sent Date present) but doesn't yet have the snapshot field
// set. Uses the lead's current Map Rank as the historical baseline.
//
// Locked 2026-05-21 after Email 5 (Day 45) work shipped — without this
// backfill, every lead from BEFORE the snapshot field was added would get the
// generic Email 5 fallback ("30 days ago you ranked #N") instead of the
// loss/hold/gain comparison framing.
//
// Usage:
//   node scripts/backfill-day1-maprank.mjs           # dry-run, shows what would change
//   node scripts/backfill-day1-maprank.mjs --apply   # actually patches Airtable
//
// Safe to re-run: only patches leads where Day 1 Map Rank is missing.
// Memory: project_email_sequence_2to5_implementation.md.

import 'dotenv/config';

const APPLY = process.argv.includes('--apply');
const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID } = process.env;
if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error('Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID in env.');
  process.exit(1);
}

const TABLE = 'Leads';
const BASE = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE)}`;
const HEADERS = { Authorization: `Bearer ${AIRTABLE_API_KEY}` };

async function loadAllSentLeads() {
  // Pull every lead where Email Sent Date is populated and Day 1 Map Rank is
  // empty. Airtable filterByFormula handles the empty-field check.
  const filter = `AND({Email Sent Date}, NOT({Day 1 Map Rank}))`;
  const fields = ['Business Name', 'Map Rank', 'Day 1 Map Rank', 'Email Sent Date'];
  const all = [];
  let offset = null;
  do {
    const u = new URL(BASE);
    u.searchParams.set('filterByFormula', filter);
    for (const f of fields) u.searchParams.append('fields[]', f);
    u.searchParams.set('pageSize', '100');
    if (offset) u.searchParams.set('offset', offset);
    const res = await fetch(u, { headers: HEADERS });
    if (!res.ok) throw new Error(`Airtable fetch failed (${res.status}): ${await res.text()}`);
    const data = await res.json();
    all.push(...(data.records || []));
    offset = data.offset;
  } while (offset);
  return all;
}

async function patchBatch(records) {
  const res = await fetch(BASE, {
    method: 'PATCH',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ records, typecast: true }),
  });
  if (!res.ok) throw new Error(`Airtable PATCH failed (${res.status}): ${await res.text()}`);
}

async function main() {
  console.log(`=== Day 1 Map Rank backfill ${APPLY ? '(APPLY MODE)' : '(DRY RUN)'} ===\n`);
  const leads = await loadAllSentLeads();
  console.log(`Found ${leads.length} leads with Email Sent Date but no Day 1 Map Rank.\n`);

  const toPatch = leads.filter((r) => {
    const mapRank = r.fields['Map Rank'];
    return Number.isFinite(parseInt(mapRank, 10));
  });
  const skipped = leads.length - toPatch.length;
  if (skipped > 0) {
    console.log(`⚠️ Skipping ${skipped} leads with no Map Rank (no historical anchor available).\n`);
  }

  for (const r of toPatch.slice(0, 10)) {
    console.log(`  ${r.fields['Business Name'] || '?'} → Day 1 Map Rank = ${r.fields['Map Rank']}`);
  }
  if (toPatch.length > 10) console.log(`  ... and ${toPatch.length - 10} more.\n`);

  if (!APPLY) {
    console.log(`\n[DRY RUN] Would patch ${toPatch.length} leads. Re-run with --apply to execute.`);
    return;
  }

  // Airtable allows up to 10 records per PATCH batch.
  let patched = 0;
  for (let i = 0; i < toPatch.length; i += 10) {
    const batch = toPatch.slice(i, i + 10).map((r) => ({
      id: r.id,
      fields: { 'Day 1 Map Rank': parseInt(r.fields['Map Rank'], 10) },
    }));
    await patchBatch(batch);
    patched += batch.length;
    console.log(`  patched ${patched}/${toPatch.length}...`);
  }
  console.log(`\n✓ Backfill complete: ${patched} leads now have Day 1 Map Rank.`);
}

main().catch((err) => {
  console.error('Backfill failed:', err.message);
  process.exit(1);
});
