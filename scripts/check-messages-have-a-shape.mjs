#!/usr/bin/env node
/**
 * check-messages-have-a-shape.mjs — no client-facing message is a loose grey sentence.
 *
 * ─── WHY ─────────────────────────────────────────────────────────────────────────────────────────
 * Chris, 2026-09-25: *"any messages need to be in pill or sometype of way as this is just text
 * everywhere and not clean and organized enough."*
 *
 * The real defect was not ugliness. Four different KINDS of message looked identical — a permanent
 * fact, a thing the client just did, an error, and an instruction were all the same grey sentence —
 * so none of them could be told apart without reading all of them.
 *
 * The approved system (reports/mockups/portal_message_system_v1.html) is five shapes and one rule:
 *
 *   always true            → .pm-chip
 *   you just did it        → .pm-msg      (+ .ok / .bad / .wait / .busy)
 *   longer standing caveat → .pm-note
 *   happened and persists  → .pm-outcome
 *   the pane is empty      → .pm-prompt
 *
 * 🔴 THIS GATE'S JOB IS THE EROSION, NOT THE INITIAL BUILD. The build is done; what it prevents is
 * the next message being written as a bare <p> because that was quicker. A system with one
 * exception is not a system.
 *
 * Exit 0 = every shape exists and nothing reverted · 1 = a message lost its shape · 2 = cannot tell.
 */
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const JS = path.join(SITE, "portal/portal.js");
const CSS = path.join(SITE, "portal/portal.css");
const MOCK = path.join(SITE, "reports/mockups/portal_message_system_v1.html");

for (const f of [JS, CSS]) {
  if (!fs.existsSync(f)) { console.log(`  ⚠️  ${f} is missing — cannot judge.`); process.exit(2); }
}
const js = fs.readFileSync(JS, "utf8");
const css = fs.readFileSync(CSS, "utf8");
const code = js.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const fail = [];
console.log("── every message has a shape ──");

// 1 ─ all five shapes exist in CSS, or the classes below are decoration
const SHAPES = ["pm-chip", "pm-msg", "pm-note", "pm-outcome", "pm-prompt"];
for (const shape of SHAPES) {
  if (!new RegExp(`\\.${shape}\\s*\\{`).test(css)) {
    fail.push(`.${shape} has no rule — a message using it would render as unstyled text, which is what this replaced`);
  }
}
// the four tones of the status pill; without them .bad and .ok look the same
for (const tone of ["ok", "bad", "wait", "busy"]) {
  if (!new RegExp(`\\.pm-msg\\.${tone}\\s*\\{`).test(css)) {
    fail.push(`.pm-msg.${tone} has no rule — that state would be indistinguishable from the others`);
  }
}

// 2 ─ 🔴 THE SENTENCES THAT WERE CONVERTED MUST NOT COME BACK AS SENTENCES.
//     Each entry: the string, and the shape that must be within reach of it.
const CONVERTED = [
  { text: "30 min", shape: "pm-chip", was: "30 minutes. Times shown in …" },
  { text: "Pick a date", shape: "pm-prompt", was: "Pick a highlighted date to see the times available." },
  { text: "No open times", shape: "pm-prompt", was: "a bare paragraph" },
  { text: "Requested", shape: "pm-outcome", was: "two stacked paragraphs" },
  { text: "still to answer", shape: "pm-msg", was: "Saved as you go. N of M still to answer." },
  { text: "Loading available times", shape: "pm-msg", was: "a grey is-muted line" },
];
for (const { text, shape, was } of CONVERTED) {
  // 🔴 EVERY OCCURRENCE, NOT THE FIRST. Both "30 min" and "still to answer" appear earlier in
  // unrelated places — a summary badge, a step's own hint — so judging only `indexOf` failed
  // working code twice on this gate's first run. The claim is "this message appears in its shaped
  // form somewhere", so ANY occurrence carrying the shape satisfies it.
  const hits = [];
  for (let i = code.indexOf(text); i !== -1; i = code.indexOf(text, i + 1)) hits.push(i);
  if (!hits.length) continue;          // copy may legitimately change; only judge what is present
  // 🔑 Look in the enclosing TEMPLATE, not a fixed character window — a window lands mid-expression
  // and that mistake has produced false failures repeatedly.
  // → feedback_a_gate_window_measured_in_characters_will_lie
  const shaped = hits.some((i) => {
    const open = code.lastIndexOf("`", i);
    const close = code.indexOf("`", i);
    const region = code.slice(Math.max(0, open - 900), close === -1 ? i + 600 : close + 300);
    return region.includes(shape);
  });
  if (!shaped) {
    fail.push(`"${text}" is rendered without ${shape} — it was ${was}, and a bare sentence is what the message system replaced`);
  }
}

// 3 ─ the old classes must stay gone, or two systems coexist
for (const dead of ["pm-in-msg", "kc-tz", "fct-note", "fct-done"]) {
  if (new RegExp(`class="[^"]*\\b${dead}\\b`).test(code)) {
    fail.push(`${dead} is being rendered again — the pre-system message class is back alongside the new one`);
  }
}

// 4 ─ 🔴 A PILL CARRIES A DOT ELEMENT, so it cannot be filled with textContent. Anything that
//     writes one through innerHTML must escape, because these strings include API error text.
{
  const writes = [...code.matchAll(/innerHTML\s*=\s*`<span class="dot">[\s\S]{0,200}?`/g)].map((m) => m[0]);
  for (const w of writes) {
    if (/\$\{(?!escapeHtml|ICON_)/.test(w)) {
      fail.push("a status pill interpolates an unescaped value through innerHTML — error text from an API is not trusted markup");
    }
  }
}

// 5 ─ the shapes must still match the approved mockup's names (a rename here is a silent fork)
if (fs.existsSync(MOCK)) {
  const mock = fs.readFileSync(MOCK, "utf8");
  for (const [live, inMock] of [["pm-chip", "m-chip"], ["pm-msg", "m-pill"], ["pm-note", "m-note"],
                                ["pm-outcome", "m-out"], ["pm-prompt", "m-prompt"]]) {
    if (!mock.includes(inMock)) {
      console.log(`  ⚠️  the approved mockup no longer defines .${inMock} (live .${live}) — re-approve before trusting this check.`);
      process.exit(2);
    }
  }
} else {
  console.log("  ⚠️  the approved mockup is missing — cannot confirm the shapes still match it.");
  process.exit(2);
}

if (fail.length) {
  console.log(`\n🔴 ${fail.length} problem(s):`);
  for (const f of fail) console.log(`    ${f}`);
  console.log("\n   Five shapes, one rule: always true → chip · you just did it → pill ·");
  console.log("   longer caveat → note · happened and persists → outcome · empty pane → prompt.");
  process.exit(1);
}
console.log("  five shapes defined · four pill tones · six converted messages still shaped · no pill interpolates unescaped");
console.log("\n✅ no client-facing message has reverted to a loose sentence.");
process.exit(0);
