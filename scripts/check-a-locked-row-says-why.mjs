#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// A LOCKED ROW SAYS WHY, AND NAMES THE BLOCKING STEP BY NUMBER
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴🔴 WHY. A locked checklist row said "🔒 Locked" and nothing else. The reason existed, was
// correct, and lived in the row's `title` tooltip — moved there on 2026-09-30 because ~25 locked
// rows each growing a second row is 25 rows restating what the icon already says.
//
// That objection is right, and it is not an argument for hiding the answer. Measured on the live
// checklist 2026-10-07: step 22's OWN dependency is done and it is locked by a TRANSITIVE one four
// rows up, so a bare pill on a row whose visible dependency is complete reads as a broken lock.
//
// 🔑 THE NUMBER IS LOOKED UP, NEVER COUNTED. It comes from `numOf` — the same producer that numbers
// the row — so a lock can never name a number the list does not show. A second way of counting is a
// second answer, which is how a toast once said "step 23" beside a card reading 26.
//
// → project_a_step_number_has_one_home · feedback_instruct_by_what_is_on_screen
// Exit 0 healthy · 1 the lock is silent or numbers itself · 2 INDETERMINATE

import fs from "node:fs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const fails = [];
let src, css;
try {
  src = fs.readFileSync(`${SITE}/admin/admin.js`, "utf8");
  css = fs.readFileSync(`${SITE}/admin/admin.css`, "utf8");
} catch (e) { console.error(`⚠️  INDETERMINATE — cannot read the admin: ${e.message}`); process.exit(2); }

// 🔴 Line comments before block — this file's own header quotes the markup it checks for.
// → feedback_a_comment_stripper_in_the_wrong_order_deletes_code
const code = src.replace(/^[ \t]*\/\/.*$/gm, " ").replace(/\/\*[\s\S]*?\*\//g, " ");

// the locked row must render the reason, not only the pill
const lockedRow = code.match(/<span class="ob-status locked"[\s\S]{0,200}/);
if (!lockedRow) { console.error("⚠️  INDETERMINATE — the locked row markup moved."); process.exit(2); }
if (!/\$\{untilHtml\}/.test(code)) {
  fails.push("the locked row renders no reason on the line — only the 🔒 pill, which on a row whose "
    + "own dependency is complete reads as a broken lock");
}

// each of the three lock causes must produce its own wording
for (const [cause, probe] of [
  ["a dependency", /s\.blockers && s\.blockers\.length[\s\S]{0,600}?ob-until/],
  ["Google not connected", /s\.oauthBlocked\)\s*\{[\s\S]{0,200}?ob-until/],
  ["an explicit block", /s\.blocked\)\s*\{[\s\S]{0,200}?ob-until/],
]) if (!probe.test(code)) fails.push(`a row locked by ${cause} produces no reason on the row`);

// 🔑 the number must come from the row's own producer
const until = (code.match(/untilHtml = `<span class="ob-until">until[\s\S]{0,400}/) || [""])[0];
if (until && !/numOf\(/.test(code.slice(Math.max(0, code.indexOf(until) - 400), code.indexOf(until) + 400))) {
  fails.push("the blocking step's number is not resolved through numOf — a second way of counting is a second answer");
}
if (/step \$\{bIdx \+ 1\}|step \$\{i \+ 1\}/.test(code)) {
  fails.push("the locked row numbers the blocking step from an array index rather than the page producer");
}
// blockerIds must survive, or the title cannot be numbered at all
if (!/r\.blockerIds = blockers;/.test(code)) {
  fails.push("blockerIds is not kept beside blockers, so the blocking step cannot be numbered");
}

// 🔴 the warning ink is for the ABNORMAL causes only — colouring every locked row hides the two
// that need attention. → feedback_a_state_a_scale_and_a_series_are_three_palettes
if (!/\.ob-until\b/.test(css)) fails.push("admin.css does not style .ob-until");
if (!/\.ob-until\.warn/.test(css)) fails.push("admin.css has no warn variant, so an abnormal lock reads like an ordinary wait");
const depBranch = (code.match(/s\.blockers && s\.blockers\.length\)\s*\{[\s\S]{0,500}?\}/) || [""])[0];
if (/ob-until warn/.test(depBranch)) {
  fails.push("waiting your turn is styled as a warning — then the two locks that need attention are "
    + "invisible among twenty that do not");
}

if (fails.length) {
  console.error(`❌ a locked row does not say why — ${fails.length} problem(s):\n`);
  for (const f of fails) console.error(`   · ${f}`);
  process.exit(1);
}
console.log("✅ every lock cause produces a reason on the row, the blocking step is numbered by the "
  + "page's own producer, and only the abnormal causes take the warning ink");
