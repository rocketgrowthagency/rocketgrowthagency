#!/usr/bin/env node
/**
 * check-a-page-is-placed-and-linked.mjs — HOW A PAGE IS CHOSEN, PLACED AND LINKED (approved page_placement_and_links_v1, the owner 11-7).
 * Part 1 (11-7): step 45 reads every page before deciding; a service another page already covers gets no page of its own (RGA's
 * "Local SEO Audit" was built while /free-growth-audit/ was the same offer); services are ranked by the keyword plan; a page is
 * written only for its OWN searches (RGA's was written for the Services page's and the GBP page's); the client's "Links to N of your
 * pages" counts the BUILT page, not the draft's list. Fixtures: a made-up plumber's site.
 * Exit 0 = holds. 1 = doesn't. 2 = couldn't tell.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const req = createRequire(import.meta.url);
let PB, AD, FE;
try { PB = req(path.join(SITE, "netlify/functions/_page-builder.js")); AD = req(path.join(SITE, "netlify/functions/admin-deliverables.js")); FE = fs.readFileSync(path.join(SITE, "netlify/functions/flow-execute.js"), "utf8"); }
catch (e) { console.error(`⚠️  INDETERMINATE — couldn't load the page builder: ${e.message}`); process.exit(2); }
const bad = [], fail = (m) => bad.push(m);

const B = "https://acme.test";
const P = (p, title, h1 = "") => ({ url: `${B}${p}`, title: `${title} | Acme Plumbing`, h1 });
const PAGES = [P("/", "Acme Plumbing", "Plumbers in Springfield"), P("/pricing/", "Plumbing Prices", "Leak detection and drain cleaning prices"),
  P("/services/drain-cleaning/", "Drain Cleaning", "Drain cleaning in Springfield"), P("/services/water-heaters/", "Water Heater Repair", "Water heater repair"),
  P("/after-hours/", "24/7 Emergency Plumbing", "Plumbing help, day or night"), P("/areas/springfield/", "Leak Detection in Springfield", "Leak detection in Springfield"),
  P("/resources/articles/leak-detection-tips/", "Leak Detection Tips for Homeowners", "Leak detection tips"), P("/about/", "About Acme Plumbing", "About us"),
  P("/contact/", "Contact Acme Plumbing", "Contact")];
const opt = { places: ["Springfield"], blogDir: "/blog/", serviceDir: "/services/" };

// a service another page already covers is not built twice; a page that only mentions it doesn't count
if (PB.coveredBy("Emergency Plumbing", PAGES, opt) !== `${B}/after-hours/`) fail("a service another page covers under another address isn't found (RGA's Local SEO Audit was the free audit page)");
if (PB.coveredBy("Leak Detection", PAGES, opt) !== null) fail("a service is called covered by an area page, a blog post or the pricing page (each talks about it; none is its page)");
if (PB.coveredBy("Water Heater Repair", PAGES.slice(0, 4), opt) !== null) fail("with too few pages read to tell common words from rare ones, a service is called covered");
if (PB.coveredBy("Water Heater Installation", PAGES, opt) !== null) fail("a page that shares only some of a service's rare words is called its page (water heater REPAIR isn't installation)");
if (PB.coveredBy("Plumbing", PAGES, opt) !== null) fail("a service whose words are on most of their pages is called covered by the first one (no rare word to match)");

// ranked by the keyword plan, then Google's order
if (PB.rankServices(["Water Heater Repair", "Drain Cleaning", "Leak Detection"], ["leak detection springfield", "drain cleaning near me", "leak detection near me"]).join("|") !== "Leak Detection|Drain Cleaning|Water Heater Repair") fail("the top services follow the order Google lists them, not the keyword plan");

// a page is written only for its own searches
const plan = (keywords) => PB.planServicePage({ site: B, client: { secondary_services: ["Drain Cleaning", "Leak Detection"], primary_market: "Springfield, IL" }, tasks: {},
  sitemapXml: `<urlset>${PAGES.map((p) => `<url><loc>${p.url}</loc></url>`).join("")}</urlset>`, sitemapUrl: `${B}/sitemap.xml`, gbpAreas: [], planLocations: ["Springfield"], keywords, filesOnGithub: true, pages: PAGES });
const p1 = plan(["plumber springfield", "emergency plumber near me"]);
if (!p1.plan || p1.plan.page_for !== "Leak Detection") fail(`the plan doesn't pick the service with no page (${JSON.stringify(p1).slice(0, 120)})`);
else if ((p1.plan.searches || []).length) fail(`a page is given other pages' searches (${p1.plan.searches.join(", ")}): RGA's audit page was written for the Services and GBP pages' searches`);
const p2 = plan(["leak detection springfield", "plumber springfield"]);
if (!p2.plan || p2.plan.searches.join("|") !== "leak detection springfield") fail("a page doesn't get the plan's searches that name it");
const own = PB.ownSearches({ kind: "service", page_for: "Leak Detection" }, [{ query: "leak detection springfield", impressions: 40 }, { query: "plumber springfield", impressions: 900 }, { query: "slab leak detection", impressions: 60 }]);
if (own.join("|") !== "slab leak detection|leak detection springfield") fail(`Search Console's searches for the page aren't its own, most seen first (${own.join(", ")})`);
if (PB.ownSearches({ kind: "service_area", service: "Leak Detection", page_for: "Springfield" }, [{ query: "leak detection", impressions: 9 }, { query: "leak detection springfield", impressions: 3 }]).join("|") !== "leak detection springfield") fail("a service and area page's own searches don't need both the service and the place");
{ const at = FE.indexOf("async function draftOnePage"), body = FE.slice(at, at + 4000);
  if (!/if \(!\(plan\.searches \|\| \[\]\)\.length\) \{\s*const own = PB\.ownSearches\(plan, gscRows\);\s*if \(!own\.length\) return \{[\s\S]{0,900}?outcome: "blocked"/.test(body)) fail("a page with no search of its own is drafted anyway (it must fill from Search Console, or ask)"); }
const cov = plan(["leak detection springfield"]); // all three covered: drain + leak (no page) ...
{ const all = PB.planServicePage({ site: B, client: { secondary_services: ["Drain Cleaning", "Emergency Plumbing"] }, tasks: {}, sitemapXml: `<urlset>${PAGES.map((p) => `<url><loc>${p.url}</loc></url>`).join("")}</urlset>`, sitemapUrl: "", gbpAreas: [], planLocations: [], keywords: [], filesOnGithub: true, pages: PAGES });
  if (!all.none || !(all.covered || []).some((x) => x.service === "Emergency Plumbing" && x.page === `${B}/after-hours/`)) fail("a site whose services are all covered still gets a page, or the card doesn't say which page covers which service"); }
void cov;
// the business's primary service is what it IS: the homepage is its page (RGA's step 45 then picked "seo company")
{ const pr = PB.planServicePage({ site: B, client: { primary_service: "plumber", secondary_services: ["Drain Cleaning"] }, tasks: {}, sitemapXml: `<urlset>${PAGES.map((p) => `<url><loc>${p.url}</loc></url>`).join("")}</urlset>`, sitemapUrl: "", gbpAreas: [], planLocations: [], keywords: ["plumber springfield", "plumber near me"], filesOnGithub: true, pages: PAGES });
  if (!pr.none || !(pr.covered || []).some((x) => x.service === "plumber" && x.page === `${B}/`)) fail(`the business's own type ("plumber") gets a page of its own instead of its homepage (${JSON.stringify(pr).slice(0, 100)})`); }

// step 45 reads every page before deciding, and won't claim "no page covers it" on a partial read
if (!/const all = await readSitePages\(require\("\.\/_city-page"\)\.sitemapUrls\(ctx\.smXml\)\);/.test(FE) || !/all\.unread\.length > Math\.max\(1, all\.urls \* 0\.05\)/.test(FE) || !/PB\.planServicePage\(\{ pages: all\.pages,/.test(FE)) fail("step 45 decides without reading every page, or claims no page covers a service with pages unread");

// the client's link count is the BUILT page's
{ const html = `<html><body><header><a href="/a/">A</a><a href="/b/">B</a></header><main><a href="/services/drain-cleaning/">Drain</a><a href="/services/drain-cleaning/#faq">Drain again</a><a href="/contact/">Book</a><a href="/services/leak-detection/">self</a><a href="https://other.test/x/">out</a></main><footer><a href="/c/">C</a></footer></body></html>`;
  const n = AD.builtLinksOf({ site_change: { page_url: `${B}/services/leak-detection/`, items: [{ label: "Links on the page", after: "A → /a/\nB → /b/\nC → /c/\nD → /d/\nE → /e/" }] }, site_build: { files: [{ action: "add", html }] } });
  if (n !== 2) fail(`"Links to N of your pages" isn't counted on the built page's own words (got ${n}; the menu, footer, the page itself and other sites don't count)`);
  if (!/const n = builtLinksOf\(t\);\s*if \(n\) out\.push\(\{ ok: true, what: `Links to \$\{n\} of your pages` \}\);/.test(fs.readFileSync(path.join(SITE, "netlify/functions/admin-deliverables.js"), "utf8"))) fail("the client's card counts the draft's list of links, not the built page");
  if (AD.builtLinksOf({ site_change: { page_url: `${B}/x/` } }) !== 0) fail("a link count is claimed with no built page"); }

if (bad.length) { console.error(`❌ a page placed and linked — ${bad.length} regression(s):`); for (const b of bad) console.error(`  · ${b}`); process.exit(1); }
console.log("✅ a page is chosen from every page read (a service another page covers isn't built twice; blog, area and standard pages don't count; a partial read claims nothing), ranked by the plan, written for its own searches only (plan, else Search Console, else it asks), and its link count is the built page's");
