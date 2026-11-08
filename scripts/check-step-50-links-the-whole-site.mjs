#!/usr/bin/env node
/**
 * check-step-50-links-the-whole-site.mjs — STEP 50 READS EVERY PAGE AND FIXES THE LINKS IN APPROVED BATCHES (approved page_placement_and_links_v1
 * part 3, the owner 11-7). Before: it read the first 30 of RGA's 261 pages, counted the menu as links in the words, and changed nothing.
 * Fixtures: a made-up plumber's site (a services folder with a thin page, a blog, a page only the footer links to, a page nothing links to,
 * a "click here" link, a call-to-action paragraph).
 * Exit 0 = holds. 1 = doesn't. 2 = couldn't tell.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const req = createRequire(import.meta.url);
const read = (p) => fs.readFileSync(path.join(SITE, p), "utf8");
let IL, SC, AR, RB, FE, AD, WATCH, PUB;
try { IL = req(path.join(SITE, "netlify/functions/_internal-links.js")); SC = req(path.join(SITE, "shared/site-change.js")); AR = req(path.join(SITE, "netlify/functions/_website-autorun.js")); RB = req(path.join(SITE, "netlify/functions/_page-readback.js"));
  FE = read("netlify/functions/flow-execute.js"); AD = read("netlify/functions/admin-deliverables.js"); WATCH = read("netlify/functions/site-change-watch.js"); PUB = await import(pathToFileURL(path.join(SITE, "scripts/publish-own-site.mjs")).href); }
catch (e) { console.error(`⚠️  INDETERMINATE — couldn't load step 50: ${e.message}`); process.exit(2); }
const bad = [], fail = (m) => bad.push(m);

const B = "https://acme.test";
const NAV = `<header><nav><a href="/services/">Services</a><a href="/services/drain-cleaning/">Drain cleaning</a></nav></header>`, FOOT = `<footer><a href="/water-report/">Water report</a></footer>`;
const pg = (title, desc, main) => `<html><head><title>${title} | Acme</title><meta name="description" content="${desc}"></head><body>${NAV}<main>${main}</main>${FOOT}</body></html>`;
const P = (p, prose) => `<p>${prose}</p>`;
const PAGES = {
  "/": pg("Acme Plumbing", "Plumbers in Springfield.", `<h1>Plumbers in Springfield</h1>${P(0, "We fix leaks, clear drains and repair water heaters for homes across the city every week.")}<a href="/services/drain-cleaning/">Drain cleaning</a><a href="/blog/hard-water-and-your-pipes/">Hard water</a><a href="/blog/finding-hidden-leaks/">Hidden leaks</a>`),
  "/services": pg("Services", "All our plumbing services.", `<h1>Services</h1><a href="/services/drain-cleaning/">Drain cleaning</a><a href="/services/water-heaters/">Water heaters</a><a href="/services/leak-detection/">Leak detection</a>`),
  "/services/drain-cleaning": pg("Drain Cleaning", "Clear slow and blocked drains.", `<h1>Drain cleaning</h1>${P(0, "Slow drains usually mean buildup deep in the pipe, and a camera check shows exactly where it sits before anything is cleared.")}<a href="/services/water-heaters/">Water heaters</a>`),
  "/services/water-heaters": pg("Water Heaters", "Water heater repair and replacement.", `<h1>Water heaters</h1>${P(0, "A water heater that runs out of hot water early often has sediment in the tank, which a flush can clear before it damages the heater.")}<a href="/services/drain-cleaning/">Drain cleaning</a><a href="/blog/hard-water-and-your-pipes/">click here</a>`),
  "/services/leak-detection": pg("Leak Detection", "Find hidden leaks behind walls and under floors without tearing them open, using sound and heat cameras.", `<h1>Leak detection</h1>${P(0, "Hidden leaks waste water and damage walls, floors and ceilings long before anyone sees a stain on the paint.")}`),
  "/blog/hard-water-and-your-pipes": pg("Hard Water and Your Pipes", "What hard water does to pipes and heaters.", `<h1>Hard water and your pipes</h1>${P(0, "Hard water leaves mineral scale inside pipes and heaters, and over time that scale narrows the pipe and hides small leaks behind walls.")}<p>Book a free check — call (555) 010-2000 today.</p>`),
  "/blog/finding-hidden-leaks": pg("Finding Hidden Leaks Behind Walls", "How to spot hidden leaks behind walls and floors.", `<h1>Finding hidden leaks behind walls</h1>${P(0, "A hidden leak behind walls or under floors shows up first as a higher water bill, a musty smell, or warm spots on the floor near a pipe.")}<a href="/services/water-heaters/">water heaters</a><a href="/services/drain-cleaning/">drain cleaning</a>`),
  "/water-report": pg("Springfield Water Report", "Hard water levels and leak rates across Springfield homes, by neighborhood.", `<h1>Springfield water report</h1>${P(0, "This report looks at hard water and leaks across the city, one neighborhood at a time, from homes we have visited.")}`),
  "/forgotten": pg("Old Coupon", "An old coupon page.", `<h1>Old coupon</h1>${P(0, "This page held a coupon for a past season and nothing links to it any more from anywhere on the site.")}`),
};
const pages = Object.entries(PAGES).map(([p, h]) => IL.readPage(`${B}${p === "/" ? "/" : `${p}/`}`, h, B));

// reading a page: its own words apart from its menu and footer
const dc = pages.find((p) => p.path === "/services/drain-cleaning");
if (dc.links.some((l) => l.to === "/services") || !dc.nav.includes("/services") || !dc.nav.includes("/water-report")) fail("a page's menu and footer links are counted as links in its words (every page looked well linked)");
if (!/Clear slow and blocked drains/.test(dc.desc) || dc.paras.length !== 1) fail("a page's description and plain paragraphs aren't read");

// the audit: every page, by group, the gaps
const a = IL.auditSite(pages, { serviceDir: "/services/" });
if (a.read !== pages.length || !a.complete || !a.groups.some((g) => g.folder === "/services/" && g.pages === 3 && g.hub === "/services")) fail("the audit doesn't read every page and group them by folder (with the folder's own page)");
if (JSON.stringify(a.unreachable) !== JSON.stringify(["/forgotten"])) fail(`a page nothing links to at all isn't found, or one the menu reaches is called unreachable (${JSON.stringify(a.unreachable)})`);
if (JSON.stringify(a.orphans) !== JSON.stringify(["/water-report"])) fail(`a page only the footer links to isn't found, or a folder's own page is (${JSON.stringify(a.orphans)})`);
if (!a.thin.some((x) => x.path === "/services/leak-detection" && x.in === 1) || a.thin.some((x) => x.path === "/services")) fail("a service page with fewer than 3 links in from other pages' words isn't found (or the hub is called a service page)");
if (!a.generic.some((g) => g.text === "click here" && g.on === "/services/water-heaters")) fail("\"click here\" link words aren't found");
const part = IL.auditSite(pages.slice(1), { unread: ["x"], serviceDir: "/services/" });
if (part.orphans !== null || part.unreachable !== null || part.thin !== null) fail("with a page unread, the audit still says which pages nothing links to (an unread page's links are missing)");

// the batch: who links to whom
const batch = IL.planBatch(pages, a, { per: 2 });
if (!batch.length || batch[0].target !== "/forgotten" && batch.filter((x) => x.target === "/forgotten").length) {/* nothing related may link to an old coupon: that's right */}
if (batch.some((x) => x.source === "/" || x.source === "/services")) fail("the homepage or a folder's own page is given a new link (their words are other steps')");
if (batch.some((x) => pages.find((p) => p.path === x.source).links.some((l) => l.to === x.target))) fail("a page that already links to the target is given another link to it");
const ld = batch.filter((x) => x.target === "/services/leak-detection");
if (!ld.some((x) => x.source === "/blog/finding-hidden-leaks")) fail("the page most about the target (by its description's words) isn't chosen to link to it");
const wr = batch.filter((x) => x.target === "/water-report");
if (!wr.some((x) => x.source === "/blog/hard-water-and-your-pipes")) fail("the report isn't linked from the post about its topic");
if (batch.some((x) => /—|\d/.test(x.para))) fail("a sentence is added to a call-to-action paragraph (a dash, a phone number)");
const counts = {}; for (const x of IL.planBatch(pages, a, { per: 9, targets: 9 })) counts[x.source] = (counts[x.source] || 0) + 1;
if (Object.values(counts).some((n) => n > 3)) fail("a page gets more than 3 new links in one batch");

// who links to whom, rule by rule, on pages made for each rule
{ const mk = (p, title, desc, paras, links = [], nav = []) => ({ url: `${B}${p}/`, path: p, title, h1: title, desc, paras, links: links.map((to) => ({ to, text: "x" })), nav });
  const prose = (w) => `This paragraph talks about ${w} in plain words for homeowners who want to understand it before they call anyone.`;
  const T = mk("/services/sump-pumps", "Sump Pumps", "Sump pump installs, repair and battery backups for flooded basements.", [prose("sump pumps")]);
  const filler = ["/f1", "/f2", "/f3", "/f4", "/f5", "/f6"].map((p, i) => mk(p, `Filler ${i}`, "Other things.", [prose(`topic ${i}`)]));
  const run = (extra, o = {}) => IL.planBatch([T, ...filler, ...extra], { thin: [{ path: "/services/sump-pumps", in: 0 }], orphans: [], unreachable: [], groups: [] }, { per: 1, targets: 1, ...o });
  // the title outweighs the paragraphs
  const titled = mk("/blog/basement-flooding-and-sump-pumps", "Basement Flooding and Sump Pumps", "", [prose("water in a basement")]);
  const wordy = mk("/blog/spring-checklist", "Spring Checklist", "", [prose("sump pump battery backup flooded basement repair sump pump install basement")]);
  if ((run([wordy, titled])[0] || {}).source !== "/blog/basement-flooding-and-sump-pumps") fail("a page that only mentions the topic beats the page ABOUT it (its title and headline)");
  // a page that links already isn't given another
  const linked = mk("/blog/sump-pump-guide", "Sump Pump Guide", "", [prose("sump pumps and basements")], ["/services/sump-pumps"]);
  if (run([linked]).some((x) => x.source === "/blog/sump-pump-guide")) fail("a page that already links to the target is given another link to it");
  // one shared word isn't a topic
  const one = mk("/blog/battery-recycling", "Battery Recycling", "", [prose("old batteries")]);
  if (run([one]).some((x) => x.source === "/blog/battery-recycling")) fail("a page sharing one word with the target ('battery') is called related");
  // plurals are the same word
  const plural = mk("/blog/flooded-basements", "Flooded Basements and Backups", "", [prose("flooded basements")]);
  if (!run([plural]).some((x) => x.source === "/blog/flooded-basements")) fail("a page about the topic in the plural ('basements', 'backups') isn't found");
  // a call to action never gets the sentence
  const cta = mk("/blog/sump-pump-repair", "Sump Pump Repair", "", ["Book a sump pump check today — call (555) 010-2000 for a basement visit this week."]);
  if (run([cta]).some((x) => x.source === "/blog/sump-pump-repair")) fail("a sentence is added to a call-to-action paragraph (a dash, a phone number)");
  // at most 3 new links on a page
  const targets = ["/services/a1", "/services/a2", "/services/a3", "/services/a4"].map((p, i) => mk(p, `Sump Pump Service ${i}`, "Sump pump installs and flooded basement repair.", [prose(`service ${i}`)]));
  const hubpage = mk("/blog/sump-pumps-explained", "Sump Pumps Explained for Flooded Basements", "", [prose("sump pumps and flooded basements")]);
  const many = IL.planBatch([...targets, hubpage, ...filler], { thin: targets.map((t0) => ({ path: t0.path, in: 0 })), orphans: [], unreachable: [], groups: [] }, { per: 1, targets: 4 });
  if (many.filter((x) => x.source === "/blog/sump-pumps-explained").length > 3) fail("a page gets more than 3 new links in one batch"); }
// a page with no <main>: its menu and footer still aren't its words
{ const nm = IL.readPage(`${B}/x/`, `<html><body><header><nav><a href="/services/">Services</a></nav></header><div><p>Our <a href="/blog/finding-hidden-leaks/">leak guide</a> explains it.</p></div><footer><a href="/water-report/">Report</a></footer></body></html>`, B);
  if (nm.links.some((l) => l.to === "/services" || l.to === "/water-report") || !nm.links.some((l) => l.to === "/blog/finding-hidden-leaks")) fail("on a page with no main area, its menu and footer links are counted as its words"); }

// the sentence the model writes
const pair = { target_name: "Leak Detection", target_url: `${B}/services/leak-detection/` };
const ok = IL.checkSentence({ sentence: "If you see those signs, our leak detection service finds the source without opening the wall.", anchor: "leak detection service" }, pair);
if (!ok.sentence) fail(`a good sentence is refused (${ok.problem})`);
for (const [j, what] of [[{ sentence: "Learn more here.", anchor: "here" }, "generic"], [{ sentence: "We can help with that.", anchor: "leak detection" }, "missing"], [{ sentence: "Call us about water heaters today.", anchor: "water heaters" }, "wrong page"], [{ sentence: "Our leak detection finds 9 of 10 leaks.", anchor: "leak detection" }, "number"], [{ sentence: `Our leak detection ${"really ".repeat(40)}helps.`, anchor: "leak detection" }, "long"]])
  if (!IL.checkSentence(j, pair).problem) fail(`a bad sentence passes (${what})`);
if (!IL.checkSentence({ skip: "it wouldn't read naturally" }, pair).skip) fail("the model can't decline a page where the link wouldn't fit");

// the edit on the page, exactly as approved, and read back
const html = PAGES["/blog/finding-hidden-leaks"], before = "A hidden leak behind walls or under floors shows up first as a higher water bill, a musty smell, or warm spots on the floor near a pipe.";
const item = { label: "On Finding Hidden Leaks Behind Walls", before, after: `${before} Our leak detection finds the source without opening the wall.`, page: `${B}/blog/finding-hidden-leaks/`, link: { text: "leak detection", href: "/services/leak-detection/" } };
const ed = IL.applyLinkEdits(html, [item]);
if (ed.error || !ed.html.includes(`Our <a href="/services/leak-detection/">leak detection</a> finds the source without opening the wall.</p>`)) fail(`the approved sentence isn't put in its paragraph with its link (${ed.error || ""})`);
if (!IL.applyLinkEdits(html.replace("a musty smell", "a damp smell"), [item]).error) fail("a paragraph that changed since it was read still gets the sentence");
if (IL.applyLinkEdits(ed.html, [item]).error) fail("putting up the same approved links twice fails (a re-run must find them already there)");
if (IL.linksMissing([item], ed.html).length || !IL.linksMissing([item], html).length) fail("the read-back doesn't find a link that's there (or finds one that isn't)");

// the step, end to end
const h = FE.slice(FE.indexOf('"m1.web.internal_linking": async'), FE.indexOf('"m1.web.internal_linking": async') + 6000);
{ const hv = FE.slice(FE.indexOf("const HEAVY = new Set(["), FE.indexOf("]);", FE.indexOf("const HEAVY = new Set([")));
  if (!/"m1\.web\.internal_linking"/.test(hv)) fail("step 50 runs in the short runner (reading every page would time out at 26 seconds)"); }
if (/slice\(0, 30\)/.test(h) || !/CP\.sitemapUrls\(ctx\.smXml\)\.slice\(0, 600\)/.test(h)) fail("step 50 reads only some of the pages (it read the first 30 of RGA's 261)");
if (!/if \(unread\.length > Math\.max\(1, urls\.length \* 0\.05\)\) return \{[\s\S]{0,200}outcome: "indeterminate"/.test(h)) fail("step 50 says which pages nothing links to with pages unread");
if (!/IL\.sentencePrompt\(pair\)/.test(h) || !/SiteChange\.autoChecks\(\{ items: \[\{ label: "x", after: r\.sentence \}\] \}/.test(h) || !/outcome: items\.length \? "draft_ready" : "verified"/.test(h)) fail("step 50 doesn't draft the sentences, check them like any draft, or finish as checked when nothing's missing");
if (!/key === "m1\.web\.internal_linking" && Array\.isArray\(od\.link_batch\)/.test(AD) || !/return buildLinkChange\(key, c, client, tasks, clientId\);/.test(AD)) fail("a link batch isn't read into the change or built into its pages' files");
if (!/const isLinks = key === "m1\.web\.internal_linking"/.test(AD) || !/const linkLines = key === "m1\.web\.internal_linking"/.test(AD)) fail("a link batch can't publish by pull request, or isn't read back link by link");
const cl = SC.cleanChange("m1.web.internal_linking", { kind: "batch", items: [item] });
if (!cl.change || !cl.change.items[0].link || cl.change.items[0].link.href !== "/services/leak-detection/" || cl.change.items[0].page !== item.page) fail("the cleaner drops a link's page or where it goes");
const t50 = { site_change: { kind: "batch", items: [item] } };
if (!AR.ghPublishes("m1.web.internal_linking", t50, { "m1.access.website": { access: { repo: "acme/site" } } })) fail("an approved link batch doesn't publish itself");
if (!RB.liveKeys({ "m1.web.internal_linking": { site_change: { v: "1", kind: "batch", items: [item] }, published: { v: "1" } } }).includes("m1.web.internal_linking")) fail("a live link batch isn't watched nightly");
if (!/const linkItems = \(c\.items \|\| \[\]\)\.filter\(\(i\) => i\.link && i\.page\);/.test(WATCH) || !/IL\.linksMissing\(/.test(WATCH)) fail("the nightly watch doesn't read each link back on its own page");
const pub = { site_change: { v: "1", kind: "batch", items: [item] }, site_build: { v: "1", files: [{ path: "blog/finding-hidden-leaks/index.html", action: "edit", sha: "l", place: { kind: "links", items: [item] } }] }, approval: { approved_build: [{ path: "blog/finding-hidden-leaks/index.html", action: "edit", sha: "l" }] } };
const lf = PUB.localFiles("m1.web.internal_linking", pub, () => html);
if (lf.error || !lf.files.length || !lf.files[0].text.includes(`<a href="/services/leak-detection/">leak detection</a>`)) fail(`the Mac publisher doesn't put up an approved link batch (${lf.error || ""})`);

if (bad.length) { console.error(`❌ step 50 links the whole site — ${bad.length} regression(s):`); for (const b of bad) console.error(`  · ${b}`); process.exit(1); }
console.log("✅ step 50 reads every page (menu and footer apart from the words), groups them, finds what nothing links to, thin service pages and 'click here', drafts one checked sentence per link on the page most about the target (never the homepage or a hub, never a call to action, at most 3 a page), builds it exactly, publishes it, reads each link back and watches it nightly");
