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

const SITE = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FLOOR = 500;
const SABOTAGE = process.env.SABOTAGE === "1";

console.log(`── every client-facing email body clears ${FLOOR} characters ──`);

const TARGET = path.join(SITE, "netlify/functions/notify-client-stage.js");
if (!fs.existsSync(TARGET)) { console.log(`  ⚠️  missing: ${TARGET}`); process.exit(2); }

let src = fs.readFileSync(TARGET, "utf8");
const m = src.match(/function messageFor[\s\S]*?\n}\n/);
if (!m) { console.log("  ⚠️  could not locate messageFor() — the shape changed."); process.exit(2); }

let body = m[0];
if (SABOTAGE) body = body.replace(/`Hi \$\{first\},\\n\\nYour signed agreement[\s\S]*?Rocket Growth Agency`/, "`Hi ${first},\\n\\nSigned. Thanks.`");

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

  const len = r.body.length;
  const links = (r.body.match(/https?:\/\//g) || []).length;
  const signed = /Rocket Growth Agency\s*$/.test(r.body);
  const problems = [];
  if (len < FLOOR) problems.push(`${len} chars — under the ${FLOOR} spam floor`);
  if (links > 1) problems.push(`${links} links — ONE call to action`);
  if (!signed) problems.push("no sign-off");

  if (problems.length) { console.log(`  🔴 ${stage}: ${problems.join(" · ")}`); fails++; }
  else console.log(`  ✅ ${stage.padEnd(24)} ${String(len).padStart(4)} chars · ${links} link · signed`);
}

if (checked === 0) { console.log("  ⚠️  no stage produced a message — the probe is wrong."); process.exit(2); }

if (fails) {
  console.log(`\n🔴 ${fails} email(s) would risk the spam folder. The symptom is SILENCE —`);
  console.log("   nobody reports an email they never received.");
  process.exit(1);
}
console.log(`\n✅ all ${checked} bodies clear the floor.`);
process.exit(0);
