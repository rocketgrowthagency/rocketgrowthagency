#!/usr/bin/env node
// check-the-mature-stage-reads-what-is-measured.mjs — the Mature stage's RULES, re-aimed at their new home (mature_account_health_v1, the owner 11-10).
// WAS: batch 5 (approved step mockups m6-1..14, 2026-10-19): the Mature checklist's 14 states COMPUTED by _mature.js, its actions the only writers.
// NOW: the 14 hand-pressed steps are gone (the Mature stage is a label, "Full Dashboard"). Their four worth-keeping ideas live in the Monthly as Account health (28 churn risk, 29 upsell,
// 30 referral ask) and three steps added to every quarter (31 quarterly letter, 32 grow the plan, 33 AI search check): shared/monthly-health.js (the rules) and
// netlify/functions/_monthly-health.js (the reads and presses). EVERY OLD RULE KEEPS ITS EVIDENCE below, aimed at the new code (a dropped rule says so, and why). Runs the SHIPPED code on fake
// data + fake deps (no database, no AI, no email, no Google):
//   · nothing is Done without the record / measurement behind it; one bad month is not a decline (two WHOLE frozen months running); a missing number is unknown, never 0, never a decline;
//     an email goes only from the referral press, to the address the person confirmed, and is recorded only when it sent; keyword growth is capped at 2; no area for a storefront;
//     the quarterly letter rides inside the one report, never as a second email.
//   The structural side (what must be gone, the numbering, the wiring) is check-account-health.mjs; this file holds the rule evidence and the Month 1 report rules it always carried.
//   exit 0 holds · 1 broke · 2 harness
// DROPPED ON PURPOSE (the approved mockup, section D): 4 KPI thresholds (one default per number, no setup step) · 6 review pace target (repeats Review asks; needed a job count nobody fills) ·
// 7 new service/location page (a page from an approved search is focus work) · 9 competitive position (inside the quarterly letter) · 10 case study (the win story the client said yes to) ·
// 12 half-year check-in (the monthly call in months 6 and 12).
import fs from "node:fs";
import { SITE, H, MS, MH, MR, load, world, row, frozen, frozenRows, addM, CID, read } from "./_account-health-world.mjs";

const F = [], fail = (m) => F.push(m);
const req = (p) => load(p);
const M = (n) => `2026-${String(n).padStart(2, "0")}-01`;
let MAT; try { MAT = load("./_mature.js"); } catch (e) { console.error(`harness: ${e.message}`); process.exit(2); }
const NOW = "2026-05-10T12:00:00Z", cur = M(5);
const decl = (clicks) => frozenRows(M(4), clicks.map((c) => ({ views: 400, calls: 30, clicks: c })));
const settleAndRead = async (w, month = cur) => { await MH.settle({ clientId: CID, month, deps: w.d }); const d = await MH.readData({ clientId: CID, month, deps: w.d }); return d; };

// ── 1 · quarterly review -> 31 the quarterly letter: built only from frozen months; waits when a number is missing; built once; never an email of its own ──
{ const qm = M(6), rows = [row(M(4), { closed: true, frozen: frozen({ views: 380, calls: 25, clicks: 150, pv: 360, pc: 20, pk: 140 }) }), row(M(5), { closed: true, frozen: frozen({ views: 400, calls: 28, clicks: 170, pv: 380, pc: 25, pk: 150 }) }), row(qm, { frozen: frozen({ views: 450, calls: 33, clicks: 210, pv: 400, pc: 28, pk: 170 }), tasks: {} })];
  const w = world({ now: "2026-07-03T10:00:00Z", month: qm, numbers: { [qm]: 6, [M(5)]: 5, [M(4)]: 4 }, rows });
  const r = await MH.settleLetter({ clientId: CID, month: qm, deps: w.d });
  if (r.state !== "built" || w.task(qm, H.ID.LETTER).status !== "done") fail("1 · the quarter month's letter is not built from its frozen months");
  if (w.sent.length) fail("1 · building the quarterly letter emailed the client (it rides inside the one monthly report; there is no second email)");
  if ((await MH.settleLetter({ clientId: CID, month: qm, deps: w.d })).state !== "already") fail("1 · pressing again builds the letter twice");
  const w2 = world({ now: "2026-07-03T10:00:00Z", month: qm, numbers: { [qm]: 6 }, rows: [row(qm, { frozen: frozen({ views: 450, calls: null, clicks: 210 }) })] });
  if ((await MH.settleLetter({ clientId: CID, month: qm, deps: w2.d })).state !== "waiting") fail("1 · a letter is built with a frozen number missing"); }
// ── 2 · keywords: never re-proposes a tracked one; capped at 2 extra IN TOTAL; the client's yes feeds the tracked set ──
{ const w = world({ now: NOW, month: M(6), number: 6, rows: [row(M(6))], suggest: ["plumber austin", "tankless water heater install"] });
  await MH.act({ clientId: CID, month: M(6), action: "grow_suggest", body: {}, deps: w.d });
  const items = (w.task(M(6), H.ID.GROW).grow || {}).items || [];
  if (!items.length || items.some((i) => i.value === "plumber austin")) fail("2 · an already-tracked search is proposed again");
  await MH.act({ clientId: CID, month: M(6), action: "grow_send", body: {}, deps: w.d });
  const y = await MH.clientAnswer({ clientId: CID, key: `${M(6)}|${w.task(M(6), H.ID.GROW).grow.items[0].id}`, answer: "yes", deps: w.d });
  if (!y.ok || !w.keywords.includes("tankless water heater install")) fail("2 · an approved search is not added to the tracked set");
  const w2 = world({ now: NOW, month: M(6), number: 6, rows: [row(M(6))], trackedExtra: ["x", "y"] });
  if ((await MH.act({ clientId: CID, month: M(6), action: "grow_suggest", body: {}, deps: w2.d })).ok) fail("2 · a third expansion search is suggested (each is a monthly map scan: capped at 2)"); }
// ── 3 · service area: never for a storefront or a multi-location business; only on a measured edge (research §2) ──
{ const act = (w, p) => MH.act({ clientId: CID, month: M(6), action: "grow_area", body: { place: p }, deps: w.d });
  const fr = { sector: "east", miles: 6, striking: 3, n: 5 };
  if ((await act(world({ now: NOW, month: M(6), number: 6, rows: [row(M(6))], client: { geography_model: "single_location" }, frontier: fr }), "Bastrop")).ok) fail("3 · a storefront business is offered a service-area expansion");
  if ((await act(world({ now: NOW, month: M(6), number: 6, rows: [row(M(6))], frontier: null }), "Bastrop")).ok) fail("3 · an area is proposed with no measured edge behind it");
  if ((await act(world({ now: NOW, month: M(6), number: 6, rows: [row(M(6))], frontier: fr, areasNow: Array.from({ length: 20 }, (_, i) => `Town ${i}`) }), "Bastrop")).ok) fail("3 · a 21st service area is proposed (Google allows 20)");
  if ((await act(world({ now: NOW, month: M(6), number: 6, rows: [row(M(6))], frontier: fr, areasNow: ["Bastrop, TX"] }), "Bastrop")).ok) fail("3 · an area already listed is proposed again");
  const w = world({ now: NOW, month: M(6), number: 6, rows: [row(M(6))], frontier: fr, areasNow: ["Austin, TX"] }); const r = await act(w, "Bastrop"), it = ((w.task(M(6), H.ID.GROW).grow || {}).items || [])[0];
  if (!r.ok || !it || it.kind !== "area" || !/east/.test(it.why)) fail("3 · a proposal doesn't carry its measured evidence (the side of the grid where they already rank 4 to 10)"); }
// ── 4/5 · the decline alert: one bad month is noise, two WHOLE frozen months running is a signal; a missing number is unknown; the running month is never compared; nobody is emailed ──
{ const churnOf = async (rows, o = {}) => { const w = world({ now: NOW, month: cur, number: 5, rows: [...rows, row(cur)], ...o }); const d = await settleAndRead(w); return { w, v: H.churnView({ ...d, now: w.d.now(), task: w.task(cur, H.ID.CHURN) }) }; };
  const one = await churnOf(decl([200, 200, 120])), two = await churnOf(decl([200, 120, 60]));
  if (one.v.signals.some((s) => s.key === "decline")) fail("5 · ONE bad month raises a decline (needs two running)");
  if (!two.v.signals.some((s) => s.key === "decline")) fail("5 · two whole months past the threshold don't raise a decline");
  const unread = await churnOf(frozenRows(M(4), [{ clicks: 200 }, { clicks: null }, { clicks: 60 }]));
  if (unread.v.signals.some((s) => s.key === "decline")) fail("5 · a month with a missing number is read as a drop");
  if (H.declinedRunning([null, 10, 20]) !== null || H.declinedRunning([10, null, 20]) !== null) fail("5 · a missing value is read as 'no breach' instead of unknown");
  const running = await churnOf(decl([200, 200, 195]), {}); running.w.rows.find((r) => r.reporting_month === cur).data.frozen = frozen({ views: 1, calls: 1, clicks: 1, pv: 400, pc: 30, pk: 200 });
  const d2 = await MH.readData({ clientId: CID, month: cur, deps: running.w.d }); if (H.churnView({ ...d2, now: Date.parse(NOW), task: {} }).signals.some((s) => s.key === "decline")) fail("5 · the month still running is compared with whole months");
  const w = two.w; await MH.act({ clientId: CID, month: cur, action: "churn_note", body: { text: "On it" }, deps: w.d }); if (w.sent.length) fail("5 · noting a churn flag sends an email (it is a note only)"); }
// ── 11 · referral ask: only at a trust moment, once a quarter, the server checks it too, the person confirms the recipient ──
{ const mk = (clicks, sent = true, o = {}) => world({ now: NOW, month: cur, number: 5, rows: [row(M(3), { closed: true, frozen: frozen({ views: 380, calls: 25, clicks: 150 }) }), row(M(4), { closed: true, frozen: frozen({ views: clicks < 150 ? 300 : 420, calls: clicks < 150 ? 20 : 30, clicks, pv: 380, pc: 25, pk: 150 }), tasks: sent ? { "m2.report.deliver": { status: "done" } } : {}, data: sent ? { report_sent: { at: "x" } } : {} }), row(cur, o.cur || {})], ...o });
  const view = async (w) => H.referralView({ ...(await MH.readData({ clientId: CID, month: cur, deps: w.d })), task: w.task(cur, H.ID.REFERRAL) });
  if ((await view(mk(100))).ready) fail("11 · a referral ask is offered with no trust moment (a falling number)");
  if (!(await view(mk(200))).ready) fail("11 · a report with an improving number doesn't open the referral ask");
  if ((await view(mk(200, false))).ready) fail("11 · an unsent report opens the referral ask");
  if (!(await view(mk(100, false, { cur: { data: { tasks: { "m2.win_story.capture": { win: { answer: "yes", draft: "x" } } } } } }))).ready) fail("11 · a win story they said yes to doesn't open the ask");
  const w = mk(100); const r = await MH.act({ clientId: CID, month: cur, action: "referral_send", body: { confirmedTo: "owner@acme.test" }, deps: w.d }); if (r.ok || w.sent.length) fail("11 · the server sends a referral ask when there is no trust moment");
  const g = mk(200); await MH.act({ clientId: CID, month: cur, action: "referral_send", body: { confirmedTo: "owner@acme.test" }, deps: g.d }); const again = await MH.act({ clientId: CID, month: cur, action: "referral_send", body: { confirmedTo: "owner@acme.test" }, deps: g.d });
  if (g.sent.length !== 1 || again.ok) fail("11 · the one-a-quarter limit no longer holds"); }
// ── 13 · upsell: top 3 on the main search for 3 whole months running ──
{ const up = async (ranks, runRank = null) => { const rows = ranks.map((p, i) => row(addM(M(4), i - 2), { closed: true, rank: p, frozen: frozen({ clicks: 100 }) })); const w = world({ now: NOW, month: cur, number: 5, rows: [...rows, row(cur, { rank: runRank })] }); return H.upsellState(await MH.readData({ clientId: CID, month: cur, deps: w.d })); };
  if (!(await up([1, 2, 3])).top) fail("13 · 3 months in the top 3 doesn't flag an upsell");
  if ((await up([1, 5, 1])).top) fail("13 · an upsell flags without 3 straight top-3 months");
  if ((await up([5, 2, 2], 1)).top) fail("13 · the month still running counts toward the upsell"); }
// ── 14 · churn risk: two signals at once, the call outcome counts, an unrecorded sign-in is 'not recorded' never 'recent', a notice closes it ──
{ const mk = async (o = {}) => { const w = world({ now: NOW, month: cur, number: 5, rows: [...decl([200, 190, 185]), row(cur)], ...o }); return { w, v: H.churnView({ ...(await settleAndRead(w)), now: Date.parse(NOW), task: {} }) }; };
  const stale = "2026-04-01T09:00:00Z";
  if ((await mk({ lastLogin: stale })).v.flagged) fail("14 · ONE signal raises a churn flag (needs two)");
  if (!(await mk({ lastLogin: stale, client: { billing_status: "past_due" } })).v.flagged) fail("14 · two signals at once don't raise a churn flag");
  const nl = await mk({ lastLogin: null }); if ((nl.v.rows || []).some((b) => /Signed in to the portal recently|Last sign-in/i.test(`${b.title} ${b.line || ""}`)) || !(nl.v.rows || []).some((b) => /not recorded/.test(b.title))) fail("14 · an unrecorded portal login is reported as recent visits");
  const call = world({ now: NOW, month: cur, number: 5, rows: [...decl([200, 190, 185]).map((r, i, a) => (i === a.length - 1 ? { ...r, data: { ...r.data, tasks: { "m2.call.monthly": { call_outcome: "at_risk" } } } } : r)), row(cur)], lastLogin: stale });
  const cv = H.churnView({ ...(await settleAndRead(call)), now: Date.parse(NOW), task: {} }); if (!cv.flagged || !cv.signals.some((s) => s.key === "call")) fail("14 · an at-risk call plus a missed portal visit don't raise the flag (the call outcome isn't counted)");
  if ((await mk({ lastLogin: stale, client: { billing_status: "past_due" }, notice: { ends_on: "2026-06-10" } })).v.flagged) fail("14 · a notice to leave does not close churn risk"); }
// ── unknowns stay unknown (found 10-19 by running the engine on production data) ──
{ const w = world({ now: NOW, month: cur, number: 5, rows: [row(cur)] }); const s = await MH.settle({ clientId: CID, month: cur, deps: w.d }); if (s.churn !== "waiting") fail("unknowns · with no frozen month at all churn risk gives a verdict instead of waiting"); }
// ── research §2 · service areas: rank comes from the pin; propose only a measured frontier ──
const gridOf = (rankAt) => { const pts = []; for (let r = 0; r < 5; r++) for (let c2 = 0; c2 < 5; c2++) pts.push({ lat: 30 + (2 - r) * 0.02, lng: -97 + (c2 - 2) * 0.02, rank: rankAt(r, c2) }); return pts; };
const inner = (r, c2) => Math.abs(r - 2) <= 1 && Math.abs(c2 - 2) <= 1;
const STRONG_EAST = gridOf((r, c2) => (inner(r, c2) ? 2 : c2 === 4 ? 6 : null));
{ if (MAT.frontierVerdict([]).state !== "locked" || MAT.frontierVerdict(null).state !== "locked") fail("3 · an area is proposed with no grid scan");
  if (MAT.frontierVerdict(gridOf((r, c2) => (c2 === 4 ? 6 : null))).state !== "home_first") fail("3 · expansion is offered while the home area isn't top 3 (research rule 2.5)");
  if (MAT.frontierVerdict(gridOf(() => 1)).state !== "all_green") fail("3 · an all-green grid isn't told to widen the scan (no visible edge, rule 2.6)");
  const e = MAT.frontierVerdict(STRONG_EAST); if (e.state !== "edge" || !/east/.test(e.sector) || e.striking < 2) fail(`3 · a measured edge (rank 4 to 10 next to the top-3 home) isn't offered (${e.state})`);
  const words = fs.readFileSync(`${SITE}/shared/monthly-health.js`, "utf8") + fs.readFileSync(`${SITE}/admin/admin.js`, "utf8").split("MONTHLY · ACCOUNT HEALTH")[1].split("step 64")[0];
  if (/service area[^.]*\b(rank|ranking)s? (higher|better|up)|boost(s)? (your )?rank|improve(s)? (your )?rank/i.test(words)) fail("3 · the copy implies adding a service area improves rank (it doesn't, rule 2.1)"); }
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
// ── every step is present, and none is "done" without the record or measurement that says so ──
{ const w = world({ now: NOW, month: cur, number: 5, rows: [...decl([200, 120, 60]), row(cur)], lastLogin: "2026-04-01T09:00:00Z" }); await MH.settle({ clientId: CID, month: cur, deps: w.d });
  if (w.task(cur, H.ID.CHURN).status === "done") fail("every step · a flagged churn risk reads as done before anyone noted what they did");
  const empty = world({ now: NOW, month: cur, number: 5, rows: [row(cur)] }); await MH.settle({ clientId: CID, month: cur, deps: empty.d });
  if (empty.task(cur, H.ID.CHURN).status === "done") fail("every step · churn risk is done with no frozen month behind it");
  const ids = JSON.parse(read("data/playbooks/playbooks.json")).month2plus.map((s) => s.id); for (const id of H.IDS) if (!ids.includes(id)) fail(`every step · ${id} is not a Monthly step`); }
// ── the stage and the portal: stage 6 is only a label; the portal sees only SENT quarterly reviews; the old records stay readable ──
const por = read("netlify/functions/portal-mature.js"), sql = read("docs/supabase/RGA_MATURE_RECORDS_2026-10-19.sql");
if (fs.existsSync(`${SITE}/netlify/functions/admin-mature.js`)) fail("the old Mature endpoint (admin-mature) is still deployed");
if (!/kind=eq\.quarterly_review&status=eq\.sent/.test(por) || !/const auth = await requirePortalOwnerOrWorkspace\(event, clientId\);\s*if \(auth\.error\) return auth\.error;/.test(por)) fail("portal-mature can show a DRAFT review, or isn't gated to the client + their RGA workspace (sent historical reviews stay readable)");
// 10-20 (walk): admin renders the client's portal AS ITSELF: an owner-only read 403s on admin's Onboarding tab
if (/requirePortalOwner\(event, clientId\)/.test(por)) fail("portal-mature is owner-only again: admin's view of the client's portal gets a 403");
if (!/unique \(client_id, kind, period\)/.test(sql) || !/enable row level security/.test(sql)) fail("the Mature records table lost its one-row-per-period key or its RLS (nothing is deleted)");
const admin = read("admin/admin.js");
if (/key: "stage_6_mature",\s+num: 6[^}]*labelOnly: true/.test(admin) === false) fail("stage 6 is an Advance target again (it is a label only: 'Full Dashboard')");
if (F.length) { console.error("🔴 the Mature rules can claim what isn't measured:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ Mature rules, at their new home (Account health 28-30, quarter steps 31-33): churn needs two signals from two WHOLE frozen months and a missing number is unknown · the running month is never compared · the quarterly letter rides inside the one report, never a second email · the referral ask only at a trust moment, once a quarter, to a confirmed address · searches capped at 2 · no area for a storefront or a multi-location business · upsell needs 3 whole months · stage 6 is a label · sent reviews stay readable");
