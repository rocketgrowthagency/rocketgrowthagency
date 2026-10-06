#!/usr/bin/env node
/**
 * check-the-setup-accordion-behaves.mjs — the client checklist collapses without hiding or locking.
 *
 * ─── WHY ─────────────────────────────────────────────────────────────────────────────────────────
 * Chris, 2026-09-25: *"also no accrodion is showing yet. all cards are open."* Fifteen steps open at
 * once is a wall; one open at a time is a task.
 *
 * Four things have to stay true, and each has already gone wrong once in this file's history:
 *
 *   1. EXACTLY ONE ROW OPEN. Opening a second without closing the first is just the wall again.
 *   2. COLLAPSED IS NOT HIDDEN. Every collapsed row still shows its number, pill and title, so a
 *      client told "you're on 6" can still find 6. Hiding whole rows is the done-pile defect
 *      wearing a different name. → project_client_action_checklist
 *   3. NOTHING IS LOCKED. Any row opens, in any order. Gating the list behind the kickoff call
 *      would invert the SOP, which collects access BEFORE the call.
 *   4. THE TOGGLE MUST NOT SWALLOW A ROW'S OWN CONTROLS. A head-wide click handler over buttons is
 *      how a row's "Change" or "Upload photos" silently stops working.
 *      → feedback_a_guard_must_reach_the_thing_it_guards
 *
 * 🔑 STATIC, on purpose. The behaviour is proven against the live signed-in portal by hand; this
 * runs in the daily suite where a browser and a magic link are not guaranteed, so it asserts the
 * structure that behaviour depends on.
 *
 * Exit 0 = intact · 1 = the accordion regressed · 2 = could not tell.
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
const JS = path.join(SITE, "portal/portal.js");
const CSS = path.join(SITE, "portal/portal.css");

if (!fs.existsSync(JS) || !fs.existsSync(CSS)) {
  console.log("  ⚠️  portal.js or portal.css is missing — cannot judge.");
  process.exit(2);
}
const js = fs.readFileSync(JS, "utf8");
const css = fs.readFileSync(CSS, "utf8");
const code = js.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const fail = [];
console.log("── the setup accordion behaves ──");

// 1 ─ rows carry a collapsed state and a toggle that reaches it
if (!/is-collapsed/.test(code)) {
  fail.push("no collapsed state on the step rows — every step would be open at once again");
}
if (!/data-step-toggle=/.test(code)) {
  fail.push("nothing renders data-step-toggle, so no row can be opened or closed");
}
if (!/closest\("\[data-step-toggle\]"\)/.test(code)) {
  fail.push("nothing listens for data-step-toggle — the rows would render collapsed and never open");
}

// 2 ─ opening one closes the rest. The handler must clear the state across the whole list.
{
  const fn = (() => {
    const m = code.match(/^\s*function toggleStepRow\s*\(/m);
    if (!m) return "";
    let i = code.indexOf("{", m.index + m[0].length - 1);
    let depth = 0;
    for (let j = i; j < code.length; j++) {
      if (code[j] === "{") depth++;
      else if (code[j] === "}" && --depth === 0) return code.slice(i, j + 1);
    }
    return "";
  })();
  if (!fn) fail.push("toggleStepRow is gone — this check is not reading anything");
  else if (!/querySelectorAll\(["'`]\.pm-step-row["'`]\)[\s\S]{0,200}?add\(["'`]is-collapsed["'`]\)/.test(fn)) {
    fail.push("opening a row no longer collapses the others — two rows could be open at once, which is the wall this replaced");
  }
}

// 3 ─ 🔴 COLLAPSED HIDES THE DETAIL, NEVER THE HEAD. A rule that hides the row itself, or hides the
//     head, takes the number and title off screen and breaks "you're on 6".
{
  const rule = css.match(/\.pm-step-row\.is-collapsed[^{]*\{[^}]*\}/g) || [];
  if (!rule.length) fail.push("no CSS collapses a row — the class would be set and nothing would look different");
  const hidesWholeRow = rule.some((r) => /^\.pm-step-row\.is-collapsed\s*\{[^}]*display:\s*none/.test(r));
  if (hidesWholeRow) {
    fail.push("a collapsed row is hidden entirely — its number, pill and title vanish, so a client told \"you're on 6\" could not find 6");
  }
  const keepsHead = rule.some((r) => /not\(\.pm-step-row-head\)/.test(r));
  if (!keepsHead && !hidesWholeRow) {
    fail.push("the collapse rule does not exempt .pm-step-row-head — the heading would fold away with the detail");
  }
}

// 4 ─ the toggle must step aside for a real control
if (!/closest\("button, a, input, select, textarea, label"\)/.test(code)) {
  fail.push("the toggle no longer steps aside for buttons and inputs inside the head — a row's own controls would stop responding");
}

// 5 ─ 🔴 NOT LOCKED. Anything that disables a row, or gates it on the kickoff, inverts the SOP.
if (/is-collapsed[\s\S]{0,200}(pointer-events:\s*none|cursor:\s*not-allowed)/.test(css)
  || /data-step-toggle[^>]{0,120}\bdisabled\b/.test(code)) {
  fail.push("collapsed rows are being LOCKED, not just folded — the access list is meant to be collected before the kickoff, not unlocked by it");
}

// 5b ─ 🔴 EXACTLY ONE ROW IS MARKED "NOW". Chris, 2026-09-25: *"it should not be yellow until its
//      ready right? so NEXT step is yellow."* The approved mockup carries is-now on ONE article out
//      of eight. Marking every row the client could act on paints eight orange rails at once, which
//      is wallpaper, not emphasis.
//      🔑 "Now" is the NEXT step, not the OPEN one — expanding a later row must not move the marker.
{
  const m = code.match(/class="pm-step-row\$\{([^}]*)\}/);
  if (!m) fail.push("the row no longer computes its own classes — this check is not reading anything");
  else if (!/\bnowStepId\b/.test(m[1])) {
    fail.push('the "now" marker is not driven by a single next-step id — every actionable row would carry the orange edge at once, which is wallpaper rather than emphasis');
  }
  if (/nowStepId\s*=\s*openStepId/.test(code)) {
    fail.push("the marker follows whatever is EXPANDED — opening a later row would move \"where am I up to\"");
  }
}

// 6 ─ the chosen row must survive a re-render, or the accordion snaps shut on every badge flip
// 🔑 \b, and BOTH halves of the round trip. A bare /_openStep/ still matched after the map was
// renamed to _openStepXX — a substring is not a reference. → feedback_a_gate_that_cannot_fail
if (!/\b_openStep\b\.get\(/.test(code) || !/\b_openStep\b\.set\(/.test(code)) {
  fail.push("nothing both stores and reads which row is open, so a re-render would snap the list shut under the client");
}

if (fail.length) {
  console.log(`\n🔴 ${fail.length} problem(s):`);
  for (const f of fail) console.log(`    ${f}`);
  process.exit(1);
}
console.log("  one row open · collapsed keeps its heading · nothing locked · controls still reachable");
console.log("\n✅ the accordion folds the detail without hiding or gating anything.");
process.exit(0);
