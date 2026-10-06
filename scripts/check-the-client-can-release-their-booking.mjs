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

// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT. A gate that can only ever read the real
// working tree cannot be pointed at a scratch copy, so its mutations cannot be run — and a
// gate nobody can make fail is a gate nobody has checked. Found 2026-10-06 when three
// mutations of `check-refusal-is-not-done` all came back green: it was reading straight past
// them. → feedback_a_gate_that_cannot_fail · feedback_the_harness_i_wrote_to_check_my_work_can_lie
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SITE = process.env.SITE_DIR || `${__SITE}`;
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
  // 🔴🔴 THIS WAS A 2,200-CHARACTER WINDOW AND IT LIED (2026-09-29). The card gained an
  // after-the-time branch — "Time has passed", with Join/Change/Can't-make-it correctly removed
  // for a call already held — which pushed the confirmed card's controls past 2,200 characters.
  // The gate reported that a client could no longer release their booking, of code that was right.
  // 🔑 Bound by the SYNTAX: the renderer's own end. → feedback_a_gate_window_measured_in_characters_will_lie
  const i = src.indexOf("const confirmed = status === \"booked\"");
  const fnEnd = i === -1 ? -1 : src.indexOf("\nfunction ", i);
  const card = i === -1 ? "" : src.slice(i, fnEnd === -1 ? src.length : fnEnd);
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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE CLIENT HAS TWO MOVES, AND THEY ARE CALLED RESCHEDULE AND CANCEL.
//
// Chris, 2026-09-27: *"dont say release say cancel. right? client is either reschedule or cancel."*
// The dialog was already contradicting itself — title *"Release this time?"*, body *"We'll CANCEL
// the calendar invite."* `releaseSlotHold` is a LEDGER operation: freeing a row so another client
// can take the hour. The client is not releasing anything; they are cancelling a meeting. And the
// admin has said "Cancel the meeting" since it was built, so the two sides of one action were
// being described in two vocabularies.
//
// 🔑 THE ATTRIBUTE AND CLASS STAY `…-release`. Those are ours, they name the ledger operation
// correctly, and renaming them would churn every selector for no reader's benefit. What is pinned
// is the WORDS A CLIENT SEES. → feedback_a_client_message_must_agree_with_itself
// ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  // The handler for the "Can't make it" control — everything it puts on screen.
  const at = src.indexOf('closest("[data-kickoff-release]")');
  if (at < 0) {
    fail.push("could not find the cancel handler, so its wording cannot be judged");
  } else {
    // Bounded by the next top-level listener, not by a character count.
    const after = src.slice(at);
    const stop = after.search(/\ndocument\.addEventListener\(/);
    const body = stop > 0 ? after.slice(0, stop) : after;
    // Only what a CLIENT reads: quoted strings and template literals, not identifiers or attributes.
    const strings = [...body.matchAll(/["'`]([^"'`\n]{4,})["'`]/g)].map((m) => m[1]);
    const leaks = strings.filter((t) => /releas/i.test(t) && !/data-|pm-amend|is-release/.test(t));
    if (leaks.length) {
      fail.push(`the client is shown our ledger word "release": ${leaks.map((l) => `"${l.slice(0, 60)}"`).join(", ")}`
        + ` — the client's two moves are RESCHEDULE and CANCEL`);
    }
    // And it must actually say cancel somewhere, or the fix went the other way into vagueness.
    if (!strings.some((t) => /cancel/i.test(t))) {
      fail.push("the cancel handler never uses the word cancel — the client cannot tell what the control does");
    }
    // 🔴 Never a bare "Cancel" as the CONFIRM button: in a dialog that word already means
    // "close this and do nothing". → feedback_the_label_must_ask_what_the_options_answer
    const confirmLabel = (body.match(/confirmText:\s*["'`]([^"'`]*)["'`]/) || [])[1] || "";
    if (/^\s*cancel\s*$/i.test(confirmLabel)) {
      fail.push('the confirm button is a bare "Cancel", which in a dialog reads as "close this and do nothing"');
    }
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
console.log("  the client reads RESCHEDULE and CANCEL, never our ledger word \"release\"");
console.log("\n✅ the client can move or cancel their own booking.");
process.exit(0);
