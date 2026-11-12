#!/usr/bin/env node
// check-a-signed-client-reaches-the-crm.mjs: A CLIENT WHO SIGNS IS A CONVERTED LEAD IN THE CRM (master audit #7 + #16, 11-11).
//
// 🔴 WHY: contract-sign looked the lead up through lead_intakes.client_id (no such column: a 400 its try/catch swallowed), then patched
// FGA Submissions "Date Client Signed" (no such field: a 422), fire-and-forget after the response. start-as-client saved no lead id and no portal
// mode. So Leads.Date Client Signed stayed empty, Funnel State could never reach converted_to_client, a signed client kept getting the email
// sequence and stayed on the Calls tab, and a sales-path client got the 21-step self-serve portal.
//
// HOLDS (the REAL start-as-client.js and contract-sign.js run against a fake Supabase and a fake Airtable; nothing real is read or written,
// no email is sent: contract-generate, the auth guard, the auto-accept window and the baseline are stubbed):
//   1  start-as-client creates the client with portal_mode "managed" and lead_ref = the Airtable lead id, and writes a lead_linked timeline row.
//   2  When clients.lead_ref is not there yet (PGRST204), the client is still created (managed) and the lead_linked row holds the link.
//   3  No valid lead id = nothing is created (no client row, no agreement).
//   4  Signing (contract-sign) puts THAT lead in the converted state BEFORE it answers: Leads PATCH with Date Client Signed (a date),
//      Funnel State converted_to_client, Pipeline Stage signed, every field name and select option on the live schema (snapshot read with
//      GET /v0/meta/bases/<base>/tables on 11-11: scripts/lib/airtable-schema-2026-11-11.json), no typecast; the lead's audit request
//      (FGA Submissions) marked converted with the client id.
//   5  The link is found from the column or, when the column is missing, from the lead_linked row.
//   6  A refusal (Airtable 429 errors[], a 422) is SAID: the signing still answers 200, a crm_update_failed row with the reason is written and
//      console.error names it. A client with no lead link calls Airtable not at all.
//   7  Source: no lead_intakes.client_id lookup, no "Date Client Signed" on FGA Submissions, no fire-and-forget IIFE, no empty catch.
// PROVES ITSELF: the same checks MUST fail on the website as it was before this build (--against=<rev>, default 95ad5f5c, the main it branched
// from), in 5+ ways, or this gate exits 2 INDETERMINATE.
//   --live-schema  also reads the LIVE Airtable schema (GET, one call, needs AIRTABLE_API_KEY + AIRTABLE_BASE_ID) and fails if a field or option
//                  the code writes is gone; unreachable = exit 2. The daily run passes it.
// Exit 0 holds · 1 something is wrong · 2 can't tell.     node scripts/check-a-signed-client-reaches-the-crm.mjs [--against=<rev>] [--no-before] [--live-schema]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const BEFORE_REV = (argv.find((a) => a.startsWith("--against=")) || "").slice(10) || "95ad5f5c";
const NO_BEFORE = argv.includes("--no-before"), LIVE = argv.includes("--live-schema");
const MIN_BEFORE_FAILS = 5;
let SCHEMA;
try { SCHEMA = JSON.parse(fs.readFileSync(path.join(HERE, "lib/airtable-schema-2026-11-11.json"), "utf8")); }
catch (e) { console.log(`INDETERMINATE: the schema snapshot can't be read (${e.message})`); process.exit(2); }

const LEAD = "recLEADabcdefgh01", CLIENT = "11111111-2222-3333-4444-555555555555", CONTRACT = "99999999-8888-7777-6666-555555555555";
const BASE = "appFAKEbase000001";

// ── one fetch for the whole process (_deadline wraps globalThis.fetch once, so the router stays and its handler changes) ──
let route = null;
const REAL_FETCH = globalThis.fetch;   // kept for --live-schema only; every fixture goes through the router below
globalThis.fetch = async (input, init = {}) => { if (!route) throw new Error("a fetch outside a fixture"); return route(String(input && input.url ? input.url : input), init); };
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => (typeof body === "string" ? JSON.parse(body || "{}") : body), text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });

/** The fake world one scenario runs in. opts: { column (clients.lead_ref exists), link: "column"|"activity"|"none", airtable: "ok"|"429"|"422", auditId } */
function world(opts) {
  const w = { calls: [], clients: [], activity: [], leadPatches: [], fgaPatches: [], airtableCalls: 0, errors: [], responded: false };
  const html = "<p>The agreement</p>";
  const contract = { id: CONTRACT, client_id: CLIENT, workspace_id: "ws-1", status: "sent", contract_html: html, contract_hash: crypto.createHash("sha256").update(html).digest("hex"), monthly_price: 500, term_months: 3, audit_log: [] };
  if (opts.link === "activity") w.activity.push({ client_id: CLIENT, kind: "lead_linked", payload: { lead_ref: LEAD }, occurred_at: "2026-11-10T10:00:00Z" });
  const validate = (table, fields) => {
    const s = SCHEMA[table];
    for (const [k, v] of Object.entries(fields || {})) {
      const t = s[k];
      if (t == null) return { error: { type: "UNKNOWN_FIELD_NAME", message: `Unknown field name: "${k}"` } };
      if (typeof t === "object" && !t.options.includes(v)) return { error: { type: "INVALID_MULTIPLE_CHOICE_OPTIONS", message: `Insufficient permissions to create new select option "${v}"` } };
      if ((t === "date") && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return { error: { type: "INVALID_VALUE_FOR_COLUMN", message: `Field "${k}" cannot accept "${v}"` } };
    }
    return null;
  };
  route = async (url, init) => {
    const method = (init.method || "GET").toUpperCase(), body = init.body ? JSON.parse(init.body) : null;
    w.calls.push({ method, url, body });
    const u = new URL(url);
    if (u.hostname === "api.airtable.com") {
      w.airtableCalls++;
      const parts = decodeURIComponent(u.pathname).split("/").filter(Boolean);   // v0, base, table, id?
      const table = parts[2], id = parts[3];
      if (table === "Leads" && id && method === "GET") return id === LEAD ? res(200, { id, fields: { "Business Name": "Acme Plumbing", "Outreach Notes": "[2026-11-01] [call] Interested", ...(opts.auditId ? { "FGA Audit ID": opts.auditId } : {}) } }) : res(404, { error: "NOT_FOUND" });
      if (table === "Leads" && id && method === "PATCH") {
        if (opts.airtable === "429") return res(429, { errors: [{ error: "PUBLIC_API_BILLING_LIMIT_EXCEEDED", message: "Monthly limit" }] });
        if (body.typecast) w.errors.push("a Leads PATCH used typecast (a wrong select option would be invented, not refused)");
        const bad = opts.airtable === "422" ? { error: { type: "UNKNOWN_FIELD_NAME", message: "Unknown field name" } } : validate("Leads", body.fields);
        if (bad) return res(422, bad);
        w.leadPatches.push({ id, fields: body.fields, before: !w.responded });
        return res(200, { id, fields: body.fields });
      }
      if (table === "FGA Submissions" && !id && method === "GET") return res(200, { records: opts.auditId ? [{ id: "recFGAabcdefghi01", fields: { "Audit ID": opts.auditId } }] : [] });
      if (table === "FGA Submissions" && id && method === "PATCH") {
        const bad = validate("FGA Submissions", body.fields);
        if (bad) return res(422, bad);
        w.fgaPatches.push({ id, fields: body.fields });
        return res(200, { id, fields: body.fields });
      }
      return res(404, { error: "NOT_FOUND" });
    }
    if (u.hostname === "fake.supabase.test") {
      const t = u.pathname.replace("/rest/v1/", ""), q = u.searchParams;
      if (t === "client_contracts" && method === "GET") return res(200, q.get("id") ? [contract] : []);
      if (t === "client_contracts" && method === "PATCH") { Object.assign(contract, body); return res(200, [contract]); }
      if (t === "client_activity" && method === "POST") { w.activity.push(body); return res(201, ""); }
      if (t === "client_activity" && method === "GET") { const kind = (q.get("kind") || "").replace("eq.", ""); return res(200, w.activity.filter((a) => !kind || a.kind === kind)); }
      if (t === "lead_intakes" && q.has("client_id")) return res(400, { code: "42703", message: "column lead_intakes.client_id does not exist" });
      if (t === "clients" && method === "POST") {
        if (!opts.column && body && "lead_ref" in body) return res(400, { code: "PGRST204", message: "Could not find the 'lead_ref' column of 'clients' in the schema cache" });
        const row = { id: CLIENT, ...body }; w.clients.push(row); return res(201, [row]);
      }
      if (t === "clients" && method === "GET") {
        const sel = q.get("select") || "";
        if (/lead_ref/.test(sel) && !opts.column) return res(400, { code: "42703", message: "column clients.lead_ref does not exist" });
        if (/lead_ref/.test(sel)) return res(200, [{ lead_ref: opts.link === "column" ? LEAD : null }]);
        if (/client_portal_stage/.test(sel)) return res(200, [{ client_portal_stage: "stage_1_contract" }]);
        return res(200, []);
      }
      if (t === "clients" && method === "PATCH") return res(204, "");
      if (t === "client_onboarding_records" && method === "GET") return res(200, []);
      if (t === "client_onboarding_records" && method === "POST") return res(201, [{ id: "rec-1", data: { tasks: {} } }]);
      return res(200, method === "GET" ? [] : "");
    }
    return res(200, {});   // the stage email hand-off (notify-client-stage): recorded, never sent anywhere
  };
  return w;
}

/** Load the website's real functions from `root` with the side-effecting modules stubbed. Fresh per scenario. */
function load(rootIn) {
  const root = fs.realpathSync(rootIn);   // require.cache keys are real paths (os.tmpdir() is a symlink on macOS): a stub under another spelling is never used
  const fnDir = path.join(root, "netlify/functions");
  const req = createRequire(path.join(fnDir, "x.js"));
  for (const k of Object.keys(req.cache)) if (k.startsWith(root)) delete req.cache[k];
  const stub = (name, exports) => { const f = path.join(fnDir, name); req.cache[f] = { id: f, filename: f, loaded: true, exports }; };
  const jsonRes = (statusCode, body) => ({ statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  stub("_auth.js", { requireUser: async () => ({ user: { id: "u1", email: "owner@example.test" } }), requirePortalOwner: async () => ({ email: "owner@example.test" }),
    requireWorkspaceUser: async () => ({ workspaceId: "ws-1", email: "rga@example.test" }), jsonRes, fail: (c, m) => jsonRes(c, { error: m }) });
  stub("contract-generate.js", { FOUNDING_CAP: 5, foundingPlacesTaken: () => 0, handler: async () => ({ statusCode: 200, body: JSON.stringify({ ok: true, followUp: { portal_access: { ok: true }, intro_email: { ok: true } } }) }) });
  stub("_auto-accept.js", { openWindow: async () => ({ ok: true }) });
  stub("_baseline.js", { takeBaseline: async () => ({ ok: true }) });
  stub("_raw-store.js", { saveRaw: async () => ({ ok: true }) });
  stub("_google-consent.js", { installGuard: () => {} });
  return { start: req(path.join(fnDir, "start-as-client.js")), sign: req(path.join(fnDir, "contract-sign.js")) };
}

const ENV = { SUPABASE_URL: "https://fake.supabase.test", SUPABASE_SERVICE_ROLE_KEY: "fake-service-key", AIRTABLE_API_KEY: "fake-airtable-key", AIRTABLE_BASE_ID: BASE, URL: "https://fake.site.test", INTERNAL_FN_SECRET: "fake", RGA_SUPPRESS_CLIENT_EMAIL: "1" };
async function run(root, fnName, opts, body) {
  const w = world(opts);
  const saved = {}; for (const [k, v] of Object.entries(ENV)) { saved[k] = process.env[k]; process.env[k] = v; }
  const err = console.error, log = console.log, warn = console.warn; const said = [];
  console.error = (...a) => said.push(a.join(" ")); console.log = () => {}; console.warn = () => {};
  let out = null, threw = null;
  try {
    const M = load(root);
    out = await M[fnName].handler({ httpMethod: "POST", headers: { authorization: "Bearer fake" }, body: JSON.stringify(body) });
    w.responded = true;
    await new Promise((r) => setTimeout(r, 30));   // anything fire-and-forget lands now, AFTER the answer: that is what (before) records
  } catch (e) { threw = e; }
  finally { console.error = err; console.log = log; console.warn = warn; for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } route = null; }
  return { w, out, threw, said, json: out ? JSON.parse(out.body || "{}") : null };
}

const START = { lead_ref: LEAD, business: "Acme Plumbing", email: "owner@acme.example", confirm_to: "owner@acme.example", phone: "+15555550100", market: "Austin, TX" };
const SIGN = { contract_id: CONTRACT, signer_name: "Pat Owner", signer_email: "owner@acme.example", intent_acknowledged: true, consent_acknowledged: true, scrolled_to_bottom: true };

async function checkTree(root, label) {
  const F = [], fail = (m) => F.push(`${label}: ${m}`);
  const rd = (p) => { try { return fs.readFileSync(path.join(root, p), "utf8"); } catch { return ""; } };
  if (!rd("netlify/functions/start-as-client.js") || !rd("netlify/functions/contract-sign.js")) { fail("start-as-client.js or contract-sign.js is missing"); return F; }

  // 1 · start-as-client, column present
  const s1 = await run(root, "start", { column: true }, START);
  const c1 = s1.w.clients[0];
  if (s1.threw || !s1.out || s1.out.statusCode !== 200) fail(`start-as-client did not start the client (${s1.threw ? s1.threw.message : s1.out && s1.out.statusCode})`);
  if (!c1 || c1.portal_mode !== "managed") fail(`a client started from the Audit walkthrough console has portal_mode ${JSON.stringify(c1 && c1.portal_mode)} (must be "managed", as admin's createClient and promoteLeadToClient set)`);
  if (!c1 || c1.lead_ref !== LEAD) fail(`the client row does not carry the Airtable lead id (lead_ref ${JSON.stringify(c1 && c1.lead_ref)})`);
  if (!s1.w.activity.some((a) => a.kind === "lead_linked" && a.payload && a.payload.lead_ref === LEAD)) fail("no lead_linked timeline row names the lead");
  // 2 · column missing
  const s2 = await run(root, "start", { column: false }, START);
  const c2 = s2.w.clients[0];
  if (!s2.out || s2.out.statusCode !== 200 || !c2) fail(`with clients.lead_ref not added yet, start-as-client did not create the client (${s2.out ? s2.out.statusCode : s2.threw && s2.threw.message})`);
  else if (c2.portal_mode !== "managed") fail("with the column missing, the client is not managed");
  if (!s2.w.activity.some((a) => a.kind === "lead_linked" && a.payload && a.payload.lead_ref === LEAD)) fail("with the column missing, the link is kept nowhere (no lead_linked row)");
  // 3 · no lead id
  for (const bad of ["", "Acme Plumbing", "recSHORT", null]) {
    const s3 = await run(root, "start", { column: true }, { ...START, lead_ref: bad });
    if (!s3.out || s3.out.statusCode !== 400 || s3.w.clients.length) fail(`a press with lead_ref ${JSON.stringify(bad)} still created a client (${s3.out && s3.out.statusCode}); the CRM could never hear they signed`);
  }

  // 4 + 5 · signing
  const wantLead = (p, why) => {
    if (!p) { fail(`${why}: the lead was never patched to the converted state`); return; }
    if (!p.before) fail(`${why}: the CRM write happened after the signing answered (fire-and-forget: a frozen function never sends it)`);
    const f = p.fields;
    if (f["Funnel State"] !== "converted_to_client") fail(`${why}: Funnel State is ${JSON.stringify(f["Funnel State"])}, not converted_to_client`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f["Date Client Signed"] || ""))) fail(`${why}: Date Client Signed is ${JSON.stringify(f["Date Client Signed"])}`);
    if (f["Pipeline Stage"] !== "signed") fail(`${why}: Pipeline Stage is ${JSON.stringify(f["Pipeline Stage"])}, not signed`);
  };
  const k1 = await run(root, "sign", { column: true, link: "column", airtable: "ok", auditId: "FGA-ACME-1" }, SIGN);
  if (!k1.out || k1.out.statusCode !== 200) fail(`the signing itself did not answer 200 (${k1.out ? k1.out.statusCode : k1.threw && k1.threw.message})`);
  wantLead(k1.w.leadPatches[0], "lead linked by clients.lead_ref");
  if (!k1.w.fgaPatches.some((p) => p.fields.Status === "converted" && p.fields["Converted Client ID"] === CLIENT)) fail("the lead's audit request (FGA Submissions) is not marked converted with the client id");
  if (k1.w.calls.some((c) => /lead_intakes\?[^ ]*client_id=/.test(c.url))) fail("the signing still looks the lead up through lead_intakes.client_id (no such column)");
  if (k1.w.errors.length) fail(k1.w.errors[0]);
  const k2 = await run(root, "sign", { column: false, link: "activity", airtable: "ok" }, SIGN);
  wantLead(k2.w.leadPatches[0], "lead linked by the lead_linked row (column not added yet)");
  // 6 · refusals are said; no link = no call
  for (const mode of ["429", "422"]) {
    const k = await run(root, "sign", { column: true, link: "column", airtable: mode }, SIGN);
    if (!k.out || k.out.statusCode !== 200) fail(`an Airtable ${mode} broke the signing (${k.out ? k.out.statusCode : k.threw && k.threw.message}); the signature must still be saved`);
    const row = k.w.activity.find((a) => a.kind === "crm_update_failed");
    if (!row || !row.payload || !String(row.payload.reason || "").length) fail(`an Airtable ${mode} on the lead update is not written to the client's timeline (crm_update_failed with the reason)`);
    else if (mode === "429" && !/used up its requests/.test(row.payload.reason)) fail(`a 429 errors[] refusal is not named as Airtable's monthly limit: "${row.payload.reason.slice(0, 80)}"`);
    if (!k.said.some((l) => /CRM was not told/.test(l))) fail(`an Airtable ${mode} is not said in the function log`);
  }
  const k4 = await run(root, "sign", { column: true, link: "none", airtable: "ok" }, SIGN);
  if (k4.w.airtableCalls) fail(`a client with no lead link made ${k4.w.airtableCalls} Airtable call(s) (it must make none, and never guess a lead by name)`);

  // 7 · source
  const cs = rd("netlify/functions/contract-sign.js");
  if (/lead_intakes\?client_id/.test(cs)) fail("contract-sign.js still reads lead_intakes?client_id");
  if (/"Date Client Signed"/.test(cs) && /FGA Submissions|AIRTABLE_FGA_TABLE/.test(cs)) fail("contract-sign.js still writes Date Client Signed to FGA Submissions");
  if (/\(async \(\) => \{[\s\S]{0,400}?airtable/i.test(cs)) fail("contract-sign.js still tells the CRM in a fire-and-forget async block");
  if (/catch \(_?e?\) \{\s*\}|\.catch\(\(\) => \{\}\)/.test(cs)) fail("contract-sign.js swallows an error (an empty catch)");
  return F;
}

/** The website at a revision, in a temp folder (only what the checks read). */
function exportRev(rev) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crm-gate-"));
  // the revision comes from git: the site folder when it is a checkout (a worktree, the main checkout), else the main checkout (a mutation copy is not)
  let gitDir = process.env.WEBSITE_GIT_DIR || SITE;
  try { execFileSync("git", ["-C", gitDir, "rev-parse", "--verify", `${rev}^{commit}`], { stdio: "ignore" }); }
  catch { gitDir = "/Users/chris/RGA/Rocket Growth Agency Website VS Code"; }
  const tar = execFileSync("git", ["-C", gitDir, "archive", rev, "netlify/functions", "shared", "data"], { maxBuffer: 512 * 1024 * 1024 });
  execFileSync("tar", ["-x", "-C", dir], { input: tar });
  return dir;
}

async function liveSchemaCheck() {
  const key = process.env.AIRTABLE_API_KEY, base = process.env.AIRTABLE_BASE_ID;
  if (!key || !base) { console.log("INDETERMINATE: --live-schema needs AIRTABLE_API_KEY and AIRTABLE_BASE_ID"); process.exit(2); }
  let r, d;
  try { r = await REAL_FETCH(`https://api.airtable.com/v0/meta/bases/${base}/tables`, { headers: { Authorization: `Bearer ${key}` } }); d = await r.json(); }
  catch (e) { console.log(`INDETERMINATE: the live Airtable schema couldn't be read (${e.message})`); process.exit(2); }
  if (!r.ok) { console.log(`INDETERMINATE: Airtable refused the schema read (HTTP ${r.status})`); process.exit(2); }
  const F = [];
  const need = { Leads: { "Date Client Signed": "date", "Funnel State": ["converted_to_client"], "Pipeline Stage": ["signed"], "Last Activity": "date", "Outreach Notes": "multilineText", "FGA Audit ID": "singleLineText" },
    "FGA Submissions": { "Audit ID": "singleLineText", Status: ["converted"], "Converted Client ID": "singleLineText" } };
  for (const [tn, fields] of Object.entries(need)) {
    const t = (d.tables || []).find((x) => x.name === tn);
    if (!t) { F.push(`the live base has no "${tn}" table`); continue; }
    for (const [fn, want] of Object.entries(fields)) {
      const f = t.fields.find((x) => x.name === fn);
      if (!f) { F.push(`${tn}."${fn}" is gone from the live schema`); continue; }
      if (Array.isArray(want)) { const opts = ((f.options && f.options.choices) || []).map((c) => c.name); for (const o of want) if (!opts.includes(o)) F.push(`${tn}."${fn}" no longer has the option "${o}"`); }
      else if (f.type !== want) F.push(`${tn}."${fn}" is now ${f.type}, the code writes it as ${want}`);
    }
  }
  return F;
}
// ── run ──
const after = await checkTree(SITE, "after");
if (after.length) { console.log(`❌ a signed client does not reach the CRM (${after.length}):`); after.forEach((f) => console.log(`  · ${f}`)); process.exit(1); }
console.log("  ✓ start-as-client: managed, lead_ref saved (or the lead_linked row when the column is missing), no lead id = nothing created");
console.log("  ✓ contract-sign: the lead reads converted_to_client before the answer, real field names, audit request converted, refusals said");
if (LIVE) {
  const L = await liveSchemaCheck();
  if (L.length) { console.log(`❌ the live Airtable schema moved (${L.length}):`); L.forEach((f) => console.log(`  · ${f}`)); process.exit(1); }
  console.log("  ✓ the live Airtable schema still has every field and option the code writes (one GET)");
}
if (!NO_BEFORE) {
  let dir;
  try { dir = exportRev(BEFORE_REV); } catch (e) { console.log(`INDETERMINATE: can't read revision ${BEFORE_REV} of the website (${String(e.message).slice(0, 100)})`); process.exit(2); }
  let before;
  try { before = await checkTree(dir, `before(${BEFORE_REV})`); } catch (e) { before = [`the before state threw: ${e.message}`]; }
  fs.rmSync(dir, { recursive: true, force: true });
  if (before.length < MIN_BEFORE_FAILS) { console.log(`INDETERMINATE: on the before state ${BEFORE_REV} this gate finds only ${before.length} problem(s), fewer than ${MIN_BEFORE_FAILS}; it can't tell the fix from the bug`); before.forEach((f) => console.log(`  · ${f}`)); process.exit(2); }
  console.log(`  ✓ proves itself: on the before state ${BEFORE_REV} it finds ${before.length} problems`);
  if (argv.includes("--verbose")) before.forEach((f) => console.log(`      · ${f}`));
}
console.log("✅ a client who signs reaches the CRM as a converted lead, and a sales-path client gets the managed portal");
