#!/usr/bin/env node
// check-one-current-month.mjs — ONE CURRENT MONTH (master map Tier 1 #4 + #5 and decision 6, approved 11-11). Runs the SHIPPED code against fakes. No network, no email.
//
// 🔴 WHY: on 11-11 the admin drew a running November for RGA (ten monthly steps done) while the client portal said "between months, Month 2 = December". Three surfaces
// each worked the month out their own way (the server from the hand-off date, the portal from the report's send, the admin from "the earliest open numbered month, else this
// calendar month"), the morning run opened THE CALENDAR MONTH and settled its steps there, and m2.* copies on the Month 1 record leaked into the portal's view.
//
//   1 THE RULE (shared/month-now.js monthNow), for EVERY client, not RGA: a report sent mid-month, on the 1st, on the last evening, skipped, never sent (hand-off only),
//     sent in one month and handed off in the next, the year turn, a skip with no date (never a guess), a Pacific admin on the last evening.
//   2 EVERY SURFACE READS IT: the portal's betweenMonths/currentMonthOf, _open-month's month numbers and Month 1 date, admin-months' month_now (the handler, run),
//     _step-record's default record (run), the admin's selectedMonthKey (source), the portal's record month + its wait view (source), the hand-off's Month 2 (source).
//   3 THE MORNING RUN WRITES ONLY TO THAT MONTH (runMorning, run): between months nothing opens and only review replies run, in Month 2's record; in Month N the month opens
//     and every monthly step runs in it; a monthly-stage client whose Month 1 isn't done runs no month and it is said.
//   4 MONTHLY WORK LIVES ONLY IN THE MONTH ROW: month1Tasks drops m2.*; a task kept as history is not work (reconcile closes a pre-cycle month that holds only history,
//     never one with live work); what ran between months doesn't stop Month 2 getting its carry-over.
//   5 RETIRED IDS: no code acts on one (only the RETIRED lists and comments name them); the repair notes them, never deletes.
//   6 DECISION 6: Stage 6 starts by itself at Month 4 (advanceStageToMature, run: guarded on stage 5, read back, said in the activity; Month 3 / already 6 / between = nothing).
//   7 THE REPAIR SCRIPT: RGA only, never a DELETE, never a status change, conditional writes, the code's own reconcile.
// Exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = [], fail = (m) => F.push(m);
const read = (r) => { try { return fs.readFileSync(path.join(SITE, r), "utf8"); } catch { console.error(`⚠️  INDETERMINATE: cannot read ${r}`); process.exit(2); } };
const strip = (s) => String(s || "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");
Object.assign(process.env, { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "k", INTERNAL_FN_SECRET: "x" });
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));
let Now, CM, OM, SR, MR, AM;
try { Now = req("../../shared/month-now.js"); CM = req("../../shared/client-monthly.js"); OM = req("./_open-month.js"); SR = req("./_step-record.js"); MR = req("./_morning-run.js"); AM = req("./admin-months.js"); }
catch (e) { console.error(`⚠️  INDETERMINATE: the code does not load (${e.message})`); process.exit(2); }
const T = (iso) => Date.parse(iso);
const sent = (iso) => ({ "m1.report.month1": { status: "done", completed_at: iso, auto_result: { sent_message_id: "g1", sent_at: iso } } });
const handed = (iso) => ({ "m1.handoff.month2": { status: "done", completed_at: iso } });

// ───────── 1 · the rule ─────────
try {
  const mn = (tasks, now, o) => Now.monthNow(tasks, T(now), o);
  const RGA = { ...sent("2026-11-09T20:19:16Z"), ...handed("2026-11-09T20:20:30Z") };
  let a = mn(RGA, "2026-11-11T12:00:00Z");
  if (a.state !== "between" || a.number !== 2 || a.month !== "2026-12-01" || a.workMonth !== "2026-12-01" || a.how !== "sent") fail(`1 RGA on Nov 11 is between months, Month 2 = December: ${JSON.stringify(a)}`);
  a = mn(RGA, "2026-12-02T10:00:00Z"); if (a.state !== "month" || a.number !== 2 || a.month !== "2026-12-01" || a.mature) fail(`1 Dec 2 is Month 2: ${JSON.stringify(a)}`);
  a = mn(RGA, "2027-01-15T10:00:00Z"); if (a.number !== 3 || a.mature) fail("1 January is Month 3, not mature yet");
  a = mn(RGA, "2027-02-03T10:00:00Z"); if (a.number !== 4 || !a.mature || a.month !== "2027-02-01") fail(`1 February is Month 4 and mature: ${JSON.stringify(a)}`);
  a = mn({}, "2026-11-11T12:00:00Z"); if (a.state !== "month1" || a.month !== null || a.workMonth !== "2026-11-01") fail(`1 Month 1 not done: month1, the work month is this calendar month: ${JSON.stringify(a)}`);
  a = mn(sent("2026-10-01T15:00:00Z"), "2026-10-20T12:00:00Z"); if (a.state !== "between" || a.month !== "2026-11-01") fail("1 a report sent on the 1st: between until the next month (never the same month)");
  a = mn(sent("2026-10-31T23:00:00Z"), "2026-10-31T23:30:00Z"); if (a.state !== "between" || a.month !== "2026-11-01") fail("1 a report sent on the last evening (UTC): between for the rest of it");
  a = mn(sent("2026-10-31T23:00:00Z"), "2026-11-01T00:30:00Z"); if (a.state !== "month" || a.number !== 2) fail("1 ... and Month 2 the minute the next month starts");
  a = mn({ "m1.report.month1": { status: "skipped", skipped_at: "2026-09-12T10:00:00Z" } }, "2026-09-20T00:00:00Z"); if (a.state !== "between" || a.how !== "skipped" || a.month !== "2026-10-01") fail("1 a skipped report counts as Month 1 done, from the skip's date");
  a = mn({ "m1.report.month1": { status: "skipped" } }, "2026-09-20T00:00:00Z"); if (a.state !== "month1") fail("1 a skip with no date is never a guess");
  a = mn({ "m1.report.month1": { status: "done" }, ...handed("2026-11-03T10:00:00Z") }, "2026-11-10T00:00:00Z"); if (a.state !== "between" || a.how !== "handed_off" || a.month !== "2026-12-01") fail("1 a report marked done without a send: Month 1 ends at the hand-off");
  a = mn({ ...sent("2026-11-30T18:00:00Z"), ...handed("2026-12-02T09:00:00Z") }, "2026-12-03T00:00:00Z"); if (a.state !== "month" || a.number !== 2 || a.month !== "2026-12-01") fail("1 sent Nov 30, handed off Dec 2: December is Month 2 (the send never moves)");
  a = mn(sent("2026-12-15T12:00:00Z"), "2027-01-02T00:00:00Z"); if (a.state !== "month" || a.month !== "2027-01-01" || a.number !== 2) fail("1 the year turn: done Dec 15 -> January 2027 is Month 2");
  a = mn(sent("2026-10-15T12:00:00Z"), "2026-12-01T07:30:00Z", { tz: "America/Los_Angeles" }); if (a.month !== "2026-11-01" || a.number !== 2) fail("1 an admin at 23:30 PT on Nov 30 is still in November (the business's month)");
  a = mn(sent("2026-10-15T12:00:00Z"), "2026-12-01T07:30:00Z"); if (a.month !== "2026-12-01" || a.number !== 3) fail("1 the morning run (UTC) is in December at that moment");
  if (Now.monthNumberOf("2026-11-01", T("2026-11-09T00:00:00Z")) !== null || Now.monthNumberOf("2026-12-01", T("2026-11-09T00:00:00Z")) !== 2 || Now.monthNumberOf("2026-12-01", NaN) !== null) fail("1 monthNumberOf: Nov = no number, Dec = 2, no date = null");
  a = mn(RGA, "2026-11-11T12:00:00Z", { rows: [{ id: "d", reporting_month: "2026-12-01", month_status: "open", month_number: 2 }] }); if (!a.record || a.record.id !== "d") fail("1 the answer names its record when the rows are passed");
} catch (e) { fail(`1 threw: ${e.message}`); }

// ───────── 2 · every surface reads it ─────────
try {
  const cases = [[{ ...sent("2026-11-09T20:19:16Z") }, "2026-11-11T12:00:00Z"], [sent("2026-10-01T15:00:00Z"), "2026-12-20T00:00:00Z"], [{ "m1.report.month1": { status: "done" }, ...handed("2026-11-03T10:00:00Z") }, "2026-11-10T00:00:00Z"], [{}, "2026-11-11T00:00:00Z"]];
  for (const [t, at] of cases) {
    const n = Now.monthNow(t, T(at)), b = CM.betweenMonths(t, T(at)), c = CM.currentMonthOf(t, T(at));
    if ((n.state === "between") !== !!b || (b && b.startMonth !== n.month)) fail(`2 the portal's betweenMonths disagrees with monthNow (${at})`);
    if ((n.state === "month") !== !!c || (c && (c.number !== n.number || c.month !== n.month))) fail(`2 the portal's currentMonthOf disagrees with monthNow (${at})`);
    if ((CM.month1DoneOf(t) || {}).at !== (Now.month1DoneOf(t) || {}).at) fail("2 the portal's Month 1 date is not the rule's");
  }
  // _open-month: the Month 1 date is the rule's (the send, not the hand-off), and so are the numbers
  const t2 = { ...sent("2026-11-30T18:00:00Z"), ...handed("2026-12-02T09:00:00Z") };
  const supa1 = async (p) => (p.startsWith("/client_onboarding_records") ? [{ id: "o", data: { tasks: t2 } }] : []);
  const at = await OM.month1ClosedAt(supa1, "c1");
  if (at !== "2026-11-30T18:00:00.000Z") fail(`2 _open-month's Month 1 date must be the report's send, not the hand-off: ${at}`);
  if (OM.monthNumber("2026-12-01", at) !== 2) fail("2 _open-month numbers December 2 from that date");
  // admin-months: the handler answers month_now from the rule, in the business's month
  const rows = [{ id: "n", reporting_month: "2026-11-01", created_at: "2026-11-01T00:00:00Z", month_status: "open", month_number: null, data: { tasks: { "m2.snap.competitors": { status: "done" } } } }, { id: "d", reporting_month: "2026-12-01", created_at: "2026-11-09T21:00:00Z", month_status: "open", month_number: 2, data: { tasks: {} } }];
  const fake = async (p) => {
    if (p.includes("month_status,opened_at,closed_at,month_number&limit=1") || p.includes("client_monthly_reports?select=id&limit=1")) return [];
    if (p.startsWith("/client_monthly_records")) return rows;
    if (p.startsWith("/client_onboarding_records")) return [{ created_at: "2026-10-01T00:00:00Z", data: { tasks: { ...sent("2026-11-09T20:19:16Z"), ...handed("2026-11-09T20:20:30Z") } } }];
    if (p.startsWith("/client_monthly_reports")) return [];
    if (p.startsWith("/clients")) return [{ call_tracking_attributed: false, call_tracking_provider: null }];
    return [];
  };
  OM.__resetDetect();
  AM.__useDeps({ supa: fake, now: () => new Date("2026-11-11T19:00:00Z"), gate: {} });
  const res = await AM.handler({ httpMethod: "POST", body: JSON.stringify({ client_id: "ae817a9c-60a2-4cc9-a196-0582b7b7e7c3" }) });
  AM.__useDeps(null); OM.__resetDetect();
  const j = JSON.parse(res.body || "{}");
  if (!j.month_now || j.month_now.state !== "between" || j.month_now.month !== "2026-12-01" || j.month_now.number !== 2) fail(`2 admin-months must answer month_now from the rule (between, Month 2 = December): ${JSON.stringify(j.month_now)}`);
  if ((j.months || []).some((m) => m.month === "2026-11-01")) fail("2 admin-months lists November (no number) as a month");
  // _step-record: no month asked = the client's work month (between: Month 2's record); a month asked = that month
  const mkSR = (tasks) => { const seen = []; return { seen, supa: async (p) => { seen.push(p); if (p.startsWith("/client_onboarding_records")) return [{ id: "o", data: { tasks } }]; if (p.startsWith("/client_monthly_records")) { const m = /reporting_month=eq\.(\d{4}-\d{2}-01)/.exec(p); return [{ id: "n", reporting_month: "2026-11-01", data: { tasks: { x: { status: "done" } } } }, { id: "d", reporting_month: "2026-12-01", data: { tasks: {} } }].filter((r) => !m || r.reporting_month === m[1]); } return []; } }; };
  let s = mkSR(sent("2026-11-09T20:19:16Z")); let rec = await SR.readStepRecord(s.supa, "c1", "m2.exec.review_push", new Date("2026-11-11T12:00:00Z"));
  if (rec.reporting_month !== "2026-12-01" || rec.id !== "d") fail(`2 between months a client's monthly answer must go to Month 2's record, not the month in between: ${rec.reporting_month} ${rec.id}`);
  s = mkSR({}); rec = await SR.readStepRecord(s.supa, "c1", "m2.exec.review_push", new Date("2026-11-11T12:00:00Z")); if (rec.reporting_month !== "2026-11-01" || rec.id !== "n") fail("2 in Month 1 the record is this calendar month's, as before");
  s = mkSR(sent("2026-11-09T20:19:16Z")); rec = await SR.readStepRecord(s.supa, "c1", "m2.exec.review_push", new Date("2026-11-11T12:00:00Z"), "2026-11-01"); if (rec.reporting_month !== "2026-11-01") fail("2 a month asked for is the month read");
  // sources: the admin opens on the server's answer; the portal reads the rule; the hand-off opens the rule's Month 2
  const adm = strip(read("admin/admin.js")), por = strip(read("portal/portal.js")), fe = strip(read("netlify/functions/flow-execute.js")), am = strip(read("netlify/functions/admin-months.js"));
  const sel = adm.slice(adm.indexOf("function selectedMonthKey()"), adm.indexOf("function cycleMonthLock("));
  if (!/const mn = info && info\.month_now;\s*if \(mn && \(mn\.state === "month" \|\| mn\.state === "between"\) && mn\.month\) return mn\.month;/.test(sel)) fail("2 the admin's Monthly tab must open on the server's month_now (the one rule), before any month it works out itself");
  if (!/mn\.state === "between" && month === mn\.month\) return `Between months/.test(adm)) fail("2 the admin must say 'Between months' for Month 2 before it starts (the portal says the same)");
  if (!/Now\.monthNow\(m1Tasks, d\.now\(\), \{ tz: "America\/Los_Angeles", rows \}\)/.test(am)) fail("2 admin-months must ask the rule, in the business's month");
  if (!/function portalWorkMonth\(onboarding, now = new Date\(\)\) \{\s*const N = globalThis\.rgaMonthNow;\s*return N \? N\.monthNow\(onboarding\?\.data\?\.tasks \|\| \{\}, now\)\.workMonth/.test(por)) fail("2 the portal's work month must come from the rule (globalThis.rgaMonthNow)");
  if (!/const m1Tasks = globalThis\.rgaMonthNow \? globalThis\.rgaMonthNow\.month1Tasks\(/.test(por) || !/const waitTasks = \{ \.\.\.m1Tasks, \.\.\.m2Tasks \};/.test(por)) fail("2 the portal's wait view must not read m2.* from the Month 1 record (month1Tasks)");
  const raw = read("portal/portal.js"), iNow = raw.indexOf('import "/shared/month-now.js'), iCM = raw.indexOf('import "/shared/client-monthly.js');
  if (iNow < 0 || iCM < 0 || iNow > iCM) fail("2 the portal must load shared/month-now.js before client-monthly.js (which reads it)");
  if (!/nextKey = mnH\.first \|\|/.test(fe) || !/require\("\.\.\/\.\.\/shared\/month-now\.js"\)\.monthNow\(\{ \.\.\.tasks, "m1\.handoff\.month2"/.test(fe)) fail("2 the Month 1 hand-off must open the rule's Month 2, not 'the month after today'");
  for (const f of ["shared/client-monthly.js", "netlify/functions/_open-month.js"]) { const src = strip(read(f)); if (/function (betweenMonths|currentMonthOf|month1DoneOf)\([^)]*\) \{\s*const done = /.test(src) || /ob\.data\.tasks\["m1\.handoff\.month2"\];\s*return \(t && t\.status === "done" && t\.completed_at\)/.test(src)) fail(`2 ${f} works the month out itself again`); }
} catch (e) { fail(`2 threw: ${e.message}`); }

// ───────── 3 · the morning run writes only to that month ─────────
try {
  const world = (tasks, nowIso, stage = "stage_5_monthly") => {
    const log = { opened: [], reconciled: 0, settled: [], quarter: [], health: [], reads: [], writes: [], starts: [], close: [], plans: [], mature: [], errors: [] };
    const real = { openMonth: OM.openMonth, reconcileMonths: OM.reconcileMonths, advanceStageToMature: OM.advanceStageToMature };
    OM.openMonth = async (s, c, m) => { log.opened.push(m); return { ok: true, id: "m", created: true }; };
    OM.reconcileMonths = async () => { log.reconciled++; return { ok: true, numbered: 0, closed: 0 }; };
    OM.advanceStageToMature = async (s, c, mn) => { log.mature.push(mn.number); return { ok: true, advanced: true }; };
    const restore = () => Object.assign(OM, real);
    const store = {};
    const deps = {
      supa: async (p) => { if (p.startsWith("/clients")) return [{ id: "c1", business_name: "X", source: null, workspace_id: "w", client_portal_stage: stage }]; if (p.startsWith("/client_onboarding_records")) return [{ id: "o", data: { tasks } }]; return []; },
      now: () => T(nowIso), env: {}, playbook: () => [], searchesLeft: async () => 0, record: async () => {}, readYoutube: async () => {},
      start: async (c, s, m) => { log.starts.push(`${s}@${m}`); },
      readStepRecord: async (c, s, m) => { log.reads.push(m); return { scope: "month2plus", reporting_month: m, tasks: { ...(store[m] || {}) } }; },
      writeStepTasks: async (rec, t) => { log.writes.push(rec.reporting_month); store[rec.reporting_month] = t; return { tasks: t }; },
      reviewsOpen: async () => ({ status: "ok", openIds: ["r-new"] }),
      settleMonth: async (c, m) => { log.settled.push(m); return { settled: [] }; }, settleQuarter: async (c, m) => { log.quarter.push(m); return {}; }, settleHealth: async (c, m) => { log.health.push(m); return {}; },
      closePrevious: async (c, m) => { log.close.push(m); return {}; }, suggestPlan: async (c, m) => { log.plans.push(m); return {}; },
    };
    return { log, deps, restore };
  };
  const RGA = { ...sent("2026-11-09T20:19:16Z"), ...handed("2026-11-09T20:20:30Z") };
  // between months (RGA, Nov 11)
  let w = world(RGA, "2026-11-11T14:20:00Z"); let out = await MR.runMorning({ deps: w.deps }); w.restore();
  if (w.log.opened.length) fail(`3 between months the morning run must open nothing (it opened ${w.log.opened})`);
  if (w.log.settled.length || w.log.quarter.length || w.log.health.length || w.log.close.length || w.log.plans.length) fail(`3 between months no once-a-month, quarter, health, close or plan step may run: ${JSON.stringify(w.log)}`);
  if (w.log.writes.some((m) => m !== "2026-12-01") || w.log.reads.some((m) => m !== "2026-12-01")) fail(`3 between months the only record read or written is Month 2's: ${JSON.stringify({ r: w.log.reads, w: w.log.writes })}`);
  if (!w.log.starts.includes("m2.exec.review_responses@2026-12-01") || w.log.starts.some((s) => /site_audit/.test(s))) fail(`3 between months review replies run (in Month 2's record) and the site check waits: ${w.log.starts}`);
  if (!w.log.reconciled) fail("3 the months are still reconciled between months");
  // in Month 2 (Dec 2)
  w = world(RGA, "2026-12-02T14:20:00Z"); out = await MR.runMorning({ deps: w.deps }); w.restore();
  if (w.log.opened.join() !== "2026-12-01" || w.log.settled.join() !== "2026-12-01" || w.log.writes.some((m) => m !== "2026-12-01")) fail(`3 in Month 2 the month opens and every monthly step runs in it, and only there: ${JSON.stringify(w.log)}`);
  if (w.log.close.join() !== "2026-11-01" || w.log.mature.length) fail(`3 in Month 2 the month before is offered to close (it refuses an unnumbered one) and nothing is mature: ${JSON.stringify(w.log)}`);
  // Month 4 (Feb 3): the stage moves to Full Dashboard
  w = world(RGA, "2027-02-03T14:20:00Z"); out = await MR.runMorning({ deps: w.deps }); w.restore();
  if (w.log.mature.join() !== "4" || !out.stage_mature) fail(`3 at Month 4 the morning run moves the stage to Full Dashboard: ${JSON.stringify(w.log.mature)} ${JSON.stringify(out)}`);
  w = world(RGA, "2027-02-03T14:20:00Z", "stage_6_mature"); out = await MR.runMorning({ deps: w.deps }); w.restore();
  if (w.log.mature.length || w.log.opened.join() !== "2027-02-01") fail("3 a client already in stage 6 keeps its monthly run and is not moved again");
  // monthly stage, Month 1 not done: nothing monthly, and said
  w = world({}, "2026-11-11T14:20:00Z"); out = await MR.runMorning({ deps: w.deps }); w.restore();
  if (w.log.opened.length || w.log.writes.length || w.log.starts.length || !out.errors.some((e) => /Month 1 is not done/.test(e))) fail(`3 a monthly-stage client whose Month 1 isn't done runs no month, and the run says so: ${JSON.stringify(out.errors)}`);
  const mo = strip(read("netlify/functions/_morning-run.js"));
  if (/const monthKey = OM\.currentReportingMonth\(/.test(mo)) fail("3 the morning run picks the calendar month again");
} catch (e) { fail(`3 threw: ${e.message}`); }

// ───────── 4 · monthly work only in the month row ─────────
try {
  const m1 = Now.month1Tasks({ "m1.a": { status: "done" }, "m2.exec.gbp_photos": { status: "pending" }, "m2.exec.review_push": { status: "pending" } });
  if (Object.keys(m1).join() !== "m1.a") fail("4 month1Tasks must leave every m2.* id out");
  if (Now.liveWork({ "m2.start.open_month": { status: "done" }, a: { status: "done", pre_cycle: { at: "x" } }, b: { status: "done", between_months: { at: "x" } }, c: { retired: { at: "x" } }, d: { moved_to_month: { at: "x" } } }).length) fail("4 a task kept as history (or the open stamp) is not live work");
  if (Now.liveWork({ a: { status: "pending" } }).join() !== "a") fail("4 an un-noted task is live work");
  // reconcile: a pre-cycle month that is over closes when it holds only history; one with live work stays open
  const mk = (rows) => async (p, init = {}) => {
    if (p.includes("&limit=1") && p.includes("select=month_status,opened_at,closed_at,month_number")) return [];
    if (p.startsWith("/client_onboarding_records")) return [{ data: { tasks: sent("2026-11-09T20:19:16Z") } }];
    if (p.startsWith("/client_monthly_records") && (init.method || "GET") === "GET") return rows;
    if (p.startsWith("/client_monthly_records") && init.method === "PATCH") { const id = /id=eq\.([^&]+)/.exec(p)[1], r = rows.find((x) => x.id === id); if (/month_status=eq\.open/.test(p) && r.month_status !== "open") return []; Object.assign(r, JSON.parse(init.body)); return [r]; }
    return [];
  };
  OM.__resetDetect();
  const rows = [{ id: "s", reporting_month: "2026-09-01", month_status: "open", month_number: null, data: { tasks: { "m2.snap.ga4_metrics": { status: "done", retired: { at: "x" } } } } },
    { id: "o", reporting_month: "2026-10-01", month_status: "open", month_number: null, data: { tasks: { "m2.exec.review_push": { status: "done" } } } },
    { id: "n", reporting_month: "2026-11-01", month_status: "open", month_number: null, data: { tasks: { "m2.snap.competitors": { status: "done", between_months: { at: "x" } } } } }];
  await OM.reconcileMonths(mk(rows), "c1", { now: T("2026-11-11T12:00:00Z") }); OM.__resetDetect();
  if (rows[0].month_status !== "closed") fail("4 a pre-cycle month that is over and holds only history must close");
  if (rows[1].month_status !== "open") fail("4 a pre-cycle month with LIVE work must never be closed by the backfill");
  if (rows[2].month_status !== "open") fail("4 the month still running is never closed");
  if (rows.some((r) => !r.data || !r.data.tasks || !Object.keys(r.data.tasks).length)) fail("4 reconcile must never write data");
  const om = strip(read("netlify/functions/_open-month.js"));
  if (!/const noWork = Now\.liveWork\(hd\.tasks \|\| \{\}\)\.filter\(\(k\) => !Now\.RUNS_BETWEEN\.includes\(k\)\)\.length === 0;/.test(om)) fail("4 what ran between months (replies, the customer list) must not stop Month 2's carry-over and suggested focus");
  if (!/const work = Now\.liveWork\(/.test(om)) fail("4 reconcile must count only live work");
} catch (e) { fail(`4 threw: ${e.message}`); }

// ───────── 5 · retired ids ─────────
try {
  const ids = Object.keys(Now.RETIRED);
  if (ids.sort().join() !== ["m1.gbp.messaging", "m1.gbp.qa_seed", "m2.snap.ga4_metrics", "m2.snap.gsc_metrics", "m2.snap.rank_tracker"].sort().join()) fail(`5 the retired list changed: ${ids}`);
  if (ids.includes("m1.access.publish_test")) fail("5 m1.access.publish_test is the website-access test page's live record, not a retired id");
  const files = ["admin/admin.js", "portal/portal.js", ...fs.readdirSync(path.join(SITE, "netlify/functions")).filter((f) => f.endsWith(".js")).map((f) => `netlify/functions/${f}`), ...fs.readdirSync(path.join(SITE, "shared")).filter((f) => f.endsWith(".js")).map((f) => `shared/${f}`)];
  const pb = JSON.parse(read("data/playbooks/playbooks.json")), pbIds = new Set([...(pb.month1 || []), ...(pb.month2plus || [])].map((s) => s.id));
  for (const id of ids) if (pbIds.has(id)) fail(`5 ${id} is retired but still a playbook step`);
  for (const f of files) {
    let src = strip(read(f));
    if (f === "shared/month-now.js") src = src.replace(/const RETIRED = \{[\s\S]*?\n  \};/, "");
    if (f === "shared/monthly-monthly.js") src = src.replace(/const RETIRED = \{[^}]*\};/, "");
    for (const id of ids) if (src.includes(`"${id}"`) || src.includes(`'${id}'`)) fail(`5 ${f} still names the retired id ${id} in code`);
  }
} catch (e) { fail(`5 threw: ${e.message}`); }

// ───────── 6 · decision 6: Stage 6 at Month 4 ─────────
try {
  const mkC = (stage, { drop = false } = {}) => { const s = { stage, act: [], patches: 0 }; s.supa = async (p, init = {}) => {
    if (p.startsWith("/clients") && (init.method || "GET") === "GET") return [{ client_portal_stage: s.stage }];
    if (p.startsWith("/clients") && init.method === "PATCH") { s.patches++; if (!/client_portal_stage=eq\.stage_5_monthly/.test(p)) throw new Error("unguarded stage write"); if (s.stage !== "stage_5_monthly") return []; if (!drop) s.stage = JSON.parse(init.body).client_portal_stage; return drop ? [] : [{ client_portal_stage: s.stage }]; }
    if (p.startsWith("/client_activity")) { s.act.push(JSON.parse(init.body)); return null; }
    return []; }; return s; };
  const M = (n, state = "month") => ({ state, number: n, month: "2027-02-01", mature: state === "month" && n >= 4 });
  let s = mkC("stage_5_monthly"); let r = await OM.advanceStageToMature(s.supa, { id: "c1", workspace_id: "w" }, M(4));
  if (!r.advanced || s.stage !== "stage_6_mature" || s.act.length !== 1 || s.act[0].payload.to !== "stage_6_mature") fail(`6 Month 4 moves stage 5 to Full Dashboard, read back, said in the activity: ${JSON.stringify(r)}`);
  s = mkC("stage_5_monthly"); r = await OM.advanceStageToMature(s.supa, { id: "c1" }, M(3)); if (r.advanced || s.patches) fail("6 Month 3 moves nothing");
  s = mkC("stage_5_monthly"); r = await OM.advanceStageToMature(s.supa, { id: "c1" }, M(2, "between")); if (r.advanced || s.patches) fail("6 between months moves nothing");
  s = mkC("stage_6_mature"); r = await OM.advanceStageToMature(s.supa, { id: "c1" }, M(5)); if (r.advanced || s.patches) fail("6 a client already in stage 6 is left alone");
  s = mkC("stage_4_onboarding"); r = await OM.advanceStageToMature(s.supa, { id: "c1" }, M(5)); if (r.advanced || s.patches) fail("6 only stage 5 moves (never a client still onboarding)");
  s = mkC("stage_5_monthly", { drop: true }); r = await OM.advanceStageToMature(s.supa, { id: "c1" }, M(4)); if (r.ok || s.act.length) fail("6 a stage write that didn't land is a failure, and nothing is said in the activity");
  const S = req("../../shared/monthly-sections.js"); if (Now.monthNow(sent("2026-11-09T20:19:16Z"), T("2027-02-03T00:00:00Z")).mature !== S.showsHealth(4)) fail("6 the stage moves the month Account health opens (one rule)");
  const adm = read("admin/admin.js"); if (!/key: "stage_6_mature",\s+num: 6[^}]*Starts by itself at Month 4[^}]*labelOnly: true/.test(adm)) fail("6 the admin's stage 6 must say it starts by itself at Month 4 and stay a label (never an Advance target)");
} catch (e) { fail(`6 threw: ${e.message}`); }

// ───────── 7 · the repair script ─────────
try {
  const rp = read("scripts/repair-one-current-month.mjs"), code = strip(rp);
  if (!/const ALLOWED = new Set\(\["ae817a9c-60a2-4cc9-a196-0582b7b7e7c3"\]\);/.test(code) || !/if \(!ALLOWED\.has\(CID\)\)/.test(code)) fail("7 the repair must refuse every client but RGA");
  if (/method: "DELETE"/.test(code)) fail("7 the repair must never delete");
  if (/status: "(pending|done|skipped|declined|closed)"/.test(code) || /\.status = /.test(code)) fail("7 the repair must never change a task's status (it only adds notes)");
  if (!/updated_at=eq\./.test(code) || !/Prefer: "return=representation"/.test(code)) fail("7 every repair write is conditional on the row unchanged and read back");
  if (!/OM\.reconcileMonths\(supa, CID/.test(code)) fail("7 the months close through the code's own reconcile, not a hand-written close");
  if (!/if \(cur\.month_status === "closed"\) return/.test(code)) fail("7 a closed month is never written by the repair");
} catch (e) { fail(`7 threw: ${e.message}`); }

if (F.length) { console.error(`🔴 more than one current month: ${F.length} problem(s)`); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ one current month: one rule (shared/month-now.js) for every client and kickoff day · the portal, _open-month, admin-months, _step-record, the admin tab and the hand-off read it · the morning run writes only to that month (between months: replies only, in Month 2) · monthly work only in the month row · retired ids acted on by no code · Stage 6 at Month 4, guarded and read back · the repair is RGA-only and only adds notes");
