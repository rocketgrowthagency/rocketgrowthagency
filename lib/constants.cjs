// lib/constants.cjs
// Magic numbers + tuning thresholds centralized so they're discoverable +
// auditable. Memory: rule that locked decisions need code guards (so the
// values shouldn't be silently changed without updating both code + memory).

module.exports = {
  // SerpAPI rate-limit handling
  SERPAPI_HOURLY_LIMIT: 200,                  // current plan tier
  SERPAPI_RATE_SLEEP_MS: 60 * 60 * 1000 + 60 * 1000,  // 1hr + 1min buffer
  SERPAPI_DEFAULT_TIMEOUT_MS: 15000,

  // Cross-reference scoring
  PROXIMITY_CHAR_THRESHOLD: 300,              // max chars between email + name in snippet for proximity tier
  CROSS_REF_TIER_AUTO_TRUST: 10,
  CROSS_REF_TIER_AUTO_TRUST_GENERIC: 11,      // info@/contact@ on domain match
  CROSS_REF_TIER_PHONE_MATCH: 15,
  CROSS_REF_TIER_NAME_MATCH: 20,
  CROSS_REF_TIER_FREE_MAILBOX: 30,            // for emailRank only
  CROSS_REF_TIER_OTHER_DOMAIN: 30,
  CROSS_REF_TIER_PROXIMITY: 60,
  CROSS_REF_TIER_REJECT: 999,

  // Email validation
  EMAIL_REGEX_BASIC: /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i,
  PHONE_PREFIX_PATTERN: /^\d{3,4}-\d{4}/,     // 3-4 digits + dash + 4 digits at start of local-part

  // Intro voiceover (locked memory rule)
  INTRO_MAX_WORDS: 55,                        // ~16s at 200wpm
  INTRO_TARGET_WORDS: 48,                     // ~14s at 200wpm — locked target

  // Search-fallback query tuning
  SEARCH_MAX_RESULTS: 10,                     // SerpAPI num= param
  SEARCH_CANDIDATE_CAP: 20,                   // max candidates per query to scan

  // step-1 scrape limits
  STEP1_TARGET_UNIQUE_PLACES_DEFAULT: 55,
  STEP1_NAV_TIMEOUT_MS: 90000,

  // Audit timeouts
  AUDIT_NAV_TIMEOUT_MS: 90000,
  AUDIT_FETCH_TIMEOUT_MS: 30000,
};
