#!/usr/bin/env node
// check-final-review-sop.mjs — 2026-10-20, approved client_portal_final_review_v1 (R1 · the SOP itself). Chris: "all approved…
// make sure they integrate with admin and database too". The SOP drives BOTH the admin rows and the portal waits, so the
// research-backed order lives here. Pins, in BOTH SOP sources (website playbooks.json + canonical flow/playbooks/*.mjs):
//   · retired Google features stay retired: Q&A seed (Google ended Q&A Nov 2025 → Jan 2026), HARO/Connectively (shut Dec 2024) — no step, no runner
//   · the keyword plan needs no Search Console (Keyword Planner + the map check don't)
//   · every NAP the agency builds waits on the client-confirmed facts (step 7), not the old Google snapshot
//   · review replies never wait on the client's customer list
//   · the customer-list steps wait on ONE Google listing, and the server hands out no review link until then
//   · client copy never asks for a website login / password, never suggests "Online appointments", and the hours copy matches the form
//   exit 0 holds · 1 regressed · 2 cannot read
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SCR = process.env.SCRAPER_COPY_DIR || path.resolve(HERE, "..");
const read = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${p}`); process.exit(2); } };
const PB = JSON.parse(read(`${SITE}/data/playbooks/playbooks.json`));
const CS = JSON.parse(read(`${SITE}/data/playbooks/client-steps.json`));
const M1 = read(`${SCR}/flow/playbooks/month1.mjs`), M2 = read(`${SCR}/flow/playbooks/month2plus.mjs`);
const EXEC = read(`${SITE}/netlify/functions/flow-execute.js`), ONE = read(`${SITE}/netlify/functions/_one-listing.js`), RR = read(`${SITE}/netlify/functions/portal-review-requests.js`);
const F = [], fail = (m) => F.push(m);
const all = [...PB.month1, ...PB.month2plus], A = Object.fromEntries(all.map((s) => [s.id, s]));
const csAll = Object.values(CS).flatMap((v) => (Array.isArray(v) ? v : Array.isArray(v?.steps) ? v.steps : [])), C = Object.fromEntries(csAll.map((s) => [s.id, s]));
// the canonical SOP's dependsOn for one id (its object literal: `id: "x", … dependsOn: [ … ]`)
const mjsDeps = (src, id) => { const m = new RegExp(`id: "${id.replace(/\./g, "\\.")}"[^]*?dependsOn: \\[([^\\]]*)\\]`).exec(src); return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : null; };

for (const id of ["m1.gbp.qa_seed", "m2.exec.haro_pitches"]) {
  if (A[id]) fail(`${id} is back in playbooks.json (a step for a Google feature that no longer exists)`);
  if (new RegExp(`id: "${id.replace(/\./g, "\\.")}"`).test(M1 + M2)) fail(`${id} is back in the canonical SOP`);
  if (new RegExp(`\\n  "${id.replace(/\./g, "\\.")}": async`).test(EXEC)) fail(`${id} has a runner again in flow-execute (delete the producer)`);
}
const kw = "m1.strategy.keywords_locations";
if (!A[kw]) fail(`${kw} missing`); else if ((A[kw].dependsOn || []).includes("m1.access.search_console")) fail("the keyword plan waits on Search Console again (a new website is blocked; the plan doesn't need it)");
if ((mjsDeps(M1, kw) || ["?"]).includes("m1.access.search_console")) fail("the canonical keyword plan waits on Search Console again");
for (const id of ["m1.audit.citations_nap", "m1.web.nap_consistency", "m1.cit.priority_top10", "m1.cit.industry_specific", "m1.platform.bing_apple"]) {
  if (!(A[id]?.dependsOn || []).includes("m1.gbp.business_facts")) fail(`${id} doesn't wait on the client-confirmed facts (step 7) in playbooks.json`);
  if (!(mjsDeps(M1, id) || []).includes("m1.gbp.business_facts")) fail(`${id} doesn't wait on the client-confirmed facts in the canonical SOP`);
}
if ((A["m2.exec.review_responses"]?.dependsOn || []).includes("m2.exec.review_push") || (mjsDeps(M2, "m2.exec.review_responses") || []).includes("m2.exec.review_push")) fail("review replies wait on the client's customer list again (reviews arrive anyway)");
// one listing: the predicate, the built client copy, and the server
if (!/step\.clientForm === "customer_list"/.test(ONE)) fail("_one-listing.js waitsOnListing no longer covers the customer-list steps");
for (const id of ["m1.review.first_5", "m2.exec.review_push"]) if (!C[id]?.waitsOnListing) fail(`${id} doesn't wait on one Google listing in client-steps.json (rebuild: node scripts/build-client-steps.mjs)`);
{ const a = RR.indexOf("await oneListingFor(supa, clientId)"), b = RR.indexOf("const reviewUrl = reviewLinkFor(client);");
  if (a < 0 || b < 0 || a > b || !/if \(!listing\.open\) return json\(200, \{[^}]*requests: \[\]/.test(RR)) fail("portal-review-requests hands out a review link without checking one listing first"); }
// client copy
const copy = (s) => JSON.stringify([s?.clientFirst, s?.clientHint, s?.clientWaitingNote, s?.clientInstructions, s?.clientWait]);
for (const id of ["m1.access.website", "m1.tracking.form_setup", "m1.brand.youtube_setup"]) if (/(send|give|share|email)( us)?( your)?( website)? (login|password)|website login|once we have your[^"]{0,20}login/i.test(copy(A[id]))) fail(`${id}'s client copy asks for a website login/password again (the step is invite-only)`);
if (/online appointments/i.test(copy(A["m1.gbp.attributes"]))) fail("the details step's copy suggests \"Online appointments\" again (no longer recommended)");
if (/HOW TO REPLY|answer the phone outside|Plain text is fine/i.test(copy(A["m1.gbp.hours_attributes"]))) fail("the hours copy asks for things the form doesn't have (free-text reply / out-of-hours phone)");
if (F.length) { console.error("🔴 the final-review SOP regressed:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ final-review SOP holds in both sources: Q&A + HARO retired (no runner) · keyword plan needs no Search Console · NAP builds wait on confirmed facts · replies don't wait on lists · review lists wait on one listing (server too) · copy is invite-only, no Online appointments, hours match the form");
