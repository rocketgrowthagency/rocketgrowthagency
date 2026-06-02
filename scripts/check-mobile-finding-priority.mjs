#!/usr/bin/env node
// scripts/check-mobile-finding-priority.mjs
//
// LOCK: mobile audit findings MUST prioritize local-SEO conversion levers
// over tech-spec findings. Locked 2026-06-02 after Chris caught the audit
// voiceover leading with "your site takes X seconds to load" / "page weight"
// when the value-prop is local SEO (Maps clicks → phone calls), not website
// performance.
//
// This pre-flight regression scans step-6-voiceover.mjs for the locked score
// values on each finding key. If anyone flips a tech-spec finding back to a
// low score (or demotes a local-SEO finding to a high score), this test fails
// before the overnight run kicks off.
//
// Why static-scan instead of running scoreMobileFindings: the function uses
// dynamic gating logic that would require mocking the audit shape across many
// cases. A score-table audit catches the structural regression directly.
//
// Memory: feedback_audit_focus_local_seo_over_tech_specs.md.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.join(__dirname, '..', 'step-6-voiceover.mjs');
const src = fs.readFileSync(SOURCE, 'utf8');

// LOCKED priority bands. Mobile findings:
//   P1-P10  = local-SEO conversion levers (MUST stay here)
//   P25-P28 = tech-spec findings (MUST stay here, NEVER promoted)
const LOCKED = {
  // Local-SEO conversion levers — score must be <= 10
  stickyCta:           { maxScore: 10, kind: 'local-seo' },
  c2cFold:             { maxScore: 10, kind: 'local-seo' },
  c2cBuriedInChatWidget: { maxScore: 10, kind: 'local-seo' },
  clickToText:         { maxScore: 10, kind: 'local-seo' },
  phoneNotVisible:     { maxScore: 10, kind: 'local-seo' },
  noSocialProof:       { maxScore: 10, kind: 'local-seo' },
  tapTarget:           { maxScore: 10, kind: 'local-seo' },
  viewport:            { maxScore: 10, kind: 'local-seo' },
  // Tech-spec findings — score must be >= 25 (demoted to tail of priority)
  mobileLoad:          { minScore: 25, kind: 'tech-spec' },
  pageWeight:          { minScore: 25, kind: 'tech-spec' },
  renderBlock:         { minScore: 25, kind: 'tech-spec' },
  lazyImg:             { minScore: 25, kind: 'tech-spec' },
};

let failures = 0;

console.log('=== Mobile finding priority lock ===\n');

// Match patterns like:  key: 'stickyCta', score: 1,
// (the score may be a decimal so allow 1, 1.5, etc.)
function findScore(key) {
  const re = new RegExp(`key:\\s*'${key}',\\s*score:\\s*([\\d.]+)`, 'g');
  const matches = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    matches.push(parseFloat(m[1]));
  }
  return matches;
}

for (const [key, rule] of Object.entries(LOCKED)) {
  const scores = findScore(key);
  if (scores.length === 0) {
    failures++;
    console.error(`  ✗ ${key} (${rule.kind}): NOT FOUND in step-6-voiceover.mjs — finding removed?`);
    continue;
  }
  for (const score of scores) {
    if (rule.maxScore != null && score > rule.maxScore) {
      failures++;
      console.error(`  ✗ ${key} (${rule.kind}): score ${score} > maxScore ${rule.maxScore} — local-SEO finding was demoted`);
    } else if (rule.minScore != null && score < rule.minScore) {
      failures++;
      console.error(`  ✗ ${key} (${rule.kind}): score ${score} < minScore ${rule.minScore} — tech-spec finding was promoted`);
    } else {
      console.log(`  ✓ ${key} (${rule.kind}): score ${score}`);
    }
  }
}

console.log('');
if (failures > 0) {
  console.error(`❌ ${failures} mobile finding(s) violated the local-SEO priority lock`);
  console.error('   See feedback_audit_focus_local_seo_over_tech_specs.md for the rule.');
  process.exit(1);
}
console.log('✅ All mobile findings respect the local-SEO priority lock');
