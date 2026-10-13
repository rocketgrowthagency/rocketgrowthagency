#!/usr/bin/env node
/**
 * create-new-test-client.mjs — creates (once) one of the acceptance walk's fixture clients:
 *   --as=new     (default) the BRAND-NEW client, frozen at day 0 of Month 1
 *   --as=month2  the MONTH-2 client: Month 1 finished, the Monthly cycle open, nothing sent this month
 *               (also writes its onboarding record: every Month-1 step done, one Google listing confirmed)
 * See scripts/acceptance/clients.mjs for what it is and why each field is what it is.
 *
 * Idempotent: finds the client by its `source` marker, creates it only when absent, and creates the portal
 * sign-in (a Supabase auth user + an ACTIVE client_portal_access row) only when absent. It edits an existing
 * client only with --sync, and then only the declared day-0 fields (NEW_CLIENT_ROW), only on the marked row.
 * Writes production — run it by hand.
 *
 * Usage: node scripts/create-new-test-client.mjs [--as=new|month2] [--dry-run] [--sync]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WALK_CLIENTS, fixtureFor } from "./acceptance/clients.mjs";

const SCRAPER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(SCRAPER, ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const SUPA = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA || !KEY) { console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing"); process.exit(2); }
const DRY = process.argv.includes("--dry-run");
const SYNC = process.argv.includes("--sync");
const AS = (process.argv.find((a) => a.startsWith("--as=")) || "--as=new").slice(5);
const FIX = fixtureFor(AS);
if (!FIX || !WALK_CLIENTS[AS]) { console.error(`--as=${AS}: not a fixture client (new | month2)`); process.exit(2); }
const NEW_CLIENT_ROW = FIX.row, NEW_CLIENT_SOURCE = FIX.source;
const WEBSITE = process.env.RGA_WEBSITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function rest(p, opt = {}) {
  const r = await fetch(`${SUPA}/rest/v1/${p}`, { ...opt, headers: { ...H, Prefer: "return=representation", ...(opt.headers || {}) }, signal: AbortSignal.timeout(20000) });
  const text = await r.text();
  if (!r.ok) {
    let msg = text.slice(0, 300);
    try { const j = JSON.parse(text); msg = `${j.code}: ${j.message}`; } catch { /* keep the raw text */ }
    throw new Error(`${opt.method || "GET"} ${p.split("?")[0]} → ${r.status} ${msg}`);
  }
  return text ? JSON.parse(text) : null;
}

// The workspace is the one the existing test client lives in (single-workspace system).
const [main] = await rest(`clients?id=eq.${WALK_CLIENTS.main.id}&select=workspace_id`);
if (!main) { console.error("the main test client is missing — cannot tell which workspace to use"); process.exit(2); }

// 1. the client
let found = await rest(`clients?source=eq.${encodeURIComponent(NEW_CLIENT_SOURCE)}&select=id,business_name,status,billing_status,client_portal_stage`);
if (found.length > 1) { console.error(`${found.length} clients carry the marker — fix by hand, refusing to guess`); process.exit(2); }
let client = found[0];
if (client && SYNC) {
  if (DRY) console.log(`would put the day-0 fields back on ${client.id}`);
  else {
    [client] = await rest(`clients?id=eq.${client.id}&source=eq.${encodeURIComponent(NEW_CLIENT_SOURCE)}`, { method: "PATCH", body: JSON.stringify(NEW_CLIENT_ROW) });
    console.log(`day-0 fields synced on ${client.id} (stage ${client.client_portal_stage})`);
  }
} else if (client) console.log(`client exists: ${client.id} (${client.business_name})`);
else if (DRY) console.log("would create the client:", NEW_CLIENT_ROW.business_name);
else {
  [client] = await rest("clients", { method: "POST", body: JSON.stringify({ workspace_id: main.workspace_id, ...NEW_CLIENT_ROW }) });
  console.log(`created client ${client.id}`);
}

// 2. the auth user the portal signs in as
const email = WALK_CLIENTS[AS].email;
let userId = null;
for (let page = 1; page <= 10 && !userId; page++) {
  const r = await fetch(`${SUPA}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: H, signal: AbortSignal.timeout(20000) });
  const j = await r.json();
  const users = j.users || [];
  userId = users.find((u) => String(u.email || "").toLowerCase() === email)?.id || null;
  if (users.length < 200) break;
}
if (userId) console.log(`auth user exists for ${email}`);
else if (DRY) console.log(`would create the auth user ${email}`);
else {
  const r = await fetch(`${SUPA}/auth/v1/admin/users`, { method: "POST", headers: H, body: JSON.stringify({ email, email_confirm: true }), signal: AbortSignal.timeout(20000) });
  const j = await r.json();
  if (!r.ok || !j.id) { console.error(`could not create the auth user: ${r.status} ${JSON.stringify(j).slice(0, 200)}`); process.exit(1); }
  userId = j.id;
  console.log(`created auth user for ${email}`);
}

// 3. portal access, already claimed (the walk's guard answers claim_client_portal_access locally, so it can't claim)
if (client && userId) {
  const pa = await rest(`client_portal_access?client_id=eq.${client.id}&select=id,portal_email,invite_status,auth_user_id`);
  if (pa.length) console.log(`portal access exists: ${pa.map((p) => `${p.portal_email} ${p.invite_status}`).join(", ")}`);
  else if (DRY) console.log("would create the portal access row");
  else {
    const t = new Date().toISOString();
    await rest("client_portal_access", { method: "POST", body: JSON.stringify({
      workspace_id: main.workspace_id, client_id: client.id, portal_email: email, auth_user_id: userId,
      invite_status: "active", invited_at: t, accepted_at: t,
    }) });
    console.log("created portal access (active)");
  }
}
// 4. MONTH 2 ONLY: Month 1 finished. Every Month-1 step done, and the one-listing check clean (the monthly photos
//    step waits on it). Never a monthly record: "nothing sent this month" is the state under test, every month.
if (AS === "month2" && client) {
  const pb = JSON.parse(fs.readFileSync(path.join(WEBSITE, "data/playbooks/playbooks.json"), "utf8"));
  const at = new Date().toISOString();
  const tasks = Object.fromEntries((pb.month1 || []).map((s) => [s.id, { status: "done", completed_at: at, completed_by: "test-fixture" }]));
  tasks["m1.audit.gbp_duplicate"].outcome_data = { verdict: "clean", duplicates: [], checked_at: at };
  const ob = await rest(`client_onboarding_records?client_id=eq.${client.id}&select=id`);
  const data = { playbook_version: "month1-v1", tasks };
  if (ob.length && !SYNC) console.log(`onboarding record exists (${ob.length})`);
  else if (DRY) console.log(`would ${ob.length ? "rewrite" : "create"} the onboarding record: ${Object.keys(tasks).length} Month-1 steps done`);
  else if (ob.length) { await rest(`client_onboarding_records?client_id=eq.${client.id}`, { method: "PATCH", body: JSON.stringify({ data }) }); console.log(`onboarding record rewritten: ${Object.keys(tasks).length} Month-1 steps done`); }
  else { await rest("client_onboarding_records", { method: "POST", body: JSON.stringify({ workspace_id: main.workspace_id, client_id: client.id, data }) }); console.log(`onboarding record created: ${Object.keys(tasks).length} Month-1 steps done`); }
}
console.log(client ? `\n${AS} test client id: ${client.id}` : "");
