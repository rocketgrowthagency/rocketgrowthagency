#!/usr/bin/env node
// check-the-mature-stage-reads-what-is-measured.mjs — batch 5 (approved step mockups m6-1..14, 2026-10-19).
// The Mature checklist's 14 states are COMPUTED by _mature.js from client_mature_records + measurements, and its
// actions are the only writers. RUNS the real engine on fake data + fake deps (no database, no AI, no email):
//   · nothing is Done without the record / measurement behind it; one bad month is not an alert; a client who isn't
//     Mature gets nothing; an email only goes from an explicit action and is recorded only when it sent; a page is
//     "live" only when it loads; a case study never goes ahead without permission; keyword growth is capped.
//   exit 0 holds · 1 broke · 2 harness
import fs from "node:fs";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FNS = `${SITE}/netlify/functions`;
const req = createRequire(`${FNS}/x.js`);
const FNS_REAL = fs.realpathSync(FNS);
const F = [], fail = (m) => F.push(m);
let M; try { M = req("./_mature.js"); } catch (e) { console.error(`harness: ${e.message}`); process.exit(2); }
const now = new Date("2026-11-05T12:00:00Z");
const month = (ym, o) => ({ reporting_month: `${ym}-01`, ...o });
const GOOD = [month("2026-11", { gbp_calls: 20, ranking_position: 2, new_reviews: 3, closed_jobs: 30 }), month("2026-10", { gbp_calls: 19, ranking_position: 2 }), month("2026-09", { gbp_calls: 18, ranking_position: 3 })];
const client = { id: "c1", business_name: "Acme", primary_service: "plumbing", secondary_services: ["drain cleaning"], primary_market: "Austin, TX", primary_contact_email: "o@acme.test", geography_model: "service_area", kpi_config: {}, client_portal_stage: "stage_6_mature" };
const st = (ctx, id) => M.stepStates({ now, client, months: GOOD, records: [], ...ctx }).find((s) => s.id === id);
function world(records = []) {
  const w = { records: records.map((r) => ({ created_at: now.toISOString(), updated_at: now.toISOString(), ...r })), sent: [], acts: [], notes: [], onb: {}, live: new Set(["https://acme.test/tankless"]) };
  w.deps = {
    upsert: async (kind, period, patch) => { const i = w.records.findIndex((r) => r.kind === kind && r.period === period); const row = { ...(i >= 0 ? w.records[i] : { kind, period, created_at: now.toISOString() }), ...patch, updated_at: now.toISOString() }; if (i >= 0) w.records[i] = row; else w.records.push(row); return row; },
    ai: async (sys) => (/JSON array/.test(sys) ? '["tankless water heater install", "plumbing"]' : "Calls rose this quarter.\n\nNEXT QUARTER\n- More reviews."),
    sendEmail: async (m) => { if (w.emailFails) return { ok: false, error: "cap" }; w.sent.push(m); return { ok: true, id: "gm1" }; },
    activity: async (kind, p) => { w.acts.push({ kind, p }); }, note: async (cat, t) => { w.notes.push({ cat, t }); },
    saveOnb: async (p) => { w.onb = { ...w.onb, ...p }; }, urlLive: async (u) => w.live.has(u),
  };
  w.ctx = (o = {}) => ({ now, client, months: GOOD, records: w.records, onb: w.onb, planKeywords: ["plumbing"], ...o });
  w.act = (a, v = null, i = null, o) => M.act(w.ctx(o), w.deps, a, v, i);
  return w;
}
// ── 1 · quarterly review: locked < 3 months; generate → draft (not done); send → email + sent; failed email → not sent ──
{ const s = st({ months: GOOD.slice(0, 2) }, "m6.strategy.quarterly_review"); if (s.state !== "locked" || s.done) fail("1 · the review opens with fewer than 3 months of data"); }
{ const w = world(); let r = await w.act("generate_review");
  if (!r.ok || w.records.find((x) => x.kind === "quarterly_review")?.status !== "draft") fail("1 · generating doesn't store a draft");
  if (M.stepStates(w.ctx()).find((s) => s.n === 1).done) fail("1 · a DRAFT review reads as done");
  w.emailFails = true; r = await w.act("send_review");
  if (r.ok || w.records.find((x) => x.kind === "quarterly_review").status === "sent") fail("1 · a review whose email failed is marked sent");
  w.emailFails = false; r = await w.act("send_review");
  const q = w.records.find((x) => x.kind === "quarterly_review");
  if (!r.ok || q.status !== "sent" || !q.sent_at || w.sent.length !== 1) fail("1 · sending doesn't email once and record it sent");
  if (!M.stepStates(w.ctx()).find((s) => s.n === 1).done) fail("1 · a sent review isn't done");
  await w.act("send_review"); if (w.sent.length !== 1) fail("1 · pressing Send twice emails twice"); }
// ── 2 · keywords: never re-proposes a tracked one; capped at 2 extra; approval feeds the tracked set ──
{ const w = world(); await w.act("propose_keywords");
  const p = w.records.find((x) => x.kind === "keyword_proposal");
  if (!p || p.data.proposed.includes("plumbing")) fail("2 · an already-tracked keyword is proposed again");
  await w.act("approve_keyword", "tankless water heater install");
  if (!(w.onb.mature_keywords || []).includes("tankless water heater install")) fail("2 · an approved keyword isn't added to the tracked set");
  const w2 = world([{ kind: "keyword_proposal", period: "2026-Q4", status: "proposed", data: { proposed: ["a", "b", "c"], approved: [], declined: [] } }]); w2.onb = { mature_keywords: ["x", "y"] };
  const r = await w2.act("approve_keyword", "a"); if (r.ok) fail("2 · a third expansion keyword is accepted (each is a monthly grid scan — capped at 2)"); }
// ── 3 · service area: never for a storefront ──
{ const s = M.stepStates({ now, client: { ...client, geography_model: "single_location" }, months: GOOD, records: [] }).find((x) => x.n === 3);
  if (s.state !== "na" || (s.actions || []).length) fail("3 · a storefront business is offered a service-area expansion"); }
// ── 4/5 · thresholds + alert: one bad month is noise, two is an alert; never emails the client ──
const BAD2 = [month("2026-11", { gbp_calls: 10 }), month("2026-10", { gbp_calls: 14 }), month("2026-09", { gbp_calls: 20 })];
const BAD1 = [month("2026-11", { gbp_calls: 10 }), month("2026-10", { gbp_calls: 20 }), month("2026-09", { gbp_calls: 20 })];
const TH = [{ kind: "kpi_thresholds", period: "ongoing", status: "done", data: { thresholds: M.defaultThresholds(client) } }];
{ if (st({ months: BAD2, records: [] }, "m6.kpi.alert_monitor").state !== "locked") fail("5 · alerts run before any threshold is set");
  if (st({ months: BAD1, records: TH }, "m6.kpi.alert_monitor").state === "bad") fail("5 · ONE bad month raises an alert (needs two running)");
  if (st({ months: BAD2, records: TH }, "m6.kpi.alert_monitor").state !== "bad") fail("5 · two months past the threshold don't raise an alert");
  const w = world(TH); const r = await w.act("tell_client", null, "Calls dipped — we're on it.", { months: BAD2 });
  if (!r.ok || w.sent.length || !w.acts.some((a) => a.kind === "rga_note_to_client")) fail("5 · telling the client sends an email (must be an activity note only)"); }
if (M.breaches({ drop: 20 }, null, 10) !== null) fail("5 · a missing value is read as 'no breach' instead of unknown");
// ── 6 · review target scales with closed jobs ──
{ const s = st({}, "m6.kpi.review_velocity_target"); if (!/3 a month from 30 closed jobs/.test((s.body || []).join(" "))) fail(`6 · the target isn't scaled to closed jobs (${(s.body || []).join(" ")})`); }
// ── 7/10 · "live" means it loads; no case study without permission ──
{ const w = world([{ kind: "keyword_proposal", period: "2026-Q4", status: "approved", data: { proposed: ["tankless"], approved: ["tankless"], declined: [] } }]);
  let r = await w.act("page_live", "keyword:tankless", "https://acme.test/missing"); if (r.ok) fail("7 · a page that doesn't load is marked live");
  r = await w.act("page_live", "keyword:tankless", "https://acme.test/tankless"); if (!r.ok || !M.stepStates(w.ctx()).find((s) => s.n === 7).done) fail("7 · a page that loads doesn't finish the step");
  const w2 = world(); await w2.act("record_story", null, "Sam B. · fixed a leak · dry basement · permission ask");
  r = await w2.act("draft_case_study"); if (r.ok) fail("10 · a case study is drafted without the client's permission");
  if (M.stepStates(w2.ctx()).find((s) => s.n === 10).small !== "Permission unclear") fail("10 · unclear permission isn't called out"); }
// ── 11/12/13/14 ──
{ if (st({}, "m6.reputation.referral_ask").state !== "wait") fail("11 · a referral ask is offered with no trust moment");
  const w = world(); const r = await w.act("log_checkin", null, ""); if (r.ok) fail("12 · an empty check-in is logged");
  if (st({}, "m6.account.checkin").state === "bad") fail("12 · a newly Mature client reads as overdue on a check-in they couldn't have had");
  const top = [month("2026-11", { ranking_position: 1 }), month("2026-10", { ranking_position: 2 }), month("2026-09", { ranking_position: 3 })];
  if (st({ months: top }, "m6.account.upsell_opportunity").state !== "you") fail("13 · 3 months in the top 3 doesn't flag an upsell");
  if (st({ months: [month("2026-11", { ranking_position: 1 }), month("2026-10", { ranking_position: 5 }), month("2026-09", { ranking_position: 1 })] }, "m6.account.upsell_opportunity").state === "you") fail("13 · an upsell flags without 3 straight top-3 months");
  if (st({ lastLoginAt: new Date(now - 40 * 86400000).toISOString() }, "m6.account.churn_risk_signal").state === "bad") fail("14 · ONE signal raises a churn flag (needs two)");
  if (st({ months: BAD2, records: TH, lastLoginAt: new Date(now - 40 * 86400000).toISOString() }, "m6.account.churn_risk_signal").state !== "bad") fail("14 · two signals at once don't raise a churn flag"); }
// ── unknowns stay unknown (found 10-19 by running the engine on production data) ──
{ const s14 = st({ lastLoginAt: null }, "m6.account.churn_risk_signal");
  if ((s14.body || []).some((b) => /recent portal visits|Portal visited/i.test(b)) || !(s14.body || []).some((b) => /not recorded/.test(b))) fail("14 · an unrecorded portal login is reported as recent visits");
  if (st({ months: [] }, "m6.strategy.service_area_expansion").state !== "locked") fail("3 · an area is proposed before any grid data exists"); }
// ── every step is present and none is "done" without a state that says so ──
{ const all = M.stepStates({ now, client, months: [], records: [] });
  if (all.length !== 14 || all.some((s) => !s || !s.state)) fail("every one of the 14 steps must have a computed state");
  for (const s of all) if (s.done && !["ok", "na"].includes(s.state)) fail(`${s.id} is done in state "${s.state}"`); }
// ── the functions: only Mature clients; the portal sees only SENT reviews ──
const src = (p) => fs.readFileSync(`${SITE}/${p}`, "utf8");
const adm = src("netlify/functions/admin-mature.js"), por = src("netlify/functions/portal-mature.js"), sql = src("docs/supabase/RGA_MATURE_RECORDS_2026-10-19.sql");
if (!/if \(!mature\) return json\(409/.test(adm) || !/steps: mature \? M\.stepStates\(ctx\) : \[\]/.test(adm)) fail("admin-mature acts for (or shows steps to) a client who isn't Mature");
if (!/requireWorkspaceForClient\(event, clientId\)/.test(adm)) fail("admin-mature isn't workspace-gated");
if (!/kind=eq\.quarterly_review&status=eq\.sent/.test(por) || !/requirePortalOwner\(event, clientId\)/.test(por)) fail("portal-mature can show a DRAFT review, or isn't owner-gated");
if (!/unique \(client_id, kind, period\)/.test(sql) || !/enable row level security/.test(sql)) fail("the Mature records table lost its one-row-per-period key or its RLS");
const admin = src("admin/admin.js");
if (!/if \(c\.client_portal_stage !== "stage_6_mature"\) \{ host\.innerHTML = ""; return; \}/.test(admin)) fail("the admin shows the Mature checklist to a client who isn't Mature");
if (F.length) { console.error("🔴 the Mature stage can claim what isn't measured:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ Mature: 14 computed states · review draft ≠ done, sent only when emailed, never twice · keywords capped at 2 · no area for storefronts · alerts need 2 months · client told by note, never auto-email · pages live only when they load · no case study without permission · stage-6 only");
