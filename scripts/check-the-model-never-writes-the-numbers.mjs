#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — THE MODEL NEVER WRITES THE NUMBERS, AND ITS KEY NAMES NEVER DECIDE WHAT WE PARSE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * 2026-10-02, the first real re-run of the keyword step. The card looked excellent. The record said:
 *
 *     demand_source: null        demand: []
 *
 * **Nothing had been measured.** The prompt asked for `term:`, the model answered `phrase:`, and the
 * verification regex matched nothing — so the figures on screen were the model TRANSCRIBING the list
 * fed into its own prompt. For the one keyword it invented rather than copied it wrote a placeholder
 * onto the card: `monthly_volume: [[NEEDS INPUT: … from Keyword Planner]]`.
 *
 * Worse, `readLockedPlan` reads the same key, so it returned the keyword as the literal string
 * `phrase: "seo services near me"` — which the geo-grid would have searched, 25 SerpAPI calls per
 * term, reporting a confident "not found" for a phrase nobody has ever typed.
 *
 * 🔑 THREE FAILURES, ONE CAUSE: a parser pinned to one spelling of a key a language model chose.
 * 🔑 AND THE DEEPER ONE: a number written by a model is not a measurement, and a card cannot tell
 * the two apart. We hold the Keyword Planner — the volumes are attached by us, after the call.
 * → feedback_no_hardcoded_stats · feedback_a_property_read_is_a_claim_about_the_shape
 *
 * Exit 0 pass · 1 fail · 2 indeterminate. Mutation log at the bottom.
 */
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = path.join(SITE, "netlify", "functions", "flow-execute.js");
const fail = [], pass = [];

if (!fs.existsSync(F)) { console.error("⚠️  INDETERMINATE — flow-execute.js not found."); process.exit(2); }
const raw = fs.readFileSync(F, "utf8");
const code = raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

/** The keyword step's handler body. */
const step = (() => {
  const i = code.search(/"m1\.strategy\.keywords_locations":\s*async\s*\(/);
  if (i < 0) return null;
  const bodyStart = code.indexOf("=> {", i);
  if (bodyStart < 0) return null;
  let d = 0;
  for (let k = code.indexOf("{", bodyStart); k < code.length; k++) {
    if (code[k] === "{") d++;
    else if (code[k] === "}") { d--; if (!d) return code.slice(bodyStart, k + 1); }
  }
  return null;
})();
if (!step || step.length < 1500) { console.error("⚠️  INDETERMINATE — could not isolate the keyword step."); process.exit(2); }

console.log("── the model is told not to write numbers, and cannot anyway ──");
{
  if (/Do NOT write any search-volume numbers/i.test(step)) { pass.push("instructed"); console.log("  ✅ the prompt forbids the model writing volumes"); }
  else { fail.push("the prompt no longer forbids the model writing search-volume numbers"); console.log("  🔴 the prompt does not forbid model-written volumes"); }

  // 🔴 THE INSTRUCTION IS NOT THE GUARD. A model told not to still may, and its figure then sits
  // beside the measured one and disagrees — 2900 and 4400 for one keyword in a test run.
  const strips = /filter\(\(l\) => !\/\^\\s\*\(\?:monthly_volume\|volume/.test(step)
    || /monthly_volume\|volume\|search_volume\|searches/.test(step);
  if (strips) { pass.push("strips model volumes"); console.log("  ✅ any volume line the model writes is stripped"); }
  else { fail.push("model-written volume lines are no longer stripped"); console.log("  🔴 a model-written volume could sit beside the measured one"); }
}

console.log("\n── the model may not characterise demand it has not been shown ──");
{
  // 🔴 It writes `why` BEFORE we measure, so any claim about how much a term is searched is a guess
  // our own figure then contradicts on the same card: `searches: no data` sat directly above
  // *"appears in the keyword planner data at meaningful volume."*
  const forbids = /must NOT claim how much a term is searched/i.test(step);
  if (forbids) { pass.push("demand claims forbidden"); console.log("  ✅ the prompt forbids the why claiming volume or popularity"); }
  else { fail.push("the why may claim demand the model was never shown"); console.log("  🔴 the why could contradict the measured figure beside it"); }
}

console.log("\n── a gap marker can never reach the card ──");
{
  const strips = /\\\[\\\[\[\^\\\]\]\*\\\]\\\]/.test(step) || /\[\[\^\\\]\]/.test(step) || /NEEDS INPUT/i.test(step);
  const removesLine = /\\\[\\\[/.test(step);
  if (strips && removesLine) { pass.push("gap markers stripped"); console.log("  ✅ [[…]] markers are removed from the draft"); }
  else { fail.push("a [[NEEDS INPUT]] marker could reach the card"); console.log("  🔴 nothing strips a [[…]] gap marker"); }
}

console.log("\n── the measured number is attached by US, from the verified call ──");
{
  const injects = /searches:\s*\$\{shown\}|\$\{m\[1\]\}\s*searches:/.test(step) || /searches: \$\{shown\}/.test(step);
  const fromDemand = /byName\s*=\s*new Map\(demand\.map/.test(step);
  // 🔴 RE-PINNED 2026-10-02. This required the literal ternary `row.volume === null ? "no data"`.
  // That logic was EXTRACTED into `volumeLabel`, which also handles the floor — strictly better, and
  // the gate read the extraction as a deletion. Pin the property: an absent figure resolves to words,
  // never to a number, wherever that decision now lives.
  // → feedback_a_gate_must_pin_the_property_not_the_spelling
  const labelDecl = (step.match(/^\s*const volumeLabel\s*=[\s\S]*?;$/m) || [""])[0];
  const absentIsText = /row\.volume === null \? "no data"/.test(step)
    || (/no data/.test(labelDecl) && /null|undefined/.test(labelDecl));
  for (const [ok, good, bad] of [
    [injects, "the draft carries a `searches:` line we wrote", "nothing attaches a measured volume to the draft"],
    [fromDemand, "it is keyed off the measured `demand`", "the attached number does not come from the measurement"],
    [absentIsText, 'an absent figure renders "no data", never 0', "an absent figure could render as a number"],
  ]) {
    if (ok) { pass.push(good); console.log(`  ✅ ${good}`); }
    else { fail.push(bad); console.log(`  🔴 ${bad}`); }
  }
}

console.log("\n── no parser depends on the model choosing one key name ──");
{
  // Both the verification AND readLockedPlan must accept the synonyms.
  // 🔴 PIN THE DECLARATION, NOT THE FILE. `term|phrase|keyword` appears several times in this step
  // — in the extraction, the volume injection and the location flattener — so a whole-step test
  // stayed green after the extraction regex itself was narrowed back to `term` only. The property
  // is "the regex that EXTRACTS the terms accepts the synonyms".
  const termDecl = (step.match(/^\s*const TERM_LINE\s*=.*$/m) || [""])[0];
  const stepAccepts = /term\|phrase\|keyword/.test(termDecl);
  if (stepAccepts) { pass.push("step accepts synonyms"); console.log("  ✅ the step's term extraction accepts term/phrase/keyword"); }
  else { fail.push("the step's term extraction pins a single key name"); console.log("  🔴 the step pins one key name — a synonym empties the verification"); }

  const lockIdx = code.indexOf("function readLockedPlan");
  const lockBody = lockIdx >= 0 ? code.slice(lockIdx, lockIdx + 2500) : "";
  if (/term\|phrase\|keyword/.test(lockBody)) { pass.push("readLockedPlan accepts synonyms"); console.log("  ✅ readLockedPlan accepts term/phrase/keyword"); }
  else { fail.push("readLockedPlan pins a single key name"); console.log("  🔴 readLockedPlan pins one key name — it would hand the grid a key as a keyword"); }
}

console.log("\n── the locations stay a plain list ──");
{
  const flattens = /name\|location\|area\|place/.test(step) && /inLoc/.test(step);
  if (flattens) { pass.push("locations flattened"); console.log("  ✅ a keyed location is flattened back to a plain list item"); }
  else { fail.push("a keyed location would render as a card instead of the approved pill"); console.log("  🔴 nothing flattens a keyed location"); }
}

console.log("");
if (fail.length) {
  console.error(`🔴 ${fail.length} problem(s):`);
  for (const f of fail) console.error(`   · ${f}`);
  console.error(`\n   A number written by a model is not a measurement, and the card cannot tell.`);
  process.exit(1);
}
console.log(`✅ ${pass.length} properties hold — the model writes terms and reasons, we write every number,`);
console.log(`   no key name it picks can empty a parser, and a gap marker cannot reach the screen.`);

/* ─── MUTATION LOG (both directions, matched by name) ──────────────────────────────────────────────
 *  1. the "Do NOT write any search-volume numbers" instruction removed → exit 1 "no longer forbids"
 *  2. the volume-line strip filter removed                             → exit 1 "no longer stripped"
 *  3. `searches: ${shown}` injection removed                           → exit 1 "nothing attaches"
 *  4. `? "no data"` → `?? 0`                                           → exit 1 "could render as a number"
 *  5. step regex `term|phrase|keyword` → `term`                        → exit 1 "pins a single key name"
 *  6. readLockedPlan KEY regex → `term` only                           → exit 1 "readLockedPlan pins"
 *  7. the location flattener removed                                   → exit 1 "nothing flattens"
 *  8. unmodified source                                                 → exit 0
 * ────────────────────────────────────────────────────────────────────────────────────────────── */
