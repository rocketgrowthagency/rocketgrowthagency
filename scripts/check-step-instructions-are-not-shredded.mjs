#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-step-instructions-are-not-shredded.mjs
//
// 🔴 WHY (2026-09-24). Chris screenshotted step 2 and its instructions read:
//
//     1. Google Calendar + Google Meet (decided 2026-09-03 — Workspace is already paid for,
//     2. and the invite arrives from a domain they can verify).
//     ...
//     6. You do not open Google Calendar. Pressing the button twice does not send a second invite:
//
// Item 1 ends on a comma. Item 2 begins with "and". Item 6 ends on a colon. A step's
// `instructions` is a SOFT-WRAPPED PROSE BLOCK, and the card was doing
// `split("\n").map(trim).filter(Boolean).slice(0, 6)` and dropping each surviving line into an
// `<ol>`. Three defects at once, on EVERY step card in the product:
//
//   · a wrapped continuation became its own numbered item (sentences cut mid-clause)
//   · hand-numbered sub-items were RENUMBERED by the <ol> — "Must contain, in this order: 1,2,3,4"
//     rendered as 3,4,5,6, because the two lead-in prose lines advanced the same counter
//   · `.slice(0, 6)` cut mid-list: step 1's sub-item "4. Who to contact and how" and its
//     🔴 "Do NOT re-sell, and do NOT re-open scope" warning were INVISIBLE to the operator
//
// 🔑 The root defect was treating prose as a list. A line break inside a paragraph is not a new
// item. → feedback_instruct_by_what_is_on_screen
//
// WHAT THIS CHECKS — by RUNNING the real parser from admin.js against every step in BOTH playbooks:
//   1. no rendered block is cut off (ends on a comma or semicolon)
//   2. no block is an orphaned continuation of the one above it
//   3. nothing is silently truncated — every non-empty source line survives into some block
//   4. the renderer numbers ONLY genuine list items, and the CSS drives numbering with a counter
//      that prose does not increment
//
// exit 0 = instructions render as written · 1 = they are shredded · 2 = cannot tell
// → feedback_a_fix_without_a_gate_regresses · feedback_a_gate_can_run_the_code_it_checks
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const ADMIN = path.join(SITE, "admin", "admin.js");
const CSS = path.join(SITE, "admin", "admin.css");
const PLAYBOOKS = path.join(SITE, "data", "playbooks", "playbooks.json");

const indeterminate = (m, ...x) => { console.error(`⚠️  INDETERMINATE — ${m}`); x.forEach((l) => console.error(`   ${l}`)); process.exit(2); };
for (const f of [ADMIN, CSS, PLAYBOOKS]) if (!fs.existsSync(f)) indeterminate(`${path.basename(f)} not found.`);

const src = fs.readFileSync(ADMIN, "utf8");
const css = fs.readFileSync(CSS, "utf8");
const problems = [];

// ── load the REAL parser, by brace balance ────────────────────────────────────────────────────
// 🔑 Filled from admin.js below — never restated here, or this gate drifts from the parser.
const SENTINEL = { li: "", bu: "" };
const STRIP = (t) => String(t).split(SENTINEL.li).join("").split(SENTINEL.bu || "\u0000").join("");
let sopBlocks;
{
  const at = src.indexOf("function sopBlocks");
  if (at < 0) {
    indeterminate("admin.js has no sopBlocks() parser.",
      "If the instruction rendering was restructured, re-point this gate deliberately — do not delete it.");
  }
  let d = 0, end = -1;
  for (let i = src.indexOf("{", at); i < src.length; i++) {
    if (src[i] === "{") d++;
    else if (src[i] === "}") { d--; if (!d) { end = i + 1; break; } }
  }
  if (end < 0) indeterminate("braces do not balance in sopBlocks().");
  // 🔴 READ THE SENTINELS FROM admin.js, DO NOT RESTATE THEM. This gate hard-coded SOP_LI and
  // injected only that one. When sopBlocks learned to tell a BULLET from a NUMBERED item (2026-10-01)
  // it began referencing SOP_BU, and the gate stopped CHECKING and started THROWING —
  // `ReferenceError: SOP_BU is not defined`, exit 1, which reads as a finding about the product.
  // A gate that crashes is a gate that checks nothing. → feedback_the_harness_i_wrote_to_check_my_work_can_lie
  for (const [name, into] of [["SOP_LI", "li"], ["SOP_BU", "bu"]]) {
    const m = src.match(new RegExp(`const\\s+${name}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`));
    if (!m) { if (name === "SOP_LI") indeterminate(`admin.js no longer declares ${name}.`); continue; }
    SENTINEL[into] = JSON.parse(`"${m[1]}"`);
  }
  if (!SENTINEL.li) indeterminate("could not read SOP_LI out of admin.js.");
  try {
    sopBlocks = new Function("SOP_LI", "SOP_BU", src.slice(at, end) + "; return sopBlocks;")(SENTINEL.li, SENTINEL.bu);
  }
  catch (e) { indeterminate("sopBlocks() would not execute.", String(e.message).split("\n")[0]); }
}

// ── 1-3. run it over every step in both playbooks ─────────────────────────────────────────────
let book;
try { book = JSON.parse(fs.readFileSync(PLAYBOOKS, "utf8")); }
catch { indeterminate("playbooks.json does not parse."); }

const all = [...(book.month1 || []), ...(book.month2plus || [])].filter((s) => s && s.id);
if (!all.length) indeterminate("no steps found in playbooks.json.");

let checked = 0;
const norm = (s) => String(s).replace(/\s+/g, " ").trim();
for (const step of all) {
  const raw = String(step.instructions || "");
  if (!raw.trim()) continue;
  const blocks = sopBlocks(raw);
  checked++;
  if (!blocks.length) { problems.push(`${step.id} — instructions exist but render as NOTHING.`); continue; }

  blocks.forEach((b, i) => {
    const t = norm(STRIP(b));
    // 1. cut off mid-clause
    if (/[,;]$/.test(t)) {
      problems.push(`${step.id} block ${i + 1} is cut off mid-sentence: "…${t.slice(-56)}"`);
    }
    // 2. an orphan continuation, only meaningful when the previous block was left hanging
    if (i > 0 && /^(and|or|then|it|but|so|nor|mints|two)\b/i.test(t)) {
      const prev = norm(STRIP(blocks[i - 1]));
      if (/[,;]$/.test(prev)) problems.push(`${step.id} block ${i + 1} is an orphaned continuation: "${t.slice(0, 56)}…"`);
    }
  });

  // 3. NOTHING SILENTLY DROPPED. The old `.slice(0, 6)` hid a 🔴 warning on every long step.
  // Compare word counts: the blocks must carry essentially all the source words.
  const words = (x) => norm(x).split(" ").filter(Boolean).length;
  const srcWords = words(raw.replace(/^\s*(\d{1,2}[.)]|[•·*-])\s*/gm, ""));
  const gotWords = blocks.reduce((n, b) => n + words(STRIP(b)), 0);
  if (gotWords < srcWords * 0.97) {
    problems.push(`${step.id} — the card drops ${srcWords - gotWords} of ${srcWords} words `
      + `(${Math.round((1 - gotWords / srcWords) * 100)}%). Instructions are being TRUNCATED; the old `
      + `.slice(0, 6) hid the "Do NOT re-sell" warning on step 1 this way.`);
  }
}
if (!checked) indeterminate("no step carried any instruction text — the harness is not exercising anything.");

// ── 4. THE CARD MUST ACTUALLY USE THE PARSER ──────────────────────────────────────────────────
// 🔴 Caught by mutation-testing this gate: reverting the CALL SITE to `lines.slice(0, 6)` left
// sopBlocks() perfect and unused, and the gate passed. It was proving the parser was good, not that
// anything called it — a guard that does not reach the thing it guards.
// → feedback_a_guard_must_reach_the_thing_it_guards · feedback_correct_is_not_the_same_as_happening
const code = src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
// 🔑 Assert the OUTCOME — that the projection's `sop:` field is built by the parser — not one
// particular expression. The first version matched `o.sop || sopBlocks(` literally and went red
// the moment that became `o.sop ? … : sopBlocks(`, which was a fix, not a regression. Third time
// today a gate has failed working code by pinning a shape.
// → feedback_a_gate_window_measured_in_characters_will_lie
if (!/\bsop:\s*[^,\n]*\bsopBlocks\(/.test(code)) {
  problems.push(`The step projection does not build its instructions with sopBlocks(). The parser `
    + `exists but nothing calls it, so the card is back to shredding prose into a numbered list.`);
}
if (/lines\.slice\(\s*0\s*,\s*\d+\s*\)/.test(code)) {
  problems.push(`Something still truncates instruction lines with lines.slice(0, N). That is the `
    + `original defect: it cut mid-list and hid step 1's 🔴 "Do NOT re-sell" warning entirely.`);
}
if (!/ob-sop-note/.test(code)) {
  problems.push(`The renderer does not distinguish prose from list items (no ob-sop-note class). `
    + `Every line would be numbered again, which is what produced "3. 1. What they bought".`);
}
// 🔴 PIN THE PROPERTY, NOT THE MECHANISM. This demanded a manual CSS counter (counter-increment:
// sopnum). The 2026-10-01 bands rewrite replaced it with ONE REAL <ol>/<ul> PER BAND, so the browser
// restarts the ordinal itself — strictly better, and this gate read it as a removal.
// The property is: a numbered item is numbered by something that restarts per group, and nothing
// strips the marker while leaving the item counting.
// → feedback_a_gate_must_pin_the_property_not_the_spelling
{
  const byCounter = /counter-increment\s*:\s*sopnum/.test(css) && /content\s*:\s*counter\(\s*sopnum\s*\)/.test(css);
  const byRealLists = /<\$\{tag\}>\$\{items\.join\(""\)\}<\/\$\{tag\}>/.test(code);
  if (!byCounter && !byRealLists) {
    problems.push(`Nothing gives .ob-sop items their number: no sopnum counter in admin.css, and the `
      + `renderer no longer emits one list element per band. 🔑 list-style:none is NOT enough — the `
      + `element stays a list item and still INCREMENTS, so sub-items render as 3,4,5,6.`);
  }
  // 🔴 AND THE MARKER MUST NOT BE STRIPPED while the item keeps counting — that is the same defect
  // wearing the other mechanism.
  if (byRealLists && /\.ob-band\s*>?\s*(ol|ul)[^{]*\{[^}]*list-style\s*:\s*none/.test(css)) {
    problems.push(`A band's list sets list-style:none while still being a list — the items count `
      + `invisibly and the next visible number is wrong.`);
  }
  // 🔴 THE DEFECT THE MOCKUP FOUND: bullets rendered as a continuation of a numbered run
  // ("1. 2. 3." then "4. 5." for what the source wrote as bullets). sopBlocks must mark the two
  // runs DIFFERENTLY, or no renderer downstream can give them different list types.
  if (SENTINEL.bu) {
    const mixed = sopBlocks("1. Scope\n2. Timeline\n3. Cadence\n\n\u00b7 GBP login\n\u00b7 Website login");
    const kinds = mixed.map((b) => (b.startsWith(SENTINEL.li) ? "num" : b.startsWith(SENTINEL.bu) ? "bul" : "prose"));
    if (!kinds.includes("num")) problems.push("sopBlocks no longer marks a numbered item — every list would render unnumbered.");
    if (!kinds.includes("bul")) {
      problems.push(`sopBlocks marks bullets the same as numbered items (${kinds.join(",")}). A bulleted `
        + `run after a numbered one then CONTINUES its numbering — "· GBP login" renders as "4.".`);
    }
  }
}
if (/\.ob-sop\s*\{[^}]*list-style\s*:\s*(decimal|inherit)/.test(css)) {
  problems.push(`.ob-sop re-enables native list numbering, which double-numbers alongside the counter.`);
}

if (problems.length) {
  console.error("🔴 STEP INSTRUCTIONS ARE BEING SHREDDED ON THE CARD\n");
  for (const p of problems.slice(0, 14)) console.error(`  🔴 ${p}`);
  if (problems.length > 14) console.error(`  … and ${problems.length - 14} more`);
  console.error("\n  admin.js → sopBlocks() / the .ob-sop renderer · admin.css → .ob-sop");
  process.exit(1);
}

console.log("✅ step instructions render as written");
console.log(`   ${checked} steps across both playbooks · no block cut off, orphaned, or truncated`);
console.log("   only genuine list items are numbered, and prose does not advance the counter");
