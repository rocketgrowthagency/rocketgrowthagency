#!/usr/bin/env node
// check-account-health.mjs — ACCOUNT HEALTH (Monthly 28-30) AND THE ADDED QUARTER STEPS (31-33) (approved mature_account_health_v1, the owner 11-10).
// The old Mature stage (14 hand-ticked m6.* steps under the Monthly, stage_6_mature) became one Monthly section. This gate holds BOTH halves of that move:
//   PART 1 · WHAT MUST BE GONE AND WHAT MUST BE THERE (structural, over a file set): the Mature checklist, its host, its endpoint, its live Google read, its Advance target, the stale
//            "Monitor KPIs & publish the report" line, "Tell the client" and the setup-era stage-6 dashboard are removed AT THE PRODUCER, in every state; the six new steps are in the
//            playbook, the sections, the numbering (28-33, appended exactly as 26 and 27 were), the admin cards, the morning run and the report.
//   PART 2 · THE RULES, RUN (the shipped code against fakes: no network, no model, no email, no Google): universal fixtures (one and many locations, service-area and storefront, no call
//            tracking, Months 3/4/5/6/12, a missing frozen number, no sign-in ever recorded, billing past due, a notice given, every step skipped and undone, a closed past month).
// 🔴 THE GATE PROVES ITSELF. LIVE_BEFORE = today's old pieces (excerpts of the real pre-change code): the structural rules MUST fail on it. AFTER = the new shape: they MUST pass.
//    `--against=<rev>` reads the website files from that git revision instead of the working tree (use main's HEAD from before this change): it MUST fail.
// Exit 0 holds · 1 regressed · 2 INDETERMINATE (cannot read the files / git, harness error)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { SITE, H, MS, MC, MH, MR, load, world, row, frozen, frozenRows, addM, CID } from "./_account-health-world.mjs";

const F = [], fail = (m) => F.push(m);
const indet = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
// the site comes from APPROVAL_ARCHIVE_SITE_DIR (a mutation copy, a worktree, or the main checkout) via _account-health-world.mjs; --against reads git objects of the same checkout
const against = (process.argv.find((a) => a.startsWith("--against=")) || "").slice("--against=".length);

// ─── the files the structural rules read ───
const FILES = ["admin/admin.js", "admin/index.html", "portal/portal.js", "portal/index.html", "netlify/functions/admin-mature.js", "netlify/functions/_mature-deps.js", "netlify/functions/_mature.js",
  "netlify/functions/_monthly-health.js", "netlify/functions/admin-monthly-health.js", "netlify/functions/_morning-run.js", "netlify/functions/_monthly-close.js", "netlify/functions/_monthly-report-email.js",
  "netlify/functions/portal-quarter-answer.js", "netlify/functions/_gbp-keep.js", "shared/monthly-sections.js", "shared/monthly-health.js", "shared/steps-57-64.js", "data/playbooks/playbooks.json", "data/playbooks/mature.json"];
function realFiles() { const o = {}; for (const f of FILES) { try { o[f] = fs.readFileSync(`${SITE}/${f}`, "utf8"); } catch { o[f] = ""; } } return o; }
function gitFiles(rev) {
  const o = {};
  for (const f of FILES) { try { o[f] = execFileSync("git", ["-C", SITE, "show", `${rev}:${f}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }); } catch { o[f] = ""; } }
  if (!o["admin/admin.js"]) indet(`cannot read admin/admin.js at ${rev}`);
  return o;
}

// ─── TODAY'S OLD PIECES (excerpts of the real code on main before this change): the rules below MUST fail on this ───
const LIVE_BEFORE = {
  "admin/admin.js": `function renderMonthlyChecklist() { renderMonthlyHeader(); renderOnboardingChecklist("month2plus", "monthlyChecklistHost");\n  renderMatureChecklist();\n}
async function renderMatureChecklist() { const host = document.getElementById("matureChecklistHost"); const r = await fetch(\`/.netlify/functions/admin-mature?client_id=\${id0}\`);\n  if (c.client_portal_stage === "stage_5_monthly") { host.innerHTML = ""; } }
function matureChecklistHtml(j) { return \`<button data-mature-act="tell_client">Tell the client</button>\`; }
{ key: "stage_6_mature",     num: 6, name: "Mature",         desc: "Full dashboard — KPIs, reports, everything" },
stage_6_mature: { admin: { title: "Monitor KPIs & publish the report", desc: "Review KPI data", tab: "kpis" } }
const STAGE_WORK_TAB = { stage_4_onboarding: "onboarding-v2", stage_5_monthly: "monthlynew", stage_6_mature: "kpis" };
return STAGE_DEFS[cur.num] || null;`,
  "admin/index.html": `<div id="matureChecklistHost" style="margin-bottom:22px;"></div><script type="module" src="/admin/admin.js?v=20261110e"></script>`,
  "portal/portal.js": `if (stage === "stage_5_monthly" || stage === "stage_4_monthly") { return stageBanner + grid; }\n  // stage_6_mature / stage_5_mature: full dashboard\n  return stageBanner + ctx.actionItemsHtml + \`\${ctx.googleSetupChecklistHtml}\${ctx.onboardingProgressHtml}\`;`,
  "portal/index.html": `<script type="module" src="/portal/portal.js?v=20261110f"></script>`,
  "netlify/functions/admin-mature.js": `exports.handler = async () => { /* GET runs loadContext, which reads Google live on every Monthly render */ };`,
  "netlify/functions/_mature-deps.js": `async function readGoogleLive(clientId, monthRows, deps = {}) { return live.readGoogleLive({ supa: db, oauth }); }`,
  "netlify/functions/_mature.js": `function kpiBreaches(client, thresholds, months, live) { const [m0, m1, m2] = months; /* months[0] is the month still running */ }\nfunction stepStates(ctx) {}\nasync function act(ctx, deps, action) {}`,
  "netlify/functions/_monthly-health.js": "", "netlify/functions/admin-monthly-health.js": "", "netlify/functions/_morning-run.js": `await d.settleQuarter(c.id, month);`,
  "netlify/functions/_monthly-close.js": `const m = await composeLetter({ clientId, month, frozen, tasks, deps: d });`, "netlify/functions/_monthly-report-email.js": `const quarter = MQ.blockOf({ tasks: x.tasks || {}, monthNumber: x.monthNumber });`,
  "netlify/functions/portal-quarter-answer.js": `if (!["win", "profile"].includes(body.kind)) return json(400, { error: "Unknown answer" });`, "netlify/functions/_gbp-keep.js": `{ id: "monthly_frozen_google", path: "frozen.google" }`,
  "shared/monthly-sections.js": `const APPENDED = ["m2.exec.profile_watch", "m2.exec.tracking_check"];`, "shared/monthly-health.js": "", "shared/steps-57-64.js": `const NO_HAND_DONE = ["m2.report.deliver"];`,
  "data/playbooks/playbooks.json": `{ "month2plus": [ { "id": "m2.report.deliver" } ] }`, "data/playbooks/mature.json": `{ "steps": [ { "id": "m6.account.churn_risk_signal" } ] }`,
};
// ─── THE NEW SHAPE, as small as it can be: the rules below MUST pass on this ───
const AFTER = {
  "admin/admin.js": `function renderMonthlyChecklist() { renderMonthlyHeader(); renderOnboardingChecklist("month2plus", "monthlyChecklistHost"); }
{ key: "stage_6_mature",     num: 6, name: "Full Dashboard", desc: "A label only", labelOnly: true },
stage_6_mature: { admin: { title: "Run the monthly cycle", tab: "monthlynew" } }
const STAGE_WORK_TAB = { stage_4_onboarding: "onboarding-v2", stage_5_monthly: "monthlynew", stage_6_mature: "monthlynew" };
return nextDef && nextDef.labelOnly ? null : nextDef;
const HL_FN = "/.netlify/functions/admin-monthly-health"; function hlCard(id, build, of) { return oncCardHtml(id, v, {}); }
: id === "m2.health.churn_risk" ? hlChurnCardHtml()\n: id === "m2.health.upsell" ? hlUpsellCardHtml()\n: id === "m2.health.referral_ask" ? hlReferralCardHtml()\n: id === "m2.quarter.letter" ? hlLetterCardHtml()\n: id === "m2.quarter.grow_plan" ? hlGrowCardHtml()\n: id === "m2.quarter.ai_check" ? hlAiCardHtml()`,
  "admin/index.html": `<script type="module" src="/admin/admin.js?v=20261110f"></script>`,
  "portal/portal.js": `if (stage === "stage_5_monthly" || stage === "stage_4_monthly" || stage === "stage_6_mature" || stage === "stage_5_mature") { return stageBanner + grid; }`,
  "portal/index.html": `<script type="module" src="/portal/portal.js?v=20261110g"></script>`,
  "netlify/functions/admin-mature.js": "", "netlify/functions/_mature-deps.js": `module.exports = { supa, aiText };`, "netlify/functions/_mature.js": `module.exports = { frontierOf, HOME_SOLV_MIN, STRIKING_MIN };`,
  "netlify/functions/_monthly-health.js": `async function settle() { return {}; } async function settleLetter() { return {}; }\nasync function act({ action }) { if (action === "referral_send") { await d.sendMail({}); } if (action === "referral_send") { clip(b.confirmedTo, 160).toLowerCase() !== S.email.toLowerCase(); } }`,
  "netlify/functions/admin-monthly-health.js": `const gate = await requireWorkspaceForClient(event, clientId);`, "netlify/functions/_morning-run.js": `await d.settleQuarter(c.id, month);\n if (d.settleHealth) { await d.settleHealth(c.id, month); }`,
  "netlify/functions/_monthly-close.js": `composeLetter({ clientId, month, frozen, tasks, deps: d, letter: (rec.data && rec.data.quarter_letter) || null });\n if (d.buildLetter) await guard("letter", () => d.buildLetter({ clientId, month }));`,
  "netlify/functions/_monthly-report-email.js": `const letter = MH.letterBlock(x.quarterLetter, { withoutGoogle: wg });`,
  "netlify/functions/portal-quarter-answer.js": `if (body.kind === "grow") { return json(200, await MH.clientAnswer({})); }`, "netlify/functions/_gbp-keep.js": `{ id: "monthly_quarter_letter_google", path: "quarter_letter.google_rows" }`,
  "shared/monthly-sections.js": `const APPENDED = ["m2.exec.profile_watch", "m2.exec.tracking_check", "m2.health.churn_risk", "m2.health.upsell", "m2.health.referral_ask", "m2.quarter.letter", "m2.quarter.grow_plan", "m2.quarter.ai_check"]; healthOnly: true`,
  "shared/monthly-health.js": `const SELF = [ID.CHURN, ID.UPSELL, ID.LETTER];`, "shared/steps-57-64.js": `const NO_HAND_DONE = ["m2.health.churn_risk", "m2.health.upsell", "m2.health.referral_ask", "m2.quarter.letter", "m2.quarter.grow_plan", "m2.quarter.ai_check"];`,
  "data/playbooks/playbooks.json": JSON.stringify({ month2plus: ["m2.health.churn_risk", "m2.health.upsell", "m2.health.referral_ask", "m2.quarter.letter", "m2.quarter.grow_plan", "m2.quarter.ai_check"].map((id) => ({ id, hasRunner: false })) }),
  "data/playbooks/mature.json": "",
};
// ─── PART 1 · the structural rules. Each is [name, (files) => problem|null] ───
const idsIn = (s) => { try { return (JSON.parse(s).month2plus || []).map((x) => x.id); } catch { return []; } };
const SIX = ["m2.health.churn_risk", "m2.health.upsell", "m2.health.referral_ask", "m2.quarter.letter", "m2.quarter.grow_plan", "m2.quarter.ai_check"];
const RULES = [
  ["the Mature checklist is removed at the producer (renderMatureChecklist, its host, its click handler)", (f) => /renderMatureChecklist|matureChecklistHtml|matureChecklistHost|data-mature-act|data-mature-reload/.test(f["admin/admin.js"] + f["admin/index.html"]) ? "admin still draws or hosts the Mature checklist" : null],
  ["no front end calls admin-mature, and the endpoint file is gone", (f) => (/admin-mature/.test(f["admin/admin.js"] + f["portal/portal.js"]) || f["netlify/functions/admin-mature.js"].trim()) ? "admin-mature is still called or still deployed" : null],
  ["no live Google read on every Monthly render (readGoogleLive / loadContext are gone)", (f) => /readGoogleLive|loadContext/.test(f["netlify/functions/_mature-deps.js"] + f["netlify/functions/_mature.js"] + f["netlify/functions/_monthly-health.js"]) ? "a live Google read is still in the Mature/health code" : null],
  ["the old running-month KPI alert and the 14-step engine are gone from _mature.js (the churn rule moved, not duplicated)", (f) => /kpiBreaches|stepStates|function act\(|KPI_METRICS/.test(f["netlify/functions/_mature.js"]) ? "_mature.js still holds the old alert or engine" : null],
  ["'Tell the client' (a note the portal never read) is gone", (f) => /tell_client|rga_note_to_client/.test(f["admin/admin.js"] + f["netlify/functions/_mature.js"] + f["netlify/functions/_monthly-health.js"]) ? "'Tell the client' is still produced" : null],
  ["stage 6 is a label only: not an Advance target, 'Full Dashboard', the work tab is the Monthly", (f) => { const a = f["admin/admin.js"]; return !/key: "stage_6_mature",\s+num: 6, name: "Full Dashboard"[^}]*labelOnly: true/.test(a) || !/nextDef && nextDef\.labelOnly \? null : nextDef/.test(a) || /stage_6_mature: "kpis"/.test(a) ? "stage 6 can still be advanced to, or still points at the KPIs tab" : null; }],
  ["the stale next-action line 'Monitor KPIs & publish the report' is gone", (f) => /Monitor KPIs|Review KPIs &amp; publish report/.test(f["admin/admin.js"]) ? "the stale next-action text is still produced" : null],
  ["the stage-6 portal dashboard is the stage-5 one (no setup-era cards)", (f) => { const p = f["portal/portal.js"]; return /stage_6_mature \/ stage_5_mature: full dashboard/.test(p) || !/stage === "stage_5_monthly" \|\| stage === "stage_4_monthly" \|\| stage === "stage_6_mature"/.test(p) ? "a stage-6 client still gets the setup-era dashboard cards" : null; }],
  ["the six steps are in the playbook (28-33), none with a Run button", (f) => { const ids = idsIn(f["data/playbooks/playbooks.json"]); return SIX.some((i) => !ids.includes(i)) ? "a step 28-33 is missing from the playbook" : null; }],
  ["the six are appended to the numbering exactly as 26 and 27 were, in order", (f) => (f["shared/monthly-sections.js"].includes(`const APPENDED = ["m2.exec.profile_watch", "m2.exec.tracking_check", ${SIX.map((i) => `"${i}"`).join(", ")}]`) && /healthOnly: true/.test(f["shared/monthly-sections.js"])) ? null : "the six are not appended 28-33 in order with Account health from Month 4"],
  ["the six have admin cards in the one card design, with Skip and Undo (oncCardHtml)", (f) => { const a = f["admin/admin.js"]; return SIX.some((i) => !a.includes(`id === "${i}"`)) || !/oncCardHtml\(id, v/.test(a) || !/function hlCard/.test(a) ? "a step 28-33 has no admin card" : null; }],
  ["no hand tick on the six", (f) => SIX.some((i) => !f["shared/steps-57-64.js"].includes(`"${i}"`)) ? "a step 28-33 can be ticked by hand" : null],
  ["the morning run settles Account health and the quarter letter, and sends nothing", (f) => !/settleHealth/.test(f["netlify/functions/_morning-run.js"]) || !/buildLetter/.test(f["netlify/functions/_monthly-close.js"]) || /referral|sendMail|sendGmail/.test(f["netlify/functions/_morning-run.js"]) ? "the morning run does not settle 28-31, or it can send" : null],
  ["the letter rides INSIDE the one report (no second email): built before the report, printed by the report builder", (f) => !/letterBlock\(x\.quarterLetter/.test(f["netlify/functions/_monthly-report-email.js"]) || !/letter: \(rec\.data && rec\.data\.quarter_letter\)/.test(f["netlify/functions/_monthly-close.js"]) ? "the quarterly letter does not ride in the report" : null],
  ["the only email the new code can send is the referral press (confirmed recipient, staff only)", (f) => { const s = f["netlify/functions/_monthly-health.js"]; if (!s) return "no health module"; const calls = (s.match(/d\.sendMail\(/g) || []).length; return calls < 1 || /settle\b[\s\S]*?d\.sendMail/.test(s.split("async function act(")[0]) || !/confirmedTo/.test(s) ? "an email can go from outside the referral press, or the press does not check the confirmed address" : null; }],
  ["admin endpoint is workspace-gated; the client's answer is portal-owner only", (f) => !/requireWorkspaceForClient/.test(f["netlify/functions/admin-monthly-health.js"]) || !/kind === "grow"/.test(f["netlify/functions/portal-quarter-answer.js"]) ? "the new endpoints lost their gate" : null],
  ["the letter's Google rows have a 30-day expiry", (f) => !/quarter_letter\.google_rows/.test(f["netlify/functions/_gbp-keep.js"]) ? "the quarterly letter's Google figures have no expiry" : null],
  ["the ?v= keys moved (admin f, portal g)", (f) => { // 11-11: a later DATE is also a bump (the old regex only took 20261110f-z, so every later day read "not bumped")
    const v = (html, file) => ((String(html || "").match(new RegExp(`${file}\\.js\\?v=(\\d{8}[a-z]?)`)) || [])[1] || "");
    return v(f["admin/index.html"], "admin") < "20261110f" || v(f["portal/index.html"], "portal") < "20261110g" ? "admin.js/portal.js ?v= was not bumped" : null; }],
];
const run = (files) => RULES.map(([name, test]) => ({ name, why: test(files) })).filter((r) => r.why);

// ─── the gate proves itself ───
const before = run(LIVE_BEFORE), after = run(AFTER);
if (before.length < RULES.length - 3) fail(`SELF-PROOF · the rules catch only ${before.length} of ${RULES.length} on today's old pieces (LIVE_BEFORE): a rule is blind`);
for (const r of RULES) if (!before.some((b) => b.name === r[0]) && !["no hand tick on the six", "the morning run settles Account health and the quarter letter, and sends nothing"].includes(r[0]) === false) { /* those two have no old counterpart to show */ }
for (const b of after) fail(`SELF-PROOF · AFTER (the new shape) does not satisfy: ${b.name} (${b.why})`);
const SHOULD_CATCH = ["the Mature checklist is removed at the producer (renderMatureChecklist, its host, its click handler)", "no front end calls admin-mature, and the endpoint file is gone", "no live Google read on every Monthly render (readGoogleLive / loadContext are gone)",
  "the old running-month KPI alert and the 14-step engine are gone from _mature.js (the churn rule moved, not duplicated)", "'Tell the client' (a note the portal never read) is gone", "stage 6 is a label only: not an Advance target, 'Full Dashboard', the work tab is the Monthly",
  "the stale next-action line 'Monitor KPIs & publish the report' is gone", "the stage-6 portal dashboard is the stage-5 one (no setup-era cards)", "the six steps are in the playbook (28-33), none with a Run button"];
for (const n of SHOULD_CATCH) if (!before.some((b) => b.name === n)) fail(`SELF-PROOF · LIVE_BEFORE (today's old pieces) slipped past: ${n}`);

const files = against ? gitFiles(against) : realFiles();
for (const p of run(files)) fail(`${against ? `[${against}] ` : ""}${p.name} (${p.why})`);

// ─── PART 2 · the rules, run (skipped when reading an old revision: the old tree has none of this code) ───
if (!against) await runtimeCases();

async function runtimeCases() {
  const M = (n) => `2026-${String(n).padStart(2, "0")}-01`;
  // the numbering: appended, never renumbered. Mirror of admin.js obMonthlyPageNumbers over the playbook (the admin source anchor is checked below).
  {
    const PB = JSON.parse(fs.readFileSync(`${SITE}/data/playbooks/playbooks.json`, "utf8")).month2plus, app = MS.APPENDED, num = new Map();
    let n = 0; MS.SECTIONS.flatMap((s) => s.ids).filter((id) => !app.includes(id)).forEach((id) => num.set(id, ++n)); app.forEach((id) => num.set(id, ++n));
    const want = { "m2.report.freeze": 21, "m2.report.generate": 22, "m2.report.deliver": 23, "m2.call.monthly": 24, "m2.handoff.next_month": 25, "m2.exec.profile_watch": 26, "m2.exec.tracking_check": 27,
      "m2.health.churn_risk": 28, "m2.health.upsell": 29, "m2.health.referral_ask": 30, "m2.quarter.letter": 31, "m2.quarter.grow_plan": 32, "m2.quarter.ai_check": 33 };
    for (const [id, w] of Object.entries(want)) if (num.get(id) !== w) fail(`numbering · ${id} should be step ${w}, the page would print ${num.get(id)}`);
    if (PB.length !== 33 || n !== 33) fail(`numbering · the Monthly has ${PB.length} steps (${n} numbered), expected 33`);
    if (!/const M = globalThis\.rgaMonthly, app = \(M && M\.APPENDED\) \|\| \[\]/.test(fs.readFileSync(`${SITE}/admin/admin.js`, "utf8"))) fail("numbering · admin.js obMonthlyPageNumbers no longer numbers APPENDED last (the gate mirrors it)");
    for (const id of SIX) { const s = PB.find((x) => x.id === id); if (!s || s.hasRunner) fail(`no Run button · ${id} has a runner`); }
  }
  // Months 3, 4, 5, 6, 12: Account health from Month 4; the added quarter steps in a quarter month only; the count follows
  for (const [n, health, quarter] of [[3, false, true], [4, true, false], [5, true, false], [6, true, true], [12, true, true]]) {
    const ids = MS.idsFor(n);
    for (const id of H.HEALTH_IDS) if (ids.includes(id) !== health) fail(`Month ${n} · Account health ${health ? "must" : "must NOT"} count`);
    for (const id of H.QUARTER_IDS) if (ids.includes(id) !== quarter) fail(`Month ${n} · ${id} ${quarter ? "must" : "must NOT"} count`);
    if (H.showsHealth(n) !== health) fail(`Month ${n} · showsHealth is wrong`);
  }
  if (H.showsHealth(null) || MS.showsHealth(null) || H.FIRST_MONTH !== MS.HEALTH_FROM) fail("Month unknown · Account health shows on a guess, or the two files disagree on the first month");

  // ── 28 Churn risk ──
  const NOW = "2026-05-10T12:00:00Z", cur = M(5);
  const decl = (clicks) => frozenRows(M(4), clicks.map((c) => ({ views: 400, calls: 30, clicks: c })));   // oldest first: Feb, Mar, Apr
  const churn = async (o) => { const w = world({ now: NOW, month: cur, number: 5, ...o }); const s = await MH.settle({ clientId: CID, month: cur, deps: w.d }); const d = await MH.readData({ clientId: CID, month: cur, deps: w.d }); return { w, s, d, v: H.churnView({ ...d, now: w.d.now(), task: w.task(cur, H.ID.CHURN) }) }; };
  {
    const r = await churn({ rows: [...decl([200, 120, 60]), row(cur)], lastLogin: "2026-04-01T09:00:00Z" });   // 200 -> 120 -> 60: down 40% and 50%; last sign-in 39 days ago
    if (!r.v.flagged || r.v.signals.length !== 2) fail(`28 · two signals (a two-month decline, 39 days without a sign-in) must flag (${r.v.signals.length})`);
    if (r.w.task(cur, H.ID.CHURN).status === "done") fail("28 · a flagged churn risk is settled before anyone noted what they did");
    if (!/Search clicks down two whole months running/.test(r.v.rows.map((x) => x.title).join(" "))) fail("28 · the decline signal does not name the number");
    const a = await MH.act({ clientId: CID, month: cur, action: "churn_note", body: { text: "Called Sam, booked a check-in" }, deps: r.w.d, by: "a@rga.test" });
    if (!a.ok || r.w.task(cur, H.ID.CHURN).status !== "done" || r.w.sent.length) fail("28 · noting what you did must settle the step and send nothing");
    if ((await MH.act({ clientId: CID, month: cur, action: "churn_note", body: { text: "" }, deps: r.w.d })).ok) fail("28 · an empty note is accepted");
    await MH.settle({ clientId: CID, month: cur, deps: r.w.d });
    if (r.w.task(cur, H.ID.CHURN).status !== "done") fail("28 · the morning run re-opened a step a person finished");
  }
  { const r = await churn({ rows: [...decl([200, 190, 185]), row(cur)], client: { billing_status: "past_due" } });
    if (r.v.flagged || r.v.signals.length !== 1 || r.w.task(cur, H.ID.CHURN).status !== "done") fail("28 · ONE signal (billing past due) flagged, or left the step open"); }
  { const r = await churn({ rows: [...decl([200, 190, 185]), row(cur, { tasks: {} })], client: { billing_status: "past_due" }, lastLogin: "2026-04-01T09:00:00Z" });
    if (!r.v.flagged) fail("28 · billing past due plus a missed sign-in must flag"); }
  { const r = await churn({ rows: [...decl([200, 190, 185]), row(cur)], lastLogin: null });
    const said = r.v.rows.map((x) => `${x.title} ${x.line || ""}`).join(" ");
    if (!/not recorded/i.test(said) || /signed in to the portal recently|Last sign-in/i.test(said) || r.v.signals.some((s) => s.key === "login")) fail("28 · a sign-in nobody recorded is read as recent, or as a signal (it is neither)"); }
  { // the call outcome: At risk or Churned is one sign; Retained is a check; none noted is unknown
    const mk = (k) => { const rows = decl([200, 190, 185]); rows[rows.length - 1].data.tasks = { "m2.call.monthly": { call_outcome: k } }; return churn({ rows: [...rows, row(cur)] }); };
    for (const k of ["at_risk", "churned"]) { const r = await mk(k); if (!r.v.signals.some((s) => s.key === "call") || r.v.flagged) fail(`28 · a "${k}" call is not exactly one sign`); }
    const r2 = await mk("retained"); if (r2.v.signals.some((s) => s.key === "call")) fail("28 · a Retained call is a sign of risk");
  }
  { const r = await churn({ rows: [...decl([200, 120, 60]), row(cur)], lastLogin: "2026-04-01T09:00:00Z", notice: { ends_on: "2026-06-10" } });
    if (r.v.flagged || r.s.churn !== "closed" || r.w.task(cur, H.ID.CHURN).status !== "done" || !/notice/i.test(r.v.label)) fail("28 · a notice to leave must close churn risk (End of service takes over) even with two signals"); }
  { // a missing frozen number is unknown: never 0, never a decline, never fine
    const rows = frozenRows(M(4), [{ views: 400, calls: 30, clicks: 200 }, { views: 400, calls: 30, clicks: null }, { views: 400, calls: 30, clicks: 60 }]);   // clicks: Mar not given
    const r = await churn({ rows: [...rows, row(cur)] });
    const said = r.v.rows.map((x) => `${x.title} ${x.line || ""}`).join(" ");
    if (r.v.signals.some((s) => s.key === "decline") || !/could not be checked/.test(said) || /\b0\b/.test(said.replace(/\b30\b|\b200\b/g, ""))) fail("28 · a month with a missing frozen number is read as a decline, as 0, or as fine"); }
  { // no call tracking (calls never given): unknown for calls, the other numbers still judged
    const r = await churn({ rows: [...frozenRows(M(4), [{ clicks: 200 }, { clicks: 120 }, { clicks: 60 }]), row(cur)], lastLogin: "2026-05-08T09:00:00Z" });
    if (!r.v.signals.some((s) => s.key === "decline") || /Call taps down/.test(JSON.stringify(r.v.signals))) fail("28 · a client with no call numbers: the clicks decline is lost or calls are called down"); }
  { // the RUNNING month is never compared: a collapse in May (the running month) is not a signal; a decline needs two WHOLE frozen months
    const run = row(cur, { frozen: frozen({ views: 1, calls: 1, clicks: 1, pv: 400, pc: 30, pk: 200 }) });
    const r = await churn({ rows: [...decl([200, 200, 195]), run] });
    if (r.v.signals.some((s) => s.key === "decline")) fail("28 · the running month was compared (a partial month against whole months looks like a drop)"); }
  { // last month's freeze has not landed (the 2nd): the newest frozen month is two back -> waiting, not a verdict on the wrong months
    const r = await churn({ rows: [...frozenRows(M(3), [{ clicks: 200 }, { clicks: 120 }, { clicks: 60 }]), row(cur)], now: "2026-05-01T08:00:00Z" });
    if (r.s.churn !== "waiting" || r.v.signals.some((s) => s.key === "decline")) fail("28 · before last month is frozen, churn judges months two back");
    // and the rule itself (not only the morning run): three frozen months that END two months back are not a verdict on the last two
    const stale = H.churnState({ now: Date.parse(NOW), expectMonth: M(4), frozen: frozenRows(M(3), [{ clicks: 200 }, { clicks: 120 }, { clicks: 60 }]).map((x) => MH.frozenOf(x)).reverse(), lastLoginAt: "2026-05-05T09:00:00Z", billing: "active" });
    if (stale.signals.some((s) => s.key === "decline")) fail("28 · churnState judged months that do not end at last month"); }
  { // Eastern time: it is still April 30 for the client when the clock says May 1 (UTC). The month is the month the caller passes; the 21-day line is a whole-day rule.
    const edge = async (iso) => (await churn({ rows: [...decl([200, 190, 185]), row(cur)], now: "2026-05-01T03:00:00Z", lastLogin: iso })).v.signals.some((s) => s.key === "login");
    if (await edge("2026-04-10T03:00:00Z")) fail("28 · exactly 21 days without a sign-in is a signal (it is 'more than 21')");
    if (!(await edge("2026-04-09T02:59:00Z"))) fail("28 · 22 days without a sign-in is not a signal"); }
  { // one location and many: the same rule (the signals do not depend on how many places)
    for (const geo of ["single_location", "multi_location", "service_area"]) { const r = await churn({ rows: [...decl([200, 120, 60]), row(cur)], lastLogin: "2026-04-01T09:00:00Z", client: { geography_model: geo } }); if (!r.v.flagged) fail(`28 · ${geo}: two signals did not flag`); } }
  { const r = await churn({ rows: [...decl([200, 120, 60]), row(cur)], lastLogin: "2026-04-01T09:00:00Z" });
    const sk = await MH.settle({ clientId: CID, month: cur, deps: world({ now: NOW, month: cur, number: 3 }).d }); if (sk.health) fail("28 · Account health settled in Month 3 (it starts with Month 4)"); }

  // ── 29 Upsell ──
  const up = async (ranks, o = {}) => { const rows = ranks.map((p, i) => row(addM(M(4), i - (ranks.length - 1)), { closed: true, rank: p, frozen: frozen({ clicks: 100 }) })); const w = world({ now: NOW, month: cur, number: 5, rows: [...rows, row(cur, { rank: o.runRank ?? null })], ...o }); await MH.settle({ clientId: CID, month: cur, deps: w.d }); const d = await MH.readData({ clientId: CID, month: cur, deps: w.d }); return { w, v: H.upsellView({ ...d, task: w.task(cur, H.ID.UPSELL) }) }; };
  { const a = await up([1, 2, 3]); if (!a.v.top || a.w.task(cur, H.ID.UPSELL).status !== "done") fail("29 · top 3 for three whole months did not show the opportunity");
    if (!/main search/i.test(a.v.rows[0].title) && !/plumber austin/.test(a.v.rows[0].title)) fail("29 · the opportunity does not name the main search (a multi-location business has one main search here)");
    const n = await MH.act({ clientId: CID, month: cur, action: "upsell_note", body: { text: "Propose a second area" }, deps: a.w.d, by: "a@rga.test" }); if (!n.ok || a.w.notes.length !== 1 || a.w.sent.length) fail("29 · the upsell note was not saved as a note only");
    const b = await up([1, 5, 2]); if (b.v.top) fail("29 · one month outside the top 3 still showed the opportunity");
    const c = await up([1, null, 2]); if (c.v.top || !/not counted as a miss or a hit|rank reading/i.test(JSON.stringify(c.v.rows))) fail("29 · a month with no rank reading was counted (it is neither a miss nor a hit)");
    const d = await up([5, 2, 2], { runRank: 1 }); if (d.v.top) fail("29 · the running month's rank was used"); }

  // ── 30 Referral ask ──
  const ref = async (o = {}) => { const prevSent = o.reportSent !== false, fall = o.clicks !== undefined && o.clicks < 150; const rows = [row(M(3), { closed: true, frozen: frozen({ views: 380, calls: 25, clicks: 150, pv: 360, pc: 20, pk: 140 }) }), row(M(4), { closed: true, frozen: frozen({ views: fall ? 300 : 420, calls: fall ? 20 : 30, clicks: o.clicks ?? 200, pv: 380, pc: 25, pk: 150 }), tasks: prevSent ? { "m2.report.deliver": { status: "done" } } : {}, data: prevSent ? { report_sent: { at: "2026-05-05T10:00:00Z" } } : {} }), row(cur, { tasks: o.curTasks || {}, data: o.curData || {} })]; const w = world({ now: NOW, month: cur, number: 5, rows: o.rows || rows, ...o }); const d = await MH.readData({ clientId: CID, month: cur, deps: w.d }); return { w, d, v: H.referralView({ ...d, task: w.task(cur, H.ID.REFERRAL) }) }; };
  { const a = await ref(); if (!a.v.ready) fail("30 · an improving number in a report just sent did not offer the ask");
    const none = await ref({ clicks: 100 }); if (none.v.ready) fail("30 · a falling number offered the ask");
    const unsent = await ref({ reportSent: false }); if (unsent.v.ready) fail("30 · an unsent report offered the ask");
    const win = await ref({ clicks: 100, reportSent: false, curTasks: { "m2.win_story.capture": { win: { answer: "yes", draft: "x" } } } }); if (!win.v.ready) fail("30 · a win story they said yes to did not offer the ask");
    const no = await ref({ clicks: 100, reportSent: false, curTasks: { "m2.win_story.capture": { win: { answer: "no", draft: "x" } } } }); if (no.v.ready) fail("30 · a win story they said NO to offered the ask");
    // the press
    const p = (action, body, w = a.w) => MH.act({ clientId: CID, month: cur, action, body, deps: w.d, by: "a@rga.test" });
    if ((await p("referral_send", { confirmedTo: "someone@else.test" })).ok || a.w.sent.length) fail("30 · the ask went to an address the person did not confirm");
    const t = await p("referral_test", { adminEmail: "me@rga.test" }); if (!t.ok || a.w.sent.length !== 1 || a.w.sent[0].to !== "me@rga.test" || !/^\[Test\]/.test(a.w.sent[0].subject) || a.w.task(cur, H.ID.REFERRAL).status === "done") fail("30 · Send me a test did not go to the admin only, or recorded an ask");
    if ((await p("referral_test", { adminEmail: "" })).ok) fail("30 · a test with no admin address was sent");
    a.w.mailFails = true; const f = await p("referral_send", { confirmedTo: "owner@acme.test" }); a.w.mailFails = false; if (f.ok || a.w.task(cur, H.ID.REFERRAL).status === "done") fail("30 · a failed send was recorded as asked");
    const s = await p("referral_send", { confirmedTo: "OWNER@acme.test" }); if (!s.ok || a.w.sent.filter((m) => m.to === "owner@acme.test").length !== 1 || a.w.task(cur, H.ID.REFERRAL).status !== "done") fail("30 · the confirmed send did not go once and record");
    const again = await ref({ curTasks: { [H.ID.REFERRAL]: { status: "done", referral_sent: { at: "2026-05-06T10:00:00Z", to: "x" } } } }); if (!again.v.asked || again.v.ready) fail("30 · a second ask is offered in the same quarter");
    const old = await ref({ rows: [row(M(3), { closed: true, frozen: frozen({ clicks: 150, pk: 140 }), tasks: { [H.ID.REFERRAL]: { referral_sent: { at: "2026-03-06T10:00:00Z" } } } }), row(M(4), { closed: true, frozen: frozen({ clicks: 200, pk: 150 }), tasks: { "m2.report.deliver": { status: "done" } }, data: { report_sent: { at: "x" } } }), row(cur)] }); if (old.v.ready) fail("30 · an ask two months ago does not stop another (once a quarter)");
    const noMail = await ref({ client: { primary_contact_email: "" } }); if (noMail.v.email || (await MH.act({ clientId: CID, month: cur, action: "referral_send", body: { confirmedTo: "" }, deps: noMail.w.d })).ok || noMail.w.sent.length) fail("30 · an ask is sent with no contact email on file");
    const ny = await ref({ clicks: 100, reportSent: false }); if ((await MH.act({ clientId: CID, month: cur, action: "referral_send", body: { confirmedTo: "owner@acme.test" }, deps: ny.w.d })).ok || ny.w.sent.length) fail("30 · the server sent an ask when there was no good moment");
    // the morning run never sends
    const mw = (await ref()).w; await MH.settle({ clientId: CID, month: cur, deps: mw.d }); await MH.settleLetter({ clientId: CID, month: M(3), deps: mw.d }); if (mw.sent.length) fail("30 · the morning run's settle sent an email"); }

  // ── 31 Quarterly letter · 32 Grow the plan · 33 AI search check ──
  const qm = M(6), qrows = (o = {}) => [row(M(4), { closed: true, frozen: frozen({ views: 380, calls: 25, clicks: 150, pv: 360, pc: 20, pk: 140 }) }), row(M(5), { closed: true, frozen: frozen({ views: 400, calls: 28, clicks: 170, pv: 380, pc: 25, pk: 150 }) }),
    row(qm, { frozen: o.frozen || frozen({ views: 450, calls: 33, clicks: 210, pv: 400, pc: 28, pk: 170 }), tasks: o.tasks || { "m2.snap.competitors": { outcome_data: { competitors: [{ name: "Rival Plumbing", rating: 4.8, reviews: 210 }, { name: "Third Co", rating: 4.1, reviews: 40 }] } } } })];
  const qw = (o = {}) => world({ now: "2026-07-03T10:00:00Z", month: qm, numbers: { [qm]: 6, [M(5)]: 5, [M(4)]: 4, [M(3)]: 3, [M(7)]: 7 }, rows: qrows(o), ...o });
  {
    const w = qw(); const r = await MH.settleLetter({ clientId: CID, month: qm, deps: w.d });
    const L = w.data(qm).quarter_letter;
    if (r.state !== "built" || !L || w.task(qm, H.ID.LETTER).status !== "done") fail(`31 · the quarter month's letter was not built (${r.state})`);
    if (w.sent.length) fail("31 · building the letter sent an email (it goes inside the report)");
    if (L && (!L.rows.some((x) => /Search clicks: 150 in April to 210 in June/.test(x.text)) || !L.google_rows.some((x) => /Profile views/.test(x.text)) || L.rows.some((x) => x.google))) fail("31 · the letter's rows are wrong or the Google rows are mixed with the others");
    if (L && !L.competitors.length) fail("31 · the competitor snapshot is not in the letter");
    const again = await MH.settleLetter({ clientId: CID, month: qm, deps: w.d }); if (again.state !== "already") fail("31 · the letter was built twice");
    // it rides inside the one report; the Google-free copy leaves the Google rows out; no em dash
    const playbook = JSON.parse(fs.readFileSync(`${SITE}/data/playbooks/playbooks.json`, "utf8")).month2plus;
    const tasks = { ...w.data(qm).tasks, [H.ID.CHURN]: { status: "skipped", skip_reason: "x" }, [H.ID.GROW]: { status: "done" } };
    const mail = MR.buildMonthlyEmail({ month: qm, monthNumber: 6, frozen: w.data(qm).frozen, client: { business_name: "Acme Plumbing", primary_contact_name: "Sam Rivera" }, playbook, tasks, quarterLetter: L });
    if (!mail.ok || (mail.html.match(/Your quarter/g) || []).length !== 1 || !/Search clicks: 150 in April to 210 in June/.test(mail.html) || !/Rival Plumbing/.test(mail.html)) fail("31 · the report does not carry the quarterly letter once");
    const free = MR.buildMonthlyEmail({ month: qm, monthNumber: 6, frozen: w.data(qm).frozen, client: { business_name: "Acme" }, playbook, tasks, quarterLetter: L, withoutGoogle: true });
    if (/Profile views: /.test(free.html) || !/Search clicks/.test(free.html)) fail("31 · the Google-free copy keeps the Google rows of the letter, or drops the rest");
    if (/Churn risk|Grow the plan|Quarterly letter|AI search check/.test(mail.html)) fail("31 · an Account health or quarter step name leaked into 'What we did' or 'carried'");
    if (/[—–]/.test(mail.html + mail.lines.join("\n"))) fail("31 · an em dash is in the client's letter");
    const noLetter = MR.buildMonthlyEmail({ month: qm, monthNumber: 6, frozen: w.data(qm).frozen, client: { business_name: "Acme" }, playbook, tasks, quarterLetter: null }); if (/Your quarter/.test(noLetter.html)) fail("31 · a report with no letter built still prints a letter");
  }
  { const w = qw({ frozen: frozen({ views: 450, calls: null, clicks: 210, pv: 400, pc: 28, pk: 170 }) }); const r = await MH.settleLetter({ clientId: CID, month: qm, deps: w.d });
    if (r.state !== "waiting" || w.data(qm).quarter_letter) fail("31 · a letter was built with a frozen number missing (the report refuses it too; a missing number is never 0)"); }
  { const w = world({ now: "2026-06-03T10:00:00Z", month: M(5), numbers: { [M(5)]: 5 }, rows: [row(M(4), { closed: true, frozen: frozen({ clicks: 1 }) }), row(M(5), { frozen: frozen({ views: 1, calls: 1, clicks: 1 }) })] }); const r = await MH.settleLetter({ clientId: CID, month: M(5), deps: w.d }); if (r.state !== "not_quarter" || w.data(M(5)).quarter_letter) fail("31 · a letter was built in a month that is not a quarter month"); }
  { // Month 3 (the first quarter): only two frozen months exist; the letter still builds from what is there, and never prints a number it does not have
    const m3 = M(3), w = world({ now: "2026-04-03T10:00:00Z", month: m3, numbers: { [m3]: 3, [M(2)]: 2 }, rows: [row(M(2), { closed: true, frozen: frozen({ views: 300, calls: 20, clicks: 100, pv: null, pc: null, pk: null }) }), row(m3, { frozen: frozen({ views: 330, calls: 22, clicks: 120, pv: 300, pc: 20, pk: 100 }), tasks: {} })] });
    const r = await MH.settleLetter({ clientId: CID, month: m3, deps: w.d }); const L = w.data(m3).quarter_letter;
    if (r.state !== "built" || !L || L.competitors.length || /\bnull\b|undefined|NaN/.test(JSON.stringify(L))) fail("31 · Month 3's letter (two frozen months, no competitor snapshot) did not build clean"); }
  { const w = qw(); await MH.settleLetter({ clientId: CID, month: qm, deps: w.d }); w.rows.find((r) => r.reporting_month === qm).month_status = "closed";
    let threw = false; try { await MH.act({ clientId: CID, month: qm, action: "ai_record", body: { check: JSON.stringify({ question: "q", results: { google_overviews: "came_up", google_ai_mode: "did_not", chatgpt: "did_not", perplexity: "could_not" }, facts: [] }) }, deps: w.d }); } catch (e) { threw = !!e.closedMonth; }
    if (!threw) fail("a closed month · a press on a closed month was accepted (it is read-only)"); }
  { // 32 Grow the plan
    const gw = (o = {}) => world({ now: NOW, month: M(6), number: 6, rows: [row(M(6))], ...o });
    const act = (w, action, body) => MH.act({ clientId: CID, month: M(6), action, body: body || {}, deps: w.d, by: "a@rga.test" });
    const w = gw({ trackedExtra: ["emergency plumber"] }); const s1 = await act(w, "grow_suggest");
    const items = (w.task(M(6), H.ID.GROW).grow || {}).items || [];
    if (!s1.ok || items.length !== 1 || items.some((i) => i.state !== "suggested")) fail(`32 · with one extra search already tracked at most ONE more may be suggested (the cap is ${H.GROW_CAP} in total): ${items.length}`);
    const sent = await act(w, "grow_send"); if (!sent.ok || items[0] === undefined || w.task(M(6), H.ID.GROW).grow.items[0].state !== "sent") fail("32 · the suggestion did not go to the client (For your approval)");
    const key = `${M(6)}|${w.task(M(6), H.ID.GROW).grow.items[0].id}`;
    const dp = w.d; const pend = await MH.clientPending({ clientId: CID, month: M(6), deps: dp }); if (pend.grow.length !== 1 || /id|state/.test(Object.keys(pend.grow[0]).join(",").replace("key", ""))) fail("32 · what waits on the client is not shown in their words");
    const yes = await MH.clientAnswer({ clientId: CID, key, answer: "yes", deps: dp }); if (!yes.ok || w.keywords.length !== 2 || w.task(M(6), H.ID.GROW).grow.items[0].state !== "added") fail("32 · an approved search did not land where _locked-plan reads it");
    const again = await MH.clientAnswer({ clientId: CID, key, answer: "yes", deps: dp }); if (again.ok) fail("32 · the same suggestion was approved twice");
    const full = gw({ trackedExtra: ["a", "b"] }); if ((await act(full, "grow_suggest")).ok) fail("32 · a third extra search was suggested (each is a paid monthly scan)");
    // the cap holds at the client's yes too, even if two were suggested earlier
    const racing = gw(); await act(racing, "grow_suggest"); await act(racing, "grow_send"); racing.keywords.push("x", "y");
    const rk = `${M(6)}|${racing.task(M(6), H.ID.GROW).grow.items[0].id}`; if ((await MH.clientAnswer({ clientId: CID, key: rk, answer: "yes", deps: racing.d })).ok || racing.keywords.length !== 2) fail("32 · the client's yes added a third extra search");
    const no = gw(); await act(no, "grow_suggest"); await act(no, "grow_send"); const nk = `${M(6)}|${no.task(M(6), H.ID.GROW).grow.items[0].id}`; await MH.clientAnswer({ clientId: CID, key: nk, answer: "no", deps: no.d }); if (no.keywords.length || no.task(M(6), H.ID.GROW).grow.items[0].state !== "declined") fail("32 · a no added a search");
    // areas: service-area businesses only, only on a measured edge
    const store = gw({ client: { geography_model: "single_location" }, frontier: { sector: "east", miles: 6, striking: 3, n: 5 } }); if ((await act(store, "grow_area", { place: "Bastrop" })).ok) fail("32 · a storefront business was offered a new area");
    const multi = gw({ client: { geography_model: "multi_location" }, frontier: { sector: "east", miles: 6, striking: 3, n: 5 } }); if ((await act(multi, "grow_area", { place: "Bastrop" })).ok) fail("32 · a multi-location business was offered a new area (the grid is read from one pin)");
    const noEdge = gw({ frontier: null }); if ((await act(noEdge, "grow_area", { place: "Bastrop" })).ok) fail("32 · an area was suggested with no measured edge");
    const sa = gw({ frontier: { sector: "east", miles: 6, striking: 3, n: 5 } }); const ar = await act(sa, "grow_area", { place: "Bastrop" }); if (!ar.ok) fail("32 · a service-area business with a measured edge was refused");
    else { await act(sa, "grow_send"); const ak = `${M(6)}|${sa.task(M(6), H.ID.GROW).grow.items[0].id}`; const ay = await MH.clientAnswer({ clientId: CID, key: ak, answer: "yes", deps: sa.d }); if (!ay.ok || sa.keywords.length || sa.task(M(6), H.ID.GROW).grow.items[0].state !== "approved") fail("32 · an approved area touched the tracked searches, or did not wait for RGA to add it"); }
    for (const biz of ["single_location", "multi_location", null]) { const view = H.growView({ task: {}, business: biz, tracked: 0 }); if (view.byArea || /\barea\b/i.test(view.rows.map((r) => r.title + " " + (r.line || "")).join(" ").replace(/only for businesses that serve customers at their location by area/i, ""))) fail(`32 · a ${biz} card offers a new area`); }
    { const view = H.growView({ task: {}, business: "service_area", tracked: 0 }); if (!view.byArea) fail("32 · a service-area card does not offer a new area"); }
  }
  { // 33 AI search check
    const w = world({ now: NOW, month: M(6), number: 6, rows: [row(M(6))] });
    const bad = await MH.act({ clientId: CID, month: M(6), action: "ai_record", body: { check: "{}" }, deps: w.d }); if (bad.ok) fail("33 · an empty check was recorded");
    const ok = await MH.act({ clientId: CID, month: M(6), action: "ai_record", body: { check: JSON.stringify({ question: "plumber in Austin", results: { google_overviews: "came_up", google_ai_mode: "did_not", chatgpt: "did_not", perplexity: "could_not" }, facts: [] }) }, deps: w.d, by: "a@rga.test" });
    const d = await MH.readData({ clientId: CID, month: M(6), deps: w.d }), v = H.aiView({ task: w.task(M(6), H.ID.AI), aiCard: d.aiCard });
    if (!ok.ok || !v.recorded || !/never a ranking/i.test(JSON.stringify(v.rows)) || /ranked #|#\d|position \d|rank \d/i.test(JSON.stringify(v.rows))) fail("33 · the AI check is not labeled a dated sample, or reads like a ranking");
  }
  // ── every step skipped and undone: the shared Skip applies to all six; settle leaves a skip alone; the views say Skipped ──
  {
    const SK = load("./_step-skip.js"), U = load("../../shared/steps-57-64.js"), PBids = new Set(JSON.parse(fs.readFileSync(`${SITE}/data/playbooks/playbooks.json`, "utf8")).month2plus.map((s) => s.id));
    for (const id of SIX) {
      if (!PBids.has(id) || SK.noSkipWhy(id) || !U.canSkip(id)) fail(`skip · ${id} cannot be skipped`);
      const t0 = { status: "pending" }, sk = SK.applySkip(t0, { action: "skip", reason: "Not for this client", by: "a@rga.test" }), un = SK.applySkip(sk.task || sk, { action: "unskip", by: "a@rga.test" });
      const skTask = sk.task || sk, unTask = un.task || un;
      if (skTask.status !== "skipped" || !skTask.skip_reason) fail(`skip · ${id}: skipping did not record a reason`);
      if (unTask.status !== "pending") fail(`skip · ${id}: Undo did not bring it back as it was`);
    }
    const cw = world({ now: NOW, month: M(5), number: 5, rows: [...decl([200, 120, 60]), row(M(5), { tasks: { [H.ID.CHURN]: { status: "skipped", skip_reason: "paused" }, [H.ID.UPSELL]: { status: "skipped", skip_reason: "n/a" } } })], lastLogin: "2026-04-01T09:00:00Z" });
    const s = await MH.settle({ clientId: CID, month: M(5), deps: cw.d }); if (s.churn !== "skipped" || s.upsell !== "skipped" || cw.task(M(5), H.ID.CHURN).status !== "skipped") fail("skip · the morning run overrode a skipped step");
    const d = await MH.readData({ clientId: CID, month: M(5), deps: cw.d });
    for (const [fn, id] of [[H.churnView, H.ID.CHURN], [H.upsellView, H.ID.UPSELL], [H.referralView, H.ID.REFERRAL], [H.letterView, H.ID.LETTER], [H.growView, H.ID.GROW], [H.aiView, H.ID.AI]]) {
      const v = fn({ ...d, now: Date.now(), task: { status: "skipped", skip_reason: "why" } }); if (v.label !== "Skipped" || !v.done) fail(`skip · ${id}'s card does not say Skipped`);
    }
  }
  // ── a closed past month is read-only: it shows what was recorded, offers nothing to press, and refuses every press ──
  {
    const cw = world({ now: NOW, month: M(5), number: 5, rows: [...decl([200, 120, 60]), row(M(5), { closed: true, tasks: { [H.ID.CHURN]: { status: "done", health: { signals: ["decline", "login"], flagged: true } } } })] });
    const d = await MH.readData({ clientId: CID, month: M(5), deps: cw.d }), v = H.churnView({ ...d, now: Date.now(), task: cw.task(M(5), H.ID.CHURN), closed: true });
    if (!v.closed || v.book || v.note || !/2 signals recorded/.test(v.label)) fail("closed month · churn risk shows today's facts or offers a button on a closed month");
    for (const [action, body] of [["churn_note", { text: "x" }], ["upsell_note", { text: "x" }], ["grow_suggest", {}], ["referral_send", { confirmedTo: "owner@acme.test" }]]) {
      let threw = false, ok = false; try { ok = (await MH.act({ clientId: CID, month: M(5), action, body, deps: cw.d })).ok; } catch (e) { threw = !!e.closedMonth; }
      if (!threw && ok) fail(`closed month · ${action} was accepted on a closed month`);
    }
    for (const fn of [H.upsellView, H.referralView]) { const x = fn({ ...d, task: {}, closed: true }); if (!x.closed || x.ready || x.note) fail("closed month · a card offers an action on a closed month"); }
  }
}

if (F.length) { console.error(`🔴 check-account-health: ${F.length} problem(s)${against ? ` (read from ${against})` : ""}:`); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log(`✅ check-account-health: the old Mature checklist, its endpoint, its live Google read, its Advance target, 'Tell the client' and the setup-era stage-6 cards are gone; ${RULES.length} structural rules caught ${before.length} of today's old pieces and pass on the new shape; steps 28-33 are numbered after 27 and held by universal fixtures (one and many locations, service-area and storefront, no call tracking, Months 3/4/5/6/12, a missing frozen number, no sign-in ever recorded, billing past due, a notice, every step skipped and undone, a closed month)`);
