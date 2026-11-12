#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-the-maps-frame-shows-the-business-and-the-search.mjs
//
// 🔒 WHY (Chris, 2026-11-12, from the 3 videos built the night of 11-11 — "this is not zoomed in enough"):
//   american-structural-pest-control-west-inc (rank 40) — results list beside a county-wide map until the card
//   south-bay-pest-pros (rank 4)  — panel collapsed, map centred on ocean; the card frame had the pin at the
//                                   top-right edge UNDER the rank overlay (centre 9.6km off; the gate allowed 25km)
//   xtermicon (rank 28)           — Google's "El Segundo" CITY card instead of the results list
// Every downstream gate looked only at the card frame, and the 25km map-centre bound cannot see "on screen but
// hidden". Two fixes in step-3-video-recorder.mjs, held here:
//   1. ensureResultsViewFramed(): the results page is verified (listings present, no place card, panel open, search
//      box = the search) and reloaded from the anchored URL if not, then the map is panned/zoomed to city level;
//      it runs before capture is paused on the results frame, and FAILS CLOSED.
//   2. businessFramePx() / assertMapCentredOnBusiness(): the business must sit inside the VISIBLE map box, judged in
//      pixels from the URL centre + zoom; recentred, else the lead fails.
// exit 0 = held · 1 = a regression · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.env.SCRAPER_COPY_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let src;
try { src = fs.readFileSync(path.join(ROOT, "step-3-video-recorder.mjs"), "utf8"); } catch { console.error("⚠️  INDETERMINATE — cannot read step-3-video-recorder.mjs"); process.exit(2); }
const code = src.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const F = []; const fail = (m) => F.push(m);
const fn = (name) => (code.match(new RegExp(`(?:async )?function ${name}\\([\\s\\S]*?\\n\\}\\n`)) || [])[0];

// ── 1 · the results page is verified and framed before capture pauses on it ──
const ens = fn("ensureResultsViewFramed"), prob = fn("resultsViewProblem");
if (!ens) fail("1a no ensureResultsViewFramed() — the held results frame is never checked");
else {
  if (!/resultsViewProblem\(/.test(ens)) fail("1b ensureResultsViewFramed() never judges the results page");
  if (!/page\.goto\(retryUrl/.test(ens)) fail("1c a bad results page is not reloaded from the anchored URL");
  if (!/if \(problem\) \{\s*throw new Error\(`\[step-3 GUARDRAIL\][^`]*not a usable results list/.test(ens)) fail("1d a still-bad results page does not fail the lead");
  if (!/scale > CITY_SCALE_MAX_M\)\s*\{\s*throw/.test(ens)) fail("1e a still-regional results map does not fail the lead");
  if (!/forceMapsCityZoom\(page, label\)/.test(ens)) fail("1f a regional results map is never zoomed to city level");
  if (!/recentreMapOnBusiness\(page, meta, label, \{ centre: wide \}\)/.test(ens)) fail("1g the business is not put on the viewport centre before zooming (zoom is toward the centre)");
}
if (!prob) fail("1h no resultsViewProblem()");
else for (const [re, what] of [[/st\.detail/, "a place card instead of the list (xtermicon)"], [/st\.anchors < 3/, "no listings"], [/!st\.feedVisible/, "a collapsed panel (south-bay)"], [/_normQ\(st\.box\) !== _normQ\(query\)/, "a search box that is not the search"]])
  if (!re.test(prob)) fail(`1i resultsViewProblem() does not catch ${what}`);
const call = code.match(/await ensureResultsViewFramed\(page, meta, query, initialMapsUrl[^)]*\);/);
if (!call) fail("1j ensureResultsViewFramed() is never called with the anchored results URL");
else {
  const at = code.indexOf(call[0]);
  const firstPause = code.indexOf("recorderCtl.pauseCapture()", code.indexOf("const initialMapsUrl"));
  if (firstPause !== -1 && at > firstPause) fail("1k the results page is verified AFTER capture is paused on it");
}

if (!/initialMapsUrl, 'results-view'\);/.test(code)) fail("1n the first results verification (before the settle + Title Case) is gone");
// ── 1l · capture is paused on a VERIFIED frame right after the results are verified ──
if (!/let _frozen = false;[\s\S]*?'results-freeze'\);[\s\S]*?liveCaptureCount\(\) < c0 \+ 2[\s\S]*?recorderCtl\.pauseCapture\(\);\s*if \(resultsViewProblem\([\s\S]*?recorderCtl\.resumeCapture\(\); continue; \}[^\n]*\n\s*_frozen = true;[\s\S]*?if \(!_frozen\) \{\s*throw new Error/.test(code))
  fail("1l capture is not paused on a re-verified results frame (or no verified frame does not fail the lead) before the typed search / goto chain (xtermicon live tests 11-12: 20s of collapsed ocean)");
if (ens && !/xpand side panel/.test(ens)) fail("1m a collapsed results panel is not re-opened");

// ── 1o · frames of an unverified results page are dropped, not filmed ──
if (!/recorderCtl\.setFrameGate\(async \(\) => !resultsViewProblem\(/.test(code)) fail("1o the live capture is not gated on the results page being verified (a 3s collapsed-ocean frame was filmed inside the repair window, 11-12)");
if (!/if \(frameGate\)[\s\S]{0,120}?frameGate\(\)[\s\S]{0,120}?if \(_okFrame\) latestFrame = _grabbed;/.test(code)) fail("1p the capture loop does not drop a frame the gate rejects");

// ── 2 · the business must be inside the visible map ──
const frm = fn("businessFramePx");
if (!frm) fail("2a no businessFramePx() — the card frame is judged only by the 25km bound");
const asrt = fn("assertMapCentredOnBusiness");
if (!asrt) fail("2b no assertMapCentredOnBusiness()");
else {
  if (!/businessFramePx\(page, meta\)/.test(asrt)) fail("2c assertMapCentredOnBusiness() does not read the business's place in the frame");
  if (!/fr0 && !fr0\.inFrame\) \{\s*const rec = await recentreMapOnBusiness\(page, meta, label\)/.test(asrt)) fail("2d an out-of-frame business is not recentred");
  if (!/if \(fr1 && !fr1\.inFrame\) \{\s*throw new Error\([\s\S]*?not inside the VISIBLE map/.test(asrt)) fail("2e a business still out of frame does not fail the lead");
}
const rc = fn("recentreMapOnBusiness");
if (!rc || !/fr\.inFrame/.test(rc)) fail("2f recentreMapOnBusiness() returns early on a map that is within 25km but out of frame");

// behavioural: the exact 11-11 South Bay numbers through the real functions
const box = (code.match(/const FRAME_BOX = (\{[^}]*\});/) || [])[1];
const wp = (code.match(/const _worldPx = [\s\S]*?\n\};\n/) || [])[0];
const rd = (code.match(/function readMapCentreFromUrl\(page\) \{[\s\S]*?\n\}\n/) || [])[0];
if (frm && box && wp && rd) {
  try {
    const mk = new Function(`const FRAME_BOX = ${box}; ${wp} ${rd} ${frm.replace(/^async /, "")}; return businessFramePx;`)();
    const page = (u) => ({ url: () => u, viewport: () => ({ width: 1600, height: 900 }) });
    const sb = { lat: 33.9541476, lng: -118.3957595 };
    const bad = mk(page("https://www.google.com/maps/place/x/@33.9195526,-118.4908266,13z/data=!4"), sb);
    if (!bad || bad.inFrame) fail(`2g South Bay (centre 9.6km off over ocean, 13z) reads as IN frame: ${JSON.stringify(bad)}`);
    const good = mk(page("https://www.google.com/maps/place/x/@33.9541476,-118.4400,13z/data=!4"), sb);
    if (!good || !good.inFrame) fail(`2h a business 3.7km east of centre-left reads as OUT of frame: ${JSON.stringify(good)}`);
    const top = mk(page("https://www.google.com/maps/place/x/@33.8964,-118.4400,13z/data=!4"), sb);
    if (!top || top.inFrame) fail(`2l a business at the very top edge (under the search chips) reads as IN frame: ${JSON.stringify(top)}`);
    const centred = mk(page("https://www.google.com/maps/place/x/@33.8657631,-118.3756081,14z/"), { lat: 33.8657631, lng: -118.35591 });
    if (!centred || !centred.inFrame) fail(`2i Xtermicon's own 11-11 view reads as OUT of frame: ${JSON.stringify(centred)}`);
  } catch (e) { fail(`2j behavioural lift failed: ${e.message}`); }
} else fail("2k could not lift businessFramePx/_worldPx/readMapCentreFromUrl for the behavioural check");

if (F.length) { console.error(`✗ ${F.length} problem(s):\n  - ${F.join("\n  - ")}`); process.exit(1); }
console.log("✓ the results page is verified + framed before capture pauses, and the business must sit in the visible map");
