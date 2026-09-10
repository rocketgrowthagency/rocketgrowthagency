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
  "netlify/functions/stripe-create-checkout.js":["EXCLUDED", "amounts flow FROM the contract; no literal offer price"],
  "netlify/functions/stripe-webhook.js":        ["EXCLUDED", "amounts flow FROM the contract"],
  "netlify/functions/admin-record-payment.js":  ["EXCLUDED", "amounts flow FROM the contract"],
};

const PRICE_RE = /\$1,?250|\$625|\$1,?875|\$2,?500|\$3,?750|\$5,?000|commit_3mo|beta_unbilled|done_for_you/;

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
  if (PRICE_RE.test(src)) found.push(rel);
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
