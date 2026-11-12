#!/usr/bin/env node
// check-tier2-steps-run-themselves.mjs — THE MASTER MAP'S TIER 2 STEPS RUN THEMSELVES, AND RGA KEEPS ITS VETO (approved master map 11-11,
// reference_master_map: "Tier 2 automate"). Runs the SHIPPED code against fakes (a fake database, a fake Google action, a fake email;
// no network, no real client, nothing written to Google, nothing emailed):
//   1 Stage 1b: a signed Standard Plan accepts itself 15 minutes after signing, through a claim on the stage, and the client is told;
//     founding / beta / add-ons / another price / a test client / signed before this shipped / held all wait for RGA's Accept, and say why
//   2 RGA's Hold: admin-auto-accept writes it, reads it back, and the pass then leaves the client alone; the card draws the line + Hold
//   3 Stage 3 → 4: a Google connection that found a service moves the client on (claimed, said); one that found nothing stays in Setup
//   4 Monthly 11 blog posts: once the month is planned the row's check starts by itself ONCE per post slot, a draft goes through step 48's
//     finish, a no-material month stops, a vetoed client / unplanned month / post on its way / 2 live posts never start
//   5 Admin 31 categories: only through admin-gbp-categories, only once the client was SHOWN the exact names, claimed before Google is
//     asked; the week rule retries a day later, anything else is RGA's move; Hold stops it; the internal caller can only check + add
//   6 Admin 26 form tracking: settled by Analytics counting or the client's "it arrived", never while their newest test didn't arrive
//   7 Admin 56 Bing: import only when it copies the truth (verified, facts confirmed, call tracking decided, main number not the tracking
//     number, in any phone format); otherwise copy or wait, with why; the card draws it; the instructions no longer forbid it
//   8 wiring: the schedule, System health, contract-sign opens the window, the cache-busters
// exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = [], fail = (m) => F.push(m);
Object.assign(process.env, { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "k", INTERNAL_FN_SECRET: "s3" });
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));
const read = (r) => fs.readFileSync(path.join(SITE, r), "utf8");
let AAS, AA, AAF, CA, WA, CP, FS, OCB, CAT, SA, A, CS, TOML, MAN, IDX, PB, REC;
try {
  AAS = req(path.join(SITE, "shared/auto-accept.js")); AA = req("./_auto-accept.js"); AAF = req("./admin-auto-accept.js"); CA = req("./_categories-auto.js");
  WA = req("./_website-autorun.js"); CP = req(path.join(SITE, "shared/citation-progress.js")); FS = req(path.join(SITE, "shared/form-settle.js"));
  OCB = req("./oauth-google-callback.js"); CAT = read("netlify/functions/admin-gbp-categories.js"); SA = req("./steps-autopilot.js");
  A = read("admin/admin.js"); CS = read("netlify/functions/contract-sign.js"); TOML = read("netlify.toml"); MAN = req("./_job-manifest.js");
  IDX = read("admin/index.html"); PB = JSON.parse(read("data/playbooks/playbooks.json")); REC = read("netlify/functions/portal-step-recheck.js");
  for (const [n, f] of [["planOf", AAS.planOf], ["sweepAutoAccept", AA.sweepAutoAccept], ["whyNot", CA.whyNot], ["sweepCategories", CA.sweepCategories], ["planMonthlyPost", WA.planMonthlyPost],
    ["monthlyPost", WA.monthlyPost], ["bingImportPlan", CP.bingImportPlan], ["settleOf", FS.settleOf], ["setupAdvanceOf", OCB.setupAdvanceOf], ["categoriesDue", SA.categoriesDue]])
    if (typeof f !== "function") throw new Error(`${n} isn't exported`);
} catch (e) { console.error(`⚠️  INDETERMINATE: couldn't load: ${e.message}`); process.exit(2); }

const NOW = Date.parse("2026-11-11T18:00:00Z"), iso = (ms) => new Date(ms).toISOString(), MIN = 60000;
const PLANS = req("./contract-generate.js").PLANS;
const gen = (addons = {}) => [{ event: "generated_and_sent", at: iso(NOW - 864e5), plan_code: "commit_3mo", addons }];
const C = (o = {}) => ({ id: "k1", client_id: "c1", status: "signed", tier: "commit_3mo", monthly_price: 625, signed_at: iso(NOW - 20 * MIN), audit_log: gen(), ...o });
const CL = (o = {}) => ({ id: "c1", workspace_id: "w1", business_name: "Acme Plumbing", client_portal_stage: "stage_1b_admin_review", source: null, archived_at: null, ...o });

try {
  // ── 1 · the rule ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const w = AAS.windowFor(C(), PLANS, NOW);
  if (!w.standard || Date.parse(w.due_at) !== NOW + 15 * MIN) fail(`a Standard Plan's window isn't 15 minutes (${JSON.stringify(w)})`);
  const NOT = [["founding", C({ tier: "founding" })], ["beta", C({ tier: "beta_unbilled", monthly_price: 0 })], ["done-for-you", C({ tier: "done_for_you", monthly_price: 0 })],
    ["the retired monthly", C({ tier: "monthly" })], ["an extra location", C({ audit_log: gen({ extra_gbp_locations: 1 }), monthly_price: 1125 })], ["Website Lite", C({ audit_log: gen({ website_lite: true }) })],
    ["another price", C({ monthly_price: 500 })], ["no plan details", C({ audit_log: [] })], ["unsigned", C({ status: "sent" })]];
  for (const [what, c] of NOT) { const x = AAS.windowFor(c, PLANS, NOW); if (x.standard || !x.why || /—/.test(x.why)) fail(`${what} accepts itself, or says no why (${JSON.stringify(x)})`); }
  const P = (o) => AAS.planOf({ client: CL(), aa: { ...AAS.windowFor(C(), PLANS, NOW - 20 * MIN) }, contract: C(), plans: PLANS, now: NOW, env: {}, ...o });
  if (P().act !== "accept") fail(`a due Standard Plan doesn't accept (${JSON.stringify(P())})`);
  if (P({ now: NOW - 10 * MIN }).act !== "wait") fail("a Standard Plan inside its 15 minutes accepts early");
  const NONE = [["held", { aa: { ...AAS.windowFor(C(), PLANS, NOW - 20 * MIN), held: { at: iso(NOW), by: "chris@x" } } }], ["signed before this shipped", { aa: null }],
    ["a test client", { client: CL({ source: "test:walk" }) }], ["archived", { client: CL({ archived_at: iso(NOW) }) }], ["already past review", { client: CL({ client_portal_stage: "stage_2_payment" }) }],
    ["switched off", { env: { CONTRACT_AUTO_ACCEPT: "0" } }], ["another contract", { contract: C({ id: "k2" }) }], ["already accepted", { aa: { ...AAS.windowFor(C(), PLANS, NOW - 20 * MIN), accepted: { at: iso(NOW) } } }]];
  for (const [what, o] of NONE) if (P(o).act !== "none") fail(`${what}: accepts by itself (${JSON.stringify(P(o))})`);
  const say = AAS.sayOf(AAS.windowFor(C(), PLANS, NOW), NOW);
  if (!say || say.state !== "waiting" || !/Accepts itself at .* unless you hold it/.test(say.line) || /—/.test(say.line)) fail(`the card's line for a waiting Standard Plan is wrong (${JSON.stringify(say)})`);
  if (AAS.sayOf(null, NOW) !== null) fail("a contract with no window says something on the card");

  // ── 1b · the pass, against a fake database ──────────────────────────────────────────────────────────────────────────────────────
  const fakeDb = (clients, rec, contract, { lose = false } = {}) => {
    const db = { clients: clients.map((c) => ({ ...c })), rec: JSON.parse(JSON.stringify(rec)), patches: [], activity: [], emails: [] };
    db.supa = async (p, init = {}) => {
      const m = (init.method || "GET").toUpperCase(), body = init.body ? JSON.parse(init.body) : null;
      if (p.startsWith("/clients?client_portal_stage=eq.")) return db.clients.filter((c) => c.client_portal_stage === "stage_1b_admin_review");
      if (p.startsWith("/clients?id=eq.") && m === "PATCH") { db.patches.push(p); if (lose || !/client_portal_stage=eq\.stage_1b_admin_review/.test(p)) return [];
        const c = db.clients.find((x) => p.includes(x.id)); if (!c || c.client_portal_stage !== "stage_1b_admin_review") return []; Object.assign(c, body); return [c]; }
      if (p.startsWith("/clients?id=eq.")) return db.clients.filter((x) => p.includes(x.id));
      if (p.startsWith("/client_onboarding_records?client_id=eq.")) return [{ id: "r1", data: db.rec }];
      if (p.startsWith("/client_onboarding_records?id=eq.") && m === "PATCH") { db.rec = body.data; return null; }
      if (p.startsWith("/client_onboarding_records?id=eq.")) return [{ data: db.rec }];
      if (p.startsWith("/client_contracts?")) return contract ? [contract] : [];
      if (p.startsWith("/client_activity")) { db.activity.push(body); return null; }
      throw new Error(`unexpected read ${p}`);
    };
    db.deps = { supa: db.supa, plans: PLANS, env: {}, now: () => NOW, notifyClientStage: async (id, stage) => { db.emails.push({ id, stage }); return { ok: true }; } };
    return db;
  };
  {
    const db = fakeDb([CL()], { tasks: {}, auto_accept: AAS.windowFor(C(), PLANS, NOW - 20 * MIN) }, C());
    const r = await AA.sweepAutoAccept({ deps: db.deps });
    if (r.accepted !== 1 || db.clients[0].client_portal_stage !== "stage_2_payment") fail(`the due Standard Plan wasn't accepted (${JSON.stringify(r)})`);
    if (!db.patches.every((p) => /client_portal_stage=eq\.stage_1b_admin_review/.test(p))) fail("the stage move isn't claimed (no condition on the stage)");
    if (db.emails.length !== 1 || db.emails[0].stage !== "stage_2_payment") fail(`the client wasn't told their first invoice is ready (${JSON.stringify(db.emails)})`);
    if (!db.activity.some((a) => a.kind === "contract_auto_accepted" && /Move back/.test(a.payload.summary))) fail("the accept isn't said on the client's activity (with its undo)");
    if (!(db.rec.auto_accept && db.rec.auto_accept.accepted && db.rec.auto_accept.accepted.by === "RGA (automatic)")) fail("the accept isn't kept on the window");
    const again = await AA.sweepAutoAccept({ deps: db.deps });
    if (again.accepted !== 0 || db.emails.length !== 1) fail("a second pass accepts / emails again");
  }
  {
    const db = fakeDb([CL()], { tasks: {}, auto_accept: AAS.windowFor(C(), PLANS, NOW - 20 * MIN) }, C(), { lose: true });
    const r = await AA.sweepAutoAccept({ deps: db.deps });
    if (r.accepted !== 0 || db.emails.length) fail("a lost claim (RGA pressed Accept first) still emails the client");
  }
  for (const [what, rec] of [["held", { tasks: {}, auto_accept: { ...AAS.windowFor(C(), PLANS, NOW - 20 * MIN), held: { at: iso(NOW), by: "chris@x" } } }], ["signed before this shipped", { tasks: {} }],
    ["a founding plan", { tasks: {}, auto_accept: AAS.windowFor(C({ tier: "founding" }), PLANS, NOW - 20 * MIN) }]]) {
    const db = fakeDb([CL()], rec, C());
    await AA.sweepAutoAccept({ deps: db.deps });
    if (db.patches.length || db.emails.length) fail(`${what}: the pass moved or emailed the client`);
  }
  // ── 2 · Hold ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const db = fakeDb([CL()], { tasks: {}, auto_accept: AAS.windowFor(C(), PLANS, NOW - 5 * MIN) }, C());
    AAF.__useDeps({ ...db.deps, gate: { email: "chris@rga.test" } });
    const res = await AAF.handler({ httpMethod: "POST", body: JSON.stringify({ client_id: "00000000-0000-4000-8000-0000000000c1", action: "hold" }) });
    // the fake keys clients by "c1" in the path; the uuid above contains it
    const j = JSON.parse(res.body);
    if (res.statusCode !== 200 || !(db.rec.auto_accept.held && db.rec.auto_accept.held.by === "chris@rga.test")) fail(`Hold didn't save (${res.statusCode} ${res.body.slice(0, 160)})`);
    if (j.say && j.say.state !== "held") fail("Hold doesn't answer with the held line");
    db.deps.now = () => NOW + 30 * MIN;
    await AA.sweepAutoAccept({ deps: db.deps });
    if (db.patches.length) fail("a held contract was accepted by the pass");
    const rel = await AAF.handler({ httpMethod: "POST", body: JSON.stringify({ client_id: "00000000-0000-4000-8000-0000000000c1", action: "release" }) });
    if (rel.statusCode !== 200 || db.rec.auto_accept.held) fail("Release didn't clear the hold");
    AAF.__useDeps(null);
  }
  if (!/data-aa-act="\$\{aaSay\.state === "held" \? "release" : "hold"\}"/.test(A) || !/rgaAutoAccept\.sayOf\(state\.onboardingData\?\.auto_accept/.test(A)) fail("the Pending review card doesn't draw the line and the Hold control");
  if (!/closest\("\[data-aa-act\]"\)[\s\S]{0,300}classList\.add\("is-busy"\)/.test(A)) fail("Hold doesn't spin while it saves");
  if (!/\.\/_auto-accept"\)\.openWindow\(/.test(CS)) fail("contract-sign doesn't open the window at signing");

  // ── 3 · Setup → Onboarding ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const none = OCB.setupAdvanceOf({ gbp: false, ga4: false, gsc: false }, "me@gmail.test"), one = OCB.setupAdvanceOf({ gbp: false, ga4: true, gsc: false }, "me@gmail.test");
  if (none.go || !/stays in Setup/.test(none.summary)) fail("a connection that found nothing moves the client on");
  if (!one.go || !/Analytics/.test(one.summary) || !/Move back/.test(one.summary)) fail("a connection that found Analytics doesn't move the client on, or doesn't say what it found + the undo");
  if (/—/.test(none.summary + one.summary)) fail("the setup lines use an em dash");
  const OS = read("netlify/functions/oauth-google-callback.js");
  if (!/autoAdvanceSetupToOnboarding\(cfg\.supaUrl, cfg\.supaKey, clientId, \{ found, googleEmail \}\)/.test(OS)) fail("the callback doesn't hand the detected services to the move");
  if (!/clients\?id=eq\.\$\{clientId\}&client_portal_stage=eq\.stage_3_setup/.test(OS)) fail("the Setup → Onboarding move isn't claimed on the stage");
  if (!/say\("stage_auto_advanced"/.test(OS) || !/say\("setup_google_nothing_found", \{ needs_human: true \}\)/.test(OS)) fail("the move (or the stay) isn't said on the client's activity");

  // ── 4 · Monthly blog posts ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const MONTH = "2026-11-01", planned = { "m2.plan.rotating_focus": { status: "done" } };
  const MP = (o = {}) => WA.planMonthlyPost({ tasks: {}, month: MONTH, monthTasks: { ...planned }, now: NOW, client: { id: "c1" }, ...o });
  if (JSON.stringify(MP()) !== JSON.stringify({ act: "mstart", sig: `month:${MONTH}:start1` })) fail(`a planned month doesn't start the post check (${JSON.stringify(MP())})`);
  if (MP({ tasks: { "m1.web.blog_post": { auto_done: { [`month:${MONTH}:start1`]: iso(NOW) } } } }) !== null) fail("the post check starts twice in one slot (a no-material month loops)");
  if (MP({ monthTasks: {} }) !== null) fail("an unplanned month starts the post check");
  if (MP({ monthTasks: null }) !== null) fail("a month not opened starts the post check");
  if (MP({ client: { id: "c1", blog_posts_off_at: iso(NOW) } }) !== null) fail("a client who said no to posts gets a post check");
  if (MP({ monthTasks: { ...planned, "m2.exec.blog_posts": { status: "skipped" } } }) !== null) fail("a skipped month's posts start anyway");
  const ran = iso(NOW - 3600e3), run = { ran_at: ran, outcome_data: { posts: 1, draft: "A post", page_draft: { title: "x" } } };
  const fin = MP({ monthTasks: { ...planned, "m2.exec.blog_posts": run } });
  if (!fin || fin.act !== "mfinish" || fin.sig !== `month:${MONTH}:finish:${ran}`) fail(`a run with a draft isn't read in (${JSON.stringify(fin)})`);
  const noop = MP({ monthTasks: { ...planned, "m2.exec.blog_posts": { ran_at: ran, outcome_data: { posts: 0 } } }, tasks: { "m1.web.blog_post": { auto_done: { [`month:${MONTH}:start1`]: iso(NOW - 2 * 3600e3) } } } });
  if (noop !== null) fail("a run that found no material is retried");
  const live1 = { "m1.web.blog_post": { site_change: { v: "v1", drafted_at: iso(NOW - 4 * 864e5), items: [] }, published: { v: "v1", at: "2026-11-05T10:00:00Z" }, auto_done: { [`month:${MONTH}:start1`]: iso(NOW - 6 * 864e5) } } };
  const two = MP({ tasks: live1, monthTasks: { ...planned, "m2.exec.blog_posts": { ran_at: iso(NOW - 6 * 864e5), outcome_data: { posts: 1, draft: "old" } } } });
  if (!two || two.sig !== `month:${MONTH}:start2`) fail(`the second post's check doesn't start after the first is live (${JSON.stringify(two)})`);
  // the fake database + runner for monthlyPost
  {
    const calls = [], recData = { tasks: {} };
    const d = { now: () => NOW, env: {}, steps: [],
      start: async (id, step, month) => calls.push({ id, step, month }),
      supa: async (p, init = {}) => {
        if (p.startsWith("/client_monthly_records")) return /select=month_status/.test(p) ? [] : [{ data: { tasks: { ...planned } } }];
        if (p.startsWith("/client_onboarding_records?id=eq.") && (init.method || "GET") === "PATCH") { recData.tasks = JSON.parse(init.body).data.tasks; return [{ id: "r1" }]; }
        if (p.startsWith("/client_onboarding_records?id=eq.")) return [{ id: "r1", data: { ...recData } }];
        if (p.includes("information_schema") || p.includes("month_status")) return [];
        return [];
      } };
    const client = { id: "c1", client_portal_stage: "stage_5_monthly", website_url: "https://acme.test" };
    const r0 = await WA.monthlyPost(d, client, { id: "r1", data: { tasks: {} } }, "test", false);
    if (r0 !== null || calls.length) fail("the post check starts on a pass with no room under the model cap");
    const r1 = await WA.monthlyPost(d, client, { id: "r1", data: { tasks: {} } }, "test", true);
    if (!r1 || !r1.model || calls.length !== 1 || calls[0].step !== "m2.exec.blog_posts" || !/^\d{4}-\d{2}-01$/.test(String(calls[0].month))) fail(`the post check isn't started for its month (${JSON.stringify(calls)})`);
    if (!(recData.tasks["m1.web.blog_post"] && Object.keys(recData.tasks["m1.web.blog_post"].auto_done || {}).some((k) => /:start1$/.test(k)))) fail("the start isn't claimed on the post's record before it runs");
    const r2 = await WA.monthlyPost(d, { ...client, client_portal_stage: "stage_4_onboarding" }, { id: "r1", data: { tasks: {} } }, "test", true);
    if (r2 !== null) fail("a Month 1 client gets a Monthly post check");
    // the whole pass (sweepWebsiteSteps) reaches it for a Monthly client with no Month 1 step left to start
    calls.length = 0; recData.tasks = {};
    const sweepD = { ...d, toUs: (x) => x, call: async () => ({ ok: false, status: 500, error: "fake", j: {} }), supa: async (p, init = {}) => {
      if (p.startsWith("/clients?")) return [{ id: "c1", source: null, status: "active", website_url: "https://acme.test", client_portal_stage: "stage_5_monthly", archived_at: null }];
      if (p.startsWith("/client_onboarding_records?client_id=eq.")) return [{ id: "r1", data: { ...recData } }];
      return d.supa(p, init);
    } };
    const sw = await WA.sweepWebsiteSteps({ deps: sweepD, trigger: "test" });
    if (!calls.some((c) => c.step === "m2.exec.blog_posts") || !sw.started) fail(`the website pass never starts the Monthly post check (${JSON.stringify(calls)})`);
  }
  if (!/MONTHLY_REACHED\.includes\(client\.client_portal_stage\) && \(mayModel \|\| acted < ACT_CAP\)/.test(read("netlify/functions/_website-autorun.js"))) fail("the pass doesn't run the monthly post under its caps");
  if (/"m2\.exec\.blog_posts":\s*\{ level: "manual"/.test(A)) fail("admin still labels Monthly blog posts manual");

  // ── 5 · categories ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const plan = ["Emergency plumber", "Drainage service"];
  const T = (t = {}, extra = {}) => ({ "m1.gbp.optimize_categories": { status: "in_progress", outcome_data: { draft: plan.map((n) => `- ${n}`).join("\n") }, client_ok: { names: plan, at: iso(NOW - 864e5) }, ...t }, ...extra });
  const W = (o = {}) => CA.whyNot({ tasks: T(), client: { id: "c1" }, plan, now: NOW, checkDone: true, env: {}, ...o });
  if (W() !== null) fail(`a plan the client saw doesn't go (${W()})`);
  for (const [what, o] of [["not shown to the client", { tasks: T({ client_ok: undefined }) }], ["one name not shown", { tasks: T({ client_ok: { names: [plan[0]], at: iso(NOW) } }) }],
    ["Looks right not pressed", { checkDone: false }], ["held", { tasks: T({ auto_add: { held: { at: iso(NOW), by: "chris@x" } } }) }], ["a test client", { client: { id: "c1", source: "test:walk" } }],
    ["skipped", { tasks: T({ status: "skipped" }) }], ["on Google already", { tasks: T({ published: { after: { additional_categories: plan } } }) }],
    ["verification lost", { tasks: T({}, { "m1.gbp.verify": { reverify: { state: "lost" } } }) }], ["switched off", { env: { CATEGORIES_AUTO_ADD: "0" } }],
    ["tried and refused", { tasks: T({ auto_add: { sig: CA.sigOf(plan), tries: 1, failed: "Small: 4 categories now" } }) }],
    ["a try under way", { tasks: T({ auto_add: { sig: CA.sigOf(plan), tries: 1, at: iso(NOW - 60000) } }) }]])
    if (W(o) === null) fail(`categories go on Google by themselves when ${what}`);
  if (W({ tasks: T({ auto_add: { sig: CA.sigOf(plan), tries: 1, at: iso(NOW - 2 * 3600e3) } }) }) !== null) fail("a try that never came back is never tried again");
  if (W({ tasks: T({ auto_add: { sig: CA.sigOf(["Plumber"]), done: { at: iso(NOW) }, tries: 1 } }) }) !== null) fail("a changed plan isn't new work");
  const wk = CA.afterTry({ sig: "s", tries: 1 }, "s", { ok: false, checks: [{ key: "week", ok: false, label: "One change a week", detail: "Ready Nov 14" }] }, NOW);
  if (!wk.retry_at || wk.failed) fail("the one-change-a-week refusal isn't retried a day later");
  const other = CA.afterTry({ sig: "s", tries: 1 }, "s", { ok: false, error: "Google refused the change: 400" }, NOW);
  if (!other.failed || other.retry_at) fail("a Google refusal isn't RGA's move");
  if (!CA.afterTry({ sig: "s", tries: 1 }, "s", { ok: true, listed: plan }, NOW).done) fail("a success isn't recorded as done");
  {
    const order = [], recState = { id: "r1", data: { tasks: T() } };
    const d = { now: () => NOW, env: {},
      add: async (id) => { order.push(`add:${(recState.data.tasks["m1.gbp.optimize_categories"].auto_add || {}).sig ? "claimed" : "unclaimed"}`); return { ok: true, listed: plan }; },
      supa: async (p, init = {}) => {
        const m = (init.method || "GET").toUpperCase();
        if (p.startsWith("/clients?")) return [{ id: "00000000-0000-4000-8000-0000000000c1", source: null, archived_at: null }];
        if (p.startsWith("/client_onboarding_records?client_id=eq.")) return [{ id: "r1", data: recState.data }];
        if (p.startsWith("/client_onboarding_records?id=eq.") && m === "PATCH") { recState.data = JSON.parse(init.body).data; return [{ data: recState.data }]; }
        if (p.startsWith("/client_onboarding_records?id=eq.")) return [{ data: recState.data }];
        throw new Error(`unexpected ${p}`);
      } };
    // Getting started 3 = the five covered steps done
    for (const id of ["m1.gbp.verify", "m1.gbp.business_facts", "m1.gbp.services_products", "m1.gbp.hours_attributes", "m1.gbp.attributes"]) recState.data.tasks[id] = { status: "done" };
    const r = await CA.sweepCategories({ deps: d });
    if (r.added !== 1 || order.join() !== "add:claimed") fail(`the plan isn't claimed before Google is asked, or wasn't added (${JSON.stringify(r)} ${order})`);
    const r2 = await CA.sweepCategories({ deps: d });
    if (r2.added !== 0 || order.length !== 1) fail("a second pass asks Google again");
  }
  if (!/if \(gate\.internal && !\["check", "add"\]\.includes\(action\)\) return json\(403/.test(CAT)) fail("the internal caller can do more than check + add on admin-gbp-categories");
  if (!/action === "hold" \|\| action === "release"/.test(CAT)) fail("admin-gbp-categories has no Hold / Release");
  if (/googleapis\.com/.test(read("netlify/functions/_categories-auto.js"))) fail("_categories-auto.js talks to Google itself (only admin-gbp-categories may)");

  // ── 6 · form tracking ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  const S = (t, n) => FS.settleOf(t, n);
  if (!S({}, 3).done || S({}, 3).by !== "analytics") fail("Analytics counting a submission doesn't settle form tracking");
  if (!S({ test: { at: iso(NOW), inbox: true } }, null).done) fail("the client's 'it arrived' doesn't settle form tracking");
  if (S({ test: { at: iso(NOW), inbox: false } }, 9).done) fail("a count settles form tracking while the client says RGA's test never arrived (a lead leak behind a tick)");
  if (S({}, 0).done || S({}, null).done) fail("nothing counted settles form tracking");
  if (!/settleOf\(t0\[stepId\], probe\.n90\)\.done/.test(REC)) fail("the nightly re-check doesn't settle form tracking by the shared rule");
  if (!/globalThis\.rgaFormSettle\.settleOf\(t, counted \? d\.n90 : null\)/.test(A)) fail("admin's form card doesn't read the shared rule");

  // ── 7 · Bing import ────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const ok = { "m1.gbp.verify": { status: "done" }, "m1.gbp.business_facts": { status: "done" }, "m1.tracking.call_setup": { status: "declined" } };
  const pk = { read_from: "google", phone: "(424) 242-2040", name: "Acme" };
  const BI = (pack, tasks) => CP.bingImportPlan(pack, tasks);
  if (BI(pk, ok).how !== "import") fail(`a verified, confirmed profile with its own number isn't offered the import (${JSON.stringify(BI(pk, ok))})`);
  const tracked = { ...ok, "m1.tracking.call_setup": { status: "done", tracking: { number: "+1 424-242-2040" } } };
  if (BI(pk, tracked).how !== "copy") fail("Google's main number is the tracking number (another format) and the import is still offered");
  if (BI({ ...pk, phone: "+1 310 555 0100" }, tracked).how !== "import") fail("a tracking number that isn't Google's main number blocks the import");
  for (const [what, p, t, want] of [["the profile wasn't read", { ...pk, read_from: "record" }, ok, "copy"], ["not verified", pk, { ...ok, "m1.gbp.verify": { status: "pending" } }, "copy"],
    ["verification lost", pk, { ...ok, "m1.gbp.verify": { status: "done", reverify: { state: "lost" } } }, "copy"], ["facts not confirmed", pk, { ...ok, "m1.gbp.business_facts": { status: "pending" } }, "wait"],
    ["call tracking undecided", pk, { ...ok, "m1.tracking.call_setup": { status: "pending" } }, "wait"], ["no pack at all", null, ok, "copy"]]) {
    const x = BI(p, t); if (x.how !== want || !x.why || /—/.test(x.why)) fail(`${what}: ${JSON.stringify(x)}, wanted ${want} with a why`);
  }
  const prog = CP.bingAppleProgress({}, { "m1.cit.priority_top10": { outcome_data: { pack: pk, list: { items: [{ key: "bing", source: "Bing Places" }, { key: "apple", source: "Apple Maps" }] } } }, ...ok });
  const bing = prog.rows.find((r) => r.key === "bing"), apple = prog.rows.find((r) => r.key === "apple");
  if (!bing || !bing.import || bing.import.how !== "import" || (apple && apple.import)) fail("the step 56 rows don't carry the import plan (Bing only)");
  if (!/data-bing-import="\$\{escapeAttribute\(r\.import\.how\)\}"/.test(A)) fail("admin's step 56 card doesn't draw the Bing row's import line");
  const pb56 = (PB.month1 || []).find((x) => x.id === "m1.platform.bing_apple");
  if (!pb56 || /Leave any "Import from Google" or listing sync off/.test(pb56.instructions || "")) fail("step 56's instructions still forbid the import");

  // ── 8 · wiring ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  if (!/\[functions\."steps-autopilot"\]\s*\n\s*schedule = "\*\/15 \* \* \* \*"/.test(TOML)) fail("steps-autopilot isn't scheduled every 15 minutes");
  const job = MAN.byName ? MAN.byName("steps-autopilot") : null;
  if (!job || job.cron !== "*/15 * * * *") fail("System health doesn't list steps-autopilot");
  else { const rd = job.read({ contracts: { accepted: 1, waiting: 2, held: 0, manual: 1, failed: 0 }, categories: { added: 0, waiting: 0, failed: 1 }, errors: [] });
    if (rd.count !== 1 || !/1 accepted/.test(rd.note) || !/1 RGA's move/.test(rd.note)) fail(`System health doesn't say what the pass did (${JSON.stringify(rd)})`); }
  if (!SA.categoriesDue(Date.parse("2026-11-11T16:05:00Z")) || SA.categoriesDue(Date.parse("2026-11-11T16:20:00Z")) || SA.categoriesDue(Date.parse("2026-11-11T15:05:00Z"))) fail("the categories lane doesn't run once a day");
  // each file Tier 2 changed must carry Tier 2's ?v= or a LATER one (a later build bumps it again; a merge that puts back an older one is the regression)
  const vOf = (src, file) => { const m = new RegExp(file.replace(/[./]/g, (c) => "\\" + c) + "\\?v=(\\d{8}[a-z]*)").exec(src); return m ? m[1] : ""; };
  const atLeast = (v, min) => v.length >= 8 && (v.slice(0, 8) > min.slice(0, 8) || (v.slice(0, 8) === min.slice(0, 8) && v.slice(8) >= min.slice(8)));
  if (![[IDX, "/admin/admin.js"], [A, "/shared/auto-accept.js"], [A, "/shared/form-settle.js"], [A, "/shared/citation-progress.js"]].every(([src, f]) => atLeast(vOf(src, f), "20261111n"))) fail("a changed browser file kept its old ?v=");
} catch (e) { console.error(`⚠️  INDETERMINATE: ${String(e.stack || e.message).split("\n").slice(0, 3).join(" ")}`); process.exit(2); }
if (F.length) { console.error(`❌ Tier 2 steps: ${F.length} regression(s)`); for (const x of F) console.error(`  · ${x}`); process.exit(1); }
console.log("✅ Tier 2 steps run themselves with RGA's veto: a signed Standard Plan accepts itself after 15 minutes (claimed, said, emailed once; Hold stops it; every other plan waits for Accept with why); Setup moves on when Google found a service; Monthly blog posts start once per slot on the website autopilot; categories go on Google only through admin-gbp-categories once the client saw them (claimed first); form tracking settles by Analytics or the inbox answer, never over a lost test; Bing imports only when it copies the truth");
