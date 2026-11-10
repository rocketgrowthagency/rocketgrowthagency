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
if (F.length) { console.error(`❌ the morning run regressed (${F.length}):`); F.forEach((m) => console.error("  - " + m)); process.exit(1); }
console.log("✓ the morning run: turn rules, quarterly 57, handoff waits on the report and the close call, test clients out, budget stops at the reserve, a throw is never done, read before write and read back");
