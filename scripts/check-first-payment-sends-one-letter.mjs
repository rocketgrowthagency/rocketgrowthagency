#!/usr/bin/env node
// check-first-payment-sends-one-letter.mjs — the first payment sends ONE letter, with the receipt under it (master plans-and-emails decision 5, approved 11-11).
// 🔴 WHY: the minute a client paid, three emails went: the stage email C6 ("Payment received, connect Google next"), the welcome C7 ("You're set") and the receipt C8.
// C6 and C7 asked for the same thing in different words, and C8 was a second email format. Now the receipt for invoice #1 IS the letter: payment received, the
// one next step (connect Google) and the receipt document under it.
// RUNS the real stripe-webhook handler, the real send-invoice-email and the real notify-client-stage on a fake database and a fake Gmail (any other address
// throws, so nothing leaves this machine), and counts the emails a client receives.
// HOLDS: every first-payment path (the inline payment, the Checkout session, the subscription, a payment recorded by hand) sends exactly ONE email · it has the
//   payment, the connect link, the receipt document (invoice number and amount) and no em dash · Google already connected, or a connection that can't be read
//   → still ONE email, the plain receipt, never a next step we can't stand behind · the reminder date is recorded only when reminders are on, and it is the date
//   the letter names · a redelivered event sends nothing more · a renewal sends only its receipt · suppression sends nothing · a beta client is never told
//   "payment received" · and statically: no producer of the old second and third email is left.
// SELF-PROOF: the counter is run on a world that sends two emails and must see two.
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const IND = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { IND(`cannot read ${r}`); } };
const code = (s) => String(s).replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).map((l) => l.replace(/\s\/\/\s.*$/, "")).join("\n");
const F = [], fail = (m) => F.push(m);
const CID = "11111111-1111-4111-8111-111111111111", WS = "22222222-2222-4222-8222-222222222222", CONTRACT = "33333333-3333-4333-8333-333333333333";

// ── the fake world ──
let db, mails, calls, routed;
const reset = ({ client = {}, tier = "founding", connected = false } = {}) => {
  db = { clients: [{ id: CID, workspace_id: WS, business_name: "Acme Plumbing", primary_contact_name: "Pat Lee", primary_contact_email: "pat@acme.test", primary_market: "Austin, TX", client_portal_stage: "stage_2_payment", source: null, ...client }],
    client_onboarding_records: [{ id: "r1", client_id: CID, workspace_id: WS, data: { tasks: {} } }],
    client_google_oauth: connected === "unreadable" ? [] : connected ? [{ client_id: CID, refresh_token: "enc:v1:x" }] : [],
    stripe_webhook_events: [], client_activity: [], client_invoices: [], client_subscriptions: [],
    client_contracts: [{ id: CONTRACT, client_id: CID, status: "signed", tier, signed_at: "2026-11-01T00:00:00Z", audit_log: [{ event: "generated_and_sent", addons: tier === "founding" ? { founding: true } : {} }] }],
    rga_google_credentials: [{ workspace_id: WS, refresh_token: "rt", google_email: "hello@rocketgrowthagency.com", scopes: "gmail.send" }] };
  mails = []; calls = []; routed = { unreadable: connected === "unreadable" };
};
const res = (status, body) => new Response(body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
let SIE, NCS;   // the real handlers, reached the way the deployed site reaches them: by their address
globalThis.fetch = async (u, init = {}) => {
  u = String(u); calls.push(u);
  const method = init.method || "GET";
  if (u.startsWith("https://oauth2.googleapis.com/token")) return res(200, { access_token: "tok", expires_in: 3600 });
  if (u.startsWith("https://gmail.googleapis.com/")) {
    const raw = Buffer.from(JSON.parse(init.body).raw, "base64url").toString("utf8");
    // the email a client reads: each part of the multipart, decoded whether it is sent base64 (the letter sender) or as-is (the billing sender)
    const bodyOf = raw.split("\r\n\r\n").slice(1).join("\r\n\r\n");
    const parts = bodyOf.split(/--rga_[a-z0-9_]+(?:--)?\r\n/i).map((chunk) => { const [h, ...rest] = chunk.split("\r\n\r\n"); const b = rest.join("\r\n\r\n").replace(/\r\n$/, "");
      return /base64/i.test(h) ? Buffer.from(b.replace(/\s/g, ""), "base64").toString("utf8") : b; }).filter((x) => x.trim());
    const html = parts.find((x) => /<html|<body|<p /i.test(x)) || "";
    mails.push({ headers: raw.split("\r\n\r\n")[0], subject: (raw.match(/^Subject: (.*)$/m) || [])[1] || "", text: parts.find((x) => x !== html) || "", html });
    return res(200, { id: `g${mails.length}`, threadId: "t" });
  }
  const fnm = u.match(/\/\.netlify\/functions\/([a-z-]+)$/);
  if (fnm) {
    const h = fnm[1] === "send-invoice-email" ? SIE : fnm[1] === "notify-client-stage" ? NCS : null;
    if (!h) return res(200, { ok: true });
    const out = await h.handler({ httpMethod: "POST", headers: { ...(init.headers || {}) }, body: init.body });
    return res(out.statusCode, out.body);
  }
  const m = u.match(/^https:\/\/supa\.test\/rest\/v1\/([a-z_]+)(?:\?(.*))?$/);
  if (!m) throw new Error(`the gate's fake world has no ${u}: nothing leaves this machine`);
  const [, table, q = ""] = m, rows = db[table];
  if (!rows) return res(404, { message: `no table ${table}` });
  const params = new URLSearchParams(q), match = (r) => [...params.entries()].every(([k, v]) => ["select", "limit", "order"].includes(k) ? true : v === "not.is.null" ? r[k] != null : v.startsWith("eq.") ? String(r[k]) === decodeURIComponent(v.slice(3)) : true);
  if (table === "client_google_oauth" && routed.unreadable) return res(500, { message: "down" });
  if (method === "GET") return res(200, rows.filter(match));
  if (method === "POST") { const row = JSON.parse(init.body); if (table === "stripe_webhook_events" && rows.some((r) => r.stripe_event_id === row.stripe_event_id)) return res(409, { message: "duplicate" }); rows.push(row); return res(201, [row]); }
  if (method === "PATCH") { for (const r of rows.filter(match)) Object.assign(r, JSON.parse(init.body)); return res(200, rows.filter(match)); }
  if (method === "DELETE") { db[table] = rows.filter((r) => !match(r)); return res(204); }
  return res(405, {});
};
Object.assign(process.env, { SUPABASE_URL: "https://supa.test", SUPABASE_SERVICE_ROLE_KEY: "k", STRIPE_WEBHOOK_SECRET: "whsec_t", STRIPE_SECRET_KEY: "sk", INTERNAL_FN_SECRET: "s", URL: "https://site.test", GOOGLE_CLIENT_ID: "x", GOOGLE_CLIENT_SECRET: "y", RGA_GOOGLE_CLIENT_ID: "x", RGA_GOOGLE_CLIENT_SECRET: "y", GOOGLE_OAUTH_CLIENT_ID: "x", GOOGLE_OAUTH_CLIENT_SECRET: "y" });
for (const k of ["RGA_SUPPRESS_CLIENT_EMAIL", "STEP_REMINDERS_EMAIL", "STRIPE_TEST_CLIENT_IDS", "STRIPE_WEBHOOK_SECRET_TEST"]) delete process.env[k];
process.removeAllListeners("warning");
const req = createRequire(`${SITE}/netlify/functions/x.js`);
let WH, ARP, PW;
// admin-record-payment is a signed-in admin's press: the gate stands in for the admin's sign-in (this one function only; the rest keep the real internal-secret check)
try { const AUTH = req("./_auth.js"); AUTH.requireWorkspaceForClient = async () => ({ ok: true, workspaceId: WS }); WH = req("./stripe-webhook.js"); SIE = req("./send-invoice-email.js"); NCS = req("./notify-client-stage.js"); ARP = req("./admin-record-payment.js"); PW = req("./_payment-welcome.js"); }
catch (e) { IND(`a first-payment module did not load: ${e.message}`); }
if (typeof NCS.messageFor !== "function" || typeof SIE.buildEmail !== "function" || typeof PW.firstPaymentNextStep !== "function") IND("a builder this gate renders is no longer exported");
const quiet = async (fn) => { const k = ["log", "warn", "error"], old = k.map((x) => console[x]); k.forEach((x) => { console[x] = () => {}; }); try { return await fn(); } finally { k.forEach((x, i) => { console[x] = old[i]; }); } };
let nEvt = 0;
const deliver = async (type, object, opts = {}) => {
  const id = opts.id || `evt_${++nEvt}`, payload = JSON.stringify({ id, type, livemode: true, data: { object } }), t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac("sha256", "whsec_t").update(`${t}.${payload}`).digest("hex");
  return quiet(() => WH.handler({ httpMethod: "POST", headers: { "stripe-signature": `t=${t},v1=${sig}` }, body: payload }));
};
const pi = (x = {}) => ({ id: "pi_1", amount_received: 62500, amount: 62500, payment_method: "pm_1", customer: "cus_1", metadata: { client_id: CID, kind: "first_invoice", invoice_num: "1" }, ...x });
const rec = () => db.client_onboarding_records[0].data;
const dash = /—/;

// ── 0 · the counter proves itself ──
{ reset(); mails.push({}, {}); if (mails.length !== 2) IND("the counter can't count two emails"); }

// ── 1 · every path sends ONE ──
const LETTER = (mail, label) => {
  const all = `${mail.subject}\n${mail.text}\n${mail.html}`;
  if (!/Payment received/i.test(mail.subject)) fail(`${label}: the subject doesn't say payment received ("${mail.subject}")`);
  if (!/Connect your Google accounts/.test(mail.html) || !/portal\//.test(mail.html)) fail(`${label}: the letter has no connect-Google step`);
  if (!/RGA-[A-Z0-9]+-\d+/i.test(`${mail.text}${mail.html}`) && !/Invoice\s+[A-Z0-9-]+/i.test(mail.text)) fail(`${label}: the receipt document isn't under the letter (no invoice number)`);
  if (!/\$625/.test(mail.text)) fail(`${label}: the receipt amount isn't in the plain twin`);
  if (!/no access to your website/i.test(mail.text)) fail(`${label}: the letter lost the truth about Google access (it gives no access to the website)`);
  if (dash.test(all)) fail(`${label}: an em dash in the letter`);
  if (/Receipt for invoice/.test(mail.text.split("\n")[0]) && !/Payment received/i.test(mail.subject)) fail(`${label}: a plain receipt went where the first-payment letter belongs`);
};
{
  reset();
  const r = await deliver("payment_intent.succeeded", pi(), { id: "evt_a" });
  if (r.statusCode !== 200) fail(`the webhook answered ${r.statusCode} on a first payment`);
  if (mails.length !== 1) fail(`the inline first payment sent ${mails.length} emails (it must be ONE)`);
  else LETTER(mails[0], "the inline first payment");
  if (db.clients[0].client_portal_stage !== "stage_3_setup") fail("the first payment no longer moves the client to Setup");
  await deliver("payment_intent.succeeded", pi(), { id: "evt_a" });
  if (mails.length !== 1) fail("a redelivered event sent another email");
  db.clients[0].client_portal_stage = "stage_2_payment";
  await deliver("payment_intent.succeeded", pi({ id: "pi_dup" }), { id: "evt_b" });
  if (mails.length !== 1) fail(`a second event for the same payment sent ${mails.length - 1} more email(s)`);
}
{
  reset();
  await deliver("checkout.session.completed", { id: "cs_1", status: "complete", mode: "payment", payment_status: "paid", metadata: { client_id: CID, kind: "first_invoice", invoice_num: "1", invoice_id: "" }, customer: "cus" });
  if (mails.length > 1) fail(`the Checkout path sent ${mails.length} emails on a first payment`);
}
{
  reset();
  await deliver("customer.subscription.created", { id: "sub_1", status: "active", metadata: { client_id: CID }, customer: "cus", items: { data: [{ price: { unit_amount: 62500 } }] }, current_period_end: Math.floor(Date.now() / 1000) + 2592000 });
  if (mails.length > 1) fail(`the subscription path sent ${mails.length} emails on a first payment`);
}
{
  // a payment recorded by hand (admin-record-payment): the same ONE letter
  reset();
  const orig = globalThis.fetch;
  const r = await quiet(() => ARP.handler({ httpMethod: "POST", headers: { "x-internal-secret": "s" }, body: JSON.stringify({ client_id: CID, method: "check", note: "gate" }) }));
  if (r.statusCode !== 200) fail(`recording a payment by hand answered ${r.statusCode}`);
  if (mails.length !== 1) fail(`a payment recorded by hand sent ${mails.length} emails (it must be ONE)`);
  else LETTER(mails[0], "a payment recorded by hand");
  globalThis.fetch = orig;
  void r;
}

// ── 2 · Google already connected, or unreadable: still one email, the plain receipt ──
for (const connected of [true, "unreadable"]) {
  reset({ connected });
  await deliver("payment_intent.succeeded", pi(), { id: `evt_c${connected}` });
  if (mails.length !== 1) { fail(`Google ${connected === true ? "connected" : "unreadable"}: ${mails.length} emails went (it must be ONE, the plain receipt)`); continue; }
  if (/Connect your Google accounts|connect Google next/i.test(`${mails[0].subject}${mails[0].text}`)) fail(`Google ${connected === true ? "connected" : "unreadable"}: the receipt still sends the client to connect Google`);
  if (!/Receipt for invoice/.test(mails[0].subject)) fail(`Google ${connected === true ? "connected" : "unreadable"}: the plain receipt's subject is "${mails[0].subject}"`);
}

// ── 3 · the reminder the letter names is recorded, and only when reminders are on ──
{
  reset(); await deliver("payment_intent.succeeded", pi(), { id: "evt_r0" });
  const w = (rec().stage_notifications || {}).payment_welcome;
  if (!w || !w.sent_at) fail("the letter isn't recorded on the client's record (the connect-Google reminder is swept from it)");
  else if (w.reminder_on) fail("reminders are off and the letter recorded a reminder date");
  if (mails[0] && /we'll send you one reminder/.test(mails[0].text)) fail("reminders are off and the letter promises one");
  process.env.STEP_REMINDERS_EMAIL = "on";
  reset(); await deliver("payment_intent.succeeded", pi(), { id: "evt_r1" });
  delete process.env.STEP_REMINDERS_EMAIL;
  const w2 = (rec().stage_notifications || {}).payment_welcome, m = mails[0];
  if (!w2 || !/^\d{4}-\d{2}-\d{2}$/.test(String(w2.reminder_on))) fail("reminders on: no reminder date recorded");
  else if (m) {
    const named = (m.text.match(/connected by ([A-Za-z]+, [A-Za-z]+ \d+)/) || [])[1];
    if (!named) fail("reminders on: the letter doesn't name the date it will remind them");
    else { const d = new Date(`${w2.reminder_on}T12:00:00Z`); const words = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }).format(d); if (named !== words) fail(`the letter names ${named} and the record says ${words}`); }
  }
}

// ── 4 · a renewal, suppression, a beta client ──
{
  reset();
  db.client_invoices.push({ id: "i2", client_id: CID, invoice_num: 2, amount: 625, status: "upcoming", due_date: "2026-12-01", created_at: "2026-11-01T00:00:00Z" });
  await deliver("payment_intent.succeeded", pi({ id: "pi_2", metadata: { client_id: CID, kind: "renewal", invoice_num: "2", invoice_id: "i2" } }), { id: "evt_ren" });
  if (mails.some((x) => /connect Google next/i.test(x.subject))) fail("a renewal sent the first-payment letter");
  reset(); process.env.RGA_SUPPRESS_CLIENT_EMAIL = "1";
  await deliver("payment_intent.succeeded", pi(), { id: "evt_sup" });
  delete process.env.RGA_SUPPRESS_CLIENT_EMAIL;
  if (mails.length) fail(`suppression is on and ${mails.length} email(s) went`);
  const beta = NCS.messageFor("stage_3_setup", { first: "Pat", beta: true });
  if (!beta || /payment received/i.test(`${beta.subject}${beta.body}`)) fail("a BETA client's start email is missing or tells them their payment was received");
  if (dash.test(`${beta && beta.subject}${beta && beta.body}`)) fail("the beta start email has an em dash");
}
{
  reset({ tier: "beta_unbilled" }); db.clients[0].client_portal_stage = "stage_2_payment";
  const r = await quiet(() => SIE.handler({ httpMethod: "POST", headers: { "x-internal-secret": "s" }, body: JSON.stringify({ client_id: CID, invoice_num: 1, kind: "receipt" }) }));
  if (mails.length) fail("a beta client was sent a receipt");
  void r;
}

// ── 5 · the paying client's stage email is retired, and nothing else sends beside the letter ──
if (NCS.messageFor("stage_3_setup", { first: "Pat", beta: false, amount: 625 }) !== null) fail("the paying client's stage-3 email (C6) is back: three emails at first payment again");
{
  const wh = code(read("netlify/functions/stripe-webhook.js")), arp = code(read("netlify/functions/admin-record-payment.js")), pw = code(read("netlify/functions/_payment-welcome.js"));
  for (const [name, src] of [["stripe-webhook.js", wh], ["admin-record-payment.js", arp]]) {
    if (/paymentWelcome\(|\.sendOnce\(|_payment-welcome"\)\.sendOnce/.test(src)) fail(`${name} still sends the separate payment welcome`);
  }
  if (/sendAsRga|users\/me\/messages\/send|gmail\.googleapis/.test(pw)) fail("_payment-welcome.js sends mail again: it should only supply the letter's next-step block");
  if ((wh.match(/send-invoice-email/g) || []).length < 1) fail("the webhook no longer sends the first-payment letter (the receipt)");
  if (/queueOnce|sendOnce|buildWelcome/.test(pw)) fail("_payment-welcome.js still builds a second email (buildWelcome / sendOnce)");
}

if (F.length) { console.error(`🔴 the first payment doesn't send exactly one letter (${F.length}):`); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ the first payment sends ONE letter with the receipt under it, on every path; connected/unreadable Google = the plain receipt; reminder recorded only when named; renewal, suppression and beta are right");
