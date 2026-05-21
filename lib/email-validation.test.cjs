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
