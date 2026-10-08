#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// A RUN SAYS WHAT IT PRODUCED, AND THE SHAPE IS PARSED ONCE ON THE SERVER
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴🔴 THE HISTORY STRIP PRINTED `in_progress`. Four runs of step 31, four identical rows, each
// showing a DATABASE ENUM — nothing a reader could learn from any of them. Chris, looking at it:
// *"i dont like this mockup something better designed."* He was right, and it was not taste.
//
// 🔴🔴 AND THE CARD WAS PARSING ITS OWN PROSE. A drafted list is 20 items in 7 groups; both the
// admin and the client's portal need that table, and deriving it from the markdown at render time
// is the defect that broke the step card once already, the day the wording changed.
//
// 🔑 SO: the server parses once (`_draft-shape.js`), stores the result on the task and on the run,
// and every surface renders from DATA. This gate RUNS the parser rather than grepping for it.
// → project_the_shot_list_is_a_deliverable · feedback_a_design_that_reads_a_grammar_is_broken_by_rewriting_the_text
//
// Exit 0 healthy · 1 the product is wrong · 2 INDETERMINATE

import fs from "node:fs";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const fails = [];
const F = (m) => fails.push(m);

// 🔴 line comments FIRST, then blocks → feedback_a_comment_stripper_in_the_wrong_order_deletes_code
const strip = (src) => src.split("\n").map((l) => l.replace(/^\s*\/\/.*$/, "").replace(/\s\/\/\s.*$/, "")).join("\n")
  .replace(/\/\*[\s\S]*?\*\//g, "");
const read = (rel, what) => {
  try { return fs.readFileSync(`${SITE}/${rel}`, "utf8"); }
  catch { console.error(`⚠️  INDETERMINATE — cannot read ${what}`); process.exit(2); }
};

// ═══ 1 — THE PARSER WORKS, AND REFUSES ═══════════════════════════════════════════════════════
const modPath = `${SITE}/netlify/functions/_draft-shape.js`;
if (!fs.existsSync(modPath)) {
  console.error("⚠️  INDETERMINATE — netlify/functions/_draft-shape.js is gone");
  process.exit(2);
}
let draftShape, prettyGroup;
try { ({ draftShape, prettyGroup } = createRequire(import.meta.url)(modPath)); }
catch (e) { console.error(`⚠️  INDETERMINATE — _draft-shape.js does not load: ${e.message}`); process.exit(2); }

{
  // a draft shaped like the real one
  const doc = ["# 20-Photo Shot List", "", "## LOGO (1)", "**Shot 1**",
    "SHOT — The logo centered on a clean white background.",
    "WHY — Google uses it as the thumbnail.", "", "## TEAM (2)", "**Shot 2**",
    "SHOT — A headshot of the lead consultant.", "WHY — Faces build trust.", "**Shot 3**",
    "SHOT — Two people reviewing a report.", "WHY — Shows real work."].join("\n");
  const s = draftShape(doc);
  if (!s) F("the parser cannot read a draft in the shape the drafter emits");
  else {
    if (s.count !== 3) F(`the parser found ${s.count} items in a 3-item draft`);
    if (!Array.isArray(s.items) || s.items.length !== 3) F("the parser does not return the items themselves");
    if (s.items?.[0]?.why !== "Google uses it as the thumbnail.") F("the parser drops the WHY line");
    if (s.items?.[0]?.n !== 1) F("items are not numbered from 1");
    const g = (s.groups || []).map((x) => `${x.name} ${x.n}`).join(" · ");
    if (g !== "Logo 1 · Team 2") F(`groups came out as "${g}" — expected "Logo 1 · Team 2"`);
  }

  // 🔴 IT MUST REFUSE RATHER THAN GUESS. A half-parsed list rendered as a confident table is worse
  // than no table. → feedback_an_absence_must_never_be_readable_as_a_value
  // 🔴 A FIXTURE MUST FAIL FOR THE REASON IT TESTS. The first version's "prose mentioning SHOT" had
  // the word mid-line, so the content pattern never matched and the <3 rule was never exercised —
  // a mutation loosening it to <1 changed nothing and went uncaught. These two have the instruction
  // at the START of a line, which is the only way to reach the threshold.
  // → feedback_a_fixture_must_fail_for_the_reason_it_tests
  for (const junk of ["", "short", null, 42, {},
    "A paragraph about photography that happens to mention one SHOT — nothing more.",
    "Some notes.\nSHOT — one stray instruction in otherwise ordinary prose.\nAnd more notes.",
    "SHOT — first.\nWHY — because.\nSHOT — second.\nWHY — also because."]) {
    if (draftShape(junk) !== null) F(`the parser returns a table for junk input: ${JSON.stringify(junk)?.slice(0, 40)}`);
  }

  // 🔴 A GROUP LABEL IS NOT SHOUTED. "LOGO" and "TEAM" are words, not acronyms.
  for (const [raw, want] of [["LOGO", "Logo"], ["TEAM", "Team"], ["WORK IN PROGRESS", "Work in progress"], ["GBP", "GBP"]]) {
    if (prettyGroup(raw) !== want) F(`prettyGroup("${raw}") is "${prettyGroup(raw)}", expected "${want}"`);
  }
}

// ═══ 2 — THE SERVER PARSES AND STORES IT; NOBODY ELSE PARSES ═════════════════════════════════
{
  const exec = strip(read("netlify/functions/flow-execute.js", "flow-execute.js"));
  if (!/draft_shape:\s*draftShape\(/.test(exec)) {
    F("flow-execute no longer parses the draft into `draft_shape` when it writes the task");
  }
  if (!/draft_shape:\s*state\.draft_shape/.test(exec)) {
    F("the run row no longer carries the drafted shape, so the history cannot say what a run produced");
  }

  const admin = strip(read("admin/admin.js", "admin/admin.js"));
  const fn = /function stepDeliverableHtml\([\s\S]{0,3200}?\n}/.exec(admin);
  if (!fn) { console.error("⚠️  INDETERMINATE — cannot find stepDeliverableHtml in admin.js"); process.exit(2); }
  const block = fn[0];
  if (!/task\s*&&\s*task\.draft_shape/.test(block)) {
    F("the deliverable block does not read `task.draft_shape` — it must render from stored data");
  }
  // 🔴 THE DEFECT THIS GUARDS: deriving the list from the text at render time.
  if (/\.split\(["'`]\\n|\.match\(\/|RegExp\(/.test(block)) {
    F("the deliverable block parses text — the list comes from the server's `draft_shape`, never from prose");
  }
}

// ═══ 3 — NO RAW STATUS WORD EVER REACHES A READER ════════════════════════════════════════════
{
  const admin = strip(read("admin/admin.js", "admin/admin.js"));
  const hist = /function stepRunHistoryHtml\([\s\S]{0,4200}?\n}/.exec(admin);
  if (!hist) { console.error("⚠️  INDETERMINATE — cannot find stepRunHistoryHtml in admin.js"); process.exit(2); }
  const d = /const describe = \(r\) => \{[\s\S]*?\n  \};/.exec(hist[0]);
  if (!d) { console.error("⚠️  INDETERMINATE — cannot find the run describer"); process.exit(2); }
  const body = d[0];
  // the original defect, exactly: handing the reader whatever the database happened to store
  if (/String\(r\.status[^)]*\)/.test(body)) {
    F("a run row can print `r.status` — that is where `in_progress` came from, four times on one card");
  }
  if (/String\(r\.outcome\)/.test(body) || /\br\.outcome\s*\?/.test(body)) {
    F("a run row can print `r.outcome` raw — an enum is not a sentence");
  }
  if (!/draft_shape/.test(body)) {
    F("the run describer does not use the drafted shape, so it cannot say what the run produced");
  }
  if (!/Running…|Running\.\.\./.test(body)) {
    F("there is no wording for a run still in flight — that is the one state worth naming");
  }
}

if (fails.length) {
  console.error("🔴 a run cannot say what it produced:");
  for (const f of fails) console.error("   · " + f);
  process.exit(1);
}
console.log("✅ a run says what it produced — the shape is parsed once on the server, both surfaces render "
  + "from that data, and no database word reaches a reader");
