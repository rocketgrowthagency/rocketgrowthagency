#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-two-surfaces-one-sender.mjs
//
// 🔴 WHY (Chris, 2026-09-24): "make sure any duplication reads eachother so they arent doing double
// or duplicate work and that they are synced."
//
// Phase 0 is reachable from TWO places — the curated Overview card and the numbered SOP checklist.
// That split is deliberate: Overview is what needs you today, the checklist is the full 89 steps.
// It is only safe while both routes end in the SAME function.
//
// They did not. The kickoff invite was fine — both paths call `send-kickoff-invite`, which refuses
// to create a second event. But the CONFIRMATION EMAIL diverged:
//
//     card      → a Gmail COMPOSE link; a human sent it and NOTHING was recorded
//     checklist → send-confirmation-email, which stores `gmail_message_id`
//
// `send-confirmation-email` is idempotent — it refuses to send twice by checking that stored id.
// But the guard never saw a compose-window send, so card-then-checklist would have put TWO welcome
// emails in a new client's inbox in their first hour.
//
// 🔑 A GUARD ONLY WORKS ON THE PATH THAT WRITES WHAT IT READS. Two routes to one action must
// converge on one function, or the idempotency of that function is decoration.
//
// exit 0 = every duplicated action has one sender · 1 = a surface bypasses it · 2 = cannot tell
// → feedback_fix_the_class_not_the_instance · feedback_verify_the_write_not_just_the_intent
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const ADMIN = path.join(SITE, "admin", "admin.js");
const FLOW = path.join(SITE, "netlify", "functions", "flow-execute.js");

for (const f of [ADMIN, FLOW]) {
  if (!fs.existsSync(f)) {
    console.error(`⚠️  INDETERMINATE — ${path.basename(f)} not found.`);
    process.exit(2);
  }
}
const strip = (s) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const admin = strip(fs.readFileSync(ADMIN, "utf8"));
const flow = strip(fs.readFileSync(FLOW, "utf8"));

// Actions a user can start from BOTH the Overview card and the SOP checklist, and the one function
// each must end in. Adding a shortcut to the Overview means adding a line here.
const SHARED = [
  { action: "the kickoff calendar invite", stepId: "m1.close.kickoff_invite", sender: "send-kickoff-invite" },
  { action: "the confirmation email",      stepId: "m1.close.confirm",        sender: "send-confirmation-email" },
];

const problems = [];

for (const s of SHARED) {
  // 1. The CHECKLIST route: flow-execute's executor must call the sender.
  const exec = flow.match(new RegExp(`"${s.stepId.replace(/\./g, "\\.")}":\\s*async[\\s\\S]{0,1400}?\\n  \\},`));
  if (!exec) {
    problems.push(`flow-execute has no executor for ${s.stepId} — the checklist route for ${s.action} is gone.`);
  } else if (!exec[0].includes(s.sender)) {
    problems.push(`the checklist route for ${s.action} (${s.stepId}) no longer calls ${s.sender}.`);
  }

  // 2. The CARD route: admin.js must call the same sender.
  if (!admin.includes(`/.netlify/functions/${s.sender}`)) {
    problems.push(`the Overview card does not call ${s.sender} for ${s.action} — if it reaches the `
      + `client another way, that send is invisible to ${s.sender}'s idempotency guard and the two `
      + `surfaces can both fire.`);
  }
}

// 3. 🔴 THE SPECIFIC REGRESSION: a bare Gmail COMPOSE link presented as the way to send. The draft
//    may exist as a clearly-labelled secondary route, but it must not be the primary control —
//    a human sending from Gmail writes nothing, so the guard cannot see it.
const composeAsPrimary = /class="admin-button[^"]*"[^>]*href="\$\{L\.gmail\}/.test(admin);
if (composeAsPrimary) {
  problems.push(`the Overview card offers the Gmail compose link as a BUTTON. A send from a compose `
    + `window is never recorded, so send-confirmation-email's guard cannot see it and the checklist `
    + `would send a second copy.`);
}

// 4. And if the draft route exists at all, it must SAY that sending from there is not recorded.
// 🔴 SCOPE IT TO THE HANDLER. A file-wide /not recorded/i matched an unrelated portal-invite
// label — `account.invited_at ? … : "Not recorded"` — so deleting the real warning left the gate
// green. The same file-wide-grep trap as checking cardNote's guard across the whole file.
// → feedback_dead_check_selector_gap
const draftHandler = admin.match(/data-open-draft\][\s\S]{0,700}?\n  \}\);/);
if (admin.includes("data-open-draft") && (!draftHandler || !/not recorded/i.test(draftHandler[0]))) {
  problems.push(`the "open a draft" route exists but never warns that sending from Gmail is not `
    + `recorded here — silence there is how the duplicate send happens.`);
}

if (problems.length) {
  console.error(`🔴 FAIL — ${problems.length} problem(s):\n`);
  for (const p of problems) console.error(`   • ${p}\n`);
  process.exit(1);
}

console.log(`✅ ${SHARED.length} action(s) reachable from two surfaces, each converging on one `
  + `recorded sender — no route can bypass the other's guard.`);
process.exit(0);
