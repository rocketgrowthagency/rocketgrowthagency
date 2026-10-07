#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// EVERY WORD A HUMAN READS ON SCREEN IS US ENGLISH
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴🔴 THE HARD RULE HAD NO GATE. "🇺🇸 US idiom, never British" has been in ops memory for months and
// was enforced by me remembering it — which, measured on 2026-10-07, meant **three new violations in
// a single session**, one of them in client-facing portal copy a customer reads:
//
//     "A request from your number, in a thread they recognise, gets read far more often"
//
// plus `recognise` twice in a step card and `prioritise` in a step summary. An unwritten rule is a
// rule that holds until somebody is busy.
// → feedback_a_fix_without_a_gate_regresses · feedback_a_client_message_must_agree_with_itself
//
// 🔑 ON SCREEN ONLY. Comments are for us; a British spelling in one costs nothing and banning it
// would make the gate noisy enough to ignore. The test is whether the word sits inside a string
// literal that reaches a reader.
//
// Exit 0 healthy · 1 the product is wrong · 2 INDETERMINATE

import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const fails = [];
const F = (m) => fails.push(m);

// 🔴🔴 THE FIRST VERSION OF THIS PATTERN ACCUSED CORRECT ENGLISH. `analys\w*` matches **analysis**
// and **analyst**; `optimis\w*` matches **optimism** and **optimistic** — all correct US spellings.
// It produced 46 hits, most of them wrong, and acting on them would have "corrected" working copy.
// 🔑 THE -ISE FAMILY IS ONLY BRITISH IN ITS VERB FORMS. Pin the suffixes, never the stem.
// 🔑 And words like "cancelled" or "travelling" are common in US usage too — a gate that flags them
// is noisy enough to be ignored, which is worse than no gate.
// → feedback_run_it_against_reality_before_calling_it_done · feedback_a_gate_must_pin_the_property_not_the_spelling
const BRITISH = new RegExp([
  "\\b(?:priorit|organ|recogn|apolog|custom|optim|summar|util|categor|standard|minim|maxim|special|real)is(?:e|es|ed|ing|ation|ations|er|ers)\\b",
  "\\banaly(?:se|sed|sing|ser)\\b",
  "\\b(?:colour|colours|coloured|behaviour|behaviours|catalogue|catalogues|licence|defence|favourite|favourites|labour|neighbour|neighbours|programme|programmes|grey|whilst|amongst|centre|centres|centred|metres|litres)\\b",
].join("|"), "gi");

// ═══ THE DETECTOR PROVES ITSELF BEFORE IT ACCUSES ANYTHING ═══════════════════════════════════
// 🔴🔴 THE FIRST PATTERN HERE FLAGGED **analysis**, **analyst**, **optimism** and **optimistic** —
// all correct US spellings — and produced 46 hits, most of them wrong. Acting on that output would
// have "corrected" working copy across the product. A detector is a claim too, and an untested one
// is worse than none because its output looks authoritative.
// 🔑 So it runs against words whose answer is known, every time, and refuses to report rather than
// report wrongly. INDETERMINATE (2), never "the product is wrong" (1).
// → feedback_run_it_against_reality_before_calling_it_done · feedback_the_harness_i_wrote_to_check_my_work_can_lie
const MUST_FLAG = ["prioritise", "recognise", "organised", "analyse", "analysed", "analysing",
  "optimising", "summarise", "utilise", "customise", "colour", "behaviour", "licence", "defence",
  "centred", "whilst", "catalogue", "favourite"];
const MUST_NOT_FLAG = ["analysis", "analyses", "analyst", "analytics", "analyze", "analyzed", "optimism",
  "optimistic", "specialist", "realism", "customer", "standard", "minimum", "recognition", "center",
  "centered", "color", "defense", "license", "summary", "utility", "category", "organ", "programmer",
  "maximum", "special"];
{
  const wrong = [];
  for (const w of MUST_FLAG) { BRITISH.lastIndex = 0; if (!BRITISH.test(w)) wrong.push(`missed "${w}"`); }
  for (const w of MUST_NOT_FLAG) { BRITISH.lastIndex = 0; if (BRITISH.test(w)) wrong.push(`falsely flags "${w}"`); }
  if (wrong.length) {
    console.error("⚠️  INDETERMINATE — the spelling detector is wrong about words whose answer is known:");
    for (const w of wrong) console.error("     " + w);
    console.error("   Fix the pattern. Do NOT read this as a product failure.");
    process.exit(2);
  }
}

// 🔴 AN EXCEPTION IS A DECISION SOMEBODY MADE, AND IT MUST STILL BE TRUE. Each one names the text it
// excuses; if that text is gone the exception is drift and this fails.
const ALLOWED = [
  { needle: "Centred on    ", why: "step 26's card copy, approved by Chris in the mockup and locked; changing it needs a new mockup" },
  { needle: "centred on", why: "the same approved card wording, rendered on the admin's grid summary line" },
];

const FILES = ["admin/admin.js", "portal/portal.js",
  ...fs.readdirSync(path.join(SITE, "netlify/functions")).filter((f) => f.endsWith(".js")).map((f) => "netlify/functions/" + f)];

let scanned = 0, strings = 0;
const used = new Set();
for (const rel of FILES) {
  let src;
  try { src = fs.readFileSync(path.join(SITE, rel), "utf8"); } catch { continue; }
  scanned++;
  // 🔴 LINE COMMENTS FIRST, THEN BLOCK COMMENTS — the other order lets a `/*` inside a `//` swallow
  // real code. → feedback_a_comment_stripper_in_the_wrong_order_deletes_code
  // 🔴 BLOCK COMMENTS TOO, AND LINE COMMENTS FIRST. Without this the gate accused a JSDoc line and a
  // CSS note — a gate that reports its own documentation as a product defect gets ignored.
  // → feedback_a_comment_stripper_in_the_wrong_order_deletes_code
  const noLine = src.split("\n").map((l) => l.replace(/^\s*\/\/.*$/, "").replace(/\s\/\/\s.*$/, "")).join("\n");
  const lines = noLine.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).split("\n");
  let tplOpen = false;
  lines.forEach((code, i) => {
    const ticksBefore = tplOpen;
    // an odd number of backticks on a line flips whether we are inside a template literal
    if (((code.split("`").length - 1) % 2) === 1) tplOpen = !tplOpen;
    void ticksBefore;
    if (!code.trim()) return;
    for (const m of code.matchAll(BRITISH)) {
      // 🔴🔴 A TEMPLATE LITERAL SPANS LINES, AND THAT IS HOW ON-SCREEN COPY IS WRITTEN. Counting
      // quotes on the single line missed the client-facing portal paragraph that started this —
      // its backticks opened three lines earlier, so the line read as code and was skipped. The
      // gate passed while the violation sat in production copy.
      // 🔑 Backtick depth is carried ACROSS lines; quotes are per-line, because they cannot span one.
      const before = code.slice(0, m.index);
      const inString = tplOpen
        || (before.split('"').length - 1) % 2 || (before.split("'").length - 1) % 2
        || (before.split("`").length - 1) % 2;
      if (!inString) return;
      strings++;
      const ok = ALLOWED.find((a) => code.includes(a.needle));
      if (ok) { used.add(ok.needle); return; }
      F(`${rel}:${i + 1} — "${m[0]}" is British, in text a reader sees: ${code.trim().slice(0, 72)}`);
    }
  });
}

if (!scanned) { console.error("⚠️  INDETERMINATE — no source files were read"); process.exit(2); }

// a stale exception is its own drift
for (const a of ALLOWED) {
  if (!used.has(a.needle)) F(`the exception for "${a.needle}" no longer matches anything — remove it, or it will excuse something it was never meant to`);
}

if (fails.length) {
  console.error("🔴 British spelling in text a human reads:");
  for (const f of fails) console.error("   · " + f);
  console.error("\n   🇺🇸 US idiom, never British — ops memory, and it applies to every on-screen word.");
  process.exit(1);
}
console.log(`✅ on-screen copy is US idiom — ${scanned} files scanned, detector self-tested on ${MUST_FLAG.length + MUST_NOT_FLAG.length} known words, ${ALLOWED.length} documented exception(s) all still live`);
