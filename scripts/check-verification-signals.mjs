#!/usr/bin/env node
/**
 * check-verification-signals.mjs — the 6/6 gate's scoring rule, tested in BOTH directions.
 *
 * Tests the module step-6 actually imports, not a copy of it. The 2026-08-17 change here is narrow and
 * easy to get wrong in the dangerous direction: "reviews" now means READABLE rather than NON-ZERO, so a
 * verified-zero-review business scores the signal — but a business whose review count simply could not
 * be read must still fail, or the gate would start shipping unverifiable claims.
 *
 * Usage: node scripts/check-verification-signals.mjs     Exit 0 = correct, 1 = a case regressed.
 */
import { obtainableSignals, scoreSignals } from './lib/verification-signals.mjs';

const base = {
  website: { websiteAuditVerified: true },
  mobile: { mobileAuditVerified: true },
  gbp: { hoursVerified: true, categoriesCountVerified: true, businessStatus: 'OPERATIONAL', reviewCount: 12 },
};
const withGbp = (over) => ({ ...base, gbp: { ...base.gbp, ...over } });

const CASES = [
  // ---- the reviews signal, both directions ----
  { name: 'a normal business with reviews scores the signal',
    audit: withGbp({ reviewCount: 12 }), expect: true },
  { name: 'reviewCount 0 read from the widget is a READ, so it scores',
    audit: withGbp({ reviewCount: 0 }), expect: true },
  { name: 'VERIFIED zero reviews (no widget + positive empty state) scores',
    audit: withGbp({ reviewCount: null, reviewAbsenceVerified: true }), expect: true },
  { name: '🔴 an UNREADABLE review count must NOT score — this is the whole point of the gate',
    audit: withGbp({ reviewCount: null, reviewAbsenceVerified: false }), expect: false },
  { name: '🔴 a missing reviewAbsenceVerified field must NOT score',
    audit: withGbp({ reviewCount: null }), expect: false },
  { name: '🔴 a non-boolean truthy reviewAbsenceVerified must NOT score (strict === true)',
    audit: withGbp({ reviewCount: null, reviewAbsenceVerified: 'yes' }), expect: false },
  { name: 'NaN is not a readable count',
    audit: withGbp({ reviewCount: NaN }), expect: false },
];

let failed = 0;
for (const c of CASES) {
  const got = obtainableSignals(c.audit).reviews;
  const ok = got === c.expect;
  if (!ok) failed++;
  console.log(`  ${ok ? '✓' : '✗'} ${c.name}  (expected=${c.expect} actual=${got})`);
}

// ---- the score as a whole ----
const SCORES = [
  { name: 'all six observable → 6/6, fully verified',
    audit: base, count: 6, full: true },
  { name: 'verified-zero-review business still reaches 6/6 (the 12 leads lost on 08-14/15/16)',
    audit: withGbp({ reviewCount: null, reviewAbsenceVerified: true }), count: 6, full: true },
  { name: '🔴 unreadable reviews → 5/6, still blocked',
    audit: withGbp({ reviewCount: null }), count: 5, full: false },
  { name: '🔴 a dead website still blocks regardless of reviews',
    audit: { ...withGbp({ reviewCount: 3 }), website: { websiteAuditVerified: false } }, count: 5, full: false },
  { name: 'CLOSED_PERMANENTLY is not operational',
    audit: withGbp({ businessStatus: 'CLOSED_PERMANENTLY' }), count: 5, full: false },
];
for (const c of SCORES) {
  const r = scoreSignals(c.audit);
  const ok = r.verifiedCount === c.count && r.fullyVerified === c.full;
  if (!ok) failed++;
  console.log(`  ${ok ? '✓' : '✗'} ${c.name}  (expected=${c.count}/6 full=${c.full} actual=${r.verifiedCount}/6 full=${r.fullyVerified})`);
}

console.log(failed
  ? `\n❌ ${failed} verification-signal case(s) regressed.`
  : `\n✅ ${CASES.length + SCORES.length}/${CASES.length + SCORES.length} verification-signal cases correct.`);
process.exit(failed ? 1 : 0);
