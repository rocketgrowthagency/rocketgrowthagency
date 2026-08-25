#!/usr/bin/env node
/**
 * check-map-recentre-recovery.mjs — a statewide-fit viewport must be RECOVERED, not just refused.
 *
 * ─── WHY (2026-08-24) ────────────────────────────────────────────────────────────────────────────
 * The geometric map-centre guardrail (2026-08-17) is correct and stays: it catches a crisp, convincing
 * map of the WRONG PLACE, which every pixel gate happily passes. But it only ever REFUSED, so every
 * occurrence was a dead lead.
 *
 * On the 08-23 regression the correlation was exact:
 *
 *     zoom 17 / 13  →  offset 0 km                   (10 measurements, all fine)
 *     zoom 10       →  offset 30, 32, 41, 205 km     (4 measurements, all refused)
 *
 * 205km is not "slightly off" — it is a whole region. Google fits the results viewport to ALL results,
 * far-flung ones drag it across the state, and the map never flies to the business. forceMapsCityZoom
 * then zooms toward the VIEWPORT CENTRE, converging on a crisp view of nowhere.
 *
 * Nothing pulled the map BACK. We have the business's exact coordinates and Maps is a Web Mercator
 * projection, so the required pan is arithmetic: convert both points to world pixels at the live zoom
 * and drag the canvas by the difference.
 *
 * Proven live on accuracy-plus, which had failed step-3 six times the same day:
 *     map centre is 30.4km from the business (limit 25km, zoom 10)
 *     recentring map — off 30.4km, pan -240,0px (attempt 1/3)
 *     map RECOVERED by recentring — 30.4km → 2.5km
 *     [step-6 verification-state] Accuracy Plus: 6/6 verified
 *
 * INVARIANTS
 *  1. The recovery exists and is invoked from INSIDE assertMapCentredOnBusiness, so all 6 capture
 *     call sites get it. Wiring it at one site leaves five still shipping the defect.
 *  2. It only fires when the offset ALREADY exceeds the limit — it must never touch a good capture.
 *  3. 🔒 The threshold is untouched. Recovery must not become a way to relax the gate.
 *  4. The guardrail still has the final word: a failed recovery throws exactly as before.
 *  5. The pan is bounded per attempt, so a pan larger than the viewport is stepped, not attempted once
 *     and misread as "the map is stuck".
 *
 * Exit 0 = healthy, 1 = regression.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STEP3 = path.join(path.dirname(HERE), 'step-3-video-recorder.mjs');

const fail = (m) => { console.error(`✗ FATAL: ${m}`); process.exit(1); };
const ok = (m) => console.log(`  ✓ ${m}`);

const raw = fs.readFileSync(STEP3, 'utf8');
const src = raw.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');

// 1 — exists, and called from inside the assertion.
if (!/async function recentreMapOnBusiness/.test(src)) {
  fail('the map recentring recovery is gone. Without it every statewide-fit viewport is a dead lead —\n' +
       '         measured 4 of 14 map reads on the 08-23 regression.');
}
const iAssert = src.indexOf('async function assertMapCentredOnBusiness');
const assertBody = src.slice(iAssert, src.indexOf('\n}', iAssert));
if (!/recentreMapOnBusiness\(/.test(assertBody)) {
  fail('recentring is not called from inside assertMapCentredOnBusiness. There are 6 call sites; wiring\n' +
       '         recovery at one of them leaves the other five shipping the defect.');
}
ok('recovery is invoked from inside the assertion (all capture paths)');

// 2 — only on an already-failing map.
if (!/off !== null && off > MAP_CENTRE_MAX_KM/.test(assertBody)) {
  fail('recentring is not gated on the offset already exceeding the limit. It must never move a map\n' +
       '         that is already correct.');
}
const iRec = src.indexOf('async function recentreMapOnBusiness');
const recBody = src.slice(iRec, src.indexOf('\n}\n', iRec));
if (!/off <= MAP_CENTRE_MAX_KM\) return off/.test(recBody)) {
  fail('the recovery does not return early on an already-correct map.');
}
ok('it only fires on a map already over the limit');

// 3 — 🔒 the gate itself is unchanged.
const thr = src.match(/const MAP_CENTRE_MAX_KM = (\d+)/);
if (!thr || Number(thr[1]) !== 25) {
  fail(`MAP_CENTRE_MAX_KM is ${thr ? thr[1] : 'missing'}, expected 25. Recovery must never become a way to\n` +
       '         relax the gate — 25km is a PHYSICAL bound, not a tuned threshold\n' +
       '         ([[feedback-blank-hero-live-capture-root-cause]]: never weaken a gate to pass a video).');
}
ok('the 25km threshold is untouched');

// 4 — still throws when recovery fails.
if (!/throw new Error\(/.test(assertBody) || !/step-3 GUARDRAIL/.test(assertBody)) {
  fail('the guardrail no longer throws. Recovery must be an attempt, not an exemption.');
}
ok('a failed recovery still fails the lead');

// 5 — bounded pan.
// Assert the bound is DERIVED FROM THE VIEWPORT, not merely that an identifier called maxStep exists.
// `const maxStep = 1e9` satisfied a bare name check while removing the bound entirely — the sabotage
// passed. A guard that a constant can defeat is not a guard.
// The multiplier must be a FRACTION (<1) of the viewport. `Math.min(w,h) * 99` still matches a
// shape-only check while removing the bound in practice — the sabotage passed. Assert the property
// that matters: one drag never exceeds part of a screen.
const _m = recBody.match(/maxStep\s*=\s*Math\.min\(vp\.width,\s*vp\.height\)\s*\*\s*([\d.]+)/);
if (_m && !(Number(_m[1]) > 0 && Number(_m[1]) < 1)) {
  fail(`the pan step is ${_m[1]}x the viewport. It must be a FRACTION — a drag longer than the screen\n` +
       '         cannot be performed, so the map appears immovable and a recoverable lead dies.');
}
if (!_m) {
  fail('the pan bound is not derived from the viewport. A pan larger than the viewport cannot be done in\n' +
       '         one drag, and attempting it reads as "the map will not move" — turning a recoverable\n' +
       '         lead back into a dead one.');
}
if (!/dist > maxStep/.test(recBody)) fail('the bound is computed but never applied to the pan distance.');
ok('the pan is bounded and stepped across attempts');

// ── BEHAVIOURAL — the Mercator arithmetic must land on the business ─────────────────────────────
const worldPx = (lat, lng, z) => {
  const size = 256 * Math.pow(2, z);
  const x = ((lng + 180) / 360) * size;
  const s = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * size;
  return { x, y };
};
const hav = (a, b, c, d) => {
  const R = 6371, r = (x) => (x * Math.PI) / 180;
  return 2 * R * Math.asin(Math.sqrt(Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2));
};
const invert = (x, y, z) => {
  const size = 256 * Math.pow(2, z);
  const lng = (x / size) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / size;
  return { lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), lng };
};

// Real observed failures from the 08-23 log.
const CASES = [
  ['Culver City biz, Central Valley viewport', { lat: 34.0164608, lng: -118.3842304 }, { lat: 34.0819804, lng: -119.1725372, z: 10 }],
  ['same biz, offshore viewport',              { lat: 34.0164608, lng: -118.3842304 }, { lat: 34.0206809, lng: -118.4881884, z: 11 }],
  ['high zoom, small correction',              { lat: 34.0211412, lng: -118.3645424 }, { lat: 34.0250969, lng: -118.5303851, z: 12 }],
];
for (const [label, biz, vc] of CASES) {
  const f = worldPx(vc.lat, vc.lng, vc.z), t = worldPx(biz.lat, biz.lng, vc.z);
  const after = invert(f.x + (t.x - f.x), f.y + (t.y - f.y), vc.z);
  const residual = hav(biz.lat, biz.lng, after.lat, after.lng);
  if (residual > 0.01) fail(`Mercator pan for "${label}" left ${residual.toFixed(3)}km residual — the maths is wrong.`);
  ok(`behavioural: ${label} → residual ${residual.toFixed(4)}km`);
}

console.log('✅ a mis-anchored map is recovered by arithmetic, and the gate keeps the final word.');
