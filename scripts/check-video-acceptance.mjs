#!/usr/bin/env node
/**
 * check-video-acceptance.mjs — THE ACCEPTANCE GATE (2026-08-10).
 *
 * WHY THIS EXISTS
 * ---------------
 * Three distinct broken videos shipped from the Aug-9 run (resonance = blank-white hero,
 * sunko = detail card never opened, alternative-energy = map zoomed out to the whole state).
 * Every per-symptom patch in step-3 guards ONE variable and the next one breaks; the only
 * pixel-level backstop (check-video-visual.mjs) is OpenAI-vision and FAILS OPEN.
 *
 * So this gate judges the FINISHED video — exactly what the prospect sees — and it is:
 *   • DETERMINISTIC — Apple's Vision OCR (local, free, offline) + ffmpeg luma/RGB stats.
 *     No network, no API key, no model judgement, same answer every run.
 *   • FAIL-CLOSED — anything it cannot verify is a FAIL. Better to redo than to ship one
 *     broken video to a prospect.
 *
 * THE FOUR ASSERTIONS (all must hold on the money-shot = the Maps hold with the rank overlay)
 *   1. RANK OVERLAY  — "Currently ranking #N" is on screen (and matches --rank when given).
 *   2. CARD OPEN     — the single-business detail card is open: the Directions/Save/Nearby/
 *                      Send-to-phone/Share action row (>=3 labels on one line) + a headline.
 *                      A raw results list has no such row (its rows are Website+Directions pairs).
 *   3. HERO REAL     — the band above the headline contains real image pixels, not the blank
 *                      white of a failed photo load. Google's own "no photos" placeholder is a
 *                      BLUE graphic, so photo-less businesses still pass; only white voids fail.
 *   4. ZOOM CORRECT  — the Maps scale bar reads city level (<= MAX_SCALE_MI). "50 mi" fails.
 *
 * Usage:
 *   node scripts/check-video-acceptance.mjs <video.mp4> [--rank N] [--business "Name"]
 *                                           [--json] [--debug] [--keep-frames]
 * Exit: 0 = PASS, 2 = REJECT (a defect was proven), 1 = could not analyse (also treat as reject).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OCR_SRC = path.join(ROOT, 'scripts', 'vision-ocr.swift');
const OCR_BIN = path.join(ROOT, 'scripts', '.bin', 'vision-ocr');

const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const has = (name) => argv.includes(name);
const VIDEO = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--rank' && argv[argv.indexOf(a) - 1] !== '--business');
const WANT_RANK = flag('--rank') ? parseInt(flag('--rank'), 10) : null;
const BUSINESS = flag('--business') || '';
const JSON_OUT = has('--json');
const DEBUG = has('--debug');
const KEEP = has('--keep-frames');

// ---- tunables (calibrated 2026-08-10 against the known-broken + known-good corpus) ----
const SCAN_FROM = 0.05, SCAN_TO = 0.70;   // the Maps segment always lives in this span
const COARSE_STEP_S = 4;                  // coarse pass: locate the overlay window
const FINE_STEP_S = 1.2;                  // fine pass: inside the overlay window
const MIN_OVERLAY_FRAMES = 2;             // rank overlay must be sustained, not a transition frame
const MIN_CARD_FRAMES = 2;                // detail card must be sustained
const MAX_SCALE_MI = 2.0;                 // city level: 2000 ft / 1 mi / 2 mi ok; 5 mi+ is a fail
const BLANK_MEAN = 228;                   // a "white void" row: this bright...
const BLANK_SD = 7;                       // ...this flat...
const BLANK_SAT = 12;                     // ...and this colourless (max channel spread)
const MIN_HERO_CONTENT_ROWS = 25;         // hero must show at least this many real image rows
const ACTION_LABELS = ['directions', 'save', 'nearby', 'share', 'send to', 'send to phone'];

function die(msg) { console.error(`[acceptance] ${msg}`); process.exit(1); }
if (!VIDEO || !fs.existsSync(VIDEO)) die(`no such video: ${VIDEO || '(none)'}`);

// ---- OCR binary (compiled once, cached; rebuilt when the source is newer) ----
function ensureOcrBin() {
  const fresh = fs.existsSync(OCR_BIN) && fs.statSync(OCR_BIN).mtimeMs >= fs.statSync(OCR_SRC).mtimeMs;
  if (fresh) return OCR_BIN;
  fs.mkdirSync(path.dirname(OCR_BIN), { recursive: true });
  const r = spawnSync('swiftc', ['-O', '-o', OCR_BIN, OCR_SRC], { encoding: 'utf8' });
  if (r.status !== 0) die(`cannot build the OCR helper (swiftc): ${(r.stderr || '').slice(0, 300)}`);
  return OCR_BIN;
}

// ---- ffmpeg helpers ----
const duration = (v) => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', v]).toString().trim());
function videoSize(v) {
  const s = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', v]).toString().trim().split('x');
  return { W: parseInt(s[0], 10), H: parseInt(s[1], 10) };
}
function grabFrame(v, t, out) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', v, '-frames:v', '1', '-q:v', '3', '-y', out]);
  return out;
}
/** Row statistics for a crop, downscaled to COLS columns (rows preserved). */
const COLS = 48;
function rowStats(v, t, { x, y, w, h }) {
  const buf = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', v,
    '-vf', `crop=${Math.round(w)}:${Math.round(h)}:${Math.round(x)}:${Math.round(y)},scale=${COLS}:${Math.round(h)}:flags=area,format=rgb24`,
    '-frames:v', '1', '-f', 'rawvideo', '-'], { maxBuffer: 64 * 1024 * 1024 });
  const rows = [];
  for (let r = 0; r < Math.round(h); r++) {
    let sum = 0, sum2 = 0, sat = 0;
    for (let c = 0; c < COLS; c++) {
      const i = (r * COLS + c) * 3;
      const R = buf[i], G = buf[i + 1], B = buf[i + 2];
      const luma = 0.299 * R + 0.587 * G + 0.114 * B;
      sum += luma; sum2 += luma * luma;
      sat += Math.max(R, G, B) - Math.min(R, G, B);
    }
    const mean = sum / COLS;
    const sd = Math.sqrt(Math.max(0, sum2 / COLS - mean * mean));
    rows.push({ mean, sd, sat: sat / COLS });
  }
  return rows;
}

// ---- OCR of many frames in ONE process (Vision start-up dominates per-image cost) ----
function ocrFrames(files) {
  const bin = ensureOcrBin();
  const out = execFileSync(bin, files, { maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' });
  const byFile = new Map();
  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    let j; try { j = JSON.parse(line); } catch { continue; }
    byFile.set(j.file, j);
  }
  return files.map((f) => byFile.get(f) || { file: f, error: 'no OCR result' });
}

// ---- frame interpretation ----
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

function findRankOverlay(lines) {
  // step-3 injects it fixed at top:78px right:20px — "Currently ranking" over "#N".
  const label = lines.find((l) => /currently\s*ranking/i.test(l.t));
  if (!label) return null;
  const near = lines.filter((l) => Math.abs(l.y - label.y) < 90 && l.x > label.x - 60);
  const numLine = near.map((l) => l.t.match(/#\s?(\d{1,3})\b/)).find(Boolean);
  return { rank: numLine ? parseInt(numLine[1], 10) : null, box: label };
}

function findActionRow(lines) {
  // The detail card's round-button row: >=3 of Directions/Save/Nearby/Send to phone/Share
  // sharing one baseline. A results list never has this (its rows are Website+Directions pairs).
  //
  // Two disambiguations, both needed because a results row can sit at the SAME y as the card's
  // button row when the card floats over the list (seen on resonance-solar at 29.3s):
  //   • drop any label paired with a "Website" button on that line — that's a results row, and
  //   • keep only the contiguous chain of buttons (gaps <= CHAIN_GAP); the stray results-list
  //     "Directions" sits ~100px away from the card's first button.
  const cands = lines.filter((l) => ACTION_LABELS.includes(norm(l.t)));
  const websites = lines.filter((l) => norm(l.t) === 'website');
  for (const anchor of cands) {
    const row = cands.filter((l) => Math.abs(l.y - anchor.y) <= 8)
      .filter((l) => !websites.some((wl) => Math.abs(wl.y - l.y) <= 8))
      .sort((a, b) => a.x - b.x);
    const kinds = new Set(row.map((l) => norm(l.t)));
    if (kinds.size >= 3) {
      return {
        y: anchor.y, row,
        minX: Math.min(...row.map((l) => l.x)),
        maxX: Math.max(...row.map((l) => l.x + l.w)),
        labels: [...kinds],
      };
    }
  }
  return null;
}

/**
 * Second pass: now that the headline has anchored the card's left edge, drop any button label
 * that lies OUTSIDE the card (the stray results-list "Directions" that shared the baseline on
 * resonance-solar at 29.3s) and re-assert the >=3-distinct-buttons rule on what's left.
 * Chain-gap heuristics can't do this job: button spacing widens when a card has fewer buttons
 * (alternative-energy shows only Save / Send to phone / Share, ~46px apart).
 */
function refineActionRow(action, headline) {
  const row = action.row.filter((l) => l.x >= headline.x - 30);
  const kinds = new Set(row.map((l) => norm(l.t)));
  if (kinds.size < 3) return null;
  return {
    y: action.y, row,
    minX: Math.min(...row.map((l) => l.x)),
    maxX: Math.max(...row.map((l) => l.x + l.w)),
    labels: [...kinds],
  };
}

function findHeadline(lines, action) {
  // The business-name heading: the tallest HORIZONTAL text in the band above the action row,
  // starting at the card's left padding. The filters matter — without them the tallest line in
  // that band is a ROTATED street label bleeding in from the map (h up to 58px, w ~8px), which
  // anchored the card in the wrong place and false-rejected a good video (xero, 2026-08-10).
  const band = lines.filter((l) => l.y < action.y - 20 && l.y > action.y - 220
    && l.h >= 15 && l.h <= 34 && l.w > l.h * 1.5
    && l.x >= action.minX - 60 && l.x <= action.minX + 160);
  if (!band.length) return null;
  const tallest = band.sort((a, b) => (b.h - a.h) || (b.w - a.w))[0];
  // A long business name WRAPS onto two heading lines ("Coco Lane Orthodontics" / "Culver City").
  // Anchor on the FIRST line, or the hero band would be measured down through the second one and
  // that line's text would read as "content" inside an otherwise-blank band.
  const sameHeading = band.filter((l) => l.h >= tallest.h - 3 && Math.abs(l.x - tallest.x) <= 30
    && l.y <= tallest.y && tallest.y - l.y <= 44);
  return sameHeading.sort((a, b) => a.y - b.y)[0] || tallest;
}

// The scale label ("2000 ft" / "1 mi" / "50 mi") is ~8px tall in the bottom-right corner — too small
// for OCR at native size on many frames (altadena-energy read nothing). Crop that corner and upscale
// 4x first and it reads every time. Trailing junk from the map underneath ("1 miL") is expected, so
// the unit is matched without a word boundary.
const SCALE_RE = /(\d+(?:[.,]\d+)?)\s*(ft|mi|km|m)/i;
function toMeters(val, unit) {
  return unit === 'ft' ? val * 0.3048 : unit === 'mi' ? val * 1609.34 : unit === 'km' ? val * 1000 : val;
}
function parseScaleText(lines) {
  const out = [];
  for (const l of lines) {
    const m = String(l.t).match(SCALE_RE);
    if (!m) continue;
    const val = parseFloat(m[1].replace(',', ''));
    const unit = m[2].toLowerCase();
    if (!(val > 0)) continue;
    out.push({ text: `${val} ${unit}`, meters: toMeters(val, unit) });
  }
  // The widest reading wins: if two numbers were caught, the scale label is the larger one.
  return out.sort((a, b) => b.meters - a.meters)[0] || null;
}
function readScaleBars(video, times, work, W, H) {
  if (!times.length) return [];
  const files = times.map((t, i) => {
    const out = path.join(work, `scale-${i}.jpg`);
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', video,
      '-vf', `crop=260:44:${W - 260}:${H - 44},scale=iw*4:ih*4:flags=lanczos`, '-frames:v', '1', '-q:v', '2', '-y', out]);
    return out;
  });
  return ocrFrames(files).map((o, i) => ({ t: times[i], scale: parseScaleText(o.lines || []) }));
}

function heroVerdict(video, t, action, headline) {
  // The hero band = everything between the top of the card and the business name.
  // Anchor the card's LEFT edge on the headline, not on the action row: when the card floats
  // over the results list, a list row's "Directions" can share the button row's baseline and
  // drag minX into the list. The business-name heading is always inside the card's padding.
  const top = Math.max(0, headline.y - 190);
  const bottom = Math.max(top + 10, headline.y - 12);
  const x = Math.max(0, headline.x - 24);
  const right = Math.max(action.maxX + 30, headline.x + headline.w + 30);
  const w = Math.max(200, right - x);
  const rows = rowStats(video, t, { x, y: top, w, h: bottom - top });
  let content = 0, blank = 0;
  for (const r of rows) {
    if (r.mean >= BLANK_MEAN && r.sd <= BLANK_SD && r.sat <= BLANK_SAT) blank++;
    else if (r.sd > 10 || r.sat > 18) content++;   // a photo, or Google's blue no-photo graphic
  }
  // A partly-scrolled card shows only a sliver of hero — that is fine. The failure signature is
  // a band that is DOMINATED by white void with almost no image in it.
  const ok = content >= MIN_HERO_CONTENT_ROWS && blank / Math.max(1, rows.length) < 0.6;
  return { contentRows: content, blankRows: blank, totalRows: rows.length, ok, rect: { x, y: top, w, h: bottom - top } };
}

function nameMatches(frameText, business) {
  if (!business) return true;               // no expectation supplied → don't judge
  // Match against ALL text on the frame, not just the heading line: OCR splits a wrapped business
  // name across lines, so heading-only matching false-rejects long names (coco-lane, 2026-08-10).
  const a = new Set(norm(frameText).split(' ').filter((w) => w.length > 2));
  const b = norm(business).split(' ').filter((w) => w.length > 2);
  if (!b.length) return true;
  const hit = b.filter((w) => a.has(w)).length;
  return hit / b.length >= 0.5;
}

// ---- main ----
(async () => {
  const D = duration(VIDEO);
  const { W, H } = videoSize(VIDEO);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'rga-accept-'));
  const cleanup = () => { if (!KEEP) fs.rmSync(work, { recursive: true, force: true }); };

  const sampleAt = (times, tag) => {
    const files = times.map((t, i) => grabFrame(VIDEO, t, path.join(work, `${tag}-${i}-${t.toFixed(1)}.jpg`)));
    const ocr = ocrFrames(files);
    return times.map((t, i) => ({ t, file: files[i], lines: (ocr[i].lines || []), error: ocr[i].error }));
  };

  // PASS 1 (coarse) — where is the rank-overlay hold?
  const coarseTimes = [];
  for (let t = D * SCAN_FROM; t <= D * SCAN_TO; t += COARSE_STEP_S) coarseTimes.push(+t.toFixed(1));
  const coarse = sampleAt(coarseTimes, 'coarse');
  const hits = coarse.filter((f) => findRankOverlay(f.lines));

  // PASS 2 (fine) — sample densely across the overlay window (plus a margin) so the
  // card-hold itself is measured, not the pan/zoom frames on either side of it.
  let frames = coarse;
  if (hits.length) {
    const lo = Math.max(0, hits[0].t - COARSE_STEP_S), hi = Math.min(D - 0.5, hits[hits.length - 1].t + COARSE_STEP_S);
    const fineTimes = [];
    for (let t = lo; t <= hi; t += FINE_STEP_S) fineTimes.push(+t.toFixed(1));
    frames = sampleAt(fineTimes, 'fine');
  }

  const ocrErrors = frames.filter((f) => f.error);
  const analysed = [];
  for (const f of frames) {
    const overlay = findRankOverlay(f.lines);
    if (!overlay) continue;
    const loose = findActionRow(f.lines);
    const headline = loose ? findHeadline(f.lines, loose) : null;
    const action = (loose && headline) ? refineActionRow(loose, headline) : null;
    const hero = (action && headline) ? heroVerdict(VIDEO, f.t, action, headline) : null;
    analysed.push({ t: f.t, rank: overlay.rank, action, headline, hero, text: f.lines.map((l) => l.t).join(' ') });
  }

  // ZOOM — read the scale bar off up to 3 overlay frames spread across the hold (magnified corner crop).
  const zoomTimes = analysed.length
    ? [...new Set([analysed[0], analysed[Math.floor(analysed.length / 2)], analysed[analysed.length - 1]].map((a) => a.t))]
    : [];
  const scaleReads = readScaleBars(VIDEO, zoomTimes, work, W, H);
  scaleReads.forEach((r) => { const a = analysed.find((x) => x.t === r.t); if (a) a.scale = r.scale; });

  const overlayFrames = analysed.length;
  const cardFrames = analysed.filter((a) => a.action && a.headline);
  const heroBad = cardFrames.filter((a) => a.hero && !a.hero.ok);
  const scales = scaleReads.map((r) => r.scale).filter(Boolean);
  const wideScales = scales.filter((s) => s.meters > MAX_SCALE_MI * 1609.34);
  const ranks = analysed.map((a) => a.rank).filter((r) => Number.isFinite(r));
  const nameBad = BUSINESS ? cardFrames.filter((a) => !nameMatches(a.text, BUSINESS)) : [];

  // A hero that is blank for the first few seconds and then LOADS is not a broken video — the prospect
  // sees the photo for the rest of the hold (coco-lane: 3 blank of 33 card frames). A genuinely failed
  // load is blank for the WHOLE hold (resonance 14/14, aliq 26/26).
  const heroFail = heroBad.length >= 2 && heroBad.length >= cardFrames.length * 0.5;

  const reasons = [];
  if (ocrErrors.length) reasons.push(`OCR FAILED on ${ocrErrors.length} frame(s) — cannot verify (fail-closed)`);
  if (overlayFrames < MIN_OVERLAY_FRAMES) {
    reasons.push(`NO RANK OVERLAY — "Currently ranking #N" found on ${overlayFrames} sampled frame(s), need ${MIN_OVERLAY_FRAMES}`);
  } else {
    if (cardFrames.length < MIN_CARD_FRAMES) {
      reasons.push(`NO DETAIL CARD — the business card never opened (action row found on ${cardFrames.length} of ${overlayFrames} overlay frame(s))`);
    } else {
      if (heroFail) {
        const w = heroBad[0].hero;
        reasons.push(`BLANK HERO — the photo band above the business name is a white void on ${heroBad.length}/${cardFrames.length} card frame(s) (content rows ${w.contentRows}/${w.totalRows}) at ${heroBad.map((h) => h.t + 's').join(', ')}`);
      }
      if (nameBad.length && nameBad.length === cardFrames.length) {
        reasons.push(`WRONG BUSINESS ON CARD — headline "${cardFrames[0].headline.t}" does not match "${BUSINESS}"`);
      }
    }
    if (!scales.length) {
      reasons.push('ZOOM UNVERIFIABLE — the Maps scale bar could not be read on any overlay frame (fail-closed)');
    } else if (wideScales.length > scales.length / 2) {   // majority of the readings are wide
      reasons.push(`MAP ZOOMED OUT — scale bar reads ${[...new Set(wideScales.map((s) => s.text))].join(', ')} (city level is <= ${MAX_SCALE_MI} mi)`);
    }
    if (Number.isFinite(WANT_RANK) && ranks.length && !ranks.includes(WANT_RANK)) {
      reasons.push(`RANK MISMATCH — overlay shows #${[...new Set(ranks)].join('/#')}, expected #${WANT_RANK}`);
    }
  }

  const pass = reasons.length === 0;
  const result = {
    video: path.basename(VIDEO), pass,
    checks: {
      rankOverlay: overlayFrames >= MIN_OVERLAY_FRAMES ? 'pass' : 'FAIL',
      detailCard: cardFrames.length >= MIN_CARD_FRAMES ? 'pass' : 'FAIL',
      heroPhoto: cardFrames.length ? (heroFail ? 'FAIL' : 'pass') : 'unverified',
      mapZoom: !scales.length ? 'FAIL' : (wideScales.length ? 'FAIL' : 'pass'),
    },
    overlayFrames, cardFrames: cardFrames.length,
    rank: [...new Set(ranks)],
    scale: scales.length ? [...new Set(scales.map((s) => s.text))] : null,
    heroContentRows: cardFrames.map((a) => a.hero?.contentRows ?? null),
    reasons,
  };
  if (DEBUG) result.frames = analysed.map((a) => ({ t: a.t, rank: a.rank, action: a.action?.labels, headline: a.headline?.t, hero: a.hero, scale: a.scale?.text }));
  if (KEEP) result.workDir = work;

  if (JSON_OUT) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`[acceptance] ${path.basename(VIDEO)} → ${pass ? '✅ ACCEPT' : '❌ REJECT'}`);
    console.log(`  overlay:${result.checks.rankOverlay}  card:${result.checks.detailCard}  hero:${result.checks.heroPhoto}  zoom:${result.checks.mapZoom}  (${overlayFrames} overlay / ${cardFrames.length} card frames${result.scale ? `, scale ${result.scale.join('|')}` : ''})`);
    reasons.forEach((r) => console.log(`  ✗ ${r}`));
  }
  cleanup();
  process.exit(pass ? 0 : 2);
})().catch((e) => { console.error(`[acceptance] ERROR: ${e.message}`); process.exit(1); });
