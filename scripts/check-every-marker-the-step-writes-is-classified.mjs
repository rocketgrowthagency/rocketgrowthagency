#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — EVERY MARKER A STEP CAN WRITE IS ONE THE CARD CLASSIFIES
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * The step's output card is built by `classifyVerdicts`, which sorts each line into ok / warn /
 * change / metric / note by its LEADING EMOJI and strips that emoji off. A line whose marker is not
 * in `VERDICT_KIND` matches nothing: it is stripped from no panel and rendered as a raw paragraph
 * above the card — the undifferentiated wall of prose Chris rejected on 2026-10-05.
 *
 * flow-execute.js already carries a comment saying *"THE MARKER MUST BE ONE THE RENDERER ALREADY
 * CLASSIFIES"*. Adding the map-pack surface note introduced 🗺️ anyway, and nothing would have caught
 * it. 🔑 A COMMENT IS NOT A MECHANISM — the pairing has to be checked, because the producer and the
 * consumer are in different files and different repos' worth of distance.
 * → feedback_a_comment_asserting_a_fix_is_not_the_fix · project_step_26_card_locked
 *
 * Harvests the markers from the PRODUCER and runs the CONSUMER's real classifier, so neither side is
 * described by a list written here.
 *
 * Exit 0 pass · 1 a marker would render as raw prose · 2 could not run.
 */
import fs from "node:fs";
import vm from "node:vm";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
let flow, admin;
try {
  flow = fs.readFileSync(`${SITE}/netlify/functions/flow-execute.js`, "utf8");
  admin = fs.readFileSync(`${SITE}/admin/admin.js`, "utf8");
} catch { console.error("⚠️  INDETERMINATE — cannot read the sources"); process.exit(2); }

const fail = [];

// ── 1 · LIFT THE CARD'S REAL CLASSIFIER ─────────────────────────────────────────────────────────
const kindsSrc = (() => {
  const i = admin.indexOf("const VERDICT_KIND = [");
  if (i < 0) return "";
  const end = admin.indexOf("];", i);
  return end < 0 ? "" : admin.slice(i, end + 2);
})();
const fnSrc = (() => {
  const i = admin.indexOf("function classifyVerdicts(");
  if (i < 0) return "";
  const o = admin.indexOf("{", i);
  let d = 0;
  for (let k = o; k < admin.length; k++) {
    if (admin[k] === "{") d++;
    else if (admin[k] === "}") { d--; if (!d) return admin.slice(i, k + 1); }
  }
  return "";
})();
if (!kindsSrc || !fnSrc) {
  console.error("⚠️  INDETERMINATE — cannot lift VERDICT_KIND / classifyVerdicts; re-pin this gate.");
  process.exit(2);
}
const ctx = vm.createContext({});
try { vm.runInContext(`${kindsSrc}\n${fnSrc}\nglobalThis.C = classifyVerdicts;`, ctx); }
catch (e) { console.error(`⚠️  INDETERMINATE — could not evaluate the classifier: ${e.message}`); process.exit(2); }

// ── 2 · HARVEST EVERY LEADING MARKER THE STEP CAN WRITE ─────────────────────────────────────────
// 🔴 COMMENTS STRIPPED FIRST. These files quote their own output in explanatory prose, and a marker
// inside a comment is not a marker the step writes. Harvesting one made a sibling gate demand that
// the card classify a sentence. → feedback_the_harness_i_wrote_to_check_my_work_can_lie
const code = flow.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 ANY STRING THAT STARTS WITH A MARKER, WHEREVER IT IS WRITTEN. The first version matched only a
// `push(…)` or an `= …` assignment, and harvested 8 of the 9 markers in the file: it MISSED 🗺️, the
// one marker it was written for, because the surface note builds its line inside an ARRAY LITERAL
// and joins it later.
//
// 🔑 A HARVEST PINNED TO A SYNTAX SHAPE MISSES THE NEXT SHAPE SOMEBODY USES. In this file a string
// literal that begins with an emoji is always a card line, so that — not how it reaches `lines` — is
// the thing to match.
// → feedback_a_literal_grep_misses_computed_writes · feedback_an_inventory_is_a_claim_about_what_i_thought_to_grep
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
const markers = new Map();           // marker → one example line
const LEAD = /(?:`|")(\p{Extended_Pictographic}(?:️)?(?:‍\p{Extended_Pictographic}(?:️)?)*)([^`"]{0,90})/gu;
for (const m of code.matchAll(LEAD)) {
  if (!markers.has(m[1])) markers.set(m[1], (m[2] || "").trim().slice(0, 70));
}

if (markers.size < 4) {
  console.error(`⚠️  INDETERMINATE — only ${markers.size} marker(s) harvested from flow-execute.js; `
    + "the extraction is wrong, not the product.");
  process.exit(2);
}

// ── 3 · EVERY ONE MUST LAND IN A PANEL ──────────────────────────────────────────────────────────
for (const [marker, example] of markers) {
  const out = ctx.C(`${marker} a produced line`);
  const landed = out && Object.values(out).some((arr) => arr.length);
  if (!landed) {
    fail.push(`the step can write a line beginning "${marker}" and the card classifies it as NOTHING — `
      + `it is stripped from no panel and renders as raw prose above the card. Add it to VERDICT_KIND `
      + `or change the producer.\n        example: ${marker} ${example.replace(marker, "").trim().slice(0, 70)}`);
    continue;
  }
  // 🔑 AND THE MARKER MUST BE REMOVED. A classified line that keeps its emoji prints it twice — once
  // as the panel's own icon and once in the text.
  const kept = Object.values(out).flat()[0] || "";
  if (kept.includes(marker)) {
    fail.push(`"${marker}" classifies but is not stripped from the text — the panel icon and the emoji `
      + "would both appear");
  }
}

if (fail.length) {
  console.error("🔴 a marker the step writes would render as raw prose:");
  for (const f of fail) console.error(`   · ${f}`);
  process.exit(1);
}
console.log(`✅ all ${markers.size} markers the step can write classify into a panel and are stripped `
  + `from the text (${[...markers.keys()].join(" ")})`);
