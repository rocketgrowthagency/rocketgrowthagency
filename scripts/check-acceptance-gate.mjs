#!/usr/bin/env node
/**
 * check-acceptance-gate.mjs — REGRESSION TEST for scripts/check-video-acceptance.mjs.
 *
 * The acceptance gate is the last thing standing between a broken render and a prospect's inbox.
 * If someone loosens a threshold to "unstick" a night's run, this test is what fails loudly first
 * (it runs pre-flight in overnight-pipeline.sh, before any Chrome is launched).
 *
 * Fixtures are FRAMES, not videos (never git-track .mp4 — feedback_no_video_binaries_in_git). Each
 * case's jpgs are assembled into a short clip on the fly and pushed through the real gate:
 *
 *   blank-hero  resonance-solar-installation (08-09) — card open, hero band a white void  → REJECT
 *   no-card     sunko-solar (08-09)                  — froze on the results list, no card → REJECT
 *   zoomed-out  alternative-energy-llc-california    — whole state on screen ("50 mi")    → REJECT
 *   good        xero-solar (08-09)                   — correct render                     → ACCEPT
 *
 * Usage: node scripts/check-acceptance-gate.mjs      Exit 0 = all cases behave, 1 = regression.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = path.join(ROOT, 'scripts', 'fixtures', 'acceptance');
const GATE = path.join(ROOT, 'scripts', 'check-video-acceptance.mjs');

const CASES = [
  { dir: 'blank-hero', expect: 'reject', why: 'hero band is a white void', match: /BLANK HERO/ },
  { dir: 'no-card', expect: 'reject', why: 'detail card never opened', match: /NO RANK OVERLAY|NO DETAIL CARD/ },
  { dir: 'zoomed-out', expect: 'reject', why: 'map at state zoom', match: /MAP ZOOMED OUT/ },
  { dir: 'good', expect: 'accept', why: 'correct render', match: null },
];

// Assemble the case's frames into a ~30s clip. The gate scans 5%–70% of the runtime, so a clip built
// from repeated card frames puts the money-shot exactly where a real render puts it.
function buildClip(dir, out) {
  const frames = fs.readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort();
  if (!frames.length) throw new Error(`no fixture frames in ${dir}`);
  const list = path.join(path.dirname(out), 'list.txt');
  const lines = [];
  for (let i = 0; i < 30; i++) {
    lines.push(`file '${path.join(dir, frames[i % frames.length])}'`, 'duration 1');
  }
  lines.push(`file '${path.join(dir, frames[(30 - 1) % frames.length])}'`);
  fs.writeFileSync(list, lines.join('\n'));
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
    '-vf', 'fps=5,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-y', out]);
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'rga-gate-test-'));
let failures = 0;
for (const c of CASES) {
  const dir = path.join(FIXTURES, c.dir);
  if (!fs.existsSync(dir)) { console.error(`  ✗ ${c.dir}: fixtures missing (${dir})`); failures++; continue; }
  const clip = path.join(work, `${c.dir}.mp4`);
  try { buildClip(dir, clip); } catch (e) { console.error(`  ✗ ${c.dir}: could not build clip — ${e.message}`); failures++; continue; }
  const r = spawnSync('node', [GATE, clip, '--json'], { encoding: 'utf8' });
  let out = {}; try { out = JSON.parse(r.stdout); } catch { /* */ }
  const accepted = r.status === 0;
  const want = c.expect === 'accept';
  const reasons = (out.reasons || []).join(' | ');
  if (accepted !== want) {
    console.error(`  ✗ ${c.dir}: expected ${c.expect.toUpperCase()} (${c.why}) but gate ${accepted ? 'ACCEPTED' : 'REJECTED'}${reasons ? ` — ${reasons}` : ''}`);
    failures++;
  } else if (c.match && !c.match.test(reasons)) {
    console.error(`  ✗ ${c.dir}: rejected for the WRONG reason — expected ${c.match}, got "${reasons}"`);
    failures++;
  } else {
    console.log(`  ✓ ${c.dir}: ${c.expect} (${c.why})${reasons ? ` — ${reasons.slice(0, 80)}` : ''}`);
  }
}
fs.rmSync(work, { recursive: true, force: true });

if (failures) {
  console.error(`\n❌ acceptance gate regression: ${failures} case(s) wrong. Do NOT run the pipeline until this is green —`);
  console.error('   a loosened gate means broken videos reach prospects. See project_video_pipeline_rework.md.');
  process.exit(1);
}
console.log(`\n✅ acceptance gate: ${CASES.length}/${CASES.length} cases behave as locked.`);
