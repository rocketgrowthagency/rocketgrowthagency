#!/usr/bin/env node
/**
 * check-robot-does-not-overclaim.mjs — the "Run all" robot must report what actually happened.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-08, auditing all 60 Month-1 SOP steps: 11 of them have a runner that exists ONLY in the
 * scraper repo (`flow/playbooks/month1.mjs`), because they need puppeteer or other heavy libraries
 * that cannot run inside a Netlify function. `flow-execute.js` answers those with:
 *
 *     { mustRunLocally: true, command: "…" }     ← NOTHING RAN
 *
 * `runFlowRobot()` in admin/admin.js treated that as success:
 *
 *     if (data.ok || data.mustRunLocally) { executed++; progressedThisPass = true; }
 *
 * Two separate defects fell out of that one line:
 *   1. 🔴 IT OVERCLAIMED. The finishing banner said "Robot finished. N step(s) executed" while up
 *      to 11 of those N had not run at all. Chris reads that banner and believes the work is done.
 *   2. 🔴 IT BURNED PASSES. The step never reached `done`, so it stayed eligible, and counting it as
 *      PROGRESS kept the loop alive — all 10 passes re-attempted all 11 local-only steps, ~110
 *      pointless function calls, before the loop gave up.
 *
 * And a third, alongside: a step that threw went to `console.warn` and nowhere else, so a failure
 * was invisible in the UI — the swallowed-error class from [[feedback-a-failure-reason-can-be-a-mask]].
 *
 * 🔑 THE RULE THIS ENFORCES: **an action reports the result it actually got.** "Did not run" and
 * "ran and worked" are different outcomes and must never be summed into one number.
 *
 * Exit 0 = the robot reports honestly · 1 = it overclaims again · 2 = could not tell.
 */
import fs from "node:fs";

const ADMIN = "/Users/chris/RGA/Rocket Growth Agency Website VS Code/admin/admin.js";
const SABOTAGE = process.env.SABOTAGE === "1";

if (!fs.existsSync(ADMIN)) { console.error("  ✗ admin.js not found"); process.exit(2); }
let src = fs.readFileSync(ADMIN, "utf8");

// Isolate runFlowRobot by brace-matching from its declaration. 🔴 Do NOT scan the whole file — the
// single-step runner legitimately mentions mustRunLocally, and matching it there would make this
// gate fire on correct code.
const start = src.indexOf("async function runFlowRobot(");
if (start < 0) { console.error("  ✗ runFlowRobot() not found — did it get renamed?"); process.exit(2); }
const open = src.indexOf("{", start);
let depth = 0, end = -1;
for (let i = open; i < src.length; i++) {
  if (src[i] === "{") depth++;
  else if (src[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
}
if (end < 0) { console.error("  ✗ could not brace-match runFlowRobot()"); process.exit(2); }
let body = src.slice(start, end + 1);

if (SABOTAGE) {
  // Reintroduce the exact founding bug. If the gate still passes, the gate is worthless.
  body = body.replace(/if \(data\.mustRunLocally\) \{[\s\S]*?\} else if \(data\.ok\) \{\s*executed\+\+;/,
    "if (data.ok || data.mustRunLocally) {\n            executed++;");
  console.log("  ⚠️  SABOTAGE=1 — the original defect has been re-injected into the parsed body");
}

console.log("── the run-all robot must report what actually happened ──");
const fails = [];

// 1. mustRunLocally must never be counted as an execution.
if (/data\.ok\s*\|\|\s*data\.mustRunLocally/.test(body)) {
  fails.push("counts mustRunLocally as success");
  console.log("  🔴 `data.ok || data.mustRunLocally` — a step that did NOT run is counted as executed");
} else {
  console.log("  ✅ mustRunLocally is handled separately from ok");
}

// 2. It must be reported to the human, not just tallied away.
if (/localOnly/.test(body) && /did NOT run|need the local scraper/i.test(body)) {
  console.log("  ✅ local-only steps are named in the finishing banner");
} else {
  fails.push("local-only steps not surfaced");
  console.log("  🔴 local-only steps are not reported to the human — they read as done");
}

// 3. A thrown step must reach the UI, not only the console.
const catchBlock = body.match(/catch \(e\) \{([\s\S]{0,200}?)\}/g) || [];
const swallows = catchBlock.some((c) => /console\.(warn|log|error)/.test(c) && !/failed\.push|setBanner/.test(c));
if (swallows) {
  fails.push("swallows step failures to the console");
  console.log("  🔴 a failing step goes to console.* only — invisible in the admin");
} else {
  console.log("  ✅ step failures are collected and surfaced");
}

// 4. The finishing banner must not be a bare count.
if (/Robot finished\. \$\{executed\}/.test(body)) {
  fails.push("bare count banner");
  console.log("  🔴 the banner is a bare execution count with no failure/skipped breakdown");
} else {
  console.log("  ✅ the banner breaks results down rather than printing one number");
}

console.log("");
if (fails.length) {
  console.error(`🔴 the robot overclaims (${fails.join(", ")}).`);
  console.error("   'did not run' and 'ran and worked' must never be summed into one number.");
  process.exit(1);
}
console.log("✅ the run-all robot reports executed, local-only and failed separately");
