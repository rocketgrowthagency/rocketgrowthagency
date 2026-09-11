#!/usr/bin/env node
/**
 * check-decline-copy-is-client-facing.mjs — a refused card never explains our integration.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-11. The portal printed Stripe's error text verbatim, on the reasoning — written in a
 * comment right above the line — that "Stripe's messages are written for end users". Mostly true.
 * Not true for every code: a test card in live mode returns
 *
 *     "Your card was declined. Your request was in live mode, but used a known test card."
 *
 * A paying client should never read that. It exposes that our checkout has modes, and it reads as
 * if the system is half-built. Chris: *"the client doesn't need to know it's a known test card or
 * live site."*
 *
 * 🔑 THE CLASS, not the instance. The defect is not "one bad string" — it is handing a client
 * whatever the API happened to say. Any future Stripe code, including ones that do not exist yet,
 * arrives through the same line. So this gate checks the DEFAULT path, not a blocklist of phrases:
 * an unrecognised code must fall back to our own copy.
 *
 * 🔑 It runs the REAL function rather than re-describing it. A gate with its own copy of the logic
 * passes while production is broken. → feedback_a_check_must_not_validate_itself
 *
 * Exit 0 = every decline shows our copy · 1 = a raw Stripe message can reach a client · 2 = can't tell.
 */
import fs from "node:fs";

const PORTAL = "/Users/chris/RGA/Rocket Growth Agency Website VS Code/portal/portal.js";

console.log("── a declined card shows OUR copy, never Stripe's internals ──");

let src;
try { src = fs.readFileSync(PORTAL, "utf8"); }
catch (e) { console.log(`  ⚠️  cannot read portal.js: ${e.message}`); process.exit(2); }

// ── 1. the handler must not print the raw message ──────────────────────────────────────────────
// This is the line that caused it. If it comes back, everything below still passes — the mapper
// would exist and be correct, and simply not be used. → feedback_a_guard_must_reach_the_thing_it_guards
const RAW_IN_UI = /errEl\.textContent\s*=\s*`?\$?\{?\s*result\.error\.message/;
if (RAW_IN_UI.test(src)) {
  console.log("  🔴 the payment error element is set from result.error.message directly.");
  console.log("     Stripe's text reaches the client unfiltered — route it through declineMessage().");
  process.exit(1);
}
if (!/errEl\.textContent\s*=\s*`\$\{declineMessage\(/.test(src)) {
  console.log("  ⚠️  could not find the declineMessage() call that renders the payment error —");
  console.log("     the shape changed. Re-point this gate before trusting it.");
  process.exit(2);
}

// ── 2. run the real mapper ─────────────────────────────────────────────────────────────────────
const START = "const DECLINE_COPY = {";
const END = "  return PAYMENT_UNAVAILABLE;\n}";
const i = src.indexOf(START);
const j = src.indexOf(END);
if (i < 0 || j < 0 || j < i) {
  console.log("  ⚠️  could not locate the DECLINE_COPY → declineMessage block. Re-point this gate.");
  process.exit(2);
}
const block = src.slice(i, j + END.length);

let declineMessage;
try {
  declineMessage = new Function(`${block}; return declineMessage;`)();
} catch (e) {
  console.log(`  ⚠️  the mapper would not evaluate: ${e.message}`);
  process.exit(2);
}

// Anything that names our integration, the API, or the mode we run in.
const LEAK = /live mode|test mode|test card|api key|payment ?intent|pi_|sk_|pk_|decline_code|stripe/i;

const CASES = [
  // the one Chris actually saw
  { label: "test card in live mode", err: { type: "card_error", code: "card_declined", decline_code: "live_mode_test_card",
      message: "Your card was declined. Your request was in live mode, but used a known test card." } },
  { label: "the reverse (live card, test mode)", err: { type: "card_error", code: "card_declined", decline_code: "test_mode_live_card",
      message: "Your card was declined. Your request was in test mode, but used a live card." } },
  // 🔑 THE IMPORTANT ONE: a code that does not exist yet must still land on our copy.
  { label: "an unknown future decline code", err: { type: "card_error", code: "card_declined", decline_code: "some_code_stripe_adds_in_2027",
      message: "Something internal we have never seen." }, expect: "generic" },
  { label: "bank refused, no reason", err: { type: "card_error", code: "card_declined", decline_code: "generic_decline" }, expect: "generic" },
  // 🔴 Fraud signals must read as an ordinary decline — never tell the holder of a stolen card why.
  { label: "fraudulent", err: { type: "card_error", code: "card_declined", decline_code: "fraudulent" }, expect: "generic" },
  { label: "stolen card", err: { type: "card_error", code: "card_declined", decline_code: "stolen_card" }, expect: "generic" },
  // self-fixable ones stay specific, or the client phones their bank about a typo
  { label: "wrong CVC", err: { type: "card_error", code: "incorrect_cvc" }, expect: "specific" },
  { label: "expired card", err: { type: "card_error", code: "expired_card" }, expect: "specific" },
  { label: "wrong ZIP", err: { type: "card_error", code: "incorrect_zip" }, expect: "specific" },
  // 🔴 not a card problem — must NOT tell them to call their bank about our outage
  { label: "our API failed", err: { type: "api_error", message: "Stripe API is down" }, expect: "not-card" },
  { label: "bad request", err: { type: "invalid_request_error", message: "No such payment_intent: pi_123" }, expect: "not-card" },
  { label: "no error object at all", err: undefined, expect: "not-card" },
];

let fails = 0;
let generic = null;
try { generic = declineMessage({ type: "card_error", code: "card_declined", decline_code: "generic_decline" }); }
catch (e) { console.log(`  ⚠️  mapper threw on the baseline case: ${e.message}`); process.exit(2); }

for (const c of CASES) {
  let out;
  try { out = declineMessage(c.err); }
  catch (e) { console.log(`  🔴 ${c.label.padEnd(32)} threw: ${e.message}`); fails++; continue; }

  const problems = [];
  if (!out || typeof out !== "string" || !out.trim()) problems.push("returned nothing to show the client");
  else if (LEAK.test(out)) problems.push(`leaks our internals: "${out}"`);
  else if (c.err?.message && out.includes(c.err.message)) problems.push("echoes Stripe's message verbatim");
  else if (c.expect === "generic" && out !== generic) problems.push(`should fall back to the generic line, said: "${out}"`);
  else if (c.expect === "specific" && out === generic) problems.push("fell back to generic — the client can fix this one themselves");
  else if (c.expect === "not-card" && /declined/i.test(out)) problems.push(`calls our own failure a decline: "${out}"`);

  if (problems.length) { console.log(`  🔴 ${c.label.padEnd(32)} ${problems[0]}`); fails++; }
  else console.log(`  ✅ ${c.label.padEnd(32)} "${out.slice(0, 52)}${out.length > 52 ? "…" : ""}"`);
}

if (fails) {
  console.log(`\n🔴 ${fails} decline case(s) would show a client something we should not.`);
  process.exit(1);
}
console.log(`\n✅ all ${CASES.length} cases show our own copy; unknown codes fall back safely.`);
process.exit(0);
