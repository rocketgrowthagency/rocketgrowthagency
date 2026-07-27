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
  // The Maps segment sits early (after the intro, before the website). Sample across it.
  const samples = [0.14, 0.20, 0.26, 0.32].map((p) => +(D * p).toFixed(1));
  const wide = []; const noPin = []; let mapFrames = 0;
  for (const t of samples) {
    const b64 = frameJpeg(v, t).toString('base64');
    const body = {
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'One frame from a LOCAL-business video that should show Google Maps zoomed to the business\'s CITY with its red location pin centered. If this frame shows a Google Maps map, judge: (1) zoom — "city" = streets/neighborhood/one town fills the view; "wide" = zoomed out so a whole state, multiple states/counties, an entire country/continent, or large oceans fill the frame (a single business would be a tiny dot). (2) pin — is a red/colored location map-pin marker clearly visible on the map? Reply ONLY compact JSON: {"is_map":true|false,"zoom":"city"|"wide"|"na","pin":true|false}. If is_map is false: zoom "na", pin false.' },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
        ],
      }],
      max_tokens: 40, temperature: 0,
    };
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json();
      const j = JSON.parse((d.choices?.[0]?.message?.content || '').replace(/```json|```/g, '').trim());
      if (j.is_map) { mapFrames++; if (j.zoom === 'wide') wide.push({ t }); if (j.pin === false) noPin.push({ t }); }
    } catch (_) { /* soft — a misread frame shouldn't fail a good video */ }
  }
  // FAIL on a SUSTAINED wide zoom (≥2 frames), and only when we actually saw map frames
  // (don't fail a video whose map segment we mis-sampled). Pin gaps ride along in the reason.
  return { skipped: false, fail: mapFrames >= 2 && wide.length >= 2, wide, noPin, mapFrames };
}

// ---- run ----
(async () => {
  const D = duration(VIDEO);
  const a = checkQuarterScale(VIDEO, D);
  const b = await checkWrongWindow(VIDEO, D);
  const c = await checkMapView(VIDEO, D);
  const reasons = [];
  if (a.fail) reasons.push(`QUARTER-SCALE/BLANK-REGION at ${a.flagged.length} sampled frame(s): ${a.flagged.slice(0, 3).map((f) => `${f.t}s (${f.detail})`).join('; ')}`);
  if (b.fail) reasons.push(`WRONG-WINDOW (not Maps/website) at ${b.bad.filter((x) => !x.softError).map((x) => `${x.t}s "${x.desc}"`).join('; ')}`);
  if (c.fail) reasons.push(`MAP ZOOMED-OUT (not city level) at ${c.wide.map((f) => `${f.t}s`).join(', ')}${c.noPin.length ? `; pin missing at ${c.noPin.map((f) => `${f.t}s`).join(', ')}` : ''}`);
  const pass = !a.fail && !b.fail && !c.fail;
  const result = {
    video: path.basename(VIDEO), pass,
    checkA_quarterScale: a.fail ? 'FAIL' : 'pass',
    checkB_wrongWindow: b.skipped ? `skipped (${b.reason})` : (b.fail ? 'FAIL' : 'pass'),
    checkC_mapView: c.skipped ? `skipped (${c.reason})` : (c.fail ? 'FAIL' : 'pass'),
    reasons,
  };
  if (JSON_OUT) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`[visual-gate] ${path.basename(VIDEO)} → ${pass ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  A quarter-scale/blank: ${result.checkA_quarterScale}   B wrong-window: ${result.checkB_wrongWindow}   C map-view: ${result.checkC_mapView}`);
    reasons.forEach((r) => console.log(`  ✗ ${r}`));
    if (b.skipped) console.log(`  ⚠ vision check skipped (${b.reason}) — Check A still enforced; wire OPENAI_API_KEY to catch wrong-window + zoom leaks.`);
  }
  process.exit(pass ? 0 : 2);
})().catch((e) => { console.error('[visual-gate] ERROR: ' + e.message); process.exit(1); });
