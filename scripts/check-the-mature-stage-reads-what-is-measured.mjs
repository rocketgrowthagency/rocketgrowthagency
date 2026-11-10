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
// google_30_day_part_b_v1: the Google KPIs (call taps, review count) are judged on a LIVE reading, never on stored months (they are gone after 30 days).
const LIVE = (calls, status = "ok", reviews = [20, 20, 20]) => ({ gbp_calls: calls.map((value) => ({ value: status === "ok" ? value : null, status })), review_count: reviews.map((value) => ({ value: status === "ok" ? value : null, status })) });
const TH = [{ kind: "kpi_thresholds", period: "ongoing", status: "done", data: { thresholds: M.defaultThresholds(client) } }];
{ if (st({ months: BAD2, records: [] }, "m6.kpi.alert_monitor").state !== "locked") fail("5 · alerts run before any threshold is set");
  if (st({ months: BAD1, records: TH, googleLive: LIVE([10, 20, 20]) }, "m6.kpi.alert_monitor").state === "bad") fail("5 · ONE bad month raises an alert (needs two running)");
  if (st({ months: BAD2, records: TH, googleLive: LIVE([10, 14, 20]) }, "m6.kpi.alert_monitor").state !== "bad") fail("5 · two months past the threshold don't raise an alert");
  // a Google number that could not be read live is "couldn't check": never an alert, never "fine"
  for (const status of ["could_not_read", "disconnected", "not_kept"]) {
    const x = st({ months: BAD2, records: TH, googleLive: LIVE([10, 14, 20], status) }, "m6.kpi.alert_monitor");
    if (x.state === "bad") fail(`5 · an alert fired on a Google reading that was ${status}`);
    if (x.state === "ok" || !/couldn't|could not|Couldn't/.test(JSON.stringify(x))) fail(`5 · a Google reading that was ${status} reads as a clean check instead of 'couldn't check'`);
  }
  if (st({ months: BAD2, records: TH }, "m6.kpi.alert_monitor").state === "bad") fail("5 · with no live reading at all, stored months raised a Google alert");
  if (st({ months: GOOD, records: TH, googleLive: LIVE([10, 14, 20]) }, "m6.kpi.alert_monitor").state !== "bad") fail("5 · the alert reads stored months instead of the live reading");
  { const OKM = st({ months: GOOD, records: TH, googleLive: LIVE([20, 19, 18]) }, "m6.kpi.alert_monitor"); if (OKM.state !== "ok") fail(`5 · a clean live reading doesn't read as no breach (${OKM.state})`); }
  const w = world(TH); const r = await w.act("tell_client", null, "Calls dipped — we're on it.", { months: BAD2, googleLive: LIVE([10, 14, 20]) });
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
{ const NO_RESULT = GOOD.map((m) => ({ ...m, new_reviews: null }));   // good months, but no review came in: no result, no ask
  if (st({ months: NO_RESULT }, "m6.reputation.referral_ask").state !== "wait") fail("11 · a referral ask is offered with no trust moment");
  // onboarding_and_offboarding_v1 item 6 (11-01): the FIRST REAL RESULT is a trust moment too, and only a measured one
  if (st({ months: GOOD }, "m6.reputation.referral_ask").state !== "you") fail("11 · a new Google review (the first real result) doesn't open the referral ask");
  if (st({ months: NO_RESULT.map((m) => ({ ...m, new_reviews: 0 })) }, "m6.reputation.referral_ask").state !== "wait") fail("11 · zero new reviews opens the referral ask");
  if (st({ months: NO_RESULT, onb: { tasks: { "m1.gbp.business_facts": { status: "done", google_push: { state: "on_google" } } } } }, "m6.reputation.referral_ask").state !== "you") fail("11 · a profile change live on Google doesn't open the referral ask");
  if (st({ months: NO_RESULT, onb: { tasks: { "m1.gbp.business_facts": { status: "done", google_push: { state: "pending" } } } } }, "m6.reputation.referral_ask").state !== "wait") fail("11 · a profile change that is not yet live on Google opens the referral ask");
  if (st({ months: GOOD, records: [{ kind: "referral_ask", period: "2026-Q4", status: "sent", sent_at: "2026-11-01T00:00:00Z" }] }, "m6.reputation.referral_ask").done !== true) fail("11 · the one-a-quarter limit no longer holds");
  { const w = world(); const r = await w.act("send_referral", null, null, { months: NO_RESULT }); if (r.ok || w.sent.length) fail("11 · the server sends a referral ask when there is no result to ask about"); }
  // the monthly call outcome feeds the churn read: At risk is one warning sign, never a flag by itself
  { const callAtRisk = GOOD.map((m, i) => (i === 0 ? { ...m, data: { tasks: { "m2.call.monthly": { call_outcome: "at_risk" } } } } : m));
    const s = st({ months: callAtRisk }, "m6.account.churn_risk_signal");
    if (s.state === "bad") fail("14 · one noted at-risk call raises a churn flag by itself (needs two signals)");
    if (!JSON.stringify(s.body).includes("at risk")) fail("14 · the at-risk call outcome isn't counted as a warning sign");
    if (st({ months: callAtRisk, lastLoginAt: new Date(now - 40 * 86400000).toISOString() }, "m6.account.churn_risk_signal").state !== "bad") fail("14 · an at-risk call plus a missed portal visit don't raise the flag"); }
  const w = world(); const r = await w.act("log_checkin", null, ""); if (r.ok) fail("12 · an empty check-in is logged");
  if (st({}, "m6.account.checkin").state === "bad") fail("12 · a newly Mature client reads as overdue on a check-in they couldn't have had");
  const top = [month("2026-11", { ranking_position: 1 }), month("2026-10", { ranking_position: 2 }), month("2026-09", { ranking_position: 3 })];
  if (st({ months: top }, "m6.account.upsell_opportunity").state !== "you") fail("13 · 3 months in the top 3 doesn't flag an upsell");
  if (st({ months: [month("2026-11", { ranking_position: 1 }), month("2026-10", { ranking_position: 5 }), month("2026-09", { ranking_position: 1 })] }, "m6.account.upsell_opportunity").state === "you") fail("13 · an upsell flags without 3 straight top-3 months");
  if (st({ lastLoginAt: new Date(now - 40 * 86400000).toISOString() }, "m6.account.churn_risk_signal").state === "bad") fail("14 · ONE signal raises a churn flag (needs two)");
  if (st({ months: BAD2, records: TH, googleLive: LIVE([10, 14, 20]), lastLoginAt: new Date(now - 40 * 86400000).toISOString() }, "m6.account.churn_risk_signal").state !== "bad") fail("14 · two signals at once don't raise a churn flag"); }
// ── unknowns stay unknown (found 10-19 by running the engine on production data) ──
{ const s14 = st({ lastLoginAt: null }, "m6.account.churn_risk_signal");
  if ((s14.body || []).some((b) => /recent portal visits|Portal visited/i.test(b)) || !(s14.body || []).some((b) => /not recorded/.test(b))) fail("14 · an unrecorded portal login is reported as recent visits");
  if (st({ months: [] }, "m6.strategy.service_area_expansion").state !== "locked") fail("3 · an area is proposed before any grid data exists"); }
// ── research §2 · service areas: rank comes from the pin; propose only a measured frontier ──
const gridOf = (rankAt) => { const pts = []; for (let r = 0; r < 5; r++) for (let c2 = 0; c2 < 5; c2++) pts.push({ lat: 30 + (2 - r) * 0.02, lng: -97 + (c2 - 2) * 0.02, rank: rankAt(r, c2) }); return { keyword: "plumber", points: pts }; };
const inner = (r, c2) => Math.abs(r - 2) <= 1 && Math.abs(c2 - 2) <= 1;
const STRONG_EAST = gridOf((r, c2) => (inner(r, c2) ? 2 : c2 === 4 ? 6 : null));
{ if (st({ grid: null }, "m6.strategy.service_area_expansion").state !== "locked") fail("3 · an area is proposed with no grid scan");
  { const g = st({ grid: gridOf((r, c2) => (c2 === 4 ? 6 : null)) }, "m6.strategy.service_area_expansion");   // an edge exists, but the home ring is weak
    if (g.state !== "wait" || !/Home area first/.test(g.small)) fail("3 · expansion is offered while the home area isn't top 3 (research rule 2.5)"); }
  { const g = st({ grid: gridOf(() => 1) }, "m6.strategy.service_area_expansion"); if (g.state !== "wait" || !/whole grid/.test(g.small)) fail("3 · an all-green grid isn't told to widen the scan (no visible edge — rule 2.6)"); }
  const s3 = st({ grid: STRONG_EAST, areasNow: ["Austin, TX, USA"] }, "m6.strategy.service_area_expansion");
  if (s3.state !== "you" || !/east/.test(s3.small)) fail(`3 · a measured edge (rank 4–10 next to the top-3 home) isn't offered (${s3.state} ${s3.small})`);
  if (st({ grid: STRONG_EAST, areasNow: Array.from({ length: 20 }, (_, i) => `Town ${i}`) }, "m6.strategy.service_area_expansion").state !== "wait") fail("3 · a 21st service area is proposed (Google allows 20)");
  { const w0 = world(); const r0 = await w0.act("propose_area", null, "Bastrop", { grid: null }); if (r0.ok || w0.records.length) fail("3 · an area is proposed with no measured edge behind it"); }
  const w = world(); const r = await w.act("propose_area", null, "Bastrop", { grid: STRONG_EAST, areasNow: [] });
  const p = w.records.find((x) => x.kind === "area_proposal");
  if (!r.ok || !p || p.data.striking < 2 || !p.data.sector) fail("3 · a proposal doesn't carry its measured evidence (sector, points at 4–10)");
  const all = M.stepStates({ now, client, months: GOOD, records: w.records, grid: STRONG_EAST, areasNow: [] }).find((x) => x.n === 3);
  const words = [all.head, ...(all.body || [])].join(" ");
  if (/service area[^.]*\b(rank|ranking)s? (higher|better|up)|boost(s)? (your )?rank/i.test(words) || !/doesn't rank on that setting/.test(words)) fail("3 · the copy implies adding a service area improves rank (it doesn't — rule 2.1)"); }
// ── research §3 · city pages: proof first, never an office, checked live ──
{ const w = world([{ kind: "area_proposal", period: "2026-Q4", status: "approved", data: { place: "Bastrop" } }]);
  let r = await w.act("page_draft", "area:Bastrop"); if (r.ok) fail("7 · a city page is drafted with no local proof (rule 3.5)");
  await w.act("page_proof", "area:Bastrop", "Fixed a burst pipe on Main St, Bastrop, in September");
  r = await w.act("page_draft", "area:Bastrop"); if (!r.ok) fail(`7 · a city page with proof isn't drafted (${r.error})`);
  w.live.add("https://acme.test/bastrop");
  w.deps.pageHtml = async () => "<h1>Plumbing in Bastrop</h1><p>Visit our office in Bastrop.</p>";
  r = await w.act("page_live", "area:Bastrop", "https://acme.test/bastrop"); if (r.ok) fail("7 · a live page that implies an office in the city is accepted (rule 3.8)");
  w.deps.pageHtml = async () => '<h1>Plumbing in Bastrop</h1><script type="application/ld+json">{"@type":"AggregateRating"}</script>';
  r = await w.act("page_live", "area:Bastrop", "https://acme.test/bastrop"); if (r.ok) fail("7 · a live page marking up its own review stars is accepted (rule 3.14)");
  w.deps.pageHtml = async () => "<h1>Plumbing in Bastrop</h1><p>We serve Bastrop from our Austin base. Call us.</p>";
  r = await w.act("page_live", "area:Bastrop", "https://acme.test/bastrop"); if (!r.ok) fail(`7 · an honest live city page isn't accepted (${r.error})`); }
{ const many = Array.from({ length: 7 }, (_, i) => ({ kind: "area_proposal", period: `2026-Q${i}`, status: "approved", data: { place: `Town${i}` } }));
  const s7 = M.stepStates({ now, client, months: GOOD, records: many }).find((x) => x.n === 7);
  if ((s7.actions || []).length > 5 || !/more wait/.test((s7.body || []).join(" "))) fail("7 · more than 5 pages are put in flight at once (rule 3.13)"); }
// ── research §1 · the Month 1 report ──
{ let R; try { R = req("./_month1-report.js"); } catch (e) { fail(`month 1 · the report builder won't load (${e.message})`); }
  if (R) { const t = { "m1.kickoff.call": { status: "done", completed_at: "2026-10-09T00:00:00Z" }, "m1.gbp.hours_attributes": { status: "done", completed_at: "2026-10-16T00:00:00Z" }, "m1.access.gbp": { status: "done", completed_at: "2026-10-01T00:00:00Z" } };
    const pb = [{ id: "m1.gbp.hours_attributes", title: "Confirm hours" }, { id: "m1.access.gbp", title: "Get GBP manager access" }];
    const mk = (ym, o) => ({ reporting_month: `${ym}-01`, ...o });
    const rep = R.buildMonth1Report({ client: { business_name: "Acme", geography_model: "service_area" }, tasks: t, playbook: pb, months: [mk("2026-10", { gbp_calls: 9 }), mk("2026-09", { gbp_calls: 4 })], baseline: { reviews: 3, captured_at: "2026-09-15T00:00:00Z" }, kickoffAt: "2026-10-09T00:00:00Z", now: new Date("2026-10-20T00:00:00Z") });
    const txt = rep.text;
    if (rep.sections.map((x) => x.key).join(",") !== "summary,work,baseline,compare,next,defs") fail("month 1 · the six sections aren't all there, in order (rule 1.1)");
    if (rep.comparisons.some((x) => x.toYm === "2026-10")) fail("month 1 · a PART month (October, in progress) is compared (rule 1.3)");
    if (!/period incomplete|next report/.test(txt)) fail("month 1 · an incomplete period isn't called out");
    if (/Get GBP manager access/.test(txt)) fail("month 1 · access logistics are listed as work done");
    if (((rep.items && rep.items.done) || []).some((d) => /^m1\.access\./.test(d.id)) || (rep.sections.find((x) => x.key === "work") || { lines: [] }).lines.some((l) => /access/i.test(l))) fail("month 1 · access logistics are listed as work done (in the client's words)");
    if (!/Call-button taps/.test(txt) || /\bleads?\b[^.]*website clicks|website clicks[^.]*are leads/i.test(txt)) fail("month 1 · calls aren't labelled as taps / clicks read as leads (rule 1.5)");
    if (/Direction requests/.test(txt)) fail("month 1 · directions are shown for a hidden-address business (rule 1.7)");
    if (R.FORBIDDEN.test(txt) || !R.FORBIDDEN.test("we improved your calls")) fail("month 1 · credit-taking / promise language isn't caught (rules 1.14–1.15)");
    const rep2 = R.buildMonth1Report({ client: { business_name: "Acme" }, tasks: t, playbook: pb, months: [mk("2026-11", { gbp_calls: 9 }), mk("2026-10", { gbp_calls: 4 }), mk("2026-09", { gbp_calls: 2 })], baseline: {}, kickoffAt: "2026-10-09T00:00:00Z", now: new Date("2026-12-02T00:00:00Z") });
    if (!rep2.comparisons.some((x) => x.fromYm === "2026-09" && x.toYm === "2026-11")) fail("month 1 · two COMPLETE months (before the work → latest full month) aren't compared");
    if (!rep2.comparisons.some((x) => /^Call-button taps/.test(x.label))) fail("month 1 · a compared calls figure isn't labelled as call-button taps (rule 1.5)");
    const rep3 = R.buildMonth1Report({ client: { business_name: "Acme", geography_model: "service_area" }, tasks: t, playbook: pb, months: [mk("2026-11", { gbp_directions: 3 }), mk("2026-09", { gbp_directions: 1 })], baseline: {}, kickoffAt: "2026-10-09T00:00:00Z", now: new Date("2026-12-02T00:00:00Z") });
    if (rep3.comparisons.some((x) => /Direction/.test(x.label))) fail("month 1 · directions are compared for a hidden-address business (rule 1.7)"); } }
// ── every step is present and none is "done" without a state that says so ──
{ const all = M.stepStates({ now, client, months: [], records: [] });
  if (all.length !== 14 || all.some((s) => !s || !s.state)) fail("every one of the 14 steps must have a computed state");
  for (const s of all) if (s.done && !["ok", "na"].includes(s.state)) fail(`${s.id} is done in state "${s.state}"`); }
// ── the functions: only Mature clients; the portal sees only SENT reviews ──
const src = (p) => fs.readFileSync(`${SITE}/${p}`, "utf8");
const adm = src("netlify/functions/admin-mature.js"), por = src("netlify/functions/portal-mature.js"), sql = src("docs/supabase/RGA_MATURE_RECORDS_2026-10-19.sql");
if (!/if \(!mature && String\(body\.action \|\| ""\) !== "send_referral"\) return json\(409/.test(adm) || !/steps: mature \? M\.stepStates\(ctx\) : \[\]/.test(adm)) fail("admin-mature acts for (or shows steps to) a client who isn't Mature");
if (!/requireWorkspaceForClient\(event, clientId\)/.test(adm)) fail("admin-mature isn't workspace-gated");
if (!/kind=eq\.quarterly_review&status=eq\.sent/.test(por) || !/const auth = await requirePortalOwnerOrWorkspace\(event, clientId\);\s*if \(auth\.error\) return auth\.error;/.test(por)) fail("portal-mature can show a DRAFT review, or isn't gated to the client + their RGA workspace");
// 10-20 (walk): admin renders the client's portal AS ITSELF — an owner-only read 403s on admin's Onboarding tab
if (/requirePortalOwner\(event, clientId\)/.test(por)) fail("portal-mature is owner-only again: admin's view of the client's portal gets a 403");
if (!/unique \(client_id, kind, period\)/.test(sql) || !/enable row level security/.test(sql)) fail("the Mature records table lost its one-row-per-period key or its RLS");
const admin = src("admin/admin.js");
if (!/if \(c\.client_portal_stage !== "stage_6_mature"\) \{ host\.innerHTML = ""; return; \}/.test(admin)) fail("the admin shows the Mature checklist to a client who isn't Mature");
if (F.length) { console.error("🔴 the Mature stage can claim what isn't measured:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ Mature: 14 computed states · review draft ≠ done, sent only when emailed, never twice · keywords capped at 2 · no area for storefronts · alerts need 2 months · client told by note, never auto-email · pages live only when they load · no case study without permission · stage-6 only");
