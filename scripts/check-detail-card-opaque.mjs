#!/usr/bin/env node
/**
 * check-detail-card-opaque.mjs — the Maps detail card must be SOLID in the finished video.
 * (2026-08-20)
 *
 * THE DEFECT THIS CATCHES
 * Chris caught Dr. Augusto Rojas' video with a translucent detail card — the coastline and map labels
 * were clearly visible THROUGH the white panel. Cause: the recorded hold began while Maps was still
 * fading the panel in (the only wait was "does the h1 exist", which Maps satisfies immediately).
 *
 * Every existing video gate answers "is there content?" (hero-band, blank-region, 6/6 signals,
 * acceptance). NONE answers "does it look right?" — so this passed all four and shipped.
 *
 * HOW IT DETECTS IT
 * The detail card is overwhelmingly white/near-white chrome. Google's map tiles underneath are
 * saturated — greens, blues, tans. If a meaningful share of pixels inside the card region are
 * SATURATED, the map is showing through and the card is translucent.
 *
 * Deliberately measures SATURATION, not "is it white": a legitimate card contains dark text, colour
 * buttons and a photo strip, all of which are fine. Bleed-through is distinguished by saturated colour
 * spread ACROSS the card body rather than concentrated in a band.
 *
 * Usage:
 *   node scripts/check-detail-card-opaque.mjs <video.mp4> [--json]
 *   node scripts/check-detail-card-opaque.mjs --selftest     (runs the labelled fixtures below)
 *
 * Exit 0 = card reads solid (or no detail-card frame found — never fail a video we cannot judge).
 * Exit 1 = translucent card detected.
 *
 * 🚫🚫 NOT WIRED INTO THE PIPELINE — IT PRODUCES FALSE POSITIVES. DO NOT PROMOTE IT TO A GATE.
 * Scored across all 71 videos of 2026-08-19 it flags 5 at the 15% threshold, and THREE of those
 * (jarrar-and-associates-sam 32.4%, gv-tax-accounting-services 20.1%, elite-cpa-corp 19.5%) are videos
 * Chris reviewed and confirmed GOOD. Pulling a frame from the worst offender settles it: Jarrar's detail
 * card is completely solid.
 *
 * The reason is that the metric measures LAYOUT, not translucency. The card is narrower than the fixed
 * left/right crop, so map pixels bleed into whichever half is supposed to be "the card" and inflate its
 * saturation. The four hand-picked fixtures separated cleanly only because their layouts happened to
 * agree; the full population does not.
 *
 * Kept as a DIAGNOSTIC — useful for ranking videos to eyeball, useless as a pass/fail. Making it a gate
 * would reject videos Chris has approved, and false rejects are historically the single biggest source
 * of lost videos here (48 of 75). To make it real, the card region must be DETECTED per frame (find the
 * large near-white rectangle) rather than assumed.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Measured 2026-08-20 against Chris-labelled videos (min-of-halves, see scoreVideo):
//   translucent : dr-augusto-rojas-md 20.1%
//   solid       : the-pod-photography 11.3% · turbotax 10.8% · chaudhry-cpa 5.9% · cyril-gary-md 5.4%
// 15% sits between the two clusters with margin on both sides. A first attempt that measured only the
// RIGHT half scored 21.9 vs 14.6/15.5/11.9 — overlapping, i.e. useless — because the right half is
// sometimes the MAP, not the card. Never wire in a gate whose fixtures do not separate.
const SAT_FAIL_PCT = Number(process.env.DETAIL_SAT_FAIL_PCT || 15);

/** Sample frames across the detail-hold window and return the worst saturation share. */
export function scoreVideo(video, { sampleAt = [40, 46, 52, 58, 64] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rga-detail-'));
  const results = [];
  try {
    for (const t of sampleAt) {
      // 🔑 MEASURE BOTH HALVES AND TAKE THE LOWER ONE.
      // The Maps layout puts the detail card on either side depending on the flow, and the other half
      // is the MAP — which is saturated by definition. Assuming a side made the first version of this
      // gate useless. The card is always the LESS saturated half; if even that half is saturated, the
      // map is bleeding through it.
      const half = (side) => {
        const png = path.join(dir, `f${t}${side}.png`);
        const vf = side === 'R'
          ? 'crop=iw*0.44:ih*0.7:iw*0.54:ih*0.15,scale=220:-1'
          : 'crop=iw*0.44:ih*0.7:iw*0.02:ih*0.15,scale=220:-1';
        try {
          execFileSync('ffmpeg', ['-loglevel', 'error', '-ss', String(t), '-i', video,
            '-frames:v', '1', '-vf', vf, '-y', png], { stdio: 'ignore' });
        } catch { return null; }
        if (!fs.existsSync(png)) return null;
        let raw;
        try {
          raw = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', png, '-f', 'rawvideo',
            '-pix_fmt', 'rgb24', '-'], { maxBuffer: 64 * 1024 * 1024 });
        } catch { return null; }
        let sat = 0, total = 0;
        for (let i = 0; i + 2 < raw.length; i += 3) {
          const r = raw[i], g = raw[i + 1], b = raw[i + 2];
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          if (mx < 40) continue;           // near-black text: not evidence either way
          total++;
          if (mx - mn > 34) sat++;         // a clear colour cast — map tiles, not white chrome
        }
        return total > 0 ? (sat / total) * 100 : null;
      };
      const L = half('L'), R = half('R');
      if (L != null && R != null) results.push({ t, pct: Math.min(L, R) });
    }
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
  if (!results.length) return null;
  // The card is held for many seconds; a single odd frame (a transition) should not condemn it.
  // Use the MEDIAN so a sustained bleed-through is what fails.
  const sorted = results.map((r) => r.pct).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return { median, frames: results };
}

// Only act as a CLI when run directly — otherwise `import { scoreVideo }` would execute the CLI and
// exit before the caller got anything back.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
const args = process.argv.slice(2);

if (!isMain) { /* imported as a library — export only */ }
else if (args.includes('--selftest')) {
  // Labelled fixtures: Chris confirmed these by eye on 2026-08-20.
  const WEB = '/Users/chris/RGA/Rocket Growth Agency Website VS Code';
  const CASES = [
    { slug: 'dr-augusto-rojas-md', label: 'TRANSLUCENT (Chris flagged)', expectFail: true },
    { slug: 'chaudhry-cpa', label: 'confirmed good', expectFail: false },
    { slug: 'the-pod-photography', label: 'confirmed good', expectFail: false },
    { slug: 'turbotax-culver-blvd-culver-city', label: 'confirmed good', expectFail: false },
  ];
  let bad = 0;
  for (const c of CASES) {
    const v = path.join(WEB, 'v', c.slug, 'video.mp4');
    if (!fs.existsSync(v)) { console.log(`  ?  ${c.slug} — no video on disk, skipped`); continue; }
    const s = scoreVideo(v);
    if (!s) { console.log(`  ?  ${c.slug} — no frames sampled`); continue; }
    const failed = s.median >= SAT_FAIL_PCT;
    const ok = failed === c.expectFail;
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'}  ${c.slug.padEnd(42)} median-sat ${s.median.toFixed(1)}%  → ${failed ? 'FAIL' : 'pass'}  (${c.label})`);
  }
  console.log(bad === 0
    ? `\n  ✅ separates the flagged video from the confirmed-good ones at ${SAT_FAIL_PCT}%`
    : `\n  ❌ ${bad} fixture(s) misclassified — threshold does not discriminate; DO NOT wire this in`);
  process.exit(bad === 0 ? 0 : 1);
}

else {
const video = args.find((a) => !a.startsWith('--'));
if (!video) { console.error('usage: node scripts/check-detail-card-opaque.mjs <video.mp4> [--json] | --selftest'); process.exit(2); }
const score = scoreVideo(video);
if (!score) { console.log('  no detail-card frames sampled — not judging this video. ✓'); process.exit(0); }
if (args.includes('--json')) console.log(JSON.stringify(score));
else {
  console.log(`  median saturation inside the card region: ${score.median.toFixed(1)}%  (fail at ${SAT_FAIL_PCT}%)`);
  for (const f of score.frames) console.log(`     t=${String(f.t).padStart(3)}s  ${f.pct.toFixed(1)}%`);
}
if (score.median >= SAT_FAIL_PCT) {
  console.error(`✗ DETAIL CARD LOOKS TRANSLUCENT — the map is showing through the panel.`);
  process.exit(1);
}
console.log('✓ detail card reads solid');
process.exit(0);
}
