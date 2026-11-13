#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-the-video-shows-the-search-being-typed.mjs
//
// 🔒 WHY (Chris 11-13, screenshot of /v/plastic-surgery-institute/): "the voice says 'when someone searches plumbers
// in beverly hills CA' and it used to type it into the search box. Why did this get removed?" The recorder still
// TYPED it (raw webm, seconds ~3–6), but step 4 trimmed (card start − 13s) off the FRONT of the maps clip, and the
// 11-12 results-freeze moved the card to ~30s, so 17.7s were cut, typing included. Since 11-13 the opening is kept
// and the excess is cut from the middle (planMapsCut). This holds it:
//   1. the recorder types the search (clearAndType) BEFORE the results frame gate / freeze;
//   2. step 4 slices the maps clip from 0 (never a front trim) and passes the middle cut;
//   3. the cut runs after the 30 fps resample and frames are renumbered;
//   4. the REAL planMapsCut, on 6 timelines: the opening (>= 6s, where the typing is) is never cut, a cut inside a
//      still results hold starts inside the hold, and the card lands ~13s into maps.
// exit 0 = the typed search survives into the video · 1 = it can be cut · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.env.SCRAPER_COPY_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");   // the mutation runner points this at its mutated copy
const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${p}`); process.exit(2); } };
const step4 = read("step-4-combine-desktop-mobile.mjs");
const rec = read("step-3-video-recorder.mjs");
const F = [];

// 1. the recorder types the search, and only then gates / freezes the results frame
const typeAt = rec.indexOf("await clearAndType(page, inputSelector, query);");
const gateAt = rec.indexOf("recorderCtl.setFrameGate(async () => !resultsViewProblem(");
const freezeAt = rec.indexOf("FREEZE ON THE VERIFIED RESULTS FRAME NOW");   // the 11-12 results-freeze (other paths pause on the card)
if (freezeAt < 0) F.push("the results-freeze block is not found where expected; check the order of typing and freeze by hand, then re-aim this gate");
if (typeAt < 0) F.push("the recorder no longer types the search into the Maps box (clearAndType(page, inputSelector, query) is gone)");
else {
  if (gateAt >= 0 && gateAt < typeAt) F.push("the results frame gate is set BEFORE the search is typed, so the typing frames are dropped");
  if (freezeAt >= 0 && freezeAt < typeAt) F.push("capture pauses on the results BEFORE the search is typed");
}
if (!/await page\.type\(selector, value, \{ delay: \d+ \}\);/.test(rec)) F.push("clearAndType no longer types character by character (page.type with a delay)");

// 2. step 4 never trims the front of the maps clip
if (!/sliceAndPad\(pair\.mapsPath, 0, null, mapsTargetSec, mapsTmp, true, mapsPlan\.cut\)/.test(step4))
  F.push("step 4 does not slice the maps clip from 0 with the middle cut: a front trim cuts the typed search away");
if (!/const mapsPlan = planMapsCut\(await detectFreezes\(pair\.mapsPath\)\);/.test(step4)) F.push("step 4 does not plan the maps cut from the clip's still stretches");

// 3. the cut happens after the 30 fps resample, and frames are renumbered
if (!/fps=30,\$\{cutFilter\}scale=1280:720/.test(step4)) F.push("the middle cut does not run right after fps=30 (before it, select's timestamps are the recorder's uneven ones)");
if (!/setpts=N\/30\/TB/.test(step4)) F.push("the frames after the cut are not renumbered (setpts=N/30/TB): the cut would leave a gap");

// 4. the real planMapsCut, behaviourally
const m = step4.match(/function planMapsCut[\s\S]*?\n}\n/);
const offset = Number((step4.match(/MAPS_CARD_OFFSET_SEC \|\| (\d+(?:\.\d+)?)/) || [])[1]);
const keep = Number((step4.match(/MAPS_OPENING_KEEP_SEC \|\| (\d+(?:\.\d+)?)/) || [])[1]);
if (!m || !(offset > 0) || !(keep > 0)) { console.error("⚠️  INDETERMINATE — planMapsCut or its settings could not be read from step 4"); process.exit(2); }
if (keep < 6) F.push(`the opening kept without a still hold is ${keep}s; the typing runs to ~6s`);
if (offset !== 13) F.push(`the card lands ${offset}s into maps; the voiceover reaches the listing at ~13s (Chris 06-24)`);
let plan;
try { plan = new Function("MAPS_CARD_OFFSET_SEC", "MAPS_OPENING_KEEP_SEC", `${m[0]}\nreturn planMapsCut;`)(offset, keep); }
catch (e) { console.error(`⚠️  INDETERMINATE — planMapsCut does not load: ${e.message}`); process.exit(2); }
const lands = (p, cardStart) => (p.cut ? cardStart - (p.cut.to - p.cut.from) : cardStart);
const CASES = [
  // [name, freezes, expectation(plan) -> problem or null]
  ["11-12 plastic-surgery-institute: hold 7.2→30.7, card 30.7", [{ start: 7.2, end: 30.7 }, { start: 30.7, end: null }],
    (p) => !p.cut ? "no cut, the card would land at 30.7s" : p.cut.from < 7.2 ? `the cut starts at ${p.cut.from}s, before the still hold (the typing is cut)` : Math.abs(lands(p, 30.7) - offset) > 0.05 ? `the card lands at ${lands(p, 30.7).toFixed(2)}s` : null],
  ["October 24/7 Locksmith: no hold, card 18.7", [{ start: 18.733, end: null }],
    (p) => !p.cut ? "no cut" : p.cut.from < 6 ? `the cut starts at ${p.cut.from}s, inside the typing` : Math.abs(lands(p, 18.733) - offset) > 0.05 ? `the card lands at ${lands(p, 18.733).toFixed(2)}s` : null],
  ["card already early (10s): nothing cut", [{ start: 10, end: null }], (p) => (p.cut ? `cut ${JSON.stringify(p.cut)} on a clip that is already short` : null)],
  ["no still stretch at all: nothing cut", [], (p) => (p.cut ? "a cut with nothing to measure" : null)],
  ["a hold that starts late (14s)", [{ start: 14, end: 40 }, { start: 40, end: null }],
    (p) => !p.cut ? "no cut" : p.cut.from < 14 ? "the cut starts before the hold" : lands(p, 40) <= p.cut.from ? "the card lands before the cut ends" : null],
  ["a still stretch early that is NOT the hold (2→4), card 25", [{ start: 2, end: 4 }, { start: 25, end: null }],
    (p) => !p.cut ? "no cut" : p.cut.from < 6 ? `the cut starts at ${p.cut.from}s, inside the typing` : null],
];
for (const [name, fr, expect] of CASES) {
  let p; try { p = plan(fr.map((x) => ({ ...x }))); } catch (e) { F.push(`${name}: planMapsCut threw ${e.message}`); continue; }
  const problem = expect(p);
  if (problem) F.push(`${name}: ${problem}`);
}

if (F.length) {
  console.log(`❌ THE TYPED SEARCH CAN BE CUT FROM THE VIDEO (${F.length}):`);
  for (const x of F) console.log("   • " + x);
  process.exit(1);
}
console.log(`✅ the video keeps the search being typed: the recorder types it first, step 4 never trims the front, and on ${CASES.length} timelines the opening is kept and the card lands ${offset}s into maps`);
process.exit(0);
