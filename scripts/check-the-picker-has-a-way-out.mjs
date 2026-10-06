#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — OPENING THE TIME PICKER IS NOT A ONE-WAY DOOR
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-09-30: *"when on client side change the time is selected and the date picker comes up
 * we need a way to close this view if they change their mind."*
 *
 * 🔴 "Change the time" on a CONFIRMED call replaced the whole card with a calendar — and that was
 * the end of the road:
 *   · no cancel, no back, no Escape
 *   · the confirmed time was no longer anywhere on the page, so the client could not see what they
 *     were being asked to give up
 *   · the only exits were booking a different slot or reloading the tab
 *
 * 🔑 LEAVING A VIEW MUST NEVER BE A SAVE. Opening the picker never touched the hold, so the way out
 * writes nothing and releases nothing — it re-reads and lets the normal branch render the confirmed
 * card again. → feedback_the_escape_hatch_stays_in_the_product
 *
 * 🔑 AND IT NAMES WHAT THEY WOULD BE KEEPING. "Keep this time" beside nothing is a control whose
 * effect the client has to guess, about the one fact this view took off the screen.
 * → feedback_instruct_by_what_is_on_screen
 *
 * WHAT IS PINNED:
 *   1. The picker carries the standing booking, so it can offer it back.
 *   2. The way out is rendered, inside the picker's own host, and says the time.
 *   3. Something listens for it, and what it does is a re-read — never a write.
 *   4. A first-ever booking shows no way out, because there is nothing to go back to.
 *
 * Exit 0 pass · 1 fail · 2 indeterminate. Mutation log at the bottom.
 */
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const fail = [], pass = [];

const read = (rel, min) => {
  const p = path.join(SITE, rel);
  if (!fs.existsSync(p)) return null;
  const s = fs.readFileSync(p, "utf8");
  return s.length < min ? null : s;
};
const raw = read("portal/portal.js", 200000);
const css = read("portal/portal.css", 50000);
if (!raw || !css) { console.error("⚠️  INDETERMINATE — portal sources not readable."); process.exit(2); }
// 🔴 The comments describing the fix quote the old behaviour. Strip them or this reads its own
// changelog as code. → feedback_a_comment_asserting_a_fix_is_not_the_fix
const code = raw.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

// ── 1 · the picker knows what it would be going back to ────────────────────────────────────────
// 🔑 Read from the response the picker already has. A second fetch, or a module-level "remember
// their booking" map, is a second copy of a fact that can go stale.
if (!/standing\s*=\s*j\.yourRequest && j\.yourRequest\.slot_start/.test(code)) {
  fail.push("portal/portal.js — the picker no longer carries the standing booking. Without it there "
    + "is nothing to offer back, and the client cannot see the time they are deciding about.");
} else pass.push("the picker carries the standing booking, from the response it already has");

if (!/_kickoffCache\.set\([^)]*standing/.test(code)) {
  fail.push("portal/portal.js — the standing booking is not put in the picker's cache, so it is lost "
    + "the first time the client changes month or day and the way out disappears mid-decision.");
} else pass.push("it survives changing the month or the day");

// ── 2 · the way out is on screen, and it says the time ─────────────────────────────────────────
{
  const i = code.indexOf("const keepBar");
  const bar = i < 0 ? "" : code.slice(i, code.indexOf("host.innerHTML", i));
  if (!bar) {
    fail.push("portal/portal.js — there is no way out of the picker. Pressing \"Change the time\" on a "
      + "confirmed call becomes a one-way door: the only exits are booking something else or "
      + "reloading the tab.");
  } else {
    if (!/data-kickoff-keep=/.test(bar)) {
      fail.push("portal/portal.js — the way-out bar renders no control. A sentence about the booking "
        + "with no button is a description of the trap, not an exit.");
    } else pass.push("the picker renders a control that leaves it");

    // 🔴 It must NAME the time. Verified by requiring the formatted value, not a hardcoded string.
    if (!/standing\.start/.test(bar) || !/toLocaleString/.test(bar)) {
      fail.push("portal/portal.js — the way out does not name the standing time. \"Keep this time\" "
        + "next to no time is a control whose effect the client has to guess.");
    } else pass.push("it names the time the client would be keeping");

    // 🔑 A first booking has nothing to go back to — the bar must be conditional on the booking.
    if (!/!standing\s*\?\s*""/.test(bar)) {
      fail.push("portal/portal.js — the way out is not gated on there being a standing booking, so a "
        + "client booking for the FIRST time is offered a way back to a call that does not exist.");
    } else pass.push("a first-ever booking is offered no way back, because there is none");
  }
  if (!/\$\{keepBar\}/.test(code)) {
    fail.push("portal/portal.js — the way-out bar is built and never rendered. A value computed and "
      + "never read looks exactly like a feature. → feedback_a_capability_nobody_calls_looks_finished");
  } else pass.push("the bar is actually rendered into the picker's host");
}

// ── 3 · leaving writes nothing ─────────────────────────────────────────────────────────────────
{
  const i = code.indexOf('closest("[data-kickoff-keep]")');
  if (i < 0) {
    fail.push("portal/portal.js — nothing listens for the way out, so it renders as a control and "
      + "does nothing. → feedback_a_gate_that_it_exists_is_not_a_gate_that_it_works");
  } else {
    const h = code.slice(i, i + 900);
    if (!/loadKickoffSlots\(clientId, \{\}\)/.test(h)) {
      fail.push("portal/portal.js — the way out does not simply re-read. It has to restore the "
        + "confirmed card from the server, not paint one from what the browser happens to hold.");
    } else pass.push("leaving re-reads and lets the normal branch restore the confirmed card");

    // 🔴🔴 LEAVING A VIEW IS NOT A SAVE. A cancel that POSTs is a cancel that changes something.
    if (/method:\s*"POST"|portal-book-kickoff|release|DELETE/.test(h)) {
      fail.push("portal/portal.js — the way out sends a write. Backing out of a picker must release "
        + "nothing and book nothing — the hold was never touched by opening it.");
    } else pass.push("leaving the picker writes nothing and releases nothing");
  }
}

// ── 4 · it has a style, or it is an invisible control ──────────────────────────────────────────
if (!/\.kc-keep\s*\{/.test(css)) {
  fail.push("portal/portal.css — `.kc-keep` has no rule, so the way out renders unstyled. A class no "
    + "stylesheet defines throws nothing and looks like a bug. → feedback_every_control_has_a_style");
} else {
  // 🔑 AND IT IS THE APPROVED ONE. Grey on grey is what Chris flagged: the exit sat at the same
  // weight as a time slot and read as a chip. The bar is blue and the button is an OUTLINE —
  // filled blue belongs to the slots, which are what actually start something.
  const i = css.indexOf(".kc-keep{");
  const rule = css.slice(i, css.indexOf("}", i));
  if (!/background:var\(--portal-accent-soft/.test(rule)) {
    fail.push("portal/portal.css — the way-out bar is back to grey. On a screen where nothing else "
      + "is filled it then reads as a chip rather than the exit — the thing Chris flagged.");
  } else pass.push("the way out carries the approved blue bar");
  const bi = css.indexOf(".kc-keep .pm-amend{");
  const brule = bi < 0 ? "" : css.slice(bi, css.indexOf("}", bi));
  if (/background:\s*var\(--portal-accent[,)]/.test(brule)) {
    fail.push("portal/portal.css — the Keep button is FILLED accent. That tier means \"the one that "
      + "starts something\" here, and on this screen that is a time slot; keeping what you already "
      + "have starts nothing.");
  } else pass.push("the Keep button stays an outline, so filled blue still means the slots");
}

// ── 5 · their own time is in the grid, and selecting it keeps rather than books ────────────────
{
  if (!/slots\.push\(\{ start: standing\.start, mine: true \}\)/.test(code)) {
    fail.push("portal/portal.js — the client's own booked slot is no longer put back into the grid. "
      + "`ourBusyIntervals` subtracts every hold in the workspace, so their own time is the ONE slot "
      + "guaranteed to be missing from their own picker — and it reads as taken by someone else.");
  } else pass.push("their own booked slot is put back into the grid");

  const i = code.indexOf("chosen.map((sl) => sl.mine");
  const row = i < 0 ? "" : code.slice(i, i + 700);
  if (!row) {
    fail.push("portal/portal.js — the grid no longer renders their own slot differently, so the one "
      + "time that is already theirs looks like every other offer.");
  } else {
    if (!/data-kickoff-keep=/.test(row)) {
      fail.push("portal/portal.js — their own slot still books rather than keeps. Chris: \"if we "
        + "select it it's not changing it\" — selecting the time you already have must not open a "
        + "request dialog for the time you already have.");
    } else pass.push("selecting their own time keeps it, and never re-requests it");
    if (/data-start=/.test(row.slice(0, row.indexOf("data-kickoff-pick")>=0 ? row.indexOf("data-kickoff-pick") : row.length))) {
      fail.push("portal/portal.js — their own slot still carries `data-start`, so the booking handler "
        + "can still fire on it.");
    }
  }
  if (!/kickoff-slot\.is-mine\{/.test(css)) {
    fail.push("portal/portal.css — `.kickoff-slot.is-mine` has no rule, so their own time renders "
      + "identically to every other slot and the distinction exists only in the markup.");
  } else pass.push("their own time is visually theirs");
}

// ── 6 · the card stops contradicting the picker ───────────────────────────────────────────────
{
  if (!/if \(standing\) _kickoffPicking\.add\(clientId\)/.test(code)) {
    fail.push("portal/portal.js — nothing records that the picker is open over a standing booking, "
      + "so the lede goes back to \"Pick a 30-minute slot below\" above a bar saying the call is "
      + "confirmed. One card, two claims.");
  } else pass.push("the card knows the picker is open over a booking that still stands");

  if (!/if \(!standing\) \{ if \(_kickoffMine\.delete\(clientId\)\)/.test(code)) {
    fail.push("portal/portal.js — opening the picker still un-books the call on screen. `_kickoffMine` "
      + "drives the pill, the headline and the step heading; deleting it flips a CONFIRMED call to "
      + "YOUR TURN when the client has given up nothing.");
  } else pass.push("looking at options does not un-book the call on screen");
}

// ── 7 · the way in does not depend on Google guessing an account ──────────────────────────────
{
  const fn = read("netlify/functions/kickoff-availability.js", 3000);
  if (!fn) { indet.push("kickoff-availability.js not readable"); }
  else {
    const f = fn.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    if (!/authuser=\$\{encodeURIComponent\(who\)\}/.test(f)) {
      fail.push("netlify/functions/kickoff-availability.js — the Meet link no longer pins the account. "
        + "Google then guesses which of the profile's accounts to use, and on 2026-09-30 that guess "
        + "returned a 400 to a client on a live call.");
    } else pass.push("the Meet link names the account we invited, so Google does not guess");

    if (!/meetCode:/.test(f)) {
      fail.push("netlify/functions/kickoff-availability.js — the meet CODE is not returned, so the "
        + "portal has one way in and it depends on Google resolving an account.");
    } else pass.push("the meet code is returned as a second way in");
  }
  // 🔴 A SUBSTRING IS NOT A CLASS. The first version matched /pm-cd-code/ and passed a mutation
  // that renamed it to `pm-cd-codeX` — the same trap as `.pm-amend` matching `.pm-amend-RENAMED`,
  // written into a gate whose whole job is catching that. Pin the boundary.
  // → feedback_a_gate_must_pin_the_property_not_the_spelling
  if (!/pm-cd-code["'\s]/.test(code)) {
    fail.push("portal/portal.js — the code is never rendered, so the fallback exists in the response "
      + "and nowhere the client can see. → feedback_a_capability_nobody_calls_looks_finished");
  } else pass.push("the code is on screen beside the button");
}

for (const x of pass) console.log(`  ✅ ${x}`);
for (const f of fail) console.log(`  🔴 ${f}`);
if (fail.length) { console.log(`\n🔴 FAIL — ${fail.length} way(s) the picker is a one-way door.`); process.exit(1); }
console.log(`\n✅ opening the time picker is not a one-way door (${pass.length} checks).`);

/* ─────────────────────────────────────────────────────────────────────────────────────────────────
 * MUTATION LOG — each must turn this gate red:
 *   1. stop carrying `standing` into the picker        → nothing to offer back
 *   2. drop it from the cache                          → the way out vanishes on a month change
 *   3. render the bar without the time                 → "Keep this time" beside no time
 *   4. render the bar unconditionally                  → a first booking offered a way back to nothing
 *   5. build keepBar and never interpolate it          → computed and never read
 *   6. remove the listener                             → a control that does nothing
 *   7. make the way out POST a release                 → leaving a view becomes a save
 *   8. delete the .kc-keep rule                        → an unstyled control
 * ─────────────────────────────────────────────────────────────────────────────────────────── */
