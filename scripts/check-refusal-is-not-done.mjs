#!/usr/bin/env node
/**
 * check-refusal-is-not-done.mjs — a step that REFUSED must never be announced as "Done".
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-09, Chris pressed Run on SOP step 1 (the confirmation email) before the RGA Google
 * connection had `gmail.send`. Everything underneath behaved perfectly:
 *
 *     nothing was sent · status: in_progress · outcome: manual_required
 *     summary: "…can create calendar invites but cannot SEND EMAIL…"
 *
 * And the admin displayed, in green:
 *
 *     ✅ Done — step 1 · Confirmation + expectations email (within the hour)
 *
 * The banner keyed off `r.ok && data.ok` — which only means **the runner answered**, not that the
 * work happened. A refusal, an indeterminate and a hard failure all rendered as success.
 *
 * 🔑 THE RULE: **"the call succeeded" and "the work happened" are different facts.** A runner that
 * declines to act is reporting a result, and the UI must repeat the result it was given rather than
 * the fact that it got one. Same family as [[feedback-every-action-must-report-its-result]] and the
 * run-all robot counting `mustRunLocally` as executed.
 *
 * Exit 0 = the banner respects outcome · 1 = it can claim Done over a refusal · 2 = cannot tell.
 */
import fs from "node:fs";

const ADMIN = "/Users/chris/RGA/Rocket Growth Agency Website VS Code/admin/admin.js";
const EXEC = "/Users/chris/RGA/Rocket Growth Agency Website VS Code/netlify/functions/flow-execute.js";
const SABOTAGE = process.env.SABOTAGE === "1";

for (const f of [ADMIN, EXEC]) {
  if (!fs.existsSync(f)) { console.error(`  ✗ missing ${f}`); process.exit(2); }
}
let admin = fs.readFileSync(ADMIN, "utf8");
const exec = fs.readFileSync(EXEC, "utf8");

if (SABOTAGE) {
  // Restore the original defect: announce Done regardless of outcome.
  admin = admin.replace(/const ui = OUTCOME_BANNER\[data\.outcome\];/, "const ui = null;");
  console.log("  ⚠️  SABOTAGE=1 — outcome-blind banner re-injected");
}

console.log("── a step that refused must not be announced as Done ──");
const fails = [];

// The outcomes a runner uses to say "I did not do the work."
const REFUSALS = ["manual_required", "indeterminate", "blocked", "error"];

// 1. Every refusal outcome a runner can emit must be handled by the banner.
const emitted = new Set();
for (const m of exec.matchAll(/outcome:\s*"([a-z_]+)"/g)) emitted.add(m[1]);
for (const m of exec.matchAll(/outcome:\s*[^,\n]*\?\s*"([a-z_]+)"\s*:\s*"([a-z_]+)"/g)) { emitted.add(m[1]); emitted.add(m[2]); }
const emittedRefusals = REFUSALS.filter((r) => emitted.has(r));
if (!emittedRefusals.length) { console.error("  ✗ no refusal outcomes found in flow-execute — probe is wrong"); process.exit(2); }

const mapMatch = admin.match(/const OUTCOME_BANNER = \{[\s\S]*?\n\s*\};/);
if (!mapMatch) {
  fails.push("no OUTCOME_BANNER map");
  console.log("  🔴 the admin has no outcome→banner map — every result renders the same way");
} else {
  const missing = emittedRefusals.filter((r) => !new RegExp(`\\b${r}\\b`).test(mapMatch[0]));
  if (missing.length) {
    fails.push("unhandled refusal outcomes");
    console.log(`  🔴 runners emit these refusals with no banner case: ${missing.join(", ")}`);
  } else {
    console.log(`  ✅ all ${emittedRefusals.length} refusal outcome(s) have a banner case: ${emittedRefusals.join(", ")}`);
  }
}

// 2. The "Done" banner must be gated on the outcome, not merely on a successful response.
const doneLine = admin.match(/title: `Done — \$\{stepLabel\(stepId\)\}`/);
if (!doneLine) {
  console.log("  ▫️  no Done banner found — renamed? treating as indeterminate");
  process.exit(2);
}
const around = admin.slice(Math.max(0, doneLine.index - 900), doneLine.index + 200);
if (/const ui = OUTCOME_BANNER\[data\.outcome\]/.test(around) && /ui\s*\?/.test(around)) {
  console.log("  ✅ the Done banner is reached only when the outcome is not a refusal");
} else {
  fails.push("Done is outcome-blind");
  console.log("  🔴 the Done banner does not branch on data.outcome — a refusal will render as success");
}

// 3. Instructions must not be alerted as a "follow-up".
if (/followup:\s*isHybrid\s*\?\s*stepDef\.instructions/.test(exec)) {
  fails.push("instructions alerted as follow-up");
  console.log("  🔴 flow-execute still returns step instructions as `followup` — the admin pops the");
  console.log("     whole manual over the result the user pressed the button for");
} else {
  console.log("  ✅ step instructions are not returned as a follow-up");
}

console.log("");
if (fails.length) {
  console.error(`🔴 the admin can claim work it did not do (${fails.join(", ")}).`);
  console.error("   'the call succeeded' and 'the work happened' are different facts.");
  process.exit(1);
}
console.log("✅ refusals, indeterminates and failures all report as themselves");
