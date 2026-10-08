#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — AN OUTBOUND CALL HAS A DEADLINE, AND A DEAD RUN LEAVES A REASON
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-10-05: *"still hasnt updated i think there is an issue"*. The record said it all:
 *
 *     started_at : 5:01:42 PM        ran_at : 4:44:22 PM  (the PREVIOUS run)
 *     status     : in_progress       error  : null
 *
 * and the function log held ONE line for the invocation and nothing after it. Not a crash, not a
 * handled timeout — a `fetch` that never came back. **None of the nine calls in `_ads-keywords.js`
 * had a timeout**, so one unanswered request ate the background function's whole 15-minute budget
 * and the platform killed the process before anything could be written.
 *
 * 🔑 A REQUEST WITHOUT A DEADLINE IS A PROMISE THAT THE OTHER SIDE WILL ALWAYS ANSWER.
 * 🔑 AND THE STEP THAT STARTS IS THE STEP THAT MUST FINISH THE RECORD — whatever happens,
 *    `in_progress` is replaced by something a human can read.
 *
 * Exit 0 pass · 1 a call can hang or a death can go unrecorded · 2 could not run.
 */
import fs from "node:fs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (rel) => { try { return fs.readFileSync(`${SITE}/${rel}`, "utf8"); } catch { return null; } };

const ads = read("netlify/functions/_ads-keywords.js");
const bg = read("netlify/functions/flow-execute-heavy-background.js");
if (!ads || !bg) { console.error("⚠️  INDETERMINATE — cannot read the function sources"); process.exit(2); }

const strip = (s) => s.replace(/^\s*\/\/.*$/gm, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
const fail = [];

// ── 1 · EVERY OUTBOUND CALL IN THE ADS MODULE GOES THROUGH THE DEADLINE WRAPPER ─────────────────
{
  const code = strip(ads);
  if (!/async function adsFetch\s*\(/.test(code)) {
    fail.push("`adsFetch` is gone — there is no one place that puts a deadline on an outbound call");
  }
  if (!/AbortSignal\.timeout\s*\(/.test(code)) {
    fail.push("no AbortSignal.timeout anywhere in the ads module — a hung request would run until "
      + "the platform kills the function, with nothing written");
  }
  // 🔴 A BARE `fetch(` MUST NOT SURVIVE outside the wrapper. One un-wrapped call is enough to hang
  // the whole step, and it is invisible: it fails only when the far end is slow.
  const bare = [...code.matchAll(/(?<!globalThis\.)\bawait\s+fetch\s*\(/g)];
  if (bare.length) {
    const line = code.slice(0, bare[0].index).split("\n").length;
    fail.push(`${bare.length} outbound call(s) still use a bare \`fetch\` (first at line ~${line}) — `
      + "those have no deadline and can hang the whole run");
  }
  // 🔴 AND THE WRAPPER MUST NOT CALL ITSELF. A blanket replace of `await fetch(` once rewrote the
  // wrapper's own line into a call to itself — infinite recursion, shipped in a single edit.
  const fn = (() => {
    const i = code.indexOf("async function adsFetch");
    if (i < 0) return "";
    const lp = code.indexOf("(", i);
    let pd = 0, a = -1;
    for (let k = lp; k < code.length; k++) {
      if (code[k] === "(") pd++;
      else if (code[k] === ")") { pd--; if (!pd) { a = k + 1; break; } }
    }
    const o = code.indexOf("{", a);
    let d = 0;
    for (let k = o; k < code.length; k++) {
      if (code[k] === "{") d++;
      else if (code[k] === "}") { d--; if (!d) return code.slice(i, k + 1); }
    }
    return "";
  })();
  if (!fn) {
    console.error("⚠️  INDETERMINATE — cannot read adsFetch; re-pin this gate.");
    process.exit(2);
  }
  // 🔴 THE BODY, NOT THE HEADER. `fn` starts at the declaration, so testing the whole slice matched
  // `async function adsFetch(` itself and accused correct code on the first run.
  const body = fn.slice(fn.indexOf("{"));
  if (/\badsFetch\s*\(/.test(body)) {
    fail.push("`adsFetch` calls itself — infinite recursion; it must call the global fetch");
  }
  if (!/globalThis\.fetch\s*\(/.test(body)) {
    fail.push("`adsFetch` does not call the global fetch — it cannot actually make the request");
  }
  // 🔑 A timeout must return something the existing `r.ok` / `r.status` branches can read, or every
  // caller throws instead of reporting.
  if (!/ok:\s*false/.test(fn) || !/status:\s*\d{3}/.test(fn)) {
    fail.push("a timed-out call does not return a Response-shaped result — callers that branch on "
      + "`r.ok`/`r.status` would throw instead of reporting the failure");
  }
}

// ── 2 · A BACKGROUND RUN THAT DIES RECORDS WHY ──────────────────────────────────────────────────
{
  const code = strip(bg);
  if (!/try\s*{/.test(code) || !/catch\s*\(/.test(code)) {
    fail.push("the background wrapper does not catch a failure — a throw leaves the record saying "
      + "`in_progress` forever, which is indistinguishable from a step nobody pressed");
  }
  // 🔴 A CALL, NOT THE DEFINITION — the same slip as `adsFetch` above, caught by mutation testing
  // rather than by reading. `/name\(/` matches `async function name(` every time.
  if (!/await\s+writeFailure\s*\(/.test(code)) {
    fail.push("nothing writes the failure back to the record — the operator is left with a step that "
      + "says it is running and never will be");
  }
  if (!/Promise\.race\s*\(/.test(code) || !/RUN_DEADLINE_MS/.test(code)) {
    fail.push("the background run has no deadline of its own — the platform's kill is silent, so the "
      + "failure must be ours to write before it arrives");
  }
  // 🔴 `ran_at` RECORDS WHEN SOMETHING WAS PRODUCED. A failure produced nothing.
  const wf = (code.match(/async function writeFailure[\s\S]*?\n\}/) || [""])[0];
  // 🔴 TWO DIFFERENT `ran_at`s LIVE IN THIS FUNCTION, and checking the whole block confuses them.
  // The TASK's `ran_at` says when the step last produced something, and a failure produced nothing.
  // The HISTORY ROW's `ran_at` says when the run happened — a failed run happened, and keeping it is
  // the entire point of `client_step_runs` ("it failed twice before it worked").
  // Scope the check to the task write. → feedback_a_gate_must_pin_the_property_not_the_spelling
  const taskWrite = (wf.match(/tasks\[stepId\]\s*=\s*\{[\s\S]*?\};/) || [""])[0];
  if (wf && taskWrite && /ran_at:/.test(taskWrite)) {
    fail.push("the failure path writes `ran_at` — that would make the card claim this run's output "
      + "is the one on screen, when this run produced nothing");
  }
  if (wf && !/status:\s*"error"/.test(wf)) {
    fail.push("the failure path does not set `status: \"error\"` — the admin's wait would keep "
      + "polling a step that is already dead");
  }
}

// ── 3 · AND THE ADMIN READS THAT FAILURE RATHER THAN WAITING OUT THE CLOCK ──────────────────────
{
  const admin = read("admin/admin.js");
  if (admin) {
    const code = strip(admin);
    const fn = (code.match(/async function waitForStepToLand[\s\S]*?\n\}/) || [""])[0];
    if (fn && !/status === "error"|failed_at/.test(fn)) {
      fail.push("the admin's wait does not notice a recorded failure — it would sit saying \"still "
        + "running\" over a step that died minutes ago");
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴🔴🔴 THE RULE ONLY COVERED THE CALLS I HAD THOUGHT OF (2026-10-06).
//
// Nine ads calls were deadlined in October and gated here. Then `supa()` — EVERY Supabase call in
// flow-execute.js — turned out to be a bare fetch with no signal, and a new one was added to the
// heaviest step's hot path. The run hung, the log held one INFO line and nothing after it, and the
// record sat `in_progress` with `error: null` while the card showed the previous run.
//
// Widening the scan found **446 un-deadlined fetches across 101 function files.** That is a real
// backlog and it is logged, not silently fixed — but a gate that is permanently red teaches the
// reader to ignore every red, which is the one outcome worse than no gate.
// → feedback_a_flaky_gate_is_worse_than_a_failing_one · project_pending_tasks
//
// 🔑 SO IT IS A RATCHET. The hot path must be clean, and the backlog may only ever shrink.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔑 A FILE IS COVERED IF IT REQUIRES `_deadline` (which puts a floor under every request the whole
// process makes, including ones inside libraries) OR if every call it makes carries its own signal.
// The backlog was 446 bare fetches across 101 files; editing 446 call sites would have been 446
// chances to miss one, and could not have reached a request made inside a dependency.
// → feedback_fix_the_class_not_the_instance
{
  const dir = `${SITE}/netlify/functions`;
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /\.js$/.test(f)); }
  catch { console.error("⚠️  INDETERMINATE — cannot list netlify/functions"); process.exit(2); }
  if (files.length < 5) { console.error("⚠️  INDETERMINATE — too few function files found."); process.exit(2); }

  // the module itself must still do the one thing it claims
  let dl = "";
  try { dl = fs.readFileSync(`${dir}/_deadline.js`, "utf8"); }
  catch { fail.push("_deadline.js is gone — every function that relied on it for a floor now has none"); }
  if (dl) {
    if (!/AbortSignal\.timeout\(/.test(dl)) fail.push("_deadline.js no longer sets a timeout signal");
    if (!/if \(i\.signal\) return underlying/.test(dl)) {
      fail.push("_deadline.js no longer honours a caller's OWN signal — the surface probe's 45s and "
        + "the ads 20s would be silently overridden by the default floor");
    }
    if (!/__rgaFetchDeadlineInstalled/.test(dl)) {
      fail.push("_deadline.js can install itself twice — a timeout stacked on a timeout, with the "
        + "behaviour depending on how many modules happened to import it");
    }
  }

  let scanned = 0, uncovered = 0;
  for (const f of files) {
    if (f === "_deadline.js") continue;
    let src2;
    try { src2 = fs.readFileSync(`${dir}/${f}`, "utf8"); } catch { continue; }
    // 🔴🔴 LINE COMMENTS FIRST, THEN BLOCK COMMENTS. The other order loses code: `brain-record-audit.js`
    // has `//   OPS MEMORY (~/.claude/.../memory/*.md)` on line 12, and that stray `/*` inside a LINE
    // comment made the block-comment pass swallow 120 lines — including the `require("./_deadline")`
    // this gate was looking for. It then reported a correct file as unprotected.
    // 🔑 A COMMENT STRIPPER THAT RUNS IN THE WRONG ORDER DELETES CODE, and every gate in this repo
    // that greps stripped source shares the idiom. → feedback_the_harness_i_wrote_to_check_my_work_can_lie
    const code2 = src2.replace(/^[ \t]*\/\/.*$/gm, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
    const calls = [...code2.matchAll(/\b(?:globalThis\.)?fetch\s*\(/g)];
    if (!calls.length) continue;
    scanned += calls.length;
    if (/require\(['"]\.\/_deadline['"]\)/.test(code2)) continue;   // covered process-wide
    for (const m of calls) {
      const start = m.index;
      let d = 0, end = start;
      for (let k = code2.indexOf("(", start); k < code2.length; k++) {
        if (code2[k] === "(") d++;
        else if (code2[k] === ")") { d--; if (!d) { end = k; break; } }
      }
      if (/signal\s*:/.test(code2.slice(start, end + 1))) continue;
      const before = code2.slice(Math.max(0, start - 1200), start);
      const encl = [...before.matchAll(/(?:async )?function (\w+)\s*\(/g)].pop();
      const name = encl ? encl[1] : null;
      if (name && new RegExp(`function ${name}\\s*\\([\\s\\S]{0,900}?signal\\s*:`).test(code2)) continue;
      uncovered++;
      fail.push(`${f}: an outbound fetch${name ? ` in ${name}()` : ""} has no deadline, and the file does `
        + "not require ./_deadline — a request that never answers kills the run in silence");
    }
  }
  if (scanned < 5) {
    console.error(`⚠️  INDETERMINATE — only ${scanned} fetch call(s) found across ${files.length} files.`);
    process.exit(2);
  }
  // 🔴 THE ONE THAT CAUSED IT, still pinned by name.
  const fe = fs.readFileSync(`${dir}/flow-execute.js`, "utf8");
  if (!/async function supa\([\s\S]{0,800}?signal:\s*AbortSignal\.timeout/.test(fe)) {
    fail.push("`supa()` in flow-execute.js has no deadline of its own — every Supabase read and write "
      + "in the heaviest step goes through it");
  }
}

// ── THE RUN MUST REPORT FAILURE WHILE SOMETHING IS STILL WATCHING ───────────────────────────────
// 🔴 The background deadline was NINE minutes and the admin's wait is FIVE, so a hung run was still
// `in_progress` when the browser stopped looking — "still running, reload" was the only thing it
// could ever say, and the failure landed four minutes after the only listener had gone.
{
  const bg = fs.readFileSync(`${SITE}/netlify/functions/flow-execute-heavy-background.js`, "utf8");
  const adm = fs.readFileSync(`${SITE}/admin/admin.js`, "utf8");
  const dm = bg.match(/RUN_DEADLINE_MS\s*=\s*Number\([^)]*\|\|\s*(\d+)\s*\*\s*60\s*\*\s*1000\)/);
  const wm = adm.match(/tries\s*=\s*(\d+),\s*every\s*=\s*(\d+)/);
  if (!dm || !wm) {
    console.error("⚠️  INDETERMINATE — cannot read the run deadline or the watch window; re-pin this gate.");
    process.exit(2);
  }
  const runMs = Number(dm[1]) * 60000;
  const watchMs = Number(wm[1]) * Number(wm[2]);
  if (!(runMs < watchMs)) {
    fail.push(`the background run gives itself ${Math.round(runMs / 60000)} min while the admin watches `
      + `for ${Math.round(watchMs / 60000)} min — a hung run is still "in progress" when the browser `
      + `stops looking, so the card can only ever say "still running"`);
  }
}

if (fail.length) {
  console.error("🔴 a call can hang, or a dead run can go unrecorded:");
  for (const f of fail) console.error("   · " + f);
  process.exit(1);
}
console.log("✅ every outbound ads call carries a deadline and returns a readable result; a background run that dies records why, and the admin reports it");
