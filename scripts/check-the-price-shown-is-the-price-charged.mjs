#!/usr/bin/env node
/**
 * check-the-price-shown-is-the-price-charged.mjs — the number on the button must be the number taken.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-10, found by testing a SECOND plan. On Monthly + Website Full the portal showed:
 *
 *     Pay your first invoice ($1,875)      ← no website line at all
 *
 * while `portal-payment-intent`, reading the same contract server-side, created a PaymentIntent
 * for **$3,625**. The client reads $1,875, clicks, and is charged nearly double.
 *
 * ROOT CAUSE: `portal-get-contracts` selected a fixed column list that omitted `audit_log` — where
 * a contract's ADD-ONS live. So every price the browser computed used `addons = {}`, while every
 * price the server computed used the real ones. Two numbers, two processes, one of them never
 * looked at.
 *
 * 🔑 The browser and the server must be able to reach the SAME inputs. A shared pricing helper is
 * worth nothing if one caller is fed a contract with the add-ons stripped out.
 *
 * THIS GATE: for every plan × add-on combination, compute the amount the way the BROWSER does
 * (shared/contract-pricing.js + data/plans.json) and the way the SERVER does
 * (contract-generate.firstInvoiceAmount), and require they agree — then assert the portal is
 * actually SENT the add-ons.
 *
 * Exit 0 = shown == charged everywhere · 1 = a client can be overcharged · 2 = could not tell.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const SITE = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SABOTAGE = process.env.SABOTAGE === "1";

console.log("── the price the client is SHOWN equals the price they are CHARGED ──");

let fails = 0;

// ── 1. THE PORTAL IS ACTUALLY SENT THE ADD-ONS ────────────────────────────────────────────────
const GET = path.join(SITE, "netlify/functions/portal-get-contracts.js");
if (!fs.existsSync(GET)) { console.log(`  ⚠️  missing: ${GET}`); process.exit(2); }
let getSrc = fs.readFileSync(GET, "utf8");
if (SABOTAGE) {
  const before = getSrc;
  getSrc = getSrc.replace(/addons: gen\.addons \|\| \{\}/, "addons: {}");
  if (getSrc === before) { console.log("  ⚠️  SABOTAGE did not apply — the pattern is stale."); process.exit(2); }
}

const sendsAddons = /addons:\s*gen\.addons/.test(getSrc);
const sendsProjectTotal = /project_total:\s*gen\.project_total/.test(getSrc);
const leaksAuditLog = /contracts:\s*rows/.test(getSrc) || /\bcontracts\b[^\n]*audit_log/.test(getSrc.split("return json")[1] || "");

if (!sendsAddons || !sendsProjectTotal) {
  console.log("  🔴 portal-get-contracts does not send the contract's add-ons to the browser.");
  console.log("     Every price the portal computes will use addons = {} while the server uses the real ones.");
  fails++;
} else {
  console.log("  ✅ portal-get-contracts derives and sends addons + project_total");
}
if (leaksAuditLog) {
  console.log("  🔴 the raw audit_log is being returned — it carries signer_ip and signer_user_agent.");
  fails++;
} else {
  console.log("  ✅ the audit trail stays on the server");
}

// ── 2. BROWSER MATH == SERVER MATH, EVERY COMBINATION ─────────────────────────────────────────
let plans, serverFirst, browser;
try {
  plans = JSON.parse(fs.readFileSync(path.join(SITE, "data/plans.json"), "utf8"));
  ({ firstInvoiceAmount: serverFirst } = require(path.join(SITE, "netlify/functions/contract-generate.js")));
  browser = await import(path.join(SITE, "shared/contract-pricing.js"));
} catch (e) { console.log(`  ⚠️  could not load the pricing code: ${e.message}`); process.exit(2); }

const CASES = [
  ["commit_3mo", {}],
  ["monthly", {}],
  ["commit_3mo", { website_lite: true }],
  ["commit_3mo", { website_full: true }],
  ["monthly", { website_full: true }],
  ["monthly", { website_lite: true }],
  ["commit_3mo", { extra_gbp_locations: 1 }],
  ["commit_3mo", { extra_gbp_locations: 3 }],
  ["monthly", { website_full: true, extra_gbp_locations: 2 }],
];

let mismatches = 0;
for (const [tier, addons] of CASES) {
  const shown = browser.firstInvoiceAmount(tier, addons, plans);
  const charged = serverFirst(tier, addons);
  const label = `${tier}${Object.keys(addons).length ? " +" + Object.keys(addons).join("+") : ""}`;
  if (shown == null) {
    console.log(`  🔴 ${label}: the browser cannot compute a price at all (null).`);
    mismatches++; continue;
  }
  if (Number(shown) !== Number(charged)) {
    console.log(`  🔴 ${label.padEnd(38)} shown $${Number(shown).toLocaleString()} · CHARGED $${Number(charged).toLocaleString()}`);
    mismatches++;
  } else {
    console.log(`  ✅ ${label.padEnd(38)} $${Number(shown).toLocaleString()}`);
  }
}
if (mismatches) fails += mismatches;

// ── 3. A ONE-TIME ADD-ON MUST NOT RIDE EVERY INVOICE ──────────────────────────────────────────
// 🔑 The most expensive way to get add-ons wrong. A website build repeating on invoice #2 is a
// recurring double-charge for work done once; an extra GBP location MISSING from #2 is revenue
// never billed. The two behave oppositely, so one rule cannot cover both.
const docMod = await import(path.join(SITE, "shared/invoice-doc.js"));
for (const [tier, addons, pt] of [
  ["commit_3mo", { website_full: true }, 0],
  ["monthly", { website_lite: true }, 0],
  ["monthly", { website_full: true, extra_gbp_locations: 2 }, 0],
  ["commit_3mo", { extra_gbp_locations: 3 }, 0],
  ["done_for_you", {}, 8000],
]) {
  const label = `${tier}${Object.keys(addons).length ? " +" + Object.keys(addons).join("+") : ""}`;
  const inv2 = docMod.invoiceLines({ tier, invoiceNum: 2, addons, plans, projectTotal: pt });
  const inv3 = docMod.invoiceLines({ tier, invoiceNum: 3, addons, plans, projectTotal: pt });
  const problems = [];
  if (inv2 && inv2.lines.some((l) => /Website/.test(l.label))) {
    problems.push("a ONE-TIME website build repeats on invoice #2 — a recurring double-charge");
  }
  const wantGbp = Number(addons.extra_gbp_locations || 0) > 0;
  const hasGbp = !!(inv2 && inv2.lines.some((l) => /Google Business Profile/.test(l.label)));
  if (wantGbp && !hasGbp) problems.push("a RECURRING GBP add-on is missing from invoice #2 — revenue never billed");
  if (!wantGbp && hasGbp) problems.push("invoice #2 bills for GBP locations the contract does not include");
  if (tier === "done_for_you" && inv3) problems.push("done_for_you rendered an invoice #3 — it is exactly two");

  if (problems.length) { problems.forEach((x) => console.log(`  🔴 ${label}: ${x}`)); fails += problems.length; }
  else console.log(`  ✅ ${label.padEnd(38)} add-on recurrence correct`);
}

// ── 4. THE RECURRING RATE AGREES TOO ──────────────────────────────────────────────────────────
// An extra GBP location rides EVERY invoice — a mismatch here under-bills forever, not once.
for (const [tier, addons] of [["commit_3mo", { extra_gbp_locations: 2 }], ["monthly", {}]]) {
  const shown = browser.recurringRate(tier, addons, plans);
  const a = plans._addons || {};
  const expected = Number(plans[tier]?.recurring_after_term || 0)
    + (Number(addons.extra_gbp_locations) || 0) * (Number(a.extra_gbp_monthly) || 0);
  const label = `recurring · ${tier}${addons.extra_gbp_locations ? ` +${addons.extra_gbp_locations} GBP` : ""}`;
  if (Number(shown) !== expected) {
    console.log(`  🔴 ${label.padEnd(38)} shown $${shown} · expected $${expected}`);
    fails++;
  } else {
    console.log(`  ✅ ${label.padEnd(38)} $${Number(shown).toLocaleString()}/mo`);
  }
}

if (fails) {
  console.log(`\n🔴 ${fails} problem(s). A client can be shown one price and charged another.`);
  console.log("   The browser and the server must be fed the SAME contract inputs — a shared");
  console.log("   pricing helper is worthless if one side never receives the add-ons.");
  process.exit(1);
}
console.log("\n✅ shown == charged for every plan and add-on combination.");
process.exit(0);
