#!/usr/bin/env node
/**
 * check-price-excuses-are-still-true.mjs — an EXCLUDED classification is a CLAIM, not a pass.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * `check-price-surfaces-are-known` proves every price surface is CLASSIFIED. It never re-checks
 * whether the classification is TRUE. Those are different questions, and the gap has now produced
 * three separate live defects — all three excuses written by me:
 *
 *   1. stripe-create-checkout.js  "EXCLUDED — reads the plan table"     → held its own pre-discount
 *                                                                        table and charged LIVE
 *                                                                        customers 2×.
 *   2. stripe-webhook.js          "EXCLUDED — records what Stripe says" → wrote $2,500/$1,250 into
 *                                                                        client_invoices.
 *   3. admin-record-payment.js    "EXCLUDED — marks an existing invoice
 *                                  paid; sets no price"                → CREATES invoices #1 and
 *                                                                        #2 at $2,500 and $1,250.
 *                                                                        Every check / ACH / phone
 *                                                                        payment, billed double.
 *
 * 🔑 The third excuse was written AFTER learning the lesson from the first two. Remembering a rule
 * is not a control. The only thing that holds is a gate that re-derives the claim from the file.
 *
 * So this gate re-PROVES both claims, every run:
 *
 *   DERIVED  → must actually reference a source (contract-generate / contract-pricing / plans.json /
 *              offer-pricing, or take an injected `plans`) AND contain no bare plan-price literal
 *              that is assigned or returned outside a comment. A file that computes its own price
 *              is not derived, whatever the label says.
 *
 *   EXCLUDED → the price-ish tokens in the file must be a SUBSET of the ones present when the
 *              excuse was written. `flow-execute.js` is excused because 1500 is a token cap — that
 *              excuse says nothing about a `2500` appearing there next month.
 *
 * Exit 0 = every excuse re-proved · 1 = an excuse no longer covers its file · 2 = could not tell.
 */
import fs from "node:fs";
import path from "node:path";

const SITE = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const GATE = "scripts/check-price-surfaces-are-known.mjs";
const SABOTAGE = process.env.SABOTAGE === "1";

// 🔑 The tokens each EXCLUDED file contained when its excuse was written. NOT a hash — a reader can
// see what was allowed and why. Adding a token here is a deliberate act with a reason attached.
const ALLOWED = {
  "netlify/functions/send-monthly-report.js": [],
  "shared/email-doc.js":                      [],
  "docs/sales-rep-offer.html":                ["$1,250","$1,500","$1,875","$2,500","$3,750","$625","$750"],
  "docs/sales-rep-compensation.html":         ["$1,250","$1,750","$1,875","$2,500","$5,000","$625","$750"],
  "docs/owner-annual-both-prices.html":       ["$1,250","$2,500","$625"],
  "docs/owner-annual-by-close-rate.html":     ["$1,250","$2,500","$625"],
  "docs/owner-annual-full-price.html":        ["$1,250","$2,500"],
  "docs/owner-earnings-solo.html":            ["$1,250","$2,500","$625"],
  "docs/owner-earnings-with-rep.html":        ["$1,250","$2,500","$5,000","$625"],
  "docs/reports/generated/ohh-rats-free-growth-audit-report.html": ["$2,500"],
  "docs/reports/ohhrats-free-growth-audit-report.html":            ["$1,250","$2,500"],
  "netlify/functions/backfill-gbp-hours.js":  ["=1500"],
  // `commit_3mo` recorded 2026-09-14: priceCtx() looks plans up BY KEY out of contract-generate.PLANS.
  // It is a plan identifier, not an amount — but it is recorded here rather than pattern-excused, so
  // that any FURTHER price token appearing in this file still fails the gate.
  "netlify/functions/flow-execute.js":        [": 1500",": 3500",": 750","commit_3mo"],
  "netlify/functions/v2-rank-grid-background.js": [": 1500"],
};

// What counts as reading a source rather than owning one.
const SOURCE_REFS = ["contract-generate", "contract-pricing", "plans.json", "offer-pricing",
                     "firstInvoiceAmount", "contractPriceSummary", "invoice-doc", "PLANS", "plans["];

const PROSE = /\$\s?(?:1,?250|625|1,?875|2,?500|3,?750|5,?000|1,?500|3,?500|1,?750|750)\b|commit_3mo|beta_unbilled|done_for_you/g;
const CODE  = /(?:return|=|:)\s*(?:1250|625|1875|2500|3750|5000|1500|3500|1750|750)\b|commit_3mo|beta_unbilled|done_for_you/g;
// A price ASSIGNED or RETURNED — the shape that means "this file decides the number".
const OWNS_A_PRICE = /(?:return|=|:)\s*(?:1250|625|1875|2500|3750|5000|1500|3500|1750|750)\b/g;

// 🔴 Strip comments before asking "does this file own a price". stripe-webhook.js documents the old
// $2,500 bug in prose; a gate that cannot tell a comment from code punishes writing the lesson down.
// Conservative on purpose: only whole-line `//`, so `https://` inside a string is never touched.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

console.log("── every EXCLUDED / DERIVED price excuse is re-proved from the file ──");

if (!fs.existsSync(GATE)) { console.log(`  ⚠️  missing: ${GATE}`); process.exit(2); }
let SURFACES;
try {
  const m = fs.readFileSync(GATE, "utf8").match(/const SURFACES = \{[\s\S]*?\n\};/);
  if (!m) throw new Error("SURFACES block not found");
  SURFACES = new Function(m[0] + "; return SURFACES;")();
} catch (e) {
  console.log(`  ⚠️  could not read the inventory: ${e.message}`);
  process.exit(2);
}

const read = (rel) => {
  const p = path.join(SITE, rel);
  if (!fs.existsSync(p)) return null;
  let s = fs.readFileSync(p, "utf8");
  // Sabotage re-creates defect #3: a DERIVED file that quietly grows its own price table again.
  if (SABOTAGE && rel === "netlify/functions/admin-record-payment.js") {
    s += '\nfunction sneak(t){ if (t === "commit_3mo") return 2500; return 0; }\n';
  }
  return s;
};

let fails = 0, derivedOk = 0, excludedOk = 0, skipped = 0;

for (const [rel, [kind, why]] of Object.entries(SURFACES)) {
  const src = read(rel);
  if (src == null) { skipped++; continue; }   // staleness is the other gate's job
  const isCode = /\.(js|json)$/.test(rel);

  if (kind === "DERIVED") {
    const problems = [];
    if (isCode && !SOURCE_REFS.some((r) => src.includes(r))) {
      problems.push("claims DERIVED but references no source");
    }
    const bare = [...new Set((stripComments(src).match(OWNS_A_PRICE) || []).map((t) => t.replace(/\s+/g, " ").trim()))];
    if (bare.length) problems.push(`owns a price literal: ${bare.join(", ")}`);
    if (problems.length) {
      console.log(`  🔴 ${rel}`);
      console.log(`       excuse: "${why}"`);
      problems.forEach((p) => console.log(`       ${p}`));
      fails++;
    } else { derivedOk++; }
    continue;
  }

  if (kind === "EXCLUDED") {
    const allow = ALLOWED[rel];
    if (!allow) {
      console.log(`  🔴 ${rel} is EXCLUDED but has no recorded evidence.`);
      console.log("       Add its current tokens to ALLOWED so a NEW price cannot slip in under the excuse.");
      fails++; continue;
    }
    const re = isCode ? CODE : PROSE; re.lastIndex = 0;
    const toks = [...new Set((src.match(re) || []).map((t) => t.replace(/\s+/g, " ").trim()))].sort();
    const novel = toks.filter((t) => !allow.includes(t));
    if (novel.length) {
      console.log(`  🔴 ${rel}`);
      console.log(`       excuse: "${why}"`);
      console.log(`       it now ALSO contains: ${novel.join(", ")} — the excuse was not written for these.`);
      fails++;
    } else { excludedOk++; }
    continue;
  }
}

if (derivedOk + excludedOk === 0) {
  console.log("  ⚠️  nothing was checked — the inventory or the file paths are wrong.");
  process.exit(2);
}

console.log(`  ${derivedOk} DERIVED re-proved · ${excludedOk} EXCLUDED re-proved${skipped ? ` · ${skipped} file(s) absent` : ""}`);

if (fails) {
  console.log(`\n🔴 ${fails} excuse(s) no longer cover their file.`);
  console.log("   Three live billing defects hid behind an excuse that was true when written.");
  console.log("   Either fix the file to derive, or rewrite the excuse and record the new evidence.");
  process.exit(1);
}
console.log("\n✅ every excuse still holds — no file is exempted by a claim nobody re-checked.");
process.exit(0);
