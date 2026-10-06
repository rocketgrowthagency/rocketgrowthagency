#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — A STEP'S BUTTON DOES NOT LIE ABOUT WHERE THE WORK HAPPENS
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Step 26's card read **"⚡ Run (needs the local scraper)"** on 2026-10-06, hours after the step had
 * been proven to run entirely on the server — Chris pressed it and a 125-point grid scan started in
 * a Netlify background function with no terminal involved.
 *
 * Audited across the playbook: **SEVEN steps carried that label while having a server executor.** The
 * label is hand-written per step in playbooks.json and nobody updates it when a step gains a runner,
 * so it rots silently — and a reader who believes it goes looking for a terminal they do not need.
 *
 * 🔑 THE LABEL IS A CLAIM ABOUT THE CODE, SO THE CODE DECIDES IT. "Needs the local scraper" is true
 * exactly when `flow-execute` has no executor for that step — which is the same condition the server
 * itself uses to answer `mustRunLocally`.
 * → feedback_a_symbol_name_is_a_claim_about_the_codebase · feedback_instruct_by_what_is_on_screen
 *
 * Exit 0 pass · 1 a button claims the wrong place · 2 could not run.
 */
import fs from "node:fs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
let flow, pb;
try {
  flow = fs.readFileSync(`${SITE}/netlify/functions/flow-execute.js`, "utf8");
  pb = JSON.parse(fs.readFileSync(`${SITE}/data/playbooks/playbooks.json`, "utf8"));
} catch (e) { console.error(`⚠️  INDETERMINATE — cannot read the sources: ${e.message}`); process.exit(2); }

const steps = [...(pb.month1 || []), ...(pb.month2plus || [])];
if (steps.length < 20) { console.error("⚠️  INDETERMINATE — too few playbook steps."); process.exit(2); }

// 🔑 THE SAME CONDITION THE SERVER USES. `mustRunLocally` is returned when EXECUTORS has no entry.
const hasExecutor = (id) => flow.includes(`"${id}": async`);
const nExec = steps.filter((s) => hasExecutor(s.id)).length;
if (nExec < 5) {
  console.error(`⚠️  INDETERMINATE — only ${nExec} executors matched; the detection is wrong, not the labels.`);
  process.exit(2);
}

const fail = [];
const CLAIMS_LOCAL = /local scraper|in your terminal|run locally/i;

for (const s of steps) {
  const label = String(s.actionLabel || "");
  if (!label) continue;
  const claimsLocal = CLAIMS_LOCAL.test(label);
  const runsOnServer = hasExecutor(s.id);
  if (claimsLocal && runsOnServer) {
    fail.push(`${s.id} — the button says "${label}" but flow-execute has an executor for it, so it runs `
      + "on the server. A reader who believes the label goes looking for a terminal they do not need");
  }
  // 🔴 AND THE OTHER DIRECTION. A step with no runner whose button promises it will just go is worse:
  // the press does nothing a human can see, and the operator waits for work that never starts.
  if (!claimsLocal && !runsOnServer && /^⚡/.test(label)) {
    fail.push(`${s.id} — the button says "${label}" with no qualifier, but flow-execute has NO executor `
      + "for it, so pressing it cannot do the work. Say where it has to run");
  }
}

if (fail.length) {
  console.error("🔴 a step's button claims the wrong place:");
  for (const f of fail) console.error(`   · ${f}`);
  console.error(`\n   ${nExec} of ${steps.length} steps have a server executor.`);
  process.exit(1);
}
console.log(`✅ every action label agrees with where the work actually happens — ${nExec} of ${steps.length} `
  + "steps run on the server, and none of them tells the operator to open a terminal");
