#!/usr/bin/env node
// Apply a SQL migration to the RGA Supabase project via the Management API.
//
// SAFETY: hardcoded to project ref jetgayimvfeslqnkbfdq (RGA only). Refuses any
// other project. If you ever need to migrate a different project, you must
// edit this file explicitly — no env var override.
//
// Usage:
//   node apply-supabase-migration.mjs <path-to-sql-file>
//   node apply-supabase-migration.mjs ../Rocket\ Growth\ Agency\ Website\ VS\ Code/docs/supabase/RGA_PERFORMANCE_TRACKING_PATCH.sql
//
// Env: SUPABASE_ACCESS_TOKEN (personal access token from Supabase dashboard)

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

// ============================================================
// SAFETY GUARD — HARDCODED. Do not parameterize. Do not env-var.
// ============================================================
const RGA_PROJECT_REF = "jetgayimvfeslqnkbfdq";
const ALLOWED_REFS = new Set([RGA_PROJECT_REF]);

function assertAllowedProject(ref) {
  if (!ALLOWED_REFS.has(ref)) {
    console.error(`\n🚨 REFUSED: project ref "${ref}" is not in the allowlist.`);
    console.error(`   This script is hardcoded to ONLY operate on RGA (${RGA_PROJECT_REF}).`);
    console.error(`   echory + echory_app are off-limits. If you need a different project, edit this file.`);
    process.exit(2);
  }
}

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) {
  console.error("Missing SUPABASE_ACCESS_TOKEN in .env (generate at https://supabase.com/dashboard/account/tokens)");
  process.exit(1);
}
if (!TOKEN.startsWith("sbp_")) {
  console.error(`Token doesn't start with sbp_ — looks malformed. Got: ${TOKEN.slice(0, 5)}...`);
  process.exit(1);
}

const sqlPath = process.argv[2];
if (!sqlPath) {
  console.error("Usage: node apply-supabase-migration.mjs <path-to-sql-file>");
  process.exit(1);
}
if (!fs.existsSync(sqlPath)) {
  console.error(`SQL file not found: ${sqlPath}`);
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, "utf8");
console.log(`[migration] file: ${path.basename(sqlPath)}`);
console.log(`[migration] size: ${sql.length} chars, ${sql.split("\n").length} lines`);
console.log(`[migration] target project: ${RGA_PROJECT_REF} (RGA — verified hardcoded)`);

// Final safety check before sending
assertAllowedProject(RGA_PROJECT_REF);

const url = `https://api.supabase.com/v1/projects/${RGA_PROJECT_REF}/database/query`;
console.log(`[migration] POST ${url}`);

const res = await fetch(url, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query: sql }),
});

const text = await res.text();
let body;
try { body = JSON.parse(text); } catch { body = text; }

if (!res.ok) {
  console.error(`\n🚨 MIGRATION FAILED (HTTP ${res.status})`);
  console.error(typeof body === "string" ? body.slice(0, 2000) : JSON.stringify(body, null, 2).slice(0, 2000));
  process.exit(1);
}

console.log(`\n✅ Migration applied successfully`);
if (Array.isArray(body) && body.length > 0) {
  console.log("Result:", JSON.stringify(body, null, 2).slice(0, 1500));
}
