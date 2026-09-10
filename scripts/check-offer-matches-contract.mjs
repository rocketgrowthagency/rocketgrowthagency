#!/usr/bin/env node
/**
 * check-offer-matches-contract.mjs — the price on the WEBSITE must be the price the CONTRACT charges.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * RGA had TWO price systems that never checked each other:
 *
 *   data/offer-pricing.json  →  check-offer-prices-consistent.mjs  →  7 live marketing pages
 *   contract-generate PLANS  →  check-price-consistency.mjs        →  contract, admin, emails
 *
 * Each was internally consistent. Nothing compared them. So the site could advertise one number
 * while the agreement charged another, and both gates would pass.
 *
 * 🔴 This is not hypothetical. On 2026-09-09 the admin plan picker showed $5,000 for a plan the
 * contract billed at $2,500 — and `offer-pricing.json` lists BOTH as allowed values (5000 is the
 * pre-discount "was" price), so the offer checker could never have caught it. The two halves have
 * to be compared to each other, not each to a permissive list.
 *
 * 🔑 THE OFFER IS THE PROMISE; THE CONTRACT IS THE CHARGE. A prospect reads the first and signs the
 * second. They must be the same number.
 *
 * Exit 0 = the promise matches the charge · 1 = they disagree · 2 = could not tell.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(path.dirname(path.resolve(HERE, "..")), "Rocket Growth Agency Website VS Code");
const OFFER = path.join(WEB, "data", "offer-pricing.json");
const PLANS_JSON = path.join(WEB, "data", "plans.json");
const SABOTAGE = process.env.SABOTAGE === "1";

for (const f of [OFFER, PLANS_JSON]) {
  if (!fs.existsSync(f)) { console.error(`  ✗ missing ${f}`); process.exit(2); }
}
const offer = JSON.parse(fs.readFileSync(OFFER, "utf8"));
let plans = JSON.parse(fs.readFileSync(PLANS_JSON, "utf8"));
if (SABOTAGE) plans = JSON.parse(JSON.stringify(plans).replace(/"amount":625/g, '"amount":1250'));

const now = (k) => offer?.prices?.[k]?.now;
const total = (code) => (plans[code]?.schedule || []).reduce((s, r) => s + Number(r.amount || 0), 0);

console.log("── the price we ADVERTISE must be the price we CHARGE ──");
const fails = [];

// Each row: what the marketing site promises, and where the contract states the same thing.
const checks = [
  { label: "recurring monthly", promised: now("monthly"), charged: Number(plans.monthly?.recurring_after_term) },
  { label: "3-month plan total", promised: now("plan_3month_total"), charged: total("commit_3mo") },
  { label: "month-to-month, month 1", promised: now("m2m_month_one"), charged: total("monthly") },
  { label: "setup fee", promised: now("setup"),
    // The setup fee is not its own line in the contract — it is month 1 of commit_3mo.
    charged: (plans.commit_3mo?.schedule || [])[0]?.amount },
];

for (const c of checks) {
  if (c.promised == null) { console.log(`  ▫️  ${c.label.padEnd(26)} not quoted in offer-pricing.json — skipped`); continue; }
  if (c.charged == null || Number.isNaN(c.charged)) {
    fails.push(`${c.label}: contract has no comparable figure`);
    console.log(`  🔴 ${c.label.padEnd(26)} site says $${c.promised}, contract has NOTHING to compare`);
    continue;
  }
  if (Number(c.promised) !== Number(c.charged)) {
    fails.push(`${c.label}: site $${c.promised} vs contract $${c.charged}`);
    console.log(`  🔴 ${c.label.padEnd(26)} site says $${c.promised}  ·  contract charges $${c.charged}`);
  } else {
    console.log(`  ✅ ${c.label.padEnd(26)} $${c.charged} on both`);
  }
}

// 🔴 A "was" price must never be what we actually charge — that is the pre-discount number, and
// shipping it means billing double.
const wasValues = new Set(Object.values(offer.prices || {}).map((p) => p?.was).filter(Boolean).map(Number));
const charging = [Number(plans.monthly?.recurring_after_term), total("commit_3mo"), total("monthly")].filter(Boolean);
const chargingOld = charging.filter((v) => wasValues.has(v) && !Object.values(offer.prices || {}).some((p) => Number(p?.now) === v));
if (chargingOld.length) {
  fails.push("charging a pre-discount price");
  console.log(`  🔴 the contract charges ${chargingOld.map((v) => "$" + v).join(", ")} — a PRE-DISCOUNT "was" figure`);
}

console.log("");
if (fails.length) {
  console.error(`🔴 the offer and the agreement disagree (${fails.length}):`);
  fails.forEach((f) => console.error(`     ${f}`));
  console.error("   A prospect reads the site and signs the contract. Both must say the same number.");
  console.error("   Change data/offer-pricing.json AND contract-generate.js PLANS together, then");
  console.error("   regenerate data/plans.json. See project_price_change_runbook.");
  process.exit(1);
}
console.log("✅ the advertised offer and the signed agreement state the same prices");
