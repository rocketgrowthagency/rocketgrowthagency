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
import { createRequire } from "node:module";
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

// 🔑 THE DICTIONARY IS NOT PROSE. `_us-idiom.js` has to NAME every British word in order to convert
// it — "colour", "centre", "programme", "whilst" are its data, and its prompt clause spells the
// contrast out on purpose ("color not colour"). Scanning it as copy a reader sees reports the fix
// as the defect. It is instead exercised DIRECTLY below, by running it against known words.
// 🔴 THIS IS THE ONLY EXCLUSION, and it is one FILE, not a pattern — a pattern here would quietly
// stop scanning the next file somebody names similarly.
// → feedback_a_gate_written_for_a_temporary_state_outlives_it
const NOT_PROSE = "netlify/functions/_us-idiom.js";
const FILES = ["admin/admin.js", "portal/portal.js",
  ...fs.readdirSync(path.join(SITE, "netlify/functions")).filter((f) => f.endsWith(".js")).map((f) => "netlify/functions/" + f)]
  .filter((rel) => rel !== NOT_PROSE);
if (!fs.existsSync(path.join(SITE, NOT_PROSE))) {
  console.error(`⚠️  INDETERMINATE — ${NOT_PROSE} is excluded from the scan but does not exist.`);
  console.error("   Either the converter was removed (a real problem) or this exclusion is stale.");
  process.exit(2);
}

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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴🔴🔴 THE MODEL'S OUTPUT IS TEXT A HUMAN READS, AND THIS GATE COULD NOT SEE IT.
//
// Everything above scans SOURCE. On 2026-10-07 step 31's shot list — a document the CLIENT reads —
// came back from the model with "centred", "colour" and "optimised", while the two runs before it,
// from the same prompt, were clean. Nothing in the repo was wrong; the model drifted, and this gate
// was green throughout.
//
// 🔑 A LINE THAT MUST NEVER APPEAR NEEDS ITS PRODUCER REMOVED. `aiDraft` is the one boundary every
// runner's text crosses, so it asks for US English in the system prompt AND converts on the way
// back. This part RUNS that converter rather than grepping for it.
// → feedback_a_line_that_must_never_appear_cannot_be_gated · feedback_a_gate_that_it_exists_is_not_a_gate_that_it_works
// ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  const mod = `${SITE}/netlify/functions/_us-idiom.js`;
  if (!fs.existsSync(mod)) {
    F("netlify/functions/_us-idiom.js is gone — model output crosses into client-facing copy unconverted");
  } else {
    let toUsIdiom, US_IDIOM_PROMPT;
    try { ({ toUsIdiom, US_IDIOM_PROMPT } = createRequire(import.meta.url)(mod)); }
    catch (e) {
      console.error(`⚠️  INDETERMINATE — _us-idiom.js does not load: ${e.message}`);
      process.exit(2);
    }
    // 🔑 IT MUST FIX EVERY WORD THIS GATE KNOWS IS BRITISH …
    const missed = MUST_FLAG.filter((w) => toUsIdiom(w) === w);
    if (missed.length) {
      F(`the converter leaves ${missed.length} British word(s) untouched: ${missed.join(", ")} — `
        + "the detector and the converter must know the same words, or the gate passes on copy the converter cannot fix");
    }
    // … AND LEAVE EVERY CORRECT WORD ALONE. The detector's first version flagged "analysis",
    // "analyst" and "optimism"; a converter making that mistake would silently corrupt working copy.
    const broke = MUST_NOT_FLAG.filter((w) => toUsIdiom(w) !== w);
    if (broke.length) F(`the converter CHANGES correct US words: ${broke.map((w) => `${w}→${toUsIdiom(w)}`).join(", ")}`);
    // 🔴 AND IT MUST NOT TOUCH A PROPER NOUN. These are real business names; this runs for every
    // client, not ours. → feedback_a_rule_tested_on_one_client_is_shaped_to_that_client
    const NAMES = ["Pacific Centre Dental", "Colour Me Mine", "The Grey Dog", "Centre Street Cafe"];
    const mangled = NAMES.filter((n) => toUsIdiom(n) !== n);
    if (mangled.length) F(`the converter rewrites business names: ${mangled.map((n) => `"${n}" → "${toUsIdiom(n)}"`).join(", ")}`);
    // …and words a suffix rule would have mangled
    for (const w of ["advertise", "exercise", "franchise", "merchandise", "supervise", "surprise", "promise", "comprise"]) {
      if (toUsIdiom(w) !== w) F(`the converter mangles "${w}" → "${toUsIdiom(w)}" — an -ise SUFFIX rule instead of an explicit stem list`);
    }

    // 🔑 AND IT MUST ACTUALLY BE WIRED, ON EVERY RETURN PATH. A converter nobody calls is a gate
    // that is always green. → feedback_a_gate_i_never_wired_is_a_gate_that_is_always_green
    let exec;
    try { exec = fs.readFileSync(`${SITE}/netlify/functions/flow-execute.js`, "utf8"); }
    catch { console.error("⚠️  INDETERMINATE — cannot read flow-execute.js"); process.exit(2); }
    const fn = /async function aiDraft\([\s\S]*?\n}/.exec(exec);
    if (!fn) { console.error("⚠️  INDETERMINATE — cannot find aiDraft in flow-execute.js"); process.exit(2); }
    const body = fn[0];
    const returns = body.match(/return markIfTruncated\([^\n]*/g) || [];
    if (!returns.length) { console.error("⚠️  INDETERMINATE — aiDraft has no markIfTruncated return to check"); process.exit(2); }
    const unconverted = returns.filter((r) => !/toUsIdiom\(/.test(r));
    if (unconverted.length) {
      F(`${unconverted.length} of ${returns.length} aiDraft return path(s) hand back model text without converting it — `
        + "the Anthropic and OpenAI branches both reach the client");
    }
    if (!/US_IDIOM_PROMPT/.test(body)) {
      F("aiDraft no longer asks the model for US English in its system prompt — the converter is the net, not the plan");
    }
    if (US_IDIOM_PROMPT && !/US English/i.test(US_IDIOM_PROMPT)) {
      F("US_IDIOM_PROMPT no longer says US English");
    }
  }
}

if (fails.length) {
  console.error("🔴 British spelling in text a human reads:");
  for (const f of fails) console.error("   · " + f);
  console.error("\n   🇺🇸 US idiom, never British — ops memory, and it applies to every on-screen word.");
  process.exit(1);
}
console.log(`✅ on-screen copy is US idiom — ${scanned} files scanned, detector self-tested on ${MUST_FLAG.length + MUST_NOT_FLAG.length} known words, ${ALLOWED.length} documented exception(s) all still live`);
