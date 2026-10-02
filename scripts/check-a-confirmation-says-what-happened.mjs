#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — A CONFIRMATION SAYS WHAT HAPPENED, FOR EVERY STEP
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * The banner after a step ran was `summary.slice(0, 160)`. Once the keyword step began answering in
 * YAML it rendered as:
 *
 *     ```yaml keywords: - term: seo company near me searches: 2400/mo why: > High commercial
 *     intent, geo-resolves automatically to Culver City from th
 *
 * — fence markers, key names, and a sentence cut mid-word. Chris: *"can we make these confirmation
 * cards more simple in design."* Mockup approved 2026-10-02, **"make sure this is applied to ALL
 * steps"** — so the shape is produced in ONE place that every outcome goes through.
 *
 * WHAT IS PINNED — by RUNNING the producer, not reading it:
 *   1. One producer; the call site does not branch the shape per outcome.
 *   2. A fenced artifact NEVER reaches the banner.
 *   3. Nothing is cut mid-word — the fallback takes a complete sentence or nothing.
 *   4. A non-success outcome still leads with its own word, so a refusal is never read as done.
 *   5. The title is the step; "Done —" is not typed into it.
 *
 * Exit 0 pass · 1 fail · 2 indeterminate. Mutation log at the bottom.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const JS = path.join(SITE, "admin", "admin.js");
const fail = [], pass = [];

if (!fs.existsSync(JS)) { console.error("⚠️  INDETERMINATE — admin.js not found."); process.exit(2); }
const raw = fs.readFileSync(JS, "utf8");

const i = raw.indexOf("function bannerSentence(");
if (i < 0) { console.error("⚠️  INDETERMINATE — bannerSentence is gone; the banner has no single producer."); process.exit(2); }
let d = 0, end = -1;
for (let k = raw.indexOf("{", i); k < raw.length; k++) {
  if (raw[k] === "{") d++;
  else if (raw[k] === "}") { d--; if (!d) { end = k + 1; break; } }
}
if (end < 0) { console.error("⚠️  INDETERMINATE — bannerSentence is unbalanced."); process.exit(2); }

const ctx = vm.createContext({});
try { vm.runInContext(raw.slice(i, end) + ";globalThis._b = bannerSentence;", ctx); }
catch (e) { console.error(`⚠️  INDETERMINATE — bannerSentence did not evaluate: ${e.message}`); process.exit(2); }
const B = ctx._b;

const UI = {
  manual: { title: (l) => `Needs you — ${l}`, type: "info" },
  error: { title: (l) => `Failed — ${l}`, type: "error" },
};

console.log("── a fenced artifact never reaches the banner ──");
{
  // 🔴 THE FIXTURE MUST MATCH REALITY. A first version used a YAML block with no full stop in it —
  // so the "complete sentence" rule alone kept it out and removing the fence strip changed nothing.
  // Real drafts end their `why` with a period, which is exactly how the YAML got onto the screen.
  const yaml = "```yaml\nkeywords:\n  - term: seo company near me\n    searches: 2400/mo\n    why: >\n"
    + "      High commercial intent, geo-resolves automatically to Culver City from the business pin.\n```";
  for (const [label, out] of [
    ["with counts", B({ summary: yaml, outcome_data: { demand: [1, 2, 3, 4, 5], locations: [1, 2, 3] } }, null)],
    ["without counts", B({ summary: yaml, outcome_data: {} }, null)],
  ]) {
    const dirty = /```|\byaml\b|term:|searches:|why:/.test(out);
    if (dirty) { fail.push(`the banner printed YAML (${label}): ${JSON.stringify(out).slice(0, 90)}`); console.log(`  🔴 ${label}: ${JSON.stringify(out).slice(0, 90)}`); }
    else { pass.push(`no YAML (${label})`); console.log(`  ✅ ${label}: ${JSON.stringify(out) || '""'}`); }
  }
}

console.log("\n── nothing is cut mid-word ──");
{
  // 🔴 The original defect: a fixed 160-character slice ending "…from th".
  const long = "Sent the confirmation email to someone@example.com and recorded the message id, "
    + "then advanced the client to the setup stage and notified the owner by email as configured.";
  const out = B({ summary: long, outcome_data: {} }, null);
  const ok = out === "" || /[.!?]$/.test(out.trim());
  if (ok) { pass.push("ends on a sentence"); console.log(`  ✅ ends on a full stop: ${JSON.stringify(out).slice(0, 100)}`); }
  else { fail.push("the banner body does not end on a sentence boundary"); console.log(`  🔴 cut mid-sentence: ${JSON.stringify(out).slice(0, 100)}`); }

  // No sentence available at all → empty is honest; half a word is not.
  const none = B({ summary: "```yaml\nkeywords:\n```", outcome_data: {} }, null);
  if (none === "" || /[.!?]$/.test(none.trim())) { pass.push("empty when nothing complete"); console.log("  ✅ no complete sentence → empty, not a fragment"); }
  else { fail.push("a fragment is shown when no complete sentence exists"); console.log(`  🔴 fragment: ${JSON.stringify(none)}`); }
}

console.log("\n── a refusal still leads with its own word ──");
{
  for (const [name, ui] of Object.entries(UI)) {
    const out = B({ summary: "Nothing was sent.", outcome_data: {} }, ui);
    const lead = ui.title("").replace(/\s*—\s*$/, "").trim();
    if (out.startsWith(lead)) { pass.push(`${name} leads`); console.log(`  ✅ ${name}: ${JSON.stringify(out)}`); }
    else { fail.push(`a ${name} outcome no longer leads with "${lead}"`); console.log(`  🔴 ${name}: ${JSON.stringify(out)}`); }
  }
  // 🔴 AND IT MUST STILL SAY SO WHEN THE RUNNER RETURNED COUNTS. A refusal that produced partial
  // structured output must not be reported as a plain success sentence.
  const out = B({ summary: "Nothing was sent.", outcome_data: { demand: [1, 2] } }, UI.error);
  if (out.startsWith("Failed")) { pass.push("counts do not mask a failure"); console.log(`  ✅ counts do not mask a failure: ${JSON.stringify(out)}`); }
  else { fail.push("a failed outcome with counts reads as a success"); console.log(`  🔴 a failure with counts read as success: ${JSON.stringify(out)}`); }
}

console.log("\n── the title is the step, and the call site does not branch the shape ──");
{
  const callIdx = raw.indexOf("setBanner(\n      { title: stepLabel(stepId)");
  if (callIdx > 0) { pass.push("one shape"); console.log("  ✅ one setBanner call, title = the step label"); }
  else { fail.push("the banner call site branches its shape again, or the title is not the step"); console.log("  🔴 the call site no longer uses a single shape with stepLabel as the title"); }

  // "Done —" belongs to the stripe colour, not the words.
  const windowSrc = raw.slice(Math.max(0, callIdx - 400), callIdx + 400);
  if (callIdx > 0 && /`Done — /.test(windowSrc)) {
    fail.push('"Done —" is typed into the title again'); console.log('  🔴 "Done —" is back in the title');
  } else { pass.push("no Done in title"); console.log('  ✅ "Done —" is not typed into the title'); }
}

console.log("");
if (fail.length) {
  console.error(`🔴 ${fail.length} problem(s):`);
  for (const f of fail) console.error(`   · ${f}`);
  console.error(`\n   A confirmation answers "did that work?" — it is not a place to print the artifact.`);
  process.exit(1);
}
console.log(`✅ ${pass.length} properties hold — every step's confirmation is two lines, built from counts,`);
console.log(`   free of syntax, never cut mid-word, and a refusal still says so.`);

/* ─── MUTATION LOG (both directions, matched by name) ──────────────────────────────────────────────
 *  1. the ``` fence strip removed from the fallback        → exit 1 "printed YAML (without counts)"
 *  2. the sentence match → `.slice(0, 160)`                → exit 1 "does not end on a sentence boundary"
 *  3. `lead` dropped for non-success outcomes              → exit 1 "no longer leads with"
 *  4. `if (built && !ui)` → `if (built)`                   → exit 1 "a failed outcome with counts reads as a success"
 *  5. call site title → `Done — ${stepLabel(stepId)}`      → exit 1 '"Done —" is back in the title'
 *  6. unmodified source                                     → exit 0
 * ────────────────────────────────────────────────────────────────────────────────────────────── */
