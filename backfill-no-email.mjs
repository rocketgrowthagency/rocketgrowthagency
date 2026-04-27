#!/usr/bin/env node
// One-shot backfill: move no-email rows out of Leads → Leads No Email.
//
// Run when: you migrated to the two-table architecture (Leads + Leads No Email)
// AFTER some leads were already loaded into Leads. Anything in Leads with an
// empty Email field gets copied to Leads No Email + deleted from Leads.
//
// Idempotent: skips rows already in Leads No Email by Place ID.
//
// Usage:
//   node backfill-no-email.mjs              # do it
//   node backfill-no-email.mjs --dry-run    # report only

import "dotenv/config";

const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID } = process.env;
const SRC = process.env.AIRTABLE_TABLE_NAME || "Leads";
const DST = process.env.AIRTABLE_NO_EMAIL_TABLE || "Leads No Email";
const SRC_API = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(SRC)}`;
const DST_API = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(DST)}`;

const DRY = process.argv.includes("--dry-run");

// Derive a stable Place ID from a Google Maps URL (same logic as step-8 dedupe).
function extractPlaceKey(mapsUrl) {
  const s = String(mapsUrl || "");
  if (!s) return "";
  const m = s.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i);
  if (m && m[1]) return m[1].toLowerCase();
  const i = s.indexOf("/data=");
  return (i > -1 ? s.slice(0, i) : s).toLowerCase();
}

async function airJson(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json", ...(opts.headers || {}) } });
  if (!res.ok) throw new Error(`${opts.method || "GET"} ${url} → ${res.status}: ${(await res.text()).slice(0, 250)}`);
  return res.json();
}

async function loadAll(api, fields) {
  const all = [];
  let offset = null;
  do {
    const u = new URL(api);
    u.searchParams.set("pageSize", "100");
    if (fields) for (const f of fields) u.searchParams.append("fields[]", f);
    if (offset) u.searchParams.set("offset", offset);
    const data = await airJson(u.toString());
    all.push(...(data.records || []));
    offset = data.offset;
  } while (offset);
  return all;
}

console.log(`[backfill] dry=${DRY}`);

// Pull existing Place IDs in destination — for idempotent skip
const dstPlaceIds = new Set();
const dstRows = await loadAll(DST_API, ["Place ID"]);
for (const r of dstRows) {
  const p = r.fields?.["Place ID"];
  if (p) dstPlaceIds.add(p);
}
console.log(`[backfill] ${DST} already has ${dstPlaceIds.size} rows`);

// Pull all from Leads — full fields
const srcRows = await loadAll(SRC_API);
const noEmailRows = srcRows.filter((r) => {
  const e = (r.fields?.Email || "").trim();
  return !e;
});
console.log(`[backfill] ${SRC} has ${srcRows.length} total, ${noEmailRows.length} without Email`);

const toMigrate = noEmailRows.filter((r) => {
  const p = r.fields?.["Place ID"];
  return !p || !dstPlaceIds.has(p);
});
console.log(`[backfill] ${toMigrate.length} new to migrate (skipping ${noEmailRows.length - toMigrate.length} already in ${DST})`);

if (DRY) {
  toMigrate.slice(0, 5).forEach((r, i) => console.log(`  [DRY] ${i + 1}: ${r.fields?.["Business Name"]} (Place ID: ${r.fields?.["Place ID"] || "none"})`));
  console.log(`[DRY] would create ${toMigrate.length} in ${DST} + delete from ${SRC}`);
  process.exit(0);
}

if (!toMigrate.length) {
  console.log(`[backfill] nothing to do.`);
  process.exit(0);
}

// Create in destination (batch of 10)
let created = 0;
const createdSrcIds = []; // track which source IDs were successfully created (so we only delete those)
for (let i = 0; i < toMigrate.length; i += 10) {
  const batch = toMigrate.slice(i, i + 10);
  const records = batch.map((r) => {
    // Copy all fields verbatim. Linked records (Source Run) come back as arrays of IDs — passes through fine.
    const f = { ...(r.fields || {}) };
    // Backfill Place ID from GBP URL if missing — needed for future dedupe
    if (!f["Place ID"]) {
      const pk = extractPlaceKey(f["GBP URL"]);
      if (pk) f["Place ID"] = pk;
    }
    return { fields: f };
  });
  try {
    const data = await airJson(DST_API, { method: "POST", body: JSON.stringify({ records, typecast: true }) });
    created += data.records?.length || 0;
    // Map src indices that succeeded — assume same order
    batch.slice(0, data.records?.length || 0).forEach((r) => createdSrcIds.push(r.id));
    console.log(`[backfill] create batch ${Math.floor(i / 10) + 1}: +${data.records?.length || 0}`);
  } catch (err) {
    console.error(`[backfill] create batch ${Math.floor(i / 10) + 1} failed: ${err.message}`);
  }
}
console.log(`[backfill] ✓ created ${created} in ${DST}`);

// Delete the successfully-migrated rows from source
let deleted = 0;
for (let i = 0; i < createdSrcIds.length; i += 10) {
  const slice = createdSrcIds.slice(i, i + 10);
  const u = new URL(SRC_API);
  slice.forEach((id) => u.searchParams.append("records[]", id));
  try {
    const r = await fetch(u, { method: "DELETE", headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
    if (r.ok) {
      const data = await r.json();
      deleted += data.records?.length || 0;
    } else {
      console.warn(`[backfill] delete batch failed ${r.status}: ${(await r.text()).slice(0, 200)}`);
    }
  } catch (err) {
    console.warn(`[backfill] delete error: ${err.message}`);
  }
}
console.log(`[backfill] ✓ deleted ${deleted} from ${SRC}`);
console.log(`\n[backfill] done — ${created} migrated, ${deleted} cleaned up.`);
