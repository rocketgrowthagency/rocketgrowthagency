#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — THE NEXT-ACTION CARD PERFORMS THE DECISION IT NAMES
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * reports/mockups/admin_next_action_card_v2.html, approved 2026-09-29: the primary action reads
 * "Approve Tue 1:30 PM" — the decision itself, on the button. The card used to say "Go to the
 * request →", sending Chris to another tab to press a button that said the same thing.
 * → feedback_a_finding_must_be_actionable_inside_the_product
 *
 * It is BUILT. This gate exists because it cannot be seen most days: the branch only renders while
 * a client has a REQUESTED kickoff slot, and `kickoff_slot_holds` is usually empty. Manufacturing
 * one to look at it would be a second user writing to production.
 * → feedback_a_write_test_on_a_live_client_is_a_user
 *
 * So the properties are pinned at the source, and they are the ones with real failure modes:
 *   · a button that APPROVES and also NAVIGATES (stale data-tab) lands somewhere mid-confirm;
 *   · a handler ADDED rather than ASSIGNED stacks on re-render and confirms the same slot twice;
 *   · a handler left behind on another branch fires for the NEXT CLIENT selected;
 *   · an Approve button with no time to approve.
 *
 * Exit 0 pass · 1 the card names a decision it cannot perform · 2 could not run.
 */
import fs from "node:fs";

// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT. A gate that can only ever read the real
// working tree cannot be pointed at a scratch copy, so its mutations cannot be run — and a
// gate nobody can make fail is a gate nobody has checked. Found 2026-10-06 when three
// mutations of `check-refusal-is-not-done` all came back green: it was reading straight past
// them. → feedback_a_gate_that_cannot_fail · feedback_the_harness_i_wrote_to_check_my_work_can_lie
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const W = `${__SITE}/`;
let src, html;
try {
  src = fs.readFileSync(W + "admin/admin.js", "utf8");
  html = fs.readFileSync(W + "admin/index.html", "utf8");
} catch { console.error("⛔ cannot read admin sources"); process.exit(2); }

const fail = [];

// 🔴 NO CHARACTER WINDOWS. A window measured in characters lies in both directions — it misses a
// property that moved past the cut, and it accuses correct code. These read the REAL block by
// matching braces from the opening one. → feedback_a_gate_window_measured_in_characters_will_lie
function blockAt(text, startIdx) {
  if (startIdx < 0) return "";
  let d = 0;
  for (let k = text.indexOf("{", startIdx); k >= 0 && k < text.length; k++) {
    const c = text[k];
    if (c === "{") d++;
    else if (c === "}") { d--; if (!d) return text.slice(startIdx, k + 1); }
  }
  return "";
}
// the whole if/else-if/else chain that starts at `startIdx`, so "every other branch" is the real set
function chainAt(text, startIdx) {
  let out = blockAt(text, startIdx);
  if (!out) return "";
  let cursor = startIdx + out.length;
  while (/^\s*else\b/.test(text.slice(cursor, cursor + 12))) {
    const nxt = blockAt(text, cursor);
    if (!nxt) break;
    out += nxt; cursor += nxt.length;
  }
  return out;
}

// ── 1 · THE DATA. `approve` exists only when there is a time to approve. ─────────────────────
const prod = src.match(/approve: askedIso \? \{[\s\S]{0,420}?\} : null,/);
if (!prod) fail.push("the next-action card no longer emits an `approve` action gated on askedIso");
else {
  const p = prod[0];
  if (!/clientId: askedId/.test(p)) fail.push("the approve action no longer carries the client it belongs to");
  if (!/start: askedIso/.test(p)) fail.push("the approve action no longer carries the slot it approves");
  if (!/label: `Approve \$\{kickoffShortWhen\(askedIso\)\}`/.test(p)) {
    fail.push("the Approve label no longer names the TIME — a bare \"Approve\" reads the same on every request");
  }
}
if (!/alt: askedIso \? \{ label: "Pick a different time"/.test(src)) {
  fail.push("the secondary \"Pick a different time\" action is gone from the card");
}

// ── 2 · THE RENDER. The primary becomes the action, and stops being a link. ──────────────────
const i = src.indexOf("if (data.admin.approve) {");
if (i < 0) fail.push("the renderer has no approve branch — the card can only navigate again");
else {
  const br = blockAt(src, i);
  if (!br) { console.error("⛔ the approve branch is unbalanced"); process.exit(2); }
  for (const attr of ["data-tab", "data-scroll"]) {
    if (!new RegExp(`removeAttribute\\("${attr}"\\)`).test(br)) {
      fail.push(`the approve branch no longer clears ${attr} — the button would approve AND navigate`);
    }
  }
  if (!/\.onclick = \(\) =>\s*\n?\s*answerKickoffRequest\(/.test(br)) {
    fail.push("the approve branch no longer ASSIGNS onclick to answerKickoffRequest");
  }
  if (/addEventListener\(\s*["']click["']/.test(br)) {
    fail.push("🔴 the approve branch ADDS a listener — a re-render stacks a second one and confirms the slot twice");
  }
  if (!/"confirm"/.test(br)) fail.push("the approve branch no longer passes the \"confirm\" action");
  if (!/a\.movesFrom/.test(br)) fail.push("the approve branch no longer passes movesFrom — a reschedule would read as a first booking");
}

// 🔴 EVERY OTHER BRANCH MUST CLEAR IT, or the approve handler survives onto the next client's card.
const tail = chainAt(src, i);
const elseBranches = (tail.match(/\} else[^{]*\{/g) || []).length;
const clears = (tail.match(/adminNextActionBtn\.onclick = null/g) || []).length;
if (elseBranches < 2) fail.push("the approve branch's else-chain changed shape — re-read it before trusting this gate");
else if (clears < elseBranches) {
  fail.push(`only ${clears} of ${elseBranches} non-approve branch(es) clear onclick — the handler can fire for the next client selected`);
}

// ── 3 · THE SECONDARY IS WIRED, not merely attributed. ───────────────────────────────────────
const ai = src.indexOf("if (data.admin.alt) {");
if (ai < 0) fail.push("the secondary action is no longer rendered");
else {
  const ab = chainAt(src, ai);
  if (!ab) { console.error("⛔ the secondary branch is unbalanced"); process.exit(2); }
  if (!/alt\.onclick = \(\) => \{/.test(ab)) {
    fail.push("🔴 the secondary carries data-tab but has no handler — handleTabClick is bound to the tab bar, not the document, so it would look pressable and do nothing");
  }
  if (!/alt\.onclick = null/.test(ab)) fail.push("the secondary does not clear its handler when it is hidden");
}

// ── 4 · THE ELEMENTS EXIST. A branch that writes into a missing node is a no-op. ─────────────
for (const id of ["adminNextActionAlt", "adminNextActionBtn"]) {
  if (!new RegExp(`id="${id}"`).test(html)) fail.push(`#${id} is not in admin/index.html — the branch writes into nothing`);
}

if (fail.length) {
  console.error("🔴 the next-action card cannot perform the decision it names:");
  for (const f of fail) console.error("   · " + f);
  process.exit(1);
}
console.log("✅ the next-action card performs the decision — approve names its time, assigns (never adds) its handler, clears it elsewhere, and the secondary is wired");
