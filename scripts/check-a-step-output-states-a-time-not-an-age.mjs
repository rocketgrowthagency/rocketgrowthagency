#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// A STEP'S OUTPUT STATES WHEN SOMETHING HAPPENED, NOT HOW LONG AGO
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴 WHAT WENT WRONG (2026-10-07). Chris, after pressing Run at 7:09 AM:
//   *"if we just scanned it at 7:09 am and it says 1 day(s) ago, it should be scanned today?"*
//
// The grid baseline closed with `Scanned ${Math.round(ageDays)} day(s) ago` — 14.5 hours rounded to
// one day — printed directly under a card stamped with that morning. Two true things reading as a
// contradiction.
//
// 🔑 A STEP CARD ALREADY STAMPS WHEN IT RAN, so an AGE beside that stamp is a second clock the reader
// has to reconcile. A date cannot be misread as "the button I just pressed did this".
//
// 🔴 THIS IS NOT A BAN ON RELATIVE TIME. `portal-step-recheck` tells a client their last customer
// list was "N days ago" against a weekly cadence, and `_fga-enrichment` ages a GBP post the same way
// — both are relative measures with no competing absolute stamp beside them, and both are correct.
// The rule is scoped to what `flow-execute` stores as a step's `summary`, which is what renders on a
// card carrying a PRODUCED time.
//
// Audited across all 44 stored outputs on the live record when this was written: zero instances. The
// grid was the only one, and it is fixed. This keeps it that way.
// → feedback_a_client_message_must_agree_with_itself · project_attach_the_fact_to_the_thing
//
// Exit 0 healthy · 1 a summary reports an age · 2 INDETERMINATE

import fs from "node:fs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
let src;
try { src = fs.readFileSync(`${SITE}/netlify/functions/flow-execute.js`, "utf8"); }
catch { console.error("⚠️  INDETERMINATE — cannot read flow-execute.js"); process.exit(2); }

// 🔴 LINE COMMENTS FIRST. This file's own comments quote the defect verbatim to explain it, so a
// stripper in the wrong order — or none — makes the gate accuse the documentation.
// → feedback_a_comment_stripper_in_the_wrong_order_deletes_code · feedback_a_check_must_not_validate_itself
const code = src.replace(/^[ \t]*\/\/.*$/gm, " ").replace(/\/\*[\s\S]*?\*\//g, " ");

const AGE = /\b(?:\$\{[^}]*\}|\d+)\s*(?:day|hour|minute|week|month)\(?s?\)?\s+ago\b/gi;
const hits = [];
for (const m of code.matchAll(AGE)) {
  hits.push({ at: code.slice(0, m.index).split("\n").length, text: m[0].replace(/\s+/g, " ") });
}
// `ageDays` surviving into a rendered string is the same defect wearing a variable name
for (const m of code.matchAll(/Math\.round\(\s*ageDays\s*\)/g)) {
  hits.push({ at: code.slice(0, m.index).split("\n").length, text: "Math.round(ageDays) in a rendered string" });
}

if (!/summary:/.test(code)) { console.error("⚠️  INDETERMINATE — no `summary:` producers found; the file moved"); process.exit(2); }

if (hits.length) {
  console.error(`❌ ${hits.length} step output(s) report an AGE where a card already stamps the time:\n`);
  for (const h of hits) console.error(`   · flow-execute.js:${h.at}  "${h.text}"`);
  console.error(`\n  State WHEN it happened. A reader seeing "1 day(s) ago" under a stamp from this`);
  console.error(`  morning cannot tell which clock is which.`);
  process.exit(1);
}
console.log("✅ no step output substitutes a rounded age for the time something happened");
