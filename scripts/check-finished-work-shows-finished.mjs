#!/usr/bin/env node
/**
 * check-finished-work-shows-finished.mjs — work that completed must not still read "Active now".
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-09. Chris pressed "✉️ Send the email" on SOP step 1. The email genuinely sent — Gmail id
 * `1a087979fdb68172`, body stored, price traced to the signed contract — and the row still showed
 * **Active now**, with the checklist stuck at "11 of 58 done".
 *
 * `send-confirmation-email` had written `status: done` itself. Then `flow-execute` ran this, one
 * line later:
 *
 *     status: isHybrid ? "in_progress" : "done"
 *
 * and overwrote it. **"hybrid" was being read as "a human must still finish this", when it only
 * means a human MIGHT.** A runner that does the whole job had no way to say so.
 *
 * 🔑 THE RULE: **the runner knows whether the work finished; the step's TYPE does not.** A runner
 * that completed says `completed: true`, gated on real proof (a Gmail message id, a calendar event
 * id) — never on the call merely returning 200. A refusal never sets it, so a failed send stays open
 * and visible.
 *
 * This is the third face of one recurring defect: the UI reporting something other than what
 * happened. See [[feedback-every-action-must-report-its-result]] — the robot counting steps that
 * never ran, the 403 that rendered as "Done", and now finished work that still looks pending.
 *
 * Exit 0 = completion is respected · 1 = a finished step can read as unfinished · 2 = cannot tell.
 */
import fs from "node:fs";

// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT. A gate that can only ever read the real
// working tree cannot be pointed at a scratch copy, so its mutations cannot be run — and a
// gate nobody can make fail is a gate nobody has checked. Found 2026-10-06 when three
// mutations of `check-refusal-is-not-done` all came back green: it was reading straight past
// them. → feedback_a_gate_that_cannot_fail · feedback_the_harness_i_wrote_to_check_my_work_can_lie
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const EXEC = `${__SITE}/netlify/functions/flow-execute.js`;
const SABOTAGE = process.env.SABOTAGE === "1";

if (!fs.existsSync(EXEC)) { console.error("  ✗ flow-execute.js not found"); process.exit(2); }
let exec = fs.readFileSync(EXEC, "utf8");
// 🔴 STRIP COMMENTS FIRST. The comments explaining this very fix contain the words `completed: true`
// and `isHybrid ? "in_progress" : "done"`, and a naive scan reads its own documentation as code —
// the same trap that made an earlier probe report a comment as a defect.
exec = exec
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/(^|[^:"'])\/\/[^\n]*/g, (m, p) => p + " ".repeat(m.length - p.length));

if (SABOTAGE) {
  // Restore the ORIGINAL defect verbatim, so the gate must fail (exit 1), not merely fail to
  // recognise the code (exit 2). Exit 2 means "could not tell" and must never stand in for a catch.
  exec = exec
    .replace(/const runnerCompleted = [^\n]*\n/, "")
    .replace(/const isDone = runnerCompleted \|\| !isHybrid;/, "")
    .replace(/status: isDone \? "done" : "in_progress",/, 'status: isHybrid ? "in_progress" : "done",')
    .replace(/\[isDone \? "completed_at" : "started_at"\]/, '[isHybrid ? "started_at" : "completed_at"]');
  console.log("  ⚠️  SABOTAGE=1 — the original type-only status logic has been restored");
}

console.log("── work that finished must not still read as pending ──");
const fails = [];

// 1. The persisted status must consider the runner's own completion signal.
if (/status:\s*isHybrid\s*\?\s*"in_progress"\s*:\s*"done"/.test(exec)) {
  fails.push("status ignores the runner");
  console.log('  🔴 status is decided by TYPE alone (`isHybrid ? "in_progress" : "done"`) — a runner');
  console.log("     that finished the job cannot say so, and its own `done` gets overwritten");
} else if (/const isDone = runnerCompleted \|\|/.test(exec)) {
  // 🔑 PIN THE PROPERTY: `runnerCompleted` LEADS THE DECISION. What follows it is allowed to grow —
  // it now reads `runnerCompleted || (!isHybrid && !isDetected)`, because a step whose completion is
  // DETECTED must not be finished by merely pressing Run. This gate failed on that correct change
  // while pinning the old sentence word for word.
  // 🔑 The full decision is EVALUATED, against every real step definition, by
  // check-a-detected-step-is-never-done-by-running-it. This one only guards the leading clause.
  // → feedback_a_gate_must_pin_the_property_not_the_spelling
  console.log("  ✅ a runner reporting `completed: true` marks the step done regardless of type");
} else {
  console.log("  ▫️  could not recognise the status decision — renamed?");
  process.exit(2);
}

// 2. The completion stamp must follow the same decision, or a done step carries only started_at.
if (/\[isDone \? "completed_at" : "started_at"\]/.test(exec)) {
  console.log("  ✅ the timestamp follows the same decision as the status");
} else if (/\[isHybrid \? "started_at" : "completed_at"\]/.test(exec)) {
  fails.push("timestamp ignores the runner");
  console.log("  🔴 the timestamp still keys off type — a completed step records no completed_at");
}

// 3. 🔴 completed:true must be earned by PROOF, never hardcoded. A runner that always claims
//    completion is worse than one that never does — it marks failed sends as done.
const claims = [...exec.matchAll(/completed:\s*([^,\n]+)/g)].map((m) => m[1].trim());
if (!claims.length) {
  fails.push("nothing ever claims completion");
  console.log("  🔴 no runner sets `completed` — the signal exists but nothing uses it");
} else {
  const unconditional = claims.filter((c) => c === "true");
  if (unconditional.length) {
    fails.push("completion claimed unconditionally");
    console.log(`  🔴 ${unconditional.length} runner(s) hardcode \`completed: true\` — a failed send would mark done`);
  } else {
    console.log(`  ✅ all ${claims.length} completion claim(s) are conditional on real proof:`);
    claims.forEach((c) => console.log(`       ${c.slice(0, 72)}`));
  }
}

console.log("");
if (fails.length) {
  console.error(`🔴 finished work can still read as pending (${fails.join(", ")}).`);
  console.error("   The runner knows whether the work finished; the step's type does not.");
  process.exit(1);
}
console.log("✅ a runner that finished the job marks the step done, and only on real proof");
