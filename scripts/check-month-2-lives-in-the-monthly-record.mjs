#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-month-2-lives-in-the-monthly-record.mjs
//
// 🔒 WHY (2026-10-13): Month 1's status is the onboarding record; Month 2's is `client_monthly_records`, one row per
// reporting month, where the admin reads and ticks it. The client's three writers (portal-step-input, portal-step-choice,
// portal-step-recheck) saved EVERY step into the onboarding record, Month 2 included. So a client who submitted "this
// month's business numbers" was told it saved, their own row stayed "To do" (the portal's Month-2 rows read the monthly
// record) and the admin never saw it. And the portal read "the latest" monthly record, so on the 1st every Month-2 row
// showed last month's ticks while the admin, reading this month's, said To do.
// HOLDS — running the real code against a stubbed database:
//   1. ONE locator (`_step-record.js`): a Month-2 step → this month's monthly record (UTC month, the key every server
//      writer uses), a Month-1 step → the onboarding record.
//   2. The writers, run for real: a Month-2 answer / reopen / flag / "I've done it" lands in this month's monthly record
//      (created on the first write, patched after), never in the onboarding record; a Month-1 answer never creates a
//      monthly record; every response says which record it wrote.
//   3. A detection (the nightly probes every step for every client) updates an existing monthly record and NEVER
//      creates one — a Month-1 client would grow an empty monthly record every month.
//   4. The month key is UTC in all three places (server, admin, portal), checked at 11:30 PM Pacific on Oct 31.
//   5. The portal reads THIS month's record (not the latest) and re-renders a Month-2 answer into it.
//   6. The deliverables endpoints read this month's record.
// exit 0 = a Month-2 answer reaches the record both screens read · 1 = it can land elsewhere · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔑 The browser and the server must agree at a month boundary, so run in a zone where local ≠ UTC.
process.env.TZ = "America/Los_Angeles";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const code = (r) => read(r).split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const F = []; const fail = (m) => F.push(m);
const req = createRequire(`${SITE}/netlify/functions/x.js`);

const pb = JSON.parse(read("data/playbooks/playbooks.json"));
const M2 = pb.month2plus || [];
const NUMBERS = M2.find((s) => s.clientInput?.kind === "numbers");
const URLSTEP = M2.find((s) => s.clientInput?.kind === "url" && s.clientDone === "client");
const M2PROBE = M2.find((s) => s.clientDone === "detected");
const M1INPUT = (pb.month1 || []).find((s) => s.clientInput?.kind === "text" && !(s.dependsOn || []).length)
  || (pb.month1 || []).find((s) => s.clientInput?.kind === "url" && !(s.dependsOn || []).length)
  // step2_website_access_v2 (10-20): step 2's answer is "access" (an invite, never a password link)
  || (pb.month1 || []).find((s) => s.clientInput?.kind === "access" && !(s.dependsOn || []).length);
if (!NUMBERS || !URLSTEP || !M2PROBE || !M1INPUT) { console.error("⚠️  INDETERMINATE — the Month-2 numbers / url / detected step or a Month-1 input step with no prerequisite is gone; re-read this gate"); process.exit(2); }
for (const s of [NUMBERS, URLSTEP]) if ((s.dependsOn || []).length && pb.month2plus.some((x) => (s.dependsOn || []).includes(x.id) && x.clientLabel)) {
  console.error(`⚠️  INDETERMINATE — ${s.id} now needs a client step first; the fixture below must finish it`); process.exit(2);
}

// ── 1 · one locator ──
const R = req("./_step-record.js");
if (R.scopeOf(NUMBERS.id) !== "month2plus" || R.scopeOf(M1INPUT.id) !== "month1") fail("_step-record puts a step in the wrong record (scopeOf)");
const EDGE = new Date("2026-10-31T23:30:00-07:00");           // Oct 31 in Los Angeles, Nov 1 in UTC
if (R.currentReportingMonth(EDGE) !== "2026-11-01") fail(`the server's month key isn't UTC (Oct 31 11:30 PM Pacific → ${R.currentReportingMonth(EDGE)}, every other server writer says 2026-11-01)`);
const MONTH = R.currentReportingMonth();

// ── 2 + 3 · run the real writers against a stub database ──
process.env.SUPABASE_URL = "https://stub.supabase.invalid"; process.env.SUPABASE_SERVICE_ROLE_KEY = "stub"; process.env.URL = "https://stub.site.invalid";
process.env.INTERNAL_FN_SECRET = "gate-secret";
const CID = "11111111-1111-4111-8111-111111111111";
let db;
const fresh = () => ({
  client_onboarding_records: [{ id: "ob1", client_id: CID, data: { tasks: { "m1.audit.gbp_duplicate": { status: "done", outcome_data: { verdict: "clean", duplicates: [] } } } } }],
  client_monthly_records: [],
});
const real = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url)); const m = init.method || "GET";
  if (u.hostname === "stub.site.invalid") return new Response(JSON.stringify({ delivered: true }), { status: 200 });
  if (u.hostname !== "stub.supabase.invalid") return new Response(JSON.stringify([]), { status: 200 });
  const table = u.pathname.split("/").pop();
  const rows = db[table] || (db[table] = []);
  const q = [...u.searchParams].filter(([k, v]) => /^eq\./.test(v) && !k.includes("->"));
  const match = (r) => q.every(([k, v]) => String(r[k]) === v.slice(3));
  if (m === "GET") return new Response(JSON.stringify(rows.filter(match)), { status: 200 });
  if (m === "POST") { const b = JSON.parse(init.body); const row = { id: `${table}-${rows.length + 1}`, ...b }; rows.push(row); return new Response(JSON.stringify([row]), { status: 201 }); }
  if (m === "PATCH") { const b = JSON.parse(init.body); rows.filter(match).forEach((r) => Object.assign(r, b)); return new Response(null, { status: 204 }); }
  return real(url, init);
};
const auth = req("./_auth.js");
auth.requirePortalOwner = async () => ({ email: "owner@example.com" });
auth.requirePortalOwnerOrWorkspace = async () => ({ email: "owner@example.com" });
const input = req("./portal-step-input.js"), choice = req("./portal-step-choice.js"), recheck = req("./portal-step-recheck.js");
const call = async (fn, b, headers = {}) => { const r = await fn.handler({ httpMethod: "POST", headers, body: JSON.stringify({ client_id: CID, ...b }) }); let j = {}; try { j = JSON.parse(r.body); } catch {} return { code: r.statusCode, j }; };
const quiet = console.error; const mute = () => { console.error = () => {}; }; const unmute = () => { console.error = quiet; };
const m2keysInOnboarding = () => Object.keys(db.client_onboarding_records[0].data.tasks || {}).filter((k) => k.startsWith("m2."));
const monthRow = () => db.client_monthly_records.find((r) => r.client_id === CID && r.reporting_month === MONTH);
// RGA's part of each Month-2 step finished THIS month, so no wait can refuse the save (the waits are not under test here)
const rgaDone = (s) => Object.fromEntries((s.dependsOn || []).map((d) => [d, { status: "done" }]));
const numbersValue = Object.fromEntries((NUMBERS.clientInput.fields || []).map((f) => [f.key, "7"]));

mute();
try {
  // a Month-2 answer with NO monthly record yet → creates this month's
  db = fresh();
  let r = await call(input, { step_id: NUMBERS.id, value: numbersValue });
  if (r.code !== 200) fail(`a Month-2 answer (${NUMBERS.id}) was refused: ${r.code} ${r.j.error || ""}`);
  else {
    if (!monthRow()?.data?.tasks?.[NUMBERS.id]?.client_input) fail("a Month-2 answer didn't land in this month's monthly record (the one the admin reads)");
    if (m2keysInOnboarding().length) fail(`a Month-2 answer was written into the Month-1 onboarding record (${m2keysInOnboarding().join(", ")})`);
    if (r.j.scope !== "month2plus" || r.j.reporting_month !== MONTH) fail(`the save doesn't say which record it wrote (scope ${r.j.scope}, month ${r.j.reporting_month}) — the portal would re-render the onboarding record`);
    if ("workspace_id" in (monthRow() || {})) fail("the monthly insert sends workspace_id (the table has no such column: the insert is refused)");
  }
  // with this month's record present → patched, not duplicated; last month's untouched
  db = fresh();
  db.client_monthly_records.push({ id: "last", client_id: CID, reporting_month: "2000-01-01", data: { tasks: {} } });
  db.client_monthly_records.push({ id: "cur", client_id: CID, reporting_month: MONTH, data: { tasks: { ...rgaDone(URLSTEP), keep: { status: "done" } } } });
  r = await call(input, { step_id: URLSTEP.id, value: "https://example.com/video" });
  if (r.code !== 200) fail(`a Month-2 link (${URLSTEP.id}) was refused: ${r.code} ${r.j.error || ""}`);
  if (db.client_monthly_records.length !== 2) fail("a second save made a second monthly record for the same month");
  const cur = db.client_monthly_records.find((x) => x.id === "cur");
  if (!cur.data.tasks[URLSTEP.id]?.client_input || !cur.data.tasks.keep) fail("a Month-2 save didn't patch this month's record in place (or dropped the tasks already in it)");
  if (Object.keys(db.client_monthly_records.find((x) => x.id === "last").data.tasks).length) fail("a Month-2 save wrote into LAST month's record");
  // reopen / flag / I've done it — the same record
  r = await call(choice, { step_id: URLSTEP.id, reopen: true });
  if (r.code !== 200 || cur.data.tasks[URLSTEP.id]?.status !== "pending" || r.j.scope !== "month2plus") fail(`reopening a Month-2 step didn't reopen it in this month's record (${r.code} ${r.j.error || ""})`);
  r = await call(choice, { step_id: URLSTEP.id, mark_done: true });
  if (r.code !== 200 || cur.data.tasks[URLSTEP.id]?.status !== "done" || r.j.scope !== "month2plus") fail(`"I've done it" on a Month-2 step didn't land in this month's record (${r.code} ${r.j.error || ""})`);
  r = await call(choice, { step_id: URLSTEP.id, flag_wrong: true });
  if (r.code !== 200 || !cur.data.tasks[URLSTEP.id]?.client_flagged || r.j.scope !== "month2plus") fail(`flagging a Month-2 step didn't land in this month's record (${r.code} ${r.j.error || ""})`);
  if (m2keysInOnboarding().length) fail(`a Month-2 reopen / flag / "I've done it" was written into the onboarding record (${m2keysInOnboarding().join(", ")})`);

  // a Month-1 answer → the onboarding record, and no monthly record appears
  db = fresh();
  r = await call(input, { step_id: M1INPUT.id, value: M1INPUT.clientInput.kind === "url" ? "https://example.com" : M1INPUT.clientInput.kind === "access" ? { via: "none" } : "An answer." });
  if (r.code !== 200) fail(`a Month-1 answer (${M1INPUT.id}) was refused: ${r.code} ${r.j.error || ""}`);
  if (!db.client_onboarding_records[0].data.tasks[M1INPUT.id]?.client_input) fail("a Month-1 answer didn't land in the onboarding record");
  if (db.client_monthly_records.length) fail("a Month-1 answer created a monthly record");
  if (r.j.scope !== "month1") fail(`a Month-1 save says it wrote ${r.j.scope}`);

  // ── 3 · a detection never creates a monthly record, and updates one that exists ──
  const cron = { "x-internal-secret": "gate-secret" };
  db = fresh();
  await call(recheck, { step_id: M2PROBE.id }, cron);
  if (db.client_monthly_records.length) fail(`the nightly detection (${M2PROBE.id}) created a monthly record — every Month-1 client would grow one every month`);
  if (m2keysInOnboarding().length) fail(`a Month-2 detection was written into the onboarding record (${m2keysInOnboarding().join(", ")})`);
  db = fresh();
  db.client_monthly_records.push({ id: "cur", client_id: CID, reporting_month: MONTH, data: { tasks: {} } });
  r = await call(recheck, { step_id: M2PROBE.id }, cron);
  if (!db.client_monthly_records[0].data.tasks[M2PROBE.id]?.detected) fail(`a Month-2 detection (${M2PROBE.id}) wasn't kept on this month's record (${r.code} ${r.j.error || ""})`);
  if (m2keysInOnboarding().length) fail("a Month-2 detection was written into the onboarding record");
} catch (e) {
  unmute(); console.error(`⚠️  INDETERMINATE — running the writers threw: ${e.stack || e.message}`); process.exit(2);
}
unmute();

// ── 4 · the month key is UTC in the admin and the portal too ──
const lift = (src, start, end) => { const i = src.indexOf(start); const j = i < 0 ? -1 : src.indexOf(end, i); return i < 0 || j < 0 ? null : src.slice(i, j + end.length); };
const admin = read("admin/admin.js");
const aFn = lift(admin, "function currentReportingMonthUtc(", "\n}\n");
// 🔑 No helper = the admin computes its own month (the browser's local one), which IS the defect: a FAIL, not "can't tell".
const actx = { f: () => "(no UTC month key in admin.js)" };
if (aFn) { vm.createContext(actx); vm.runInContext(`${aFn}\nthis.f = currentReportingMonthUtc;`, actx); }
if (actx.f(EDGE) !== "2026-11-01") fail(`the admin's month key isn't UTC (Oct 31 11:30 PM Pacific → ${actx.f(EDGE)}): the checklist would read last month's record while the client's answer went into this month's`);
const acode = code("admin/admin.js");
for (const name of ["getFlowState", "updateFlowTask"]) {
  for (const m of acode.matchAll(new RegExp(`async ${name}\\(client, scope(?:, stepId, patch)?\\) \\{[\\s\\S]*?\\n    \\},?\\n`, "g"))) {
    const body = m[0];
    if (!/month2plus/.test(body)) continue;
    if (/getMonth\(\)/.test(body) || !/const month = currentReportingMonthUtc\(\);/.test(body)) fail(`admin ${name} picks the monthly record by the browser's local month, not the UTC key the writers use`);
  }
}
if ((acode.match(/const month = currentReportingMonthUtc\(\);/g) || []).length < 4) fail("the admin's Month-2 checklist (getFlowState / updateFlowTask, both adapters) doesn't use the one UTC month key");

// ── 5 · the portal reads this month's record and re-renders a Month-2 answer into it ──
const portal = read("portal/portal.js");
const pFns = lift(portal, "function portalReportingMonth(", "\nasync function renderActionItemsLive(");
if (!pFns || !/async function settleStepResult\(/.test(pFns) || !/function withStepTask\(/.test(pFns)) {
  // No helpers = the portal has no idea which month's record a Month-2 answer belongs in: the defect itself.
  fail("the portal has no month helpers (portalReportingMonth / thisMonthsRecord / settleStepResult / withStepTask): a Month-2 answer re-renders into the onboarding record");
} else {
const pctx = { _portalPlaybook: JSON.parse(read("data/playbooks/client-steps.json")) };
vm.createContext(pctx);
vm.runInContext(`${pFns.replace(/\nasync function renderActionItemsLive\($/, "")}\nthis.pm = portalReportingMonth; this.tm = thisMonthsRecord; this.ws = withStepTask; this.ss = settleStepResult; this.cs = currentStepTask;`, pctx);
if (pctx.pm(EDGE) !== "2026-11-01") fail(`the portal's month key isn't UTC (Oct 31 11:30 PM Pacific → ${pctx.pm(EDGE)})`);
const recs = [{ reporting_month: "2000-01-01", data: { tasks: { [NUMBERS.id]: { status: "done" } } } }];
if (pctx.tm(recs, MONTH)) fail("the portal reads LAST month's record as this month's (on the 1st, every Month-2 row would show last month's ticks)");
{
  let got = null;
  const listEl = { _onboarding: { data: { tasks: { a: 1 } } }, _monthlyRecords: recs, _rerender: async (o, m) => { got = { o, m }; } };
  await pctx.ss(listEl, { tasks: { [NUMBERS.id]: { status: "done" } }, scope: "month2plus", reporting_month: MONTH });
  const cur = got && pctx.tm(got.m, MONTH);
  if (!cur || cur.data.tasks[NUMBERS.id]?.status !== "done") fail("the portal doesn't re-render a Month-2 answer into this month's record");
  if (got && got.o !== listEl._onboarding) fail("a Month-2 answer overwrote the onboarding record on the client's screen");
  if (got && !got.m.some((x) => x.reporting_month === "2000-01-01")) fail("re-rendering a Month-2 answer dropped the earlier months");
  got = null;
  await pctx.ss(listEl, { tasks: { "m1.x": { status: "done" } }, scope: "month1" });
  if (!got || got.o.data.tasks["m1.x"]?.status !== "done" || got.m !== undefined) fail("a Month-1 answer doesn't re-render the onboarding record");
  const p = pctx.ws(listEl, NUMBERS.id, { status: "pending" }, MONTH);
  if (p.onboarding !== listEl._onboarding || pctx.tm(p.monthly, MONTH)?.data?.tasks?.[NUMBERS.id]?.status !== "pending") fail("the optimistic tick for a Month-2 step lands in the onboarding record");
}
}
const pcode = code("portal/portal.js");
if (!/const m2Tasks = thisMonthsRecord\(monthlyRecords\)\?\.data\?\.tasks \|\| \{\};/.test(pcode)) fail("the portal's Month-2 rows don't read this month's record");
if (/\(monthlyRecords \|\| \[\]\)\[0\][\s\S]{0,60}tasks/.test(pcode)) fail("the portal reads Month-2 status from the latest monthly record");
const settleAt = pcode.indexOf("async function settleStepResult(");
const handBuilt = [...pcode.matchAll(/tasks: j\.tasks/g)].filter((m) => m.index < settleAt || m.index > settleAt + 1200);
if (handBuilt.length) fail(`${handBuilt.length} handler(s) re-render the onboarding record from a writer's answer by hand (a Month-2 answer would land there) — use settleStepResult`);
if ((pcode.match(/await settleStepResult\(/g) || []).length < 5) fail("not every step writer's answer (input, choice, I've done it, reopen / flag, recheck) settles through settleStepResult");
if (!/listEl\._rerender = \(freshOnboarding, freshMonthly(, freshLists)?(, freshPhotos)?(, local = false)?\) => renderActionItemsLive\(\s*domId, realClientId, freshOnboarding, freshMonthly \|\| monthlyRecords,/.test(pcode)) fail("the list can't re-render a fresh monthly record");

// ── 6 · the deliverables endpoints read this month's record ──
const ad = code("netlify/functions/admin-deliverables.js");
if (!/client_id=eq\.\$\{clientId\}\$\{monthly \? `&reporting_month=eq\.\$\{currentReportingMonth\(\)\}` : ""\}/.test(ad)) fail("admin-deliverables reads whichever monthly record comes back first, not this month's");
const pd = code("netlify/functions/portal-deliverables.js");
if (!/const month = require\("\.\/_step-record"\)\.currentReportingMonth\(\);/.test(pd)) fail("portal-deliverables picks this month by its own clock, not the one UTC key");

// ── every client writer of a step's status goes through the locator ──
for (const f of ["portal-step-input.js", "portal-step-choice.js"]) {
  const src = code(`netlify/functions/${f}`);
  if (/client_onboarding_records/.test(src)) fail(`${f} reads or writes the onboarding record directly — a Month-2 step would land there (use _step-record.js)`);
  if (!/readStepRecord\(supa, clientId, stepId\)/.test(src) || !/writeStepTasks\(supa, /.test(src)) fail(`${f} doesn't go through _step-record.js`);
}
{
  const src = code("netlify/functions/portal-step-recheck.js");
  const direct = [...src.matchAll(/client_onboarding_records\?id=eq|method: "PATCH"[^\n]*client_onboarding/g)];
  if (direct.length) fail("portal-step-recheck writes a step's status into the onboarding record directly");
  if (!/const r0 = await readStepRecord\(supa, clientId, stepId\);\s*if \(r0 && r0\.id\) \{/.test(src)) fail("portal-step-recheck can create a monthly record (a detection must only update one that exists)");
}

if (F.length) { console.error("🔴 a Month-2 answer can land somewhere the admin and the client's screen don't read:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log(`✅ Month 2 lives in this month's monthly record: the real writers (answer, link, reopen, "I've done it", flag) create it once and patch it after, never the onboarding record; Month 1 never makes one; a detection never creates one; UTC month in server, admin and portal (Oct 31 11:30 PM Pacific = Nov); the portal reads this month's record and re-renders into it; the deliverables read this month's`);
