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
// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT. A gate that can only ever read the real
// working tree cannot be pointed at a scratch copy, so its mutations cannot be run — and a
// gate nobody can make fail is a gate nobody has checked. Found 2026-10-06 when three
// mutations of `check-refusal-is-not-done` all came back green: it was reading straight past
// them. → feedback_a_gate_that_cannot_fail · feedback_the_harness_i_wrote_to_check_my_work_can_lie
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const WEB = `${__SITE}`;
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
// 🔑 2026-10-02 — the Google Ads API joins this list. It has NO per-call charge (verified against
// Google's own quota docs, not recited) and is capped at 15,000 operations/day at Basic access, so
// it cannot produce a bill and does not touch the Places quota that caused the $755 suspension.
// It is declared anyway for exactly the reason Calendar is: the runaway shape is BOOKKEEPING, not
// pricing. → project_real_search_volume_is_live
const WATCHED_FREE = /calendar\.googleapis\.com|googleapis\.com\/calendar\/v3|googleads\.googleapis\.com/;

/**
 * Declared billing-relevant callers. Adding a Google API caller means adding it HERE with an honest
 * per-run cost — that declaration is the review step.
 * `stamps` = the field/behaviour that records an attempt so failures do not repeat forever.
 */
const DECLARED = {
  // 🔒 11-11: every SearchText caller asks the shared daily budget first (_places-budget.js; gate check-places-cap-is-said)
  "v2-rank-grid-background.js": { perRun: "~25 SearchText (5×5 grid) ONLY when SERPAPI_KEY is absent; tier 1 of the Places budget", scheduled: "monthly via rankings-refresh", stamps: "writes the grid result per scan" },
  "backfill-gbp-hours.js": { perRun: "1 SearchText per NEW lead, at most its budget share (6 a day, tier 4)", scheduled: "daily", stamps: "GBP Hours Checked (every outcome incl. failure)" },
  "backfill-place-ids.js": { perRun: "≤4 SearchText per unresolved client, within the same tier-4 share", scheduled: "daily retry", stamps: "clients.google_place_id (only touches null rows)" },
  "_fga-enrichment.js": { perRun: "up to ~10 SearchText (stops at the first refusal) + 1 PSI per audit; budget share 20 a day, tier 3", scheduled: "on demand (per FGA submission)", stamps: "fga_report_cache — never re-fetched once cached" },
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
  // ── the rest of the kickoff lifecycle (2026-09-24). Calendar is quota-limited, NOT billed, so
  //    neither of these can spend money — but both are declared because the runaway risk is
  //    BOOKKEEPING, not pricing: work repeating forever because nothing recorded it was done. That
  //    shape is API-agnostic, and it is what caused both real Google overspends.
  //    → feedback_google_cloud_billing_safety
  "kickoff-rsvp-check.js": {
    perRun: "1 Calendar events.get per check — FREE (quota, not billed)",
    // 🔴 The one to watch. It is invoked on every paint of the client Overview, so its ceiling is
    // "how often is a client page opened", not "how many clients exist". Bounded only by that.
    scheduled: "on demand (every render of the Phase 0 card, plus after send/move/cancel)",
    stamps: "client_onboarding_records.kickoff_invite.rsvp_checked_at — the result is persisted so the admin can render without re-asking Google",
  },
  // call_to_client_v1 (11-10). Every 10 minutes, but only for booked walkthroughs / kickoffs starting in the next 25 hours that
  // still have a reminder due: a call with both reminders on record is skipped before Google is asked.
  "call-reminders.js": {
    perRun: "≤1 Calendar events.get per booked walkthrough in the next 25 hours with a reminder still due (its RSVP; kickoffs are not read), ≤200 calls a run, + 1 Gmail send per reminder due — FREE (quota, not billed)",
    scheduled: "every 10 minutes (netlify.toml); CALL_REMINDERS=0 stops it",
    stamps: "rga_call_reminders (call_id, kind) is claimed BEFORE each send and never retried, so a reminder goes out once; a call with email_24h and email_1h on record is skipped without calling Google",
  },
  // call_to_client_v1 + master schedule v6 (11-10): the walkthrough's own invite, its RSVP and the Schedule panel's move / call off
  "walkthrough-book.js": {
    perRun: "1 Calendar events.insert (with a Meet link) per press — FREE (quota, not billed)",
    scheduled: "on demand (an admin presses Send the invite, with confirm_to equal to the recipient shown)",
    stamps: "kickoff_slot_holds (purpose walkthrough) is taken by its primary key BEFORE Google is called, and the rga_calls row records the event, so a second press on the same time is refused without calling Google",
  },
  "walkthrough-rsvp.js": {
    perRun: "1 Calendar events.get per read of a booked walkthrough's call card — FREE (quota, not billed); a call with no event_id or no rga_calls row is answered without calling Google",
    scheduled: "on demand (an admin opens a prospect's call card that has a booked walkthrough)",
    stamps: "none: read-only by design (the booking is the rga_calls row); bounded by how often an admin opens that card, like kickoff-rsvp-check",
  },
  "schedule-call-action.js": {
    perRun: "1 Calendar events.patch (reschedule) or events.delete (call off) per confirmed press — FREE (quota, not billed); slots / console / outcome call no Google API",
    scheduled: "on demand (an admin confirms the orange Reschedule / Cancel dialog, confirm:true)",
    stamps: "the old rga_calls row becomes rescheduled / cancelled and the hold is freed, so a second press finds no booked row and calls nothing",
  },
  "cancel-kickoff-invite.js": {
    perRun: "1 Calendar events.delete per cancellation — FREE (quota, not billed)",
    scheduled: "on demand (a human confirms a destructive dialog)",
    stamps: "removes client_onboarding_records.kickoff_invite and appends kickoff_cancellations — a second call finds no event_id and returns nothingToCancel without calling Google at all",
  },
  // 🔑 The slot engine (2026-09-25). Every availability question in the product goes through it —
  // the portal picker, the admin request list, and the sender's final "is it still free" check.
  // ── integrations hardening + runbook 7b (approved 11-11), declared 11-12 by the night fixer after reading each file ──
  //    🔒 none of them can spend: every Google read below is a free one, and a refusal is reported, never retried or answered with a quota raise
  "cloud-billing-probe.js": {
    perRun: "1 Place Details with FieldMask `id` (Google's IDs Only SKU, no charge; NOT a SearchText, so nothing from the 32-a-day Places budget) + 1 PageSpeed read of RGA's own homepage (free, quota)",
    scheduled: "daily 17:10 UTC → 365 IDs-only reads + 365 PageSpeed reads a year, $0; a 429 is 'could not tell', never a reason to ask for more",
    stamps: "nothing to repeat: one fixed place (Google's own sample id) and one fixed page, once a day; the run's answer goes to job-watcher",
  },
  "_integration-checks.js": {
    perRun: "googleGrant only: 1 token refresh + 1 tokeninfo + 1 Calendar freeBusy (RGA's own calendar, the next hour) + 1 userinfo, all free (quota); placesBudget reads RGA's own Places ledger in the database, no Google call",
    scheduled: "daily, through integration-watch (13:25 UTC) and budget-watch (13:50 UTC) → at most 4 free reads a day, 1,460 a year",
    stamps: "each check writes its own System health row (_job-checkin finishParts); a refused read is an error that day, not a loop",
  },
  "integration-watch.js": {
    perRun: "runs googleGrant once: the 4 free Google reads in _integration-checks.js (token, tokeninfo, freeBusy, userinfo)",
    scheduled: "daily 13:25 UTC",
    stamps: "a System health row per check (_job-checkin finishParts)",
  },
  "budget-watch.js": {
    perRun: "no Google call of its own: its places-budget row reads RGA's Places ledger (_places-budget summary); it requires _integration-checks.js, which also holds the grant check it does not run",
    scheduled: "daily 13:50 UTC",
    stamps: "a System health row per budget (_job-checkin finishParts)",
  },
  "_kickoff-slots.js": {
    perRun: "at most 1 Calendar freeBusy query per availability read — FREE (quota, not billed), and SKIPPED ENTIRELY when no access token is present",
    // 🔴 The ceiling is "how often does anyone open a time picker", not "how many clients exist".
    // It is bounded ahead of Google rather than after it: OUR ledger answers first, the horizon is
    // clamped to 10 days, and a failed read THROWS instead of retrying — so a broken token
    // produces one error, not a loop. → feedback_an_absence_must_never_be_readable_as_a_value
    scheduled: "on demand (a human opens the picker, or an invite is confirmed)",
    stamps: "kickoff_slot_holds — every slot handed out or taken is a row, so nothing is decided from a Google answer alone",
  },
  // ── step 4 / admin step 28 place lookup (2026-10-29, step4_done_in_portal_v2). Declared 10-30 by the night fixer; the bookkeeping
  //    went in with commit 72851b2e: a FAILED look is stamped like any other, so it is not retried every night.
  "_gbp-area-cover.js": {
    perRun: "≤1 SearchText + ≤1 Geocoding per place on the client's to-add list that Google doesn't list yet",
    // 🔴 The one to watch: SearchText shares the 32/day cap with the geo-grid. A person pressing Check Google now looks again at once, while a place is unknown.
    scheduled: "weekly per waiting step, from the nightly gbp-profile-watch (coverStale) · on demand (Check Google now, only while a place is unknown)",
    stamps: "google_push.area_cover.at + one item per place, failures included (state unknown + why), so no look repeats inside the week",
  },
  "_gbp-watch.js": {
    perRun: "0 of its own: the only Google lookup that counts here is _gbp-area-cover, and only while coverStale says so",
    scheduled: "daily via gbp-profile-watch · on demand via admin-google-check (a person presses Check Google now)",
    stamps: "google_push.area_cover, written with writeStepTasks in the same pass as the look",
  },
  // ── 🔴 FOUND 2026-10-02 WHEN THIS GATE LEARNED TO FOLLOW A `require`. All three reach Google
  //    through a helper module, so for as long as this gate matched endpoint URLs in a file's own
  //    source, none of them had ever been declared — the review step they were supposed to pass.
  "validate-tracked-keyword.js": {
    perRun: "≤7 Ads operations per validation — FREE (quota, not billed), via _ads-keywords",
    scheduled: "NEVER — on demand, from the keyword-validation step a human clicks Run on",
    stamps: "task outcome_data (verdict + volume + volume_geo), so re-rendering never re-measures",
  },
  "_fga-report-builder.js": {
    perRun: "1 SearchText + 1 PSI per report build, via enrichAuditRecord",
    scheduled: "on demand (per FGA report build)",
    stamps: "fga_report_cache — the enrichment is cached and not re-fetched once stored",
  },
  // admin-onboarding-autofill.js RETIRED 11-1 (Chris approved; nothing called it, its button never existed in admin/index.html). Its Places spend is gone with it.
  // ── Google Ads Keyword Planner (2026-10-02). FREE — quota-limited at 15,000 ops/day, never
  //    billed, and on a quota entirely separate from Places SearchText.
  //    🔑 The cost figure below is MEASURED, not estimated: a full run of
  //    m1.strategy.keywords_locations was instrumented and used exactly 7 operations.
  "_ads-keywords.js": {
    perRun: "≤7 operations per keyword-plan run, MEASURED — 1 geo suggest + ≤2 parent lookups + ≤3 ladder probes + 1 ideas + 1 verification. FREE (quota, not billed); 15,000/day at Basic",
    // 🔴 THE PROPERTY THAT MATTERS. Nothing schedules this and nothing calls it on a render. It is
    // reached only from a step a human clicks Run on, and the numbers are written into the task
    // record so opening the card again renders from storage and asks Google nothing. A view that
    // can trigger an API call is the exact shape of the $755 incident.
    scheduled: "NEVER — on demand only, from a human clicking Run on the keyword step",
    stamps: "client_onboarding_records task outcome_data.demand + measuredAt — the measurement is persisted, so re-rendering never re-measures and only a deliberate re-Run spends anything",
  },
  "oauth-rga-init.js": { perRun: "0 — builds a consent URL, calls nothing", scheduled: "hand-run, once", stamps: "n/a" },
  "oauth-google-callback.js": { perRun: "1 token exchange per consent — free", scheduled: "on demand (a human consents)", stamps: "client_google_oauth / rga_google_credentials" },
};

const fails = [];
console.log("── Google API cost safety ──");

if (!fs.existsSync(FUNCS)) { console.error(`✗ functions dir not found`); process.exit(2); }

// 1 + 2. Every billed caller must be declared.
// 🔴🔴 2026-10-02 — A CALLER THAT REACHES GOOGLE THROUGH A HELPER WAS INVISIBLE TO THIS GATE.
// It matched the endpoint URL in a file's own source, so `validate-tracked-keyword.js` — which calls
// the Ads API via `require("./_ads-keywords")` — was not flagged as needing a declaration at all.
// Every shared `_module.js` is this hole: the declaration IS the review step, and a function could
// skip it simply by importing one. Follow one level of local require.
// 🔑 Found by a NEW gate noticing a caller this one did not. Two gates disagreeing about the same
// fact is a finding, not noise. → feedback_a_gate_that_it_exists_is_not_a_gate_that_it_works
const allFiles = fs.readdirSync(FUNCS).filter((f) => f.endsWith(".js"));
const touchesGoogle = (src) => BILLED.test(src) || WATCHED_FREE.test(src);
const helperModules = allFiles.filter((f) => f.startsWith("_") && touchesGoogle(fs.readFileSync(path.join(FUNCS, f), "utf8")));

const callers = allFiles.filter((f) => {
  const src = fs.readFileSync(path.join(FUNCS, f), "utf8");
  if (touchesGoogle(src)) return true;
  // …or it pulls in a module that does.
  return helperModules.some((m) => {
    const base = m.replace(/\.js$/, "");
    return new RegExp(`require\\(\\s*["']\\./${base}["']\\s*\\)`).test(src);
  });
});
if (helperModules.length) console.log(`  (helper modules that reach Google: ${helperModules.join(", ")})`);

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
