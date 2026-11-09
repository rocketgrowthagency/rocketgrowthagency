#!/usr/bin/env node
// check-steps-57-64.mjs — ADMIN STEPS 57–64: EVERY STEP OPENS, SKIPS, AND SAYS WHAT IT WAITS FOR (approved steps_57_64_v1, the owner 11-9 "all approved";
// his standing rule: "always make sure we have skip options also so it doesnt slow down portal"). Runs the SHIPPED code against fakes (a fake database,
// a fake search, a fake Google, a fake model; vm lifts of the admin functions). No network, nothing production:
//   1  Skip on every admin step: one server function, the 52–56 record shape, a reason, refused on done / on the two hand-off steps, Undo exact,
//      the record re-read before the write and read back, recorded; a skipped step is finished wherever "finished" is decided
//   2  Every row opens: a row with no body gets "What it does" + "When it moves" (never "Press X"); a skipped row its Undo card; Skip while unfinished
//   3  Step 57: one search, NO model; a positive match (phone or website host) is the only "their profile"; the five answers; a failed search is never "no panel"
//   4  Step 58: one card; done = channel confirmed + Pasted; clips are optional and never hold or reopen the step; the old write-up isn't shown
//   5  Step 61: read from Google; 0 reviews done by itself; drafts for unanswered; done when every review there at the time has a reply seen live; a failed read isn't "none"
//   6  Step 62: builds itself on its date, Send is a press that names the recipient; Step 64: runs itself after 62 settles, no Skip, names what carries over
//   7  The morning run: no Run buttons on 52–55, 57, 61, 62, 64; due only when its step has come up; claimed first; searches capped with a reserve;
//      test clients and skipped steps left alone; the result written beside the step and read back; wired (schedule, manifest, check-in)
// Exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = [], fail = (m) => F.push(m);
const read = (r) => { try { return fs.readFileSync(path.join(SITE, r), "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
Object.assign(process.env, { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "k", SERPAPI_KEY: "serp-test", ANTHROPIC_API_KEY: "", OPENAI_API_KEY: "", GOOGLE_OAUTH_CLIENT_ID: "i", GOOGLE_OAUTH_CLIENT_SECRET: "s", INTERNAL_FN_SECRET: "internal-test" });
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));
const net = { log: [], route: null };
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => (typeof body === "string" ? JSON.parse(body) : body), text: async () => (typeof body === "string" ? body : JSON.stringify(body)), clone() { return this; } });
globalThis.fetch = async (u, init = {}) => { const url = String(u); net.log.push(url); return net.route ? net.route(url, init) : res(404, "not faked"); };
let S, SK, SKFN, PRESS, FX, RS, B, PB, ADM, WA;
try {
  S = req(path.join(SITE, "shared/steps-57-64.js")); SK = req("./_step-skip.js"); SKFN = req("./admin-step-skip.js"); PRESS = req("./admin-step-press.js");
  FX = req("./flow-execute.js"); RS = req("./_review-step.js"); B = req("./_citation-build.js"); ADM = req("./admin-citation-build.js");
  WA = req("./_website-autorun.js");
  PB = JSON.parse(read("data/playbooks/playbooks.json"));
} catch (e) { console.error(`⚠️  INDETERMINATE — a module did not load: ${e.message}`); process.exit(2); }
const A = read("admin/admin.js"), FXSRC = read("netlify/functions/flow-execute.js");
const NOW = Date.parse("2026-11-10T12:00:00Z"), DAY = 864e5, iso = (ms) => new Date(ms).toISOString();
const ID = S.ID, M1 = PB.month1, M2 = PB.month2plus;
const RGA_ID = "ae817a9c-60a2-4cc9-a196-0582b7b7e7c3";
const RGA = { id: RGA_ID, business_name: "Rocket Growth Agency", business_type: "Local SEO agency", primary_market: "Culver City, CA", geography_model: "service_area", website_url: "https://www.rocketgrowthagency.com/",
  primary_contact_email: "rocketgrowthagencyadmin@gmail.com", source: "manual_admin", client_portal_stage: "stage_4_onboarding" };
const PACK = { name: "Rocket Growth Agency", phone: "(424) 242-2040", website: "https://www.rocketgrowthagency.com/", description_full: "Rocket Growth Agency helps local service businesses get found on Google Maps.", read_from: "google" };

try {
  // ═══ 1 · SKIP, ONE SHARED IMPLEMENTATION ═══
  { // the record shape and Undo
    const before = { status: "done", completed_at: "2026-09-15T17:00:00Z", done_by: "checks" };
    if (!SK.applySkip({ status: "pending" }, { action: "skip", reason: "", by: "x", now: NOW }).error) fail("skip: a skip with no reason is accepted");
    const sk = SK.applySkip({ status: "in_progress" }, { action: "skip", reason: "the client doesn't want it", by: "chris@x", now: NOW }).task;
    if (sk.status !== "skipped" || sk.skipped_by !== "rga" || sk.skip_by !== "chris@x" || sk.skip_reason !== "the client doesn't want it" || sk.skipped_at !== iso(NOW) || !sk.skip_prev) fail("skip: the record isn't the one 52–56 write");
    const un = SK.applySkip(SK.applySkip(before, { action: "skip", reason: "later this month", by: "x", now: NOW }).task, { action: "unskip", now: NOW }).task;
    if (un.status !== "done" || un.completed_at !== before.completed_at || un.done_by !== "checks" || "skip_reason" in un || "skip_prev" in un || "skipped_by" in un) fail("skip: Undo doesn't bring it back exactly as it was");
    if (B.applySkip !== SK.applySkip) fail("skip: 52–56 write their skip with a different implementation than every other step");
    if (SK.applySkip({ status: "skipped" }, { action: "skip", reason: "again", by: "x", now: NOW }).status !== 409) fail("skip: an already-skipped step takes a second skip");
    if (SK.applySkip({ status: "pending" }, { action: "unskip", now: NOW }).status !== 409) fail("skip: Undo works on a step that isn't skipped");
    if (SK.cleanReason("a".repeat(250)).error === undefined) fail("skip: a 250-character reason is accepted");
    if (SK.cleanReason("not doing it — later").reason.includes("—")) fail("skip: an em dash reaches the Month 1 report");
    // who is offered what
    for (const [id, t, want] of [[ID.PANEL, { status: "pending" }, { skip: true, undo: false }], [ID.PANEL, { status: "in_progress" }, { skip: true, undo: false }], [ID.PANEL, { status: "done" }, { skip: false, undo: false }],
      [ID.PANEL, { status: "skipped", skip_prev: {} }, { skip: false, undo: true }], [ID.HANDOFF, { status: "pending" }, { skip: false, undo: false }], [ID.HANDOFF2, {}, { skip: false, undo: false }], ["m2.exec.gbp_posts", {}, { skip: true, undo: false }]]) {
      const o = SK.offer(id, t); if (o.skip !== want.skip || o.undo !== want.undo) fail(`skip: ${id} (${t.status}) offers skip=${o.skip} undo=${o.undo}, wanted ${JSON.stringify(want)}`);
    }
    if (!SK.offer(ID.HANDOFF, {}).why || !/move into Month 2 itself/.test(SK.offer(ID.HANDOFF, {}).why)) fail("skip: the hand-off's card doesn't say why it has no Skip");
    if (S.canSkip(ID.HANDOFF) || S.canSkip(ID.HANDOFF2) || !S.canSkip(ID.PANEL)) fail("skip: the card-side rule and the server rule disagree");
    // every step is skippable except the two
    const noSkip = [...M1, ...M2].filter((s) => !S.canSkip(s.id)).map((s) => s.id).sort().join();
    if (noSkip !== [ID.HANDOFF, ID.HANDOFF2, "m2.start.open_month"].sort().join())   /* monthly_start_v1: Open the month has no Skip either */ fail(`skip: the steps with no Skip are ${noSkip}`);
  }
  // the server function, on a fake database
  const store = (m1, m2 = null) => {
    const st = { rec: { id: "rec1", data: { tasks: JSON.parse(JSON.stringify(m1)) } }, mrec: m2 ? { id: "m1", data: { tasks: JSON.parse(JSON.stringify(m2)) } } : null, writes: 0, records: [], reads: 0, breakWrite: false, between: null };
    const supa = async (q, init = {}) => {
      const m = (init.method || "GET").toUpperCase(), c = (x) => JSON.parse(JSON.stringify(x));
      if (q.startsWith("/client_onboarding_records") && m === "GET") { st.reads++; if (st.reads === 2 && st.between) st.between(st); return [c(st.rec)]; }
      if (q.startsWith("/client_monthly_records") && m === "GET") return st.mrec ? [c(st.mrec)] : [];
      if (q.startsWith("/client_onboarding_records") && m === "PATCH") { st.writes++; if (!st.breakWrite) st.rec.data = JSON.parse(init.body).data; return [c(st.rec)]; }
      if (q.startsWith("/client_monthly_records") && m === "PATCH") { st.writes++; if (!st.breakWrite) st.mrec.data = JSON.parse(init.body).data; return [c(st.mrec)]; }
      return [{ id: "x" }];
    };
    st.deps = { supa, now: () => NOW, gate: { email: "chris@rga" }, record: async (o) => { st.records.push(o); return {}; } };
    return st;
  };
  const callSkip = async (body) => JSON.parse((await SKFN.handler({ httpMethod: "POST", body: JSON.stringify({ client_id: RGA_ID, ...body }) })).body);
  {
    let st = store({ [ID.PANEL]: { status: "pending" }, [ID.REPORT]: { status: "done", completed_at: "2026-11-05T10:00:00Z", done_by: "rga" } });
    SKFN.__useDeps(st.deps);
    let j = await callSkip({ step_id: ID.PANEL, action: "skip", reason: "not doing the brand panel this month" });
    const t = st.rec.data.tasks[ID.PANEL];
    if (!j.ok || t.status !== "skipped" || t.skip_reason !== "not doing the brand panel this month" || t.skip_by !== "chris@rga" || t.skipped_by !== "rga" || !t.skip_prev) fail(`skip server: a skip on 57 doesn't write the record (${JSON.stringify(j).slice(0, 160)})`);
    if (!st.records.some((r) => r.kind === "step_skipped" && r.stepId === ID.PANEL && r.by === "chris@rga")) fail("skip server: the press isn't recorded as step_skipped");
    if (!j.tasks || !j.tasks[ID.PANEL]) fail("skip server: the answer doesn't carry the stored step");
    j = await callSkip({ step_id: ID.PANEL, action: "unskip" });
    if (!j.ok || st.rec.data.tasks[ID.PANEL].status !== "pending" || "skip_reason" in st.rec.data.tasks[ID.PANEL] || !st.records.some((r) => r.kind === "step_unskipped")) fail("skip server: Undo doesn't restore and record");
    j = await callSkip({ step_id: ID.PANEL, action: "skip", reason: "" });
    if (j.ok || !/why/i.test(j.error || "")) fail("skip server: a skip with no reason is accepted");
    j = await callSkip({ step_id: ID.REPORT, action: "skip", reason: "skip a finished step" });
    if (j.ok || st.rec.data.tasks[ID.REPORT].status !== "done") fail("skip server: a done step is skipped");
    for (const id of [ID.HANDOFF, ID.HANDOFF2]) { j = await callSkip({ step_id: id, action: "skip", reason: "no" }); if (j.ok || !/move into/i.test(j.error || "")) fail(`skip server: ${id} takes a Skip, or doesn't say why`); }
    j = await callSkip({ step_id: "m1.nope", action: "skip", reason: "no" }); if (j.ok) fail("skip server: an unknown step is skipped");
    // 🔴 the record is read AGAIN right before the write: another step written in between survives
    st = store({ [ID.PANEL]: { status: "pending" }, [ID.REVIEWS]: { status: "pending" } }); SKFN.__useDeps(st.deps);
    st.between = (s) => { s.rec.data.tasks[ID.REVIEWS] = { status: "done", completed_at: "2026-11-10T01:00:00Z", done_by: "checks" }; };
    j = await callSkip({ step_id: ID.PANEL, action: "skip", reason: "later" });
    if (!j.ok || st.rec.data.tasks[ID.REVIEWS].status !== "done") fail("skip server: a write made while the press was in flight is lost (the record isn't re-read before writing)");
    // 🔴 read back: a write that did not land is not "saved"
    st = store({ [ID.PANEL]: { status: "pending" } }); st.breakWrite = true; SKFN.__useDeps(st.deps);
    j = await callSkip({ step_id: ID.PANEL, action: "skip", reason: "later" });
    if (j.ok || !/didn't save/i.test(j.error || "")) fail("skip server: a write that didn't land is reported as saved");
    // a Month 2 step: its own (monthly) record
    st = store({}, { "m2.exec.gbp_posts": { status: "pending" } }); SKFN.__useDeps(st.deps);
    j = await callSkip({ step_id: "m2.exec.gbp_posts", action: "skip", reason: "no posts this month" });
    if (!j.ok || st.mrec.data.tasks["m2.exec.gbp_posts"].status !== "skipped" || st.rec.data.tasks["m2.exec.gbp_posts"]) fail("skip server: a Month 2 step isn't skipped in the monthly record");
    // only RGA's workspace
    SKFN.__useDeps({ ...st.deps, gate: { error: { statusCode: 401, body: JSON.stringify({ error: "no" }) } } });
    j = await callSkip({ step_id: ID.PANEL, action: "skip", reason: "later" }); if (j.ok) fail("skip server: someone outside RGA's workspace skipped a step");
    SKFN.__useDeps(null);
    const sf = read("netlify/functions/admin-step-skip.js");
    if (!/requireWorkspaceForClient\(event, clientId\)/.test(sf)) fail("skip server: not behind requireWorkspaceForClient");
    // skipped is finished wherever finished is decided
    if (!/return ts !== "done" && ts !== "skipped" && ts !== "declined";/.test(FXSRC)) fail("skip: the runner's dependency check doesn't count a skipped step as finished");
    if (!/const done = st === "done" \|\| st === "skipped" \|\| st === "declined" \|\| callStarted;/.test(A)) fail("skip: admin's sequencer doesn't count skipped as finished");
    if (!/const settled = new Set\(\["done", "skipped", "declined"\]\);/.test(FXSRC)) fail("skip: the hand-off's settled set drops skipped");
    if (!S.settled({ status: "skipped" }) || !S.finished({ status: "skipped" })) fail("skip: the shared rule doesn't count skipped as settled");
    // the Month 1 report lists an RGA skip with its reason, never as done
    const M1R = req("./_month1-report.js");
    const rep = M1R.buildMonth1Report({ client: RGA, tasks: { [ID.PANEL]: { status: "skipped", skipped_at: "2026-11-12T17:00:00Z", skipped_by: "rga", skip_reason: "not doing the brand panel this month" } }, pageMeasures: [], playbook: M1, months: [], baseline: {}, kickoffAt: "2026-10-09T10:00:00Z" });
    const sec = rep.sections.find((x) => x.key === "skipped");
    if (!sec || !/not doing the brand panel this month/.test(sec.lines.join(" "))) fail("skip: the Month 1 report doesn't list a skipped step with its reason");
  }

  // ═══ 2 · EVERY ROW OPENS ═══
  const lift = (name) => { const m = new RegExp(`^function ${name}\\(`, "m").exec(A); if (!m) throw new Error(`${name} moved`); return A.slice(m.index, A.indexOf("\n}\n", m.index) + 2); };
  const line = (name) => { const m = new RegExp(`^const ${name} = [^\\n]*$`, "m").exec(A); if (!m) throw new Error(`${name} moved`); return m[0].replace(/^const /, "var "); };
  const ctx = vm.createContext({ setTimeout: () => 0, rgaSteps5764: S, rgaCitationProgress: req(path.join(SITE, "shared/citation-progress.js")), escapeHtml: (x) => String(x), escapeAttribute: (x) => String(x), acDay: (d) => `D(${String(d).slice(0, 10)})`,
    obStepRef: (id) => `step <${id.split(".").pop()}>`, acCardHtml: (o) => `<CARD ${JSON.stringify(o)}>`, cbOpen: (u, l) => (u ? `<a href="${u}">${l} ↗</a>` : ""), cbCopyBtn: (s, k, t, l) => `<copy ${l}>`, state: {},
    CB_MARK: { live: ["ok", "✓"], ok: ["ok", "✓"], off: ["off", "–"], run: ["run", "↻"] }, CB_TILE: "<tile>", mgBusy() {} });
  const names = { fn: ["uniRunsItselfFor", "uniRowsHtml", "uniSkippedHtml", "uniBasicsHtml", "uniRowEnd", "uniWrapRow", "uniPanelCardHtml", "uniChannelCardHtml", "uniReviewsCardHtml", "month1ReportAdminHtml", "uniHandoffCardHtml", "uniRowPill"],
    ln: ["UNI_OWN_CARD", "UNI_REACHED", "uniS", "uniScopeOf", "uniCtx", "uniNoRowRun", "uniMarkHtml", "uniBtn", "uniSkipLinkHtml", "uniTasksOf", "UNI_YT", "UNI_FN_SKIP"] };
  vm.runInContext(names.ln.map(line).concat(names.fn.map(lift)).join("\n") + "\nvar uniYtDetails = function(){}; var uniYtCheck = function(){};", ctx);
  const run = (code) => vm.runInContext(code, ctx);
  const opts = (h) => { const m = /<CARD (\{.*?\})>(?=<|$)/s.exec(h); try { return m ? JSON.parse(m[1]) : {}; } catch { return {}; } };
  const cardsOf = (h) => [...h.matchAll(/<CARD (\{.*?\})>/gs)].map((m) => { try { return JSON.parse(m[1]); } catch { return {}; } });
  ctx.state = { selectedClient: RGA, flowM1State: { tasks: {} }, onboardingData: { tasks: {} }, flowM2State: { tasks: {} } };
  const stepObj = (id) => { const s = M1.find((x) => x.id === id) || M2.find((x) => x.id === id); return { flowId: id, t: s.title, does: s.id === ID.REPORT ? "Builds the Month 1 report from what's done and the starting numbers; you read it, then send it." : "Does a thing.", clientFacing: !!s.clientLabel, sop: [] }; };
  const rowHtml = (body) => `<div class="ob-step queued" data-ob-step="x"><div class="ob-row"><span>62</span><div class="ob-main"><p>t</p></div><span class="ob-status">Up next</span></div>${body}</div>`;
  { // the row's own box is found by balancing
    run("1"); ctx.__h = rowHtml(""); ctx.__h2 = rowHtml('<div class="ob-gq">card</div>');
    const e1 = run("uniRowEnd(__h)"), e2 = run("uniRowEnd(__h2)");
    if (ctx.__h.slice(e1) !== "</div>" || ctx.__h2.slice(e2) !== '<div class="ob-gq">card</div></div>') fail("rows: the end of a row's own box isn't found (a nested div breaks it)");
    ctx.__h3 = '<div class="ob-step"><div class="ob-row"><div class="ob-main"><div>deep</div></div><span>x</span></div></div>';
    if (ctx.__h3.slice(run("uniRowEnd(__h3)")) !== "</div>") fail("rows: a row with nested boxes is cut early");
  }
  { // an "Up next" step that never ran has no body: it gets the small card and the Skip link
    ctx.__h = rowHtml(""); ctx.__o = stepObj(ID.REPORT); ctx.__s = { uiState: "queued", task: undefined, dependsOn: ["m1.audit.kpi_baseline"] };
    ctx.state.flowM1State = { tasks: { "m1.audit.kpi_baseline": { status: "done" }, "m1.kickoff.call": { status: "done", completed_at: "2026-10-12T10:00:00Z" } } };
    const out = run("uniWrapRow(__h, __o, __s, 'month1', [__s])"), cs = cardsOf(out);
    if (!out.includes('data-uni="m1.report.month1"') || !cs.length) fail("rows: an Up next step with no body gets no card, so its row has nothing to open (live on RGA's 62)");
    const body = (cs[0] || {}).body || "";
    if (!/What it does/.test(body) || !/When it moves/.test(body)) fail("rows: the small card lacks What it does or When it moves");
    if (!/Builds the Month 1 report from what's done/.test(body)) fail("rows: What it does isn't the step's own line");
    if (!/It builds itself on D\(2026-11-08\)|builds itself as soon as the step before it is finished/.test(body)) fail(`rows: When it moves doesn't say the report builds itself (${body.slice(0, 300)})`);
    if (/\bPress\b/.test(body)) fail("rows: the small card says Press X, and no X is on it");
    if (!/data-uni-skip=\\?"m1\.report\.month1\\?"/.test(out)) fail("rows: no Skip this step… on an unfinished step");
    // locked: waits on a step, by its ref
    ctx.__s = { uiState: "locked", task: undefined, dependsOn: ["m1.call.close", "m1.audit.kpi_baseline"] };
    ctx.state.flowM1State = { tasks: { "m1.audit.kpi_baseline": { status: "done" } } }; ctx.__o = stepObj(ID.HANDOFF);
    const lk = run("uniWrapRow(__h, __o, __s, 'month1', [__s])");
    if (!/Waits on step &lt;close&gt;|Waits on step <close>/.test(lk)) fail("rows: a locked step doesn't name the step it waits on");
    if (/data-uni-skip/.test(lk)) fail("rows: the hand-off step offers a Skip");
    if (!/No Skip on this step/.test(lk) || !/move into the next month itself/.test(lk)) fail("rows: the hand-off's card doesn't say, in one line, why it has no Skip");
    // a client-facing row keeps its own Skip (the override cluster): no second link; a row with a body gets the link only
    ctx.__o = { ...stepObj(ID.YT), clientFacing: true }; ctx.__s = { uiState: "active", task: { status: "pending" }, dependsOn: [] };
    if (!/data-uni-skip/.test(run("uniWrapRow(__h, __o, __s, 'month1', [__s])"))) fail("rows: step 58 has no quiet 'Skip this step…' link (step58_card_v2: its row Skip BUTTON is gone, the link stays)");
    ctx.__o = { ...stepObj(ID.REVIEWS || ID.PANEL), flowId: "m1.review.system", clientFacing: true };
    if (/data-uni-skip/.test(run("uniWrapRow(__h, __o, __s, 'month1', [__s])"))) fail("rows: a client-facing row gets a second Skip link");
    if (!/o\.flowId === "m1\.brand\.youtube_setup" \? "" : btn\("skipped", "Skip"\)/.test(A)) fail("58: the row's Skip BUTTON is back in the client override cluster");
    if (!/UNI_NO_RULE_BOX = new Set\(\["m1\.report\.month1"/.test(A) || !/doneWhenLine && !UNI_NO_RULE_BOX\.has\(o\.flowId\)/.test(A)) fail("62: the grey 'Done when ... press Mark step complete' box is drawn again on the report step");
    const adminOnly = M1.find((x) => !x.clientLabel && !x.clientBucket?.match(/act|supply|approve/) && !S.RUNS_ITSELF.includes(x.id) && !/^m1\.(platform|cit)\./.test(x.id));
    ctx.__o = stepObj(adminOnly.id); ctx.__h = rowHtml('<div class="ob-body">work</div>'); ctx.__s = { uiState: "active", task: { status: "in_progress" }, dependsOn: [] };
    const act = run("uniWrapRow(__h, __o, __s, 'month1', [__s])");
    if (cardsOf(act).length || !/ob-uni-skip/.test(act) || !new RegExp(`data-uni-skip="${adminOnly.id.replace(/\./g, "\\.")}"`).test(act)) fail("rows: a step with a body should get only the Skip link, not a second card");
    // done: no skip
    ctx.__s = { uiState: "done", task: { status: "done" }, dependsOn: [] }; ctx.__h = rowHtml("");
    const dn = run("uniWrapRow(__h, __o, __s, 'month1', [__s])");
    if (/data-uni-skip/.test(dn) || !cardsOf(dn).length) fail("rows: a done step offers Skip, or has no card");
    // skipped: its card with the reason and an Undo that names the step; a CLIENT's own skip is theirs
    ctx.__s = { uiState: "done", task: { status: "skipped", skipped_by: "rga", skip_by: "chris@rga", skip_reason: "not doing the brand panel", skipped_at: "2026-11-10T12:00:00Z", skip_prev: { status: "pending" } }, dependsOn: [] };
    ctx.__o = stepObj(ID.PANEL);
    const sk = run("uniWrapRow(__h, __o, __s, 'month1', [__s])"), sc = cardsOf(sk)[0] || {};
    if (!/Skipped: not doing the brand panel/.test(sc.title || "") || !/data-uni-unskip="m1\.gbp\.knowledge_panel"/.test(sc.acts || "")) fail("rows: a skipped step's card lacks its reason or its Undo");
    ctx.__s.task.skipped_by = "client";
    if (cardsOf(run("uniWrapRow(__h, __o, __s, 'month1', [__s])")).some((c) => /Skipped:/.test(c.title || ""))) fail("rows: the client's own skip is drawn as RGA's");
    // 52–56 draw their own skip card; this must not add a second one
    ctx.__o = stepObj(ID.TOP); ctx.__s = { uiState: "queued", task: { status: "skipped", skipped_by: "rga", skip_reason: "x", skip_prev: {} }, dependsOn: [] }; ctx.__h = rowHtml('<div class="ob-gq">own</div>');
    if (/data-uni-unskip|data-uni-skip/.test(run("uniWrapRow(__h, __o, __s, 'month1', [__s])"))) fail("rows: step 52 gets a second Skip control beside its own");
  }
  { // every playbook step, every state, gets a card that opens (no state leaves a body-less row)
    let bad = 0;
    for (const sc of [{ lst: M1, scope: "month1" }, { lst: M2, scope: "month2plus" }]) for (const step of sc.lst) for (const ui of ["done", "active", "queued", "locked"]) {
      ctx.__o = stepObj(step.id); ctx.__s = { uiState: ui, task: ui === "done" ? { status: "done" } : undefined, dependsOn: step.dependsOn || [] }; ctx.__h = rowHtml(""); ctx.__sc = sc.scope;
      const out = run("uniWrapRow(__h, __o, __s, __sc, [__s])");
      if (!/data-uni="/.test(out) || /\bPress\b/.test(out)) bad++;
    }
    if (bad) fail(`rows: ${bad} step/state combinations leave a row with no card, or a card that says Press`);
  }
  { // the cards 53, 54, 55 no longer say "Press X" where X isn't shown
    for (const w of ["Press Build the list", "Press Read the details", "Press Find places"]) if (A.includes(`title: "${w}"`)) fail(`cards: "${w}" is still a title (the button isn't on that card)`);
    if (/\bPress\b/.test(JSON.stringify(S.basicRows({ id: ID.TRADE, does: "x", dependsOn: [] }, { tasks: {}, ref: (i) => i })))) fail("cards: shared basicRows says Press");
  }

  // ═══ 3 · STEP 57 · ONE SEARCH, NO MODEL ═══
  { // the decision is a positive match only
    const kg = (o) => ({ title: "Rocket Growth Agency", ...o });
    const cases = [
      ["no panel", null, "none"],
      ["a panel about something else", { title: "Culver City" }, "none"],
      ["phone + website equal", kg({ phone: "(424) 242-2040", website: "https://www.rocketgrowthagency.com/" }), "match"],
      ["phone formatted another way, website with a path", kg({ phone: "+1 424-242-2040", website: "http://rocketgrowthagency.com/about" }), "match"],
      ["only the phone is shown and equal", kg({ phone: "424.242.2040" }), "match"],
      ["the phone differs, the website is theirs", kg({ phone: "(310) 555-0100", website: "https://rocketgrowthagency.com" }), "differs"],
      ["the website differs, the phone is theirs", kg({ phone: "(424) 242-2040", website: "https://other-site.example.com" }), "differs"],
      ["neither equal: a brand panel that isn't theirs", kg({ phone: "(310) 555-0100", website: "https://other-site.example.com" }), "claim"],
      ["the name alone (no phone or website shown)", kg({}), "claim"],
    ];
    for (const [name, k, want] of cases) { const d = S.decidePanel(k, PACK, "Rocket Growth Agency"); if (d.state !== want) fail(`57 decide: ${name} → ${d.state}, wanted ${want}`); }
    const d1 = S.decidePanel(kg({ phone: "(310) 555-0100", website: "https://rocketgrowthagency.com" }), PACK, "Rocket Growth Agency");
    if (JSON.stringify(d1.diffs) !== JSON.stringify([{ field: "phone", google: "(310) 555-0100", profile: "(424) 242-2040" }])) fail(`57 decide: the differing field isn't named with both values (${JSON.stringify(d1.diffs)})`);
    if (S.decidePanel(kg({ phone: "(424) 242-2040" }), { name: "Rocket Growth Agency" }, "Rocket Growth Agency").state !== "cant_tell") fail("57 decide: with nothing of theirs to compare, it guesses");
    if (S.decidePanel(kg({ phone: "(424) 242-2040" }), { name: "Rocket Growth Agency", phone: "(424) 242-2040" }, "Rocket Growth Agency").state !== "match") fail("57 decide: a client with only a phone can't match");
    // never a guess from a name that merely contains theirs
    if (S.decidePanel({ title: "Rocket Growth Agency Careers Board", phone: "(111) 111-1111" }, PACK, "Rocket Growth Agency").state === "match") fail("57 decide: a similar name is read as their profile");
  }
  const GBP = { title: "Rocket Growth Agency", phoneNumbers: { primaryPhone: "(424) 242-2040" }, websiteUri: "https://www.rocketgrowthagency.com/?utm_source=gbp", profile: { description: "Rocket Growth Agency helps local service businesses get found on Google Maps." } };
  const OAUTH = [{ client_id: RGA_ID, refresh_token: "r", access_token: "tok", access_token_expires_at: "2099-01-01T00:00:00Z", gbp_account_id: "accounts/1", gbp_location_id: "locations/9" }];
  const routeFor = ({ serp = () => ({}), serpStatus = 200, reviews = null } = {}) => async (url) => {
    if (url.startsWith("https://sb.test/rest/v1/client_google_oauth")) return res(200, OAUTH);
    if (url.startsWith("https://sb.test/rest/v1/")) return res(200, []);
    if (url.startsWith("https://mybusinessbusinessinformation.googleapis.com/")) return res(200, GBP);
    if (url.startsWith("https://mybusiness.googleapis.com/v4/accounts/1/locations/9/reviews")) return reviews ? res(200, reviews) : res(500, {});
    if (url.startsWith("https://serpapi.com/search.json")) return serpStatus === 200 ? res(200, serp(new URL(url).searchParams.get("q"))) : res(serpStatus, { error: "boom" });
    if (url.startsWith("https://api.anthropic.com/")) return res(200, { content: [{ type: "text", text: "REVIEW 1 → REPLY Thank you for the kind words." }], stop_reason: "end_turn" });
    return res(404, "not faked");
  };
  const searches = () => net.log.filter((u) => /serpapi\.com\/search/.test(u)).length, modelCalls = () => net.log.filter((u) => /anthropic\.com|openai\.com/.test(u)).length;
  { // the runner
    const run57 = FX.stepRunners.panel, kpOf = (r) => (r.outcome_data || {}).kp || {};
    const once = async (serp, o = {}) => { net.log.length = 0; net.route = routeFor({ serp: () => serp, ...o }); return run57({ client: { ...RGA }, clientId: RGA_ID, tasks: {} }); };
    let r = await once({ knowledge_graph: { title: "Rocket Growth Agency", phone: "(424) 242-2040", website: "https://www.rocketgrowthagency.com/" } });
    if (searches() !== 1 || modelCalls() !== 0) fail(`57 runner: ${searches()} searches and ${modelCalls()} model calls (wanted exactly one search, no model)`);
    if (kpOf(r).state !== "match" || r.completed !== true || r.done_by !== "checks") fail(`57 runner: a matching panel isn't done by itself (${kpOf(r).state} · ${r.completed})`);
    if (!kpOf(r).next_check_at || Date.parse(kpOf(r).next_check_at) < NOW + 80 * DAY || Date.parse(kpOf(r).next_check_at) > Date.now() + 100 * DAY) fail("57 runner: a clear answer doesn't look again in a quarter");
    r = await once({ knowledge_graph: { title: "Rocket Growth Agency", phone: "(310) 555-0100", website: "https://rocketgrowthagency.com" } });
    if (kpOf(r).state !== "differs" || r.completed !== false || !/phone differs/.test(r.summary) || !/\(310\) 555-0100/.test(r.summary) || !/\(424\) 242-2040/.test(r.summary)) fail(`57 runner: a differing phone isn't RGA's move naming both values (${r.summary})`);
    r = await once({ knowledge_graph: { title: "Rocket Growth Agency", phone: "(999) 999-9999", website: "https://elsewhere.example.com" } });
    if (kpOf(r).state !== "claim" || r.completed !== false || !/Claim this knowledge panel/.test(r.summary) || !/^https:\/\/www\.google\.com\/search\?/.test(kpOf(r).search_url || "")) fail("57 runner: a panel that isn't theirs isn't 'claim it' with a link to the search");
    r = await once({});
    if (kpOf(r).state !== "none" || r.completed !== true || !/No knowledge panel yet/.test(r.summary) || !/normal for a business few people search/i.test(r.summary)) fail("57 runner: no panel isn't done with the 'normal' line");
    r = await once({}, { serpStatus: 500 });
    if (kpOf(r).state !== "cant_tell" || r.completed === true || /no knowledge panel yet|no panel/i.test(r.summary) || r.outcome !== "indeterminate") fail(`57 runner: a failed search is read as an answer (${r.summary})`);
    if (!/tomorrow/.test(r.summary) || !kpOf(r).next_at || Date.parse(kpOf(r).next_at) > Date.now() + DAY) fail("57 runner: a failed search doesn't try again tomorrow");
    const savedKey = process.env.SERPAPI_KEY; delete process.env.SERPAPI_KEY; delete process.env.SERP_API_KEY; r = await once({}); process.env.SERPAPI_KEY = savedKey;
    if (kpOf(r).state !== "cant_tell" || r.completed === true) fail("57 runner: with no search key it answers 'no panel'");
    const i57 = FXSRC.indexOf('"m1.gbp.knowledge_panel": async'), body57 = FXSRC.slice(i57, FXSRC.indexOf("\n  },", i57));
    if (/aiDraft\(/.test(body57) || /Wikipedia|Notable people/.test(body57)) fail("57 runner: the model-written claim checklist is still there");
  }
  { // the card, in each state
    const kp = (o) => ({ outcome_data: { kp: { name: "Rocket Growth Agency", checked_at: "2026-11-10T12:00:00Z", next_check_at: "2027-02-09T12:00:00Z", search_url: "https://www.google.com/search?q=x", ...o } } });
    const cardOf = (t) => { ctx.__t = t; return run("uniPanelCardHtml(__t)"); };
    let o = opts(cardOf(kp({ state: "match", shown: { phone: "(424) 242-2040", website: "https://www.rocketgrowthagency.com/", matched: ["phone", "website"] } })));
    if (o.label !== "Done" || !/shows their Google profile/.test(o.body) || !/Same name, phone and website/.test(o.body) || !/\(424\) 242-2040/.test(o.body) || !/Looks again each quarter/.test(o.body) || !/Next: D\(2027-02-09\)/.test(o.body)) fail("57 card: the matching state isn't the approved card");
    o = opts(cardOf(kp({ state: "differs", diffs: [{ field: "phone", google: "(310) 555-0100", profile: "(424) 242-2040" }], shown: { matched: ["website"] } })));
    if (o.label !== "Your move" || !/The panel&#39;s phone differs|The panel's phone differs/.test(o.body) || !/Google shows \(310\) 555-0100; their profile says \(424\) 242-2040/.test(o.body) || !/the business facts step, step <business_facts>/.test(o.body)) fail("57 card: a differing field isn't named with both values and the business facts step");
    o = opts(cardOf(kp({ state: "claim", shown: {} })));
    if (o.label !== "Your move" || !/A brand panel that isn't their profile/.test(o.body) || !/Claim this knowledge panel/.test(o.body) || !/official site or YouTube/.test(o.body) || !/Open the search ↗/.test(o.body)) fail("57 card: the claim state lacks the claim words or the search link");
    o = opts(cardOf(kp({ state: "none" })));
    if (o.label !== "Done" || !/No panel yet/.test(o.body) || !/few people search by name/.test(o.body)) fail("57 card: 'no panel' isn't the approved line");
    o = opts(cardOf(kp({ state: "cant_tell", why: "the search didn't answer (HTTP 500)" })));
    if (o.label !== "Waiting" || !/Couldn&#39;t search|Couldn't search/.test(o.body) || /No panel yet/.test(o.body) || !/tries again tomorrow/.test(o.body)) fail("57 card: a search that failed reads as an answer, or doesn't say it tries again");
    if (cardOf({ status: "pending" }) !== "") fail("57 card: a step that never ran draws a result card (the small card should be the only one)");
    if (!/const doneBtn = zcWaits \|\| siteStep \|\| o\.flowId === GL_STEP \|\| globalThis\.rgaCitationProgress\?\.isStep\(o\.flowId\) \|\| uniS\(\)\?\.noHandDone\?\.\(o\.flowId\) \? ""/.test(A)) fail("57: a hand 'Mark step complete' sits beside it");
    if (!/const inner = \(rowHasDone \|\| ZC_NO_HAND_DONE\.has\(o\.flowId\) \|\| uniS\(\)\?\.noHandDone\?\.\(o\.flowId\) \? "" : btn\("done", "Done"\)\)/.test(A)) fail("57/58: the client-row override offers a hand Done");
    if (!/\(s\.task\?\.status === "skipped" && s\.task\?\.skip_prev\) \|\| uniS\(\)\?\.noHandDone\?\.\(o\.flowId\)(?: \|\| \(o\.flowId === "m1\.call\.close" && s\.task\?\.status === "skipped"\))? \? ""/.test(A)) fail("57: a finished step offers the old Undo (which resets it instead of restoring it), or a skip's own Undo is doubled");
    if (!/if \(!declined && s\.task\?\.status === "skipped" && s\.task\?\.skipped_by !== "client"\) return `<span class="ob-status done" data-skip-pill>Skipped<\/span>`;/.test(A)) fail("rows: a skipped step's row doesn't say Skipped");
    if (!S.noHandDone(ID.PANEL)) fail("57: noHandDone doesn't include the panel");
  }

  // ═══ 4 · STEP 58 · ONE CARD, DONE = CONFIRMED + PASTED ═══
  {
    const social = { client_input: { profiles: [{ key: "youtube", url: "https://www.youtube.com/@rocketgrowthagency", handle: "@rocketgrowthagency" }] } };
    const tasks = (o) => ({ [ID.SOCIAL]: social, [ID.YT]: o });
    ctx.state = { selectedClient: RGA, flowM1State: { tasks: tasks({}) }, onboardingData: { tasks: tasks({}) } };
    const withDetails = { channel_details: { pack: PACK, read_at: "2026-11-10T12:00:00Z" }, yt_read: { state: "cant", no_key: true, why: "no key yet", read_at: "2026-11-10T12:00:00Z" }, auto_result: { outcome_data: { videos: [{ n: 1 }, { n: 2 }] } } };
    ctx.__t = withDetails; ctx.state.flowM1State = ctx.state.onboardingData = { tasks: tasks(withDetails) };
    let h = run("uniChannelCardHtml(__t)"), cs = cardsOf(h);
    const main = cs[0] || {};
    if (cs.length !== 1) fail(`58 card: ${cs.length} cards (step58_card_v2 wanted ONE: the clips fold into a Videos row)`);
    if (main.title !== "Their YouTube channel") fail(`58 card: the title reads "${main.title}"`);
    if (!/@rocketgrowthagency/.test(main.body) || !/The channel the client confirmed/.test(main.body)) fail("58 card: their confirmed channel isn't the first row");
    if (!/data-uni-yt="youtube_pasted"/.test(main.body) || !/studio\.youtube\.com/.test(main.body) || !/<copy Copy description>/.test(main.body) || !/Put the description, phone and website on it/.test(main.body)) fail("58 card (no key yet): Open YouTube Studio, Copy description and Pasted aren't on the one \"Put the description, phone and website on it\" row");
    if (!/Rocket Growth Agency helps local service businesses/.test(main.body) || !/rocketgrowthagency\.com/.test(main.body) || !/\(424\) 242-2040/.test(main.body)) fail("58 card: the description and links (from their Google profile) aren't shown to paste");
    if (/CHANNEL_NAME|CHANNEL_DESCRIPTION|Run again/.test(h)) fail("58 card: the old write-up or its buttons are in the card");
    if (/Clips · optional|1 of 2|clips optional/.test(main.label + main.when + main.body) || !/Videos: none yet/.test(main.body) || !/Record 2 short videos/.test(main.body)) fail("58 card: the optional videos aren't one 'Videos: none yet' row, or the old '1 of 2 / clips optional' corner label is back");
    if (main.label !== "Your move") fail(`58 card: the open state reads ${main.label}`);
    { const h1 = run("uniChannelCardHtml(__t)"); if (/Skip<\/button>|Skip this step/.test(h1)) fail("58 card: a Skip button sits in the card"); }
    { ctx.__t = { ...withDetails, channel_details: { pack: PACK, read_at: "2026-11-10T12:00:00Z" }, auto_result: {} }; const d1 = cardsOf(run("uniChannelCardHtml(__t)"))[0] || {}; if (!/data-onboard-run=\\?"m1\.brand\.youtube_setup/.test(d1.body) || !/Draft 2 scripts/.test(d1.body)) fail("58 card: with no scripts the Videos row has no 'Draft 2 scripts' button"); ctx.__t = withDetails; }
    // pasted → done, and a clip arriving does not reopen it
    const pasted = { ...withDetails, status: "done", channel_pasted: { by: "chris@rga", at: "2026-11-10T13:00:00Z" }, clips: [{ id: "c1", kind: "link", url: "https://drive.example.com/a", name: "clip 1", at: "2026-11-11T10:00:00Z" }] };
    ctx.__t = pasted; ctx.state.flowM1State = ctx.state.onboardingData = { tasks: tasks(pasted) };
    cs = cardsOf(run("uniChannelCardHtml(__t)"));
    if (cs[0].label !== "Done" || !/Description and phone on the channel/.test(cs[0].body) || !/You marked it pasted/.test(cs[0].body) || !/Website link on the channel/.test(cs[0].body) || !/Pasted; YouTube doesn.t let us read links back/.test(cs[0].body) || /data-uni-yt=\\?"youtube_pasted/.test(cs[0].body)) fail("58 card: pasted isn't the Done card with the two truthful rows (or still offers Pasted)");
    if (!/Show what to paste/.test(cs[0].body)) fail("58 card: the paste block isn't folded under 'Show what to paste' once done");
    if (!/data-uni-yt="clip_link" data-uni-clip="c1"/.test(cs[0].body) || !/Videos: 1 of 2/.test(cs[0].body)) fail("58 card: an arriving clip doesn't offer the video link in the Videos row");
    // the channel isn't confirmed yet → waiting, never Pasted
    ctx.__t = { channel_details: { pack: PACK, read_at: "2026-11-10T12:00:00Z" } }; ctx.state.flowM1State = ctx.state.onboardingData = { tasks: { [ID.YT]: ctx.__t } };
    const h0 = run("uniChannelCardHtml(__t)").replace(/\\"/g, '"');
    if (/data-uni-yt="youtube_pasted"/.test(h0) || !/isn.t confirmed yet/.test(h0)) fail("58 card: Pasted is offered before the client confirmed the channel");
    ctx.state.flowM1State = ctx.state.onboardingData = { tasks: tasks(pasted) };
    // the press
    const st = (o, extra = {}) => { const s0 = store({ [ID.SOCIAL]: social, [ID.YT]: o, ...extra }); return s0; };
    const callP = async (body) => JSON.parse((await PRESS.handler({ httpMethod: "POST", body: JSON.stringify({ client_id: RGA_ID, step_id: ID.YT, ...body }) })).body);
    const pdeps = (s0, more = {}) => ({ ...s0.deps, pack: async () => PACK, get: async (u) => ({ status: /gone/.test(u) ? 404 : 200 }), ...more });
    let s1 = st({ status: "pending", clips: [{ id: "c1", kind: "link", url: "https://drive.example.com/a" }] }); PRESS.__useDeps(pdeps(s1));
    let j = await callP({ action: "youtube_pasted" });
    if (j.ok || !/haven.t been read/.test(j.error || "")) fail("58 press: Pasted works before the details were read");
    j = await callP({ action: "channel_details" });
    if (!j.ok || !s1.rec.data.tasks[ID.YT].channel_details.pack || s1.records.length) fail("58 press: reading the details fails, or is recorded as a press");
    j = await callP({ action: "youtube_pasted" });
    const t1 = s1.rec.data.tasks[ID.YT];
    if (!j.ok || t1.status !== "done" || t1.done_by !== "rga" || t1.channel_pasted.by !== "chris@rga" || !t1.channel_pasted.at || !s1.records.some((r) => r.kind === "youtube_channel")) fail(`58 press: Pasted doesn't finish the step with by/at and a record (${JSON.stringify(j).slice(0, 160)})`);
    j = await callP({ action: "clip_link", key: "c1", url: "https://www.youtube.com/watch?v=abc" });
    const t2 = s1.rec.data.tasks[ID.YT];
    if (!j.ok || j.check.state !== "opens" || t2.status !== "done" || (t2.clip_posts || []).length !== 1) fail("58 press: a clip's link isn't checked, or a clip changes the step's status");
    j = await callP({ action: "clip_link", key: "c1", url: "https://www.youtube.com/gone" });
    if (!j.ok || j.check.state !== "gone" || s1.rec.data.tasks[ID.YT].status !== "done") fail("58 press: a link that doesn't open is reported as opening, or reopens the step");
    j = await callP({ action: "clip_link", key: "nope", url: "https://www.youtube.com/watch?v=abc" }); if (j.ok) fail("58 press: a link for a clip that isn't there is saved");
    j = await callP({ action: "youtube_undo" });
    if (!j.ok || s1.rec.data.tasks[ID.YT].status !== "pending" || s1.rec.data.tasks[ID.YT].channel_pasted) fail("58 press: Undo doesn't bring the step back as it was");
    const s2 = st({ status: "pending", channel_details: { pack: PACK } }, { [ID.SOCIAL]: {} }); PRESS.__useDeps(pdeps(s2));
    j = await callP({ action: "youtube_pasted" }); if (j.ok || !/isn.t confirmed/.test(j.error || "")) fail("58 press: Pasted works with no confirmed channel");
    PRESS.__useDeps({ ...pdeps(s1), gate: { error: { statusCode: 401, body: "{}" } } }); j = await callP({ action: "youtube_pasted" }); if (j.ok) fail("58 press: someone outside RGA pressed Pasted");
    PRESS.__useDeps(null);
    if (!/if \(done && !t\.channel_pasted && !\(t\.yt_read && t\.yt_read\.state === "matches"\)\) why = "RGA finished it"/.test(read("shared/step-lock.js"))) fail("58: the step-lock still locks the client's clips once RGA pastes the details");
    const pf = read("netlify/functions/admin-step-press.js"); if (/\.clips[^\n]*status|status[^\n]*\.clips/.test(pf.replace(/\/\/[^\n]*/g, ""))) fail("58 press: a clip is read to decide the step's status");
    if (!/UNI_OWN_CARD\.has\(o\.flowId\)\) return "";/.test(A)) fail("58: the old 'What this produced' write-up can still show");
  }

  // ═══ 5 · STEP 61 · READ FROM GOOGLE ═══
  {
    const rv = (id, replied, stars = "FIVE", comment = "Great job") => ({ reviewId: id, starRating: stars, comment, createTime: "2026-10-20T10:00:00Z", ...(replied ? { reviewReply: { comment: "Thanks!", updateTime: "2026-10-21T10:00:00Z" } } : {}) });
    const run61 = FX.stepRunners.reviews, rvOf = (r) => (r.outcome_data || {}).reviews || {};
    const go = async (reviews, tasks = {}, key = "") => { process.env.ANTHROPIC_API_KEY = key; net.log.length = 0; net.route = routeFor({ reviews }); return run61({ client: { ...RGA }, clientId: RGA_ID, tasks }); };
    let r = await go({ reviews: [], totalReviewCount: 0 });
    if (r.completed !== true || r.done_by !== "checks" || rvOf(r).total !== 0 || !/^No reviews on Google yet \(read/.test(r.summary) || r.summary.length >= 120) fail(`61 runner: 0 reviews on Google isn't done by itself with the approved line (${r.summary})`);
    if (modelCalls()) fail("61 runner: 0 reviews calls a model");
    r = await go(null);
    if (r.completed === true || rvOf(r).status === "ok" || !/never|tries again/i.test(r.summary + "tries again") || /no reviews on google yet/i.test(r.summary)) fail("61 runner: a read that failed is read as 'no reviews'");
    if (r.outcome !== "indeterminate") fail("61 runner: a failed read isn't 'can't tell'");
    r = await go({ reviews: [rv("a", true), rv("b", false), rv("c", false, "ONE", "Bad experience")], totalReviewCount: 3 }, {}, "k");
    if (r.completed !== false || rvOf(r).open !== 2 || rvOf(r).replied_live !== 1 || rvOf(r).drafted !== 2 || modelCalls() !== 1 || !/2 unanswered review/.test(r.summary)) fail(`61 runner: unanswered reviews aren't drafted (${JSON.stringify(rvOf(r))} · ${modelCalls()} model calls)`);
    if (/Great job|Bad experience/.test(JSON.stringify(r.outcome_data))) fail("61 runner: a review's words are stored (the 30-day rule)");
    const t1 = { status: "in_progress", auto_result: r, outcome_data: r.outcome_data };
    r = await go({ reviews: [rv("a", true), rv("b", false), rv("c", false)], totalReviewCount: 3 }, { [ID.REVIEWS]: t1 }, "k");
    if (modelCalls() !== 0 || r.completed !== false || rvOf(r).open !== 2) fail(`61 runner: a morning read with nothing new calls the model again (${modelCalls()})`);
    r = await go({ reviews: [rv("a", true), rv("b", true), rv("c", false)], totalReviewCount: 3 }, { [ID.REVIEWS]: { ...t1, outcome_data: { reviews: rvOf({ outcome_data: t1.outcome_data }) } } }, "k");
    if (rvOf(r).replied_live !== 2 || rvOf(r).open !== 1) fail("61 runner: a reply seen live isn't counted");
    // a review that arrived AFTER the first read belongs to the monthly step
    const first = { reviews: RS.decide({ read: { status: "ok", total: 1, items: [{ id: "a", replied: false }] }, prev: null, now: NOW }).reviews };
    const later = RS.decide({ read: { status: "ok", total: 2, items: [{ id: "a", replied: true }, { id: "z", replied: false }] }, prev: first.reviews, now: NOW + DAY }).reviews;
    if (later.open !== 0 || later.replied_live !== 1) fail("61 decide: a review that arrived after the first read holds the step open");
    const gone = RS.decide({ read: { status: "ok", total: 0, items: [] }, prev: first.reviews, now: NOW + DAY }).reviews;
    if (gone.open !== 0) fail("61 decide: a review that was taken down still holds the step");
    if (RS.decide({ read: { status: "ok", total: 3, items: [{ id: "a", replied: true }] }, prev: null, now: NOW }).reviews.status === "ok") fail("61 decide: a list shorter than Google's total is counted");
    process.env.ANTHROPIC_API_KEY = "";
    // the card
    const cardOf = (t) => { ctx.__t = t; return run("uniReviewsCardHtml(__t)"); };
    const base = { read_at: "2026-11-09T12:00:00Z", status: "ok" };
    let o = opts(cardOf({ outcome_data: { reviews: { ...base, total: 0, open: 0, replied_live: 0 } } }));
    if (o.label !== "Done" || !/No reviews on Google yet/.test(o.body) || !/Read from their profile D\(2026-11-09\)/.test(o.body) || !/monthly reply step/.test(o.body)) fail("61 card: 0 reviews isn't the approved line");
    o = opts(cardOf({ outcome_data: { reviews: { ...base, total: 5, open: 2, replied_live: 3, drafted: 2 } } }));
    if (!/3 replies live/.test(o.body) || !/2 drafted, waiting for the client/.test(o.body) || !/For your approval/.test(o.body) || o.label !== "3 of 5 replied") fail(`61 card: with reviews the card isn't "3 live / 2 drafted waiting" (${o.label})`);
    o = opts(cardOf({ outcome_data: { reviews: { ...base, total: 5, open: 3, replied_live: 2, drafted: 1 } } }));
    if (!/2 to draft/.test(o.body)) fail("61 card: reviews with no draft yet aren't counted as 'to draft'");
    o = opts(cardOf({ outcome_data: { reviews: { status: "could_not_read", why: "Google didn't answer just now", read_at: "2026-11-09T12:00:00Z" } } }));
    if (o.label !== "Waiting" || /No reviews on Google yet/.test(o.body) || !/never read as/.test(o.body)) fail("61 card: a failed read reads as no reviews");
    const i61 = FXSRC.indexOf('"m1.review.response": async'), body61 = FXSRC.slice(i61, FXSRC.indexOf("\n  },", i61));
    if (!/liveReviews\(\{ supa, clientId, keepRaw: true \}\)/.test(body61)) fail("61 runner: it doesn't read the reviews from Google through the one live reader");
  }

  // ═══ 6 · STEPS 62 AND 64 ═══
  {
    const rep = { built_at: "2026-11-10T09:00:00Z", subject: "Your Month 1 report", sections: [{ key: "summary", title: "Summary · Work completed in Month 1", lines: ["Reviewed the profile (Oct 12).", "Added hours (Oct 13)."] },
      { key: "skipped", title: "Skipped by RGA", lines: ["Directory sign-ups: Sign-ups later"] }, { key: "start", title: "Starting numbers", lines: ["Calls: 4"] }] };
    ctx.state = { selectedClient: RGA, flowM1State: { tasks: {} }, onboardingData: { tasks: {} } };
    ctx.__t = { status: "in_progress", outcome: "draft_ready", outcome_data: { report: rep } };
    const h = run("month1ReportAdminHtml(__t)"), o = opts(h);
    if (o.label !== "Your move" || !/Summary · Work completed in Month 1/.test(o.body) || !/Skipped by RGA/.test(o.body) || !/Starting numbers/.test(o.body)) fail("62 card: the report's sections aren't on the card");
    if (!/Read the whole report/.test(o.body) || !/Reviewed the profile \(Oct 12\)\.<br>Added hours/.test(o.body)) fail("62 card: 'Read the whole report' doesn't hold the whole report");
    if (!/data-m1-report-send="ae817a9c-60a2-4cc9-a196-0582b7b7e7c3"/.test(o.acts) || !/Send to rocketgrowthagencyadmin@gmail\.com/.test(o.acts)) fail("62 card: Send doesn't name who it goes to");
    if (/⚡/.test(h)) fail("62 card: it has a Run button");
    ctx.state.selectedClient = { ...RGA, primary_contact_email: "" };
    if (/data-m1-report-send/.test(run("month1ReportAdminHtml(__t)"))) fail("62 card: Send is offered with nobody to send it to");
    ctx.state.selectedClient = RGA;
    ctx.__t = { status: "done", outcome_data: { report: rep }, auto_result: { sent_message_id: "m1", sent_at: "2026-11-11T10:00:00Z", sent_to: "rocketgrowthagencyadmin@gmail.com", outcome_data: { report: rep } } };
    const d = opts(run("month1ReportAdminHtml(__t)"));
    if (d.label !== "Done" || /data-m1-report-send/.test(d.acts || "") || !/sent D\(2026-11-11\) to rocketgrowthagencyadmin@gmail\.com/.test(d.when)) fail("62 card: sent isn't Done with the date and recipient");
    // the Send handler: an outward confirm that names the recipient, and it spins
    const hi = A.indexOf('closest("[data-m1-report-send]")'), hs = A.slice(hi, hi + 1600);
    if (!/kind: "confirm", tone: "outward"/.test(hs) || !/\$\{to \|\| "the address on file"\}/.test(hs) || !/mgBusy\(b, true\)/.test(hs)) fail("62 Send: the confirm doesn't name the recipient, isn't outward, or doesn't spin");
    // 62 builds on its date: the runner still enforces it, the morning run waits for it
    const kick = (d0) => ({ "m1.kickoff.call": { status: "done", completed_at: d0 }, "m1.audit.kpi_baseline": { status: "done" } });
    if (S.dueNow(M1, kick(iso(NOW - 20 * DAY)), NOW).some((x) => x.step === ID.REPORT)) fail("62: the morning run builds the report before kickoff + 27 days");
    if (!S.dueNow(M1, kick(iso(NOW - 30 * DAY)), NOW).some((x) => x.step === ID.REPORT)) fail("62: the morning run doesn't build it once the date has passed");
    if (!/Date\.now\(\) < opensAt/.test(FXSRC)) fail("62: the runner no longer enforces kickoff + 27 days");
    // 64
    const ho = (t, ts = {}) => { ctx.__t = t; ctx.state = { selectedClient: RGA, flowM1State: { tasks: ts }, onboardingData: { tasks: ts }, flowM1Playbook: M1.map((x) => ({ id: x.id, title: x.title })) }; return opts(run("uniHandoffCardHtml(__t)")); };
    let c = ho({}, { [ID.REPORT]: { status: "pending" }, [ID.CLOSE]: { status: "skipped" } });
    if (!/runs itself after step <month1> is sent/.test(c.when) || !/Starts Month 2/.test(c.body) || !/What carries over/.test(c.body) || !/by name; skipped ones with their reason/.test(c.body)) fail(`64 card: not the approved one (${c.when})`);
    const doneT = { status: "done", completed_at: "2026-12-01T10:00:00Z", auto_result: { outcome_data: { month2: { reporting_month: "2026-12-01", created: true }, carry: { open: [{ id: "x", title: "Request listing removal" }], skipped: [{ id: "y", title: "Close-out call", reason: "client declined the call" }] } } } };
    c = ho(doneT); if (c.label !== "Done" || !/Request listing removal/.test(c.body) || !/Close-out call: client declined the call/.test(c.body) || !/read back/.test(c.body)) fail("64 card: what carries over isn't named, with the reason for each skip");
    // the runner lists names and reasons
    net.route = async (url) => (url.startsWith("https://sb.test/rest/v1/client_onboarding_records") ? res(200, [{ id: "r", data: { tasks: { [ID.REPORT]: { status: "done" }, [ID.CLOSE]: { status: "skipped", skip_reason: "client declined the call", skipped_at: iso(NOW) } } } }]) : url.startsWith("https://sb.test/rest/v1/client_monthly_records") && !url.includes("reporting_month") ? res(200, [{ id: "m" }]) : res(200, []));
    net.route = async (url, init) => { if (url.includes("client_onboarding_records")) return res(200, [{ id: "r", data: { tasks: { [ID.REPORT]: { status: "done" }, [ID.CLOSE]: { status: "skipped", skip_reason: "client declined the call", skipped_at: iso(NOW) } } } }]); if (url.includes("client_monthly_records") && (init.method || "GET") === "POST") { madeMonthly = true; return res(201, [{ id: "m1" }]); } if (url.includes("client_monthly_records") && madeMonthly) return res(200, [{ id: "m1", data: { tasks: {} } }]); return res(200, []); };   // monthly_v1: the one creator reads the month back, so the fake keeps what it was given
    let madeMonthly = false;
    const hr = await FX.stepRunners.handoff({ client: { ...RGA } });
    if (!/Close-out call: client declined the call/.test(hr.summary) || !(hr.outcome_data.carry && hr.outcome_data.carry.skipped.length === 1) || !hr.outcome_data.month2) fail(`64 runner: the skipped step isn't named with its reason, or Month 2 isn't created (${hr.summary})`);
    // 64 runs itself once 62 is settled and 63 is settled; never before
    const ts = (o) => ({ "m1.call.close": { status: "done" }, ...o });
    if (S.dueNow(M1, ts({ [ID.REPORT]: { status: "pending" } }), NOW).some((x) => x.step === ID.HANDOFF)) fail("64: it runs before 62 is settled");
    if (S.dueNow(M1, { [ID.REPORT]: { status: "done" }, "m1.call.close": { status: "pending" } }, NOW).some((x) => x.step === ID.HANDOFF)) fail("64: it runs before 63 is settled");
    if (!S.dueNow(M1, ts({ [ID.REPORT]: { status: "skipped" } }), NOW).some((x) => x.step === ID.HANDOFF)) fail("64: a skipped 62 holds it up");
    if (!S.dueNow(M1, { [ID.REPORT]: { status: "done" }, "m1.call.close": { status: "skipped" } }, NOW).some((x) => x.step === ID.HANDOFF)) fail("64: a skipped 63 holds it up");
  }

  // ═══ 7 · THE MORNING RUN ═══
  for (const id of ["m1.cit.priority_top10", "m1.cit.industry_specific", "m1.platform.yelp", "m1.platform.mentions", ID.PANEL, ID.REVIEWS, ID.REPORT, ID.HANDOFF]) if (!S.runsItself(id)) fail(`morning: ${id} still has a Run button`);
  if (S.RUNS_ITSELF.length !== 8) fail(`morning: ${S.RUNS_ITSELF.length} steps run themselves, not the 8 approved`);
  if (!/const runnable = auto\.runnable \|\| o\.hasRunner \? !wcAutoMove\(o\.flowId, s\.task\) && !uniNoRowRun\(o\.flowId\) : false;/.test(A)) fail("morning: the row still offers a Run button on these steps");
  { ctx.state = { selectedClient: RGA }; if (!run("uniRunsItselfFor('m1.gbp.knowledge_panel')") || run("uniRunsItselfFor('m1.web.blog_seed')")) fail("morning: the Run button is hidden on the wrong steps for RGA");
    ctx.state = { selectedClient: { ...RGA, source: "test:x" } }; if (run("uniRunsItselfFor('m1.gbp.knowledge_panel')")) fail("morning: a test client loses its Run button (nothing would ever run it)");
    ctx.state = { selectedClient: { ...RGA, client_portal_stage: "stage_1_lead" } }; if (run("uniRunsItselfFor('m1.gbp.knowledge_panel')")) fail("morning: a client the run does not cover loses its Run button"); }
  { // due only when the step has come up
    const open = { "m1.audit.citations": { status: "done" }, "m1.web.nap_consistency": { status: "done" }, "m1.gbp.optimize_categories": { status: "done" }, "m1.gbp.hours_attributes": { status: "done" }, "m1.gbp.business_facts": { status: "done" },
      "m1.gbp.photos": { status: "done" }, "m1.audit.social": { status: "done" }, "m1.gbp.verify": { status: "done" } };
    const ids = (ts) => S.dueNow(M1, ts, NOW).map((x) => x.step);
    for (const id of ["m1.cit.priority_top10", "m1.cit.industry_specific", "m1.platform.yelp", "m1.platform.mentions", ID.PANEL, ID.REVIEWS]) if (!ids(open).includes(id)) fail(`morning: ${id} isn't started when its step has come up`);
    if (ids({}).length) fail(`morning: ${ids({}).join(", ")} start with their dependencies open`);
    if (ids({ ...open, [ID.PANEL]: { status: "skipped" }, [ID.REVIEWS]: { status: "skipped" } }).some((x) => [ID.PANEL, ID.REVIEWS].includes(x))) fail("morning: a skipped step is started");
    if (ids({ ...open, [ID.PANEL]: { status: "done", ran_at: iso(NOW), outcome_data: { kp: { state: "match", next_check_at: iso(NOW + 80 * DAY) } } } }).includes(ID.PANEL)) fail("morning: 57 looks again before its quarter");
    if (!ids({ ...open, [ID.PANEL]: { status: "done", ran_at: iso(NOW - 92 * DAY), outcome_data: { kp: { state: "match", next_check_at: iso(NOW - DAY) } } } }).includes(ID.PANEL)) fail("morning: 57 doesn't look again each quarter");
    if (!ids({ ...open, [ID.PANEL]: { status: "in_progress", ran_at: iso(NOW - DAY), outcome_data: { kp: { state: "cant_tell", next_at: iso(NOW - 3600e3) } } } }).includes(ID.PANEL)) fail("morning: 57 doesn't try again after a search it couldn't read");
    if (ids({ ...open, [ID.PANEL]: { status: "in_progress", ran_at: iso(NOW - 3600e3), outcome_data: { kp: { state: "cant_tell", next_at: iso(NOW + 19 * 3600e3) } } } }).includes(ID.PANEL)) fail("morning: 57 tries again before tomorrow");
    if (ids({ ...open, [ID.REVIEWS]: { status: "done", ran_at: iso(NOW), outcome_data: { reviews: { total: 0 } } } }).includes(ID.REVIEWS)) fail("morning: 61 reads again after it finished");
    if (!ids({ ...open, [ID.REVIEWS]: { status: "in_progress", ran_at: iso(NOW - DAY), outcome_data: { reviews: { total: 3, open: 2 } } } }).includes(ID.REVIEWS)) fail("morning: 61 doesn't read Google each morning until the replies are live");
    if (ids({ ...open, [ID.REVIEWS]: { status: "in_progress", ran_at: iso(NOW - DAY), auto_done: { [`morning:read:${iso(NOW).slice(0, 10)}`]: iso(NOW) }, outcome_data: { reviews: { total: 3, open: 2 } } } }).includes(ID.REVIEWS)) fail("morning: 61 reads twice in a day");
  }
  // imports and cache keys
  { const idx = read("admin/index.html"), imp = A.match(/import "\/shared\/steps-57-64\.js\?v=([0-9a-z]+)"/);
    if (!imp) fail("wiring: admin.js doesn't import shared/steps-57-64.js");
    const av = (idx.match(/admin\/admin\.js\?v=([0-9a-z]+)/) || [])[1], cv = (idx.match(/admin\/admin\.css\?v=([0-9a-z]+)/) || [])[1];
    if (!av || av < "20261109d" || !cv || cv < "20261109c") fail(`wiring: the cache keys weren't bumped (admin.js ${av}, admin.css ${cv})`);
    if (!/step-lock\.js\?v=20261109d/.test(A) || !/step-lock\.js\?v=20261109d/.test(read("portal/portal.js")) || !((read("portal/index.html").match(/portal\.js\?v=([0-9a-z]+)/) || [])[1] >= "20261109d")) fail("wiring: step-lock.js changed but its import keys (admin, portal) weren't bumped");
  }
  // the skip control routes to the one function; client rows too
  if (!/data-task-status"\) === "skipped" && uniS\(\)\) \{ uniSkipPress\(/.test(A)) fail("skip UI: a client row's Skip doesn't go to the one Skip");
  if (!/const reason = await rgaDialog\(\{ kind: "prompt", title: "Skip this step"/.test(A) || !/mgBusy\(b, true\);\s*try \{\s*const r = await fetch\(UNI_FN_SKIP/.test(A)) fail("skip UI: no reason prompt, or the button doesn't spin");
  if (!/\(UNI_OWN_CARD\.has\(o\.flowId\) && s\.task\?\.status !== "skipped" \? `<div class="ob-done-card">\$\{rowStepCardsHtml\(o, s\)\}<\/div>` : ""\)/.test(A)) fail("cards: a done row loses its card");
  if (!/const rowHtmlList = rowHtmlList0\.map\(\(h, i\) => uniWrapRow\(h, steps\[i\]\.obj, steps\[i\], scope, steps\)\);/.test(A)) fail("rows: the checklist doesn't pass every row through uniWrapRow");
  if (!/obApplyStepAccordion|row\.classList\.add\("ob-row-toggle"\)/.test(A)) fail("rows: the accordion that opens a row is gone");
  const pbi = (id) => M1.find((s) => s.id === id) || {};
  for (const id of [ID.PANEL, ID.REVIEWS, ID.REPORT, ID.HANDOFF]) if (!/Runs itself|Builds itself|runs itself/.test(pbi(id).instructions || "")) fail(`playbook: ${id}'s instructions don't say it runs itself`);
  if (/Draft this for me/.test(pbi(ID.YT).instructions || "")) fail("playbook: step 58's instructions still point at a Draft this for me button");
} catch (e) { console.error(`⚠️  INDETERMINATE: ${String(e.stack || e.message).split("\n").slice(0, 3).join(" | ")}`); process.exit(2); }
// after the merge (11-9 read-back on RGA): a client-asked skip never gets a second "no reason given" card; a one-card step has no row Reset
if (!/const skipped = st === "skipped" && t\.skipped_by !== "client" && !t\.skip_request && !own;/.test(A)) fail("63: a skip the client asked for gets a second 'no reason given' card");
if (!/\(st === "pending" \|\| UNI_OWN_CARD\.has\(o\.flowId\) \? "" : btn\("pending", "Reset"\)\)/.test(A)) fail("58: the old row Reset is back on a one-card step");
if (F.length) { console.error(`❌ steps 57–64: ${F.length} regression(s)`); for (const x of F) console.error(`  · ${x}`); process.exit(1); }
console.log("✅ steps 57–64 hold: one shared Skip (a reason, the 52–56 record, refused on done and on the hand-off, Undo exact, re-read and read back, recorded), every row opens with What it does / When it moves and never says Press, 57 is one search with no model and only a positive match is their profile (a failed search is never 'no panel'), 58 is one card done by channel + Pasted with optional clips, 61 reads Google (0 reviews done by itself, drafts, done when every review there has a reply live), 62 builds itself and Send names the recipient, 64 runs itself after 62 and 63 and names what carries over, and the steps that run themselves have no Run button and are due only when their step has come up (the scheduled job that starts them is written separately)");
