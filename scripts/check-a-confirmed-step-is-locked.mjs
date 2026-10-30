#!/usr/bin/env node
// check-a-confirmed-step-is-locked.mjs — 2026-10-21, approved step_lock_after_rga_confirms_v1 (Chris: "once the admin approves its
// done its locked… then they cannot edit or change in client side"). RUNS the one rule and the real functions on a fake database:
//   · shared/step-lock.js: each step locks on its own proof (call held · access confirmed · tracking live · RGA finished · on
//     Google), not before; an RGA unlock opens it until the step is completed again; edit kinds (in_place · request · none)
//   · portal-step-choice: a locked step refuses reopen (no write); an unlocked one reopens; a detected / RGA step never reopens;
//     "Request a change" writes change_request on a locked request step and is refused elsewhere; a live tracking choice is locked
//   · portal-step-input refuses a locked access answer; portal-video-clip refuses a locked videos step
//   · admin-step-unlock writes task.unlocked with the reason, and refuses a step that isn't locked
//   · EVERY portal-side writer of a step record either goes through step-lock or is excused here with a reason (a new writer that
//     skips it fails this gate)
//   · the portal draws the lock footer (never Change on a locked step); admin draws the lock card + Unlock on every row
//   exit 0 holds · 1 regressed · 2 code moved
import fs from "node:fs";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = [], fail = (m) => F.push(m);
const req = createRequire(`${SITE}/netlify/functions/x.js`);
let L; try { L = req(`${SITE}/shared/step-lock.js`); } catch (e) { console.error(`⚠️  shared/step-lock.js won't load: ${e.message}`); process.exit(2); }
const H = 3600000, NOW = Date.now(), ago = (h) => new Date(NOW - h * H).toISOString(), ahead = (h) => new Date(NOW + h * H).toISOString();
const lk = (id, t, d) => L.stepLock(id, t, d || {}, NOW);
// ── the rule
const cases = [
  ["kickoff held (recap)", "m1.kickoff.call", { status: "pending" }, { kickoff_invite: { recap_sent_at: ago(240), start: ago(250) } }, true],
  ["kickoff held (time passed)", "m1.kickoff.call", {}, { kickoff_invite: { start: ago(1) } }, true],
  ["kickoff still ahead", "m1.kickoff.call", { status: "done" }, { kickoff_invite: { start: ahead(30) } }, false],
  ["close-out done + past", "m1.call.close", { status: "done" }, { closeout_invite: { start: ago(2) } }, true],
  ["close-out booked, ahead", "m1.call.close", { status: "pending" }, { closeout_invite: { start: ahead(2) } }, false],
  ["access confirmed", "m1.access.website", { status: "done", access: { confirmed_at: ago(5) } }, {}, true],
  ["access sent, not confirmed", "m1.access.website", { status: "in_progress", client_input: { via: "invite" } }, {}, false],
  ["tracking live", "m1.tracking.call_setup", { status: "done", client_choice: "rga_sets_up", tracking: { live_at: ago(3) } }, {}, true],
  ["tracking skipped", "m1.tracking.call_setup", { status: "done", client_choice: "skip" }, {}, false],
  ["hours on Google", "m1.gbp.hours_attributes", { status: "done", google_push: { state: "on_google" } }, {}, true],
  ["hours saved, not on Google", "m1.gbp.hours_attributes", { status: "done", google_push: { state: "not_sent" } }, {}, false],
  ["facts done by RGA", "m1.gbp.business_facts", { status: "done", google_push: { rga_done_at: ago(9) } }, {}, true],
  ["keyword plan done", "m1.strategy.keywords_locations", { status: "done" }, {}, true],
  ["videos skipped", "m1.brand.youtube_setup", { status: "skipped" }, {}, false],
  ["a detected step", "m1.gbp.photos", { status: "done" }, {}, false],
  ["numbers sent, not used yet", "m2.snap.business_outcomes", { status: "done" }, {}, false],
  ["numbers used in the report", "m2.snap.business_outcomes", { status: "done", rga_confirmed: { at: ago(2) } }, {}, true],
  ["video received", "m2.exec.youtube_video", { status: "done", rga_confirmed: { at: ago(2) } }, {}, true],
];
for (const [name, id, t, d, want] of cases) if (!!lk(id, t, d) !== want) fail(`the rule: "${name}" ${want ? "isn't locked" : "is locked"}`);
if (lk("m1.gbp.hours_attributes", { status: "done", google_push: { state: "on_google" } })?.edit !== "in_place") fail("the rule: a Google fact edited in place isn't \"in_place\" (the client's own update to Google would be refused)");
if (lk("m1.access.website", { access: { confirmed_at: ago(5) } })?.edit !== "request" || lk("m1.kickoff.call", {}, { kickoff_invite: { start: ago(1) } })?.edit !== null) fail("the rule: access isn't \"request\", or an event offers more than Not right?");
const unl = { status: "pending", access: { confirmed_at: ago(48) }, completed_at: ago(48), unlocked: { at: ago(1), reason: "new builder" } };
if (lk("m1.access.website", unl)) fail("the rule: an RGA unlock doesn't open the step");
if (!lk("m1.access.website", { ...unl, status: "done", completed_at: ahead(0.01) })) fail("the rule: the lock doesn't return once the step is completed again after the unlock");
// ── the functions, on a fake database
const CID = "11111111-2222-4333-8444-555555555555";
process.env.SUPABASE_URL = "https://stub.supabase.invalid"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.SUPABASE_ANON_KEY = "a";
let db, writes;
const J = (b, st = 200) => new Response(JSON.stringify(b), { status: st, headers: { "content-type": "application/json" } });
globalThis.fetch = async (url, opt = {}) => {
  const u = new URL(String(url)), m = opt.method || "GET";
  if (u.pathname === "/auth/v1/user") return J({ id: "u1", email: "owner@acme.test" });
  if (u.pathname.endsWith("/notify-rga")) return J({ ok: true });
  const t = u.pathname.split("/").pop(); const rows = db[t] || [];
  const q = [...u.searchParams].filter(([, v]) => /^eq\./.test(v));
  const hit = rows.filter((r) => q.every(([k, v]) => String(r[k]) === v.slice(3)));
  if (m === "PATCH") { writes++; const b = JSON.parse(opt.body || "{}"); for (const r of hit) Object.assign(r, b); return J(hit); }
  if (m === "POST") return J([{ id: "x" }]);
  return J(hit);
};
const world = (tasks, extra = {}) => {
  writes = 0;
  db = { client_portal_access: [{ portal_email: "owner@acme.test", client_id: CID }], profiles: [{ id: "u1", workspace_id: "w1" }],
    clients: [{ id: CID, workspace_id: "w1", business_name: "Acme Plumbing" }],
    client_onboarding_records: [{ id: "ob1", client_id: CID, data: { tasks, ...extra } }] };
};
const T = (id) => db.client_onboarding_records[0].data.tasks[id] || {};
const load = (f) => { try { return req(`${SITE}/netlify/functions/${f}`).handler; } catch (e) { console.error(`⚠️  ${f} won't load: ${e.message}`); process.exit(2); } };
const run = async (h, body) => { const r = await h({ httpMethod: "POST", headers: { authorization: "Bearer jwt" }, body: JSON.stringify({ client_id: CID, ...body }) }); return { status: r.statusCode, body: JSON.parse(r.body || "{}") }; };
const choice = load("portal-step-choice.js"), input = load("portal-step-input.js"), clip = load("portal-video-clip.js"), unlock = load("admin-step-unlock.js");
const ACC = { status: "done", completed_at: ago(48), client_input: { via: "invite", platform: "wordpress" }, access: { confirmed_at: ago(48), role: "Administrator" } };
world({ "m1.access.website": { ...ACC } });
let r = await run(choice, { step_id: "m1.access.website", reopen: true });
if (r.status !== 409 || writes || T("m1.access.website").status !== "done") fail(`a confirmed (locked) access step can be reopened (${r.status}, ${writes} write(s))`);
world({ "m1.access.website": { ...ACC, unlocked: { at: ago(1), by: "chris", reason: "new builder" } } });
r = await run(choice, { step_id: "m1.access.website", reopen: true });
if (r.status !== 200 || T("m1.access.website").status !== "pending") fail(`an unlocked step can't be reopened (${r.status} ${r.body.error || ""})`);
world({ "m1.gbp.photos": { status: "done" } });
r = await run(choice, { step_id: "m1.gbp.photos", reopen: true });
if (r.status !== 409 || writes) fail(`a detected step can be reopened by posting directly (${r.status})`);
world({ "m1.access.website": { ...ACC } });
r = await run(choice, { step_id: "m1.access.website", change_request: "We moved to Squarespace" });
if (r.status !== 200 || T("m1.access.website").change_request?.note !== "We moved to Squarespace" || T("m1.access.website").status !== "done") fail(`"Request a change" on locked access doesn't store the request (or it changed the step) (${r.status} ${r.body.error || ""})`);
r = await run(choice, { step_id: "m1.access.website", cancel_change_request: true });
if (r.status !== 200 || T("m1.access.website").change_request) fail(`"Cancel my request" doesn't remove it (${r.status})`);
world({ "m1.access.website": { status: "in_progress", client_input: { via: "invite" } } });
r = await run(choice, { step_id: "m1.access.website", change_request: "x y z" });
if (r.status !== 400 || writes) fail(`"Request a change" is accepted on a step that isn't locked (${r.status})`);
world({ "m1.tracking.call_setup": { status: "done", client_choice: "rga_sets_up", tracking: { live_at: ago(3) } } });
r = await run(choice, { step_id: "m1.tracking.call_setup", choice: "skip" });
if (r.status !== 409 || writes || T("m1.tracking.call_setup").client_choice !== "rga_sets_up") fail(`a live tracking number's choice can be changed (${r.status})`);
world({ "m1.access.website": { ...ACC } });
r = await run(input, { step_id: "m1.access.website", value: { via: "designer", platform: "wix" } });
if (r.status !== 409 || writes || T("m1.access.website").client_input.via !== "invite") fail(`a locked access answer can be overwritten (${r.status} ${r.body.error || ""})`);
world({ "m1.brand.youtube_setup": { status: "done", clips: [{ id: "a" }, { id: "b" }] } });
r = await run(clip, { kind: "skip" });
if (r.status !== 409 || writes || T("m1.brand.youtube_setup").status !== "done") fail(`a finished videos step can be skipped by the client (${r.status})`);
// admin "Used in the report" (step 17) locks it; an unlock clears it so the client's new answer waits for RGA again
world({ "m1.access.website": { ...ACC } });
r = await run(unlock, { step_id: "m1.access.website", action: "confirm" });
if (r.status !== 400) fail(`admin's "Used in the report" works on a step it isn't for (${r.status})`);
{ const M = { id: "mr1", client_id: CID, reporting_month: req(`${SITE}/netlify/functions/_step-record.js`).currentReportingMonth(), data: { tasks: { "m2.snap.business_outcomes": { status: "done", completed_at: ago(5) } } } };
  world({}); db.client_monthly_records = [M];
  const r2 = await run(unlock, { step_id: "m2.snap.business_outcomes", action: "confirm" });
  const t17 = (db.client_monthly_records[0].data.tasks || {})["m2.snap.business_outcomes"] || {};
  if (r2.status !== 200 || !t17.rga_confirmed || !lk("m2.snap.business_outcomes", t17)) fail(`"Used in the report" doesn't lock step 17 (${r2.status} ${r2.body.error || ""})`);
  const r3 = await run(unlock, { step_id: "m2.snap.business_outcomes", action: "unlock", reason: "New numbers" });
  const t17b = (db.client_monthly_records[0].data.tasks || {})["m2.snap.business_outcomes"] || {};
  if (r3.status !== 200 || t17b.rga_confirmed || lk("m2.snap.business_outcomes", t17b)) fail(`unlocking step 17 keeps RGA's old "used" mark (it would relock on the client's next save) (${r3.status})`); }
// admin unlock
world({ "m1.access.website": { ...ACC, change_request: { note: "moved", at: ago(1) } } });
r = await run(unlock, { step_id: "m1.access.website", action: "unlock", reason: "They moved to Squarespace" });
if (r.status !== 200 || T("m1.access.website").unlocked?.reason !== "They moved to Squarespace" || T("m1.access.website").change_request) fail(`admin's unlock doesn't store the reason (or keeps the request) (${r.status} ${r.body.error || ""})`);
else if (lk("m1.access.website", T("m1.access.website"))) fail("after admin's unlock the rule still says locked");
r = await run(unlock, { step_id: "m1.access.website", action: "unlock", reason: "again" });
if (r.status !== 409) fail(`admin can "unlock" a step that isn't locked (${r.status})`);
r = await run(unlock, { step_id: "m1.access.website", action: "unlock", reason: "" });
if (r.status !== 400) fail("admin can unlock without saying why (the client sees the reason)");
// ── every portal-side writer goes through the lock, or is excused for a reason
const THROUGH = ["portal-step-choice.js", "portal-step-input.js", "portal-video-clip.js", "cancel-kickoff-invite.js"];
const EXCUSED = {
  "portal-step-later.js": "photos only (a detected step — never locks) and refuses a done step itself",
  "portal-plan-ok.js": "the client's 'Looks right' on the LOCKED plan — an answer to RGA, not a change to the step",
  "portal-photo-team.js": "photos (detected — never locks)", "portal-photo-keep.js": "photos (detected — never locks)", "portal-photo-remove.js": "photos (detected — never locks)",
  "portal-form-test.js": "form tracking (detected — never locks): the inbox answer", "portal-step-recheck.js": "detected steps only — re-derives, never a client edit",
  "portal-deliverables.js": "approvals + the duplicate answer — not a step the lock covers", "portal-book-kickoff.js": "writes the booking stamps, not tasks; a held call refuses elsewhere",
  "portal-review-cadence.js": "writes data.review_cadence (a record setting), not a step",
  "portal-reply.js": "RGA's reply stamps replied_at on the client's OWN ask (flag / change request) — never the step's answer (admin_row8_done_v2)",
  "portal-review-requests.js": "writes client_customer_lists; only reads the record",
  "portal-thread.js": "writes data.messages_seen_at (read receipts), not a step",
  "portal-booking-keep.js": "writes only rga_put.ack — the client's Keep it on the booking link RGA put on Google (their veto, step36_booking_rga_does_it_v1), never the step's answer; Change it goes through portal-step-input (locked)",
  "portal-merge-choice.js": "writes merge_by (who presses Merge: RGA or the client) on the CONFIRMED access step: a setting the client may change any time after it locks, never the grant (merge_without_the_browser_v1)",
};
for (const f of fs.readdirSync(`${SITE}/netlify/functions`).filter((x) => /^(portal-|cancel-kickoff)/.test(x) && x.endsWith(".js"))) {
  const src = read(`netlify/functions/${f}`);
  const writes1 = /writeStepTasks\(|client_onboarding_records\?id=eq\.[^`]*`,\s*\{\s*method:\s*"PATCH"|client_onboarding_records\?client_id=eq\.[^`]*`,\s*\{\s*method:\s*"PATCH"|method: "PATCH"[^}]*client_onboarding_records/.test(src) || (/client_onboarding_records/.test(src) && /method:\s*"PATCH"/.test(src));
  if (!writes1) continue;
  const through = /require\("\.\.\/\.\.\/shared\/step-lock\.js"\)/.test(src);
  if (THROUGH.includes(f) && !through) fail(`${f} writes a client step and no longer goes through shared/step-lock.js`);
  if (!through && !EXCUSED[f] && !THROUGH.includes(f)) fail(`${f} writes a client step record without the step lock — route it through shared/step-lock.js, or excuse it here with the reason`);
}
// ── the portal and admin draw it
const P = read("portal/portal.js"), A = read("admin/admin.js");
if (!/import "\/shared\/step-lock\.js\?v=/.test(P) || !/import "\/shared\/step-lock\.js\?v=/.test(A)) fail("the portal or admin doesn't load the shared lock rule");
// 🔄 10-30 (client card system batch 2): steps 13–15 also draw no amend once settled (csQuiet) — the lock still comes FIRST
if (!/const amendBtn = stepLk(?: \|\| csQuiet)? \? ""/.test(P)) fail("a locked step can still draw Change / reopen in its row");
// client_ask_for_a_change_v1 (10-27): the band at the top while RGA has it, the lock line + "Need a change?" at the bottom
if (!/\$\{lockFootHtml\(step\.id, taskState, stepLk, "top"\)\}/.test(P) || !/\$\{lockFootHtml\(step\.id, taskState, stepLk, "bottom"\)\}/.test(P)) fail("the row doesn't draw the lock footer");
if (!/Need a change\? ›/.test(P) || !/name="kind" value="wrong"/.test(P) || !/\{ flag_wrong: true, note \}/.test(P)) fail("the lock footer lost the way to say it's wrong (Need a change? → Something here is wrong → the flag)");
if (!/const change = stepLockOf\(step\.id, t\) \? "" :/.test(P)) fail("a live tracking number's card still offers Change");
if (!/return rowStepCardsHtml\(o, s\) \+ adminLockHtml\(o && o\.flowId, s && s\.task\);/.test(A)) fail("admin rows don't draw the lock card");
if (!/data-ob-unlock="/.test(A) || !/"\/\.netlify\/functions\/admin-step-unlock"/.test(A)) fail("admin lost \"Unlock for the client…\"");
if (F.length) { console.error("🔴 the step lock regressed:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log(`✅ a confirmed step is locked: ${cases.length} rule cases + unlock/relock · reopen refused (locked, detected), allowed once unlocked · Request a change stored only on a locked request step · live tracking choice, access answer and finished videos refuse the client · admin unlock needs a reason, refuses an unlocked step · every portal writer goes through the lock or is excused · portal footer (Not right? always) + admin lock card`);
