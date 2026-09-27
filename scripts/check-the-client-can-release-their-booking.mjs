#!/usr/bin/env node
/**
 * check-the-client-can-release-their-booking.mjs — a confirmed call must have a way out.
 *
 * ─── WHY ─────────────────────────────────────────────────────────────────────────────────────────
 * Chris, 2026-09-27: *"can we maybe add a 'Can't Make It' … so they can cancel or reschedule?"*
 *
 * Measured on the live portal: once RGA confirmed the booking, the client's whole step contained
 * ONE button and it said "ask us". They could pick a time, and change it while it was pending — and
 * the moment it became real the product offered them nothing. "Something came up" became an email
 * to Chris and a manual change in the admin.
 *
 * 🔴 WHAT A CLIENT CAN CREATE, A CLIENT MUST BE ABLE TO WITHDRAW.
 * → feedback_what_you_create_you_must_be_able_to_withdraw · feedback_the_escape_hatch_stays_in_the_product
 *
 * 🔴🔴 AND THE AUTH MUST STAY TWO GATES. `requirePortalOwner` proves the caller owns THIS client.
 * Widening the existing admin gate instead would have let any authenticated portal user cancel any
 * client's meeting. → feedback_a_public_endpoint_still_has_to_choose_what_to_say
 *
 * Exit 0 = the way out exists and is scoped · 1 = it is gone or unscoped · 2 = cannot tell.
 */
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const P = path.join(SITE, "portal/portal.js");
const C = path.join(SITE, "netlify/functions/cancel-kickoff-invite.js");
for (const f of [P, C]) if (!fs.existsSync(f)) { console.log(`  ⚠️  ${f} missing — cannot judge.`); process.exit(2); }
const strip = (x) => x.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const src = strip(fs.readFileSync(P, "utf8"));
const cancel = strip(fs.readFileSync(C, "utf8"));
if (src.length < 100000) { console.log("  ⚠️  portal.js too small — cannot judge."); process.exit(2); }

const fail = [];
console.log("── the client can release their own booking ──");

// 1 ─ both controls exist on the CONFIRMED card
if (!/\bdata-kickoff-release\b/.test(src)) {
  fail.push("there is no \"Can't make it\" control — a confirmed call would again be un-releasable, and the client's only route back is an email to Chris");
}
{
  const i = src.indexOf("const confirmed = status === \"booked\"");
  const card = i === -1 ? "" : src.slice(i, i + 2200);
  if (!/data-kickoff-change/.test(card) || !/data-kickoff-release/.test(card)) {
    fail.push("the confirmed card does not carry both controls — moving a booking and releasing it are different needs and both vanish without them");
  }
}

// 2 ─ 🔴 THE CLIENT PATH MUST BE OWNER-SCOPED, AND THE ADMIN GATE MUST SURVIVE.
if (!/\brequirePortalOwner\b/.test(cancel)) {
  fail.push("cancel-kickoff-invite has no requirePortalOwner path — the client cannot release their own booking at all");
}
if (!/\brequireWorkspaceForClientOrInternal\b/.test(cancel)) {
  fail.push("cancel-kickoff-invite lost its admin gate — RGA could no longer cancel on a client's behalf");
}
{
  // The owner check must be what authorises the client path — not a widened admin gate.
  const i = cancel.search(/\brequirePortalOwner\b/);
  const near = i === -1 ? "" : cancel.slice(Math.max(0, i - 200), i + 500);
  if (i !== -1 && !/clientId/.test(near)) {
    fail.push("requirePortalOwner is not being asked about THIS client — an owner check that ignores the id authorises any portal user against any client");
  }
}

// 3 ─ it must always tell RGA. A client silently vanishing is the outcome this prevents.
if (!/client_activity|activity log/.test(cancel)) {
  fail.push("the cancel path no longer records an activity row — a client releasing a booked call would leave no trace for RGA");
}

// 4 ─ the release must report its result and hand the step back
{
  // 🔴 THE HANDLER, NOT THE BUTTON. `data-kickoff-release` appears FIRST in the card's markup —
  // slicing from there reads the renderer, where none of these calls live, and every check below
  // fails against code that was never the target. Sixth time in two days.
  // → feedback_position_is_not_identity · feedback_a_gate_must_pin_the_property_not_the_spelling
  const i = src.indexOf('closest("[data-kickoff-release]")');
  if (i === -1) fail.push("nothing listens for the release control — the button would be inert");
  // 🔑 BOUNDED BY THE HANDLER, not a character count. A fixed 3500-char window ran past the end of
  // this listener into the next one and borrowed ITS portalConfirm — so deleting the confirmation
  // from the release still passed. A window measured in characters will lie.
  // → feedback_a_gate_window_measured_in_characters_will_lie
  const nextListener = src.indexOf("document.addEventListener(", i);
  const h = i === -1 ? "" : src.slice(i, nextListener === -1 ? i + 3500 : nextListener);
  if (!/portalConfirm\(/.test(h)) {
    fail.push("the release fires without confirming — cancelling a real calendar event on a single click is exactly the kind of irreversible action that needs a dialog");
  }
  // 🔑 BOTH OUTCOMES. My first version accepted `portalAlert( OR clientError(` — so deleting the
  // SUCCESS message still passed, because the catch block's error report satisfied it. A client who
  // releases a slot and is told nothing cannot tell it worked.
  // → feedback_every_action_must_report_its_result · feedback_a_gate_that_cannot_fail
  if (!/portalAlert\(\s*\{/.test(h)) {
    fail.push("the release never confirms success — the client frees a slot and is told nothing, so the only evidence is the card changing under them");
  }
  if (!/clientError\(/.test(h)) {
    fail.push("the release has no failure path — a rejected cancel would leave the client believing the slot was freed when it was not");
  }
  if (!/loadKickoffSlots\(/.test(h)) {
    fail.push("the release does not reopen the picker — the step would say it is theirs with no way to act on it");
  }
}

if (fail.length) {
  console.log(`\n🔴 ${fail.length} problem(s):`);
  for (const f of fail) console.log(`    ${f}`);
  console.log("\n   A confirmed booking the client cannot move or release turns every change into an email.");
  process.exit(1);
}
console.log("  both controls on the confirmed card · owner-scoped client path · admin gate intact");
console.log("  always logged for RGA · confirms, reports, and hands the step back");
console.log("\n✅ the client can release their own booking.");
process.exit(0);
