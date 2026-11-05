#!/usr/bin/env node
// check-every-submission-is-recorded.mjs — every client / admin / system submission leaves a permanent, timestamped row
// WITH what was sent, and every write to a client's Google profile leaves a change-log row (before / after / who / read back).
//
// 🔒 WHY (approved how_data_is_stored_v1, 2026-10-16). Chris: "all submissions on client and admin side and then also Google
// are recorded and documented in our database with timestamps?" — checked on RGA's real rows: a step 8 save left an activity
// row WITHOUT the answer, nothing in the Google change log, and the next save would overwrite it; admin Done/Skip/Reset said
// "admin override", not who; keep-it / later / team size / the nightly renewal left no history. One helper (_record.js) now
// does it, and this gate fails on any function that writes a step record without it.
import fs from "node:fs";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = []; const fail = (m) => F.push(m);
const req = createRequire(`${SITE}/netlify/functions/x.js`);
const nc = (s) => s.replace(/^[ \t]*\/\/.*$/gm, "");
const R = req("./_record.js");
const CID = "ae817a9c-60a2-4cc9-a196-0582b7b7e7c3";

// ── 1 · the helper: the answer is in the row, a secret never is, Google gets a change-log row, failures don't throw ──
{
  const rows = [], changes = [];
  const supa = async (p, init = {}) => { if (p.startsWith("/clients?")) return [{ workspace_id: "ws1" }]; rows.push(JSON.parse(init.body)); return [{ id: 1 }]; };
  const rc = async (c) => { changes.push(c); };
  const r1 = await R.recordSubmission({ supa, clientId: CID, kind: "client_step_input", stepId: "m1.gbp.hours_attributes", by: "c@x.test", actor: "client",
    answer: { days: { mon: { open: "09:00" } } }, google: { field: "hours", before: { weekly: null }, after: { weekly: {} }, verified: true, source: "portal-step-input" }, recordChange: rc });
  const row = rows[0];
  if (!r1.activity || !row || row.kind !== "client_step_input" || row.payload.answer?.days?.mon?.open !== "09:00" || row.payload.by !== "c@x.test" || !row.occurred_at || row.workspace_id !== "ws1") fail(`a submission's activity row doesn't carry the answer, who, when (${JSON.stringify(row)})`);
  if (r1.change !== true || changes[0]?.surface !== "google_business_profile" || changes[0]?.verified !== true || changes[0]?.source !== "portal-step-input" || changes[0]?.stepId !== "m1.gbp.hours_attributes" || changes[0]?.actorEmail !== "c@x.test") fail("a change to the Google profile isn't in the change log with who / source / read back");
  rows.length = 0;
  await R.recordSubmission({ supa, clientId: CID, kind: "client_step_input", answer: "https://cms.test/one-time/abc", secret: true, recordChange: rc });
  if (JSON.stringify(rows[0]).includes("one-time/abc") || rows[0]?.payload?.answer !== R.SECRET) fail("a one-time secret is stored in the activity log");
  const bad = await R.recordSubmission({ supa: async () => { throw new Error("db down"); }, clientId: CID, kind: "x", recordChange: rc });
  if (bad.activity || !bad.errors.length) fail("a failed recording is reported as recorded (or throws and undoes the client's action)");
  const none = await R.recordSubmission({ supa: async (p2) => (p2.startsWith("/clients?") ? [] : []), clientId: CID, kind: "x", recordChange: rc });
  if (none.activity) fail("a write that returned no row is reported as recorded");
}

// ── 2 · every function that writes a step record records it ──
const ALLOW = {
  "portal-step-choice.js": "records the choice itself (client_step_choice: key + label + who)",
  "portal-step-recheck.js": "a measurement — kept append-only in client_step_detections",
  "portal-photo-remove.js": "records the removal itself: activity + publish log + Google change log",
  "portal-photo-check.js": "an AI look at an upload, kept as advice under photo_ai.uploads (the same key RGA's own check writes); the client submits nothing, and a second call is answered from it, so there is nothing to record (client_step10_upload_help_v1)",
  "portal-reply.js": "the reply IS the permanent record (client_activity rga_reply, written first); the step write only stamps replied_at on the ask",
};
const dir = `${SITE}/netlify/functions`;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".js") && x !== "_step-record.js" && x !== "_record.js")) {
  const src = nc(fs.readFileSync(`${dir}/${f}`, "utf8"));
  if (!/\bwriteStepTasks\(/.test(src)) continue;
  if (ALLOW[f]) continue;
  if (!/\brecordSubmission\(|\b[dD]\.record\(/.test(src)) fail(`${f} writes a step record but doesn't record the submission (_record.js recordSubmission)`);
}

// ── 3 · the writers say what was sent, who, and touch the change log when Google changed ──
const sin = nc(read("netlify/functions/portal-step-input.js"));
if (!/recordSubmission\(\{ supa, clientId, kind: "client_step_input", stepId, by: gate\.email \|\| null, actor: "client",\s*answer: parsed\.value, secret: spec\.kind === "secret" \|\| spec\.echo === false,/.test(sin)) fail("a portal answer is recorded without the answer (or a one-time secret would be stored)");
if (!/google: push && \(push\.state === "on_google" \|\| \(stepId === GSTEP\.FACTS && \(push\.written \|\| \[\]\)\.length\)\) \? \{/.test(sin) || !/verified: true, source: "portal-step-input" \} : null \}\)/.test(sin)) fail("a step 8/10/11 save that reached Google isn't in the Google change log");
const drift = nc(read("netlify/functions/admin-gbp-drift.js"));
if (!/kind: "gbp_drift_resolved", stepId, by: gate\.email \|\| null, actor: "rga"/.test(drift) || !/google: action === "restore" \? \{/.test(drift)) fail("admin's put-back / keep isn't recorded (or a put-back isn't in the change log)");
const watch = nc(read("netlify/functions/_gbp-watch.js"));
if (!/kind: "gbp_changed_on_google"/.test(watch) || !/kind: "gbp_hours_renewed"[\s\S]{0,400}google: \{ field: "hours · closed days"/.test(watch)) fail("the nightly check's change notices / renewals aren't recorded (renewals in the change log)");
if (!/record: \(o\) => recordSubmission\(\{ supa, \.\.\.o \}\)/.test(nc(read("netlify/functions/gbp-profile-watch.js")))) fail("the nightly check isn't given the recorder");
for (const [f, kind] of [["portal-step-later.js", "client_step_later"], ["portal-photo-team.js", "client_team_size"], ["portal-photo-keep.js", "gbp_photo_kept"]])
  if (!new RegExp(`^[ \\t]*await recordSubmission\\(\\{ supa, clientId, kind: "${kind}"`, "m").test(nc(read(`netlify/functions/${f}`)))) fail(`${f} doesn't record what the client did`);
if (!/await recordSubmission\(\{ supa, clientId, workspaceId: client\.workspace_id, kind: "monthly_report_sent", stepId: "m2\.report\.deliver"[^\n]*\n[^\n]*extra: artifact \}\);/.test(nc(read("netlify/functions/send-monthly-report.js")))) fail("a monthly report goes out without a record of what went, to whom and when");
const admin = nc(read("admin/admin.js"));
if (/by: "admin override"/.test(admin) || !/by: \(await supabase\.auth\.getSession\(\)\)\?\.data\?\.session\?\.user\?\.email \|\| "admin", actor: "rga"/.test(admin)) fail("admin's Done / Skip / Reset is recorded as \"admin override\", not the person");

if (F.length) { console.error("🔴 A submission can happen without a permanent record:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ every submission is recorded: one helper writes the activity row WITH the answer (secrets never), who and when, and a Google change-log row (before / after / who / read back) whenever the profile changed; every step-record writer uses it (3 named exceptions keep their own logs); admin names the person");
