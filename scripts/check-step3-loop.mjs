#!/usr/bin/env node
// check-step3-loop.mjs — 2026-10-22 (Chris: "please be sure that this is wired client/admin and database"). Step 3 (website access),
// the WHOLE loop, RUN with the real functions on a fake database that keeps what they write:
//   1 client portal "I sent the invite" (portal-step-input) → DB: client_input {via, platform, platform_source}, the step waits on RGA
//   2 admin row 8 (accessAdminHtml, lifted from admin.js) shows the builder, the role from site-platforms.json, RGA's move, Confirm
//   3 admin Confirm access (admin-access-confirm) → DB: access {role, account, confirmed_at, by}, status done, completed_by rga
//   4 the step is LOCKED (shared/step-lock.js): reopen refused · Request a change stored · admin unlock reopens it
//   5 the client's card (accessCardHtml, lifted) shows "Access confirmed" with the role, account and builder
// Covers a client starting from scratch AND one whose step was ticked done earlier with nothing recorded (RGA's own test record).
// 2026-10-30 night fixer: the client's card (5) lifts the card system too (csBlock) — accessCardHtml draws csCard since client_step03_access_v1
//   exit 0 holds · 1 broken · 2 harness
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { csBlock } from "./lib/portal-cs.mjs";
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
// 11-6 night fixer: a default parameter (accessCardHtml(..., tasks = {})) holds a brace, so the body starts after the parameter list
const fnSrc = (src, name) => { const at = src.indexOf(`function ${name}(`); if (at < 0) { console.error(`⚠️  ${name} moved`); process.exit(2); } let d = 0, i = src.indexOf("(", at); for (let p = 0; i < src.length; i++) { if (src[i] === "(") p++; else if (src[i] === ")" && --p === 0) break; } i = src.indexOf("{", i); for (; i < src.length; i++) { if (src[i] === "{") d++; else if (src[i] === "}" && --d === 0) break; } return src.slice(at, i + 1); };
const actx = vm.createContext({ escapeHtml: (x) => String(x ?? ""), escapeAttribute: (x) => String(x ?? ""), adminGcardWhen: (x) => String(x || "").slice(0, 10), OB_WEB_TILE: "",
  adminGoogleCardHtml: (o) => `<card small="${o.small}">${o.title} ¦ ${o.body || ""} ¦ ${o.act || ""}</card>`, admPlatforms: () => PL, state: { selectedClient: { id: CID } } });
vm.runInContext(fnSrc(A, "accDetectAdminHtml"), actx);
vm.runInContext(fnSrc(A, "accessAdminHtml"), actx);
// auto_live_and_proof_v1 (10-28): the VERIFIED badge + GitHub connection fetch from the server — stubbed here (their own gate runs them)
vm.runInContext(`var ghBadgeHtml = () => ""; var ghPanelHtml = () => "";`, actx);
vm.runInContext(`var RGA_ACCESS_ACCOUNT = "access@x"; ${fnSrc(A, "accInviteLinkHtml")}`, actx);
vm.runInContext(`${A.slice(A.indexOf("function acCardHtml("), A.indexOf("\n}\n", A.indexOf("function acCardHtml(")) + 2)} ${fnSrc(A, "acDueChip")} ${["acMono", "acConsent", "acSite", "GH_MONO", "mvDay", "mvDueDays", "acDay", "acCk"].map((n) => { const at = A.search(new RegExp(`^const ${n} = `, "m")); if (at < 0) return ""; const eol = A.indexOf("\n", at); const first = A.slice(at, eol); return (first.trimEnd().endsWith("{") ? A.slice(at, A.indexOf("\n};", at) + 3) : first).replace(/^const /, "var "); }).join("\n")} var movesForSelected = () => null;`, actx);   // row 8's one card (admin_action_card_and_row8_v1)   // other builders' "Open the invite in access@" link (step3_admin_accept_v1)
// the access ledger + before-snapshot under a confirmed access (rga_client_access_and_work_v1, 10-23)
vm.runInContext(`${(A.match(/^const ACC_REMOVED_HOW = \{[^\n]*\};$/m) || ["var ACC_REMOVED_HOW = {};"])[0].replace(/^const /, "var ")} ${fnSrc(A, "accessRemoveHtml")} ${fnSrc(A, "accessLedgerCardHtml")} ${fnSrc(A, "snapshotFactHtml")} ${fnSrc(A, "accessDoneTitle")}`, actx);   // admin_row8_done_v1 → v2
const adminRow = (t) => vm.runInContext(`accessAdminHtml(${JSON.stringify(t)})`, actx);
// 🔒 step8_spacing_v1 (approved 10-28, Chris "do we need this?"): step 8's folded row on GitHub = the repository pill + "<role> access";
// a CLOSED ask stays inside the card (off the row), an OPEN ask keeps its line
{
  vm.runInContext(`var OB_WEB_TILE = ""; ${fnSrc(A, "ghIdHtml")} ${fnSrc(A, "accessDoneTitle")} ${fnSrc(A, "accessDoneMiniHtml")}`, actx);
  const t8 = { status: "done", client_input: { platform: "custom", files: "github", via: "invite", at: "2026-10-26T17:00:00Z" },
    access: { confirmed_at: "2026-10-27T17:00:00Z", repo: "acme/site", github: "rocketgrowthagency-admin", role: "Write on GitHub" },
    ask_closed: { at: new Date(Date.now() - 864e5).toISOString(), by: "client", kind: "change", note: "x" } };
  const closed = vm.runInContext(`accessDoneMiniHtml(${JSON.stringify(t8)}, null)`, actx);
  if (!/<span class="sub"><span class="ob-ghid"><span class="a g" aria-hidden="true">G<\/span>acme\/site<\/span><span>Write access<\/span><\/span>/.test(closed)) fail(`step 8's row subline isn't the repository pill + "Write access" (${closed.slice(0, 200)})`);
  if (/That's sorted|You closed it/.test(closed.split("</summary>")[0])) fail("step 8's row still carries the closed ask (bookkeeping) — it belongs inside the card");
  const open = vm.runInContext(`accessDoneMiniHtml(${JSON.stringify(t8)}, { at: "2026-10-28T17:00:00Z", note: "please fix" })`, actx);
  if (!/confirmed .* · \d checks/.test(open.split("</summary>")[0])) fail("with an OPEN ask, step 8's row lost its line");
}

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
    if (!/Where RGA can sign in/.test(r8) || !/data-ob-acc-remove/.test(r8) || !/<b>(?:Before-snapshot saved|No before-snapshot yet)<\/b>/.test(r8) || !/data-ob-snap=/.test(r8) || !/<b>We signed in and checked/.test(r8)) fail(`${label}: admin row 8 has no access ledger (with Remove access) or before-snapshot under a confirmed access`);
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
  vm.runInContext(`var _accRoles = {}; ${(P.match(/^const RGA_ADMIN_(?:EMAIL|GITHUB) = "[^"]*";$/gm) || []).join(" ").replace(/const /g, "var ")}`, ctx);
{ const a = P.indexOf("const PC_TICK = "), b = P.indexOf("\n", P.indexOf("const pcActs = ")); if (a < 0 || b < 0) { console.error("⚠️  the plan-card pieces moved"); process.exit(2); } vm.runInContext(P.slice(a, b), ctx); vm.runInContext(csBlock(P, P.slice(a, b)), ctx); }   // the shared plan card (steps_1_4_clean_v1) + the client card system (10-29)
  for (const n of ["accPart", "accDidLine", "accStep1Name", "accSiteName", "accessTestRow", "hostCheckParts", "hostFixHtml", "portalServiceEnded", "accessCardHtml"]) vm.runInContext(lift(n), ctx);
  vm.runInContext("var _portalContractCache = {};", ctx);   // three_small_fixes_v1: no contract read = service not ended
  // 🔒 step3_finish_v1 B (Chris 10-28 "this is confusing"): ONE plain line + "Change ›"; the choice opens in place with Save / Cancel
  { vm.runInContext(lift("accMergeChoiceHtml"), ctx);
    const rga = vm.runInContext(`accMergeChoiceHtml({ merge_by: { by: "rga" } }, "c1")`, ctx), me = vm.runInContext(`accMergeChoiceHtml({ merge_by: { by: "client" } }, "c1")`, ctx);
    if (!/When you approve a change, we put it on your website for you\./.test(rga) || !/data-merge-open>Change ›<\/button>/.test(rga)) fail("the merge choice isn't one plain line + Change ›");
    if (!/<div class="pm-merge-f" hidden>/.test(rga) || (rga.match(/type="radio"/g) || []).length !== 2 || !/value="rga" checked/.test(rga) || !/data-merge-save>Save<\/button>/.test(rga) || !/data-merge-cancel>Cancel<\/button>/.test(rga)) fail("the merge choice doesn't open in place with the saved option checked, Save and Cancel");
    if (!/you press Merge yourself on GitHub/.test(me) || !/value="client" checked/.test(me)) fail("a client who merges themselves isn't told so on the line");
    if (/data-merge-by=/.test(rga)) fail("the old two big tiles (save on tap) are back"); }
  const card = vm.runInContext(`accessCardHtml({ id: "m1.access.website" }, ${JSON.stringify({ status: "done", client_input: { via: "invite", platform: "custom", platform_source: "chosen" }, access: { role: PL.custom.role, account: RGA_EMAIL, confirmed_at: "2026-10-22T20:00:00Z" } })}, "${CID}")`, ctx);
  if (!/Rocket Growth Agency has access/.test(card) || !/We signed in/.test(card) || !/Custom-coded/.test(card)) fail("the client's confirmed card doesn't show the grant (who has access, that we signed in, the builder)");
  // names_not_addresses_v1 (Chris 10-28): the portal TELLS in names — our sign-in address never appears on the done card
  if (card.includes(RGA_EMAIL) || /rocketgrowthagency-admin/.test(card)) fail("the client's confirmed card names our account address again (names_not_addresses_v1: names, not addresses)");
  if (/data-acc-redo/.test(card)) fail("the client's confirmed card offers a way to change it while it's locked");
}
if (F.length) { console.error("🔴 step 3's loop is broken:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ step 3 loop, client → database → admin → database → client: save (waits on RGA) · admin row 8 (builder, role, RGA's move, Confirm) · Confirm records the grant + done + permanent record · locked (no reopen/overwrite) · Request a change · admin unlock → new answer saves · the client's confirmed card — for a new client AND a step ticked done earlier");
