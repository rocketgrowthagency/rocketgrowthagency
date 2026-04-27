#!/usr/bin/env node
// Generate the master Search Queue in Airtable from data/verticals.csv × data/cities.csv.
//
// Auto-creates the "Search Queue" table + all required fields via Meta API.
// Idempotent — re-running just inserts new combos that aren't already in the queue.
//
// Usage:
//   node build-search-queue.mjs                  # populate using ./data/verticals.csv + ./data/cities.csv
//   node build-search-queue.mjs --dry-run        # show what would be added, no writes
//   node build-search-queue.mjs --tier=1         # only city tier 1
//   node build-search-queue.mjs --vertical-tier=1
//
// Env: AIRTABLE_API_KEY, AIRTABLE_BASE_ID
// Required PAT scope: data.records:read/write, schema.bases:read/write.

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID } = process.env;
if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error("Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID");
  process.exit(1);
}

const QUEUE_TABLE = process.env.AIRTABLE_QUEUE_TABLE || "Search Queue";
const VERTICALS_FILE = path.join(__dirname, "data", "verticals.csv");
const CITIES_FILE = path.join(__dirname, "data", "cities.csv");

const ARGS = process.argv.slice(2);
const DRY = ARGS.includes("--dry-run");
const CITY_TIER = Number((ARGS.find((a) => a.startsWith("--tier="))?.slice(7)) || 0);
const VERT_TIER = Number((ARGS.find((a) => a.startsWith("--vertical-tier="))?.slice(16)) || 0);

const META_API = `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}`;
const TABLE_API = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(QUEUE_TABLE)}`;

const REQUIRED_FIELDS = [
  // name+type[+options]. Order matters: first field becomes primary.
  { name: "Query", type: "singleLineText", description: "Full search string passed to step-1 (e.g. 'Plumbers in Culver City, CA')" },
  { name: "Vertical", type: "singleLineText", description: "Search term root from verticals.csv" },
  { name: "City", type: "singleLineText" },
  { name: "State", type: "singleLineText" },
  { name: "City Population", type: "number", options: { precision: 0 } },
  { name: "Vertical Tier", type: "number", options: { precision: 0 } },
  { name: "City Tier", type: "number", options: { precision: 0 } },
  { name: "Avg Ticket", type: "number", options: { precision: 0 }, description: "Estimated avg customer ticket for vertical (USD)" },
  {
    name: "Status",
    type: "singleSelect",
    options: {
      choices: [
        { name: "pending", color: "grayLight2" },
        { name: "in-progress", color: "yellowLight2" },
        { name: "done", color: "greenLight2" },
        { name: "failed", color: "redLight2" },
        { name: "skipped", color: "grayLight1" },
      ],
    },
  },
  { name: "Priority", type: "number", options: { precision: 0 }, description: "Higher = run sooner" },
  { name: "Last Attempted", type: "dateTime", options: { dateFormat: { name: "iso" }, timeFormat: { name: "24hour" }, timeZone: "America/Los_Angeles" } },
  { name: "Fail Count", type: "number", options: { precision: 0 } },
  { name: "Last Error", type: "multilineText" },
  { name: "Listings Found", type: "number", options: { precision: 0 } },
  { name: "Emails Found", type: "number", options: { precision: 0 } },
];

async function loadMeta() {
  const res = await fetch(`${META_API}/tables`, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
  if (!res.ok) throw new Error(`Meta load failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function ensureTableAndFields() {
  let meta = await loadMeta();
  let table = (meta.tables || []).find((t) => t.name === QUEUE_TABLE);

  if (!table) {
    console.log(`[setup] creating "${QUEUE_TABLE}" table...`);
    const createRes = await fetch(`${META_API}/tables`, {
      method: "POST",
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: QUEUE_TABLE,
        description: "Master search list for the outreach scraper. Each row = one Google Maps query to run.",
        fields: REQUIRED_FIELDS,
      }),
    });
    if (!createRes.ok) throw new Error(`Table create failed: ${(await createRes.text()).slice(0, 300)}`);
    const created = await createRes.json();
    console.log(`[setup] ✓ created table id=${created.id}`);
    table = created;
  } else {
    console.log(`[setup] table "${QUEUE_TABLE}" exists (id=${table.id}); ensuring all fields present`);
    const haveNames = new Set((table.fields || []).map((f) => f.name));
    for (const fld of REQUIRED_FIELDS) {
      if (haveNames.has(fld.name)) continue;
      console.log(`[setup] adding field "${fld.name}" (${fld.type})`);
      const r = await fetch(`${META_API}/tables/${table.id}/fields`, {
        method: "POST",
        headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(fld),
      });
      if (!r.ok) {
        const t = await r.text();
        console.warn(`[setup] could not add ${fld.name}: ${r.status} ${t.slice(0, 200)}`);
      }
    }
    // Refresh
    meta = await loadMeta();
    table = meta.tables.find((t) => t.name === QUEUE_TABLE);
  }
  return table;
}

function parseCsv(text) {
  // Tiny CSV parser: comma-separated, supports quoted fields with commas inside.
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  const rows = lines.map((line) => {
    const out = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"' && line[i - 1] !== "\\") { inQ = !inQ; continue; }
      if (c === "," && !inQ) { out.push(cur); cur = ""; continue; }
      cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  });
  const header = rows.shift();
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

function loadCsv(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  return parseCsv(text);
}

async function loadExistingQueries() {
  const queries = new Set();
  let offset = null;
  do {
    const u = new URL(TABLE_API);
    u.searchParams.set("pageSize", "100");
    u.searchParams.append("fields[]", "Query");
    if (offset) u.searchParams.set("offset", offset);
    const res = await fetch(u, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
    if (!res.ok) {
      console.warn(`[scan] existing queue scan failed ${res.status}`);
      break;
    }
    const data = await res.json();
    for (const r of data.records || []) {
      const q = r.fields?.Query;
      if (q) queries.add(String(q).toLowerCase().trim());
    }
    offset = data.offset;
  } while (offset);
  return queries;
}

async function postRows(rows) {
  for (let i = 0; i < rows.length; i += 10) {
    const batch = rows.slice(i, i + 10);
    const res = await fetch(TABLE_API, {
      method: "POST",
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ records: batch.map((fields) => ({ fields })), typecast: true }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[insert] batch ${Math.floor(i / 10) + 1} failed ${res.status}: ${text.slice(0, 200)}`);
      continue;
    }
    const data = await res.json();
    console.log(`[insert] batch ${Math.floor(i / 10) + 1}: +${data.records?.length || 0}`);
  }
}

async function main() {
  console.log(`[build-queue] table=${QUEUE_TABLE}, dry=${DRY}`);

  if (!fs.existsSync(VERTICALS_FILE) || !fs.existsSync(CITIES_FILE)) {
    console.error(`Missing data files. Expected:\n  ${VERTICALS_FILE}\n  ${CITIES_FILE}`);
    process.exit(1);
  }
  const verticals = loadCsv(VERTICALS_FILE);
  const cities = loadCsv(CITIES_FILE);
  console.log(`[build-queue] loaded ${verticals.length} verticals × ${cities.length} cities`);

  const filteredVerts = verticals.filter((v) => !VERT_TIER || Number(v.tier) === VERT_TIER);
  const filteredCities = cities.filter((c) => !CITY_TIER || Number(c.tier) === CITY_TIER);

  // Origin = Chris's location. Priority = distance from origin, with tier bonuses.
  const ORIGIN = { lat: 34.0211, lng: -118.3965 }; // Culver City, CA
  function haversineMiles(a, b) {
    const R = 3958.8; // Earth radius in miles
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function priorityFor(distanceMiles, cityTier, verticalTier) {
    // Distance dominates: 0mi → 100000, 400mi+ → 0. Then city tier (Tier 1 = +100), then vertical tier (Tier 1 = +10).
    const distancePts = Math.max(0, Math.round((400 - distanceMiles) * 250));
    const cityBonus = cityTier === 1 ? 100 : 0;
    const verticalBonus = verticalTier === 1 ? 10 : 0;
    return distancePts + cityBonus + verticalBonus;
  }

  // Cross-product with population gate per vertical.
  const candidates = [];
  for (const v of filteredVerts) {
    const minPop = Number(v.min_city_pop || 0);
    for (const c of filteredCities) {
      if (Number(c.population || 0) < minPop) continue;
      const lat = Number(c.lat), lng = Number(c.lng);
      const distance = (Number.isFinite(lat) && Number.isFinite(lng))
        ? haversineMiles(ORIGIN, { lat, lng })
        : 9999;
      const priority = priorityFor(distance, Number(c.tier), Number(v.tier));
      const query = `${v.search_term} in ${c.city}, ${c.state}`;
      candidates.push({
        Query: query,
        Vertical: v.search_term,
        City: c.city,
        State: c.state,
        "City Population": Number(c.population) || null,
        "Vertical Tier": Number(v.tier) || null,
        "City Tier": Number(c.tier) || null,
        "Avg Ticket": Number(v.avg_ticket) || null,
        Status: "pending",
        Priority: priority,
        "Fail Count": 0,
      });
    }
  }
  console.log(`[build-queue] ${candidates.length} candidate rows after filtering`);

  if (DRY) {
    candidates.slice(0, 5).forEach((c, i) => console.log(`[DRY] ${i + 1}: ${c.Query} (priority=${c.Priority}, pop=${c["City Population"]})`));
    console.log(`[DRY] would insert up to ${candidates.length} rows (after dedupe vs existing)`);
    return;
  }

  await ensureTableAndFields();

  const existing = await loadExistingQueries();
  console.log(`[build-queue] queue currently has ${existing.size} rows`);

  const toInsert = candidates.filter((c) => !existing.has(c.Query.toLowerCase().trim()));
  console.log(`[build-queue] inserting ${toInsert.length} new rows (${candidates.length - toInsert.length} already in queue)`);

  if (toInsert.length === 0) {
    console.log(`[build-queue] nothing to add — queue is up to date.`);
    return;
  }

  await postRows(toInsert);
  console.log(`[build-queue] done. Run \`node run-queue.mjs\` to start working through the queue.`);
}

main().catch((err) => { console.error(`[build-queue] fatal: ${err.message || err}`); process.exit(1); });
