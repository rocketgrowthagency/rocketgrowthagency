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
const re = /owner:\s*"(you|client|clock|unknown)"/g;
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
for (const kind of ["clock", "unknown"]) {
  if (!new RegExp(`"${kind}"`).test(code) || !/\[\s*"client",\s*"you",\s*"clock",\s*"unknown"\s*\]\.includes\(data\.admin\.owner\)/.test(code)) {
    fail.push(`the turn resolver no longer accepts \`${kind}\` — such a state would fall back to the stage's guess and be blamed on somebody`);
  }
}

// ── 3b · A STATE THAT HAS NOT LOADED MUST NOT CLAIM A TURN ──────────────────────────────────────
// 🔴 The loading and failure branches carried NO `owner`, so they inherited the stage default
// (`you` for onboarding) and the card read **● YOUR ACTION** above "Loading the onboarding
// checklist…" — and above "Onboarding checklist unavailable", blaming the operator for a fetch that
// never came back. → feedback_unloaded_is_not_an_answer
{
  const NOT_LOADED = /Loading the onboarding checklist|checklist unavailable/i;
  for (const st of states) {
    if (NOT_LOADED.test(st.title) && st.owner !== "unknown") {
      fail.push(`a not-loaded state is owned by "${st.owner}" — the card claims whose turn it is `
        + `before anything has told it: "${st.title}"`);
    }
  }
  // and both of those branches must still EXIST as owned states at all
  const notLoaded = states.filter((st) => NOT_LOADED.test(st.title));
  if (notLoaded.length < 2) {
    fail.push(`only ${notLoaded.length} of the 2 not-loaded states carry an owner — one of them is `
      + `inheriting the stage's guess again`);
  }
}
{
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 RE-PINNED 2026-10-05 — this tested the SPELLING of a ternary
  // (`onClock ? "On the calendar" : …`). A fourth kind arrived and the ternary was correctly
  // replaced by a kind + a label MAP, which is strictly better — one expression decides the label
  // and the class together, so they cannot drift. The gate read the improvement as a deletion.
  //
  // 🔑 THE PROPERTY IS: every kind resolves to a label, and no kind that belongs to nobody carries
  // a label naming a party. → feedback_a_gate_must_pin_the_property_not_the_spelling
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const map = (code.match(/const YOU_LABEL\s*=\s*\{[\s\S]*?\n\s*\};/) || [""])[0];
  if (!map) {
    console.error("⚠️  INDETERMINATE — cannot find the left pill's label map.");
    process.exit(2);
  }
  const labelFor = (kind) => {
    const m = map.match(new RegExp(`${kind}:\\s*(?:data\\.admin\\.ownerLabel\\s*\\|\\|\\s*)?"([^"]*)"`));
    return m ? m[1] : null;
  };
  for (const kind of ["settled", "unknown", "active", "waiting"]) {
    if (labelFor(kind) === null) fail.push(`the pill's label map has no entry for "${kind}" — it would render undefined`);
  }
  // 🔴 A kind that belongs to NOBODY must not name a party in its label.
  for (const kind of ["settled", "unknown"]) {
    const lab = labelFor(kind);
    if (lab && /your action|waiting on the client|client action/i.test(lab)) {
      fail.push(`the "${kind}" kind's label still names a party: "${lab}"`);
    }
  }
  // 🔑 ONE EXPRESSION DECIDES BOTH the label and the class. Two separate ternaries is how a pill
  // ends up reading "● Client action" while styled as the dimmed, inactive one.
  if (!/const youKind\s*=/.test(code)) {
    fail.push("the pill's kind is no longer decided in one place — label and class can drift apart");
  }
  if (!/ownerYou\.className\s*=\s*"admin-turn-owner "\s*\+\s*youKind/.test(code)) {
    fail.push("the left pill's class is not derived from the same kind as its label");
  }
  if (!/ownerYou\.textContent\s*=\s*YOU_LABEL\[youKind\]/.test(code)) {
    fail.push("the left pill's label is not derived from the same kind as its class");
  }
  // 🔴 And the kind itself must test the no-party kinds BEFORE the binary, or they never render.
  const kindLine = (code.match(/^.*const youKind\s*=.*$/m) || [""])[0];
  const iNoParty = Math.min(...["unknownTurn", "onClock"].map((t) => {
    const i = kindLine.indexOf(t); return i < 0 ? Infinity : i;
  }));
  const iYou = kindLine.indexOf("youActive");
  if (!Number.isFinite(iNoParty)) {
    fail.push("the pill kind does not consider the clock/unknown states — they would render as somebody's turn");
  } else if (iYou >= 0 && iNoParty > iYou) {
    fail.push("the no-party kinds are tested AFTER youActive — the binary answer wins and they never render");
  }
  const css = (() => {
    try { return fs.readFileSync(`${SITE}/admin/admin.css`, "utf8"); } catch { return ""; }
  })();
  for (const kind of ["settled", "unknown"]) {
    if (css && !new RegExp(`\\.admin-turn-owner\\.${kind}\\s*\\{`).test(css)) {
      fail.push(`\`.admin-turn-owner.${kind}\` is not defined — the pill would render unstyled`);
    }
  }
}
// 🔴 The left column must stay DIMMED on the clock — marking it active would claim the operator has
// something to do, which is the opposite lie.
if (!/const onClock = turn === "clock"/.test(code)) {
  fail.push("`onClock` is gone — the renderer cannot distinguish the third kind");
}
if (/const youActive = turn === "clock"/.test(code)) {
  fail.push("the clock state is being treated as the operator's turn");
}

// ── 4 · SETTLED IS NOT IDLE — THE COLUMN MUST STAY LEGIBLE ──────────────────────────────────────
// 🔴 The first version of this fix reused `is-waiting` for the clock. That class is opacity:0.55 on
// the WHOLE column, so the booked date — the single most useful thing on the card — rendered grey
// above a button that looked switched off. Chris sent back a screenshot of a card that appeared
// disabled. Dimming means "somebody else is holding this up", NOT "there is nothing to click".
// → feedback_a_booked_call_is_waiting_on_the_clock_not_on_a_person
{
  const line = (code.match(/^.*colYou\.classList\.toggle\("is-waiting".*$/m) || [""])[0];
  if (!line) {
    console.error("⚠️  INDETERMINATE — cannot find the left column's dim toggle.");
    process.exit(2);
  }
  if (!/noParty|onClock/.test(line)) {
    fail.push("the left column is dimmed without excluding the clock state — a settled, booked fact "
      + "would render at opacity 0.55, so the date reads as disabled");
  }
  // And the pill must have its own kind, not borrow the grey "somebody else has it" one.
  // 🔑 ONE EXPRESSION DECIDES BOTH the label and the class. Two separate ternaries is how a pill
  // ends up reading "● Client action" while styled as the dimmed, inactive one.
  if (!/const youKind\s*=/.test(code)) {
    fail.push("the pill's kind is no longer decided in one place — label and class can drift apart");
  }
  if (!/ownerYou\.className\s*=\s*"admin-turn-owner "\s*\+\s*youKind/.test(code)) {
    fail.push("the left pill's class is not derived from the same kind as its label");
  }
  if (!/ownerYou\.textContent\s*=\s*YOU_LABEL\[youKind\]/.test(code)) {
    fail.push("the left pill's label is not derived from the same kind as its class");
  }
  const css = (() => {
    try { return fs.readFileSync(`${SITE}/admin/admin.css`, "utf8"); } catch { return ""; }
  })();
  for (const kind of ["settled", "unknown"]) {
    if (css && !new RegExp(`\\.admin-turn-owner\\.${kind}\\s*\\{`).test(css)) {
      fail.push(`\`.admin-turn-owner.${kind}\` is not defined — the pill would render unstyled`);
    }
  }
}

if (fail.length) {
  console.error("🔴 a state that belongs to nobody is blaming somebody:");
  for (const f of fail) console.error("   · " + f);
  process.exit(1);
}
console.log(`✅ ${states.length} next-action states; every idle one is owned by the clock, and the renderer names that kind without blaming a party`);
