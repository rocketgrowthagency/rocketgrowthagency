#!/usr/bin/env node
// bulk-onboard.mjs — onboard N clients from a CSV in one shot.
//
// CSV header (required columns marked *):
//   * business_name
//   * primary_service
//   * primary_market
//     website_url
//     gbp_url
//     primary_contact_name
//     primary_contact_email
//     primary_contact_phone
//     account_manager
//     baseline_search_term
//     baseline_map_rank
//     baseline_rating
//     baseline_review_count
//     tracked_keywords  (semicolon-separated)
//
// Usage:
//   node bulk-onboard.mjs <clients.csv>
//   node bulk-onboard.mjs <clients.csv> --dry
//
// For each row: builds the same JSON shape as data/clients/<slug>.json then shells out
// to onboard-client.mjs (so we share that script's exact behavior — workspace lookup,
// idempotent upsert, baseline rankings, GBP snapshot).

import "dotenv/config";
import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";

const exec = promisify(execFile);

const args = process.argv.slice(2);
const csvPath = args[0];
const dry = args.includes("--dry");
if (!csvPath) { console.error("Usage: node bulk-onboard.mjs <clients.csv> [--dry]"); process.exit(1); }
if (!fs.existsSync(csvPath)) { console.error(`File not found: ${csvPath}`); process.exit(1); }

// Tiny CSV parser — handles quoted fields with commas + escaped quotes
function parseCsv(text) {
  const lines = [];
  let cur = []; let buf = ""; let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { buf += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else buf += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { cur.push(buf); buf = ""; }
      else if (c === "\n") { cur.push(buf); lines.push(cur); cur = []; buf = ""; }
      else if (c === "\r") {} // ignore
      else buf += c;
    }
  }
  if (buf || cur.length) { cur.push(buf); lines.push(cur); }
  return lines;
}

const text = fs.readFileSync(csvPath, "utf8");
const rows = parseCsv(text);
if (rows.length < 2) { console.error("CSV has no data rows"); process.exit(1); }
const headers = rows[0].map((h) => h.trim());
const records = rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] || "").trim()]))).filter((r) => r.business_name);

console.log(`[bulk] ${records.length} client(s) to onboard from ${csvPath}\n`);
records.forEach((r, i) => console.log(`  ${i + 1}. ${r.business_name} — ${r.primary_service} — ${r.primary_market}`));

if (dry) { console.log("\n[DRY] exiting before any writes."); process.exit(0); }

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rga-bulk-"));
const results = [];

for (const r of records) {
  if (!r.primary_service || !r.primary_market) {
    results.push({ business_name: r.business_name, ok: false, error: "Missing primary_service or primary_market" });
    continue;
  }
  const clientObj = {
    business_name: r.business_name,
    website_url: r.website_url || null,
    gbp_url: r.gbp_url || null,
    primary_service: r.primary_service,
    primary_market: r.primary_market,
    primary_contact_name: r.primary_contact_name || null,
    primary_contact_email: r.primary_contact_email || null,
    primary_contact_phone: r.primary_contact_phone || null,
    account_manager: r.account_manager || "Chris",
    tracked_keywords: r.tracked_keywords ? r.tracked_keywords.split(";").map((k) => k.trim()).filter(Boolean) : [],
  };
  if (r.baseline_search_term || r.baseline_map_rank) {
    clientObj.baseline = {
      search_term: r.baseline_search_term || null,
      map_rank: r.baseline_map_rank ? parseInt(r.baseline_map_rank, 10) : null,
      rating: r.baseline_rating ? parseFloat(r.baseline_rating) : null,
      review_count: r.baseline_review_count ? parseInt(r.baseline_review_count, 10) : null,
    };
  }

  const slug = r.business_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const tmpFile = path.join(tmpDir, `${slug}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify(clientObj, null, 2));

  console.log(`\n[bulk] ▶ Onboarding ${r.business_name}...`);
  try {
    const { stdout, stderr } = await exec("node", ["onboard-client.mjs", tmpFile], { cwd: process.cwd(), maxBuffer: 4 * 1024 * 1024 });
    if (stderr) console.warn(stderr);
    // Try to extract client_id from stdout
    const idMatch = stdout.match(/client_id[:=\s]+([0-9a-f-]{36})/i) || stdout.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
    results.push({ business_name: r.business_name, ok: true, client_id: idMatch?.[1] });
    console.log(`[bulk] ✓ ${r.business_name} onboarded`);
  } catch (err) {
    results.push({ business_name: r.business_name, ok: false, error: err.message?.slice(0, 200) });
    console.error(`[bulk] ✗ ${r.business_name} FAILED: ${err.message?.slice(0, 200)}`);
  }
}

console.log(`\n[bulk] ── Summary ──`);
results.forEach((r) => console.log(`  ${r.ok ? "✓" : "✗"} ${r.business_name}${r.client_id ? ` (id: ${r.client_id})` : ""}${r.error ? ` — ${r.error}` : ""}`));
const ok = results.filter((r) => r.ok).length;
console.log(`\n[bulk] ${ok}/${results.length} successful.`);
