#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-a-done-step-can-be-substantiated.mjs
//
// 🔴 WHY (2026-09-24). Resetting Phase 0 to walk it end to end, the record read:
//
//     m1.close.confirm : status=done  completed_at=2026-09-12T00:20:38Z
//     confirm email    : -- not recorded --
//
// The step that says "send the client their confirmation email" had been marked complete, and
// **nothing anywhere proved an email was ever sent** — no `gmail_message_id`, no Gmail thread id,
// nothing. It sat green for twelve days. The likely route is the "Open a draft instead" link, which
// opens Gmail's compose window: a human sends from there and the product records nothing.
//
// 🔑 THE LEDGER IS WHAT EVERYONE ACTS ON, AND A "DONE" NOBODY CAN SUBSTANTIATE IS WORSE THAN A
// "PENDING" — pending gets revisited, done never does. Every downstream step treated the client as
// having been told things they may never have been told.
// → feedback_do_the_step_dont_just_mark_it · feedback_correct_is_not_the_same_as_happening
//
// 🔑 THE FIX IS NOT A BLOCK. Forbidding the claim strands the legitimate case (they really did send
// it by hand) and an operator who cannot record reality stops using the checklist. What must not
// exist is a hand-marked step that is INDISTINGUISHABLE from a proven one. So: warn, record
// `marked_without_artifact`, and render it differently.
// → feedback_an_absence_must_never_be_readable_as_a_value
//
// WHAT THIS CHECKS, in admin.js:
//   1. a STEP_ARTIFACTS registry exists and covers the steps that produce an artifact
//   2. every entry names where the proof lives AND which on-screen control produces it
//   3. mutateFlowStep — the single choke point for manual status changes — consults it on "done"
//   4. it records marked_without_artifact rather than silently allowing the claim
//   5. the renderer shows an unproven step differently, using a pill class that actually exists
//
// exit 0 = a hand-marked step is distinguishable from a proven one · 1 = it is not · 2 = cannot tell
// → feedback_a_fix_without_a_gate_regresses
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const ADMIN = path.join(SITE, "admin", "admin.js");
const CSS = path.join(SITE, "admin", "admin.css");

for (const f of [ADMIN, CSS]) {
  if (!fs.existsSync(f)) {
    console.error(`⚠️  INDETERMINATE — ${path.basename(f)} not found.`);
    process.exit(2);
  }
}

// Assert on CODE. This gate's siblings have twice been satisfied by their own explanatory prose.
const strip = (s) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const admin = strip(fs.readFileSync(ADMIN, "utf8"));
const css = fs.readFileSync(CSS, "utf8");

const problems = [];

// ── 1. the registry ───────────────────────────────────────────────────────────────────────────
const reg = admin.match(/const STEP_ARTIFACTS\s*=\s*\{[\s\S]*?\n\};/);
if (!reg) {
  problems.push(`admin.js has no STEP_ARTIFACTS registry. Without it nothing knows which steps are `
    + `supposed to leave evidence, and any step can be ticked with nothing behind it — which is how `
    + `m1.close.confirm sat "done" for twelve days with no gmail_message_id.`);
} else {
  // The two Phase-0 steps are the ones that reach a real client in their first hour. If either
  // drops out of the registry the defect is back for the step it was found on.
  for (const id of ["m1.close.confirm", "m1.close.kickoff_invite"]) {
    if (!new RegExp(`["']${id.replace(/\./g, "\\.")}["']`).test(reg[0])) {
      problems.push(`${id} is not in STEP_ARTIFACTS. It produces a real artifact (an email or a `
        + `calendar event) and can be marked done without one.`);
    }
  }
  // Each entry must say where the proof lives AND which control produces it — a warning that does
  // not name the button is a dead end for whoever reads it.
  // → feedback_instruct_by_what_is_on_screen
  //
  // 🔴 THE SPLITTER USED TO BE /["'][\w.]+["']\s*:\s*\{[\s\S]*?\n {2}\}/g — terminating on exactly
  // two spaces before the brace. Deleting a line left the closer at six spaces, the regex failed to
  // terminate, and it silently matched ONE entry instead of two: the per-entry checks quietly
  // stopped running and the gate went green on a broken registry. A cosmetic reindent would have
  // done the same. 🔑 Never let layout terminate a parse — slice from one key to the NEXT key, and
  // FAIL LOUDLY if the count disagrees with the keys found.
  // → feedback_a_gate_window_measured_in_characters_will_lie · feedback_dead_check_selector_gap
  const keyRe = /["']([\w.]+)["']\s*:\s*\{/g;
  const keys = [...reg[0].matchAll(keyRe)];
  const entries = keys.map((m, i) => ({
    id: m[1],
    body: reg[0].slice(m.index, i + 1 < keys.length ? keys[i + 1].index : reg[0].length),
  }));
  if (!entries.length) {
    console.error("⚠️  INDETERMINATE — STEP_ARTIFACTS exists but no entries parsed; the reader has drifted.");
    process.exit(2);
  }
  for (const { id, body: e } of entries) {
    if (!/proof:\s*\(/.test(e)) problems.push(`STEP_ARTIFACTS["${id}"] has no \`proof\` reader, so nothing can tell whether the artifact exists.`);
    // `what` is interpolated straight into the operator's dialog — "Nothing ... shows ${what}".
    // Missing, it renders the word "undefined" at a person.
    if (!/what:\s*["'`]/.test(e)) {
      problems.push(`STEP_ARTIFACTS["${id}"] has no \`what\`, so the warning would read "nothing in `
        + `this client's record shows undefined".`);
    }
    if (!/how:\s*["'`]/.test(e)) {
      problems.push(`STEP_ARTIFACTS["${id}"] has no \`how\` — the warning would tell an operator `
        + `something is missing without naming the control that produces it.`);
    }
  }
}

// ── 2. the choke point consults it ────────────────────────────────────────────────────────────
const mutate = admin.match(/async function mutateFlowStep\([\s\S]*?\n\}/);
if (!mutate) {
  problems.push(`mutateFlowStep is gone. It was the single choke point every manual status change `
    + `passed through; if status writes now happen elsewhere they are each unguarded.`);
} else {
  if (!/STEP_ARTIFACTS/.test(mutate[0])) {
    problems.push(`mutateFlowStep does not consult STEP_ARTIFACTS. The registry exists but nothing `
      + `reads it on the path that marks a step done — a check that cannot fire.`);
  }
  if (!/marked_without_artifact\s*=\s*true/.test(mutate[0])) {
    problems.push(`mutateFlowStep never sets marked_without_artifact. Allowing the claim without `
      + `recording that it was unproven leaves the row byte-identical to a proven one, which is the `
      + `entire defect.`);
  }
  // 🔴 The guard must run BEFORE the UI is locked. Awaiting a dialog after setting flowBusy leaves
  // the admin frozen while the operator reads, and the early return skips the unlock.
  const busyAt = mutate[0].indexOf("state.flowBusy = true");
  const guardAt = mutate[0].indexOf("STEP_ARTIFACTS");
  if (busyAt >= 0 && guardAt >= 0 && guardAt > busyAt) {
    problems.push(`the artifact guard runs AFTER state.flowBusy = true. Its dialog then blocks with `
      + `the UI locked, and declining returns without ever clearing the flag.`);
  }
}

// ── 3. an unproven step must LOOK different, in a class that exists ───────────────────────────
if (!/marked_without_artifact/.test(admin.replace(/async function mutateFlowStep[\s\S]*?\n\}/, ""))) {
  problems.push(`nothing outside mutateFlowStep reads marked_without_artifact. The flag is recorded `
    + `and never rendered, so on screen a hand-marked step is still identical to a proven one.`);
}
const pill = admin.match(/marked_without_artifact[\s\S]{0,400}?admin-pill (\w+)/);
if (pill) {
  const cls = pill[1];
  if (!new RegExp(`\\.admin-pill\\.${cls}\\b`).test(css)) {
    problems.push(`the unproven-step pill uses .admin-pill.${cls}, which is not defined in `
      + `admin.css. It would render unstyled — a warning nobody can see is not a warning.`);
  }
} else if (!problems.length) {
  problems.push(`the unproven marker does not render a pill, so there is no visual difference `
    + `between a substantiated "done" and an asserted one.`);
}

if (problems.length) {
  console.error(`🔴 FAIL — ${problems.length} problem(s):\n`);
  for (const p of problems) console.error(`   • ${p}\n`);
  process.exit(1);
}

console.log(`✅ steps that produce an artifact declare it, the manual choke point checks for it, and `
  + `a hand-marked "done" is recorded and rendered as unverified rather than passing for proven.`);
process.exit(0);
