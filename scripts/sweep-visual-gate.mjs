#!/usr/bin/env node
/**
 * sweep-visual-gate.mjs — run the post-render VISUAL GATE (scripts/check-video-visual.mjs) across an entire
 * library of already-built videos, to find ones that already shipped broken (quarter-scale renders + wrong-
 * window/desktop leaks). Built 2026-07-20 after the daytime-capture incident revealed the 07-18 batch was
 * only the tip. See [[feedback-video-visual-gate]].
 *
 * Usage:
 *   node scripts/sweep-visual-gate.mjs <dir-of-<slug>/video.mp4> [--concurrency=6] [--check-a-only] [--out=report.md]
 *
 * Reads every <slug>/video.mp4 under <dir>, runs the gate, writes a triaged Markdown report:
 *   - QUARTER-SCALE fails (Check A, deterministic — high confidence)
 *   - WRONG-WINDOW fails (Check B vision — includes real desktop/IDE leaks AND bad website captures
 *     like expired/parked domains, 404 pages; triage before mass-takedown)
 *   - passes
 * Prints a summary. PII-safe: only slugs + gate reasons (no emails/owner names).
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GATE = path.join(ROOT, 'scripts', 'check-video-visual.mjs');
const args = process.argv.slice(2);
const DIR = args.find((a) => !a.startsWith('--'));
const CONC = Number((args.find((a) => a.startsWith('--concurrency=')) || '').split('=')[1] || 6);
const CHECK_A_ONLY = args.includes('--check-a-only');
const OUT = (args.find((a) => a.startsWith('--out=')) || '').split('=')[1] || path.join(ROOT, 'reports', 'visual-gate-sweep.md');

if (!DIR || !fs.existsSync(DIR)) { console.error(`no such dir: ${DIR}`); process.exit(1); }

const videos = fs.readdirSync(DIR)
  .map((slug) => ({ slug, mp4: path.join(DIR, slug, 'video.mp4') }))
  .filter((v) => fs.existsSync(v.mp4));
console.log(`[sweep] ${videos.length} videos under ${DIR} (concurrency=${CONC}${CHECK_A_ONLY ? ', check-A-only' : ''})`);

function gate(mp4) {
  return new Promise((resolve) => {
    const a = [GATE, mp4, '--json']; if (CHECK_A_ONLY) a.push('--no-vision');
    const child = spawn('node', a, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += String(d); });
    child.on('error', () => resolve(null));
    child.on('exit', () => { try { resolve(JSON.parse(out)); } catch { resolve(null); } });
  });
}

const results = [];
let done = 0;
async function worker(queue) {
  while (queue.length) {
    const v = queue.shift();
    const r = await gate(v.mp4);
    results.push({ slug: v.slug, r });
    if (++done % 25 === 0) console.log(`[sweep] ${done}/${videos.length} …`);
  }
}

const queue = [...videos];
await Promise.all(Array.from({ length: Math.min(CONC, queue.length) }, () => worker(queue)));

const qs = results.filter((x) => x.r && x.r.checkA_quarterScale === 'FAIL');
const ww = results.filter((x) => x.r && x.r.checkB_wrongWindow === 'FAIL' && x.r.checkA_quarterScale !== 'FAIL');
const err = results.filter((x) => !x.r);
const pass = results.filter((x) => x.r && x.r.pass);

const lines = [];
lines.push(`# Visual-gate library sweep — ${videos.length} videos`);
lines.push('');
lines.push(`- **Quarter-scale (Check A, high-confidence):** ${qs.length}`);
lines.push(`- **Wrong-window (Check B vision — triage: leaks vs bad website captures):** ${ww.length}`);
lines.push(`- **Passed:** ${pass.length}`);
lines.push(`- **Analysis errors:** ${err.length}`);
lines.push('');
lines.push('## QUARTER-SCALE (take down + re-render)');
qs.forEach((x) => lines.push(`- ${x.slug} — ${(x.r.reasons || []).join(' | ')}`));
lines.push('');
lines.push('## WRONG-WINDOW (triage: desktop/IDE leak = take down; expired-domain/404/wrong-site = re-scrape)');
ww.forEach((x) => lines.push(`- ${x.slug} — ${(x.r.reasons || []).join(' | ')}`));
if (err.length) { lines.push(''); lines.push('## ANALYSIS ERRORS (re-check manually)'); err.forEach((x) => lines.push(`- ${x.slug}`)); }

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, lines.join('\n') + '\n');
console.log(`\n[sweep] DONE. quarter-scale=${qs.length} wrong-window=${ww.length} pass=${pass.length} err=${err.length}`);
console.log(`[sweep] report → ${OUT}`);
