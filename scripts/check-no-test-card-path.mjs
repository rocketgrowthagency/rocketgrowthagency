#!/usr/bin/env node
/**
 * check-no-test-card-path.mjs — nobody can pay us with a card that moves no money.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-11. Chris paid a portal invoice with 4242 4242 4242 4242 and it went through:
 * *"the sandbox card is still able to be used, we must remove sandbox and make it real."*
 *
 * It went through because test mode at RGA was a per-client ALLOW-LIST — `STRIPE_TEST_CLIENT_IDS`
 * — holding exactly one FAKE client (Lux General Contractors). A real client's id was never in it,
 * so a real client could never have paid with a test card. But the path existed, and the standing
 * rule up to that day was "NEVER clear this list" because clearing it meant the next internal test
 * would charge a real card. Chris chose the other trade: no test path in production at all.
 *
 * 🔑 WHAT THIS GUARDS. The allow-list mechanism is still in the code, and it must be — it is the
 * only way to ever test the payment funnel again without real money. What must NOT come back
 * silently is a POPULATED list in production. Re-adding one is a deliberate act with a real cost;
 * this gate makes sure it is never an accident, and never permanent-by-forgetting.
 *
 * 🔴 WHY IT ASKS THE DEPLOYED SITE. `netlify env:unset` returns success the moment the CLI accepts
 * it, and the running functions keep their old environment until a redeploy. Checking the CLI, or
 * the repo, would pass while production still took test cards. So this reads the allow-list as the
 * DEPLOYED RUNTIME sees it, via stripe-go-live-check — the same process.env the charging functions
 * read. → feedback_a_guard_must_reach_the_thing_it_guards
 *
 * Exit 0 = no test-card path in production · 1 = one is open · 2 = could not tell.
 */
import { execFileSync } from "node:child_process";

// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT. A gate that can only ever read the real
// working tree cannot be pointed at a scratch copy, so its mutations cannot be run — and a
// gate nobody can make fail is a gate nobody has checked. Found 2026-10-06 when three
// mutations of `check-refusal-is-not-done` all came back green: it was reading straight past
// them. → feedback_a_gate_that_cannot_fail · feedback_the_harness_i_wrote_to_check_my_work_can_lie
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SITE = `${__SITE}`;
const FN = "https://www.rocketgrowthagency.com/.netlify/functions/stripe-go-live-check";

console.log("── no client can pay us with a test card ──");

// ── the internal secret is not stored locally; read it from Netlify the way a human would ──
let secret;
try {
  secret = execFileSync("netlify", ["env:get", "INTERNAL_FN_SECRET", "--context", "production"],
    { cwd: SITE, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    .trim().split("\n").pop().trim();
} catch (e) {
  console.log(`  ⚠️  could not read INTERNAL_FN_SECRET (netlify CLI not logged in?): ${e.message}`);
  process.exit(2);  // 🔑 couldn't tell ≠ a finding. → feedback_exit_code_semantics_for_gates
}
if (!secret || secret.length < 8) {
  console.log("  ⚠️  INTERNAL_FN_SECRET came back empty or masked — cannot authenticate the probe.");
  process.exit(2);
}

let data;
try {
  const res = await fetch(FN, {
    method: "POST",
    headers: { "x-internal-secret": secret, "Content-Type": "application/json" },
    body: "{}",
  });
  // 🔴 A 200 proves nothing on its own — an HTML error page is also a 200 here.
  // → feedback_curl_status_is_useless_check_content_type
  const ctype = res.headers.get("content-type") || "";
  if (!ctype.includes("application/json")) {
    console.log(`  ⚠️  probe returned ${res.status} as ${ctype || "no content-type"} — not our JSON.`);
    process.exit(2);
  }
  data = await res.json();
} catch (e) {
  console.log(`  ⚠️  could not reach stripe-go-live-check: ${e.message}`);
  process.exit(2);
}

const path = data?.test_card_path;
if (!path || !Array.isArray(path.allow_listed_clients)) {
  // 🔴 The field missing means the DEPLOYED function predates this check — which is exactly the
  // state where the allow-list could be populated and invisible. That is indeterminate, not a pass.
  console.log("  ⚠️  the deployed stripe-go-live-check does not report test_card_path — redeploy the site.");
  process.exit(2);
}

const ids = path.allow_listed_clients;
const keys = path.test_keys_present || [];

if (ids.length) {
  console.log(`  🔴 STRIPE_TEST_CLIENT_IDS names ${ids.length} client(s) in PRODUCTION:`);
  ids.forEach((id) => console.log(`       ${id}`));
  console.log("     Those clients pay with a test card and no money moves.");
  console.log("     If this is a deliberate test window, unset it again when the test is done:");
  console.log('       netlify env:unset STRIPE_TEST_CLIENT_IDS   (then redeploy)');
  process.exit(1);
}

console.log(`  ✅ STRIPE_TEST_CLIENT_IDS is empty in the deployed runtime — every client is on live keys`);
console.log(`  ✅ Stripe mode reported by the live key: ${data.mode}`);
if (keys.length) console.log(`  ℹ️  test keys still present (unreachable while the list is empty): ${keys.join(", ")}`);
else console.log("  ✅ no test keys in the environment either — both halves of the path are gone");
process.exit(0);
