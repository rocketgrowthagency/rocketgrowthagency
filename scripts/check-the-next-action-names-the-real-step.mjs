#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-the-next-action-names-the-real-step.mjs
//
// 🔴 WHY (2026-09-24). Two defects on one screen, found by looking at it.
//
// 1. THE NEXT-ACTION CARD NAMED NO ACTION. For the whole of stage 4 — 59 steps, the longest stage
//    by far — it read "Complete Month 1 onboarding · Work through the onboarding checklist in
//    order." A fixed sentence. Every other stage names a specific thing to do; this one restated
//    the phase you were already looking at in the stage bar. Chris: *"lets make sure the NEXT
//    ACTION card will show this step as next step for admin."*
//
// 2. THE HEADER AND THE CHECKLIST DISAGREED ABOUT PROGRESS, a few hundred pixels apart:
//
//        header badge : Onboarding 46% (27/59)
//        checklist    : 26 of 59 done
//
//    The numerator counted EVERY row in `tasks` — which also holds **month-2** rows (`m2.*`) and
//    the two `actor: "client"` steps that `rgaSide()` filters OUT of `flowPlaybook`. So month-2
//    progress and client-side steps inflated a month-1 percentage, while the denominator looked
//    correct. 🔑 A ratio means nothing unless both halves come from the same set.
//
// WHAT THIS CHECKS
//   static, in admin.js:
//     1. exactly ONE sequencer decides which step is active, and both surfaces call it
//     2. the next-action card derives stage 4 from it rather than hardcoding a sentence
//     3. it stays honest when the playbook has not loaded (no false "all done")
//     4. renderNextAction re-runs AFTER the playbook arrives — else the card never names anything
//     5. the onboarding badge counts the numerator by walking the PLAYBOOK, not the task store,
//        and invents no fallback denominator
//   live:
//     6. for every client, the two counting methods are compared on real rows; where they differ,
//        the OLD method is shown to be the wrong one
//
// exit 0 = the card names the real step and the counts agree · 1 = it does not · 2 = cannot tell
// → feedback_a_fix_without_a_gate_regresses · feedback_a_hardcoded_count_is_a_skipped_query
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";

// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT. A gate that can only ever read the real
// working tree cannot be pointed at a scratch copy, so its mutations cannot be run — and a
// gate nobody can make fail is a gate nobody has checked. Found 2026-10-06 when three
// mutations of `check-refusal-is-not-done` all came back green: it was reading straight past
// them. → feedback_a_gate_that_cannot_fail · feedback_the_harness_i_wrote_to_check_my_work_can_lie
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SITE = process.env.NEXTACTION_GATE_SITE_DIR || `${__SITE}`;
const ADMIN = path.join(SITE, "admin", "admin.js");
const PLAYBOOKS = path.join(SITE, "data", "playbooks", "playbooks.json");

if (!fs.existsSync(ADMIN)) {
  console.error(`⚠️  INDETERMINATE — admin.js not found at ${ADMIN}.`);
  process.exit(2);
}

// Assert on CODE. Sibling gates here have twice been satisfied by their own explanatory prose.
const raw = fs.readFileSync(ADMIN, "utf8");
const code = raw.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const problems = [];

// ── 1. one sequencer, called by both surfaces ─────────────────────────────────────────────────
const seqDefs = (code.match(/function\s+sopSequencedSteps\s*\(/g) || []).length;
if (seqDefs !== 1) {
  problems.push(`Expected exactly one \`sopSequencedSteps\` definition, found ${seqDefs}. It is the `
    + `single place that decides which step is active; a second copy is how the card and the `
    + `checklist start naming different steps.`);
} else {
  // The "active" rule must live ONLY in the sequencer. A surface that re-derives it will drift.
  const bodyStart = code.indexOf("function sopSequencedSteps");
  const others = [...code.matchAll(/uiState\s*=\s*["']active["']/g)].map((m) => m.index);
  const outside = others.filter((i) => i < bodyStart || i > bodyStart + 2000);
  if (outside.length) {
    problems.push(`Something outside sopSequencedSteps assigns uiState="active" (${outside.length} `
      + `place(s)). The active step must be decided once — that is the whole reason the sequencer `
      + `was extracted.`);
  }
  for (const caller of ["renderOnboardingChecklist", "renderNextAction"]) {
    const fnAt = code.indexOf(`function ${caller}`);
    if (fnAt < 0) { problems.push(`${caller} not found in admin.js.`); continue; }
    const window = code.slice(fnAt, fnAt + 6000);
    if (!/sopSequencedSteps\s*\(/.test(window)) {
      problems.push(`${caller} does not call sopSequencedSteps. Both the checklist and the `
        + `next-action card must read the same sequencer, or they will name different steps.`);
    }
  }
}

// ── 2. stage 4 is derived, not a fixed sentence ───────────────────────────────────────────────
const stage4 = code.match(/stage_4_onboarding:\s*\{[\s\S]{0,400}?\}/);
if (!stage4) {
  problems.push(`Could not find the stage_4_onboarding entry in the next-action map.`);
} else if (/title:\s*["']Complete Month 1 onboarding["']/.test(stage4[0])) {
  problems.push(`The next-action card still hardcodes "Complete Month 1 onboarding" for stage 4. `
    + `That is a phase name, not an action — it is the same sentence for all 59 steps and tells the `
    + `operator nothing they cannot already see in the stage bar.`);
}

// ── 3. honest when the playbook has not loaded ────────────────────────────────────────────────
{
  const at = code.indexOf("const onboardingNext");
  if (at < 0) {
    problems.push(`No \`onboardingNext\` derivation found — stage 4 is not computed from the steps.`);
  } else {
    const body = code.slice(at, at + 2500);
    if (!/if\s*\(\s*!steps\.length\s*\)/.test(body)) {
      problems.push(`The next-action card does not handle an EMPTY step list. An empty list means `
        + `"the playbook has not loaded", not "there is nothing to do" — claiming completion there `
        + `is a false all-clear, the exact failure that let "Needs your attention" say "All clear" `
        + `for the whole of Month 1.`);
    }
    if (!/complete/i.test(body) || !/blocked|locked/i.test(body)) {
      problems.push(`The next-action card does not distinguish "all steps done" from "nothing is `
        + `actionable but work remains". Those are different states and a card with no action and `
        + `no explanation reads as a bug.`);
    }
  }
}

// ── 4. the card re-renders when the steps arrive ──────────────────────────────────────────────
// 🔑 The card is drawn on client-select, BEFORE the playbook fetch resolves. Without a re-render it
// sits on its fallback forever and never names a step — correct code that never runs.
{
  const at = code.indexOf("state.flowM1Playbook =");
  if (at < 0) {
    console.error("⚠️  INDETERMINATE — could not find where the month-1 playbook is assigned.");
    process.exit(2);
  }
  const after = code.slice(at, at + 1600);
  if (!/renderNextAction\s*\(/.test(after)) {
    problems.push(`renderNextAction() is not called after the playbook loads. The card renders on `
      + `client-select, before that fetch resolves, so it would keep its "not loaded yet" fallback `
      + `permanently and never name the step — which is the entire point of the change.`);
  }
}

// ── 5. the badge counts both halves from the same set ─────────────────────────────────────────
{
  const at = code.indexOf("const onboardingTasks");
  if (at < 0) {
    problems.push(`The onboarding percentage badge was not found.`);
  } else {
    const body = code.slice(at, at + 1400);
    if (/Object\.values\(\s*onboardingTasks\s*\)\s*\.filter/.test(body)) {
      problems.push(`The onboarding badge counts done steps by walking the TASK STORE `
        + `(Object.values(onboardingTasks)). That store also holds month-2 rows and client-actor `
        + `steps which are NOT in the denominator, so the percentage is inflated by work from a `
        + `different playbook. Walk the playbook and look each step up instead.`);
    }
    if (/state\.flowPlaybook\??\.\s*length\s*\|\|\s*\d+/.test(body)) {
      problems.push(`The badge falls back to a hardcoded denominator when the playbook has not `
        + `loaded. A hardcoded count is a skipped query, and it renders a confident wrong `
        + `percentage rather than rendering nothing.`);
    }
  }
}

// ── 6. live: prove the two counting methods differ, and which one is right ─────────────────────
let liveNote = "", liveChecked = 0;
const U = process.env.SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!fs.existsSync(PLAYBOOKS)) liveNote = "playbooks.json not found";
else if (!U || !K) liveNote = "no Supabase credentials";
else {
  let book;
  try { book = JSON.parse(fs.readFileSync(PLAYBOOKS, "utf8")); }
  catch { console.error("⚠️  INDETERMINATE — playbooks.json does not parse."); process.exit(2); }
  // The same filter admin.js applies: rgaSide = actor missing | "rga" | "both".
  const rgaSide = (steps) => (steps || []).filter((s) => !s.actor || s.actor === "rga" || s.actor === "both");
  const m1 = rgaSide(book.month1);
  const h = { apikey: K, Authorization: `Bearer ${K}` };
  let recs = null;
  try {
    const r = await fetch(`${U}/rest/v1/client_onboarding_records?select=client_id,data&limit=200`, { headers: h });
    if (r.ok) recs = await r.json();
  } catch { /* handled */ }
  if (!Array.isArray(recs)) liveNote = "could not read client_onboarding_records";
  else {
    const DONE = new Set(["done", "skipped"]);
    for (const rec of recs) {
      const tasks = rec?.data?.tasks || {};
      if (!Object.keys(tasks).length) continue;
      liveChecked++;
      const oldWay = Object.values(tasks).filter((t) => DONE.has(t?.status)).length;
      const newWay = m1.filter((s) => DONE.has(tasks[s.id]?.status)).length;
      if (oldWay > m1.length) {
        problems.push(`LIVE ${rec.client_id} — the old counting method yields ${oldWay} done out of `
          + `a denominator of ${m1.length}. A percentage above 100% is the drift made undeniable.`);
      }
      if (oldWay !== newWay) {
        const strays = Object.keys(tasks).filter((k) => DONE.has(tasks[k]?.status) && !m1.some((s) => s.id === k));
        console.log(`   live ${rec.client_id.slice(0, 8)}…: task-store count ${oldWay} vs playbook count ${newWay}`
          + `${strays.length ? ` — counted from outside month-1: ${strays.join(", ")}` : ""}`);
      }
    }
  }
}

if (problems.length) {
  console.error("🔴 THE NEXT-ACTION CARD OR THE PROGRESS COUNT IS WRONG\n");
  for (const p of problems) console.error(`  🔴 ${p}\n`);
  console.error("  admin.js → sopSequencedSteps · renderNextAction · the Onboarding % badge.");
  process.exit(1);
}

console.log("✅ the next-action card names the real step, and the counts agree");
console.log("   one sequencer, read by both surfaces · stage 4 derived, not hardcoded");
console.log("   honest when the playbook has not loaded · re-renders when it arrives");
console.log("   the badge counts numerator and denominator from the same set");
console.log(liveChecked ? `   live: ${liveChecked} client record(s) cross-checked` : `   ⚠️  live half did not run — ${liveNote}`);
