#!/usr/bin/env node
/**
 * check-video-visual.mjs — POST-RENDER VISUAL GATE (added 2026-07-20 after the daytime-capture incident).
 *
 * WHY: the 6/6 gate + check-maps-card-open verify DATA + the automation-tab DOM — NONE look at the final
 * rendered pixels. On 2026-07-18 a daytime run shipped videos where the Maps capture rendered at quarter-scale
 * (content jammed in the top-left, rest white) and one (complete-auto) captured Chris's VS Code desktop
 * (Echory/Liberty Tribune) instead of Maps — and every gate passed clean. This gate looks at the ACTUAL frames.
 *
 * TWO checks, both must pass or the video is rejected (caller quarantines: no deploy, no send):
 *   A. QUARTER-SCALE / BLANK-REGION (deterministic, no API): sample frames; for each, split into quadrants and
 *      measure per-quadrant detail (stddev of a 16x16 luma grid). The bug's signature is unambiguous — the
 *      content quadrant (top-left) has detail while ≥2 other quadrants are flat-blank (sd≈0). Validated on the
 *      07-18 batch: caliber/santa-monica/westwood FAIL, automed + June videos PASS.
 *   B. WRONG-WINDOW (vision, ~$0.001/video): sample a few mid-video frames and ask a vision model whether each
 *      is Google Maps / the business's own website / a title card — vs "something else" (IDE, terminal, desktop,
 *      unrelated app). Any "other" ⇒ FAIL. This is what catches the complete-auto desktop leak. Skips gracefully
 *      (with a loud warning) if no OPENAI_API_KEY, so Check A still gates.
 *
 * Usage:  node scripts/check-video-visual.mjs <video.mp4> [--json] [--no-vision]
 * Exit:   0 = PASS, 2 = FAIL (visual defect), 1 = error (couldn't analyze — fail loud, treat as not-passed).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const VIDEO = args.find((a) => !a.startsWith('--'));
const JSON_OUT = args.includes('--json');
const NO_VISION = args.includes('--no-vision');

if (!VIDEO || !fs.existsSync(VIDEO)) { console.error(`[visual-gate] no such video: ${VIDEO || '(none)'}`); process.exit(1); }

// ---- ffprobe / ffmpeg helpers ----
function duration(v) {
  return parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', v]).toString().trim());
}
const GRID = 16; // 16x16 luma grid → 8x8 cells per quadrant
function gridLuma(v, t) {
  return execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', v, '-vf', `scale=${GRID}:${GRID}:flags=area,format=gray`, '-frames:v', '1', '-f', 'rawvideo', '-']);
}
function frameJpeg(v, t) {
  // small JPEG (base64) for the vision check — downscaled to keep tokens/cost low
  return execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', v, '-vf', 'scale=640:-2', '-frames:v', '1', '-q:v', '5', '-f', 'mjpeg', '-']);
}
// ---- REMOVED 2026-08-17: the fixed-rectangle hero-band verdict ----
// 🔴 It measured the MAP, not the hero photo, on every single video — and it was the #2 cause of nightly
// losses (18 of 75 failures across 08-14/15/16, all of them FALSE REJECTS).
//
// The band was hardcoded as fractions of the frame: `{ x: 0.3156, y: 0.0694, w: 0.25, h: 0.2667 }`. In the
// finished 1280x720 video the detail card occupies the LEFT ~30% (x 0–385), so x=0.3156 starts just past
// the card's right edge. The crop it actually measured was a 320x192 patch of Google Maps. Whether a video
// "passed" therefore depended on how textured that random patch of map happened to be: a pale residential
// area read as "flat band — photo failed to load", a greener/denser one read as a real photo. Verified by
// extracting the exact crop the code computes (see the 08-17 investigation): smashbox-studios' "blank hero"
// is a street map of Cheviot Hills. The three videos checked by eye — smashbox (sdLum 17.7), clarkie (17.9,
// a fully-loaded wedding photo), enchantment (4.3, a family portrait) — were ALL good videos.
//
// It is NOT replaced with a corrected rectangle, because a fixed rectangle is the bug: Google moves its own
// layout (that is the standing lesson in feedback_video_creation_correctness_locked). The blank-hero verdict
// belongs to the ONE anchored implementation that already exists and already gates at this same chokepoint:
// check-video-acceptance.mjs measures the band ANCHORED ON THE OCR'd BUSINESS-NAME HEADING via the shared
// scripts/lib/hero-band.mjs, which is exactly what that library's docstring says it exists to guarantee
// ("ONE definition ... so they can never drift"). Two implementations was the drift.
//
// 🚫 DO NOT reintroduce a second, frame-relative hero-band check here. If the hero band needs measuring,
// anchor it on the card and share hero-band.mjs.
function sd(cells) {
  const m = cells.reduce((a, b) => a + b, 0) / cells.length;
  return Math.sqrt(cells.reduce((a, b) => a + (b - m) * (b - m), 0) / cells.length);
}
function quadrantDetail(buf) {
  const q = { TL: [], TR: [], BL: [], BR: [] };
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    const key = (y < GRID / 2 ? 'T' : 'B') + (x < GRID / 2 ? 'L' : 'R');
    q[key].push(buf[y * GRID + x]);
  }
  return { TL: sd(q.TL), TR: sd(q.TR), BL: sd(q.BL), BR: sd(q.BR) };
}

// ---- CHECK A: quarter-scale / blank-region ----
const CONTENT_SD = 16;  // a quadrant with real detail
const BLANK_SD = 7;     // a quadrant that is flat-blank (white void)
function checkQuarterScale(v, D) {
  const flagged = [];
  for (let p = 0.10; p <= 0.92; p += 0.03) {
    const t = +(D * p).toFixed(1);
    const q = quadrantDetail(gridLuma(v, t));
    // signature: exactly one quadrant carries the content while ≥2 others are blank voids.
    const quads = [['TL', q.TL], ['TR', q.TR], ['BL', q.BL], ['BR', q.BR]];
    const content = quads.filter(([, s]) => s >= CONTENT_SD);
    const blanks = quads.filter(([, s]) => s <= BLANK_SD);
    if (content.length === 1 && blanks.length >= 2) {
      flagged.push({ t, detail: `${content[0][0]} has content, blank: ${blanks.map((b) => b[0]).join('+')}`, q });
    }
  }
  // require a SUSTAINED defect (≥2 sampled frames), not a one-off transition frame
  return { fail: flagged.length >= 2, flagged };
}

// ---- CHECK B: wrong-window (vision) ----
async function checkWrongWindow(v, D) {
  const KEY = (() => {
    try { const e = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); const m = e.match(/^OPENAI_API_KEY=(.+)$/m); return m ? m[1].trim() : (process.env.OPENAI_API_KEY || ''); }
    catch { return process.env.OPENAI_API_KEY || ''; }
  })();
  if (NO_VISION) return { skipped: true, reason: '--no-vision' };
  if (!KEY) return { skipped: true, reason: 'no OPENAI_API_KEY' };
  // Sample densely across the Maps/content window (18%–58%) where a wrong-window desktop bleed shows.
  // A real leak (IDE captured instead of Maps) fills a SUSTAINED span → require ≥2 "other" frames so a
  // single odd legit frame (a photo grid / ad on the business site) can't false-reject a good video.
  const samples = [0.18, 0.26, 0.34, 0.42, 0.50, 0.58].map((p) => +(D * p).toFixed(1));
  const bad = [];
  for (const t of samples) {
    const b64 = frameJpeg(v, t).toString('base64');
    const body = {
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'One frame from a local-business cold-outreach video. Legit content is ONLY: a Google Maps view (map + business listing/panel), the business\'s OWN website/landing page (this INCLUDES photo grids, vehicle/service images, promotions, ads, banners, review sections, contact forms — all "business_website"), or a plain branded title/CTA card. Reply ONLY compact JSON: {"kind":"google_maps"|"business_website"|"title_card"|"other","desc":"<=6 words"}. Use "other" ONLY for clearly unrelated SOFTWARE/OS: a code editor/IDE, terminal/console, file explorer, desktop, chat app (Slack/Claude/ChatGPT), email client, spreadsheet, or settings window. When unsure between a website and "other", choose business_website.' },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
        ],
      }],
      max_tokens: 40, temperature: 0,
    };
    let kind = 'error', desc = '';
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json();
      const txt = d.choices?.[0]?.message?.content || '';
      const j = JSON.parse(txt.replace(/```json|```/g, '').trim());
      kind = j.kind; desc = j.desc || '';
    } catch (e) { kind = 'error'; desc = String(e.message).slice(0, 40); }
    if (kind === 'other') bad.push({ t, desc });
    if (kind === 'error') bad.push({ t, desc: 'vision-error: ' + desc, softError: true });
  }
  const realBad = bad.filter((b) => !b.softError);
  // ≥2 "other" frames = a sustained wrong-window bleed (a real desktop/IDE leak), not a one-off misread.
  return { skipped: false, fail: realBad.length >= 2, bad };
}

// ---- CHECK C: map zoomed-out / missing pin (vision) ----
// The Maps segment must show the business's CITY (streets, local map-pack) with its red
// location pin centered — that's the whole point of the review. On the 2026-07-27 detailing
// batch several maps shipped zoomed WAY out (whole state / country / continent, the pin a dot
// or off-screen) because forceMapsCityZoom silently failed and NO gate looked at zoom. This
// backstop rejects those. FAILS on a sustained "wide" zoom (the reliable, high-precision signal
// that catches every flagged case: continent, country, and multi-county region). Pin visibility
// is captured for the reason string but not hard-failed alone (small pins misread too easily to
// gate on). Reuses the same cheap vision model as Check B.
async function checkMapView(v, D) {
  const KEY = (() => {
    try { const e = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); const m = e.match(/^OPENAI_API_KEY=(.+)$/m); return m ? m[1].trim() : (process.env.OPENAI_API_KEY || ''); }
    catch { return process.env.OPENAI_API_KEY || ''; }
  })();
  if (NO_VISION) return { skipped: true, reason: '--no-vision' };
  if (!KEY) return { skipped: true, reason: 'no OPENAI_API_KEY' };
  // The Maps segment sits early (after the intro, before the website), ~15–50s in. Sample
  // across it (12–36% covers it for both the ~2:10 and ~2:29 renders). 5 frames for coverage.
  const samples = [0.12, 0.18, 0.24, 0.30, 0.36].map((p) => +(D * p).toFixed(1));
  // Frame size for the deterministic hero-band crop (band is defined as fractions, so any render size works).
  let VW = 1280, VH = 720;
  try {
    const wh = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', v]).toString().trim().split(',');
    if (+wh[0] > 0 && +wh[1] > 0) { VW = +wh[0]; VH = +wh[1]; }
  } catch (_) { /* keep the 1280x720 default the renders use */ }
  const wide = []; const noPin = []; const noCard = []; const blankPhotos = []; let mapFrames = 0; let cardFrames = 0;
  for (const t of samples) {
    const b64 = frameJpeg(v, t).toString('base64');
    const body = {
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: [
          // 2026-07-29: also judge card_open + photos_visible so the gate catches the two systemic capture
          // bugs Chris caught batch-wide — (a) the business detail card never opened (frozen on the raw
          // results list, no business selected) and (b) the card opened but the Photos strip is blank/gray.
          { type: 'text', text: 'One frame from a LOCAL-business review video. It should show Google Maps zoomed to the business\'s CITY, WITH a single-business detail panel/card open, and that card should show real photos. Judge: (1) is_map: does the frame show a Google Maps map? (2) zoom: "city" = streets/neighborhood/one town fills the view; "wide" = a whole state/multiple counties/country/continent/large oceans fill it. "na" if not a map. (3) pin: is a red/colored location map-pin visible? (4) card_open — READ THIS CAREFULLY, it is the most important and most-often-misjudged field: a detail CARD means ONE single business fills the left panel, with a LARGE photo banner (or a blue "no photos" graphic) across the TOP, then ONE big business-name heading, a star rating, and a ROW OF ROUND ACTION BUTTONS (Directions / Save / Nearby / Website). \ud83d\udd34 card_open IS THE MOST-OFTEN-MISJUDGED FIELD. Use this exact procedure. STEP 1: ignore the far-left column that lists several businesses stacked as rows \u2014 it is present in BOTH the working and the broken case, so it tells you NOTHING. STEP 2: look for a SINGLE-BUSINESS DETAIL PANEL somewhere in the frame. It has ALL of: a wide hero photo band (or a blue/teal no-photos graphic) across its top, ONE large business-name heading directly under that band, a star rating with a review count, and a row of ROUND action buttons (Directions, Save, Nearby, Send to phone, Share). STEP 3: answer card_open=TRUE if and only if you can see that panel. Google Maps draws it in one of two equally-correct places: either as the ONLY left panel (it replaced the list), or as a SECOND panel sitting immediately to the RIGHT of the still-visible results list. Both are correct \u2014 a visible results list NEVER by itself makes the answer FALSE. Answer card_open=FALSE when no such single-business panel exists anywhere in the frame, i.e. the frame contains only the stacked list of businesses plus the map and no business has been selected. (5) photos_visible: only if card_open — look at the photo area at the TOP of the open card. Look at the TOP band of the card, directly ABOVE the big business-name heading, where the hero photo belongs. TRUE only if that band ACTUALLY shows EITHER a real photograph (building, sign, storefront, people, interior — even plain/washed-out) OR Google\'s blue/teal "no photos available" illustration (a blue graphic). FALSE if that band is a large EMPTY WHITE or light-GRAY space with NO photograph and NO blue graphic — i.e. the area above the business name is blank/white. That blank-white band = the hero photo FAILED TO LOAD, a common bug you MUST catch — do NOT pass it. Rule: a blue graphic is ALWAYS TRUE; a real photo is TRUE; a blank white/gray band above the name is ALWAYS FALSE. If you are unsure whether the top band is a real photo or blank-white, answer FALSE. Reply ONLY compact JSON: {"is_map":bool,"zoom":"city"|"wide"|"na","pin":bool,"card_open":bool,"photos_visible":bool}.' },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
        ],
      }],
      max_tokens: 60, temperature: 0,
    };
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json();
      const j = JSON.parse((d.choices?.[0]?.message?.content || '').replace(/```json|```/g, '').trim());
      if (j.is_map) {
        mapFrames++;
        if (j.zoom === 'wide') wide.push({ t });
        if (j.pin === false) noPin.push({ t });
        if (j.card_open === false) noCard.push({ t });
        else {
          cardFrames++;
          // 2026-08-17: the full-res override that used to run here measured a patch of MAP (see the note
          // where photoBandVerdict was removed) and false-rejected 18 good videos in three nights. The
          // authoritative blank-hero verdict is check-video-acceptance.mjs's heading-anchored check, which
          // gates this same mp4. The model's read stays as a soft second opinion here.
          if (j.photos_visible === false) blankPhotos.push({ t, why: 'vision model' });
        }
      }
    } catch (_) { /* soft — a misread frame shouldn't fail a good video */ }
  }
  // FAIL conditions (all require ≥2 map frames so a mis-sampled segment can't false-reject):
  //   • wide zoom sustained (≥2)  •  NO detail card sustained (≥3 map frames show no open card)
  //   • blank photos sustained (card WAS open somewhere, but ≥2 of the card frames show a blank photo strip)
  const mapWide = mapFrames >= 2 && wide.length >= 2;
  const noCardFail = mapFrames >= 2 && noCard.length >= 3;
  const blankPhotosFail = !noCardFail && cardFrames >= 2 && blankPhotos.length >= 2;
  // 2026-07-30: noCard + blankPhotos now GATE (were advisory). Chris caught both shipping on the 07-29 batch
  // (Vittas = no card ever; Probate = blank white Photos strip). Sustained-frame thresholds above (noCard≥3,
  // blankPhotos≥2, always with mapFrames/cardFrames≥2) guard against a single mis-sampled frame false-rejecting
  // a good video. Correctness > throughput — a false-reject just re-renders next night; a broken video that
  // ships gets EMAILED. The step-3 capture hardening is the primary fix; this gate is the hard safety net.
  const fail = mapWide || noCardFail || blankPhotosFail;
  return { skipped: false, fail, mapWide, noCardFail, blankPhotosFail, wide, noPin, noCard, blankPhotos, mapFrames, cardFrames };
}

// ---- CHECK F REMOVED 2026-08-17 (it was built on the broken fixed-rect band) ----
// Check F scanned every second of the Maps segment for a SUSTAINED blank hero. The idea was right; the
// measurement was not — it called photoBandVerdict, whose crop landed on the MAP rather than the card's
// photo (full explanation where that function was removed, above). So its "held for Ns" verdicts were
// runs of consecutive seconds in which a patch of pale street map failed a texture test, and it rejected
// 6 more good videos across 08-14/15/16 on top of the 12 rejected by the per-frame check.
//
// What it was originally written to catch — a blank hero that the vision model excludes from Check E
// because a card with no photo banner does not read as "card_open" — is genuinely covered by
// check-video-acceptance.mjs, which does NOT depend on the model: it OCRs the frames itself, finds the
// business-name heading, derives the band from that heading, and judges it with the shared hero-band.mjs
// (heroFail = blank on >=2 card frames AND >=50% of them). That gate blocks the same mp4 at the same
// chokepoint in build-video-landing.mjs, so removing this loses no coverage.
// ---- CHECK G: THE MAP MUST SHOW A REAL PLACE (2026-08-17) ----
// Three videos SHIPPED with a map that is a solid blank rectangle — tyler-chase (#34), lexx-wake (#64)
// and catherine-lacey — each carrying a "Currently Ranking in Culver City" badge over open ocean. A
// fourth (gregory-mancuso) shipped the same way during testing on 08-17, AFTER the capture fix, which is
// what proved a gate was missing rather than a capture bug.
//
// WHY NOTHING ELSE CATCHES IT: the zoom rule reads the scale NUMBER (a blank ocean at "2000 ft" passes),
// the hero rule checks the card photo (fine), the rank rule checks the overlay (present). Every existing
// check looks at the CARD; none looks at the MAP. And the geographic lead filter cannot help — it screens
// the step-2 coordinates, but this failure happens later, when Maps re-centres the view. Gregory's card
// reads "Marina Del Rey" while the map sits 18 miles out to sea.
//
// THE SIGNAL — colour dominance, not stddev. Measured on the real corpus:
//     BAD : gregory 100%  tyler 100%  catherine 100%  lexx 81%
//     GOOD: marianne 26%  lulan 43%   next-exit 55%   cfp 56%   danny 57%
// Open water is overwhelmingly ONE colour; a real map is broken up by roads, labels, parks, buildings.
// Stddev was tried first and FAILED — lexx-wake scored 23.8, inside the good range (19-27), because a
// sliver of land sits at its right edge. Dominance across the whole map area catches it at 81%.
// The 70% threshold sits in the middle of a 23-point gap, so it is not finely tuned.
const MAP_AREA = { x: 0.62, y: 0.30, w: 0.36, h: 0.55 }; // map in BOTH layouts, clear of both overlays
// Thresholds set from the MEASURED distribution across the live corpus, not from a small sample.
// My first value (40) sat ABOVE the good minimum and false-rejected a perfectly good video:
// the-law-offices-of-johnson-and-johnson scored 35 because its map region is sparse suburban terrain —
// pale, few roads — while still showing streets, labels and the business pin.
//   confirmed BAD : 4, 5, 5, 5 (blank ocean) · 12, 13, 13, 14 (macOS dialog / quarter-scale)  → max 14
//   confirmed GOOD: 34, 35, 74, 77, 80, 81, 83, 85, 88 …                                      → min 34
// 22 sits mid-gap: 1.6x above the worst bad, 1.5x below the best good.
// 🚫 Do NOT raise this without re-measuring min(good) across a WIDE sample — sparse suburban and rural
// maps are legitimately low, and that is exactly what the first threshold got wrong.
const MAP_MIN_COLOURS = 22;
const MAP_MIN_EDGE_PCT = 7;   // bad: 0.0-3.2  good: 11.5-31.3

// Is this frame actually the Maps view? The Maps layout ALWAYS has a bright white panel down the left
// (the results list and/or the detail card); a website segment does not.
// Measured: Maps frames 228-244, a dark website page 78. Threshold 200 sits in a 150-point gap.
// 🔴 WITHOUT THIS the check judged whatever happened to be on screen: tiny-sun-solutions was flagged
// "blank map" at 36s when that timestamp is its WEBSITE segment (a dark green page). The 20-42% window
// is NOT always the Maps segment.
function isMapsView(v, t) {
  try {
    const raw = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', v,
      '-vf', 'crop=iw*0.26:ih*0.60:iw*0.02:ih*0.20,scale=32:24,format=gray',
      '-frames:v', '1', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 20 });
    if (!raw.length) return false;
    let sum = 0;
    for (let i = 0; i < raw.length; i++) sum += raw[i];
    return sum / raw.length >= 200;
  } catch (_) { return false; }
}
function mapDetail(v, t) {
  try {
    const W = 96, H = 72;
    const raw = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', v,
      '-vf', `crop=iw*${MAP_AREA.w}:ih*${MAP_AREA.h}:iw*${MAP_AREA.x}:ih*${MAP_AREA.y},scale=${W}:${H}`,
      '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 22 });
    const n = Math.floor(raw.length / 3);
    if (n < 64) return null;
    const seen = new Set();
    let whitish = 0;
    for (let i = 0; i < n; i++) {
      const r = raw[i * 3], g = raw[i * 3 + 1], b = raw[i * 3 + 2];
      if (r > 240 && g > 240 && b > 240) whitish++;
      seen.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
    }
    // Intro/outro title cards are a full-frame white slide — never judge one as a map.
    if ((100 * whitish) / n > 92) return null;
    let edges = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W - 1; x++) {
        const i = (y * W + x) * 3, j = i + 3;
        if (Math.abs(raw[i] - raw[j]) + Math.abs(raw[i + 1] - raw[j + 1]) + Math.abs(raw[i + 2] - raw[j + 2]) > 24) edges++;
      }
    }
    return { colours: seen.size, edgePct: (100 * edges) / (H * (W - 1)) };
  } catch (_) { return null; }
}
function checkMapContent(v, D) {
  const flat = [];
  let judged = 0;
  for (let t = D * 0.20; t <= D * 0.42; t += Math.max(3, D * 0.03)) {
    const tt = +t.toFixed(1);
    if (!isMapsView(v, tt)) continue;   // only judge frames that ARE the Maps view
    const m = mapDetail(v, tt);
    if (!m) continue;
    judged++;
    // BOTH signals must be low. Either alone risks a false reject; together the margin is ~24x on
    // colours and ~3.5x on edges, with nothing observed in between.
    if (m.colours < MAP_MIN_COLOURS && m.edgePct < MAP_MIN_EDGE_PCT) {
      flat.push({ t: tt, c: m.colours, e: Math.round(m.edgePct * 10) / 10 });
    }
  }
  return { fail: judged >= 2 && flat.length >= 2, judged, flat };
}

// ---- run ----
(async () => {
  const D = duration(VIDEO);
  const a = checkQuarterScale(VIDEO, D);
  const b = await checkWrongWindow(VIDEO, D);
  const c = await checkMapView(VIDEO, D);
  const g = checkMapContent(VIDEO, D);
  const reasons = [];
  if (g.fail) reasons.push(`BLANK MAP — the map area has almost no cartographic detail on ${g.flat.length} of ${g.judged} sampled frame(s) (${g.flat.slice(0,3).map((f)=>`${f.t}s: ${f.c} colours, ${f.e}% edges`).join("; ")}). Either the map is centred on empty water, or the render is shrunken so this area is blank. Check A covers the second case; this catches both.`);
  if (a.fail) reasons.push(`QUARTER-SCALE/BLANK-REGION at ${a.flagged.length} sampled frame(s): ${a.flagged.slice(0, 3).map((f) => `${f.t}s (${f.detail})`).join('; ')}`);
  if (b.fail) reasons.push(`WRONG-WINDOW (not Maps/website) at ${b.bad.filter((x) => !x.softError).map((x) => `${x.t}s "${x.desc}"`).join('; ')}`);
  const advisories = [];
  if (c.mapWide) reasons.push(`MAP ZOOMED-OUT (not city level) at ${c.wide.map((f) => `${f.t}s`).join(', ')}${c.noPin.length ? `; pin missing at ${c.noPin.map((f) => `${f.t}s`).join(', ')}` : ''}`);
  // 2026-07-31: these GATE (via c.fail → pass below) — the "advisory / not gating" wording was stale from when
  // they were logged-only. A no-card or blank-photos video FAILS the build. Report them as hard reasons.
  if (c.noCardFail) reasons.push(`NO-DETAIL-CARD (raw results list, no business selected) at ${c.noCard.map((f) => `${f.t}s`).join(', ')}`);
  if (c.blankPhotosFail) reasons.push(`BLANK-PHOTOS (card open but photo strip blank/gray) at ${c.blankPhotos.map((f) => `${f.t}s`).join(', ')}`);
  const pass = !a.fail && !b.fail && !c.fail && !g.fail;
  const result = {
    video: path.basename(VIDEO), pass,
    checkA_quarterScale: a.fail ? 'FAIL' : 'pass',
    checkB_wrongWindow: b.skipped ? `skipped (${b.reason})` : (b.fail ? 'FAIL' : 'pass'),
    checkG_mapContent: g.fail ? `FAIL (${g.flat.length}/${g.judged} flat)` : `pass (${g.judged} judged)`,
    checkC_mapView: c.skipped ? `skipped (${c.reason})` : (c.mapWide ? 'FAIL' : 'pass'),
    checkD_detailCard: c.skipped ? `skipped (${c.reason})` : (c.noCardFail ? 'FAIL' : 'pass'),
    checkE_photos: c.skipped ? `skipped (${c.reason})` : (c.blankPhotosFail ? 'FAIL' : 'pass'),
    checkC_mapFrames: c.skipped ? null : c.mapFrames,
    checkD_cardFrames: c.skipped ? null : c.cardFrames,
    reasons,
    advisories,
  };
  if (JSON_OUT) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`[visual-gate] ${path.basename(VIDEO)} → ${pass ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  A quarter-scale/blank: ${result.checkA_quarterScale}   B wrong-window: ${result.checkB_wrongWindow}   C map-view: ${result.checkC_mapView}   D detail-card: ${result.checkD_detailCard}   E photos: ${result.checkE_photos}${c.skipped ? '' : ` (${c.mapFrames} map / ${c.cardFrames} card frames)`}`);
    reasons.forEach((r) => console.log(`  ✗ ${r}`));
    advisories.forEach((r) => console.log(`  ⚠ ${r}`));
    if (b.skipped) console.log(`  ⚠ vision check skipped (${b.reason}) — Check A still enforced; wire OPENAI_API_KEY to catch wrong-window + zoom leaks.`);
  }
  process.exit(pass ? 0 : 2);
})().catch((e) => { console.error('[visual-gate] ERROR: ' + e.message); process.exit(1); });
