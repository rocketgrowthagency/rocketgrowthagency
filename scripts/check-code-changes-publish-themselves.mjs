#!/usr/bin/env node
/**
 * check-code-changes-publish-themselves.mjs — AN APPROVED CODE CHANGE GOES UP, IS READ BACK, AND IS WATCHED, BY ITSELF
 * (approved schema_merge_v1 parts 2-3, the owner 11-7: "this all needs to be automated"). Before: an approved code change waited for a
 * person to paste it ("Only page changes publish by pull request so far"), and "live" meant only that a tag was on the page.
 * Now: structured data is built into the page file it goes in (from their repository, with its blob sha), published by the same pull
 * request as a page, read back field by field (step 41: one business block), and watched nightly. A site RGA deploys itself (its own:
 * its GitHub copy is behind, its videos aren't in git) is put up by the Mac publisher instead. Fixtures: a made-up plumber's page.
 * Exit 0 = holds. 1 = doesn't. 2 = couldn't tell.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const req = createRequire(import.meta.url);
const read = (p) => fs.readFileSync(path.join(SITE, p), "utf8");
let SM, AR, RB, AD, PUB, PUBSRC, WATCH;
try { SM = req(path.join(SITE, "netlify/functions/_schema-merge.js")); AR = req(path.join(SITE, "netlify/functions/_website-autorun.js")); RB = req(path.join(SITE, "netlify/functions/_page-readback.js"));
  AD = read("netlify/functions/admin-deliverables.js"); WATCH = read("netlify/functions/site-change-watch.js"); PUBSRC = read("scripts/publish-own-site.mjs"); PUB = await import(pathToFileURL(path.join(SITE, "scripts/publish-own-site.mjs")).href); }
catch (e) { console.error(`⚠️  INDETERMINATE — couldn't load the publishing code: ${e.message}`); process.exit(2); }
const bad = [], fail = (m) => bad.push(m);
const tag = (o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;
const BIZ = { "@context": "https://schema.org", "@type": "Plumber", name: "Acme Plumbing", telephone: "(555) 010-2000", openingHoursSpecification: [{ "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday"], opens: "08:00", closes: "17:00" }] };
const OLD = { "@context": "https://schema.org", "@type": "Plumber", name: "Acme Plumbing", telephone: "(555) 010-2000" };
const FAQ = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [] };
const PAGE = `<html><head><title>Acme</title>${tag(OLD)}${tag(FAQ)}</head><body><h1>Acme</h1></body></html>`;

// only structured data goes into one page by itself
if (!SM.isPageCode(tag(BIZ)) || !SM.isPageCode(`${tag(BIZ)}\n${tag(FAQ)}`)) fail("structured data isn't recognised as code that goes in a page");
if (SM.isPageCode(`<script async src="https://www.googletagmanager.com/gtag/js?id=G-1"></script>`) || SM.isPageCode(`${tag(BIZ)}<script>gtag('config')</script>`) || SM.isPageCode("Compress the hero image") || SM.isPageCode("")) fail("a tracking tag, a mixed block, a speed fix or nothing is put into a page by itself (tracking goes on every page; a fix isn't code)");

// built into the page file: step 41 replaces the business code, another block goes in the head once
const built = SM.applyCode(PAGE, tag(BIZ), "m1.web.schema");
if ((built.match(/"@type":"Plumber"/g) || []).length !== 1 || !built.includes(tag(FAQ)) || !built.includes(tag(BIZ))) fail("step 41's block doesn't replace the page's business code (one block, the FAQ untouched)");
const other = SM.applyCode(PAGE, tag(FAQ), "m1.web.expanded_schema");
if (other !== PAGE) fail("a block that's already on the page is added again");
if (!SM.applyCode(PAGE, tag({ "@type": "Service", name: "Drain cleaning" }), "m1.web.expanded_schema").includes(`${tag({ "@type": "Service", name: "Drain cleaning" })}\n</head>`)) fail("another block doesn't go in the <head>");

// read back field by field
if (!SM.codeReadBack(tag(BIZ), built, { oneBusiness: true }).ok) fail("the approved code, live, doesn't read back as approved");
const changed = SM.codeReadBack(tag(BIZ), built.replace("(555) 010-2000", "(555) 010-9999"), { oneBusiness: true });
if (changed.ok || !changed.missing.some((m) => /telephone/.test(m))) fail("a live field that differs from what was approved reads back as approved (only 'the tag is there' was checked)");
if (SM.codeReadBack(tag(BIZ), built.replace("</head>", `${tag(OLD)}</head>`), { oneBusiness: true }).ok) fail("two business blocks on the live page read back as approved (step 41 approves one)");
if (SM.codeReadBack(tag(BIZ), PAGE).ok) fail("a page without the approved code reads back as approved");
if (SM.codeReadBack(tag(BIZ), "<html><head></head></html>").ok) fail("a page with no block of the approved type reads back as approved");

// published by itself: by pull request, like a page; a site RGA deploys itself by the Mac publisher
const tk = (acc) => ({ "m1.access.website": { access: acc } }), t41 = { site_change: { kind: "code", code: tag(BIZ) } };
if (!AR.ghPublishes("m1.web.schema", t41, tk({ repo: "acme/site" }))) fail("an approved code change on a site we reach by GitHub doesn't publish itself");
if (AR.ghPublishes("m1.web.schema", t41, tk({ repo: "acme/site", publish: "rga_deploy" }))) fail("a site RGA deploys itself is published by pull request (its GitHub copy is behind the live site)");
if (AR.ghPublishes("m1.web.tracking", { site_change: { kind: "code", code: `<script src="https://www.googletagmanager.com/gtag/js?id=G-1"></script>` } }, tk({ repo: "acme/site" }))) fail("a tracking tag is published into one page by itself");
if (!/if \(c\.kind === "code" && require\("\.\/_schema-merge"\)\.isPageCode\(c\.code\)\) return buildCodeChange\(key, c, client, tasks, clientId\);/.test(AD)) fail("an approved code change isn't built into the page file it goes in");
if (!/let meta = await GA\.repoFileMeta\(token, fetch, repo, path\);[\s\S]{0,200}html = meta\.text; base_sha = meta\.sha;/.test(AD)) fail("a code change is built from somewhere other than their repository's own file (and its blob sha)");
if (!/const isCode = ac\.kind === "code" && require\("\.\/_schema-merge"\)\.isPageCode\(ac\.code\)/.test(AD) || !/if \(!isCode && \(!\(ac\.new_page/.test(AD)) fail("the pull request still refuses an approved code change");
if (!/if \(acc\.publish === "rga_deploy"\) return json\(409/.test(AD)) fail("a pull request can be opened against a site RGA deploys itself");
if (!/const missing = c\.kind === "code" && SMr\.isPageCode\(c\.code\) \? SMr\.codeReadBack\(c\.code, servedHtml, \{ oneBusiness: key === "m1\.web\.schema" \}\)\.missing/.test(AD)) fail("Mark live doesn't read a code change back field by field");

// watched nightly
const live = { "m1.web.schema": { site_change: { v: "1", kind: "code", code: tag(BIZ) }, published: { v: "1" } } };
if (!RB.liveKeys(live).includes("m1.web.schema")) fail("a live code change isn't watched nightly");
if (!RB.driftOf(live["m1.web.schema"].site_change, PAGE, "m1.web.schema").missing.length || RB.driftOf(live["m1.web.schema"].site_change, built, "m1.web.schema").missing.length) fail("the nightly watch doesn't see a code change stripped from the page (or sees one that's there)");
if (!/RB\.driftOf\(c, html, key\)/.test(WATCH)) fail("the nightly watch doesn't tell the reader which step it is (step 41's one-block rule)");

// the Mac publisher for a site RGA deploys itself
const appr = (files, build = files) => ({ site_change: { v: "1", kind: "code", code: tag(BIZ) }, site_build: { v: "1", files: build }, approval: { approved_build: files, change_v: "1", decision: "approved" } });
const F = [{ path: "index.html", action: "edit", sha: "a" }];
if (PUB.waitingKeys({ "m1.access.website": { access: { repo: "x/y" } }, "m1.web.schema": { ...appr(F), site_change: { v: "1", kind: "code", code: tag(BIZ) } } }).length) fail("the Mac publisher picks up a client's site (only a site RGA deploys itself is its)");
const lf = PUB.localFiles("m1.web.schema", appr(F), (p) => (p === "index.html" ? PAGE : null));
if (lf.error || lf.files.length !== 1 || (lf.files[0].text.match(/"@type":"Plumber"/g) || []).length !== 1) fail(`the Mac publisher doesn't apply the approved block to the local page (${lf.error || ""})`);
if (!PUB.localFiles("m1.web.schema", appr(F, [{ path: "index.html", action: "edit", sha: "other" }]), () => PAGE).error) fail("the Mac publisher puts up a build the client didn't approve");
{ const broken = { ...appr(F), site_change: { v: "1", kind: "code", code: `<script type="application/ld+json">{ broken</script>` } };
  if (!PUB.localFiles("m1.web.expanded_schema", broken, () => PAGE).error) fail("the Mac publisher commits code that doesn't read back as approved"); }
if (!PUB.localFiles("m1.web.schema", appr(F), () => null).error) fail("the Mac publisher writes a code change into a page that isn't in the repo");
const np = { site_change: { v: "1", kind: "visible", new_page: true, page_url: "https://acme.test/x/" }, site_build: { v: "1", files: [{ path: "x/index.html", action: "add", sha: "s", html: "<html>new</html>" }] }, approval: { approved_build: [{ path: "x/index.html", action: "add", sha: "s" }] } };
if (!PUB.localFiles("m1.web.priority_pages", np, () => "<html>someone else's</html>").error) fail("the Mac publisher overwrites a page that's already there and isn't the approved one");
{ const ed = { site_change: { v: "1", kind: "visible", edits_page: true, items: [{ label: "Line", before: "We guarantee results.", after: "We report every change." }] }, site_build: { v: "1", files: [{ path: "x/index.html", action: "edit", sha: "e" }] }, approval: { approved_build: [{ path: "x/index.html", action: "edit", sha: "e" }] } };
  const r1 = PUB.localFiles("m1.web.priority_pages", ed, () => "<p>We guarantee results.</p>");
  if (r1.error || !r1.files.length || r1.files[0].text !== "<p>We report every change.</p>") fail(`the Mac publisher doesn't put up an approved line edit (${r1.error || ""})`);
  if (!PUB.localFiles("m1.web.priority_pages", ed, () => "<p>Someone rewrote this.</p>").error) fail("the Mac publisher puts up a line edit on a page whose line changed since it was read"); }
if (!/const dirty = git\("status", "--porcelain", "--", \.\.\.paths\)\.stdout\.trim\(\);\s*if \(dirty\)/.test(PUBSRC)) fail("the Mac publisher writes over a file another session is editing");
if (!/"user\.name=rocketgrowthagency", "-c", "user\.email=hello@rocketgrowthagency\.com", "commit"/.test(PUBSRC) || /Co-Authored-By/i.test(PUBSRC)) fail("the Mac publisher commits under another identity (or with attribution)");
if (!/site_action: "publish"/.test(PUBSRC) || !/deployed, locked, and verified by content/.test(PUBSRC)) fail("the Mac publisher marks live without the deploy verifying and the live page reading back");

if (bad.length) { console.error(`❌ code changes publish themselves — ${bad.length} regression(s):`); for (const b of bad) console.error(`  · ${b}`); process.exit(1); }
console.log("✅ an approved code change goes up by itself: structured data only (never a tracking tag or a fix), built into its page file from their repository, published by pull request like a page (a site RGA deploys itself: the Mac publisher, approved build only, never over another session's file), read back field by field (step 41: one business block), watched nightly");
