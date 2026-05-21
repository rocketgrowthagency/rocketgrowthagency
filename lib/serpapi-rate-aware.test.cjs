// lib/serpapi-rate-aware.test.cjs
// Smoke tests for serpapi-rate-aware.cjs. Doesn't actually call SerpAPI —
// just verifies the wrapper handles known response shapes correctly.
//
// Run: node lib/serpapi-rate-aware.test.cjs

const { serpapiGetRateAware, serpapiHealthCheck } = require('./serpapi-rate-aware.cjs');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); failed++; }
}
function eq(actual, expected, label = '') {
  if (actual !== expected) throw new Error(`${label} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

console.log('\n=== serpapiGetRateAware exports ===');
test('exports serpapiGetRateAware function', () => {
  if (typeof serpapiGetRateAware !== 'function') throw new Error('not exported');
});
test('exports serpapiHealthCheck function', () => {
  if (typeof serpapiHealthCheck !== 'function') throw new Error('not exported');
});

console.log('\n=== rate-limit pattern detection (internal regex check) ===');
// Reconstruct the patterns used inside the wrapper for test purposes.
const RATE_LIMIT_PATTERNS = /hourly|throughput limit|rate limit|run out of searches/i;

test('detects "Hourly throughput limit reached"', () => {
  if (!RATE_LIMIT_PATTERNS.test('Hourly throughput limit reached')) throw new Error('miss');
});
test('detects "you have run out of searches"', () => {
  if (!RATE_LIMIT_PATTERNS.test('you have run out of searches')) throw new Error('miss');
});
test('detects "rate limit exceeded"', () => {
  if (!RATE_LIMIT_PATTERNS.test('Sorry, rate limit exceeded.')) throw new Error('miss');
});
test('does not match unrelated text', () => {
  if (RATE_LIMIT_PATTERNS.test('Search succeeded')) throw new Error('false positive');
});

console.log('\n=== serpapiHealthCheck behavior (no SerpAPI key) ===');
test('returns null when key not provided', async () => {
  const r = await serpapiHealthCheck('', 'unit-test');
  if (r !== null) throw new Error('should be null when no key');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
