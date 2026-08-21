#!/usr/bin/env node
/*
 * pipeline-status.mjs — PII-SAFE status reporter for the outreach / video pipeline.
 *
 * WHY THIS EXISTS: the raw pipeline logs are wall-to-wall harvested emails + scraped business
 * domains. Reading those logs into an assistant chat trips the Anthropic API content filter
 * ("Output blocked by content filtering policy") because the context fills with bulk contact PII.
 * See feedback_no_raw_scraped_pii_in_chat.
 *
 * This script reads the logs and prints ONLY safe primitives:
 *   - integer counts (businesses processed, 6/6 pass/fail, deployed, exhausted, failed)
 *   - the current pipeline stage (a keyword)
 *   - PUBLIC video URLs (https://www.rocketgrowthagency.com/v/<slug>/ — public pages, no PII)
 *   - a runtime/liveness read from the log file's mtime
 * It NEVER prints a raw log line, an email, a name, or a scraped source domain. Everything it
 * emits is COMPUTED (a count or a whitelisted public-URL match), never an echoed log line.
 *
 * Usage:  node scripts/pipeline-status.mjs [logfile]
 *         (defaults to /tmp/overnight-pipeline-<today>.log)
 */
import fs from 'fs';

/*
 * 🔴 LOCAL date, never toISOString() — and check YESTERDAY too.
 *
 * This used to be `new Date().toISOString().slice(0,10)`, which is the UTC date. PDT is UTC-7, so the
 * UTC date rolls over at 17:00 local — BEFORE the 21:00 run even starts. The result: this tool reported
 * "no log ... (run may not have started)" for the ENTIRE overnight window, every single night. The one
 * command Chris is told to use to check a running build could never see one.
 *
 * The run also CROSSES midnight, so after 00:00 local the live log is still stamped with the PREVIOUS
 * local date. Both candidates must be tried, newest-mtime first. Same defect class as the circuit
 * breaker that went blind at midnight (see feedback_empty_output_breaks_the_test_not_the_command:
 * a check that cannot fire reads exactly like a pass).
 */
const localStamp = (d) => {
  const t = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return t.toISOString().slice(0, 10);
};
const now = new Date();
const yday = new Date(now.getTime() - 86400000);
const CANDIDATES = [localStamp(now), localStamp(yday)].map((s) => `/tmp/overnight-pipeline-${s}.log`);

let logPath = process.argv[2];
if (!logPath) {
  const present = CANDIDATES.filter((p) => fs.existsSync(p))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  logPath = present[0];
}

if (!logPath || !fs.existsSync(logPath)) {
  console.log(`SAFE-STATUS: no log at ${CANDIDATES.join(' or ')} (run may not have started).`);
  process.exit(0);
}

const raw = fs.readFileSync(logPath, 'utf8');
const lines = raw.split('\n');
const count = (re) => (raw.match(re) || []).length;

// --- ONLY whitelisted, public URLs are extracted (no source/scraped domains) ---
const videoUrls = [...new Set((raw.match(/https:\/\/www\.rocketgrowthagency\.com\/v\/[a-z0-9-]+\/?/g) || []))];

// --- Category: safe (it's "<Vertical> in <City>, ST", no PII). Pull from the START banner. ---
const catLine = lines.find((l) => /START .*—/.test(l) && /(in .+, [A-Z]{2}|Body shop|overnight)/.test(l));
const catMatch = raw.match(/overnight-pipeline[^\n]*?"([^"@]+? in [^"@]+?)"/) // if the arg was echoed
  || raw.match(/\b([A-Z][a-z]+(?: [a-z]+)* in [A-Z][a-z]+(?: [A-Z][a-z]+)*, [A-Z]{2})\b/);
const category = catMatch ? catMatch[1] : '(category not yet echoed)';

// --- Stage detection: last known safe stage keyword seen ---
const STAGES = ['step-2', 'step-3', 'step-4', 'step-5', 'step-6', 'step-7', 'step-8',
  'screencap', 'voiceover', 'combine', 'render', 'deploy', 'reconcile', 'audit'];
let stage = '(booting)';
for (let i = lines.length - 1; i >= 0 && stage === '(booting)'; i--) {
  for (const s of STAGES) if (lines[i].includes(s)) { stage = s; break; }
}

// --- Counts (numbers only) ---
const processed = count(/^Processing /gm);
const deployLive = count(/Deploy is live/g);
const sixPass = count(/\b6\/6\b/g);
const exhausted = count(/retries exhausted|EXHAUSTED/g);
const failedMatch = raw.match(/FAILED_VIDEOS=(\d+)/);
const failedVideos = failedMatch ? failedMatch[1] : null;
/*
 * 🔴 A SENSOR SELF-TEST QUOTES THE STRING IT DETECTS — strip those lines before testing.
 *
 * The SerpApi pre-flight gate prints `✓ detects "you have run out of searches"` to prove its detector
 * works. That is a HEALTH signal, and it fired 14 times on 2026-08-20 while the account had 2,874 of
 * 5,000 searches left. This script read those lines and reported "serpapi quota hit: YES" on a
 * perfectly healthy run — a false blocker on the one command used to check a live build.
 *
 * The OpenAI twin was fixed for the same class of bug on 2026-07-18 (the benign "SerpAPI quota check"
 * banner) but the SerpApi detector was left matching quoted sample text. Sanitize once, use for both.
 * Related: feedback_indeterminate_is_not_a_finding, feedback_dead_check_selector_gap.
 */
const SELFTEST_LINE = /(^|\s)[✓✗×]\s*(detects|does not detect|no false)|self-?test|sensor check/i;
const runtime = lines.filter((l) => !SELFTEST_LINE.test(l)).join('\n');

// OpenAI billing/quota errors ONLY. The bare word "quota" also appears in the benign
// ">>> pre-flight: SerpAPI quota check" banner — matching it there produced a false
// "check OpenAI" flag (2026-07-18). Anchor on OpenAI's actual 429 error text instead.
/*
 * 🔴 MATCH THE PIPELINE'S OWN FATAL TEXT, not just the vendor's raw error string.
 *
 * These regexes originally matched only OpenAI's API error wording (`insufficient_quota` etc.). But the
 * pre-flight gate CATCHES the 429 and prints its own message — `✗ FATAL: OpenAI OUT OF CREDITS (429)`.
 * On 2026-08-20 that fired three real times and this tool still reported `openai quota hit: no`.
 * A FALSE NEGATIVE is strictly worse than the false positive fixed above: it hides a live blocker on
 * the one screen used to decide whether a night is healthy. Match BOTH the vendor string and ours.
 */
const openaiQuota = /insufficient_quota|exceeded your current quota|check your plan and billing|OpenAI OUT OF CREDITS|OpenAI balance\/quota exceeded/i.test(runtime) ? 'YES (check OpenAI)' : 'no';
const serpQuota = /searches are exhausted|run out of searches|SerpAPI quota (exhausted|too low)|SerpAPI.*below the floor/i.test(runtime) ? 'YES (check SerpApi)' : 'no';

// --- Liveness from file mtime ---
const mtime = fs.statSync(logPath).mtime;
const ageSec = Math.round((Date.now() - mtime.getTime()) / 1000);
const live = ageSec < 120 ? 'ACTIVE (log written <2m ago)' : `IDLE (last write ${ageSec}s ago — may be done/stalled)`;

console.log('===== SAFE-STATUS (no PII) =====');
console.log(`category:        ${category}`);
console.log(`stage:           ${stage}`);
console.log(`liveness:        ${live}`);
console.log(`log lines:       ${lines.length}`);
console.log(`businesses seen: ${processed}`);
console.log(`6/6 markers:     ${sixPass}`);
console.log(`deploy-live:     ${deployLive}`);
console.log(`videos deployed: ${videoUrls.length}`);
console.log(`exhausted leads: ${exhausted}`);
if (failedVideos !== null) console.log(`FAILED_VIDEOS:   ${failedVideos}`);
console.log(`openai quota hit: ${openaiQuota}`);
console.log(`serpapi quota hit: ${serpQuota}`);
console.log('----- deployed video URLs (public, safe) -----');
console.log(videoUrls.length ? videoUrls.join('\n') : '(none yet)');
