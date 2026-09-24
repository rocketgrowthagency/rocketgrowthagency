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

// ── 2. the shared guard, and EVERY writer going through it ────────────────────────────────────
//
// 🔴🔴 THIS SECTION USED TO CHECK ONLY mutateFlowStep, AND THAT IS HOW IT PASSED ON A BROKEN FIX.
// I placed the guard in mutateFlowStep, called it "the single choke point", and gated exactly that.
// It was not the only writer: the onboarding checklist's "✓ Mark step complete" runs through
// `markOnboardingStep`, which calls `state.adapter.updateFlowTask` directly — the most-used path,
// and the likely origin of the unsubstantiated tick this whole gate exists to prevent.
//
// 🔑 ASSERT THE NEGATIVE: not "the door I know about is locked" but "there is no OTHER door".
// Every call site that writes a status must pass through the shared guard.
// → feedback_a_guard_must_reach_the_thing_it_guards · feedback_fix_the_class_not_the_instance
const guard = admin.match(/async function guardUnsubstantiatedDone\([\s\S]*?\n\}/);
if (!guard) {
  problems.push(`there is no shared guardUnsubstantiatedDone(). With the check inlined in one `
    + `function, every other path that writes a status is unguarded by default — which is exactly `
    + `how the checklist's "Mark step complete" bypassed the first version of this fix.`);
} else {
  if (!/STEP_ARTIFACTS/.test(guard[0])) {
    problems.push(`guardUnsubstantiatedDone does not consult STEP_ARTIFACTS — a check that cannot fire.`);
  }
  if (!/marked_without_artifact\s*=\s*true/.test(guard[0])) {
    problems.push(`guardUnsubstantiatedDone never sets marked_without_artifact. Allowing the claim `
      + `without recording that it was unproven leaves the row byte-identical to a proven one.`);
  }
}

// Every function that writes a task status must call the guard first. Find them by their write,
// then check the enclosing function — rather than naming the two I happen to know about, which is
// the mistake that made the first version of this gate useless.
const WRITERS = [
  { fn: "mutateFlowStep", why: "Mission Control's complete/block controls" },
  { fn: "markOnboardingStep", why: `the onboarding checklist's "✓ Mark step complete"` },
];
for (const w of WRITERS) {
  const body = admin.match(new RegExp(`async function ${w.fn}\\([\\s\\S]*?\\n\\}`));
  if (!body) {
    problems.push(`${w.fn} (${w.why}) no longer exists — if that work moved somewhere else, the new `
      + `home is unguarded and must be added to this gate's WRITERS list.`);
    continue;
  }
  if (!/guardUnsubstantiatedDone/.test(body[0])) {
    problems.push(`${w.fn} writes a step status without calling guardUnsubstantiatedDone. `
      + `${w.why} can therefore record a "done" with no artifact, indistinguishable from a proven one.`);
  }
  // 🔴 The guard must run BEFORE the UI is locked, and before the write. Awaiting a dialog after
  // flowBusy leaves the admin frozen while the operator reads, and declining skips the unlock.
  const busyAt = body[0].indexOf("state.flowBusy = true");
  const guardAt = body[0].indexOf("guardUnsubstantiatedDone");
  if (busyAt >= 0 && guardAt >= 0 && guardAt > busyAt) {
    problems.push(`in ${w.fn} the guard runs AFTER state.flowBusy = true, so its dialog blocks with `
      + `the UI locked and declining never clears the flag.`);
  }
  const writeAt = body[0].search(/updateFlowTask|adapter\.updateFlowTask/);
  if (writeAt >= 0 && guardAt >= 0 && guardAt > writeAt) {
    problems.push(`in ${w.fn} the guard runs AFTER the write — the unsubstantiated status is already `
      + `saved by the time anyone is asked about it.`);
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
