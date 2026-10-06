#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — THE GEO GRID MEASURES THE PLAN, AND A SCAN OLDER THAN THE PLAN DOES NOT COUNT
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-10-06: *"and the geo grid is 26 so check that too?"*
 *
 * Step 26 sat **done** with a summary reading *"81-point geo-grid, \"seo company\" … Not found at ANY
 * of the 81 points"*, dated 2026-09-15. "seo company" is `client.primary_service` — it is **not one
 * of the five keywords step 25 had locked that morning.**
 *
 * The SCAN had been fixed in October to measure the locked plan rather than the single placeholder.
 * **The guard in front of it had not.** It called `readGridSessions(clientId, client.primary_service)`,
 * found a complete scan under 30 days old, and returned `markDone` — never reaching `readLockedPlan`.
 * So the plan's keywords had never been scanned on any run, and pressing Run again would have
 * re-reported the same stale result and marked the step done again.
 *
 * 🔑 A HALF-APPLIED FIX IS THE WORST KIND: the scanner was right, the guard was wrong, and the guard
 * always won. 🔑 AND A SCAN OLDER THAN THE PLAN IT CLAIMS TO MEASURE IS NOT A SCAN OF THAT PLAN.
 * → project_proving_the_work_works · feedback_a_finished_step_whose_input_moved_is_not_finished
 *
 * Exit 0 pass · 1 the grid can report on a keyword the plan does not contain · 2 could not run.
 */
import fs from "node:fs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
let src;
try { src = fs.readFileSync(`${SITE}/netlify/functions/flow-execute.js`, "utf8"); }
catch { console.error("⚠️  INDETERMINATE — cannot read flow-execute.js"); process.exit(2); }

// 🔴 LINE COMMENTS FIRST — a `/*` inside a `//` otherwise swallows real code.
const code = src.replace(/^[ \t]*\/\/.*$/gm, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
const fail = [];
const ok = (c, m) => { if (!c) fail.push(m); };

// the grid executor's body
const gi = code.indexOf('"m1.audit.grid_baseline"');
if (gi < 0) { console.error("⚠️  INDETERMINATE — cannot find the grid executor; re-pin this gate."); process.exit(2); }
const body = code.slice(gi, gi + 9000);

// ── 1 · THE FRESHNESS CHECK ASKS ABOUT THE PLAN ─────────────────────────────────────────────────
ok(/readLockedPlan\(recs\)/.test(body), "the grid step never reads the locked plan");
{
  const planAt = body.indexOf("readLockedPlan(recs)");
  const readAt = body.indexOf("readGridSessions(");
  ok(planAt >= 0 && readAt >= 0 && planAt < readAt,
    "the stored-scan check runs BEFORE the locked plan is read, so it can only ask about "
    + "client.primary_service — the placeholder the scan itself stopped using in October");
}
ok(!/readGridSessions\(clientId,\s*keyword\)/.test(body),
  "readGridSessions is still called with `keyword` (client.primary_service) — a complete scan of the "
  + "placeholder satisfies the guard and the plan's own keywords are never scanned at all");
ok(/readGridSessions\(clientId,\s*scanKeyword\)/.test(body),
  "the stored-scan check does not look up the PLAN's keyword");
ok(/planForCheck\s*&&\s*planForCheck\.keywords\[0\]/.test(body),
  "the scan keyword is not taken from the locked plan's first term");

// ── 2 · A SCAN OLDER THAN THE PLAN IS NOT A SCAN OF THE PLAN ────────────────────────────────────
ok(/olderThanPlan/.test(body),
  "nothing compares the stored scan against when the plan was locked — a scan from before the plan "
  + "existed would be reported as this month's baseline");
{
  const gi2 = body.indexOf("if (newest && ageDays < 30");
  const cond = gi2 >= 0 ? body.slice(gi2, gi2 + 120) : "";
  ok(/!olderThanPlan/.test(cond),
    "the short-circuit still returns a stored scan without checking it postdates the plan — the exact "
    + "state that had step 26 showing Done over a keyword the plan does not contain");
}
// 🔴 UNKNOWN IS NOT STALE: both timestamps must be real, or every client with no lock date re-scans
// forever, at a Places call per grid point.
ok(/Number\.isFinite\(lockedAt\)\s*&&\s*newest/.test(body),
  "the staleness comparison does not require two real timestamps — a client whose lock date is "
  + "unknown would re-scan on every single run, which is 81 metered lookups a time");
ok(/ran_at[\s\S]{0,160}?completed_at/.test(body),
  "the lock date is read from only one field — a step marked done by a human carries completed_at, "
  + "one that produced output carries ran_at, and the grid must honour whichever exists");

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴🔴🔴 AND NOTHING ABOVE MATTERS IF THE ADMIN NEVER CALLS THE EXECUTOR (2026-10-06).
//
// Chris pressed Run on step 26 and got "Step marked complete". Measured: fresh grid rows written for
// **"seo company"** — `client.primary_service` — while the plan locked that morning held five
// entirely different keywords. `runOnboardingStep` had a special case for this one step:
//
//   refreshMapRankings();                        // POSTs keyword: c.primary_service
//   markOnboardingStep(flowId, "done", scope);   // marks it complete before the scan has run
//   return;                                      // the executor is never called
//
// 🔑 A FIX APPLIED TO ONE PATH IS UNDONE BY A SECOND PATH THAT SKIPS IT. The executor had been
// corrected twice and both corrections were dead code.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
{
  let admin;
  try { admin = fs.readFileSync(`${SITE}/admin/admin.js`, "utf8"); }
  catch { console.error("⚠️  INDETERMINATE — cannot read admin.js"); process.exit(2); }
  const a = admin.replace(/^[ \t]*\/\/.*$/gm, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
  const ri = a.indexOf("async function runOnboardingStep");
  const body = ri >= 0 ? a.slice(ri, ri + 3000) : "";
  ok(body, "cannot find runOnboardingStep; re-pin this gate");
  ok(!/flowId === "m1\.audit\.grid_baseline"/.test(body),
    "runOnboardingStep still special-cases the grid step — it scans client.primary_service instead of "
    + "the locked plan, marks the step done before the scan has run, and returns without ever calling "
    + "the executor that does all of the above correctly");
  ok(!/refreshMapRankings\(\)[\s\S]{0,200}?markOnboardingStep\([^,]*,\s*"done"/.test(a),
    "something still fires a map-rank scan and immediately marks a step done — a green tick that means "
    + "'a request was sent', not 'a baseline exists'");
  // 🔑 And the executor's own sentence must name what it scanned.
  ok(/Started a map-rank scan for \$\{plan\.keywords\.length\}/.test(code),
    "the scan confirmation names `keyword` (client.primary_service) rather than the plan it actually "
    + "started scanning — the sentence and the work describing different things is how the two drifted "
    + "apart unnoticed");
  ok(/outcome_data: \{ keywords: plan\.keywords/.test(code),
    "the started-scan record stores the placeholder keyword rather than the plan's keywords");
}

if (fail.length) {
  console.error("🔴 the geo grid can report on something other than the locked plan:");
  for (const f of fail) console.error(`   · ${f}`);
  process.exit(1);
}
console.log("✅ the grid reads the locked plan before deciding whether a scan is needed, looks the plan's "
  + "own keyword up, and refuses a stored scan that predates the plan — without re-scanning when either "
  + "timestamp is unknown");
