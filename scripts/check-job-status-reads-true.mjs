#!/usr/bin/env node
// check-job-status-reads-true.mjs — a job's state is worked out right, and the admin card can't read an absence as OK (approved admin_system_health_v1, 10-31).
// 🔴 The whole card is worth nothing if "we don't know" paints green. HOLDS, by running the shipped code on fakes: (1) the due time from each cron,
// across a daylight-saving change and weekdays-only; (2) every state from a row: ok, late, failed, some failed, did nothing, no count, not finished,
// running, not recorded, not installed, not proven, not set up, off on purpose; (3) only `ok` is healthy; a newer good run beats an old failure; silence counts only
// from when check-ins began; (4) the alert decision: once, daily, retry undelivered, only a real OK clears; (5) the Mac's verdict on the watcher, and
// the later client card's "checked this month"; (6) the card itself (lifted from admin.js): which words, which tone, no green unless every job is OK.
// Files only. Exit 0 = holds · 1 = it reads wrong · 2 = moved (indeterminate). → memory project_system_health · feedback_an_absence_must_never_be_readable_as_a_value
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const req = createRequire(`${SITE}/netlify/functions/x.js`);
let S, JOBS;
try { S = req("./_job-status.js"); JOBS = req("./_job-manifest.js").JOBS; } catch (e) { console.error(`🔴 the status code won't load: ${e.message}`); process.exit(1); }
const F = [];
const eq = (name, got, want) => { if (got !== want) F.push(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); };
const iso = (t) => new Date(t).toISOString();
const U = (s) => Date.parse(s);
const HOUR = 3600000, MIN = 60000;

// ── (1) due times ───────────────────────────────────────────────────────────────────────────────────────────────────
const due = (cron, now, tz) => iso(S.prevDue(cron, U(now), tz));
eq("every 5 minutes", due("*/5 * * * *", "2026-10-31T10:07:30Z"), "2026-10-31T10:05:00.000Z");
eq("exactly on the minute counts", due("20 * * * *", "2026-10-31T10:20:00Z"), "2026-10-31T10:20:00.000Z");
eq("hourly looks back an hour", due("20 * * * *", "2026-10-31T10:19:00Z"), "2026-10-31T09:20:00.000Z");
eq("daily looks back a day", due("0 8 * * *", "2026-10-31T07:59:00Z"), "2026-10-30T08:00:00.000Z");
eq("weekdays only skip the weekend", due("30 14 * * 1-5", "2026-11-01T20:00:00Z"), "2026-10-30T14:30:00.000Z");   // Sunday → Friday
eq("Mondays only", due("0 9 * * 1", "2026-10-31T12:00:00Z"), "2026-10-26T09:00:00.000Z");
eq("the 1st of the month", due("0 7 1 * *", "2026-10-31T12:00:00Z"), "2026-10-01T07:00:00.000Z");
eq("Sunday as 0", due("0 13 * * 0", "2026-11-03T12:00:00Z", "America/Los_Angeles"), "2026-11-01T21:00:00.000Z");
eq("Sunday as 7 is Sunday as 0", due("0 13 * * 7", "2026-11-03T12:00:00Z", "America/Los_Angeles"), "2026-11-01T21:00:00.000Z");
eq("a zone ahead of UTC reads its own date", due("0 1 * * *", "2026-10-31T17:00:00Z", "Asia/Tokyo"), "2026-10-31T16:00:00.000Z");
eq("Pacific summer time", due("30 7 * * *", "2026-10-31T16:00:00Z", "America/Los_Angeles"), "2026-10-31T14:30:00.000Z");
eq("Pacific winter time, after the clocks change", due("30 7 * * *", "2026-11-02T18:00:00Z", "America/Los_Angeles"), "2026-11-02T15:30:00.000Z");
eq("before today's Pacific slot it's yesterday's", due("30 23 * * *", "2026-11-01T06:00:00Z", "America/Los_Angeles"), "2026-10-31T06:30:00.000Z");

// ── (2) (3) every state ─────────────────────────────────────────────────────────────────────────────────────────────
const NOW = U("2026-10-31T20:00:00Z");
const J = { job: "x", label: "X", where: "netlify", cron: "0 8 * * *", tz: "UTC", grace_min: 180, max_run_min: 5, keep_days: 90 };
const ctx = { now: NOW, tableReady: true, systemStart: U("2026-10-01T00:00:00Z") };
const started = iso(U("2026-10-31T08:00:05Z")), finished = iso(U("2026-10-31T08:00:20Z"));
const good = { job: "x", started_at: started, finished_at: finished, ok: true, count: 3, expected_min: 1, note: "3 clients" };
const st = (row, j = J, c = ctx, alert = null) => S.evaluateJob(j, row, alert, c);
const state = (name, want, row, j, c) => { const r = st(row, j, c); eq(`${name}: state`, r.state, want); return r; };
const okRow = state("a good run", "ok", good);
eq("a good run is the only healthy tone", okRow.tone, "ok"); eq("a good run isn't a problem", okRow.problem, false); eq("a good run's tag", okRow.tag, "OK");
if (!okRow.line.includes("3 clients")) F.push("a good run's line doesn't carry its note");
eq("ok_label replaces the word", st(good, { ...J, ok_label: "Ran" }).tag, "Ran");
state("a failure", "failed", { ...good, ok: false, error: "boom" });
if (!st({ ...good, ok: false, error: "boom" }).line.includes("boom")) F.push("a failure's line doesn't say why");
state("a finish with no ok is not OK", "failed", { ...good, ok: null });
state("some failed", "partial", { ...good, error: "1 of 3 failed" });
state("did nothing", "empty", { ...good, count: 0 });
state("no floor, zero is fine", "ok", { ...good, count: 0, expected_min: null });
state("no count where one was expected", "no_count", { ...good, count: null });
state("a floor met exactly", "ok", { ...good, count: 1 });
state("started and never finished", "not_finished", { job: "x", started_at: iso(NOW - 10 * MIN) });
state("still running", "running", { job: "x", started_at: iso(NOW - 2 * MIN) });
state("late: the slot passed with no new run", "late", { ...good, started_at: iso(U("2026-10-30T08:00:05Z")), finished_at: iso(U("2026-10-30T08:00:20Z")) });
state("inside the grace it isn't late yet", "ok", { ...good, started_at: iso(U("2026-10-30T08:00:05Z")), finished_at: iso(U("2026-10-30T08:00:20Z")) }, J, { ...ctx, now: U("2026-10-31T10:00:00Z") });
state("a start just before the slot still serves it", "ok", { ...good, started_at: iso(U("2026-10-31T07:59:30Z")) });
state("a failed old run past its slot is late, not failed", "late", { ...good, ok: false, started_at: iso(U("2026-10-30T08:00:05Z")), finished_at: iso(U("2026-10-30T08:00:20Z")) });
state("the table doesn't exist", "not_set_up", null, J, { ...ctx, tableReady: false });
state("a row can't rescue a missing table", "not_set_up", good, J, { ...ctx, tableReady: false });
state("no row, not installed", "not_installed", null, { ...J, installed: false });
state("no row, not proven", "unproven", null, { ...J, unproven: true });
state("no row, check-in not added yet", "not_recorded", null, { ...J, checkin_pending: "soon" });
// 🔒 Off on purpose (the owner 11-7, the daily step runner): a decision, never OK, never an alert, never "late", and a run by hand is said.
{ const OFF = { ...J, off: "Turned off on purpose" };
  const o = state("no row, off on purpose", "off", null, OFF);
  eq("off isn't a problem", o.problem, false); eq("off isn't the healthy tone", o.tone, "off"); eq("off's tag", o.tag, "Off on purpose");
  if (!/Turned off on purpose/.test(o.line)) F.push("an off job's line doesn't say why it's off");
  state("off, its old slot long passed: still off, not late", "off", null, OFF, { ...ctx, systemStart: U("2026-01-01T00:00:00Z") });
  const byHand = state("off, run by hand and failed: still off", "off", { ...good, ok: false, error: "boom" }, OFF);
  if (!/Last run by hand/.test(byHand.line)) F.push("an off job run by hand doesn't say it was run by hand");
  const d = S.alertDecision(o, sent0(), NOW); if (d.send || d.clear) F.push("an off job sends or clears an alert");
  const sm = S.summarize([st(good), o]); eq("summary: off is counted as off", sm.off, 1); eq("summary: off isn't unknown", sm.unknown, 0); eq("summary: watched leaves off out", sm.watched, 1); }
state("check-in not added yet, a row arrives: watched like any job", "failed", { ...good, ok: false }, { ...J, checkin_pending: "soon" });
state("no row, slot since check-ins began", "late", null);
state("no row, check-ins began after the slot", "not_recorded", null, J, { ...ctx, systemStart: U("2026-10-31T09:00:00Z") });
state("no row, no check-ins at all yet", "not_recorded", null, J, { ...ctx, systemStart: null });
state("not installed, first check-in arrives: watched like any job", "ok", good, { ...J, installed: false });
state("not proven, first check-in arrives: watched like any job", "late", { ...good, started_at: iso(U("2026-10-29T08:00:05Z")), finished_at: iso(U("2026-10-29T08:00:20Z")) }, { ...J, unproven: true });
for (const [name, row, j, c] of [["not set up", null, J, { ...ctx, tableReady: false }], ["not recorded", null, J, { ...ctx, systemStart: null }], ["not installed", null, { ...J, installed: false }, ctx], ["not proven", null, { ...J, unproven: true }, ctx], ["running", { job: "x", started_at: iso(NOW - MIN) }, J, ctx]]) {
  const r = st(row, j, c);
  eq(`${name} isn't OK`, r.tone !== "ok" && r.state !== "ok", true);
  eq(`${name} doesn't alert`, r.problem, false);
}
for (const row of [{ ...good, ok: false }, { ...good, error: "x" }, { ...good, count: 0 }, { ...good, count: null }, { job: "x", started_at: iso(NOW - HOUR) }]) eq(`${JSON.stringify(row).slice(0, 50)} needs a look`, st(row).tone, "you");
const sum = S.summarize([okRow, st({ ...good, ok: false }), st(null, J, { ...ctx, systemStart: null })]);
eq("summary problems", sum.problems, 1); eq("summary ok", sum.ok, 1); eq("summary unknown", sum.unknown, 1);
const sf = S.statusesFrom([good, { job: "alert:x", ok: false, note: "failed · via nowhere", finished_at: finished, count: 1 }], { now: NOW, tableReady: true, systemStart: ctx.systemStart, jobs: [J] })[0];
eq("statusesFrom finds the job's row", sf.state, "ok"); eq("and its alert: not delivered is said", sf.alert && sf.alert.delivered, false);
if (!/could not be delivered/.test((sf.alert || {}).line || "")) F.push("an undelivered alert doesn't say so on the row");
eq("a cleared alert isn't shown", S.statusesFrom([good, { job: "alert:x", ok: true, note: "cleared · OK", finished_at: finished }], { now: NOW, tableReady: true, jobs: [J] })[0].alert, null);

function sent0() { return { job: "alert:x", ok: true, count: 1, note: "failed · via activity", finished_at: iso(NOW - HOUR) }; }
// ── (4) the alert decision ──────────────────────────────────────────────────────────────────────────────────────────
const bad = st({ ...good, ok: false, error: "boom" });
const sent = (hoursAgo, extra = {}) => ({ job: "alert:x", ok: true, count: 1, note: "failed · via activity", finished_at: iso(NOW - hoursAgo * HOUR), ...extra });
eq("first alert", S.alertDecision(bad, null, NOW).send, "first");
eq("after a clear it's a first alert again", S.alertDecision(bad, sent(1, { note: "cleared · OK" }), NOW).send, "first");
eq("told an hour ago: quiet", S.alertDecision(bad, sent(1), NOW).send, null);
eq("told 23 hours ago: quiet", S.alertDecision(bad, sent(23), NOW).send, null);
eq("told a day ago: reminder", S.alertDecision(bad, sent(24), NOW).send, "reminder");
eq("a reminder counts up", S.alertDecision(bad, sent(24, { count: 3 }), NOW).times, 4);
eq("undelivered: try again next hour", S.alertDecision(bad, sent(1, { ok: false }), NOW).send, "retry");
eq("an alert with no ok wasn't delivered", S.alertDecision(bad, sent(1, { ok: null }), NOW).send, "retry");
eq("a real OK clears", S.alertDecision(okRow, sent(1), NOW).clear, true);
eq("OK with nothing open: nothing", S.alertDecision(okRow, null, NOW).clear, undefined);
for (const [name, r] of [["not recorded", st(null, J, { ...ctx, systemStart: null })], ["running", st({ job: "x", started_at: iso(NOW - MIN) })], ["not set up", st(null, J, { ...ctx, tableReady: false })], ["not proven", st(null, { ...J, unproven: true })]]) {
  const d = S.alertDecision(r, sent(1), NOW);
  if (d.clear || d.send) F.push(`${name} must neither clear an alert nor send one`);
}

// ── (5) the Mac's verdict and the later client card ─────────────────────────────────────────────────────────────────
const wr = (row, opts) => S.watcherRan(row, NOW, opts).exit;
eq("watcher: no table", wr(null, { tableReady: false }), 2);
eq("watcher: no row", wr(null), 2);
eq("watcher: ran just now", wr({ started_at: iso(NOW - 20 * MIN), finished_at: iso(NOW - 19 * MIN), ok: true }), 0);
eq("watcher: three hours is still fine", wr({ started_at: iso(NOW - 179 * MIN), finished_at: iso(NOW - 178 * MIN), ok: true }), 0);
eq("watcher: silent too long", wr({ started_at: iso(NOW - 200 * MIN), finished_at: iso(NOW - 199 * MIN), ok: true }), 1);
eq("watcher: failed", wr({ started_at: iso(NOW - 20 * MIN), finished_at: iso(NOW - 19 * MIN), ok: false, error: "x" }), 1);
eq("watcher: never finished", wr({ started_at: iso(NOW - 20 * MIN) }), 1);
eq("watcher: running right now", wr({ started_at: iso(NOW - MIN) }), 0);
const ctm = (row, opts) => S.checkedThisMonth(row, NOW, opts);
eq("client card: good run this month", ctm({ ok: true, finished_at: iso(NOW - HOUR) }), true);
eq("client card: last month isn't this month", ctm({ ok: true, finished_at: iso(U("2026-09-30T20:00:00Z")) }), false);
eq("client card: no run", ctm(null), false);
eq("client card: a failed row isn't checked", ctm({ ok: false, finished_at: iso(NOW - HOUR) }), false);
eq("client card: can't tell is null, never true", ctm(null, { tableReady: false }), null);

// ── (6) the card ────────────────────────────────────────────────────────────────────────────────────────────────────
const js = fs.readFileSync(`${SITE}/admin/admin.js`, "utf8");
const lift = (name) => { const at = js.indexOf(`function ${name}(`); if (at < 0) { console.error(`⚠️  INDETERMINATE — ${name} moved out of admin.js`); process.exit(2); } const open = js.indexOf("{\n", at); let i = open, d = 0, q = null;
  for (; i < js.length; i++) { const c = js[i]; if (q) { if (c === "\\") i++; else if (c === q) { if (q === "`" ) q = null; else q = null; } continue; } if (c === '"' || c === "'" ) { q = c; continue; } if (c === "`") { i = skipTpl(i); continue; } if (c === "{") d++; else if (c === "}") { d--; if (d === 0) break; } }
  return js.slice(at, i + 1); };
function skipTpl(i) { for (i++; i < js.length; i++) { const c = js[i]; if (c === "\\") { i++; continue; } if (c === "`") return i; if (c === "$" && js[i + 1] === "{") { let d = 1; i += 2; for (; i < js.length && d; i++) { const k = js[i]; if (k === "`") i = skipTpl(i); else if (k === "{") d++; else if (k === "}") d--; } i--; } } return i; }
const box = { escapeHtml: (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])), escapeAttribute: (s) => String(s ?? "") };
vm.createContext(box);
vm.runInContext(`${lift("systemHealthRow")}\n${lift("systemHealthHtml")}\nthis.card = systemHealthHtml;`, box);
const row = (job, st_, where = "netlify") => ({ job, label: job, where, ...S.evaluateJob({ ...J, job, label: job, where }, st_ === "ok" ? good : st_ === "bad" ? { ...good, ok: false, error: "boom" } : null, null, { ...ctx, systemStart: null, tableReady: st_ !== "unset" }) });
const data = (jobs, extra = {}) => ({ ok: true, table_ready: true, read_label: "Oct 31, 8:00 PM", jobs, summary: S.summarize(jobs), alerts: { tone: "unk", tag: "Messages only", line: "No webhook is set" }, ...extra });
const card = (d, o = { full: true }) => box.card(d, o);
const has = (name, html, re) => { if (!re.test(html)) F.push(`the card, ${name}: expected ${re}`); };
const hasnt = (name, html, re) => { if (re.test(html)) F.push(`the card, ${name}: must not show ${re}`); };
const GREEN = /class="ob-zc ok"|All clear/;
{
  const c = card(data([row("a", "ok"), row("b", "bad"), row("c", "bad"), row("m", "none", "mac")]));
  has("two problems", c, /class="ob-zc you"/); has("two problems", c, /Your move/); has("two problems", c, /2 jobs need a look/); hasnt("two problems", c, GREEN);
  has("two problems", c, /class="ob-zc-place you"/); has("two problems", c, /ob-zc-you">Failed/); has("the OK row", c, /class="ob-zc-place ok"/); has("the unknown row", c, /class="ob-zc-place unk"/); has("the unknown row", c, /ob-zc-unk">Not recorded/);
  if (c.indexOf('place you') > c.indexOf('place ok')) F.push("the card lists a healthy row above a problem");
  has("a footer control", c, /data-sh-refresh/); has("when it was read", c, /read Oct 31, 8:00 PM/); has("alerts row", c, /Alerts to you/); has("alerts row", c, /Messages only/);
  has("one problem is singular", card(data([row("b", "bad")])), /1 job needs a look/);
  const ok = card(data([row("a", "ok"), row("b", "ok")]));
  has("all good", ok, /All clear/); has("all good", ok, /all 2 jobs checked in/);
  const offRow = { job: "f", label: "f", where: "netlify", ...S.evaluateJob({ ...J, job: "f", label: "f", off: "Turned off on purpose" }, null, null, ctx) };
  const withOff = card(data([row("a", "ok"), row("b", "ok"), offRow]));
  has("an off job doesn't hold back all clear", withOff, /All clear/); has("an off job isn't counted", withOff, /all 2 jobs checked in/);
  has("an off job still shows its row", withOff, /<b>f<\/b>/); has("an off job's row", withOff, /ob-zc-unk">Off on purpose/); hasnt("an off job's row is never green", withOff, /place ok" data-sh-job="f"/);
  if (withOff.indexOf("<b>f</b>") < withOff.indexOf("place ok")) F.push("the card lists an off job above a working one");
  hasnt("an off job doesn't hide a problem", card(data([row("a", "bad"), offRow])), GREEN);
  const oneUnknown = card(data([row("a", "ok"), row("b", "none")]));
  hasnt("one unknown job", oneUnknown, GREEN); has("one unknown job", oneUnknown, /1 of 2 jobs checked in/); has("one unknown job", oneUnknown, /Not all checked/);
  const notSet = card(data(["a", "b", "c"].map((j) => row(j, "unset")).concat(row("m", "unset", "mac")), { table_ready: false }));
  hasnt("not set up", notSet, GREEN); has("not set up", notSet, /Not set up yet/); has("not set up", notSet, /isn't set up yet/); has("not set up", notSet, /job_checkins\.sql/); hasnt("not set up", notSet, /Alerts to you/);
  has("not set up", notSet, /3 Netlify scheduled jobs/); hasnt("not set up", notSet, /class="ob-zc-place ok"/); hasnt("not set up", notSet, /ob-zc-cov/);
  const noJobs = card(data([]));
  hasnt("an empty list", noJobs, GREEN);
  const failed = box.card(null, { full: true });
  hasnt("a failed read", failed, GREEN); has("a failed read", failed, /couldn't be read/); has("a failed read", failed, /data-sh-refresh/);
  const loading = box.card(null, { full: true, loading: true });
  hasnt("loading", loading, GREEN); has("loading", loading, /Reading the jobs…/);
  const grouped = card(data([row("a", "ok"), row("b", "ok"), row("c", "ok"), row("m", "ok", "mac")]));
  has("quiet Netlify jobs share a row", grouped, /3 Netlify scheduled jobs/); has("and can open", grouped, /data-sh-each/); hasnt("a Mac job stays on its own", grouped, /4 Netlify/);
  const each = box.card(data([row("a", "ok"), row("b", "ok"), row("c", "ok")]), { full: true, each: true });
  hasnt("Show each", each, /Netlify scheduled jobs/); has("Show each", each, /<b>a<\/b>/); has("Show each", each, /<b>c<\/b>/);
  const prob = card(data([row("a", "bad"), row("b", "bad"), row("c", "ok"), row("d", "ok")]));
  has("a problem never hides in a group", prob, /<b>a<\/b>/); has("a problem never hides in a group", prob, /<b>b<\/b>/);
  const fold = box.card(data([row("a", "bad")]), { full: false });
  has("on other screens only the header", fold, /1 job needs a look/); has("on other screens only the header", fold, /data-sh-open/); hasnt("on other screens only the header", fold, /ob-zc-place/);
  // Approved admin_system_health_tab_v1 (11-6): the short card's button is "Open" and goes to the System health tab, where the
  // rows draw in full. It no longer unfolds in place.
  has("the short card's button", fold, /data-sh-open>Open</);
  has("on its own tab", box.card(data([row("a", "bad")]), { full: true }), /ob-zc-place/);
  const withAlert = card(data([{ ...row("a", "bad"), alert: { line: "The alert could not be delivered (tried Oct 31)" } }]));
  has("an undelivered alert shows", withAlert, /could not be delivered/);
  const hostile = card(data([{ ...row("a", "bad"), line: "<img src=x onerror=1>" }]));
  hasnt("a job's error is escaped", hostile, /<img/);
  for (const [n, h] of [["two problems", c], ["all good", ok], ["not set up", notSet], ["failed", failed]]) if (/—/.test(h.replace(/<[^>]+>/g, ""))) F.push(`the card, ${n}: an em dash on screen`);
}
// The manifest's readers: a reply that's missing fields must not throw, and must not invent a count.
for (const j of JOBS.filter((x) => x.read)) {
  let r; try { r = j.read({}); } catch (e) { F.push(`${j.job}: its reader throws on an empty reply: ${e.message}`); continue; }
  if (typeof r.count === "number" && r.count > 0) F.push(`${j.job}: an empty reply reads as ${r.count} done`);
}
const read = Object.fromEntries(JOBS.filter((x) => x.read).map((x) => [x.job, x.read]));
eq("metrics: all pulls failed reads 0", read["metrics-daily-refresh"]({ ok: 0, results: [{ ok: false }], step_probes: [] }).count, 0);
eq("metrics: a failed pull is named", read["metrics-daily-refresh"]({ ok: 1, results: [{ ok: true }, { ok: false }, { skipped: "x" }], step_probes: [] }).error, "1 of 2 metric pulls failed");
eq("billing: a failed read is an error", /Could not read/.test(read["billing-daily-check"]({ processed: 0, read_error: "500" }).error), true);
eq("brain: nothing started has a floor", read["brain-weekly-dispatch"]({ results: [{ status: 500 }] }).count, 0);
eq("brain: floor", read["brain-weekly-dispatch"]({ results: [] }).expected_min, 1);
eq("todo: a held-back email is an error", /held back/.test(read["rga-todo-morning"]({ sent: true, suppressed: true }).error), true);
eq("photos: no photos due is fine", read["photos-publish-sweep"]({ clients: 0, results: [] }).expected_min, undefined);

if (F.length) { console.error(`🔴 System health reads wrong:\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log("✅ System health reads true: every due time, all 13 states, the alert decision, the Mac's verdict, the card; nothing unknown is green");
