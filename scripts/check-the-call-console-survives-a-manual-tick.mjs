#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — TICKING THE STEP MUST NOT DELETE THE CALL CONSOLE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-09-30, three hours before a kickoff call:
 *   *"i like the join the call console and all of that we spent a week building that for you just to
 *   remove it"*
 *
 * 🔴🔴 NOTHING WAS REMOVED. `kickoffConsoleHtml` was untouched and live on production. What removed
 * it from the SCREEN was its gate:
 *
 *     doneByClock: callStarted && st !== "done"
 *     const liveConsole = s.doneByClock ? kickoffConsoleHtml(o) : "";
 *
 * The console's only render site was behind a flag that turns OFF the moment somebody presses
 * **"✓ Mark step complete"** — the one control the card puts in front of you. Tick the step the
 * evening before the call and the T-5 facts, the 27-minute script, the clock that names the cut,
 * Join the call and the recap sender are all gone by morning, with nothing on screen saying why.
 *
 * 🔑 THE CONSOLE OWNS ITS OWN CLOCK. It renders from T-15, through the call, into the after/recap
 * pane, entirely from the booking. A SECOND gate on *how the step got closed* made the tick and the
 * console mutually exclusive — two correct pieces that could not be on screen together, which is
 * the same shape as the 09-28 defect where the console lived in a branch the step was never in.
 * → feedback_a_capability_nobody_calls_looks_finished · feedback_correct_is_not_the_same_as_happening
 *
 * WHAT IS PINNED:
 *   1. The done card calls the console UNCONDITIONALLY — its clock is the only gate.
 *   2. No reintroduced flag makes the console depend on the task's status.
 *   3. The console still gates itself on the booking, so it cannot render with nothing booked.
 *   4. Join the call and the recap are still inside it.
 *
 * Exit 0 pass · 1 fail · 2 indeterminate. Mutation log at the bottom.
 */
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const fail = [], pass = [];

const p = path.join(SITE, "admin/admin.js");
if (!fs.existsSync(p)) { console.error("⚠️  INDETERMINATE — admin/admin.js not found."); process.exit(2); }
const raw = fs.readFileSync(p, "utf8");
if (raw.length < 500000) { console.error(`⚠️  INDETERMINATE — admin.js is only ${raw.length} bytes.`); process.exit(2); }
// 🔴 The comment explaining the deletion NAMES the dead flag. Strip comments or this gate goes red
// on the record of its own fix. → feedback_a_comment_asserting_a_fix_is_not_the_fix
const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── 1 · the done card asks the console, it does not second-guess it ────────────────────────────
{
  const m = code.match(/const liveConsole\s*=\s*([^;]+);/);
  if (!m) {
    fail.push("admin/admin.js — `liveConsole` is gone, so the done card has no console at all. The "
      + "kickoff step is DONE from its start time, so the done card is the ONLY place the console "
      + "can render while the call is happening.");
  } else if (!/^kickoffConsoleHtml\(o\)$/.test(m[1].trim())) {
    fail.push(`admin/admin.js — the done card's console is conditional: \`${m[1].trim().slice(0, 80)}\`. `
      + "Any condition here is a SECOND clock competing with the console's own, and the last one "
      + "turned off whenever the operator ticked the step — deleting the console on the day of the call.");
  } else pass.push("the done card calls the console unconditionally; its clock is the only gate");
}

// ── 2 · the dead flag stays dead ───────────────────────────────────────────────────────────────
if (/\bdoneByClock\b/.test(code)) {
  fail.push("admin/admin.js — `doneByClock` is back. It was computed as `callStarted && st !== \"done\"` "
    + "and it is the reason a manual tick deleted the console. A value that exists only to gate the "
    + "console will get used to gate the console.");
} else pass.push("doneByClock is gone, not merely unused");

// 🔴 PIN THE PROPERTY, NOT THE SPELLING. A renamed flag doing the same job must also fail — what
// matters is that nothing between the console and the screen reads the task's STATUS.
{
  const i = code.indexOf("const liveConsole");
  const win = i < 0 ? "" : code.slice(Math.max(0, i - 400), i);
  if (/st\s*!==\s*"done"|status\s*!==\s*"done"|task\?\.status\s*!==/.test(win)) {
    fail.push("admin/admin.js — something immediately above the console render still compares the "
      + "task's status to \"done\". Whatever it is called, that is the old gate: the console would "
      + "again disappear the moment the step is ticked.");
  } else pass.push("nothing near the render makes the console depend on the task's status");
}

// ── 3 · the console still refuses to render with nothing booked ───────────────────────────────
{
  const a = code.indexOf("function kickoffConsoleHtml(");
  const body = a < 0 ? "" : code.slice(a, a + 1800);
  if (!body) {
    fail.push("admin/admin.js — kickoffConsoleHtml is gone. This is the console itself: the T-5 facts, "
      + "the 27-minute script in a 30-minute slot, the clock that names the cut, and the recap.");
  } else {
    if (!/callNow\s*\|\|\s*\(clk && clk\.phase === "pre" && clk\.minsToStart <= 15\)/.test(body)) {
      fail.push("admin/admin.js — the console no longer gates itself on the booking's clock. With the "
        + "done card now calling it unconditionally, this IS the only gate — losing it would put a "
        + "call console on a step with no call booked.");
    } else pass.push("the console still gates itself on the booking: T-15, live, then the recap pane");
  }
}

// ── 4 · what the week was spent building is still in it ───────────────────────────────────────
for (const [needle, what] of [
  ["Join the call", "the Join the call button"],
  ["data-kickoff-recap", "the recap that sends from the product"],
  ["data-kickoff-outcome", "the after-call disposition"],
  ["kc-countdown", "the countdown"],
]) {
  if (!code.includes(needle)) fail.push(`admin/admin.js — ${what} is no longer in the console.`);
}
if (!fail.some((f) => /no longer in the console/.test(f))) {
  pass.push("Join the call, the countdown, the disposition and the recap are all still in it");
}

for (const x of pass) console.log(`  ✅ ${x}`);
for (const f of fail) console.log(`  🔴 ${f}`);
if (fail.length) { console.log(`\n🔴 FAIL — ${fail.length} way(s) the call console can vanish on the day of the call.`); process.exit(1); }
console.log(`\n✅ ticking the step cannot delete the call console (${pass.length} checks).`);

/* ─────────────────────────────────────────────────────────────────────────────────────────────────
 * MUTATION LOG — each must turn this gate red:
 *   1. restore `s.doneByClock ? kickoffConsoleHtml(o) : ""`   → the defect, exactly
 *   2. rename the flag and keep the `st !== "done"` test      → the same defect under a new name
 *   3. drop the console's own T-15/live/after guard           → a console with no call booked
 *   4. remove Join the call / the recap / the countdown       → the week's work
 * ─────────────────────────────────────────────────────────────────────────────────────────── */
