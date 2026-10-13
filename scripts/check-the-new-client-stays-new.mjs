#!/usr/bin/env node
/**
 * check-the-new-client-stays-new.mjs — the acceptance walk's brand-new test client is still at day 0, and nothing
 * that spends money or moves steps is pointed at it.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-10-13 (approved client_step_waits_on_own_step_v1): the walk's only test client was far along, so a step that
 * waits on the client's OWN earlier step ("Do step 6 first") and the kickoff booking row were never checked. A second
 * test client, frozen at day 0, now gets walked every morning (`acceptance-walk.mjs --as=new`).
 *
 * 🔴 A day-0 fixture is only worth something while it IS day 0. Three things would quietly age it, and the walk
 *    would keep passing on a client that no longer shows what it is there to show:
 *    1. `flow-cron-daily` AUTO-RUNS Month-1 steps for every status=active client (found while building this).
 *    2. Someone works it in the admin, connects Google on it, or books its kickoff.
 *    3. A field drifts (a keyword set → monthly Places spend via rankings-refresh).
 *    And two would spend money on it every week: `brain-weekly-dispatch` (billing_status=active → a Claude run) and
 *    the flow crons, which is why those skip `source` = test:*. billing_status must stay "active" (NOT NULL; any
 *    other value puts an overdue/paused banner on the portal).
 *
 * Reads: scripts/acceptance/clients.mjs (SCRAPER_COPY_DIR for mutations), the three cron functions
 * (APPROVAL_ARCHIVE_SITE_DIR), and production (read-only).
 * Exit 0 = still day 0 and shielded · 1 = it moved or a job can reach it · 2 = can't tell.
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

console.log("── the walk's brand-new test client is still day 0, and nothing costly is pointed at it ──");
const fails = [];
const cantTell = (msg) => { console.log(`  ⚠️  ${msg}`); process.exit(2); };

let C;
try { C = await import(pathToFileURL(path.join(SCRAPER, "scripts/acceptance/clients.mjs")).href); }
catch (e) { cantTell(`could not load scripts/acceptance/clients.mjs: ${e.message}`); }
const { WALK_CLIENTS, NEW_CLIENT_ROW, NEW_CLIENT_SOURCE } = C;

// ── 1. the declared fixture keeps every job that spends or moves steps off it ──────────────────────────
if (!/^test:/.test(String(NEW_CLIENT_SOURCE)) || NEW_CLIENT_ROW.source !== NEW_CLIENT_SOURCE)
  fails.push(`the fixture's source "${NEW_CLIENT_ROW.source}" is not a test:* marker, so the crons' skip cannot see it`);
if (NEW_CLIENT_ROW.status === "active") fails.push(`the fixture is declared status "active" — flow-cron-daily would run its steps`);
if (NEW_CLIENT_ROW.primary_service != null) fails.push(`the fixture declares a keyword — rankings-refresh would spend Places calls on it monthly`);
if (NEW_CLIENT_ROW.website_url || NEW_CLIENT_ROW.gbp_url || NEW_CLIENT_ROW.google_place_id)
  fails.push("the fixture declares a website or Google listing — the nightly probes would reach a real business");
// stage 4 = the portal shows the Month-1 rows (stage 3 shows none, so the walk would compare nothing)
if (NEW_CLIENT_ROW.client_portal_stage !== "stage_4_onboarding") fails.push(`the fixture is declared at ${NEW_CLIENT_ROW.client_portal_stage}, not day 0 of Month 1 (stage_4_onboarding)`);
for (const k of ["main", "new"]) if (WALK_CLIENTS[k] && WALK_CLIENTS[k].portalRowsRequired !== true) fails.push(`WALK_CLIENTS.${k}.portalRowsRequired is off — a walk that finds no portal rows would pass`);
if (!WALK_CLIENTS.new?.id) fails.push("WALK_CLIENTS.new has no id — the morning walk cannot sign in as it");
if (WALK_CLIENTS.new?.email === WALK_CLIENTS.main?.email) fails.push("the two test clients sign in as the same email — the portal would show one of them twice");

// ── 2. every client-wide query in the costly crons skips test:* ────────────────────────────────────────
const SKIP = "source.not.like.test:*";
for (const rel of ["netlify/functions/brain-weekly-dispatch.js", "netlify/functions/flow-cron-daily.js", "netlify/functions/flow-cron-weekly-digest.js"]) {
  let src;
  try { src = fs.readFileSync(path.join(SITE, rel), "utf8"); } catch { cantTell(`cannot read ${rel}`); }
  // a client-WIDE read = a /clients? query not narrowed to one id
  const wide = [...src.matchAll(/\/clients\?([^`"'\s]*)/g)].map((m) => m[1]).filter((q) => !/(^|&)id=eq\./.test(q));
  if (!wide.length) { fails.push(`${rel}: no client-wide query found — the gate no longer understands it (re-read it)`); continue; }
  for (const q of wide) if (!q.includes(`or=(source.is.null,${SKIP})`)) fails.push(`${rel}: /clients?${q.slice(0, 90)} does not skip test clients`);
}

// ── 3. production: the fixture is still exactly day 0 ──────────────────────────────────────────────────
const S = process.env.SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!S || !K) cantTell("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
async function get(p) {
  let r;
  try { r = await fetch(`${S}/rest/v1/${p}`, { headers: { apikey: K, Authorization: `Bearer ${K}` }, signal: AbortSignal.timeout(20000) }); }
  catch (e) { cantTell(`production unreachable: ${e.message}`); }
  if (!r.ok) cantTell(`GET ${p.split("?")[0]} → ${r.status}`);
  return r.json();
}
const id = WALK_CLIENTS.new?.id;
const marked = await get(`clients?source=eq.${encodeURIComponent(NEW_CLIENT_SOURCE)}&select=id`);
if (marked.length !== 1) fails.push(`${marked.length} clients carry the marker ${NEW_CLIENT_SOURCE} (expected 1)`);
else if (marked[0].id !== id) fails.push(`the marked client is ${marked[0].id}, but the walk signs in as ${id}`);

const [row] = id ? await get(`clients?id=eq.${id}&select=*`) : [];
if (!row) fails.push(`the new test client ${id} is gone`);
else {
  for (const [k, want] of Object.entries(NEW_CLIENT_ROW)) {
    if ((row[k] ?? null) !== (want ?? null)) fails.push(`clients.${k} is ${JSON.stringify(row[k])}, day 0 says ${JSON.stringify(want)}`);
  }
  if (row.archived_at) fails.push("the new test client is archived");
  if (row.kickoff_date) fails.push(`a kickoff date is set (${row.kickoff_date})`);

  const [ob] = await get(`client_onboarding_records?client_id=eq.${id}&select=data`);
  const tasks = ob?.data?.tasks || {};
  const moved = Object.entries(tasks).filter(([, t]) => t && t.status && !["todo", "not_started", "pending"].includes(t.status));
  if (moved.length) fails.push(`${moved.length} step(s) moved: ${moved.slice(0, 6).map(([s, t]) => `${s}=${t.status}`).join(", ")}`);
  if (ob?.data?.kickoff_invite) fails.push("a kickoff is booked on it");

  const oauth = await get(`client_google_oauth?client_id=eq.${id}&select=client_id`);
  if (oauth.length) fails.push("Google is connected on it (day 0 = not connected)");

  const pa = await get(`client_portal_access?client_id=eq.${id}&select=portal_email,invite_status,auth_user_id`);
  if (pa.length !== 1 || pa[0].portal_email !== WALK_CLIENTS.new.email || pa[0].invite_status !== "active" || !pa[0].auth_user_id)
    fails.push(`portal sign-in is not the one active row for ${WALK_CLIENTS.new.email} (${pa.length} row(s))`);
}

if (fails.length) {
  console.log(`  🔴 ${fails.length} problem(s):`);
  for (const f of fails) console.log(`     - ${f}`);
  console.log("     Re-create with node scripts/create-new-test-client.mjs (it never edits; delete the drifted row first) or fix the job.");
  process.exit(1);
}
console.log(`  ✅ ${row.business_name} is day 0 (Month 1 open, nothing done, Google not connected); the 3 crons skip test clients`);
process.exit(0);
