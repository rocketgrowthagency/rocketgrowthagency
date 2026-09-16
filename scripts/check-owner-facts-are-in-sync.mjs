#!/usr/bin/env node
/**
 * check-owner-facts-are-in-sync.mjs — the four owner questions mean the same thing on both sides.
 *
 * ─── WHY (2026-09-15, mockup #61 approved) ───────────────────────────────────────────────────────
 * The client answers these in their portal; RGA answers them on the kickoff call in admin. Both
 * write the SAME four columns on `clients`. Chris: *"make sure they interact and communicate — once
 * one is done the other portal knows, so they are synced."*
 *
 * 🔑 The sync is STRUCTURAL: one endpoint, one validator, one set of columns. This gate exists to
 * keep it that way, because the cheap way to add a feature to one side is to give it its own copy —
 * and the first symptom of that is a client seeing an answer they never gave.
 *
 * ─── WHAT IT ASSERTS ─────────────────────────────────────────────────────────────────────────────
 *   1. Every question declares a type, options, guidance, a promptLabel and an ask-on-call line.
 *   2. A choice's stored `value` is NEVER its UI label — the label is tapped, the value is injected
 *      into 41 prompts, and they must be different strings written for different readers.
 *   3. The validator REJECTS anything that is not one of a question's own options. These get
 *      published as claims under the client's name.
 *   4. "None of these" stores a PROHIBITION, not an empty string — a blank reads to a model as
 *      "nothing supplied", which is an invitation to invent.
 *   5. An unmapped industry falls back to NEUTRAL examples, never a guessed trade.
 *   6. Neither portal holds its own option list — both go through _client-facts.
 *
 * Exit 0 = in sync · 1 = drifted · 2 = could not tell.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const req = createRequire(path.join(SITE, "package.json"));

let M, SCHEMA;
try {
  M = req("./netlify/functions/_client-facts.js");
  SCHEMA = M.SCHEMA;
} catch (e) {
  console.error(`[facts] INDETERMINATE — could not load _client-facts: ${e.message}`);
  process.exit(2);
}

const fail = [];
console.log("── the four owner questions are in sync ──");

// 1 ─ every question is completely declared
for (const f of M.FIELDS) {
  if (!f.type) fail.push(`${f.key} — no type`);
  if (!f.promptLabel) fail.push(`${f.key} — no promptLabel, so the model is handed the client-facing question text`);
  if (!f.ask_on_call) fail.push(`${f.key} — no ask_on_call line, so admin has nothing to say out loud`);
  if (!f.guidance?.paragraphs?.length) fail.push(`${f.key} — no how-to-answer guidance`);
  if (!(f.options || []).length) fail.push(`${f.key} — no options; every question must be a tap, never free text`);
  for (const o of f.options || []) {
    if (f.type === "choice" && !o.value) fail.push(`${f.key}.${o.key} — no stored value`);
    // 2 ─ the tapped label and the injected value are written for different readers
    if (o.value && o.value === o.label) {
      fail.push(`${f.key}.${o.key} — stored value is identical to the UI label; the label is tapped, the value goes into 41 prompts`);
    }
  }
  if (f.type === "ticks" && !f.none_value) {
    fail.push(`${f.key} — no none_value; "none of these" would store a blank, which reads to a model as "nothing supplied"`);
  }
}

// 3 + 4 ─ the validator actually refuses
const CASES = [
  ["results_timeline", { option: "few_days" },                       true,  "a real option"],
  ["results_timeline", { option: "not_an_option" },                  false, "an option that does not exist"],
  ["results_timeline", { option: "#1 in 30 days guaranteed" },       false, "free text through a choice field"],
  ["credentials",      { ticks: ["none", "years"] },                 false, '"none of these" combined with another'],
  ["credentials",      { ticks: ["made_up"] },                       false, "an unknown tick"],
  ["urgent_support",   { option: "none" },                           true,  "the no-rush option"],
];
for (const [key, input, shouldPass, label] of CASES) {
  const r = M.normaliseAnswer(key, input);
  const passed = !r.error;
  if (passed !== shouldPass) fail.push(`validator ${passed ? "ACCEPTED" : "rejected"} ${label} — it should have ${shouldPass ? "accepted" : "rejected"} it`);
}
const none = M.normaliseAnswer("credentials", { ticks: ["none"] });
if (!none.value || !/do not publish/i.test(none.value)) {
  fail.push(`"none of these" stores ${JSON.stringify(none.value)} — it must be an explicit prohibition, not a blank`);
}
const noRush = M.normaliseAnswer("urgent_support", { option: "none" });
if (!/do not mention/i.test(noRush.value || "")) {
  fail.push(`"no rush service" stores ${JSON.stringify(noRush.value)} — it must forbid mentioning urgency, not just omit it`);
}

// 5 ─ an unmapped trade gets neutral examples, never a guessed one
if (M.industryGroup("Taxidermist") !== null) fail.push("an unmapped category was assigned an industry group — it must fall back to neutral");
if (M.industryGroup("Plumber") !== "callout_trade") fail.push("a plumber did not map to callout_trade");
if (M.industryGroup("") !== null) fail.push("a blank category was assigned an industry group");

// 6 ─ neither portal holds its own copy of the questions
for (const rel of ["portal/portal.js", "admin/admin.js"]) {
  const src = fs.readFileSync(path.join(SITE, rel), "utf8");
  for (const f of M.FIELDS) {
    for (const o of f.options || []) {
      if (o.value && src.includes(o.value)) {
        fail.push(`${rel} contains a stored answer verbatim ("${o.value.slice(0, 40)}…") — it must render from the endpoint, not hold its own copy`);
      }
    }
  }
  if (!src.includes("client-facts")) fail.push(`${rel} never calls client-facts`);
}

const groups = Object.keys(SCHEMA.industry_groups?.groups || {}).length;
console.log(`  ${M.FIELDS.length} questions · ${M.FIELDS.reduce((n, f) => n + (f.options || []).length, 0)} options · ${groups} industry groups`);
console.log(`  validator: ${CASES.length} cases · both portals read the shared module`);

if (fail.length) {
  console.error(`\n✗ the owner questions have drifted — ${fail.length} problem(s):`);
  for (const f of fail) console.error(`    ${f}`);
  console.error("\n  One schema, one validator, one set of columns. The client answers in their portal,");
  console.error("  RGA answers on the kickoff call, and both land in the same place.");
  process.exit(1);
}
console.log("  ✅ one schema, one validator, one set of columns — both sides agree");
process.exit(0);
