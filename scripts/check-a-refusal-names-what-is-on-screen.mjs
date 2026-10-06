#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — A REFUSAL NAMES WHAT IS ON THE SCREEN, AND SAYS WHAT TO DO
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris pressed Run on step 26 (2026-10-06) and got:
 *
 *   CAUTION — cannot run "m1.audit.grid_baseline". Complete these dependencies first:
 *   m1.strategy.keywords_locations
 *
 * The refusal was RIGHT — step 25 locks this month's targets, nobody had marked it Done, and there
 * was no approved plan to baseline against. Everything else about the sentence was wrong:
 *
 *   · it named two flow ids the operator has never seen, in a checklist that numbers every step;
 *   · it described a STATE ("complete these dependencies") rather than an ACTION ("press Done on 25");
 *   · "CAUTION" prefixed a refusal, which is not a caution.
 *
 * 🔑 THE SERVER CANNOT WRITE THIS SENTENCE — step numbers are computed in the admin — so the server
 * sends ids and titles, and the screen says it in the screen's own words.
 * → feedback_instruct_by_what_is_on_screen · feedback_a_message_needs_a_shape
 *
 * Exit 0 pass · 1 a refusal speaks in identifiers, or does not say what to do · 2 could not run.
 */
import fs from "node:fs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
let flow, admin;
try {
  flow = fs.readFileSync(`${SITE}/netlify/functions/flow-execute.js`, "utf8");
  admin = fs.readFileSync(`${SITE}/admin/admin.js`, "utf8");
} catch { console.error("⚠️  INDETERMINATE — cannot read the sources"); process.exit(2); }

// 🔴 line comments first — a `/*` inside a `//` otherwise swallows real code
const f = flow.replace(/^[ \t]*\/\/.*$/gm, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
const a = admin.replace(/^[ \t]*\/\/.*$/gm, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
const fail = [];
const ok = (c, m) => { if (!c) fail.push(m); };

// ── THE SERVER HANDS OVER WHAT THE SCREEN NEEDS ────────────────────────────────────────────────
ok(/missingDeps,/.test(f), "the refusal does not return the blocking step ids, so the screen cannot "
  + "rename them into its own numbering");
ok(/missingDepTitles/.test(f), "the refusal returns ids but no titles — anything reading this API "
  + "without the admin's numbering is left with identifiers");
ok(/function depTitle\(/.test(f), "there is no lookup from a flow id to its human title");
ok(!/CAUTION — cannot run/.test(f), "the refusal still opens with \"CAUTION\" — a refusal is not a "
  + "caution, and the word says nothing about what to do");

// ── THE SCREEN REWRITES IT IN THE SCREEN'S OWN WORDS ───────────────────────────────────────────
{
  // 🔴 THE RIGHT ONE OF FIVE. `if (!r.ok || !data.ok)` appears five times in admin.js; taking the
  // first found an unrelated fetch and reported that correct code was missing. Anchor on the function
  // that runs a STEP. → feedback_a_gate_window_measured_in_characters_will_lie
  const fi = a.indexOf("async function runFlowStep");
  const i = fi >= 0 ? a.indexOf("if (!r.ok || !data.ok)", fi) : -1;
  const body = i >= 0 ? a.slice(i, i + 1800) : "";
  ok(body, "cannot find the step-run error path; re-pin this gate");
  ok(/data\.missingDeps/.test(body),
    "the admin throws the server's raw sentence — the operator is shown flow ids for a checklist that "
    + "numbers every step");
  ok(/obNumberOf\(/.test(body),
    "the refusal does not resolve a blocking step to its NUMBER, which is the only name the operator "
    + "has ever seen for it");
  ok(/\.title/.test(body),
    "the refusal names a number with no title — \"step 25\" alone makes the reader go hunting");
  // 🔑 AN ACTION, NOT A STATE. "complete these dependencies" is a description; "press Done on it" is
  // something a person can do next.
  ok(/press Done/i.test(body),
    "the refusal describes a state rather than naming the action that clears it");
}

if (fail.length) {
  console.error("🔴 a refusal does not speak in the operator's terms:");
  for (const f2 of fail) console.error(`   · ${f2}`);
  process.exit(1);
}
console.log("✅ a blocked step is refused by number and title, and the sentence names the action that "
  + "clears it rather than describing the state that blocks it");
