#!/usr/bin/env node
// scripts/check-maps-finding-rank-priority.mjs
//
// Regression guard for rank-aware Maps finding priority (2026-06-12, Chris).
// Locks the SAME behavior for BOTH rank tiers — rank 1-3 (defense) AND rank 4+ (climb):
//
//   - Review VOLUME beats a trivial rating gap. A sub-0.3-star rating gap is filler and
//     must NOT take a Maps finding slot; review-count gaps must surface.
//   - rank 4+ (climb): behind on reviews by ANY margin -> reviewGapToTop3; below 60% of
//     top-3 avg -> reviewCount. ratingGap only on a MATERIAL gap (>= 0.3 stars).
//   - rank 1-3 (defense): #2/#3 behind on reviews -> reviewGapToLeader; #2/#3 rating below
//     leader at ANY margin -> ratingGapToLeader; rank #1 ahead 2x -> reviewBufferLeader.
//
// Caught: Doctor Pipe (rank #15, 13 reviews, 4.7 vs top-3 4.9) surfaced "even a small
// rating gap" instead of the 13-vs-20 review-volume lever.
//
// Usage:  node scripts/check-maps-finding-rank-priority.mjs   (0 = pass, 1 = fail)
// Runs pre-flight in scripts/overnight-pipeline.sh.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const fail = (m) => { console.error(`  ✗ ${m}`); failed++; };
const pass = (m) => console.log(`  ✓ ${m}`);

// ── static presence: the real step-6 source must carry the rank-aware logic ──
const s6 = fs.readFileSync(path.join(ROOT, 'step-6-voiceover.mjs'), 'utf8');
const presence = [
  [/key: 'reviewGapToTop3'/.test(s6) && /!isTop3 && reviews < compareReviewsAvg/.test(s6),
    'rank 4+ climb review-volume finding (reviewGapToTop3)'],
  [/rating <= compareRatingAvg - 0\.3/.test(s6), 'ratingGap requires a material >= 0.3-star gap'],
  [/key: 'ratingGapToLeader'/.test(s6), 'rank 1-3 defense rating finding (ratingGapToLeader, any margin)'],
  [/key: 'reviewGapToLeader'/.test(s6), 'rank 1-3 defense review finding (reviewGapToLeader)'],
];
for (const [ok, label] of presence) ok ? pass(`present: ${label}`) : fail(`MISSING: ${label}`);

// ── logic: mirror step-6's review + rating decision chains, test BOTH tiers ──
function fired(rank, reviews, rating, revAvg, ratAvg) {
  const keys = [];
  const isTop3 = rank >= 1 && rank <= 3;
  // review chain (mutually exclusive, mirrors step-6 if/else-if order)
  if (reviews < revAvg * 0.6) keys.push('reviewCount');
  else if (rank === 1 && reviews > revAvg * 2) keys.push('reviewBufferLeader');
  else if (isTop3 && (rank === 2 || rank === 3) && reviews < revAvg) keys.push('reviewGapToLeader');
  else if (!isTop3 && reviews < revAvg) keys.push('reviewGapToTop3');
  // rating chain (independent)
  if (rating <= ratAvg - 0.3) keys.push('ratingGap');
  else if (isTop3 && (rank === 2 || rank === 3) && rating < ratAvg) keys.push('ratingGapToLeader');
  return keys;
}

// [label, rank, reviews, rating, revAvg, ratAvg, mustInclude[], mustExclude[]]
const CASES = [
  // rank 4+ (climb)
  ['4+ behind on volume, trivial rating gap (Doctor Pipe)', 15, 13, 4.7, 20, 4.9, ['reviewGapToTop3'], ['ratingGap', 'reviewCount']],
  ['4+ far below volume (<60%)',                            15,  5, 4.8, 20, 4.9, ['reviewCount'],      ['reviewGapToTop3']],
  ['4+ material rating gap fires',                          15, 13, 4.5, 20, 4.9, ['ratingGap', 'reviewGapToTop3'], []],
  ['4+ ahead on volume, tiny rating gap → no filler',       15, 25, 4.8, 20, 4.9, [],                   ['ratingGap', 'reviewGapToTop3', 'reviewCount']],
  // rank 1-3 (defense)
  ['#2 behind on volume → defense finding',                 2, 13, 4.9, 20, 4.9, ['reviewGapToLeader'], ['reviewGapToTop3']],
  ['#2 tiny rating gap → defense fires at any margin',       2, 30, 4.8, 20, 4.9, ['ratingGapToLeader'], ['ratingGap']],
  ['#1 ahead 2x → buffer finding',                          1, 50, 4.9, 20, 4.9, ['reviewBufferLeader'],['reviewGapToTop3', 'ratingGap']],
];
for (const [label, rank, rev, rat, ra, ta, inc, exc] of CASES) {
  const got = fired(rank, rev, rat, ra, ta);
  const missing = inc.filter((k) => !got.includes(k));
  const leaked = exc.filter((k) => got.includes(k));
  if (!missing.length && !leaked.length) pass(`${label} → [${got.join(', ') || 'none'}]`);
  else fail(`${label} → [${got.join(', ') || 'none'}] (missing: ${missing.join(',') || '-'}; leaked: ${leaked.join(',') || '-'})`);
}

if (failed) { console.error(`\nmaps finding rank-priority: ${failed} FAILED`); process.exit(1); }
console.log('\nmaps finding rank-priority: all checks passed (rank 1-3 + 4+)');
