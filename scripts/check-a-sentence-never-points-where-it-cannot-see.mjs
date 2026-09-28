// check-a-sentence-never-points-where-it-cannot-see.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 "BELOW" IS A CLAIM ABOUT LAYOUT, MADE BY A STRING THAT CANNOT SEE THE LAYOUT.
//
// Found 2026-09-28 from Chris's screenshots. The client step card's "You are done when" strip said
// "you tell us BELOW" — and it renders BELOW the control on an input step, because pm-doit and
// pm-choices sit on opposite sides of it:
//
//     pm-doit      (the field + its button)   ← control, on an INPUT step
//     pm-knowdone  ("You are done when …")    ← the strip
//     pm-choices   (the choice buttons)       ← control, on a CHOICE step
//
// One sentence, two positions. It was right on choice steps and pointed the wrong way on input
// steps. → feedback_a_client_message_must_agree_with_itself
//
// 🔑 THE RULE: copy whose position is not fixed may not name a direction. This does not ban "below"
// from the portal — it bans it from the shared strings that can land in either place.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const JS = path.join(SITE, "portal", "portal.js");
const pass = [], fail = [];

if (!fs.existsSync(JS)) { console.error("⚠️  INDETERMINATE — portal.js not found."); process.exit(2); }
const code = fs.readFileSync(JS, "utf8");

// ── 1. THE SHARED STRIP'S COPY NAMES NO DIRECTION ──────────────────────────────────────────────
const at = code.indexOf("const DONE_WHEN");
if (at < 0) fail.push("portal/portal.js — the DONE_WHEN map is gone; the card no longer says how a step finishes.");
else {
  const end = code.indexOf("};", at);
  const map = code.slice(at, end);
  const DIRECTIONS = /\b(below|above|to the right|to the left|underneath|further down|up here)\b/i;
  const lines = [...map.matchAll(/^\s*(detected|client|choice|rga):\s*`([^`]*)`/gm)];
  if (lines.length < 4) fail.push(`portal/portal.js — DONE_WHEN has ${lines.length} of the 4 completion kinds; a step whose kind is missing gets no sentence at all.`);
  else pass.push("all four completion kinds have a sentence");
  for (const [, kind, text] of lines) {
    const m = text.match(DIRECTIONS);
    if (m) fail.push(`portal/portal.js — the "${kind}" done-when line says "${m[0]}", but this strip renders above the controls on a choice step and below them on an input step. It cannot know where it is.`);
  }
  if (!fail.length) pass.push(`no done-when line names a direction (${lines.length} checked)`);
}

// ── 2. THE LABEL AND ITS SENTENCE ARE ONE TEXT RUN ─────────────────────────────────────────────
// 🔴 A 6px margin looks like a space and copies as nothing. Chris pasted the line back as
// "You are done whenyou pick one". A sentence a client might quote has to survive being copied.
const strip = code.match(/<div class="pm-knowdone"><b>You are done when<\/b>(.{0,3})<span>/);
if (!strip) fail.push("portal/portal.js — the done-when strip's markup has changed shape; check the label still precedes the sentence.");
else if (!/\s/.test(strip[1])) fail.push("portal/portal.js — there is no literal space between \"You are done when\" and the sentence; it renders on a margin and copies as \"whenyou\".");
else pass.push("the label and its sentence are separated by a real space, not only a margin");

// ── 3. AND IT STILL DISAPPEARS ONCE THE STEP IS SETTLED ────────────────────────────────────────
// 🔴 The whole strip is an instruction. On a finished step it is an instruction to do something
// already done — the defect Chris caught on the confirmed booking.
const guard = code.slice(Math.max(0, at - 700), at);
if (!/settled/.test(guard)) fail.push("portal/portal.js — the done-when strip no longer checks whether the step is settled, so a finished step will tell the client to act.");
else pass.push("a settled step renders no done-when line");

for (const p of pass) console.log(`  ✅ ${p}`);
if (fail.length) {
  console.error(`\n🔴 FAIL — ${fail.length} problem(s) with the done-when line:`);
  for (const f of fail) console.error(`   • ${f}`);
  process.exit(1);
}
console.log(`\n✅ the done-when line never points somewhere it cannot see (${pass.length} checks).`);
