#!/usr/bin/env node
/**
 * check-price-consistency.mjs — the same price in every place a client encounters it.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * A client meets the price THREE times, in three different files:
 *
 *   1. On the phone      → admin/playbook.js          (the rep reads it aloud)
 *   2. In the email      → admin/admin.js phase0Links (the confirmation, within the hour)
 *   3. In the agreement  → netlify/functions/contract-generate.js PLANS (what they sign)
 *
 * 🔴 These drifted once already and it was not caught by anyone reading the code. Until 2026-08-25
 * `contract-generate` billed ~2× the playbook: close someone at $1,875 month-to-month, press "Send
 * contract", and they open a document charging $3,750. That is not a bug you apologise for — it is
 * the end of the relationship, on day one, in writing.
 *
 * 🔑 It was fixed by hand. Nothing stopped it recurring, and the third copy (the confirmation email)
 * did not exist yet — so the surface for this class of error just grew.
 *
 * 🔴 A stale WARNING about it also outlived the fix by 12 days and told everyone "do not send the
 * contract", which blocked the delivery SOP. Both failure directions are expensive.
 *
 * This is a gate rather than a comment, because a comment cannot fail a build.
 *
 * Exit 0 = every source agrees. 1 = they do not. 2 = a source could not be read.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT. A gate that can only ever read the real
// working tree cannot be pointed at a scratch copy, so its mutations cannot be run — and a
// gate nobody can make fail is a gate nobody has checked. Found 2026-10-06 when three
// mutations of `check-refusal-is-not-done` all came back green: it was reading straight past
// them. → feedback_a_gate_that_cannot_fail · feedback_the_harness_i_wrote_to_check_my_work_can_lie
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const WEB = `${__SITE}`;
const CONTRACT = path.join(WEB, "netlify", "functions", "contract-generate.js");
const ADMIN = path.join(WEB, "admin", "admin.js");
const PLAYBOOK = path.join(WEB, "admin", "playbook.js");

for (const f of [CONTRACT, ADMIN, PLAYBOOK]) {
  if (!fs.existsSync(f)) { console.error(`✗ cannot read ${f}`); process.exit(2); }
}

// 🔒 THE OFFER, as sold. Change this ONLY when Chris changes the actual price — and expect every
// source below to need updating with it. That is the point: one deliberate edit, three enforced.
const OFFER = {
  setup: 1250,
  monthly: 625,
  m2m_month_one: 1875,     // setup + first month
  commit_3mo_total: 2500,  // 1250 + 625 + 625
};

const fails = [];
console.log("── price consistency: phone → email → agreement ──");

// 1. THE AGREEMENT — deterministic PLANS table, evaluated in isolation.
let PLANS;
try {
  const src = fs.readFileSync(CONTRACT, "utf8");
  const start = src.indexOf("const PLANS");
  const end = src.indexOf("\n};", start) + 3;
  PLANS = eval(src.slice(start, end) + "; PLANS");
} catch (e) {
  console.error(`✗ could not evaluate the PLANS table: ${e.message}`);
  process.exit(2);
}

const m1 = PLANS.monthly?.schedule?.[0]?.amount;
const mAfter = PLANS.monthly?.recurring_after_term;
const cTotal = (PLANS.commit_3mo?.schedule || []).reduce((a, x) => a + x.amount, 0);
const cAfter = PLANS.commit_3mo?.recurring_after_term;

const chk = (label, actual, expected) => {
  const ok = actual === expected;
  if (!ok) fails.push(label);
  console.log(`  ${ok ? "✅" : "🔴"} ${label.padEnd(44)} ${actual} ${ok ? "" : `≠ ${expected}`}`);
};
chk("agreement · month-to-month, month 1", m1, OFFER.m2m_month_one);
chk("agreement · month-to-month, ongoing", mAfter, OFFER.monthly);
chk("agreement · 3-month plan, total", cTotal, OFFER.commit_3mo_total);
chk("agreement · 3-month plan, after term", cAfter, OFFER.monthly);

// 2. THE CONFIRMATION EMAIL — the numbers the client reads an hour after the call.
const adminSrc = fs.readFileSync(ADMIN, "utf8");
const phase0 = adminSrc.slice(adminSrc.indexOf("function phase0Links"), adminSrc.indexOf("function renderPhase0"));
if (!phase0) {
  fails.push("email template missing");
  console.log("  🔴 phase0Links not found in admin.js — the confirmation email has no price to check");
} else {
  const fmt = (n) => `$${n.toLocaleString()}`;
  for (const [label, n] of [
    ["email · month-one figure", OFFER.m2m_month_one],
    ["email · ongoing monthly", OFFER.monthly],
    ["email · setup fee", OFFER.setup],
    ["email · 3-month total", OFFER.commit_3mo_total],
  ]) {
    const ok = phase0.includes(fmt(n));
    if (!ok) fails.push(label);
    console.log(`  ${ok ? "✅" : "🔴"} ${label.padEnd(44)} ${ok ? fmt(n) : `${fmt(n)} ABSENT from the draft`}`);
  }
}

// 3. THE REP-FACING PLAYBOOK — what is said out loud, before anything is written down.
const pbSrc = fs.readFileSync(PLAYBOOK, "utf8");
for (const [label, n] of [
  ["playbook · month-one figure", OFFER.m2m_month_one],
  ["playbook · ongoing monthly", OFFER.monthly],
  ["playbook · 3-month total", OFFER.commit_3mo_total],
]) {
  const ok = pbSrc.includes(`$${n.toLocaleString()}`) || pbSrc.includes(String(n));
  if (!ok) fails.push(label);
  console.log(`  ${ok ? "✅" : "🔴"} ${label.padEnd(44)} ${ok ? "present" : "ABSENT — the rep says a number nothing else knows"}`);
}

// 4. THE CONFIRMATION EMAIL — the FIRST place a client reads the price back.
// 🔴 2026-09-09. This function described the plans in its OWN words and got three of four wrong:
// it matched a tier "three_month" that does not exist (the real key is `commit_3mo`, so a 3-month
// client would have been told they were month-to-month), computed the 3-month total as price x 3
// (1,875, not the real 2,500), and rendered month-to-month as "$625/month" while dropping the
// $1,250 setup. Only beta_unbilled was right — the one tier RGA is on — so a live send LOOKED fine.
// 🔑 It must READ the PLANS table, not restate it. Restating is what drifts.
const EMAIL = path.join(WEB, "netlify", "functions", "send-confirmation-email.js");
if (fs.existsSync(EMAIL)) {
  const emailSrc = fs.readFileSync(EMAIL, "utf8");
  // 🔴 SCOPE THIS TO planLine(). A presence-check over the whole file passed under sabotage,
  // because an unrelated `require("./contract-generate.js")` in an error message kept matching
  // while the price logic had been replaced by a hardcoded table. Check the function that actually
  // builds the number, not the file that happens to mention the module.
  const plStart = emailSrc.indexOf("function planLine");
  const plEnd = emailSrc.indexOf("function buildEmail");
  const planLineSrc = plStart >= 0 && plEnd > plStart ? emailSrc.slice(plStart, plEnd) : "";
  if (!planLineSrc) {
    fails.push("planLine() not found");
    console.log("  🔴 planLine() not found in the confirmation email — renamed?");
  }
  const readsPlans = /require\(["']\.\/contract-generate(\.js)?["']\)/.test(planLineSrc)
    && /PLANS\[[^\]]*tier[^\]]*\]/.test(planLineSrc)
    && !/schedule:\s*\[/.test(planLineSrc);   // a literal schedule here means it is restating the offer
  if (readsPlans) {
    console.log("  ✅ confirmation email reads PLANS from the contract generator");
  } else {
    fails.push("confirmation email restates the plans");
    console.log("  🔴 the confirmation email does not read PLANS — it is describing the offer in its");
    console.log("     own words, which is exactly how the rep, the email and the agreement drift apart");
  }
  // An unknown or price-less tier must REFUSE, never fall through to a cheerful default.
  const refuses = /return null;/.test(emailSrc) && /is not a known plan/.test(emailSrc);
  console.log(`  ${refuses ? "✅" : "🔴"} unknown tier ${refuses ? "refuses rather than guessing" : "IS NOT REFUSED — a wrong plan can reach a client"}`);
  if (!refuses) fails.push("email does not refuse an unknown tier");
} else {
  console.log("  ▫️  send-confirmation-email.js not found — skipped");
}

// 5. THE PLAN PICKER — what the REP reads before choosing what to send.
// 🔴🔴 2026-09-09. admin.js hardcoded the plan blurbs with the PRE-DISCOUNT numbers:
//     shown : "Month 1 $2,500 + Month 2 $1,250 + Month 3 $1,250 = $5,000 over 3 months LOCKED"
//     sent  : $1,250 + $625 + $625 = $2,500, cancel any time
// Exactly 2x, plus a "locked" claim contradicting an agreement that is explicitly cancel-anytime.
// contract-generate.js was repriced 2026-08-25; the picker was not. This gate did not catch it
// because it checked the playbook, the contract and the email — not the screen the rep decides on.
// The blurbs are now DERIVED from data/plans.json, which is generated from PLANS. Verify the two
// still agree, or the derivation is worthless.
const PLANS_JSON = path.join(WEB, "data", "plans.json");
if (!fs.existsSync(PLANS_JSON)) {
  fails.push("data/plans.json missing");
  console.log("  🔴 data/plans.json is missing — the admin plan picker has no prices to derive from");
} else {
  const pj = JSON.parse(fs.readFileSync(PLANS_JSON, "utf8"));
  const drift = [];
  for (const [code, plan] of Object.entries(PLANS)) {
    const mirrored = pj[code];
    if (!mirrored) { drift.push(`${code}: absent from plans.json`); continue; }
    const a = JSON.stringify(plan.schedule || null);
    const b = JSON.stringify(mirrored.schedule || null);
    if (a !== b) drift.push(`${code}: schedule ${a} vs ${b}`);
    if (Number(plan.recurring_after_term || 0) !== Number(mirrored.recurring_after_term || 0)) {
      drift.push(`${code}: recurring ${plan.recurring_after_term} vs ${mirrored.recurring_after_term}`);
    }
    if (plan.early_termination !== mirrored.early_termination) {
      drift.push(`${code}: terms "${plan.early_termination}" vs "${mirrored.early_termination}"`);
    }
  }
  if (drift.length) {
    fails.push("plans.json drift");
    console.log(`  🔴 data/plans.json disagrees with contract-generate PLANS (${drift.length}):`);
    drift.forEach((d) => console.log(`       ${d}`));
    console.log("     Regenerate it — the rep is being shown a price the contract will not charge.");
  } else {
    console.log(`  ✅ plan picker mirrors the contract exactly (${Object.keys(PLANS).length} plans)`);
  }
  // 🔴 And no hardcoded money may remain in the picker's own copy.
  const adminSrc = fs.readFileSync(path.join(WEB, "admin", "admin.js"), "utf8");
  const block = adminSrc.slice(adminSrc.indexOf("let CONTRACT_PLANS"), adminSrc.indexOf("async function loadContractPlans"));
  const hard = [...block.matchAll(/\$[0-9][0-9,]{2,}/g)].map((m) => m[0]);
  if (hard.length) {
    fails.push("hardcoded price in the picker");
    console.log(`  🔴 the plan picker still hardcodes money: ${[...new Set(hard)].join(", ")}`);
  } else {
    console.log("  ✅ the plan picker hardcodes no prices — every figure is derived");
  }
}

console.log("");
if (fails.length) {
  console.error(`🔴 PRICE DRIFT — ${fails.length} mismatch(es).`);
  console.error(`   A client hears a number, reads it, then signs it. All three must agree.`);
  console.error(`   If the OFFER genuinely changed, update OFFER in this file AND all three sources.`);
  process.exit(1);
}
console.log("✅ phone, email and agreement all state the same price");
