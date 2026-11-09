#!/usr/bin/env node
// check-the-monthly-report-opens-the-call.mjs — a report sent this month opens this month's call (client step 20), whichever record it was built from.
// 🔴 Found 10-30, before it bit: send-monthly-report stamps m2.report.deliver on the NEWEST record, while step 20 (portal-step-waits ·
// portal-book-kickoff · the portal row) reads THIS month's. A client with no ranking keyword has no record for the new month at 09:00 on
// the 1st, so the stamp would land on last month's and their call would wait all month. Runs the real stampThisMonth on a fake database.
// Exit 0 = holds · 1 = regressed · 2 = moved.
import { createRequire } from "node:module";
import fs from "node:fs";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const file = `${SITE}/netlify/functions/send-monthly-report.js`;
const src = fs.readFileSync(file, "utf8");
const closeSrc = fs.readFileSync(`${SITE}/netlify/functions/_monthly-close.js`, "utf8");   // monthly_s5_close_v1 (11-9): the send moved to _monthly-close.js sendReport
const fail = [];
if (!/d\.stampThisMonth && month === priorOf\(require\("\.\/_step-record"\)\.currentReportingMonth\(new Date\(d\.now\(\)\)\)\)\) \{ try \{ await d\.stampThisMonth\(clientId, month, artifact, sent\.id \|\| null, to\);/.test(closeSrc)) fail.push("the send no longer stamps this month's record (or a resend of an older month now does)");
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://stub.invalid"; process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "stub";
let stamp;
try { ({ stampThisMonth: stamp } = createRequire(import.meta.url)(file)); } catch (e) { console.error(`⚠️  INDETERMINATE — send-monthly-report didn't load: ${e.message}`); process.exit(2); }
if (typeof stamp !== "function") { console.error("⚠️  INDETERMINATE — stampThisMonth isn't exported"); process.exit(2); }
const NOW = new Date("2026-11-01T09:00:00Z"), ART = { sent_at: "2026-11-01T09:00:05Z" };
const fakeDb = (monthRows, ob = [{ id: "ob", data: { tasks: {} } }]) => { const db = { rows: monthRows.map((r, i) => ({ id: `m${i}`, ...r })), posts: 0, patches: 0 };
  db.supa = async (p, init = {}) => {
    if (p.startsWith("/client_onboarding_records")) return ob;
    if (init.method === "POST") { db.posts++; const b = JSON.parse(init.body); const row = { id: `m${db.rows.length}`, ...b }; db.rows.push(row); return [row]; }
    if (init.method === "PATCH") { db.patches++; const id = /[?&]id=eq\.([^&]+)/.exec(p)[1]; const row = db.rows.find((r) => r.id === id); Object.assign(row, JSON.parse(init.body)); return [row]; }
    const id = /[?&]id=eq\.([^&]+)/.exec(p)?.[1], mo = /reporting_month=eq\.([^&]+)/.exec(p)?.[1];
    return db.rows.filter((r) => (id ? r.id === id : r.reporting_month === mo)); };
  return db; };
const task = (db, mo) => db.rows.find((r) => r.reporting_month === mo)?.data?.tasks?.["m2.report.deliver"];
// A · no November record: it's created, and stamped
{ const db = fakeDb([{ reporting_month: "2026-10-01", data: { tasks: {} } }]); const did = await stamp(db.supa, "c1", "2026-10-01", ART, "gm1", "a@b.co", NOW);
  if (!did || task(db, "2026-11-01")?.status !== "done" || task(db, "2026-11-01")?.auto_result?.sent_message_id !== "gm1") fail.push("no record for this month: the report doesn't open this month's call"); }
// B · a November record with other work on it: stamped, and the other work survives
{ const db = fakeDb([{ reporting_month: "2026-11-01", data: { playbook_version: "x", tasks: { "m2.exec.gbp_photos": { status: "done" } } } }]); await stamp(db.supa, "c1", "2026-10-01", ART, "gm1", "a@b.co", NOW);
  if (task(db, "2026-11-01")?.status !== "done" || db.rows[0].data.tasks["m2.exec.gbp_photos"]?.status !== "done" || db.rows[0].data.playbook_version !== "x") fail.push("stamping this month's record lost the other work on it"); }
// C · the report's own record IS this month's: nothing extra is written
{ const db = fakeDb([{ reporting_month: "2026-11-01", data: { tasks: {} } }]); const did = await stamp(db.supa, "c1", "2026-11-01", ART, "gm1", "a@b.co", NOW);
  if (did || db.posts || db.patches) fail.push("the normal case writes a second time"); }
// D · already done this month: its first date stands
{ const first = { status: "done", completed_at: "2026-11-01T08:00:00Z" }; const db = fakeDb([{ reporting_month: "2026-11-01", data: { tasks: { "m2.report.deliver": first } } }]); await stamp(db.supa, "c1", "2026-10-01", ART, "gm2", "a@b.co", NOW);
  if (task(db, "2026-11-01").completed_at !== first.completed_at || db.patches) fail.push("an already-done month gets overwritten"); }
if (fail.length) { console.log(`🔴 a monthly report may not open the call — ${fail.length} problem(s):\n${fail.map((f) => `   · ${f}`).join("\n")}`); process.exit(1); }
console.log("✅ a report sent this month opens this month's call: no record yet (created + stamped), other work kept, the normal case writes nothing extra, a resend of an older month doesn't count");
