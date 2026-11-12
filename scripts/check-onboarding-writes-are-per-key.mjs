#!/usr/bin/env node
// check-onboarding-writes-are-per-key.mjs — ONE KEY AT A TIME INTO THE MONTH 1 RECORD (master data audit G9, approved by Chris 11-11).
//
// 🔴 WHY. client_onboarding_records.data (871 KB of step state) was read, changed and written back WHOLE by 58 writers. Two at once: the
// second erased the first, silently (11-9: step 57's result vanished under steps 61 and 62). The fix is two database functions that change
// ONE key in one statement (website docs/supabase/ONBOARDING_PER_KEY_WRITES_2026-11-11.sql), called through netlify/functions/_onboarding-patch.js,
// which falls back to the old whole write ONLY when the function is missing (404 / PGRST202).
//
// WHAT THIS HOLDS (fakes only: no network, no key, nothing read or written for real)
//   1 the SQL file and the helper agree: the function names, every parameter name PostgREST matches on, SECURITY DEFINER with an empty
//     search_path, execute revoked from public/anon/authenticated and granted to service_role only
//   2 the helper: only "the function is missing" falls back (a 500 is thrown, never answered with a whole write); the per-key ops of a
//     step save equal flow-execute's mergeTaskState on every fixture (completed_at kept, error cleared, pending clears completed_at)
//   3 the ADOPTED writers, run for real against a fake database that applies the SQL's semantics (re-implemented here, not borrowed from
//     the helper) while ANOTHER writer changes a different task and a different field of the same task between their read and their write:
//       the morning run's stamp · the website autorun's claim (compare-and-set on auto_n) · flow-execute saveTaskState and its form fields ·
//       admin-deliverables' save · the heavy runner's failure write (static) · the morning run's month note (static)
//     each keeps the other writer's change, issues no whole-record PATCH while the function exists, and still writes the old way when it
//     is missing
//   4 the follow-up list can only shrink: a netlify function that writes the record whole and is neither adopted nor on NOT_YET fails
// exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = [], fail = (m) => F.push(m);
const read = (rel) => fs.readFileSync(path.join(SITE, rel), "utf8");
const SQL_REL = "docs/supabase/ONBOARDING_PER_KEY_WRITES_2026-11-11.sql";
Object.assign(process.env, { SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "k", SUPA_TIMEOUT_MS: "5000", INTERNAL_FN_SECRET: "s" });
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));
const clone = (v) => JSON.parse(JSON.stringify(v));
// the fallback must SAY it fell back (a log line); collected here instead of printed
const WARNS = []; console.warn = (...a) => WARNS.push(a.join(" "));
const NOW_ISO = () => new Date().toISOString();

// ── the remaining whole-record writers (the follow-up). This list may only shrink. ────────────────────────────────────────────────────
// 🔑 THE BIGGEST LEVER: _step-record.js writeStepTasks writes the whole task map for ~45 of these files at once; making it diff and call
// writeChangedTasks for Month 1 covers them in one change. The browser writers (admin/admin.js, portal/portal.js) and the Mac's
// flow/state.mjs (Scraper) write the record whole too and are not netlify functions, so they are named here and not scanned.
const NOT_YET = new Set(["_citation-build.js", "_citation-recheck.js", "_gbp-landing-run.js", "_gbp-safety.js", "_gbp-watch.js", "_listing-removal-flow.js",
  "_listings-autorun.js", "_monthly-close.js", "_monthly-health.js", "_monthly-once.js", "_monthly-quarter.js", "_payment-welcome.js", "_rank-schedule.js",
  "_step3-go-ahead.js", "_youtube-read.js", "admin-access-confirm.js", "admin-blog-check.js", "admin-call-test.js", "admin-citation-build.js",
  "admin-citation-runbook.js", "admin-gbp-area-add.js", "admin-gbp-booking.js", "admin-gbp-categories.js", "admin-gbp-details-save.js", "admin-gbp-drift.js",
  "admin-gbp-facts-area.js", "admin-gbp-safety.js", "admin-gbp-services-push.js", "admin-gbp-services-told.js", "admin-month1-report.js", "admin-monthly-plan.js",
  "admin-review-message.js", "admin-site-snapshot.js", "admin-step-press.js", "admin-step-skip.js", "admin-step-unlock.js", "admin-week-skip.js",
  "call-tracking-provision.js", "cancel-kickoff-invite.js", "contract-sign.js", "core-change.js", "gbp-duplicate-keep.js", "gbp-duplicate-recheck.js",
  "gbp-duplicate-scan.js", "gbp-listing-override.js", "gbp-publish.js", "heal-onboarding-errors.js", "kickoff-call-live.js", "kickoff-call-outcome.js",
  "kickoff-rsvp-check.js", "notify-client-stage.js", "notify-step-open.js", "oauth-google-callback.js", "oauth-google-disconnect.js", "photo-match.js",
  "portal-book-kickoff.js", "portal-booking-keep.js", "portal-deliverables.js", "portal-form-test.js", "portal-github-app.js", "portal-merge-choice.js",
  "portal-page-proof.js", "portal-photo-check.js", "portal-photo-keep.js", "portal-photo-remove.js", "portal-photo-team.js", "portal-plan-ok.js",
  "portal-posts-wanted.js", "portal-reply.js", "portal-review-cadence.js", "portal-social-profiles.js", "portal-step-choice.js", "portal-step-fewer.js",
  "portal-step-input.js", "portal-step-later.js", "portal-step-recheck.js", "portal-thread.js", "portal-video-clip.js", "send-confirmation-email.js",
  "send-invoice-email.js", "send-kickoff-invite.js", "send-kickoff-recap.js", "send-monthly-report.js", "send-step-email.js", "site-change-watch.js",
  "site-publish-watch.js", "v2-audit-website.js", "v2-brain-analysis-background.js", "v2-competitor-profile.js", "v2-gbp-profile.js",
  "v2-generate-content-background.js", "v2-rank-grid-background.js"]);
const ADOPTED = new Set(["_morning-run.js", "flow-execute.js", "_website-autorun.js", "admin-deliverables.js", "flow-execute-heavy-background.js"]);

// ── the fake database: the SQL's semantics, written again here (so the helper is checked against the file, not against itself) ────────
const EMPTY = (v) => v === undefined || v === null || v === "" || v === false || v === 0;
function sqlMerge(cur, patch, remove, ifAbsent) {   // rga_onboarding_task_merge
  let v = cur && typeof cur === "object" && !Array.isArray(cur) ? { ...cur } : {};
  if (patch && typeof patch === "object") v = { ...v, ...clone(patch) };
  for (const [k, x] of Object.entries(ifAbsent || {})) if (EMPTY(v[k])) v[k] = x;
  for (const k of remove || []) delete v[k];
  return v;
}
const sqlMatches = (cur, expect) => Object.entries(expect || {}).every(([k, x]) => JSON.stringify((cur && typeof cur === "object" ? cur[k] : undefined) ?? null) === JSON.stringify(x ?? null));
function world(records, { mode = "fn", beforeWrite = null } = {}) {
  const recs = clone(records), log = { rpc: [], patches: [], gets: 0 };
  let n = 0;
  const bump = (r) => { r.updated_at = `u${++n}`; };
  async function supa(p, init = {}) {
    const m = (init.method || "GET").toUpperCase();
    if (p.startsWith("/rpc/")) {
      const fn = p.slice(5).split("?")[0], a = JSON.parse(init.body || "{}");
      log.rpc.push({ fn, a });
      if (mode === "missing") throw new Error('Supabase 404: {"code":"PGRST202","details":null,"hint":null,"message":"Could not find the function public.' + fn + ' in the schema cache"}');
      if (mode === "error") throw new Error('Supabase 500: {"code":"57014","message":"canceling statement due to statement timeout"}');
      if (beforeWrite) beforeWrite(recs);   // another writer lands between this writer's read and its write
      const r = recs.find((x) => x.client_id === a.p_client);
      if (fn === "set_onboarding_task") {
        if (!r) return { rga_patch: "v1", applied: false, reason: "no_record" };
        const tasks = (r.data && r.data.tasks) || {};
        if (a.p_expect && !sqlMatches(tasks[a.p_task], a.p_expect)) return { rga_patch: "v1", applied: false, reason: "expect_failed" };
        r.data = { ...(r.data || {}), tasks: { ...tasks } };
        if (a.p_patch === null) delete r.data.tasks[a.p_task]; else r.data.tasks[a.p_task] = sqlMerge(tasks[a.p_task], a.p_patch, a.p_remove, a.p_if_absent);
        bump(r);
        return { rga_patch: "v1", applied: true, task: r.data.tasks[a.p_task] === undefined ? null : clone(r.data.tasks[a.p_task]) };
      }
      if (fn === "set_onboarding_data_key") {
        if (a.p_key === "tasks") throw new Error("Supabase 400: tasks are written one at a time");
        if (!r) return { rga_patch: "v1", applied: false, reason: "no_record" };
        r.data = { ...(r.data || {}) };
        if (a.p_value === null) delete r.data[a.p_key]; else r.data[a.p_key] = clone(a.p_value);
        bump(r);
        return { rga_patch: "v1", applied: true, reason: null };
      }
      throw new Error(`Supabase 404: no fake for ${fn}`);
    }
    const q = new URL("https://x" + p);
    const table = q.pathname.slice(1);
    if (table !== "client_onboarding_records") return m === "GET" ? [] : null;
    const cid = (q.searchParams.get("client_id") || "").replace(/^eq\./, ""), rid = (q.searchParams.get("id") || "").replace(/^eq\./, "");
    const row = recs.find((r) => (cid && r.client_id === cid) || (rid && r.id === rid));
    if (m === "GET") { log.gets++; return row ? [clone(row)] : []; }
    if (m === "PATCH") {
      log.patches.push(p);
      if (!row) return [];
      if (beforeWrite) beforeWrite(recs);
      const cond = q.searchParams.get("updated_at");
      if (cond && cond.replace(/^eq\./, "") !== row.updated_at) return [];
      for (const [k, v] of q.searchParams) { if (k.startsWith("data->tasks->")) { const key = decodeURIComponent(k.split("->")[2]).replace(/"/g, ""); const cur = ((row.data.tasks || {})[key] || {}).auto_n; if (v === "is.null" ? cur != null : String(cur) !== v.replace(/^eq\./, "")) return []; } }
      const b = JSON.parse(init.body); row.data = b.data; bump(row);
      return [clone(row)];
    }
    if (m === "POST") return [];
    throw new Error(`unfaked ${m} ${p}`);
  }
  // the same database through fetch, for the modules that call Supabase themselves (flow-execute, admin-deliverables, the heavy runner)
  async function fetchFake(u, init = {}) {
    const url = String(u);
    if (!url.startsWith("https://db.test/rest/v1")) return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    try {
      const out = await supa(url.slice("https://db.test/rest/v1".length), init);
      return new Response(out == null ? "" : JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
    } catch (e) {
      const mm = /^Supabase (\d+): ([\s\S]*)$/.exec(e.message);
      return new Response(mm ? mm[2] : e.message, { status: mm ? Number(mm[1]) : 500 });
    }
  }
  return { recs, log, supa, fetchFake, row: (cid) => recs.find((r) => r.client_id === cid) };
}
const REC = (tasks, extra = {}) => ({ id: "rec-a", client_id: "a", updated_at: "u0", data: { tasks: clone(tasks), ...extra } });
const OTHER = (recs) => { const r = recs.find((x) => x.client_id === "a"); if (!r || r.__other) return; r.__other = true; r.data = { ...r.data, tasks: { ...r.data.tasks, other: { status: "done", by: "someone else" } } }; r.updated_at = "u-other"; };
const SAMEFIELD = (key) => (recs) => { const r = recs.find((x) => x.client_id === "a"); if (!r || r.__same) return; r.__same = true; r.data = { ...r.data, tasks: { ...r.data.tasks, [key]: { ...(r.data.tasks[key] || {}), note_by_other: "kept" } } }; r.updated_at = "u-same"; };
// a writer that throws where it should have saved is a regression (exit 1), not "can't tell"
const live = async (label, fn) => { try { return await fn(); } catch (e) { fail(`${label}: threw instead of saving (${String(e.message).slice(0, 120)})`); return undefined; } };
const both = (...fs_) => (recs) => fs_.forEach((f) => f(recs));

let OP, M, W, FX, AD, SQL, OPSRC;
try {
  SQL = read(SQL_REL); OPSRC = read("netlify/functions/_onboarding-patch.js");
  OP = req("./_onboarding-patch.js"); M = req("./_morning-run.js"); W = req("./_website-autorun.js");
} catch (e) { console.error(`⚠️  INDETERMINATE: can't load the code (${e.message})`); process.exit(2); }

try {
  // ═══ 1 · the SQL file and the helper agree ═══
  const sig = (name) => (new RegExp(`create or replace function public\\.${name}\\(([\\s\\S]*?)\\)\\s*returns jsonb\\s*language plpgsql\\s*security definer\\s*set search_path = ''`, "i").exec(SQL) || [])[1];
  const taskSig = sig("set_onboarding_task"), keySig = sig("set_onboarding_data_key");
  if (!taskSig) fail("1: set_onboarding_task is not a SECURITY DEFINER function with an empty search_path in the SQL file");
  if (!keySig) fail("1: set_onboarding_data_key is not a SECURITY DEFINER function with an empty search_path in the SQL file");
  const params = (s) => [...String(s || "").matchAll(/\b(p_[a-z_]+)\s+[a-z]/gi)].map((x) => x[1]);
  const wantTask = ["p_client", "p_task", "p_patch", "p_remove", "p_if_absent", "p_expect"], wantKey = ["p_client", "p_key", "p_value"];
  if (params(taskSig).join() !== wantTask.join()) fail(`1: set_onboarding_task's parameters are ${params(taskSig).join(", ")}, the helper sends ${wantTask.join(", ")}`);
  if (params(keySig).join() !== wantKey.join()) fail(`1: set_onboarding_data_key's parameters are ${params(keySig).join(", ")}, the helper sends ${wantKey.join(", ")}`);
  for (const p of wantTask) if (!new RegExp(`\\b${p}:`).test(OPSRC)) fail(`1: the helper never sends ${p}`);
  for (const p of wantKey) if (!new RegExp(`\\b${p}:`).test(OPSRC)) fail(`1: the helper never sends ${p}`);
  for (const fn of ["set_onboarding_task(uuid, text, jsonb, text[], jsonb, jsonb)", "set_onboarding_data_key(uuid, text, jsonb)"]) {
    const esc = fn.replace(/[()[\]]/g, "\\$&");
    if (!new RegExp(`revoke all on function public\\.${esc} from public, anon, authenticated;`).test(SQL)) fail(`1: execute on ${fn} is not revoked from public, anon and authenticated`);
    if (!new RegExp(`grant execute on function public\\.${esc} to service_role;`).test(SQL)) fail(`1: ${fn} is not granted to service_role`);
  }
  if (/grant execute on function[^;]*to (anon|authenticated)/i.test(SQL)) fail("1: a browser role is granted execute");
  if (!/where r\.client_id = p_client\s+and \(p_expect is null or public\.rga_onboarding_task_matches/.test(SQL)) fail("1: the task write is not one conditional UPDATE keyed by client (the compare-and-set must be in the same statement)");
  if (/create\s+table/i.test(SQL) && !/enable row level security/i.test(SQL)) fail("1: a table without row level security");

  // ═══ 2 · the helper ═══
  if (!OP.isMissing(new Error('Supabase 404: {"code":"PGRST202"}')) || !OP.isMissing(new Error("Could not find the function public.set_onboarding_task"))) fail("2: a missing function isn't recognised as missing");
  if (OP.isMissing(new Error('Supabase 500: {"code":"57014"}')) || OP.isMissing(new Error("Supabase unreachable: no answer within 5s"))) fail("2: a 500 or a timeout is read as 'the function is missing' (it would fall back to a whole write)");
  { const w = world([REC({ a: { status: "pending" } })], { mode: "error" }); let threw = false, legacyRan = false;
    try { await OP.patchTask(w.supa, "a", "a", { set: { x: 1 } }, async () => { legacyRan = true; }); } catch { threw = true; }
    if (!threw || legacyRan) fail("2: a database error fell back to the whole-record write instead of being thrown"); }
  { const w = world([REC({ a: { status: "pending" } })], { mode: "missing" }); let legacyRan = 0;
    const r = await OP.patchTask(w.supa, "a", "a", { set: { x: 1 } }, async () => { legacyRan++; return "old"; });
    if (!r.fallback || r.result !== "old" || legacyRan !== 1) fail("2: with the function missing, the caller's own write must run exactly once");
    if (!WARNS.some((x) => /set_onboarding_task is not in the database yet .*fell back to the whole-record write/.test(x))) fail("2: falling back to the whole-record write must be said in a log line"); }
  FX = req("./flow-execute.js");
  if (typeof FX.mergeTaskState !== "function") throw new Error("flow-execute no longer exports mergeTaskState");
  const PREVS = [undefined, {}, { status: "pending" }, { status: "error", error: "boom", failed_at: "f", completed_at: null }, { status: "done", completed_at: "2026-01-01T00:00:00.000Z", error: "old", keep: 1 }, { status: "in_progress", started_at: "s", completed_at: "" }];
  const PATCHES = [{ status: "done" }, { status: "done", error: "still" }, { status: "declined" }, { status: "pending" }, { ran_at: "r" }, { status: "in_progress", started_at: "t" }, { status: "done", completed_at: null }, { status: "done", completed_at: "2026-02-02T00:00:00.000Z" }, { status: "done", failed_at: "kept" }];
  const norm = (t) => { const x = { ...t }; if (x.completed_at && Math.abs(Date.parse(x.completed_at) - Date.now()) < 60000) x.completed_at = "NOW"; return JSON.stringify(Object.keys(x).sort().map((k) => [k, x[k]])); };
  let parity = 0;
  for (const p0 of PREVS) for (const pt of PATCHES) {
    const want = FX.mergeTaskState(p0 && clone(p0), pt), ops = OP.opsFromMerge(pt, NOW_ISO()), got = sqlMerge(p0, ops.set, ops.remove, ops.ifAbsent);
    if (norm(want) !== norm(got)) { fail(`2: the per-key save differs from mergeTaskState for ${JSON.stringify(p0)} + ${JSON.stringify(pt)}: ${norm(got)} vs ${norm(want)}`); } else parity++;
  }
  // diffTask: a set, a removal, a new task, a removed task
  { const d = OP.diffTask({ a: 1, b: 2, c: 3 }, { a: 1, b: 9, d: 4 });
    if (!d || JSON.stringify(d.set) !== JSON.stringify({ b: 9, d: 4 }) || JSON.stringify(d.remove) !== JSON.stringify(["c"])) fail(`2: diffTask misses a change or a removal (${JSON.stringify(d)})`);
    if (OP.diffTask({ a: 1 }, { a: 1 }) !== null) fail("2: an unchanged task is written");
    if (!OP.diffTask({ a: 1 }, undefined)?.drop) fail("2: a removed task isn't removed"); }

  // ═══ 3a · the morning run's stamp ═══
  { const w = world([REC({ s1: { status: "pending", keep: "mine" } })], { beforeWrite: both(OTHER, SAMEFIELD("s1")) });
    const d = { supa: w.supa, now: () => Date.parse("2026-11-11T15:00:00Z") };
    const ok = await live("3a stamp", () => M.stamp(d, "a", "s1"));
    const t = w.row("a").data.tasks;
    if (!ok) fail("3a: the stamp through the database did not report proven");
    if (w.log.patches.length) fail("3a: the stamp wrote the whole record although the function exists");
    if (!t.other || t.other.by !== "someone else") fail("3a: the stamp erased another task written meanwhile");
    if (!t.s1 || t.s1.note_by_other !== "kept" || t.s1.keep !== "mine" || !t.s1.morning_run || t.s1.morning_run.by !== "morning run") fail(`3a: the stamp must set only morning_run on its own task (${JSON.stringify(t.s1)})`);
    const a = (w.log.rpc[0] || {}).a || {};
    if (JSON.stringify(Object.keys(a.p_patch || {})) !== JSON.stringify(["morning_run"])) fail("3a: the stamp sends more than morning_run"); }
  { const w = world([REC({ s1: { status: "pending" } })], { mode: "missing" });
    const ok = await live("3a stamp (missing)", () => M.stamp({ supa: w.supa, now: () => Date.now() }, "a", "s1"));
    if (!ok || !w.log.patches.length || !/updated_at=eq\./.test(w.log.patches[0])) fail("3a: with the function missing, the stamp must still write the old way, conditional on the row unchanged"); }
  { const w = world([REC({ s1: { status: "pending" } })], { mode: "error" }); let threw = false;
    try { await M.stamp({ supa: w.supa, now: () => Date.now() }, "a", "s1"); } catch { threw = true; }
    if (!threw || w.log.patches.length) fail("3a: a database error during the stamp must be thrown, never answered with a whole write"); }
  { // a database that says it wrote, and hands back a task without this morning's mark: not proven
    const w = world([REC({ s1: { status: "pending" } })]);
    const lying = async (p, init) => (p.startsWith("/rpc/") ? { rga_patch: "v1", applied: true, task: { status: "pending" } } : w.supa(p, init));
    if (await M.stamp({ supa: lying, now: () => Date.now() }, "a", "s1")) fail("3a: a stamp the database did not hand back was reported proven"); }
  // the month note (static: the morning run sets or clears ONE top-level key)
  { const src = read("netlify/functions/_morning-run.js");
    const notes = (src.match(/patchDataKey\(d\.supa, c\.id, "month_open_error"/g) || []).length;
    if (notes !== 2) fail(`3a: the month note must be set and cleared through patchDataKey (found ${notes} of 2)`);
    for (const line of src.split("\n").filter((l) => /month_open_error/.test(l) && /method: "PATCH"/.test(l))) if (!/patchDataKey\(/.test(line)) fail(`3a: a whole-record write of the month note outside its fallback: ${line.trim().slice(0, 120)}`); }

  // ═══ 3b · the website autorun's claim: compare-and-set on auto_n, inside the database ═══
  { const w = world([REC({ k: { status: "pending", auto_n: 1, auto_done: { old: "x" } } })], { beforeWrite: OTHER });
    const d = { supa: w.supa, now: () => Date.now() };
    const won = await live("3b claim", () => W.claim(d, { id: "rec-a" }, "k", "sig1", { auto_run: { at: "t" } }));
    const t = w.row("a").data.tasks;
    if (!won) fail("3b: an uncontested claim lost");
    if (w.log.patches.length) fail("3b: the claim wrote the whole record although the function exists");
    if (!t.other) fail("3b: the claim erased another task written meanwhile");
    if (t.k.auto_n !== 2 || !t.k.auto_done.sig1 || t.k.auto_done.old !== "x" || !t.k.auto_run) fail(`3b: the claim's fields are wrong (${JSON.stringify(t.k)})`);
    const a = (w.log.rpc[0] || {}).a || {};
    if (!a.p_expect || a.p_expect.auto_n !== 1) fail("3b: the claim is not conditional on the auto_n it read"); }
  { // two passes read the same auto_n: the second must lose
    const w = world([REC({ k: { status: "pending" } })]);
    let first = true;
    const racing = async (p, init) => { if (p.startsWith("/rpc/") && first) { first = false; const r = w.row("a"); r.data.tasks.k = { ...r.data.tasks.k, auto_n: 1, auto_done: { other: "t" } }; } return w.supa(p, init); };
    const won = await W.claim({ supa: racing, now: () => Date.now() }, { id: "rec-a" }, "k", "sig2");
    if (won) fail("3b: a claim on an auto_n another pass moved still won (two passes would both act)"); }
  { const w = world([REC({ k: { status: "pending" } })], { mode: "missing" });
    const won = await live("3b claim (missing)", () => W.claim({ supa: w.supa, now: () => Date.now() }, { id: "rec-a" }, "k", "s"));
    if (!won || !w.log.patches.length || !/auto_n=is\.null/.test(decodeURIComponent(w.log.patches[0]))) fail("3b: with the function missing, the claim must still be the old conditional write"); }

  // ═══ 3c · flow-execute: saveTaskState and the form fields ═══
  { const w = world([REC({ mine: { status: "error", error: "boom", failed_at: "f", keep: 1 } })], { beforeWrite: both(OTHER, SAMEFIELD("mine")) });
    globalThis.fetch = w.fetchFake;
    await live("3c saveTaskState", () => FX.saveTaskState({ id: "a", workspace_id: "ws" }, "mine", { status: "done", ran_at: "r" }, false));
    const t = w.row("a").data.tasks;
    if (w.log.patches.length) fail("3c: saveTaskState wrote the whole record although the function exists");
    if (!t.other) fail("3c: saveTaskState erased another task written meanwhile");
    if (!t.mine || t.mine.status !== "done" || !t.mine.completed_at || "error" in t.mine || "failed_at" in t.mine || t.mine.keep !== 1 || t.mine.note_by_other !== "kept") fail(`3c: the saved task isn't mergeTaskState's (${JSON.stringify(t.mine)})`); }
  { const w = world([REC({ mine: { status: "done", completed_at: "2026-01-01T00:00:00.000Z" } })]);
    globalThis.fetch = w.fetchFake;
    await live("3c saveTaskState again", () => FX.saveTaskState({ id: "a", workspace_id: "ws" }, "mine", { status: "done" }, false));
    if (w.row("a").data.tasks.mine.completed_at !== "2026-01-01T00:00:00.000Z") fail("3c: a second done moved the first completion time"); }
  { const w = world([REC({ mine: { status: "pending" } })], { mode: "missing" });
    globalThis.fetch = w.fetchFake;
    await live("3c saveTaskState (missing)", () => FX.saveTaskState({ id: "a", workspace_id: "ws" }, "mine", { status: "in_progress" }, false));
    if (!w.log.patches.some((p) => /updated_at=eq\./.test(p)) || w.row("a").data.tasks.mine.status !== "in_progress") fail("3c: with the function missing, saveTaskState must still save, conditional on the row unchanged"); }
  { const w = world([REC({ t1: { status: "done" } })], { beforeWrite: OTHER });
    globalThis.fetch = w.fetchFake;
    await live("3c form fields", () => FX.writeOnboardingFormFields({ id: "a", workspace_id: "ws" }, { business_hours: "9-5", phone_ok: true }));
    const r = w.row("a");
    if (w.log.patches.length) fail("3c: the form fields wrote the whole record although the function exists");
    if (r.data.business_hours !== "9-5" || r.data.phone_ok !== true || !r.data.tasks.other) fail("3c: the form fields are one key each, and the tasks written meanwhile survive");
    let threw = false; try { await FX.writeOnboardingFormFields({ id: "a", workspace_id: "ws" }, { tasks: {} }); } catch { threw = true; }
    if (!threw || !r.data.tasks.t1) fail("3c: a form field named tasks must be refused (it would replace every step)"); }

  // ═══ 3d · admin-deliverables: a press writes only what it changed ═══
  AD = req("./admin-deliverables.js");
  if (typeof AD.saveChangedTasks !== "function") throw new Error("admin-deliverables no longer exports saveChangedTasks");
  { const w = world([REC({ step: { status: "pending", site_change: { v: 1 }, live_drift: "x" }, untouched: { status: "done" } })], { beforeWrite: both(OTHER, SAMEFIELD("step")) });
    globalThis.fetch = w.fetchFake;
    const rows = [clone(w.row("a"))], tasks = rows[0].data.tasks, tasksRead = clone(tasks);
    tasks.step.published = { v: 1 }; delete tasks.step.live_drift; tasks.step.status = "done";
    await live("3d save", () => AD.saveChangedTasks({ table: "client_onboarding_records", recId: "rec-a", rows, tasks, tasksRead, clientId: "a", monthly: false, where: "gate" }));
    const t = w.row("a").data.tasks;
    if (w.log.patches.length) fail("3d: admin-deliverables wrote the whole record although the function exists");
    if (!t.other) fail("3d: a press erased another task written while it worked");
    if (t.step.status !== "done" || !t.step.published || "live_drift" in t.step || t.step.note_by_other !== "kept") fail(`3d: the press's own change is wrong or erased the other writer's field (${JSON.stringify(t.step)})`);
    if (w.log.rpc.length !== 1 || w.log.rpc[0].a.p_task !== "step") fail(`3d: only the changed task is written (${w.log.rpc.map((x) => x.a.p_task).join(", ")})`); }
  { const w = world([REC({ step: { status: "pending" } })]);
    globalThis.fetch = w.fetchFake;
    const rows = [clone(w.row("a"))], tasks = rows[0].data.tasks;
    tasks.step.status = "done";
    await live("3d save (Month 2)", () => AD.saveChangedTasks({ table: "client_monthly_records", recId: "rec-a", rows, tasks, tasksRead: null, clientId: "a", monthly: true, where: "gate" }));
    if (w.log.rpc.length) fail("3d: a Month 2 record went through the Month 1 function"); }
  { const src = read("netlify/functions/admin-deliverables.js");
    const whole = (src.match(/JSON\.stringify\(\{ data: \{ \.\.\.rows\[0\]\.data, tasks \} \}\)/g) || []).length;
    if (whole !== 1) fail(`3d: admin-deliverables writes { ...rows[0].data, tasks } in ${whole} places; only saveChangedTasks' fallback may`);
    if (!/const whole = \(\) => supa\(`\/\$\{table\}\?id=eq\.\$\{recId\}`, \{ method: "PATCH", headers: \{ Prefer: "return=minimal" \}, body: JSON\.stringify\(\{ data: \{ \.\.\.rows\[0\]\.data, tasks \} \}\) \}\);\n  if \(monthly \|\| !tasksRead\) return whole\(\);/.test(src)) fail("3d: the whole write is no longer only saveChangedTasks' Month 2 / missing-function path");
    for (const line of src.split("\n").filter((l) => /JSON\.stringify\(\{ data: d1 \}\)/.test(l))) if (!/^\s*\(\) => supa\(/.test(line)) fail("3d: the rest check writes the whole record outside its fallback");
    const saves = (src.match(/await saveTasks\(recId, /g) || []).length;
    if (saves < 5) fail(`3d: ${saves} of admin-deliverables' saves go through saveTasks (5 expected)`); }

  // ═══ 3e · the heavy runner's failure (static: its handler needs a whole run) ═══
  { const src = read("netlify/functions/flow-execute-heavy-background.js");
    const body = (/async function writeFailure\(clientId, stepId, isMonthly, why\) \{([\s\S]*?)\n\}\n/.exec(src) || [])[1] || "";
    if (!/require\("\.\/_onboarding-patch"\)\.patchTask\(supaT, clientId, stepId, \{ set: failure \}/.test(body)) fail("3e: the heavy runner's failure is not written through patchTask");
    if (/method: "PATCH"/.test(body)) fail("3e: the heavy runner writes the record whole outside its fallback");
    if (!/const failure = \{ status: "error", error: String\(why\)\.slice\(0, 500\), failed_at: new Date\(\)\.toISOString\(\) \};/.test(body)) fail("3e: the failure must set status, error and failed_at only (never ran_at)"); }

  // ═══ 4 · the follow-up list only shrinks ═══
  const fnDir = path.join(SITE, "netlify/functions"), stillWhole = [];
  for (const f of fs.readdirSync(fnDir).filter((x) => x.endsWith(".js"))) {
    const s = fs.readFileSync(path.join(fnDir, f), "utf8");
    let n = 0;
    for (const m of s.matchAll(/client_onboarding_records/g)) { const win = s.slice(m.index, m.index + 400); if (/method:\s*"(PATCH|POST)"/.test(win) && /data/.test(win)) n++; }
    const w = (s.match(/writeStepTasks\(/g) || []).length - (/function writeStepTasks/.test(s) ? 1 : 0);
    if ((n || w) && !ADOPTED.has(f) && f !== "_step-record.js") { stillWhole.push(f); if (!NOT_YET.has(f)) fail(`4: ${f} writes the Month 1 record whole and is neither adopted nor on the follow-up list (use _onboarding-patch.js)`); }
  }
  for (const f of NOT_YET) if (!stillWhole.includes(f) && fs.existsSync(path.join(fnDir, f))) fail(`4: ${f} no longer writes the record whole: take it off NOT_YET (the list only shrinks)`);
  if (!F.length) console.log(`✅ Month 1 record writes are per key: the SQL and the helper agree (service role only), only a missing function falls back, the step save equals mergeTaskState on ${parity} fixtures, and the morning stamp, the autorun claim (compare-and-set), flow-execute's save and form fields, admin-deliverables' press and the heavy runner's failure keep a change another writer made meanwhile. Follow-up: ${stillWhole.length} functions still write it whole (biggest lever: _step-record.js writeStepTasks), plus admin.js, portal.js and the Mac's flow/state.mjs.`);
} catch (e) { console.error(`⚠️  INDETERMINATE: ${String(e.stack || e.message).split("\n").slice(0, 3).join(" ")}`); process.exit(2); }
if (F.length) { console.error(`❌ a Month 1 record write is not per key (${F.length}):`); for (const x of F) console.error(`  · ${x}`); process.exit(1); }
