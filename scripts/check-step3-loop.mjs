#!/usr/bin/env node
// check-step3-loop.mjs — 2026-10-22 (Chris: "please be sure that this is wired client/admin and database"). Step 3 (website access),
// the WHOLE loop, RUN with the real functions on a fake database that keeps what they write:
//   1 client portal "I sent the invite" (portal-step-input) → DB: client_input {via, platform, platform_source}, the step waits on RGA
//   2 admin row 8 (accessAdminHtml, lifted from admin.js) shows the builder, the role from site-platforms.json, RGA's move, Confirm
//   3 admin Confirm access (admin-access-confirm) → DB: access {role, account, confirmed_at, by}, status done, completed_by rga
//   4 the step is LOCKED (shared/step-lock.js): reopen refused · Request a change stored · admin unlock reopens it
//   5 the client's card (accessCardHtml, lifted) shows "Access confirmed" with the role, account and builder
// Covers a client starting from scratch AND one whose step was ticked done earlier with nothing recorded (RGA's own test record).
//   exit 0 holds · 1 broken · 2 harness
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FNS = `${SITE}/netlify/functions`, FNS_REAL = fs.realpathSync(FNS), req = createRequire(`${FNS}/x.js`);
const read = (r) => fs.readFileSync(`${SITE}/${r}`, "utf8");
const F = [], fail = (m) => F.push(m);
process.env.SUPABASE_URL = "https://db.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.SUPABASE_ANON_KEY = "a";
globalThis.__rgaFetchDeadlineInstalled = true;
const CID = "11111111-2222-4333-8444-555555555555";
let db = {}, who = "owner@acme.test";
const J = (b, st = 200) => new Response(JSON.stringify(b), { status: st, headers: { "content-type": "application/json" } });
globalThis.fetch = async (input, init = {}) => {
  const url = String(input), method = (init.method || "GET").toUpperCase();
  let body = null; try { body = init.body ? JSON.parse(init.body) : null; } catch { body = init.body; }
  if (url.includes("/auth/v1/user")) return J({ id: who === "owner@acme.test" ? "client-u" : "rga-u", email: who });
  if (url.includes("notify-rga")) return J({ ok: true, delivered: true });
  if (/googleapis|openai|anthropic/.test(url)) return J({}, 404);
  const u = new URL(url); const t = u.pathname.split("/").pop(); const rows = db[t] || (db[t] = []);
  const q = [...u.searchParams].filter(([, v]) => /^eq\./.test(v));
  const hit = rows.filter((r) => q.every(([k, v]) => String(r[k]) === v.slice(3)));
  if (method === "PATCH") { for (const r of hit) Object.assign(r, body); return J(hit); }
  if (method === "POST") { const row = { id: `n${rows.length}`, ...(body || {}) }; rows.push(row); return J([row]); }
  return J(hit);
};
const load = (name) => { for (const k of Object.keys(req.cache)) if (k.startsWith(FNS_REAL)) delete req.cache[k]; return req(`./${name}`).handler; };
const call = async (name, body, as = "owner@acme.test") => { who = as; const r = await load(name)({ httpMethod: "POST", headers: { authorization: "Bearer jwt" }, body: JSON.stringify({ client_id: CID, ...body }) }); let b = {}; try { b = JSON.parse(r.body || "{}"); } catch { /* */ } return { status: r.statusCode, body: b }; };
const world = (task) => { db = { client_portal_access: [{ portal_email: "owner@acme.test", client_id: CID }], profiles: [{ id: "rga-u", workspace_id: "w1" }],
  clients: [{ id: CID, workspace_id: "w1", business_name: "Acme Plumbing", website_url: "https://acme.example" }],
  client_onboarding_records: [{ id: "ob1", client_id: CID, data: { tasks: task ? { "m1.access.website": task } : {} } }], client_activity: [] }; };
const T = () => db.client_onboarding_records[0].data.tasks["m1.access.website"] || {};
const { stepLock } = req(`${SITE}/shared/step-lock.js`);
const PLD = JSON.parse(read("data/site-platforms.json")), PL = PLD.platforms;
const RGA_EMAIL = PLD.email;   // the RGA Admin identity (access@, 10-26) — read from the data, never quoted (a gate that quotes the product fails when it improves)
// admin row 8, lifted
const A = read("admin/admin.js");
const fnSrc = (src, name) => { const at = src.indexOf(`function ${name}(`); if (at < 0) { console.error(`⚠️  ${name} moved`); process.exit(2); } let d = 0, i = src.indexOf("{", at); for (; i < src.length; i++) { if (src[i] === "{") d++; else if (src[i] === "}" && --d === 0) break; } return src.slice(at, i + 1); };
const actx = vm.createContext({ escapeHtml: (x) => String(x ?? ""), escapeAttribute: (x) => String(x ?? ""), adminGcardWhen: (x) => String(x || "").slice(0, 10), OB_WEB_TILE: "",
  adminGoogleCardHtml: (o) => `<card small="${o.small}">${o.title} ¦ ${o.body || ""} ¦ ${o.act || ""}</card>`, admPlatforms: () => PL, state: { selectedClient: { id: CID } } });
vm.runInContext(fnSrc(A, "accDetectAdminHtml"), actx);
vm.runInContext(fnSrc(A, "accessAdminHtml"), actx);
vm.runInContext(`var RGA_ACCESS_ACCOUNT = "access@x"; ${fnSrc(A, "accInviteLinkHtml")}`, actx);
vm.runInContext(`${A.slice(A.indexOf("function acCardHtml("), A.indexOf("\n}\n", A.indexOf("function acCardHtml(")) + 2)} ${fnSrc(A, "acDueChip")} ${["acMono", "acConsent", "acSite", "GH_MONO", "mvDay", "mvDueDays"].map((n) => { const at = A.search(new RegExp(`^const ${n} = `, "m")); if (at < 0) return ""; const eol = A.indexOf("\n", at); const first = A.slice(at, eol); return (first.trimEnd().endsWith("{") ? A.slice(at, A.indexOf("\n};", at) + 3) : first).replace(/^const /, "var "); }).join("\n")} var movesForSelected = () => null;`, actx);   // row 8's one card (admin_action_card_and_row8_v1)   // other builders' "Open the invite in access@" link (step3_admin_accept_v1)
// the access ledger + before-snapshot under a confirmed access (rga_client_access_and_work_v1, 10-23)
vm.runInContext(`${(A.match(/^const ACC_REMOVED_HOW = \{[^\n]*\};$/m) || ["var ACC_REMOVED_HOW = {};"])[0].replace(/^const /, "var ")} ${fnSrc(A, "accessLedgerHtml")} ${fnSrc(A, "snapshotAdminHtml")}`, actx);
const adminRow = (t) => vm.runInContext(`accessAdminHtml(${JSON.stringify(t)})`, actx);

for (const [label, start] of [["a new client", null], ["a step ticked done earlier with nothing recorded", { status: "done", completed_at: "2026-10-01T17:00:00Z", completed_by: "rga" }]]) {
  world(start);
  // 1 · client: Custom-coded → I sent the invite
  let r = await call("portal-step-input.js", { step_id: "m1.access.website", value: { consent: { promise: "2026-10-23b", text: "I allow Rocket Growth Agency to access my website…" }, via: "invite", platform: "custom", platform_source: "chosen" } });
  const t1 = T();
  if (r.status !== 200 || t1.client_input?.via !== "invite" || t1.client_input?.platform !== "custom") { fail(`${label}: "I sent the invite" didn't save the answer (${r.status} ${r.body.error || ""} ${JSON.stringify(t1.client_input)})`); continue; }
  if (t1.status === "done" && !t1.access) fail(`${label}: after "I sent the invite" the step still reads Done before RGA has signed in (status ${t1.status})`);
  // 2 · admin row 8
  const row8 = adminRow(t1);
  if (!/Custom-coded/.test(row8) || !new RegExp(PL.custom.role.replace(/[()]/g, ".")).test(row8) || !/data-ob-acc-confirm[^>]*>Confirm access<\/button>/.test(row8) || !/<b>Then<\/b>/.test(row8) || !row8.includes(String(PL.custom.rga).slice(0, 24))) fail(`${label}: admin row 8 doesn't show the builder, its role, RGA's move and Confirm access`);
  // 3 · admin: Confirm access
  r = await call("admin-access-confirm.js", { role: PL.custom.role, account: RGA_EMAIL }, "chris@rga.test");
  const t3 = T();
  if (r.status !== 200 || !t3.access?.confirmed_at || t3.status !== "done" || t3.completed_by !== "rga" || t3.client_input?.platform !== "custom") fail(`${label}: Confirm access didn't record the grant, finish the step, or kept the client's answer (${r.status} ${r.body.error || ""})`);
  if (!(db.client_activity || []).some((a) => a.kind === "website_access_confirmed")) fail(`${label}: the confirmation leaves no permanent record`);
  if (!/Access confirmed/.test(adminRow(t3))) fail(`${label}: admin row 8 doesn't show "Access confirmed" afterwards`);
  { const r8 = adminRow(t3);
    if (!/Access ledger/.test(r8) || !/data-ob-acc-remove/.test(r8) || !/Before-snapshot/.test(r8) || !/data-ob-snap=/.test(r8)) fail(`${label}: admin row 8 has no access ledger (with Remove access) or before-snapshot under a confirmed access`);
    const rm = adminRow({ ...t3, access: { ...t3.access, removed_at: "2026-11-03T17:00:00Z", removed_by: "hello@", removed_how: "removed_by_rga" } });
    if (!/Access removed/.test(rm) || /data-ob-acc-remove/.test(rm) || !/Removed 2026-11-03/.test(rm)) fail(`${label}: a removed access doesn't read "Access removed" with its date in the card and the ledger (or still offers Remove)`); }
  // 4 · locked: no reopen, Request a change works, admin unlock reopens
  if (!stepLock("m1.access.website", t3, {})) fail(`${label}: the confirmed step isn't locked`);
  r = await call("portal-step-choice.js", { step_id: "m1.access.website", reopen: true });
  if (r.status !== 409 || T().status !== "done") fail(`${label}: the client can reopen confirmed access (${r.status})`);
  r = await call("portal-step-input.js", { step_id: "m1.access.website", value: { consent: { promise: "2026-10-23b", text: "I allow Rocket Growth Agency to access my website…" }, via: "designer", platform: "wix" } });
  if (r.status !== 409 || T().client_input?.platform !== "custom") fail(`${label}: the client can overwrite confirmed access (${r.status})`);
  r = await call("portal-step-choice.js", { step_id: "m1.access.website", change_request: "We moved the site to Squarespace" });
  if (r.status !== 200 || T().change_request?.note !== "We moved the site to Squarespace") fail(`${label}: "Request a change" isn't stored (${r.status} ${r.body.error || ""})`);
  r = await call("admin-step-unlock.js", { step_id: "m1.access.website", action: "unlock", reason: "They moved to Squarespace" }, "chris@rga.test");
  if (r.status !== 200 || stepLock("m1.access.website", T(), {}) || T().change_request) fail(`${label}: admin's unlock doesn't reopen it for the client (${r.status} ${r.body.error || ""})`);
  r = await call("portal-step-input.js", { step_id: "m1.access.website", value: { consent: { promise: "2026-10-23b", text: "I allow Rocket Growth Agency to access my website…" }, via: "invite", platform: "squarespace", platform_source: "chosen" } });
  if (r.status !== 200 || T().client_input?.platform !== "squarespace") fail(`${label}: after the unlock the client can't save the new builder (${r.status} ${r.body.error || ""})`);
}
// 5 · the client's confirmed card
{
  const P = read("portal/portal.js");
  const lift = (n) => fnSrc(P, n);
  const ctx = vm.createContext({ escapeHtml: (x) => String(x ?? ""), escapeAttribute: (x) => String(x ?? ""), monthDay: (x) => String(x || "").slice(5, 10), fmtDateTimeDot: (x) => String(x || ""), fmtDateShort: (x) => String(x || ""),
    googleCardHtml: (o) => `<card>${o.small} ¦ ${o.title} ¦ ${o.body || ""} ¦ ${o.act || ""}</card>`, stepLockOf: (id, t) => stepLock(id, t, {}), _rcEditing: new Set(), _accHosts: {}, ACC_FILES: {}, _accNames: Object.fromEntries(Object.entries(PL).map(([k, p]) => [k, p.name])), RC_WEB: "", RC_LOCK: "" });
  vm.runInContext(`var rcRow = (k, st, v) => k + ":" + st[1] + ":" + v + " | ";`, ctx);
  vm.runInContext(`var _accRoles = {}; ${(P.match(/^const ACC_TAG = \{[^\n]*\};$/m) || [""])[0].replace(/^const /, "var ")} ${(P.match(/^const RGA_ADMIN_(?:EMAIL|GITHUB) = "[^"]*";$/gm) || []).join(" ").replace(/const /g, "var ")}`, ctx);
{ const a = P.indexOf("const PC_TICK = "), b = P.indexOf("\n", P.indexOf("const pcActs = ")); if (a < 0 || b < 0) { console.error("⚠️  the plan-card pieces moved"); process.exit(2); } vm.runInContext(P.slice(a, b), ctx); }   // the shared plan card (steps_1_4_clean_v1)
  for (const n of ["accPart", "accDidLine", "accStep1Name", "accSiteName", "accessCardHtml"]) vm.runInContext(lift(n), ctx);
  const card = vm.runInContext(`accessCardHtml({ id: "m1.access.website" }, ${JSON.stringify({ status: "done", client_input: { via: "invite", platform: "custom", platform_source: "chosen" }, access: { role: PL.custom.role, account: RGA_EMAIL, confirmed_at: "2026-10-22T20:00:00Z" } })}, "${CID}")`, ctx);
  if (!/RGA has access/.test(card) || !card.includes(RGA_EMAIL) || !/Custom-coded/.test(card)) fail("the client's confirmed card doesn't show the grant (role, account, builder)");
  if (/data-acc-redo/.test(card)) fail("the client's confirmed card offers a way to change it while it's locked");
}
if (F.length) { console.error("🔴 step 3's loop is broken:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ step 3 loop, client → database → admin → database → client: save (waits on RGA) · admin row 8 (builder, role, RGA's move, Confirm) · Confirm records the grant + done + permanent record · locked (no reopen/overwrite) · Request a change · admin unlock → new answer saves · the client's confirmed card — for a new client AND a step ticked done earlier");
