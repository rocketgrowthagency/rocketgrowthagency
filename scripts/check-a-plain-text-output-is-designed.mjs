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
// 🔴 RE-PINNED 2026-10-05 — this counted the literal `${stepBodyHtml(t)}`. The argument was later
// wrapped (`stepBodyHtml(stripMeasurementProse(t))`), which is the same entry point doing MORE, and
// the gate read a correct change as both call sites disappearing.
// 🔑 The property is ONE ENTRY POINT USED BY BOTH WEIGHTS — not the shape of its argument.
// → feedback_a_gate_must_pin_the_property_not_the_spelling
const sites = (src.match(/\$\{stepBodyHtml\(/g) || []).length;
if (sites !== 2) fail.push(`${sites} of the 2 output weights render through stepBodyHtml — the note and document weights must agree`);
// And both weights must be the ones we think: the note body and the document body.
for (const cls of ["ob-out-body", "ob-out-b"]) {
  const re = new RegExp(`class="${cls}">\\$\\{stepBodyHtml\\(`);
  if (!re.test(src)) fail.push(`the \`.${cls}\` weight no longer renders through stepBodyHtml`);
}
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
    "stInline", "stValue", "stGroupOf", "stFact", "stItem", "parseStructuredText", "structuredTextHtml", "stTitleCase", "stSentence", "stRating", "stepBodyHtml"]
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
  // 🔑 The label took the start of the sentence with it, so the text must still read as a sentence.
  if (res && !/^Not found at ANY/.test(res.text)) fail.push(`the RESULT text does not read as a sentence: ${JSON.stringify(String(res.text).slice(0, 40))}`);
  if (call("stSentence")("iPhone setup is done") !== "iPhone setup is done") fail.push("stSentence mangled a word deliberately lower-cased at the start");
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
// 🔴 NOTHING MAY BE PRINTED AFTER A LINK. `trail` was measured against the ESCAPED string, so
// un-escaping `&amp;` (4 chars to 1) made it emit the URL's last characters as loose text — Chris's
// step-21 card read `…&ut… \u2197 _profile`. Two separators, eight stray characters. 2026-10-02.
{
  const L = call("renderStepMarkdown")("see https://x.com/?a=1&b=2&c=3 after");
  const close = L.lastIndexOf("</a>");
  if (close < 0) fail.push("the URL was not linkified at all");
  else {
    const tail = text(L.slice(close + 4));
    if (tail !== "after") fail.push(`${JSON.stringify(tail)} is printed after the link \u2014 it must be exactly "after"`);
  }
  if (!L.includes('href="https://x.com/?a=1&amp;b=2&amp;c=3"')) fail.push("the href lost part of the query string");
}

// ── a bare-URL fact value reads as its DESTINATION, not as an encoded query ──────────────────
// 🔴 The citation audit is ten directories, each a Google `site:` search, so a host+tail label
// rendered all ten as `google.com/search?q=%22Rocket%20…`. The row label already says which
// directory; ten copies of an encoded query say nothing. Chris, 2026-10-02.
{
  const u = "https://www.google.com/search?q=%22X%22%20site%3Ayelp.com";
  const out = call("stValue")(u);
  const label = (out.match(/>([^<]*)<\/a>/) || [])[1] || "";
  if (!/^Search Google/.test(label)) fail.push(`a Google search URL reads as ${JSON.stringify(label)}, not "Search Google"`);
  if (!out.includes(`href="${u}"`)) fail.push("the full search URL is not intact in the href");
  if (!/target="_blank"/.test(out)) fail.push("a link that leaves our origin is not opening elsewhere");
  const plain = call("stValue")("https://rocketgrowthagency.com/pricing");
  if (!/>rocketgrowthagency\.com/.test(plain)) fail.push("a non-search URL no longer keeps its host as the label");
  if (call("stValue")("0 held") !== call("stInline")("0 held")) fail.push("a value that is not a URL is no longer passed through untouched");
  // 🔴 AND THE FACT RENDERER MUST ACTUALLY CALL IT. Testing stValue in isolation passes happily
  // while the rows still render through stInline — a capability nobody calls looks finished.
  // → feedback_a_capability_nobody_calls_looks_finished
  if (!/<span class="v">\$\{stValue\(f\.v\)\}/.test(src)) {
    fail.push("the fact row no longer renders its value through stValue");
  }
  const CITE = `Links:\n  Yelp   https://www.google.com/search?q=a%20site%3Ayelp.com\n  BBB    https://www.google.com/search?q=a%20site%3Abbb.org`;
  const ch = call("structuredTextHtml")(call("parseStructuredText")(CITE));
  if (!/Search Google/.test(ch)) fail.push("a rendered citation row does not read as its destination");
  if (/google\.com\/search\?q=[^<"]*<\/a>/.test(ch)) fail.push("a rendered link still shows the encoded query as its label");
}

// ── a link is ONE treatment · the count never repeats its heading · a ranking shows its rank ──
// Chris, 2026-10-02: *"why do these links look different?"* / *"why the added 3 at the end"* /
// *"also can we add rank #?"* → approved admin_competitor_rows_v1
{
  // 🔴 No 48-character threshold: three links in one list must not wear two looks.
  if (/href\.length <= 48/.test(src)) fail.push("the 48-character link threshold is back — long and short URLs would look different again");
  if (/class="u-tail"/.test(src)) fail.push("LINKIFY emits a faded path tail again");
  const L = call("renderStepMarkdown")("a https://example.com/very/long/path?x=1&utm_source=google&utm_medium=x b");
  const lab = (L.match(/>([^<]*)<\/a>/) || [])[1] || "";
  if (!/^example\.com/.test(lab)) fail.push(`a long URL no longer shows just its host: ${JSON.stringify(lab)}`);
  const S = call("renderStepMarkdown")("a https://example.com/seo/ b");
  const lab2 = (S.match(/>([^<]*)<\/a>/) || [])[1] || "";
  if (lab2.replace(/\s*\u2197\s*$/, "") !== lab.replace(/\s*\u2197\s*$/, "")) {
    fail.push(`a short and a long URL on the same host render differently: ${JSON.stringify(lab2)} vs ${JSON.stringify(lab)}`);
  }
  if (!L.includes("utm_medium=x")) fail.push("the full URL no longer survives in the href");

  // 🔴 The count chip must not repeat a number the heading already states.
  const dup = call("structuredTextHtml")(call("parseStructuredText")(
    `Top 3 competitors for "x":\n  1. A — 5 (4 reviews) · cat\n  2. B — 4 (3 reviews) · cat\n  3. C — 3 (2 reviews) · cat`));
  if (/<span class="c">3<\/span>/.test(dup)) fail.push('the count chip repeats a number the heading already states ("Top 3 … 3")');
  const keep = call("structuredTextHtml")(call("parseStructuredText")(
    `Keywords:\n  1. A — 5 (4 reviews) · cat\n  2. B — 4 (3 reviews) · cat`));
  if (!/<span class="c">2<\/span>/.test(keep)) fail.push("the count chip is gone even where the heading does NOT state it");

  // 🔑 A ranking shows its rank — and a numbered PROCEDURE does not.
  if (!/ob-rank">#1</.test(dup)) fail.push("a ranked list no longer shows its rank badge");
  const proc = call("structuredTextHtml")(call("parseStructuredText")(
    `How this works:\n  1. Generate the brief\n  2. Map each keyword`));
  if (/ob-rank/.test(proc)) fail.push("a numbered PROCEDURE is wearing rank badges — that asserts an order of merit that does not exist");
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
