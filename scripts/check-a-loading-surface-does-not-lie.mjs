#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-a-loading-surface-does-not-lie.mjs
//
// 🔴 WHY (2026-09-24). Chris refreshed the client page and screenshotted what it showed for about a
// second before settling:
//
//     0 of 9 done · Set up call tracking        ← the OLD curated 18-objective list
//     🔴 Google is not connected yet            ← while the header chip read "Google connected"
//     Step 1 · Set up call tracking             ← the next-action card, naming the wrong step
//
// Then it repainted to the truth: 27 of 59, step 2, Google connected.
//
// The cause was a kind-sounding fallback: "degrade to the old curated view instead of an empty
// page while the SOP loads." But the old view is a DIFFERENT DATA SET — 9 objectives instead of 59
// steps, its own numbering, its own idea of which step is next. For that second the product was not
// slow, it was WRONG, and every number on it invited the operator to act.
//
// 🔑 UNLOADED IS NOT AN ANSWER. A blank panel that says "loading" is honest; a populated panel that
// is wrong is not. The same rule already governs rank grids, absent findings and indeterminate
// gates — this is the render-time instance of it.
// → feedback_an_absence_must_never_be_readable_as_a_value · feedback_indeterminate_is_not_a_finding
//
// WHAT THIS CHECKS, in admin.js:
//   1. the sequencer refuses to answer until the playbook is loaded (no cross-dataset fallback)
//   2. there is an explicit loaded/not-loaded predicate, so callers can tell the two apart
//   3. the checklist renders a loading skeleton rather than silently nothing
//   4. a FAILED fetch is distinguishable from a slow one — otherwise "loading…" shows forever
//   5. the "Google is not connected" warning is gated on actually knowing, not on a null
//
// exit 0 = a loading surface tells the truth · 1 = it can show a confident wrong answer · 2 = cannot tell
// → feedback_a_fix_without_a_gate_regresses
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const ADMIN = path.join(SITE, "admin", "admin.js");

if (!fs.existsSync(ADMIN)) { console.error(`⚠️  INDETERMINATE — admin.js not found at ${ADMIN}.`); process.exit(2); }

const raw = fs.readFileSync(ADMIN, "utf8");
const code = raw.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const problems = [];

const fnBody = (name) => {
  const at = code.indexOf(`function ${name}`);
  if (at < 0) return null;
  let d = 0;
  for (let i = code.indexOf("{", at); i < code.length; i++) {
    if (code[i] === "{") d++;
    else if (code[i] === "}") { d--; if (!d) return code.slice(at, i + 1); }
  }
  return null;
};

// ── 1 + 2. the sequencer refuses to answer before the data exists ─────────────────────────────
if (!/function\s+sopPlaybookLoaded\s*\(/.test(code)) {
  problems.push(`There is no sopPlaybookLoaded() predicate. Without one, callers cannot tell "the `
    + `playbook has not arrived" from "the playbook says there is nothing", and they guess.`);
}
{
  const body = fnBody("sopSequencedSteps");
  if (!body) {
    console.error("⚠️  INDETERMINATE — sopSequencedSteps() not found; re-point this gate deliberately.");
    process.exit(2);
  }
  if (!/sopPlaybookLoaded\s*\(/.test(body)) {
    problems.push(`sopSequencedSteps() does not check whether the playbook is loaded before `
      + `answering. It will return SOMETHING during the fetch, and whatever that is gets rendered `
      + `as fact.`);
  }
  // The specific regression: falling back to the curated objective list, a different data set.
  if (/resolved\s*\.\s*filter\s*\(/.test(body)) {
    problems.push(`sopSequencedSteps() still falls back to the curated objective list `
      + `(resolved.filter(...)). That is a DIFFERENT DATA SET — 9 objectives vs 59 SOP steps, with `
      + `its own numbering — so the page renders a confident wrong checklist until the SOP lands. `
      + `This is the exact flash Chris caught: "0 of 9 done · Set up call tracking".`);
  }
}

// ── 3 + 4. the checklist says loading, and can say unavailable ────────────────────────────────
{
  const body = fnBody("renderOnboardingChecklist");
  if (!body) {
    console.error("⚠️  INDETERMINATE — renderOnboardingChecklist() not found.");
    process.exit(2);
  }
  if (!/Loading the playbook/i.test(body)) {
    problems.push(`renderOnboardingChecklist() renders no loading state. An empty panel where a `
      + `checklist belongs reads as "this client has no steps", which is its own wrong answer.`);
  }
  if (!/flowPlaybookError/.test(body)) {
    problems.push(`renderOnboardingChecklist() cannot distinguish a FAILED playbook fetch from a `
      + `slow one, so a broken load shows "Loading the playbook…" forever and looks like a slow `
      + `network rather than an outage.`);
  }
}
// 🔴 It must be set ON FAILURE, not merely somewhere. The first version matched any assignment and
// was satisfied by the RESET (`state.flowPlaybookError = ""`) that runs on client-select — so
// deleting the line in the catch still passed. Caught by mutation-testing this gate.
// → feedback_a_guard_must_reach_the_thing_it_guards
{
  const setsOnFailure = [...code.matchAll(/catch\s*\([^)]*\)\s*\{([\s\S]{0,1500}?)\n\s{0,4}\}/g)]
    .some((m) => /state\.flowPlaybookError\s*=\s*[^"']/.test(m[1]));
  if (!setsOnFailure) {
    problems.push(`state.flowPlaybookError is never assigned a real value inside a catch block, so `
      + `the "checklist unavailable" branch can never fire and a broken fetch shows "Loading…" `
      + `forever. (An empty-string reset elsewhere does not count.)`);
  }
}

// ── 6. the header badges must not accuse before the fetch resolves ────────────────────────────
// 🔴 Found the same day, by reading rather than by the browser sweep: `state.contracts` is reset to
// [] on client-select, and [] is EXACTLY what a client with no contracts looks like — so the header
// flashed "No contract" on every refresh of a client whose agreement is signed. And the Google rows
// did `state.googleOauth || {}`, turning "not fetched" into three separate "Not connected" verdicts.
// 🔑 An empty collection cannot double as "not loaded". Track the fetch itself.
{
  if (!/state\.contractsLoaded\s*=\s*false/.test(code) || !/state\.contractsLoaded\s*=\s*true/.test(code)) {
    problems.push(`There is no state.contractsLoaded flag set both false (on select) and true (after `
      + `the fetch). Without it, [] means both "no contracts" and "not fetched yet", and the header `
      + `badge accuses a signed client of having no contract on every refresh.`);
  }
  const at = code.indexOf('label: "No contract"');
  if (at >= 0) {
    const before = code.slice(Math.max(0, at - 300), at);
    if (!/contractsLoaded/.test(before)) {
      problems.push(`The "No contract" badge is not gated on state.contractsLoaded, so it renders `
        + `while the contracts fetch is still in flight.`);
    }
  }
  // 🔑 Check the VERDICT, not the idiom. A first version banned the spelling
  // `state.googleOauth || {}` outright and then failed code that reads it but correctly carries an
  // unknown state through to the render. What matters is that nothing PRINTS "Not connected" (or
  // tells the operator to go connect something) without having checked.
  {
    const lines = code.split("\n");
    const GUARD = /oauthUnknown|googleOauth\s*===\s*null|Checking…|verdict\(/;
    lines.forEach((ln, i) => {
      if (!/"Not connected"|connect Google/.test(ln)) return;
      // 🔑 SCOPE TO THE ENCLOSING FUNCTION, not N lines. renderKpiSourceChips() guards correctly on
      // its second line and emits the chips ten lines later — an 8-line window missed the guard and
      // failed correct code. Fifth character-window miss today; stop measuring in lines.
      // → feedback_a_gate_window_measured_in_characters_will_lie
      let start = i;
      while (start > 0 && !/^(async\s+)?function\s/.test(lines[start])) start--;
      let end = i;
      while (end < lines.length - 1 && !/^(async\s+)?function\s/.test(lines[end + 1])) end++;
      const window = lines.slice(start, end + 1).join("\n");
      // 🔑 Only a verdict DERIVED FROM CLIENT STATE can be wrong-while-loading. A message built
      // from a server response ("gbp_scope_missing") is authoritative the moment it arrives, and
      // flagging those made this gate cry wolf on two correct handlers. A noisy gate gets muted.
      // → feedback_a_gate_that_it_exists_is_not_a_gate_that_it_works
      if (!/state\.googleOauth|\bg\.(gbp|ga4|gsc|youtube)|\bo\.(ga4|gsc|gbp)/.test(window)) return;
      if (!GUARD.test(window)) {
        problems.push(`a "not connected" verdict is rendered with no check that the `
          + `Google connection state has actually loaded. state.googleOauth is null until its fetch `
          + `resolves, so this accuses a connected client on every refresh: ${ln.trim().slice(0, 90)}`);
      }
    });
  }
}

// ── 5. do not accuse the client of a connection we have not checked ───────────────────────────
{
  // 🔴 Assert the STRUCTURE, not proximity. The first version looked for the word "oauthKnown"
  // within 700 characters before the warning — and its own `const oauthKnown = …` declaration sits
  // right there, so replacing the actual guard with `true` still passed. Third time today a
  // character window has lied, twice of them in gates I wrote this session.
  // → feedback_a_gate_window_measured_in_characters_will_lie
  const at = code.indexOf("Google is not connected yet");
  if (at >= 0) {
    const stmt = code.slice(Math.max(0, at - 900), at);
    // the warning must be reached through the oauthKnown branch, not unconditionally
    if (!/:\s*oauthKnown[\s\S]*$/.test(stmt) && !/oauthKnown\s*\?/.test(stmt)) {
      problems.push(`The "Google is not connected yet" warning is not gated on whether the OAuth `
        + `state has actually loaded. state.googleOauth is null until its fetch resolves, so on a `
        + `refresh this contradicts the header chip that says "Google connected" a few pixels above.`);
    }
  }
}

if (problems.length) {
  console.error("🔴 A SURFACE CAN RENDER A CONFIDENT WRONG ANSWER WHILE IT LOADS\n");
  for (const p of problems) console.error(`  🔴 ${p}\n`);
  console.error("  admin.js → sopSequencedSteps / renderOnboardingChecklist / the next-action card.");
  process.exit(1);
}

console.log("✅ a loading surface does not lie");
console.log("   the sequencer refuses to answer before the playbook exists (no cross-dataset fallback)");
console.log("   the checklist shows loading, and can say unavailable when the fetch failed");
console.log("   the Google warning waits until the connection state is actually known");
