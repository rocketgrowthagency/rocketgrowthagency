#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — A SETTLED STEP NEVER TELLS THE CLIENT TO DO IT, AND EVERY STEP SAYS HOW IT FINISHES
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Approved 2026-09-27 — reports/mockups/client_step_card_v1.html.
 *
 * 🔴 The heading over a step's control was a fixed string chosen by form type:
 *    `clientForm === "kickoff_booking" ? "Choose a date and time" : …` — with no reference to
 *    whether the step was settled. So a CONFIRMED booking sat under an instruction to choose a time
 *    the client had already chosen. Chris screenshotted it. It is the same defect that, on the admin
 *    side the same day, told him to send an invite for a call already in the diary.
 *
 * 🔴 And the card never said HOW it gets ticked. These steps finish four different ways — you tell
 *    us · we notice · you choose · we do it — and SEVEN of sixteen finish by detection. The legend
 *    at the top of the page names the four; the card a client is actually reading did not.
 *
 * WHAT IS PINNED:
 *   1. Every control heading is a PAIR, and the settled state picks.
 *   2. No heading in the settled arm is an instruction to act.
 *   3. The "You are done when" line exists, covers every `clientDone` kind the data uses, and is
 *      hidden once the step is settled.
 *   4. The admin's defect has not been imported: `clientHint` is never derived from the instructions.
 *
 * Exit 0 pass · 1 fail · 2 indeterminate. Mutation log at the bottom.
 */
import fs from "node:fs";
import path from "node:path";

const WEB = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const fail = [], indet = [], pass = [];

const pjs = path.join(WEB, "portal/portal.js");
if (!fs.existsSync(pjs)) { console.log("  ⚠️  portal.js missing"); process.exit(2); }
const src = fs.readFileSync(pjs, "utf8");
if (src.length < 100000) { console.log("  ⚠️  portal.js too small"); process.exit(2); }
const code = src.replace(/^[ \t]*\/\/.*$/gm, "");

// ── 1 + 2. THE HEADING FOLLOWS THE STATE ────────────────────────────────────────────────────────
{
  // 🔴 ANCHOR ON THE EXPRESSION, NOT THE NAME. `indexOf("const head = ")` found a scroll helper
  // 165KB earlier — `const head = el.querySelector("[data-step-toggle]")` — and the slice then ran
  // through half the bundle, flagging the words "send that" from unrelated copy. Nth time a check
  // here anchored on a name's first occurrence.
  // → feedback_an_inventory_is_a_claim_about_what_i_thought_to_grep
  const at = code.indexOf("const head = step.clientForm ===");
  if (at < 0) { fail.push("portal/portal.js — the control heading is gone."); }
  else {
    const semi = code.indexOf(";", code.indexOf('"What to do"', at));
    const expr = semi > at ? code.slice(at, semi + 1) : "";
    if (!expr) { indet.push("could not bound the heading expression"); }
    else {
    if (!/settled/.test(expr)) {
      fail.push("portal/portal.js — the control heading never consults `settled`, so a finished step "
        + "still carries an instruction to do it. A confirmed booking sits under \"Choose a date and time\".");
    } else pass.push("the control heading follows the settled state");

    // 🔴 ANY SETTLED-NESS FLAG, NOT THE ONE IDENTIFIER. This matched `settled` literally and
    // case-sensitively, so when the kickoff heading moved to `bookingSettled` — a confirmed booking
    // is settled for copy purposes even while the task row is still pending — the pair vanished from
    // the count and a correct tree failed. The property is that the heading is CHOSEN BY STATE, not
    // that one variable is spelled one way.
    // → feedback_a_gate_must_pin_the_property_not_the_spelling
    const pairs = [...expr.matchAll(/[A-Za-z_$]*[Ss]ettled\s*\?\s*"([^"]*)"\s*:\s*"([^"]*)"/g)];

    // 🔴 COUNTING PAIRS IS NOT THE PROPERTY. Reverting the kickoff heading to a fixed string left
    // three other pairs standing, and a `>= 3` count passed while a confirmed booking went back to
    // sitting under "Choose a date and time". The property is that NO IMPERATIVE HEADING STANDS
    // ALONE — every one of them must be the unsettled arm of a pair.
    // → feedback_a_gate_must_pin_the_property_not_the_spelling
    const IMPERATIVE = /^(choose|pick|select|enter|add|tell|provide|do|send|book|confirm|what to do)\b/i;
    const paired = new Set(pairs.flatMap((m) => [m[1], m[2]]));
    const lone = [...expr.matchAll(/"([^"]{3,})"/g)].map((m) => m[1])
      .filter((t) => IMPERATIVE.test(t.trim()) && !paired.has(t));
    if (lone.length) {
      for (const t of lone) {
        fail.push(`portal/portal.js — the heading "${t}" is a fixed string, so it stays on the card `
          + `after the step is settled — telling the client to do something already done.`);
      }
    } else pass.push(`every imperative heading is the unsettled arm of a pair (${pairs.length} pairs)`);

    // 🔴 AND THE SETTLED ARM MUST NOT BE AN INSTRUCTION EITHER.
    let bad = 0;
    for (const [, settledArm] of pairs.map((m) => [m[0], m[1]])) {
      if (IMPERATIVE.test(settledArm.trim())) {
        bad++;
        fail.push(`portal/portal.js — a SETTLED step is headed "${settledArm}", which is an instruction `
          + `to do something already done.`);
      }
    }
    if (!bad && pairs.length) pass.push("no settled heading tells the client to act");
    }
  }
}

// ── 3. THE CARD SAYS HOW IT FINISHES ────────────────────────────────────────────────────────────
{
  const at = code.indexOf("DONE_WHEN");
  if (at < 0) {
    fail.push("portal/portal.js — nothing tells the client how a step gets ticked. Seven of sixteen "
      + "finish by detection, and the card cannot say whether they must come back and press something.");
  } else {
    const block = code.slice(at, at + 1400);
    // Every kind the DATA actually uses must be covered — read the data, do not assume the list.
    const dataPath = path.join(WEB, "data/playbooks/client-steps.json");
    let kinds = [];
    try {
      const raw = JSON.parse(fs.readFileSync(dataPath, "utf8"));
      const steps = Array.isArray(raw) ? raw : (raw.steps || Object.values(raw).find(Array.isArray) || []);
      kinds = [...new Set(steps.map((s) => s && s.clientDone).filter(Boolean))];
    } catch (e) { indet.push(`could not read client-steps.json (${e.message})`); }
    if (kinds.length) {
      const missing = kinds.filter((k) => !new RegExp(`\\b${k}\\s*:`).test(block));
      if (missing.length) {
        fail.push(`portal/portal.js — no "you are done when" copy for clientDone kind(s): `
          + `${missing.join(", ")}. Those steps say nothing about how they finish.`);
      } else pass.push(`every clientDone kind in the data is covered (${kinds.join(", ")})`);
    }
    // 🔴 Hidden once settled — by then it is answered, not pending.
    // 🔑 Same reason: the guard may be `settled ? "" :` or `(settled || …) ? "" :`. What matters is
    // that settled-ness gates it at all.
    const before = code.slice(Math.max(0, at - 700), at);
    if (!/[Ss]ettled[^?]{0,80}\?\s*""/.test(before)) {
      fail.push("portal/portal.js — the \"you are done when\" line is not hidden once the step is "
        + "settled, so a finished step still explains how to finish it.");
    } else pass.push("the line is hidden once the step is settled");
  }
}

// ── 4. THE ADMIN'S DEFECT HAS NOT BEEN IMPORTED ─────────────────────────────────────────────────
// 🔑 The admin's subtitle came from the first line of the instructions rendered beneath it. Measured
// 2026-09-27: 0 of 16 client steps do that, because clientHint is purpose-written. Keep it that way.
{
  const dataPath = path.join(WEB, "data/playbooks/client-steps.json");
  try {
    const raw = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    const steps = Array.isArray(raw) ? raw : (raw.steps || Object.values(raw).find(Array.isArray) || []);
    const dupes = steps.filter((s) => {
      const h = String(s?.clientHint || "").trim();
      const ins = String(s?.clientInstructions || "").trim();
      return h && ins && ins.split("\n")[0].trim().slice(0, 60) === h.slice(0, 60);
    });
    if (dupes.length) {
      fail.push(`client-steps.json — ${dupes.length} step(s) have a clientHint that repeats the first `
        + `line of their own instructions. That is the admin bug; the hint is not a summary of the body.`);
    } else pass.push(`no client hint repeats its own instructions (${steps.length} steps)`);
  } catch (e) { indet.push(`could not read client-steps.json (${e.message})`); }
}

for (const x of pass) console.log(`  ✅ ${x}`);
for (const x of indet) console.log(`  ⚠️  INDETERMINATE — ${x}`);
for (const x of fail) console.log(`  🔴 ${x}`);
if (fail.length) { console.log(`\n🔴 FAIL — ${fail.length} problem(s) on the client step card.`); process.exit(1); }
if (indet.length) { console.log(`\n⚠️  INDETERMINATE — ${indet.length} thing(s) this gate could not read.`); process.exit(2); }
console.log(`\n✅ a settled step never says do it, and every step says how it finishes (${pass.length} checks).`);

/* MUTATION LOG — filled in below. */
