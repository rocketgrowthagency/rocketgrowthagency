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
  /^test@test\./i,
  /^noreply@/i,
  /^no-reply@/i,
  /^info@yourdomain\./i,
  /^email@example\./i,
  /^you@/i,
  /@localhost$/i,
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
  const first = String(raw || "").split(/[;,\s]/).find((e) => /@/.test(e)) || "";
  return isPlaceholderEmail(first) ? "" : first.trim();
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

function cleanStr(v) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
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
  setUrl("GBP URL", pick(row, "google maps url", "maps url"));
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
  if (pick(row, "sponsored?", "sponsored")) fields["Sponsored"] = toBool(pick(row, "sponsored?", "sponsored"));
  setUrl("Business Photo URL", pick(row, "image url", "photo url"));
  setUrl("Facebook", pick(row, "facebook"));
  setUrl("Instagram", pick(row, "instagram"));
  set("Search Term", pick(row, "search term"));
  set("Search Source", pick(row, "search source"));
  fields["Status"] = "new";
  fields["Date Scraped"] = scrapedDate;
  fields["Raw Data"] = JSON.stringify(row, null, 0).slice(0, 99000);
  return { fields };
}

async function postBatch(records) {
  const res = await fetch(API_BASE, {
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

  const rows = await parseCsv(csvPath);
  const emailsFound = rows.filter((r) => extractValidEmail(pick(r, "email", "emails"))).length;
  console.log(`[step-8] ${rows.length} total rows, ${emailsFound} with a valid email — publishing ALL rows`);

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

  if (DRY) {
    records.slice(0, 3).forEach((rec, i) => console.log(`[DRY] sample ${i + 1}:`, JSON.stringify(rec.fields).slice(0, 220) + "..."));
    console.log(`[DRY] would POST ${records.length} records in batches of 10`);
    return;
  }

  let posted = 0;
  for (let i = 0; i < records.length; i += 10) {
    const batch = records.slice(i, i + 10);
    try {
      const res = await postBatch(batch);
      posted += res.records?.length || 0;
      console.log(`[step-8] batch ${Math.floor(i / 10) + 1}: +${res.records?.length || 0} records (total ${posted})`);
    } catch (err) {
      console.error(`[step-8] batch ${Math.floor(i / 10) + 1} failed:`, err.message);
    }
  }

  if (runId) await finalizeScrapeRun(runId, posted, posted > 0 ? "complete" : "failed");

  console.log(`[step-8] done — ${posted} record${posted === 1 ? "" : "s"} created in Airtable. Run row linked.`);
}

main().catch((err) => { console.error("[step-8] fatal:", err.message || err); process.exit(2); });
