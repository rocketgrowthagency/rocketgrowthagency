// check-a-settled-booking-corrects-every-sentence.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴🔴 WHY THIS EXISTS (2026-09-28)
//
// Chris, on a card whose pill read DONE and whose booking read "Confirmed":
//   "i asked you to update this and you still have not?"
// Under it: **CHOOSE A DATE AND TIME**, and "You are done when you tell us below — we cannot detect
// this one, so the step waits until you do."
//
// Both sentences WERE gated on `settled || _kickoffMine.get(clientId) === "booked"`, and the gate
// could never fire: the step list renders BEFORE the kickoff fetch resolves, so the map is empty and
// `undefined !== "booked"`. An ABSENCE was read as the value "not booked".
//
// 🔑 The correction happens in `markKickoffWaitingOnRga`, in place. So the only honest check is to
// RUN it against a DOM and read what it changed. A grep for the selectors proves nothing: the pill
// correction shipped with `.pm-step-instructions` and then `.how-lede`, both of which matched
// nothing, and both of which a grep would have called present.
// → feedback_a_gate_that_it_exists_is_not_a_gate_that_it_works · feedback_unloaded_is_not_an_answer
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const JS = path.join(SITE, "portal", "portal.js");
const CSS = path.join(SITE, "portal", "portal.css");

const pass = [], fail = [], indet = [];

if (!fs.existsSync(JS)) { console.error("⚠️  INDETERMINATE — portal.js not found."); process.exit(2); }
const code = fs.readFileSync(JS, "utf8");

// ── Extract the function under test, with its one module-level dependency. ──────────────────────
const fnAt = code.indexOf("function markKickoffWaitingOnRga(");
if (fnAt < 0) {
  console.error("🔴 FAIL — markKickoffWaitingOnRga() is gone; nothing corrects a settled booking in place.");
  process.exit(1);
}
let i = code.indexOf("{", fnAt), depth = 0, end = -1;
for (let j = i; j < code.length; j++) {
  if (code[j] === "{") depth++;
  else if (code[j] === "}") { depth--; if (!depth) { end = j + 1; break; } }
}
const fnSrc = code.slice(fnAt, end);

// ── A DOM small enough to read, shaped like the real card. ──────────────────────────────────────
function makeEl(cls, text) {
  return {
    className: cls, textContent: text, hidden: false, dataset: {},
    classList: {
      contains: (c) => (`${cls}`).split(/\s+/).includes(c),
      toggle() {},
    },
  };
}
function buildDom() {
  const pill = makeEl("pm-pill you", "Your turn");
  const lede = makeEl("pm-ask", "Pick a 30-minute slot below.");
  const doitH = makeEl("pm-doit-h", "Choose a date and time");
  const knowDone = makeEl("pm-knowdone", "You are done when …");
  const row = {
    classList: { toggle() {}, contains: () => false },
    querySelector: (sel) => {
      if (sel.includes("pm-pill")) return pill;
      if (sel.includes("pm-ask") || sel.includes("how-lede")) return lede;
      if (sel.includes("pm-doit-h")) return doitH;
      if (sel.includes("pm-knowdone")) return knowDone;
      return null;
    },
  };
  return { pill, lede, doitH, knowDone, row };
}

function run(status) {
  const dom = buildDom();
  const sandbox = {
    _kickoffMine: new Map(status ? [["c1", status]] : []),
    document: { querySelector: () => ({ closest: () => dom.row }) },
  };
  vm.createContext(sandbox);
  vm.runInContext(`${fnSrc}\nmarkKickoffWaitingOnRga("c1");`, sandbox, { timeout: 4000 });
  return dom;
}

// ── 1. A CONFIRMED BOOKING SETTLES EVERY SENTENCE ON THE CARD ───────────────────────────────────
let booked;
try { booked = run("booked"); }
catch (e) { console.error(`⚠️  INDETERMINATE — could not execute the correction: ${e.message}`); process.exit(2); }

const SURFACES = [
  ["the pill", () => booked.pill.textContent === "Done", () => `pill reads "${booked.pill.textContent}"`],
  ["the lede", () => /booked/i.test(booked.lede.textContent), () => `lede reads "${booked.lede.textContent}"`],
  ["the control heading", () => !/choose a date/i.test(booked.doitH.textContent),
    () => `heading still reads "${booked.doitH.textContent}" — it is telling them to pick a time they have picked`],
  ["the \"You are done when\" line", () => booked.knowDone.hidden === true,
    () => `the done-when block is still shown — it tells a settled step to wait on the client`],
];
for (const [what, ok, why] of SURFACES) {
  if (ok()) pass.push(`a confirmed booking settles ${what}`);
  else fail.push(`portal/portal.js — a CONFIRMED booking does not settle ${what}: ${why()}`);
}

// ── 2. AND A PENDING ONE LEAVES THEM ALONE (the mutation that matters in the other direction) ───
try {
  const waiting = run("requested");
  if (waiting.knowDone.hidden) fail.push("portal/portal.js — a REQUESTED booking hides the done-when line; the client is still waiting and needs it.");
  else pass.push("a requested booking keeps the done-when line");
  if (!/choose a date/i.test(waiting.doitH.textContent)) fail.push(`portal/portal.js — a REQUESTED booking changed the heading to "${waiting.doitH.textContent}"; they still have to pick.`);
  else pass.push("a requested booking keeps its heading");
} catch (e) { indet.push(`could not execute the pending case: ${e.message}`); }

// ── 3. THE HIDE MUST ACTUALLY HIDE ─────────────────────────────────────────────────────────────
// 🔴 `.pm-knowdone{display:block}` is an AUTHOR rule and beats the UA's `[hidden]{display:none}`,
// so `el.hidden = true` alone is a silent no-op that looks exactly like a shipped fix.
if (!fs.existsSync(CSS)) indet.push("portal.css not found; cannot verify the hide takes effect");
else {
  const css = fs.readFileSync(CSS, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  if (/\.pm-knowdone\[hidden\]\s*\{[^}]*display\s*:\s*none/.test(css)) pass.push("`hidden` on the done-when block actually hides it");
  else fail.push("portal/portal.css — `.pm-knowdone` sets `display:block` with no `[hidden]` rule, so hiding it does nothing.");
}

for (const p of pass) console.log(`  ✅ ${p}`);
for (const d of indet) console.log(`  ▫️  ${d}`);
if (fail.length) {
  console.error(`\n🔴 FAIL — ${fail.length} sentence(s) on a settled booking still ask for something:`);
  for (const f of fail) console.error(`   • ${f}`);
  process.exit(1);
}
if (indet.length && !pass.length) process.exit(2);
console.log(`\n✅ a confirmed booking settles every sentence on the card (${pass.length} checks).`);
