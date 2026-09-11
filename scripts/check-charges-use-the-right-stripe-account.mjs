#!/usr/bin/env node
/**
 * check-charges-use-the-right-stripe-account.mjs — a charge must land where the card is.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-10. Test mode at RGA is a CLIENT ALLOW-LIST (`STRIPE_TEST_CLIENT_IDS`), not a deploy
 * flag — so production can always take real money while one client pays with a test card. That
 * only works if EVERY code path that talks to Stripe picks its key the same way.
 *
 * `billing-daily-check` did not. It held one module-global `STRIPE_SECRET_KEY` (live), so the
 * renewal charge for a test client would have gone to the LIVE account with a TEST customer id and
 * failed with "No such customer". Consequence: the auto-pay path could never be exercised, and the
 * first time anyone found out would have been a real client's renewal.
 *
 * 🔑 The reverse is the dangerous direction, and it is the same bug: a path that resolved the TEST
 * key for a REAL client would silently stop collecting money while reporting success.
 *
 * RULE: any file that creates a PaymentIntent or a Checkout Session must choose its secret key
 * from the client id. Reading `process.env.STRIPE_SECRET_KEY` straight into the Authorization
 * header is the defect.
 *
 * Exit 0 = every charge path resolves per client · 1 = one is pinned to an account · 2 = can't tell.
 */
import fs from "node:fs";
import path from "node:path";

const SITE = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const DIR = path.join(SITE, "netlify/functions");
const SABOTAGE = process.env.SABOTAGE === "1";

// Endpoints that MOVE MONEY. A read (customers.retrieve, prices.list) is not in scope.
const CHARGING = /\/v1\/(payment_intents|checkout\/sessions|charges|setup_intents)/;

// 🔴 2026-09-11 — THE PATH ALONE IS NOT THE TEST. `stripe-reconcile-payments.js` LISTS succeeded
// PaymentIntents to compare them against our ledger; it creates nothing and moves nothing, but it
// names `/v1/payment_intents`, so it was flagged as a charge path pinned to the live account.
// 🔑 That is the correct key for a read — the live key is the only one that can see live charges.
// The header comment already said "a read is not in scope"; the PROBE could not tell a read from a
// write, so it enforced something the rule never claimed.
// Every real charge path here issues an explicit POST (directly or via a `stripePost` helper), so
// a file that names a money endpoint and never POSTs at all cannot be creating a charge.
const WRITES = /method:\s*["']POST["']|stripePost\s*\(/;

console.log("── every Stripe charge path picks its key from the client ──");

if (!fs.existsSync(DIR)) { console.log(`  ⚠️  missing: ${DIR}`); process.exit(2); }

let files;
try { files = fs.readdirSync(DIR).filter((f) => f.endsWith(".js")); }
catch (e) { console.log(`  ⚠️  could not list functions: ${e.message}`); process.exit(2); }

const charging = [];
const readOnly = [];
for (const f of files) {
  let src = fs.readFileSync(path.join(DIR, f), "utf8");
  if (SABOTAGE && f === "billing-daily-check.js") {
    // Re-create the defect: pin the charge back to the module-global live key.
    src = src.replace(/async function stripePost\(path, body, extraHeaders = \{\}, secretKey = STRIPE_SECRET_KEY\)/,
                      "async function stripePost(path, body, extraHeaders = {})")
             .replace(/Authorization: `Bearer \$\{secretKey\}`/, "Authorization: `Bearer ${STRIPE_SECRET_KEY}`");
  }
  if (!CHARGING.test(src)) continue;
  // 🔑 Name the read-only ones out loud. A file that silently drops out of scope is how a real
  // charge path stops being checked without anyone noticing. → feedback_dead_check_selector_gap
  if (!WRITES.test(src)) { readOnly.push(f); continue; }
  charging.push([f, src]);
}

if (!charging.length) {
  console.log("  ⚠️  found NO charging code at all — the probe must be wrong.");
  process.exit(2);  // 🔴 a mass-empty result means the pattern broke, not that charging vanished.
}

let fails = 0;
for (const [f, src] of charging) {
  // Does the file know that test mode is per client?
  const knowsAllowList = /STRIPE_TEST_CLIENT_IDS/.test(src);
  // Does the Authorization header read a RESOLVED key rather than the module-global live one?
  const authLines = [...src.matchAll(/Authorization:\s*`Bearer \$\{([^}]+)\}`/g)].map((m) => m[1].trim());
  const stripeAuth = authLines.filter((v) => /STRIPE|secret|key/i.test(v));
  const pinnedLive = stripeAuth.filter((v) => v === "STRIPE_SECRET_KEY" || v === "process.env.STRIPE_SECRET_KEY");

  const problems = [];
  if (!knowsAllowList) problems.push("never reads STRIPE_TEST_CLIENT_IDS — it cannot know which account the card is in");
  if (pinnedLive.length) problems.push(`Authorization is pinned to ${pinnedLive[0]} — not resolved from the client`);
  if (!stripeAuth.length) problems.push("could not find the Stripe Authorization header — the shape changed");

  if (problems.length) {
    console.log(`  🔴 ${f}`);
    problems.forEach((p) => console.log(`       ${p}`));
    fails++;
  } else {
    console.log(`  ✅ ${f.padEnd(30)} key resolved per client`);
  }
}

if (fails) {
  console.log(`\n🔴 ${fails} charge path(s) are pinned to one Stripe account.`);
  console.log("   A test client charged on the live account fails with 'No such customer'.");
  console.log("   A real client charged on the test account silently collects NOTHING.");
  process.exit(1);
}
if (readOnly.length) console.log(`  \u2139\ufe0f  read-only, not a charge path: ${readOnly.join(", ")}`);
console.log(`\n✅ all ${charging.length} charge path(s) resolve the key from the client id.`);
process.exit(0);
