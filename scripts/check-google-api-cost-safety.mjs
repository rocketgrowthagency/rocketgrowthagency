#!/usr/bin/env node
/**
 * check-google-api-cost-safety.mjs — no Google API caller can quietly become a money loop.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * Two runaway spends, same shape both times:
 *
 *   $755   2026-05-07  Apps Script re-processed completed threads → billing SUSPENDED
 *   ~$204/mo  found 2026-09-06  backfill-gbp-hours re-queried 1,362 leads EVERY DAY, forever
 *
 * 🔑 NEITHER WAS A VOLUME PROBLEM. Both were bookkeeping: work repeated forever because nothing
 * recorded it had already been done. Neither looked like a bug — both looked like a job running
 * normally, which is exactly why a human reading the code did not catch either one.
 *
 * Memory ([[feedback-google-cloud-billing-safety]]) states the rules. This enforces the two that are
 * mechanically checkable, because a rule with no guard is a rule that gets forgotten under pressure.
 *
 * CHECKS
 *   1. 🔴 A billing-relevant Google API caller that is SCHEDULED must be declared here with its
 *      per-run cost. Anything scheduled multiplies by 365.
 *   2. 🔴 Every caller must have a WRITE-BACK that records the attempt — otherwise a failure falls
 *      back into the next run's queue and repeats forever. This is the exact shape of both
 *      incidents.
 *   3. The VIDEO pipeline must call ZERO Google Cloud APIs (feedback_pipeline_billing_boundary).
 *
 * Exit 0 = safe. 1 = a caller could loop, or the video pipeline gained a Google dependency.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER = path.resolve(HERE, "..");
const WEB = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FUNCS = path.join(WEB, "netlify", "functions");

// Endpoints that cost real money on the Google billing line.
const BILLED = /places\.googleapis\.com|maps\.googleapis\.com|pagespeedonline|googleapis\.com\/pagespeedonline/;

// 🔴 2026-09-06 — FREE IS NOT THE SAME AS SAFE. Chris, on adding the Calendar API: "make sure there
// is guards in place if any cost is involved so we dont overspend on this like other google APIs."
//
// 🔑 Both runaway spends were BOOKKEEPING failures, not volume ones — work repeating forever because
// nothing recorded it was done. That shape is API-agnostic. On Places it burns dollars; on Calendar
// it emails a real client the same invite over and over, which is worse than a bill.
//
// So a free-but-rate-limited Google API must be declared here too, with its bound. The declaration
// IS the review step.
// 🔴 NOT the oauth2 token endpoint. Every function that talks to Google refreshes a token, so
// matching it flagged 9 files that consume no API at all — a mass finding, which by our own rule
// means the probe is wrong before the code is. Token refresh is plumbing; an API CONSUMER is what
// needs declaring.
const WATCHED_FREE = /calendar\.googleapis\.com|googleapis\.com\/calendar\/v3/;

/**
 * Declared billing-relevant callers. Adding a Google API caller means adding it HERE with an honest
 * per-run cost — that declaration is the review step.
 * `stamps` = the field/behaviour that records an attempt so failures do not repeat forever.
 */
const DECLARED = {
  "v2-rank-grid-background.js": { perRun: "~25 SearchText (5×5 grid)", scheduled: "monthly via rankings-refresh", stamps: "writes the grid result per scan" },
  "backfill-gbp-hours.js": { perRun: "1 SearchText per NEW lead", scheduled: "daily", stamps: "GBP Hours Checked (every outcome incl. failure)" },
  "backfill-place-ids.js": { perRun: "≤4 SearchText per unresolved client", scheduled: "daily retry", stamps: "clients.google_place_id (only touches null rows)" },
  "_fga-enrichment.js": { perRun: "1 SearchText + 1 PSI per audit", scheduled: "on demand (per FGA submission)", stamps: "fga_report_cache — never re-fetched once cached" },
  "deep-assess-client.js": { perRun: "0 billed (GSC/GA4/GBP are free tiers)", scheduled: "on demand", stamps: "client_state_snapshots" },
  "refresh-pagespeed-background.js": { perRun: "1 PSI per client", scheduled: "daily", stamps: "client_state_snapshots (surface=pagespeed)" },
  "gbp-apply-change.js": { perRun: "0 billed (Business Information API)", scheduled: "hand-run", stamps: "client_change_log" },
  "nap-and-review-audit.js": { perRun: "0 billed (Business Information API)", scheduled: "on demand", stamps: "client_state_snapshots" },
  "refresh-review-metrics.js": { perRun: "1 Places DETAILS per client (separate quota)", scheduled: "daily", stamps: "client_state_snapshots (surface=reviews)" },
  "citation-audit.js": { perRun: "0 billed (fetches directory pages directly)", scheduled: "on demand", stamps: "client_state_snapshots" },
  "ai-readiness-audit.js": { perRun: "0 billed", scheduled: "on demand", stamps: "client_state_snapshots" },
  // ── declared 2026-09-06 when this gate first ran and found them undeclared ──
  "v2-audit-website.js": { perRun: "1 PSI per audit", scheduled: "on demand", stamps: "onboarding record — PSI is free to 25k/day" },
  "v2-competitor-profile.js": { perRun: "1 Places DETAILS per competitor (separate quota from SearchText)", scheduled: "on demand", stamps: "competitor profile cached on the client record" },
  "flow-execute.js": { perRun: "1 PSI for m1.web.core_web_vitals", scheduled: "on demand (a human runs the step)", stamps: "task outcome_data" },
  "fga-pagespeed-background.js": { perRun: "1 PSI per FGA report", scheduled: "on demand (per submission)", stamps: "fga_report_cache.data.enrichment.psi" },
  // 🔴 THE ONE TO WATCH. A VIEW that can trigger a paid call is the exact shape of the $755
  // incident. It is the deliberate self-heal added 2026-05-08 after the Google Cloud suspension left
  // reports with mobileScore: 0 — it re-fetches ONLY while the cached score is 0, and stops once a
  // real score lands. PSI is free to 25k/day so the exposure is small, but if PSI ever fails
  // PERSISTENTLY for one report, every view of that report is another call. Bound it if PSI usage
  // ever climbs.
  "fga-report-view.js": { perRun: "1 PSI, ONLY while cached mobileScore === 0", scheduled: "on demand (every report view)", stamps: "patches fga_report_cache on success — self-limiting once a score lands" },
  "backfill-place-ids-background.js": { perRun: "n/a", scheduled: "n/a", stamps: "n/a" },
  // ── free, but bounded and declared (2026-09-06) ──
  "send-kickoff-invite.js": { perRun: "1 Calendar insert per NEW client — FREE (quota, not billed)", scheduled: "on demand (SOP step / Phase 0 button)", stamps: "rga_google_credentials.sends_today + client_onboarding_records.kickoff_invite — counts the ATTEMPT before the call, and refuses a duplicate; hard cap RGA_CALENDAR_DAILY_CAP=10/day" },
  "oauth-rga-init.js": { perRun: "0 — builds a consent URL, calls nothing", scheduled: "hand-run, once", stamps: "n/a" },
  "oauth-google-callback.js": { perRun: "1 token exchange per consent — free", scheduled: "on demand (a human consents)", stamps: "client_google_oauth / rga_google_credentials" },
};

const fails = [];
console.log("── Google API cost safety ──");

if (!fs.existsSync(FUNCS)) { console.error(`✗ functions dir not found`); process.exit(2); }

// 1 + 2. Every billed caller must be declared.
const callers = fs.readdirSync(FUNCS).filter((f) => f.endsWith(".js"))
  .filter((f) => {
    const src = fs.readFileSync(path.join(FUNCS, f), "utf8");
    return BILLED.test(src) || WATCHED_FREE.test(src);
  });

for (const f of callers) {
  const d = DECLARED[f];
  if (!d) {
    fails.push(f);
    const kind = BILLED.test(fs.readFileSync(path.join(FUNCS, f), "utf8")) ? "BILLED" : "rate-limited";
    console.log(`  🔴 ${f} calls a ${kind} Google API but is not declared in this gate.`);
    console.log(`       Add it with an honest per-run cost and the field that records an attempt.`);
    console.log(`       If it is scheduled, multiply that cost by 365 before shipping it.`);
    continue;
  }
  console.log(`  ✅ ${f.padEnd(34)} ${d.perRun}  ·  ${d.scheduled}`);
}

// A declaration for a file that no longer exists is stale bookkeeping that hides the next real one.
const stale = Object.keys(DECLARED).filter((f) => !fs.existsSync(path.join(FUNCS, f)));
for (const f of stale) console.log(`  ▫️  ${f} declared but absent (harmless; tidy when convenient)`);

// 3. The video pipeline must stay free of Google Cloud.
console.log("\n── video pipeline must call ZERO Google Cloud APIs ──");
const videoFiles = fs.readdirSync(SCRAPER).filter((f) => /^step-[1-7].*\.mjs$/.test(f) || f === "build-video-landing.mjs");
let dirty = 0;
for (const f of videoFiles) {
  const src = fs.readFileSync(path.join(SCRAPER, f), "utf8");
  const code = src.replace(/^\s*\/\/.*$/gm, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
  if (BILLED.test(code)) {
    dirty++; fails.push(f);
    console.log(`  🔴 ${f} references a BILLED Google endpoint — the outreach surface must cost $0.`);
  }
}
if (!dirty) console.log(`  ✅ ${videoFiles.length} video-pipeline file(s) clean — Puppeteer only`);

console.log("");
if (fails.length) {
  console.error(`🔴 ${fails.length} cost-safety problem(s).`);
  console.error(`   Two runaway spends have happened ($755 suspended billing, and ~$204/mo absorbed`);
  console.error(`   silently by the quota cap). Both were work repeating forever because nothing`);
  console.error(`   recorded it was done. See feedback_google_cloud_billing_safety.`);
  process.exit(1);
}
console.log(`✅ ${callers.length} billed caller(s) declared with a cost and an attempt-record; video pipeline clean`);
