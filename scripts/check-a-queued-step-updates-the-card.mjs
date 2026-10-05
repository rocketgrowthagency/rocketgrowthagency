#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — A QUEUED STEP UPDATES THE CARD WHEN IT LANDS
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-10-05: *"when i do run again it doesnt update unless i refresh the page after I think?
 * still showing 3:59 even though just ran it at 4:15pm?"*
 *
 * He was right, and it was caused hours earlier by moving the slow steps to the background function.
 * They now answer **202 queued** instead of returning a result. Nothing in the admin read `queued`,
 * so the card went on rendering the PREVIOUS run's draft, with the previous run's timestamp, while
 * the new one completed invisibly. (His 4:15 run HAD landed — `ran_at` 23:15:49Z. Only the screen
 * was stale.)
 *
 * 🔑 A CARD SHOWING OLD OUTPUT UNDER A BUTTON YOU JUST PRESSED IS WORSE THAN ONE SHOWING NOTHING —
 * it reads as "the run did nothing", which is the wrong conclusion.
 *
 * 🔑 AND THE TEST FOR DONE IS `ran_at` MOVING, not a status field: a background write sets status
 * `in_progress` on the way IN, so status can say "running" over a finished record and "done" over a
 * half-written one. Only the timestamp changes when the work is written.
 *
 * Exit 0 pass · 1 a queued step can finish invisibly · 2 could not run.
 */
import fs from "node:fs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
let admin, flow;
try {
  admin = fs.readFileSync(`${SITE}/admin/admin.js`, "utf8");
  flow = fs.readFileSync(`${SITE}/netlify/functions/flow-execute.js`, "utf8");
} catch { console.error("⚠️  INDETERMINATE — cannot read the sources"); process.exit(2); }

const code = admin.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
const fail = [];

// ── 1 · THE SERVER STILL ANSWERS `queued` FOR A BACKGROUND STEP ─────────────────────────────────
if (!/queued:\s*true/.test(flow)) {
  console.error("⚠️  INDETERMINATE — flow-execute no longer answers `queued`; re-pin this gate.");
  process.exit(2);
}

// ── 2 · THE ADMIN READS IT ──────────────────────────────────────────────────────────────────────
if (!/\bdata\.queued\b/.test(code)) {
  fail.push("the admin never reads `data.queued` — a backgrounded step returns 202 and the card is "
    + "left rendering the previous run, with the previous run's timestamp");
}

// ── 3 · AND WAITS FOR IT, ON THE TIMESTAMP ──────────────────────────────────────────────────────
{
  if (!/waitForStepToLand\s*\(/.test(code)) {
    fail.push("nothing waits for a queued step to land — the operator must guess when to reload");
  }
  const fn = (() => {
    const m = code.match(/async function waitForStepToLand[\s\S]*?\n\}/);
    return m ? m[0] : "";
  })();
  if (!fn) {
    fail.push("`waitForStepToLand` is called but not defined");
  } else {
    // 🔴 THE TIMESTAMP, NOT THE STATUS. A background write sets `in_progress` on the way in.
    if (!/ran_at|ranAtOf/.test(fn)) {
      fail.push("the wait does not test `ran_at` — a status field can read 'done' over a half-written "
        + "record and 'running' over a finished one");
    }
    if (/status\s*===\s*["']done["']/.test(fn)) {
      fail.push("the wait tests a status field for completion — that is the read that cannot be trusted");
    }
    // It must compare against what it was BEFORE the press, or a stale value passes immediately.
    if (!/!==\s*before|before\s*!==/.test(fn)) {
      fail.push("the wait does not compare against the timestamp from before the run — any existing "
        + "value would satisfy it instantly");
    }
    // 🔴 It must re-read the store, or it polls its own stale copy forever.
    if (!/reloadScopeAndRerender|getFlowState/.test(fn)) {
      fail.push("the wait never re-reads the flow state — it would poll a copy that cannot change");
    }
    // 🔴 A wait that gives up must not imply the work was lost.
    if (!/return null/.test(fn)) {
      fail.push("the wait has no give-up path — it would hang the press forever on a slow run");
    }
  }
}

// ── 4 · A TIMEOUT IS REPORTED AS STILL RUNNING, NOT AS A FAILURE ────────────────────────────────
// 🔑 The run continues on the server whatever the browser decided. Saying "failed" would be false.
{
  // 🔴 BRACE-MATCH THE BLOCK, NOT A CHARACTER WINDOW. A 1800-char slice reached past the queued
  // branch into the ORDINARY success path, whose own `bannerSentence(` call then satisfied the test
  // — so replacing the queued confirmation with a hardcoded "Done." still passed.
  // → feedback_a_gate_window_measured_in_characters_will_lie
  const i = code.indexOf("if (data.queued)");
  let region = "";
  if (i >= 0) {
    const open = code.indexOf("{", i);
    let d = 0;
    for (let k = open; k < code.length; k++) {
      if (code[k] === "{") d++;
      else if (code[k] === "}") { d--; if (!d) { region = code.slice(i, k + 1); break; } }
    }
  }
  if (i >= 0 && !region) {
    console.error("⚠️  INDETERMINATE — the queued branch is unbalanced; cannot read it.");
    process.exit(2);
  }
  if (region && !/Still running|still running/.test(region)) {
    fail.push("a wait that times out does not say the step is STILL RUNNING — the operator would "
      + "read it as a failure and re-run work that is already in flight");
  }
  // And the success path must re-render before announcing.
  if (region && !/reloadScopeAndRerender/.test(region)) {
    fail.push("the queued path announces a result without re-rendering the card from the store");
  }
  // 🔑 ONE CONFIRMATION PRODUCER. A background step is not a different kind of result.
  if (region && !/bannerSentence\s*\(/.test(region)) {
    fail.push("the queued path builds its own confirmation instead of using `bannerSentence` — a "
      + "background run would get a second voice");
  }
}

if (fail.length) {
  console.error("🔴 a queued step can finish without the screen saying so:");
  for (const f of fail) console.error("   · " + f);
  process.exit(1);
}
console.log("✅ a queued step is waited on by its stored timestamp, the card is re-rendered from the store, and a timeout says it is still running");
