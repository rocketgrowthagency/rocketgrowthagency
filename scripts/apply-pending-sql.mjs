#!/usr/bin/env node
// apply-pending-sql.mjs — the owner runs this himself, once, to apply the waiting database files in the right order. Claude can't: the permission system refuses a schema change from a chat.
//   node --env-file=.env scripts/apply-pending-sql.mjs
// It only adds (every file is create-if-not-exists), stops at the first error, waits if the database is slow, and reads the result back. Safe to run twice. Prints no secret.
import fs from "node:fs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FILES = ["job_checkins.sql", "data_keep.sql", "data_keep_more.sql", "blog_system.sql", "site_archive.sql", "report_why_now.sql", "blog_client_choice.sql", "client_booking_requests.sql", "client_portal_mode.sql"];
const TABLES = ["job_checkins", "gsc_pull_state", "client_gsc_daily", "vertical_benchmark_history", "blog_index_check", "blog_posts", "blog_evidence", "site_archive_runs", "client_booking_requests", "ga4_pull_state", "client_ga4_daily", "client_url_inspection", "client_baseline"];
const COLUMNS = ["why_now_slow", "why_now_note", "blog_posts_off_at", "blog_posts_off_by", "portal_mode"];
const { SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: KEY, SUPABASE_ACCESS_TOKEN: TOKEN } = process.env;
if (!URL_ || !KEY || !TOKEN) { console.error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ACCESS_TOKEN. Run it from the scraper folder with: node --env-file=.env scripts/apply-pending-sql.mjs"); process.exit(2); }
const REF = new URL(URL_).hostname.split(".")[0];

const query = async (sql) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: sql }), signal: AbortSignal.timeout(60000) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : [];
};
const healthy = async () => {
  const t0 = Date.now();
  try { const r = await fetch(`${URL_}/rest/v1/clients?select=id&limit=1`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, signal: AbortSignal.timeout(8000) }); return r.ok && Date.now() - t0 < 4000; }
  catch { return false; }
};

for (const f of FILES) {
  if (!(await healthy())) { console.error(`The database is slow right now, so I stopped before ${f}. Nothing is broken. Run this again in a few minutes.`); process.exit(3); }
  try { await query(fs.readFileSync(`${SITE}/supabase/${f}`, "utf8")); console.log(`  ✅ ${f}`); }
  catch (e) { console.error(`  🔴 ${f} failed, and I stopped here: ${String(e.message).replaceAll(TOKEN, "[hidden]")}`); process.exit(1); }
  await new Promise((r) => setTimeout(r, 1500));
}
await query("notify pgrst, 'reload schema';");

const list = (a) => a.map((x) => `'${x}'`).join(",");
const haveT = (await query(`select table_name n from information_schema.tables where table_schema='public' and table_name in (${list(TABLES)})`)).map((x) => x.n);
const haveC = (await query(`select column_name n from information_schema.columns where table_schema='public' and table_name='clients' and column_name in (${list(COLUMNS)})`)).map((x) => x.n);
const missing = [...TABLES.filter((t) => !haveT.includes(t)), ...COLUMNS.filter((c) => !haveC.includes(c))];
if (missing.length) { console.error(`  🔴 Applied, but these aren't there when read back: ${missing.join(", ")}`); process.exit(1); }
console.log(`\n✅ All ${FILES.length} files applied and read back: ${haveT.length} tables, ${haveC.length} client columns. Tell Claude "SQL done".`);
