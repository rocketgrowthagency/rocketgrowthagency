// lib/serpapi-rate-aware.cjs
// SerpAPI GET wrapper with auto-rate-limit handling. Used by every SerpAPI
// consumer in the pipeline so the 200/hr cap is handled uniformly:
//
//   - Detects HTTP 429 OR error string ("hourly limit", "throughput limit", etc.)
//   - Logs the resume time + sleeps 1hr + 1min buffer
//   - Auto-retries the same URL after wake
//   - Other errors return null (skip cleanly)
//
// Locked 2026-05-20 EOD after Chris hit the rate limit mid-batch + asked
// for system-wide auto-pacing. Memory: reference_serpapi_rate_limit.md.

const axios = require('axios');

// Hourly rate limit — retry after sleep. 1hr + 1min buffer.
const HOURLY_LIMIT_PATTERNS = /hourly|throughput limit|rate limit/i;
// Monthly quota exhaustion — BAIL, don't retry forever (no refresh until
// next billing cycle). Locked 2026-06-02 after a single overnight run
// burned 10 hours in a sleep-retry loop after the monthly quota was hit.
const MONTHLY_EXHAUSTED_PATTERNS = /run out of searches|searches.*exhausted|monthly.*limit|account.*expired|plan.*limit/i;

let monthlyExhaustedFlag = false; // process-wide flag — short-circuits after first detection

async function serpapiGetRateAware(url, opts = {}) {
  if (monthlyExhaustedFlag) return null; // already known empty — fail fast
  const timeout = opts.timeout || 15000;
  const sleepMs = opts.sleepMs || 60 * 60 * 1000 + 60 * 1000; // 1hr + 1min buffer
  const maxRetries = Number(opts.maxRetries || 1); // default: ONE hourly retry, then give up
  let retries = 0;
  while (true) {
    try {
      const res = await axios.get(url, { timeout, validateStatus: () => true });
      const errMsg = res.data?.error || '';
      // Monthly quota exhaustion: BAIL immediately + set the process flag.
      if (MONTHLY_EXHAUSTED_PATTERNS.test(errMsg)) {
        if (!monthlyExhaustedFlag) {
          console.error(`\n⛔ [serpapi] MONTHLY QUOTA EXHAUSTED — error="${errMsg.slice(0, 200)}". No more SerpAPI calls until billing cycle resets. All SerpAPI consumers will return null until process restart.\n`);
        }
        monthlyExhaustedFlag = true;
        return null;
      }
      const isHourlyRateLimit = res.status === 429 || HOURLY_LIMIT_PATTERNS.test(errMsg);
      if (isHourlyRateLimit) {
        if (retries >= maxRetries) {
          console.warn(`[serpapi] hourly rate limit + maxRetries=${maxRetries} exhausted — giving up on this URL`);
          return null;
        }
        retries += 1;
        const resumeAt = new Date(Date.now() + sleepMs);
        console.log(`\n⏸  [serpapi] hourly rate limit hit (retry ${retries}/${maxRetries}). Sleeping ${(sleepMs / 60000).toFixed(0)} min — resuming at ${resumeAt.toLocaleTimeString()}\n`);
        await new Promise((r) => setTimeout(r, sleepMs));
        continue;
      }
      if (res.status >= 400) return null;
      return res;
    } catch (err) {
      // Network error — skip this call (caller can retry next URL)
      return null;
    }
  }
}

// Startup health check — ping SerpAPI account endpoint to confirm key works
// + log searches remaining. Should be called once at the start of any script
// that uses SerpAPI heavily. If account is exhausted, scripts can bail early
// rather than silently degrade to DDG/Bing fallbacks (which are gated).
async function serpapiHealthCheck(apiKey, scriptName = 'unknown') {
  if (!apiKey) {
    console.warn(`[serpapi-health] ${scriptName}: SERPAPI_KEY not set — search-fallback paths inactive`);
    return null;
  }
  try {
    const res = await axios.get(`https://serpapi.com/account?api_key=${encodeURIComponent(apiKey)}`, {
      timeout: 10000,
      validateStatus: () => true,
    });
    if (res.status >= 400) {
      console.warn(`[serpapi-health] ${scriptName}: account check returned ${res.status} — key may be invalid`);
      return null;
    }
    const acct = res.data || {};
    const remaining = acct.total_searches_left ?? acct.searches_per_month ?? '?';
    const used = acct.this_month_usage ?? '?';
    const plan = acct.plan_name || acct.plan_id || '?';
    console.log(`[serpapi-health] ${scriptName}: plan=${plan} | used this month=${used} | remaining=${remaining}`);
    return acct;
  } catch (err) {
    console.warn(`[serpapi-health] ${scriptName}: health check failed (${err.message})`);
    return null;
  }
}

module.exports = { serpapiGetRateAware, serpapiHealthCheck };
