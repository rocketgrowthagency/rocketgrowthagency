#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-internal-work-cannot-look-client-facing.mjs
//
// 🔴 WHY (redesign approved by Chris, 2026-09-22). The admin client page rendered the Fix plan —
// raw audit findings written for US — as the same white card, with the same blue icon chip, as
// Monthly report and Approval queue. The ONLY thing marking it internal was a sentence in its body
// text: "Internal only — never shown to the client."
//
// 🔑 A SENTENCE IS NOT A BOUNDARY. Admins screen-share this page on client calls. A label you have
// to read cannot stop something you are not looking at, and "they'll notice the wording" is exactly
// the assumption the client/admin boundary exists to remove. → project_client_admin_boundary
//
// WHAT IT ASSERTS
//   1. The Fix plan card carries the internal CLASS and the internal CHIP on every render path —
//      including its loading state and its error state, which are easy to forget.
//   2. The internal class has real visual treatment in the stylesheet (not just a hook that styles
//      nothing, which would look identical to a client-facing card).
//   3. The ⓘ note button only renders where CARD_NOTES actually has an entry.
//   4. Every CARD_NOTES entry has all three lines — a note that says "what this is" and then stops
//      is the half-answer the client-side "Show me how" shipped with.
//
// exit 0 = held · 1 = internal work can pass for client-facing · 2 = cannot tell
// → feedback_we_never_promise_what_we_dont_do · feedback_an_element_that_exists_is_not_one_they_can_see
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const JS = path.join(SITE, "admin", "admin.js");
const CSS = path.join(SITE, "admin", "admin.css");

if (!fs.existsSync(JS) || !fs.existsSync(CSS)) {
  console.error("⚠️  INDETERMINATE — admin.js or admin.css not found.");
  process.exit(2);
}

// Comments explain the rule and contain the very strings it looks for. Strip them first.
// → feedback_dead_check_selector_gap
const strip = (s) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const js = strip(fs.readFileSync(JS, "utf8"));
const css = strip(fs.readFileSync(CSS, "utf8"));

const problems = [];

// ── 1. EVERY render path for the Fix plan marks it internal.
//    The card paints three ways: the cockpit placeholder, the loaded plan, and the load-error
//    fallback. The error path is the one that silently loses its chip.
const fixHeads = [...js.matchAll(/<span class="mt">Fix plan<\/span>([\s\S]{0,220}?)<\/div>/g)];
if (!fixHeads.length) {
  console.error("⚠️  INDETERMINATE — no Fix plan card header found; this gate no longer describes the page.");
  process.exit(2);
}
fixHeads.forEach((m, i) => {
  if (!/chip-internal/.test(m[1])) {
    problems.push(`Fix plan render path #${i + 1} has no "Internal" chip. Admins screen-share this `
      + `page; a card that looks client-facing will be treated as client-facing.`);
  }
});

// The container must carry the class that tints it.
if (!/class="admin-mod is-internal"/.test(js)) {
  problems.push('the Fix plan container lost `class="admin-mod is-internal"` — without it the card '
    + "renders as an ordinary white card regardless of the chip.");
}

// ── 2. The class must actually LOOK different. A hook that styles nothing is worse than no hook:
//    the gate passes and the card still looks client-facing.
const rule = css.match(/\.admin-mod\.is-internal\s*\{([^}]*)\}/);
if (!rule) {
  problems.push(".admin-mod.is-internal has no rule in admin.css — the class marks nothing.");
} else {
  const decls = rule[1];
  const hasGround = /background\s*:/.test(decls);
  const hasEdge = /border\s*:/.test(decls) && /dashed|dotted/.test(decls);
  if (!hasGround || !hasEdge) {
    problems.push(`.admin-mod.is-internal must differ in BOTH ground and edge (found `
      + `background:${hasGround}, dashed/dotted border:${hasEdge}). One signal is a style tweak; `
      + `two is a category.`);
  }
}
if (!/\.chip-internal\s*\{/.test(css)) {
  problems.push(".chip-internal has no rule — the chip would render as bare text.");
}

// ── 3. The ⓘ must not promise a panel that does not exist.
// 🔴 CHECK INSIDE cardNote ITSELF. A first version tested the whole file for the guard — and
// `cardNotePanel` carries an identical line, so deleting the guard from `cardNote` left the gate
// green. Two functions sharing a line means a file-wide grep proves nothing about either.
const noteFn = js.match(/function cardNote\s*\(key\)\s*\{([\s\S]*?)\n\}/);
if (!noteFn) {
  problems.push("cardNote() is gone — the ⓘ has no renderer.");
} else if (!/return ""/.test(noteFn[1]) || !/!n(\.is)?\b/.test(noteFn[1])) {
  problems.push("cardNote() no longer returns \"\" for a card with no note — an icon that opens "
    + "nothing is the 'Show me how' defect rebuilt in admin.");
}

// ── 4. Every note carries all three lines.
const block = js.match(/const CARD_NOTES\s*=\s*\{([\s\S]*?)\n\};/);
if (!block) {
  console.error("⚠️  INDETERMINATE — CARD_NOTES not found.");
  process.exit(2);
}
const entries = [...block[1].matchAll(/(\w+)\s*:\s*\{([\s\S]*?)\},/g)];
if (entries.length < 5) {
  console.error(`⚠️  INDETERMINATE — parsed only ${entries.length} note(s); the parser has drifted.`);
  process.exit(2);
}
for (const [, key, body] of entries) {
  for (const field of ["is", "for", "done"]) {
    if (!new RegExp(`\\b${field}\\s*:\\s*["'\`]`).test(body)) {
      problems.push(`CARD_NOTES.${key} is missing "${field}" — a note that answers two of the three `
        + `questions is the half-answer this pattern exists to avoid.`);
    }
  }
}

if (problems.length) {
  console.error(`🔴 FAIL — ${problems.length} problem(s):\n`);
  for (const p of problems) console.error(`   • ${p}\n`);
  process.exit(1);
}

console.log(`✅ internal work cannot pass for client-facing — ${fixHeads.length} Fix plan render `
  + `path(s) chipped and tinted, and ${entries.length} card note(s) each answer all three questions.`);
process.exit(0);
