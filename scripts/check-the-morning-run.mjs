#!/usr/bin/env node
// check-the-morning-run.mjs — THE MORNING RUN (approved steps_57_64_v1, "Runs itself, everywhere it can", the owner 11-9).
// Runs the SHIPPED netlify/functions/_morning-run.js against FAKES: a fake database and fake runners. No network, no production reads.
//   1 turn rules: a step starts only when every dependsOn is settled (done, skipped or declined counts); done/skipped/declined never; ran once never again
//   2 m1.gbp.knowledge_panel re-runs a quarter after its last run, not before, and never on a run with no date
//   3 m1.handoff.month2 waits for the report (done or skipped; declined is not enough) AND the close call settled
//   4 test clients are out
//   5 the search budget: step 55 (4) and 57 (1) stop below SerpAPI's reserve; an unreadable count spends nothing; CITATION_LIVE_SEARCH=0 spends nothing
//   6 a runner that throws is recorded, never marked done, tried again the next morning; an indeterminate result is not a run
//   7 the day's stamp is read fresh before writing, conditional on the row, and read back; no proof, no start; one start per step per day
//   8 nothing is ever marked done here; the job is wired (manifest, schedule, check-in) and never calls a send
//   9 (master map 11-11) every Month 1 step tagged "Runs itself" has a runner; the audits' turn, retry, To do row, budget (21), read-only 22, 23 on 13, admin 1's record check
// Exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = [], fail = (m) => F.push(m);
const read = (r) => { try { return fs.readFileSync(path.join(SITE, r), "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
Object.assign(process.env, { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "k", SERPAPI_KEY: "serp-test", INTERNAL_FN_SECRET: "x" });
delete process.env.CITATION_LIVE_SEARCH;
globalThis.fetch = async () => { throw new Error("the gate must not touch the network"); };
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));
let M, PB;
try { M = req("./_morning-run.js"); PB = JSON.parse(read("data/playbooks/playbooks.json")).month1; }
catch (e) { console.error(`⚠️  INDETERMINATE — a module did not load: ${e.message}`); process.exit(2); }

const NOW = Date.parse("2026-11-10T14:20:00Z"), DAY = 864e5, iso = (ms) => new Date(ms).toISOString();
const dep = (id) => (PB.find((s) => s.id === id) || {}).dependsOn;
const settle = (ids, status = "done") => Object.fromEntries(ids.map((i) => [i, { status }]));
const ALLDEPS = [...new Set(M.STEPS.flatMap((s) => dep(s) || []))];
const ids = (plan) => plan.map((p) => p.id);
const plan = (tasks, now = NOW) => ids(M.planClient({ tasks, playbook: PB, now }));
for (const s of M.STEPS) if (!dep(s)) { console.error(`⚠️  INDETERMINATE — ${s} is not in the playbook`); process.exit(2); }

// 1 turn rules
{
  const all = settle(ALLDEPS);
  delete all["m1.call.close"]; delete all["m1.audit.kpi_baseline"];
  const p = plan(all);
  for (const s of ["m1.cit.priority_top10", "m1.cit.industry_specific", "m1.platform.yelp", "m1.platform.mentions", "m1.gbp.knowledge_panel", "m1.review.response"]) if (!p.includes(s)) fail(`1: ${s} should start with its dependencies done`);
  if (plan({}).length) fail("1: nothing starts on an empty record");
  const one = settle(dep("m1.cit.industry_specific")); if (!plan(one).includes("m1.cit.industry_specific")) fail("1: industry_specific should start");
  const missing = { ...one, "m1.audit.citations": { status: "pending" } }; if (plan(missing).includes("m1.cit.industry_specific")) fail("1: a dependency that is pending must hold the step");
  const skipDec = { "m1.gbp.optimize_categories": { status: "skipped" }, "m1.gbp.business_facts": { status: "declined" } };
  if (!plan(skipDec).includes("m1.platform.mentions")) fail("1: skipped and declined dependencies count as settled");
  const inprog = { ...skipDec, "m1.gbp.optimize_categories": { status: "in_progress" } }; if (plan(inprog).includes("m1.platform.mentions")) fail("1: in_progress is not settled");
  for (const st of ["done", "skipped", "declined"]) if (plan({ ...skipDec, "m1.platform.mentions": { status: st } }).includes("m1.platform.mentions")) fail(`1: a ${st} step must not start`);
  for (const k of [{ ran_at: iso(NOW - DAY) }, { outcome_data: { a: 1 } }, { auto_result: { summary: "x" } }]) if (plan({ ...skipDec, "m1.platform.mentions": k }).includes("m1.platform.mentions")) fail(`1: a step that ran (${Object.keys(k)[0]}) must not run again`);
  if (!plan({ ...skipDec, "m1.platform.mentions": { status: "error", error: "x", failed_at: iso(NOW - DAY) } }).includes("m1.platform.mentions")) fail("1: a step that failed (no ran_at) tries again");
  if (plan({ ...skipDec, "m1.platform.mentions": { status: "in_progress", started_at: iso(NOW - 600000) } }).includes("m1.platform.mentions")) fail("1: a run that began 10 minutes ago is still running");
  if (!plan({ ...skipDec, "m1.platform.mentions": { status: "in_progress", started_at: iso(NOW - 5 * 3600000) } }).includes("m1.platform.mentions")) fail("1: a run stuck for 5 hours must be tried again");
}
// 2 quarterly step
{
  const base = settle(dep("m1.gbp.knowledge_panel")); const kp = "m1.gbp.knowledge_panel";
  if (!plan(base).includes(kp)) fail("2: first run");
  if (plan({ ...base, [kp]: { status: "done", ran_at: iso(NOW - 80 * DAY) } }).includes(kp)) fail("2: 80 days is inside the quarter");
  if (!plan({ ...base, [kp]: { status: "done", ran_at: iso(NOW - 95 * DAY) } }).includes(kp)) fail("2: 95 days later it runs again, even though it is done");
  if (plan({ ...base, [kp]: { status: "done", auto_result: { summary: "x" } } }).includes(kp)) fail("2: a run with no date is never guessed to be old");
  if (plan({ ...base, [kp]: { status: "skipped", ran_at: iso(NOW - 200 * DAY) } }).includes(kp)) fail("2: a skipped step never re-runs");
  if (plan({ ...base, [kp]: { status: "declined", ran_at: iso(NOW - 200 * DAY) } }).includes(kp)) fail("2: a declined step never re-runs");
  const other = settle(dep("m1.platform.yelp")); if (plan({ ...other, "m1.platform.yelp": { status: "done", ran_at: iso(NOW - 200 * DAY) } }).includes("m1.platform.yelp")) fail("2: only the knowledge panel is quarterly");
}
// 3 handoff waits on the report (62) and the close call (63)
{
  const H = "m1.handoff.month2", R = "m1.report.month1", C = "m1.call.close";
  if (plan({ [R]: { status: "done" } }).includes(H)) fail("3: report done but the close call open must wait");
  if (plan({ [R]: { status: "done" }, [C]: { status: "pending" } }).includes(H)) fail("3: close call pending must wait");
  if (plan({ [C]: { status: "done" } }).includes(H)) fail("3: close call done but no report must wait");
  if (plan({ [C]: { status: "done" }, [R]: { status: "pending" } }).includes(H)) fail("3: report pending must wait");
  if (plan({ [C]: { status: "done" }, [R]: { status: "declined" } }).includes(H)) fail("3: a declined report is not done or skipped");
  if (!plan({ [C]: { status: "done" }, [R]: { status: "done" } }).includes(H)) fail("3: report done + close call done starts the handoff");
  { // the rule itself, not the playbook's dependsOn beside it: with the playbook saying nothing, the run still waits for BOTH
    const bare = PB.map((s) => (s.id === H ? { ...s, dependsOn: [] } : s)), pb = (tasks) => ids(M.planClient({ tasks, playbook: bare, now: NOW }));
    if (pb({ [R]: { status: "done" } }).includes(H) || pb({ [R]: { status: "done" }, [C]: { status: "pending" } }).includes(H)) fail("3: the handoff must wait for the close call itself (not only through the playbook's dependsOn)");
    if (pb({ [C]: { status: "done" } }).includes(H) || pb({ [C]: { status: "done" }, [R]: { status: "pending" } }).includes(H)) fail("3: the handoff must wait for the report itself (not only through the playbook's dependsOn)");
    if (!pb({ [C]: { status: "done" }, [R]: { status: "done" } }).includes(H)) fail("3: with both settled the handoff starts"); }
  if (!plan({ [C]: { status: "skipped" }, [R]: { status: "skipped" } }).includes(H)) fail("3: skipped counts");
  if (!plan({ [C]: { status: "declined" }, [R]: { status: "done" } }).includes(H)) fail("3: a declined close call is settled");
  if (plan({ [C]: { status: "done" }, [R]: { status: "done" }, [H]: { status: "done" } }).includes(H)) fail("3: done handoff never reruns");
  if (!plan({ "m1.audit.kpi_baseline": { status: "done" } }).includes("m1.report.month1")) fail("3: the report starts once its baseline is done");
}
// the fake database and fake runners
function world({ clients, records, left = 100, failStart = {}, patchLoses = 0, lies = false, env = {} }) {
  const log = { reads: [], patches: [], starts: [], records: [], searchCalls: 0 };
  let clock = NOW, loses = patchLoses;
  const recs = JSON.parse(JSON.stringify(records));
  const deps = {
    env, now: () => clock, playbook: () => PB,
    searchesLeft: async () => { log.searchCalls++; return left; },
    start: async (cid, sid) => { log.starts.push(`${cid}/${sid}`); if (failStart[`${cid}/${sid}`]) throw new Error(failStart[`${cid}/${sid}`]); },
    record: async (o) => { log.records.push(o); return { activity: true }; },
    supa: async (p, init = {}) => {
      if (p.startsWith("/clients?")) return clients;
      // today's database without ONBOARDING_PER_KEY_WRITES_2026-11-11.sql: the per-key function is missing, so the whole-record write runs
      // (the per-key path itself is held by check-onboarding-writes-are-per-key)
      if (p.startsWith("/rpc/")) throw new Error('Supabase 404: {"code":"PGRST202","message":"Could not find the function"}');
      const q = new URL("https://x" + p), table = q.pathname.slice(1);
      if (table !== "client_onboarding_records") throw new Error(`unfaked ${p}`);
      const cid = (q.searchParams.get("client_id") || "").replace(/^eq\./, ""), rid = (q.searchParams.get("id") || "").replace(/^eq\./, "");
      const row = recs.find((r) => (cid && r.client_id === cid) || (rid && r.id === rid));
      if (!init.method || init.method === "GET") { log.reads.push(p); return row ? [JSON.parse(JSON.stringify(row))] : []; }
      if (init.method === "PATCH") {
        const cond = q.searchParams.get("updated_at"); log.patches.push({ p, readsBefore: log.reads.length, body: JSON.parse(init.body) });
        if (loses > 0) { loses--; row.updated_at = "changed-by-someone"; return []; }
        if (cond && cond.replace(/^eq\./, "") !== row.updated_at) return [];
        if (lies) return [{ id: row.id }];   // says it wrote; wrote nothing
        row.data = JSON.parse(init.body).data; row.updated_at = JSON.parse(init.body).updated_at; return [{ id: row.id }];
      }
      throw new Error("unfaked method");
    },
  };
  return { deps, log, recs, tick: (ms) => { clock += ms; } };
}
const rec = (cid, tasks) => ({ id: `rec-${cid}`, client_id: cid, updated_at: "u0", data: { tasks } });
const READY = { ...settle(ALLDEPS), "m1.call.close": { status: "pending" }, "m1.audit.kpi_baseline": { status: "pending" } };
const cl = (id, extra = {}) => ({ id, business_name: id, source: null, ...extra });

// 4 test clients out; 7 stamp; read before write; read back
{
  const w = world({ clients: [cl("real"), cl("tst", { source: "test:qa" })], records: [rec("real", READY), rec("tst", READY)] });
  const out = await M.runMorning({ deps: w.deps });
  if (w.log.starts.some((s) => s.startsWith("tst/"))) fail("4: a test client was started");
  if (w.log.reads.some((p) => p.includes("client_id=eq.tst"))) fail("4: a test client's record was even read");
  if (!w.log.starts.some((s) => s.startsWith("real/"))) fail("4: the real client should start");
  const t = w.recs[0].data.tasks;
  if (!out.started || !t["m1.platform.yelp"].morning_run || t["m1.platform.yelp"].morning_run.by !== "morning run") fail("7: the stamp must be on the task and read back");
  for (const s of M.STEPS) if (t[s] && ["done", "skipped", "declined"].includes(t[s].status) && !(READY[s] || {}).status) fail(`8: ${s} was marked ${t[s].status} by the run`);
  if (JSON.stringify(t["m1.gbp.business_facts"]) !== JSON.stringify(READY["m1.gbp.business_facts"])) fail("7: another step's task was touched");
  const p0 = w.log.patches[0];
  if (!p0 || !/updated_at=eq\./.test(p0.p)) fail("7: the write must be conditional on the row not having changed");
  if (!p0 || p0.readsBefore < 2) fail("7: the record must be read fresh right before the write");
  if (!w.log.records.length || w.log.records.some((r) => r.actor !== "system" || r.by !== "morning run")) fail("8: each start is recorded as system / morning run");
  const again = await M.runMorning({ deps: w.deps });
  if (again.started !== 0) fail(`7: a second run in the same day started ${again.started}`);
  w.tick(DAY); const next = await M.runMorning({ deps: w.deps });
  if (next.started !== out.started) fail("6: a run that never produced anything must be tried again next morning");
}
// 7 write that loses the race: reads again; a lie is caught; no proof, no start
{
  const T = { "m1.gbp.business_facts": { status: "done" }, "m1.gbp.optimize_categories": { status: "done" } };
  const w = world({ clients: [cl("a")], records: [rec("a", T)], patchLoses: 1 });
  const out = await M.runMorning({ deps: w.deps });
  if (!out.started || w.log.patches.length < 2) fail("7: a lost race should read again and write on the fresh row");
  const l = world({ clients: [cl("a")], records: [rec("a", T)], lies: true });
  const o2 = await M.runMorning({ deps: l.deps });
  if (l.log.starts.length || o2.started) fail("7: a stamp that did not read back must not start anything");
  if (!o2.failed) fail("7: and it says so");
}
// 5 budget
{
  const T = { "m1.gbp.business_facts": { status: "done" }, "m1.gbp.optimize_categories": { status: "done" }, "m1.gbp.photos": { status: "done" }, "m1.audit.social": { status: "done" }, "m1.gbp.hours_attributes": { status: "done" }, "m1.gbp.verify": { status: "done" } };
  const mk = (n, left, env, tasks = T) => world({ clients: Array.from({ length: n }, (_, i) => cl("c" + i)), records: Array.from({ length: n }, (_, i) => rec("c" + i, tasks)), left, env: env || {} });
  const RES = req("./_citation-build.js").SEARCH_RESERVE; // the shared floor, whatever it is (11-10: _serpapi-reserve.js)
  let w = mk(1, RES + 2); let o = await M.runMorning({ deps: w.deps });
  if (w.log.starts.includes("c0/m1.platform.mentions")) fail("5: 12 left (2 above the reserve) cannot pay for 4 searches");
  if (!w.log.starts.includes("c0/m1.gbp.knowledge_panel")) fail("5: 2 above the reserve can still pay for step 57's 1 search");
  w = mk(1, RES); o = await M.runMorning({ deps: w.deps });
  if (w.log.starts.includes("c0/m1.platform.mentions") || w.log.starts.includes("c0/m1.gbp.knowledge_panel") || o.searches) fail("5: at the reserve nothing spends");
  if (!w.log.starts.includes("c0/m1.platform.yelp") && !w.log.starts.includes("c0/m1.review.response") && !w.log.starts.includes("c0/m1.cit.industry_specific")) fail("5: free steps still start at the reserve");
  w = mk(1, 500, { CITATION_LIVE_SEARCH: "0" }); o = await M.runMorning({ deps: w.deps });
  if (o.searches || w.log.starts.includes("c0/m1.platform.mentions") || w.log.starts.includes("c0/m1.gbp.knowledge_panel")) fail("5: searches off spends nothing");
  w = mk(1, 500); w.deps.searchesLeft = async () => { throw new Error("down"); }; o = await M.runMorning({ deps: w.deps });
  if (o.searches || w.log.starts.includes("c0/m1.platform.mentions")) fail("5: an unreadable count spends nothing");
  w = mk(1, 500); w.deps.searchesLeft = async () => null; o = await M.runMorning({ deps: w.deps });
  if (o.searches) fail("5: a null count spends nothing");
  w = mk(8, 500); o = await M.runMorning({ deps: w.deps });
  if (o.searches > M.RUN_SEARCH_CAP) fail(`5: the morning spent ${o.searches} searches, over its cap of ${M.RUN_SEARCH_CAP}`);
  if (!o.searches) fail("5: with a full budget the paid steps should start");
  if (w.log.searchCalls !== 1) fail(`5: the count is read once per run, not ${w.log.searchCalls}`);
  w = mk(3, RES + 8); o = await M.runMorning({ deps: w.deps });
  if (o.searches > 8) fail(`5: 18 left holds only 8 searches above the reserve, spent ${o.searches}`);
  w = mk(1, 500, {}, { "m1.audit.kpi_baseline": { status: "done" } }); await M.runMorning({ deps: w.deps });
  if (w.log.searchCalls) fail("5: nobody due a paid step, yet the count was read");
}
// 6 a throw is never done
{
  const t0 = { "m1.gbp.business_facts": { status: "done" }, "m1.gbp.optimize_categories": { status: "done" }, "m1.gbp.hours_attributes": { status: "done" } };
  const w = world({ clients: [cl("a")], records: [rec("a", t0)], failStart: { "a/m1.platform.yelp": "the runner answered 500" }, left: 0 });
  const out = await M.runMorning({ deps: w.deps });
  const y = w.recs[0].data.tasks["m1.platform.yelp"];
  if (y.status === "done" || y.completed_at) fail("6: a runner that failed to start was marked done");
  if (!y.morning_run || !/500/.test(y.morning_run.error || "")) fail("6: the failure must be recorded on the step");
  if (!out.failed || !out.errors.some((e) => /yelp/.test(e))) fail("6: and counted");
  if (w.log.records.some((r) => r.stepId === "m1.platform.yelp")) fail("6: a failed start was recorded as started");
  if (!w.log.starts.includes("a/m1.cit.industry_specific") && !w.log.starts.includes("a/m1.review.response")) { /* industry_specific needs the citation audit; yelp is the only step ready here */ }
  const w2 = world({ clients: [cl("a")], records: [rec("a", { ...t0, "m1.audit.citations": { status: "done" } })], failStart: { "a/m1.platform.yelp": "boom" }, left: 0 });
  await M.runMorning({ deps: w2.deps });
  if (!w2.log.starts.includes("a/m1.cit.industry_specific")) fail("6: one step failing must not stop the others");
  w.tick(DAY); w.deps.start = async (c, s) => { w.log.starts.push(`${c}/${s}`); };
  const before = w.log.starts.filter((s) => s === "a/m1.platform.yelp").length;
  const n = await M.runMorning({ deps: w.deps });
  if (w.log.starts.filter((s) => s === "a/m1.platform.yelp").length === before || n.failed) fail("6: the failed step is tried again the next morning");
  const ind = { ...settle(dep("m1.platform.yelp")), "m1.platform.yelp": { status: "in_review", ran_at: iso(NOW - DAY), auto_result: { outcome: "indeterminate" } } };
  if (!plan(ind).includes("m1.platform.yelp")) fail("6: an indeterminate result is retried");
  const good = { ...settle(dep("m1.platform.yelp")), "m1.platform.yelp": { status: "in_review", ran_at: iso(NOW - DAY), auto_result: { outcome: "drafted" } } };
  if (plan(good).includes("m1.platform.yelp")) fail("6: a real result is not run again");
}
// 8 wiring
{
  const man = read("netlify/functions/_job-manifest.js"), toml = read("netlify.toml"), fn = read("netlify/functions/morning-run.js"), core = read("netlify/functions/_morning-run.js");
  const code = core.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n").replace(/\s\/\/ [^\n]*/g, "");
  if (!/job: "morning-run"[\s\S]{0,200}checkin_pending/.test(man)) fail("8: manifest entry with checkin_pending missing");
  const m = /\[functions\."morning-run"\]\s*\n\s*schedule = "([^"]+)"/.exec(toml);
  if (!m) fail("8: netlify.toml schedule missing");
  else if ([...toml.matchAll(/schedule = "([^"]+)"/g)].filter((x) => x[1] === m[1]).length !== 1) fail(`8: schedule ${m[1]} collides with another job`);
  if (!/withCheckin\("morning-run"/.test(fn) || !/exports\.handler = async \(event\) => \{\s*const g = requireCronOrInternal\(event\); if \(g\.error\) return g\.error;/.test(fn)) fail("8: the function must check in and take only the scheduler or internal secret");
  if (/send|mail|resend|smtp/i.test(code)) fail("8: the morning run must never reach a send");
  if (/status:\s*["']done["']/.test(code)) fail("8: the morning run must never write done");
  if (!/flow-execute-heavy-background/.test(code)) fail("8: must go through the same runner as the Run button");
}
// 61 + 57 follow the shared rule's dates (shared/steps-57-64.js dueNow): 61 reads daily until done; 57 keeps its runner's next_at / next_check_at
try {
  const st = (id) => PB.find((x) => x.id === id), all = Object.fromEntries(PB.map((x) => [x.id, { status: "done" }])), at = Date.parse("2026-11-10T14:20:00Z");
  if (M.whyNot(st("m1.review.response"), { ...all, "m1.review.response": { status: "in_progress", ran_at: "2026-11-09T14:20:00Z", outcome_data: { reviews: {} } } }, at) !== null) fail("61 doesn't read Google again the next morning while replies are still to come");
  if (M.whyNot(st("m1.review.response"), { ...all, "m1.review.response": { status: "done", ran_at: "2026-11-09T14:20:00Z", outcome_data: { reviews: {} } } }, at) === null) fail("61 keeps running after it's done");
  if (M.whyNot(st("m1.gbp.knowledge_panel"), { ...all, "m1.gbp.knowledge_panel": { status: "in_progress", ran_at: "2026-11-09T14:20:00Z", outcome_data: { kp: { state: "cant_tell", next_at: "2026-11-10T00:00:00Z" } } } }, at) !== null) fail("57's failed search isn't retried at its next_at");
  if (M.whyNot(st("m1.gbp.knowledge_panel"), { ...all, "m1.gbp.knowledge_panel": { status: "done", ran_at: "2026-11-09T14:20:00Z", outcome_data: { kp: { state: "none", next_check_at: "2027-02-09T00:00:00Z" } } } }, at) === null) fail("57 searches again before its next check");
} catch (e) { console.error(`⚠️  INDETERMINATE: ${e.message}`); process.exit(2); }
// ═══ 9 · EVERY STEP TAGGED "RUNS ITSELF" HAS A RUNNER (master map 11-11, approved: Tier 1 item 1 + Tier 2 a-c) ═══
// Admin 1, 10, 12-16, 20, 23, 29, 30 said "Runs itself" while nothing ran them; 21 and 22 only read. The morning run starts them by the shared rule
// (shared/steps-57-64.js auditTurn), which is also what their admin cards and To do say.
try {
  const S = req("../../shared/steps-57-64.js"), SC = req("../../shared/site-change.js"), OMV = req("./_open-moves.js"), RR = req("./_record-ready.js");
  const AUD = ["m1.kickoff.create", "m1.audit.gbp_baseline", "m1.audit.website", "m1.audit.deep_assess", "m1.audit.ai_readiness", "m1.audit.nap_reviews", "m1.audit.social",
    "m1.audit.keyword_validation", "m1.audit.kpi_baseline", "m1.audit.citations_nap", "m1.audit.recommendations", "m1.audit.competitors", "m1.audit.grid_baseline"];
  // 9a every audit is a morning step with no Run button and the "Runs itself" tag; and EVERY Month 1 step whose type is "auto" has a runner: the morning run,
  // the website autopilot, or a named event whose file starts that very step
  for (const id of AUD) {
    if (!M.STEPS.includes(id)) fail(`9a: ${id} says "Runs itself" but the morning run never starts it`);
    if (!S.runsItself(id)) fail(`9a: ${id} would still draw a Run button`);
    if (!(S.SELF || []).includes(id)) fail(`9a: ${id} must be in the morning run's SELF list (admin's "Runs itself" tag reads it)`);
  }
  const EVENTS = { "m1.audit.gbp_duplicate": "netlify/functions/oauth-google-callback.js", "m1.kickoff.create": "netlify/functions/contract-sign.js" };
  const fe = read("netlify/functions/flow-execute.js"), cs = read("netlify/functions/contract-sign.js");
  const webSteps = new Set([...(SC.AUTO_STEPS || []), "m1.web.image_seo"]);
  if (!webSteps.size || !read("netlify/functions/_website-autorun.js").includes("SC.AUTO_STEPS")) fail("9a: can't read the website autopilot's steps");
  for (const s of PB.filter((x) => x.type === "auto" || S.isAudit(x.id))) {
    if (M.STEPS.includes(s.id) || webSteps.has(s.id)) continue;
    const f = EVENTS[s.id];
    if (!f || !read(f).includes(`"${s.id}"`)) fail(`9a: ${s.id} is tagged "Runs itself" but nothing runs it (not the morning run, not the website autopilot, no event)`);
  }
  if (!cs.includes('"m1.kickoff.create"') || /"m1\.kickoff\.create", \{[\s\S]{0,900}?\)\.catch\(/.test(cs)) fail("9a: admin 1 must settle at signing through the record check, and a failure there must be said, never swallowed");
  if (!/_record-ready/.test(cs) || !/"m1\.kickoff\.create": async[\s\S]{0,700}_record-ready/.test(fe)) fail("9a: signing and the runner must use the ONE record check (_record-ready.js)");
  // 9b the turn: the client's stage (admin 1: signed), the dependencies (23 waits only on 13), never while running
  const NOWS = NOW, ready = settle([...new Set(AUD.flatMap((s) => S.auditDepsOf(PB.find((x) => x.id === s))))]);
  const pl = (tasks, stage) => ids(M.planClient({ tasks, playbook: PB, now: NOWS, stage }));
  if (pl(ready, null).some((i) => AUD.includes(i))) fail("9b: an audit started for a client with no stage");
  if (pl(ready, "stage_3_setup").some((i) => AUD.includes(i) && i !== "m1.kickoff.create")) fail("9b: an audit started before the client reached onboarding");
  if (!pl({}, "stage_1b_admin_review").includes("m1.kickoff.create") || pl({}, "stage_1_contract").includes("m1.kickoff.create")) fail("9b: admin 1 runs once the agreement is signed, never before");
  if (!pl({}, "stage_4_onboarding").includes("m1.audit.website") || !pl({}, "stage_4_onboarding").includes("m1.audit.social")) fail("9b: the audits with nothing to wait for start at onboarding");
  if (pl({ "m1.access.gbp": { status: "done" } }, "stage_4_onboarding").includes("m1.audit.nap_reviews")) fail("9b: 15 must wait for 13");
  if (!pl({ "m1.audit.deep_assess": { status: "done" } }, "stage_4_onboarding").includes("m1.audit.kpi_baseline")) fail("9b: 23 must start once 13 is done (it reads only 13's snapshots), not wait for 22");
  if (pl({}, "stage_4_onboarding").includes("m1.audit.kpi_baseline")) fail("9b: 23 must wait for 13");
  const gdeps = { "m1.strategy.keywords_locations": { status: "done" }, "m1.audit.keyword_validation": { status: "done" }, "m1.audit.gbp_duplicate": { status: "done" } };
  if (pl({ "m1.strategy.keywords_locations": { status: "done" } }, "stage_4_onboarding").includes("m1.audit.grid_baseline")) fail("9b: 22 must wait for 20 to pass");
  if (!pl(gdeps, "stage_4_onboarding").includes("m1.audit.grid_baseline")) fail("9b: 22 must start once 20 passes");
  if (!pl({ "m1.strategy.keywords_locations": { status: "done" } }, "stage_4_onboarding").includes("m1.audit.competitors")) fail("9b: 21 must start once 19 locks");
  if (pl({ "m1.audit.website": { status: "in_progress", started_at: iso(NOWS - 600000) } }, "stage_4_onboarding").includes("m1.audit.website")) fail("9b: a run under way is not started again");
  for (const st of ["done", "skipped", "declined"]) if (pl({ "m1.audit.website": { status: st, ran_at: iso(NOWS - DAY) } }, "stage_4_onboarding").includes("m1.audit.website")) fail(`9b: a ${st} audit started again`);
  if (M.planClient({ tasks: ready, playbook: PB, now: NOWS, stage: "stage_4_onboarding" }).filter((p) => AUD.includes(p.id)).length > M.AUDIT_CLIENT_CAP || !M.AUDIT_CLIENT_CAP) fail("9b: one client started more audits in a morning than the cap");
  // 9c a run that didn't finish: ONE retry the next morning, then RGA's move with the reason and one try a week; the two daily reads look every morning
  const W = "m1.audit.website", fl = (tries, at) => ({ [W]: { status: "in_progress", ran_at: at, started_at: at, auto_result: { summary: "Could not audit it: HTTP 503" }, morning_run: { at, by: "morning run", tries } } });
  if (!pl(fl(1, iso(NOWS - DAY)), "stage_4_onboarding").includes(W)) fail("9c: the first failure must be tried once more the next morning");
  if (pl(fl(2, iso(NOWS - DAY)), "stage_4_onboarding").includes(W)) fail("9c: after its one retry it must not loop every morning");
  if (!pl(fl(2, iso(NOWS - 7 * DAY)), "stage_4_onboarding").includes(W)) fail("9c: a stuck audit tries once a week, so fixing the cause finishes it");
  { const tr = S.auditTurn(PB.find((x) => x.id === W), fl(2, iso(NOWS - DAY)), NOWS, { stage: "stage_4_onboarding" });
    if (!tr.rga || !/503/.test(tr.reason || "") || !(tr.nextAt > NOWS)) fail(`9c: a stuck audit must be RGA's move with the reason and when it tries again: ${JSON.stringify(tr)}`);
    const mv = OMV.openMoves({ playbooks: { month1: PB }, data: { tasks: fl(2, iso(NOWS - DAY)) }, now: iso(NOWS), stage: "stage_4_onboarding" });
    if (!mv.some((m) => m.kind === "runs_itself_stuck" && m.step_id === W && m.owner === "rga" && /503/.test(m.what))) fail("9c: a stuck audit must reach To do, with its reason");
    if (OMV.openMoves({ playbooks: { month1: PB }, data: { tasks: fl(1, iso(NOWS - DAY)) }, now: iso(NOWS), stage: "stage_4_onboarding" }).some((m) => m.kind === "runs_itself_stuck")) fail("9c: a step still on its one retry is not RGA's move yet");
    const card = S.basicRows({ id: W, does: "x", dependsOn: [] }, { tasks: fl(2, iso(NOWS - DAY)), now: NOWS, stage: "stage_4_onboarding", ref: (i) => i });
    if (!/couldn't finish: Could not audit it: HTTP 503/.test((card[1] || {}).line || "") || (card[1] || {}).state !== "you" || /\bPress\b|\bRun\b/.test((card[1] || {}).line || "")) fail(`9c: the card must say why it stopped, in plain words, with no button to press: ${(card[1] || {}).line}`); }
  const K = "m1.kickoff.create", kr = { [K]: { status: "in_progress", ran_at: iso(NOWS - DAY), auto_result: { summary: "The record is missing a contact email." }, morning_run: { at: iso(NOWS - DAY), tries: 5 } } };
  if (!pl(kr, "stage_4_onboarding").includes(K) || !S.auditTurn(PB.find((x) => x.id === K), kr, NOWS, { stage: "stage_4_onboarding" }).rga) fail("9c: admin 1 looks at the record every morning until it is complete, and says what is missing as RGA's move");
  const G = "m1.audit.grid_baseline", gw = (first) => ({ ...gdeps, [G]: { status: "in_progress", ran_at: iso(NOWS - DAY), outcome_data: { waiting_for: "scheduled_scan" }, morning_run: { at: iso(NOWS - DAY), first_at: first, tries: 9 } } });
  if (!pl(gw(iso(NOWS - 3 * DAY)), "stage_4_onboarding").includes(G)) fail("9c: 22 reads the scheduled scan again each morning");
  if (S.auditTurn(PB.find((x) => x.id === G), gw(iso(NOWS - 3 * DAY)), NOWS, { stage: "stage_4_onboarding" }).rga || !S.auditTurn(PB.find((x) => x.id === G), gw(iso(NOWS - 25 * DAY)), NOWS, { stage: "stage_4_onboarding" }).rga) fail("9c: 22 is RGA's move only after 3 weeks without the scheduled scan");
  // 9d Tier 2a: 23 reads its numbers once more the morning after 22 lands (it settled first, with no map); then never again
  const KP = "m1.audit.kpi_baseline", kd = (gridAt, kAt, gp = null) => ({ "m1.audit.deep_assess": { status: "done" }, [G]: { status: "done", completed_at: gridAt }, [KP]: { status: "done", ran_at: kAt, completed_at: kAt, auto_result: { outcome_data: { grid_points: gp } } } });
  if (!pl(kd(iso(NOWS - DAY), iso(NOWS - 3 * DAY)), "stage_4_onboarding").includes(KP)) fail("9d: 23 must read again once 22 lands after it");
  if (pl(kd(iso(NOWS - 3 * DAY), iso(NOWS - DAY)), "stage_4_onboarding").includes(KP) || pl(kd(iso(NOWS - DAY), iso(NOWS - 3 * DAY), 25), "stage_4_onboarding").includes(KP)) fail("9d: a 23 that already has the map (or read after 22) never runs again");
  // 9e the search budget: 21 is the one paid audit (2 searches at most); every other audit is free
  if (M.COST["m1.audit.competitors"] !== 2 || AUD.filter((i) => i !== "m1.audit.competitors").some((i) => M.COST[i])) fail("9e: 21 must reserve its 2 searches and every other audit must be free");
  { const T21 = { "m1.strategy.keywords_locations": { status: "done" } }, RES = req("./_citation-build.js").SEARCH_RESERVE;
    const w1 = world({ clients: [cl("a", { client_portal_stage: "stage_4_onboarding" })], records: [rec("a", T21)], left: RES + 1 }); await M.runMorning({ deps: w1.deps });
    if (w1.log.starts.includes("a/m1.audit.competitors")) fail("9e: 21 started with only 1 search above the reserve");
    if (!w1.log.starts.includes("a/m1.audit.website")) fail("9e: a free audit must still start at the reserve");
    const w2 = world({ clients: [cl("a", { client_portal_stage: "stage_4_onboarding" })], records: [rec("a", T21)], left: 500 }); const o2 = await M.runMorning({ deps: w2.deps });
    if (!w2.log.starts.includes("a/m1.audit.competitors") || o2.searches !== 2) fail(`9e: with a budget 21 starts and reserves exactly 2 searches (spent ${o2.searches})`);
    const w3 = world({ clients: [cl("a", { client_portal_stage: "stage_4_onboarding" })], records: [rec("a", T21)], left: 500, env: { CITATION_LIVE_SEARCH: "0" } }); await M.runMorning({ deps: w3.deps });
    if (w3.log.starts.includes("a/m1.audit.competitors")) fail("9e: searches off must hold 21 too"); }
  // 9f the start: through the Run button's runner, marked as the morning's (so 22 only READS the scheduled scan), counted, never done here
  { const starts = []; const w = world({ clients: [cl("a", { client_portal_stage: "stage_4_onboarding" })], records: [rec("a", {})] });
    w.deps.start = async (cid, sid, month, origin) => { starts.push({ sid, origin }); };
    await M.runMorning({ deps: w.deps });
    if (!starts.length || starts.some((s) => AUD.includes(s.sid) && s.origin !== "morning")) fail("9f: an audit the morning run starts must be marked origin \"morning\"");
    const tk = w.recs[0].data.tasks["m1.audit.website"] || {};
    if (!tk.morning_run || tk.morning_run.tries !== 1 || !tk.morning_run.first_at || tk.status) fail(`9f: the start is stamped and counted, and never written as done: ${JSON.stringify(tk)}`);
    w.tick(DAY); await M.runMorning({ deps: w.deps });
    const t2 = (w.recs[0].data.tasks["m1.audit.website"] || {}).morning_run || {};
    if (t2.tries !== 2 || !t2.first_at || t2.first_at !== (tk.morning_run || {}).first_at) fail("9f: the count carries over from start to start");
    const wf = world({ clients: [cl("a", { client_portal_stage: "stage_4_onboarding" })], records: [rec("a", {})], failStart: { "a/m1.audit.website": "the runner answered 502" } });
    await M.runMorning({ deps: wf.deps });
    const tf = (wf.recs[0].data.tasks["m1.audit.website"] || {}).morning_run || {};
    if (!/502/.test(tf.error || "") || tf.tries !== 1) fail("9f: a failed start is said on the step and is not counted as a second start"); }
  // 9g the runner's side: origin reaches the executor; 22 from the morning never buys a scan; 23 settles the moment 13 is done; 21 reads the map scan first
  if (!/executor\(\{ client, clientId: client_id, tasks, month: [^\n]*origin: \["morning", "chain"\]\.includes\(body\.origin\)/.test(fe)) fail("9g: flow-execute must hand the run's origin to the executor");
  const gb = (/"m1\.audit\.grid_baseline": async \(\{ client, clientId, origin \}\) => \{[\s\S]*?\n  \},\n/.exec(fe) || [""])[0];
  const morningAt = gb.indexOf('if (origin === "morning" && plan)'), scanAt = gb.indexOf("startRankScan(");
  if (morningAt < 0 || scanAt < 0 || morningAt > scanAt || !/if \(origin === "morning" && plan\) \{[\s\S]{0,1400}?completed: false/.test(gb)) fail("9g: 22 started by the morning run must return (waiting, not done) before it could start a scan");
  if (!/needDeps = \(!is_monthly && require\("\.\.\/\.\.\/shared\/steps-57-64\.js"\)\.AUDIT_DEPS\[step_id\]\) \|\| stepDef\.dependsOn/.test(fe) || !/needDeps\.filter/.test(fe)) fail("9g: flow-execute must let 23 run on 13 alone (the shared AUDIT_DEPS)");
  if (!/step_id === "m1\.audit\.deep_assess" && taskState\.status === "done"\)[\s\S]{0,800}step_id: "m1\.audit\.kpi_baseline", __inline: true/.test(fe)) fail("9g: 23 must settle the moment 13 is done");
  if (!/"m1\.audit\.competitors": async[\s\S]{0,1800}rank_grid[\s\S]{0,1800}from: "map_scan"/.test(fe)) fail("9g: 21 must read the map scan's competitors (the read Monthly 9 does) before it searches");
  if (((S.AUDIT_DEPS || {})["m1.audit.kpi_baseline"] || []).join() !== "m1.audit.deep_assess") fail("9g: 23's turn must be 13 alone");
  if (!/const measured = \[n\(gsc\?\.totals\?\.impressions\), gridCells\.length \? gridRanked : null, n\(psi\?\.performance \?\? psi\?\.mobile_score\), ga4Sessions\]/.test(fe)) fail("9g: 23 can only settle on 13's own snapshots if GA4 counts as one of its sources (else it waits for 22)");
  // 9h admin 1's record check: done only with a name, a contact email and a signed agreement; the result is on the card
  { const ok = RR.recordCheck({ client: { business_name: "Acme Plumbing", primary_contact_email: "a@b.co", website_url: "https://acme.co/?utm_source=x", primary_market: "Austin, TX" }, signed: { signed_at: "2026-11-03T15:00:00Z", signer_name: "Ann Lee" } });
    if (!ok.ready || !/Acme Plumbing/.test(ok.summary) || !/signed by Ann Lee/.test(ok.summary) || /utm_/.test(ok.summary) || /exists\./.test(ok.summary)) fail(`9h: a complete record must be ready and its card must show what is on file: ${ok.summary}`);
    const no = RR.recordCheck({ client: { business_name: "Acme Plumbing" }, signed: null });
    if (no.ready || !no.missing.includes("a contact email") || !no.missing.includes("a signed agreement") || !/checks again each morning/.test(no.summary)) fail("9h: a record missing an email or a signed agreement is not ready, and says what to add");
    if (RR.recordCheck({ client: { business_name: "A", primary_contact_email: "a@b.co" }, signed: { signed_at: "2026-11-03T15:00:00Z" } }).ready !== true) fail("9h: no website or market never holds admin 1 (a business may have no website)");
    if (/—/.test(ok.summary + no.summary)) fail("9h: no em dash in the record check's words"); }
  // 9i the admin: no Run button (the shared runsItself) and the "Runs itself" tag (the shared SELF list) on every audit; Undo reads it fresh
  { const A = read("admin/admin.js");
    if (!/function uniRunsItselfFor\(id\) \{[\s\S]{0,200}U\.runsItself\(id\)/.test(A)) fail("9i: the admin's no-Run-button rule must read the shared runsItself (which holds the audits)");
    if (!/function stepRunsItself\(id\) \{[\s\S]{0,400}globalThis\.rgaSteps5764[\s\S]{0,200}M\.SELF\.includes\(id\)/.test(A)) fail("9i: admin's \"Runs itself\" tag must read the morning run's SELF list");
    if (!/isReset && uniS\(\)\?\.isAudit\?\.\(flowId\)\) patch\.morning_run = null/.test(A)) fail("9i: Undo on an audit must let the next morning read it fresh"); }
} catch (e) { console.error(`⚠️  INDETERMINATE (9): ${e.stack || e.message}`); process.exit(2); }
if (F.length) { console.error(`❌ the morning run regressed (${F.length}):`); F.forEach((m) => console.error("  - " + m)); process.exit(1); }
console.log("✓ the morning run: turn rules, quarterly 57, handoff waits on the report and the close call, test clients out, budget stops at the reserve, a throw is never done, read before write and read back; every \"Runs itself\" step has a runner (the Month 1 audits: stage, dependencies, one retry then RGA's move and To do, 21's budget, 22 reads only, 23 on 13)");
