#!/usr/bin/env node
/**
 * check-verification-gate.mjs — REGRESSION GUARD for the hard 6/6 verification gate.
 *
 * Chris (2026-07-02): ONLY 6/6 videos may complete + send; below 6/6 → flagged for redo.
 * The 6 signals MUST be the 6 we can actually verify (website, mobile, hours, categories,
 * reviews, operational) — NOT the Google-blocked ones (posts/description/social), which
 * CAPTCHA 100% of the time and made 6/6 impossible for every lead. This guard fails the run
 * if step-6's scoring regresses (counts a blocked signal, or the exit-3 gate disappears).
 *
 * Runs pre-flight in overnight-pipeline.sh. Exit 1 on regression.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'step-6-voiceover.mjs'), 'utf8');

const errors = [];

// 1) The SIGNALS array must be the 6 obtainable signals.
const m = src.match(/const SIGNALS = \[([^\]]+)\]/);
if (!m) {
  errors.push('SIGNALS array not found in step-6 (verification scoring missing?)');
} else {
  const body = m[1];
  const required = ['obtainable.website', 'obtainable.mobile', 'obtainable.hours', 'obtainable.categories', 'obtainable.reviews', 'obtainable.operational'];
  for (const r of required) if (!body.includes(r)) errors.push(`SIGNALS missing required signal: ${r}`);
  // Must NOT count the Google-blocked signals in the score.
  for (const bad of ['postsVerified', 'descriptionVerified', 'socialProfilesVerified', 'gbpSocialProfilesVerified']) {
    if (body.includes(bad)) errors.push(`SIGNALS counts a Google-BLOCKED signal (${bad}) — 6/6 becomes impossible. Remove it.`);
  }
  const count = (body.match(/obtainable\./g) || []).length;
  if (count !== 6) errors.push(`SIGNALS has ${count} entries, expected exactly 6`);
}

// 2) The hard gate must exist: below VERIFICATION_MIN → process.exit(3).
if (!/VERIFICATION_MIN/.test(src)) errors.push('VERIFICATION_MIN gate constant missing');
if (!/process\.exit\(3\)/.test(src)) errors.push('gate exit code 3 (verification-flag) missing — pipeline would deploy sub-6/6 videos');
if (!/verifiedCount < VERIFICATION_MIN/.test(src)) errors.push('the `verifiedCount < VERIFICATION_MIN` gate condition is missing');

// 3) The pipeline must read exit 3 and skip deploy.
const pipe = fs.readFileSync(path.join(ROOT, 'scripts', 'overnight-pipeline.sh'), 'utf8');
if (!/PIPESTATUS\[0\]. = .3./.test(pipe) && !/PIPESTATUS\[0\]\}" = "3"/.test(pipe)) {
  errors.push('overnight-pipeline.sh does not check step-6 exit 3 (PIPESTATUS) — flagged videos would still deploy');
}

if (errors.length) {
  console.error('❌ verification-gate regression:');
  errors.forEach((e) => console.error('   - ' + e));
  process.exit(1);
}
console.log('✅ verification-gate: 6 obtainable signals counted, Google-blocked ones excluded, exit-3 gate + pipeline check present.');
