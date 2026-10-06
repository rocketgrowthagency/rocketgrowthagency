#!/usr/bin/env node
/**
 * check-every-stripe-charge-reached-our-ledger.mjs — money in Stripe must equal money in our books.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-11, the day the test-card path was removed and the next payment is a real one.
 *
 * Everything after a payment — stage advance, invoice ledger, saved card, receipt — hangs off ONE
 * webhook delivery. If it does not arrive (endpoint disabled, signing secret rotated, a deploy that
 * broke the handler), Stripe shows the money and our system shows an unpaid client, who then gets
 * chased for an invoice they already paid.
 *
 * 🔑 A webhook is a PUSH, and a failed push is SILENCE — which is indistinguishable from "nobody
 * paid today". The only way to tell those apart is to PULL and compare. That is this gate.
 *
 * 🔑 It is deliberately a READ. A reconciler that repairs its own findings hides the fact that the
 * webhook is broken, and the webhook is the thing that needs fixing.
 *
 * Exit 0 = every charge is in the ledger (or there were none) · 1 = money taken, nothing recorded
 *        · 2 = could not tell.
 */
import { execFileSync } from "node:child_process";

// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT. A gate that can only ever read the real
// working tree cannot be pointed at a scratch copy, so its mutations cannot be run — and a
// gate nobody can make fail is a gate nobody has checked. Found 2026-10-06 when three
// mutations of `check-refusal-is-not-done` all came back green: it was reading straight past
// them. → feedback_a_gate_that_cannot_fail · feedback_the_harness_i_wrote_to_check_my_work_can_lie
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SITE = `${__SITE}`;
const FN = "https://www.rocketgrowthagency.com/.netlify/functions/stripe-reconcile-payments";
const DAYS = 7;

console.log("── every Stripe charge reached our ledger ──");

let secret;
try {
  secret = execFileSync("netlify", ["env:get", "INTERNAL_FN_SECRET", "--context", "production"],
    { cwd: SITE, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    .trim().split("\n").pop().trim();
} catch (e) {
  console.log(`  ⚠️  could not read INTERNAL_FN_SECRET (netlify CLI not logged in?): ${e.message}`);
  process.exit(2);
}
if (!secret || secret.length < 8) {
  console.log("  ⚠️  INTERNAL_FN_SECRET came back empty or masked.");
  process.exit(2);
}

async function ask(payload) {
  const res = await fetch(FN, {
    method: "POST",
    headers: { "x-internal-secret": secret, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const ctype = res.headers.get("content-type") || "";
  if (!ctype.includes("application/json")) throw new Error(`${res.status} returned ${ctype || "no content-type"}, not JSON`);
  return res.json();
}

// ── 0. CAN IT DETECT ANYTHING AT ALL? ─────────────────────────────────────────────────────────
// 🔴 The Stripe account has taken ZERO live payments, so a green run below means "we looked and
// found nothing" — which is exactly what a completely broken reconciler also reports. Before
// trusting silence, push a charge through the REAL comparison that CANNOT be in the ledger and
// confirm it gets flagged. → feedback_fix_the_class_not_the_instance (a gate is only as honest as
// its input set) · feedback_a_check_must_not_validate_itself
try {
  const probe = await ask({
    fixture: [{
      id: "pi_selftest_not_a_real_charge", status: "succeeded", amount: 100000,
      created: Math.floor(Date.now() / 1000),
      // invoice #99991 cannot exist for any client, so this MUST come back as missing.
      metadata: { client_id: "00000000-0000-0000-0000-000000000000", invoice_num: "99991" },
    }],
  });
  if (probe?.missing_from_ledger?.length !== 1) {
    console.log("  ⚠️  SELF-TEST FAILED — a charge that cannot be in the ledger was not flagged.");
    console.log(`     Got: ${JSON.stringify(probe).slice(0, 180)}`);
    console.log("     A reconciler that cannot detect a known miss cannot be trusted when it says all is well.");
    process.exit(2);
  }
} catch (e) {
  console.log(`  ⚠️  self-test could not run: ${e.message}`);
  process.exit(2);
}

let data;
try {
  const res = await fetch(FN, {
    method: "POST",
    headers: { "x-internal-secret": secret, "Content-Type": "application/json" },
    body: JSON.stringify({ days: DAYS }),
  });
  // 🔴 A 200 proves nothing by itself — an error page is also a 200 here.
  const ctype = res.headers.get("content-type") || "";
  if (!ctype.includes("application/json")) {
    console.log(`  ⚠️  probe returned ${res.status} as ${ctype || "no content-type"} — not our JSON.`);
    process.exit(2);
  }
  data = await res.json();
} catch (e) {
  console.log(`  ⚠️  could not reach stripe-reconcile-payments: ${e.message}`);
  process.exit(2);
}

if (data?.ok === false && data?.error) {
  console.log(`  ⚠️  the reconciler could not run: ${data.error}`);
  process.exit(2);
}
if (typeof data?.charges_found !== "number") {
  console.log("  ⚠️  the deployed reconciler did not answer in the expected shape — redeploy the site.");
  process.exit(2);
}

const missing = data.missing_from_ledger || [];
const unattributed = data.unattributed || [];

if (missing.length) {
  console.log(`  🔴 ${missing.length} charge(s) Stripe collected are NOT paid in our ledger:`);
  for (const m of missing) {
    console.log(`       ${m.id}  $${m.amount}  client ${m.client_id}  invoice #${m.invoice_num}  → ledger says: ${m.ledger_status}`);
  }
  console.log("     A client has paid and our system does not know. The live webhook is the");
  console.log("     first thing to check — nothing else produces this symptom.");
  console.log("     → netlify/functions/stripe-webhook.js · project_stripe_go_live");
  process.exit(1);
}

// 🔑 Zero charges is NOT a proof that the webhook works — say so plainly rather than printing a
// green tick that means "we asked and there was nothing to ask about".
if (data.charges_found === 0) {
  console.log(`  ✅ no succeeded payments in the last ${DAYS} days — nothing to reconcile`);
  console.log("     (self-test passed, so this silence is a real absence — not a broken probe)");
} else {
  console.log(`  ✅ ${data.reconciled.length}/${data.charges_found} charge(s) in the last ${DAYS} days are paid in our ledger`);
}

// Money we cannot tie to a client is not necessarily a fault — a Payment Link or a dashboard charge
// has no client_id — but it must never be filtered away silently.
if (unattributed.length) {
  console.log(`  ℹ️  ${unattributed.length} charge(s) carry no client_id and cannot be reconciled:`);
  for (const u of unattributed) console.log(`       ${u.id}  $${u.amount}  ${u.created}`);
}
process.exit(0);
