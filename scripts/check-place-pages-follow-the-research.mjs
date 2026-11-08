#!/usr/bin/env node
/**
 * check-place-pages-follow-the-research.mjs — STEPS 46 AND 47 NEVER MAKE A DOORWAY (approved website_steps_46_50_research_v1, the owner 11-7).
 * Google's spam policies: pages "targeted at specific regions or cities that funnel users to one page" are doorway abuse; many pages made
 * to manipulate rankings are scaled content abuse. 🔴 Step 46 drafted a page for RGA's OWN city, which the homepage already serves.
 * Now: never the home city; a business serving the whole country gets none; one customers visit gets a page per address; any other place
 * only with proof (its searches in Search Console, or a fact of theirs naming it), carrying what's true of it; a page that reads like
 * another place's with the name swapped is refused. Step 47: a service × place page only with the service's page, real searches and proof.
 * Fixtures: a made-up plumber in Springfield. Exit 0 = holds. 1 = doesn't. 2 = couldn't tell.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const req = createRequire(import.meta.url);
let PL, SC, FE, PBs;
try { PL = req(path.join(SITE, "netlify/functions/_place-pages.js")); SC = req(path.join(SITE, "shared/site-change.js")); FE = fs.readFileSync(path.join(SITE, "netlify/functions/flow-execute.js"), "utf8"); PBs = fs.readFileSync(path.join(SITE, "netlify/functions/_page-builder.js"), "utf8"); }
catch (e) { console.error(`⚠️  INDETERMINATE — couldn't load the place rules: ${e.message}`); process.exit(2); }
const bad = [], fail = (m) => bad.push(m);

// the business model decides first
if (!PL.placeRule({ geography_model: "national_one_office" }).stop || PL.placeRule({ geography_model: "national_one_office" }).stop.outcome !== "verified") fail("a business serving the whole country from one office is given city pages");
if (!PL.placeRule({ geography_model: "multi_location" }).stop || PL.placeRule({ geography_model: "multi_location" }).stop.outcome !== "blocked") fail("a business customers visit gets city pages instead of a page per real address");
if (!PL.placeRule({ geography_model: "service_area" }).ok || !PL.placeRule({}).ok) fail("a business that travels to customers can't have place pages at all");

// never the home city; another place only with proof
const client = { primary_market: "Springfield, IL", geography_model: "service_area" };
const gsc = [{ query: "plumber chatham", impressions: 30 }, { query: "drain cleaning chatham il", impressions: 4 }, { query: "plumber springfield", impressions: 900 }, { query: "plumber rochester", impressions: 0 }];
const got = PL.placesWithProof({ client, planLocations: ["Springfield", "Chatham", "Rochester", "Sherman"], gbpAreas: ["Auburn"], gscRows: gsc, facts: ["We replaced a water heater for a family in Auburn."] });
const names = got.map((x) => x.place);
if (names.includes("Springfield")) fail("the home city gets a page of its own (the homepage serves it: RGA's step 46 drafted 'Local SEO Agency in Culver City')");
if (!names.includes("Chatham") || !names.includes("Auburn")) fail("a place with proof (its searches, or a job of theirs there) isn't offered a page");
if (names.includes("Rochester") || names.includes("Sherman")) fail("a place with no proof (no searches that were seen, no fact of theirs) gets a page");
if (names[0] !== "Auburn") fail("a place with a fact of theirs doesn't come before one with searches only");
if (JSON.stringify((got.find((x) => x.place === "Chatham") || {}).searches) !== JSON.stringify(["plumber chatham", "drain cleaning chatham il"])) fail("a place's own searches aren't carried to its page");

// the same template with a new city name is refused
const pages = [{ url: "https://acme.test/chatham/", text: "Acme Plumbing fixes leaks and clears drains for homes across Chatham every week. Our Chatham team arrives with a fully stocked van and the right parts. We serve every street in Chatham, from the oldest houses to new builds." }];
const swapped = PL.swappedName("Acme Plumbing fixes leaks and clears drains for homes across Auburn every week. Our Auburn team arrives with a fully stocked van and the right parts. We serve every street in Auburn, from the oldest houses to new builds.", pages, ["Chatham", "Auburn"], SC.duplicateSentences);
if (swapped.length < 2) fail("a page that is another place's page with the name swapped isn't caught");
if (PL.swappedName("We replaced a water heater for a family on Elm Street in Auburn last spring. Auburn homes are mostly older, with galvanized pipes.", pages, ["Chatham", "Auburn"], SC.duplicateSentences).length) fail("a page with facts true only of its place is called a swapped copy");

// wiring: step 46, step 47 and the words
const h46 = FE.slice(FE.indexOf('"m1.web.location_pages": async'), FE.indexOf('"m1.web.location_pages": async') + 4000);
if (!/const rule = PL\.placeRule\(client\);\s*if \(rule\.stop\) return/.test(h46) || !/const cands = PL\.placesWithProof\(/.test(h46) || /market: client\.primary_market/.test(h46)) fail("step 46 doesn't follow the business model and the proof (or still plans the home city)");
if (!/place_facts: \[\.\.\.cand\.facts, \.\.\.cand\.searches\.map\(/.test(h46)) fail("step 46's page isn't given what's true of its place");
{ const PB = req(path.join(SITE, "netlify/functions/_page-builder.js"));
  const wp = PB.wordsPrompt({ kind: "city", page_for: "Auburn", searches: ["plumber auburn"], place_facts: ["We replaced a water heater for a family in Auburn."] }, "Acme Plumbing", null, null);
  if (!/FACTS TRUE ONLY OF AUBURN/.test(wp) || !/water heater for a family in Auburn/.test(wp)) fail("the page's words aren't told to use the place's own facts"); }
if (!/const swapped = PL\.swappedName\(/.test(FE) || !/if \(swapped\.length >= 2\) return \{[\s\S]{0,300}outcome: "indeterminate"/.test(FE)) fail("a swapped-name draft is kept");
const h47 = FE.slice(FE.indexOf('"m1.web.service_location_matrix": async'), FE.indexOf('"m1.web.service_location_matrix": async') + 5000);
if (!/if \(!r\.plan \|\| !PB\.pageForService\(urls, r\.plan\.service\)\) continue;/.test(h47) || !/if \(!own\.length\) continue;/.test(h47) || !/PL\.placesWithProof\(/.test(h47) || !/if \(rule\.stop\) return/.test(h47)) fail("step 47 builds a service × place page without the service's page, real searches and proof (or ignores the business model)");
if (!/for \(const u of existing\.slice\(0, 60\)\) \{/.test(h47) || !/if \(existing\.length && read < Math\.min\(existing\.length, 60\)\) return \{[\s\S]{0,250}outcome: "indeterminate"/.test(h47)) fail("step 47 calls its existing pages checked after reading some of them (it read 8 of RGA's 50)");
if (/const r = PB\.planServiceAreaPage\(\{ site: ctx\.site, client, tasks: ctx\.tk, sitemapXml: ctx\.smXml, sitemapUrl: ctx\.smXml \? ctx\.smUrl : "", gbpAreas: ctx\.gbpAreas, planLocations: _plan\.locations/.test(h47)) fail("step 47 still builds the first service × place pair on the plan, proof or not");

if (bad.length) { console.error(`❌ place pages follow the research — ${bad.length} regression(s):`); for (const b of bad) console.error(`  · ${b}`); process.exit(1); }
console.log("✅ steps 46 and 47 never make a doorway: the business model first (whole country: none; customers visit: one per address), never the home city, another place only with proof, its own searches and facts on the page, a swapped-name copy refused; a service × place page only with the service's page, real searches and proof");
