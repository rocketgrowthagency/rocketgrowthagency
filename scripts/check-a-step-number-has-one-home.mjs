#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — THE NUMBER A STEP IS CALLED BY HAS ONE HOME
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-10-02, on a screenshot of the running toast sitting over the card it names:
 *   "the top confrimation card shows step #23 … but the actual card number now is 26."
 *
 * Two honest counts. The CARD numbers the PAGE (obPageNumbers, which follows the audit rollup's
 * reordering). Every other surface counted the raw playbook array — `findIndex(...) + 1` — and the
 * rollup moves the automated checks ahead of the human ones, so the two drifted by exactly the
 * size of that reordering. The toast said 23, the row said 26, and both were "right".
 *
 * This holds three things:
 *   1 · the wiring — nothing derives a month-1 step number from a raw array index any more;
 *   2 · the numbering itself — 1..N, contiguous, no gaps and no number used twice;
 *   3 · every HARDCODED "step N" in a user-facing string, checked against the real page number.
 *       A new one that is not registered FAILS, so this cannot silently fall behind.
 *
 * 🔑 The numbering is recomputed by running the REAL obBuckets / obPageOrdered / obPageNumbers out
 * of admin.js over the REAL playbooks.json — not by re-implementing the rule here, which wouldonly ever 
 * agree with itself. → feedback_a_gate_that_cannot_fail
 *
 * Exit 0 pass · 1 a surface names a number the page does not show · 2 could not run.
 */
import fs from "node:fs";
import vm from "node:vm";

const W = "/Users/chris/RGA/Rocket Growth Agency Website VS Code/";
let src, playbooks;
try {
  src = fs.readFileSync(W + "admin/admin.js", "utf8");
  playbooks = JSON.parse(fs.readFileSync(W + "data/playbooks/playbooks.json", "utf8"));
} catch (e) { console.error("⛔ cannot read admin.js / playbooks.json: " + e.message); process.exit(2); }

const fail = [];

// ═══ PART 1 — THE WIRING ══════════════════════════════════════════════════════════════════════
if (!/function obNumberOf\(/.test(src)) fail.push("obNumberOf is gone — there is no single home for a step's number");
// stepLabel must resolve through the producer, not through its own index
const sl = src.slice(src.indexOf("function stepLabel("), src.indexOf("function stepLabel(") + 1200);
if (!/obNumberOf\(/.test(sl)) fail.push("stepLabel no longer resolves its number through obNumberOf");
if (/`step \$\{i \+ 1\}/.test(sl)) fail.push("stepLabel is back to numbering by raw playbook index (`step ${i + 1}`)");
// the next-action card must use the same page map the rows use
if (/`Step \$\{idx \+ 1\} ·/.test(src)) fail.push("the next-action card title is back to `Step ${idx + 1}`");
if (/`Go to step \$\{idx \+ 1\}/.test(src)) fail.push("the next-action button is back to `Go to step ${idx + 1}`");
if (!/obPageNumbers\(steps\)\.get\(idx\)/.test(src)) fail.push("the next-action card no longer reads obPageNumbers for its number");
// 🔴 Not-found must not read as 1. → feedback_an_absence_must_never_be_readable_as_a_value
if (!/if \(i < 0\) return null;/.test(src)) fail.push("obNumberOf no longer returns null for a step it cannot find");

// ═══ PART 2 — THE NUMBERING, from the real functions over the real playbook ═══════════════════
const pick = (name) => {
  const i = src.indexOf(`function ${name}(`);
  if (i < 0) { console.error(`⛔ ${name} not found`); process.exit(2); }
  let d = 0;
  for (let k = src.indexOf("{", i); k < src.length; k++) {
    if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) return src.slice(i, k + 1); }
  }
  console.error(`⛔ ${name} unbalanced`); process.exit(2);
};
const block = (startRe, name) => {
  const m = src.match(startRe);
  if (!m) { console.error(`⛔ ${name} not found`); process.exit(2); }
  const i = m.index;
  // read to the matching close bracket of the array/arrow literal
  let d = 0, started = false;
  for (let k = i; k < src.length; k++) {
    const c = src[k];
    if (c === "[" || c === "(") { d++; started = true; }
    else if (c === "]" || c === ")") { d--; if (started && !d) return src.slice(i, src.indexOf(";", k) + 1); }
  }
  console.error(`⛔ ${name} unbalanced`); process.exit(2);
};

const ctx = vm.createContext({ console });
try {
  vm.runInContext(
    block(/const OB_PHASES = \[/, "OB_PHASES") + "\n" +
    src.split("\n").filter((l) => /^const obGroupOf =/.test(l)).join("\n") + "\n" +
    // 🔴 `obPhaseIndexOf` ADDED 2026-10-05 — `obBuckets` began calling it, and this lift did not
    // bring it. The gate then THREW at CALL time, which the try/catch around the eval cannot
    // see, so it crashed with a stack trace instead of reporting anything. A lifted function is
    // a claim that its whole DEPENDENCY SET came too.
    // → feedback_a_gate_that_throws_is_not_a_gate_that_fails · feedback_the_harness_i_wrote_to_check_my_work_can_lie
    ["obDependsOn", "obPhaseIndexOf", "obBuckets", "obRespectDeps", "obPageOrdered", "obPageNumbers"].map(pick).join("\n\n"),
    ctx,
  );
} catch (e) { console.error("⛔ cannot evaluate the numbering functions: " + e.message); process.exit(2); }

const m1 = playbooks.month1;
if (!Array.isArray(m1) || !m1.length) { console.error("⛔ playbooks.json has no month1 array"); process.exit(2); }
// 🔑 The MINIMUM shape obBuckets/obPageOrdered actually read: the flow id and the SOP type.
const steps = m1.map((s) => ({ obj: { flowId: s.id, sopType: s.type }, dependsOn: s.dependsOn || [] }));
const pageNo = vm.runInContext("obPageNumbers", ctx)(steps);
const vmOrder = () => vm.runInContext("obPageOrdered", ctx)(steps);

const nums = m1.map((_, i) => pageNo.get(i));
if (nums.some((n) => !n)) fail.push(`${nums.filter((n) => !n).length} step(s) got no page number at all`);
const sorted = [...nums].filter(Boolean).sort((a, b) => a - b);
for (let i = 0; i < sorted.length; i++) {
  if (sorted[i] !== i + 1) { fail.push(`the numbering is not 1..${m1.length} — expected ${i + 1} at position ${i}, got ${sorted[i]}`); break; }
}
const byId = new Map(m1.map((s, i) => [s.id, pageNo.get(i)]));

// ═══ PART 2b — THE PAGE MAY REGROUP, BUT NEVER PAST A DEPENDENCY ═════════════════════════════
// Chris, 2026-10-02: *"how can we run snapshot and geo grid before we have keywords?"* He was
// right — `m1.audit.grid_baseline` DECLARES `dependsOn: ['m1.strategy.keywords_locations']`, and the
// phase grouping rendered the baseline at 22 and the keywords at 26, so the grid scanned
// `primary_service` instead of the planned keywords. Two pairs were backwards across all 61 steps.
// 🔑 This is the rule that makes the number mean "do this next".
{
  const order = vmOrder();
  const at = new Map();
  order.forEach((i, k) => at.set(m1[i].id, k));
  const backwards = [];
  for (const s of m1) {
    for (const d of (s.dependsOn || [])) {
      if (!at.has(d)) continue;                       // not in this scope — not ours to order
      if (at.get(d) > at.get(s.id)) backwards.push(`${s.id} (#${byId.get(s.id)}) needs ${d} (#${byId.get(d)})`);
    }
  }
  for (const b2 of backwards) fail.push(`a dependency renders BACKWARDS: ${b2}`);
  // 🔴 And the repair must never drop or duplicate a row.
  if (order.length !== m1.length) fail.push(`the page order emits ${order.length} of ${m1.length} steps`);
  if (new Set(order).size !== order.length) fail.push("the page order repeats a step");

  // 🔴 A CYCLE MUST NOT SWALLOW ROWS. The real playbook has none, so the fallback that keeps
  // unresolvable steps is otherwise never exercised — and untested defensive code is a claim.
  // A mis-ordered row is recoverable; a row that vanishes from the checklist is not.
  // → feedback_an_absence_must_never_be_readable_as_a_value
  const cyc = [
    { obj: { flowId: "a", sopType: "auto" }, dependsOn: ["b"] },
    { obj: { flowId: "b", sopType: "auto" }, dependsOn: ["a"] },
    { obj: { flowId: "c", sopType: "auto" }, dependsOn: [] },
  ];
  const repaired = vm.runInContext("obRespectDeps", ctx)(cyc, [0, 1, 2]);
  if (repaired.length !== 3 || new Set(repaired).size !== 3) {
    fail.push(`a dependency cycle loses rows — obRespectDeps returned ${JSON.stringify(repaired)} for 3 steps`);
  }
}

// ═══ PART 2c — "ACTIVE" IS THE FIRST UNFINISHED ROW AS DISPLAYED ═════════════════════════════
// Chris: *"why does step 23 show next but weve already completed 24 and 25 and now on 26?"* The
// number came from the page order while the active step was picked by walking the RAW playbook
// array, so a lower-numbered row sat above the active one wearing "Up next".
if (!/const visit = scope === "month1" \? obPageOrdered\(steps\) : steps\.map/.test(src)) {
  fail.push("the active step is no longer chosen by walking the ORDER THE PAGE EMITS — a queued row can sit above it again");
}
if (/let seenActive = false;\s*\n\s*steps\.forEach/.test(src)) {
  fail.push("the sequencer is back to walking the raw playbook array");
}
// 🔴 and the dependency guard must still run BEFORE the active pick, or display order could
// promote a step whose dependencies are unmet.
{
  const i2 = src.indexOf("const visit = scope ===");
  const guard = src.lastIndexOf("s.locked || s.blocked", i2 + 900);
  if (guard < i2) fail.push("the locked/blocked guard no longer precedes the active pick");
}

// ═══ PART 3 — EVERY HARDCODED "step N" IN A USER-FACING STRING ═══════════════════════════════
// 🔴 An unregistered occurrence FAILS. Registering one is a decision someone makes on purpose.
const REGISTRY = [
  // file match-substring → the step whose number it claims
  { file: "admin/admin.js",                            needle: "Step 2 reopens",                      step: "m1.close.kickoff_invite" },
  { file: "admin/admin.js",                            needle: "Step 2 already put it on",            step: "m1.close.kickoff_invite" },
  { file: "admin/admin.js",                            needle: "ob-context warn",                     step: "m1.close.kickoff_invite" },
  { file: "netlify/functions/cancel-kickoff-invite.js", needle: "open again",                          step: "m1.close.kickoff_invite" },
  { file: "netlify/functions/kickoff-rsvp-check.js",    needle: "kickoff invite",                      step: "m1.close.kickoff_invite" },
  { file: "netlify/functions/flow-execute.js",          needle: "deep assessment (step",               step: "m1.audit.deep_assess" },
];
// 🔑 The client portal has its OWN sequence on purpose — `clientStepNo` / SETUP_STEP_COPY. A client
// sees eight steps, not sixty-one, and must never be told "step 26 of 61".
// → project_admin_portal_data_boundary
const EXEMPT_FILES = new Set(["portal/portal.js"]);

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n").map((l) => l.replace(/^\s*\/\/.*$/, "").replace(/\s\/\/\s.*$/, "")).join("\n");

const files = ["admin/admin.js", "portal/portal.js",
  ...fs.readdirSync(W + "netlify/functions").filter((f) => f.endsWith(".js")).map((f) => "netlify/functions/" + f)];
const RE = /\b[Ss]tep\s*#?\s*(\d{1,2})\b/g;
let checked = 0;
for (const f of files) {
  if (EXEMPT_FILES.has(f)) continue;
  const lines = stripComments(fs.readFileSync(W + f, "utf8")).split("\n");
  lines.forEach((l, i) => {
    for (const m of l.matchAll(RE)) {
      const hits = REGISTRY.filter((r) => r.file === f && l.includes(r.needle));
      if (!hits.length) {
        fail.push(`${f}:${i + 1} names "step ${m[1]}" and is not registered — register it against a step id or drop the number: ${l.trim().slice(0, 70)}`);
        return;
      }
      const want = byId.get(hits[0].step);
      checked++;
      if (want == null) fail.push(`${f}:${i + 1} is registered against ${hits[0].step}, which is not in month1 any more`);
      else if (Number(m[1]) !== want) {
        fail.push(`${f}:${i + 1} says "step ${m[1]}" but ${hits[0].step} is step ${want} on the page`);
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE TWO MECHANISMS ARE REDUNDANT ON THE REAL SOP, SO THE PAGE ORDER ALONE CANNOT TEST EITHER.
// Measured 2026-10-05: breaking the phase promotion OR the within-phase sort, one at a time, left
// the rendered order correct — only breaking the shared `obDependsOn` reader failed. A gate that
// only catches the combined failure lets half the fix regress silently.
// 🔑 So each mechanism is also exercised DIRECTLY, on a shape built to need exactly that one.
// → feedback_a_gate_that_cannot_fail
// ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  const phaseIndexOf = vm.runInContext("obPhaseIndexOf", ctx);
  const respectDeps = vm.runInContext("obRespectDeps", ctx);

  // Two steps in DIFFERENT phases, the earlier one depending on the later: only promotion can fix it.
  const groups = m1.map((x) => x.id);
  const early = groups.find((id) => /^m1\.(audit|strategy)\./.test(id)) || groups[0];
  const late = [...groups].reverse().find((id) => id !== early);
  const promo = [
    { obj: { flowId: early, sopType: "auto" }, dependsOn: [late] },
    { obj: { flowId: late, sopType: "auto" }, dependsOn: [] },
  ];
  const idx = phaseIndexOf(promo);
  if (!Array.isArray(idx) || idx.length !== 2) {
    fail.push("obPhaseIndexOf did not return a phase per step");
  } else if (idx[0] < idx[1]) {
    fail.push(`obPhaseIndexOf no longer promotes a step to its dependency's phase (${early} landed in `
      + `phase ${idx[0]}, but it needs ${late} in phase ${idx[1]}) — a step would render before the `
      + `thing it needs`);
  }

  // Two steps in the SAME bucket, the first depending on the second: only the within-phase sort fixes it.
  const a = groups[0], b = groups[1];
  const sameBucket = [
    { obj: { flowId: a, sopType: "auto" }, dependsOn: [b] },
    { obj: { flowId: b, sopType: "auto" }, dependsOn: [] },
  ];
  const ordered = respectDeps(sameBucket, [0, 1]);
  if (!Array.isArray(ordered) || ordered.length !== 2) {
    fail.push("obRespectDeps did not return the indices it was given");
  } else if (ordered[0] !== 1) {
    fail.push(`obRespectDeps no longer reorders within a phase (${a} still renders before ${b}, which `
      + `it depends on)`);
  }
}

if (fail.length) {
  console.error("🔴 a step number does not match the page:");
  for (const f of fail) console.error("   · " + f);
  process.exit(1);
}
console.log(`✅ one home for a step's number — ${m1.length} steps numbered 1..${m1.length}, ${checked} hardcoded reference(s) agree with the page`);
