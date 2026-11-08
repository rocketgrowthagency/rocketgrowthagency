#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// A STEP WHOSE COMPLETION IS *DETECTED* IS NEVER FINISHED BY PRESSING RUN
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴🔴 MEASURED ON THE LIVE RECORD, 2026-10-07. Running step 31 to produce a photo shot list set
// "Upload 20+ quality photos" to **done with 0 of 20 photos uploaded**. The checklist then told Chris
// the client had done something they had not, and the detection that exists to decide it — count
// `client_photos`, require 20 — was bypassed entirely.
//
// The cause is one clause:
//
//     const isDone = runnerCompleted || !isHybrid;      // "not hybrid" meant "finished"
//
// A `manual` step with a runner drafts a PLAN. Drafting the plan is not doing the work. Nine steps
// declare `clientDone: "detected"` and every one is about something observable in the world: a GA4
// grant, a GSC grant, a verified GBP, twenty photos, five reviews.
//
// 🔑 A RUNNER THAT GENUINELY FINISHES SUCH A STEP CAN STILL SAY SO with `completed: true` — a claim
// about THIS RUN rather than about the step's type. Both directions are checked below, because
// removing that would make a step that really does finish itself impossible to finish, and this
// codebase has already had that defect (step 1's confirmation email, 2026-09-09).
//
// 🔴🔴 IT DOES NOT GREP FOR THE RULE — IT RUNS IT. The first draft asserted `/isDetected/` appeared
// in the decision, which is a claim about the SPELLING, not the behavior: renaming the flag to a
// property playbooks.json never sets would have passed. This lifts the four real assignment lines
// and evaluates them against every real step definition.
// → feedback_a_gate_must_pin_the_property_not_the_spelling · feedback_a_symbol_name_is_a_claim_about_the_codebase
//
// Exit 0 healthy · 1 the product is wrong · 2 INDETERMINATE

import fs from "node:fs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const fails = [];
const F = (m) => fails.push(m);

const read = (rel, what) => {
  try { return fs.readFileSync(`${SITE}/${rel}`, "utf8"); }
  catch { console.error(`⚠️  INDETERMINATE — cannot read ${what}`); process.exit(2); }
};

const exec = read("netlify/functions/flow-execute.js", "flow-execute.js");
let pb;
try { pb = JSON.parse(read("data/playbooks/playbooks.json", "playbooks.json")); }
catch { console.error("⚠️  INDETERMINATE — playbooks.json does not parse"); process.exit(2); }

// ═══ LIFT THE REAL DECISION ══════════════════════════════════════════════════════════════════
// 🔑 Each line is taken verbatim from the shipping source. If one cannot be found the gate says
// INDETERMINATE and asks to be re-read — it never guesses what the rule has become.
const lift = (name) => {
  const re = new RegExp(`^\\s*const ${name} = ([^;]+);`, "m");
  const m = re.exec(exec);
  if (!m) {
    console.error(`⚠️  INDETERMINATE — cannot find \`const ${name}\` in flow-execute.js.`);
    console.error("   The done decision has been restructured; re-read it and update this gate.");
    process.exit(2);
  }
  return m[1].replace(/\s+/g, " ").trim();
};
const parts = ["isHybrid", "isDetected", "runnerCompleted", "isDone"].map((n) => [n, lift(n)]);
// 🔴 10-19: the VETO line before the decision — a run that measured nothing (indeterminate / error) is not done. Lifted
// verbatim too; without it the decision below would be tested without the line that changes its answer.
const vetoM = /^\s*(if \(result && \(result\.outcome[^\n]*result\.completed = false;)$/m.exec(exec);
if (!vetoM) { console.error("⚠️  INDETERMINATE — the measured-nothing veto (`if (result && (result.outcome === \"indeterminate\" …) result.completed = false;`) is not in flow-execute.js; re-read the decision."); process.exit(2); }
// 🔒 10-19: and the DRAFT line — a run that only drafted (aiDraft called, nothing finished or measured) stays open.
const draftM = /^\s*(if \(result && DRAFT_CALLS[^\n]*)$/m.exec(exec);
if (!draftM) { console.error("⚠️  INDETERMINATE — the draft-never-completes line (`if (result && DRAFT_CALLS > 0 …`) is not in flow-execute.js; re-read the decision."); process.exit(2); }
// 🔒 11-8: "already right" finishes a step, but only a WEBSITE step (its own gates cover it); for the steps here it stays null. Pinned, not assumed.
if (!/let noChangeNeeded = null;\s*\n\s*if \(result && SiteChange\.isSiteChangeStep\(step_id\) && !is_monthly\) \{/.test(exec)) { console.error("⚠️  INDETERMINATE — noChangeNeeded is no longer set only for a website step; re-read the decision."); process.exit(2); }
const body = "const noChangeNeeded = null;\n" + vetoM[1] + "\n" + draftM[1] + "\n" + parts.map(([n, e]) => `const ${n} = ${e};`).join("\n") + "\nreturn isDone;";

let decide;
try { const _d = new Function("stepDef", "result", "DRAFT_CALLS", body); decide = (sd, r, n = 0) => _d(sd, r, n); }
catch (e) {
  console.error(`⚠️  INDETERMINATE — the lifted decision does not compile: ${e.message}`);
  process.exit(2);
}
const decision = parts.find(([n]) => n === "isDone")[1];

// ═══ RUN IT AGAINST EVERY REAL STEP ══════════════════════════════════════════════════════════
const steps = [...(pb.month1 || []), ...(pb.month2plus || [])];
if (!steps.length) { console.error("⚠️  INDETERMINATE — no steps in playbooks.json"); process.exit(2); }

const detected = steps.filter((s) => s.clientDone === "detected");
if (!detected.length) {
  console.error("⚠️  INDETERMINATE — no step declares clientDone: \"detected\".");
  console.error("   Either the key was renamed or detection was removed; this gate guards nothing until it is re-read.");
  process.exit(2);
}
// the defect only bites a detected step that ALSO has a runner to press
const exposed = detected.filter((s) => s.hasRunner && s.type !== "hybrid");

// 1 — pressing Run must NOT finish a detected step. `result` is what a runner that drafted a plan
//     returns: output, no claim of completion.
const draft = { ok: true, summary: "a plan was drafted" };
for (const s of exposed) {
  let got;
  try { got = decide(s, draft); }
  catch (e) { F(`the decision throws on ${s.id}: ${e.message}`); continue; }
  if (got === true) {
    F(`pressing Run marks ${s.id} ("${s.title}") DONE, but its completion is DETECTED `
      + "— this is how step 31 came to say done with 0 of 20 photos");
  }
}

// 2 — a runner that really finished the job must still be able to say so.
for (const s of exposed.slice(0, 1)) {
  if (decide(s, { ok: true, completed: true }) !== true) {
    F(`a runner reporting \`completed: true\` no longer finishes ${s.id} — a step that genuinely `
      + "completes itself would be impossible to complete (step 1's confirmation email, 2026-09-09)");
  }
}

// 3 — and an ordinary automated step must still finish on its own, or nothing would ever complete.
const plain = steps.filter((s) => s.hasRunner && s.type !== "hybrid" && s.clientDone !== "detected");
for (const s of plain.slice(0, 1)) {
  if (decide(s, draft) !== true) {
    F(`${s.id} ("${s.title}") is a plain automated step and no longer finishes when its runner `
      + "succeeds — the rule has over-corrected and now nothing completes");
  }
}

// 4 — a run that MEASURED NOTHING is not done (10-19: steps 10, 12, 13, 17 read finished on a failed run).
for (const s of plain.slice(0, 1)) {
  for (const outcome of ["indeterminate", "error", "manual_required"]) {
    if (decide(s, { ok: true, summary: "Nothing was measured; this step is NOT complete.", outcome }) !== false) {
      F(`${s.id}: a run that returned \`outcome: "${outcome}"\` is recorded DONE — a failed measurement reads as finished work`);
    }
  }
  if (decide(s, { ok: true, outcome: "indeterminate", completed: true }) !== true) F(`${s.id}: a runner's own \`completed: true\` no longer wins over an indeterminate outcome`);
  if (decide(s, { ok: true, outcome: "ok" }) !== true) F(`${s.id}: a measured run no longer finishes a plain step`);
}

// 5 — a runner that couldn't START (no website, no Google location linked) says so with an outcome, so §4 keeps it open.
//     10-19: eight `return { summary: "No website_url" }` returns had none, and read DONE on Monthly steps 20/21 etc.
{
  const bare = exec.split("\n").map((l, i) => [l, i + 1]).filter(([l]) => /return \{ summary: "No [^"]*" \}/.test(l));
  for (const [l, n] of bare) F(`flow-execute.js:${n} — a runner that couldn't run returns no outcome, so it's recorded DONE: ${l.trim().slice(0, 90)}`);
}

// 6 — A DRAFT NEVER COMPLETES A STEP (10-19, approved build all): drafted + nothing finished or measured → open, "draft_ready".
for (const s of plain.slice(0, 1)) {
  const r = { ok: true, summary: "a GBP description draft" };
  if (decide(s, r, 1) !== false || r.outcome !== "draft_ready") F(`${s.id}: a run that only DRAFTED is recorded done (or not marked draft_ready) — drafting a description isn't publishing it`);
  if (decide(s, { ok: true, outcome: "verified", summary: "measured + drafted" }, 1) !== true) F(`${s.id}: a run that MEASURED and drafted no longer finishes`);
  if (decide(s, { ok: true, completed: true }, 2) !== true) F(`${s.id}: a runner's own completed:true no longer wins over a draft`);
  if (decide(s, { ok: true, summary: "measured, no AI" }, 0) !== true) F(`${s.id}: a plain run with no draft no longer finishes`);
}
if (!/\n\s*DRAFT_CALLS = 0;\n\s*const result = await executor\(/.test(exec)) F("the draft counter isn't reset right before the executor runs — one run's drafts would leak into the next");
if (!/async function aiDraft\([^)]*\) \{\n\s*DRAFT_CALLS\+\+;/.test(exec)) F("aiDraft doesn't count itself — the draft rule can't fire");

console.log(`  decision: isDone = ${decision}`);
console.log(`  evaluated against ${steps.length} real step definitions · ${detected.length} detected `
  + `· ${exposed.length} detected WITH a Run button · ${plain.length} plain automated`);

if (fails.length) {
  console.error("🔴 a step can claim work that has not happened:");
  for (const f of fails) console.error("   · " + f);
  process.exit(1);
}
console.log(`✅ a detected step is never finished by running it — all ${exposed.length} runnable detected step(s) stay open, `
  + "a runner's own `completed: true` still wins, and plain automated steps still finish");
