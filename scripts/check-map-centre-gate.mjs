#!/usr/bin/env node
/**
 * check-map-centre-gate.mjs — static pre-flight guard for the 2026-08-17 "map over water" defect.
 *
 * WHAT HAPPENED
 * `team-plumbing-west-los-angeles` rendered a crisp 2-mile view of the CHANNEL ISLANDS — ~250km out in
 * the Pacific — and PASSED every gate we had: detail card open, rank overlay "#17", scale bar "2 mi",
 * and enough ocean-blue/island-green/labels to clear the BLANK-MAP colour and edge thresholds. Chris
 * caught it by eye. No pixel test can catch this: the frame is a perfectly normal-looking map, it is
 * just a map of the wrong place. Only GEOMETRY (map centre vs the business's own coordinates) can.
 *
 * Root cause: a bare /maps/search/<term> lets Google fit the viewport to ALL results, and far-flung
 * listings drag it to STATE zoom. forceMapsCityZoom then zooms toward the VIEWPORT CENTRE, not the
 * business, arriving at a convincing city zoom hundreds of km away.
 *   bare      /maps/search/Plumbers+in+Santa+Monica+CA/          -> @35.36,-119.70, 7z  scale 80467m
 *   anchored  /maps/search/<same>/@34.0466643,-118.4365265,13z   -> @34.05,-118.44,13z  scale  1609m
 *
 * WHY THIS CHECK IS STATIC
 * step-3 exports nothing and IMPORTING it launches a browser (a previous pre-flight did exactly that and
 * opened Chrome on Chris's screen mid-session). So this reads the SOURCE and asserts the invariants.
 * It deliberately does NOT re-implement the maths: re-deriving a constant in the test is how the nightly
 * rehearsal stayed green for three weeks while sabotaging the wrong rectangle.
 *
 * THE INVARIANT THAT MATTERS MOST
 * EVERY forceMapsCityZoom() call site must be followed by assertMapCentredOnBusiness() with the SAME
 * label. "One path guarded, the others not" is precisely the bug that cost the 08-14/15/16 nights: the
 * `_cardOpenedInPage` flag was set on the deep-rank path but not on scroll-find, and 35 captures shipped
 * broken because of it.
 */
import fs from 'node:fs';

const SRC = 'step-3-video-recorder.mjs';
const src = fs.readFileSync(new URL(`../${SRC}`, import.meta.url), 'utf8');
const lines = src.split('\n');
let failed = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { console.error(`  ✗ ${m}`); failed++; };

// 1 — every forceMapsCityZoom call site is immediately followed by the centre assertion, same label.
const callSites = [];
lines.forEach((l, i) => {
  const m = l.match(/await forceMapsCityZoom\(page,\s*'([^']+)'\)/);
  if (m) callSites.push({ label: m[1], line: i + 1 });
});
if (callSites.length === 0) bad('found ZERO forceMapsCityZoom call sites — this checker is looking at the wrong thing');
else ok(`found ${callSites.length} forceMapsCityZoom call site(s)`);

for (const site of callSites) {
  // scan the next few lines (comments may intervene) for the matching assertion
  const window = lines.slice(site.line, site.line + 8).join('\n');
  const re = new RegExp(`assertMapCentredOnBusiness\\(page,\\s*meta,\\s*'${site.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`);
  if (re.test(window)) ok(`'${site.label}' (line ${site.line}) is followed by the map-centre assertion`);
  else bad(`'${site.label}' (line ${site.line}) is NOT guarded by assertMapCentredOnBusiness — a wrong-location render on this path would ship, because no pixel gate can detect it`);
}

// 2 — the assertion must actually THROW (fail-closed), not warn.
const assertBody = src.match(/async function assertMapCentredOnBusiness[\s\S]*?\n}/);
if (!assertBody) bad('assertMapCentredOnBusiness() is missing entirely');
else if (!/throw new Error/.test(assertBody[0])) bad('assertMapCentredOnBusiness() does not throw — a warn-only guard ships the broken video');
else ok('assertMapCentredOnBusiness() is fail-closed (throws)');

// 3 — the results viewport must be anchored to the business coordinates.
if (/const mapsCoordAnchor\s*=/.test(src) && /maps\/search\/\$\{encodeURIComponent\(query\)\}\$\{mapsCoordAnchor\}/.test(src)) {
  ok('the Maps results URL is anchored to the business coordinates (@lat,lng,13z)');
} else {
  bad('the Maps results URL is NOT coordinate-anchored — Google will fit the viewport to ALL results and can open at state zoom');
}

// 4 — the threshold must remain a physical bound, not quietly widened into uselessness.
const thr = src.match(/const MAP_CENTRE_MAX_KM\s*=\s*([\d.]+)/);
if (!thr) bad('MAP_CENTRE_MAX_KM is missing');
else {
  const km = parseFloat(thr[1]);
  if (km > 0 && km <= 50) ok(`MAP_CENTRE_MAX_KM = ${km}km (a city-zoom viewport is ~5-15km wide, so this keeps the business on screen)`);
  else bad(`MAP_CENTRE_MAX_KM = ${km}km is too loose to mean anything — the business could be far off screen and still pass`);
}

// 5 — the scale-bar reader must keep `label` in its selector. Maps renders the bar as
// <label class="U5ELMd">2000 ft</label>; without `label` the function returns null 100% of the time,
// which is how it sat dead for a week while logging a reassuring "scale unreadable" 99/99 times.
const sel = src.match(/querySelectorAll\('([^']*td[^']*)'\)/);
if (!sel) bad('could not find the scale-bar selector');
else if (!/\blabel\b/.test(sel[1])) bad(`scale-bar selector '${sel[1]}' is missing 'label' — readMapScaleMeters() will silently return null on EVERY call and the zoom check becomes a no-op`);
else ok(`scale-bar selector includes 'label' ('${sel[1]}')`);

console.log('');
if (failed) {
  console.error(`✗ map-centre gate: ${failed} invariant(s) broken — a wrong-location video could ship. Aborting.`);
  process.exit(1);
}
console.log(`✅ map-centre gate: all invariants hold (${callSites.length} capture path(s) guarded).`);
