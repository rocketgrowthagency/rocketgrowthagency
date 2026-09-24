#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-no-step-redoes-an-automated-job.mjs
//
// 🔴 WHY (2026-09-24). Step 4 "Schedule + run kickoff call" opened with five numbered steps for
// creating a Google Calendar event by hand — while step 2, `m1.close.kickoff_invite`, creates and
// sends that exact invite automatically from the Overview card.
//
// Chris hit it the obvious way: he opened the checklist, read "Schedule a 30-min GOOGLE MEET", and
// asked whether it was the same thing as Phase 0. It was, and it was not: one step BOOKS the call,
// the other RUNS it — but the second still carried the booking procedure from before the first was
// automated.
//
// 🔑 TWO STEPS DESCRIBING ONE JOB IS HOW A CHECKLIST STOPS BEING TRUSTED. Worse, a human following
// step 4 literally would create a SECOND calendar event for a call already booked, and send the
// client a duplicate invite.
//
// HOW: a registry of jobs the product automates, each naming the step that owns it and the phrases
// that mean "do this by hand". Any OTHER step whose instructions carry those phrases fails. Adding
// an automation means adding a line here — so the checklist cannot quietly keep the old procedure.
//
// exit 0 = no step redoes an automated job · 1 = one does · 2 = cannot tell
// → feedback_no_manual_step_recommendations · feedback_fix_the_class_not_the_instance
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const PLAYBOOKS = path.join(SITE, "data", "playbooks", "playbooks.json");

if (!fs.existsSync(PLAYBOOKS)) {
  console.error("⚠️  INDETERMINATE — playbooks.json not found.");
  process.exit(2);
}

// Each entry: a job the PRODUCT does, the step that owns it, and the phrases that mean
// "a human does this by hand". Deliberately specific — a vague pattern would fire on
// legitimate prose and get the gate muted.
const AUTOMATED = [
  {
    job: "booking the kickoff calendar invite",
    ownedBy: "m1.close.kickoff_invite",
    manual: [
      /google calendar\s*(?:→|->|:)\s*new event/i,
      /add google meet video conferencing/i,
      /schedule a 30-min google meet/i,
    ],
  },
  {
    job: "running the geo-grid rank scan",
    ownedBy: "m1.audit.grid_baseline",
    manual: [/\bgrid-scan\.mjs\b/i, /open\b[^.\n]{0,40}\bterminal/i],
  },
];

let steps = [];
try {
  const pb = JSON.parse(fs.readFileSync(PLAYBOOKS, "utf8"));
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (o && typeof o === "object") {
      if (o.id && /^m\d\./.test(o.id)) steps.push(o);
      Object.values(o).forEach(walk);
    }
  };
  walk(pb);
} catch (e) {
  console.error(`⚠️  INDETERMINATE — playbooks.json did not parse: ${e.message}`);
  process.exit(2);
}

if (steps.length < 50) {
  console.error(`⚠️  INDETERMINATE — parsed only ${steps.length} steps; the walker has drifted.`);
  process.exit(2);
}

const problems = [];
for (const rule of AUTOMATED) {
  // The owning step must actually exist, or this rule is guarding a job nothing does.
  if (!steps.some((s) => s.id === rule.ownedBy)) {
    problems.push(`${rule.ownedBy} is named as the owner of "${rule.job}" but no such step exists — `
      + `this rule guards nothing.`);
    continue;
  }
  for (const s of steps) {
    if (s.id === rule.ownedBy) continue;              // the owner may describe its own job
    const text = String(s.instructions || "");
    const hit = rule.manual.find((re) => re.test(text));
    if (hit) {
      problems.push(`${s.id} tells a human to do "${rule.job}" by hand — but ${rule.ownedBy} does it `
        + `automatically.\n       Matched: ${hit}\n       Following it literally would duplicate the `
        + `work the product already did.`);
    }
  }
}

if (problems.length) {
  console.error(`🔴 FAIL — ${problems.length} step(s) redo an automated job:\n`);
  for (const p of problems) console.error(`   • ${p}\n`);
  process.exit(1);
}

console.log(`✅ ${steps.length} steps checked against ${AUTOMATED.length} automated job(s) — none `
  + `instructs a human to redo work the product performs.`);
process.exit(0);
