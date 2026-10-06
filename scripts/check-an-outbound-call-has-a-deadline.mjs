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

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
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
  if (wf && /ran_at:/.test(wf)) {
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

if (fail.length) {
  console.error("🔴 a call can hang, or a dead run can go unrecorded:");
  for (const f of fail) console.error("   · " + f);
  process.exit(1);
}
console.log("✅ every outbound ads call carries a deadline and returns a readable result; a background run that dies records why, and the admin reports it");
