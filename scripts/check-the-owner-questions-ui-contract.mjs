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
 *   8. A tap paints IMMEDIATELY and the save returns the card — the two fixes that took a tap from
 *      4.4s to 6ms. Losing either puts a 2-3s stare back in front of every answer.
 *  10. The client checklist is ONE list in number order — no "done pile" — and every settled step
 *      carries a way to change it, chosen by whether the client told us or we observed it.
 *   9. NO PENDING STATE anywhere in the portal. A one-tap answer that disables its row and reads
 *      "Saving…" looks broken, not busy — Chris reported it as "greyed out" twice.
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

// 8 ─ the latency work, which is invisible until it is gone
// 🔑 Assert the CALL inside the function that needs it, not merely that the painter is declared.
// A first version matched `paintSavedNow(` anywhere — and restoreFact's call kept it green while
// saveFacts had lost its own. A declaration nothing calls is the same as no painter.
// → feedback_dead_check_selector_gap
const bodyOf = (name) => {
  const i = js.indexOf(`async function ${name}(`);
  return i === -1 ? "" : js.slice(i, js.indexOf("\n}", i));
};
if (!/function paintSavedNow/.test(js)) fail.push("paintSavedNow is gone");
if (!/paintSavedNow\(/.test(bodyOf("saveFacts"))) {
  fail.push("saveFacts no longer paints before the write — a tap would wait ~2s before the row moves");
}
if (!/function paintClearedNow/.test(js)) fail.push("paintClearedNow is gone");
if (!/paintClearedNow\(/.test(bodyOf("clearFact"))) {
  fail.push("clearFact no longer paints immediately — clearing would wait for the round trip");
}
// 🔑 Match the BEHAVIOUR, not one spelling of it. The first version of this line expected a
// ternary and failed against the `if (j.card) …` the code actually uses.
if (!/if \(j\.card\)\s*renderFactsCard\(j\.card\)/.test(js)) {
  fail.push("the save response is no longer rendered — the browser is back to a second round trip per tap");
}
// 🔴 The paint claims a save that has not happened yet. If it fails, the screen MUST go back to
// what the database holds, or the client walks away believing an answer was stored.
const saveCatch = js.match(/const msg = clientError\(err, "save that answer"\);[\s\S]{0,320}?\n  \}/);
if (saveCatch && !/refreshFacts\(\)/.test(saveCatch[0])) {
  fail.push("a failed save does not re-read the card — the optimistic paint would leave an answer on screen that was never stored");
}

// 10 ─ one ordered checklist, and settled steps stay editable
{
  const code = js.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  if (/class="ai-done"/.test(code) || /already done<\/summary>/.test(code)) {
    fail.push("the completed-steps drawer is back — the visible list would read 4, 5, 7, 9 and a client told \"you're on 6\" could not find 6");
  }
  if (!/numbered\.map\(rowHtml\)/.test(code)) {
    fail.push("the checklist no longer renders every step in order — completed rows are being split out again");
  }
  // 🔑 Check the BUTTON and the HANDLER separately. `data-step-reopen` appears in both, so a single
  // file-wide match stayed green when the button was removed and only the listener remained — a
  // listener for a control that no longer renders. → feedback_dead_check_selector_gap
  if (!/data-step-reopen="\$\{escapeAttribute\(step\.id\)\}"/.test(code)) {
    fail.push("the Change button is gone from the row — a settled step the client told us about could not be changed");
  }
  if (!/closest\("\[data-step-reopen\],\[data-step-wrong\]"\)/.test(code)) {
    fail.push("nothing listens for Change / This isn't right — the buttons would render and do nothing");
  }
  if (!/data-step-wrong="\$\{escapeAttribute\(step\.id\)\}"/.test(code)) {
    fail.push("an observed step offers no way to tell us it is wrong");
  }
  // 🔴 An observed step must never be reopenable: its status is re-derived every render, so the
  // flip would bounce back and the portal would look like it ignored the client.
  const observed = code.match(/const OBSERVED = new Set\(\[[^\]]+\]\)/);
  if (!observed) fail.push("the OBSERVED set is gone — every done step would offer Change, including ones we only detect");
  else for (const id of ["m1.access.gbp", "m1.access.analytics", "m1.access.search_console", "m1.gbp.photos"]) {
    if (!observed[0].includes(id)) fail.push(`${id} is no longer marked observed — reopening it would be re-derived straight back to done`);
  }
}

// 9 ─ no pending state on a one-tap answer, anywhere
{
  const code = js.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const saving = [...code.matchAll(/"Saving…"|'Saving…'|>Saving…</g)];
  if (saving.length) {
    fail.push(`${saving.length} "Saving…" pending state(s) are back — a one-tap answer that greys its own row reads as broken, not busy`);
  }
  // …and the row must not disable its siblings while the write is in flight
  if (/\[data-choose\]"\)\.forEach\(\(b\) => \{ b\.disabled = true/.test(code)) {
    fail.push("the choice handler disables every button while saving — that is the exact grey-out Chris reported");
  }
}

console.log(`  portal: pick saves · confirm gated · clear+undo · no blanket padding · optimistic paint · no pending state`);
console.log(`  admin:  heading counts from data · boot failure visible and named`);

if (fail.length) {
  console.error(`\n✗ the owner-questions card drifted from what was agreed — ${fail.length} problem(s):`);
  for (const f of fail) console.error(`    ${f}`);
  console.error("\n  Every one of these was caught by eye, not by a test. The endpoints returned 200 throughout.");
  process.exit(1);
}
console.log("  ✅ the card behaves the way it was agreed");
process.exit(0);
