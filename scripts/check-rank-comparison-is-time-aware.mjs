#!/usr/bin/env node
/**
 * check-rank-comparison-is-time-aware.mjs — judge a video against the scrape it was BUILT from.
 *
 * ─── WHY (2026-08-24) ────────────────────────────────────────────────────────────────────────────
 * step-3 stamps the "Currently ranking #N" overlay from the Map Rank in ITS input CSV. The acceptance
 * gate used to fetch the expected rank from a global newest-CSV-wins map — so a video captured on
 * 08-20 was judged against a scrape taken on 08-23.
 *
 *     Solar 101:  08-10 → 44 · 08-21 → 33 (the build) · 08-22 → 32 · 08-24 → 32 (what the gate read)
 *     ⇒ "RANK MISMATCH — overlay shows #33, expected #32"
 *
 * Neither number was wrong. The COMPARISON was. 31 mismatches across three nights, **28 of 30 skewed
 * the same way (+7.6 mean)** — because ranks improve over time, so a newer expectation always sits
 * below an older overlay. Every rejection threw away a CORRECT video after a full render.
 *
 * 🔑 A one-directional "error" is never noise. Symmetric drift is reality; a consistent sign is a bug.
 *
 * INVARIANTS
 *  1. Rank history (mtime, rank) is collected from every step-2 CSV, not just the newest.
 *  2. expectedRank prefers the newest CSV that existed WHEN THE MP4 WAS WRITTEN.
 *  3. It still falls back to newest-wins / Airtable, so a video with no history is not blocked.
 *  4. The RANK MISMATCH check still exists — this fixes the input, it does not disable the gate.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER = path.dirname(HERE);
const BUILD = path.join(SCRAPER, 'build-video-landing.mjs');
const GATE = path.join(HERE, 'check-video-acceptance.mjs');

const fail = (m) => { console.error(`✗ FATAL: ${m}`); process.exit(1); };
const ok = (m) => console.log(`  ✓ ${m}`);

const raw = fs.readFileSync(BUILD, 'utf8');
const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

if (!/rankHistory/.test(src)) {
  fail('no rank history is collected. Without it the gate can only see the NEWEST scrape and will keep\n' +
       '         rejecting correct videos built from an earlier one.');
}
if (!/mtime:\s*fileMtime/.test(src)) fail('rank history does not record each CSV\'s mtime, so it cannot be time-ordered.');
ok('rank history collected with per-CSV mtimes');

const i = src.indexOf('const expectedRank');
if (i === -1) fail('expectedRank resolution is gone.');
const block = src.slice(i, i + 900);
if (!/statSync\(v\.fullPath\)/.test(block)) {
  fail('expectedRank does not read the MP4\'s own mtime — it cannot know which scrape the video came from.');
}
if (!/h\.mtime <= vTime/.test(block)) {
  fail('expectedRank does not filter history to CSVs that existed when the video was written.');
}
ok('expectedRank uses the newest scrape that predates the MP4');

if (!/step2Ranks\[slug\]/.test(block) || !/Map Rank/.test(block)) {
  fail('the newest-wins / Airtable fallback was removed — a video with no rank history would be blocked.');
}
ok('falls back safely when no history exists');

const gateSrc = fs.readFileSync(GATE, 'utf8');
if (!/RANK MISMATCH/.test(gateSrc)) {
  fail('the RANK MISMATCH check itself has been removed. This fix corrects the gate\'s INPUT; it must\n' +
       '         never become an excuse to stop checking that the overlay matches the lead.');
}
ok('the RANK MISMATCH check still exists (input fixed, gate intact)');

// ── BEHAVIOURAL — replay the real Solar 101 rejection ────────────────────────────────────────────
const hist = [
  { mtime: Date.parse('2026-08-10T12:00:00Z'), rank: 44 },
  { mtime: Date.parse('2026-08-21T04:00:00Z'), rank: 33 },
  { mtime: Date.parse('2026-08-22T04:00:00Z'), rank: 32 },
  { mtime: Date.parse('2026-08-24T04:00:00Z'), rank: 32 },
];
const vTime = Date.parse('2026-08-21T23:30:00Z');
const newest = [...hist].sort((a, b) => b.mtime - a.mtime)[0].rank;
const timed = hist.filter((h) => h.mtime <= vTime + 60000).sort((a, b) => b.mtime - a.mtime)[0].rank;
if (newest !== 32) fail('fixture broken: newest-wins should reproduce the old wrong answer (32).');
if (timed !== 33) fail(`time-aware resolution returned ${timed}, expected 33 — the real overlay value.`);
ok('behavioural: replays Solar 101 — newest-wins says 32 (reject), time-aware says 33 (pass)');

console.log('✅ rank comparison is time-aware; the gate judges a video against its own scrape.');
