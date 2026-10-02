#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — A PLAIN-TEXT OUTPUT CARRIES ITS STRUCTURE AS INDENTATION
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-10-02: *"i still dont like the look of the text under What this produced"* — step 22
 * was coverage metrics, a verification note and a WHY list, all set as twelve identical paragraphs.
 * Approved mockup: reports/mockups/admin_structured_text_v1.html
 *
 * Measured across all 41 stored outputs BEFORE designing: 19 are genuinely prose and are LEFT
 * ALONE; the rest carry `label  value` rows, headings, or numbered entities.
 *
 * Two bugs this found that a screenshot could not, and that the gate now pins:
 *   · A FLUSH COLUMN HAS ONE SPACE. `best page position 7.9` sits in the same column as
 *     `impressions        9471`; requiring two spaces threw the whole KPI output away.
 *   · INDENTED ROWS DO NOT ALWAYS HAVE A HEADING. The geo-grid writes its coverage rows directly
 *     under `RESULT:`, and requiring one discarded that output too.
 *
 * 🔴 And the contract: STRICT, OR FALL BACK — per BLOCK, not per output. A group we cannot read
 * renders as it does today while the designed blocks beside it survive.
 *
 * Exit 0 pass · 1 fail · 2 could not run.
 */
import fs from "node:fs";
import vm from "node:vm";

const W = "/Users/chris/RGA/Rocket Growth Agency Website VS Code/";
let src, css;
try { src = fs.readFileSync(W + "admin/admin.js", "utf8"); css = fs.readFileSync(W + "admin/admin.css", "utf8"); }
catch { console.error("⛔ cannot read the admin sources"); process.exit(2); }

const fail = [];

// ═══ PART 1 — ONE ENTRY POINT ════════════════════════════════════════════════════════════════
// 🔴 A card must not get the designed view at one length and the flat wall at another.
const sites = (src.match(/\$\{stepBodyHtml\(t\)\}/g) || []).length;
if (sites !== 2) fail.push(`${sites} of the 2 output weights render through stepBodyHtml — the note and document weights must agree`);
if (/\$\{outShapes\(renderStepMarkdown\(t\)\)\}/.test(src)) fail.push("an output weight still calls outShapes(renderStepMarkdown(t)) directly, bypassing the designed view");

// ═══ PART 2 — THE BEHAVIOUR, running the real functions ══════════════════════════════════════
const pick = (n) => {
  const i = src.indexOf(`function ${n}(`);
  if (i < 0) { console.error(`⛔ ${n} not found in admin.js`); process.exit(2); }
  let d = 0;
  for (let k = src.indexOf("{", i); k < src.length; k++) {
    if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) return src.slice(i, k + 1); }
  }
  console.error(`⛔ ${n} unbalanced`); process.exit(2);
};
const consts = src.split("\n").filter((l) => /^const (ST_VERDICT|ST_NOTE_KEYS|ST_BAD_KEYS|ST_OK_KEYS|stIndent|stZero|SOP_LI|OUT_NOTE_MAX) =/.test(l)).join("\n");
for (const need of ["ST_VERDICT", "stIndent", "stZero"]) {
  if (!new RegExp(`^const ${need} =`, "m").test(consts)) { console.error(`⛔ ${need} not found`); process.exit(2); }
}
const ctx = vm.createContext({ console, URL });
try {
  vm.runInContext(consts + "\n" + ["escapeHtml", "escapeAttribute", "renderStepMarkdown", "outShapes",
    "stInline", "stGroupOf", "stFact", "stItem", "parseStructuredText", "structuredTextHtml", "stTitleCase", "stepBodyHtml"]
    .map(pick).join("\n\n"), ctx);
} catch (e) { console.error("⛔ cannot evaluate the renderer: " + e.message); process.exit(2); }
const call = (n) => vm.runInContext(n, ctx);

const text = (h) => String(h).replace(/<[^>]+>/g, " ")
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
  .replace(/\s+/g, " ").trim();

// ── the geo-grid: a verdict, HEADLESS indented rows under it, a titled group, a closing note ──
const GRID = `81-point geo-grid, "seo company", 5km radius centred on the Culver City office.

RESULT: not found at ANY of the 81 points, including the business's own address.
  Top-3 coverage   0/81 (0.0%)
  Top-10 coverage  0/81 (0.0%)
  Not found       81/81

PROBE VERIFIED — this is absence, not blindness. The scanner saw 115-120 competing
businesses at every single point; RGA was not among them.

WHY, from the rest of the audit:
  reviews    0      (competitors hold 43, 67 and 102)
  citations  0 held (of 8 tracked directories)
  social     1 linked, no Facebook

Map-pack position is driven by prominence, and RGA currently has none of its inputs.`;

const g = call("parseStructuredText")(GRID);
if (!g) fail.push("the geo-grid output no longer parses — indented rows under RESULT: need no heading");
else {
  const h = call("structuredTextHtml")(g), t = text(h);
  if (!g.lead.length) fail.push("the geo-grid lost its lead sentence");
  if (!g.close.length) fail.push("the geo-grid lost its closing note");
  const verdicts = g.body.filter((b) => b.kind === "verdict");
  if (verdicts.length !== 2) fail.push(`expected 2 verdicts in the geo-grid, got ${verdicts.length}`);
  const res = verdicts.find((v) => v.key === "RESULT");
  if (!res) fail.push("the RESULT verdict is gone");
  // 🔴 Tone comes from the FACTS it introduces, never from reading its prose for sentiment.
  else if (res.tone !== "bad") fail.push(`RESULT is toned "${res.tone}" — it introduces zero coverage rows, so it must be bad`);
  const probe = verdicts.find((v) => v.key === "PROBE VERIFIED");
  if (!probe || probe.tone !== "note") fail.push("PROBE VERIFIED must read as a note, not a failure");
  const factGroups = g.body.filter((b) => b.kind === "facts");
  if (factGroups.length !== 2) fail.push(`expected 2 fact groups in the geo-grid, got ${factGroups.length}`);
  else {
    if (factGroups[0].title !== "") fail.push(`the coverage rows were given the invented heading "${factGroups[0].title}" — the source has none`);
    const cov = factGroups[0].facts;
    if (cov.length !== 3) fail.push(`expected 3 coverage rows, got ${cov.length}`);
    if (!cov[0] || cov[0].k !== "Top-3 coverage" || cov[0].v !== "0/81") fail.push(`the first coverage row read ${JSON.stringify(cov[0])}`);
    if (!cov[0] || cov[0].note !== "0.0%") fail.push("the trailing parenthetical is not being split off as the note");
    if (!cov[0] || !cov[0].zero) fail.push("0/81 is not being marked as a zero — the finding would not read red");
    if (cov[2] && cov[2].zero) fail.push("81/81 was marked as a zero");
    const why = factGroups[1].facts;
    if (!why.some((f) => f.k === "reviews" && f.v === "0" && f.note.startsWith("competitors hold"))) {
      fail.push("`reviews    0      (competitors hold …)` split wrongly — the FIRST gap is the column");
    }
  }
  for (const frag of ["Top-3 coverage", "0/81", "81/81", "competitors hold 43, 67 and 102", "no Facebook", "none of its inputs"]) {
    if (!t.includes(frag)) fail.push(`the rendering lost ${JSON.stringify(frag)}`);
  }
  if (/&(quot|gt|lt|amp|#39);/.test(t)) fail.push(`an HTML entity is visible as text: ${t.match(/&\w+;/)[0]}`);
  if (!h.includes("ob-verdict bad")) fail.push("the bad verdict has no tone class");
  if (!h.includes("ob-fact zero")) fail.push("a zero fact has no zero class");
}

// ── the KPIs: a FLUSH column, one space wide ─────────────────────────────────────────────────
const KPI = `BASELINE KPIs — Rocket Growth Agency

SEARCH CONSOLE   (2026-06-17..2026-09-14)
  impressions        9471
  clicks             1
  best page position 7.9`;
const k = call("parseStructuredText")(KPI);
if (!k) fail.push("the KPI output no longer parses — a flush column has only ONE space");
else {
  const rows = (k.body.find((b) => b.kind === "facts") || {}).facts || [];
  if (rows.length !== 3) fail.push(`expected 3 KPI rows, got ${rows.length}`);
  const bp = rows.find((r) => r.k === "best page position");
  if (!bp) fail.push("the single-space column `best page position 7.9` did not split into label and value");
  else if (bp.v !== "7.9") fail.push(`the single-space row split wrongly: value ${JSON.stringify(bp.v)}`);
}
// 🔴 and the single-space rule must not split a SENTENCE into a label and a value
const SENT = `NOTES:
  this row is an ordinary sentence with no value
  and so is this one here`;
const s2 = call("parseStructuredText")(SENT);
if (s2 && (s2.body.find((b) => b.kind === "facts"))) {
  fail.push("a sentence with no number was split into a label and a value — the digit guard is gone");
}

// ── items: numbered, and un-numbered with a separator ────────────────────────────────────────
const COMP = `Top 3 competitors for "seo company" near Culver City, CA:
  1. Seo Company Santa Monica — 5 (43 reviews) · Marketing agency · https://www.seocompanysantamonica.com/seo/
  2. SEO Optimizers — 4.9 (102 reviews) · Internet marketing service · https://seooptimizers.com/?a=1&b=2

Top-3 review counts: 43, 67, 102 (median 67).`;
const c = call("parseStructuredText")(COMP);
if (!c) fail.push("the competitor output no longer parses");
else {
  const items = (c.body.find((b) => b.kind === "items") || {}).items || [];
  if (items.length !== 2) fail.push(`expected 2 competitor items, got ${items.length}`);
  else {
    if (items[0].title !== "Seo Company Santa Monica") fail.push(`item title read ${JSON.stringify(items[0].title)}`);
    if (items[0].score !== "5" || items[0].scoreNote !== "43 reviews") fail.push("the rating and its review count were not separated");
  }
  const h = call("structuredTextHtml")(c);
  // 🔴 THE WHOLE URL MUST SURVIVE INTO THE HREF even though the label is shortened.
  if (!h.includes("https://seooptimizers.com/?a=1&amp;b=2")) fail.push("a competitor URL is not intact in its href");
}

// ── prose is LEFT ALONE, and an unreadable group falls back ALONE ────────────────────────────
if (call("parseStructuredText")("Just a sentence.\n\nAnd another one, with no structure at all.") !== null) {
  fail.push("plain prose is being given a structure it does not have — the 19 prose outputs must be untouched");
}
if (call("parseStructuredText")("```yaml\nkeywords:\n  - a\n```") !== null) {
  fail.push("a fenced block is no longer left to the markdown pass");
}
const MIXED = `GOOD:
  alpha      1
  beta       2

ODD:
  • a bullet that is not a row
  • another bullet entirely`;
const mx = call("parseStructuredText")(MIXED);
if (!mx) fail.push("one unreadable group killed the whole output — fallback must be per BLOCK");
else {
  if (!mx.body.some((b) => b.kind === "facts")) fail.push("the readable group was lost with the unreadable one");
  if (!mx.body.some((b) => b.kind === "raw")) fail.push("the unreadable group is not falling back to today's rendering");
  const t = text(call("structuredTextHtml")(mx));
  for (const frag of ["alpha", "a bullet that is not a row", "another bullet entirely"]) {
    if (!t.includes(frag)) fail.push(`the mixed output lost ${JSON.stringify(frag)}`);
  }
}

// ═══ PART 3 — THE CSS the design needs ═══════════════════════════════════════════════════════
for (const sel of [".ob-verdict", ".ob-verdict.bad", ".ob-verdict.note", ".ob-lead", ".ob-close",
  ".ob-fact.zero .v", ".ob-item .meta", ".ob-fact .v small"]) {
  const asRule = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*[,{]");
  if (!asRule.test(css)) fail.push(`${sel} has no RULE of its own — a class no stylesheet defines throws nothing`);
}
// 🔴 A group owns its spacing; the box's own margin used to stack on top of it.
if (!/\.ob-grp \.ob-facts \{[^}]*margin-bottom:\s*0/.test(css)) {
  fail.push("the facts box inside a group no longer zeroes its margin — groups would sit 27px apart, not 14px");
}

if (fail.length) {
  console.error("🔴 a plain-text output is not being designed correctly:");
  for (const f of fail) console.error("   · " + f);
  process.exit(1);
}
console.log("✅ a plain-text output is designed — flush columns, headless rows, verdict tone from its facts, per-block fallback, prose untouched");
