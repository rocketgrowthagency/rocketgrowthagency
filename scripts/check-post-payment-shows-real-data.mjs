#!/usr/bin/env node
/**
 * check-post-payment-shows-real-data.mjs — the screen after a payment must show the ledger, or nothing.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-10. After paying, the portal polled `clients.client_portal_stage` and reloaded the moment
 * it moved. But the webhook advances the stage ~1.5s BEFORE it writes `client_invoices`:
 *
 *     00:28:35.0  clients → stage_3_setup      ← the old poller returned HERE
 *     00:28:36.2  client_invoices #1 (paid)    ← what the next screen renders
 *
 * The reload raced it. With no ledger rows, every fallback fired at once — and because fallbacks
 * are written to look reasonable, the page did not error. It showed three wrong things confidently:
 *
 *   · "PAID" with NO date          (the synthetic row carries no paid_at)
 *   · invoice #2 due "~Oct 10"     (a +30-day ESTIMATE; the real row said Oct 11)
 *   · history "5:27 PM"            (the SUBSCRIPTION's created_at, not the 5:28:36 payment)
 *
 * 🔑 TWO PROPERTIES, and they are separate:
 *   A. Poll for the thing the next screen renders, not a proxy for it.
 *   B. A fallback may show LESS. It may never show a DIFFERENT record's value as if it were this
 *      one's. A near-miss timestamp on a financial document is worse than a blank — it looks
 *      authoritative, so nobody questions it.
 *
 * Exit 0 = both hold · 1 = the portal can display invented data · 2 = could not tell.
 */
import fs from "node:fs";
import path from "node:path";

const SITE = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SABOTAGE = process.env.SABOTAGE === "1";
const PORTAL = path.join(SITE, "portal/portal.js");

console.log("── after a payment, the portal renders the ledger or renders nothing ──");

if (!fs.existsSync(PORTAL)) { console.log(`  ⚠️  missing: ${PORTAL}`); process.exit(2); }
let src = fs.readFileSync(PORTAL, "utf8");

if (SABOTAGE) {
  const before = src;
  // Re-create defect A: go back to polling only the stage.
  src = src.replace(/const \{ data: inv \} = await _portalSupabase\.from\("client_invoices"\)[\s\S]*?if \(inv && String\(inv\.status\)\.toLowerCase\(\) === "paid"\) return true;/,
                    "return true;");
  if (src === before) { console.log("  ⚠️  SABOTAGE did not apply — the pattern is stale."); process.exit(2); }
}

let fails = 0;

// ── A. THE POLLER WAITS FOR THE LEDGER ────────────────────────────────────────────────────────
const fn = src.match(/async function waitForStageAdvance\([\s\S]*?\n\}/);
if (!fn) { console.log("  ⚠️  could not locate waitForStageAdvance — the shape changed."); process.exit(2); }
const body = fn[0];

const queriesLedger = /from\("client_invoices"\)/.test(body);
const checksPaid = /"paid"/.test(body);
if (!queriesLedger || !checksPaid) {
  console.log("  🔴 the post-payment poller does not wait for client_invoices #1 to be PAID.");
  console.log("     It returns while the webhook is still writing, and the reload renders fallbacks.");
  fails++;
} else {
  console.log("  ✅ poller waits for client_invoices #1 status=paid, not just the stage");
}

// ── B. NO FALLBACK BORROWS ANOTHER RECORD'S TIMESTAMP ─────────────────────────────────────────
// `paidAt` in this file is derived from the SUBSCRIPTION (current_period_start || created_at).
// It must never be used as an invoice's payment time.
const historyBlock = src.match(/const historyHtml = \(\(\) => \{[\s\S]*?\n      \}\)\(\);/);
if (!historyBlock) { console.log("  ⚠️  could not locate historyHtml — the shape changed."); process.exit(2); }
const hb = SABOTAGE
  ? historyBlock[0].replace(/paid_at: null/, "paid_at: paidAt")   // re-create defect B
  : historyBlock[0];

const borrows = /paid_at:\s*paidAt\b/.test(hb) || /:\s*\(n === 1 \? paidStr : null\)/.test(hb);
if (borrows) {
  console.log("  🔴 the billing-history fallback sources a payment time from the SUBSCRIPTION.");
  console.log("     That renders 5:27 PM for a payment taken at 5:28:36 — confidently wrong.");
  console.log("     A fallback may show LESS; it may not show a different record's value.");
  fails++;
} else {
  console.log("  ✅ no ledger row → no payment time shown, rather than a borrowed one");
}

// ── C. THE ESTIMATE IS LABELLED AS ONE ────────────────────────────────────────────────────────
// When the due date is estimated rather than read, the UI prefixes "~". If that marker is dropped,
// a guess becomes indistinguishable from a fact.
// 🔑 The marker must track WHERE THE DATE CAME FROM, not the invoice's status. It originally keyed
// on `status === "upcoming"`, which meant a real ledger date (Oct 11) was shown as "~Oct 11" —
// a FACT dressed as a guess, the mirror of the defect the marker exists to prevent.
const pfx = src.match(/const inv2DuePfx = ([^;]+);/);
if (!pfx) {
  console.log("  🔴 the estimated-date marker is gone — a guess must look like one.");
  fails++;
} else if (!/dbInv2\?\.due_date/.test(pfx[1])) {
  console.log(`  🔴 the "~" marker keys on ${pfx[1].trim()} rather than whether a ledger row exists.`);
  console.log("     A computed date must be marked; a real one must not be.");
  fails++;
} else {
  console.log("  ✅ \"~\" marks a computed date only — a ledger date shows unqualified");
}

if (fails) {
  console.log(`\n🔴 ${fails} way(s) the portal can show invented data after a payment.`);
  console.log("   Fallbacks do not error — they make a race look like a correct page.");
  process.exit(1);
}
console.log("\n✅ the post-payment screen shows real ledger data, or shows nothing.");
process.exit(0);
