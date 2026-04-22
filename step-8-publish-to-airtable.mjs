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

const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID } = process.env;
const AIRTABLE_TABLE = process.env.AIRTABLE_TABLE_NAME || "Leads";

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error("Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID in .env");
  process.exit(1);
}

const API_BASE = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE)}`;

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
  const dirs = [path.join(OUTPUT_DIR, "Step 2"), OUTPUT_DIR];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    const entries = await readdir(dir);
    const matches = entries.filter((n) => /\[step-2\]\.csv$/.test(n)).sort((a, b) => b.localeCompare(a));
    if (matches[0]) return path.join(dir, matches[0]);
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
  const email = pick(row, "email", "emails").split(/[;,\s]/).find((e) => /@/.test(e)) || "";
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
  const csvPath = await latestStep2Csv();
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
  const withEmail = rows.filter((r) => /@/.test(pick(r, "email", "emails")));
  console.log(`[step-8] ${rows.length} total rows, ${withEmail.length} with an email`);

  if (!withEmail.length) {
    console.log("[step-8] nothing to publish.");
    return;
  }

  const records = withEmail.map((r) => buildRecord(r, scrapedDate));

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

  console.log(`[step-8] done — ${posted} record${posted === 1 ? "" : "s"} created in Airtable.`);
}

main().catch((err) => { console.error("[step-8] fatal:", err.message || err); process.exit(2); });
