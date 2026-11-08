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
import { pathToFileURL } from "node:url";
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

// every top service has a page: step 45 UPDATES them, the lines a rule finds (page_placement_and_links_v1)
{ const pg = `<html><body><main><h1>Welcome to Acme</h1><p>Studies show we are the best plumbers in town.</p><p>We guarantee same-day results.</p></main></body></html>`;
  const sl = PB.serviceLines(pg, "Drain Cleaning");
  if (!sl.some((x) => /headline doesn't say what the page is for/.test(x.why) && x.text === "Welcome to Acme")) fail("an existing service page whose headline doesn't name its service isn't flagged for an update");
  if (!sl.some((x) => /unsourced study|can't back/.test(x.why))) fail("an existing service page's claim we can't back isn't flagged");
  if (PB.serviceLines(`<main><h1>Drain cleaning in Springfield</h1><p>We clear drains.</p></main>`, "Drain Cleaning").length) fail("a clean service page is flagged (nothing to change)"); }
{ const SCx = req(path.join(SITE, "shared/site-change.js"));
  if (!SCx.STEPS["m1.web.priority_pages"].mayEdit) fail("step 45 can't carry an update to a page they have (only new pages)");
  const at = FE.indexOf('"m1.web.priority_pages": async'), body = FE.slice(at, at + 4500);
  if (!/if \(r\.none\) \{[\s\S]{0,900}PB\.serviceLines\(html, x\.service \|\| ""\);\s*if \(weak\.length\) return improveOnePage\(/.test(body)) fail("with every service page there, step 45 stops instead of updating them");
  if (!/outcome: "verified", outcome_data: \{ exists: r\.pages/.test(body)) fail("service pages checked clean don't finish the step as checked (it reads as 'couldn't conclude')");
  if (!/if \(own\.length && read < own\.length\) return \{[\s\S]{0,200}outcome: "indeterminate"/.test(body)) fail("service pages that couldn't be read are called checked"); }

// the client's link count is the BUILT page's
{ const html = `<html><body><header><a href="/a/">A</a><a href="/b/">B</a></header><main><a href="/services/drain-cleaning/">Drain</a><a href="/services/drain-cleaning/#faq">Drain again</a><a href="/contact/">Book</a><a href="/services/leak-detection/">self</a><a href="https://other.test/x/">out</a></main><footer><a href="/c/">C</a></footer></body></html>`;
  const n = AD.builtLinksOf({ site_change: { page_url: `${B}/services/leak-detection/`, items: [{ label: "Links on the page", after: "A → /a/\nB → /b/\nC → /c/\nD → /d/\nE → /e/" }] }, site_build: { files: [{ action: "add", html }] } });
  if (n !== 2) fail(`"Links to N of your pages" isn't counted on the built page's own words (got ${n}; the menu, footer, the page itself and other sites don't count)`);
  if (!/const n = builtLinksOf\(t\);\s*if \(n\) out\.push\(\{ ok: true, what: `Links to \$\{n\} of your pages` \}\);/.test(fs.readFileSync(path.join(SITE, "netlify/functions/admin-deliverables.js"), "utf8"))) fail("the client's card counts the draft's list of links, not the built page");
  if (AD.builtLinksOf({ site_change: { page_url: `${B}/x/` } }) !== 0) fail("a link count is claimed with no built page"); }

// ── part 2: a new page is PLACED on the site (the hub's own card, related cards, the menu by the approved rule) ──
{ const PP = req(path.join(SITE, "netlify/functions/_page-placement.js")), SCx = req(path.join(SITE, "shared/site-change.js"));
  const NAV = `<header><nav><a href="/">Home</a><div class="dd"><a class="nl" data-path="/services/drain-cleaning/" href="/services/drain-cleaning/">Drain Cleaning</a> <a class="nl" data-path="/services/water-heaters/" href="/services/water-heaters/">Water Heaters</a></div><a href="/contact/">Contact</a></nav></header>`;
  const FOOT = `<footer><nav class="col"><h4>Services</h4><a href="/services/drain-cleaning/">Drain Cleaning</a><a href="/services/water-heaters/">Water Heaters</a><a href="/services/">All Services</a></nav></footer>`;
  const HUB = `<html><body>${NAV}<main><h1>Our services</h1><div class="grid"><article class="card"><h3>Clear drains</h3><ul><li>Camera checks</li><li>Hydro jetting</li></ul><a class="go" href="/services/drain-cleaning/">Explore Drain Cleaning →</a></article><article class="card"><h3>Hot water again</h3><ul><li>Tank repair</li></ul><a class="go" href="/services/water-heaters/">Explore Water Heaters →</a></article></div></main>${FOOT}</body></html>`;
  const SIB = `<html><body>${NAV}<main><h1>Drain cleaning</h1><section><h2>Works best alongside</h2><a href="/services/water-heaters/"><strong>Water Heaters</strong><p>Hot water, fixed.</p><span>Explore →</span></a><a href="/services/drain-cleaning/"><strong>Drain Cleaning</strong><p>Clear drains.</p><span>Explore →</span></a></section></main>${FOOT}</body></html>`;
  const sibs = ["https://acme.test/services/drain-cleaning/", "https://acme.test/services/water-heaters/"], card = { href: "/services/leak-detection/", label: "Leak Detection", line: "We find hidden leaks without opening your walls." };
  const hub = PP.addToGroup(HUB, "main", sibs, card, "https://acme.test");
  if (!hub || !/<h3>Leak Detection<\/h3>/.test(hub) || !/href="\/services\/leak-detection\/">Explore Leak Detection →<\/a>/.test(hub)) fail("the hub doesn't get a card like its own for the new page (its heading, and its link words in the cards' own pattern)");
  else if (/Tank repair<\/li><\/ul><a class="go" href="\/services\/leak-detection/.test(hub) || (hub.match(/Tank repair/g) || []).length !== 1) fail("the copied card brings the other page's words along (its feature list)");
  if (hub && (hub.match(/<main[\s\S]*<\/main>/)[0].match(/leak-detection/g) || []).length !== 1) fail("the new page is added to the hub more than once, or outside its cards");
  const rel = PP.addToGroup(SIB, "main", sibs, card, "https://acme.test");
  if (!rel || !/<strong>Leak Detection<\/strong><p>We find hidden leaks without opening your walls\.<\/p><span>Explore →<\/span>/.test(rel)) fail("a related service page's related group doesn't get the new page as a card (name, line, its shared label kept)");
  const menu = PP.addToGroup(HUB, "header", sibs, card, "https://acme.test");
  if (!menu || !/data-path="\/services\/leak-detection\/" href="\/services\/leak-detection\/">Leak Detection<\/a>/.test(menu)) fail("the menu item isn't a copy of the menu's own items pointed at the new page (every attribute that named the other page)");
  const foot = PP.addToGroup(HUB, "footer", sibs, card, "https://acme.test");
  if (!foot || !/Water Heaters<\/a>\s*<a href="\/services\/leak-detection\/">Leak Detection<\/a><a href="\/services\/">All Services/.test(foot)) fail("the footer item isn't placed after the last service, before the rest");
  if (PP.addToGroup(hub, "main", sibs, card, "https://acme.test") !== null) fail("a page already on the hub is added again");
  if (PP.addToGroup(`<html><body><main><p>No cards here, only <a href="/services/drain-cleaning/">one link</a>.</p></main></body></html>`, "main", sibs, card, "https://acme.test") !== null) fail("a card is invented where the page has no group of its own");
  if (!PP.menuRule(1).menu || !PP.menuRule(50).menu || PP.menuRule(51).menu || PP.menuRule(2959).menu || PP.menuRule(0).menu || !/2,959/.test(PP.menuRule(2959).why)) fail("the menu rule isn't the approved one (a header on 50 pages or fewer gets the item; more, or uncounted, stays as it is, and says why)");
  const AD2 = fs.readFileSync(path.join(SITE, "netlify/functions/admin-deliverables.js"), "utf8");
  if (!/const asCard = PP\.addToGroup\(cur\.text, "main", sibsHere, card, site\);/.test(AD2) || !/asCard \|\| PB\.hubWithLink\(/.test(AD2)) fail("the build doesn't give the hub a card (a bare link only when it has no cards)");
  if (!/for \(const u of sibsHere\.slice\(0, 4\)\) \{\s*\/\/ each related service page's related group\s*const pth = pagePathOf\(u\), cur = await readFile\(pth, u\);/.test(AD2) || !/PP\.addToGroup\(cur\.text, "main", sibsHere\.filter\(\(x\) => x !== u\)\.concat\(\[u\]\), card, site\)/.test(AD2)) fail("the build doesn't add the new page to the related service pages");
  if (!/const rule = PP\.menuRule\(count\);/.test(AD2) || !/if \(rule\.menu && htmlPaths\) for \(const pth of htmlPaths\)/.test(AD2)) fail("the build doesn't follow the menu rule (or edits menus it didn't count)");
  if (!/c\.placement = placed;/.test(AD2) || !/if \(d\.page_for\) c\.page_for = /.test(AD2)) fail("where the page shows isn't recorded on the change (the client's card can't say it)");
  const cl = SCx.cleanChange("m1.web.priority_pages", { kind: "visible", new_page: true, page_url: "https://acme.test/services/leak-detection/", files: [{ path: "services/leak-detection/index.html", action: "add" }], items: [{ label: "Main headline", after: "x" }], page_for: "Leak Detection", placement: { hub: "card", related: 2, menu: { menu: false, why: "w", pages: 300 }, extra: 1 } });
  if (!cl.change || cl.change.page_for !== "Leak Detection" || !cl.change.placement || cl.change.placement.related !== 2 || cl.change.placement.menu.pages !== 300 || "extra" in cl.change.placement) fail("the cleaner drops the page's name or where it shows (or keeps what it shouldn't)");
  const PJ = fs.readFileSync(path.join(SITE, "portal/portal.js"), "utf8"), at = PJ.indexOf("function apvPlacedLine(p)"), end = PJ.indexOf("\n}\n", at) + 2;
  let line = null; try { line = new Function(`${PJ.slice(at, end)}; return apvPlacedLine;`)(); } catch { line = null; }
  const said = line ? line({ hub: "card", related: 2, menu: { menu: false, why: "your menu is written into each of your 2,959 pages, so it stays as it is; your Services page lists the new page" } }) : "";
  if (said !== "It also shows in a card on your Services page and a card on 2 related service pages. Your menu is written into each of your 2,959 pages, so it stays as it is; your Services page lists the new page.") fail(`the client's card doesn't say where the page shows, and why the menu stays (${said})`);
}

if (bad.length) { console.error(`❌ a page placed and linked — ${bad.length} regression(s):`); for (const b of bad) console.error(`  · ${b}`); process.exit(1); }
console.log("✅ a page is chosen from every page read (a service another page covers isn't built twice; blog, area and standard pages don't count; a partial read claims nothing), ranked by the plan, written for its own searches only (plan, else Search Console, else it asks), and its link count is the built page's");
