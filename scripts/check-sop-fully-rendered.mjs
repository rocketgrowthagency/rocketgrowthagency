#!/usr/bin/env node
/**
 * check-sop-fully-rendered.mjs — every SOP step must be reachable in the admin UI.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-06: Chris went looking for the "Schedule + run kickoff call" step and Ctrl+F returned
 * **0/0**. It was not on the page. The Onboarding checklist rendered from MISSION_OBJECTIVES — a
 * hand-maintained CURATED SUMMARY for Mission Control (18 strategic objectives) — instead of from
 * data/playbooks/playbooks.json, the canonical 58-step SOP.
 *
 *   header badge  : "Onboarding 10% (6/58)"     ← counted the real playbook
 *   the checklist : "0 of 9 done"               ← counted the curated summary
 *
 * The same screen showed two different totals for the same thing. **49 SOP steps had no row and no
 * Run button anywhere in the admin — including 46 that have working runners.**
 *
 * 🔑 Nothing was broken. Both lists were internally consistent; they just described different
 * things, and the smaller one was wired to the UI. That is what silent drift looks like
 * ([[project-section-gutter-two-implementations]]).
 *
 * CHECK
 *   🔴 The Onboarding checklist must build from the SOP playbook, not from the curated objective
 *      list. Verified structurally: sopChecklistSteps() must exist and must read flowM1Playbook /
 *      flowM2Playbook, and renderOnboardingChecklist must call it.
 *
 * Exit 0 = the SOP drives the UI. 1 = it does not. 2 = could not tell.
 */
import fs from "node:fs";
import path from "node:path";

// 🔑 Overridable so this gate can be MUTATION-TESTED against a sandbox copy. A gate that can only
// ever read the live repo cannot be proven to fail when the thing it guards actually breaks — and
// an unfalsifiable gate is indistinguishable from one that is always green.
// → feedback_a_fix_without_a_gate_regresses
const WEB = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const ADMIN = path.join(WEB, "admin", "admin.js");
const SOP = path.join(WEB, "data", "playbooks", "playbooks.json");

console.log("── every SOP step is reachable in the admin ──");

for (const f of [ADMIN, SOP]) {
  if (!fs.existsSync(f)) { console.error(`  ✗ missing ${f}`); process.exit(2); }
}

const src = fs.readFileSync(ADMIN, "utf8");
let sop;
try { sop = JSON.parse(fs.readFileSync(SOP, "utf8")); }
catch (e) { console.error(`  ✗ playbooks.json unparseable: ${e.message}`); process.exit(2); }

// RGA-side steps are the ones the admin renders (actor rga | both | unset). Client-only steps live
// in the portal, deliberately.
const rgaSide = (steps) => (steps || []).filter((s) => !s.actor || s.actor === "rga" || s.actor === "both");
const m1 = rgaSide(sop.month1);
const m2 = rgaSide(sop.month2plus);
if (!m1.length) { console.error("  ✗ no month1 steps in the SOP — cannot check"); process.exit(2); }

const fails = [];

// 1. The builder exists and reads the SOP playbook.
const hasBuilder = /function\s+sopChecklistSteps\s*\(/.test(src);
const readsPlaybook = /sopChecklistSteps[\s\S]{0,1200}?flowM1Playbook/.test(src)
  || /function\s+sopChecklistSteps[\s\S]{0,1200}?flowM2Playbook/.test(src);
if (!hasBuilder || !readsPlaybook) {
  fails.push("builder");
  console.log("  🔴 sopChecklistSteps() is missing or does not read flowM1Playbook/flowM2Playbook.");
  console.log("     The checklist would fall back to the 18-objective curated summary and hide most of the SOP.");
} else {
  console.log(`  ✅ sopChecklistSteps() builds the checklist from the SOP playbook`);
}

// 2. The renderer actually reaches it — DIRECTLY OR THROUGH ONE HOP.
//
// 🔴 2026-09-24: this failed on working code. The sequencing was extracted into
// `sopSequencedSteps()` so the next-action card and the checklist could not disagree about which
// step is active; `renderOnboardingChecklist` now calls THAT, which calls `sopChecklistSteps`. The
// builder was not dead — the gate was asserting one particular call graph.
//
// 🔑 A gate must assert the OUTCOME ("the renderer reaches the SOP builder"), not the shape of the
// code that achieves it, or every refactor looks like a regression and the gate gets muted. Same
// lesson as check-every-playbook-step-can-run, which reported four working executors as missing
// because it recognised only two handler shapes.
// → feedback_a_gate_window_measured_in_characters_will_lie
const reaches = (fnName, target, seen = new Set()) => {
  if (seen.has(fnName) || seen.size > 6) return false;
  seen.add(fnName);
  const at = src.indexOf(`function ${fnName}`);
  if (at < 0) return false;
  // brace-balance the function body rather than counting characters forward from its name
  let d = 0, end = src.length;
  for (let i = src.indexOf("{", at); i < src.length; i++) {
    if (src[i] === "{") d++;
    else if (src[i] === "}") { d--; if (!d) { end = i; break; } }
  }
  const body = src.slice(at, end);
  if (new RegExp(`\\b${target}\\s*\\(`).test(body)) return true;
  // follow same-file helpers this function calls, one level at a time
  for (const m of body.matchAll(/\b(sop[A-Za-z]+)\s*\(/g)) {
    if (m[1] !== fnName && reaches(m[1], target, seen)) return true;
  }
  return false;
};
if (!reaches("renderOnboardingChecklist", "sopChecklistSteps")) {
  fails.push("wiring");
  console.log("  🔴 renderOnboardingChecklist() never reaches sopChecklistSteps() — the builder is dead code.");
} else {
  console.log("  ✅ renderOnboardingChecklist() reaches the SOP builder");
}

// 3. The Run button must key off the SOP's own hasRunner, or steps outside the curated table lose it.
if (!/const\s+runnable\s*=\s*auto\.runnable\s*\|\|\s*o\.hasRunner/.test(src)) {
  fails.push("runnable");
  console.log("  🔴 the Run button does not honour the SOP's hasRunner flag.");
  console.log("     Steps absent from STEP_AUTOMATION would render as Manual despite having a runner.");
} else {
  console.log("  ✅ the Run button honours the SOP's hasRunner flag");
}

// Reporting: how much the old view was hiding, so the number stays visible in the daily log.
const curated = (src.match(/flowId:\s*"m1\.[^"]+"/g) || []).length;
const withRunner = m1.filter((s) => s.hasRunner).length;
console.log("");
console.log(`  SOP month-1 steps (RGA side) : ${m1.length}`);
console.log(`  …of which have a runner      : ${withRunner}`);
console.log(`  curated objectives covering  : ${curated}`);
console.log(`  month2plus steps             : ${m2.length}`);

console.log("");
if (fails.length) {
  console.error(`🔴 the admin is not rendering the full SOP (${fails.join(", ")}).`);
  console.error("   A step with no row has no Run button and cannot be completed. See");
  console.error("   project_onboarding_checklist_showed_9_of_58.");
  process.exit(1);
}
console.log(`✅ all ${m1.length} month-1 SOP steps are rendered from the canonical playbook`);
