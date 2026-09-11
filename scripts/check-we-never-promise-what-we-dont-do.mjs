#!/usr/bin/env node
/**
 * check-we-never-promise-what-we-dont-do.mjs — client-facing copy must match client-facing behaviour.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-10, two shipped at once:
 *
 *   1. The pre-billing notice said "we'll charge the card on file" UNCONDITIONALLY. It went out for
 *      a client whose client_subscriptions row was empty — promising an automatic charge that could
 *      not happen. They would correctly do nothing, and get an OVERDUE notice eight days later for
 *      an invoice we had told them was handled.
 *
 *   2. The payment success banner said "Stripe will email you a receipt." Stripe does not; WE do,
 *      from our own branded sender. If Stripe's dashboard receipts are ever off, the client waits
 *      for an email that never comes — and if they are on, they get two.
 *
 * 🔑 Both are the same defect: copy asserting a behaviour nobody verified the system performs. It
 * is invisible in review because the sentence reads perfectly — you have to know what the code
 * does to see that it is false.
 *
 * This gate RUNS the tone selector with and without a card, rather than grepping for a phrase,
 * because the property is "the promise follows the facts", not "this string is absent".
 *
 * Exit 0 = every promise is backed · 1 = we assert something we do not do · 2 = could not tell.
 */
import fs from "node:fs";
import path from "node:path";

const SITE = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SABOTAGE = process.env.SABOTAGE === "1";

console.log("── client-facing copy only promises what the system actually does ──");

let fails = 0;

// ── 1. THE AUTO-CHARGE PROMISE IS CONDITIONAL ON A CARD ───────────────────────────────────────
const SENDER = path.join(SITE, "netlify/functions/send-invoice-email.js");
if (!fs.existsSync(SENDER)) { console.log(`  ⚠️  missing: ${SENDER}`); process.exit(2); }

let src = fs.readFileSync(SENDER, "utf8");
if (SABOTAGE) {
  // Re-create the defect: make the charge-promise copy unconditional again.
  const before = src;
  src = src.replace(/upcoming: hasCardOnFile \? \{/, "upcoming: true ? {");
  if (src === before) { console.log("  ⚠️  SABOTAGE did not apply — the pattern is stale."); process.exit(2); }
}

// Pull the TONES object and evaluate it both ways. Everything it needs is injected.
const m = src.match(/const TONES = \{[\s\S]*?\n  \};/);
if (!m) { console.log("  ⚠️  could not locate TONES — the shape changed."); process.exit(2); }

function tonesWith(hasCardOnFile) {
  const fn = new Function("hasCardOnFile", "esc", "first", "amount", "dueStr", "PORTAL",
    m[0] + "; return TONES;");
  return fn(hasCardOnFile, (s) => String(s), "Eli", "$625", "October 11, 2026", "https://x/");
}

const PROMISES_A_CHARGE = /charge the card on file|we'll charge your card|card will be charged/i;

for (const hasCard of [true, false]) {
  let tones;
  try { tones = tonesWith(hasCard); }
  catch (e) { console.log(`  ⚠️  TONES threw (hasCard=${hasCard}): ${e.message}`); process.exit(2); }

  const up = tones.upcoming || {};
  const blob = `${up.title || ""} ${up.intro || ""} ${up.cta || ""} ${up.foot || ""}`;
  const promises = PROMISES_A_CHARGE.test(blob);

  if (hasCard && !promises) {
    console.log("  🔴 a client WITH a saved card is not told we will charge it — the pre-billing");
    console.log("     notice exists to prevent a surprise charge being disputed.");
    fails++;
  } else if (!hasCard && promises) {
    console.log("  🔴 a client with NO card on file is told \"we'll charge the card on file\".");
    console.log(`     copy: ${String(up.title || "").slice(0, 70)}`);
    console.log("     They will do nothing, then be marked overdue for an invoice we said was handled.");
    fails++;
  } else {
    console.log(`  ✅ card ${hasCard ? "on file " : "absent  "} → "${String(up.title || "").slice(0, 52)}"`);
  }
}

// ── 2. WE DO NOT ATTRIBUTE OUR OWN EMAIL TO STRIPE ────────────────────────────────────────────
// This one IS a phrase check, and legitimately so: the claim is the defect. Scanning every
// client-facing surface, not just the one that had it.
const SURFACES = ["portal/portal.js", "admin/admin.js", "netlify/functions/notify-client-stage.js",
                  "netlify/functions/send-invoice-email.js", "netlify/functions/send-confirmation-email.js"];
const FALSE_ATTRIBUTION = /Stripe will (email|send)[^.]{0,40}receipt/i;

let attributed = 0;
for (const rel of SURFACES) {
  const p = path.join(SITE, rel);
  if (!fs.existsSync(p)) continue;
  let s = fs.readFileSync(p, "utf8");
  if (SABOTAGE && rel === "portal/portal.js") s += '\nconst x = "Stripe will email you a receipt.";\n';
  if (FALSE_ATTRIBUTION.test(s)) {
    console.log(`  🔴 ${rel} tells the client STRIPE sends the receipt — we send it, branded.`);
    attributed++;
  }
}
if (attributed) fails += attributed;
else console.log(`  ✅ no surface attributes our receipt to Stripe (${SURFACES.length} checked)`);

if (fails) {
  console.log(`\n🔴 ${fails} promise(s) the system does not keep.`);
  console.log("   Copy that asserts unverified behaviour reads perfectly and is still a lie.");
  process.exit(1);
}
console.log("\n✅ every client-facing promise is backed by what the code actually does.");
process.exit(0);
