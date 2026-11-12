#!/usr/bin/env node
// check-job-alert-path.mjs — THE MONTHLY TEST (approved admin_system_health_v1, 10-31: "one job is deliberately broken on a throwaway copy, to prove the alert fires").
// It runs every morning instead of monthly, because it costs nothing and a month is a long time to not know.
// 🔴🔴 NOTHING REAL IS TOUCHED. Every fetch goes to an in-memory fake; any other address fails this gate. The real notify-rga handler runs in-process
// against the fake, so no webhook, Messages row or email ever goes out, and the database is never read.
// HOLDS, on a job broken for real through the shipped code: (1) withCheckin records the start and the failure, and the job's own throw and reply pass through
// untouched; a refused or hand-pressed run writes nothing; (2) no table, or a dead database, never breaks the job; (3) the watcher alerts once, stays quiet,
// reminds daily, and a success clears it and takes it out of Messages; (4) `delivered:false` is written down and retried, never counted as told; (5) a late,
// an empty and a never-finished job all alert; the unknowns don't, and don't clear; the watcher never alerts about itself; (6) no table: no alert, and the
// handler says so; (7) job-checkin refuses a caller with no secret, a Netlify job's name and a job off the list, and takes expected_min from the list;
// (8) the Mac's script always exits 0, keeps start and finish on one row, and never prints the secret; (9) the admin read needs a sign-in, tells "no table" from
// "read failed", and never hands out the webhook address.
// Exit 0 = holds · 1 = the alert path is broken · 2 = moved (indeterminate). → memory project_system_health
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SCR = process.env.SCRAPER_COPY_DIR || path.dirname(HERE);
const F = [];
const eq = (name, got, want) => { if (got !== want) F.push(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); };
const yes = (name, v) => { if (!v) F.push(name); };

// ── the fake world ──────────────────────────────────────────────────────────────────────────────────────────────────
const DB = "https://fake-db.test", SITEURL = "https://fake-site.test", HOOK = "https://fake-hook.test/x", SECRET = "fake-internal-secret-value";
Object.assign(process.env, { SUPABASE_URL: DB, SUPABASE_SERVICE_ROLE_KEY: "fake-service-key-value", SUPABASE_ANON_KEY: "fake-anon", INTERNAL_FN_SECRET: SECRET, URL: SITEURL });
delete process.env.RGA_NOTIFICATION_WEBHOOK_URL;
const W = { rows: [], activity: [], clients: [{ id: "rga-client", business_name: "Rocket Growth Agency" }], mode: "ok", notifyCalls: 0, hookCalls: 0, notifyBroken: false, realCalls: [], hookOk: true, gmail: "none", gmailSends: [] };
const reset = () => { W.gmail = "none"; W.gmailSends = []; W.rows = []; W.activity = []; W.notifyCalls = 0; W.hookCalls = 0; W.mode = "ok"; W.notifyBroken = false; W.clients = [{ id: "rga-client", business_name: "Rocket Growth Agency" }]; delete process.env.RGA_NOTIFICATION_WEBHOOK_URL; };
const res = (status, body) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
let nextId = 1, notifyRga;
globalThis.fetch = async (input, init = {}) => {
  const u = String(input), m = init.method || "GET";
  if (u.startsWith(HOOK)) { W.hookCalls++; return res(W.hookOk ? 200 : 500, {}); }
  if (u.startsWith(`${SITEURL}/.netlify/functions/notify-rga`)) {
    W.notifyCalls++;
    if (W.notifyBroken) return res(500, { error: "down" });
    if (W.notifySilent) return res(200, { ok: true });
    const out = await notifyRga.handler({ httpMethod: "POST", headers: init.headers, body: init.body });
    return res(out.statusCode, out.body);
  }
  // 🔒 11-7: alerts are emailed to hello@ as RGA (_gmail.sendAsRga). Google's sign-in and Gmail are fakes too.
  if (u === "https://oauth2.googleapis.com/token") return res(200, { access_token: "fake-access" });
  if (u.startsWith("https://gmail.googleapis.com/")) {
    if (W.gmail === "refuse") return res(403, { error: { message: "refused" } });
    const raw = Buffer.from(JSON.parse(init.body).raw, "base64url").toString("utf8");
    const head = raw.split("\r\n\r\n")[0].replace(/\r\n /g, "");
    const words = (v) => v.replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (_, b) => Buffer.from(b, "base64").toString("utf8"));
    W.gmailSends.push({ to: (/^To: (.*)$/m.exec(head) || [])[1] || "", subject: words((/^Subject: (.*)$/m.exec(head) || [])[1] || "") });
    return res(200, { id: `m${W.gmailSends.length}` });
  }
  if (!u.startsWith(DB)) { W.realCalls.push(`${m} ${u}`); throw new Error(`a real address was called: ${u}`); }
  if (u.includes("/rest/v1/rga_google_credentials")) return res(200, W.gmail === "none" ? [] : [{ refresh_token: "plain-refresh", google_email: "hello@rocketgrowthagency.com", scopes: "https://www.googleapis.com/auth/gmail.send" }]);
  if (u.includes("/auth/v1/user")) return String((init.headers || {}).Authorization).includes("good-token") ? res(200, { id: "u1", email: "a@b.c" }) : res(401, {});
  if (u.includes("/rest/v1/profiles")) return res(200, [{ workspace_id: "w1", role: "owner" }]);
  if (u.includes("/rest/v1/clients")) return res(200, W.clients.slice(0, 1));
  if (u.includes("/rest/v1/client_activity")) {
    if (m === "POST") { const r = { id: `a${nextId++}`, ...JSON.parse(init.body) }; W.activity.push(r); return res(201, [r]); }
    if (m === "PATCH") { const id = /id=eq\.([^&]+)/.exec(u)[1]; const r = W.activity.find((x) => x.id === id); if (r) Object.assign(r, JSON.parse(init.body)); return res(204, ""); }
    const job = decodeURIComponent(/payload->>job=eq\.([^&]+)/.exec(u)?.[1] || "");
    return res(200, W.activity.filter((x) => x.payload?.kind === "system_job_failed" && x.payload?.job === job));
  }
  if (u.includes("/rest/v1/job_checkins")) {
    if (W.mode === "missing") return res(404, { code: "PGRST205", message: "Could not find the table 'public.job_checkins' in the schema cache" });
    if (W.mode === "dead") throw new Error("connection refused");
    if (W.mode === "broken") return res(500, { message: "boom" });
    if (u.includes("job_checkins_latest")) {
      const by = new Map();
      for (const r of W.rows) { const b = by.get(r.job); if (!b || Date.parse(r.started_at) >= Date.parse(b.started_at)) by.set(r.job, r); }
      return res(200, [...by.values()]);
    }
    if (m === "POST") { const r = { id: `00000000-0000-0000-0000-${String(nextId++).padStart(12, "0")}`, ...JSON.parse(init.body) }; W.rows.push(r); return res(201, [r]); }
    if (m === "PATCH") { const id = /id=eq\.([^&]+)/.exec(u)[1]; const r = W.rows.find((x) => x.id === id); if (r) Object.assign(r, JSON.parse(init.body)); return res(200, r ? [r] : []); }
    if (m === "GET" && u.includes("order=started_at.asc")) { const s = W.rows.slice().sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at)); return res(200, s.slice(0, 1)); }
    return res(200, W.rows);
  }
  W.realCalls.push(`${m} ${u}`);
  return res(404, {});
};

const silent = { log: console.log, warn: console.warn, error: console.error };
console.log = console.warn = console.error = () => {};   // the code under test logs on purpose; this gate speaks for itself below
let req;
try { req = createRequire(`${SITE}/netlify/functions/x.js`); notifyRga = req("./notify-rga.js"); } catch (e) { silent.error(`🔴 notify-rga won't load: ${e.message}`); process.exit(1); }
const C = req("./_job-checkin.js"), WATCH = req("./job-watcher.js"), S = req("./_job-status.js"), ENDPOINT = req("./job-checkin.js"), ADMIN = req("./admin-system-health.js");
const { JOBS } = req("./_job-manifest.js");
const sched = { httpMethod: "POST", headers: {}, body: JSON.stringify({ next_run: "2026-11-01T00:00:00Z" }) };
const pressed = { httpMethod: "POST", headers: { "x-internal-secret": SECRET }, body: "{}" };
const HOUR = 3600000, DAY = 24 * HOUR;

// ── (1) a broken job, through the shipped wrapper ───────────────────────────────────────────────────────────────────
{
  reset();
  const boom = new Error("the job broke on purpose");
  const h = C.withCheckin("gbp-posts-sweep", async () => { throw boom; });
  let thrown = null; try { await h(sched); } catch (e) { thrown = e; }
  eq("the job's own throw comes through untouched", thrown, boom);
  eq("a broken job leaves one row", W.rows.length, 1);
  eq("a broken job's row: job", W.rows[0]?.job, "gbp-posts-sweep");
  eq("a broken job's row: not ok", W.rows[0]?.ok, false);
  yes("a broken job's row says why", /broke on purpose/.test(W.rows[0]?.error || ""));
  yes("a broken job's row has a finish", !!W.rows[0]?.finished_at);
  reset();
  const reply = { statusCode: 500, headers: { "x-a": "1" }, body: JSON.stringify({ error: "nope" }) };
  const out = await C.withCheckin("gbp-posts-sweep", async () => reply)(sched);
  eq("the job's own reply comes through untouched", out, reply);
  eq("a 500 is a failure", W.rows[0]?.ok, false);
  yes("a 500's row says why", /nope/.test(W.rows[0]?.error || ""));
  reset();
  await C.withCheckin("gbp-posts-sweep", async () => ({ statusCode: 200, body: JSON.stringify({ ok: true, clients: [{ ok: true }, { ok: false }] }) }))(sched);
  eq("a good reply is ok", W.rows[0]?.ok, true);
  eq("a good reply's count", W.rows[0]?.count, 2);
  yes("one client failing is on the row", /1 of 2/.test(W.rows[0]?.error || ""));
  reset();
  await C.withCheckin("metrics-daily-refresh", async () => ({ statusCode: 200, body: JSON.stringify({ ok: 0, results: [], step_probes: [] }) }))(sched);
  eq("a floor is written down", W.rows[0]?.expected_min, 1);
  eq("zero is written down as zero", W.rows[0]?.count, 0);
  reset();
  await C.withCheckin("gbp-posts-sweep", async () => ({ statusCode: 200, body: "not json at all" }))(sched);
  eq("an unreadable reply still leaves a row", W.rows.length, 1);
  reset();
  let ran = 0;
  await C.withCheckin("gbp-posts-sweep", async () => { ran++; return { statusCode: 200, body: "{}" }; })(pressed);
  await C.withCheckin("gbp-posts-sweep", async () => { ran++; return { statusCode: 200, body: "{}" }; })({ httpMethod: "GET", headers: {} });
  eq("a pressed or drive-by run still runs", ran, 2);
  eq("only the scheduler's run is recorded", W.rows.length, 0);
  reset();
  const secretLeak = await C.withCheckin("gbp-posts-sweep", async () => { throw new Error(`bad ${SECRET} and Bearer abc.def`); })(sched).catch(() => null);
  yes("a secret in an error never reaches a row", secretLeak === null && !JSON.stringify(W.rows).includes(SECRET) && !/Bearer abc/.test(JSON.stringify(W.rows)));
}

// ── (2) no table, dead database: the job doesn't notice ─────────────────────────────────────────────────────────────
for (const mode of ["missing", "dead", "broken"]) {
  reset(); W.mode = mode;
  const reply = { statusCode: 200, body: JSON.stringify({ ok: true, clients: [] }) };
  let threw = false, out = null;
  try { out = await C.withCheckin("gbp-posts-sweep", async () => reply)(sched); } catch { threw = true; }
  eq(`${mode}: a failed check-in doesn't break the job`, threw, false);
  eq(`${mode}: the job's reply is unchanged`, out, reply);
  const boom = new Error("real failure");
  let t2 = null; try { await C.withCheckin("gbp-posts-sweep", async () => { throw boom; })(sched); } catch (e) { t2 = e; }
  eq(`${mode}: the job's real failure isn't hidden`, t2, boom);
}

// ── (3)(4)(5) the watcher, with its real parts against the fake ─────────────────────────────────────────────────────
const T0 = Date.parse("2026-10-31T20:00:00Z");
const JOB = { job: "billing-daily-check", label: "Billing check", where: "netlify", cron: "0 8 * * *", tz: "UTC", grace_min: 180, max_run_min: 5, keep_days: 90 };
const pass = async (now, jobs = [JOB]) => { const l = await C.readLatest(); return WATCH.runWatch({ now, rows: l.rows, systemStart: Date.parse("2026-10-01T00:00:00Z"), jobs, ...WATCH.realDeps() }); };
const ran = (at, extra = {}) => W.rows.push({ id: `r${nextId++}`, job: "billing-daily-check", started_at: new Date(at).toISOString(), finished_at: new Date(at + 1000).toISOString(), ok: true, count: 1, ...extra });
const alerts = () => W.rows.filter((r) => r.job === "alert:billing-daily-check").sort((a, b) => Date.parse(a.finished_at) - Date.parse(b.finished_at));
const liveMessages = () => W.activity.filter((a) => /_(failed|error)$/.test(a.payload?.kind || ""));
{
  reset();
  ran(Date.parse("2026-10-31T08:00:00Z"), { ok: false, error: "the job broke" });
  let o = await pass(T0);
  eq("a failed job alerts", W.notifyCalls, 1);
  eq("the alert went through notify-rga and was delivered", o.alerts_sent, 1);
  eq("the alert's record: delivered", alerts()[0]?.ok, true);
  eq("the alert's record: first of the stretch", alerts()[0]?.count, 1);
  yes("the alert's record names the route", /failed · via activity/.test(alerts()[0]?.note || ""));
  eq("it reached Messages, on RGA's own client", W.activity[0]?.client_id, "rga-client");
  eq("the Messages row carries the job", W.activity[0]?.payload?.job, "billing-daily-check");
  yes("the Messages row says which job", /Billing check/.test(W.activity[0]?.payload?.summary || ""));
  yes("Messages sees it as an alert", liveMessages().length === 1);
  o = await pass(T0 + HOUR); eq("an hour later: told once, no repeat", W.notifyCalls, 1);
  o = await pass(T0 + 12 * HOUR); eq("twelve hours later: no repeat", W.notifyCalls, 1);
  o = await pass(T0 + DAY);
  eq("a day later: a reminder", W.notifyCalls, 2);
  eq("the reminder counts", alerts().at(-1)?.count, 2);
  eq("the reminder replaces the old Messages row", liveMessages().length, 1);
  yes("the reminder says it's a reminder", /Reminder 2/.test(liveMessages()[0]?.payload?.message || ""));
  ran(T0 + DAY + HOUR);
  o = await pass(T0 + DAY + 2 * HOUR);
  eq("a later success clears it", o.cleared, 1);
  eq("clearing doesn't alert", W.notifyCalls, 2);
  yes("the clear is on record", /^cleared/.test(alerts().at(-1)?.note || ""));
  eq("a cleared job leaves Messages", liveMessages().length, 0);
  yes("the history stays on the row", W.activity.every((a) => a.payload?.message));
  o = await pass(T0 + DAY + 3 * HOUR);
  eq("nothing more after the clear", W.notifyCalls, 2);
  eq("no second clear", o.cleared, 0);
  ran(T0 + 2 * DAY, { ok: false, error: "again" });
  await pass(T0 + 2 * DAY + HOUR);
  eq("a new failure is a first alert again", alerts().at(-1)?.count, 1);
  eq("and it was sent", W.notifyCalls, 3);
}
{ // 🔒 11-7, the owner: "fix all issues". An alert is emailed to hello@ as well, and the record says which route it took.
  reset(); W.gmail = "ok";
  ran(Date.parse("2026-10-31T08:00:00Z"), { ok: false, error: "the job broke" });
  await pass(T0);
  eq("emailed: one email", W.gmailSends.length, 1);
  yes("emailed: to hello@", /hello@rocketgrowthagency\.com/.test(W.gmailSends[0]?.to || ""));
  yes("emailed: the subject names the job", /^System health: Billing check/.test(W.gmailSends[0]?.subject || ""));
  yes("emailed: the record says activity+email", /via activity\+email/.test(alerts()[0]?.note || ""));
  reset(); W.gmail = "ok"; W.clients = [];   // Messages can't take it: the email alone is a delivery
  ran(Date.parse("2026-10-31T08:00:00Z"), { ok: false, error: "x" });
  await pass(T0);
  eq("email only: delivered", alerts()[0]?.ok, true);
  yes("email only: the record says email", /via email$/.test(alerts()[0]?.note || ""));
  reset(); W.gmail = "refuse"; W.clients = [];   // neither route: not delivered, and the email's own failure is the reason
  ran(Date.parse("2026-10-31T08:00:00Z"), { ok: false, error: "x" });
  await pass(T0);
  eq("neither: not delivered", alerts()[0]?.ok, false);
  yes("neither: the email's failure is on record", /email: Gmail/i.test(alerts()[0]?.error || "") || /email:/.test(alerts()[0]?.error || ""));
}
{ // not delivered
  reset(); W.clients = [];   // no RGA client, no webhook: notify-rga truly can't deliver
  ran(Date.parse("2026-10-31T08:00:00Z"), { ok: false, error: "x" });
  let o = await pass(T0);
  eq("not delivered: counted as undelivered", o.undelivered, 1);
  eq("not delivered: not counted as sent", o.alerts_sent, 0);
  eq("not delivered: on record as not delivered", alerts()[0]?.ok, false);
  yes("not delivered: notify-rga's own answer is the reason on record", /nothing received it/.test(alerts()[0]?.error || ""));
  yes("not delivered: the route says nowhere", /via nowhere/.test(alerts()[0]?.note || ""));
  o = await pass(T0 + HOUR);
  eq("not delivered: tried again next hour", W.notifyCalls, 2);
  W.clients = [{ id: "rga-client", business_name: "Rocket Growth Agency" }];
  o = await pass(T0 + 2 * HOUR);
  eq("delivered on the retry", alerts().at(-1)?.ok, true);
  eq("a delivered retry isn't a second alert in the count", alerts().at(-1)?.count, 1);
  reset(); W.notifyBroken = true;
  ran(Date.parse("2026-10-31T08:00:00Z"), { ok: false, error: "x" });
  o = await pass(T0);
  eq("notify-rga down: not delivered", alerts()[0]?.ok, false);
  yes("notify-rga down: the record says why", /HTTP 500/.test(alerts()[0]?.error || ""));
  reset();
  ran(Date.parse("2026-10-31T08:00:00Z"), { ok: false, error: "x" });
  const l = await C.readLatest(), deps = WATCH.realDeps();
  const thrown = await WATCH.runWatch({ now: T0, rows: l.rows, systemStart: Date.parse("2026-10-01T00:00:00Z"), jobs: [JOB], ...deps, notify: async () => { throw new Error("the send blew up"); } }).catch(() => null);
  eq("a send that throws doesn't stop the pass", thrown?.undelivered, 1);
  yes("a send that throws is on record", /blew up/.test(alerts()[0]?.error || ""));
  reset(); W.notifySilent = true;
  ran(Date.parse("2026-10-31T08:00:00Z"), { ok: false, error: "x" });
  o = await pass(T0);
  W.notifySilent = false;
  eq("a reply that doesn't say isn't a delivery", alerts()[0]?.ok, false);
  reset(); process.env.RGA_NOTIFICATION_WEBHOOK_URL = HOOK;
  ran(Date.parse("2026-10-31T08:00:00Z"), { ok: false, error: "x" });
  o = await pass(T0);
  eq("with a webhook: it's called", W.hookCalls, 1);
  yes("with a webhook: the route says so", /webhook/.test(alerts()[0]?.note || ""));
  eq("with a webhook: delivered", alerts()[0]?.ok, true);
}
{ // the other problems, and the unknowns
  const cases = [
    ["a late job", () => ran(Date.parse("2026-10-29T08:00:00Z")), 1],
    ["an empty job", () => ran(Date.parse("2026-10-31T08:00:00Z"), { count: 0, expected_min: 1 }), 1],
    ["a job that never finished", () => W.rows.push({ id: "n", job: "billing-daily-check", started_at: new Date(Date.parse("2026-10-31T08:00:00Z")).toISOString() }), 1],
    ["a job that never checked in, due since check-ins began", () => {}, 1],
    ["a healthy job", () => ran(Date.parse("2026-10-31T08:00:00Z")), 0],
  ];
  for (const [name, setup, want] of cases) { reset(); setup(); await pass(T0); eq(`${name}: alerts`, W.notifyCalls, want); }
  for (const [name, j] of [["not installed", { ...JOB, installed: false }], ["not proven", { ...JOB, unproven: true }]]) {
    reset(); await pass(T0, [j]); eq(`${name}: no alert`, W.notifyCalls, 0);
  }
  reset();
  W.rows.push({ id: "w", job: "job-watcher", started_at: new Date(T0 - 40 * DAY).toISOString(), finished_at: new Date(T0 - 40 * DAY).toISOString(), ok: false });
  await pass(T0, [{ ...JOB, job: "job-watcher", label: "Job watcher" }]);
  eq("the watcher never alerts about itself", W.notifyCalls, 0);
  reset();
  ran(Date.parse("2026-10-31T08:00:00Z"), { ok: false, error: "x" });
  await pass(T0);
  W.rows.push({ id: "z", job: "billing-daily-check", started_at: new Date(T0 + HOUR).toISOString() });   // running now
  const o = await pass(T0 + HOUR + 60000);
  eq("a run in progress doesn't clear an alert", o.cleared, 0);
}

// ── (6) no table: the real handler ──────────────────────────────────────────────────────────────────────────────────
{
  reset(); W.mode = "missing";
  const out = await WATCH.handler(sched);
  eq("no table: the handler answers", out.statusCode, 200);
  eq("no table: it says so", JSON.parse(out.body).table_ready, false);
  eq("no table: no alert", W.notifyCalls, 0);
  reset(); W.mode = "dead";
  const dead = await WATCH.handler(sched).catch(() => ({ statusCode: 0 }));
  eq("database down isn't 'not set up'", dead.statusCode, 502);
  const refused = await WATCH.handler({ httpMethod: "POST", headers: {}, body: "{}" });
  eq("a stranger can't start the watcher", refused.statusCode, 401);
}
{ // a whole real pass through the handler, wrapper included
  reset();
  W.rows.push({ id: "b", job: "billing-daily-check", started_at: new Date(Date.now() - 60000).toISOString(), finished_at: new Date(Date.now() - 50000).toISOString(), ok: false, error: "x" });
  const out = await WATCH.handler(sched);
  eq("the handler: answers", out.statusCode, 200);
  const j = JSON.parse(out.body);
  eq("the handler: compared every job on the list", j.jobs, JOBS.length);
  yes("the handler: sent the alert", W.notifyCalls >= 1);
  const self = W.rows.find((r) => r.job === "job-watcher");
  yes("the handler: the watcher checked in", !!self && self.ok === true);
  eq("the handler: its count", self?.count, JOBS.length);
}

// ── (7) the Mac's endpoint ──────────────────────────────────────────────────────────────────────────────────────────
{
  reset();
  const post = (body, secret = SECRET) => ENDPOINT.handler({ httpMethod: "POST", headers: secret ? { "x-internal-secret": secret } : {}, body: JSON.stringify(body) });
  eq("no secret: refused", (await post({ job: "daily-health-check", phase: "start" }, null)).statusCode, 401);
  eq("wrong secret: refused", (await post({ job: "daily-health-check", phase: "start" }, "nope")).statusCode, 401);
  eq("a stranger wrote nothing", W.rows.length, 0);
  eq("a Netlify job's name: refused", (await post({ job: "billing-daily-check", phase: "start" })).statusCode, 400);
  eq("a job off the list: refused", (await post({ job: "made-up", phase: "start" })).statusCode, 400);
  eq("a bad phase: refused", (await post({ job: "daily-health-check", phase: "x" })).statusCode, 400);
  const s = JSON.parse((await post({ job: "daily-health-check", phase: "start" })).body);
  yes("a start hands back the row's id", s.ok && s.id);
  eq("a start leaves ok empty", W.rows[0]?.ok, undefined);
  const f = await post({ job: "daily-health-check", phase: "finish", id: s.id, ok: true, count: 344, note: "344 healthy", expected_min: 0 });
  eq("a finish lands", f.statusCode, 200);
  eq("start and finish are one row", W.rows.length, 1);
  eq("the count", W.rows[0].count, 344);
  eq("expected_min comes from the list, not the caller", W.rows[0].expected_min, JOBS.find((j) => j.job === "daily-health-check").expected_min);
  await post({ job: "client-data-backup", phase: "finish", ok: false, error: "the copy crashed" });
  eq("a finish with no start writes a whole row", W.rows.find((r) => r.job === "client-data-backup")?.ok, false);
  yes("a finish with no start has a start time", !!W.rows.find((r) => r.job === "client-data-backup")?.started_at);
  await post({ job: "lacie-backup", phase: "finish", ok: true, count: null });
  eq("no count stays no count, not zero", W.rows.find((r) => r.job === "lacie-backup")?.count, null);
  eq("an id that matches nothing isn't a recorded finish", (await post({ job: "daily-health-check", phase: "finish", id: "11111111-1111-1111-1111-111111111111", ok: true })).statusCode, 404);
  W.mode = "missing";
  const m = await post({ job: "daily-health-check", phase: "start" });
  eq("no table: says not set up", JSON.parse(m.body).not_set_up, true);
}

// ── (8) the Mac's script ────────────────────────────────────────────────────────────────────────────────────────────
{
  const script = `${SCR}/scripts/job-checkin.mjs`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "job-checkin-"));
  try {
    process.env.JOB_CHECKIN_DIR = tmp;
    const { checkin } = await import(pathToFileURL(script).href);
    reset();
    const calls = [];
    const via = async (u, init) => { calls.push({ u: String(u), init }); const b = JSON.parse(init.body); return res(200, { ok: true, id: b.phase === "start" ? "11111111-1111-1111-1111-111111111111" : "x" }); };
    await checkin(["start", "weekly-audit"], { fetchFn: via });
    await checkin(["finish", "weekly-audit", "--ok", "1", "--count", "7", "--note", "done"], { fetchFn: via });
    const fin = JSON.parse(calls[1]?.init?.body || "{}");
    eq("the finish carries the start's id", fin.id, "11111111-1111-1111-1111-111111111111");
    eq("the finish's ok", fin.ok, true);
    eq("the finish's count", fin.count, 7);
    eq("the secret goes as the header", calls[0]?.init?.headers?.["x-internal-secret"], SECRET);
    yes("the secret isn't in the body", !JSON.stringify(calls.map((c) => c.init.body)).includes(SECRET));
    await checkin(["finish", "weekly-audit", "--ok", "0"], { fetchFn: via });
    eq("a finish without a start has no id", JSON.parse(calls[2].init.body).id, null);
    eq("ok 0 is false", JSON.parse(calls[2].init.body).ok, false);
    fs.writeFileSync(path.join(tmp, "job-checkin-weekly-audit.id"), "old-run");
    const refuse = async () => res(503, { ok: false, not_set_up: true });
    await checkin(["start", "weekly-audit"], { fetchFn: refuse }).catch(() => {});
    yes("a new run forgets the last run's row, even if its start can't post", !fs.existsSync(path.join(tmp, "job-checkin-weekly-audit.id")));
    const cli = (args, env = {}) => spawnSync(process.execPath, [script, ...args], { env: { PATH: process.env.PATH, HOME: tmp, JOB_CHECKIN_DIR: tmp, JOB_CHECKIN_URL: "http://127.0.0.1:9", INTERNAL_FN_SECRET: SECRET, ...env }, encoding: "utf8", timeout: 20000 });
    const down = cli(["finish", "weekly-audit", "--ok", "1"]);
    eq("the site can't be reached: it still exits 0", down.status, 0);
    yes("the site can't be reached: it says so", /not recorded/.test(down.stderr));
    yes("it never prints the secret", !`${down.stdout}${down.stderr}`.includes(SECRET));
    eq("bad arguments: still exits 0", cli(["nonsense"]).status, 0);
    const off = cli(["finish", "weekly-audit", "--ok", "1"], { JOB_CHECKIN_OFF: "1" });
    eq("switched off: exits 0", off.status, 0);
    yes("switched off: no attempt", off.stderr === "");
    eq("no secret anywhere: still exits 0", cli(["start", "weekly-audit"], { INTERNAL_FN_SECRET: "", HOME: tmp }).status, 0);
  } catch (e) { F.push(`the Mac's script: ${e.message}`); }
  finally { fs.rmSync(tmp, { recursive: true, force: true }); delete process.env.JOB_CHECKIN_DIR; }
}

// ── (9) the admin read ──────────────────────────────────────────────────────────────────────────────────────────────
{
  reset();
  const read = (token = "good-token") => ADMIN.handler({ httpMethod: "POST", headers: token ? { authorization: `Bearer ${token}` } : {}, body: "{}" });
  eq("no sign-in: refused", (await read(null)).statusCode, 401);
  W.mode = "missing";
  let j = JSON.parse((await read()).body);
  eq("no table: says so", j.table_ready, false);
  yes("no table: every job says not set up", j.jobs.length === JOBS.length && j.jobs.every((x) => x.state === "not_set_up"));
  eq("no table: nothing counts as OK", j.summary.ok, 0);
  W.mode = "dead";
  eq("a failed read is a failure, not 'not set up'", (await read()).statusCode, 502);
  W.mode = "broken";
  eq("a database error is a failure, not 'not set up'", (await read()).statusCode, 502);
  eq("the watcher agrees: a database error isn't 'not set up'", (await WATCH.handler(sched)).statusCode, 502);
  W.mode = "ok"; process.env.RGA_NOTIFICATION_WEBHOOK_URL = HOOK;
  const body = (await read()).body;
  yes("the webhook address never reaches the page", !body.includes("fake-hook"));
  j = JSON.parse(body);
  eq("a webhook nothing has proved", j.alerts.tag, "Not proven");
  eq("a webhook nothing has proved isn't green", j.alerts.tone, "unk");
  delete process.env.RGA_NOTIFICATION_WEBHOOK_URL;
  eq("no webhook, no emailed alert yet: not proven", JSON.parse((await read()).body).alerts.tag, "Not proven");
  W.rows.push({ id: "e", job: "alert:y", ok: true, note: "failed · via activity+email", started_at: new Date().toISOString(), finished_at: new Date().toISOString() });
  eq("an emailed alert proves the email", JSON.parse((await read()).body).alerts.tone, "ok");
  W.rows = W.rows.filter((r) => r.id !== "e");
  W.rows.push({ id: "a", job: "alert:x", ok: true, note: "failed · via webhook+activity", started_at: new Date().toISOString(), finished_at: new Date().toISOString() });
  process.env.RGA_NOTIFICATION_WEBHOOK_URL = HOOK;
  eq("a webhook that delivered is proven", JSON.parse((await read()).body).alerts.tone, "ok");
  delete process.env.RGA_NOTIFICATION_WEBHOOK_URL;
  reset();
  eq("the later client card: can't tell is null", await (async () => { W.mode = "dead"; return C.jobCheckedThisMonth("metrics-daily-refresh"); })(), null);
  W.mode = "missing"; eq("the later client card: not set up is null", await C.jobCheckedThisMonth("metrics-daily-refresh"), null);
  W.mode = "ok"; eq("the later client card: nothing on record is false", await (async () => { W.rows = []; return C.jobCheckedThisMonth("metrics-daily-refresh"); })(), false);
}

console.log = silent.log; console.error = silent.error; console.warn = silent.warn;
if (W.realCalls.length) F.push(`🔴 a real address was called: ${W.realCalls.slice(0, 3).join(", ")}`);
if (F.length) { console.error(`🔴 the alert path doesn't hold:\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log("✅ the alert path holds: a broken job is recorded, alerted once, reminded daily, cleared by a success; undelivered is on record; no table breaks nothing; nothing real was called");
process.exit(0);
