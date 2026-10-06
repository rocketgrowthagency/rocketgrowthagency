#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// A BLOCK IS BUILT FROM THE RECORD, SO THE RECORD DECIDES WHETHER IT RENDERS
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴🔴🔴 WHAT WENT WRONG (2026-10-06). Chris, on step 26 after its first real scan against the locked
// plan: *"the design of step 26 is no longer how it used to look? i liked the old design."* The card
// rendered ONE PARAGRAPH, while step 25 two rows above showed keyword rows, verified place pills and
// a surface split.
//
//     const v = classifyVerdicts(text);
//     if (!v) return "";                              ← step 26's plain sentence classifies as NOTHING
//     const baselineBlock = obBaselineBlockHtml(d);   ← never reached
//
// `classifyVerdicts` only recognises the marker lines step 25 writes (ℹ️ 🗺️ 📍). Step 26 writes one
// ordinary sentence, so the entire structured path was skipped — **including the baseline panel built
// for step 26 specifically**, with `per_keyword` fully populated in its record.
//
// 🔑 GATING A RECORD-DRIVEN BLOCK ON THE STEP'S PROSE IS THE SAME DEFECT THE REDESIGN EXISTED TO
// REMOVE — the renderer reading sentences instead of data — moved one level up and left there.
//
// 🔴 AND THE GATE THAT COVERED THIS WAS A SOURCE CHECK. `check-the-grid-measures-the-locked-plan`
// asserts the panel "is defined and never rendered" by matching `obBaselineBlockHtml(d)` and
// `out.push(baselineBlock)` in the source. Both were present. Both were unreachable. **EXISTS is not
// WORKS**, and only rendering it proves which. → feedback_a_gate_that_it_exists_is_not_a_gate_that_it_works
//
// Exit 0 healthy · 1 the product is wrong · 2 INDETERMINATE (could not tell)

import { liftAdmin, safeCall } from "./_lift-admin.mjs";

const fails = [];
const F = (m) => fails.push(m);

// 🔑 NAMED EXPLICITLY because these are CALL-TIME dependencies on a branch, which the lifter resolves
// at eval time only. If this list goes stale the lift reports INDETERMINATE (exit 2), never a product
// failure. → feedback_a_lift_list_is_a_promise_somebody_will_remember
const { get } = liftAdmin([
  "verdictPanelsHtml", "classifyVerdicts", "VERDICT_KIND", "parseChange",
  "obSurfaceBlockHtml", "obPlacesBlockHtml", "obNarrowedBlockHtml", "obBaselineBlockHtml",
  "obVerifiedPlaces", "obPlaceEvidenceHtml", "obDraftListsPlaces", "obStripMarker", "obPlaceLabel",
]);

const render = (text, task) => safeCall(get("verdictPanelsHtml"), [text, task], "verdictPanelsHtml");
const classify = get("classifyVerdicts");

// ── the real shape step 26 writes, with the real sentence it writes alongside it ──────────────────
const GRID_PROSE = "5 of 5 locked keywords measured on a 25-point grid centred on Rocket Growth "
  + "Agency's location (Culver City, CA), scanned 0 day(s) ago. Found at NONE of the 25 points for "
  + "any of them — this business does not appear in the map pack for these terms anywhere in the "
  + "measured area. That is the baseline every later scan is measured against.";
const GRID_TASK = { outcome_data: {
  action: "scanned", anchor: "business", market: "Culver City, CA", points: 25, ranked: 0,
  centred_on: "Rocket Growth Agency",
  keywords: ["local seo services near me", "google business profile optimization",
    "local seo agency culver city", "seo company culver city ca", "search engine optimization agencies"],
  per_keyword: [
    { keyword: "local seo services near me", measured: true, points: 25, ranked: 0, top3: 0, best: null },
    { keyword: "google business profile optimization", measured: true, points: 25, ranked: 0, top3: 0, best: null },
    { keyword: "local seo agency culver city", measured: true, points: 25, ranked: 0, top3: 0, best: null },
    { keyword: "seo company culver city ca", measured: true, points: 25, ranked: 0, top3: 0, best: null },
    { keyword: "search engine optimization agencies", measured: true, points: 25, ranked: 2, top3: 1, best: 3 },
  ],
} };

// 🔑 THE FIXTURE MUST FAIL FOR THE REASON IT TESTS. If this prose DID classify, the whole gate would
// pass for the wrong reason — the blocks would render off the prose path and nothing would be proven.
// → feedback_a_fixture_must_fail_for_the_reason_it_tests
if (classify(GRID_PROSE)) {
  console.error("⚠️  INDETERMINATE — the step-26 fixture prose now classifies as verdicts, so this");
  console.error("    gate can no longer tell whether the block came from the record or the sentence.");
  process.exit(2);
}

const html = render(GRID_PROSE, GRID_TASK);
const rows = (String(html).match(/class="ob-crow"/g) || []).length;
if (!rows) {
  F("step 26's record renders NO baseline rows — the designed panel is unreachable and the card falls "
    + "back to one paragraph, which is exactly what Chris reported");
} else if (rows !== 5) {
  F(`the baseline panel rendered ${rows} row(s) for a 5-keyword plan`);
}

// Every locked keyword must appear by name, not just a count.
for (const kw of GRID_TASK.outcome_data.keywords) {
  if (!String(html).includes(kw)) F(`"${kw}" is in the record but not on the card`);
}

// 🔑 RANKED AND ABSENT MUST READ DIFFERENTLY, or the baseline says nothing a later scan can move.
if (!/\babsent\b/.test(String(html))) F("a keyword found at no point does not read as absent");
if (!/\branking\b/.test(String(html))) F("a keyword that IS ranking does not read as ranking");
if (!/best #3/.test(String(html))) F("the best position measured (#3) never reaches the card");

// ── and an UNSCANNED keyword is its own state, never 'absent everywhere' ──────────────────────────
const partial = { outcome_data: { ...GRID_TASK.outcome_data,
  per_keyword: [{ keyword: "never scanned", measured: false }] } };
const ph = String(render(GRID_PROSE, partial));
// 🔴 BOTH SIGNALS, NOT EITHER. The row states "unscanned" twice — once as the LABEL beside the
// keyword and once as the VALUE where a point count would be. An `||` here passed a mutation that
// removed the label and left the value, which is precisely the half that a reader scanning the
// label column would never see. → feedback_a_chosen_property_list_is_a_claim_about_what_i_looked_at
if (!/not scanned/.test(ph)) F("an unscanned keyword's LABEL does not say so — it reads as measured-and-absent");
if (!/no scan on file/.test(ph)) F("an unscanned keyword's VALUE does not say so — it reads as a point count");
if (/\babsent\b/.test(ph)) F("an unscanned keyword is described as absent, which claims a measurement nobody made");

// ── the step-25 path must be unchanged: prose that DOES classify still renders its panels ─────────
const V_PROSE = "ℹ️ 2 keywords could not be sized.\n🗺️ Surface, measured at Culver City: 3 of 5 trigger a map pack.";
if (!classify(V_PROSE)) {
  console.error("⚠️  INDETERMINATE — the step-25 fixture no longer classifies; cannot prove that path survives.");
  process.exit(2);
}
const vh = String(render(V_PROSE, { outcome_data: {} }));
if (!vh.trim()) F("a step whose prose DOES classify now renders nothing — the verdict path regressed");

// ── a step with neither verdicts nor record data still renders nothing ────────────────────────────
const empty = String(render("just a sentence with no markers", { outcome_data: {} }));
if (empty.trim()) F("a step with no verdicts and no record data now renders a panel out of nowhere");

// ───────────────────────────────────────────────────────────────────────────────────────────────────
if (fails.length) {
  console.error(`❌ A BLOCK MUST RENDER FROM THE RECORD — ${fails.length} problem(s):\n`);
  for (const f of fails) console.error(`   · ${f}`);
  process.exit(1);
}
console.log("✅ the baseline panel renders from the record even when the prose classifies as nothing · "
  + "5 keywords named · ranked ≠ absent ≠ unscanned · the verdict path and the empty case unchanged");
