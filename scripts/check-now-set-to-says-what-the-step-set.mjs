#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — "NOW SET TO" SAYS WHAT THE STEP ACTUALLY SET
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, after marking step 25 Done (2026-10-06): *"what is this at the bottom of 25 card?"*
 *
 *     NOW SET TO  term: local seo services near me · Draft copy
 *
 * Two faults in six words:
 *   · `term:` is a YAML key shown to a human. The existing guard skips a key with NOTHING after it,
 *     and this one has a value, so the field name rode through into the UI.
 *   · "now set to <one keyword>" is wrong in KIND. Step 25 settles FIVE keywords and THREE
 *     sub-locations; naming one of them tells the reader the step set something it did not.
 *
 * 🔑 WHEN A DRAFT HAS SECTIONS, THE SUMMARY IS THE COUNTS — that is what the step settled. A
 * single-section draft still reads as its first line, which is right for the steps that set one.
 * → feedback_a_message_needs_a_shape · project_attach_the_fact_to_the_thing
 *
 * Runs the REAL settingOneLine. Exit 0 pass · 1 the line misrepresents the step · 2 could not run.
 */
import fs from "node:fs";
import vm from "node:vm";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
let src;
try { src = fs.readFileSync(`${SITE}/admin/admin.js`, "utf8"); }
catch { console.error("⚠️  INDETERMINATE — cannot read admin.js"); process.exit(2); }

function lift(name) {
  const m = src.match(new RegExp(`^function ${name}\\s*\\(`, "m"));
  if (!m) return "";
  const lp = src.indexOf("(", m.index);
  let pd = 0, ap = -1;
  for (let i = lp; i < src.length; i++) {
    if (src[i] === "(") pd++;
    else if (src[i] === ")") { pd--; if (!pd) { ap = i + 1; break; } }
  }
  const o = src.indexOf("{", ap);
  let d = 0;
  for (let i = o; i < src.length; i++) {
    if (src[i] === "{") d++;
    else if (src[i] === "}") { d--; if (!d) return src.slice(m.index, i + 1); }
  }
  return "";
}
const fn = lift("settingOneLine");
if (!fn) { console.error("⚠️  INDETERMINATE — settingOneLine did not lift."); process.exit(2); }
const ctx = vm.createContext({});
try { vm.runInContext(`${fn}\nglobalThis.S = settingOneLine;`, ctx); }
catch (e) { console.error(`⚠️  INDETERMINATE — could not evaluate settingOneLine: ${e.message}`); process.exit(2); }
const S = ctx.S;

const fail = [];
const ok = (c, m) => { if (!c) fail.push(m); };

// ── THE REAL STEP-25 DRAFT ──────────────────────────────────────────────────────────────────────
const PLAN = ["```yaml", "keywords:",
  "  - term: local seo services near me", "    why: buyers ready to hire",
  "  - term: google business profile optimization",
  "  - term: local seo agency culver city",
  "  - term: seo company culver city ca",
  "  - term: search engine optimization agencies",
  "locations:", "  - Mar Vista (dense corridor)", "  - Palms (business district)",
  "  - Playa Vista (tech-adjacent)", "```"].join("\n");

const plan = S(PLAN);
ok(!/\bterm\s*:/.test(plan),
  `"Now set to" shows a YAML key to a human (${JSON.stringify(plan)}) — the reader wants the value, `
  + "never the field name that holds it");
ok(/\b5\b/.test(plan) && /\b3\b/.test(plan),
  `a draft that settles five keywords and three sub-locations is summarised as ${JSON.stringify(plan)} `
  + "— naming one of twelve things tells the reader the step set something it did not");

// ── A SINGLE-SECTION DRAFT STILL READS AS ITS LINE ──────────────────────────────────────────────
const one = S("```yaml\nservices:\n  - term: drain cleaning\n```");
ok(one === "drain cleaning",
  `a draft with one section should read as its value; got ${JSON.stringify(one)}`);
ok(S("We open at 8am on Saturdays.") === "We open at 8am on Saturdays.",
  "plain prose no longer passes through unchanged");
ok(S("## Title\n\nThe actual copy goes here.") === "The actual copy goes here.",
  "a markdown heading is no longer skipped in favour of the copy under it");

// ── AND IT STILL REFUSES TO SHOW STRUCTURE AS CONTENT ───────────────────────────────────────────
ok(!/^```/.test(S("```yaml\nkeywords:\n  - term: a\n```")), "a fence can be shown as the setting");
ok(S("") === "", "an empty draft produces something rather than nothing");

if (fail.length) {
  console.error("🔴 \"Now set to\" misrepresents what the step settled:");
  for (const f of fail) console.error(`   · ${f}`);
  process.exit(1);
}
console.log("✅ a multi-section draft is summarised by what it settled (5 keywords · 3 locations), a "
  + "single-section one reads as its value, and no YAML key reaches the screen");
