#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-a-booking-can-be-unbooked.mjs
//
// 🔴 WHY (Chris, 2026-09-24): "also do we have a feature to delete or remove or change the time or
// meeting?" The answer was NO on both counts, and nobody had noticed.
//
// `send-kickoff-invite` puts a real event in a real client's Google Calendar and makes Google email
// them about it. Repo-wide there was no DELETE to the Calendar API — not one. Moving it existed only
// as a side effect of pressing "Send the invite" a second time, which shifted it to whatever slot
// the default computed; you could not name a time. The backend had accepted an explicit `start`
// since the day it was written, and no screen ever sent one.
//
// 🔑 A SYSTEM THAT CREATES AN EXTERNAL COMMITMENT MUST BE ABLE TO WITHDRAW IT. Creating is the easy
// half. The dangerous state is an unwanted meeting sitting in a client's calendar that nobody can
// remove from inside the product — the escape hatch was "open Google Calendar and do it by hand",
// which is the manual step this whole system exists to delete.
// → feedback_the_escape_hatch_stays_in_the_product · feedback_a_finding_must_be_actionable_inside_the_product
//
// 🔴 AND WE ALREADY SHIPPED THE ALARM WITHOUT THE SWITCH: kickoff-rsvp-check reads a 404/410 on the
// stored event and reports `state: "deleted"`. We could DETECT the cancellation we could not
// PERFORM. That asymmetry is the tell this gate looks for.
//
// exit 0 = the booking lifecycle is complete and guarded · 1 = a leg is missing · 2 = cannot tell
// → feedback_a_fix_without_a_gate_regresses · feedback_preflight_before_you_build
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FN = path.join(SITE, "netlify", "functions");
const SEND = path.join(FN, "send-kickoff-invite.js");
const CANCEL = path.join(FN, "cancel-kickoff-invite.js");
const ADMIN = path.join(SITE, "admin", "admin.js");

for (const f of [SEND, ADMIN]) {
  if (!fs.existsSync(f)) {
    console.error(`⚠️  INDETERMINATE — ${path.basename(f)} not found; cannot judge the booking lifecycle.`);
    process.exit(2);
  }
}

// Comments describe the rule; only CODE implements it. Every assertion below runs against the
// stripped source, because this gate has twice been written in a way that matched its own prose.
// → the check-a-failure-reaches-a-human bug, 2026-09-24
const strip = (s) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const admin = strip(fs.readFileSync(ADMIN, "utf8"));
const send = strip(fs.readFileSync(SEND, "utf8"));

const problems = [];

// ── LEG 1 · CANCEL ────────────────────────────────────────────────────────────────────────────
if (!fs.existsSync(CANCEL)) {
  problems.push(`there is no cancel-kickoff-invite.js. The product can book a client call and has no `
    + `way to call it off — the only route left is opening Google Calendar by hand.`);
} else {
  const cancel = strip(fs.readFileSync(CANCEL, "utf8"));

  // It must actually issue the DELETE. A function that only tidies OUR record leaves the meeting
  // live on the client's calendar while the admin reports it cancelled — the worst possible split.
  const deletesOnGoogle = /googleapis\.com\/calendar\/v3\/calendars\/primary\/events\/[\s\S]{0,200}?method:\s*"DELETE"/.test(cancel)
    || /method:\s*"DELETE"[\s\S]{0,200}?googleapis\.com\/calendar/.test(cancel);
  if (!deletesOnGoogle) {
    problems.push(`cancel-kickoff-invite.js never issues a DELETE to the Google Calendar event. `
      + `Clearing our own record without cancelling on Google leaves the meeting live in the client's `
      + `calendar while every RGA surface says it is off.`);
  }

  // sendUpdates=all is what makes Google EMAIL the cancellation, which is what actually removes the
  // event from the guest's calendar. Without it we delete our copy and the client keeps theirs.
  if (!/sendUpdates=all/.test(cancel)) {
    problems.push(`the cancel does not pass sendUpdates=all, so Google never emails the client the `
      + `cancellation and the meeting stays on THEIR calendar with a dead Meet link.`);
  }

  // The step must REOPEN. A cancelled meeting that leaves m1.close.kickoff_invite reading "done"
  // makes the ledger disagree with the world, and the ledger is what everyone acts on.
  if (!/"m1\.close\.kickoff_invite"[\s\S]{0,400}?status:\s*"pending"/.test(cancel)) {
    problems.push(`cancelling does not reopen m1.close.kickoff_invite to "pending". The artifact is `
      + `gone but the checklist would still read done, so nobody rebooks.`);
  }

  // 🔴 The record-clearing write must NOT be swallowed. A half-applied cancel — gone on Google,
  // still on our record — blocks rebooking, because send-kickoff-invite's idempotence guard still
  // sees an event_id. That is strictly worse than either clean outcome.
  //
  // 🔴 THIS ASSERTION WAS DEAD ON ITS FIRST WRITE. It matched
  //     /client_onboarding_records\?id=eq\.[\s\S]{0,420}?\n/
  // and a LAZY quantifier stops at the FIRST newline, so the window was one line long and the
  // `.catch` three lines below was never in view. Mutation testing caught it; reading it did not.
  // 🔑 Anchor a window to a SYNTACTIC boundary, never to a character count.
  // → feedback_a_gate_window_measured_in_characters_will_lie
  //
  // 🔴 AND IT NEEDED A THIRD PASS. Anchored to the syntactic boundary it still passed when the PATCH
  // was deleted outright — because the file ALSO reads the record back to verify the write, and that
  // read matched the same opening pattern. The gate found a decoy and declared the real thing
  // present. 🔑 A selector must distinguish the thing it means from its neighbours: filter to writes
  // that actually carry method:"PATCH". → feedback_dead_check_selector_gap
  const clearWrite = (cancel.match(/await supa\(`\/client_onboarding_records\?id=eq\.[\s\S]*?\n\s*\}\)[^\n]*/g) || [])
    .find((w) => /method:\s*"PATCH"/.test(w));
  if (!clearWrite) {
    problems.push(`cancel-kickoff-invite.js has no PATCH to client_onboarding_records — the booking is `
      + `never cleared from the client's record, so rebooking stays blocked by the idempotence guard.`);
  } else if (/\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/.test(clearWrite)) {
    problems.push(`the write that clears the booking is wrapped in .catch(() => {}). If it fails the `
      + `operator is told the cancel succeeded while the record still names the event — and rebooking `
      + `stays blocked by the idempotence guard.`);
  }

  // Removed, not emptied: a truthy husk reads as a booking to `if (data.kickoff_invite)`.
  if (!/kickoff_invite:\s*_?\w*\s*,\s*\.\.\./.test(cancel) && !/delete\s+\w+\.kickoff_invite/.test(cancel)) {
    problems.push(`cancel-kickoff-invite.js does not REMOVE the kickoff_invite key (rest-destructure `
      + `or delete). Setting it to {} leaves a truthy husk that later readers report as a booking.`);
  }
}

// ── LEG 2 · PICK A TIME ───────────────────────────────────────────────────────────────────────
// The backend has always accepted body.start. The defect was that nothing SENT one.
if (!/body\.start/.test(send)) {
  problems.push(`send-kickoff-invite.js no longer reads body.start — the only way to name a specific `
    + `meeting time has been removed.`);
}
if (!/data-change-kickoff-time/.test(admin)) {
  problems.push(`no admin control carries data-change-kickoff-time. The backend accepts an explicit `
    + `start that no screen can supply, so the time is always the computed default and an operator `
    + `cannot book what the client actually agreed to.`);
}

// 🔴 An explicit start MUST be validated. It is operator input reaching Google directly, and Google
// happily books a meeting in the past or in 2206. The computed default cannot produce either, so
// this guards exactly the surface the picker opened.
//
// 🔴 THIS ASSERTION WAS ALSO DEAD. It required /already passed|in the past/i against the RAW file —
// and the raw file contains my own explanatory COMMENT saying "books a real client call in the
// past". The gate was satisfied by its own prose, the second time that exact bug shipped in one day
// (see check-a-failure-reaches-a-human). It also accepted `if (false)`, because it only checked that
// a time DIFFERENCE was computed somewhere, never that anything branched on it.
//
// 🔑 Assert on STRUCTURE in the STRIPPED source: a variable derived from Date.now() must be
// COMPARED in a condition that returns a 400. That survives renaming and dies on neutering.
if (/body\.start/.test(send)) {
  const block = send.match(/if\s*\(\s*startIso\s*\)\s*\{[\s\S]*?\n {4}\}/);
  if (!block) {
    problems.push(`send-kickoff-invite.js accepts an explicit start but has no \`if (startIso)\` `
      + `validation block. A stale default or a mistyped year books a client call in the past, or in `
      + `2206, and Google accepts both silently.`);
  } else {
    // Which local name holds the offset from now?
    const decl = block[0].match(/const\s+(\w+)\s*=\s*\(?[^;]*Date\.now\(\)[^;]*;/);
    const v = decl?.[1];
    const branchesOnIt = v && new RegExp(
      `if\\s*\\([^)]*\\b${v}\\b[^)]*[<>][^)]*\\)\\s*\\{[\\s\\S]{0,600}?jsonRes\\(\\s*400`,
    ).test(block[0]);
    if (!branchesOnIt) {
      problems.push(`the explicit-start validation never BRANCHES on a time computed from Date.now() `
        + `to return a 400. Computing the offset and not acting on it (or gating it on a constant) `
        + `lets a meeting be booked in the past.`);
    }
  }
}

// ── LEG 3 · THE CONTROLS EXIST WHERE A MEETING DOES ───────────────────────────────────────────
if (!/data-cancel-kickoff/.test(admin)) {
  problems.push(`no admin control carries data-cancel-kickoff — the cancel function is unreachable `
    + `from the product, which is the same as not having it.`);
}
if (fs.existsSync(CANCEL) && !/\/\.netlify\/functions\/cancel-kickoff-invite/.test(admin)) {
  problems.push(`the admin never calls /.netlify/functions/cancel-kickoff-invite. If it cancels some `
    + `other way, that path bypasses the record cleanup and the step reopen.`);
}

// 🔴 A control must not offer what it cannot do. "Cancel the meeting" rendered in the `deleted`,
// `not_sent` or `unknown` states would promise to remove something that is not there — and `unknown`
// means we could not READ the event, which is not knowing it is gone.
// → feedback_we_never_promise_what_we_dont_do · feedback_indeterminate_is_not_a_finding
// 🔄 RE-PINNED 2026-10-08 (admin_kickoff_call_v1). The controls left the RSVP status line (it
// repeated them) and live ONCE on the Overview booking card, which renders only from a slot the
// calendar holds (`j.booked`, from kickoff-availability) — so they appear exactly where a meeting
// exists. The property is unchanged: no cancel/move without a meeting.
{
  const cancels = [...admin.matchAll(/data-cancel-kickoff="\$\{/g)].map((m) => m.index);
  if (!cancels.length) problems.push("the admin renders no Cancel the meeting control at all.");
  for (const at of cancels) {
    const before = admin.slice(Math.max(0, admin.lastIndexOf("\n    if (!reqs.length) {", at)), at);
    // 🔄 2026-10-09 (kickoff_every_surface_every_state_v1): the card follows the call; Change/Cancel live in the
    // `: booked ?` branch for a call still AHEAD — still only where a meeting exists.
    if (!/const booked = \(j\.booked \|\| \[\]\)\[0\];[\s\S]*const html = booked( && [^\n]+)?\s*\n?\s*\?/.test(before) || !/\n\s*: booked\s*\n\s*\? `<div class="kb">/.test(before)) {
      problems.push(`admin/admin.js:${admin.slice(0, at).split("\n").length} — a Cancel the meeting control is not inside the booking card's \`booked ?\` branch — `
        + `it can render where no meeting is on the calendar (deleted, not sent, or unreadable).`);
    }
  }
}

// 🔴 Moving MUST pass force. Without it the idempotence guard returns alreadySent, the new time is
// discarded, and the control reports success having changed nothing.
// 🔄 2026-10-08: the change control calls ONE function, pickKickoffTime, shared with "Pick a time for
// them". Read that function's body, not a window after the attribute.
const pkAt = admin.indexOf("async function pickKickoffTime(");
const pkBody = pkAt < 0 ? "" : admin.slice(pkAt, admin.indexOf("\n}\n", pkAt));
if (!/closest\("\[data-change-kickoff-time\]"\)[\s\S]{0,300}?await pickKickoffTime\(/.test(admin)) {
  problems.push("the change-the-time control no longer goes through pickKickoffTime — a second move path can drop the time");
}
const moveCall = pkBody.match(/send-kickoff-invite[\s\S]{0,600}?\}\)/);
if (moveCall && !/force:\s*"1"/.test(moveCall[0])) {
  problems.push(`the "change the time" control calls send-kickoff-invite without force:"1". The `
    + `idempotence guard will return alreadySent, the chosen time is silently dropped, and the `
    + `operator is told it worked.`);
}

if (problems.length) {
  console.error(`🔴 FAIL — the kickoff booking lifecycle has ${problems.length} gap(s):\n`);
  for (const p of problems) console.error(`   • ${p}\n`);
  process.exit(1);
}

console.log(`✅ a booked kickoff can be moved to a named time and cancelled from inside the product — `
  + `the cancel reaches Google with sendUpdates=all, clears the record unswallowed, and reopens the step.`);
process.exit(0);
