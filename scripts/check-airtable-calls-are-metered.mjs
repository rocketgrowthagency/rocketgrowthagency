#!/usr/bin/env node
// check-airtable-calls-are-metered.mjs
// 🔒 WHY (2026-10-08): the workspace went over its 100,000 monthly Airtable API calls (125,148) and nothing
// could say which job spent them. Every scheduled job now loads scripts/_airtable-meter.mjs (one log line
// per node process in output/airtable-calls.log); only the READ-ONLY health check caches repeat GETs.
// HOLDS: each scheduled job exports the meter; only daily-health-check turns the cache on; the sales
// call queue filters at Airtable instead of reading the whole table.
// exit 0 = metered · 1 = a job spends calls unseen (or a writing job caches) · 2 = can't tell
import fs from "node:fs";
const HERE = new URL(".", import.meta.url).pathname.replace(/%20/g, " ");
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const rd = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${p}`); process.exit(2); } };
const fails = [];
if (!fs.existsSync(`${HERE}_airtable-meter.mjs`)) fails.push("scripts/_airtable-meter.mjs is gone");
for (const [job, cache] of [["daily-health-check.sh", true], ["overnight-local.sh", false], ["daily-deliverability-guard.sh", false], ["rehearse-night-run.sh", false]]) {
  const s = rd(`${HERE}${job}`);
  if (!/export NODE_OPTIONS="[^"]*--import=file:\/\/[^"]*_airtable-meter\.mjs"/.test(s)) fails.push(`${job} no longer loads the Airtable meter — its calls are invisible`);
  const caches = /^export AIRTABLE_GET_CACHE=1$/m.test(s);
  if (cache && !caches) fails.push(`${job} lost its read cache — the nightly gates re-read the same tables`);
  if (!cache && caches) fails.push(`${job} WRITES to Airtable and now caches reads — it can act on stale data (a double send)`);
}
const q = rd(`${SITE}/netlify/functions/sales-call-queue.js`);
if (!/u\.searchParams\.set\("filterByFormula", formula\)/.test(q) || !/return await fetchPages\(QUEUE_FORMULA\)/.test(q)) fails.push("the sales call queue reads the whole leads table again on every load");
if (fails.length) { console.error("🔴 Airtable calls are not metered:"); for (const f of fails) console.error("   · " + f); process.exit(1); }
console.log("✅ every scheduled job meters its Airtable calls; only the read-only check caches; the call queue filters at Airtable");
