#!/usr/bin/env node
/**
 * check-report-honesty.mjs — the morning report must not claim success it cannot support.
 *
 * ─── WHY (2026-08-21) ────────────────────────────────────────────────────────────────────────────
 * Chris read the 2026-08-20 report and concluded the pipeline had regressed. He was reading it
 * correctly — the report was wrong in two independent ways:
 *
 * 1. FALSE ALL-CLEAR. The "Issues / errors" branch printed
 *        "None — every emailable lead deployed successfully."
 *    whenever FAILED_TOTAL was 0. But a SKIPPED lead never becomes a failure, so the report showed
 *        emailable 7 · deployed 0 · failed 0
 *    and then declared every lead deployed successfully. A gap with zero failures is the most
 *    suspicious outcome there is — it means leads vanished before anything could record them.
 *
 * 2. ONE SEARCH, NOT THE NIGHT. overnight-pipeline.sh runs once PER SEARCH and each run overwrites
 *    the date's report, so a 16-search night is represented by whatever ran last. That night it was
 *    Dermatologists: 8 minutes, 7 emailable, 0 built (it landed inside the dead window) — while the
 *    night actually ran 21 search blocks, dispatched 234 leads and built 39 videos.
 *
 * Together they turned a 39-video night into a report that said zero. Days of "the pipeline got worse"
 * came from a reporting bug, not the pipeline.
 *
 * INVARIANTS
 *  1. The all-clear is gated on deployed >= emailable, not merely failures == 0.
 *  2. A gap with no failures is called out explicitly.
 *  3. The report carries a whole-night roll-up and says the summary above it is one search.
 *
 * Exit 0 = healthy, 1 = regression.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PIPE = path.join(HERE, 'overnight-pipeline.sh');

const fail = (m) => { console.error(`✗ FATAL: ${m}`); process.exit(1); };
const ok = (m) => console.log(`  ✓ ${m}`);

if (!fs.existsSync(PIPE)) fail('overnight-pipeline.sh not found.');
const raw = fs.readFileSync(PIPE, 'utf8');
// 🔴 Strip comments before matching — twice on 2026-08-21 a static check matched its own explanatory
// prose instead of code and passed a sabotage that had removed the real logic.
//
// 🔴🔴 THIS IS A SHELL SCRIPT — ONLY `#` COMMENTS. The first version also ran a JavaScript block-comment
// stripper (/*…*/) over it. Shell globs contain those characters — `"output/Step 2/"*"_${SLUG}-only-"*`
// — so it matched from a glob's `/*` to some later `*/` and DELETED a large span of the file, making
// this check report that code was missing when it was right there. Match the comment syntax of the
// language you are actually reading.
const src = raw.split('\n').map((l) => l.replace(/^\s*#.*$/, '')).join('\n');

// 1 + 2. The all-clear must be guarded by a deployed-vs-emailable comparison.
const claim = 'every emailable lead deployed successfully';
if (!src.includes(claim)) {
  ok('the unconditional success claim has been removed entirely');
} else {
  const idx = src.indexOf(claim);
  const before = src.slice(Math.max(0, idx - 1500), idx);
  if (!/DEPLOYED_TOTAL:-0\}"\s*-lt\s*"\$\{EMAILABLE_TOTAL:-0\}/.test(before)) {
    fail('"every emailable lead deployed successfully" is printed without comparing DEPLOYED_TOTAL to\n' +
         '         EMAILABLE_TOTAL. A skipped lead is not a failure, so a night that silently dropped\n' +
         '         every lead would print this all-clear (it did, on 2026-08-20).');
  }
  ok('all-clear is gated on deployed >= emailable, not just failures == 0');
}

if (!/produced no video and no failure record/.test(src)) {
  fail('a gap between emailable and deployed with ZERO failures is not called out. That is the exact\n' +
       '         signature of leads skipped before anything could log them.');
}
ok('a silent gap (no video, no failure) is reported explicitly');

// 3. Whole-night roll-up present, and it must say the summary above is one search.
if (!/## Whole night — all searches/.test(src)) {
  fail('the report has no whole-night roll-up. Each per-search run overwrites the date\'s report, so a\n' +
       '         multi-search night is represented by whatever ran last — a 39-video night read as 0.');
}
if (!/check-run-productivity\.mjs/.test(src.slice(src.indexOf('## Whole night')))) {
  fail('the roll-up does not use check-run-productivity.mjs. It must reuse the measurement that already\n' +
       '         spans both log dates and counts real video files, not a third counter that can disagree.');
}
if (!/only the last search/.test(src)) {
  fail('the report does not warn that its single-search summary is just the last search of the night —\n' +
       '         which is precisely the misreading that happened.');
}
ok('whole-night roll-up present and the single-search scope is stated');

console.log('✅ report honesty: no unearned all-clear, silent gaps surfaced, whole-night roll-up included.');
