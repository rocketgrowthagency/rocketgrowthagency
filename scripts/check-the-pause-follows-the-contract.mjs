#!/usr/bin/env node
// check-the-pause-follows-the-contract.mjs — THE LATE-PAYMENT LADDER DOES WHAT THE SIGNED AGREEMENT SAYS (master audit #9, 11-11).
//
// 🔴 WHY. Section 4 of the agreement: "If an invoice is more than fifteen (15) days past due and RGA has given five (5) days'
// written notice, RGA may pause new work. A pause never affects Client's accounts, profile or data (Section 5C)." Section 11 lets
// RGA end it "for non-payment more than thirty (30) days past due after written notice". The code warned on day 15 and paused on
// day 18 (three days, not five), walled the client's data tabs while paused, ended the agreement on day 30, and its notices were
// once per client for life: a second late invoice got no written notice at all, and the call carried no internal secret, so
// notify-client-stage refused every one of them. A failed or capped notice was a console line. The portal printed a due date a day
// early in Pacific, and the day-exact retries (-3, 0, 3, 5, 7) were skipped for good when a daily run was missed.
//
// RUNS the real billing-daily-check, notify-client-stage (with a fake Gmail) and admin-open-moves on a fake database
// (scripts/lib/billing-world.mjs); lifts the portal's banner functions; reads the rules in shared/billing-rules.js. Holds:
//   1 · the rules carry the agreement's numbers, and the agreement still says them
//   2 · the ladder: no delivered notice = no pause, ever; pause = the later of notice + 5 and day 16; the end only after the pause
//       notice went, on a later day; each card retry and the pre-billing notice on or after its day
//   3 · the daily run: sends the notice with the internal secret, names the pause day, keys it per invoice (a second late invoice
//       gets its own), pauses only 5 days after a delivered notice; a notice that fails or hits the cap keeps the client unpaused,
//       makes the run's check-in an ERROR and puts an alert in Messages
//   4 · the portal: a paused client still sees their data; the banner names the pause day from the notice; a due date prints as
//       its own calendar day in Pacific
//   5 · the agreement's dated promises reach To do: Section 4A on day 25, the founding hold in month 11; the admin card shows both
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 regressed · 2 can't tell
process.env.TZ = "America/Los_Angeles";
import fs from "node:fs";
import vm from "node:vm";
import { makeWorld, setEnv, quiet, seedClient, addInvoice, CID, SECRET } from "./lib/billing-world.mjs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE: cannot read ${r}`); process.exit(2); } };
const F = [], fail = (m) => F.push(m);
setEnv();
const W = makeWorld(SITE);
let R, BDC, CK, MOVES;
try {
  R = W.require("shared/billing-rules.js");
  BDC = W.require("netlify/functions/billing-daily-check.js");
  CK = W.require("netlify/functions/_job-checkin.js");
  MOVES = W.require("netlify/functions/admin-open-moves.js");
} catch (e) { console.error(`⚠️  INDETERMINATE: a billing file doesn't load: ${e.message}`); process.exit(2); }
const today = R.businessYmd(new Date());
const DAY = 86400000;

// ── 1 · the rules carry the agreement's numbers ─────────────────────────────────────────────────────────────────────────────
{
  const C = read("netlify/functions/contract-generate.js");
  if (!/If an invoice is more than fifteen \(15\) days past due and RGA has given five \(5\) days' written notice, RGA may pause new work\. A pause never affects Client's accounts, profile or data \(Section 5C\)\./.test(C)) {
    console.error("⚠️  INDETERMINATE: the agreement's late-payment clause changed wording: re-read it, then this gate"); process.exit(2);
  }
  if (!/for non-payment more than thirty \(30\) days past due after written notice/.test(C)) { console.error("⚠️  INDETERMINATE: Section 11's non-payment clause changed wording"); process.exit(2); }
  const L = R.LADDER;
  if (L.NOTICE_DAYS !== 5) fail(`the rules give ${L.NOTICE_DAYS} days' notice; the agreement says five (5)`);
  if (L.PAUSE_AFTER_DAYS_LATE !== 15) fail(`the rules pause after ${L.PAUSE_AFTER_DAYS_LATE} days late; the agreement says more than fifteen (15)`);
  if (L.END_AFTER_DAYS_LATE !== 30) fail(`the rules end after ${L.END_AFTER_DAYS_LATE} days late; the agreement says more than thirty (30)`);
  if (JSON.stringify(L.RETRY_DAYS) !== "[0,3,5,7]") fail(`the card retries moved: ${JSON.stringify(L.RETRY_DAYS)}`);
  const bdc = read("netlify/functions/billing-daily-check.js").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  if (/PAUSE_DAY|TERM_DAY|WARN_DAYS|18 - daysOverdue/.test(bdc)) fail("billing-daily-check keeps its own day numbers beside the shared rules");
  if (!/R\.ladder\(/.test(bdc)) fail("billing-daily-check doesn't decide the rung with the shared ladder");
  const portal = read("portal/portal.js").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  if (/\b18 - (?:inv2)?[dD]aysOverdue\b/.test(portal)) fail("the portal still counts down to a hardcoded day 18");
}

// ── 2 · the ladder, by the agreement ────────────────────────────────────────────────────────────────────────────────────────
{
  const due = "2026-03-01", day = (n) => R.addDays(due, n), at = (n) => `${day(n)}T18:00:00Z`;
  const L = (n, w = null, p = null, e = null) => R.ladder({ dueYmd: due, todayYmd: day(n), warningNoticeAt: w, pausedNoticeAt: p, endingNoticeAt: e });
  for (const n of [0, 3, 7]) if (L(n).billingStatus !== "active") fail(`day ${n} is not active`);
  if (L(8).billingStatus !== "overdue" || L(8).notice !== "billing_overdue") fail("day 8 doesn't send the past-due email");
  if (L(15).notice !== "billing_warning" || L(15).billingStatus !== "warning") fail("day 15 doesn't send the written pause notice");
  for (const n of [16, 18, 20, 29, 45]) if (L(n).billingStatus !== "warning") fail(`day ${n} with NO delivered notice is "${L(n).billingStatus}" (no notice, no pause)`);
  if (L(19, at(15)).billingStatus !== "warning") fail("a notice on day 15 pauses on day 19 (4 days' notice)");
  if (L(20, at(15)).billingStatus !== "paused" || L(20, at(15)).pauseOn !== day(20)) fail("a notice on day 15 doesn't pause on day 20");
  if (L(21, at(17)).billingStatus !== "warning" || L(22, at(17)).billingStatus !== "paused") fail("a notice on day 17 doesn't pause on day 22");
  if (L(15, at(5)).billingStatus !== "warning" || L(16, at(5)).billingStatus !== "paused") fail("an early notice pauses before the invoice is MORE than 15 days late");
  if (L(30, at(15), at(20), at(25)).billingStatus !== "paused") fail("day 30 ends the agreement (it must be MORE than 30)");
  // Section 11 "after written notice" (master plans-and-emails decision 8, 11-11): the end needs the written ENDING notice too, from day 25
  { const s = L(31, at(15), at(20)); if (s.billingStatus !== "paused" || s.notice !== "billing_ending") fail("day 31 with no written ending notice ends the agreement (or sends no ending notice)"); }
  if (L(31, at(15), at(20), at(25)).billingStatus !== "terminated") fail("day 31 after the delivered pause and ending notices doesn't end it");
  if (L(40, at(15)).billingStatus !== "paused") fail("the agreement ends with no pause notice delivered");
  if (L(40, at(15), at(40), at(25)).billingStatus !== "paused") fail("the agreement ends on the same day the pause notice went (not AFTER it)");
  if (L(40, at(15), at(20), at(40)).billingStatus !== "paused") fail("the agreement ends on the same day its written ending notice went (not AFTER it)");
  // the dates are calendar days in business time, not UTC midnights
  if (R.pauseOn({ dueYmd: due, noticeAt: "2026-03-16T07:30:00Z" }) !== day(20)) fail("a notice sent at 11:30 PM Pacific counts as the next day");
  // on or after
  const A = (d, last = null) => R.chargeAttemptDue({ daysOverdue: d, lastAttemptDay: last });
  if (A(-1) !== null || A(0) !== 0 || A(1) !== 0 || A(1, 0) !== null || A(4, 0) !== 3 || A(4, 3) !== null || A(6, 0) !== 5 || A(9, 5) !== 7 || A(12, 7) !== null)
    fail("a card retry is not 'on or after its day, once'");
  if (R.prebillDue({ daysOverdue: -4 }) || !R.prebillDue({ daysOverdue: -3 }) || !R.prebillDue({ daysOverdue: -1 }) || R.prebillDue({ daysOverdue: 0 })) fail("the pre-billing notice is not 'from 3 days before until the day before'");
  if (R.noticeKey(3) === R.noticeKey(2)) fail("two invoices share one notice record");
}

// ── 3 · the daily run ───────────────────────────────────────────────────────────────────────────────────────────────────────
const run = () => quiet(() => BDC.handler({ httpMethod: "POST", headers: { "x-internal-secret": SECRET }, body: "{}" }));
const rec = () => W.db.client_onboarding_records[0].data;
const notices = (stage) => W.fns.filter((c) => c.name === "notify-client-stage" && c.body.stage === stage);
const mailsWith = (re) => W.gmail.filter((g) => re.test(g.text));
const seedLate = ({ daysLate, notes = {}, billing = "warning" }) => {
  W.reset(); seedClient(W, { billing });
  addInvoice(W, { num: 1, due: R.addDays(today, -60), status: "paid", paidAt: new Date(Date.now() - 60 * DAY).toISOString() });
  addInvoice(W, { num: 2, due: R.addDays(today, -30), status: "paid", paidAt: new Date(Date.now() - 30 * DAY).toISOString() });
  const i = addInvoice(W, { num: 3, due: R.addDays(today, -daysLate), status: daysLate >= 15 ? "warning" : "overdue" });
  rec().stage_notifications = notes;
  W.stripeHandler = async () => [200, { id: "cs_x", url: "https://checkout.test/x", status: "open" }];
  return i;
};
const ago = (days) => new Date(Date.now() - days * DAY).toISOString();
{
  // day 16, no notice yet: the notice goes now, properly addressed, naming the day; no pause
  seedLate({ daysLate: 16 });
  let out = await run();
  const n = notices("billing_warning")[0];
  if (!n) fail("on day 16 with no notice yet, the daily run sends no written notice");
  else {
    if (n.headers["x-internal-secret"] !== SECRET) fail("the notice call carries no internal secret, so notify-client-stage refuses it (every billing email since the ladder was built)");
    if (n.body.key !== "inv3") fail(`the notice isn't keyed to its invoice (key ${n.body.key})`);
    if (n.body.facts?.pause_on !== R.addDays(today, 5)) fail(`the notice names ${n.body.facts?.pause_on} as the pause day (want notice + 5 = ${R.addDays(today, 5)})`);
  }
  const label = R.dateOnlyLabel(R.addDays(today, 5), { weekday: "long", month: "long", day: "numeric" });
  const mail = mailsWith(/Action needed to keep your campaign running/)[0];
  if (!mail) fail("the written notice never reached Gmail");
  else {
    if (!mail.text.includes(`If it's still unpaid on ${label}, I'll pause new work`)) fail("the written notice doesn't name the day work pauses");
    if (!/stay exactly as they are/.test(mail.text)) fail("the written notice doesn't say the client's data stays");
    if (/[—–]/.test(mail.text.split("\n\n").slice(1).join("\n\n").split("Rocket Growth Agency ·")[0])) fail("an em or en dash in the written notice");
  }
  if (W.db.clients[0].billing_status !== "warning") fail(`on day 16 the client is "${W.db.clients[0].billing_status}" (a notice sent today pauses in 5 days, not now)`);
  if (!rec().stage_notifications["billing_warning#inv3"]?.sent_at) fail("the delivered notice isn't on the record the pause reads");
  // the next run the same day sends nothing more
  const sent = W.gmail.length; out = await run();
  if (W.gmail.length !== sent) fail("a second run the same day sent the notice again");

  // notice delivered 4 days ago: still warning. 5 days ago: paused, and the pause email goes
  seedLate({ daysLate: 20, notes: { "billing_warning#inv3": { sent_at: ago(4) } } });
  await run();
  if (W.db.clients[0].billing_status !== "warning") fail("4 days after the written notice, the client is paused");
  seedLate({ daysLate: 21, notes: { "billing_warning#inv3": { sent_at: ago(5) } } });
  await run();
  if (W.db.clients[0].billing_status !== "paused") fail(`5 days after a delivered notice (day 21) the client is "${W.db.clients[0].billing_status}", not paused`);
  const pm = mailsWith(/Your account is paused/)[0];
  if (!pm) fail("the pause email didn't go");
  else if (!/Only new work is on hold/.test(pm.text) || !/stay exactly as they are/.test(pm.text)) fail("the pause email doesn't say only work stops and the data stays");

  // day 40: ends only after a pause notice delivered on an earlier day
  seedLate({ daysLate: 40, billing: "paused", notes: { "billing_warning#inv3": { sent_at: ago(25) } } });
  await run();
  if (W.db.clients[0].billing_status !== "paused") fail(`day 40 with no pause notice yet ended the agreement ("${W.db.clients[0].billing_status}")`);
  // day 40 with the pause notice but no written ending notice: the ending notice goes, nothing ends today (Section 11, decision 8)
  seedLate({ daysLate: 40, billing: "paused", notes: { "billing_warning#inv3": { sent_at: ago(25) }, "billing_paused#inv3": { sent_at: ago(20) } } });
  await run();
  if (W.db.clients[0].billing_status !== "paused") fail(`day 40 with no written ending notice yet ended the agreement ("${W.db.clients[0].billing_status}")`);
  if (!notices("billing_ending").length) fail("day 40 after a delivered pause notice sends no written ending notice");
  seedLate({ daysLate: 40, billing: "paused", notes: { "billing_warning#inv3": { sent_at: ago(25) }, "billing_paused#inv3": { sent_at: ago(20) }, "billing_ending#inv3": { sent_at: ago(10) } } });
  await run();
  if (W.db.clients[0].billing_status !== "terminated") fail("day 40 after the delivered pause and ending notices did not end the agreement");

  // a SECOND late invoice gets its own written notice (the old lifetime key said "already sent")
  seedLate({ daysLate: 16, notes: { billing_warning: { sent_at: ago(90) }, "billing_warning#inv2": { sent_at: ago(60) }, billing_overdue: { sent_at: ago(95) } } });
  await run();
  if (!mailsWith(/Action needed to keep your campaign running/).length) fail("a second late invoice got no written notice (the first invoice's record silenced it)");

  // a notice that can't go (the daily cap): no pause, an ERROR check-in, a Messages alert
  seedLate({ daysLate: 25 });
  Object.assign(W.db.rga_google_credentials[0], { sends_date: new Date().toISOString().slice(0, 10), sends_today: 50 });
  out = await run();
  const body = JSON.parse(out.body || "{}");
  if (W.db.clients[0].billing_status === "paused") fail("with the notice refused, the client was paused anyway");
  if (body.ok !== false || !/did not send/.test(String(body.error || ""))) fail("a notice that hit the cap doesn't fail the run's reply");
  const o = CK.outcome("billing-daily-check", out);
  if (o.ok !== false) fail("a notice that hit the cap leaves the job's check-in green (it must be an ERROR)");
  const al = W.db.client_activity.filter((a) => a.kind === "rga_alert" && a.payload?.kind === "billing_notice_failed" && a.payload?.needs_human === true);
  if (al.length !== 1) fail(`a refused notice made ${al.length} Messages alerts (want 1)`);
  else if (!/cap/.test(al[0].payload.summary)) fail("the alert doesn't say the cap was hit");
  await run();
  if (W.db.client_activity.filter((a) => a.kind === "rga_alert" && a.payload?.kind === "billing_notice_failed").length !== 1) fail("the same refused notice alerts again the same day");

  // the pre-billing notice on or after 3 days ahead
  W.reset(); seedClient(W);
  addInvoice(W, { num: 1, due: R.addDays(today, -28), status: "paid", paidAt: new Date(Date.now() - 28 * DAY).toISOString() });
  addInvoice(W, { num: 2, due: R.addDays(today, 2), status: "upcoming" });
  await run();
  if (!W.fns.some((c) => c.name === "send-invoice-email" && c.body.tone === "upcoming" && Number(c.body.invoice_num) === 2)) fail("a run that missed day -3 never sends the pre-billing notice");
}

// ── 4 · the portal ──────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  if (new Date("2026-11-14").toLocaleDateString("en-US", { month: "long", day: "numeric" }) !== "November 13") { console.error("⚠️  INDETERMINATE: this run is not in Pacific time, so the date check proves nothing"); process.exit(2); }
  if (R.dateOnlyLabel("2026-11-14") !== "November 14, 2026") fail(`a due date of 2026-11-14 prints as "${R.dateOnlyLabel("2026-11-14")}" in Pacific`);
  const P = read("portal/portal.js");
  const a = P.indexOf("function buildPausedWallHtml"), b = P.indexOf("\nfunction month1SentOf", a);
  if (a < 0 || b < a) { console.error("⚠️  INDETERMINATE: the portal's billing banner moved"); process.exit(2); }
  const ctx = { globalThis: null, escapeHtml: (s) => String(s), Date, Math, String, Number, console };
  ctx.globalThis = ctx; ctx.rgaBillingRules = R;
  vm.createContext(ctx);
  try { vm.runInContext(`${P.slice(a, b)}\nthis.__b = { buildBillingBannerHtml };`, ctx); }
  catch (e) { console.error(`⚠️  INDETERMINATE: the portal's billing banner can't be lifted: ${e.message}`); process.exit(2); }
  const B = ctx.__b;
  const lateInv = { invoice_num: 3, due_date: R.addDays(today, -17), status: "warning" };
  const ob = { data: { stage_notifications: { "billing_warning#inv3": { sent_at: new Date(Date.now() - 1 * DAY).toISOString() } } } };
  const warn = B.buildBillingBannerHtml("warning", [lateInv], ob);
  const pauseDay = R.pauseOn({ dueYmd: lateInv.due_date, noticeAt: ob.data.stage_notifications["billing_warning#inv3"].sent_at });
  if (!warn.includes(R.dateOnlyLabel(pauseDay))) fail("the warning banner doesn't name the pause day from the written notice");
  const warnNo = B.buildBillingBannerHtml("warning", [lateInv], { data: {} });
  if (/pauses on|will pause in/.test(warnNo)) fail("with no notice sent, the banner still promises a pause date");
  if (!warnNo.includes(R.dateOnlyLabel(lateInv.due_date))) fail("the banner's due date is not the invoice's own calendar day");
  const paused = B.buildBillingBannerHtml("paused", [{ ...lateInv, status: "overdue" }], ob);
  if (/reporting is on hold|restore full access/i.test(paused) || !/still here/.test(paused)) fail("the paused banner says the client's data is on hold (a pause never affects their data)");
  const code = P.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  if (!/const _billingPaused = String\(client\.billing_status \|\| ""\) === "terminated";/.test(code)) fail("a paused client's rankings, reviews or reports are walled again (only a closed account is)");
  if (/\["paused", "terminated"\]\.includes\(String\(client\.billing_status/.test(code)) fail("the data wall covers a paused account");
  if (/new Date\(unpaidInvoice\.due_date\)/.test(code)) fail("the banner parses a date-only due date as UTC midnight (a day early in Pacific)");
}

// ── 5 · the agreement's dated promises reach To do and the admin card ───────────────────────────────────────────────────────
{
  const now = new Date().toISOString();
  const kinds = async () => (await quiet(() => MOVES.movesForWorkspace({ clientId: CID, now }))).map((m) => m.kind);
  // Section 4A: Standard Plan, signed and paid 25 days ago, setup not delivered → a To do; 24 days → none; delivered → none
  const seed4A = (daysAgo, tasks = {}) => { W.reset(); seedClient(W, { tier: "commit_3mo", stage: "stage_4_onboarding", signedAt: ago(daysAgo + 1), tasks });
    addInvoice(W, { num: 1, due: R.addDays(today, -daysAgo), status: "paid", paidAt: ago(daysAgo), amount: 1250 }); };
  seed4A(25);
  if (!(await kinds()).includes("setup_promise")) fail("on day 25 of the Section 4A promise with setup not delivered, no To do appears");
  const m = (await quiet(() => MOVES.movesForWorkspace({ clientId: CID, now }))).find((x) => x.kind === "setup_promise");
  if (m && (!/\$1,250 Month 1 fee is refundable/.test(m.what) || !m.due || m.owner !== "rga")) fail(`the Section 4A To do doesn't say what's at stake by when: ${m.what}`);
  seed4A(23);
  if ((await kinds()).includes("setup_promise")) fail("the Section 4A To do appears before day 25");
  const done = Object.fromEntries(R.SETUP_PROMISE.items.flatMap((it) => it.steps).map((id) => [id, { status: "done" }]));
  seed4A(27, done);
  if ((await kinds()).includes("setup_promise")) fail("the Section 4A To do appears though setup was delivered");
  // founding hold: month 11 → "price hold ends"; month 10 → nothing; a stored held_months is read
  const seedHold = (signedAt, heldMonths) => { W.reset(); seedClient(W, { tier: "founding", signedAt, heldMonths }); };
  seedHold(`${R.addMonths(today, -11)}T18:00:00Z`);
  if (!(await kinds()).includes("price_hold_ends")) fail("in month 11 of the founding hold, no 'price hold ends' To do appears");
  seedHold(`${R.addMonths(today, -10)}T18:00:00Z`);
  if ((await kinds()).includes("price_hold_ends")) fail("the 'price hold ends' To do appears in month 10");
  seedHold(`${R.addMonths(today, -11)}T18:00:00Z`, 24);
  if ((await kinds()).includes("price_hold_ends")) fail("a stored held_months of 24 is ignored (the hold is read as 12)");
  const CG = read("netlify/functions/contract-generate.js");
  if (!/\.\.\.\(plan_code === "founding" \? \{ held_months: FOUNDING_HELD_MONTHS \} : \{\}\)/.test(CG)) fail("a founding agreement no longer stores held_months");
  const A = read("admin/admin.js");
  if (!/BR\.setupPromise\(/.test(A) || !/BR\.foundingHold\(/.test(A) || !/\$\{contractDatesHtml\}/.test(A)) fail("the admin client page no longer shows the Section 4A deadline and the founding hold");
  if (!/\/\^billing:\//.test(A)) fail("a billing To do's button opens nothing on the admin");
}

W.restore();
if (F.length) { console.error(`🔴 the late-payment ladder doesn't follow the agreement (${F.length}):`); for (const x of F) console.error(`  - ${x}`); process.exit(1); }
console.log("✅ the ladder follows the agreement: a pause needs a delivered written notice + 5 days and more than 15 days late, never touches the client's data, ends only after the pause notice; every rung on or after its day, notices per invoice and sent with the secret; a failed notice is an ERROR + a Messages alert; due dates print as their own day; Section 4A and the founding hold reach To do");
process.exit(0);
