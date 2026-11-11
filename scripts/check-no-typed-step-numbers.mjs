#!/usr/bin/env node
// check-no-typed-step-numbers.mjs — a person never reads a step number somebody typed by hand.
//
// 🔒 WHY (approved admin_recommended_fixes_v1, item 1, 2026-11-01). Admin numbers come from the LIVE order
// (obNumberOf / obPageNumbers), so a number typed into text goes stale the day a step is added or moved. The photo step
// told RGA to "review each upload in step 39" when photos were admin step 38. The fix is to name the step ("on this step",
// "the categories step"), which cannot go stale.
//
// What it scans (comments do NOT count; a comment is for the next builder, not for a person):
//   1 · every string value in data/playbooks/playbooks.json and data/playbooks/client-steps.json
//   2 · the code of admin/admin.js, portal/portal.js and netlify/functions/*.js (function errors reach a person)
//       with comments removed. A template value such as `step ${n}` is COMPUTED, so only a LITERAL digit fails.
// It fails on "step N", "steps N", "admin step N", "client step N", "their step N" and "row N" (N = digits).
//
// EXCUSES: named, with a reason, as few as possible. An excuse needs a file, a needle that identifies the line and a reason
// that says why a typed number is true there. A stale excuse (its needle no longer on any line) fails too.
//
// Exit 0 clean · 1 a typed number · 2 could not read.
import fs from "node:fs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (p) => { try { return fs.readFileSync(`${SITE}/${p}`, "utf8"); } catch (e) { console.error(`⚠️  INDETERMINATE — cannot read ${p}`); process.exit(2); } };

// The client portal's SETUP TAB has four fixed, named steps (Contract, Payment, Connect, Foundation) that never move and
// never leave the page (hard rule, 10-30). They are the client's own sequence, not a position in the admin order.
const SETUP_FOUR = "the Setup tab's four steps are a fixed, named sequence that never moves (hard rule 10-30), not a position in the live order";
const ACCESS_PARTS = "the website access card numbers its own three parts 1..3 on screen (accPart); they name a part of one card, not a position in the live order";
const EXCUSES = [
  { file: "portal/portal.js", needle: "Unlocks after Step", reason: SETUP_FOUR },
  { file: "portal/portal.js", needle: "complete Step 4 to unlock", reason: SETUP_FOUR },
  { file: "portal/portal.js", needle: "Finish the items in Step 4", reason: SETUP_FOUR },
  { file: "portal/portal.js", needle: "Step 2 · Set up payment", reason: SETUP_FOUR },
  { file: "portal/portal.js", needle: "Step 1: Connect your Google account", reason: SETUP_FOUR },   // 11-10: the em dash became a colon (check-portal-has-no-em-dash)
  { file: "portal/portal.js", needle: "Complete Step 1 first", reason: SETUP_FOUR },
  // The website access card is built from three numbered PARTS (accPart(1..3)), drawn inside that one card and numbered by it;
  // "Step 2" there means part 2 of the same card on screen, not a position in the checklist.
  { file: "portal/portal.js", needle: "Shows once you answer Step 1", reason: ACCESS_PARTS },
  { file: "portal/portal.js", needle: "check it in Step 2.", reason: ACCESS_PARTS },
  { file: "portal/portal.js", needle: "You do Step 2", reason: ACCESS_PARTS },
  { file: "portal/portal.js", needle: "Tap once you've done Step 2", reason: ACCESS_PARTS },
];

const RE = /\b(?:(?:admin|client|their|our)\s+)?(?:step|steps|row|rows)(?:\s+|\s*#\s*)\d+/gi;
const F = [];
const used = new Set();

// Comment removal, the same rule the other step-number gates use (check-a-step-number-has-one-home): block comments, whole-line
// "//" comments, and a trailing "// " comment (whitespace before and after, or straight after ; { } , )). A real parser would be
// exact, but none is installed; this errs toward counting a string, never toward hiding one: a URL "https://x" has neither.
// HTML comments (<!-- -->) inside a template are not drawn, so they go too. Block comments inside a template (`${/* note */""}`) go with the first rule.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ""))
  .split("\n").map((l) => l.replace(/^\s*\/\/.*$/, "").replace(/([;{}),])\s*\/\/.*$/, "$1").replace(/\s\/\/\s.*$/, "")).join("\n");

function scanText(where, file, text) {
  for (const m of text.matchAll(RE)) {
    const line = text.split("\n").find((l) => l.includes(m[0])) || text;
    const ex = EXCUSES.find((e) => e.file === file && line.includes(e.needle));
    if (ex) { used.add(ex); continue; }
    F.push(`${where}: typed "${m[0]}" in ${line.trim().slice(0, 110)}`);
  }
}

function walk(o, file, path) {
  if (typeof o === "string") scanText(`${file} ${path}`, file, o);
  else if (o && typeof o === "object") for (const k of Object.keys(o)) walk(o[k], file, `${path}.${k}`);
}
for (const f of ["data/playbooks/playbooks.json", "data/playbooks/client-steps.json"]) walk(JSON.parse(read(f)), f, "");

const jsFiles = ["admin/admin.js", "portal/portal.js", ...fs.readdirSync(`${SITE}/netlify/functions`).filter((f) => f.endsWith(".js")).map((f) => `netlify/functions/${f}`)];
let lines = 0;
for (const f of jsFiles) {
  const code = stripComments(read(f)).split("\n");
  code.forEach((l, i) => {
    lines++;
    for (const m of l.matchAll(RE)) {
      const ex = EXCUSES.find((e) => e.file === f && l.includes(e.needle));
      if (ex) { used.add(ex); continue; }
      F.push(`${f}:${i + 1}: typed "${m[0]}" in ${l.trim().slice(0, 110)}`);
    }
  });
}
for (const e of EXCUSES) if (!used.has(e)) F.push(`excuse for ${e.file} ("${e.needle}") matches nothing any more, so remove it`);

if (F.length) { console.error("🔴 a step number is typed where a person reads it. Name the step instead (\"on this step\", \"the categories step\"); a number that must show is read from the live order, never typed:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log(`✅ no typed step numbers — playbooks.json, client-steps.json and ${jsFiles.length} code files (${lines} lines, comments removed) checked, ${EXCUSES.length} named excuse(s): the client Setup tab's four fixed steps and the access card's own three parts`);
