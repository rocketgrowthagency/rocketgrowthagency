#!/usr/bin/env node
// check-website-pages-measure-themselves.mjs — A LIVE PAGE IS MEASURED EVERY WEEK BY ITSELF, AND A WORSE ONE OPENS RGA'S TO DO
// (approved master mockup #11 website work, W3, Chris 11-11: "Schedule it weekly; a worse page opens a To do for RGA, never a client message
// until RGA has looked").
//
// 🔴 WHY: the 2, 4 and 8-week Search Console reads ran only when someone opened the step's card, so a page doing worse than what it replaced
// raised nothing. Holds when:
//   · site-measure-run is scheduled weekly in netlify.toml with the same cron as its System health line (_job-manifest), wrapped in its check-in
//   · each FINISHED window is recorded once on the step (task.measured, keyed to the published version); a window not finished yet records
//     nothing; Search Console unread records nothing (never a zero); test clients are skipped; the record is read again before the write
//   · "worse than before" (100+ views and a lower click rate than the 28 days before) is RGA's To do row (_open-moves page_worse) on the
//     step, never the client's move; a newer version drafted for the step clears it
// Runs the shipped code on fakes (no Google, no database). Exit 0 holds · 1 broken · 2 couldn't tell.
import fs from "node:fs";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const req = createRequire(`${SITE}/netlify/functions/x.js`);
const F = [], fail = (m) => F.push(m), ind = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
process.env.SUPABASE_URL = "https://supa.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
let PM, RUN, OM, MAN, TOML, PB;
try {
  PM = req("./_page-measure.js"); RUN = req("./site-measure-run.js"); OM = req("./_open-moves.js"); MAN = req("./_job-manifest.js");
  TOML = fs.readFileSync(`${SITE}/netlify.toml`, "utf8"); PB = JSON.parse(fs.readFileSync(`${SITE}/data/playbooks/playbooks.json`, "utf8"));
} catch (e) { ind(`harness: ${e.message}`); }
for (const k of ["liveOf", "recordWindows", "worseOpen", "measurePage"]) if (typeof PM[k] !== "function") ind(`_page-measure.js has no ${k}`);
if (typeof RUN.run !== "function") ind("site-measure-run.js has no run");

const KEY = "m1.web.priority_pages", DAY = 864e5;
const LIVE_AT = "2026-08-01T12:00:00.000Z";
const task = (o = {}) => ({ status: "done", site_change: { v: "3", kind: "page", page_url: "https://acme.example/drain-cleaning/" }, published: { v: "3", at: LIVE_AT, url: "https://acme.example/drain-cleaning/" }, ...o });
// Search Console rows: 28 days before at 5% click rate, after at 2% (worse), 20 impressions a day
const rows = (beforeRate, afterRate, toIso) => {
  const out = [], start = Date.parse(LIVE_AT) - 28 * DAY, end = Date.parse(toIso);
  for (let d = start; d <= end; d += DAY) { const after = d >= Date.parse(LIVE_AT) - DAY; out.push({ date: new Date(d).toISOString().slice(0, 10), impressions: 20, clicks: Math.round(20 * (after ? afterRate : beforeRate) * 100) / 100, position: 8 }); }
  return out;
};

try {
  // ── recorded once per finished window, keyed to the version ──
  const now3w = new Date(Date.parse(LIVE_AT) + 21 * DAY);
  const m3w = PM.measurePage(rows(0.05, 0.02, now3w.toISOString()), LIVE_AT, now3w);
  const rec1 = PM.recordWindows(task(), m3w, now3w);
  if (!rec1 || !rec1.windows || !rec1.windows[2] || rec1.windows[4] || rec1.windows[8]) fail(`3 weeks after live, only the 2-week window is recorded (${JSON.stringify(rec1 && Object.keys(rec1.windows || {}))})`);
  if (rec1 && rec1.v !== "3") fail("the measurement isn't keyed to the published version");
  if (rec1 && (!rec1.worse || rec1.worse.weeks !== 2)) fail("a page at 2% after 5% before (100+ views) isn't read as worse");
  if (PM.recordWindows({ ...task(), measured: rec1 }, m3w, now3w) !== null) fail("the same finished window is recorded twice");
  if (PM.recordWindows(task(), { state: "unknown", windows: [] }, now3w) !== null) fail("Search Console unread is recorded (it must record nothing, never a zero)");
  const now1w = new Date(Date.parse(LIVE_AT) + 7 * DAY);
  if (PM.recordWindows(task(), PM.measurePage(rows(0.05, 0.02, now1w.toISOString()), LIVE_AT, now1w), now1w) !== null) fail("a window not finished yet is recorded");
  if (PM.recordWindows(task({ published: { v: "2", at: LIVE_AT } }), m3w, now3w) !== null) fail("a step whose live version isn't its current change is measured");
  const better = PM.recordWindows(task(), PM.measurePage(rows(0.02, 0.06, now3w.toISOString()), LIVE_AT, now3w), now3w);
  if (!better || better.worse) fail("a page doing better is read as worse");

  // ── the To do row: RGA's, never the client's; a newer version clears it ──
  const tasks = { [KEY]: { ...task(), measured: rec1 } };
  const moves = OM.openMoves({ playbooks: PB, data: { tasks }, now: now3w.toISOString() });
  const mv = moves.find((m) => m.kind === "page_worse");
  if (!mv || mv.owner !== "rga" || mv.step_id !== KEY) fail(`a page doing worse isn't RGA's To do row on its step (${JSON.stringify(mv)})`);
  if (mv && (!/doing worse than before/.test(mv.what) || /—/.test(mv.what))) fail(`the To do row doesn't say what's wrong plainly (${mv && mv.what})`);
  if (OM.clientMoves(moves, PB).some((m) => m.kind === "page_worse")) fail("a page doing worse becomes the client's move (RGA looks first)");
  // even on a step the client can see, the row stays RGA's (the filter, not the step's visibility, keeps it off the client's list)
  const seen = (PB.month1 || []).find((x) => x.clientStepNo != null);
  if (seen && OM.clientMoves([{ owner: "rga", kind: "page_worse", step_id: seen.id, since: null }], PB).length) fail("a page_worse row on a client-visible step reaches the client");
  const redrafted = { [KEY]: { ...task(), site_change: { v: "4", kind: "page", page_url: "https://acme.example/drain-cleaning/" }, measured: rec1 } };
  if (OM.openMoves({ playbooks: PB, data: { tasks: redrafted }, now: now3w.toISOString() }).some((m) => m.kind === "page_worse")) fail("a new version drafted for the step doesn't clear the row");

  // ── the run: skips test clients (in its query), reads once per page, writes the record read again, records nothing for unread ──
  const DB = { onboarding: { "c-1": { id: "r1", client_id: "c-1", updated_at: "2026-08-22T00:00:00.000000+00:00", data: { tasks: { [KEY]: task() } } }, "c-2": { id: "r2", client_id: "c-2", updated_at: "2026-08-22T00:00:00.000000+00:00", data: { tasks: { [KEY]: task() } } } }, queries: [], writes: 0 };
  const supa = async (p, init = {}) => {
    DB.queries.push(p);
    if (p.startsWith("/clients?")) return [{ id: "c-1" }, { id: "c-2" }];
    const m = /client_id=eq\.([\w-]+)/.exec(p), r = m && DB.onboarding[m[1]];
    if (p.startsWith("/client_onboarding_records") && (init.method || "GET") === "GET") return r ? [JSON.parse(JSON.stringify(r))] : [];
    if (p.startsWith("/client_onboarding_records") && init.method === "PATCH") { const id = /id=eq\.(\w+)/.exec(p)[1]; const row = Object.values(DB.onboarding).find((x) => x.id === id); Object.assign(row, JSON.parse(init.body)); DB.writes++; return [JSON.parse(JSON.stringify(row))]; }
    if (p.startsWith("/client_step_rows")) throw new Error('404 {"code":"PGRST205"}');
    return [];
  };
  const reads = [];
  const out = await RUN.run({ supa, now: () => now3w.getTime(), readRows: async (o) => { reads.push(o); return o.clientId === "c-2" ? null : rows(0.05, 0.02, now3w.toISOString()); } });
  const cq = DB.queries.find((q) => q.startsWith("/clients?")) || "";
  if (!/source\.not\.like\.test:\*/.test(cq) || !/archived_at=is\.null/.test(cq)) fail("the weekly run doesn't skip test and archived clients");
  if (reads.length !== 2 || reads.some((o) => o.url !== "https://acme.example/drain-cleaning/")) fail(`the run doesn't read each live page once (${reads.length})`);
  if (reads[0] && reads[0].from !== new Date(Date.parse(LIVE_AT) - 29 * DAY).toISOString().slice(0, 10)) fail("the run doesn't read the 28 days before the page went live (nothing to compare)");
  const m1 = DB.onboarding["c-1"].data.tasks[KEY].measured, m2 = DB.onboarding["c-2"].data.tasks[KEY].measured;
  if (!m1 || !m1.windows[2] || !m1.worse) fail("the run doesn't record the finished window and the worse reading");
  if (m2) fail("Search Console unread still recorded a measurement");
  if (out.recorded !== 1 || out.unknown !== 1 || out.worse !== 1) fail(`the run's counts are wrong (${JSON.stringify(out)})`);
  const w0 = DB.writes; await RUN.run({ supa, now: () => now3w.getTime(), readRows: async () => rows(0.05, 0.02, now3w.toISOString()) });
  if (DB.writes - w0 !== 1) fail(`a second run in the same week writes again for a window already kept (${DB.writes - w0} writes; only c-2's first read may write)`);

  // ── scheduled weekly, the same cron in System health, wrapped in its check-in ──
  const sch = /\[functions\."site-measure-run"\]\s*\n\s*schedule\s*=\s*"([^"]+)"/.exec(TOML);
  const job = (MAN.JOBS || MAN.jobs || MAN.default || []).find ? (MAN.JOBS || MAN.jobs || MAN.default).find((j) => j.job === "site-measure-run") : null;
  if (!sch) fail("site-measure-run isn't scheduled in netlify.toml");
  else if (!/^\d+ \d+ \* \* [0-6]$/.test(sch[1])) fail(`site-measure-run isn't weekly (${sch[1]})`);
  if (!job) fail("site-measure-run has no System health line (_job-manifest)");
  else if (sch && job.cron !== sch[1]) fail(`System health expects ${job.cron}, netlify.toml runs ${sch && sch[1]}`);
  const src = fs.readFileSync(`${SITE}/netlify/functions/site-measure-run.js`, "utf8");
  if (!/withCheckin\("site-measure-run", exports\.handler\)/.test(src)) fail("site-measure-run doesn't say it ran (no check-in wrapper)");
  if (/notify-step-open|portal-message|sendEmail|resend|gmail/i.test(src)) fail("site-measure-run can message someone (RGA looks first; it only records)");
} catch (e) { ind(`threw: ${String(e.stack || e.message).split("\n").slice(0, 3).join(" ")}`); }

if (F.length) { console.error(`❌ website pages don't measure themselves — ${F.length} problem(s):`); for (const x of F) console.error(`  · ${x}`); process.exit(1); }
console.log("✅ website pages measure themselves weekly: each finished 2/4/8-week window recorded once on its step (unread and unfinished record nothing, test clients skipped), a page doing worse than before is RGA's To do row (never the client's; a newer version clears it), scheduled weekly with the same cron in System health");
