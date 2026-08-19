// lib/email-validation.test.cjs
// Unit tests for email-validation.cjs. Run: node lib/email-validation.test.cjs

const {
  isLikelyEmail, businessNameTokens, siteHost, emailRank, sanitizeScrapedEmail,
} = require('./email-validation.cjs');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); failed++; }
}
function eq(actual, expected, label = '') {
  if (actual !== expected) throw new Error(`${label} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

console.log('\n=== isLikelyEmail ===');
test('accepts real domain email', () => eq(isLikelyEmail('info@biz.com'), 'info@biz.com'));
test('accepts named local-part', () => eq(isLikelyEmail('edna@californiahitechplumbing.com'), 'edna@californiahitechplumbing.com'));
test('rejects placeholder user@domain.com', () => eq(isLikelyEmail('user@domain.com'), ''));
test('rejects test@test.com', () => eq(isLikelyEmail('test@test.com'), ''));
test('rejects jane.doe@mytechusa.com', () => eq(isLikelyEmail('jane.doe@mytechusa.com'), ''));
test('rejects ccpaprivacy.org domain', () => eq(isLikelyEmail('foo@ccpaprivacy.org'), ''));
test('rejects phone-prefix local part', () => eq(isLikelyEmail('351-0978info@biz.com'), 'info@biz.com'));
test('strips %20 URL-encoded leading space', () => eq(isLikelyEmail('%20office@biz.com'), 'office@biz.com'));
test('rejects malformed TLD .our', () => eq(isLikelyEmail('line@661-257-9200.our'), ''));
test('rejects digit-only domain base', () => eq(isLikelyEmail('foo@123456.com'), ''));
test('rejects empty input', () => eq(isLikelyEmail(''), ''));
test('rejects null', () => eq(isLikelyEmail(null), ''));
test('rejects .png suffix', () => eq(isLikelyEmail('photo@example.png'), ''));
test('rejects aggregator domain yelp.com', () => eq(isLikelyEmail('info@yelp.com'), ''));
test('rejects vendor domain customerstatus.com (Fosdick fulfillment)', () => eq(isLikelyEmail('flawless@customerstatus.com'), ''));
test('rejects vendor domain fosdickcorp.com', () => eq(isLikelyEmail('foo@fosdickcorp.com'), ''));
test('rejects disposable mailinator.com', () => eq(isLikelyEmail('test@mailinator.com'), ''));
test('rejects disposable guerrillamail.com', () => eq(isLikelyEmail('x@guerrillamail.com'), ''));
test('rejects disposable subdomain mail.mailinator.com', () => eq(isLikelyEmail('x@mail.mailinator.com'), ''));
test('rejects double-final-TLD napalawoffice.com.com', () => eq(isLikelyEmail('info@napalawoffice.com.com'), ''));
test('rejects trailing-dot local part', () => eq(isLikelyEmail('stressful.@usjunkyards.com'), ''));
test('rejects double-dot local part', () => eq(isLikelyEmail('foo..bar@biz.com'), ''));
test('keeps legit domain past disposable check', () => eq(isLikelyEmail('info@realplumbing.com'), 'info@realplumbing.com'));
test('auto-learned bad domain gets rejected (feedback loop)', () => {
  const { LEARNED_BAD_DOMAINS } = require('./email-validation.cjs');
  LEARNED_BAD_DOMAINS.add('somelearneddead.com');
  eq(isLikelyEmail('info@somelearneddead.com'), '');
  LEARNED_BAD_DOMAINS.delete('somelearneddead.com');
});

console.log('\n=== businessNameTokens ===');
test('Cool Choice Heating BH → contains [cool, choice]', () => {
  const t = businessNameTokens('Cool Choice Heating & AC Repair Beverly Hills');
  eq(t.includes('cool') && t.includes('choice'), true);
});
test('Hagen Plumbing → contains [hagen]', () => {
  const t = businessNameTokens('Hagen Plumbing & Heating Inc.');
  eq(t.includes('hagen'), true);
});
test('California Hi-Tech Plumbing → [california, hitech]', () => {
  const t = businessNameTokens('California Hi-Tech Plumbing, Corp');
  eq(t.includes('california'), true);
  eq(t.includes('hi'), false); // too short
});

console.log('\n=== emailRank ===');
test('domain-match named local-part = rank 10', () => eq(emailRank('edna@biz.com', 'biz.com'), 10));
test('domain-match generic info@ = rank 11', () => eq(emailRank('info@biz.com', 'biz.com'), 11));
test('off-domain named local = rank 20', () => eq(emailRank('info@other.com', 'biz.com'), 20));
test('free-mailbox = rank 40', () => eq(emailRank('owner@gmail.com', 'biz.com'), 40));
test('off-domain regular = rank 30', () => eq(emailRank('eric@advanced-hvac.com', 'biz.com'), 30));

console.log('\n=== siteHost ===');
test('strips www', () => eq(siteHost('https://www.biz.com/'), 'biz.com'));
test('lowercases', () => eq(siteHost('https://BIZ.COM'), 'biz.com'));
test('empty on invalid', () => eq(siteHost('not-a-url'), ''));

console.log('\n=== sanitizeScrapedEmail ===');
test('strips phone prefix with separator', () => eq(sanitizeScrapedEmail('(310) 555-1234info@biz.com'), 'info@biz.com'));
test('leaves clean email alone', () => eq(sanitizeScrapedEmail('info@biz.com'), 'info@biz.com'));
test('leaves digit-only-prefix alone (no separator)', () => eq(sanitizeScrapedEmail('2024marketing@biz.com'), '2024marketing@biz.com'));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

// ============================================================================================
// 2026-08-19 — junkContactReason: addresses that cannot reach the BUSINESS.
// Each MUST-BLOCK case was observed in a real scrape and cost a full ~6-minute capture.
// The MUST-ALLOW list matters more: a false positive drops a real prospect, which is far worse
// than wasting one capture. Several are deliberately adversarial (consonant brands, law-firm
// domains, hex-ish but short local parts).
// ============================================================================================
{
  const { junkContactReason } = require('./email-validation.cjs');
  const BLOCK = [
    ['605a7baede844d278b89dc95ae0a9123@sentry-next.wixpress.com', 'Sentry DSN in a Wix bundle'],
    ['abc123@sentry.io', 'sentry host'],
    ['x@datadoghq.com', 'telemetry host'],
    ['deadbeefcafebabe1234@example-corp.com', 'hex local part'],
    ['550e8400-e29b-41d4-a716-446655440000@acme.com', 'uuid local part'],
    ['contact@cpadirectory.com', 'directory'],
    ['support@corp.lawyer.com', 'directory'],
    ['info@avvo.com', 'directory'],
  ];
  const ALLOW = [
    'vicki@magasinn.com', 'davidostrove@gmail.com', 'lavena@mathranilaw.com',
    'info@chancocpa.com', 'basil@agroaccounting.com', 'bill@billdove.com',
    'ernest@efhcpa.com', 'jmorey@cpamorey.com', 'chartzheim@mlhcpas.com',
    'grendon@lkco.com', 'law@vsbllp.com', 'info@jjsllp.com', 'x@mlhcpas.com', 'taxpros@morerefundtax.com', 'gloria@gvtaxaccounting.com',
    'turbotax@intuit.com',            // corporate parent, but a REAL reachable domain
    'info@nyt.com', 'help@cvs.com', 'x@hbo.com', 'a@kfc.com',  // short consonant brands
    'info@smithlaw.com', 'clerk@lawoffices.com',               // *law* domains must survive
    'abc123@realfirm.com',            // hex-ish but only 6 chars — under the 16 threshold
    'deadbeef@realfirm.com',          // 8 hex chars — still under the threshold
  ];
  let bad = 0;
  for (const [e, why] of BLOCK) {
    const r = junkContactReason(e);
    if (!r) { console.error(`  ✗ FAILED TO BLOCK (${why}): ${e}`); bad++; }
  }
  for (const e of ALLOW) {
    const r = junkContactReason(e);
    if (r) { console.error(`  ✗ FALSE POSITIVE — would drop a real lead: ${e} (${r})`); bad++; }
  }
  if (bad) { console.error(`\njunkContactReason: ${bad} failure(s)`); process.exitCode = 1; }
  else console.log(`  ✓ junkContactReason: ${BLOCK.length} blocked, ${ALLOW.length} allowed, 0 false positives`);
}
