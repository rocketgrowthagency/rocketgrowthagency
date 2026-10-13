#!/usr/bin/env node
/**
 * check-the-month-2-client-stays-at-month-start.mjs — the acceptance walk's Month-2 test client is still at the start
 * of a month (Month 1 finished, nothing sent this month), and nothing that spends money or sends email reaches it.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-10-13 (Chris: "yes we dont stop until all steps and checks are done"): the daily walk only covered Month 1, so
 * the Month-2 steps were never clicked. Its first run found that a stage-5 client has NO portal home for the five
 * Month-2 client steps. A start-of-month fixture is only worth something while it IS the start of a month:
 *   1. Anything that writes this month's monthly record, a photo or a customer list moves it past "nothing sent".
 *   2. Stage 5 is where send-monthly-report (an EMAIL, the 1st of each month) and the weekly Claude run look, so every
 *      client-wide query in those crons, and the flow crons, must skip `source` = test:*.
 *   3. A keyword / website / Google listing on it would bring rankings-refresh and the grid (Places spend).
 * Reads: scripts/acceptance/clients.mjs (SCRAPER_COPY_DIR for mutations), the four cron functions
 * (APPROVAL_ARCHIVE_SITE_DIR), and production (read-only).
 * Exit 0 = still at the start of a month and shielded · 1 = it moved or a job can reach it · 2 = can't tell.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER = process.env.SCRAPER_COPY_DIR || path.dirname(HERE);
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
try {
  for (const line of fs.readFileSync(path.join(path.dirname(HERE), ".env"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* reported below */ }

console.log("── the walk's Month-2 test client is still at the start of a month, and nothing costly reaches it ──");
const fails = [];
const cantTell = (msg) => { console.log(`  ⚠️  ${msg}`); process.exit(2); };

let C;
try { C = await import(pathToFileURL(path.join(SCRAPER, "scripts/acceptance/clients.mjs")).href); }
catch (e) { cantTell(`could not load scripts/acceptance/clients.mjs: ${e.message}`); }
const { WALK_CLIENTS, MONTH2_CLIENT_ROW: ROW, MONTH2_CLIENT_SOURCE: SRC } = C;
const W = WALK_CLIENTS.month2;

// ── 1. the declaration ─────────────────────────────────────────────────────────────────────────────────
if (!W) cantTell("WALK_CLIENTS.month2 is gone");
if (!/^test:/.test(String(SRC)) || ROW.source !== SRC) fails.push(`the fixture's source "${ROW.source}" is not a test:* marker, so the crons' skip cannot see it`);
if (ROW.client_portal_stage !== "stage_5_monthly") fails.push(`the fixture is declared at ${ROW.client_portal_stage}, not the Monthly cycle (stage_5_monthly)`);
if (ROW.primary_service != null) fails.push("the fixture declares a keyword — rankings-refresh would spend Places calls on it monthly");
if (ROW.website_url || ROW.gbp_url || ROW.google_place_id) fails.push("the fixture declares a website / Google listing — the grid and the profile checks would reach it");
if (W.month !== 2) fails.push("WALK_CLIENTS.month2 is not walked on Month 2 (month: 2)");
if (!W.id) fails.push("WALK_CLIENTS.month2 has no id — the morning walk cannot sign in as it");
const emails = Object.values(WALK_CLIENTS).map((c) => c.email);
if (new Set(emails).size !== emails.length) fails.push("two walk clients sign in as the same email");

// ── 2. every client-wide query in the costly crons skips test:* ────────────────────────────────────────
const SKIP = "source.not.like.test:*";
for (const rel of ["netlify/functions/brain-weekly-dispatch.js", "netlify/functions/flow-cron-daily.js",
  "netlify/functions/flow-cron-weekly-digest.js", "netlify/functions/send-monthly-report.js"]) {
  let src;
  try { src = fs.readFileSync(path.join(SITE, rel), "utf8"); } catch { cantTell(`cannot read ${rel}`); }
  const wide = [...src.matchAll(/\/clients\?([^`"'\s]*)/g)].map((m) => m[1]).filter((q) => !/(^|&)id=eq\./.test(q));
  if (!wide.length) { fails.push(`${rel}: no client-wide query found — the gate no longer understands it (re-read it)`); continue; }
  for (const q of wide) if (!q.includes(`or=(source.is.null,${SKIP})`)) fails.push(`${rel}: /clients?${q.slice(0, 90)} does not skip test clients`);
}

// ── 3. production: still the start of a month ─────────────────────────────────────────────────────────
const S = process.env.SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!S || !K) cantTell("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
async function get(p) {
  let r;
  try { r = await fetch(`${S}/rest/v1/${p}`, { headers: { apikey: K, Authorization: `Bearer ${K}` }, signal: AbortSignal.timeout(20000) }); }
  catch (e) { cantTell(`production unreachable: ${e.message}`); }
  if (!r.ok) cantTell(`GET ${p.split("?")[0]} → ${r.status}`);
  return r.json();
}
const id = W.id;
const marked = await get(`clients?source=eq.${encodeURIComponent(SRC)}&select=id`);
if (marked.length !== 1) fails.push(`${marked.length} clients carry the marker ${SRC} (expected 1)`);
else if (marked[0].id !== id) fails.push(`the marked client is ${marked[0].id}, but the walk signs in as ${id}`);

const [row] = id ? await get(`clients?id=eq.${id}&select=*`) : [];
if (!row) fails.push(`the Month-2 test client ${id} is gone`);
else {
  for (const [k, want] of Object.entries(ROW)) {
    if ((row[k] ?? null) !== (want ?? null)) fails.push(`clients.${k} is ${JSON.stringify(row[k])}, the fixture says ${JSON.stringify(want)}`);
  }
  if (row.archived_at) fails.push("the Month-2 test client is archived");

  // Month 1 finished: every Month-1 step done, one listing confirmed
  let pb;
  try { pb = JSON.parse(fs.readFileSync(path.join(SITE, "data/playbooks/playbooks.json"), "utf8")); } catch { cantTell("cannot read playbooks.json"); }
  const [ob] = await get(`client_onboarding_records?client_id=eq.${id}&select=data`);
  const tasks = ob?.data?.tasks || {};
  const open = (pb.month1 || []).filter((s) => tasks[s.id]?.status !== "done").map((s) => s.id);
  if (!ob) fails.push("it has no onboarding record (Month 1 must read finished)");
  else if (open.length) fails.push(`${open.length} Month-1 step(s) not done: ${open.slice(0, 5).join(", ")} — re-sync with create-new-test-client.mjs --as=month2 --sync`);
  if (tasks["m1.audit.gbp_duplicate"]?.outcome_data?.verdict !== "clean") fails.push("the one-listing check isn't clean on it (the monthly photos would wait on it)");

  // nothing sent this month
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const mr = await get(`client_monthly_records?client_id=eq.${id}&select=reporting_month`);
  if (mr.length) fails.push(`${mr.length} monthly record(s) exist (${mr.map((r) => r.reporting_month).join(", ")}) — something worked its Month 2 (the fixture never has one)`);
  const photos = await get(`client_photos?client_id=eq.${id}&created_at=gte.${month}T00:00:00Z&select=id`);
  if (photos.length) fails.push(`${photos.length} photo(s) were uploaded on it this month`);
  const lists = await get(`client_customer_lists?client_id=eq.${id}&select=id`);
  if (lists.length) fails.push(`${lists.length} customer list(s) were sent on it`);

  const oauth = await get(`client_google_oauth?client_id=eq.${id}&select=client_id`);
  if (oauth.length) fails.push("Google is connected on it (the fixture has no Google, so no live pull can reach it)");

  const pa = await get(`client_portal_access?client_id=eq.${id}&select=portal_email,invite_status,auth_user_id`);
  if (pa.length !== 1 || pa[0].portal_email !== W.email || pa[0].invite_status !== "active" || !pa[0].auth_user_id)
    fails.push(`portal sign-in is not the one active row for ${W.email} (${pa.length} row(s))`);
}

if (fails.length) {
  console.log(`  🔴 ${fails.length} problem(s):`);
  for (const f of fails) console.log(`     - ${f}`);
  console.log("     Fix the job, or reset with node scripts/create-new-test-client.mjs --as=month2 --sync (and delete what moved it).");
  process.exit(1);
}
console.log(`  ✅ ${row.business_name} is at the start of a month (Month 1 done, nothing sent, no monthly record); the 4 crons skip test clients`);
process.exit(0);
