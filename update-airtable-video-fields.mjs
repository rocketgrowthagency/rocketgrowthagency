#!/usr/bin/env node

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import csvParser from "csv-parser";
import slugify from "slugify";

const OUTPUT_DIR = path.join(process.cwd(), "output");
const STEP2_DIR = path.join(OUTPUT_DIR, "Step 2");
const FINAL_ROOT = path.join(OUTPUT_DIR, "Step 7 (Final Merge MP4)");

const FILE_ARG = process.argv.find((a) => a.startsWith("--file="))?.slice(7) || process.env.STEP2_CSV || "";
const MAX_RECORDS = Number(process.argv.find((a) => a.startsWith("--max="))?.slice(6) || process.env.MAX_RECORDS || 0);

const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID } = process.env;
const AIRTABLE_TABLE = process.env.AIRTABLE_TABLE_NAME || "Leads";
const API_BASE = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE)}`;

function latestStep2Csv() {
  const files = fs
    .readdirSync(STEP2_DIR)
    .filter((f) => f.toLowerCase().endsWith(".csv") && f.includes("[step-2]"))
    .map((name) => {
      const fullPath = path.join(STEP2_DIR, name);
      return { name, fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs };
    })
    .sort((a, b) => a.mtimeMs - b.mtimeMs || a.name.localeCompare(b.name));

  if (!files.length) {
    throw new Error(`No Step 2 CSV files found in: ${STEP2_DIR}`);
  }

  return files[files.length - 1].fullPath;
}

function loadCsv(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on("data", (row) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

function cleanString(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getEmail(row) {
  return cleanString(row.email || row.Email || "");
}

function getBusinessName(row) {
  return cleanString(row["Business Name"] || row.name || "");
}

function getSearchTerm(row) {
  return cleanString(row["Search Term"] || row.searchTerm || "");
}

function airtableString(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function findLeadRecordId({ email, businessName, searchTerm }) {
  const clauses = [];
  if (email) clauses.push(`{Email}="${airtableString(email)}"`);
  if (businessName) clauses.push(`{Business Name}="${airtableString(businessName)}"`);
  if (searchTerm) clauses.push(`{Search Term}="${airtableString(searchTerm)}"`);
  if (!clauses.length) return null;

  const filterByFormula = clauses.length === 1 ? clauses[0] : `AND(${clauses.join(",")})`;
  const url = `${API_BASE}?filterByFormula=${encodeURIComponent(filterByFormula)}&maxRecords=1`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
  });

  if (!res.ok) {
    throw new Error(`Airtable lookup failed (${res.status}) for ${businessName || email}`);
  }

  const data = await res.json();
  return data.records?.[0]?.id || null;
}

async function updateLead(recordId, fields) {
  const res = await fetch(`${API_BASE}/${recordId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ fields, typecast: true })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable update failed (${res.status}): ${text.slice(0, 300)}`);
  }
}

async function main() {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error("Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID in .env");
  }

  const step2Csv = FILE_ARG || latestStep2Csv();
  const baseName = path.basename(step2Csv).replace(/\.csv$/i, "");
  const finalDir = path.join(FINAL_ROOT, baseName);

  if (!fs.existsSync(step2Csv)) {
    throw new Error(`Step 2 CSV not found: ${step2Csv}`);
  }
  if (!fs.existsSync(finalDir)) {
    throw new Error(`Final MP4 directory not found: ${finalDir}`);
  }

  const rows = await loadCsv(step2Csv);
  const withEmail = rows.filter((row) => getEmail(row));
  const targets = MAX_RECORDS > 0 ? withEmail.slice(0, MAX_RECORDS) : withEmail;

  let updated = 0;
  let missingFile = 0;
  let missingLead = 0;

  for (let i = 0; i < targets.length; i++) {
    const row = targets[i];
    const businessName = getBusinessName(row);
    const email = getEmail(row);
    const searchTerm = getSearchTerm(row);
    const indexStr = String(i + 1).padStart(2, "0");
    const slug = slugify(businessName, { lower: true, strict: true }) || `business-${indexStr}`;
    const fileName = `${indexStr}_${slug}.mp4`;
    const filePath = path.join(finalDir, fileName);

    if (!fs.existsSync(filePath)) {
      console.warn(`[writeback] missing final MP4 for ${businessName}: ${fileName}`);
      missingFile += 1;
      continue;
    }

    const recordId = await findLeadRecordId({ email, businessName, searchTerm });
    if (!recordId) {
      console.warn(`[writeback] no Airtable lead match for ${businessName} <${email}>`);
      missingLead += 1;
      continue;
    }

    await updateLead(recordId, { "Video File": fileName });
    console.log(`[writeback] updated ${businessName} -> ${fileName}`);
    updated += 1;
  }

  console.log(`[writeback] done: ${updated} updated, ${missingFile} missing files, ${missingLead} missing Airtable matches`);
}

main().catch((err) => {
  console.error("[writeback] fatal:", err.message || err);
  process.exit(1);
});
