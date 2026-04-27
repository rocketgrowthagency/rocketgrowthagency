#!/usr/bin/env node
// flow — robotic playbook runner. Walks Month 1 (or Month 2+) playbook for any client,
// auto-executing every automatable step, halting on manual ones with crisp instructions.
//
// Usage:
//   node flow.mjs <client_id> next                  → run next pending step (auto-executes if possible)
//   node flow.mjs <client_id> run-all               → walk forward until we hit a manual step or the end
//   node flow.mjs <client_id> status                → show progress
//   node flow.mjs <client_id> list                  → show full playbook
//   node flow.mjs <client_id> done <step_id>        → mark step done (for manual steps)
//   node flow.mjs <client_id> skip <step_id>        → mark skipped
//   node flow.mjs <client_id> blocked <step_id> "<reason>" → mark blocked
//   node flow.mjs <client_id> run <step_id>         → force-run a single step (re-runs auto handler)
//
// Add --monthly to operate on the current Month 2+ cycle instead of Month 1 onboarding.
// Add --dry to print what would run without persisting state changes.

import { month1 } from "./flow/playbooks/month1.mjs";
import { month2plus } from "./flow/playbooks/month2plus.mjs";
import { next, runAll, executeStep, status, listAll, markDone, markSkip, markBlocked } from "./flow/runner.mjs";

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("Usage: node flow.mjs <client_id> <next|run-all|status|list|done|skip|blocked|run> [stepId] [reason] [--monthly] [--dry]");
  process.exit(1);
}

const clientId = args[0];
const cmd = args[1];
const isMonthly = args.includes("--monthly");
const dryRun = args.includes("--dry");
const playbook = isMonthly ? month2plus : month1;
const positionals = args.slice(2).filter((a) => !a.startsWith("--"));

switch (cmd) {
  case "list":
    await listAll(playbook);
    break;

  case "status":
    await status(playbook, clientId, { isMonthly });
    break;

  case "next": {
    const step = await next(playbook, clientId, { isMonthly });
    if (!step) { console.log("\n✓ No pending steps with deps satisfied. (status to confirm)\n"); break; }
    await executeStep(step, clientId, { isMonthly, dryRun });
    break;
  }

  case "run-all":
    await runAll(playbook, clientId, { isMonthly, dryRun });
    break;

  case "run": {
    const stepId = positionals[0];
    if (!stepId) { console.error("Missing stepId"); process.exit(1); }
    const step = playbook.find((s) => s.id === stepId);
    if (!step) { console.error(`Step ${stepId} not in playbook`); process.exit(1); }
    const force = args.includes("--force");
    await executeStep(step, clientId, { isMonthly, dryRun, force });
    break;
  }

  case "done": {
    const stepId = positionals[0];
    if (!stepId) { console.error("Missing stepId"); process.exit(1); }
    const outcomeIdx = args.indexOf("--outcome");
    const outcome = outcomeIdx >= 0 ? args[outcomeIdx + 1] : null;
    const dataIdx = args.indexOf("--data");
    const outcomeData = dataIdx >= 0 ? { value: args[dataIdx + 1] } : null;
    const notesIdx = args.indexOf("--notes");
    const notes = notesIdx >= 0 ? args[notesIdx + 1] : null;
    await markDone(playbook, clientId, stepId, { isMonthly, outcome, outcomeData, notes });
    break;
  }

  case "skip": {
    const stepId = positionals[0];
    if (!stepId) { console.error("Missing stepId"); process.exit(1); }
    const reason = positionals[1] || null;
    await markSkip(playbook, clientId, stepId, { isMonthly, reason });
    break;
  }

  case "blocked": {
    const stepId = positionals[0];
    const reason = positionals.slice(1).join(" ");
    if (!stepId) { console.error("Missing stepId"); process.exit(1); }
    await markBlocked(playbook, clientId, stepId, { isMonthly, reason });
    break;
  }

  default:
    console.error(`Unknown command: ${cmd}`);
    process.exit(1);
}
