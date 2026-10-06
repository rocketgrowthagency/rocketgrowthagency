#!/usr/bin/env node
/**
 * check-payment-path-is-safe.mjs — the five rules that keep money and product in step.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-10. RGA moved card entry inline (Stripe Payment Element) so clients pay without leaving
 * the portal. That is more of OUR code on the path between "customer paid" and "customer has the
 * thing", so the invariants that used to be Stripe's problem are now ours.
 *
 * Every check below is a failure that actually happened here or was one edit away:
 *
 *  1. THE CLIENT NEVER GRANTS. The browser must not advance a stage or write an invoice. A browser
 *     reporting success can be replayed, mistaken, or lying.
 *  2. THE AMOUNT IS DERIVED, NEVER SENT. A client-supplied amount is a client-chosen price.
 *  3. THE SIGNATURE CHECK NEEDS A TIMESTAMP. Ours verified the HMAC and ignored `t=` entirely, so
 *     one captured "payment succeeded" body stayed valid forever — a replay.
 *  4. THE INLINE EVENT MUST BE HANDLED. Without a payment_intent.succeeded branch the client pays
 *     on our own page and NOTHING happens. Money taken, nothing granted.
 *  5. REDELIVERY MUST DEDUPE. Stripe retries on any 5xx and this handler returns 500 on error BY
 *     DESIGN, so retries are the normal case.
 *
 * Exit 0 = the path is safe · 1 = money and product can diverge · 2 = could not tell.
 */
import fs from "node:fs";

// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT. A gate that can only ever read the real
// working tree cannot be pointed at a scratch copy, so its mutations cannot be run — and a
// gate nobody can make fail is a gate nobody has checked. Found 2026-10-06 when three
// mutations of `check-refusal-is-not-done` all came back green: it was reading straight past
// them. → feedback_a_gate_that_cannot_fail · feedback_the_harness_i_wrote_to_check_my_work_can_lie
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SITE = `${__SITE}`;
const F = {
  intent: `${SITE}/netlify/functions/portal-payment-intent.js`,
  webhook: `${SITE}/netlify/functions/stripe-webhook.js`,
  portal: `${SITE}/portal/portal.js`,
};
const SABOTAGE = process.env.SABOTAGE === "1";
const CASE = process.env.SABOTAGE_CASE || "";

console.log("── the payment path is safe ──");
for (const [k, p] of Object.entries(F)) {
  if (!fs.existsSync(p)) { console.log(`  ⚠️  missing ${k}: ${p}`); process.exit(2); }
}
const strip = (s) => s.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
let intent = strip(fs.readFileSync(F.intent, "utf8"));
let webhook = strip(fs.readFileSync(F.webhook, "utf8"));
let portal = strip(fs.readFileSync(F.portal, "utf8"));

if (SABOTAGE && CASE === "1") portal += '\nawait _portalSupabase.from("clients").update({ client_portal_stage: "stage_3_setup" }).eq("id", clientId);\n';
if (SABOTAGE && CASE === "2") intent = intent.replace(/amount = firstInvoiceAmount\([^)]*\);/, "amount = Number(body.amount);");
if (SABOTAGE && CASE === "3") webhook = webhook.replace(/if \(!Number\.isFinite\(age\)[^\n]*\n/, "\n");
if (SABOTAGE && CASE === "4") webhook = webhook.replace(/payment_intent\.succeeded/g, "some.other.event");
if (SABOTAGE && CASE === "5") webhook = webhook.replace(/stripe_webhook_events/g, "unused_table");

let fails = 0;
const ok = (m) => console.log(`  ✅ ${m}`);
const bad = (m, why) => { console.log(`  🔴 ${m}`); why.forEach((l) => console.log(`     ${l}`)); fails++; };

// 1 — the browser must not grant.
const GRANTS = [/from\("clients"\)\s*\.\s*update\(\s*\{[^}]*client_portal_stage/, /from\("client_invoices"\)\s*\.\s*(insert|upsert)/];
if (GRANTS.some((re) => re.test(portal))) {
  bad("portal.js writes a stage or an invoice from the browser", [
    "The webhook is the only proof money moved. A browser can be replayed, mistaken, or lying.",
    "Poll for the result instead of asserting it.",
  ]);
} else ok("the client grants nothing — it polls for the webhook's result");

// 2 — the amount is derived server-side.
if (/Number\(body\.amount\)|body\.amount|body\.price|body\.unit_amount/.test(intent)) {
  bad("portal-payment-intent takes the amount from the request body", [
    "A client-supplied amount is a client-chosen price. Derive it from the signed contract.",
  ]);
} else if (!/firstInvoiceAmount/.test(intent)) {
  bad("portal-payment-intent does not call firstInvoiceAmount()", [
    "It must share one function with the contract, or the two will disagree.",
  ]);
} else ok("the amount is derived from the signed contract, never from the browser");

// 2b — and the auth gate must actually gate.
if (/gate\.statusCode/.test(intent)) {
  bad("the auth gate checks gate.statusCode", [
    "requirePortalOwner returns { error: <response> }. gate.statusCode is ALWAYS false, so the",
    "gate admits every caller while looking like it enforces. Use `if (gate.error) return gate.error`.",
  ]);
} else if (!/requirePortalOwner/.test(intent) || !/gate\.error/.test(intent)) {
  bad("portal-payment-intent does not enforce portal ownership", [
    "Anyone signed into any portal could mint a PaymentIntent against another client's contract.",
  ]);
} else ok("only the client's own portal owner can start a payment");

// 3 — signature freshness.
if (!/SIGNATURE_TOLERANCE_SECONDS/.test(webhook) || !/age > SIGNATURE_TOLERANCE_SECONDS/.test(webhook)) {
  bad("the webhook signature check ignores the timestamp", [
    "The HMAC proves Stripe wrote it; only `t=` proves they wrote it RECENTLY.",
    "Without a tolerance, one captured payload replays forever.",
  ]);
} else ok("webhook signatures expire (replay window closed)");

// 4 — the inline event is handled.
if (!/payment_intent\.succeeded/.test(webhook)) {
  bad("the webhook has no payment_intent.succeeded branch", [
    "That is the INLINE Payment Element's event. Without it the client pays on our own page and",
    "nothing happens — no stage advance, no invoice, no email. Money taken, nothing granted.",
  ]);
} else ok("payment_intent.succeeded is handled (inline payments grant)");

// 5 — redelivery dedupes.
if (!/stripe_webhook_events/.test(webhook) || !/409/.test(webhook)) {
  bad("the webhook does not dedupe on event.id", [
    "Stripe retries on any 5xx and this handler returns 500 on error by design.",
    "A redelivery re-runs the grant: second stage advance, second email, second ledger write.",
  ]);
} else ok("redelivered events are deduped by a UNIQUE insert, not a read-then-write");

// ── 6. AUTO-CHARGE: retries must be RETRYABLE, and the ladder must not nag before it tries. ───
// Researched 2026-09-10: ~9-10% of subscription MRR is lost to failed payments (Baremetrics),
// 20-40% of all churn is involuntary (Paddle), and timed retries recover 45-70%. A single attempt
// discards most of that. 🔴 A FIXED idempotency key is worse than no retry: Stripe replays the
// original decline forever, so the retry looks implemented and can never succeed.
const BILLING = `${SITE}/netlify/functions/billing-daily-check.js`;
if (fs.existsSync(BILLING)) {
  let bsrc = strip(fs.readFileSync(BILLING, "utf8"));
  if (SABOTAGE && CASE === "6") bsrc = bsrc.replace(/autocharge_\$\{invoice\.id\}_d\$\{attemptDay\}/, "autocharge_${invoice.id}");
  const perAttempt = /Idempotency-Key["']?\s*:\s*`autocharge_\$\{invoice\.id\}_d\$\{attemptDay\}`/.test(bsrc);
  const retries = /RETRY_DAYS\s*=\s*\[0,\s*3,\s*5,\s*7\]/.test(bsrc);
  if (!perAttempt) {
    bad("the auto-charge idempotency key is not per-attempt", [
      "A fixed key makes Stripe replay the ORIGINAL decline forever — the retry can never succeed.",
    ]);
  } else ok("auto-charge retries are actually retryable (key includes the attempt)");
  if (!retries) {
    bad("no retry schedule on the auto-charge", [
      "One attempt discards most recoverable revenue; timed retries recover 45-70%.",
    ]);
  } else ok("retries on days 0/3/5/7 — all inside the grace window, before the client is told");
}

if (fails) { console.log(`\n🔴 ${fails} check(s) failed — money and product can diverge.`); process.exit(1); }
console.log("\n✅ the client never grants, the amount is ours, and a replay changes nothing.");
process.exit(0);
