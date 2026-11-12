#!/usr/bin/env node
// check-a-paid-invoice-always-settles.mjs — EVERY WAY A CLIENT CAN PAY ENDS WITH THAT INVOICE PAID (master audit #9, 11-11).
//
// 🔴 WHY. An overdue invoice paid through Checkout never settled: portal-invoice-pay and billing-daily-check put the invoice's id on
// the SESSION only, so payment_intent.succeeded carried no kind and was ignored, and checkout.session.completed only ever wrote
// invoices #1 and #2 when missing. The ladder then paused the client on day 18 and ended the agreement on day 30, though they had
// paid. The reconciler filed that charge as "unattributed", an info line, so nothing turned red. And the webhook wrote its event
// row BEFORE processing: a first processing that failed was retried by Stripe, hit the 409, and was dropped for good.
//
// RUNS the real stripe-webhook, billing-daily-check (its one settleInvoice), portal-invoice-pay and stripe-reconcile-payments on a
// fake database, a fake Stripe and a fake Gmail (scripts/lib/billing-world.mjs): nothing can charge, refund or email for real.
// Holds, for each payment path, that the invoice it names is PAID, the next one opens once, the late status is lifted and a
// receipt is asked for:
//   1 · Checkout of an overdue invoice: the payment event alone, the session event alone, both (no twin next invoice), a bank
//       payment that waits (processing, then async success), an older session with the names on the session only
//   2 · the auto-charge: settles itself, is labelled "renewal", and an older "first_invoice" #2 still settles through the webhook
//   3 · the event ledger: received → processed; a failed first try is retried and processed; a processed event is a no-op;
//       a delivery still in flight answers 409
//   4 · refund, dispute, failed and processing payments are recorded, change the right state and reach Messages
//   5 · the reconciler: a paid charge tied to no client is RED; one named only on its session reconciles; a refunded one with a
//       void invoice reconciles
//   6 · portal-invoice-pay: the new session carries the names on the payment; an expired saved link is replaced
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs";
import { makeWorld, setEnv, deliver, quiet, seedClient, addInvoice, CID, WS, SECRET } from "./lib/billing-world.mjs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
for (const f of ["netlify/functions/stripe-webhook.js", "netlify/functions/billing-daily-check.js", "netlify/functions/portal-invoice-pay.js", "netlify/functions/stripe-reconcile-payments.js", "shared/billing-rules.js"]) {
  if (!fs.existsSync(`${SITE}/${f}`)) { console.error(`⚠️  INDETERMINATE: ${f} is missing`); process.exit(2); }
}
const F = [], fail = (m) => F.push(m);
setEnv();
const W = makeWorld(SITE);
let WH, BDC, PAY, REC, R;
try {
  WH = W.require("netlify/functions/stripe-webhook.js");
  BDC = W.require("netlify/functions/billing-daily-check.js");
  PAY = W.require("netlify/functions/portal-invoice-pay.js");
  REC = W.require("netlify/functions/stripe-reconcile-payments.js");
  R = W.require("shared/billing-rules.js");
} catch (e) { console.error(`⚠️  INDETERMINATE: a billing function doesn't load: ${e.message}`); process.exit(2); }
if (typeof BDC.settleInvoice !== "function") { console.error("⚠️  INDETERMINATE: billing-daily-check exports no settleInvoice: the one settle moved"); process.exit(2); }

const today = R.businessYmd(new Date());
const inv = (n) => W.db.client_invoices.find((i) => i.invoice_num === n);
const invs = (n) => W.db.client_invoices.filter((i) => i.invoice_num === n);
const client = () => W.db.clients[0];
const acts = (kind) => W.db.client_activity.filter((a) => a.kind === kind);
const alerts = (k) => W.db.client_activity.filter((a) => a.kind === "rga_alert" && a.payload && a.payload.needs_human === true && (!k || a.payload.kind === k));
const receipts = (n) => W.fns.filter((c) => c.name === "send-invoice-email" && c.body.kind === "receipt" && Number(c.body.invoice_num) === n);
const evRow = (id) => W.db.stripe_webhook_events.find((e) => e.stripe_event_id === id);
const late = (billing = "paused", days = 22) => { W.reset(); seedClient(W, { billing }); addInvoice(W, { num: 1, due: R.addDays(today, -60), status: "paid", paidAt: new Date(Date.now() - 60 * 86400000).toISOString() });
  addInvoice(W, { num: 2, due: R.addDays(today, -30), status: "paid", paidAt: new Date(Date.now() - 30 * 86400000).toISOString() });
  return addInvoice(W, { num: 3, due: R.addDays(today, -days), status: "overdue" }); };
const settled = (label, n = 3) => {
  const i = inv(n);
  if (!i || i.status !== "paid") fail(`${label}: invoice #${n} is "${i && i.status}", not paid`);
  else if (!i.paid_at) fail(`${label}: invoice #${n} is paid with no paid_at`);
  if (invs(n + 1).length !== 1) fail(`${label}: ${invs(n + 1).length} copies of the next invoice #${n + 1} (want exactly 1)`);
  if (client().billing_status !== "active") fail(`${label}: the client is still "${client().billing_status}" after paying`);
  if (!receipts(n).length) fail(`${label}: no receipt was asked for invoice #${n}`);
};
const piObj = (x = {}) => ({ id: "pi_chk", amount: 62500, amount_received: 62500, status: "succeeded", livemode: false, ...x });

// ── 1 · Checkout of an overdue invoice ──────────────────────────────────────────────────────────────────────────────────────
{
  // the payment event alone (the names now ride on the PaymentIntent)
  const i3 = late();
  let r = await deliver(WH, "payment_intent.succeeded", piObj({ metadata: { kind: "invoice", client_id: CID, invoice_id: i3.id, invoice_num: "3" } }));
  if (r.statusCode !== 200) fail(`Checkout payment event: the webhook answered ${r.statusCode}`);
  settled("Checkout, payment event");
  if (inv(3).stripe_payment_intent_id !== "pi_chk") fail("Checkout, payment event: the invoice doesn't record which payment paid it");
  if (!acts("billing_status_changed").some((a) => a.payload.from === "paused" && a.payload.to === "active")) fail("Checkout, payment event: lifting the pause left no record");

  // the session event alone
  const j3 = late();
  r = await deliver(WH, "checkout.session.completed", { id: "cs_1", payment_status: "paid", payment_intent: "pi_s1", livemode: false, metadata: { kind: "invoice", client_id: CID, invoice_id: j3.id, invoice_num: "3" } });
  if (r.statusCode !== 200) fail(`Checkout session event: the webhook answered ${r.statusCode}`);
  settled("Checkout, session event");
  if (W.db.client_subscriptions.some((s) => s.stripe_subscription_id === "cs_1")) fail("Checkout session event: an invoice payment wrote a fake subscription row");

  // both events for the one payment: still one next invoice, the invoice paid once
  const k3 = late();
  const names = { kind: "invoice", client_id: CID, invoice_id: k3.id, invoice_num: "3" };
  await Promise.all([
    deliver(WH, "payment_intent.succeeded", piObj({ id: "pi_both", metadata: names })),
    deliver(WH, "checkout.session.completed", { id: "cs_both", payment_status: "paid", payment_intent: "pi_both", livemode: false, metadata: names }),
  ]);
  settled("Checkout, both events at once");

  // an OLDER session: the names on the session only (no kind), as every saved link before 11-11 was made
  const o3 = late("warning", 16);
  await deliver(WH, "checkout.session.completed", { id: "cs_old", payment_status: "paid", payment_intent: "pi_old", livemode: false, metadata: { client_id: CID, invoice_id: o3.id, invoice_num: "3" } });
  settled("an older session with the names on the session only");

  // a bank payment: unpaid at completion → processing; then the async success settles it
  const b3 = late("overdue", 10);
  await deliver(WH, "checkout.session.completed", { id: "cs_bank", payment_status: "unpaid", payment_intent: "pi_bank", livemode: false, metadata: { kind: "invoice", client_id: CID, invoice_id: b3.id, invoice_num: "3" } });
  if (inv(3).status === "paid") fail("a bank payment still on its way was marked paid");
  if (!acts("payment_processing").length) fail("a bank payment on its way left no record");
  await deliver(WH, "checkout.session.async_payment_succeeded", { id: "cs_bank", payment_status: "paid", payment_intent: "pi_bank", livemode: false, metadata: { kind: "invoice", client_id: CID, invoice_id: b3.id, invoice_num: "3" } });
  settled("a bank payment, after it cleared");

  // invoice #1 paid through Checkout while the client still waits at the payment stage: settled AND moved on
  W.reset(); seedClient(W, { stage: "stage_2_payment", billing: "overdue", card: false });
  const f1 = addInvoice(W, { num: 1, due: R.addDays(today, -9), status: "overdue", amount: 1250 });
  await deliver(WH, "payment_intent.succeeded", piObj({ id: "pi_f1", metadata: { kind: "invoice", client_id: CID, invoice_id: f1.id, invoice_num: "1" } }));
  settled("invoice #1 through Checkout", 1);
  if (client().client_portal_stage !== "stage_3_setup") fail(`invoice #1 through Checkout: the client stayed at ${client().client_portal_stage}`);

  // a paid invoice on an account CLOSED for non-payment stays closed, and RGA is told
  const t3 = late("terminated", 35);
  await deliver(WH, "payment_intent.succeeded", piObj({ id: "pi_t", metadata: { kind: "invoice", client_id: CID, invoice_id: t3.id, invoice_num: "3" } }));
  if (inv(3).status !== "paid") fail("a payment on a closed account wasn't recorded");
  if (client().billing_status !== "terminated") fail("a payment reopened a closed account by itself (RGA decides that)");
  if (!alerts("payment_after_close").length) fail("a payment on an account closed for non-payment reached nobody");

  // a payment naming an invoice that isn't in the ledger: loud (a Messages alert), never a silent return
  late();
  const r2 = await deliver(WH, "payment_intent.succeeded", piObj({ id: "pi_ghost", metadata: { kind: "invoice", client_id: CID, invoice_num: "9" } }));
  if (r2.statusCode !== 200) fail(`a payment naming a missing invoice: the webhook answered ${r2.statusCode}`);
  if (!alerts("payment_unmatched").length) fail("a payment that matched no invoice reached nobody");
}

// ── 2 · the auto-charge ─────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const run = () => quiet(() => BDC.handler({ httpMethod: "POST", headers: { "x-internal-secret": SECRET }, body: "{}" }));
  W.reset(); seedClient(W, { tier: "commit_3mo" });
  addInvoice(W, { num: 1, due: R.addDays(today, -31), status: "paid", paidAt: new Date(Date.now() - 31 * 86400000).toISOString() });
  addInvoice(W, { num: 2, due: R.addDays(today, -1), status: "due" });
  W.stripeHandler = async (method, path, params) => (method === "POST" && path === "/v1/payment_intents" ? [200, { id: "pi_auto", status: "succeeded", amount: 62500 }] : [404, { error: { message: "no" } }]);
  const res1 = await run();
  if (res1.statusCode !== 200) fail(`the daily run answered ${res1.statusCode}`);
  const charge = W.stripe.find((c) => c.path === "/v1/payment_intents");
  if (!charge) fail("the auto-charge never charged an invoice due yesterday (day 0 missed: on or after)");
  else {
    if (charge.params.get("metadata[kind]") !== "renewal") fail(`a renewal charge is labelled "${charge.params.get("metadata[kind]")}", not renewal`);
    if (charge.params.get("metadata[invoice_id]") !== "inv-2" || charge.params.get("metadata[invoice_num]") !== "2") fail("the auto-charge doesn't name the invoice it charges");
    if (!/^autocharge_inv-2_d0$/.test(String(charge.headers["idempotency-key"] || ""))) fail(`the charge isn't keyed per attempt: ${charge.headers["idempotency-key"]}`);
  }
  settled("the auto-charge", 2);
  // the webhook's echo of the same charge changes nothing more
  await deliver(WH, "payment_intent.succeeded", piObj({ id: "pi_auto", metadata: { kind: "renewal", client_id: CID, invoice_id: "inv-2", invoice_num: "2", auto: "1" } }));
  if (invs(3).length !== 1) fail("the webhook's echo of an auto-charge opened a second invoice #3");
  // the run again the same day: no second charge
  const before = W.stripe.length;
  await run();
  if (W.stripe.filter((c) => c.path === "/v1/payment_intents").length !== 1 || W.stripe.length !== before) fail("a second run charged a paid invoice again");

  // an older charge still labelled first_invoice for #2 settles through the webhook (a crash between charge and settle)
  W.reset(); seedClient(W);
  addInvoice(W, { num: 1, due: R.addDays(today, -31), status: "paid", paidAt: new Date(Date.now() - 31 * 86400000).toISOString() });
  addInvoice(W, { num: 2, due: R.addDays(today, -1), status: "due" });
  await deliver(WH, "payment_intent.succeeded", piObj({ id: "pi_legacy", metadata: { kind: "first_invoice", client_id: CID, invoice_num: "2", auto: "1" } }));
  settled("an older first_invoice-labelled renewal, through the webhook", 2);
}

// ── 3 · the event ledger ────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const i3 = late();
  const ev = { id: "evt_retry" }, obj = piObj({ id: "pi_retry", metadata: { kind: "invoice", client_id: CID, invoice_id: i3.id, invoice_num: "3" } });
  W.failNext.push({ table: "client_invoices", method: "PATCH" });   // the first processing fails part way
  let r = await deliver(WH, "payment_intent.succeeded", obj, ev);
  if (r.statusCode !== 500) fail(`a processing failure answered ${r.statusCode}, so Stripe would not retry it`);
  const row = evRow("evt_retry");
  if (!row) fail("the event was not written to the ledger as received");
  else {
    if (row.processed !== false) fail("a failed event is marked processed");
    if (!row.processing_error) fail("a failed event carries no processing_error, so a lost event can't be found");
    row.received_at = new Date(Date.now() - 10 * 60000).toISOString();
  }
  r = await deliver(WH, "payment_intent.succeeded", obj, ev);   // Stripe's retry
  if (r.statusCode !== 200) fail(`Stripe's retry of a failed event answered ${r.statusCode}`);
  if (JSON.parse(r.body || "{}").deduped) fail("Stripe's retry of a FAILED event was treated as a duplicate: the event is lost");
  settled("an event whose first processing failed, after Stripe's retry");
  if (!evRow("evt_retry") || evRow("evt_retry").processed !== true || !evRow("evt_retry").processed_at) fail("a processed event isn't marked processed with a time");
  if (evRow("evt_retry") && evRow("evt_retry").processing_error) fail("a processed event still carries its old error");
  // a processed event delivered again is a no-op
  const n = W.db.client_invoices.length, rc = receipts(3).length;
  r = await deliver(WH, "payment_intent.succeeded", obj, ev);
  if (!JSON.parse(r.body || "{}").deduped || W.db.client_invoices.length !== n || receipts(3).length !== rc) fail("a processed event delivered again did work again");
  // a delivery that is still running: the copy answers 409 and does nothing
  W.db.stripe_webhook_events.push({ stripe_event_id: "evt_flight", type: "payment_intent.succeeded", processed: false, received_at: new Date().toISOString() });
  r = await deliver(WH, "payment_intent.succeeded", obj, { id: "evt_flight" });
  if (r.statusCode !== 409) fail(`a copy of an event still being processed answered ${r.statusCode} (want 409, so Stripe tries later)`);
  // every handled event ends processed
  const s3 = late();
  await deliver(WH, "payment_intent.succeeded", piObj({ id: "pi_ok", metadata: { kind: "invoice", client_id: CID, invoice_id: s3.id, invoice_num: "3" } }), { id: "evt_ok" });
  if (!evRow("evt_ok") || evRow("evt_ok").processed !== true) fail("a successfully handled event isn't marked processed");
}

// ── 4 · refunds, disputes, failed and processing payments ───────────────────────────────────────────────────────────────────
{
  late("active", 0);
  Object.assign(inv(3), { status: "paid", paid_at: new Date().toISOString(), stripe_payment_intent_id: "pi_paid" });
  await deliver(WH, "charge.refunded", { id: "ch_1", payment_intent: "pi_paid", amount: 62500, amount_refunded: 20000, refunded: false });
  if (inv(3).status !== "paid") fail("a partial refund changed the invoice from paid");
  if (!acts("payment_refunded").length || !alerts("payment_refunded").length) fail("a refund is not recorded or reaches nobody");
  await deliver(WH, "charge.refunded", { id: "ch_1", payment_intent: "pi_paid", amount: 62500, amount_refunded: 62500, refunded: true });
  if (inv(3).status !== "void") fail(`a full refund left the invoice "${inv(3).status}" (want void: nothing is owed for it)`);
  const sub = W.db.client_subscriptions[0];
  if (!sub.metadata.last_refund) fail("a refund isn't noted on the saved-payment record");
  await deliver(WH, "charge.dispute.created", { id: "dp_1", payment_intent: "pi_paid", charge: "ch_1", amount: 62500, reason: "fraudulent", evidence_details: { due_by: Math.floor(Date.now() / 1000) + 7 * 86400 } });
  if (!acts("payment_disputed").length || !alerts("payment_disputed").length) fail("a dispute is not recorded or reaches nobody");
  if (!sub.metadata.dispute) fail("a dispute isn't noted on the saved-payment record");
  if (!/Answer it in Stripe by/.test(String((alerts("payment_disputed")[0] || {}).payload?.summary))) fail("the dispute alert doesn't say when the answer is due");

  const p3 = late("overdue", 9);
  await deliver(WH, "payment_intent.payment_failed", { id: "pi_f", metadata: { kind: "invoice", client_id: CID, invoice_id: p3.id, invoice_num: "3" }, last_payment_error: { code: "card_declined", decline_code: "insufficient_funds" } });
  if (!acts("payment_attempt_failed").length) fail("a client's failed payment is not recorded as a Messages alert (a kind ending _failed)");
  if (inv(3).status === "paid") fail("a failed payment marked the invoice paid");
  if (!W.db.client_subscriptions[0].metadata.last_payment_failure) fail("a failed payment isn't noted on the saved-payment record");
  await deliver(WH, "payment_intent.payment_failed", { id: "pi_fa", metadata: { kind: "renewal", client_id: CID, invoice_id: p3.id, invoice_num: "3", auto: "1" }, last_payment_error: { code: "card_declined" } });
  if (acts("payment_attempt_failed").length !== 1 || !acts("payment_failure_recorded").length) fail("the auto-charge's own decline is alerted twice (billing-daily-check already records it)");

  const q3 = late("overdue", 12);
  await deliver(WH, "payment_intent.processing", { id: "pi_p", metadata: { kind: "invoice", client_id: CID, invoice_id: q3.id, invoice_num: "3" } });
  if (!acts("payment_processing").length || !alerts("payment_processing").length) fail("a processing payment is not recorded or reaches nobody");
  if (!W.db.client_subscriptions[0].metadata.processing) fail("a processing payment isn't noted on the saved-payment record");
  // the ladder holds while the money is on its way
  q3.due_date = R.addDays(today, -25); q3.status = "warning"; client().billing_status = "warning";
  W.db.client_onboarding_records[0].data.stage_notifications = { "billing_warning#inv3": { sent_at: new Date(Date.now() - 9 * 86400000).toISOString() } };
  const out = await quiet(() => BDC.handler({ httpMethod: "POST", headers: { "x-internal-secret": SECRET }, body: "{}" }));
  const res = JSON.parse(out.body || "{}").results || [];
  if (client().billing_status === "paused" || !res.some((x) => x.held === "payment_processing")) fail("the ladder paused a client whose bank payment is still processing");
}

// ── 5 · the reconciler ──────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const call = (body) => quiet(() => REC.handler({ httpMethod: "POST", headers: { "x-internal-secret": SECRET }, body: JSON.stringify(body) }));
  late("active", 0);
  Object.assign(inv(3), { status: "paid" });
  const r1 = JSON.parse((await call({ fixture: [{ id: "pi_x", status: "succeeded", amount: 62500, created: 1, metadata: {} }] })).body);
  if (r1.ok !== false || (r1.unattributed || []).length !== 1) fail("a paid charge tied to no client is not RED in the reconciler");
  const r2 = JSON.parse((await call({ fixture: [{ id: "pi_y", status: "succeeded", amount: 62500, created: 1, metadata: {} }], fixture_sessions: { pi_y: { metadata: { client_id: CID, invoice_id: "inv-3", invoice_num: "3" } } } })).body);
  if (r2.ok !== true || (r2.reconciled || []).length !== 1) fail("a charge named only on its Checkout session doesn't reconcile");
  inv(3).status = "void";
  const r3 = JSON.parse((await call({ fixture: [{ id: "pi_z", status: "succeeded", amount: 62500, created: 1, metadata: { client_id: CID, invoice_num: "3" }, latest_charge: { id: "ch_z", refunded: true, amount_refunded: 62500 } }] })).body);
  if (r3.ok !== true) fail("a fully refunded charge whose invoice is void doesn't reconcile");
  const r4 = JSON.parse((await call({ fixture: [{ id: "pi_w", status: "succeeded", amount: 62500, created: 1, metadata: { client_id: CID, invoice_num: "3" } }] })).body);
  if (r4.ok !== false || (r4.missing_from_ledger || []).length !== 1) fail("a charge whose invoice is void with no refund is not flagged");
}

// ── 6 · portal-invoice-pay ──────────────────────────────────────────────────────────────────────────────────────────────────
{
  const i3 = late("overdue", 9);
  const created = [];
  W.stripeHandler = async (method, path, params) => {
    if (method === "POST" && path === "/v1/checkout/sessions") { created.push(params); return [200, { id: `cs_new${created.length}`, url: `https://checkout.test/${created.length}`, status: "open" }]; }
    if (method === "GET" && path.startsWith("/v1/checkout/sessions/")) return [200, { id: path.split("/").pop(), status: path.endsWith("cs_open") ? "open" : "expired", url: "https://checkout.test/open" }];
    return [404, { error: { message: "no" } }];
  };
  const pay = () => quiet(() => PAY.handler({ httpMethod: "POST", headers: { authorization: "Bearer client-jwt" }, body: JSON.stringify({ invoice_id: i3.id }) }));
  let r = await pay();
  if (r.statusCode !== 200) fail(`Pay now answered ${r.statusCode}: ${String(r.body).slice(0, 120)}`);
  const p = created[0];
  if (!p) fail("Pay now made no Checkout session");
  else {
    if (p.get("payment_intent_data[metadata][invoice_id]") !== i3.id || p.get("payment_intent_data[metadata][kind]") !== "invoice") fail("the Checkout session doesn't put the invoice's name on the PAYMENT (payment_intent_data.metadata)");
    if (p.get("metadata[invoice_id]") !== i3.id) fail("the Checkout session lost the invoice's name on the session");
  }
  // an expired saved link is replaced; an open one is reused
  Object.assign(i3, { stripe_checkout_session_id: "cs_expired", stripe_checkout_url: "https://checkout.test/old" });
  r = await pay();
  if (JSON.parse(r.body || "{}").checkout_url === "https://checkout.test/old" || created.length !== 2) fail("Pay now handed out an expired Checkout link");
  Object.assign(i3, { stripe_checkout_session_id: "cs_open", stripe_checkout_url: "https://checkout.test/open" });
  r = await pay();
  if (JSON.parse(r.body || "{}").checkout_url !== "https://checkout.test/open" || created.length !== 2) fail("Pay now didn't reuse a Checkout link that is still open");
  // billing-daily-check's own Checkout link names the payment too
  const src = fs.readFileSync(`${SITE}/netlify/functions/billing-daily-check.js`, "utf8");
  if (!/payment_intent_data:\s*\{\s*metadata:\s*invoicePaymentMetadata\(invoice\)\s*\}/.test(src)) fail("the daily run's Checkout link doesn't put the invoice's name on the payment");
}

W.restore();
if (F.length) { console.error(`🔴 a paid invoice can fail to settle (${F.length}):`); for (const m of F) console.error(`  - ${m}`); process.exit(1); }
console.log("✅ every payment path settles the invoice it names: Checkout (payment event, session event, both, older sessions, bank payments), the auto-charge (labelled renewal), the webhook's retry of a failed event; refunds, disputes, failures and processing payments are recorded and reach Messages; an unmatched paid charge is RED");
process.exit(0);
