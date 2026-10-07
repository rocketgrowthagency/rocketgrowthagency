#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// EVERY RUN OF A STEP IS KEPT, AND NO RUN IS EVER REWRITTEN
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴🔴 WHY (approved 2026-10-07, reports/mockups/admin_every_run_is_kept_v1.html). A step's state
// lives at `client_onboarding_records.data.tasks[stepId]`, written with a spread merge — an UPDATE.
// Every run destroyed the one before it. Step 22 ran three times that day and only the third
// survived, and the lost one is the interesting one: it is the run that was WRONG, reporting two
// listings a stricter check later proved were Yelp's and Angi's own corporate pages.
//
// Chris: *"when new data is run again we dont lose it we just add a new row… this way we can keep
// the clients data and show the progress over time. IMPORTANT."*
//
// 🔑 HISTORY IS NOT LOST BY DECISION. It is lost because UPDATE is the default shape of a write —
// which is exactly how `task.published.before` was destroyed, the reason `client_change_log` exists.
// So this checks the two things that make the table worth having:
//   1. every path that finishes a step INSERTS a run
//   2. nothing in our code ever updates or deletes one
//
// 🔴 The database enforces it too (a BEFORE UPDATE OR DELETE trigger that raises). This gate is the
// half that catches a write being added in code, before it reaches a database that would reject it
// at runtime, in production, inside a step somebody is watching.
//
// Exit 0 healthy · 1 the product is wrong · 2 INDETERMINATE

import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const fails = [];
const F = (m) => fails.push(m);

const strip = (src) => src.split("\n").map((l) => l.replace(/^\s*\/\/.*$/, "").replace(/\s\/\/\s.*$/, "")).join("\n")
  .replace(/\/\*[\s\S]*?\*\//g, "");

const read = (rel, what) => {
  try { return fs.readFileSync(path.join(SITE, rel), "utf8"); }
  catch { console.error(`⚠️  INDETERMINATE — cannot read ${what}`); process.exit(2); }
};

// ═══ 1 — THE MIGRATION EXISTS AND ENFORCES IT IN THE DATABASE ════════════════════════════════
{
  const sql = read("docs/supabase/RGA_CLIENT_STEP_RUNS_2026-10-07.sql", "the step-runs migration");
  if (!/create table if not exists public\.client_step_runs/.test(sql)) F("the migration no longer creates client_step_runs");
  // 🔴 A TRIGGER IS THE ONLY THING A FUTURE SCRIPT CANNOT ROUTE AROUND. A gate stops OUR code; it
  // does not stop a dashboard edit or a one-off fix.
  if (!/before update or delete on public\.client_step_runs/i.test(sql)) {
    F("the append-only trigger is gone from the migration — the table would be editable by anything with the key");
  }
  if (!/raise exception/i.test(sql)) F("the append-only trigger no longer raises, so an update would silently succeed");
  for (const col of ["ran_at", "started_at", "finished_at", "summary", "outcome_data", "method", "step_id", "client_id"]) {
    if (!new RegExp(`\\b${col}\\b`).test(sql)) F(`client_step_runs no longer has ${col} — the strip cannot show what it promised`);
  }
}

// ═══ 2 — EVERY PATH THAT FINISHES A STEP RECORDS ONE ═════════════════════════════════════════
{
  const exec = strip(read("netlify/functions/flow-execute.js", "flow-execute.js"));
  if (!/function recordStepRun\(/.test(exec)) F("recordStepRun is gone — no run would be kept at all");
  // it must be called where the run is persisted, not merely defined
  const atSave = exec.indexOf("await saveTaskState(client, step_id, taskState, is_monthly)");
  if (atSave < 0) F("the run no longer persists through saveTaskState; this gate cannot find where to check");
  else if (!/recordStepRun\(/.test(exec.slice(atSave, atSave + 500))) {
    F("a step's run is saved to the onboarding record but never added to client_step_runs — the spread merge destroys it and nothing keeps it");
  }
  // 🔑 AND THE FAILURE PATH. The heavy-background function writes the record directly rather than
  // going through flow-execute, so it is the one kind of run that silently escapes the history —
  // and "it failed twice before it worked" is exactly what the history is for.
  const heavy = strip(read("netlify/functions/flow-execute-heavy-background.js", "flow-execute-heavy-background.js"));
  if (!/client_step_runs/.test(heavy)) {
    F("a heavy step that FAILS records nothing in client_step_runs — that path writes the onboarding record directly and bypasses recordStepRun");
  }
}

// ═══ 3 — NOTHING IN OUR CODE EVER REWRITES A RUN ═════════════════════════════════════════════
{
  const dir = path.join(SITE, "netlify/functions");
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".js")); }
  catch { console.error("⚠️  INDETERMINATE — cannot list netlify/functions"); process.exit(2); }
  let writers = 0;
  for (const f of files) {
    const code = strip(fs.readFileSync(path.join(dir, f), "utf8"));
    if (!code.includes("client_step_runs")) continue;
    writers++;
    // a PATCH or DELETE aimed at this table, in any of the shapes used in this codebase
    for (const m of code.matchAll(/client_step_runs[^\n]{0,160}/g)) {
      const line = m[0];
      if (/method:\s*["'](PATCH|PUT|DELETE)["']/.test(line)) {
        F(`netlify/functions/${f} issues a ${/(PATCH|PUT|DELETE)/.exec(line)[1]} against client_step_runs — a run is what happened; correct it by inserting another`);
      }
    }
  }
  if (!writers) F("nothing writes client_step_runs at all");
}

if (fails.length) {
  console.error("🔴 a step's history can be lost or rewritten:");
  for (const f of fails) console.error("   · " + f);
  process.exit(1);
}
console.log("✅ every run is kept — the table is append-only in the database, both finish paths insert a run, and no code rewrites one");
