#!/usr/bin/env node
/**
 * check-client-dedupe-gate.mjs — proves the duplicate-client gate is still whole.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * Built 2026-09-05 with the gate itself. The gate has four parts and ALL of them must hold; any one
 * silently regressing puts us back to creating a second record for a business we already have.
 *
 * The specific regression this exists to catch: someone adds `where archived_at is null` to the
 * unique indexes. That reads like a sensible tidy-up ("don't constrain archived rows") and it
 * destroys the entire point — the archived duplicate is the exact case Chris asked about, and the
 * one where the cost is highest, because it orphans the baseline that makes results attributable.
 *
 * Checks:
 *   1. The three HARD unique indexes exist.
 *   2. 🔴 None of them excludes archived rows.
 *   3. rga_find_duplicate_clients exists and returns a hard match for a live archived client.
 *   4. Both admin.js creation paths call guardAgainstDuplicateClient.
 *
 * Exit 0 = whole. Exit 1 = a part is missing, and it names which.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER_ENV = path.resolve(HERE, "..", ".env");
// This gate lives in the scraper repo (where daily-health-check.sh runs) but inspects admin.js in the
// website repo. Absolute, and asserted below — a silently-missing file would make check 4 vacuous.
const WEB_REPO = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";

for (const line of fs.readFileSync(SCRAPER_ENV, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const { SUPABASE_URL: U, SUPABASE_ACCESS_TOKEN: T } = process.env;
if (!U || !T) {
  console.error("✗ SUPABASE_URL / SUPABASE_ACCESS_TOKEN not available — cannot verify the gate");
  process.exit(1);
}
const ref = U.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];

async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${T}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status}: ${t.slice(0, 200)}`);
  return JSON.parse(t);
}

const fails = [];
const ok = (m) => console.log(`  ✅ ${m}`);
const bad = (m) => { console.log(`  🔴 ${m}`); fails.push(m); };

console.log("── client duplicate gate ──");

// 1 + 2. The indexes, and the predicate that must NOT be there.
const HARD = ["clients_identity_place_uniq", "clients_identity_domain_uniq", "clients_identity_phone_uniq"];
const idx = await q(
  `select indexname, indexdef from pg_indexes where schemaname='public' and tablename='clients'
   and indexname in (${HARD.map((n) => `'${n}'`).join(",")})`
);
for (const name of HARD) {
  const row = idx.find((r) => r.indexname === name);
  if (!row) { bad(`unique index ${name} is MISSING — that key no longer blocks duplicates`); continue; }
  if (!/unique/i.test(row.indexdef)) { bad(`${name} exists but is NOT UNIQUE — it enforces nothing`); continue; }
  if (/archived_at/i.test(row.indexdef)) {
    bad(`${name} excludes archived rows — an archived client can be re-created, which is the exact hole this gate closes`);
    continue;
  }
  ok(`${name} — unique, and covers archived rows`);
}

// 3. The function, tested against real data rather than merely checked for existence.
try {
  const arch = await q(
    `select id, workspace_id, business_name, website_url from clients where archived_at is not null limit 1`
  );
  const fnExists = await q(`select 1 as ok from pg_proc where proname='rga_find_duplicate_clients'`);
  if (!fnExists.length) {
    bad("rga_find_duplicate_clients does not exist — the admin gate will fail closed on every create");
  } else if (!arch.length) {
    ok("rga_find_duplicate_clients exists (no archived client on hand to test against)");
  } else {
    const c = arch[0];
    const rows = await q(
      `select * from rga_find_duplicate_clients('${c.workspace_id}', ${c.business_name ? `'${c.business_name.replace(/'/g, "''")}'` : "null"},
       ${c.website_url ? `'${c.website_url.replace(/'/g, "''")}'` : "null"}, null, null, null, null, null)`
    );
    const hard = rows.find((r) => r.confidence === "hard" && r.archived);
    if (hard) ok(`archived client "${c.business_name}" is detected as a HARD duplicate (${hard.match_key})`);
    else bad(`archived client "${c.business_name}" was NOT detected as a duplicate — matching is broken`);
  }
} catch (e) {
  bad(`duplicate function check failed: ${e.message}`);
}

// 4. Both admin creation paths route through the gate. A DB constraint with no UI call produces a
//    raw "duplicate key value violates unique constraint" — correct, but useless to the person typing.
const adminPath = path.join(WEB_REPO, "admin", "admin.js");
if (!fs.existsSync(adminPath)) {
  bad(`admin.js not found at ${adminPath} — cannot verify the UI half of the gate`);
}
const adminJs = fs.existsSync(adminPath) ? fs.readFileSync(adminPath, "utf8") : "";
const calls = (adminJs.match(/if \(!\(await guardAgainstDuplicateClient\(/g) || []).length;
if (calls >= 2) ok(`both admin creation paths call guardAgainstDuplicateClient (${calls} call sites)`);
else bad(`only ${calls} admin path(s) call guardAgainstDuplicateClient — expected 2 (create form + promote lead)`);

if (!/async findDuplicateClients/.test(adminJs)) bad("no adapter implements findDuplicateClients");
else ok("adapters implement findDuplicateClients");

console.log("");
if (fails.length) {
  console.error(`🔴 duplicate gate INCOMPLETE — ${fails.length} problem(s) above`);
  process.exit(1);
}
console.log("✅ duplicate gate whole: archived clients cannot be silently re-created");
