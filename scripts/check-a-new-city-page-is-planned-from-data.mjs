#!/usr/bin/env node
// check-a-new-city-page-is-planned-from-data.mjs — 2026-10-27, approved rga_first_site_change_v1 (Chris: "approved build it").
// Row 45 drafts ONE new city page as a WEBSITE CHANGE (For your approval → publish → read back). RUNS the planner on RGA's real
// sitemap and on other client shapes, and the shared rules, and checks the wiring of the drafter and both cards:
//   · the address, links, areas, searches and files come from DATA (sitemap · Business Profile · locked plan), never a model
//   · a client with no city pages, a page that already exists, a client with no city → each handled, none invented
//   · the model's words are refused with an invented number / promise, a placeholder, an emoji, or the city missing
//   · a new page needs its address + its file; a file path can't climb out ("../"); links / areas / questions aren't read back
//     word for word; row 45 is no longer a "copy" step (done only when live)
//   · the client's card shows the address, the searches and EVERY file that changes; admin keeps the files when it saves
//   · no prompt asks for a "fake-but-believable" testimonial
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 regressed · 2 code moved
import fs from "node:fs";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SCR = "/Users/chris/RGA/Rocket Growth Agency Scraper VS Code";
const read = (r, base = SITE) => { try { return fs.readFileSync(`${base}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = [], fail = (m) => F.push(m);
const req = createRequire(`${SITE}/netlify/functions/x.js`);
let CP, SC;
try { CP = req(`${SITE}/netlify/functions/_city-page.js`); SC = req(`${SITE}/shared/site-change.js`); } catch (e) { console.error(`⚠️  INDETERMINATE — ${e.message}`); process.exit(2); }

// ── 1 · RGA, on its real sitemap ─────────────────────────────────────────────────────────────
const XML = read("sitemap.xml");
const RGA = CP.planPage({ site: "https://www.rocketgrowthagency.com/", market: "Culver City, CA", service: "seo company", sitemapXml: XML, sitemapUrl: "https://www.rocketgrowthagency.com/sitemap.xml",
  gbpAreas: ["El Segundo, CA, USA", "Culver City, CA, USA", "Los Angeles, CA, USA", "Santa Monica, CA, USA", "Manhattan Beach, CA, USA", "Marina Del Rey, CA 90292, USA"],
  planLocations: ["Mar Vista", "Palms", "Playa Vista"], keywords: ["local seo services near me", "google business profile optimization", "local seo agency culver city", "seo company culver city ca", "search engine optimization agencies"], filesOnGithub: true });
const inCity = CP.pagesInCity(CP.sitemapUrls(XML), CP.cityOf("Culver City, CA")).length;
if (RGA.url !== "https://www.rocketgrowthagency.com/local-seo/culver-city-ca/") fail(`RGA's page isn't /local-seo/culver-city-ca/ (got ${RGA.url || RGA.error || JSON.stringify(RGA.exists)})`);
if (!RGA.links || RGA.links.length !== inCity || inCity < 40) fail(`the page doesn't link RGA's own Culver City pages (${RGA.links && RGA.links.length} of ${inCity})`);
if (RGA.links && !RGA.links.some((l) => l.label === "HVAC") ) fail("a link label lost its acronym (\"Hvac\" instead of \"HVAC\")");
if (JSON.stringify(RGA.areas) !== JSON.stringify(["Culver City", "El Segundo", "Los Angeles", "Santa Monica", "Manhattan Beach", "Marina Del Rey", "Mar Vista", "Palms", "Playa Vista"])) fail(`the areas aren't the Business Profile's + the plan's (${RGA.areas})`);
if (JSON.stringify(RGA.searches) !== JSON.stringify(["local seo agency culver city", "seo company culver city ca"])) fail(`the searches aren't the plan's Culver City terms (${RGA.searches})`);
const paths = (RGA.files || []).map((f) => `${f.action}:${f.path}`).join(" ");
if (paths !== "add:local-seo/culver-city-ca/index.html edit:sitemap.xml edit:local-seo/index.html") fail(`the files aren't the new page + the sitemap line + the hub link (${paths})`);

// ── 2 · other clients (EVERY STEP MUST BE UNIVERSAL) ─────────────────────────────────────────
const joe = CP.planPage({ site: "https://joesplumbing.com", market: "Denver, CO", service: "Plumber", sitemapXml: "<loc>https://joesplumbing.com/</loc><loc>https://joesplumbing.com/water-heaters/</loc>", keywords: ["plumber denver", "emergency plumber"], filesOnGithub: false });
if (joe.url !== "https://joesplumbing.com/plumber-denver-co/" || joe.links.length || joe.files.length !== 1 || JSON.stringify(joe.searches) !== '["plumber denver"]') fail(`a client with no city pages isn't /<service>-<city>/ with just its own file (${JSON.stringify(joe).slice(0, 160)})`);
const dup = CP.planPage({ site: "https://www.rocketgrowthagency.com", market: "Culver City, CA", service: "seo", sitemapXml: XML + "<loc>https://www.rocketgrowthagency.com/local-seo/culver-city-ca/</loc>", keywords: ["x"] });
if (!dup.exists) fail("a page that already exists is drafted again (it should say so and stop)");
if (!CP.planPage({ site: "https://x.test", market: "", keywords: ["x"] }).error) fail("a client with no city gets a page anyway");
if (!CP.planPage({ site: "", market: "Austin, TX", keywords: ["x"] }).error) fail("a client with no website gets a page address anyway");
if (CP.cityOf("London").slug !== "london" || CP.cityOf("Montréal, QC").citySlug !== "montreal") fail("a city with no state, or with an accent, isn't handled");

// ── 3 · the model's words ────────────────────────────────────────────────────────────────────
const C = CP.cityOf("Culver City, CA");
const good = { title: "Local SEO Agency in Culver City, CA | Rocket Growth Agency", description: "Google Maps and local SEO for Culver City businesses.", h1: "Local SEO agency in Culver City",
  intro: "We help businesses here get found. Every plan starts with an audit.", how: "Audit, plan, build, report.", button: "Get a free growth audit",
  faq: [1, 2, 3, 4, 5].map((n) => ({ q: `Question ${n}?`, a: `Answer ${n}. More detail.` })) };
if (CP.checkWords(good, C).problems) fail(`good words are refused (${CP.checkWords(good, C).problems})`);
for (const [what, patch] of [["an invented client count", { intro: "We have 200+ clients. Ask us." }], ["a percentage", { how: "Rankings up 98% in a month." }], ["a #1 claim", { description: "The #1 SEO agency in Culver City." }],
  ["a guarantee", { faq: [...good.faq.slice(0, 4), { q: "Do you guarantee?", a: "Yes, guaranteed results." }] }], ["a placeholder", { intro: "We help [[CITY]] businesses. Really." }], ["an emoji", { button: "Start now 🚀" }],
  ["a title without the city", { title: "Local SEO Agency | Rocket Growth Agency" }], ["a 70-character title", { title: "Local SEO Agency in Culver City, CA, Los Angeles County | Rocket Growth" }], ["3 questions", { faq: good.faq.slice(0, 3) }]])
  if (!CP.checkWords({ ...good, ...patch }, C).problems) fail(`the words are kept with ${what}`);

// the model's answer as it really arrives (10-27: RGA's first run failed "not JSON" — paragraphs with real line breaks)
{ const j = CP.parseJsonLoose('Sure:\n```json\n{"title":"A","intro":"One.\n\nTwo.","faq":[{"q":"x","a":"say \\"hi\\""}]}\n```');
  if (!j || j.intro !== "One.\n\nTwo." || j.faq[0].a !== 'say "hi"') fail("a fenced answer with line breaks inside a paragraph isn't read (the first real run failed so)");
  if (CP.parseJsonLoose("no json here") !== null) fail("prose is read as a page");
  if (!/outcome_data: \{ problems: w\.problems, raw_head: String\(raw \|\| ""\)\.slice\(0, 600\)/.test(read("netlify/functions/flow-execute.js"))) fail("an unusable answer is thrown away whole again (keep its start + end to read the cause)"); }

// ── 4 · the shared rules ─────────────────────────────────────────────────────────────────────
if (SC.COPY_STEPS.includes("m1.web.location_pages") || !SC.isSiteChangeStep("m1.web.location_pages") || !SC.STEPS["m1.web.location_pages"].newPage) fail("row 45 is still a copy step (done on approval, never read back live)");
const base = { page_url: "https://x.test/local-seo/culver-city-ca/", items: [{ label: "Page title", role: "title", after: "Local SEO Agency in Culver City" }, { label: "Links on the page", after: "A → /a/\nB → /b/", check: false }], files: [{ path: "local-seo/culver-city-ca/index.html", action: "add" }], searches: ["local seo agency culver city"] };
const ok = SC.cleanChange("m1.web.location_pages", base);
if (!ok.change || !ok.change.new_page || ok.change.files.length !== 1 || ok.change.searches.length !== 1) fail("a new page loses its files or searches when it's saved");
if (!SC.cleanChange("m1.web.location_pages", { ...base, page_url: "" }).error) fail("a new page saves without its address");
if (!SC.cleanChange("m1.web.location_pages", { ...base, files: [] }).error) fail("a new page saves without its file (the client wouldn't see what changes)");
if ((SC.cleanChange("m1.web.location_pages", { ...base, files: [...base.files, { path: "../../etc/passwd", action: "add" }, { path: "https://evil.test/x", action: "add" }] }).change || { files: [] }).files.length !== 1) fail("a file path that climbs out of the site (../ or a URL) is kept");
if (ok.change && SC.missingOnPage(ok.change, "<title>Local SEO Agency in Culver City</title>").length) fail("the links / areas / questions are read back word for word (they're approved as a whole)");
if (ok.change && !SC.missingOnPage(ok.change, "<title>other</title>").includes("Page title")) fail("the live check no longer refuses a page missing its approved title");
if (ok.change && !/File \(new\): local-seo\/culver-city-ca\/index\.html/.test(SC.changeText(ok.change, "x"))) fail("the frozen approval text doesn't list the files");
if (!SC.cleanChange("m1.web.homepage_meta", { items: [{ label: "Page title", role: "title", after: "T" }] }).change || SC.cleanChange("m1.web.homepage_meta", { items: [{ label: "Page title", role: "title", after: "T" }] }).change.new_page) fail("an ordinary website change now needs (or carries) new-page fields");

// ── 5 · the drafter, the prefill and the cards (wiring) ──────────────────────────────────────
const FE = read("netlify/functions/flow-execute.js"), AD = read("netlify/functions/admin-deliverables.js"), PD = read("netlify/functions/portal-deliverables.js"), P = read("portal/portal.js"), A = read("admin/admin.js");
const blk = (() => { const i = FE.indexOf('"m1.web.location_pages": async'); return i < 0 ? "" : FE.slice(i, FE.indexOf('"m1.web.blog_seed": async', i)); })();
if (!blk) { console.error("⚠️  INDETERMINATE — the row 45 runner moved"); process.exit(2); }
if (!/CP\.planPage\(\{ site, market: client\.primary_market/.test(blk) || !/CP\.checkWords\(j, plan\.city\)/.test(blk) || !/if \(w\.problems\) return \{ summary: `The draft broke the page rules, so nothing was saved/.test(blk) || !/outcome_data: \{ page_draft, draft: summary \}/.test(blk)) fail("row 45 doesn't plan from data, check the words, and keep only a clean draft");
if (!/key === "m1\.web\.location_pages" && od\.page_draft/.test(AD) || !/c\.page_url = d\.url \|\| null; c\.files = d\.files \|\| \[\]; c\.searches = d\.searches \|\| \[\]/.test(AD)) fail("\"Fill from the site + the run\" doesn't carry the page's address, files and searches");
if (!/\.\.\.\(c\.new_page \? \{ new_page: true, page_url: c\.page_url \|\| null, files: c\.files \|\| \[\], searches: c\.searches \|\| \[\] \} : \{\}\)/.test(PD)) fail("the client's card isn't sent the new page's address, files and searches");
if (!/<b>A new page on your website<\/b>/.test(P) || !/<b>Written for these searches<\/b>/.test(P) || !/<span>Every file that changes<\/span>/.test(P) || !/items\.filter\(\(x\) => x\.check === false && x\.after\)/.test(P)) fail("the client's card doesn't show the new page's address, its searches, every file, and fold the long lists");
if (!/let extra = \{\}; try \{ extra = JSON\.parse\(form\.querySelector\(':scope > \[data-f="extra"\]'\)/.test(A) || !/\n  return \{ \.\.\.extra,\n/.test(A) || !/mergeStepTasks\(\{ \[stepId\]: task \}\)/.test(A)) fail("admin's draft form drops the files / searches when it saves, or writes one copy of the record");
if (!/const runB = def && def\.hasRunner !== false && !ran \? `<button type="button" class="admin-button" data-onboard-run="\$\{escapeAttribute\(id\)\}">⚡ Draft this for me<\/button>` : "";/.test(A)) fail("a queued website step has no way to draft (its card lost \"Draft this for me\")");
for (const [f, src] of [["flow-execute.js", FE], ["flow/playbooks/month1.mjs", read("flow/playbooks/month1.mjs", SCR)]]) if (/fake-but-believable/i.test(src)) fail(`${f} asks for an invented testimonial again`);
if (!/"clientLabel": "A new page for your city"/.test(read("data/playbooks/playbooks.json"))) fail("the client's step name isn't \"A new page for your city\"");

if (F.length) { console.error(`❌ a new city page — ${F.length} regression(s):\n  · ${F.join("\n  · ")}`); process.exit(1); }
console.log(`✅ a new city page is planned from data: RGA → /local-seo/culver-city-ca/ with its ${inCity} Culver City pages, 9 areas, the plan's 2 searches and 3 files; a plumber with none → /plumber-denver-co/; an existing page / no city / no site → stopped; invented numbers, promises, placeholders, emoji refused; a website change (read back live), files on the client's card`);
