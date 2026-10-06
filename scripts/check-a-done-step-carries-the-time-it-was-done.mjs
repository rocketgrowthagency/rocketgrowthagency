#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// A DONE STEP CARRIES THE TIME IT WAS DONE — and a reopened one does not.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴🔴 WHAT WENT WRONG (measured on the live record, 2026-10-06):
//
//   m1.strategy.keywords_locations   status="done"   completed_at: ABSENT
//                                    started_at 20:41:42.620   ran_at 20:41:42.621
//
// Two separate defects in one task:
//
//   1. "Mark a step done" had TWO implementations. `markOnboardingStep` wrote
//      `{status, completed_at}`; `setClientTaskStatus` — the Done/Skip/Reset override on the client
//      rows — wrote `{status, updated_at}` and no completion stamp at all. Whichever control Chris
//      happened to press decided whether the record could answer "when was this approved?". The
//      same control's Reset left a stale `completed_at` on a step it had moved back to pending.
//
//   2. `started_at` was stamped when the run FINISHED, so duration was unrecoverable — and on the
//      heavy path the background re-entry overwrote the real queue-time start, which is how a
//      45-minute run came to record a 1ms one.
//
// 🔑 THE RULE LIVES AT THE MERGE. Both sides funnel every task write through `mergeTaskState`, so a
// future writer that sets `status: "done"` cannot reintroduce the shape by forgetting a field.
//
// → feedback_fix_the_class_not_the_instance · feedback_an_absence_must_never_be_readable_as_a_value
// → feedback_a_fix_without_a_gate_regresses · feedback_the_thing_that_died_cannot_tell_you_it_died
//
// Exit 0 healthy · 1 the product is wrong · 2 INDETERMINATE (could not tell)

import fs from "node:fs";
import vm from "node:vm";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const ADMIN = `${SITE}/admin/admin.js`;
const EXEC = `${SITE}/netlify/functions/flow-execute.js`;

const fails = [];
const F = (m) => fails.push(m);

function read(p, what) {
  try { return fs.readFileSync(p, "utf8"); }
  catch { console.error(`⚠️  INDETERMINATE — cannot read ${what} (${p})`); process.exit(2); }
}

// 🔴 LINE COMMENTS FIRST. A `/*` that only ever existed inside a `//` (a file glob, a regex example)
// otherwise opens a block scan that swallows the real code the gate is looking for.
// → feedback_a_comment_stripper_in_the_wrong_order_deletes_code
const decomment = (src) => src.replace(/^[ \t]*\/\/.*$/gm, " ").replace(/\/\*[\s\S]*?\*\//g, " ");

/** Brace-match a top-level `function NAME(...)` out of source. Returns "" if absent. */
function liftFunction(src, name) {
  const m = src.match(new RegExp("^function " + name + "\\s*\\(", "m"));
  if (!m) return "";
  const lp = src.indexOf("(", m.index);
  let pd = 0, afterParams = -1;
  for (let i = lp; i < src.length; i++) {
    if (src[i] === "(") pd++;
    else if (src[i] === ")") { pd--; if (!pd) { afterParams = i + 1; break; } }
  }
  if (afterParams < 0) return "";
  const open = src.indexOf("{", afterParams);
  if (open < 0) return "";
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") d++;
    else if (src[i] === "}") { d--; if (!d) return src.slice(m.index, i + 1); }
  }
  return "";
}

const adminSrc = read(ADMIN, "admin.js");
const execSrc = read(EXEC, "flow-execute.js");
const adminCode = decomment(adminSrc);
const execCode = decomment(execSrc);

// ───────────────────────────────────────────────────────────────────────────────────────────────────
// PART 1 — ONE PRODUCER, AND EVERY WRITER GOES THROUGH IT
//
// Pinned as a PROPERTY (no hand-merge of a task survives anywhere), not as a spelling of any one
// call site — a correct rewrite must not turn this gate red.
// → feedback_a_gate_must_pin_the_property_not_the_spelling
// ───────────────────────────────────────────────────────────────────────────────────────────────────
for (const [label, code] of [["admin.js", adminCode], ["flow-execute.js", execCode]]) {
  if (!/function mergeTaskState\s*\(/.test(code)) F(`${label}: no mergeTaskState — nothing owns the merged shape of a task`);

  // Any assignment into a tasks map that spreads a patch itself is a second shape.
  const handMerges = [...code.matchAll(/(?:^|[\s=({])(?:[\w.?\[\]]*tasks(?:\[[^\]]+\]|\.\w+))\s*=\s*\{[^;]*\.\.\.\s*patch/g)];
  if (handMerges.length) F(`${label}: ${handMerges.length} task write(s) still spread a patch by hand instead of calling mergeTaskState`);
}

// The override control must not assemble a task object of its own.
const scts = liftFunction(adminCode, "setClientTaskStatus") ||
  (adminCode.match(/async function setClientTaskStatus[\s\S]{0,2000}/) || [""])[0];
if (!scts) F("admin.js: setClientTaskStatus not found — the Done/Skip/Reset override is the writer that had no completion stamp");
else {
  if (!/mergeTaskState\s*\(/.test(scts)) F("admin.js: setClientTaskStatus does not go through mergeTaskState — the override can mark a step done with no completed_at again");
  if (/status:\s*newStatus[^}]*\}\s*\}\s*\}/.test(scts)) F("admin.js: setClientTaskStatus still builds the task object inline");
}

// ───────────────────────────────────────────────────────────────────────────────────────────────────
// PART 2 — THE MERGE BEHAVES, ON BOTH SIDES, AGAINST THE REAL LIFTED CODE
// ───────────────────────────────────────────────────────────────────────────────────────────────────
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const OLD = "2026-09-15T11:00:00.000Z";

const CASES = [
  { what: "done, nothing stamped yet → stamped",
    prev: { status: "in_progress" }, patch: { status: "done" },
    check: (r) => ISO.test(String(r.completed_at)) || "completed_at is not an ISO instant" },

  { what: "done again → the FIRST approval time survives (a re-run is not a re-approval)",
    prev: { status: "done", completed_at: OLD }, patch: { status: "done" },
    check: (r) => r.completed_at === OLD || `re-dated the approval to ${r.completed_at}` },

  { what: "declined → stamped (a terminal outcome is dated too)",
    prev: {}, patch: { status: "declined" },
    check: (r) => ISO.test(String(r.completed_at)) || "a declined step carries no time" },

  { what: "pending → the stamp is CLEARED (reopen is an undo)",
    prev: { status: "done", completed_at: OLD }, patch: { status: "pending" },
    check: (r) => r.completed_at === null || `kept ${JSON.stringify(r.completed_at)} on a reopened step` },

  { what: "in_progress → no completion time is invented",
    prev: {}, patch: { status: "in_progress", started_at: OLD },
    check: (r) => !r.completed_at || `invented completed_at ${r.completed_at} on a running step` },

  { what: "a patch with NO status leaves an existing stamp alone",
    prev: { status: "done", completed_at: OLD }, patch: { ran_at: OLD },
    check: (r) => r.completed_at === OLD || `a ran_at bump changed completed_at to ${JSON.stringify(r.completed_at)}` },

  { what: "a patch with NO status invents nothing",
    prev: { status: "pending" }, patch: { ran_at: OLD },
    check: (r) => !r.completed_at || `a ran_at bump invented completed_at ${r.completed_at}` },

  { what: "the patch still wins for every other field",
    prev: { status: "done", completed_at: OLD, error: "boom" }, patch: { status: "done", error: null },
    check: (r) => r.error === null || "the patch did not override an earlier field" },

  // 🔑 THE HEADLINE CASE IS THE REAL ONE. The live task, re-ticked through either control.
  { what: "THE LIVE SHAPE: m1.strategy.keywords_locations ticked done is answerable",
    prev: { status: "in_progress", started_at: "2026-10-06T20:41:42.620Z", ran_at: "2026-10-06T20:41:42.621Z" },
    patch: { status: "done", updated_at: "2026-10-06T21:07:00.000Z" },
    check: (r) => ISO.test(String(r.completed_at)) || "still no completed_at — the original defect" },
];

let ran = 0;
for (const [label, code] of [["admin.js", adminCode], ["flow-execute.js", execCode]]) {
  const lifted = liftFunction(code, "mergeTaskState");
  if (!lifted) { F(`${label}: could not lift mergeTaskState to run it`); continue; }
  let fn;
  try {
    const ctx = vm.createContext({});
    vm.runInContext(lifted + "\n;mergeTaskState", ctx);
    fn = vm.runInContext("mergeTaskState", ctx);
  } catch (e) {
    console.error(`⚠️  INDETERMINATE — ${label}'s mergeTaskState would not run in isolation: ${e.message}`);
    process.exit(2);
  }
  for (const c of CASES) {
    let r;
    try { r = fn(JSON.parse(JSON.stringify(c.prev)), JSON.parse(JSON.stringify(c.patch))); }
    catch (e) { F(`${label} · ${c.what}: threw ${e.message}`); continue; }
    if (!r || typeof r !== "object") { F(`${label} · ${c.what}: returned ${typeof r}, not a task`); continue; }
    const v = c.check(r);
    if (v !== true) F(`${label} · ${c.what}: ${v}`);
    ran++;
  }
  // The merge must not mutate the stored task in place — two in-memory copies of this row exist.
  const prev = { status: "in_progress" };
  try { fn(prev, { status: "done" }); } catch { /* reported above */ }
  if ("completed_at" in prev) F(`${label}: mergeTaskState mutated the task it was given`);
  ran++;
}

// ───────────────────────────────────────────────────────────────────────────────────────────────────
// PART 3 — started_at IS THE MOMENT THE WORK BEGAN
//
// The persist block ran `started_at: new Date()` AFTER awaiting the executor, so started_at and
// ran_at landed 1ms apart and the heavy path's real start was overwritten by its own re-entry.
// ───────────────────────────────────────────────────────────────────────────────────────────────────
const execIdx = execCode.search(/const\s+executor\s*=\s*EXECUTORS\s*\[/);
const awaitIdx = execCode.search(/await\s+executor\s*\(/);
const startDecl = execCode.search(/const\s+startedAt\s*=/);

if (awaitIdx < 0) F("flow-execute.js: no `await executor(` — cannot tell when a run begins");
else if (startDecl < 0) F("flow-execute.js: the start of a run is never captured before the work (no `const startedAt`)");
else if (startDecl > awaitIdx) F("flow-execute.js: the start stamp is taken AFTER the executor has run, so a run's duration is 0");

// The success persist must read that captured value, never the clock.
if (awaitIdx >= 0) {
  // Brace-match the `try { … }` the executor runs in, so the window is the real block and not a
  // character count. → feedback_a_gate_window_measured_in_characters_will_lie
  const tryOpen = execCode.lastIndexOf("{", awaitIdx);
  let d = 0, close = -1;
  for (let i = tryOpen; i < execCode.length; i++) {
    if (execCode[i] === "{") d++;
    else if (execCode[i] === "}") { d--; if (!d) { close = i; break; } }
  }
  const block = close > 0 ? execCode.slice(tryOpen, close) : "";
  if (!block) F("flow-execute.js: could not read the block the executor runs in");
  else {
    if (/started_at\s*:\s*new Date\s*\(/.test(block)) F("flow-execute.js: the success path stamps started_at from the clock — it must write the value captured before the run");
    if (!/started_at\s*:\s*startedAt/.test(block)) F("flow-execute.js: the success path does not record the captured start, so duration is unrecoverable");
    // The ternary that wrote EITHER completed_at OR started_at is what collapsed the pair.
    if (/\[\s*isDone\s*\?\s*["']completed_at["']\s*:\s*["']started_at["']\s*\]/.test(block))
      F("flow-execute.js: completed_at and started_at are still written by the same ternary key");
  }
}

// ───────────────────────────────────────────────────────────────────────────────────────────────────
if (fails.length) {
  console.error(`❌ A DONE STEP MUST CARRY THE TIME IT WAS DONE — ${fails.length} problem(s):\n`);
  for (const f of fails) console.error(`   · ${f}`);
  process.exit(1);
}
console.log(`✅ one producer owns a task's shape · ${ran} runtime cases on both sides · started_at is the real start`);
