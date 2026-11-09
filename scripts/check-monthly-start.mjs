#!/usr/bin/env node
// check-monthly-start.mjs — MONTHLY SECTION 1, "START OF MONTH" (approved monthly_start_v1, the owner 11-9). Runs the SHIPPED code against FAKES (a fake database behind a fake
// fetch). No network, no model.
//   1 the focus RULE, case by case with the real numbers: reviews few -> Reviews; profile views down -> Google profile; map rank slipped / outside the top 20 -> Listings and reviews;
//     search clicks low -> Website; numbers missing -> says so and suggests Google profile (a missing review count is NEVER read as zero); the order of the rules
//   2 the tasks come from data/monthly-focus-tasks.json (3-5 per focus, each tied to a real step, no em dash), and the suggestion is computed when the month opens (openMonth)
//   3 step 1 "Open the month": the card (opened by whom and when, carried-over listed by name, skipped ones in client words, "couldn't open" says why and "tries again tomorrow"),
//     no buttons, no Skip (server refuses too), no hand Done; settled by the month existing
//   4 step 2 "Plan the month": Use this plan writes and READS BACK, Change the focus (all four focuses with their tasks), a task from another focus refused, zero tasks refused, a second
//     press refused, a closed month refused, Skip works, the done card's exact words, never auto-accepted
//   5 tasks_for_month is GONE (playbook, Scraper mirror, sections, runners, admin) and nothing dangles; no model call anywhere on this path; the two runners are deleted
//   6 the client portal shows "This month's focus: X" with the chosen tasks in client words, only once accepted
//   7 the Monthly checklist: every step whose dependencies are settled is open at the same time (Month 1 unchanged: one active); Plan the month waits only on Open the month
//   8 wiring: the cards, the buttons, the purge key for the Google-quoting reason, the ?v= keys
// Exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SCR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = [], fail = (m) => F.push(m);
const read = (r) => { try { return fs.readFileSync(path.join(SITE, r), "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
Object.assign(process.env, { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "k", INTERNAL_FN_SECRET: "x" });
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));

// ---------- the fake database ----------
function makeDb({ monthly = [], onboarding = [], rankings = null, rankingsFail = false } = {}) {
  const T = { client_monthly_records: monthly, client_onboarding_records: onboarding, client_activity: [], clients: [] };
  if (rankings) T.client_keyword_rankings = rankings;
  const err = (code, m) => Object.assign(new Error(`Supabase ${code}: ${m}`), { code });
  async function supa(p, init = {}) {
    const [pth, qs = ""] = p.split("?"), name = pth.slice(1), q = new URLSearchParams(qs), method = init.method || "GET";
    if (name === "client_keyword_rankings" && rankingsFail) throw err(404, "relation does not exist");
    if (!T[name]) throw err(404, `unknown ${name}`);
    const rows = T[name];
    const match = (r) => [...q.entries()].every(([k, v]) => {
      if (v.startsWith("eq.")) return String(r[k]) === decodeURIComponent(v.slice(3));
      if (v.startsWith("lt.")) return String(r[k]) < decodeURIComponent(v.slice(3));
      return true;
    });
    if (method === "POST") {
      const b = JSON.parse(init.body);
      if (name === "client_monthly_records" && rows.some((r) => r.client_id === b.client_id && r.reporting_month === b.reporting_month)) throw err(409, "duplicate key value violates unique constraint 23505");
      const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...(name === "client_monthly_records" ? { month_status: "open" } : {}), ...b };
      rows.push(row); return [JSON.parse(JSON.stringify(row))];
    }
    const hit = rows.filter(match);
    if (method === "PATCH") { const b = JSON.parse(init.body); hit.forEach((r) => Object.assign(r, b)); return JSON.parse(JSON.stringify(hit)); }
    let out = hit.slice();
    const ord = q.get("order");
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
let MS, OM, MP, PLAN, SK, SKIPFN, S, STEPS, SR;
try {
  MS = req("../../shared/monthly-start.js"); OM = req("./_open-month.js"); MP = req("./_monthly-plan.js"); PLAN = req("./admin-monthly-plan.js"); SKIPFN = req("./admin-step-skip.js");
  SK = req("./_step-skip.js"); S = req("../../shared/monthly-sections.js"); STEPS = req("../../shared/steps-57-64.js"); SR = req("./_step-record.js");
} catch (e) { console.error(`⚠️  INDETERMINATE — a module did not load: ${e.message}`); process.exit(2); }
const PBJ = JSON.parse(read("data/playbooks/playbooks.json")), PB = PBJ.month2plus, ALL = [...PBJ.month1, ...PB];
const CATALOG = JSON.parse(read("data/monthly-focus-tasks.json"));
const CID = "11111111-1111-1111-1111-111111111111";
const M1_DONE = () => ({ id: "ob1", client_id: CID, created_at: "2026-10-09T00:00:00Z", data: { tasks: { "m1.handoff.month2": { status: "done", completed_at: "2026-11-09T15:00:00Z" } } } });
const fresh = (o = {}) => { DB.cur = makeDb({ onboarding: [M1_DONE()], ...o }); OM.__resetDetect(); return DB.cur; };
const NOV = (o = {}) => ({ id: "n1", client_id: CID, reporting_month: "2026-11-01", month_status: "open", data: { tasks: {} }, review_count: 20, gbp_impressions: 1000, gsc_clicks: 300, gsc_impressions: 5000, ...o });
const OCT = (o = {}) => ({ id: "o1", client_id: CID, reporting_month: "2026-10-01", month_status: "closed", data: { tasks: {} }, gbp_impressions: 900, ...o });

// 1 the rule
{
  const base = { prevLabel: "November", priorLabel: "October", prev: { review_count: 30, gbp_impressions: 1000, gsc_clicks: 400, gsc_impressions: 5000 }, prior: { gbp_impressions: 900 }, rank: { latest: 5, prior: 5 } };
  const run = (o) => MS.suggestFocus({ ...base, ...o });
  let r = run({ prev: { ...base.prev, review_count: 0 } });
  if (r.focus !== "Reviews" || !/\b0 Google reviews\b/.test(r.reason) || !/November/.test(r.reason)) fail(`1 zero reviews must suggest Reviews with the real count: ${JSON.stringify(r)}`);
  r = run({ prev: { ...base.prev, review_count: 1 } });
  if (r.focus !== "Reviews" || !/\b1 Google review\b/.test(r.reason)) fail("1 one review reads singular");
  r = run({ prev: { ...base.prev, review_count: 10 } });
  if (r.focus === "Reviews") fail("1 ten reviews is not 'few'");
  r = run({ prior: { gbp_impressions: 1200 }, prev: { ...base.prev, gbp_impressions: 900 } });
  if (r.focus !== "Google profile" || !/1,200/.test(r.reason) || !/\b900\b/.test(r.reason) || r.rule !== "profile_views") fail(`1 profile views down must suggest Google profile with both numbers: ${JSON.stringify(r)}`);
  r = run({ rank: { latest: 9, prior: 5 } });
  if (r.focus !== "Listings and reviews" || !/#5/.test(r.reason) || !/#9/.test(r.reason)) fail(`1 map rank slipped must suggest Listings and reviews with both ranks: ${JSON.stringify(r)}`);
  r = run({ rank: { latest: 24, prior: 24 } });
  if (r.focus !== "Listings and reviews" || !/top 20/.test(r.reason)) fail("1 map rank outside the top 20 must suggest Listings and reviews");
  r = run({ rank: { latest: 6, prior: 5 } });
  if (r.focus === "Listings and reviews") fail("1 a one-place move is not a slip");
  r = run({ prev: { ...base.prev, gsc_clicks: 50, gsc_impressions: 5000 } });
  if (r.focus !== "Website" || !/5,000/.test(r.reason) || !/\b50 people\b/.test(r.reason) || !/1%/.test(r.reason)) fail(`1 low clicks must suggest Website with the real numbers: ${JSON.stringify(r)}`);
  r = run({ prev: { ...base.prev, gsc_clicks: 1, gsc_impressions: 40 } });
  if (r.focus === "Website") fail("1 a handful of impressions is not enough to call clicks low");
  r = MS.suggestFocus({ prevLabel: "November", prev: null, prior: null, rank: null });
  if (r.focus !== "Google profile" || r.rule !== "missing" || !/aren't in yet/.test(r.reason) || r.missing.length !== 4) fail(`1 missing numbers must say so and suggest Google profile: ${JSON.stringify(r)}`);
  r = MS.suggestFocus({ prevLabel: "November", prev: { review_count: null, gbp_impressions: null, gsc_clicks: null, gsc_impressions: null }, prior: {}, rank: { latest: null, prior: null } });
  if (r.focus === "Reviews") fail("1 a NULL review count must never be read as zero reviews");
  r = run({ prev: { ...base.prev, review_count: 0, gbp_impressions: 500 }, rank: { latest: 30, prior: 5 } });
  if (r.focus !== "Reviews") fail("1 the rules run in order: reviews first");
  r = run({});
  if (r.focus !== "Google profile" || r.rule !== "steady" || !/stands out/.test(r.reason)) fail(`1 nothing standing out must say so: ${JSON.stringify(r)}`);
  // the 30-day rule: a reason that quotes a Google number is stored under google_basis, not in plain sight
  const sg = MS.buildSuggestion({ ...base, prev: { ...base.prev, review_count: 0 } }, CATALOG, Date.UTC(2026, 11, 1));
  if (sg.reason !== null || !sg.google_basis || !/0 Google reviews/.test(sg.google_basis.reason)) fail("1 a reason that quotes a Google review count must be stored under google_basis");
  const sg2 = MS.buildSuggestion({ ...base, rank: { latest: 24, prior: 24 } }, CATALOG, Date.UTC(2026, 11, 1));
  if (!sg2.reason || sg2.google_basis) fail("1 a reason with no Google Business Profile number stays in plain sight");
  if (!/Google's figures are not kept/.test(MS.reasonOf({ focus: "Reviews", reason: null }))) fail("1 after the 30 days the card must still say something true");
  const key = (read("netlify/functions/_gbp-keep.js").match(/id: "monthly_plan_basis"[^}]*\}/) || [""])[0];
  if (!/path: "plan_suggestion\.google_basis"/.test(key) || !/stamp: "plan_suggestion\.computed_at"/.test(key)) fail("1 the Google-quoting reason must be on the 30-day purge list (_gbp-keep.js GOOGLE_JSON_KEYS)");
}

// 2 the task data
{
  const ids = new Set(ALL.map((s) => s.id));
  const text = read("data/monthly-focus-tasks.json");
  if (/[\u2014\u2013]/.test(text)) fail("2 the task list has a dash a person would read");
  for (const f of MS.FOCUSES) {
    const list = (CATALOG.focuses[f] || {}).tasks || [];
    if (list.length < 3 || list.length > 5) fail(`2 ${f}: needs 3 to 5 tasks, has ${list.length}`);
    for (const t of list) {
      if (!t.id || !t.text || !t.client) fail(`2 ${f}/${t.id}: needs an id, RGA text and client words`);
      if (!ids.has(t.step)) fail(`2 ${f}/${t.id}: its step ${t.step} is not a step`);
      if (/step \d|m2\.|RGA's|\bmodel\b/i.test(t.client)) fail(`2 ${f}/${t.id}: the client words mention internals: ${t.client}`);
    }
  }
  if ((CATALOG.focuses["Reviews"].tasks.find((t) => /review/i.test(t.text) && /Ask/.test(t.text)) || {}).step !== "m2.exec.review_push") fail("2 the review ask must be settled by m2.exec.review_push");
  if ((CATALOG.focuses["Reviews"].tasks.find((t) => /^Reply/.test(t.text)) || {}).step !== "m2.exec.review_responses") fail("2 the reply task must be settled by m2.exec.review_responses");
  if (!CATALOG.focuses["Reviews"].tasks.some((t) => t.step === "m2.exec.gbp_posts")) fail("2 the weekly post must be settled by m2.exec.gbp_posts");
}

// 2b the suggestion is computed when the month opens (no model), from LAST month's numbers
const OPEN_AT = Date.UTC(2026, 11, 1, 6, 0, 0);
{
  fresh({ monthly: [NOV({ review_count: 0 }), OCT()], rankings: [] });
  const r = await OM.openMonth(DB.cur.supa, CID, "2026-12-01", { now: OPEN_AT, by: "the morning run" });
  const row = DB.cur.T.client_monthly_records.find((x) => x.reporting_month === "2026-12-01");
  if (!r.ok || !row) fail("2b the month did not open"); else {
    const sg = row.data.plan_suggestion;
    if (!sg || sg.focus !== "Reviews") fail(`2b December must open with the suggestion already waiting (Reviews from November's 0 reviews): ${JSON.stringify(sg && sg.focus)}`);
    if (!sg || !sg.catalog || MS.FOCUSES.some((f) => !(sg.catalog[f] || []).length)) fail("2b the suggestion must carry all four focuses' tasks");
    if (row.data.plan) fail("2b a suggestion must never auto-accept");
    if ((row.data.tasks["m2.plan.rotating_focus"] || {}).status) fail("2b the plan step must stay open until a person presses Use this plan");
    if ((row.data.tasks["m2.start.open_month"] || {}).status !== "done") fail("2b step 1 must settle itself when the month row exists");
    if (!row.data.opened || row.data.opened.by !== "the morning run" || row.data.opened.at !== new Date(OPEN_AT).toISOString()) fail("2b the month must record when and by whom it was opened");
    const keep = JSON.stringify(sg);
    await OM.openMonth(DB.cur.supa, CID, "2026-12-01", { now: OPEN_AT + 86400000, by: "the hand-off" });
    if (JSON.stringify(row.data.plan_suggestion) !== keep || row.data.opened.by !== "the morning run") fail("2b opening again must change nothing (idempotent)");
  }
  // a read that fails is "missing", never a crash and never a zero
  fresh({ monthly: [NOV({ review_count: null, gbp_impressions: null, gsc_clicks: null, gsc_impressions: null })], rankingsFail: true });
  const r2 = await OM.openMonth(DB.cur.supa, CID, "2026-12-01", { now: OPEN_AT });
  const row2 = DB.cur.T.client_monthly_records.find((x) => x.reporting_month === "2026-12-01");
  if (!r2.ok || !row2 || !row2.data.plan_suggestion || row2.data.plan_suggestion.focus !== "Google profile" || row2.data.plan_suggestion.rule !== "missing") fail("2b with the numbers missing and the rank table failing, the month must still open with the 'numbers missing' suggestion");
  // rank slip read from the scans
  const scans = [];
  for (const [sess, at, ranks] of [["s2", "2026-11-28T00:00:00Z", [9, 10, 8, 9]], ["s1", "2026-11-01T00:00:00Z", [5, 5, 6, 4]]]) for (const mr of ranks) scans.push({ client_id: CID, source: "geo-grid", map_rank: mr, grid_session_id: sess, measured_at: at });
  fresh({ monthly: [NOV(), OCT()], rankings: scans });
  await OM.openMonth(DB.cur.supa, CID, "2026-12-01", { now: OPEN_AT });
  const sg3 = DB.cur.T.client_monthly_records.find((x) => x.reporting_month === "2026-12-01").data.plan_suggestion;
  if (!sg3 || sg3.focus !== "Listings and reviews" || !/#5/.test(sg3.reason || "") || !/#9/.test(sg3.reason || "")) fail(`2b the map scans must be read: ${JSON.stringify(sg3 && sg3.reason)}`);
  // an early month made by the old hand-off is given what it lacks and keeps the carry-over
  fresh({ monthly: [NOV({ review_count: 0 }), { id: "d1", client_id: CID, reporting_month: "2026-12-01", month_status: "open", created_at: "2026-11-09T15:00:00Z", data: { tasks: {} } }] });
  await OM.openMonth(DB.cur.supa, CID, "2026-12-01", { now: OPEN_AT, carry: { from: "month1", open: [{ id: "m1.x", title: "Business photos" }], skipped: [] } });
  const e = DB.cur.T.client_monthly_records.find((x) => x.id === "d1").data;
  if (!e.plan_suggestion || !e.carried_over || e.tasks["m2.start.open_month"]?.status !== "done") fail("2b an existing early month must be given its suggestion, step 1 and the carry-over");
}

// 3 step 1, the card
{
  const co = { from: "month1", at: "2026-11-09T15:00:00Z", open: [{ id: "m1.photos", title: "Business photos" }], skipped: [{ id: "m1.dir", title: "Directory sign-ups", reason: "Scheduled for later" }, { id: "m1.call", title: "Call tracking", reason: "Client uses a call-in line" }] };
  const rec = { tasks: {}, opened: { at: "2026-12-01T06:00:00Z", by: "the morning run" }, carried_over: co };
  const v = MS.openView({ month: "2026-12-01", record: rec }, {});
  const txt = JSON.stringify(v);
  if (v.tone !== "ok" || !/December is open/.test(txt) || !/Created Dec 1 by the morning run/.test(txt)) fail(`3 the open card must say "December is open" and "Created Dec 1 by the morning run": ${txt}`);
  if (!/Carried over from Month 1: 3 items/.test(txt) || !/Business photos/.test(txt) || !/Directory sign-ups \(scheduled later\)/.test(txt) || !/Call tracking \(skipped: Client uses a call-in line\)/.test(txt)) fail(`3 the carried-over items must be listed by name, skipped ones in client words: ${txt}`);
  if (/"acts"|button|Skip this step/i.test(txt)) fail("3 the open card has no buttons and no Skip");
  const none = MS.openView({ month: "2026-12-01", record: { tasks: {}, opened: { at: "2026-12-01T06:00:00Z", by: "the hand-off" }, carried_over: { from: "2026-11-01", open: [], skipped: [] } } }, {});
  if (!/Nothing carried over from November/.test(JSON.stringify(none))) fail("3 nothing carried over must say so");
  const bad = MS.openView({ month: "2026-12-01", record: null, openError: { error: "Supabase 503: timeout" } }, {});
  if (bad.done || !/couldn't open: Supabase 503/.test(JSON.stringify(bad)) || !/tries again tomorrow/.test(JSON.stringify(bad))) fail(`3 a month that couldn't open must say why and that it tries again tomorrow: ${JSON.stringify(bad)}`);
  const wait = MS.openView({ month: "2026-12-01", record: null }, {});
  if (wait.done || !/isn't open yet/.test(JSON.stringify(wait))) fail("3 a month not opened yet must say so");
  if (!STEPS.NO_SKIP.includes("m2.start.open_month") || STEPS.canSkip("m2.start.open_month")) fail("3 step 1 must have no Skip (shared model)");
  if (!STEPS.noHandDone("m2.start.open_month")) fail("3 step 1 must have no hand Done");
  if (!SK.noSkipWhy("m2.start.open_month")) fail("3 the server must refuse a Skip on step 1");
  const step = PB.find((s) => s.id === "m2.start.open_month");
  if (!step || step.hasRunner || step.clientLabel) fail("3 step 1 is in the playbook, has no runner and is not the client's");
  // the server refuses
  fresh({ monthly: [NOV(), { id: "d", client_id: CID, reporting_month: "2026-12-01", month_status: "open", data: { tasks: {} } }] });
  SKIPFN.__useDeps({ supa: DB.cur.supa, now: () => OPEN_AT, gate: { email: "chris@x" }, record: async () => ({}) });
  const out = await SKIPFN.handler({ httpMethod: "POST", body: JSON.stringify({ client_id: CID, step_id: "m2.start.open_month", action: "skip", reason: "no", month: "2026-12-01" }) });
  if (out.statusCode !== 400) fail(`3 the server must refuse a Skip on Open the month (got ${out.statusCode})`);
}

// 4 step 2, Plan the month
const board = () => {
  fresh({ monthly: [NOV({ review_count: 0 })] });
  return DB.cur;
};
{
  const record = []; let t = OPEN_AT + 3600e3;
  const deps = () => ({ supa: DB.cur.supa, now: () => t, gate: { email: "chris@rocketgrowthagency.com" }, record: async (o) => { record.push(o); return {}; } });
  board();
  await OM.openMonth(DB.cur.supa, CID, "2026-12-01", { now: OPEN_AT, by: "the morning run" });
  const rowOf = () => DB.cur.T.client_monthly_records.find((x) => x.reporting_month === "2026-12-01");
  const press = async (b) => { PLAN.__useDeps(deps()); const o = await PLAN.handler({ httpMethod: "POST", body: JSON.stringify({ client_id: CID, month: "2026-12-01", ...b }) }); return { code: o.statusCode, body: JSON.parse(o.body) }; };
  // the card before
  const v0 = MS.planView({ record: rowOf().data, task: {} }, { ref: () => "step 12" });
  if (v0.state !== "suggest" || v0.focus !== "Reviews" || !/0 Google reviews/.test(v0.reason) || !v0.tasks.length || v0.tasks.some((k) => !k.on)) fail(`4 the card must show the suggestion, the reason and the tasks ticked: ${JSON.stringify(v0).slice(0, 300)}`);
  if (MS.FOCUSES.some((f) => !(v0.alternatives[f] || []).length)) fail("4 Change the focus must offer every focus with its task list");
  // refusals
  let r = await press({ focus: "Reviews", task_ids: ["gbp.posts"] });
  if (r.code !== 400) fail("4 a task from another focus must be refused");
  r = await press({ focus: "Reviews", task_ids: [] });
  if (r.code !== 400) fail("4 a plan with no tasks must be refused");
  r = await press({ focus: "Made up", task_ids: ["rev.ask"] });
  if (r.code !== 400) fail("4 a focus that isn't one of the four must be refused");
  if (rowOf().data.plan) fail("4 a refused press must save nothing");
  // Use this plan (a changed focus, two tasks ticked)
  r = await press({ focus: "Google profile", task_ids: ["gbp.posts", "gbp.photos"] });
  const d1 = rowOf().data;
  if (r.code !== 200 || !d1.plan || d1.plan.focus !== "Google profile" || d1.plan.tasks.length !== 2 || d1.plan.changed !== true || d1.plan.suggested_focus !== "Reviews") fail(`4 Use this plan must save the changed focus and the ticked tasks: ${r.code} ${JSON.stringify(r.body).slice(0, 200)}`);
  if (d1.tasks["m2.plan.rotating_focus"]?.status !== "done" || d1.focus_area !== "Google profile") fail("4 Use this plan must settle the step and keep focus_area for older readers");
  if (d1.plan.chosen_by !== "chris@rocketgrowthagency.com" || !d1.plan.chosen_at) fail("4 the plan must say who chose it and when");
  if (!d1.plan_suggestion) fail("4 the suggestion stays on the month");
  if (!record.length || record[0].kind !== "monthly_plan_chosen" || record[0].stepId !== "m2.plan.rotating_focus") fail("4 the press must be recorded (recordSubmission)");
  r = await press({ focus: "Reviews", task_ids: ["rev.ask"] });
  if (r.code !== 409 || rowOf().data.plan.focus !== "Google profile") fail("4 a second press must be refused and change nothing");
  // the done card
  const vd = MS.planView({ record: rowOf().data, task: rowOf().data.tasks["m2.plan.rotating_focus"] }, { ref: () => "step 13" });
  if (vd.state !== "done" || vd.doneLine !== `Focus: Google profile \u00b7 2 tasks \u00b7 Chosen by chris@rocketgrowthagency.com ${new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} \u00b7 tracked in This month's focus work (step 13)`) fail(`4 the done card's words: ${vd.doneLine}`);
  // a read-back that fails is an error, not a success
  board(); await OM.openMonth(DB.cur.supa, CID, "2026-12-01", { now: OPEN_AT });
  const real = DB.cur.supa; let n = 0;
  DB.cur.supa = async (p, init = {}) => { const o = await real(p, init); if ((init.method || "GET") === "PATCH" && ++n >= 1 && /client_monthly_records\?id=/.test(p) && init.body && /"plan"/.test(init.body)) { const d = JSON.parse(JSON.stringify(o)); if (d && d[0] && d[0].data) delete d[0].data.plan; return d; } return o; };
  PLAN.__useDeps({ supa: DB.cur.supa, now: () => t, gate: { email: "c" }, record: async () => ({}) });
  const lost = await PLAN.handler({ httpMethod: "POST", body: JSON.stringify({ client_id: CID, month: "2026-12-01", focus: "Reviews", task_ids: ["rev.ask"] }) });
  if (lost.statusCode !== 500) fail(`4 a write that did not read back must be an error (got ${lost.statusCode})`);
  // a closed month refuses
  board(); await OM.openMonth(DB.cur.supa, CID, "2026-12-01", { now: OPEN_AT });
  DB.cur.T.client_monthly_records.find((x) => x.reporting_month === "2026-12-01").month_status = "closed";
  OM.__resetDetect();
  const closed = await press({ focus: "Reviews", task_ids: ["rev.ask"] });
  if (closed.code !== 409) fail(`4 a closed month must refuse a plan (got ${closed.code})`);
  // Skip works on Plan the month (the shared skip), and it is not in the no-skip list
  board(); await OM.openMonth(DB.cur.supa, CID, "2026-12-01", { now: OPEN_AT });
  SKIPFN.__useDeps({ supa: DB.cur.supa, now: () => t, gate: { email: "c" }, record: async () => ({}) });
  const sk = await SKIPFN.handler({ httpMethod: "POST", body: JSON.stringify({ client_id: CID, step_id: "m2.plan.rotating_focus", action: "skip", reason: "Client picks their own", month: "2026-12-01" }) });
  if (sk.statusCode !== 200 || DB.cur.T.client_monthly_records.find((x) => x.reporting_month === "2026-12-01").data.tasks["m2.plan.rotating_focus"]?.status !== "skipped") fail(`4 Skip this step must work on Plan the month (got ${sk.statusCode})`);
  if (!STEPS.canSkip("m2.plan.rotating_focus") || !STEPS.noHandDone("m2.plan.rotating_focus")) fail("4 Plan the month can be skipped and has no hand Done");
  if (MS.planView({ record: { tasks: {} }, task: { status: "skipped" } }, {}).state !== "skipped") fail("4 a skipped plan reads skipped");
  // never auto-accepts: nothing in the server ever writes data.plan except the endpoint
  for (const f of ["netlify/functions/_open-month.js", "netlify/functions/_monthly-plan.js", "netlify/functions/_morning-run.js"]) if (/\bplan\s*:\s*\{|\.plan\s*=[^=]|data\.plan\s*=[^=]/.test(read(f).replace(/\/\/.*$/gm, "").replace(/plan_suggestion/g, ""))) fail(`4 ${f} must never write the plan by itself`);
  if (!/Use this plan/.test(read("admin/admin.js")) || !/Change the focus/.test(read("admin/admin.js")) || !/Skip this step/.test(read("admin/admin.js"))) fail("4 the card's three buttons must be in the admin");
}

// 5 tasks_for_month is gone, nothing dangles, no model
{
  const tfm = "m2.plan.tasks_for_month";
  for (const f of ["data/playbooks/playbooks.json", "data/playbooks/what-it-does.json", "shared/monthly-sections.js", "admin/admin.js", "portal/portal.js", "shared/steps-57-64.js", "netlify/functions/_open-month.js", "netlify/functions/flow-execute.js"]) {
    const t = read(f).replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    if (t.includes(tfm)) fail(`5 ${tfm} is still in ${f}`);
  }
  const mjs = fs.readFileSync(path.join(SCR, "flow/playbooks/month2plus.mjs"), "utf8").replace(/\/\/.*$/gm, "");
  if (mjs.includes(tfm)) fail("5 the Scraper playbook still has tasks_for_month");
  if (fs.readFileSync(path.join(SCR, "flow/playbooks/_actor-map.mjs"), "utf8").includes(tfm)) fail("5 the actor map still has tasks_for_month");
  const ids = new Set(ALL.map((s) => s.id));
  for (const s of PB) for (const d of s.dependsOn || []) if (!ids.has(d)) fail(`5 ${s.id} depends on ${d}, which isn't a step`);
  const sec = S.SECTIONS.flatMap((x) => x.ids);
  for (const id of sec) if (!PB.some((s) => s.id === id)) fail(`5 the sections list ${id}, which isn't a Monthly step`);
  for (const s of PB) if (sec.filter((x) => x === s.id).length !== 1) fail(`5 ${s.id} must be in exactly one section`);
  if (S.sectionOf("m2.start.open_month").key !== "m2s-start" || S.sectionOf("m2.plan.rotating_focus").key !== "m2s-start") fail("5 steps 1 and 2 belong to Start of month");
  const plan = PB.find((s) => s.id === "m2.plan.rotating_focus");
  if (JSON.stringify(plan.dependsOn) !== JSON.stringify(["m2.start.open_month"])) fail(`5 Plan the month waits only on Open the month (not on this month's measurements): ${JSON.stringify(plan.dependsOn)}`);
  if (plan.hasRunner || plan.actionLabel) fail("5 Plan the month has no runner and no Run button label");
  const start = S.SECTIONS[0].ids;
  for (const id of start) for (const d of PB.find((s) => s.id === id).dependsOn || []) if (/^m2\.snap\./.test(d)) fail(`5 ${id} in Start of month waits on this month's measurement ${d}`);
  for (const id of ["m2.exec.gbp_posts", "m2.exec.focus_area_work", "m2.exec.blog_posts"]) if (!(PB.find((s) => s.id === id).dependsOn || []).includes("m2.plan.rotating_focus")) fail(`5 ${id} must wait on the plan`);
  const fe = read("netlify/functions/flow-execute.js");
  if (/"m2\.plan\.rotating_focus"\s*:\s*async|"m2\.plan\.tasks_for_month"\s*:\s*async/.test(fe)) fail("5 the model-written runners for the focus and the tasks must be deleted");
  for (const f of ["shared/monthly-start.js", "netlify/functions/_monthly-plan.js", "netlify/functions/admin-monthly-plan.js"]) {
    const t = read(f).replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    if (/aiDraft|anthropic|openai|claude|gpt|generateText/i.test(t) || (!/admin-monthly-plan/.test(f) && /fetch\(/.test(t))) fail(`5 ${f} calls a model or the network`);
  }
  const om = read("netlify/functions/_open-month.js").replace(/\/\/.*$/gm, "");
  if (/aiDraft|anthropic|openai/i.test(om)) fail("5 openMonth must not call a model");
  if (!/focus_area_work[\s\S]{0,900}data\?\.plan/.test(fe)) fail("5 the focus-work step must read the saved plan");
}

// 6 the client portal
{
  if (MS.clientFocus({ plan_suggestion: { focus: "Reviews" } }) !== null) fail("6 the portal must show nothing until a plan is accepted");
  const f = MS.clientFocus({ plan: { focus: "Reviews", tasks: CATALOG.focuses.Reviews.tasks.slice(0, 3) } });
  if (!f || f.title !== "This month's focus: Reviews" || f.items.length !== 3 || f.items[0] !== "We ask your recent customers for a review, a few each week") fail(`6 the portal line and the tasks in client words: ${JSON.stringify(f)}`);
  if (f && f.items.some((x) => /m2\.|RGA's list|Why:/.test(x))) fail("6 the client sees no internals");
  const p = read("portal/portal.js");
  if (!/function ogFocusHtml/.test(p) || !/focusHtml: ogFocusHtml\(currentMonthly\)/.test(p) || !/\$\{focusHtml\}\$\{ogHost\("replies"\)\}/.test(p)) fail("6 the portal's Ongoing work must draw the focus");
  if (!/import "\/shared\/monthly-start\.js\?v=/.test(p)) fail("6 the portal must load shared/monthly-start.js");
}

// 7 the Monthly checklist: each step opens by its own dependencies
{
  const a = read("admin/admin.js"), at = a.indexOf("for (const i of visit) {"), end = a.indexOf("  return steps;", at);
  if (at < 0 || end < 0) { console.error("⚠️  INDETERMINATE — the uiState loop moved"); process.exit(2); }
  const loop = a.slice(at, end);
  if (!/scope === "month2plus"\) \{ s\.uiState = "active"; continue; \}/.test(loop) || loop.indexOf('scope === "month2plus"') > loop.indexOf("if (!seenActive)")) fail("7 the loop must open every unlocked Monthly step before the one-at-a-time pointer");
  const fn = new Function("scope", "steps", "visit", "CLIENT_GBP_STEPS", "PHOTO_REVIEW_STEP", "DUP_STEP", "state", "wcAutoMove", `let seenActive = false; const dupWaitsOnGoogle = false;\n${loop}\nreturn steps;`);
  const mk = () => [{ obj: { flowId: "a" } }, { obj: { flowId: "b" } }, { obj: { flowId: "c" }, locked: true }, { obj: { flowId: "d" }, done: true }];
  const m2 = fn("month2plus", mk(), [0, 1, 2, 3], {}, "", "", { onboardingData: {} }, () => null).map((s) => s.uiState);
  if (m2.join() !== "active,active,locked,done") fail(`7 in a month two independent steps must both be open: ${m2}`);
  const m1 = fn("month1", mk(), [0, 1, 2, 3], {}, "", "", { onboardingData: {} }, () => null).map((s) => s.uiState);
  if (m1.join() !== "active,queued,locked,done") fail(`7 Month 1 must still open one step at a time: ${m1}`);
  // "When it moves" never says "after another step" for a monthly row
  const rows = STEPS.basicRows({ id: "m2.exec.gbp_posts", dependsOn: ["m2.plan.rotating_focus"], instructions: "x" }, { tasks: { "m2.plan.rotating_focus": { status: "done" } }, activeId: null, owner: "rga" });
  const line = rows[rows.length - 1].line;
  if (/one step at a time|next after/.test(line) || !/open now/.test(line)) fail(`7 a scheduled Monthly step must say it is open now: ${line}`);
  const rows2 = STEPS.basicRows({ id: "m2.exec.focus_area_work", dependsOn: ["m2.plan.rotating_focus"], instructions: "x" }, { tasks: {}, activeId: null, owner: "rga", ref: () => "step 2" });
  if (!/Waits on step 2/.test(rows2[rows2.length - 1].line)) fail("7 a step whose dependency isn't settled must say what it waits on");
  const rows3 = STEPS.basicRows({ id: "m1.web.x", dependsOn: [], instructions: "x" }, { tasks: {}, activeId: "m1.other", owner: "rga", ref: () => "step 4" });
  if (!/one step at a time/.test(rows3[rows3.length - 1].line)) fail("7 Month 1 keeps its 'one step at a time' line");
  if (!/activeId: scope === "month2plus" \? null/.test(a)) fail("7 the Monthly basics card must not be given a global active step");
}

// 8 wiring
{
  const a = read("admin/admin.js");
  for (const id of ["m2.start.open_month", "m2.plan.rotating_focus"]) {
    const own = (a.match(/const UNI_OWN_CARD = new Set\(\[([^\]]*)\]/) || [])[1] || "";
    if (!own.includes(id)) fail(`8 ${id} must draw its own card (UNI_OWN_CARD)`);
    if (!new RegExp(`id === "${id.replace(/\./g, "\\.")}" \\? monthly(Open|Plan)CardHtml`).test(a)) fail(`8 ${id}'s card is not wired into rowStepCardsHtml`);
    if (!new RegExp(`id === "${id.replace(/\./g, "\\.")}"`).test((a.match(/const uniNoRowRun[^\n]*/) || [""])[0])) fail(`8 ${id} must have no Run button`);
  }
  if (!/import "\/shared\/monthly-start\.js\?v=/.test(a)) fail("8 the admin must load shared/monthly-start.js");
  if (!/admin-monthly-plan/.test(a)) fail("8 the admin must call admin-monthly-plan");
  const html = read("admin/index.html"), ver = (a.match(/shared\/monthly-sections\.js\?v=(\w+)/) || [])[1];
  if (!/admin\.js\?v=20261109p/.test(html) || ver !== "20261109b") fail("8 the ?v= keys for admin.js and the sections module were not bumped");
  if (!/portal\.js\?v=20261109i/.test(read("portal/index.html"))) fail("8 the ?v= key for portal.js was not bumped");
  const mr = read("netlify/functions/_morning-run.js");
  if (!/month_open_error/.test(mr) || !/by: "the morning run"/.test(mr)) fail("8 the morning run must say who opened the month and keep why it couldn't");
  if (!/month_open_error/.test(a)) fail("8 the open card must read why the month couldn't open");
}

if (F.length) { console.error(`🔴 check-monthly-start: ${F.length} problem(s)\n - ${F.join("\n - ")}`); process.exit(1); }
console.log("✅ check-monthly-start: the rule, the tasks, the open-the-month card, Use this plan (read back), the done card, tasks_for_month gone, no model, the portal line and the monthly queue all hold");
