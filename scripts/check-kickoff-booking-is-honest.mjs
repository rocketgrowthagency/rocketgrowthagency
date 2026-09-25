#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-kickoff-booking-is-honest.mjs
//
// 🔴 WHY (2026-09-24). The kickoff invite picked 10:00 two business days out and sent it BLIND —
// nothing checked whether RGA was free, so the product could book a client call on top of a real
// meeting and nobody would find out until they looked at their calendar. And the client was never
// offered a choice: their only reply was Decline in Gmail, the email negotiation step 2 exists to
// avoid. Chris: *"i want something like calendly where they pick a date and time… so they cannot
// book during a time admin is busy. for hours and days."*
//
// WHAT THIS PROTECTS — four ways the rebuild could quietly rot:
//   1. ONE SLOT ENGINE. The picker, the portal booking and the sender must agree on what "free"
//      means. A picker offering a slot the sender then refuses is worse than no picker, and this
//      codebase has already paid twice for two implementations of one idea.
//   2. NEVER BOOK BLIND AGAIN. If availability cannot be read, the sender must REFUSE — silently
//      falling back to the old fixed time restores the exact defect.
//   3. AN EXPLICIT TIME IS VERIFIED, NOT MOVED. A time a human chose must be re-checked and
//      refused if taken; quietly shifting it is worse than failing.
//   4. THE CLIENT IS NEVER TOLD "NO TIMES" WHEN WE SIMPLY COULD NOT ASK. An empty list and a
//      failed lookup look identical to them, and one of the two is a lie about our availability.
//
// exit 0 = booking is honest · 1 = it is not · 2 = cannot tell
// → feedback_a_fix_without_a_gate_regresses · feedback_an_absence_must_never_be_readable_as_a_value
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = (p) => path.join(SITE, p);
const FILES = {
  slots: F("netlify/functions/_kickoff-slots.js"),
  avail: F("netlify/functions/kickoff-availability.js"),
  rules: F("netlify/functions/kickoff-availability-rules.js"),
  book: F("netlify/functions/portal-book-kickoff.js"),
  send: F("netlify/functions/send-kickoff-invite.js"),
  oauth: F("netlify/functions/oauth-rga-init.js"),
  portal: F("portal/portal.js"),
  admin: F("admin/admin.js"),
};
for (const [k, p] of Object.entries(FILES)) {
  if (!fs.existsSync(p)) { console.error(`⚠️  INDETERMINATE — ${k} missing at ${p}`); process.exit(2); }
}
const strip = (s) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const src = Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, strip(fs.readFileSync(p, "utf8"))]));
const problems = [];

// ── 1. one engine, every consumer ─────────────────────────────────────────────────────────────
for (const [name, needle] of [["kickoff-availability", "freeSlots"], ["portal-book-kickoff", "isSlotFree"], ["send-kickoff-invite", "isSlotFree"]]) {
  const key = name === "kickoff-availability" ? "avail" : name === "portal-book-kickoff" ? "book" : "send";
  if (!/_kickoff-slots/.test(src[key]) || !new RegExp(`\\b${needle}\\b`).test(src[key])) {
    problems.push(`${name} does not use _kickoff-slots.js (${needle}). Every surface must decide `
      + `"is this free?" the same way, or the picker will offer times the booking refuses.`);
  }
}
// The availability rules must come from the database, not be hardcoded in a second place.
if (!/kickoff_availability/.test(src.avail) || !/kickoff_availability/.test(src.rules)) {
  problems.push(`The bookable hours are not read from workspaces.kickoff_availability. Hardcoding `
    + `them means a code deploy every time the working week changes — a setting that is a lie.`);
}

// ── 2. the sender refuses rather than booking blind ───────────────────────────────────────────
{
  const s = src.send;
  if (!/freebusy|isSlotFree|freeSlots/.test(s)) {
    problems.push(`send-kickoff-invite performs no availability check at all — it is booking blind `
      + `again, which is the original defect.`);
  }
  if (!/needsReconnect/.test(s) || !/nothing was sent|Nothing was sent/i.test(s)) {
    problems.push(`send-kickoff-invite does not refuse-and-say-so when it cannot read availability. `
      + `Falling back to the old fixed time without telling anyone is exactly the behaviour removed.`);
  }
}

// ── 3. an explicit time is verified, never silently moved ─────────────────────────────────────
{
  const s = src.send;
  // The explicit branch must REFUSE; only the default branch may reassign `start`.
  const explicitBranch = s.match(/if\s*\(\s*startIso\s*\)\s*\{[\s\S]{0,900}?\n\s{6}\}/);
  if (explicitBranch && /start\s*=\s*new Date\(open/.test(explicitBranch[0])) {
    problems.push(`send-kickoff-invite silently MOVES a time that was explicitly chosen. A human `
      + `picked it; failing loudly is correct, quietly rescheduling is not.`);
  }
  if (!/already busy at/i.test(s)) {
    problems.push(`send-kickoff-invite never tells the caller the chosen time is already busy, so a `
      + `clash is indistinguishable from any other failure.`);
  }
}

// ── 4. the portal never says "no times" when it could not ask ─────────────────────────────────
{
  const p = src.portal;
  if (!/loadKickoffSlots/.test(p)) {
    problems.push(`portal.js has no loadKickoffSlots — the picker cannot populate, and its "Loading `
      + `available times…" placeholder would show forever.`);
  }
  if (!/couldn't load available times/i.test(p)) {
    problems.push(`The portal does not distinguish "we could not load times" from "there are no `
      + `times". To a client those read identically, and one of them is false about our availability.`);
  }
  // The booking path must re-offer slots when one is taken mid-choice.
  if (!/j\.taken/.test(p)) {
    problems.push(`The portal does not handle a slot being taken between rendering and booking. `
      + `That is a normal outcome, not an error — it must refresh so the client can pick again.`);
  }
}

// ── 5. the scope that makes any of it possible ────────────────────────────────────────────────
if (!/calendar\.events\.freebusy/.test(src.oauth)) {
  problems.push(`oauth-rga-init no longer requests calendar.events.freebusy, so a fresh connection `
    + `cannot read availability and every slot lookup will 403.`);
}
// 🔑 And it must stay NARROW. calendar.readonly reads every event; calendar can delete them.
if (/auth\/calendar["'\s]|calendar\.readonly/.test(src.oauth)) {
  problems.push(`oauth-rga-init asks for a broader calendar scope than the question needs. `
    + `freebusy answers "is this slot taken?" without reading titles, guests or details.`);
}

// ── 6. the admin can actually change the rules ────────────────────────────────────────────────
if (!/data-kickoff-hours/.test(src.admin) || !/openKickoffHoursDialog/.test(src.admin)) {
  problems.push(`The admin has no control for the bookable hours, so the rules could only be changed `
    + `in the database — which means they will not be changed.`);
}
{
  const at = src.admin.indexOf("data-kickoff-hours");
  const wired = /addEventListener\("click",\s*\(\)\s*=>\s*openKickoffHoursDialog/.test(src.admin);
  if (at >= 0 && !wired) {
    problems.push(`The "Set bookable hours" button has no dispatcher — a control without one is the `
      + `deadest a button can be.`);
  }
}

if (problems.length) {
  console.error("🔴 KICKOFF BOOKING IS NOT HONEST\n");
  for (const p of problems) console.error(`  🔴 ${p}\n`);
  console.error("  netlify/functions/_kickoff-slots.js · send-kickoff-invite.js · portal-book-kickoff.js · portal/portal.js");
  process.exit(1);
}

console.log("✅ kickoff booking is honest");
console.log("   one slot engine behind the picker, the portal booking and the sender");
console.log("   the sender refuses rather than booking blind, and never moves a chosen time silently");
console.log("   the portal tells 'could not check' apart from 'no times'");
console.log("   the OAuth scope is present and stays narrow (freebusy, not readonly)");
console.log("   the bookable hours are editable in the admin and stored per workspace");
