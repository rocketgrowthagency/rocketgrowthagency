#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-the-audit-defects-stay-fixed.mjs
//
// 🔒 WHY (2026-10-08, approved waiting_on_you_v1 item 3): the Month-1 order audit traced all 61 steps
// in code and found eight defects beyond the ordering. Each is pinned here so it cannot come back:
//   #2 location pages + the matrix use the plan's sub-locations, never invent them
//   #3 categories/services/description/Q&A/meta/H1/pages/blog read the LOCKED plan (and wait for it)
//   #4 attributes are asked once (the hours step is hours only)
//   #5 the Month-1 report reads Month 1's record, the grid, and "found" directory listings
//   #6 GBP "Verified" is Google's flag; GBP access is done only when a listing was found
//   #7 the Place ID is saved when Google connects (and backfilled by the GBP snapshot)
//   #8 the fix plan reads the grid, competitors, directory listings, speed and the KPI baseline
//   #9 the hand-off creates the Month 2 record
// exit 0 = all eight hold · 1 = one regressed · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SCRAPER = process.env.SCRAPER_DIR || "/Users/chris/RGA/Rocket Growth Agency Scraper VS Code";
const rd = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${p}`); process.exit(2); } };
const code = (src) => src.split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
const FE = code(rd(`${SITE}/netlify/functions/flow-execute.js`));
const CB = code(rd(`${SITE}/netlify/functions/oauth-google-callback.js`));
const REC = code(rd(`${SITE}/netlify/functions/build-recommendations-plan.js`));
const RPT = code(rd(`${SCRAPER}/lib/report-generator.mjs`));
const PB = JSON.parse(rd(`${SITE}/data/playbooks/playbooks.json`));
const fails = []; const F = (m) => fails.push(m);
const block = (id) => { const a = FE.indexOf(`"${id}": async`); if (a < 0) return ""; const b = FE.indexOf("\n  },\n", a); return FE.slice(a, b < 0 ? a + 4000 : b); };

// #2 + #3
for (const id of ["m1.gbp.optimize_categories", "m1.gbp.services_products", "m1.gbp.business_description", "m1.gbp.qa_seed",
  "m1.web.homepage_meta", "m1.web.h1_cta", "m1.web.priority_pages", "m1.web.blog_seed", "m1.web.location_pages", "m1.web.service_location_matrix"]) {
  const b = block(id);
  if (!b) { F(`#3 runner ${id} not found`); continue; }
  if (!/const _plan = await lockedPlanFor\(client\.id\);/.test(b) || !/return PLAN_NOT_LOCKED;/.test(b)) F(`#3 ${id} no longer waits for the locked keyword plan`);
  if (!/planBlock\(_plan\)/.test(b)) F(`#3 ${id} no longer writes from the locked plan`);
}
if (/Suggest 3 sub-locations/i.test(FE)) F("#2 a draft invents its own sub-locations again");
if (!/_plan\.locations\.join\("; "\)/.test(block("m1.web.location_pages"))) F("#2 the location pages do not name the plan's sub-locations");
if (!/_plan\.locations\.join\("; "\)/.test(block("m1.web.service_location_matrix"))) F("#2 the matrix does not name the plan's sub-locations");
// universal: the category shortlist never pins one trade's categories first
if (/marketing\|advertis/.test(block("m1.gbp.optimize_categories"))) F("the category shortlist pins marketing categories first again — RGA's trade, not the client's");
// #4
const hours = (PB.month1 || []).find((s) => s.id === "m1.gbp.hours_attributes");
if (!hours || /attribute/i.test(hours.title || "") || /attribute/i.test(hours.clientLabel || "")) F("#4 the hours step asks about attributes again (title/label)");
if (/ATTRIBUTES_CHECKLIST/.test(block("m1.gbp.hours_attributes"))) F("#4 the hours worksheet drafts attributes again");
// #5
if (!/monthlyRecords\[0\]\?\.data\?\.tasks \|\| onboardingRecs\?\.\[0\]\?\.data\?\.tasks/.test(RPT)) F("#5 the Month-1 report does not read Month 1's onboarding record");
if (!/gridRows\.length > 0/.test(RPT)) F("#5 the report no longer shows the map grid");
if (/c\.status === "live"\)\.length\} live/.test(RPT) || !/\["found", "live", "built"\]\.includes\(c\.status\)/.test(RPT)) F("#5 the report counts only \"live\" listings (the audit writes \"found\")");
// #6
if (/gbp: true,/.test(CB) || !/gbp: !!gbpLocationId,/.test(CB)) F("#6 GBP access is marked done without a listing again");
const base = block("m1.audit.gbp_baseline");
if (/"8\.2 GBP Verified - Yes\/No": "Yes"/.test(base) || !/hasVoiceOfMerchant/.test(base)) F("#6 the GBP snapshot writes Verified without measuring it");
// #7
if (!/readMask=name,title,metadata/.test(CB) || !/google_place_id: gbpPlaceId/.test(CB)) F("#7 the Place ID is not saved when Google connects");
if (!/supaPatchClientPlaceId\(clientId, profile\.metadata\.placeId\)/.test(base)) F("#7 the GBP snapshot no longer backfills the Place ID");
// #8
for (const [what, re] of [["the map grid", /task\("m1\.audit\.grid_baseline"\)/], ["the competitor snapshot", /task\("m1\.audit\.competitors"\)/],
  ["the directory listings", /client_citations\?client_id=/], ["speed", /latest\.pagespeed\?\.payload/], ["the KPI baseline", /task\("m1\.audit\.kpi_baseline"\)/]]) {
  if (!re.test(REC)) F(`#8 the fix plan no longer reads ${what}`);
}
if (!/k\.measured !== true/.test(REC)) F("#8 an unmeasured grid scan can become a finding");
// #9
const hand = FE.slice(FE.indexOf('["m1.handoff.month2", false]'));
if (!/\/client_monthly_records`, \{ method: "POST"/.test(hand) || !/if \(!row\?\.id\) return/.test(hand)) F("#9 the hand-off no longer creates (and reads back) the Month 2 record");

if (fails.length) { console.error("🔴 an audit defect is back:"); for (const f of fails) console.error("   · " + f); process.exit(1); }
console.log("✅ all eight audit defects stay fixed (#2–#9)");
