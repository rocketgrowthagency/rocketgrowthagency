#!/usr/bin/env node
/**
 * check-hero-band.mjs — REGRESSION TEST for the shared blank-hero rule (scripts/lib/hero-band.mjs).
 *
 * That rule is the single verdict at BOTH ends of the pipeline: step-3 refuses to freeze a frame whose
 * hero band is a white void, and the acceptance gate rejects a finished video for the same reason. If
 * it drifts, blank heroes ship again (resonance 08-09; aliq + cosmetique were already live when the
 * 08-10 sweep found them).
 *
 * This exercises the CAPTURE-side path specifically — a still frame at the capture resolution plus a
 * heading rectangle, exactly what step-3 hands it — which the video-level test can't cover.
 * Fixtures are the same frames as scripts/fixtures/acceptance/.
 *
 * Usage: node scripts/check-hero-band.mjs      Exit 0 = rule intact, 1 = regression.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { judgeHeroBand, heroRectFromHeading } from './lib/hero-band.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(ROOT, 'scripts', 'fixtures', 'acceptance');

// Heading boxes measured on the 1280x720 fixture frames (the business-name h1). step-3 reads the
// equivalent numbers live from getBoundingClientRect at the 1600x900 capture viewport, so each case
// is ALSO run scaled up to 1600x900 to prove the geometry is resolution-independent.
const CASES = [
  { name: 'blank-hero (resonance)', file: path.join(FIX, 'blank-hero', '01.jpg'),
    head: { left: 420, right: 638, top: 258 }, expectOk: false },
  { name: 'good hero (xero)', file: path.join(FIX, 'good', '01.jpg'),
    head: { left: 74, right: 160, top: 210 }, expectOk: true },
  { name: 'good hero, wide card (alternative-energy)', file: path.join(FIX, 'zoomed-out', '01.jpg'),
    head: { left: 74, right: 342, top: 210 }, expectOk: true },
];

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'rga-hero-'));
let failures = 0;
for (const c of CASES) {
  if (!fs.existsSync(c.file)) { console.error(`  ✗ ${c.name}: fixture missing`); failures++; continue; }
  for (const scale of [1, 1600 / 1280]) {
    let file = c.file;
    if (scale !== 1) {
      file = path.join(work, `${path.basename(path.dirname(c.file))}-scaled.jpg`);
      execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', c.file, '-vf', 'scale=1600:900', '-q:v', '3', '-y', file]);
    }
    const head = { left: c.head.left * scale, right: c.head.right * scale, top: c.head.top * scale };
    const v = judgeHeroBand(file, heroRectFromHeading(head));
    const tag = scale === 1 ? '1280x720' : '1600x900 (capture size)';
    if (v.ok !== c.expectOk) {
      console.error(`  ✗ ${c.name} @ ${tag}: expected ok=${c.expectOk}, got ok=${v.ok} (${v.contentRows} content / ${v.blankRows} blank of ${v.totalRows})`);
      failures++;
    } else {
      console.log(`  ✓ ${c.name} @ ${tag}: ok=${v.ok} (${v.contentRows} content / ${v.blankRows} blank of ${v.totalRows})`);
    }
  }
}
fs.rmSync(work, { recursive: true, force: true });

if (failures) {
  console.error(`\n❌ hero-band rule regression: ${failures} case(s) wrong — blank heroes could ship again.`);
  process.exit(1);
}
console.log('\n✅ hero-band rule intact at both capture and video resolution.');
