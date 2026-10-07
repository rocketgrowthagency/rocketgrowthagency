#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// THE GEO-GRID SUMMARY IS WRITTEN IN THE SHAPE ITS APPROVED DESIGN READS
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴🔴🔴 WHAT WENT WRONG (2026-10-06). Chris: *"i thought this was the design for the geo grid?"*,
// pointing at `reports/mockups/admin_structured_text_v1.html` — approved, built, and covered by
// `check-a-plain-text-output-is-designed`, which was GREEN the whole time.
//
// The renderer was never the problem. `parseStructuredText` reads a LEAD line, a `RESULT:` verdict,
// and INDENTED `label  value` rows. Earlier that day I rewrote the step-26 summary into one flowing
// sentence, and a flowing sentence parses to **null** — so the card fell back to a paragraph.
//
//     OLD text → lead + verdict + coverage fact rows   → the design renders
//     NEW text → null                                  → a plain paragraph
//
// 🔑 A DESIGN THAT READS A GRAMMAR IS BROKEN BY REWRITING THE TEXT, NOT BY TOUCHING THE RENDERER.
// Every gate over the renderer stayed green, because the renderer was still perfect. Nothing watched
// the PRODUCER, so nothing noticed the input had stopped having a shape.
//
// This gate runs the producer's own template and parses what it emits.
// → project_attach_the_fact_to_the_thing · feedback_a_message_needs_a_shape
//
// Exit 0 healthy · 1 the product is wrong · 2 INDETERMINATE

import fs from "node:fs";
import vm from "node:vm";
import { liftAdmin } from "./_lift-admin.mjs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const fails = [];
const F = (m) => fails.push(m);

let src;
try { src = fs.readFileSync(`${SITE}/netlify/functions/flow-execute.js`, "utf8"); }
catch { console.error("⚠️  INDETERMINATE — cannot read flow-execute.js"); process.exit(2); }

// ── pull the grid summary's own array literal out of the executor and RUN it ──────────────────────
// 🔑 Bracket-matched, not a character window: the literal is ~15 lines and grows.
// → feedback_a_gate_window_measured_in_characters_will_lie
const start = src.indexOf("summary: [", src.indexOf('"m1.audit.grid_baseline"'));
if (start < 0) { console.error("⚠️  INDETERMINATE — the grid summary is no longer an array literal; cannot run it."); process.exit(2); }
let d = 0, end = -1;
for (let i = src.indexOf("[", start); i < src.length; i++) {
  if (src[i] === "[") d++;
  else if (src[i] === "]") { d--; if (!d) { end = i + 1; break; } }
}
// 🔴 TAKE THE `.join(...)` FROM THE SOURCE TOO. The first version evaluated `(literal).join("\\n")`
// with the separator written by the GATE — so changing the product's own join to " ", which
// collapses every line into one flowing sentence and is EXACTLY the bug this gate exists to catch,
// came back green. A harness that supplies the thing under test cannot test it.
// → feedback_the_harness_i_wrote_to_check_my_work_can_lie
let expr = src.slice(src.indexOf("[", start), end);
const after = src.slice(end, end + 80);
const joinM = after.match(/^\s*\.join\s*\(/);
if (!joinM) { console.error("⚠️  INDETERMINATE — the grid summary array is no longer joined; cannot tell what it emits."); process.exit(2); }
let jd = 0, jend = -1;
for (let i = end + after.indexOf("("); i < src.length; i++) {
  if (src[i] === "(") jd++;
  else if (src[i] === ")") { jd--; if (!jd) { jend = i + 1; break; } }
}
if (jend < 0) { console.error("⚠️  INDETERMINATE — could not read the join's arguments."); process.exit(2); }
const literal = expr + src.slice(end, jend);

// The variables the template reads, with RGA's real measured shape: 5 keywords × 25 points, 0 ranked.
const scope = {
  fullSize: 25, ageDays: 0, anchorKind: "business", market: "Culver City, CA",
  client: { business_name: "Rocket Growth Agency" },
  perKeyword: Array.from({ length: 5 }, (_, i) => ({ keyword: `kw${i}`, measured: true, points: 25, ranked: 0, top3: 0, top10: 0 })),
  // 🔑 EVERY VARIABLE IN SCOPE AT THAT POINT, not only the ones today's template happens to read.
  // A mutation that reaches for `measuredKw` otherwise throws, the gate reports INDETERMINATE —
  // correctly, it genuinely could not tell — and the regression goes uncaught. Supplying the real
  // surroundings is what lets the gate judge a rewrite instead of giving up on it.
  // → feedback_a_gate_that_throws_is_not_a_gate_that_fails · feedback_a_fixture_must_fail_for_the_reason_it_tests
  measuredKw: Array.from({ length: 5 }, (_, i) => ({ keyword: `kw${i}`, measured: true, points: 25, ranked: 0, top3: 0, top10: 0 })),
  partials: 0, keyword: "seo company", scanKeyword: "local seo services near me", radiusKm: 5.3,
  newest: { at: "2026-10-06T23:41:58.420Z" },
  rankedKw: [], totalPoints: 125, totalRanked: 0, totalTop3: 0, totalTop10: 0,
  pctOf: (n) => (Math.round((n / 125) * 1000) / 10).toFixed(1),
};
let text;
try { text = vm.runInNewContext(`(${literal})`, { ...scope }); }
catch (e) { console.error(`⚠️  INDETERMINATE — the summary template reads something this gate does not supply: ${e.message}`); process.exit(2); }

// ── parse it with the product's OWN parser ───────────────────────────────────────────────────────
const { get } = liftAdmin(["parseStructuredText", "ST_BAD_KEYS", "ST_NOTE_KEYS", "ST_OK_KEYS",
  "ST_VERDICT", "stFact", "stGroupOf", "stIndent", "stInline", "stItem", "stRating", "stSentence",
  "stTitleCase", "stValue", "stZero", "renderStepMarkdown"]);
const p = get("parseStructuredText")(text);

if (!p) {
  F("the grid summary parses to NOTHING — it is prose again, so the card renders one paragraph "
    + "instead of the approved verdict-and-coverage design");
} else {
  const body = Array.isArray(p.body) ? p.body : [];
  // 🔴 NO LEAD SENTENCE ANY MORE, ON PURPOSE. Until 2026-10-07 this required one, and the approved
  // scan header REPLACES it: the facts it carried are rows now, and leaving the sentence as well
  // would be the "a structured block competes with a paragraph" defect this card was redesigned to
  // remove. The header is asserted below instead. → reports/mockups/admin_scan_header_v2.html
  if ((p.lead || []).join(" ").trim()) {
    F(`the summary still opens with a lead sentence ("${(p.lead || []).join(" ").slice(0, 60)}…") as well as `
      + "the scan header — the same facts twice");
  }

  const verdict = body.find((b) => b.kind === "verdict");
  if (!verdict) F("the summary carries no RESULT verdict — the one line the output exists to deliver");
  else if (!/\d/.test(String(verdict.text))) F("the RESULT verdict states no number");

  const facts = body.find((b) => (b.kind === "facts" || b.kind === "group") && /coverage/i.test(String(b.title || "")));
  if (!facts) F("the summary has no Coverage group — Top-3 / Top-10 / Not found are the figures the baseline exists to record");
  else {
    const rows = facts.facts || facts.rows || [];
    const keys = rows.map((r) => String(r.k || "").toLowerCase());
    for (const want of ["top-3", "top-10", "not found"]) {
      if (!keys.some((k) => k.includes(want))) F(`the Coverage group never states "${want}"`);
    }
    // 🔑 A ZERO IS THE FINDING, and the design colours it. If the parser does not mark it, it renders
    // as an ordinary number and the one thing worth seeing reads like the rest.
    if (!rows.some((r) => r.zero)) F("a 0 / 125 coverage row is not flagged as a zero, so it renders as an ordinary number");
  }

  // 🔑 THE GROUP HEADING STATES THE MEASURED QUANTITY, NOT THE NUMBER OF ROWS. The approved mockup
  // reads `COVERAGE  81 points`; the generic row count rendered `COVERAGE  3`, which tells a reader
  // something they can already see and withholds the one number they want.
  // → reports/mockups/admin_structured_text_v1.html
  if (facts && !/\(\s*\d[^)]*\)/.test(String(facts.title || "")))
    F(`the Coverage heading states no quantity ("${facts.title}"), so the card chips its ROW COUNT instead of the points measured`);

  // ═════════════════════════════════════════════════════════════════════════════════════════════
  // 🎨 THE SCAN HEADER — approved 2026-10-07, reports/mockups/admin_scan_header_v2.html
  // A rank measurement means nothing without WHAT was searched and WHERE FROM. Both were buried in
  // one flattened sentence, and the total points measured was not in it at all.
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  const header = body.find((b) => b.kind === "facts" && !String(b.title || "").trim());
  if (!header) {
    F("the summary opens with no scan header — the approved design leads with Searched / Centred on "
      + "as fact rows, not with a sentence");
  } else {
    const keys = (header.facts || []).map((f) => String(f.k || "").toLowerCase());
    if (!keys.some((k) => k.includes("searched"))) F("the scan header never says WHAT was searched");
    if (!keys.some((k) => k.includes("centred"))) F("the scan header never says WHERE it was centred");
    // each row carries its incidentals as a sub-value, which is what keeps them out of the headline
    for (const f of header.facts || []) {
      if (!f.note) F(`the scan header row "${f.k}" has no sub-value, so its incidentals are either missing or in the headline`);
    }
    // 🔑 THE TOTAL BELONGS IN THE HEADER. It is the number the whole scan produces and it used to
    // appear only two blocks later, inside the result.
    const said = (header.facts || []).map((f) => `${f.v} ${f.note}`).join(" ");
    if (!said.includes(String(scope.totalPoints))) F("the scan header never states the total points measured");
  }
  // 🔴 THE AREA STATE MUST SAY WHY, because "not found across N points" reads identically whether we
  // searched around their pin or around downtown.
  const areaBranch = (literal.match(/anchorKind === "area"[\s\S]{0,500}/) || [""])[0];
  if (!/could not find|could not be found/i.test(areaBranch)) {
    F("the area-centred header does not say the business could not be found, so a grid centred on the "
      + "city reports identically to one centred on the client");
  }
  // 🔑 THE RADIUS IS MEASURED. A literal here would be a hardcoded stat on a client-facing card.
  if (/\d+(\.\d+)?\s*km radius/.test(literal) && !/radiusKm/.test(literal)) {
    F("the header prints a radius that is not read from the record");
  }

  // 🔴 IT SAYS WHEN IT WAS MEASURED, NOT A ROUNDED AGE. "Scanned 1 day(s) ago" was
  // Math.round(14.5 hours / 24) on a card stamped with this morning, after a press that re-read a
  // stored measurement rather than scanning. A date cannot be misread as "the button I just pressed
  // did this". → feedback_a_client_message_must_agree_with_itself
  if (/\bday\(s\) ago\b|\bdays? ago\b/.test(text)) {
    F("the summary still reports a rounded AGE instead of when it was measured");
  }
  if (!/\bMeasured\b/.test(text)) F("the summary never says when the grid was measured");
  // the zone is named, so a time on an admin card cannot be read in the wrong one
  // 🔑 A CLOCK TIME WITH NO ZONE IS AMBIGUOUS. Read it off the rendered text: the zone must follow
  // the time. (The first version of this check was convoluted enough that it never fired, and the
  // mutation removing `timeZoneName` came back green.)
  if (/\bMeasured\b[^.]*\d:\d{2}\s?(AM|PM)/.test(text) && !/\bMeasured\b[^.]*\d:\d{2}\s?(AM|PM)\s+[A-Z]{2,4}\b/.test(text)) {
    F("the measured time states no timezone, so a clock time on an admin card is ambiguous");
  }

  // 🔑 THE WHOLE GRID, NOT ONE KEYWORD'S. The old sentence said "NONE of the 25 points for any of
  // them" while five keywords × 25 points had been measured — understating the work fivefold.
  if (!text.includes("125")) F("the summary never states the total points measured across the plan (5 × 25 = 125)");
  if (/\bof the 25 points for any of them\b/.test(text)) F("the summary still quotes ONE keyword's grid size while claiming all of them");
}

// ── and the per-keyword rows must NOT be repeated here: the record-driven panel owns them ─────────
const kwLines = (text.match(/^\s+kw\d/gm) || []).length;
if (kwLines) F(`the summary lists ${kwLines} per-keyword row(s) that the baseline panel already renders — the same data twice`);

// ───────────────────────────────────────────────────────────────────────────────────────────────────
if (fails.length) {
  console.error(`❌ THE GRID SUMMARY DOES NOT FIT ITS DESIGN — ${fails.length} problem(s):\n`);
  for (const f of fails) console.error(`   · ${f}`);
  process.exit(1);
}
console.log("✅ the grid summary parses into lead + RESULT verdict + Coverage facts, states the whole "
  + "grid's points, flags its zeros, and does not repeat the per-keyword panel");
