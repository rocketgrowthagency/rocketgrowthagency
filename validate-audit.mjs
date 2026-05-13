// validate-audit.mjs — self-diagnosis pass for step-2.5 audit output.
//
// Loads the captured audit-findings.json for a slug + the verified baseline
// for that slug from data/audit-baseline-<slug>.json. Compares every field.
// Any deviation triggers a warning and the corresponding voiceover finding
// is added to `_validation.disabledFindings` — step-6 reads that list and
// skips those findings so we never ship a false claim.
//
// Usage:
//   node validate-audit.mjs --slug=express-garage-door-service --findings=output/Step\ 2.5\ \(Audit\)/express-garage-door-single-\[step-2\]/audit-findings.json
//
// Or as a library:
//   import { validateAudit } from './validate-audit.mjs';
//   const result = validateAudit(findings, baseline);

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Map of audit-finding keys → voiceover finding keys that depend on them.
// When a captured field deviates from baseline, the corresponding script
// findings are auto-disabled so we don't claim things we can't trust.
const FIELD_TO_FINDING_KEYS = {
  // GBP
  'gbp.reviewCount': ['reviewCount'],
  'gbp.daysSinceLastReview': ['reviewVelocity', 'reviewVelocityRecent'],
  'gbp.reviewsLast30Days': ['reviewVelocityRecent'],
  'gbp.ownerResponseCount': ['ownerResponse'],
  'gbp.hasBusinessHours': ['businessHours'],
  'gbp.primaryCategory': ['categoryMismatch'],
  'gbp.primaryCategoryMatchesSearch': ['categoryMismatch'],
  'gbp.description': ['gbpDescription'],
  'gbp.descriptionLength': ['gbpDescription'],
  'gbp.descriptionVerified': ['gbpDescription'],
  'gbp.hasPosts': ['gbpPosts'],
  'gbp.lastPostDaysAgo': ['gbpPosts'],
  'gbp.postsVerified': ['gbpPosts'],
  // Website
  'website.hasLocalBusinessSchema': ['schema'],
  'website.h1IncludesCategory': ['h1', 'h1City'],
  'website.h1IncludesCity': ['h1', 'h1City'],
  'website.h1Count': ['multiH1'],
  'website.hasMetaDescription': ['metaDesc'],
  'website.isHttps': ['https'],
  'website.pageLoadSeconds': ['pageLoad'],
  'website.renderBlockingHeadResources': ['renderBlock'],
  'website.websitePhoneMatchesGbp': ['nap'],
  'website.napAboveFold': ['napAboveFold'],
  'website.titleIncludesCategory': ['title', 'titleCategory'],
  'website.titleIncludesCity': ['title', 'titleCity'],
  'website.canonicalMatches': ['canonical'],
  'website.serviceAreaPagesCount': ['serviceAreaPages'],
  'website.primaryCtaText': ['ctaText'],
  'website.hasReviewsOnPage': ['noReviews'],
  'website.hasServiceAreaListed': ['noServiceArea'],
  // Mobile
  'mobile.pageLoadSeconds': ['mobileLoad'],
  'mobile.hasViewportMeta': ['viewport'],
  'mobile.clickToCallAboveFold': ['c2cFold'],
  'mobile.primaryCtaTapTargetPx': ['tapTarget'],
  'mobile.pageWeightKb': ['pageWeight'],
  'mobile.h1Count': ['multiH1'],
  'mobile.renderBlockingHeadResources': ['renderBlock'],
  'mobile.hasStickyCta': ['stickyCta'],
  'mobile.hasClickToText': ['clickToText'],
  'mobile.primaryCtaText': ['ctaText'],
  'mobile.phoneVisibleAboveFold': ['phoneNotVisible'],
  'mobile.socialProofAboveFold': ['noSocialProof'],
};

function checkField(captured, expected, path) {
  // expected can be: scalar (===) | { min, max } (range) | { expectedNonEmpty, containsFragment, minLength }
  if (expected === null) return captured === null ? null : `expected null, got ${JSON.stringify(captured)}`;
  if (typeof expected === 'boolean') return captured === expected ? null : `expected ${expected}, got ${captured}`;
  if (typeof expected === 'string') return captured === expected ? null : `expected "${expected}", got ${JSON.stringify(captured)}`;
  if (typeof expected === 'number') return captured === expected ? null : `expected ${expected}, got ${captured}`;
  if (typeof expected === 'object') {
    if ('min' in expected || 'max' in expected) {
      if (captured === null || captured === undefined) return `expected range ${expected.min}..${expected.max}, got null`;
      if (typeof captured !== 'number') return `expected numeric in range ${expected.min}..${expected.max}, got ${typeof captured}`;
      if (expected.min !== undefined && captured < expected.min) return `${captured} below min ${expected.min}`;
      if (expected.max !== undefined && captured > expected.max) return `${captured} above max ${expected.max}`;
      return null;
    }
    if (expected.expectedNonEmpty) {
      if (!captured || (typeof captured === 'string' && captured.length === 0)) return `expected non-empty, got empty`;
      if (expected.minLength && captured.length < expected.minLength) return `length ${captured.length} below minLength ${expected.minLength}`;
      if (expected.containsFragment && !String(captured).toLowerCase().includes(expected.containsFragment.toLowerCase())) {
        return `expected to contain "${expected.containsFragment}", got "${String(captured).slice(0, 80)}..."`;
      }
      return null;
    }
  }
  return null;
}

function pickByPath(obj, dottedPath) {
  return dottedPath.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

export function validateAudit(findings, baseline) {
  const failures = [];
  const passes = [];
  for (const [section, fields] of Object.entries(baseline.expected || {})) {
    for (const [field, expected] of Object.entries(fields)) {
      const dotPath = `${section}.${field}`;
      const captured = pickByPath(findings, dotPath);
      const result = checkField(captured, expected, dotPath);
      if (result) {
        failures.push({ path: dotPath, captured, expected, reason: result });
      } else {
        passes.push({ path: dotPath, captured });
      }
    }
  }
  // Collect finding keys to auto-disable
  const disabledFindings = new Set();
  for (const f of failures) {
    const findingKeys = FIELD_TO_FINDING_KEYS[f.path] || [];
    for (const k of findingKeys) disabledFindings.add(k);
  }
  return {
    passed: failures.length === 0,
    passCount: passes.length,
    failCount: failures.length,
    failures,
    disabledFindings: Array.from(disabledFindings),
  };
}

function findBaselineForSlug(slug) {
  const candidate = path.join(__dirname, 'data', `audit-baseline-${slug}.json`);
  if (fs.existsSync(candidate)) return candidate;
  return null;
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => {
    const [k, ...rest] = a.replace(/^--/, '').split('=');
    return [k, rest.join('=') || true];
  }));
  if (!args.slug || !args.findings) {
    console.error('Usage: node validate-audit.mjs --slug=<slug> --findings=<path-to-audit-findings.json>');
    process.exit(2);
  }
  const baselinePath = findBaselineForSlug(args.slug);
  if (!baselinePath) {
    console.log(`[validate] No baseline for slug "${args.slug}" — skipping validation`);
    process.exit(0);
  }
  const findingsBlob = JSON.parse(fs.readFileSync(args.findings, 'utf8'));
  const findings = findingsBlob[args.slug];
  if (!findings) {
    console.error(`[validate] Slug "${args.slug}" not found in findings file`);
    process.exit(2);
  }
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  const result = validateAudit(findings, baseline);

  console.log(`\n[validate] Baseline check for ${args.slug}: ${result.passed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`[validate] ${result.passCount} field(s) match baseline | ${result.failCount} deviation(s)`);
  if (result.failures.length) {
    console.log('[validate] Deviations:');
    for (const f of result.failures) {
      console.log(`   • ${f.path}: ${f.reason}`);
    }
  }
  if (result.disabledFindings.length) {
    console.log(`[validate] Auto-disabled voiceover findings: ${result.disabledFindings.join(', ')}`);
  }

  // Write _validation block into the findings file so step-6 can read it
  findingsBlob[args.slug]._validation = result;
  fs.writeFileSync(args.findings, JSON.stringify(findingsBlob, null, 2));
  console.log(`[validate] Wrote _validation block to ${args.findings}`);

  process.exit(result.passed ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('validate-audit.mjs')) {
  main();
}
