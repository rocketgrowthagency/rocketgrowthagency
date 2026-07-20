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

const stamp = new Date().toISOString().slice(0, 10);
const logPath = process.argv[2] || `/tmp/overnight-pipeline-${stamp}.log`;

if (!fs.existsSync(logPath)) {
  console.log(`SAFE-STATUS: no log at ${logPath} (run may not have started).`);
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
// OpenAI billing/quota errors ONLY. The bare word "quota" also appears in the benign
// ">>> pre-flight: SerpAPI quota check" banner — matching it there produced a false
// "check OpenAI" flag (2026-07-18). Anchor on OpenAI's actual 429 error text instead.
const openaiQuota = /insufficient_quota|exceeded your current quota|check your plan and billing/i.test(raw) ? 'YES (check OpenAI)' : 'no';
const serpQuota = /searches are exhausted|run out of searches/i.test(raw) ? 'YES (check SerpApi)' : 'no';

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
