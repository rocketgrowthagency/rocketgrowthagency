#!/usr/bin/env node
/**
 * check-the-owner-questions-ui-contract.mjs — the owner-questions card behaves the way it was agreed.
 *
 * ─── WHY (2026-09-16) ────────────────────────────────────────────────────────────────────────────
 * Every defect this gate covers was found by CHRIS, ON SCREEN. Not one of them broke a test, threw
 * an error, or failed a payload check — the endpoints returned 200 throughout. A card can be wrong
 * in exactly the ways that leave the network clean, so the contract has to be asserted against the
 * source rather than against a response.
 *
 * ─── WHAT IT ASSERTS ─────────────────────────────────────────────────────────────────────────────
 *   1. A tap SAVES. No dirty-flag, no Save button — the first build left a permanently-greyed
 *      "Save" under the card because one control was doing two jobs.
 *   2. The one button CONFIRMS, and unlocks only when nothing is left to answer.
 *   3. An answered question can be UN-ANSWERED, and clearing posts an empty option.
 *   4. Clearing is ONE tap with an Undo — never a timed two-step. The armed state silently reset
 *      after 6s, so a second tap arriving later merely re-armed it: click, red pill, click, red
 *      pill, nothing cleared.
 *   5. No blanket `.fct-card > *` padding. It fixes the grey bleeding out by shrinking every row,
 *      including the one whose background is meant to run edge to edge.
 *   6. The admin kickoff heading COUNTS FROM THE DATA. It read "Four things to ask" directly above
 *      "1 of 5 captured".
 *   7. A failed admin boot says so even after the shell leaves "booting", and names an access
 *      failure rather than offering a reload that can never work.
 *
 * Exit 0 = the card still behaves as agreed · 1 = it drifted · 2 = could not tell.
 */
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (rel) => fs.readFileSync(path.join(SITE, rel), "utf8");

let js, css, admin;
try { js = read("portal/portal.js"); css = read("portal/portal.css"); admin = read("admin/admin.js"); }
catch (e) { console.error(`[ui-contract] INDETERMINATE — ${e.message}`); process.exit(2); }

const fail = [];
console.log("── the owner-questions card behaves as agreed ──");

// 1 ─ a tap saves, immediately
const pickBlock = js.match(/const pick = t\.closest\("\[data-fq-pick\]"\);[\s\S]{0,420}?\n  \}/);
if (!pickBlock) fail.push("could not find the option-pick handler");
else if (!/await saveFacts\(/.test(pickBlock[0])) {
  fail.push("picking an option no longer saves immediately — a tap must persist without a Save button");
}
if (/markFactsDirty|_factsDirty/.test(js)) {
  fail.push("dirty-state tracking is back; it produced a Save button that could never light up");
}
if (/id="factsSave"/.test(js)) fail.push('a "Save" button is back — the button must CONFIRM, not save');

// 2 ─ the one button confirms, gated on completeness
if (!/id="factsConfirm"/.test(js)) fail.push("no confirm button — the deliberate act that starts our work is missing");
if (!/id="factsConfirm"\$\{left \? " disabled" : ""\}/.test(js)) {
  fail.push("the confirm button is not gated on `left` — it must unlock only when nothing is unanswered");
}

// 3 + 4 ─ un-answering: one tap, with a way back, and no timer
if (!/data-fq-clear/.test(js)) fail.push("no way to clear an answer — a tap-only list has no route back to \"I haven't decided\"");
if (!/q\.answered \?[^\n]*data-fq-clear/.test(js)) fail.push("the clear control is not limited to answered questions");
// 🔑 Assert the WIRE, not just the declaration. The first version checked that the functions
// existed by name; renaming them away left the gate green because the markup markers were still
// there. A handler nothing calls is the same as no handler.
// → feedback_dead_check_selector_gap
if (!/const clear = t\.closest\("\[data-fq-clear\]"\)/.test(js) || !/await clearFact\(/.test(js)) {
  fail.push("nothing calls clearFact from the clear control — the button would render and do nothing");
}
if (!/async function clearFact/.test(js) || !/option: ""/.test(js)) {
  fail.push("clearFact no longer posts an empty option — the endpoint treats that as the deliberate clear");
}
if (!/const undo = t\.closest\("\[data-fq-undo\]"\)/.test(js) || !/await restoreFact\(/.test(js)) {
  fail.push("nothing calls restoreFact from the undo control — clearing would have no way back");
}
if (!/data-fq-undo/.test(js) || !/async function restoreFact/.test(js)) {
  fail.push("clearing offers no Undo — one tap without a way back is worse than the confirm step it replaced");
}
const clearBlock = js.match(/const clear = t\.closest\("\[data-fq-clear\]"\);[\s\S]{0,700}?\n  \}/);
if (clearBlock && /dataset\.armed|setTimeout/.test(clearBlock[0])) {
  fail.push("the clear control arms and disarms again — a timed two-step makes the same gesture do two different things depending on how long you paused");
}

// 5 ─ no blanket child padding on the card
// 🔑 Strip comments first. The first version of this check fired on the COMMENT that explains the
// rule's absence — a gate that flags its own documentation is a gate people switch off.
// → feedback_a_check_must_not_validate_itself
const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, "");
if (/\.fct-card\s*>\s*\*/.test(cssCode)) {
  fail.push("a blanket `.fct-card > *` padding rule is back — it insets the full-bleed tint band on every question row");
}

// 6 ─ the admin heading counts from the data
const heading = admin.match(/<h3[^>]*>([^<]*things to ask on the kickoff call)<\/h3>/);
if (!heading) fail.push("the admin kickoff heading is gone or was renamed");
else if (!/\$\{d\.total\}/.test(heading[1])) {
  fail.push(`the admin heading hardcodes its count ("${heading[1].trim()}") — it read "Four things to ask" above "1 of 5 captured"`);
}

// 7 ─ a failed boot is visible and named
if (!/neverBooted/.test(admin)) {
  fail.push('the admin boot net only covers the "booting" state again — a later failure renders a fully-chromed EMPTY admin');
}
if (!/does not have admin access/.test(admin)) {
  fail.push('a boot that fails on permissions no longer names the cause — "usually temporary" sends someone reloading forever');
}

console.log(`  portal: pick saves · confirm gated · clear+undo · no blanket padding`);
console.log(`  admin:  heading counts from data · boot failure visible and named`);

if (fail.length) {
  console.error(`\n✗ the owner-questions card drifted from what was agreed — ${fail.length} problem(s):`);
  for (const f of fail) console.error(`    ${f}`);
  console.error("\n  Every one of these was caught by eye, not by a test. The endpoints returned 200 throughout.");
  process.exit(1);
}
console.log("  ✅ the card behaves the way it was agreed");
process.exit(0);
