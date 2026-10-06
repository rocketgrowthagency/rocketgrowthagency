#!/usr/bin/env node
/**
 * check-emails-clear-the-spam-floor.mjs — "as short as possible" has a FLOOR.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * Email on Acid's testing: a body under ~500 characters tripped FOUR spam filters. Above it,
 * length and image ratio stopped mattering. → reference_welcome_email_evidence
 *
 * This has now bitten TWICE:
 *   2026-09-10 (a)  the intro email's "already signed" variant shipped at 454 chars — caught by
 *                   hand, hours after the 500-char rule was written down.
 *   2026-09-10 (b)  ALL FOUR stage-notification emails shipped at 211 / 261 / 407 / 232 chars.
 *                   Deployed, never fired — so the first real client to sign would have been the
 *                   one to discover it, and the symptom is silence. Nobody reports an email they
 *                   never received.
 *
 * 🔑 The rule was DOCUMENTED and still broken in the very next file written. A rule that lives only
 * in a memory doc protects the author who remembers it, on the day they remember it.
 *
 * Also enforces, for the same client-facing bodies:
 *   • ONE call to action (Omnisend, 229M emails — 3+ CTAs measurably lower CTR)
 *   • a sign-off, so the client hears one voice across the sequence
 *
 * 🔴 It does NOT enforce an upper bound. No study supports a word count for a transactional email.
 *
 * Exit 0 = every body clears the floor · 1 = one would land in spam · 2 = could not tell.
 */
import fs from "node:fs";
import path from "node:path";

// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT. A gate that can only ever read the real
// working tree cannot be pointed at a scratch copy, so its mutations cannot be run — and a
// gate nobody can make fail is a gate nobody has checked. Found 2026-10-06 when three
// mutations of `check-refusal-is-not-done` all came back green: it was reading straight past
// them. → feedback_a_gate_that_cannot_fail · feedback_the_harness_i_wrote_to_check_my_work_can_lie
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SITE = `${__SITE}`;
const FLOOR = 500;
const SABOTAGE = process.env.SABOTAGE === "1";

console.log(`── every client-facing email body clears ${FLOOR} characters ──`);

const TARGET = path.join(SITE, "netlify/functions/notify-client-stage.js");
if (!fs.existsSync(TARGET)) { console.log(`  ⚠️  missing: ${TARGET}`); process.exit(2); }

let src = fs.readFileSync(TARGET, "utf8");
const m = src.match(/function messageFor[\s\S]*?\n}\n/);
if (!m) { console.log("  ⚠️  could not locate messageFor() — the shape changed."); process.exit(2); }

let body = m[0];
// 🔴 This pattern used to anchor on "Rocket Growth Agency" at the end of the body. When the
// duplicate sign-off was removed the anchor vanished, the replace silently did nothing, and the
// gate "passed" its own sabotage — proving nothing. Anchor on the SUBJECT instead, which is
// stable, and verify the substitution actually happened.
if (SABOTAGE) {
  const before = body;
  body = body.replace(/subject: "Got your signed agreement",\s*body:[\s\S]*?,\n      \};/,
                      'subject: "Got your signed agreement", body: "Signed. Thanks." };');
  if (body === before) { console.log("  ⚠️  SABOTAGE did not apply — the pattern is stale."); process.exit(2); }
}

const PORTAL = "https://www.rocketgrowthagency.com/portal/";
let messageFor;
try {
  messageFor = new Function("PORTAL", "stage", "ctx", body + "; return messageFor(stage,ctx);");
} catch (e) {
  console.log(`  ⚠️  could not evaluate messageFor(): ${e.message}`);
  process.exit(2);
}

// 🔑 Billing notices added 2026-09-10. A new client-facing email that is not in this list is an
// email nobody measures — the same "unwired gate" problem, one level up.
const STAGES = ["stage_1b_admin_review", "stage_2_payment", "stage_3_setup", "stage_4_onboarding",
                "billing_overdue", "billing_warning", "billing_paused"];
let fails = 0, checked = 0;

for (const stage of STAGES) {
  let r;
  try { r = messageFor(PORTAL, stage, { first: "Eli", kickoffWhen: null }); }
  catch (e) { console.log(`  ⚠️  ${stage} threw: ${e.message}`); process.exit(2); }
  if (!r) { console.log(`  ▫️  ${stage} — deliberately silent, skipped`); continue; }
  checked++;

  // 🔴 MEASURE THE EMAIL THAT IS SENT, NOT THE BODY ALONE. notify-client-stage appends a footer
  // (phone + sign-off) to every message. Measuring `r.body` understated the real length AND
  // required a sign-off inside the body — so when the bodies were rewritten, a second sign-off was
  // added to all eight and the email went out signed twice. **The gate encoded the mistake instead
  // of catching it**: it asserted a property of a fragment, not of the artifact.
  const FOOTER = "\n\nAnything at all, reply here or call me on (424) 242-2040.\n\nChris\nRocket Growth Agency";
  const sent = r.body + FOOTER;
  const len = sent.length;
  const links = (sent.match(/https?:\/\//g) || []).length;
  const signoffs = (sent.match(/Rocket Growth Agency/g) || []).length;
  const problems = [];
  if (len < FLOOR) problems.push(`${len} chars sent — under the ${FLOOR} spam floor`);
  if (links > 1) problems.push(`${links} links — ONE call to action`);
  if (signoffs !== 1) problems.push(`${signoffs} sign-offs — the footer already adds one`);

  if (problems.length) { console.log(`  🔴 ${stage}: ${problems.join(" · ")}`); fails++; }
  else console.log(`  ✅ ${stage.padEnd(24)} ${String(len).padStart(4)} chars sent · ${links} link · 1 sign-off`);
}

if (checked === 0) { console.log("  ⚠️  no stage produced a message — the probe is wrong."); process.exit(2); }

if (fails) {
  console.log(`\n🔴 ${fails} email(s) would risk the spam folder. The symptom is SILENCE —`);
  console.log("   nobody reports an email they never received.");
  process.exit(1);
}
console.log(`\n✅ all ${checked} bodies clear the floor.`);
process.exit(0);
