#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// AN ACTIVE STEP CARD SAYS WHAT FINISHES IT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴🔴 WHAT WENT WRONG (Chris, 2026-10-07, on step 22 after pressing Run). *"After it ran it's still
// orange and active. Should it not switch to green and done?"*
//
// It should not. `m1.audit.citations` is `hybrid`; a hybrid runner that does not return
// `completed: true` leaves the step `in_progress` ON PURPOSE, because it did its half and a human
// does the rest. The product was right and the card was silent — so "you still have work to do" and
// "the run broke" were the same orange row, and the only way to tell them apart was to ask.
//
// 🔑 THE STRIP EXISTED AND WAS ALMOST ALWAYS EMPTY. `.ob-rule` renders only when the step carries a
// DONE rule, and that rule is SCRAPED out of instruction prose by `stepDoneWhen`. Measured when this
// gate was written: 2 of 89 steps had one. 43 of the 45 hybrid steps said nothing at all.
//
// 🔑 SO THE FLOOR IS TRUE BY CONSTRUCTION, NEVER AUTHORED: hybrid + the runner ran + it did not
// claim completion ⇒ a human finishes it. A real `DONE =` line still wins, so writing one is a
// content change, not a code change.
// → feedback_no_hardcoded_stats · feedback_a_gate_that_it_exists_is_not_a_gate_that_it_works
//
// Exit 0 healthy · 1 the product is wrong · 2 INDETERMINATE

import fs from "node:fs";
import { liftAdmin } from "./_lift-admin.mjs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const fails = [];
const F = (m) => fails.push(m);

function read(p, what) {
  try { return fs.readFileSync(`${SITE}/${p}`, "utf8"); }
  catch { console.error(`⚠️  INDETERMINATE — cannot read ${what}`); process.exit(2); }
}

const adminSrc = read("admin/admin.js", "admin.js");
let playbooks;
try { playbooks = JSON.parse(read("data/playbooks/playbooks.json", "playbooks.json")); }
catch { console.error("⚠️  INDETERMINATE — playbooks.json does not parse"); process.exit(2); }

// 🔑 `state` IS SUPPLIED, AND IT CARRIES A PLAYBOOK. `stepDoneButtonLabel` asks whether the step is
// DETECTED, which reads the loaded playbook — so a sandbox without one cannot test the wording that
// only appears on a measured step. Two step definitions, one of each kind.
// → feedback_the_harness_i_wrote_to_check_my_work_can_lie
const PB = [
  { id: "x.detected", clientDone: "detected" },
  { id: "x.plain", clientDone: "client" },
];
const api = liftAdmin(["stepDoneWhenLine", "stepDoneWhen", "stepDoneButtonLabel"], {
  extraGlobals: { state: { flowM1Playbook: PB, flowM2Playbook: [], flowAllPlaybook: PB, flowPlaybook: PB } },
});
const btnLabel = (o) => api.call("stepDoneButtonLabel", [o]);
const line = (o, task) => api.call("stepDoneWhenLine", [o, task]);
const scrape = (s) => api.call("stepDoneWhen", [s]);

// ═══ PART 1 — THE STRIP IS FED BY THE PRODUCER, NOT BY THE RAW PROPERTY ══════════════════════
// 🔴 This is the regression that re-creates the original defect in one character: reading
// `o.doneWhen` here is exactly what left 87 of 89 cards blank.
{
  const m = adminSrc.match(/const ruleHtml = ([^\n]*)\n/);
  if (!m) F("the active card no longer builds `ruleHtml` — the Done-when strip may have been removed");
  else if (!/doneWhenLine/.test(m[1])) F(`the strip is built from \`${m[1].trim()}\` — it must read stepDoneWhenLine, or it goes blank on every step with no scraped rule`);
  if (!/const doneWhenLine = stepDoneWhenLine\(o, s\.task\)/.test(adminSrc)) {
    F("stepDoneWhenLine is not called with the step AND its task — without the task it cannot tell a run that happened from one that did not");
  }
}

// ═══ PART 2 — THE BUTTON IS NAMED AS IT READS ON SCREEN ══════════════════════════════════════
// 🔑 PIN THE PRODUCER, NOT A SPELLING I INVENTED. The sentence used to hardcode "✓ Mark step
// complete" while the button on a DETECTED step reads "Mark complete anyway" — the card naming a
// control that is not on it. Both now come from `stepDoneButtonLabel`, so this checks that they
// still do, and that it really does produce two different words.
// → feedback_a_gate_must_pin_the_property_not_the_spelling · feedback_instruct_by_what_is_on_screen
{
  const markup = (adminSrc.match(/data-onboard-done="\$\{escapeAttribute\(o\.flowId\)\}"\$\{sc\}>([^<]+)<\/button>/) || [])[1];
  if (!markup) {
    console.error("⚠️  INDETERMINATE — cannot find the active card's done button label");
    process.exit(2);
  }
  if (!/stepDoneButtonLabel\(o\)/.test(markup)) {
    F(`the done button's label is \`${markup.trim()}\` — it must come from stepDoneButtonLabel, or `
      + "the sentence that names it can drift away from the button itself");
  }
  const detected = btnLabel({ flowId: "x.detected" });
  const plain = btnLabel({ flowId: "x.plain" });
  if (!detected || !plain) F("stepDoneButtonLabel returned nothing for one of the two step kinds");
  else if (detected === plain) {
    F(`a measured step and an ordinary step get the SAME button wording ("${plain}") — ticking a `
      + "step whose completion is measured is an override, and the label has to say so");
  } else {
    console.log(`  ✅ the done button reads "${plain}" normally and "${detected}" on a measured step`);
  }
}

const hybrid = { sopType: "hybrid", hasRunner: true, actionLabel: "⚡ Generate", doneWhen: "" };
const ranOpen = { ran_at: "2026-10-07T16:45:00Z", status: "in_progress" };
{
  const t = line(hybrid, ranOpen);
  if (!t) F("a hybrid step whose runner has run and did not finish says nothing about what finishes it — the defect this gate exists for");
  // 🔑 THE SENTENCE MUST NAME WHAT THE PRODUCER PRODUCES FOR THIS STEP — not a fixed string. On a
  // measured step that is "Mark complete anyway"; anywhere else "✓ Mark step complete".
  const want = btnLabel(hybrid);
  if (t && !t.includes(want)) F(`the line does not name the button that finishes the step (expected "${want}", got "${t}")`);
  if (t && !t.includes("⚡ Generate")) F("the line does not name the step's own action, so it reads the same on every card");
}

// ═══ PART 3 — IT FIRES ONLY WHERE IT IS TRUE ═════════════════════════════════════════════════
const quiet = [
  ["a run that never happened", hybrid, { status: "pending" }],
  ["a step already done", hybrid, { ran_at: "x", status: "done" }],
  ["a declined step", hybrid, { ran_at: "x", status: "declined" }],
  ["a skipped step", hybrid, { ran_at: "x", status: "skipped" }],
  ["a run that errored", hybrid, { ran_at: "x", status: "in_progress", error: "boom" }],
  ["a run whose outcome is error", hybrid, { ran_at: "x", status: "in_progress", outcome: "error" }],
  ["an auto step", { ...hybrid, sopType: "auto" }, ranOpen],
  ["a manual step", { ...hybrid, sopType: "manual" }, ranOpen],
  ["a hybrid step with no runner", { ...hybrid, hasRunner: false }, ranOpen],
];
for (const [what, o, task] of quiet) {
  const t = line(o, task);
  if (t) F(`${what} is being told it still has work to do: "${String(t).slice(0, 70)}"`);
}

// 🔴 `indeterminate` AND `manual_required` ARE NOT FAILURES. They are precisely the runs where a
// human must step in, so suppressing the line there would silence it where it matters most.
for (const outcome of ["indeterminate", "manual_required", "partial"]) {
  if (!line(hybrid, { ...ranOpen, outcome })) F(`a run that ended "${outcome}" says nothing — that outcome is a human's cue, not a failure`);
}

// ═══ PART 4 — A REAL RULE ALWAYS WINS ════════════════════════════════════════════════════════
{
  const real = "every listing has been opened and its NAP confirmed.";
  const t = line({ ...hybrid, doneWhen: real }, ranOpen);
  if (t !== real) F(`a step that states its own DONE rule had it overwritten by the generic floor (got "${String(t).slice(0, 60)}")`);
  // and the floor must not need the task at all when a rule exists
  if (line({ ...hybrid, doneWhen: real }, null) !== real) F("a step's own DONE rule disappears when it has never been run");
}

// ═══ PART 5 — THE SEAM STILL REACHES THE PLAYBOOK ════════════════════════════════════════════
// 🔑 Writing `DONE = …` into a step's prose must keep working, because that is what makes the floor
// a floor rather than a ceiling. Step 22 carries one; if the scrape stops reading it, every step
// silently falls back to the generic sentence and nobody notices.
{
  const steps = [...(playbooks.month1 || []), ...(playbooks.month2plus || [])];
  const withRule = steps.filter((s) => { const r = scrape(s); return r && r.length > 3; });
  if (!withRule.length) F("not one step in either playbook carries a DONE rule any more — the scrape seam is dead");
  const cit = steps.find((s) => s.id === "m1.audit.citations");
  if (!cit) F("m1.audit.citations is no longer in month1");
  else if (!scrape(cit)) F("step 22 states a DONE rule in its prose and the scrape no longer reads it");
}

if (fails.length) {
  console.error("🔴 an active step card does not say what finishes it:");
  for (const f of fails) console.error("   · " + f);
  process.exit(1);
}
console.log(`✅ the card says what finishes the step — the strip reads one producer, names the button by the same producer the button uses, and stays quiet on ${quiet.length} states where it would be false`);
