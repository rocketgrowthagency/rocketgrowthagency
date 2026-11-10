// lib/serpapi-rate-aware.cjs
// SerpAPI GET wrapper: the ONE door every scraper-repo search goes through. It
//   1. METERS every call to output/serpapi-ledger/YYYY-MM.jsonl (time, consumer, kind, lead/place id, outcome),
//   2. refuses to spend below the client-work RESERVE (250) - a distinct "budget" result, never "no data",
//   3. detects HTTP 429 / hourly limits and sleeps + retries once (locked 2026-05-20, 200/hr cap),
//   4. bails on a monthly quota exhaustion for the rest of the process (locked 2026-06-02).
//
// TWO ENTRY POINTS
//   serpapiRequest(url, { consumer, ref })  -> { res, stop }   stop is null | 'budget' | 'quota' | 'rate-limit' | 'error'
//        Use this when "I could not look" must be told apart from "I looked and found nothing" (step 2's email search).
//   serpapiGetRateAware(url, { consumer, ref }) -> res | null   the old contract, kept for callers that only need the data.
//
// 2026-11-10: SerpAPI ran dry on Nov 7 with no meter and null-on-429 was read as "no email found". Memory: project_serpapi_budget.md

const axios = require('axios');
const budget = require('./serpapi-budget.cjs');

// Hourly rate limit - retry after sleep. 1hr + 1min buffer.
const HOURLY_LIMIT_PATTERNS = /hourly|throughput limit|rate limit/i;
// Monthly quota exhaustion - BAIL, don't retry forever (no refresh until the next billing cycle).
const MONTHLY_EXHAUSTED_PATTERNS = /run out of searches|searches.*exhausted|monthly.*limit|account.*expired|plan.*limit/i;

let monthlyExhaustedFlag = false; // process-wide flag - short-circuits after first detection
function _resetForTests() { monthlyExhaustedFlag = false; }

function _log(consumer, url, ref, outcome, extra) {
  budget.appendLedger({
    consumer: consumer || 'unknown',
    kind: budget.kindOf(url),
    ref: ref ? String(ref).slice(0, 120) : '',
    outcome,
    ...extra,
  });
}

async function serpapiRequest(url, opts = {}) {
  const consumer = opts.consumer || 'unknown';
  const ref = opts.ref || '';
  if (monthlyExhaustedFlag) { _log(consumer, url, ref, 'stop-quota', { counted: false }); return { res: null, stop: 'quota' }; }
  // The reserve is for paying-client work. A bypass (MIN_SERPAPI_REMAINING=0 style) is not offered here on purpose.
  const b = budget.checkBudget({ clientWork: !!opts.clientWork });
  if (!b.ok) {
    _log(consumer, url, ref, 'stop-budget', { counted: false, remaining: b.remaining, reserve: b.reserve });
    return { res: null, stop: 'budget' };
  }
  const http = opts.http || axios;
  const timeout = opts.timeout || 15000;
  const sleepMs = opts.sleepMs !== undefined ? opts.sleepMs : 60 * 60 * 1000 + 60 * 1000;
  const maxRetries = Number(opts.maxRetries || 1); // default: ONE hourly retry, then give up
  let retries = 0;
  while (true) {
    try {
      const res = await http.get(url, { timeout, validateStatus: () => true });
      const errMsg = (res && res.data && res.data.error) || '';
      if (MONTHLY_EXHAUSTED_PATTERNS.test(errMsg)) {
        if (!monthlyExhaustedFlag) {
          console.error(`\n[serpapi] MONTHLY QUOTA EXHAUSTED - error="${String(errMsg).slice(0, 200)}". No more SerpAPI calls until the billing cycle resets. Leads that needed a search are marked NOT SEARCHED (never "no email").\n`);
        }
        monthlyExhaustedFlag = true;
        _log(consumer, url, ref, 'stop-quota', { counted: true, http: res.status });
        return { res: null, stop: 'quota' };
      }
      const isHourlyRateLimit = res.status === 429 || HOURLY_LIMIT_PATTERNS.test(errMsg);
      if (isHourlyRateLimit) {
        _log(consumer, url, ref, 'rate-limited', { counted: true, http: res.status });
        if (retries >= maxRetries) {
          console.warn(`[serpapi] hourly rate limit + maxRetries=${maxRetries} exhausted - giving up on this URL`);
          return { res: null, stop: 'rate-limit' };
        }
        retries += 1;
        const resumeAt = new Date(Date.now() + sleepMs);
        console.log(`\n[serpapi] hourly rate limit hit (retry ${retries}/${maxRetries}). Sleeping ${(sleepMs / 60000).toFixed(0)} min - resuming at ${resumeAt.toLocaleTimeString()}\n`);
        await new Promise((r) => setTimeout(r, sleepMs));
        continue;
      }
      if (res.status >= 400) { _log(consumer, url, ref, 'error', { counted: true, http: res.status }); return { res: null, stop: 'error' }; }
      _log(consumer, url, ref, 'ok', { counted: true, http: res.status });
      return { res, stop: null };
    } catch (err) {
      // Network error - skip this call (an error is neither a stop nor "no result")
      _log(consumer, url, ref, 'error', { counted: true, http: 0 });
      return { res: null, stop: 'error' };
    }
  }
}

async function serpapiGetRateAware(url, opts = {}) {
  const { res } = await serpapiRequest(url, opts);
  return res;
}

// Startup health check - ping SerpAPI account endpoint (FREE) to confirm the key works + log searches remaining.
async function serpapiHealthCheck(apiKey, scriptName = 'unknown') {
  if (!apiKey) {
    console.warn(`[serpapi-health] ${scriptName}: SERPAPI_KEY not set - search-fallback paths inactive`);
    return null;
  }
  try {
    const res = await axios.get(`https://serpapi.com/account?api_key=${encodeURIComponent(apiKey)}`, {
      timeout: 10000,
      validateStatus: () => true,
    });
    if (res.status >= 400) {
      console.warn(`[serpapi-health] ${scriptName}: account check returned ${res.status} - key may be invalid`);
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

module.exports = { serpapiGetRateAware, serpapiRequest, serpapiHealthCheck, _resetForTests };
