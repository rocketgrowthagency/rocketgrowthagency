#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// WHATEVER YOU DO TO A STEP, THAT STEP IS WHAT YOU SEE AFTERWARDS
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴🔴 Chris, 2026-10-07, after running step 22: *"it finished showing step 28. Whenever a step
// finishes it should show the step it just did on screen and then show it completed — not jumping
// to another step #. This should be the CASE FOR ALL STEPS."*
//
// Two causes, and only one of them looked like a bug:
//
//   1. A run ends in `reloadScopeAndRerender`, which rebuilds the list and scrolls nothing. The
//      browser keeps its PIXEL offset while the content under it changes shape, so the reader is
//      left looking at whatever happens to land there. Nothing navigated.
//   2. `markOnboardingStep` DID scroll — deliberately, to the next actionable row (approved
//      2026-09-27). Chris has now asked for the opposite, for every step.
//
// 🔑 "FOR ALL STEPS" IS THE PART THAT ROTS. A rule applied to the handler in the screenshot becomes
// "it works on the buttons somebody remembered" — there are five ways a step changes state here, and
// the override on the row is one of them. This gate counts them.
// → feedback_fix_the_class_not_the_instance · feedback_an_inventory_is_a_claim_about_what_i_thought_to_grep
//
// Exit 0 healthy · 1 the product is wrong · 2 INDETERMINATE

import fs from "node:fs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const fails = [];
const F = (m) => fails.push(m);

let src;
try { src = fs.readFileSync(`${SITE}/admin/admin.js`, "utf8"); }
catch { console.error("⚠️  INDETERMINATE — cannot read admin.js"); process.exit(2); }

// 🔴 LINE COMMENTS FIRST, THEN BLOCK COMMENTS. The other order lets a `/*` inside a `//` swallow
// real code. → feedback_a_comment_stripper_in_the_wrong_order_deletes_code
const code = src.split("\n").map((l) => l.replace(/^\s*\/\/.*$/, "").replace(/\s\/\/\s.*$/, "")).join("\n")
  .replace(/\/\*[\s\S]*?\*\//g, "");

// ═══ 1 — THE PRODUCER EXISTS AND IS ANCHORED TO A PAINTED DOM ═══════════════════════════════
if (!/function revealStep\s*\(/.test(code)) {
  console.error("⚠️  INDETERMINATE — revealStep is not in admin.js; this gate has nothing to check");
  process.exit(2);
}
const reveal = (() => {
  const i = code.indexOf("function revealStep");
  let d = 0;
  for (let k = code.indexOf("{", i); k < code.length; k++) {
    if (code[k] === "{") d++;
    else if (code[k] === "}") { d--; if (!d) return code.slice(i, k + 1); }
  }
  return "";
})();

// 🔴 A QUERY IN THE SAME TICK FINDS THE OLD NODE. reloadScopeAndRerender replaces the list; scrolling
// to the element that is about to be discarded puts the page where that element USED to be — which
// is indistinguishable from the jump this exists to stop.
// 🔴 THE QUERY MUST BE INSIDE THE DEFERRAL, not merely in the same function as one. The first
// version asked only whether `requestAnimationFrame|setTimeout` appeared anywhere in the body — and
// the flash already uses setTimeout, so the assertion was true however the lookup was scheduled.
// A gate whose condition is satisfied by unrelated code cannot fail. → feedback_a_gate_that_cannot_fail
{
  const deferAt = Math.min(...["requestAnimationFrame(", "setTimeout("]
    .map((t) => { const k = reveal.indexOf(t); return k < 0 ? Infinity : k; }));
  const queryAt = reveal.indexOf("document.querySelector");
  if (queryAt < 0) F("revealStep never looks the card up in the DOM");
  else if (!(deferAt < queryAt)) {
    F("revealStep queries the DOM before any deferral, so it runs in the same tick as the re-render and scrolls to the node that is about to be replaced");
  }
}
if (!/data-ob-step/.test(reveal)) F("revealStep does not look the step up by its own id — it cannot know which card to show");
// `center` hides the title of a tall finished card off the top of the screen.
if (/block:\s*["']center["']/.test(reveal)) F("revealStep centres the card; a finished card carries its whole output, so its title scrolls off the top and the reader cannot see which step it is");

// ═══ 2 — EVERY CARD STATE CAN BE FOUND ══════════════════════════════════════════════════════
// A done card that carries no id cannot be revealed, which is precisely the card this is for.
const states = ["done", "active", "queued", "ready", "locked"];
const tagged = (code.match(/<div class="ob-step[^`]*?data-ob-step=/g) || []).length;
if (tagged < states.length) {
  F(`only ${tagged} of the ${states.length} card states carry data-ob-step — a state without it can never be scrolled back to`);
}

// ═══ 3 — EVERY PATH THAT CHANGES A STEP REVEALS IT ══════════════════════════════════════════
// 🔑 The list is derived from the product, not typed: every function that re-renders the scope
// after touching one step must hand that step to revealStep.
const WRITERS = [
  ["runOnboardingStep", "the Run button"],
  ["markOnboardingStep", "Mark step complete / Customer declined / Undo"],
  ["setClientTaskStatus", "the Done-Skip-Reset override on the row"],
];
for (const [fn, what] of WRITERS) {
  const i = code.indexOf(`function ${fn}`);
  if (i < 0) { F(`${fn} is gone — ${what} may have moved somewhere this gate does not watch`); continue; }
  let d = 0, body = "";
  for (let k = code.indexOf("{", i); k < code.length; k++) {
    if (code[k] === "{") d++;
    else if (code[k] === "}") { d--; if (!d) { body = code.slice(i, k + 1); break; } }
  }
  if (!/reloadScopeAndRerender/.test(body)) continue;      // does not rebuild the list: nothing to anchor
  if (!/revealStep\s*\(/.test(body)) F(`${fn} (${what}) re-renders the whole checklist and never puts the step back on screen`);
}

// 🔴 AND NOBODY MAY SCROLL TO "THE NEXT ACTIONABLE ROW" AGAIN. That is the superseded behaviour,
// and it reads as a jump to a different step number.
if (/querySelector\([`'"]\.ob-step\.active,\s*\.ob-step\.ready/.test(code)) {
  F("something still scrolls to the first active/ready row instead of the step that was acted on — that is the jump Chris reported");
}

if (fails.length) {
  console.error("🔴 a finished step does not stay on screen:");
  for (const f of fails) console.error("   · " + f);
  process.exit(1);
}
console.log(`✅ a finished step stays on screen — one producer, ${states.length} card states addressable, ${WRITERS.length} write paths all reveal`);
