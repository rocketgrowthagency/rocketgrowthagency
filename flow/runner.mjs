// Flow engine — walks a playbook, executes auto/hybrid steps, halts on manual ones.
//
// A step looks like:
//   { id, title, type: "auto" | "manual" | "hybrid", dependsOn: [], owner,
//     instructions: "what Chris must do",            // for manual + hybrid
//     async run(ctx) { return { ok, summary, outcome, outcome_data, notes } },  // auto + hybrid
//     async draft?(ctx) { return "AI draft text" }   // optional preview
//   }
//
// The runner passes ctx = { client, oauth, gbp, openai, log } to handlers.
// Handlers should be IDEMPOTENT — re-running a done step should no-op or return cached result.

import { loadClient, loadOnboardingState, loadMonthlyState, saveOnboardingTaskState, saveMonthlyTaskState, logActivity } from "./state.mjs";

const COLOR = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};
const c = (color, s) => `${COLOR[color]}${s}${COLOR.reset}`;

// ---- core helpers ----

function isStepReady(step, taskState) {
  for (const dep of step.dependsOn || []) {
    const depState = taskState?.[dep];
    if (!depState || (depState.status !== "done" && depState.status !== "skipped")) {
      return false;
    }
  }
  return true;
}

function statusSymbol(status) {
  if (status === "done") return c("green", "✓");
  if (status === "skipped") return c("yellow", "⊘");
  if (status === "blocked") return c("red", "✗");
  if (status === "in_progress") return c("cyan", "◐");
  return c("dim", "○");
}

// ---- public API ----

export async function status(playbook, clientId, { isMonthly = false } = {}) {
  const state = isMonthly
    ? await loadMonthlyState(clientId)
    : await loadOnboardingState(clientId);
  const tasks = state?.data?.tasks || {};
  const total = playbook.length;
  const done = playbook.filter((s) => tasks[s.id]?.status === "done").length;
  const skipped = playbook.filter((s) => tasks[s.id]?.status === "skipped").length;
  const blocked = playbook.filter((s) => tasks[s.id]?.status === "blocked").length;

  console.log(`\n${c("bold", `Progress: ${done}/${total} done`)}  (${skipped} skipped, ${blocked} blocked)\n`);
  playbook.forEach((s, i) => {
    const ts = tasks[s.id]?.status || "pending";
    const ready = isStepReady(s, tasks);
    const block = ts === "pending" && !ready ? c("dim", " (waiting on deps)") : "";
    console.log(`  ${String(i + 1).padStart(2)}. ${statusSymbol(ts)} ${c("dim", s.id.padEnd(40))} ${s.title}${block}`);
  });
  console.log();
}

export async function listAll(playbook) {
  console.log(`\n${c("bold", `Playbook (${playbook.length} steps)`)}\n`);
  playbook.forEach((s, i) => {
    const typeColor = s.type === "auto" ? "green" : s.type === "manual" ? "yellow" : "magenta";
    console.log(`  ${String(i + 1).padStart(2)}. ${c("dim", s.id.padEnd(40))} ${c(typeColor, `[${s.type}]`)} ${s.title}`);
  });
  console.log();
}

export async function next(playbook, clientId, { isMonthly = false } = {}) {
  const state = isMonthly
    ? await loadMonthlyState(clientId)
    : await loadOnboardingState(clientId);
  const tasks = state?.data?.tasks || {};

  for (const step of playbook) {
    const ts = tasks[step.id]?.status;
    if (ts === "done" || ts === "skipped") continue;
    if (!isStepReady(step, tasks)) continue;
    return step;
  }
  return null;
}

async function buildContext(clientId) {
  const client = await loadClient(clientId);
  const ctx = { client, clientId };

  // Lazy-load Google client only if needed (don't crash if OAuth isn't done yet)
  ctx.getOauth = async () => {
    const { getGoogleClient } = await import("../lib/google-api-client.mjs");
    return getGoogleClient(clientId);
  };
  ctx.getGbp = async () => {
    const { gbpFor } = await import("../lib/gbp-automation.mjs");
    return gbpFor(clientId);
  };

  return ctx;
}

export async function executeStep(step, clientId, { isMonthly = false, dryRun = false, force = false } = {}) {
  const saver = isMonthly ? saveMonthlyTaskState : saveOnboardingTaskState;
  const ctx = await buildContext(clientId);

  // SAFEGUARD: refuse to execute if dependencies not met (unless --force)
  if (!force) {
    const stateFn = isMonthly ? loadMonthlyState : loadOnboardingState;
    const state = await stateFn(clientId);
    const tasks = state?.data?.tasks || {};
    if (!isStepReady(step, tasks)) {
      const missing = (step.dependsOn || []).filter((dep) => {
        const ts = tasks[dep]?.status;
        return ts !== "done" && ts !== "skipped";
      });
      console.log(`\n${c("red", "⚠ CAUTION — Cannot run this step.")}`);
      console.log(`${c("yellow", `Step: ${step.id} (${step.title})`)}`);
      console.log(`Pending dependencies (must be 'done' or 'skipped' first):`);
      missing.forEach((m) => console.log(`  ${c("yellow", "→")} ${m}`));
      console.log(`\n${c("dim", "To override (NOT RECOMMENDED): re-run with --force")}\n`);
      return { halted: true, reason: "deps-not-met", missing };
    }
  }

  console.log(`\n${c("bold", `▶ ${step.id}`)}  ${c("dim", `[${step.type}]`)}`);
  console.log(`  ${step.title}\n`);

  if (step.type === "manual") {
    console.log(c("yellow", "MANUAL STEP — instructions:\n"));
    console.log(step.instructions || "(no instructions)");
    console.log(`\nMark done with: ${c("cyan", `node flow.mjs ${clientId} done ${step.id}`)}`);
    if (!dryRun) await saver(clientId, step.id, { status: "in_progress", started_at: new Date().toISOString() });
    return { halted: true, reason: "manual" };
  }

  if (step.type === "auto" || step.type === "hybrid") {
    if (!step.run) {
      console.log(c("red", "auto/hybrid step missing run() — falling back to manual instructions"));
      console.log(step.instructions || "(no instructions)");
      if (!dryRun) await saver(clientId, step.id, { status: "in_progress", started_at: new Date().toISOString() });
      return { halted: true, reason: "no-runner" };
    }

    try {
      console.log(c("cyan", "Running auto action..."));
      if (dryRun) {
        console.log(c("dim", "(dry-run — would execute step.run() here)"));
        return { halted: false, dryRun: true };
      }
      const result = await step.run(ctx);
      const summary = result?.summary || "OK";
      console.log(c("green", `✓ ${summary}`));

      if (step.type === "hybrid" && step.instructions) {
        console.log(`\n${c("yellow", "FOLLOW-UP (manual):")}`);
        console.log(step.instructions);
        await saver(clientId, step.id, {
          status: "in_progress",
          started_at: new Date().toISOString(),
          auto_result: result || null,
        });
        console.log(`\nWhen done: ${c("cyan", `node flow.mjs ${clientId} done ${step.id}`)}`);
        return { halted: true, reason: "hybrid-followup" };
      }

      await saver(clientId, step.id, {
        status: "done",
        completed_at: new Date().toISOString(),
        outcome: result?.outcome || null,
        outcome_data: result?.outcome_data || null,
        notes: result?.notes || null,
        auto_result: result || null,
      });
      await logActivity(clientId, "flow_step_done", { step_id: step.id, summary });
      return { halted: false, completed: true };
    } catch (err) {
      console.log(c("red", `✗ FAILED: ${err.message}`));
      if (!dryRun) await saver(clientId, step.id, {
        status: "blocked",
        blocked_at: new Date().toISOString(),
        error: err.message,
      });
      return { halted: true, reason: "error", error: err.message };
    }
  }
}

// Robot mode: walk EVERY pending step that has deps satisfied, executing auto/hybrid,
// queuing manual ones for Chris at the end. Maximizes automation per run.
// IMPORTANT: hybrid + manual steps in `in_progress` are TERMINAL for this pass —
// they require Chris's input before re-running.
export async function runAll(playbook, clientId, { isMonthly = false, dryRun = false, maxSteps = 100 } = {}) {
  const stateFn = isMonthly ? loadMonthlyState : loadOnboardingState;
  const queuedManual = [];
  const executedThisRun = new Set(); // never re-execute the same step in one run-all
  let executed = 0;
  let pass = 0;

  // Multi-pass: each pass may unblock new auto steps via deps
  while (pass < 10) {
    pass++;
    const state = await stateFn(clientId);
    const tasks = state?.data?.tasks || {};
    let progressedThisPass = false;

    for (const step of playbook) {
      const ts = tasks[step.id]?.status;
      // Terminal states (don't re-touch): done, skipped, in_progress, blocked
      if (ts === "done" || ts === "skipped" || ts === "blocked") continue;
      if (ts === "in_progress") {
        // Already in Chris's queue — surface in summary but don't re-run
        if (!queuedManual.find((s) => s.id === step.id)) queuedManual.push(step);
        continue;
      }
      if (executedThisRun.has(step.id)) continue;
      if (!isStepReady(step, tasks)) continue;
      if (executed >= maxSteps) break;

      if (step.type === "manual") {
        if (!dryRun) {
          const saver = isMonthly ? saveMonthlyTaskState : saveOnboardingTaskState;
          await saver(clientId, step.id, { status: "in_progress", started_at: new Date().toISOString() });
        }
        queuedManual.push(step);
        executedThisRun.add(step.id);
        progressedThisPass = true;
        continue;
      }

      // auto / hybrid — actually execute
      const result = await executeStep(step, clientId, { isMonthly, dryRun });
      executed++;
      executedThisRun.add(step.id);
      progressedThisPass = true;

      if (step.type === "hybrid" && result?.halted) {
        // hybrid leaves a manual followup — queue it for the summary
        if (!queuedManual.find((s) => s.id === step.id)) queuedManual.push(step);
      }

      // refresh state for next iteration of for-loop within same pass
      const fresh = await stateFn(clientId);
      Object.assign(tasks, fresh?.data?.tasks || {});
    }

    if (!progressedThisPass) break;
  }

  // Print summary of pending manual work
  console.log(`\n${c("bold", `─── Robot pass complete ───`)}`);
  console.log(`  ${c("green", `✓ ${executed} auto/hybrid step${executed === 1 ? "" : "s"} executed`)}`);
  if (queuedManual.length) {
    console.log(`  ${c("yellow", `⚠ ${queuedManual.length} manual step${queuedManual.length === 1 ? "" : "s"} pending — Chris must do these:`)}\n`);
    queuedManual.forEach((s) => {
      console.log(`    ${c("yellow", `→ ${s.id}`)}  ${s.title}`);
    });
    console.log(`\n  ${c("dim", "View instructions for any one with:")} ${c("cyan", `node flow.mjs ${clientId} run <step_id>`)}`);
    console.log(`  ${c("dim", "Mark done after completing:")} ${c("cyan", `node flow.mjs ${clientId} done <step_id>`)}`);
  } else {
    console.log(`  ${c("green", "✓ No manual work pending. Robot caught up.")}`);
  }
  console.log();
}

export async function markDone(playbook, clientId, stepId, { isMonthly = false, outcome = null, outcomeData = null, notes = null, force = false } = {}) {
  const step = playbook.find((s) => s.id === stepId);
  if (!step) throw new Error(`Step ${stepId} not in playbook`);

  if (!force) {
    const stateFn = isMonthly ? loadMonthlyState : loadOnboardingState;
    const state = await stateFn(clientId);
    const tasks = state?.data?.tasks || {};
    if (!isStepReady(step, tasks)) {
      const missing = (step.dependsOn || []).filter((dep) => {
        const ts = tasks[dep]?.status;
        return ts !== "done" && ts !== "skipped";
      });
      console.log(`\n${c("red", "⚠ CAUTION — Cannot mark this step done.")}`);
      console.log(`Pending dependencies (must be done/skipped first):`);
      missing.forEach((m) => console.log(`  ${c("yellow", "→")} ${m}`));
      console.log(`\n${c("dim", "To override (NOT RECOMMENDED): add --force")}\n`);
      return;
    }
  }

  const saver = isMonthly ? saveMonthlyTaskState : saveOnboardingTaskState;
  await saver(clientId, stepId, {
    status: "done",
    completed_at: new Date().toISOString(),
    outcome, outcome_data: outcomeData, notes,
  });
  await logActivity(clientId, "flow_step_done_manual", { step_id: stepId, outcome });
  console.log(c("green", `✓ Marked ${stepId} done.`));
}

export async function markSkip(playbook, clientId, stepId, { isMonthly = false, reason = null } = {}) {
  const saver = isMonthly ? saveMonthlyTaskState : saveOnboardingTaskState;
  await saver(clientId, stepId, {
    status: "skipped",
    skipped_at: new Date().toISOString(),
    notes: reason,
  });
  console.log(c("yellow", `⊘ Skipped ${stepId}.`));
}

export async function markBlocked(playbook, clientId, stepId, { isMonthly = false, reason = null } = {}) {
  const saver = isMonthly ? saveMonthlyTaskState : saveOnboardingTaskState;
  await saver(clientId, stepId, {
    status: "blocked",
    blocked_at: new Date().toISOString(),
    notes: reason,
  });
  console.log(c("red", `✗ Blocked ${stepId}: ${reason || "(no reason)"}.`));
}
