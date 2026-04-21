#!/usr/bin/env node
// Step 8 — Publish scraped + enriched leads into Supabase `lead_intakes`.
//
// Reads the latest step-2 CSV, filters to rows with an email, and upserts each
// one as a lead_intakes row so the admin Leads tab can surface them.
//
// Env (put in .env next to OPENAI_API_KEY):
//   SUPABASE_URL                 e.g. https://jetgayimvfeslqnkbfdq.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    service-role secret (bypasses RLS for server writes)
//   SUPABASE_WORKSPACE_ID        optional; if missing we use the first workspace in the table
//
// Usage:
//   node step-8-publish-to-supabase.mjs
//   node step-8-publish-to-supabase.mjs --dry-run   (parse + print, no upserts)

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "output");
const DRY = process.argv.includes("--dry-run");

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_WORKSPACE_ID } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  console.error("Add them to the .env file next to OPENAI_API_KEY, then re-run.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function parseCsv(text) {
  const rows = [];
  const lines = text.split(/\r?\n/);
  if (!lines.length) return rows;
  const header = splitCsvLine(lines[0]);
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = splitCsvLine(lines[i]);
    const row = {};
    header.forEach((h, idx) => { row[h] = cols[idx] ?? ""; });
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && line[i + 1] === '"') { cur += '"'; i += 1; continue; }
    if (c === '"') { inQuotes = !inQuotes; continue; }
    if (c === "," && !inQuotes) { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

async function latestStep2Csv() {
  if (!existsSync(OUTPUT_DIR)) return null;
  const entries = await readdir(OUTPUT_DIR);
  const matches = entries.filter((n) => /\[step-2\]\.csv$/.test(n)).sort((a, b) => b.localeCompare(a));
  return matches[0] ? path.join(OUTPUT_DIR, matches[0]) : null;
}

async function resolveWorkspaceId() {
  if (SUPABASE_WORKSPACE_ID) return SUPABASE_WORKSPACE_ID;
  const { data, error } = await supabase.from("workspaces").select("id").limit(1);
  if (error) throw new Error(`Could not resolve workspace_id: ${error.message}`);
  if (!data?.[0]?.id) throw new Error("No workspaces exist in Supabase. Create one via the admin first.");
  return data[0].id;
}

function pick(row, ...keys) {
  for (const k of keys) {
    const v = row[k] || row[k?.toLowerCase()] || row[k?.toUpperCase()];
    if (v && String(v).trim()) return String(v).trim();
  }
  return "";
}

async function main() {
  const csvPath = await latestStep2Csv();
  if (!csvPath) {
    console.error("No step-2 CSV found in output/. Run step 2 first.");
    process.exit(1);
  }
  console.log(`[step-8] reading ${path.basename(csvPath)}`);

  const rows = parseCsv(await readFile(csvPath, "utf8"));
  const withEmail = rows.filter((r) => /@/.test(pick(r, "email", "emails")));
  console.log(`[step-8] ${rows.length} total rows, ${withEmail.length} with an email`);

  if (!withEmail.length) {
    console.log("[step-8] nothing to publish.");
    return;
  }

  const workspaceId = await resolveWorkspaceId();
  console.log(`[step-8] workspace_id = ${workspaceId}`);

  let inserted = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of withEmail) {
    const business = pick(row, "name", "business_name");
    const email = pick(row, "email", "emails").split(/[;,\s]/).find((e) => /@/.test(e)) || "";
    const website = pick(row, "website", "website_url");
    const gbp = pick(row, "mapsUrl", "gbpUrl", "gbp_url");
    const searchTerm = pick(row, "searchTerm", "search_term", "query");
    const externalId = `scraper:${slugify(business)}:${slugify(searchTerm)}`;

    const payload = {
      workspace_id: workspaceId,
      source: "scraper",
      external_id: externalId,
      status: "new",
      business_name: business || null,
      contact_email: email || null,
      website_url: website || null,
      gbp_url: gbp || null,
      raw_payload: row
    };

    if (DRY) {
      console.log("[step-8 DRY]", externalId, "→", business, email);
      inserted += 1;
      continue;
    }

    // Upsert by external_id so re-runs don't duplicate
    const { error } = await supabase
      .from("lead_intakes")
      .upsert(payload, { onConflict: "external_id" });

    if (error) {
      // lead_intakes may not have a unique constraint on external_id — fall back to insert if dup-ignore fails
      const { error: insertErr } = await supabase.from("lead_intakes").insert(payload);
      if (insertErr && !/duplicate key|unique/.test(insertErr.message)) {
        console.error(`[step-8] ✗ ${business}: ${insertErr.message}`);
        failed += 1;
        continue;
      }
      if (insertErr) { skipped += 1; continue; }
    }
    inserted += 1;
  }

  console.log(`[step-8] done — inserted/updated ${inserted}, skipped ${skipped}, failed ${failed}`);
}

main().catch((err) => {
  console.error("[step-8] fatal:", err.message || err);
  process.exit(2);
});
