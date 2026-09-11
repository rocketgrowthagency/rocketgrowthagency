#!/usr/bin/env node
/**
 * check-a-charge-settles-its-invoice.mjs — taking money without recording it is the worst bug we ship.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-10, found by RUNNING the auto-charge rather than trusting it. Stripe charged $625
 * (pi_3UEJEpC4Ik8hhFUg0An4xPXt) and `client_invoices` still read `upcoming`, `paid_at: null`.
 *
 * `tryAutoCharge` logged an activity row, returned `{ ok: true }`, and left the ledger alone —
 * relying on the webhook to settle it. The webhook ignored `metadata.invoice_num` entirely and only
 * ever wrote invoice #1. For a real client that is:
 *
 *   · day 3, 5 and 7 charge AGAIN — four charges for one month
 *   · then overdue → warning → PAUSED, for someone who paid every time
 *   · no receipt, and a portal insisting they owe money they already sent
 *
 * 🔑 A charge is not complete when Stripe says succeeded. It is complete when OUR ledger says so.
 * Anything between those two points is money taken and unrecorded.
 *
 * THE RULE: every path that creates a PaymentIntent against an invoice must, on success, mark THAT
 * invoice paid — and the webhook must settle by `metadata.invoice_num`, not by assuming #1.
 *
 * Exit 0 = every charge settles · 1 = money can be taken unrecorded · 2 = could not tell.
 */
import fs from "node:fs";
import path from "node:path";

const SITE = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SABOTAGE = process.env.SABOTAGE === "1";

console.log("── every charge settles the invoice it charged ──");

const read = (rel) => {
  const p = path.join(SITE, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
};

let fails = 0;

// ── 1. THE AUTO-CHARGE SETTLES WHAT IT CHARGED ────────────────────────────────────────────────
let bdc = read("netlify/functions/billing-daily-check.js");
if (bdc == null) { console.log("  ⚠️  missing billing-daily-check.js"); process.exit(2); }
if (SABOTAGE) {
  const before = bdc;
  bdc = bdc.replace(/const settled = await settleInvoice\([^;]*;/, "const settled = false;");
  if (bdc === before) { console.log("  ⚠️  SABOTAGE did not apply — the pattern is stale."); process.exit(2); }
}

const success = bdc.match(/if \(pi\?\.status === "succeeded"\) \{[\s\S]*?\n  \}/);
if (!success) { console.log("  ⚠️  could not locate the success branch — the shape changed."); process.exit(2); }

const settles = /settleInvoice\s*\(/.test(success[0]);
if (!settles) {
  console.log("  🔴 tryAutoCharge succeeds without settling the invoice.");
  console.log("     Stripe has the money; our ledger still says the client owes it.");
  fails++;
} else {
  console.log("  ✅ tryAutoCharge calls settleInvoice on success");
}

// And settleInvoice must actually write `paid` to the row it was given — not to #1.
const settleFn = bdc.match(/async function settleInvoice\([\s\S]*?\n\}/);
if (!settleFn) {
  console.log("  🔴 settleInvoice is referenced but not defined.");
  fails++;
} else {
  const marksThisRow = /client_invoices\?id=eq\.\$\{invoice\.id\}/.test(settleFn[0])
                    && /status:\s*"paid"/.test(settleFn[0]);
  if (!marksThisRow) {
    console.log("  🔴 settleInvoice does not PATCH the charged row to status=paid.");
    fails++;
  } else {
    console.log("  ✅ settleInvoice marks the charged row paid, by its own id");
  }
  // The NEXT invoice number must be derived, never the literal 2.
  if (/invoice_num:\s*2\b/.test(settleFn[0])) {
    console.log("  🔴 settleInvoice opens a hardcoded invoice #2 — it must be this one + 1.");
    fails++;
  } else if (!/Number\(invoice\.invoice_num\) \+ 1/.test(settleFn[0])) {
    console.log("  🔴 settleInvoice does not derive the next invoice number from the current one.");
    fails++;
  } else {
    console.log("  ✅ the next invoice number is derived (this + 1), not assumed to be #2");
  }
}

// ── 2. THE WEBHOOK SETTLES BY invoice_num, NOT BY ASSUMING #1 ─────────────────────────────────
let wh = read("netlify/functions/stripe-webhook.js");
if (wh == null) { console.log("  ⚠️  missing stripe-webhook.js"); process.exit(2); }
if (SABOTAGE) wh = wh.replace(/const piInvoiceNum = Number\(pi\?\.metadata\?\.invoice_num \|\| 1\);/, "const piInvoiceNum = 1;");

const readsNum = /metadata\?\.invoice_num/.test(wh);
const settlesThat = /invoice_num=eq\.\$\{piInvoiceNum\}/.test(wh);
if (!readsNum || !settlesThat) {
  console.log("  🔴 the webhook does not settle by metadata.invoice_num.");
  console.log("     A renewal PaymentIntent would settle invoice #1 — or nothing at all.");
  fails++;
} else {
  console.log("  ✅ the webhook settles the invoice named in the PaymentIntent's metadata");
}

// ── 3. A PAID INVOICE IS NEVER RE-FETCHED FOR CHARGING ────────────────────────────────────────
// The retry ladder must not be able to see a settled invoice at all.
const fetchLine = bdc.match(/client_invoices\?status=in\.\(([^)]*)\)/);
if (!fetchLine) {
  console.log("  🔴 could not find the open-invoice query — a paid invoice might be re-charged.");
  fails++;
} else if (/paid/.test(fetchLine[1])) {
  console.log(`  🔴 the billing job fetches PAID invoices (status in ${fetchLine[1]}) — it can charge one twice.`);
  fails++;
} else {
  console.log(`  ✅ only unsettled invoices are fetched for charging (${fetchLine[1]})`);
}

if (fails) {
  console.log(`\n🔴 ${fails} way(s) money can be taken without the ledger recording it.`);
  console.log("   A charge is complete when OUR ledger says so, not when Stripe does.");
  process.exit(1);
}
console.log("\n✅ every charge path settles the invoice it charged.");
process.exit(0);
