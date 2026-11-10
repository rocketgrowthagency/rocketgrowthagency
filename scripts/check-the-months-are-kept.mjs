#!/usr/bin/env node
// check-the-months-are-kept.mjs — EVERY MONTH IS KEPT (approved monthly_v1, the owner 11-9). Runs the SHIPPED code against FAKES (a fake database behind a fake fetch). No network.
//   1 month numbers: Month 1 closed Nov 9 -> December = 2, January = 3; RGA's Jul-Nov rows have no number; quarter months are 3, 6, 9
//   2 openMonth: idempotent, read back (a write that did not land is not an open month), a unique-violation race counts as "exists", carry-over by name, opened_at + month_number when the columns exist
//   3 the Month 1 hand-off opens December; the monthly hand-off opens the NEXT month (Month 3+) and closes the finished one; a failed open closes nothing
//   4 a closed month refuses writes (_step-record writeStepTasks) and the admin month param reaches the server (admin-step-skip reads/writes that month)
//   5 FEATURE-DETECT: with the columns and the table missing every path works as before (nothing closed, no report row); with them it switches itself on
//   6 a report row is written on a real send (Month 1 and monthly) and never on the test; the portal lists reports newest first and never shows sent_to
//   7 the removed blocks are gone (no renderer, no handler, no element); the sections cover every month2plus step once; the banner never asks for a manual advance
// Exit 0 holds · 1 regressed · 2 can't tell
import { oldChromeFailures } from "./_monthly-no-old-chrome.mjs";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const R2 = "22222222-2222-2222-2222-222222222222";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = [], fail = (m) => F.push(m);
const read = (r) => { try { return fs.readFileSync(path.join(SITE, r), "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
Object.assign(process.env, { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "k", INTERNAL_FN_SECRET: "x" });
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));

// ---------- the fake database ----------
const NEW = ["month_status", "opened_at", "closed_at", "month_number"];
function makeDb({ cols = true, table = true, monthly = [], onboarding = [], clients = [], reports = [], race = false, dropPost = false, dropClose = false } = {}) {
  const T = { client_monthly_records: monthly, client_onboarding_records: onboarding, clients, client_monthly_reports: reports, client_activity: [] };
  let seq = 1, raced = false;
  const err = (code, m) => Object.assign(new Error(`Supabase ${code}: ${m}`), { code });
  async function supa(p, init = {}) {
    const [pth, qs = ""] = p.split("?"), name = pth.slice(1), q = new URLSearchParams(qs), method = init.method || "GET";
    if (name === "client_monthly_reports" && !table) throw err(404, "relation does not exist");
    if (!T[name]) throw err(404, `unknown ${name}`);
    if (name === "client_monthly_records" && !cols && (NEW.some((c) => (q.get("select") || "").includes(c)) || NEW.some((c) => String(init.body || "").includes(`"${c}"`)))) throw err(400, "column does not exist");
    const rows = T[name];
    const match = (r) => [...q.entries()].every(([k, v]) => !v.startsWith("eq.") || String(r[k]) === decodeURIComponent(v.slice(3)));
    if (method === "POST") {
      const b = JSON.parse(init.body);
      const dup = name === "client_monthly_records" && rows.some((r) => r.client_id === b.client_id && r.reporting_month === b.reporting_month);
      if (name === "client_monthly_records" && race && !raced && !dup) { raced = true; rows.push({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...b, tasks: undefined, data: { tasks: {}, playbook_version: "x" } }); throw err(409, "duplicate key value violates unique constraint 23505"); }
      const dupR = name === "client_monthly_reports" && rows.some((r) => r.client_id === b.client_id && r.reporting_month === b.reporting_month && r.gmail_message_id === b.gmail_message_id);
      if (dup || dupR) throw err(409, "duplicate key value violates unique constraint 23505");
      if (dropPost) return [];
      const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...(name === "client_monthly_records" && cols ? { month_status: "open" } : {}), ...b };
      rows.push(row); return [JSON.parse(JSON.stringify(row))];
    }
    const hit = rows.filter(match);
    if (method === "PATCH") { const b = JSON.parse(init.body); if (dropClose && b.month_status === "closed") return JSON.parse(JSON.stringify(hit)); hit.forEach((r) => Object.assign(r, b)); return JSON.parse(JSON.stringify(hit)); }
    let out = hit.slice();
    const ord = q.get("order");   // like PostgREST: honor order and project the selected columns
    if (ord) { const [col, dir] = ord.split("."); out.sort((a, b) => String(a[col] ?? "").localeCompare(String(b[col] ?? "")) * (dir === "desc" ? -1 : 1)); }
    out = out.slice(0, Number(q.get("limit")) || 999);
    const sel = q.get("select");
    if (sel && sel !== "*") { const cs = sel.split(","); out = out.map((r) => Object.fromEntries(cs.filter((c) => c in r).map((c) => [c, r[c]]))); }
    return JSON.parse(JSON.stringify(out));
  }
  return { supa, T };
}
const DB = { cur: null };
globalThis.fetch = async (url, init = {}) => {
  const u = String(url), base = "https://sb.test/rest/v1";
  if (!u.startsWith(base)) throw new Error(`the gate must not touch the network: ${u}`);
  try { const out = await DB.cur.supa(u.slice(base.length), init); return { ok: true, status: 200, text: async () => (out == null ? "" : JSON.stringify(out)), json: async () => out }; }
  catch (e) { return { ok: false, status: e.code || 500, text: async () => e.message, json: async () => ({}) }; }
};
let OM, S, FE, SR, SK, MR, AM, MORN;
try { OM = req("./_open-month.js"); S = req("../../shared/monthly-sections.js"); FE = req("./flow-execute.js"); SR = req("./_step-record.js"); SK = req("./admin-step-skip.js"); MR = req("./monthly-reports.js"); AM = req("./admin-months.js"); MORN = req("./_morning-run.js"); }
catch (e) { console.error(`⚠️  INDETERMINATE — a module did not load: ${e.message}`); process.exit(2); }
const PB = JSON.parse(read("data/playbooks/playbooks.json")).month2plus;
const CID = "11111111-1111-1111-1111-111111111111";
const M1_DONE = { id: "ob1", client_id: CID, created_at: "2026-10-09T00:00:00Z", data: { tasks: { "m1.handoff.month2": { status: "done", completed_at: "2026-11-09T15:00:00Z" } } } };
const fresh = (o = {}) => { DB.cur = makeDb({ onboarding: [JSON.parse(JSON.stringify(M1_DONE))], clients: [{ id: CID, workspace_id: "w", client_portal_stage: "stage_4_onboarding" }], ...o }); OM.__resetDetect(); return DB.cur; };

// 1 numbers
{
  const n = (m, c = "2026-11-09T15:00:00Z") => OM.monthNumber(m, c);
  if (n("2026-12-01") !== 2) fail("1 Month 1 closed Nov 9: December must be Month 2");
  if (n("2027-01-01") !== 3 || n("2027-02-01") !== 4) fail("1 the numbers must count on from December");
  if (n("2026-11-01") !== null || n("2026-07-01") !== null) fail("1 RGA's Jul-Nov rows (before the cycle) must have no number");
  if (OM.monthNumber("2026-12-01", null) !== null) fail("1 no Month 1 close date: no number (never a guess)");
  if (![3, 6, 9].every(OM.isQuarterMonth) || OM.isQuarterMonth(2) || OM.isQuarterMonth(4)) fail("1 quarter months are 3, 6, 9");
}

// 2 openMonth
{
  const db = fresh();
  const a = await OM.openMonth(db.supa, CID, "2026-12-01");
  const row = db.T.client_monthly_records[0];
  if (!a.ok || !a.created || a.month_number !== 2) fail("2 openMonth must create December as Month 2");
  if (!row || row.data.playbook_version !== "month2plus-v1" || Object.keys(row.data.tasks).join() !== "m2.start.open_month") fail("2 a new month carries playbook_version and only step 1 (Open the month, settled by the month existing; monthly_start_v1)");
  if (!row || row.month_status !== "open" || !row.opened_at || row.month_number !== 2) fail("2 opened_at, month_status and month_number are set when the columns exist");
  const b = await OM.openMonth(db.supa, CID, "2026-12-01");
  if (!b.ok || b.created || db.T.client_monthly_records.length !== 1) fail("2 opening twice must not make a second row");
  const dr = fresh({ dropPost: true });
  if ((await OM.openMonth(dr.supa, CID, "2026-12-01")).ok) fail("2 a write that did not land must not read as an open month (read back)");
  const rc = fresh({ race: true });
  const r2 = await OM.openMonth(rc.supa, CID, "2026-12-01");
  if (!r2.ok || r2.created || rc.T.client_monthly_records.length !== 1) fail("2 a unique-violation race must count as exists");
  // carry-over from the month before
  const cdb = fresh({ monthly: [{ id: "d", client_id: CID, reporting_month: "2026-12-01", created_at: "x", data: { tasks: { "m2.exec.gbp_posts": { status: "skipped", skip_reason: "client paused posts" }, "m2.report.generate": { status: "done" } } } }] });
  await OM.openMonth(cdb.supa, CID, "2027-01-01");
  const jan = cdb.T.client_monthly_records.find((r) => r.reporting_month === "2027-01-01"), co = jan && jan.data.carried_over;
  if (!co || !co.skipped.some((s) => s.id === "m2.exec.gbp_posts" && /paused/.test(s.reason))) fail("2 the carry-over must name a skipped step with its reason");
  if (!co || !co.open.length || co.open.some((s) => s.id === "m2.handoff.next_month")) fail("2 the carry-over must list open steps and never the hand-off");
  // an existing early row (RGA's December) is not recreated, only numbered
  const ex = fresh({ monthly: [{ id: "d", client_id: CID, reporting_month: "2026-12-01", created_at: "x", month_status: "open", month_number: null, data: { tasks: {} } }] });
  const e2 = await OM.openMonth(ex.supa, CID, "2026-12-01");
  if (e2.created || ex.T.client_monthly_records.length !== 1 || ex.T.client_monthly_records[0].month_number !== 2) fail("2 an existing December must be kept and given its number");
}

// 3 the hand-offs
{
  const db = fresh({ monthly: [] });
  const r = await FE.stepRunners.handoff({ client: { id: CID, workspace_id: "w" } });
  const dec = db.T.client_monthly_records.find((x) => x.reporting_month === OM.addMonths(OM.currentReportingMonth(), 1));
  if (!dec) fail("3 the Month 1 hand-off must open next month");
  if (db.T.clients[0].client_portal_stage !== "stage_5_monthly") fail("3 the Month 1 hand-off must move the client to the monthly stage (no manual advance)");
  if (!r || r.outcome === "indeterminate") fail("3 the Month 1 hand-off must succeed on a good database");
  // monthly hand-off: Month 3+ is created, this month is closed
  const dbm = fresh({ monthly: [{ id: "m", client_id: CID, reporting_month: "2026-12-01", created_at: "x", month_status: "open", data: { tasks: { "m2.exec.gbp_posts": { status: "skipped", skip_reason: "nothing to post" }, "m2.report.deliver": { status: "done" } } } }] });
  const r2 = await FE.stepRunners.handoff2({ client: { id: CID, workspace_id: "w" }, month: "2026-12-01" });
  const jan = dbm.T.client_monthly_records.find((x) => x.reporting_month === "2027-01-01"), dc = dbm.T.client_monthly_records.find((x) => x.reporting_month === "2026-12-01");
  if (!jan || jan.month_number !== 3) fail("3 the monthly hand-off must create January as Month 3");
  if (!dc || dc.month_status !== "closed" || !dc.closed_at) fail("3 the monthly hand-off must close the finished month");
  if (!jan || !(jan.data.carried_over || {}).skipped?.length) fail("3 January must carry December's skipped step");
  if (!r2 || r2.outcome === "indeterminate") fail("3 the monthly hand-off must succeed");
  // a failed open closes nothing
  { const lost = fresh({ dropClose: true, monthly: [{ id: "m", client_id: CID, reporting_month: "2026-12-01", created_at: "x", month_status: "open", data: { tasks: {} } }] });
    const lc = await OM.closeMonth(lost.supa, CID, "2026-12-01");
    if (lc.ok || lc.closed) fail("3 a close the database did not keep must NOT be reported as closed (read back)"); }
  const bad = fresh({ dropPost: true, monthly: [{ id: "m", client_id: CID, reporting_month: "2026-12-01", created_at: "x", month_status: "open", data: { tasks: { "m2.report.deliver": { status: "done" } } } }] });
  const r3 = await FE.stepRunners.handoff2({ client: { id: CID, workspace_id: "w" }, month: "2026-12-01" });
  if (bad.T.client_monthly_records[0].month_status === "closed" || !r3 || r3.outcome !== "indeterminate") fail("3 a month that could not open its successor must stay open");
}

// 4 closed = read-only; the month param reaches the server
{
  const db = fresh({ monthly: [
    { id: "a", client_id: CID, reporting_month: "2026-12-01", created_at: "x", month_status: "closed", data: { tasks: {} } },
    { id: "b", client_id: CID, reporting_month: "2027-01-01", created_at: "x", month_status: "open", data: { tasks: {} } }] });
  const rec = await SR.readStepRecord(db.supa, CID, "m2.exec.gbp_posts", new Date(), "2026-12-01");
  if (rec.reporting_month !== "2026-12-01" || rec.id !== "a") fail("4 readStepRecord must read the month it is asked for");
  let refused = false; try { await SR.writeStepTasks(db.supa, rec, { "m2.exec.gbp_posts": { status: "done" } }); } catch (e) { refused = !!e.closedMonth; }
  if (!refused || Object.keys(db.T.client_monthly_records[0].data.tasks).length) fail("4 a closed month must refuse a write and stay unchanged");
  const open = await SR.readStepRecord(db.supa, CID, "m2.exec.gbp_posts", new Date(), "2027-01-01");
  await SR.writeStepTasks(db.supa, open, { "m2.exec.gbp_posts": { status: "done" } });
  if (db.T.client_monthly_records[1].data.tasks["m2.exec.gbp_posts"]?.status !== "done") fail("4 an open month must take the write");
  SK.__useDeps({ supa: db.supa, now: () => Date.now(), gate: { email: "a@b" }, record: async () => {} });
  const ev = (month) => ({ httpMethod: "POST", headers: {}, body: JSON.stringify({ client_id: CID, step_id: "m2.exec.gbp_photos", action: "skip", reason: "nothing new", month }) });
  const sj = await SK.handler(ev("2027-01-01"));
  if (sj.statusCode !== 200 || db.T.client_monthly_records[1].data.tasks["m2.exec.gbp_photos"]?.status !== "skipped") fail("4 the skip must land in the month the admin is looking at");
  const sc = await SK.handler(ev("2026-12-01"));
  if (sc.statusCode !== 409) fail("4 skipping in a closed month must be refused with a clear error");
  SK.__useDeps(null);
  const html = read("admin/admin.js");
  if (!/is_monthly: state\.flowScope === "month2plus" \? selectedMonthKey\(\) : false/.test(html) || !/month: selectedMonthKey\(\)/.test(html)) fail("4 the admin must send the selected month to flow-execute and to Skip");
  if (!/const month = selectedMonthKey\(\);\s*\n\s*const \{ data, error \} = await supabase/.test(html)) fail("4 getFlowState must read the selected month");
  if (!/cycleMonthClosed\(month\)\) throw new Error/.test(html)) fail("4 the admin's own write must refuse a closed month");
}

// 5 feature-detect: before the SQL
{
  const db = fresh({ cols: false, table: false });
  OM.__resetDetect();
  if (await OM.hasMonthColumns(db.supa) || await OM.hasReportsTable(db.supa)) fail("5 detection must say no when the columns and the table are missing");
  const a = await OM.openMonth(db.supa, CID, "2026-12-01");
  const row = db.T.client_monthly_records[0];
  if (!a.ok || !row || "month_status" in row || "opened_at" in row) fail("5 before the SQL a month is created without the new columns");
  const rec = await SR.readStepRecord(db.supa, CID, "m2.exec.gbp_posts", new Date(), "2026-12-01");
  row.month_status = "closed";   // a stray value must not matter: the column does not exist for the code
  await SR.writeStepTasks(db.supa, rec, { "m2.exec.gbp_posts": { status: "done" } }).catch(() => fail("5 before the SQL nothing is closed, so a write must work as it always did"));
  const c = await OM.closeMonth(db.supa, CID, "2026-12-01");
  if (!c.ok || c.closed) fail("5 closing before the SQL must be a quiet no-op");
  const k = await OM.keepReport(db.supa, { clientId: CID, reportingMonth: "2026-12-01", subject: "s", html: "h" });
  if (!k.ok || k.kept) fail("5 keeping a report before the SQL must be a quiet no-op");
  const am = await AM.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ client_id: CID }) }).catch(() => null);
  AM.__useDeps({ supa: db.supa, now: () => new Date("2026-12-10T00:00:00Z"), gate: {} });
  const amr = JSON.parse((await AM.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ client_id: CID }) })).body);
  AM.__useDeps(null);
  if (!amr.ok || amr.columns !== false || !amr.months.length || amr.months[0].number !== 2) fail("5 the months list must work before the SQL (number computed)");
  void am;
  // and after: the same code switches itself on, in the same process
  const db2 = fresh();
  const rows = (await AM.buildMonths({ rows: [{ reporting_month: "2026-12-01", created_at: "2026-11-09T10:00:00Z", opened_at: "2026-11-09T21:49:22Z", month_status: "open", month_number: null, data: { tasks: {} } }], cols: true, closedAt: "2026-11-09T15:00:00Z", now: new Date("2026-12-02T00:00:00Z"), reports: [] }));
  if (rows[0].number !== 2 || /21:49/.test(String(rows[0].opened_at))) fail("5 a row from before the column must show created_at, never the column default, as its open date");
  void db2;
}

// 6 reports kept
{
  const db = fresh({ clients: [{ id: CID, workspace_id: "w", business_name: "B", primary_contact_email: "c@x.com" }] });
  const k = await OM.keepReport(db.supa, { clientId: CID, reportingMonth: "2026-12-01", monthNumber: 2, subject: "Your December report", html: "<p>h</p>", text: "t", sentAt: "2027-01-05T15:00:00Z", sentTo: "c@x.com", gmailMessageId: "g1" });
  if (!k.ok || !k.kept || db.T.client_monthly_reports.length !== 1) fail("6 a sent report must be kept and read back");
  await OM.keepReport(db.supa, { clientId: CID, reportingMonth: "2026-12-01", subject: "Your December report", html: "<p>h</p>", gmailMessageId: "g1" });
  if (db.T.client_monthly_reports.length !== 1) fail("6 the same send must not be kept twice");
  const src = read("netlify/functions/_monthly-close.js"), m1 = read("netlify/functions/admin-month1-report.js");
  const iKeep = m1.indexOf("keepReport"), iTest = m1.indexOf("if (isTest) return");
  if (iKeep < 0 || iTest < 0 || iKeep < iTest) fail("6 the Month 1 report must be kept only AFTER the test returns (never on the test)");
  if (!/d\.keepReport\(\{ clientId, reportingMonth: month/.test(src)) fail("6 the monthly send must keep the report it sent");   // monthly_s5_close_v1: the send is _monthly-close.js sendReport
  if (src.indexOf("d.keepReport") < src.lastIndexOf("d.gmail({ workspaceId")) fail("6 the report must be kept only after the send");
  // the portal list: newest first, no address
  db.T.client_monthly_reports.push({ id: R2, client_id: CID, reporting_month: "2027-01-01", month_number: 3, subject: "Jan", html: "<p>j</p>", sent_at: "2027-02-05T15:00:00Z", sent_to: "c@x.com" });
  MR.__useDeps({ supa: db.supa, gate: { email: "p@x.com" } });
  const list = JSON.parse((await MR.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ client_id: CID }) })).body);
  const one = JSON.parse((await MR.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ client_id: CID, report_id: db.T.client_monthly_reports[0].id }) })).body);
  MR.__useDeps(null);
  if (!list.ok || list.reports.length !== 2 || list.reports[0].id !== R2) fail("6 the Reports list must be newest first");
  if (list.reports.some((x) => "html" in x || "sent_to" in x) || "sent_to" in one.report) fail("6 the portal must never get the address or the body in the list, nor the address on one report");
  if (!one.report || !/h/.test(one.report.html)) fail("6 a report must open exactly as sent");
  const portal = read("portal/portal.js");
  if (!/sort\(\(a, b\) => String\(b\.sent_at/.test(portal) || !/monthly-reports/.test(portal) || !/data-m1-card/.test(portal)) fail("6 the portal's Reports view must list the kept reports newest first and keep the Month 1 card");
  const nt = fresh({ table: false });
  MR.__useDeps({ supa: nt.supa, gate: { email: "p@x.com" } });
  const none = JSON.parse((await MR.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ client_id: CID }) })).body);
  MR.__useDeps(null);
  if (!none.ok || none.table !== false) fail("6 without the table the list must say so (the Month 1 card stays)");
}

// 7 the removals, the sections, the banner, the morning run
{
  const idx = read("admin/index.html"), js = read("admin/admin.js");
  for (const id of ["v2SaveConfigBtn", "v2AuditBtn", "v2RunGridBtn", "v2GenerateBtn", "v2LoadReviewsBtn", "v2ClientPreview", "flowM2RunRobotButton", "flowM2Steps", "reportingMonthInputNew", "monthlyNewSections", "saveMonthlyNewButton", "v2-upload-zone-ga4"]) if (idx.includes(`id="${id}"`)) fail(`7 element #${id} must be gone from the Monthly tab`);
  for (const fn of ["saveV2Config", "runV2SiteAudit", "runV2RankGrid", "generateV2Content", "loadV2Reviews", "autoFillV2Config", "saveV2Baseline", "uploadV2Screenshot", "pushV2ToGBP", "submitV2ReviewReply", "handleSaveMonthlyNew", "handleLoadMonthlyNew", "renderV2Reviews", "renderV2RankGrid", "renderV2GeneratedContent"]) if (new RegExp(`\\b${fn}\\b`).test(js)) fail(`7 ${fn} must be gone from admin.js`);
  if (/flowM2(Steps|Summary|RunRobotButton|ProgressFill)/.test(js)) fail("7 the duplicate 'Recurring Monthly Tasks' list must be gone");
  if (/baselines\?\.(ga4|gsc)/.test(js)) fail("7 the sources strip must read Month 1's measured baseline, not the old hand-typed baselines");
  if (!/m1\.audit\.kpi_baseline/.test(js.slice(js.indexOf("function renderV2BrainSources")))) fail("7 the sources strip must be repointed to m1.audit.kpi_baseline");
  const ids = S.SECTIONS.flatMap((s) => s.ids);
  if (ids.length !== PB.length || PB.some((s) => ids.filter((i) => i === s.id).length !== 1)) fail("7 every month2plus step must be in exactly one section");
  if (S.SECTIONS.map((s) => s.name).join("|") !== "Start of month|Every week|Once a month|Every quarter|Account health|Close the month") fail("7 the six sections, in order (Account health was added 11-10, mature_account_health_v1)");
  if (S.showsQuarter(2) || S.showsQuarter(4) || !S.showsQuarter(3) || !S.showsQuarter(6) || S.idsFor(2).length !== ids.length - S.SECTIONS[3].ids.length - S.SECTIONS[4].ids.length || S.idsFor(4).length !== ids.length - S.SECTIONS[3].ids.length || !S.showsHealth(4) || S.showsHealth(3) || S.showsHealth(null)) fail("7 the quarter section shows only in months 3, 6, 9 and the count follows");
  if (/Advance the client to the monthly cycle|Advance the client to Monthly when you are ready/.test(js)) fail("7 the banner must not ask for a manual advance");
  const mr = fresh({ clients: [{ id: CID, workspace_id: "w", client_portal_stage: "stage_5_monthly", source: null }] });
  const d = { ...MORN.defaultDeps(), supa: mr.supa, now: () => Date.parse("2026-12-02T10:00:00Z"), playbook: () => JSON.parse(read("data/playbooks/playbooks.json")).month1, searchesLeft: async () => 0, record: async () => {}, start: async () => {}, readYoutube: async () => {}, env: {} };
  const out = await MORN.runMorning({ deps: d });
  if (!mr.T.client_monthly_records.some((r) => r.reporting_month === "2026-12-01") || out.months_opened !== 1) fail("7 the morning run must open this month for a client in the monthly stage");
  const out2 = await MORN.runMorning({ deps: d });
  if (mr.T.client_monthly_records.length !== 1 || out2.months_opened !== 0) fail("7 the morning run must not open a month twice");
  const met = read("netlify/functions/_metrics.js");
  if (!/if \(!existing\) \{\s*const shim[\s\S]{0,700}?\.openMonth\(shim, clientId, reportingMonth/.test(met)) fail("7 _metrics must create a missing month through openMonth (the one creator), not any other way");
  if (/method: "POST",\s*\n\s*headers: \{ apikey: supaKey[^}]*\},\s*\n\s*body: JSON\.stringify\(\{ client_id: clientId, reporting_month/.test(met)) fail("7 _metrics must not create a month row itself (openMonth is the one creator)");
}

// 11-9 read-back on RGA: Month 1's chip runs from the kickoff (not the record's creation); a non-quarter month folds "Every quarter" to one line
{ const AM = fs.readFileSync(path.join(SITE, "netlify/functions/admin-months.js"), "utf8"), AJ = fs.readFileSync(path.join(SITE, "admin/admin.js"), "utf8");
  if (!/month1: \{ start: \(ob && ob\.data && ob\.data\.tasks && ob\.data\.tasks\["m1\.kickoff\.call"\]/.test(AM)) fail("Month 1's chip doesn't start at the kickoff");
  if (!/quarterOn = num != null && M\.showsQuarter\(num\)/.test(AJ) || !/if \(sec\.quarterOnly && !quarterOn\) return foldedQ\(sec, idx\);/.test(AJ) || !/Hidden this month · next in Month \$\{nextQ\}/.test(AJ)) fail("a non-quarter month shows 'Every quarter' as 0 / N instead of one folded line"); }
// monthly_fix_v2 (11-9): the OLD pieces must be gone too, not only the new ones present (one card per row, the To do for numbered months, Open the month settled, the quarter preview, the bottom blocks)
for (const m of oldChromeFailures(SITE)) fail(m);
// monthly_correctness_v1 (11-9 audit): an ADMIN press means the business's month (Pacific), the count leaves out hidden steps, the call agenda and Send for approval follow the SELECTED month
{ const SR = req("./_step-record.js"), OMx = req("./_open-month.js"), AMx = req("./admin-months.js"), SECx = req("../../shared/monthly-sections.js");
  const pt = (iso) => OMx.adminReportingMonth(new Date(iso));
  if (pt("2026-12-01T07:30:00Z") !== "2026-11-01") fail("fix1 a press at 2026-11-30 23:30 PT (Dec 1 07:30 UTC) must still mean November, not December");
  if (pt("2026-12-01T08:30:00Z") !== "2026-12-01") fail("fix1 a press at 2026-12-01 00:30 PT must mean December");
  if (pt("2026-11-15T12:00:00Z") !== "2026-11-01" || pt("2027-01-01T07:59:00Z") !== "2026-12-01") fail("fix1 mid-month and the year turn must read in Pacific time");
  if (SR.currentReportingMonth(new Date("2026-12-01T07:30:00Z")) !== "2026-12-01") fail("fix1 the morning run keeps its UTC month");
  for (const f of ["admin-monthly-close", "admin-monthly-once", "admin-monthly-quarter", "admin-monthly-weekly", "admin-months"]) if (/OM\.currentReportingMonth\(/.test(read(`netlify/functions/${f}.js`))) fail(`fix1 ${f} must decide "this month" with adminReportingMonth`);
  // fix 2: the lead-handling test (no call tracking) and quarter steps outside quarter months are not counted
  const ids6 = SECx.idsFor(6), ids6n = SECx.idsFor(6, { callTracking: false }), ids2 = SECx.idsFor(2, { callTracking: false });
  if (ids6n.includes("m2.exec.mystery_shop") || ids6n.length !== ids6.length - 1 || !SECx.idsFor(6, { callTracking: true }).includes("m2.exec.mystery_shop") || !SECx.idsFor(6, { callTracking: null }).includes("m2.exec.mystery_shop")) fail("fix2 idsFor must drop the lead-handling test only on a positive no-call-tracking read");
  if (ids2.some((i) => SECx.SECTIONS[3].ids.includes(i))) fail("fix2 a non-quarter month must not count quarterly steps");
  const row = { reporting_month: "2026-12-01", month_number: 3, data: { tasks: { "m2.exec.mystery_shop": { status: "pending" } } } };
  const bm = (ct) => AMx.buildMonths({ rows: [row], cols: true, closedAt: "2026-11-09T00:00:00Z", now: Date.parse("2026-12-05T00:00:00Z"), reports: [], callTracking: ct })[0];
  if (bm(false).total !== bm(true).total - 1) fail("fix2 the server's total must leave out the hidden lead-handling test");
  if (!/idsFor\(row \? row\.number : null, \{ callTracking:/.test(read("admin/admin.js"))) fail("fix2 the admin header count must use the same rule as the server");
  // fix 3: the call agenda reads the month being closed
  const fe = read("netlify/functions/flow-execute.js"), cm = fe.slice(fe.indexOf('"m2.call.monthly": async'), fe.indexOf('"m2.win_story.capture"'));
  if (/new Date\(\)\.getFullYear\(\)|d\.getFullYear\(\)/.test(cm) || !/month: monthArg/.test(cm) || !/reporting_month=eq\.\$\{month\}/.test(cm)) fail("fix3 m2.call.monthly must read the month param, never the calendar month");
  // fix 4: Send for approval on a monthly step uses the selected month
  const ad = read("netlify/functions/admin-deliverables.js");
  if (/currentReportingMonth\(\)/.test(ad) || !/body\.month/.test(ad)) fail("fix4 admin-deliverables must take the month param");
  if (!/internal_decision: "approved", monthly: true, month: selectedMonthKey\(\)/.test(read("admin/admin.js"))) fail("fix4 Send for approval must send the selected month");
}
if (F.length) { console.error(`❌ the months are not kept — ${F.length} problem(s):\n` + F.map((m) => `  - ${m}`).join("\n")); process.exit(1); }
console.log("✅ the months are kept: numbers, openMonth (idempotent, read back, carry-over), the hand-offs open and close, a closed month refuses writes, works before and after the SQL, reports kept on a real send only, the removed blocks are gone");
