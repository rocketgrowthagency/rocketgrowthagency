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

const code = admin.replace(/^\s*\/\/.*$/gm, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
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

// ── A SILENT WAIT IS INDISTINGUISHABLE FROM A HANG ─────────────────────────────────────────────
// 🔴 Chris waited two minutes on a step that takes two and a half and concluded it was broken. The
// run was fine; the banner was one unchanging sentence for the whole time. The step got slower when
// the map-pack and sub-location probes were added, and the waiting message did not change.
// 🔑 AN ELAPSED COUNT IS THE CHEAPEST POSSIBLE PROOF OF LIFE.
{
  const code2 = admin.replace(/^[ \t]*\/\/.*$/gm, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
  if (!/onTick/.test(code2)) {
    fail.push("the background wait has no per-poll callback — the banner cannot change while a step runs, "
      + "so a two-minute wait looks exactly like a hang");
  }
  if (!/onTick\s*:/.test(code2)) {
    fail.push("the queued branch never passes onTick — the wait supports progress and nothing asks for it");
  }
  // 🔴 SCOPE IT TO THE CALLBACK. A file-wide search for "elapsed" passed with the count deleted from
  // the banner — the kickoff call console has an elapsed clock of its own, nine thousand lines away.
  // 🔑 A WORD THAT APPEARS SOMEWHERE ELSE IN THE FILE IS NOT EVIDENCE ABOUT THIS BRANCH.
  // → feedback_a_gate_window_measured_in_characters_will_lie
  {
    const ti = code2.indexOf("onTick:");
    let body = "";
    if (ti >= 0) {
      const o = code2.indexOf("{", code2.indexOf("=>", ti));
      let d = 0;
      for (let i = o; i < code2.length && i < o + 4000; i++) {
        if (code2[i] === "{") d++;
        else if (code2[i] === "}") { d--; if (!d) { body = code2.slice(o, i + 1); break; } }
      }
    }
    if (!body) {
      fail.push("cannot isolate the onTick callback body — the progress banner cannot be checked");
    } else {
      if (!/setBanner\(/.test(body)) {
        fail.push("the per-poll callback does not update the banner — the wait ticks and the screen never changes");
      }
      // 🔴 THE PRINTED LINE, NOT THE CALCULATION. Checking the body for `secs` passed with the count
      // deleted from the banner text, because the seconds are still computed two lines above to build
      // a variable nothing prints. A number worked out and not shown is not feedback.
      const printed = (body.match(/lines\s*:\s*\[([\s\S]*?)\]/) || [])[1] || "";
      if (!printed) {
        fail.push("the per-poll callback builds no banner line at all");
      } else if (!/\$\{\s*(clock|secs|elapsed)/i.test(printed)) {
        fail.push("the per-poll banner line does not interpolate how long the step has been running — the "
          + "sentence is identical on every poll, which is exactly the signal a reader uses to decide "
          + "nothing is happening");
      }
    }
  }
  // 🔑 And it must say a refresh is unnecessary, because the last two times this broke, the first
  // thing Chris did was refresh — which destroys the wait that was about to deliver the answer.
  if (!/do not need to refresh|no need to refresh/i.test(code2)) {
    fail.push("the waiting banner does not tell the operator a refresh is unnecessary — refreshing cancels "
      + "the wait that would have shown the result");
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴🔴🔴 THE THING THAT DIED CANNOT TELL YOU IT DIED (2026-10-06).
//
// A run started 18:21:53 and was never heard from again — one INFO line in the function log and
// nothing after it. **Ten and a half minutes later the row still read `in_progress`, `failed_at:
// null`, `error: null`.** The server's own nine-minute deadline, written precisely for this, NEVER
// FIRED: the platform killed the process before the timer could run.
//
// 🔑 A SERVER-SIDE DEADLINE IS A COURTESY, NOT A GUARANTEE. The browser is the only party still alive
// when a run dies, so it must reach the conclusion from the timestamps it can already see — and it
// must do so ON A COLD LOAD, because a hard refresh throws the wait away, which is exactly what
// Chris did before reporting "still not showing updated".
// → feedback_unloaded_is_not_an_answer
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
{
  const c = admin.replace(/^[ \t]*\/\/.*$/gm, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
  if (!/function obStalledRun\(/.test(c)) {
    fail.push("nothing decides that a run has died — the card depends entirely on the server writing a "
      + "failure, and a killed process cannot write one");
  }
  // 🔴 ON A COLD LOAD, not only inside the wait.
  if (!/\$\{obStalledNoteHtml\(s\.task\)\}/.test(c)) {
    fail.push("the dead-run notice is not rendered on a step row — it would only ever appear inside a "
      + "live wait, and a hard refresh throws that away");
  }
  // 🔴 EVERY ROW STATE A TASK CAN SIT IN. The first build put it on `done` and `active`; the real
  // stalled step rendered as **queued** ("Up next"), so the notice was nowhere to be seen on the one
  // card it was written for. A new state is not finished until every surface that renders it knows
  // its name. → feedback_a_marker_that_encodes_state_goes_stale_on_an_in_place_toggle
  for (const state of ["done", "active", "queued"]) {
    // the done row's class grew a kickoff prefix on 2026-10-08 (`kick2 || kick4Req ? "active" : …`);
    // find it by its declined/done tail, not its exact spelling
    const i = state === "done"
      ? c.search(/class="ob-step \$\{[^`]*?declined \? "declined" : "done"\}/)
      : state === "active" ? c.search(/class="ob-step (active"|\$\{step4Waits \? "waits" : "active"\}")/)
      : c.indexOf(`class="ob-step ${state}"`);
    const row = i < 0 ? "" : c.slice(i, i + 900);
    if (!row) { fail.push(`cannot find the ${state} row to check; re-pin this gate`); continue; }
    if (!/obStalledNoteHtml\(/.test(row)) {
      fail.push(`the dead-run notice is not rendered on the ${state.toUpperCase()} row — a step whose `
        + `run died can sit in that state, and there it would say nothing at all`);
    }
  }
  // 🔴 AND THE WAIT MUST REACH THE SAME CONCLUSION, rather than sitting out its full window on a run
  // that is already dead and then saying "it will finish on its own".
  const wi = c.indexOf("async function waitForStepToLand");
  const wbody = wi >= 0 ? c.slice(wi, wi + 2200) : "";
  if (!/obStalledRun\(/.test(wbody)) {
    fail.push("the background wait does not check for a stalled run — it would report \"still running\" "
      + "for its whole window over a process that is already gone");
  }
  // 🔑 UNKNOWN IS NEVER DEAD: it must need two real timestamps in the wrong order.
  const si = c.indexOf("function obStalledRun(");
  const sbody = si >= 0 ? c.slice(si, si + 1100) : "";
  if (!/Number\.isFinite\(started\)/.test(sbody) || !/ran >= started/.test(sbody)) {
    fail.push("obStalledRun does not require two real timestamps in the wrong order — a hybrid step "
      + "that finished stays in_progress forever and would be branded dead");
  }
  // 🔴🔴 A MISSING ran_at IS UNKNOWN, NOT "NEVER PRODUCED". Treating it as evidence branded SIX
  // healthy steps DID NOT FINISH on the live card — hybrid steps that ran successfully on 2026-09-15,
  // carry an auto_result, and have no ran_at only because the field did not exist then. The notice
  // claims "the server stopped without recording why", and an absence cannot support a claim that
  // specific. → feedback_an_absence_must_never_be_readable_as_a_value
  if (!/if \(!Number\.isFinite\(ran\)\) return null;/.test(sbody)) {
    fail.push("obStalledRun treats a MISSING ran_at as proof the step never produced anything — every "
      + "hybrid step that ran before ran_at existed would be branded a dead run, and a warning on six "
      + "healthy steps is how the one true warning stops being read");
  }
}

if (fail.length) {
  console.error("🔴 a queued step can finish without the screen saying so:");
  for (const f of fail) console.error("   · " + f);
  process.exit(1);
}
console.log("✅ a queued step is waited on by its stored timestamp, the card is re-rendered from the store, and a timeout says it is still running");
