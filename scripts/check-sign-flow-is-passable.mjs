#!/usr/bin/env node
/**
 * check-sign-flow-is-passable.mjs — a gate on the revenue path must be satisfiable.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-10, found by walking the SOP as the client. The contract-signing modal asked the client to
 * "Confirm your password to sign" and called supabase.auth.signInWithPassword().
 *
 * RGA NEVER ISSUES A PORTAL PASSWORD. Every client signs in by magic link.
 * Chris: *"fyi we never give them a portal password."*
 *
 * So the call could only ever return "Invalid login credentials". **No client could sign a contract.
 * The entire close flow was impassable** — and the error text blamed the client for mistyping a
 * password that had never existed.
 *
 * 🔑 The control's INTENT was right: a long-lived dashboard session proves the browser was
 * authenticated once, not who is at the keyboard now. It was built on a factor the product does not
 * have. **A security control that cannot be satisfied is not strict, it is broken — and this one
 * failed closed on the one action that produces revenue.**
 *
 * 🔴 It would never have shown up in code review, tests, or a status check. Only signing as the
 * client finds it, which is the whole argument for walking the SOP.
 *
 * WHAT IT CHECKS
 *  1. No password re-auth in the signing flow (the product issues no passwords).
 *  2. Signing is still gated by SOMETHING — a freshness check — not simply thrown open.
 *  3. The ESIGN evidence the signature rests on is still captured server-side.
 *
 * Exit 0 = a client can sign, and it is still gated · 1 = impassable or ungated · 2 = unknown.
 */
import fs from "node:fs";

// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT. A gate that can only ever read the real
// working tree cannot be pointed at a scratch copy, so its mutations cannot be run — and a
// gate nobody can make fail is a gate nobody has checked. Found 2026-10-06 when three
// mutations of `check-refusal-is-not-done` all came back green: it was reading straight past
// them. → feedback_a_gate_that_cannot_fail · feedback_the_harness_i_wrote_to_check_my_work_can_lie
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SITE = `${__SITE}`;
const PORTAL = `${SITE}/portal/portal.js`;
const SIGNFN = `${SITE}/netlify/functions/contract-sign.js`;
const SABOTAGE = process.env.SABOTAGE === "1";

console.log("── the signing flow is passable, and still gated ──");
for (const f of [PORTAL, SIGNFN]) {
  if (!fs.existsSync(f)) { console.log(`  ⚠️  missing: ${f}`); process.exit(2); }
}
// 🔴 Strip HTML comments TOO. portal.js documents this very bug inside an <!-- --> block in a
// template literal, and the first version of this gate matched that prose and failed on fixed
// code. Third time today a check read documentation instead of behaviour — comments explaining a
// bug always contain the bug's own fingerprint.
const strip = (s) => s
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");
let portal = strip(fs.readFileSync(PORTAL, "utf8"));
const signfn = fs.readFileSync(SIGNFN, "utf8");

const which = process.env.SABOTAGE_CASE || "1";
if (SABOTAGE && which === "1") portal += '\nawait _portalSupabase.auth.signInWithPassword({ email: signerEmail, password: pw });\n';
if (SABOTAGE && which === "2") portal = portal.replace(/_signSessionIsFresh\(\)/g, "true");

let fails = 0;

// 1. No password re-auth anywhere in the portal — the product issues none.
if (/signInWithPassword/.test(portal)) {
  console.log("  🔴 portal.js calls signInWithPassword(). RGA issues NO portal passwords, so this");
  console.log("     can only fail — and it sits on the contract-signing path.");
  fails++;
} else {
  console.log("  ✅ no password re-auth (RGA issues none)");
}

// 2. But signing must still be gated by something real.
if (/function _signSessionIsFresh/.test(portal) && /_signSessionIsFresh\(\)/.test(portal)) {
  console.log("  ✅ signing is gated on magic-link session freshness");
} else {
  console.log("  🔴 no freshness gate on signing — a weeks-old session on an unlocked laptop could");
  console.log("     sign a binding agreement. Removing the broken gate must not mean removing all of them.");
  fails++;
}

// 3. The ESIGN evidence must still be captured server-side.
const EVIDENCE = ["signer_ip", "signer_user_agent", "contract_hash", "signer_email", "signer_name"];
const missing = EVIDENCE.filter((k) => !new RegExp(k).test(signfn));
if (missing.length) {
  console.log(`  🔴 contract-sign.js no longer records: ${missing.join(", ")}`);
  console.log("     Freshness is hardening ON TOP of the attribution — not a replacement for it.");
  fails++;
} else {
  console.log(`  ✅ ESIGN evidence still captured (${EVIDENCE.length} fields)`);
}

if (fails) { console.log(`\n🔴 ${fails} check(s) failed — a client may be unable to sign, or able to sign unchecked.`); process.exit(1); }
console.log("\n✅ a client can sign, and only a fresh session can.");
process.exit(0);
