#!/usr/bin/env node
/**
 * check-price-summary-is-derived.mjs — a per-month figure cannot describe a non-flat schedule.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-10, the FOURTH price drift. The portal's "ready to sign" card rendered:
 *
 *     `$${contract.monthly_price}/mo · ${contract.term_months}-mo term`   →   "$625/MO · 3-MO TERM"
 *
 * A client multiplies 625 × 3 and gets $1,875. `commit_3mo` actually bills $1,250 + $625 + $625 =
 * **$2,500**. We understated our own price by $625 on the exact screen where they sign.
 *
 * Nothing was corrupt — monthly_price IS 625 and term_months IS 3. The template asked the data a
 * question it could not answer: month 1 is discounted, so no single per-month number exists.
 *
 * 🔑 The agreement BODY was correct throughout ($1,250 / $625 / $2,500) because contract-generate.js
 * builds it from PLANS. Only the SUMMARIES above it were wrong — and the summary is what gets read.
 * A correct document under a wrong headline is a wrong price.
 *
 * ─── WHAT THIS CHECKS ─────────────────────────────────────────────────────────────────────────
 * 1. No client-facing template pairs monthly_price with term in one string (the broken shape).
 * 2. The derivation itself is right: for every tier in data/plans.json, the chip's stated total
 *    equals the sum of that tier's real schedule. This is the check that survives a rewrite —
 *    it tests the OUTPUT, not the spelling of the source.
 *
 * Exit 0 = every price summary is derived · 1 = a client can be shown a wrong total · 2 = unknown.
 */
import fs from "node:fs";
import path from "node:path";

const SITE = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SABOTAGE = process.env.SABOTAGE === "1";

console.log("── every price a client reads is derived from the real schedule ──");

const PLANS_JSON = path.join(SITE, "data/plans.json");
const HELPER = path.join(SITE, "shared/contract-pricing.js");
for (const f of [PLANS_JSON, HELPER]) {
  if (!fs.existsSync(f)) { console.log(`  ⚠️  missing: ${f}`); process.exit(2); }
}

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
let fails = 0;

// ── 1. The broken SHAPE must not reappear in any client-facing template. ───────────────────────
// Deliberately narrow: monthly_price and a term in the SAME template literal. That is the
// construction that cannot be right for a discounted first month.
const SCANNED = ["portal/portal.js", "admin/admin.js", "shared/contract-doc.js"];
const offenders = [];
for (const rel of SCANNED) {
  const p = path.join(SITE, rel);
  if (!fs.existsSync(p)) { console.log(`  ⚠️  missing: ${rel}`); process.exit(2); }
  let src = strip(fs.readFileSync(p, "utf8"));
  if (SABOTAGE && process.env.SABOTAGE_CASE === "1" && rel === "portal/portal.js") {
    src += '\nconst x = `$${contract.monthly_price}/mo · ${contract.term_months}-mo term`;\n';
  }
  for (const line of src.split("\n")) {
    if (/monthly_price/.test(line) && /term_months|-mo term|-month term/.test(line)) {
      offenders.push(`${rel}: ${line.trim().slice(0, 100)}`);
    }
  }
}
if (offenders.length === 0) {
  console.log("  ✅ no template states monthly_price × term as a client-facing price");
} else {
  console.log(`  🔴 ${offenders.length} template(s) restate monthly_price alongside the term.`);
  console.log("     A single per-month number cannot describe a discounted first month.");
  offenders.forEach((o) => console.log(`       ${o}`));
  fails++;
}

// ── 2. THE ONE THAT MATTERS — does the derivation produce the RIGHT total, per tier? ───────────
const plans = JSON.parse(fs.readFileSync(PLANS_JSON, "utf8"));
let helperSrc = fs.readFileSync(HELPER, "utf8");
if (SABOTAGE && process.env.SABOTAGE_CASE === "2") {
  helperSrc = helperSrc.replace(/const total = schedule\.reduce\([^;]+;/, "const total = Number(contract.monthly_price) * schedule.length;");
}
const mod = await import("data:text/javascript," + encodeURIComponent(helperSrc));

let mismatches = 0, checked = 0;
for (const [tier, plan] of Object.entries(plans)) {
  const schedule = Array.isArray(plan.schedule) ? plan.schedule : [];
  if (!schedule.length) continue;
  const real = schedule.reduce((s, r) => s + Number(r.amount || 0), 0);
  if (real === 0) continue; // beta — no figure to state
  const monthlyPrice = plan.recurring_after_term || schedule[0].amount || 0;
  const { chip, total } = mod.contractPriceSummary(
    { tier, monthly_price: monthlyPrice, term_months: plan.term_months }, plans
  );
  checked++;
  const stated = String(chip).match(/\$([\d,]+)\s*total/);
  if (stated && Number(stated[1].replace(/,/g, "")) !== real) {
    console.log(`  🔴 ${tier}: chip says ${stated[0]} but the schedule bills $${real.toLocaleString("en-US")}`);
    mismatches++;
  } else if (total != null && total !== real) {
    console.log(`  🔴 ${tier}: derived total $${total} ≠ real schedule $${real}`);
    mismatches++;
  }
}
if (mismatches === 0) {
  console.log(`  ✅ all ${checked} priced tier(s): the summary total equals the real schedule`);
} else {
  fails++;
}

// ── 3. A tier must never be described by a price test alone. ───────────────────────────────────
// done_for_you is quoted per project, so its monthly_price is 0 — and the old logic
// (`isBeta = ... || monthly_price === 0`) therefore called every done-for-you agreement
// "Beta partner · no cost". We would have told a paying project client their work was free.
let dfy = mod.contractPriceSummary({ tier: "done_for_you", monthly_price: 0, term_months: 0 }, plans);
if (SABOTAGE && process.env.SABOTAGE_CASE === "3") dfy = { chip: "Beta partner · no cost" };
if (/beta/i.test(dfy.chip)) {
  console.log(`  🔴 done_for_you is described as "${dfy.chip}" — a zero PRICE is not a zero-cost DEAL.`);
  fails++;
} else {
  console.log(`  ✅ done_for_you reads "${dfy.chip}", not "beta"`);
}

// ── 4. ADD-ONS: what we ADVERTISE must equal what contract-generate CHARGES. ───────────────────
// 2026-09-10: contract-generate charged WEBSITE_LITE=750 while the agreement PROSE it generated in
// the very same file said "$1,500 one-time fee", and the admin checkbox agreed with the prose. The
// document contradicted the invoice beside it. Naming a constant does not help if the copy next to
// it still spells the number out.
const OFFER = JSON.parse(fs.readFileSync(path.join(SITE, "data/offer-pricing.json"), "utf8"));
// 🔴 STRIP COMMENTS FIRST. contract-generate.js documents this very bug by quoting the old strings
// ("$1,500 one-time fee"), and the first version of this check matched that comment and failed on
// already-fixed code. A gate that reads prose is testing the documentation, not the behaviour.
let genSrc = strip(fs.readFileSync(path.join(SITE, "netlify/functions/contract-generate.js"), "utf8"));
if (SABOTAGE && process.env.SABOTAGE_CASE === "4") genSrc = genSrc.replace(/const WEBSITE_LITE = \d+;/, "const WEBSITE_LITE = 1500;");
const ADDONS = [["website_lite", "WEBSITE_LITE"], ["website_full", "WEBSITE_FULL"]];
let addonBad = 0;
for (const [offerKey, constName] of ADDONS) {
  const m = genSrc.match(new RegExp(`const ${constName} = (\\d+);`));
  const advertised = OFFER.prices?.[offerKey]?.now;
  if (!m || advertised == null) {
    console.log(`  ⚠️  could not resolve ${offerKey} / ${constName}`);
    process.exit(2);
  }
  if (Number(m[1]) !== Number(advertised)) {
    console.log(`  🔴 ${offerKey}: advertised $${advertised} but ${constName} charges $${m[1]}`);
    addonBad++;
  }
}
// And no add-on fee may be spelled out as a literal in the agreement prose.
const proseLiteral = /one-time fee/.test(genSrc) && /\$[13],[05]00 one-time fee/.test(genSrc);
if (proseLiteral) { console.log("  🔴 an add-on fee is typed into the agreement prose instead of read from its constant"); addonBad++; }
if (addonBad) { fails++; } else { console.log(`  ✅ add-ons: advertised price == the price the contract charges`); }

if (fails) {
  console.log(`\n🔴 ${fails} check(s) failed — a client can be shown a price we do not charge.`);
  process.exit(1);
}
console.log("\n✅ derive, never restate.");
process.exit(0);
