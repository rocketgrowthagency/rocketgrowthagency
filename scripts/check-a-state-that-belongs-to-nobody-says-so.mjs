#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — A STATE THAT BELONGS TO NOBODY SAYS SO
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Found 2026-10-05 walking the kickoff loop with Chris. Immediately after approving a time, the admin
 * card read:
 *
 *     WAITING ON THE CLIENT
 *     The kickoff call is booked — nothing to do until it starts
 *     Thursday, October 8 at 11:30 AM
 *
 * The eyebrow contradicted its own headline, and sat beside a right-hand column correctly reading
 * "Also waiting on the client" about DIFFERENT items — one card saying "waiting on the client" twice,
 * meaning two different things, one of them false.
 *
 * 🔑 THE CAUSE WAS THE MODEL, NOT THE LABEL. Whose-turn-is-it was BINARY (`you` / `client`), so a
 * state belonging to NEITHER party had to pick one and lie. Any binary turn model mislabels every
 * waiting period, cooling-off and external dependency it ever grows.
 *
 * So this pins the CLASS, not the instance:
 *   1. A next-action state whose own copy says there is nothing to do is not owned by a PERSON.
 *   2. The renderer has a third kind, and it is resolved BEFORE the two-way fallback.
 *   3. That third kind's label claims nothing of anybody.
 *
 * → feedback_a_booked_call_is_waiting_on_the_clock_not_on_a_person · feedback_fix_the_class_not_the_instance
 *
 * Exit 0 pass · 1 a state that belongs to nobody is blaming somebody · 2 could not run.
 */
import fs from "node:fs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = `${SITE}/admin/admin.js`;
if (!fs.existsSync(F)) { console.error(`⚠️  INDETERMINATE — missing ${F}`); process.exit(2); }
const src = fs.readFileSync(F, "utf8");
const fail = [];

// Strip comments first: this file DOCUMENTS the old wrong labels at length, and a naive scan reads
// the explanation of the bug as the bug. → feedback_a_comment_asserting_a_fix_is_not_the_fix
const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

// ── 1 · EVERY next-action state, read as an object ──────────────────────────────────────────────
// Find each `owner: "<kind>"` that belongs to the next-action card (it has a `title:` beside it) and
// pull the surrounding object literal by brace-matching backwards to its `{`.
const states = [];
const re = /owner:\s*"(you|client|clock)"/g;
let m;
while ((m = re.exec(code))) {
  // walk back to the opening brace of this object literal
  let d = 0, start = -1;
  for (let i = m.index; i >= 0; i--) {
    if (code[i] === "}") d++;
    else if (code[i] === "{") { if (!d) { start = i; break; } d--; }
  }
  if (start < 0) continue;
  let dd = 0, end = -1;
  for (let i = start; i < code.length; i++) {
    if (code[i] === "{") dd++;
    else if (code[i] === "}") { dd--; if (!dd) { end = i + 1; break; } }
  }
  if (end < 0) continue;
  const body = code.slice(start, end);
  if (!/\btitle:\s*"/.test(body)) continue;   // not a next-action state
  const title = (body.match(/\btitle:\s*"([^"]*)"/) || ["", ""])[1];
  states.push({ owner: m[1], title, body });
}

if (states.length < 3) {
  console.error(`⚠️  INDETERMINATE — found only ${states.length} next-action state(s); the extraction is wrong, not the code.`);
  process.exit(2);
}

// ── 2 · THE CLASS RULE ──────────────────────────────────────────────────────────────────────────
// 🔑 Pin the PROPERTY — "its own copy says nobody is doing anything" — not the one sentence that
// happens to say it today. → feedback_a_gate_must_pin_the_property_not_the_spelling
const IDLE = /nothing to do|nothing to be done|nothing is needed|not? action (is )?needed|waiting for (the )?(time|start|clock)|until it starts/i;
for (const st of states) {
  if (IDLE.test(st.title) && st.owner !== "clock") {
    fail.push(`a state whose headline says nothing is to be done is owned by "${st.owner}" — `
      + `the eyebrow will blame somebody for a state nobody is holding up: "${st.title}"`);
  }
  // And the converse: `clock` must not be used for a state that genuinely asks somebody for something.
  if (st.owner === "clock" && /waiting on the client to|they cancelled|pick a|send us|provide/i.test(st.title)) {
    fail.push(`a state that asks somebody for something is owned by "clock": "${st.title}"`);
  }
}

// ── 3 · THE RENDERER KNOWS THE THIRD KIND, AND RESOLVES IT FIRST ────────────────────────────────
if (!/data\.admin\.owner === "clock"/.test(code)) {
  fail.push("the turn resolver no longer accepts `clock` — a third-kind state would fall back to the stage's guess and be blamed on somebody");
}
{
  // The label must branch on the third kind BEFORE the two-way ternary, or `clock` renders as
  // "Waiting on the client" again — the exact defect.
  const line = (code.match(/^.*ownerYou\.textContent\s*=.*$/m) || [""])[0];
  if (!line) {
    console.error("⚠️  INDETERMINATE — cannot find the owner label assignment.");
    process.exit(2);
  }
  const iClock = line.search(/onClock|=== "clock"/);
  const iYou = line.search(/youActive/);
  if (iClock < 0) {
    fail.push("the left-column label does not branch on the clock state — a booked-but-not-due call reads as 'Waiting on the client' again");
  } else if (iYou >= 0 && iClock > iYou) {
    fail.push("the clock state is tested AFTER youActive in the label — the two-way answer wins and the third kind never renders");
  }
  // 🔴 And whatever it says, it must not claim a person owes something.
  const clockLabel = (line.match(/onClock\s*\?\s*"([^"]*)"/) || ["", ""])[1];
  if (clockLabel && /your action|waiting on the client|client action/i.test(clockLabel)) {
    fail.push(`the clock state's label still names a party: "${clockLabel}"`);
  }
  if (iClock >= 0 && !clockLabel) {
    fail.push("the clock branch does not resolve to a literal label this gate can read");
  }
}
// 🔴 The left column must stay DIMMED on the clock — marking it active would claim the operator has
// something to do, which is the opposite lie.
if (!/const onClock = turn === "clock"/.test(code)) {
  fail.push("`onClock` is gone — the renderer cannot distinguish the third kind");
}
if (/const youActive = turn === "clock"/.test(code)) {
  fail.push("the clock state is being treated as the operator's turn — it must stay dimmed");
}

if (fail.length) {
  console.error("🔴 a state that belongs to nobody is blaming somebody:");
  for (const f of fail) console.error("   · " + f);
  process.exit(1);
}
console.log(`✅ ${states.length} next-action states; every idle one is owned by the clock, and the renderer names that kind without blaming a party`);
