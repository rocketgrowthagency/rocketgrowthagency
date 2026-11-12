#!/usr/bin/env node
// check-no-dormant-tables.mjs — EVERY DATABASE TABLE IS READ OR WRITTEN BY SOMETHING (checkers build 11-11; master map approved by Chris).
//
// GUARDS: a table nothing reads or writes is either a feature that silently stopped (its writer was deleted and the data froze) or a
// promise nobody built. Either way nobody would notice: dormant functions (check-orphan-functions) and dormant CSS were gated, tables
// were not (inventory class "Dormant code: tables": NONE).
// HOLDS: every table created by website supabase/*.sql or docs/supabase/*.sql, plus every BASE TABLE in the live public schema
// (Management API read-only, when SUPABASE_ACCESS_TOKEN is here), is named in code: website netlify/ admin/ portal/ shared/ scripts/ and
// root pages, or a Scraper script (gates excluded: a table only a check reads is still dormant), comment lines stripped; or it is in KEEP
// below with a reason. A KEEP entry for a table that is now used, or no longer exists, fails too (an excuse list that drifts stops
// being read). A table in an SQL file that is not live is reported (the SQL was never run), not failed.
// Exit 0 = no dormant table · 1 = a dormant table (or a stale keep) · 2 = INDETERMINATE (no SQL parsed).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REAL = path.dirname(HERE);
const SCR = process.env.SCRAPER_COPY_DIR || REAL;
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const idk = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };

// 🔑 KEPT ON PURPOSE. Each needs a reason in words; never "it was failing".
const KEEP = {
  blog_worked: "blog_system_v1 (approved 10-31): the ledger the blog system grades its claims into (anecdote, supported, no clear effect); the grading is not built yet, so nothing writes it",
  serpapi_usage: "the website half of the SerpAPI meter (project_serpapi_budget, 11-10): docs/supabase/RGA_SERPAPI_USAGE_2026-11-10.sql says NOT BUILT YET, waiting on Chris to run it and approve the helper",
  client_activity_log: "its only writer (seven admin saves) was REMOVED 11-11 in the master map Tier 1 cleanup: it was read by nothing (9 rows since 08-12). The table stays because it holds those rows and client data is never dropped without Chris; dropping it is his call",
  client_reviews_history: "old review-count snapshots from RGA_PERFORMANCE_TRACKING_PATCH; nothing writes it since review metrics moved, but it holds history, and client data is never deleted without Chris (feedback_never_lose_client_work). Retiring it is Chris's call",
};

const read = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return ""; } };
const sqlFiles = ["supabase", "docs/supabase"].flatMap((d) => { try { return fs.readdirSync(path.join(SITE, d)).filter((f) => f.endsWith(".sql")).map((f) => path.join(SITE, d, f)); } catch { return []; } });
const declared = new Map();
for (const f of sqlFiles) for (const m of read(f).replace(/--[^\n]*/g, "").matchAll(/create table (?:if not exists )?(?:public\.)?"?([a-z_0-9]+)"?\s*\(/gi)) declared.set(m[1].toLowerCase(), path.relative(SITE, f));
if (declared.size < 20) idk(`only ${declared.size} tables parsed from the SQL files`);

// the live tables (read-only), outside the mutation harness
let live = null;
if (!process.env.SCRAPER_COPY_DIR) {
  const env = read(path.join(REAL, ".env"));
  const T = process.env.SUPABASE_ACCESS_TOKEN || ((/^SUPABASE_ACCESS_TOKEN=(.*)$/m.exec(env) || [])[1] || "").trim().replace(/^["']|["']$/g, "");
  if (T) {
    try {
      const r = await fetch("https://api.supabase.com/v1/projects/jetgayimvfeslqnkbfdq/database/query/read-only", { method: "POST", headers: { Authorization: `Bearer ${T}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'" }), signal: AbortSignal.timeout(20000) });
      if (r.ok) live = new Set((await r.json()).map((x) => x.table_name));
    } catch { live = null; }
  }
}

// the code that can read or write a table
const files = [];
const walk = (d, skip) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { if (/^(node_modules|\.git|\.claude|\.netlify|v|reports|docs|supabase|output|coverage)$/.test(e.name)) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p, skip); else if (/\.(js|mjs|cjs|html|gs)$/.test(e.name) && !(skip && skip(e.name))) files.push(p); } };
walk(SITE);
walk(path.join(SCR, "scripts"), (n) => /^check-.*\.mjs$/.test(n));
if (SCR !== REAL) walk(path.join(REAL, "scripts"), (n) => /^check-.*\.mjs$/.test(n) || fs.existsSync(path.join(SCR, "scripts", n)));
const code = files.map((f) => read(f).replace(/^\s*(\/\/|\*|\/\*).*$/gm, "")).join("\n");
if (code.length < 1e6) idk("too little code read to judge");
const named = (t) => new RegExp(`(?<![A-Za-z0-9_])${t}(?![A-Za-z0-9_])`).test(code);

const all = new Set([...declared.keys(), ...(live || [])]);
const dormant = [], stale = [], notRun = [];
for (const t of all) {
  const used = named(t);
  if (t in KEEP) { if (used) stale.push(`${t} is kept as dormant, and code uses it now: take it off KEEP`); continue; }
  if (!used) dormant.push(`${t} (${declared.get(t) || "live only, in no SQL file"})`);
}
for (const t of Object.keys(KEEP)) {
  if (!all.has(t)) stale.push(`${t} is kept as dormant, and no SQL file or live table has it any more: take it off KEEP`);
  if (String(KEEP[t]).length < 40) stale.push(`${t} is kept without a real reason`);
}
if (live) for (const t of declared.keys()) if (!live.has(t)) notRun.push(t);
if (notRun.length) console.log(`ℹ️  ${notRun.length} table(s) in an SQL file are not in the live database (the SQL was not run): ${notRun.join(", ")}`);
if (dormant.length || stale.length) {
  console.error(`🔴 ${dormant.length} table(s) nothing reads or writes${stale.length ? `, ${stale.length} stale keep(s)` : ""}:`);
  for (const x of [...dormant, ...stale]) console.error(`   · ${x}`);
  console.error("   Wire the reader/writer back, or retire the table (Chris decides; never drop client data), or add it to KEEP with the reason.");
  process.exit(1);
}
console.log(`✅ no dormant tables: ${all.size} tables (${declared.size} in SQL files${live ? `, ${live.size} live` : ", live list not read"}), each named by code in ${files.length} files, ${Object.keys(KEEP).length} kept on purpose with a reason`);
