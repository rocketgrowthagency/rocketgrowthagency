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
// ---- DETERMINISTIC hero-photo-band verdict (2026-08-13) ----
// WHY this exists: `photos_visible` was decided by gpt-4o-mini reading a 640px-wide, q:v-5 JPEG. In that
// frame the card's hero band is only ~160x95px and heavily compressed, so BOTH a pale real photo AND
// Google's blue "no photos" illustration degrade into "a light band" — and the prompt's tie-breaker
// ("if unsure, answer FALSE") converts that ambiguity into a hard reject. On 2026-08-13 it false-rejected
// two GOOD videos: william-spiller (blue placeholder, 97.3% blue pixels) and cosmetique (a real, pale
// customer-testimonial photo, sdLum 46.1). Both were re-captured for nothing.
//
// This reads the SAME band at FULL resolution — strictly more information than the model gets — and is
// authoritative for photos_visible. It is NOT a loosening of the gate: a genuinely blank band is near
// uniform (sdLum ~2-5), an order of magnitude below the threshold. Calibrated against the two frames above.
// Falls back to the model's answer if ffmpeg can't produce the crop, so the gate stays fail-closed.
const BAND = { x: 0.3156, y: 0.0694, w: 0.25, h: 0.2667 }; // detail-card hero band, fractions of frame
function photoBandVerdict(v, t, W, H) {
  try {
    const cw = Math.max(8, Math.round(W * BAND.w)), ch = Math.max(8, Math.round(H * BAND.h));
    const cx = Math.round(W * BAND.x), cy = Math.round(H * BAND.y);
    const raw = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', v,
      '-vf', `crop=${cw}:${ch}:${cx}:${cy},scale=96:64`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
      { maxBuffer: 1 << 22 });
    const n = Math.floor(raw.length / 3);
    if (n < 64) return null;
    let sum = 0, blues = 0, whites = 0; const lum = new Array(n);
    for (let i = 0; i < n; i++) {
      const r = raw[i * 3], g = raw[i * 3 + 1], b = raw[i * 3 + 2];
      const L = 0.299 * r + 0.587 * g + 0.114 * b;
      lum[i] = L; sum += L;
      if (b > r + 12 && b > g + 6) blues++;
      if (r > 238 && g > 238 && b > 238) whites++;
    }
    const mean = sum / n;
    const sdLum = Math.sqrt(lum.reduce((a, L) => a + (L - mean) * (L - mean), 0) / n);
    const bluePct = (100 * blues) / n;
    const whitePct = (100 * whites) / n;
    // ⚠️ 2026-08-13 SECOND FIX — WHITE COVERAGE IS THE DECISIVE SIGNAL, not sdLum.
    // The first version gated on `sdLum >= 12`, calibrated against a SYNTHETIC pure-white band (sdLum 0.1).
    // A REAL blank band is not pure white — it contains the ✕ close button, the card border and an edge of
    // the map, which lift it to sdLum 10.2–12.5 depending only on the downscale size. The threshold sat
    // INSIDE that range, so two genuinely blank videos scored 12.4/12.5 and PASSED by half a point. Chris
    // caught 13 seconds of white void in the shipped spiller video. Measured truth:
    //   blank band  → white 98%, sdLum 10.2–10.4     blue placeholder → white  0%, blue 99%
    //   real photo  → white 23%, sdLum 42.8          map (not a band) → white 71%, sdLum 28.8
    // A near-white FIELD cannot be a photo or a placeholder, at any scale — that is the robust invariant.
    if (whitePct >= 85 && bluePct < 40) return { visible: false, why: `BLANK band — ${whitePct.toFixed(0)}% white (sdLum ${sdLum.toFixed(1)})` };
    // blue illustration = Google saying "this business has no photos" — honest, ALWAYS passes (see
    // feedback_video_creation_correctness_locked: don't over-reject those).
    if (bluePct >= 40) return { visible: true, why: `blue no-photos placeholder (${bluePct.toFixed(0)}% blue)` };
    // real imagery has texture. 20, not 12 — 12 is inside the blank band's real range.
    if (sdLum >= 20) return { visible: true, why: `real photo (sdLum ${sdLum.toFixed(1)})` };
    return { visible: false, why: `flat band — photo failed to load (sdLum ${sdLum.toFixed(1)}, mean ${mean.toFixed(0)})` };
  } catch (_) { return null; }
}
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
          { type: 'text', text: 'One frame from a LOCAL-business review video. It should show Google Maps zoomed to the business\'s CITY, WITH a single-business detail panel/card open, and that card should show real photos. Judge: (1) is_map: does the frame show a Google Maps map? (2) zoom: "city" = streets/neighborhood/one town fills the view; "wide" = a whole state/multiple counties/country/continent/large oceans fill it. "na" if not a map. (3) pin: is a red/colored location map-pin visible? (4) card_open — READ THIS CAREFULLY, it is the most important and most-often-misjudged field: a detail CARD means ONE single business fills the left panel, with a LARGE photo banner (or a blue "no photos" graphic) across the TOP, then ONE big business-name heading, a star rating, and a ROW OF ROUND ACTION BUTTONS (Directions / Save / Nearby / Website). Answer card_open=TRUE only for that single-business layout. Answer card_open=FALSE if the left panel is instead a VERTICAL LIST of MULTIPLE businesses stacked as separate rows (each row a small line of text with its own little Website/Directions icons, a "Results" header at top, "Sponsored" entries, or a search term still typed in the box) — that is the raw results list with NO business selected, even though each row also shows a name+rating+address. Multiple stacked business rows = FALSE. One big business with a hero photo + action-button row = TRUE. (5) photos_visible: only if card_open — look at the photo area at the TOP of the open card. Look at the TOP band of the card, directly ABOVE the big business-name heading, where the hero photo belongs. TRUE only if that band ACTUALLY shows EITHER a real photograph (building, sign, storefront, people, interior — even plain/washed-out) OR Google\'s blue/teal "no photos available" illustration (a blue graphic). FALSE if that band is a large EMPTY WHITE or light-GRAY space with NO photograph and NO blue graphic — i.e. the area above the business name is blank/white. That blank-white band = the hero photo FAILED TO LOAD, a common bug you MUST catch — do NOT pass it. Rule: a blue graphic is ALWAYS TRUE; a real photo is TRUE; a blank white/gray band above the name is ALWAYS FALSE. If you are unsure whether the top band is a real photo or blank-white, answer FALSE. Reply ONLY compact JSON: {"is_map":bool,"zoom":"city"|"wide"|"na","pin":bool,"card_open":bool,"photos_visible":bool}.' },
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
          // Full-res pixels beat the model's read of a 160x95 compressed crop. Model only decides when
          // the deterministic check can't run.
          const pb = photoBandVerdict(v, t, VW, VH);
          const blank = pb ? !pb.visible : (j.photos_visible === false);
          if (pb && pb.visible === false) console.log(`   [photo-band] ${t}s BLANK — ${pb.why}`);
          if (blank) blankPhotos.push({ t, why: pb ? pb.why : 'vision model' });
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

// ---- CHECK F: DENSE hero-band scan (2026-08-13, after a 13-second white void SHIPPED) ----
// Check E could not catch this, structurally, for two reasons:
//   1. It only judges frames the VISION MODEL called card_open. A blank hero band makes the model answer
//      "not a card" (its own prompt defines a detail card as having "a LARGE photo banner across the TOP"),
//      so the very frames that should fail are EXCLUDED from the check built to catch them — and there were
//      too few of them (2) to trip noCardFail's ≥3 either. The video fell through the gap between two checks.
//   2. It samples 5 frames. Cosmetique's blank window was 3s of a 144s video — 5 samples miss it by luck.
// This scan is pure ffmpeg (no API, no model, ~1s/frame), so it can afford to look EVERY second across the
// whole Maps segment, and it fails on a SUSTAINED blank window rather than a lucky sample.
// Measured on the two shipped videos: spiller blank 16–28s (13s), cosmetique blank 24–26s (3s).
// Is this frame the Maps view (vs the white intro/outro title card)? Deterministic, whole-frame.
function isMapsFrame(v, t) {
  try {
    const raw = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', v,
      '-vf', 'scale=96:54', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 22 });
    const n = Math.floor(raw.length / 3);
    if (n < 32) return false;
    let w = 0, col = 0;
    for (let i = 0; i < n; i++) {
      const r = raw[i * 3], g = raw[i * 3 + 1], b = raw[i * 3 + 2];
      if (r > 238 && g > 238 && b > 238) w++;
      if (Math.max(r, g, b) - Math.min(r, g, b) > 18) col++;
    }
    const whitePct = (100 * w) / n, colPct = (100 * col) / n;
    return whitePct < 85 && colPct >= 6;
  } catch (_) { return false; }
}
function checkHeroBandDense(v, D) {
  let VW = 1280, VH = 720;
  try {
    const wh = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', v]).toString().trim().split(',');
    if (+wh[0] > 0 && +wh[1] > 0) { VW = +wh[0]; VH = +wh[1]; }
  } catch (_) {}
  // The Maps segment lives ~10–40% in; scan it densely (a 1s grid).
  const from = Math.max(1, D * 0.08), to = D * 0.42;
  const blanks = [];
  for (let t = from; t <= to; t += 1) {
    // Only judge frames that ARE the Maps view. The intro title card ("Local Search Growth Audit") is a
    // full-frame WHITE slide, so the band crop reads as blank and every video false-fails — caught when
    // 3/3 unrelated shipped videos "failed" at ~12s, which is the intro, not the card. Measured:
    //   intro          → fullWhite 94%, colourful  3%
    //   real Maps view → fullWhite 59-67%, colourful 11-18%   (whether the band is blank or fine)
    if (!isMapsFrame(v, +t.toFixed(1))) continue;
    const r = photoBandVerdict(v, +t.toFixed(1), VW, VH);
    if (r && r.visible === false && /BLANK band/.test(r.why)) blanks.push(+t.toFixed(1));
  }
  // Longest run of CONSECUTIVE blank seconds — one stray frame is not a defect, a held blank frame is.
  let best = 0, cur = 0, startAt = null, bestStart = null;
  for (let i = 0; i < blanks.length; i++) {
    if (i && blanks[i] - blanks[i - 1] <= 1.01) { cur++; } else { cur = 1; startAt = blanks[i]; }
    if (cur > best) { best = cur; bestStart = startAt; }
  }
  return { fail: best >= 2, longestRun: best, startAt: bestStart, blanks };
}

// ---- run ----
(async () => {
  const D = duration(VIDEO);
  const a = checkQuarterScale(VIDEO, D);
  const b = await checkWrongWindow(VIDEO, D);
  const c = await checkMapView(VIDEO, D);
  const f = checkHeroBandDense(VIDEO, D);
  const reasons = [];
  if (f.fail) reasons.push(`BLANK-HERO-BAND held for ${f.longestRun}s from ${f.startAt}s (white void where the card's photo belongs)`);
  if (a.fail) reasons.push(`QUARTER-SCALE/BLANK-REGION at ${a.flagged.length} sampled frame(s): ${a.flagged.slice(0, 3).map((f) => `${f.t}s (${f.detail})`).join('; ')}`);
  if (b.fail) reasons.push(`WRONG-WINDOW (not Maps/website) at ${b.bad.filter((x) => !x.softError).map((x) => `${x.t}s "${x.desc}"`).join('; ')}`);
  const advisories = [];
  if (c.mapWide) reasons.push(`MAP ZOOMED-OUT (not city level) at ${c.wide.map((f) => `${f.t}s`).join(', ')}${c.noPin.length ? `; pin missing at ${c.noPin.map((f) => `${f.t}s`).join(', ')}` : ''}`);
  // 2026-07-31: these GATE (via c.fail → pass below) — the "advisory / not gating" wording was stale from when
  // they were logged-only. A no-card or blank-photos video FAILS the build. Report them as hard reasons.
  if (c.noCardFail) reasons.push(`NO-DETAIL-CARD (raw results list, no business selected) at ${c.noCard.map((f) => `${f.t}s`).join(', ')}`);
  if (c.blankPhotosFail) reasons.push(`BLANK-PHOTOS (card open but photo strip blank/gray) at ${c.blankPhotos.map((f) => `${f.t}s`).join(', ')}`);
  const pass = !a.fail && !b.fail && !c.fail && !f.fail;
  const result = {
    video: path.basename(VIDEO), pass,
    checkA_quarterScale: a.fail ? 'FAIL' : 'pass',
    checkB_wrongWindow: b.skipped ? `skipped (${b.reason})` : (b.fail ? 'FAIL' : 'pass'),
    checkC_mapView: c.skipped ? `skipped (${c.reason})` : (c.mapWide ? 'FAIL' : 'pass'),
    checkD_detailCard: c.skipped ? `skipped (${c.reason})` : (c.noCardFail ? 'FAIL' : 'pass'),
    checkE_photos: c.skipped ? `skipped (${c.reason})` : (c.blankPhotosFail ? 'FAIL' : 'pass'),
    checkF_heroBandDense: f.fail ? `FAIL (${f.longestRun}s blank from ${f.startAt}s)` : 'pass',
    checkC_mapFrames: c.skipped ? null : c.mapFrames,
    checkD_cardFrames: c.skipped ? null : c.cardFrames,
    reasons,
    advisories,
  };
  if (JSON_OUT) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`[visual-gate] ${path.basename(VIDEO)} → ${pass ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  A quarter-scale/blank: ${result.checkA_quarterScale}   B wrong-window: ${result.checkB_wrongWindow}   C map-view: ${result.checkC_mapView}   D detail-card: ${result.checkD_detailCard}   E photos: ${result.checkE_photos}${c.skipped ? '' : ` (${c.mapFrames} map / ${c.cardFrames} card frames)`}`);
    console.log(`  F hero-band dense scan: ${result.checkF_heroBandDense}`);
    reasons.forEach((r) => console.log(`  ✗ ${r}`));
    advisories.forEach((r) => console.log(`  ⚠ ${r}`));
    if (b.skipped) console.log(`  ⚠ vision check skipped (${b.reason}) — Check A still enforced; wire OPENAI_API_KEY to catch wrong-window + zoom leaks.`);
  }
  process.exit(pass ? 0 : 2);
})().catch((e) => { console.error('[visual-gate] ERROR: ' + e.message); process.exit(1); });
