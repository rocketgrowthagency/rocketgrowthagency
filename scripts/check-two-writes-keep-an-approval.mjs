#!/usr/bin/env node
// check-two-writes-keep-an-approval.mjs — TWO WRITES CAN NO LONGER DROP AN APPROVAL (approved master mockup #11 website work, W2, Chris 11-11).
//
// 🔴 WHY: a client's step record is one JSON blob that 58 writers read and write back whole (the website autopilot every 10 minutes, the
// publish watcher every 5, admin's presses, the client's approval). The one that writes last put back what it read, so an approval the
// client pressed could vanish under a watcher that read the record a second earlier. The fix (website netlify/functions/_tasks-cas.js):
//   · every write is checked against the version it read (updated_at); a record that moved is re-read and merged per step and per field;
//     both writers changing the same field is a 409, never a silent loss
//   · _step-record (readStepRecord/writeStepTasks, 58 importers), admin-deliverables, portal-deliverables and the autopilot's claim all write
//     that way (no raw PATCH of a record's data left in those files)
//   · after docs/supabase/CLIENT_STEP_ROWS_2026-11-11.sql: each changed approval is kept in its own step row with its own version check, and the
//     publish watcher puts back an approval for the SAME change version that a writer outside the shared writer dropped; never invents one
//   · before that SQL runs, the table probe says "missing" and nothing touches it
// Runs the shipped code against a fake database that honours PostgREST's filters. Exit 0 holds · 1 broken · 2 couldn't tell.
import fs from "node:fs";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const req = createRequire(`${SITE}/netlify/functions/x.js`);
const F = [], fail = (m) => F.push(m), ind = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
process.env.SUPABASE_URL = "https://supa.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "svc"; process.env.INTERNAL_FN_SECRET = "gate-secret-not-real";
let TC, SR, AR, src = {};
try {
  TC = req("./_tasks-cas.js"); SR = req("./_step-record.js"); AR = req("./_website-autorun.js");
  for (const f of ["admin-deliverables.js", "portal-deliverables.js", "_website-autorun.js", "site-publish-watch.js", "_step-record.js"]) src[f] = fs.readFileSync(`${SITE}/netlify/functions/${f}`, "utf8");
  src.sql = fs.readFileSync(`${SITE}/docs/supabase/CLIENT_STEP_ROWS_2026-11-11.sql`, "utf8");
} catch (e) { ind(`harness: ${e.message}`); }
for (const k of ["merge3", "casWrite", "snap", "keepApprovals", "lostApprovals", "rowsReady", "writeRow"]) if (typeof TC[k] !== "function") ind(`_tasks-cas.js has no ${k}`);

// ── a fake PostgREST: tables of rows; eq filters on any column (data->… filters on auto_n too); PATCH returns the rows it changed ──
let clock = Date.parse("2026-11-11T10:00:00.000Z");
const tick = () => new Date((clock += 1000)).toISOString().replace("Z", "000+00:00");
function makeDb(withRows) {
  const T = { client_onboarding_records: [], client_monthly_records: [], ...(withRows ? { client_step_rows: [] } : {}) }, log = [];
  const parse = (p) => {
    const u = new URL(`https://x${p}`), table = u.pathname.slice(1), conds = [];
    for (const [k, v] of u.searchParams) {
      if (["select", "limit", "order", "on_conflict"].includes(k)) continue;
      const m = /^(eq|is)\.(.*)$/s.exec(v); if (!m) continue;
      conds.push([k, m[1] === "is" ? null : m[2]]);
    }
    return { table, conds };
  };
  const val = (row, k) => {
    const j = /^data->tasks->"([^"]+)"->>(\w+)$/.exec(k);
    if (j) { const t = ((row.data || {}).tasks || {})[j[1]] || {}; return t[j[2]] == null ? null : String(t[j[2]]); }
    return row[k] == null ? null : String(row[k]);
  };
  const match = (row, conds) => conds.every(([k, v]) => val(row, k) === v);
  const supa = async (p, init = {}) => {
    const { table, conds } = parse(p), m = (init.method || "GET").toUpperCase();
    log.push(`${m} ${p}`);
    if (!T[table]) { const e = new Error(`404 {"code":"PGRST205","message":"Could not find the table 'public.${table}' in the schema cache"}`); throw e; }
    const sel = new URL(`https://x${p}`).searchParams.get("select");
    const pick = (r) => (sel && sel !== "*" ? Object.fromEntries(sel.split(",").filter((k) => k in r).map((k) => [k, r[k]])) : r);
    if (m === "GET") return JSON.parse(JSON.stringify(T[table].filter((r) => match(r, conds)).map(pick)));
    if (m === "PATCH") {
      const body = JSON.parse(init.body), hit = T[table].filter((r) => match(r, conds));
      for (const r of hit) { Object.assign(r, JSON.parse(JSON.stringify(body))); r.updated_at = tick(); }   // the set_updated_at trigger
      return JSON.parse(JSON.stringify(hit.map(pick)));
    }
    if (m === "POST") {
      const body = JSON.parse(init.body);
      if (table === "client_step_rows" && T[table].some((r) => r.client_id === body.client_id && r.step_id === body.step_id)) throw new Error("409 23505 duplicate key");
      T[table].push({ ...body, updated_at: tick() }); return [];
    }
    throw new Error(`fake: ${m}`);
  };
  return { T, log, supa };
}
const CID = "11111111-2222-4333-8444-555555555555", RID = "rec-1";
const STEP = "m1.web.homepage_meta", OTHER = "m1.web.schema";
const change = (v) => ({ v, kind: "page", items: [{ label: "Page title", after: `Title v${v}` }] });
const seed = (db) => { db.T.client_onboarding_records.push({ id: RID, client_id: CID, updated_at: tick(), data: { playbook_version: "m1", tasks: {
  [STEP]: { status: "in_progress", site_change: change("2"), internal_review: { decision: "approved", change_v: "2" } },
  [OTHER]: { status: "in_progress", site_change: change("1"), auto_n: 3 } } } }); };
const cur = (db) => db.T.client_onboarding_records[0].data.tasks;
const approval = { decision: "approved", at: "2026-11-11T10:05:00.000Z", by: "owner@client.test", change_v: "2", approved_change: change("2") };

try {
  // ── the merge rule ──
  const b = { tasks: { a: { x: 1, y: 1 }, b: { z: 1 } } };
  const m1 = TC.merge3(b, { tasks: { a: { x: 2, y: 1 }, b: { z: 1 } } }, { tasks: { a: { x: 1, y: 1 }, b: { z: 9 } } });
  if (m1.tasks.a.x !== 2 || m1.tasks.b.z !== 9) fail(`two writers of different steps: one is lost (${JSON.stringify(m1)})`);
  const m2 = TC.merge3(b, { tasks: { a: { x: 2, y: 1 }, b: { z: 1 } } }, { tasks: { a: { x: 1, y: 5 }, b: { z: 1 } } });
  if (m2.tasks.a.x !== 2 || m2.tasks.a.y !== 5) fail("two writers of different fields of one step: one is lost");
  let threw = null; try { TC.merge3(b, { tasks: { a: { x: 2, y: 1 }, b: { z: 1 } } }, { tasks: { a: { x: 3, y: 1 }, b: { z: 1 } } }); } catch (e) { threw = e; }
  if (!threw || threw.status !== 409 || !threw.conflict) fail("both writers changing the same field isn't refused with a 409 (one would silently win)");
  const m3 = TC.merge3(b, { tasks: { a: { x: 1, y: 1 } } }, { tasks: { a: { x: 1, y: 1 }, b: { z: 1 } } });
  if ("b" in m3.tasks) fail("a step this writer deleted (and the other left alone) comes back");
  if (!TC.same({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })) fail("two equal values in a different key order read as a change");

  // ── the race the fix is for: the client approves while the watcher holds an older copy ──
  for (const withRows of [false, true]) {
    TC._resetReady();
    const db = makeDb(withRows); seed(db);
    const watcher = await SR.readStepRecord(db.supa, CID, OTHER);          // reads first (version A)
    const client = await SR.readStepRecord(db.supa, CID, STEP);            // reads the same version
    if (!watcher || !watcher.cas || !watcher.cas.stamp) { fail("readStepRecord no longer keeps the version it read"); break; }
    await SR.writeStepTasks(db.supa, client, { ...client.tasks, [STEP]: { ...client.tasks[STEP], approval } });   // the approval lands
    try { await SR.writeStepTasks(db.supa, watcher, { ...watcher.tasks, [OTHER]: { ...watcher.tasks[OTHER], auto_n: 4 }, [STEP]: { ...watcher.tasks[STEP], auto_result: { at: "2026-11-11T10:06:00.000Z" } } }); }   // the stale whole-blob write, touching the same step
    catch (e) { fail(`${withRows ? "after" : "before"} the SQL: the watcher's write was refused (${e.status || e.message}) though it changed a different field than the client`); }
    const t = cur(db);
    if (!t[STEP].auto_result) fail(`${withRows ? "after" : "before"} the SQL: the watcher's change to another field of the same step was lost`);
    if (!t[STEP].approval || t[STEP].approval.at !== approval.at) fail(`${withRows ? "after" : "before"} the SQL: the watcher's stale write dropped the client's approval`);
    if (t[OTHER].auto_n !== 4) fail(`${withRows ? "after" : "before"} the SQL: the watcher's own change was lost in the merge`);
    // the same field, both changed → 409, nothing written
    const r1 = await SR.readStepRecord(db.supa, CID, STEP), r2 = await SR.readStepRecord(db.supa, CID, STEP);
    await SR.writeStepTasks(db.supa, r1, { ...r1.tasks, [STEP]: { ...r1.tasks[STEP], status: "done" } });
    let e2 = null; try { await SR.writeStepTasks(db.supa, r2, { ...r2.tasks, [STEP]: { ...r2.tasks[STEP], status: "skipped" } }); } catch (e) { e2 = e; }
    if (!e2 || e2.status !== 409) fail(`${withRows ? "after" : "before"} the SQL: two writers setting one step's status to different things doesn't refuse the second (409)`);
    if (cur(db)[STEP].status !== "done") fail("a refused write still changed the record");
    // the step row: only after the SQL, kept with its own version
    const rows = (db.T.client_step_rows || []);
    if (!withRows && db.log.some((l) => /client_step_rows/.test(l) && !/^GET \/client_step_rows\?select=step_id&limit=1$/.test(l))) fail("before the SQL, something besides the one table probe used client_step_rows");
    if (withRows) {
      const row = rows.find((r) => r.client_id === CID && r.step_id === STEP);
      if (!row || !row.data || !row.data.approval || row.data.approval.at !== approval.at || row.data.change_v !== "2") fail(`after the SQL, the approval isn't kept in its own step row (${JSON.stringify(row)})`);
      // a writer OUTSIDE the shared writer drops it (a blind PATCH of an old copy) → the watcher's repair puts it back, and only for the same version
      const old = JSON.parse(JSON.stringify(cur(db))); delete old[STEP].approval;
      db.T.client_onboarding_records[0].data.tasks = old;
      const lost = TC.lostApprovals(cur(db), rows);
      if (lost.length !== 1 || lost[0].step !== STEP || lost[0].approval.at !== approval.at) fail(`the repair doesn't see the dropped approval (${JSON.stringify(lost)})`);
      const moved = JSON.parse(JSON.stringify(cur(db))); moved[STEP].site_change = change("3");
      if (TC.lostApprovals(moved, rows).length) fail("the repair would put an approval of version 2 on version 3 (consent never carries over)");
      const newer = JSON.parse(JSON.stringify(cur(db))); newer[STEP].approval = { decision: "changes_requested", note: "x", at: "2026-11-11T11:00:00.000Z" };
      if (TC.lostApprovals(newer, rows).length) fail("the repair overwrites a newer answer on the record");
      // the row's own version check: a writer holding an older v loses, then re-reads
      const before = (rows.find((r) => r.step_id === STEP) || {}).v;
      const res = await TC.writeRow(db.supa, CID, STEP, { change_v: "2", approval: { ...approval, at: "2026-11-11T12:00:00.000Z" } }, "gate");
      const after = (rows.find((r) => r.step_id === STEP) || {}).v;
      if (res !== "written" || after !== Number(before) + 1) fail(`a step row write doesn't move its version by one (${res}, v ${before} → ${after})`);
      if (!db.log.some((l) => /^PATCH \/client_step_rows\?.*&v=eq\./.test(l))) fail("a step row write isn't checked against the version it read (v=eq.)");
    }
  }
  // ── no stamp (an old fake, a row read without updated_at): the plain write it always was ──
  { const db = makeDb(false); seed(db); delete db.T.client_onboarding_records[0].updated_at;
    const rec = await SR.readStepRecord(db.supa, CID, STEP);
    const back = await SR.writeStepTasks(db.supa, rec, { ...rec.tasks, [STEP]: { ...rec.tasks[STEP], status: "done" } });
    if (!back || back.tasks[STEP].status !== "done") fail("a record with no version can't be written any more"); }

  // ── the autopilot's claim: checked on the record's version, never a whole-blob write over a newer record ──
  { const db = makeDb(false); seed(db);
    const claim = AR.claim;
    if (typeof claim !== "function") fail("_website-autorun no longer exports claim");
    else {
      const d = { supa: async (p, init) => { if (init && init.method === "PATCH" && !db._raced) { db._raced = true; const r = db.T.client_onboarding_records[0]; r.data.tasks[STEP].approval = approval; r.updated_at = tick(); } return db.supa(p, init); }, now: () => clock };
      const won = await claim(d, { id: RID }, OTHER, "draft:x");
      const t = cur(db);
      if (!t[STEP].approval) fail("the autopilot's claim wrote its old copy over an approval that landed between its read and its write");
      if (!won || t[OTHER].auto_n !== 4) fail(`the autopilot's claim didn't retry on the moved record (won ${won}, auto_n ${t[OTHER].auto_n})`);
    } }

  // ── the publish watcher's repair, through its own handler (after the SQL): a dropped approval for the same version is put back ──
  { TC._resetReady();
    const db = makeDb(true); seed(db);
    db.T.client_step_rows.push({ client_id: CID, step_id: STEP, v: 1, data: { change_v: "2", approval }, updated_at: tick() });
    db.T.client_activity = []; db.T.system_job_checkins = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) => {
      const u = new URL(url);
      if (u.host !== "supa.test") return { ok: true, status: 200, json: async () => ({}), text: async () => "{}" };
      const p = u.pathname.replace(/^\/rest\/v1/, "") + u.search, tb = u.pathname.replace(/^\/rest\/v1\//, "");
      if (!db.T[tb]) db.T[tb] = [];
      try { const out = await db.supa(p, init); const body = JSON.stringify(out == null ? [] : out); return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body }; }
      catch (e) { const t = String(e.message); return { ok: false, status: Number(t.slice(0, 3)) || 500, json: async () => ({}), text: async () => t }; }
    };
    try {
      const W = req("./site-publish-watch.js");
      const r = await W.handler({ httpMethod: "POST", headers: { "x-internal-secret": "gate-secret-not-real" }, body: "{}" });
      const t = cur(db);
      if (!t[STEP].approval || t[STEP].approval.at !== approval.at) fail(`the publish watcher didn't put back an approval its step row holds for the same version (${r && r.statusCode})`);
      if (!db.T.client_activity.some((a) => a.kind === "approval_restored")) fail("putting an approval back leaves no record on the client's activity");
    } finally { globalThis.fetch = realFetch; }
  }

  // ── the writers: no raw whole-record PATCH left; the watcher repairs; the SQL keeps RLS on ──
  const RAW = /method:\s*"PATCH"[^\n]*body:\s*JSON\.stringify\(\{\s*data\b/;
  for (const f of ["admin-deliverables.js", "portal-deliverables.js"]) {
    const lines = src[f].split("\n").filter((l) => RAW.test(l) && !/if \(!cas\)/.test(l));
    if (lines.length) fail(`${f} still writes a record's data with a raw PATCH (${lines.length}×): it can drop another writer's change`);
    if (!/TC\.casWrite\(/.test(src[f])) fail(`${f} doesn't write through the version-checked writer`);
  }
  if (!/select=id,data,updated_at/.test(src["_step-record.js"]) || !/TC\.casWrite\(supa, rec\.table, rec\.cas, data/.test(src["_step-record.js"])) fail("_step-record no longer reads the version or writes through the version-checked writer");
  if (!/updated_at=eq\.\$\{encodeURIComponent\(fresh\.updated_at\)\}/.test(src["_website-autorun.js"])) fail("the autopilot's claim no longer checks the record's version");
  if (!/TC\.lostApprovals\(/.test(src["site-publish-watch.js"]) || !/rowsReady\(supa\)\) === true/.test(src["site-publish-watch.js"])) fail("the publish watcher no longer repairs a dropped approval (or does it without the table)");
  if (!/enable row level security/i.test(src.sql) || !/on public\.client_step_rows/.test(src.sql) || !/revoke all on public\.client_step_rows from anon, authenticated/.test(src.sql)) fail("the SQL file doesn't keep client_step_rows behind row level security, closed to browsers");
  if (!/primary key \(client_id, step_id\)/.test(src.sql) || !/v bigint not null default 1/.test(src.sql)) fail("the SQL file no longer makes one row per step with a version");
} catch (e) { ind(`threw: ${String(e.stack || e.message).split("\n").slice(0, 3).join(" ")}`); }

if (F.length) { console.error(`❌ two writes can drop an approval — ${F.length} problem(s):`); for (const x of F) console.error(`  · ${x}`); process.exit(1); }
console.log("✅ two writes can't drop an approval: every write is checked against the version it read and merged per step and per field (the same field twice = 409); readStepRecord/writeStepTasks, admin-deliverables, portal-deliverables and the autopilot's claim all write that way; after the SQL each approval keeps its own versioned step row and the publish watcher puts back one a stray writer dropped (same version only)");
