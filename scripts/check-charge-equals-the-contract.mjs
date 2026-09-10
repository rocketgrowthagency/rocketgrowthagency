#!/usr/bin/env node
/**
 * check-charge-equals-the-contract.mjs — the amount we CHARGE must equal the amount we AGREED.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-10, and this is the worst one. Chris opened a LIVE Stripe checkout for the test client and
 * saw "$2,500.00". stripe-create-checkout.js had its own private computeMonth1Amount() with every
 * figure hardcoded at the PRE-DISCOUNT price:
 *
 *     commit_3mo   2500  → should be 1250        monthly       3750  → should be 1875
 *     website_lite 1500  → should be  750        website_full  3500  → should be 1750
 *
 * The 2026-08-25 discount updated PLANS and never reached this file. **Live checkout charged
 * exactly 2x.** The portal had a THIRD copy quoting the same doubled figure, and a FOURTH said the
 * recurring rate was $1,250/mo instead of $625.
 *
 * 🔑 It hid because $2,500 is a REAL number elsewhere — the 3-month total. A wrong figure that
 * matches something legitimate is the hardest kind to see.
 *
 * 🔴 THE INVENTORY HAD THIS FILE MARKED **EXCLUDED**: "amounts flow FROM the contract; no literal
 * offer price." That excuse was simply false, and it had been written by me. **An EXCLUDED
 * classification is a CLAIM, not a pass** — it needs the same proof as a finding. The price sweep
 * also missed it because the literals appear as bare `2500`, with no `$` for the regex to catch.
 *
 * WHAT IT CHECKS: the amount Stripe is told to charge equals PLANS[tier].schedule[0] + add-ons, for
 * every tier and for add-on combinations — by CALLING the real code, not by reading it.
 *
 * Exit 0 = we charge what we agreed · 1 = we would over/under-charge · 2 = could not tell.
 */
import fs from "node:fs";
import { createRequire } from "node:module";

const SITE = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SABOTAGE = process.env.SABOTAGE === "1";
const require_ = createRequire(import.meta.url);

console.log("── the charge equals the contract ──");

const GEN = `${SITE}/netlify/functions/contract-generate.js`;
const CHECKOUT = `${SITE}/netlify/functions/stripe-create-checkout.js`;
for (const f of [GEN, CHECKOUT]) {
  if (!fs.existsSync(f)) { console.log(`  ⚠️  missing: ${f}`); process.exit(2); }
}

let gen;
try { gen = require_(GEN); }
catch (e) { console.log(`  ⚠️  contract-generate.js will not load: ${e.message}`); process.exit(2); }
if (typeof gen.firstInvoiceAmount !== "function") {
  console.log("  🔴 contract-generate.js no longer exports firstInvoiceAmount() — the shared");
  console.log("     source of truth for what we bill. Checkout will need its own copy again.");
  process.exit(1);
}

// The checkout must DELEGATE, not recompute. Read its source for a private price table.
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
let coSrc = strip(fs.readFileSync(CHECKOUT, "utf8"));
if (SABOTAGE && (process.env.SABOTAGE_CASE || "1") === "1") {
  coSrc += '\nif (plan === "commit_3mo") return 2500;\n';
}

let fails = 0;
// 🔴 The WEBHOOK is scanned too. It held the 5th and 6th copies of the pre-discount table and
// recorded invoice #1 at $2,500 — so the BOOKS would still have shown double after checkout was
// fixed. Checking only the file that was reported is how a defect survives its own fix.
const WH = `${SITE}/netlify/functions/stripe-webhook.js`;
const PI = `${SITE}/netlify/functions/portal-payment-intent.js`;
for (const extra of [WH, PI]) {
  if (!fs.existsSync(extra)) continue;
  coSrc += "\n" + strip(fs.readFileSync(extra, "utf8"));
}
const literals = [...new Set((coSrc.match(/\b(2500|3750|1500|3500|1250|1875|750|1750|625)\b/g) || []))];
if (literals.length) {
  console.log(`  🔴 stripe-create-checkout.js contains price literals: ${literals.join(", ")}`);
  console.log("     It must derive from contract-generate.js, never carry its own table.");
  fails++;
} else {
  console.log("  ✅ checkout carries no price literals — it delegates");
}
if (!/firstInvoiceAmount/.test(coSrc)) {
  console.log("  🔴 checkout does not call firstInvoiceAmount() — it computes its own amount.");
  fails++;
}

// And the derivation itself must be right, per tier and with add-ons.
let f = gen.firstInvoiceAmount;
if (SABOTAGE && process.env.SABOTAGE_CASE === "2") f = () => 2500;
const CASES = [
  ["commit_3mo", {}], ["monthly", {}], ["beta_unbilled", {}],
  ["commit_3mo", { website_lite: true }], ["commit_3mo", { website_full: true }],
  ["commit_3mo", { extra_gbp_locations: 2 }],
];
let wrong = 0;
for (const [tier, addons] of CASES) {
  const plan = gen.PLANS[tier];
  const first = (plan?.schedule || [])[0];
  if (!first) continue;
  const expected = Number(first.amount)
    + (addons.website_lite ? gen.WEBSITE_LITE : 0)
    + (addons.website_full ? gen.WEBSITE_FULL : 0)
    + (Number(addons.extra_gbp_locations) || 0) * gen.EXTRA_GBP_MONTHLY;
  const got = f(tier, addons);
  const label = `${tier}${Object.keys(addons).length ? " +" + Object.keys(addons).join("+") : ""}`;
  if (got !== expected) {
    console.log(`  🔴 ${label}: would charge $${got} but the contract schedules $${expected}`);
    wrong++;
  }
}
if (wrong) fails++;
else console.log(`  ✅ all ${CASES.length} case(s): charge == the contract's first scheduled payment`);

// 🔴 The specific historical failure, named so it can never come back quietly.
const c3 = f("commit_3mo", {});
if (c3 === 2500) {
  console.log("  🔴 commit_3mo would charge $2,500 — that is the 3-MONTH TOTAL, not month 1 ($1,250).");
  console.log("     This exact bug shipped to LIVE checkout. Month 1 is $1,250, then $625/mo.");
  fails++;
} else {
  console.log(`  ✅ commit_3mo month 1 = $${c3.toLocaleString()} (not the $2,500 3-month total)`);
}

if (fails) { console.log(`\n🔴 ${fails} check(s) failed — a client could be charged an amount they never agreed to.`); process.exit(1); }
console.log("\n✅ we charge exactly what the agreement schedules.");
process.exit(0);
