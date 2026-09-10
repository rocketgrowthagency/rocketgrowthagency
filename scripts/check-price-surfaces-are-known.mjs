#!/usr/bin/env node
/**
 * check-price-surfaces-are-known.mjs — you cannot update a price you do not know exists.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * Chris, 2026-09-10: *"we should have a price and plan memory just for this with all places and
 * usages it has so when we change price or plan we know how and where to update it everywhere."*
 *
 * A hand-written list rots the moment someone adds a surface. So this file IS the list, and it
 * fails when reality contains a price-bearing file it does not name.
 *
 * It has already earned itself: `data/offer-pricing.json` calls itself the single source of truth
 * and names SEVEN pages that quote the offer. It did not name
 * `netlify/functions/_fga-report-builder.js`, which hardcoded the same 50%-off schedule in TWO
 * places and quotes it to **every prospect who receives an FGA report**. Change the price and the
 * website updates while every outbound audit keeps quoting the old one.
 *
 * 🔑 A "single source of truth" with an undiscovered consumer is not single.
 *
 * ─── HOW TO USE WHEN A PRICE CHANGES ──────────────────────────────────────────────────────────
 * Run it. Every SOURCE and MANUAL file it prints must be visited, in the order in
 * project_price_change_runbook. DERIVED files need nothing — that is the point of deriving.
 *
 * Exit 0 = every price surface is classified · 1 = an unknown one exists · 2 = could not scan.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const SITE = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SABOTAGE = process.env.SABOTAGE === "1";

// ── THE INVENTORY. Every price-bearing file, and what you must DO to it on a price change. ─────
const SURFACES = {
  // SOURCE — edit these first. Everything else follows from them.
  "data/offer-pricing.json":                    ["SOURCE", "what we ADVERTISE (was/now). Edit FIRST."],
  "netlify/functions/contract-generate.js":     ["SOURCE", "PLANS — what we CHARGE. Edit SECOND."],
  "data/plans.json":                            ["SOURCE", "generated mirror of PLANS — REGENERATE, never hand-edit."],

  // DERIVED — reads a source at runtime. Nothing to do on a price change.
  "shared/contract-pricing.js":                 ["DERIVED", "the one price SUMMARY helper; reads data/plans.json"],
  "shared/contract-doc.js":                     ["DERIVED", "agreement plan pill → contract-pricing"],
  "shared/invoice-doc.js":                      ["DERIVED", "client invoice — every line derived from data/plans.json + _addons"],
  "shared/email-doc.js":                        ["DERIVED", "branded email shell — carries no price of its own"],
  "netlify/functions/send-invoice-email.js":    ["DERIVED", "receipt + invoice-due emails → invoice-doc, which derives from plans.json"],
  "netlify/functions/send-monthly-report.js":   ["EXCLUDED", "reports measured KPIs from client_monthly_records; sets and quotes no price"],
  "portal/portal.js":                           ["DERIVED", "sign card, signed meta, preview pill → contract-pricing"],
  "admin/admin.js":                             ["DERIVED", "plan picker + contract list → data/plans.json"],
  "netlify/functions/send-confirmation-email.js":["DERIVED", "intro email reads PLANS"],
  "netlify/functions/_fga-report-builder.js":   ["DERIVED", "FGA report offer chips → data/offer-pricing.json (wired 2026-09-10)"],

  // MANUAL — prose in many shapes; a regex loose in live sales copy is worse than a checklist.
  "index.html":                                 ["MANUAL", "home"],
  "pricing/index.html":                         ["MANUAL", "pricing (most mentions)"],
  "faq/index.html":                             ["MANUAL", "FAQ"],
  "services/index.html":                        ["MANUAL", "services"],
  "start-growth-plan/index.html":               ["MANUAL", "checkout entry"],
  "free-growth-audit/sample-report/index.html": ["MANUAL", "sample report"],
  "demo/index.html":                            ["MANUAL", "demo"],
  "admin/playbook.js":                          ["MANUAL", "the rep SAYS these numbers out loud"],
  "docs/sales-call-script.md":                  ["MANUAL", "rep script"],
  "docs/playbooks/close-phase0-templates.md":   ["MANUAL", "close templates"],
  "docs/RGA_NEPQ_SALES_BLUEPRINT.md":           ["MANUAL", "sales blueprint"],

  // EXCLUDED — deliberately NOT forced to match the offer. Each reason is load-bearing.
  "docs/sales-rep-offer.html":                  ["EXCLUDED", "REP earnings model (1/2/3 clients) — $3,750 is 3 × $1,250, not our price"],
  "docs/sales-rep-compensation.html":           ["EXCLUDED", "rep commission model, not the offer"],
  "docs/owner-annual-both-prices.html":         ["EXCLUDED", "owner-economics projection"],
  "docs/owner-annual-by-close-rate.html":       ["EXCLUDED", "owner-economics projection"],
  "docs/owner-annual-full-price.html":          ["EXCLUDED", "owner-economics projection"],
  "docs/owner-earnings-solo.html":              ["EXCLUDED", "owner-economics projection"],
  "docs/owner-earnings-with-rep.html":          ["EXCLUDED", "owner-economics projection"],
  "docs/reports/generated/ohh-rats-free-growth-audit-report.html": ["EXCLUDED", "frozen generated artifact"],
  "docs/reports/ohhrats-free-growth-audit-report.html":            ["EXCLUDED", "frozen generated artifact"],
  // 🔴 stripe-create-checkout.js was EXCLUDED here as "amounts flow FROM the contract; no literal
  // offer price". THAT EXCUSE WAS FALSE — it held a private, PRE-DISCOUNT price table and charged
  // LIVE customers exactly double. 🔑 An EXCLUDED classification is a CLAIM and needs the same proof
  // as a finding. Now DERIVED, and check-charge-equals-the-contract.mjs enforces it.
  "netlify/functions/stripe-create-checkout.js":["DERIVED", "first invoice → contract-generate.firstInvoiceAmount()"],
  "netlify/functions/portal-payment-intent.js":  ["DERIVED", "inline Payment Element amount → contract-generate.firstInvoiceAmount()"],
  "netlify/functions/stripe-webhook.js":        ["DERIVED", "invoice ledger amounts → contract-generate.firstInvoiceAmount() (was the 5th/6th pre-discount copy)"],
  // 🔑 These three matched the CODE pattern and are NOT prices — inspected 2026-09-10. A number is
  // only a price in context, so the inventory records the human decision rather than the regex
  // getting ever cleverer. Re-inspect if one of them ever starts handling money.
  "netlify/functions/backfill-gbp-hours.js":    ["EXCLUDED", "'limit=1500' in a usage comment — a page size, not money"],
  "netlify/functions/flow-execute.js":          ["EXCLUDED", "GBP description cap (750 chars) and maxTokens 1500 — limits, not money"],
  "netlify/functions/v2-rank-grid-background.js":["EXCLUDED", "1500 = search radius in metres"],
  "netlify/functions/admin-record-payment.js":  ["EXCLUDED", "marks an existing invoice paid; sets no price"],
};

// 🔴 TWO PATTERNS, because prose and code hide a price differently.
//
// The original required a "$", so it never saw `if (plan === "commit_3mo") return 2500;` — the line
// that charged LIVE customers double. Widening it to bare numerals then flagged 58 files: daily
// reports, rank grids, call logs, anything containing the number 625.
// 🔑 A MASS finding means the PROBE is wrong. → feedback_a_check_must_not_validate_itself
//
// So: PROSE (.html/.md) must show a "$" — that is how a price appears to a reader. CODE (.js/.json)
// is checked for a bare price literal ASSIGNED OR RETURNED, which is how a price appears to Stripe.
// A number merely mentioned in code (a rank, a timeout, a count) is not a price.
const PRICE_PROSE = /\$\s?(1,?250|625|1,?875|2,?500|3,?750|5,?000|1,?500|3,?500|1,?750|750)\b|commit_3mo|beta_unbilled|done_for_you/;
const PRICE_CODE  = /(?:return|=|:)\s*(?:1250|625|1875|2500|3750|5000|1500|3500|1750|750)\b|commit_3mo|beta_unbilled|done_for_you/;

console.log("── every price surface is known and classified ──");
if (!fs.existsSync(SITE)) { console.log(`  ⚠️  missing: ${SITE}`); process.exit(2); }

let files;
try {
  files = execFileSync("git", ["-C", SITE, "ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
} catch (e) {
  console.log(`  ⚠️  could not list files: ${e.message}`);
  process.exit(2); // 🔴 exit 2 — could not tell, not "passed".
}

const found = [];
for (const rel of files) {
  if (!/\.(html|js|json|md)$/.test(rel)) continue;
  if (/^v\/|node_modules|^\.claude\/memory\/|mockup-/.test(rel)) continue;
  let src;
  try { src = fs.readFileSync(path.join(SITE, rel), "utf8"); } catch { continue; }
  // reports/ are generated, dated artifacts — a snapshot of a past day, not a surface to edit.
  if (/^reports\//.test(rel)) continue;
  const re = /\.(js|json)$/.test(rel) ? PRICE_CODE : PRICE_PROSE;
  if (re.test(src)) found.push(rel);
}
if (SABOTAGE) found.push("services/new-pricing-widget.js");

if (!found.length) {
  console.log("  ⚠️  scanned and found NO price surfaces at all — the pattern must be broken.");
  process.exit(2); // 🔴 a MASS-empty result means the probe is wrong, not that prices vanished.
}

const unknown = found.filter((f) => !SURFACES[f]);
const stale = Object.keys(SURFACES).filter((f) => !fs.existsSync(path.join(SITE, f)));

const counts = {};
for (const f of found) if (SURFACES[f]) counts[SURFACES[f][0]] = (counts[SURFACES[f][0]] || 0) + 1;
console.log(`  scanned ${files.length} tracked files · ${found.length} carry a price or plan tier`);
console.log(`  ${counts.SOURCE || 0} SOURCE · ${counts.DERIVED || 0} DERIVED · ${counts.MANUAL || 0} MANUAL · ${counts.EXCLUDED || 0} EXCLUDED`);

let fails = 0;
if (unknown.length) {
  console.log(`\n  🔴 ${unknown.length} price surface(s) NOT in the inventory:`);
  unknown.forEach((f) => console.log(`       ${f}`));
  console.log("\n     Classify each in SURFACES (SOURCE / DERIVED / MANUAL / EXCLUDED) and add it to");
  console.log("     project_price_change_runbook. An unlisted surface is one nobody updates.");
  fails++;
} else {
  console.log("  ✅ no unclassified price surface");
}
if (stale.length) {
  console.log(`\n  🔴 ${stale.length} inventory entr(ies) name a file that no longer exists:`);
  stale.forEach((f) => console.log(`       ${f}`));
  fails++;
} else {
  console.log("  ✅ every inventory entry names a real file");
}

if (process.argv.includes("--list")) {
  console.log("\n  ── WHAT TO EDIT WHEN A PRICE CHANGES ──");
  for (const k of ["SOURCE", "MANUAL"]) {
    console.log(`\n  ${k}:`);
    found.filter((f) => SURFACES[f]?.[0] === k).forEach((f) => console.log(`    ${f.padEnd(46)} ${SURFACES[f][1]}`));
  }
  console.log("\n  DERIVED (nothing to do — they read a source):");
  found.filter((f) => SURFACES[f]?.[0] === "DERIVED").forEach((f) => console.log(`    ${f.padEnd(46)} ${SURFACES[f][1]}`));
}

if (fails) { console.log(`\n🔴 ${fails} check(s) failed — a price could be changed and left behind somewhere.`); process.exit(1); }
console.log("\n✅ every place a price lives is accounted for.");
process.exit(0);
