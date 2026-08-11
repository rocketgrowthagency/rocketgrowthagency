/**
 * hero-band.mjs — ONE definition of "the hero photo band is a blank white void".
 *
 * Used by BOTH ends of the pipeline so they can never drift apart:
 *   • step-3-video-recorder.mjs — checks the frame it is about to FREEZE into the video, and
 *     retries/fails the lead before a blank hero is ever encoded.
 *   • scripts/check-video-acceptance.mjs — checks the FINISHED video at the deploy chokepoint.
 *
 * Why pixels and not the DOM: the old guard asked "does the card ADVERTISE photos?" (a text
 * heuristic) to decide whether a missing hero was a load failure or an honest photo-less business.
 * That heuristic reads a "N Photos" section that is often BELOW THE FOLD and not yet rendered, so it
 * answered "no photos" for businesses that had them and the blank hero shipped (resonance 08-09,
 * aliq + cosmetique found in the 08-10 sweep). The pixels settle it without the heuristic: Google's
 * honest "no photos" placeholder is a BLUE/teal graphic, so it reads as content. A WHITE void is
 * always a failed image load.
 */
import { execFileSync } from 'node:child_process';

export const BLANK_MEAN = 228;   // a "white void" row is this bright...
export const BLANK_SD = 7;       // ...this flat...
export const BLANK_SAT = 12;     // ...and this colourless (max channel spread)
export const MIN_HERO_CONTENT_ROWS = 25;
export const MAX_BLANK_FRACTION = 0.6;
const COLS = 48;                 // horizontal resolution is irrelevant; row structure is the signal

/**
 * Per-row mean luma / stddev / saturation for a rectangle of an image or video frame.
 * @param {string} file    image or video path
 * @param {{x,y,w,h}} rect crop in pixels
 * @param {number|null} seekSeconds  timestamp for videos; null for stills
 */
export function bandRows(file, rect, seekSeconds = null) {
  const args = ['-hide_banner', '-loglevel', 'error'];
  if (seekSeconds !== null) args.push('-ss', String(seekSeconds));
  const h = Math.max(1, Math.round(rect.h));
  args.push('-i', file, '-vf',
    `crop=${Math.round(rect.w)}:${h}:${Math.round(rect.x)}:${Math.round(rect.y)},scale=${COLS}:${h}:flags=area,format=rgb24`,
    '-frames:v', '1', '-f', 'rawvideo', '-');
  const buf = execFileSync('ffmpeg', args, { maxBuffer: 64 * 1024 * 1024 });
  const rows = [];
  for (let r = 0; r < h; r++) {
    let sum = 0, sum2 = 0, sat = 0;
    for (let c = 0; c < COLS; c++) {
      const i = (r * COLS + c) * 3;
      const R = buf[i], G = buf[i + 1], B = buf[i + 2];
      const luma = 0.299 * R + 0.587 * G + 0.114 * B;
      sum += luma; sum2 += luma * luma;
      sat += Math.max(R, G, B) - Math.min(R, G, B);
    }
    const mean = sum / COLS;
    rows.push({ mean, sd: Math.sqrt(Math.max(0, sum2 / COLS - mean * mean)), sat: sat / COLS });
  }
  return rows;
}

/** Verdict for a hero band's rows. ok === false means "blank white void — a failed photo load". */
export function heroVerdict(rows) {
  let content = 0, blank = 0;
  for (const r of rows) {
    if (r.mean >= BLANK_MEAN && r.sd <= BLANK_SD && r.sat <= BLANK_SAT) blank++;
    else if (r.sd > 10 || r.sat > 18) content++;   // a photo, or Google's blue no-photo graphic
  }
  const total = Math.max(1, rows.length);
  // A hero that is blank for the first seconds and then LOADS is fine — the failure signature is a band
  // DOMINATED by white with almost no image in it.
  const ok = content >= MIN_HERO_CONTENT_ROWS && blank / total < MAX_BLANK_FRACTION;
  return { contentRows: content, blankRows: blank, totalRows: rows.length, ok };
}

/**
 * The hero band's rectangle, derived from the business-name heading — the one landmark both ends can
 * find (step-3 reads the h1's getBoundingClientRect; the gate reads the OCR'd headline box). The band
 * is everything between the top of the card and the name.
 *
 * Anchor the LEFT edge on the heading, never on the action-button row: when the card floats over the
 * results list, a list row's "Directions" can share the button row's baseline and drag the left edge
 * out into the list, which measures the wrong pixels entirely (resonance at 29.3s).
 *
 * @param {{left:number, right:number, top:number}} head  heading box in frame/CSS pixels
 * @param {number|null} rightHint  a known card right edge (the gate passes the action row's), if any
 */
export function heroRectFromHeading(head, rightHint = null) {
  const top = Math.max(0, head.top - 190);
  const bottom = Math.max(top + 10, head.top - 12);
  const x = Math.max(0, head.left - 24);
  const right = Math.max(rightHint === null ? 0 : rightHint + 30, head.right + 30);
  return { x, y: top, w: Math.max(200, right - x), h: bottom - top };
}

/** Convenience: measure a rect of a file and judge it in one call. */
export function judgeHeroBand(file, rect, seekSeconds = null) {
  return heroVerdict(bandRows(file, rect, seekSeconds));
}
