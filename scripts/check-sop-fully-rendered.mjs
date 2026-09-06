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

const WEB = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
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

// 2. The renderer actually calls it.
if (!/renderOnboardingChecklist[\s\S]{0,900}?sopChecklistSteps\(/.test(src)) {
  fails.push("wiring");
  console.log("  🔴 renderOnboardingChecklist() does not call sopChecklistSteps() — the builder is dead code.");
} else {
  console.log("  ✅ renderOnboardingChecklist() calls it");
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
