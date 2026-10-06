#!/usr/bin/env node
/**
 * check-refusal-is-not-done.mjs — a step that REFUSED must never be announced as "Done".
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-09, Chris pressed Run on SOP step 1 (the confirmation email) before the RGA Google
 * connection had `gmail.send`. Everything underneath behaved perfectly:
 *
 *     nothing was sent · status: in_progress · outcome: manual_required
 *     summary: "…can create calendar invites but cannot SEND EMAIL…"
 *
 * And the admin displayed, in green:
 *
 *     ✅ Done — step 1 · Confirmation + expectations email (within the hour)
 *
 * The banner keyed off `r.ok && data.ok` — which only means **the runner answered**, not that the
 * work happened. A refusal, an indeterminate and a hard failure all rendered as success.
 *
 * 🔑 THE RULE: **"the call succeeded" and "the work happened" are different facts.** A runner that
 * declines to act is reporting a result, and the UI must repeat the result it was given rather than
 * the fact that it got one. Same family as [[feedback-every-action-must-report-its-result]] and the
 * run-all robot counting `mustRunLocally` as executed.
 *
 * Exit 0 = the banner respects outcome · 1 = it can claim Done over a refusal · 2 = cannot tell.
 */
import fs from "node:fs";

// 🔴 THE PATHS WERE HARDCODED, SO THIS GATE COULD NEVER BE MUTATION-TESTED. Every mutation of
// admin.js in a scratch copy was read right past, and all three came back GREEN — a gate that
// cannot fail. Same env var the rest of the suite honours.
// → feedback_a_gate_that_cannot_fail · feedback_the_harness_i_wrote_to_check_my_work_can_lie
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const ADMIN = `${SITE}/admin/admin.js`;
const EXEC = `${SITE}/netlify/functions/flow-execute.js`;
const SABOTAGE = process.env.SABOTAGE === "1";

for (const f of [ADMIN, EXEC]) {
  if (!fs.existsSync(f)) { console.error(`  ✗ missing ${f}`); process.exit(2); }
}
let admin = fs.readFileSync(ADMIN, "utf8");
const exec = fs.readFileSync(EXEC, "utf8");

if (SABOTAGE) {
  // Restore the original defect: announce Done regardless of outcome.
  admin = admin.replace(/const ui = OUTCOME_BANNER\[data\.outcome\];/, "const ui = null;");
  console.log("  ⚠️  SABOTAGE=1 — outcome-blind banner re-injected");
}

console.log("── a step that refused must not be announced as Done ──");
const fails = [];

// The outcomes a runner uses to say "I did not do the work."
const REFUSALS = ["manual_required", "indeterminate", "blocked", "error"];

// 1. Every refusal outcome a runner can emit must be handled by the banner.
const emitted = new Set();
for (const m of exec.matchAll(/outcome:\s*"([a-z_]+)"/g)) emitted.add(m[1]);
for (const m of exec.matchAll(/outcome:\s*[^,\n]*\?\s*"([a-z_]+)"\s*:\s*"([a-z_]+)"/g)) { emitted.add(m[1]); emitted.add(m[2]); }
const emittedRefusals = REFUSALS.filter((r) => emitted.has(r));
if (!emittedRefusals.length) { console.error("  ✗ no refusal outcomes found in flow-execute — probe is wrong"); process.exit(2); }

const mapMatch = admin.match(/const OUTCOME_BANNER = \{[\s\S]*?\n\s*\};/);
if (!mapMatch) {
  fails.push("no OUTCOME_BANNER map");
  console.log("  🔴 the admin has no outcome→banner map — every result renders the same way");
} else {
  const missing = emittedRefusals.filter((r) => !new RegExp(`\\b${r}\\b`).test(mapMatch[0]));
  if (missing.length) {
    fails.push("unhandled refusal outcomes");
    console.log(`  🔴 runners emit these refusals with no banner case: ${missing.join(", ")}`);
  } else {
    console.log(`  ✅ all ${emittedRefusals.length} refusal outcome(s) have a banner case: ${emittedRefusals.join(", ")}`);
  }
}

// 1b. 🔴 THE FIELD THE BANNER READS MUST ACTUALLY BE PRODUCED.
// This gate's first version only checked that the admin BRANCHES on `data.outcome`. It passed while
// flow-execute returned `{ok, step_id, status, summary, result, followup}` and NO top-level
// `outcome` — so `data.outcome` was permanently undefined, every branch fell through, and a Gmail
// 403 was announced as "✅ Done". The gate proved the consumer existed and never asked whether the
// producer did. Check both halves, always.
// Brace-match the object literal — a length-capped regex misses it once the block grows.
// 🔴 Take the block that carries `ok: true` AND `step_id` — the step-ran response. The FIRST
// `return json(200, {` in the file is the `mustRunLocally` early-return, which legitimately has no
// outcome; matching it made this check fire on correct code.
function successResponse() {
  let from = 0;
  for (;;) {
    const i = exec.indexOf("return json(200, {", from);
    if (i < 0) return null;
    const open = exec.indexOf("{", i + "return json(200,".length);
    let d = 0, block = null;
    for (let j = open; j < exec.length; j++) {
      if (exec[j] === "{") d++;
      else if (exec[j] === "}") { d--; if (d === 0) { block = exec.slice(open, j + 1); break; } }
    }
    if (block && /\bok:\s*true/.test(block) && /\bstep_id\b/.test(block)) return block;
    from = i + 1;
  }
}
const returnBlock = successResponse();
if (!returnBlock) {
  console.error("  ✗ could not find flow-execute's success response — probe is wrong");
  process.exit(2);
}
if (/^\s*outcome:/m.test(returnBlock)) {
  console.log("  ✅ flow-execute returns `outcome` at the top level, where the admin reads it");
} else {
  fails.push("outcome never produced");
  console.log("  🔴 flow-execute does NOT return a top-level `outcome` — the admin reads");
  console.log("     data.outcome, gets undefined, and shows Done for every result including failures");
}

// 2. The run's banner must be gated on the outcome, not merely on a successful response.
//
// 🔴 THIS PINNED A SPELLING AND WENT BLIND. It searched for the literal title
// `` title: `Done — ${stepLabel(stepId)}` ``. When the confirmation card was given ONE producer for
// every step (2026-10-06) the title became the step's own name and the outcome moved into the
// sentence and the banner KIND — a strictly better design — and this gate reported INDETERMINATE
// from then on, which in a sweep is indistinguishable from green.
// 🔑 PIN THE PROPERTY: whatever the banner is called, its KIND must be chosen from the outcome, so
// a refusal cannot be painted as success. → feedback_a_gate_must_pin_the_property_not_the_spelling
const uiPick = admin.match(/const ui = OUTCOME_BANNER\[\s*data\.outcome\s*\]/);
if (!uiPick) {
  console.log("  🔴 nothing selects a banner kind from data.outcome — every result paints as success");
  fails.push("Done is outcome-blind");
} else {
  // Brace-match the setBanner call that follows, so the window is the real call and not a character
  // count. → feedback_a_gate_window_measured_in_characters_will_lie
  const sb = admin.indexOf("setBanner(", uiPick.index);
  let around = "";
  if (sb > 0) {
    let d = 0;
    for (let i = admin.indexOf("(", sb); i < admin.length; i++) {
      if (admin[i] === "(") d++;
      else if (admin[i] === ")") { d--; if (!d) { around = admin.slice(sb, i + 1); break; } }
    }
  }
  if (!around) {
    console.log("  ▫️  could not read the setBanner call that uses it — treating as indeterminate");
    process.exit(2);
  }
  const kindFromOutcome = /\bui\s*\?[^:]*\.type\s*:/.test(around) || /\bui\.type\b/.test(around);
  const sentenceSeesOutcome = /bannerSentence\(\s*data\s*,\s*ui\s*\)/.test(around);
  if (kindFromOutcome && sentenceSeesOutcome) {
    console.log("  ✅ the run banner takes its KIND and its SENTENCE from the outcome, so a refusal is not painted as success");
  } else {
    fails.push("Done is outcome-blind");
    console.log(`  🔴 the run banner does not branch on data.outcome (kind:${kindFromOutcome} sentence:${sentenceSeesOutcome}) — a refusal will render as success`);
  }
}

// 3. Instructions must not be alerted as a "follow-up".
if (/followup:\s*isHybrid\s*\?\s*stepDef\.instructions/.test(exec)) {
  fails.push("instructions alerted as follow-up");
  console.log("  🔴 flow-execute still returns step instructions as `followup` — the admin pops the");
  console.log("     whole manual over the result the user pressed the button for");
} else {
  console.log("  ✅ step instructions are not returned as a follow-up");
}

console.log("");
if (fails.length) {
  console.error(`🔴 the admin can claim work it did not do (${fails.join(", ")}).`);
  console.error("   'the call succeeded' and 'the work happened' are different facts.");
  process.exit(1);
}
console.log("✅ refusals, indeterminates and failures all report as themselves");
