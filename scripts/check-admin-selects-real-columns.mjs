#!/usr/bin/env node
/**
 * check-admin-selects-real-columns.mjs — every column the admin SELECTs must exist.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-08: the Phase 0 card told Chris *"the price could not be read from a signed contract"* for
 * a client whose contract was signed, present, and correct. The cause:
 *
 *     .select("monthly_price,plan_code,status,created_at")   // client_contracts has `tier`
 *     → PostgREST 400 (42703: column does not exist)
 *     → the caller's try/catch sets contract = null
 *     → the draft warns, and the price logic that reads contract.tier never runs
 *
 * 🔑 THE FIX SHIPPED TWO DAYS EARLIER COULD NEVER HAVE WORKED. `phase0Links` was rewritten on 09-06
 * to branch on `contract.tier`, but the contract never arrived — so a fix reported as done was never
 * once exercised. **A fix that is never exercised is not a fix.**
 *
 * 🔴 And the failure was SILENT by construction: `try { … } catch (_e) { contract = null; }` turns a
 * schema error into a plausible-looking "no contract" state. A swallowed error is an outage nobody
 * has noticed yet ([[project-delivery-hardening-2026-09-05]]).
 *
 * CHECK
 *   Extract every `.from("table") … .select("a,b,c")` in admin.js and verify each column against the
 *   LIVE schema. Runtime truth, not a guess about what the table looks like.
 *
 * Exit 0 = every selected column exists. 1 = one does not. 2 = could not reach the database.
 */
import fs from "node:fs";

const ADMIN = "/Users/chris/RGA/Rocket Growth Agency Website VS Code/admin/admin.js";
const ENV = "/Users/chris/RGA/Rocket Growth Agency Scraper VS Code/.env";

for (const line of fs.readFileSync(ENV, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.log("  ▫️  Supabase credentials unavailable — INDETERMINATE"); process.exit(2); }
if (!fs.existsSync(ADMIN)) { console.error("  ✗ admin.js not found"); process.exit(2); }

const src = fs.readFileSync(ADMIN, "utf8");

// `.from("x")` followed (within a short window) by `.select("a,b")`. Chained builders put them
// adjacent; anything further apart is a different statement and would be a guess.
const pairs = [];
const fromRe = /\.from\(\s*["'`]([a-z0-9_]+)["'`]\s*\)/g;
let m;
while ((m = fromRe.exec(src)) !== null) {
  // 🔴 Window to the NEXT `.from(`, not a fixed character count. The first version used 400 chars —
  // and then the explanatory comment added above this very select pushed `.select(` past it, so the
  // gate silently stopped checking the exact line it was written for and passed a sabotage.
  // A distance heuristic breaks the moment someone writes a comment.
  fromRe.lastIndex = m.index + 1;
  const next = fromRe.exec(src);
  fromRe.lastIndex = m.index + 1;                      // rewind; the outer loop advances it
  const end = next ? next.index : Math.min(src.length, m.index + 4000);
  const after = src.slice(m.index, end);
  const sel = after.match(/\.select\(\s*["'`]([^"'`]+)["'`]/);
  if (!sel) continue;
  const cols = sel[1].split(",").map((c) => c.trim()).filter(Boolean);
  // Skip aggregate/relational selects — `*`, `count`, and embedded resources need schema traversal.
  if (cols.some((c) => c === "*" || c.includes("(") || c.includes(":"))) continue;
  pairs.push({ table: m[1], cols, line: src.slice(0, m.index).split("\n").length });
}

if (!pairs.length) { console.log("  ▫️  no simple .from().select() pairs found — selector may have drifted"); process.exit(2); }

console.log("── every column the admin selects must exist ──");

const schema = new Map();
async function columnsOf(table) {
  if (schema.has(table)) return schema.get(table);
  const r = await fetch(`${URL_}/rest/v1/${table}?select=*&limit=1`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!r.ok) { schema.set(table, null); return null; }
  const rows = await r.json();
  // An empty table tells us nothing about its columns — that is INDETERMINATE, not a pass.
  const cols = Array.isArray(rows) && rows.length ? new Set(Object.keys(rows[0])) : null;
  schema.set(table, cols);
  return cols;
}

let bad = 0, unknown = 0, checked = 0;
const seen = new Set();
for (const p of pairs) {
  const key = `${p.table}:${p.cols.join(",")}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const cols = await columnsOf(p.table);
  if (!cols) { unknown++; console.log(`  ▫️  ${p.table} — no readable row, cannot verify (admin.js:${p.line})`); continue; }
  const missing = p.cols.filter((c) => !cols.has(c));
  checked++;
  if (missing.length) {
    bad++;
    console.log(`  🔴 admin.js:${p.line}  ${p.table}.select() names ${missing.length} column(s) that do not exist: ${missing.join(", ")}`);
    console.log(`       PostgREST returns 400; if the caller catches, the failure is invisible.`);
  } else {
    console.log(`  ✅ ${p.table.padEnd(28)} ${p.cols.length} column(s)`);
  }
}

console.log("");
if (bad) {
  console.error(`🔴 ${bad} select(s) name a column that does not exist.`);
  console.error("   These fail at runtime as a 400 and are usually swallowed by a try/catch,");
  console.error("   so the feature just quietly reports 'no data'. See project_admin_selected_a_missing_column.");
  process.exit(1);
}
if (!checked) { console.error("⚠️  nothing could be verified"); process.exit(2); }
console.log(`✅ ${checked} select(s) verified against the live schema${unknown ? ` · ${unknown} unverifiable (empty table)` : ""}`);
