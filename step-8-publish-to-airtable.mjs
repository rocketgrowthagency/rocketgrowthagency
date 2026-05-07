#!/usr/bin/env node
// Step 8 — Publish scraped + enriched leads into Airtable.
//
// Reads the latest step-2 CSV and creates one Airtable record per row-with-email,
// mapping every scraped field into the RGA Outreach base's Leads table.
//
// Env (in .env):
//   AIRTABLE_API_KEY     Personal Access Token starting with pat...
//   AIRTABLE_BASE_ID     appXXXXXXXXXXXX
//   AIRTABLE_TABLE_NAME  Leads  (defaults to "Leads" if unset)
//
// Usage:
//   node step-8-publish-to-airtable.mjs
//   node step-8-publish-to-airtable.mjs --dry-run
//   node step-8-publish-to-airtable.mjs --file=/path/to/step-2.csv
//
// Airtable's create-records API accepts up to 10 records per request; we batch.

import "dotenv/config";
import { readdir } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import csvParser from "csv-parser";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "output");
const DRY = process.argv.includes("--dry-run");
const FILE_ARG = process.argv.find((a) => a.startsWith("--file="))?.slice(7) || "";

const PLACEHOLDER_EMAIL_PATTERNS = [
  /^user@domain\.com$/i,
  /^email@domain\.com$/i,
  /^example@example\./i,
  /^example@gmail\.com$/i,
  /^you@/i,
  /^your@/i,
  /^yourname@/i,
  /^test@test\./i,
  /^noreply@/i,
  /^no-reply@/i,
  /^donotreply@/i,
  /^info@yourdomain\./i,
  /^email@example\./i,
  /@localhost$/i,
  /\.(gif|jpg|png|jpeg|svg|webp|css|js|woff|ttf)$/i,
  // Tracking / monitoring / CDN pseudo-emails (not real contacts)
  /@sentry\.io$/i,
  /@sentry-next\.wixpress\.com$/i,
  /@sentry\.wixpress\.com$/i,
  /@wixpress\.com$/i,
  /@wix\.com$/i,
  /@cdn\./i,
  /@static\./i,
  /@google-analytics\./i,
  /@googletagmanager\./i,
  /@facebook\.com$/i,
  /@instagram\.com$/i,
  /@twitter\.com$/i,
  /@tiktok\.com$/i
];

function isPlaceholderEmail(e) {
  const s = String(e || "").trim();
  if (!s) return true;
  if (PLACEHOLDER_EMAIL_PATTERNS.some((p) => p.test(s))) return true;
  // Catch long hex-hash-prefixed "emails" (common in tracking URLs)
  const local = s.split("@")[0] || "";
  if (/^[0-9a-f]{24,}$/i.test(local)) return true;
  return false;
}

function extractValidEmail(raw) {
  const candidates = String(raw || "").split(/[;,\s]/).filter((e) => /@/.test(e));
  for (const c of candidates) {
    let e = c.trim().toLowerCase().replace(/^mailto:/i, "").split("?")[0].replace(/[.,;:'")>]+$/, "");
    if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(e)) continue;
    if (isPlaceholderEmail(e)) continue;
    return e;
  }
  return "";
}

const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID } = process.env;
const AIRTABLE_TABLE = process.env.AIRTABLE_TABLE_NAME || "Leads";

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error("Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID in .env");
  process.exit(1);
}

const API_BASE = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE)}`;
const RUNS_TABLE = "Scrape Runs";
const RUNS_API = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(RUNS_TABLE)}`;
// Sibling table for leads with no email — segregated so the main Leads table
// stays focused on actionable (emailable) records. Phone/mail outreach plan TBD.
const NO_EMAIL_TABLE = process.env.AIRTABLE_NO_EMAIL_TABLE || "Leads No Email";
const NO_EMAIL_API = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(NO_EMAIL_TABLE)}`;
const META_API = `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}`;
// Per Chris 2026-04-25: Leads No Email must have FULL schema parity with Leads —
// every field present, Email field included but stays blank. Reason: a no-email
// lead may be reached via phone/social/mail and we want the same Notes/Status/
// Date Contacted fields to track outreach across channels. EMPTY set = clone all.
const EMAIL_PIPELINE_FIELDS = new Set([]);

async function findOrCreateScrapeRun({ query, scrapedDate, listingsCount, emailsCount }) {
  // Look for an existing run with the same Query + Date Run
  const filter = encodeURIComponent(`AND({Query} = "${query.replace(/"/g, "\\\"")}", IS_SAME({Date Run}, "${scrapedDate}", "day"))`);
  const listUrl = `${RUNS_API}?filterByFormula=${filter}&maxRecords=1`;
  const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
  const listData = await listRes.json();
  const existing = listData.records?.[0];

  const vertical = inferVertical(query);
  const market = inferMarket(query);

  const fields = {
    Query: query,
    Vertical: vertical,
    Market: market,
    "Date Run": scrapedDate,
    "Listings Scraped": listingsCount,
    "Emails Found": emailsCount,
    Status: "running"
  };

  if (existing) {
    const upd = await fetch(`${RUNS_API}/${existing.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields, typecast: true })
    });
    const updData = await upd.json();
    return updData.id;
  }

  const create = await fetch(RUNS_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields, typecast: true })
  });
  const createData = await create.json();
  if (!create.ok) throw new Error(`Scrape Run create failed: ${JSON.stringify(createData)}`);
  return createData.id;
}

async function finalizeScrapeRun(runId, publishedCount, status) {
  await fetch(`${RUNS_API}/${runId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { "Published to Airtable": publishedCount, Status: status }, typecast: true })
  });
}

function inferVertical(query) {
  const q = query.toLowerCase();
  const verticals = [
    ["dentist", "dentists"],
    ["plumber", "plumbers"],
    ["hvac", "HVAC"],
    ["heating", "HVAC"],
    ["med spa", "med spas"],
    ["chiropractor", "chiropractors"],
    ["lawyer", "lawyers"],
    ["attorney", "lawyers"],
    ["accountant", "accountants"],
    ["cpa", "accountants"]
  ];
  for (const [needle, label] of verticals) if (q.includes(needle)) return label;
  return "other";
}

function inferMarket(query) {
  const m = query.match(/\bin\s+(.+?)(?:,|\s+CA\b|$)/i);
  return m ? m[1].trim() : "";
}

function parseCsv(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    createReadStream(filePath)
      .pipe(csvParser())
      .on("data", (row) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

async function latestStep2Csv() {
  // Match step 2's approach: sort by mtime so same-date runs pick the truly latest.
  const { statSync } = await import("node:fs");
  const dirs = [path.join(OUTPUT_DIR, "Step 2"), OUTPUT_DIR];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    const entries = await readdir(dir);
    const matches = entries.filter((n) => /\[step-2\]\.csv$/.test(n));
    if (!matches.length) continue;
    matches.sort((a, b) => statSync(path.join(dir, b)).mtimeMs - statSync(path.join(dir, a)).mtimeMs);
    return path.join(dir, matches[0]);
  }
  return null;
}

function pick(row, ...keys) {
  const lowerMap = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase().trim(), v]));
  for (const k of keys) {
    const v = lowerMap[String(k).toLowerCase().trim()];
    if (v !== undefined && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function toNumberOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function toBool(v) {
  const s = String(v || "").trim().toLowerCase();
  return s === "yes" || s === "true" || s === "1" || s === "y";
}

function isHttpUrl(v) {
  const s = String(v || "").trim();
  if (!s) return false;
  try { const u = new URL(s); return /^https?:$/i.test(u.protocol); } catch (_) { return false; }
}

// Generic / directory / aggregator rows that are not real businesses.
const GENERIC_NAME_PATTERNS = [
  /^find\s+/i,
  /\bnear\s+(me|you)\b/i,
  /^(the\s+)?(best|top|cheap|cheapest|affordable)\s+\d*\s*/i,
  /\b(directory|listings?)\b/i,
  /^\d+\s*(best|top)\s+/i
];

const AGGREGATOR_HOSTS = [
  "yelp.com", "angi.com", "angieslist.com", "thumbtack.com", "homeadvisor.com",
  "bbb.org", "trustpilot.com", "nextdoor.com", "porch.com", "houzz.com",
  "findlocal.com", "mapquest.com", "superpages.com", "citysearch.com",
  "yellowpages.com", "manta.com", "local.com"
];

function isGenericOrDirectoryListing(row) {
  const name = String(row["Business Name"] || row["business name"] || row.name || "").trim();
  if (!name) return true;
  if (GENERIC_NAME_PATTERNS.some((p) => p.test(name))) return true;

  const website = String(row["Website"] || row.website || "").trim();
  if (website) {
    try {
      const host = new URL(website).hostname.replace(/^www\./i, "").toLowerCase();
      if (AGGREGATOR_HOSTS.some((h) => host === h || host.endsWith("." + h))) return true;
    } catch {}
  }

  // Must have at least phone OR website to be a usable lead
  const phone = String(row["Phone"] || row.phone || "").trim();
  if (!phone && !website) return true;

  return false;
}

function cleanStr(v) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

// Auto-ensure the "Leads No Email" sibling table exists, cloned from Leads
// schema minus email-pipeline fields. Idempotent. Required PAT scope:
// schema.bases:write.
async function ensureNoEmailTable() {
  try {
    const metaRes = await fetch(`${META_API}/tables`, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
    if (!metaRes.ok) {
      console.warn(`[step-8] meta API unavailable (${metaRes.status}) — skipping no-email table check`);
      return false;
    }
    const meta = await metaRes.json();
    const existing = (meta.tables || []).find((t) => t.name === NO_EMAIL_TABLE);
    const leads = (meta.tables || []).find((t) => t.name === AIRTABLE_TABLE);
    if (!leads) {
      console.warn(`[step-8] source table "${AIRTABLE_TABLE}" not found in meta`);
      return false;
    }
    // If the table exists, sync any missing fields from Leads → keeps schemas in parity
    // even as Leads grows new fields over time.
    if (existing) {
      const have = new Set((existing.fields || []).map((f) => f.name));
      const missing = (leads.fields || []).filter((f) =>
        !have.has(f.name) && !EMAIL_PIPELINE_FIELDS.has(f.name) && !["formula", "lookup", "rollup", "count"].includes(f.type)
      );
      if (!missing.length) return true;
      console.log(`[step-8] syncing ${missing.length} missing field(s) from ${AIRTABLE_TABLE} → ${NO_EMAIL_TABLE}`);
      function cleanOptionsLocal(type, opts) {
        if (!opts) return undefined;
        const out = JSON.parse(JSON.stringify(opts));
        if (Array.isArray(out.choices)) out.choices = out.choices.map(({ id, ...rest }) => rest);
        if (type === "multipleRecordLinks") return { linkedTableId: out.linkedTableId };
        return out;
      }
      for (const f of missing) {
        const body = { name: f.name, type: f.type };
        if (f.description) body.description = f.description;
        const opts = cleanOptionsLocal(f.type, f.options);
        if (opts) body.options = opts;
        try {
          await fetch(`${META_API}/tables/${existing.id}/fields`, {
            method: "POST",
            headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
        } catch (e) {
          console.warn(`[step-8] could not sync field ${f.name}: ${e.message}`);
        }
      }
      return true;
    }
    // Clone fields, skip email-pipeline ones + computed/system fields. Linked
    // fields (Source Run → Scrape Runs) are re-pointed to the same target table.
    // cleanOptions: Airtable Meta API rejects `id` on existing singleSelect choices,
    // and for multipleRecordLinks creates only accepts {linkedTableId}.
    function cleanOptions(type, opts) {
      if (!opts) return undefined;
      const out = JSON.parse(JSON.stringify(opts));
      if (Array.isArray(out.choices)) out.choices = out.choices.map(({ id, ...rest }) => rest);
      if (type === "multipleRecordLinks") return { linkedTableId: out.linkedTableId };
      return out;
    }
    const fieldsToClone = (leads.fields || [])
      .filter((f) => !EMAIL_PIPELINE_FIELDS.has(f.name))
      // formula/lookup/rollup/count are computed; can't be re-created via Meta API
      .filter((f) => !["formula", "lookup", "rollup", "count"].includes(f.type))
      .map((f) => {
        const out = { name: f.name, type: f.type };
        if (f.description) out.description = f.description;
        const opts = cleanOptions(f.type, f.options);
        if (opts) out.options = opts;
        return out;
      });
    // Ensure "Business Name" is first (primary). Move it to position 0 if present.
    const primaryIdx = fieldsToClone.findIndex((f) => f.name === "Business Name");
    if (primaryIdx > 0) {
      const [primary] = fieldsToClone.splice(primaryIdx, 1);
      fieldsToClone.unshift(primary);
    }
    console.log(`[step-8] creating "${NO_EMAIL_TABLE}" with ${fieldsToClone.length} fields...`);
    const createRes = await fetch(`${META_API}/tables`, {
      method: "POST",
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: NO_EMAIL_TABLE,
        description: "Scraped places with no public email. Segregated from Leads so the email pipeline stays focused. Phone/mail outreach plan TBD.",
        fields: fieldsToClone,
      }),
    });
    if (createRes.ok) {
      console.log(`[step-8] ✓ created "${NO_EMAIL_TABLE}" table`);
      return true;
    }
    const text = await createRes.text();
    console.warn(`[step-8] could not create no-email table: ${createRes.status} ${text.slice(0, 300)}`);
    return false;
  } catch (err) {
    console.warn(`[step-8] no-email table setup failed: ${err.message}`);
    return false;
  }
}

// Auto-create all new GBP detail + CRM fields on the Leads table. Idempotent.
async function ensureGbpCrmFields() {
  const newFields = [
    { name: "GBP Status", type: "singleSelect", options: { choices: [
      { name: "operational", color: "greenLight2" },
      { name: "closed_temporarily", color: "yellowLight2" },
      { name: "closed_permanently", color: "redLight2" },
    ]}},
    { name: "GBP Secondary Categories", type: "multilineText" },
    { name: "GBP Photo Count", type: "number", options: { precision: 0 } },
    { name: "GBP Hours", type: "multilineText" },
    { name: "GBP Has Posts", type: "checkbox", options: { icon: "check", color: "greenBright" } },
    { name: "GBP Description", type: "multilineText" },
    { name: "Pipeline Stage", type: "singleSelect", options: { choices: [
      { name: "scraped", color: "grayLight2" },
      { name: "video_sent", color: "blueLight2" },
      { name: "opened", color: "cyanLight2" },
      { name: "clicked", color: "tealLight2" },
      { name: "audit_submitted", color: "purpleLight2" },
      { name: "follow_up", color: "orangeLight2" },
      { name: "proposal", color: "yellowLight2" },
      { name: "signed", color: "greenLight2" },
      { name: "dead", color: "redLight2" },
    ]}},
    { name: "Tags", type: "multipleSelects", options: { choices: [
      { name: "top_3", color: "greenLight2" },
      { name: "rank_4plus", color: "blueLight2" },
      { name: "high_reviews", color: "tealLight2" },
      { name: "low_reviews", color: "yellowLight2" },
      { name: "no_website", color: "redLight2" },
      { name: "has_website", color: "cyanLight2" },
      { name: "hot", color: "redBright" },
      { name: "warm", color: "orangeLight2" },
      { name: "cold", color: "grayLight2" },
    ]}},
    { name: "Lead Score", type: "number", options: { precision: 0 } },
    { name: "Vid Slug", type: "singleLineText", description: "Landing page slug /v/SLUG — used by FGA enrichment to look up this record via ?vid= param" },
    { name: "FGA Audit ID", type: "singleLineText", description: "Set when lead submits the FGA form — links this outreach record to its FGA report" },
    { name: "Last Activity", type: "date", options: { dateFormat: { name: "us" } } },
    { name: "Follow Up Date", type: "date", options: { dateFormat: { name: "us" } } },
  ];

  try {
    const metaRes = await fetch(`${META_API}/tables`, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
    if (!metaRes.ok) { console.warn(`[step-8] meta API unavailable — skipping GBP/CRM field auto-create`); return; }
    const meta = await metaRes.json();
    const table = (meta.tables || []).find((t) => t.name === AIRTABLE_TABLE);
    if (!table) { console.warn(`[step-8] table "${AIRTABLE_TABLE}" not found`); return; }
    const existing = new Set((table.fields || []).map((f) => f.name));
    const missing = newFields.filter((f) => !existing.has(f.name));
    if (!missing.length) return;
    const createUrl = `${META_API}/tables/${table.id}/fields`;
    for (const field of missing) {
      const res = await fetch(createUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(field),
      });
      if (res.ok) {
        console.log(`[step-8] ✓ auto-created field "${field.name}"`);
      } else {
        const text = await res.text();
        console.warn(`[step-8] could not create field "${field.name}" (${res.status}): ${text.slice(0, 200)}`);
      }
    }
  } catch (err) {
    console.warn(`[step-8] GBP/CRM field check failed: ${err.message}`);
  }
}

// Auto-ensure the Leads table has a `Place ID` field. Idempotent — if it
// already exists, this is a no-op. Requires the PAT to have `schema.bases:write`
// scope on this base. If the call 403s/404s we just warn and proceed (dedupe
// still works by extracting Place ID from GBP URL on the fly).
async function ensurePlaceIdField() {
  try {
    const metaUrl = `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`;
    const metaRes = await fetch(metaUrl, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
    if (!metaRes.ok) {
      console.warn(`[step-8] meta API unavailable (${metaRes.status}) — skipping Place ID field auto-create. Dedupe still works in-memory.`);
      return;
    }
    const meta = await metaRes.json();
    const table = (meta.tables || []).find((t) => t.name === AIRTABLE_TABLE);
    if (!table) {
      console.warn(`[step-8] table "${AIRTABLE_TABLE}" not found in meta response`);
      return;
    }
    const exists = (table.fields || []).some((f) => f.name === "Place ID");
    if (exists) return;
    const createUrl = `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables/${table.id}/fields`;
    const createRes = await fetch(createUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Place ID",
        type: "singleLineText",
        description: "Stable Google Maps CID (0x...:0x...) — used for per-lead dedupe across re-scrapes."
      })
    });
    if (createRes.ok) {
      console.log(`[step-8] ✓ auto-created "Place ID" field on ${AIRTABLE_TABLE} table`);
    } else {
      const text = await createRes.text();
      console.warn(`[step-8] could not auto-create Place ID field (${createRes.status}): ${text.slice(0, 200)}`);
    }
  } catch (err) {
    console.warn(`[step-8] Place ID field check failed: ${err.message}`);
  }
}

// Extract a stable unique key from a Google Maps place URL.
// Prefers the canonical "0x{hex}:0x{hex}" CID pair; falls back to the
// pre-/data= URL prefix (still stable across runs).
function extractPlaceKey(mapsUrl) {
  const s = String(mapsUrl || '');
  if (!s) return '';
  const m = s.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i);
  if (m && m[1]) return m[1].toLowerCase();
  const i = s.indexOf('/data=');
  return (i > -1 ? s.slice(0, i) : s).toLowerCase();
}

// Fetch all existing leads with their Place ID across BOTH tables (Leads +
// Leads No Email). Returns Map<placeKey, { id, fields, table }>. Used to:
//  - skip duplicate creates,
//  - migrate no-email → leads when an email is later found,
//  - patch existing in-place to refresh rank/date.
async function loadExistingLeadsByPlaceKey() {
  const map = new Map();
  for (const [tableName, api] of [[AIRTABLE_TABLE, API_BASE], [NO_EMAIL_TABLE, NO_EMAIL_API]]) {
    let offset = null;
    do {
      const u = new URL(api);
      u.searchParams.set('pageSize', '100');
      u.searchParams.append('fields[]', 'Place ID');
      u.searchParams.append('fields[]', 'GBP URL');
      u.searchParams.append('fields[]', 'Map Rank');
      u.searchParams.append('fields[]', 'Date Scraped');
      u.searchParams.append('fields[]', 'Business Name');
      if (offset) u.searchParams.set('offset', offset);
      const res = await fetch(u, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
      if (!res.ok) {
        // 404 likely means the no-email table doesn't exist yet; that's fine.
        if (res.status === 404 && tableName === NO_EMAIL_TABLE) break;
        console.warn(`[step-8] existing-leads lookup failed for ${tableName} ${res.status}`);
        break;
      }
      const data = await res.json();
      for (const r of (data.records || [])) {
        const placeId = r.fields?.['Place ID'] || extractPlaceKey(r.fields?.['GBP URL']);
        if (placeId) map.set(placeId, { id: r.id, fields: r.fields || {}, table: tableName });
      }
      offset = data.offset;
    } while (offset);
  }
  return map;
}

async function patchBatchTo(api, records) {
  const res = await fetch(api, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ records, typecast: true })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable PATCH ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

async function deleteRecords(api, ids) {
  // Airtable batch delete: up to 10 IDs per request via repeated `records[]` query params
  for (let i = 0; i < ids.length; i += 10) {
    const slice = ids.slice(i, i + 10);
    const u = new URL(api);
    slice.forEach((id) => u.searchParams.append('records[]', id));
    const res = await fetch(u, { method: 'DELETE', headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
    if (!res.ok) console.warn(`[step-8] delete batch failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

function buildRecord(row, scrapedDate) {
  const fields = {};
  const set = (key, val) => { const c = cleanStr(val); if (c) fields[key] = c; };
  const setUrl = (key, val) => { if (isHttpUrl(val)) fields[key] = cleanStr(val); };
  const setNum = (key, val) => { const n = toNumberOrNull(val); if (n !== null) fields[key] = n; };

  set("Business Name", pick(row, "business name", "name"));
  set("Phone", pick(row, "phone"));
  const email = extractValidEmail(pick(row, "email", "emails"));
  set("Email", email);
  setUrl("Website", pick(row, "website"));
  const gbpUrl = pick(row, "google maps url", "maps url");
  setUrl("GBP URL", gbpUrl);
  // Stable per-place dedupe key — set unconditionally so future re-runs can match
  const placeKey = extractPlaceKey(gbpUrl);
  if (placeKey) fields["Place ID"] = placeKey;
  set("Address", pick(row, "address"));
  set("City", pick(row, "city"));
  set("State", pick(row, "state"));
  set("ZIP", pick(row, "zip code", "zip"));
  setNum("Latitude", pick(row, "latitude", "lat"));
  setNum("Longitude", pick(row, "longitude", "lng", "long"));
  set("Category", pick(row, "detected category", "category"));
  setNum("Rating", pick(row, "rating"));
  setNum("Review Count", pick(row, "reviews", "review count"));
  setNum("Map Rank", pick(row, "map rank"));
  // Auto-set Video Variant based on Google Maps rank: 1-3 → top-3, 4+ → rank-4-plus
  const rankForVariant = parseInt(pick(row, "map rank"), 10);
  fields["Video Variant"] =
    Number.isFinite(rankForVariant) && rankForVariant >= 1 && rankForVariant <= 3
      ? "top-3"
      : "rank-4-plus";
  if (pick(row, "sponsored?", "sponsored")) fields["Sponsored"] = toBool(pick(row, "sponsored?", "sponsored"));
  setUrl("Business Photo URL", pick(row, "image url", "photo url"));
  setUrl("Facebook", pick(row, "facebook"));
  setUrl("Instagram", pick(row, "instagram"));
  set("Search Term", pick(row, "search term"));
  set("Search Source", pick(row, "search source"));

  // GBP detail fields — captured by step-1 while already on the profile page
  set("GBP Status", pick(row, "gbp status"));
  set("GBP Secondary Categories", pick(row, "gbp secondary categories"));
  setNum("GBP Photo Count", pick(row, "gbp photo count"));
  set("GBP Hours", pick(row, "gbp hours"));
  const hasPosts = pick(row, "gbp has posts");
  if (hasPosts === "Yes" || hasPosts === "true" || hasPosts === true) fields["GBP Has Posts"] = true;
  set("GBP Description", pick(row, "gbp description"));

  // Pipeline Stage defaults to "scraped" on first write; never overwritten on PATCH
  fields["Pipeline Stage"] = "scraped";

  fields["Status"] = "new";
  fields["Date Scraped"] = scrapedDate;
  fields["Raw Data"] = JSON.stringify(row, null, 0).slice(0, 99000);
  return { fields };
}

async function postBatchTo(api, records) {
  const res = await fetch(api, {
    method: "POST",
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ records, typecast: true })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable POST ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

async function main() {
  const csvPath = FILE_ARG || await latestStep2Csv();
  if (!csvPath) {
    console.error("[step-8] no step-2 CSV found in output/.");
    process.exit(1);
  }
  console.log(`[step-8] reading ${path.basename(csvPath)}`);

  // Extract date from filename prefix "YYYY-MM-DD_..."
  const base = path.basename(csvPath);
  const dateMatch = base.match(/^(\d{4}-\d{2}-\d{2})/);
  const scrapedDate = dateMatch ? dateMatch[1] : new Date().toISOString().slice(0, 10);

  const rawRows = await parseCsv(csvPath);
  const skipped = [];
  const rows = rawRows.filter((r) => {
    if (isGenericOrDirectoryListing(r)) {
      skipped.push(pick(r, "business name", "name") || "(unnamed)");
      return false;
    }
    return true;
  });
  const emailsFound = rows.filter((r) => extractValidEmail(pick(r, "email", "emails"))).length;
  console.log(`[step-8] ${rawRows.length} raw rows, ${skipped.length} filtered (directory/generic), ${rows.length} real, ${emailsFound} with valid email`);
  if (skipped.length) console.log(`[step-8] filtered: ${skipped.slice(0, 5).join(", ")}${skipped.length > 5 ? "…" : ""}`);

  if (!rows.length) {
    console.log("[step-8] nothing to publish.");
    return;
  }

  // Pull the Search Term from the first row (assumes one query per step-1 run)
  const query = pick(rows[0] || {}, "search term") || path.basename(csvPath).replace(/^\d{4}-\d{2}-\d{2}_/, "").replace(/-\[step-2\]\.csv$/, "").replace(/-/g, " ");

  let runId = null;
  if (!DRY) {
    runId = await findOrCreateScrapeRun({ query, scrapedDate, listingsCount: rows.length, emailsCount: emailsFound });
    console.log(`[step-8] scrape run: ${runId} for "${query}"`);
  }

  const records = rows.map((r) => {
    const rec = buildRecord(r, scrapedDate);
    if (runId) rec.fields["Source Run"] = [runId];
    return rec;
  });

  // Per-lead dedupe by Place ID across BOTH tables (Leads + Leads No Email).
  // Routing rules:
  //   - new lead, has Email → CREATE in Leads
  //   - new lead, no Email  → CREATE in Leads No Email
  //   - existing in Leads (any state) → PATCH in Leads (refresh rank/date)
  //   - existing in Leads No Email + new has Email → MIGRATE: delete from
  //       Leads No Email, create in Leads (now actionable for outreach)
  //   - existing in Leads No Email + new still no Email → PATCH in Leads No Email
  if (!DRY) {
    await ensureGbpCrmFields();
    await ensurePlaceIdField();
    await ensureNoEmailTable();
  }
  console.log(`[step-8] loading existing Airtable leads (both tables) for dedupe...`);
  const existing = DRY ? new Map() : await loadExistingLeadsByPlaceKey();
  console.log(`[step-8] indexed ${existing.size} existing leads (across Leads + Leads No Email)`);

  const toCreateLeads = [];
  const toCreateNoEmail = [];
  const toUpdateLeads = [];
  const toUpdateNoEmail = [];
  const toMigrate = []; // { fromId, newRecord }
  let skippedNoKey = 0;
  for (const rec of records) {
    const pk = rec.fields["Place ID"];
    const hasEmail = !!rec.fields.Email;
    if (!pk) {
      skippedNoKey += 1;
      (hasEmail ? toCreateLeads : toCreateNoEmail).push(rec);
      continue;
    }
    const match = existing.get(pk);
    if (match) {
      const refreshFields = {
        "Map Rank": rec.fields["Map Rank"],
        "Date Scraped": rec.fields["Date Scraped"],
      };
      if (rec.fields["Source Run"]) refreshFields["Source Run"] = rec.fields["Source Run"];
      if (!match.fields?.["Place ID"]) refreshFields["Place ID"] = pk;

      if (match.table === NO_EMAIL_TABLE && hasEmail) {
        // Promotion: this place now has an email — move it to the actionable Leads table.
        toMigrate.push({ fromId: match.id, newRecord: rec });
      } else if (match.table === NO_EMAIL_TABLE) {
        toUpdateNoEmail.push({ id: match.id, fields: refreshFields });
      } else {
        toUpdateLeads.push({ id: match.id, fields: refreshFields });
      }
    } else {
      (hasEmail ? toCreateLeads : toCreateNoEmail).push(rec);
    }
  }
  console.log(
    `[step-8] dedupe: +${toCreateLeads.length} Leads, +${toCreateNoEmail.length} NoEmail, ` +
    `~${toUpdateLeads.length} Leads, ~${toUpdateNoEmail.length} NoEmail, ` +
    `→${toMigrate.length} migrate, ${skippedNoKey} no-key`
  );

  if (DRY) {
    console.log(`[DRY] would POST ${toCreateLeads.length}+${toCreateNoEmail.length} / PATCH ${toUpdateLeads.length}+${toUpdateNoEmail.length} / migrate ${toMigrate.length}`);
    return;
  }

  let posted = 0;
  let patched = 0;
  let migrated = 0;
  // Helper: batch process create/patch into the named table
  async function doCreate(api, recs, label) {
    let n = 0;
    for (let i = 0; i < recs.length; i += 10) {
      try {
        const res = await postBatchTo(api, recs.slice(i, i + 10));
        n += res.records?.length || 0;
      } catch (err) {
        console.error(`[step-8] ${label} create batch ${Math.floor(i / 10) + 1} failed:`, err.message);
      }
    }
    if (n) console.log(`[step-8] ✓ created ${n} in ${label}`);
    return n;
  }
  async function doPatch(api, recs, label) {
    let n = 0;
    for (let i = 0; i < recs.length; i += 10) {
      try {
        const res = await patchBatchTo(api, recs.slice(i, i + 10));
        n += res.records?.length || 0;
      } catch (err) {
        console.error(`[step-8] ${label} patch batch ${Math.floor(i / 10) + 1} failed:`, err.message);
      }
    }
    if (n) console.log(`[step-8] ✓ patched ${n} in ${label}`);
    return n;
  }

  posted += await doCreate(API_BASE, toCreateLeads, "Leads");
  posted += await doCreate(NO_EMAIL_API, toCreateNoEmail, "Leads No Email");
  patched += await doPatch(API_BASE, toUpdateLeads, "Leads");
  patched += await doPatch(NO_EMAIL_API, toUpdateNoEmail, "Leads No Email");

  // Migration: create in Leads (with all the fresh fields), then delete from Leads No Email.
  // We do create-first so a partial failure doesn't lose data.
  if (toMigrate.length) {
    const migrateCreates = toMigrate.map((m) => m.newRecord);
    const created = await doCreate(API_BASE, migrateCreates, "Leads (migrated)");
    if (created > 0) {
      const idsToDelete = toMigrate.map((m) => m.fromId);
      await deleteRecords(NO_EMAIL_API, idsToDelete);
      migrated = created;
      console.log(`[step-8] ✓ migrated ${migrated} from Leads No Email → Leads (now actionable)`);
    }
  }

  if (runId) await finalizeScrapeRun(runId, posted, posted > 0 || patched > 0 || migrated > 0 ? "complete" : "failed");

  console.log(`[step-8] done — created=${posted} (incl ${migrated} migrated), patched=${patched}.`);
}

main().catch((err) => { console.error("[step-8] fatal:", err.message || err); process.exit(2); });
