#!/usr/bin/env node
// check-the-payment-welcome.mjs — the welcome email at payment (approved admin_last_research_items_v1 item 4, 11-01).
// RUNS the real stripe-webhook handler + _payment-welcome.js + the real Gmail helper on a fake database, a fake Google and fake functions: any other address throws,
// so no email can leave. Holds: the exact approved words · the reminder line only with STEP_REMINDERS_EMAIL=on, its date computed · once per client across
// redeliveries and a second event · never for a test client, a test-mode payment, or when suppressed · Google already connected = nothing sent, not other words ·
// a connection we can't read = nothing sent · a failed send never fails the webhook, gives the lock back and says so · recorded with a read-back · renewals and
// old clients never get it · the reminder the email names is really sent by the sweep.
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE: cannot read ${r}`); process.exit(2); } };
const F = [], fail = (m) => F.push(m);
const CID = "11111111-1111-4111-8111-111111111111", WS = "22222222-2222-4222-8222-222222222222";
const SUBJECT = "You're set. Here's what happens next";
const LINE1 = "Thanks, your payment went through. The next step is connecting your Google Business Profile, which takes about two minutes in your portal.";

// ── the fake world ──────────────────────────────────────────────────────────────────────────────
let db, mails, gmailStatus, oauthStatus, lockStatus, calls;
const reset = (client = {}) => {
  db = { clients: [{ id: CID, workspace_id: WS, business_name: "Acme Plumbing", primary_contact_name: "Pat Lee", primary_contact_email: "pat@acme.test", primary_market: "Austin, TX", client_portal_stage: "stage_2_payment", source: null, ...client }],
    client_onboarding_records: [{ id: "r1", client_id: CID, workspace_id: WS, data: { tasks: { keep: { done: 1 } } } }],
    client_google_oauth: [], stripe_webhook_events: [], client_activity: [], client_contracts: [], client_invoices: [], client_subscriptions: [],
    rga_google_credentials: [{ refresh_token: "rt", google_email: "hello@rocketgrowthagency.com", scopes: "gmail.send" }] };
  mails = []; gmailStatus = 200; oauthStatus = 200; lockStatus = null; calls = [];
};
const res = (status, body) => new Response(body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, init = {}) => {
  u = String(u); calls.push(u);
  const method = init.method || "GET";
  if (u.startsWith("https://oauth2.googleapis.com/token")) return res(200, { access_token: "tok", expires_in: 3600 });
  if (u.startsWith("https://gmail.googleapis.com/")) {
    if (gmailStatus !== 200) return res(gmailStatus, { error: { message: "refused" } });
    const raw = Buffer.from(JSON.parse(init.body).raw, "base64url").toString("utf8");
    // the email a client reads: the headers, plus each base64 part decoded
    const parts = [...raw.matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n(?=--)/g)].map((x) => Buffer.from(x[1].replace(/\s/g, ""), "base64").toString("utf8"));
    mails.push(`${raw.split("\r\n\r\n")[0]}\n\n${parts[0] || ""}`); return res(200, { id: `g${mails.length}`, threadId: "t" });
  }
  if (u.includes("/.netlify/functions/")) return res(200, { ok: true });
  const m = u.match(/^https:\/\/supa\.test\/rest\/v1\/([a-z_]+)(?:\?(.*))?$/);
  if (!m) throw new Error(`the gate's fake world has no ${u}: nothing leaves this machine`);
  const [, table, q = ""] = m, rows = db[table];
  if (!rows) return res(404, { message: `no table ${table}` });
  const params = new URLSearchParams(q), match = (r) => [...params.entries()].every(([k, v]) => ["select", "limit", "order"].includes(k) ? true : v === "not.is.null" ? r[k] != null : v.startsWith("eq.") ? String(r[k]) === decodeURIComponent(v.slice(3)) : true);
  if (table === "client_google_oauth" && oauthStatus !== 200) return res(oauthStatus, { message: "down" });
  if (method === "GET") return res(200, rows.filter(match));
  if (method === "POST") {
    const row = JSON.parse(init.body);
    if (table === "stripe_webhook_events") {
      if (lockStatus && String(row.stripe_event_id).startsWith("rga_")) return res(lockStatus, { message: "down" });
      if (rows.some((r) => r.stripe_event_id === row.stripe_event_id)) return res(409, { message: "duplicate" });
    }
    rows.push(row); return res(201, "");
  }
  if (method === "PATCH") { for (const r of rows.filter(match)) Object.assign(r, JSON.parse(init.body)); return res(200, rows.filter(match)); }
  if (method === "DELETE") { db[table] = rows.filter((r) => !match(r)); return res(204); }
  return res(405, {});
};
Object.assign(process.env, { SUPABASE_URL: "https://supa.test", SUPABASE_SERVICE_ROLE_KEY: "k", STRIPE_WEBHOOK_SECRET: "whsec_t", STRIPE_SECRET_KEY: "sk", INTERNAL_FN_SECRET: "s", URL: "https://site.test", GOOGLE_CLIENT_ID: "x", GOOGLE_CLIENT_SECRET: "y", RGA_GOOGLE_CLIENT_ID: "x", RGA_GOOGLE_CLIENT_SECRET: "y" });
delete process.env.RGA_SUPPRESS_CLIENT_EMAIL; delete process.env.STEP_REMINDERS_EMAIL; delete process.env.STRIPE_TEST_CLIENT_IDS; delete process.env.STRIPE_WEBHOOK_SECRET_TEST;
const req = createRequire(`${SITE}/netlify/functions/x.js`);
let PW, WH;
try { PW = req(`${SITE}/netlify/functions/_payment-welcome.js`); WH = req(`${SITE}/netlify/functions/stripe-webhook.js`); }
catch (e) { console.error(`⚠️  INDETERMINATE: ${e.message}`); process.exit(2); }
const quiet = async (fn) => { const k = ["log", "warn", "error"], old = k.map((x) => console[x]); k.forEach((x) => { console[x] = () => {}; }); try { return await fn(); } finally { k.forEach((x, i) => { console[x] = old[i]; }); } };
let nEvt = 0;
const deliver = async (type, object, opts = {}) => {
  const id = opts.id || `evt_${++nEvt}`, payload = JSON.stringify({ id, type, livemode: opts.livemode !== false, data: { object } }), t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac("sha256", "whsec_t").update(`${t}.${payload}`).digest("hex");
  return quiet(() => WH.handler({ httpMethod: "POST", headers: { "stripe-signature": `t=${t},v1=${sig}` }, body: payload }));
};
const pi = (x = {}) => ({ id: "pi_1", amount_received: 125000, metadata: { client_id: CID, kind: "first_invoice", invoice_num: "1" }, ...x });
const rec = () => db.client_onboarding_records[0].data;
const pw = () => (rec().stage_notifications || {}).payment_welcome;
const welcomes = () => mails.filter((m) => m.includes(SUBJECT)).length;
const activity = (kind) => db.client_activity.filter((a) => a.kind === kind);
const LOCK = () => db.stripe_webhook_events.filter((e) => String(e.stripe_event_id).startsWith("rga_payment_welcome:"));

// ── 1 · the words ───────────────────────────────────────────────────────────────────────────────
{
  const NOV1 = Date.parse("2026-11-01T18:00:00Z");
  const off = PW.buildWelcome({ nowMs: NOV1, tz: "America/Los_Angeles", env: {} });
  if (off.subject !== SUBJECT) fail(`the subject isn't the approved one: "${off.subject}"`);
  if (off.markup !== LINE1) fail("with reminders off, the body isn't exactly the approved sentence");
  if (/remind|connected by/i.test(off.markup) || off.reminder_on) fail("with reminders off, the email still mentions a reminder");
  const on = PW.buildWelcome({ nowMs: NOV1, tz: "America/Los_Angeles", env: { STEP_REMINDERS_EMAIL: "on" } });
  if (on.markup !== `${LINE1}\n\nIf it isn't connected by Friday, Nov 6, we'll send you one reminder.`) fail("with reminders on, the two approved sentences aren't exact (Nov 1 should name Friday, Nov 6)");
  if (on.reminder_on !== "2026-11-06") fail(`the stored reminder date isn't the one the email names: ${on.reminder_on}`);
  const later = PW.buildWelcome({ nowMs: Date.parse("2026-12-30T18:00:00Z"), tz: "America/Los_Angeles", env: { STEP_REMINDERS_EMAIL: "on" } });
  if (!later.markup.includes("Monday, Jan 4") || later.reminder_on !== "2027-01-04") fail(`the date is typed or doesn't cross a year: ${later.markup}`);
  // the same instant is a different day in another zone
  const utcLate = Date.parse("2026-11-02T03:00:00Z");
  if (PW.connectByDate(utcLate, "America/Los_Angeles").ymd !== "2026-11-06" || PW.connectByDate(utcLate, "Asia/Tokyo").ymd !== "2026-11-07") fail("the reminder date ignores the client's time zone");
  if (!PW.connectReminderDue({ stage_notifications: { payment_welcome: { reminder_on: "2026-11-06" } } }, "2026-11-06")) fail("the promised reminder isn't due on the date the email named");
  if (PW.connectReminderDue({ stage_notifications: { payment_welcome: { reminder_on: "2026-11-06" } } }, "2026-11-05")) fail("the reminder is due before the date the email named");
  if (PW.connectReminderDue({ stage_notifications: { payment_welcome: { reminder_on: "2026-11-06", reminder_sent_at: "x" } } }, "2026-11-09")) fail("the promised one reminder can go twice");
  if (PW.connectReminderDue({ stage_notifications: { payment_welcome: { reminder_on: null } } }, "2026-11-09")) fail("an email that named no reminder still sends one");
}

// ── 2 · the first payment, end to end through the real webhook ──────────────────────────────────
{
  reset();
  const r = await deliver("payment_intent.succeeded", pi(), { id: "evt_first" });
  if (r.statusCode !== 200) fail(`the webhook answered ${r.statusCode} on a first payment`);
  if (welcomes() !== 1) fail(`a first payment sent ${welcomes()} welcome emails`);
  const mail = mails.find((m) => m.includes(SUBJECT)) || "";
  if (!mail.includes(LINE1)) fail("the email that went out doesn't hold the approved sentence");
  if (/connected by|remind/i.test(mail)) fail("with reminders off, the email that went out mentions a reminder");
  if ((mail.match(/Rocket Growth Agency · \(/g) || []).length < 1) fail("the email that went out has no sign-off");
  if (!pw() || pw().gmail_message_id !== "g1") fail("the send isn't recorded with Gmail's id on the client's record");
  if (!rec().tasks || !rec().tasks.keep) fail("recording the send lost what was on the client's record");
  if (activity("stage_notification_sent").length !== 1) fail("the send has no activity row");
  if (LOCK().length !== 1) fail("the send isn't locked");
  // the same event again
  await deliver("payment_intent.succeeded", pi(), { id: "evt_first" });
  if (welcomes() !== 1) fail("a redelivered event sent a second welcome");
  // a different event, the stage rewound (a concurrent path): the record guards it, and with the record gone the lock does
  db.clients[0].client_portal_stage = "stage_2_payment";
  await deliver("payment_intent.succeeded", pi({ id: "pi_2" }));
  if (welcomes() !== 1) fail("a second event for the same client sent a second welcome");
  db.clients[0].client_portal_stage = "stage_2_payment"; delete rec().stage_notifications;
  await deliver("payment_intent.succeeded", pi({ id: "pi_3" }));
  if (welcomes() !== 1) fail("with the record not saved yet, the lock didn't hold: a second welcome went");
  if (activity("payment_welcome_failed").length) fail("a welcome that's already out reads as a failure on the client's record");
  // the checkout path lands on the same once
  db.clients[0].client_portal_stage = "stage_2_payment";
  await deliver("checkout.session.completed", { id: "cs_1", status: "complete", metadata: { client_id: CID }, customer: "cus" });
  if (welcomes() !== 1) fail("the checkout path sent a second welcome");
  // the checkout path alone sends one
  reset();
  await deliver("checkout.session.completed", { id: "cs_2", status: "complete", metadata: { client_id: CID }, customer: "cus" });
  if (welcomes() !== 1) fail(`the checkout path's first payment sent ${welcomes()} welcomes`);
}

// ── 3 · never for these ─────────────────────────────────────────────────────────────────────────
const noWelcome = async (name, setup, check) => { reset(); await setup(); const r = await deliver(setup.type || "payment_intent.succeeded", setup.obj || pi(), setup.opts || {}); if (r.statusCode !== 200) fail(`${name}: the webhook answered ${r.statusCode}`); if (mails.length) fail(`${name}: an email went out`); if (check) check(); };
{
  await noWelcome("a test client (source test:)", () => { db.clients[0].source = "test:walk"; }, () => { if (LOCK().length) fail("a test client took the lock"); });
  process.env.STRIPE_TEST_CLIENT_IDS = `other,${CID}`;
  await noWelcome("a client on the Stripe test list", () => {});
  delete process.env.STRIPE_TEST_CLIENT_IDS;
  process.env.RGA_SUPPRESS_CLIENT_EMAIL = "1";
  await noWelcome("suppression on", () => {}, () => { if (LOCK().length) fail("a suppressed run took the lock, so the real email could never go"); });
  delete process.env.RGA_SUPPRESS_CLIENT_EMAIL;
  { const s = () => {}; s.opts = { livemode: false }; s.obj = pi({ livemode: false }); await noWelcome("a test-mode payment", s); }
  await noWelcome("Google already connected", () => { db.client_google_oauth.push({ client_id: CID, refresh_token: "enc:v1:x" }); }, () => {
    if (activity("payment_welcome_not_sent").length !== 1) fail("Google connected: nothing on the record says why no welcome went");
    if (LOCK().length) fail("Google connected: the lock was taken"); });
  await noWelcome("the connection can't be read", () => { oauthStatus = 500; }, () => { if (activity("payment_welcome_not_sent").length !== 1) fail("an unread connection: nothing on the record says why"); });
  await noWelcome("the lock can't be taken", () => { lockStatus = 500; }, () => { if (activity("payment_welcome_failed").length !== 1) fail("no lock: nothing on the record says why"); });
  { const s = () => {}; s.obj = pi({ metadata: { client_id: CID, kind: "first_invoice", invoice_num: "2" } }); await noWelcome("a renewal", s, () => { if (activity("payment_welcome_not_sent").length) fail("a renewal ran the welcome"); }); }
  await noWelcome("a client past the payment stage", () => { db.clients[0].client_portal_stage = "stage_5_monthly"; });
  { const s = () => { db.clients[0].client_portal_stage = "stage_5_monthly"; }; s.type = "customer.subscription.updated"; s.obj = { id: "sub_1", status: "active", metadata: { client_id: CID }, customer: "cus" }; await noWelcome("a subscription update on an old client", s); }
}
// a connection row whose key was cleared is not connected
{
  reset(); db.client_google_oauth.push({ client_id: CID, refresh_token: null });
  await deliver("payment_intent.succeeded", pi());
  if (welcomes() !== 1) fail("a cleared Google connection still counted as connected, so the welcome didn't go");
}

// ── 4 · a failed send ───────────────────────────────────────────────────────────────────────────
{
  reset(); gmailStatus = 500;
  const r = await deliver("payment_intent.succeeded", pi({ id: "pi_fail" }));
  if (r.statusCode !== 200) fail(`a failed send failed the webhook (${r.statusCode})`);
  if (db.clients[0].client_portal_stage !== "stage_3_setup") fail("a failed send undid the payment's stage move");
  if (pw()) fail("a failed send is recorded as sent");
  if (activity("payment_welcome_failed").length !== 1) fail("a failed send leaves nothing on the client's record");
  if (LOCK().length) fail("a failed send kept the lock, so it can never go");
  gmailStatus = 200; db.clients[0].client_portal_stage = "stage_2_payment";
  await deliver("payment_intent.succeeded", pi({ id: "pi_fail2" }));
  if (welcomes() !== 1) fail("after a failed send, the next try didn't send");
  // the record write fails: it went, so the lock stays and it says so
  reset();
  const orig = globalThis.fetch;
  globalThis.fetch = async (u, init = {}) => (String(u).includes("client_onboarding_records") && init.method === "PATCH" ? res(500, { message: "down" }) : orig(u, init));
  await deliver("payment_intent.succeeded", pi({ id: "pi_rec" }));
  globalThis.fetch = orig;
  if (welcomes() !== 1) fail("the record failing stopped the send path");
  if (activity("payment_welcome_unrecorded").length !== 1) fail("an email that went but didn't save says nothing on the record");
  if (LOCK().length !== 1) fail("an email that went but didn't save gave the lock back, so it could go twice");
  // the write answers OK but the read-back doesn't show it: never "recorded"
  reset();
  const o1 = globalThis.fetch;
  globalThis.fetch = async (u, init = {}) => (String(u).includes("client_onboarding_records") && init.method === "PATCH" ? res(200, []) : o1(u, init));
  await deliver("payment_intent.succeeded", pi({ id: "pi_silent" }));
  globalThis.fetch = o1;
  if (activity("payment_welcome_unrecorded").length !== 1 || activity("stage_notification_sent").length) fail("a write the read-back doesn't show still counts as recorded");
  // the client row can't be read inside the welcome: the throw stops there, the webhook still answers 200
  reset();
  const o2 = globalThis.fetch;
  let seen = 0;
  globalThis.fetch = async (u, init = {}) => { if (String(u).includes("/clients?id=eq.") && String(u).includes("select=*")) { seen++; return res(500, { message: "down" }); } return o2(u, init); };
  const r3 = await deliver("payment_intent.succeeded", pi({ id: "pi_throw" }));
  globalThis.fetch = o2;
  if (!seen) fail("the welcome's own read never ran, so this case proves nothing");
  if (r3.statusCode !== 200) fail(`a failure inside the welcome reached the webhook's answer (${r3.statusCode})`);
}

// ── 5 · reminders on: the email names it and the record holds the date ─────────────────────────
{
  reset(); process.env.STEP_REMINDERS_EMAIL = "on";
  await deliver("payment_intent.succeeded", pi({ id: "pi_rem" }));
  delete process.env.STEP_REMINDERS_EMAIL;
  const mail = mails.find((m) => m.includes(SUBJECT)) || "";
  const stored = pw() && pw().reminder_on;
  if (!/If it isn't connected by [A-Z][a-z]+day, [A-Z][a-z]{2} \d{1,2}, we'll send you one reminder\./.test(mail)) fail("with reminders on, the email doesn't name its reminder date");
  if (!stored) fail("with reminders on, the reminder date isn't on the record, so nothing can keep the promise");
}

// ── 6 · the wiring ──────────────────────────────────────────────────────────────────────────────
{
  const code = (s) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
  const wh = code(read("netlify/functions/stripe-webhook.js"));
  const pia = wh.slice(wh.indexOf("async function grantFromPaymentIntent"), wh.indexOf("async function upsertSubscription"));
  if (!/client\.client_portal_stage === "stage_2_payment"\) await paymentWelcome\(clientId, pi\.livemode\)/.test(pia)) fail("the inline payment path doesn't call the welcome on the first payment only");
  if (pia.indexOf("await paymentWelcome") < pia.indexOf("send-invoice-email")) fail("the welcome runs before the receipt, so a slow send could cost the receipt");
  const fnw = wh.slice(wh.indexOf("async function paymentWelcome"));
  if (!/try \{ await require\("\.\/_payment-welcome"\)\.sendOnce/.test(fnw) || !/suppress: process\.env\.RGA_SUPPRESS_CLIENT_EMAIL === "1"/.test(fnw)) fail("the webhook's call isn't wrapped in a try, or doesn't forward suppression");
  const rp = code(read("netlify/functions/admin-record-payment.js"));
  if (!/if \(advanced\) \{\s*try \{ await require\("\.\/_payment-welcome"\)\.sendOnce/.test(rp)) fail("a payment recorded by hand doesn't get the welcome, or a failure could fail the recording");
  const ns = code(read("netlify/functions/notify-step-open.js"));
  const remBlock = ns.slice(ns.indexOf("if (REM.enabled()) {"), ns.indexOf("const nud = await nudgesFor(client, tasks)"));
  if (!/PW\.connectReminderDue\(data, today\)/.test(remBlock)) fail("nothing sends the reminder the email promises");
  if (!/client_google_oauth/.test(remBlock)) fail("the promised reminder doesn't check Google is still not connected");
  if (!/reminder_sent_at/.test(remBlock)) fail("the promised reminder isn't stamped first");
  const pwsrc = code(read("netlify/functions/_payment-welcome.js"));
  if (/\b(Nov|Friday), ?\d|Friday, Nov/.test(pwsrc)) fail("a date is typed into the welcome");
}

globalThis.fetch = realFetch;
if (F.length) { console.error(`🔴 the payment welcome regressed (${F.length}):`); for (const m of F) console.error(`  - ${m}`); process.exit(1); }
console.log("✅ the payment welcome: exact words, reminder line only when on with a computed date, once per client, never for a test client or when suppressed, nothing when Google is connected, a failed send never fails the webhook");
process.exit(0);
