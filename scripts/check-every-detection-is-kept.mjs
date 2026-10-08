#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// EVERY MEASUREMENT OF A DETECTED STEP IS KEPT, AND THE NUMBER NEVER COMES OUT OF THE PROSE
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴🔴 Nine steps complete by MEASUREMENT. Each probe's answer was stored with a spread merge:
//
//     t0[stepId] = { ...(t0[stepId] || {}), detected: { verdict, evidence, at } };   -- an UPDATE
//
// so every re-check DESTROYED the one before it. "We have 0 photos — 20 were needed" on 2026-10-07
// would vanish the moment seven photos arrived, taking with it any answer to *when did this start
// moving?*. That is the THIRD time this exact merge has cost us history, after `client_change_log`
// and `client_step_runs`. → project_a_detection_is_kept · project_every_run_is_kept
//
// 🔴 AND THE SECOND HALF IS JUST AS LOAD-BEARING. The card's progress bar must be drawn from a
// NUMBER the probe returns, never parsed back out of the sentence it also returns. The step card
// used to regex-parse its own prose into a table and broke the day the wording changed.
// → feedback_a_design_that_reads_a_grammar_is_broken_by_rewriting_the_text
//
// Exit 0 healthy · 1 a reading can be lost or invented · 2 INDETERMINATE

import fs from "node:fs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const fails = [];
const F = (m) => fails.push(m);

// 🔴 LINE COMMENTS FIRST, THEN BLOCKS — the other order deletes code.
// → feedback_a_comment_stripper_in_the_wrong_order_deletes_code
const strip = (src) => src.split("\n").map((l) => l.replace(/^\s*\/\/.*$/, "").replace(/\s\/\/\s.*$/, "")).join("\n")
  .replace(/\/\*[\s\S]*?\*\//g, "");
const read = (rel, what) => {
  try { return fs.readFileSync(`${SITE}/${rel}`, "utf8"); }
  catch { console.error(`⚠️  INDETERMINATE — cannot read ${what}`); process.exit(2); }
};

const TABLE = "client_step_detections";

// ═══ 1 — THE TABLE EXISTS, AND IT IS APPEND-ONLY IN THE DATABASE ═════════════════════════════
{
  const sql = read(`docs/supabase/RGA_CLIENT_STEP_DETECTIONS_2026-10-07.sql`, "the detections migration");
  if (!new RegExp(`create table if not exists public\\.${TABLE}`).test(sql)) {
    F(`the migration no longer creates ${TABLE}`);
  }
  // 🔑 A GATE STOPS OUR CODE. A TRIGGER STOPS EVERYTHING ELSE — a future script, a dashboard edit,
  // a well-meaning fix. That is the only reason a row can be trusted as "what we saw".
  if (!/before update or delete on public\.client_step_detections/i.test(sql)) {
    F("the append-only trigger is not BEFORE UPDATE OR DELETE, so a reading can be rewritten");
  }
  if (!/raise exception/i.test(sql)) {
    F("the trigger function does not raise, so it permits the write it exists to refuse");
  }
  // the structured number must have somewhere to live
  for (const col of ["measured_n", "threshold", "verdict", "evidence", "checked_at"]) {
    if (!new RegExp(`\\b${col}\\b`).test(sql)) F(`the table has no \`${col}\` column`);
  }
  // 🔑 SCOPED LIKE EVERY OTHER CLIENT TABLE. A policy of its own invention is how one table comes
  // to be readable by somebody the others exclude.
  if (!/current_user_owns_client\(client_id\)/.test(sql)) {
    F("the admin read policy does not use `current_user_owns_client`, the predicate every other client table uses");
  }
}

// ═══ 2 — EVERY PROBE IS RECORDED, AND NOTHING EVER REWRITES ONE ══════════════════════════════
{
  const fnDir = `${SITE}/netlify/functions`;
  let files;
  try { files = fs.readdirSync(fnDir).filter((f) => f.endsWith(".js")); }
  catch { console.error("⚠️  INDETERMINATE — cannot list netlify/functions"); process.exit(2); }

  let writers = 0;
  for (const f of files) {
    const src = strip(fs.readFileSync(`${fnDir}/${f}`, "utf8"));
    if (!src.includes(TABLE)) continue;
    for (const line of src.split("\n")) {
      if (!line.includes(TABLE) && !/client_step_detections/.test(line)) continue;
    }
    // any non-POST verb aimed at the table is a rewrite
    const re = new RegExp(`${TABLE}[^\\n]*`, "g");
    for (const hit of src.match(re) || []) {
      if (/method:\s*["'](PATCH|PUT|DELETE)["']/.test(hit)) {
        F(`${f} issues a rewrite against ${TABLE}: ${hit.trim().slice(0, 90)}`);
      }
    }
    if (/method:\s*["']POST["']/.test(src) && src.includes(TABLE)) writers++;
  }
  if (!writers) F(`nothing writes ${TABLE} at all — the readings are not being kept`);

  const recheck = strip(read("netlify/functions/portal-step-recheck.js", "portal-step-recheck.js"));
  if (!/async function recordDetection\(/.test(recheck)) {
    console.error("⚠️  INDETERMINATE — cannot find recordDetection in portal-step-recheck; re-read it.");
    process.exit(2);
  }
  // 🔴 RECORDED ON EVERY PROBE, NOT ONLY WHEN THE ANSWER CHANGES. An unchanged reading is still a
  // reading, and "it was still 0 on Friday" is exactly the series this table exists to hold.
  // 🔴 `[^)]*` CANNOT MATCH A CALL WITH NESTED PARENS. The real call ends
  // `... : (gate.email ? "client" : "admin"));`, so that class stopped at the FIRST `)` and the
  // gate reported "never called" about a call two lines above it. Same trap as the regex-full-of-
  // capture-groups one. Match the call's START and let the line be whatever it is.
  // → feedback_how_design_work_gets_done_first_time
  const call = /await recordDetection\(/.exec(recheck);
  if (!call) F("recordDetection is defined but never called, so no reading is ever kept");
  else {
    const before = recheck.slice(0, recheck.indexOf(call[0]));
    if (/if\s*\([^)]*verdict[^)]*\)\s*{?\s*$/.test(before.trimEnd())) {
      F("the recording is behind a verdict test — an unchanged reading would not be kept");
    }
  }
  // 🔑 A FAILED RECORDING MUST NOT FAIL THE CHECK: the measurement happened and the client is owed
  // its answer. But a swallowed ReferenceError is how four bare catches hid a broken feature.
  const body = recheck.slice(recheck.indexOf("async function recordDetection("));
  if (!/catch\s*\(\s*e\s*\)/.test(body.slice(0, 1400))) {
    F("recordDetection does not catch, so a history failure would fail the whole check");
  }
  if (!/instanceof ReferenceError/.test(body.slice(0, 1400))) {
    F("recordDetection's catch swallows ReferenceError, which is how a typo becomes a silent no-op");
  }
}

// ═══ 3 — THE NUMBER TRAVELS AS A NUMBER, AND THE CARD NEVER PARSES THE SENTENCE ══════════════
{
  const recheck = strip(read("netlify/functions/portal-step-recheck.js", "portal-step-recheck.js"));
  const cp = /async function countProbe\([\s\S]{0,900}?\n}/.exec(recheck);
  if (!cp) { console.error("⚠️  INDETERMINATE — cannot find countProbe"); process.exit(2); }
  if (!/\bn\b\s*,|\bn\s*,|{\s*n\s*,/.test(cp[0]) || !/threshold/.test(cp[0])) {
    F("countProbe no longer returns the number and threshold beside its sentence, so the card has "
      + "nothing to draw a bar from but the prose");
  }

  const admin = strip(read("admin/admin.js", "admin/admin.js"));
  const fn = /function obDetectionHtml\([\s\S]{0,4200}?\n}/.exec(admin);
  if (!fn) { console.error("⚠️  INDETERMINATE — cannot find obDetectionHtml in admin.js"); process.exit(2); }
  const block = fn[0];
  // 🔴 THE DEFECT THIS GUARDS: reading a count back out of `evidence`.
  if (/evidence[\s\S]{0,80}?\.match\(|match\([^)]*\)[\s\S]{0,40}evidence|parseInt\s*\(\s*[a-z.]*evidence/i.test(block)) {
    F("the detection block parses a number out of `evidence` — the number must come from `n`/`threshold`");
  }
  if (!/Number\.isFinite\(\s*d\.n\s*\)/.test(block) || !/Number\.isFinite\(\s*d\.threshold\s*\)/.test(block)) {
    F("the block does not require a finite `n` AND `threshold` before drawing a bar, so a missing "
      + "count could render as zero progress — an absence read as a value");
  }
  // 🔑 FOUR STATES, ALL NAMED. A new state is not finished until every surface knows its name.
  for (const word of ["Not checked yet", "Can't tell", "Confirmed", "Not yet"]) {
    if (!block.includes(word)) F(`the block has no wording for the "${word}" state`);
  }
  // 🔴 AN EMOJI CARRYING STATE GOES STALE THE MOMENT THE STATE MOVES.
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(block)) {
    F("the detection block renders an emoji; the state is a word so it survives being read aloud, "
      + "copied into an email, or rendered where emoji are not");
  }
}

if (fails.length) {
  console.error("🔴 a measurement can be lost, rewritten, or invented:");
  for (const f of fails) console.error("   · " + f);
  process.exit(1);
}
console.log("✅ every detection is kept — append-only in the database, recorded on every probe, and "
  + "the card draws its number from the number, never from the sentence");
