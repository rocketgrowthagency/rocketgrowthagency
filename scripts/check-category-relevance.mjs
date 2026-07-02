#!/usr/bin/env node
/**
 * check-category-relevance.mjs — REGRESSION GUARD for the vertical-relevance gate.
 *
 * The scraper must only build videos for businesses whose Google category actually belongs to
 * the searched vertical. On 2026-07-02 a "Foundation repair" run produced (and EMAILED) pitch
 * videos for a Mosque, a Science museum, a Pet rescue, a Mental-health "foundation" and a
 * cultural-center "foundation" — because the quality filter had no category-vs-vertical check.
 * This guard locks in the fix: known garbage MUST drop, known real prospects MUST pass.
 *
 * Runs pre-flight in overnight-pipeline.sh. Exit 1 (fail the run) on any regression.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { categoryMatchesVertical, shouldFilterLead } = require(path.join(ROOT, 'step-1-maps-scraper.cjs'));

// [category, searchTerm, expectPass, businessName?] — expectPass=true = REAL prospect (keep), false = garbage (drop).
// businessName matters for GENERIC categories (name-fallback) and for the charity-name trap.
const CASES = [
  // ---- generic-category rescue via NAME (must KEEP — these are real trade leads) ----
  ['Repair service', 'Garage door repair in Culver City, CA', true, 'Pros Garage Door Repair'],
  ['Contractor', 'Garage door repair in Culver City, CA', true, 'Sun Garage Door Repair'],
  ['Repair service', 'Garage door repair in Culver City, CA', true, 'Garage Door Repair Beverly Hills'],
  // ---- charity-name trap: name has "foundation" but category proves it's NOT foundation repair (must DROP) ----
  ['Mental health service', 'Foundation repair in Culver City, CA', false, 'Kohan Foundation Counseling Center'],
  ['Cultural center', 'Foundation repair in Culver City, CA', false, 'IMAN Foundation'],
  // ---- generic category with NO vertical signal in name (must DROP) ----
  ['General contractor', 'Landscapers in Culver City, CA', false, 'So Cal KBLA Inc'],
  // ---- the exact 2026-07-02 garbage that must DROP ----
  ['Mosque', 'Foundation repair in Culver City, CA', false],
  ['Animal rescue service', 'Foundation repair in Culver City, CA', false],
  ['Science museum', 'Foundation repair in Culver City, CA', false],
  ['Mental health service', 'Foundation repair in Culver City, CA', false],
  ['Cultural center', 'Foundation repair in Culver City, CA', false],
  ['Non-profit organization', 'Foundation repair in Culver City, CA', false],
  ['Water damage restoration service', 'Foundation repair in Culver City, CA', false],
  ['Electrician', 'Foundation repair in Culver City, CA', false],
  // ---- real Foundation-repair prospects that must PASS ----
  ['Construction company', 'Foundation repair in Culver City, CA', true],
  ['General contractor', 'Foundation repair in Culver City, CA', true],
  ['Structural engineer', 'Foundation repair in Culver City, CA', true],
  ['Waterproofing service', 'Foundation repair in Culver City, CA', true],
  ['Concrete contractor', 'Foundation repair in Culver City, CA', true],
  // ---- vertical-awareness: same category is garbage for one vertical, valid for its own ----
  ['Mental health service', 'Mental health therapists in Culver City, CA', true],
  ['Electrician', 'Electricians in Culver City, CA', true],
  ['Animal hospital', 'Veterinarians in Culver City, CA', true],
  ['Church', 'Roofers in Culver City, CA', false],
  // ---- cross-vertical sanity for the common trades ----
  ['Plumber', 'Plumbers in Culver City, CA', true],
  ['HVAC contractor', 'HVAC in Culver City, CA', true],
  ['Roofing contractor', 'Roofers in Culver City, CA', true],
  ['Tree service', 'Tree service in Culver City, CA', true],
  ['Landscaper', 'Landscapers in Culver City, CA', true],
  ['Dentist', 'Cosmetic dentists in Culver City, CA', true],
  ['Personal injury attorney', 'Personal injury lawyers in Culver City, CA', true],
  ['Hair salon', 'Hair salons in Culver City, CA', true],
  // garbage cross-checks
  ['Grocery store', 'Plumbers in Culver City, CA', false],
  ['Real estate agency', 'Roofers in Culver City, CA', false],
];

let failed = 0;
for (const [cat, term, expectPass, bizName] of CASES) {
  const name = bizName || 'Test Business';
  const pass = categoryMatchesVertical(cat, term, name);
  if (pass !== expectPass) {
    failed++;
    console.log(`  ✗ FAIL: "${cat}" / "${name}" under "${term.split(' in ')[0]}" → matched=${pass}, expected ${expectPass}`);
  } else {
    console.log(`  ✓ "${cat}"${bizName ? ` / "${bizName}"` : ''} under "${term.split(' in ')[0]}" → ${pass ? 'keep' : 'drop'}`);
  }
}

if (failed) {
  console.error(`\n❌ category-relevance regression: ${failed}/${CASES.length} case(s) failed. The vertical-relevance gate is broken — off-vertical businesses could get videos. Aborting.`);
  process.exit(1);
}
console.log(`\n✅ category-relevance gate: all ${CASES.length} cases passed (garbage drops, real prospects pass, vertical-aware).`);
