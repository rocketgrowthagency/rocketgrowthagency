#!/usr/bin/env node
// scripts/compare-free-vs-bouncer.mjs
//
// THE SCORECARD for the "can we drop Bouncer?" decision. Every round we run this: it replays our
// FREE layers (isLikelyEmail + disposable + malformed) against every REAL Bouncer verdict we've
// cached (output/bouncer-cache.json) and reports how close the free system is to Bouncer.
//
// The two numbers that matter:
//   • GAP  = addresses Bouncer DROPs (invalid/disposable) that our free layer would KEEP.
//            These are the bounces we still need Bouncer for. Cut Bouncer only when GAP ≈ 0.
//   • FALSE-POSITIVES = addresses our free layer DROPs that Bouncer says are fine (deliverable).
//            These are GOOD leads we'd wrongly kill. Must stay 0.
//
// Usage: node scripts/compare-free-vs-bouncer.mjs [--gap] [--fp]   (--gap/--fp list the addresses)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { isLikelyEmail, isDisposableDomain } = require(path.join(ROOT, 'lib', 'email-validation.cjs'));

const ARGS = process.argv.slice(2);
const cachePath = path.join(ROOT, 'output', 'bouncer-cache.json');
let cache;
try { cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')); }
catch { console.error('No Bouncer cache yet (output/bouncer-cache.json). Run the gate with a Bouncer key first.'); process.exit(1); }

// Our free verdict: 'drop' if any free layer proves it bad, else 'keep'.
function freeVerdict(addr) {
  const domain = String(addr).slice(String(addr).lastIndexOf('@') + 1).toLowerCase();
  if (isDisposableDomain(domain)) return { v: 'drop', why: 'disposable' };
  if (!isLikelyEmail(addr)) return { v: 'drop', why: 'invalid/placeholder/aggregator/malformed' };
  return { v: 'keep', why: '' };
}
// Bouncer's verdict → drop/keep (drop set = definitively undeliverable/unsafe).
function bouncerVerdict(result) {
  return (result === 'invalid' || result === 'disposable') ? 'drop' : 'keep';
}

const rows = Object.entries(cache).map(([addr, c]) => ({ addr, b: bouncerVerdict(c.result), bRaw: c.result, f: freeVerdict(addr) }));
const N = rows.length;

const bothDrop = rows.filter((r) => r.b === 'drop' && r.f.v === 'drop');
const gap = rows.filter((r) => r.b === 'drop' && r.f.v === 'keep');       // Bouncer catches, free misses
const falsePos = rows.filter((r) => r.b === 'keep' && r.f.v === 'drop');  // free kills a Bouncer-good lead
const bothKeep = rows.filter((r) => r.b === 'keep' && r.f.v === 'keep');
const bouncerDrops = bothDrop.length + gap.length;

const agree = bothDrop.length + bothKeep.length;
const pct = (n) => ((n / N) * 100).toFixed(1) + '%';

console.log(`\n=== FREE vs BOUNCER scorecard  (${N} addresses with real Bouncer verdicts) ===\n`);
console.log(`  Agreement:              ${agree}/${N}  (${pct(agree)})`);
console.log(`  Bouncer DROPs total:    ${bouncerDrops}`);
console.log(`    ├─ free ALSO drops:   ${bothDrop.length}   (free replicated Bouncer — for FREE)`);
console.log(`    └─ GAP (free MISSES): ${gap.length}   ${gap.length === 0 ? '✅ free catches ALL Bouncer drops' : '← still need Bouncer for these'}`);
console.log(`  FALSE POSITIVES:        ${falsePos.length}   ${falsePos.length === 0 ? '✅ free never kills a good lead' : '⚠️ free wrongly drops Bouncer-good leads — FIX before trusting free'}`);
console.log(`\n  VERDICT: ${gap.length === 0 && falsePos.length === 0
  ? '✅ Free system MATCHES Bouncer on this sample — safe to stop buying credits once confident across rounds.'
  : `not yet parity — close the GAP (${gap.length}) and FALSE POS (${falsePos.length}) first.`}\n`);

if (ARGS.includes('--gap')) {
  console.log('GAP — Bouncer drops these, free keeps them (the addresses that still justify Bouncer):');
  gap.forEach((r) => console.log(`  ${r.bRaw.padEnd(11)} ${r.addr}`));
}
if (ARGS.includes('--fp')) {
  console.log('FALSE POSITIVES — free drops these but Bouncer says fine (would lose good leads):');
  falsePos.forEach((r) => console.log(`  free=${r.f.why.padEnd(20)} bouncer=${r.bRaw}  ${r.addr}`));
}
if (gap.length && !ARGS.includes('--gap')) console.log('(run with --gap to list the addresses Bouncer still catches that free misses)');
