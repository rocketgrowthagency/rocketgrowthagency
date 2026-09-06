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
const WEB = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
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

console.log("");
if (fails.length) {
  console.error(`🔴 PRICE DRIFT — ${fails.length} mismatch(es).`);
  console.error(`   A client hears a number, reads it, then signs it. All three must agree.`);
  console.error(`   If the OFFER genuinely changed, update OFFER in this file AND all three sources.`);
  process.exit(1);
}
console.log("✅ phone, email and agreement all state the same price");
