#!/usr/bin/env node
// check-a-late-account-ends-in-writing.mjs — an account that ends for non-payment is told in writing BEFORE the end day, and again on it, and RGA is told (master plans-and-emails decision 8, approved 11-11).
// 🔴 WHY: day 30 set billing_status "terminated" and sent nothing. The agreement (Section 11) lets RGA end it for non-payment only "after written notice", so a client could be ended
// with no written word at all, and RGA only learned from a status flip. Now: a written NOTICE from day 25 that names the end day, then a termination LETTER on the end day, both through
// notify-client-stage (so they respect the suppression flag and the once-per-invoice record), and an alert in RGA's Messages when the account ends.
// HOLDS (shared/billing-rules.js is the one ladder; this runs it):
//   1. the ending notice comes only AFTER the pause notice was delivered, from day 25, and never before; nothing ends without a delivered ending notice;
//   2. the end is MORE than 30 days past due (day 31) and never on the day the ending notice goes; the letter is due on the end day and only once;
//   3. both messages render, name the end day, say what happens next, and have no em dash;
//   4. both go through notify-client-stage and are suppressed when RGA_SUPPRESS_CLIENT_EMAIL / suppress is set (run on a fake: nothing is sent either way);
//   5. billing-daily-check passes the secret and suppression to it, records the notices per invoice, and raises the account_ended alert (the label exists).
// SELF-PROOF: a ladder that ends without a notice is run through the same assertion and must be caught.
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 an account can end unwritten · 2 can't tell
import fs from "node:fs";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const IND = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { IND(`cannot read ${r}`); } };
const code = (s) => String(s).replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const F = [], fail = (m) => F.push(m);
Object.assign(process.env, { SUPABASE_URL: "https://supa.test", SUPABASE_SERVICE_ROLE_KEY: "k", INTERNAL_FN_SECRET: "s", GOOGLE_OAUTH_CLIENT_ID: "x", GOOGLE_OAUTH_CLIENT_SECRET: "y" });   // before anything loads: the modules read these once
process.removeAllListeners("warning");
const req = createRequire(`${SITE}/netlify/functions/x.js`);
let R;
try { R = req("../../shared/billing-rules.js"); } catch (e) { IND(`billing-rules did not load: ${e.message}`); }
if (typeof R.ladder !== "function" || typeof R.endOn !== "function") IND("billing-rules no longer exports ladder and endOn");

const due = "2026-10-01", day = (n) => R.addDays(due, n);
// a run of nightly visits, the way billing-daily-check does it: each visit sends the notice that is due (if not sent), then re-reads
function run(visitDays, sendsOk = () => true) {
  const sent = {}, log = [];
  for (const d of visitDays) {
    const today = day(d), notices = () => ({ warningNoticeAt: sent.billing_warning || null, pausedNoticeAt: sent.billing_paused || null, endingNoticeAt: sent.billing_ending || null, terminatedNoticeAt: sent.billing_terminated || null });
    let step = R.ladder({ dueYmd: due, todayYmd: today, ...notices() });
    if (step.notice && !sent[step.notice] && sendsOk(step.notice, d)) { sent[step.notice] = today; log.push({ day: d, sent: step.notice, endOn: step.notice === "billing_ending" ? R.endOn({ dueYmd: due, endingNoticeAt: today }) : step.endOn }); step = R.ladder({ dueYmd: due, todayYmd: today, ...notices() }); }
    log.push({ day: d, status: step.billingStatus, notice: step.notice, endOn: step.endOn });
  }
  return { sent, log };
}
const visits = Array.from({ length: 36 }, (_, i) => i + 1);
const full = run(visits);
const statusOn = (r, d) => (r.log.find((x) => x.day === d && x.status) || {}).status;
const sentDay = (r, k) => { const iso = r.sent[k]; return iso ? R.daysBetween(due, iso) : null; };

// 1 · order and days
if (sentDay(full, "billing_ending") == null) fail("an account that stays unpaid is never sent the ending notice");
else if (sentDay(full, "billing_ending") < 25) fail(`the ending notice goes on day ${sentDay(full, "billing_ending")}, before day 25`);
if (sentDay(full, "billing_ending") != null && sentDay(full, "billing_paused") != null && sentDay(full, "billing_ending") <= sentDay(full, "billing_paused")) fail("the ending notice goes before (or with) the pause notice");
// 2 · the end
const endDay = full.log.find((x) => x.status === "terminated");
if (!endDay) fail("an account that stays unpaid with both notices delivered never ends");
else {
  if (endDay.day <= 30) fail(`the account ends on day ${endDay.day}; the agreement says MORE than 30 days past due`);
  if (sentDay(full, "billing_ending") != null && endDay.day <= sentDay(full, "billing_ending")) fail("the account ends on or before the day its ending notice goes");
  if (sentDay(full, "billing_terminated") !== endDay.day) fail(`the termination letter goes on day ${sentDay(full, "billing_terminated")}, not on the end day (${endDay.day})`);
}
if (full.log.filter((x) => x.sent === "billing_terminated").length !== 1) fail("the termination letter is not sent exactly once across the nightly visits");
// the notice names the end day it will keep
{
  const e = full.log.find((x) => x.sent === "billing_ending");
  if (!e || !e.endOn) fail("the ending notice carries no end day to name");
  else if (endDay && e.endOn !== day(endDay.day)) fail(`the ending notice would name ${e.endOn} and the account ends ${day(endDay.day)}`);
}
// a notice that never delivers: nothing ends
{
  const noEnding = run(visits, (k) => k !== "billing_ending");
  if (noEnding.log.some((x) => x.status === "terminated")) fail("an account ends although its ending notice was never delivered");
  const noPause = run(visits, (k) => k !== "billing_paused");
  if (noPause.log.some((x) => x.status === "terminated" || x.sent === "billing_ending")) fail("an account is ended (or its ending notice sent) although the pause notice never delivered");
  // a run that missed days still ends only after a delivered notice, a full day after it
  const late = run([8, 16, 21, 33, 34, 35]);
  const lt = late.log.find((x) => x.status === "terminated");
  if (lt && !(sentDay(late, "billing_ending") != null && lt.day > sentDay(late, "billing_ending"))) fail("a catch-up run ended the account on the day it sent the ending notice");
}
// 4 days late is not an end: nothing before day 31 ends
for (const d of [24, 25, 29, 30]) if (statusOn(full, d) === "terminated") fail(`the account is ended on day ${d}`);
// self-proof of the assertion above
{ const bad = { sent: {}, log: [{ day: 20, status: "terminated" }] }; if (!(bad.log.some((x) => x.status === "terminated") && sentDay(bad, "billing_ending") == null)) IND("the no-notice check can't see an account that ends unwritten"); }

// 3 · the words
const NCS = (() => { try { return req("./notify-client-stage.js"); } catch (e) { IND(`notify-client-stage did not load: ${e.message}`); } })();
if (typeof NCS.messageFor !== "function") IND("notify-client-stage no longer exports messageFor");
const ctx = { first: "Pat", beta: false, amount: 625, endOn: "Monday, November 2, 2026", noticeOn: "Monday, October 26, 2026", pauseOn: "Wednesday, October 21" };
const ending = NCS.messageFor("billing_ending", ctx), term = NCS.messageFor("billing_terminated", ctx);
for (const [name, m] of [["ending notice", ending], ["termination letter", term]]) {
  if (!m) { fail(`the ${name} has no words (notify-client-stage returns nothing for it)`); continue; }
  const all = `${m.subject}\n${m.body}`;
  if (/—/.test(all)) fail(`the ${name} has an em dash`);
  if (/\b(colour|favour|organis|cancell)/i.test(all)) fail(`the ${name} drifts into British spelling`);
  if (!all.includes(ctx.endOn)) fail(`the ${name} doesn't name the end day`);
  if (!/## What/.test(m.body)) fail(`the ${name} has no "what happens next / what this means" part`);
  if (!/\[[^\]]+\]\(https:\/\/www\.rocketgrowthagency\.com\/portal\/\)/.test(m.body)) fail(`the ${name} has no link into the portal`);
}
if (ending && !/written notice/i.test(ending.body)) fail("the ending notice doesn't say it is the written notice the agreement requires");
if (ending && !/Section 11/.test(ending.body)) fail("the ending notice doesn't cite Section 11");
if (term && !/notice[^.]*(?:I sent|sent you)/i.test(term.body)) fail("the termination letter doesn't refer back to the notice");
if (term && !/yours|download/i.test(term.body)) fail("the termination letter doesn't say the client's files and accounts are theirs");
if (NCS.messageFor("billing_ending", { ...ctx, endOn: null }).body.includes("null") || NCS.messageFor("billing_terminated", { ...ctx, endOn: null, noticeOn: null }).body.includes("null")) fail("a missing date prints \"null\" in a notice");

// 4 · they go through notify-client-stage and respect suppression (a fake world: nothing leaves this machine)
{
  const CID = "11111111-1111-4111-8111-111111111111", WS = "22222222-2222-4222-8222-222222222222";
  let gmailSends = 0;
  const db = { clients: [{ id: CID, workspace_id: WS, business_name: "Acme", primary_contact_name: "Pat Lee", primary_contact_email: "pat@acme.test" }], client_onboarding_records: [{ id: "r", client_id: CID, workspace_id: WS, data: {} }], client_contracts: [], client_activity: [],
    rga_google_credentials: [{ workspace_id: WS, refresh_token: "rt", google_email: "hello@rocketgrowthagency.com", scopes: "gmail.send" }] };
  const res = (s, b) => new Response(typeof b === "string" ? b : JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
  globalThis.fetch = async (u, init = {}) => {
    u = String(u);
    if (u.startsWith("https://oauth2.googleapis.com/token")) return res(200, { access_token: "t", expires_in: 3600 });
    if (u.startsWith("https://gmail.googleapis.com/")) { gmailSends++; return res(200, { id: "g1" }); }
    const m = u.match(/^https:\/\/supa\.test\/rest\/v1\/([a-z_]+)(?:\?(.*))?$/);
    if (!m) throw new Error(`the gate's fake world has no ${u}: nothing leaves this machine`);
    const rows = db[m[1]]; if (!rows) return res(404, {});
    const p = new URLSearchParams(m[2] || ""), match = (r) => [...p.entries()].every(([k, v]) => ["select", "limit", "order"].includes(k) ? true : v.startsWith("eq.") ? String(r[k]) === v.slice(3) : true);
    const method = init.method || "GET";
    if (method === "GET") return res(200, rows.filter(match));
    if (method === "POST") { rows.push(JSON.parse(init.body)); return new Response(null, { status: 204 }); }
    if (method === "PATCH") { for (const r of rows.filter(match)) Object.assign(r, JSON.parse(init.body)); return new Response(null, { status: 204 }); }
    return res(405, {});
  };
  delete process.env.RGA_SUPPRESS_CLIENT_EMAIL;
  const NC = req("./notify-client-stage.js");
  const call = async (stage, extra = {}) => { const k = ["log", "warn", "error"], old = k.map((x) => console[x]); k.forEach((x) => { console[x] = () => {}; }); try { return await NC.handler({ httpMethod: "POST", headers: { "x-internal-secret": "s" }, body: JSON.stringify({ client_id: CID, stage, key: "inv3", facts: { end_on: "2026-11-02", notice_on: "2026-10-26" }, ...extra }) }); } finally { k.forEach((x, i) => { console[x] = old[i]; }); } };
  for (const stage of ["billing_ending", "billing_terminated"]) {
    gmailSends = 0; const supR = await call(stage, { suppress: true }), sup = JSON.parse(supR.body); if (process.env.GATE_DEBUG) console.error(supR.statusCode, supR.body);
    if (!sup.suppressed || gmailSends) fail(`${stage} is not suppressed by the suppress flag (${gmailSends} sent)`);
    process.env.RGA_SUPPRESS_CLIENT_EMAIL = "1"; gmailSends = 0; const sup2 = JSON.parse((await call(stage)).body); delete process.env.RGA_SUPPRESS_CLIENT_EMAIL;
    if (!sup2.suppressed || gmailSends) fail(`${stage} ignores RGA_SUPPRESS_CLIENT_EMAIL (${gmailSends} sent)`);
    gmailSends = 0; const okR = await call(stage), ok = JSON.parse(okR.body); if (process.env.GATE_DEBUG) console.error(okR.statusCode, okR.body.slice(0, 300));
    if (!ok.ok || gmailSends !== 1 || !ok.sent_at) fail(`${stage} sent ${gmailSends} email(s) and recorded ${ok.sent_at ? "it" : "nothing"} (it must be one, recorded)`);
    const again = JSON.parse((await call(stage)).body);
    if (!again.alreadySent || gmailSends !== 1) fail(`${stage} sent a second time for the same invoice`);
    const rec = db.client_onboarding_records[0].data.stage_notifications || {};
    if (!rec[`${stage}#inv3`]) fail(`${stage} isn't recorded per invoice (stage_notifications["${stage}#inv3"])`);
    if (stage === "billing_terminated" && gmailSends === 1) { const t = rec[`${stage}#inv3`]; if (!/November 2, 2026/.test(t.body || "")) fail("the recorded termination letter doesn't name the end day"); }
  }
}

// 5 · the nightly job
{
  const B = code(read("netlify/functions/billing-daily-check.js")), A = code(read("netlify/functions/_billing-alert.js"));
  if (!/billing_ending/.test(B) || !/billing_terminated/.test(B)) fail("billing-daily-check doesn't send the ending notice and the termination letter");
  if (!/notify-client-stage/.test(B)) fail("billing-daily-check doesn't send through notify-client-stage");
  if (!/"x-internal-secret": process\.env\.INTERNAL_FN_SECRET/.test(B)) fail("billing-daily-check calls notify-client-stage without the internal secret (it would be refused)");
  if (!/suppress: process\.env\.RGA_SUPPRESS_CLIENT_EMAIL === "1"/.test(B)) fail("billing-daily-check doesn't forward the suppression flag");
  if (!/kind: "account_ended"/.test(B)) fail("billing-daily-check doesn't alert RGA when an account ends");
  if (!/account_ended:/.test(A)) fail("the billing alert has no label for account_ended");
  if (!/R\.endOn\(/.test(B)) fail("billing-daily-check doesn't compute the end day it names in the notice");
}

if (F.length) { console.error(`🔴 an account can end for non-payment unwritten, or RGA isn't told (${F.length}):`); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ a late account is sent a written notice from day 25, ends only after it (day 31 or later), gets a termination letter on the end day, once, through notify-client-stage, with suppression honored; RGA is alerted");
