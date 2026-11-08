#!/usr/bin/env node
/**
 * check-business-details-start-from-the-page.mjs — STEP 41 STARTS FROM WHAT'S ALREADY ON THE PAGE (approved schema_merge_v1, the owner 11-7).
 * RGA approved a business block that would have REPLACED a better one on its homepage: the Google profile link (sameAs), logo, image and
 * email dropped, where it serves changed, to add one fact (hours); beside the old block, Google would read two that disagree.
 * Fixtures: a made-up plumber's page (a Plumber block with a street, its Maps link and logo, beside a FAQ block), a @graph site, no block.
 * Exit 0 = holds. 1 = doesn't. 2 = couldn't tell.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const req = createRequire(import.meta.url);
const read = (p) => fs.readFileSync(path.join(SITE, p), "utf8");
let SM, SC, FE, AD, PJ, PB;
try { SM = req(path.join(SITE, "netlify/functions/_schema-merge.js")); SC = req(path.join(SITE, "shared/site-change.js")); FE = read("netlify/functions/flow-execute.js"); AD = read("netlify/functions/admin-deliverables.js"); PJ = read("portal/portal.js"); PB = read("data/playbooks/playbooks.json"); }
catch (e) { console.error(`⚠️  INDETERMINATE — couldn't load step 41's merge: ${e.message}`); process.exit(2); }
const bad = [], fail = (m) => bad.push(m);
const tag = (o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;

const OLD = { "@context": "https://schema.org", "@type": "Plumber", name: "Acme Plumbing", telephone: "+1 555-010-2000", url: "https://acme.test/", email: "hi@acme.test",
  logo: "https://acme.test/logo.png", sameAs: ["https://maps.google.com/?cid=123", "https://www.facebook.com/acme"], description: "Plumbers in Springfield since our start.",
  address: { "@type": "PostalAddress", streetAddress: "1 Main St", addressLocality: "Springfield", addressRegion: "IL", postalCode: "62701" } };
const FAQ = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: "Do you work weekends?", acceptedAnswer: { "@type": "Answer", text: "Yes." } }] };
const PAGE = `<html><head><title>Acme</title>${tag(OLD)}${tag(FAQ)}<script type="application/ld+json">{ broken</script></head><body></body></html>`;
const FRESH = { "@context": "https://schema.org", "@type": "LocalBusiness", name: "Acme Plumbing", url: "https://www.acme.test", telephone: "(555) 010-2000", areaServed: "Springfield, IL",
  description: "Drain cleaning, serving Springfield, IL", openingHoursSpecification: [{ "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Friday"], opens: "08:00", closes: "17:00" }] };

// reading the page
const blocks = SM.businessBlocks(PAGE);
if (blocks.length !== 3 || blocks[0].nodes.length !== 1 || blocks[1].nodes.length !== 0 || !blocks[2].unread) fail("the page's business code isn't read (a Plumber is a business, a FAQ isn't, a broken block is unread, never a business)");
const graph = SM.businessBlocks(tag({ "@context": "https://schema.org", "@graph": [{ "@type": "WebSite", name: "Acme" }, { "@type": ["LocalBusiness", "Plumber"], name: "Acme Plumbing" }] }));
if (!graph[0] || graph[0].nodes.length !== 1 || graph[0].only) fail("a business inside an @graph beside a WebSite isn't found, or the WebSite is treated as business");

// the merge: keep what's true, add what's missing, change only what's wrong
const sab = SM.mergeBusiness(blocks[0].nodes, FRESH, { storefront: false }), m = sab.merged, f = sab.fields;
if (m["@type"] !== "Plumber" || f["@type"].status !== "kept") fail("a specific type already on the page is replaced by plain LocalBusiness");
if (m.telephone !== "+1 555-010-2000" || f.telephone.status !== "kept") fail("the same phone in another format is called a change (it's kept as the page has it)");
if (m.url !== "https://acme.test/" || f.url.status !== "kept") fail("the same website with or without www is called a change");
if (JSON.stringify(m.sameAs) !== JSON.stringify(OLD.sameAs) || m.logo !== OLD.logo || m.email !== OLD.email) fail("a true detail only the page has is dropped (its Google profile link, logo, email): RGA's would have been");
if (f.openingHoursSpecification.status !== "added" || f.areaServed.status !== "added") fail("a detail the record has and the page lacks isn't added");
if (m.description !== OLD.description || f.description.status !== "kept") fail("the page's own description is replaced (it isn't wrong, only different)");
if (m.address.streetAddress || m.address.postalCode || m.address.addressLocality !== "Springfield" || f.address.status !== "changed") fail("a business customers don't come to keeps its street in the code (or loses its city)");
const shop = SM.mergeBusiness(blocks[0].nodes, FRESH, { storefront: true });
if (shop.merged.address.streetAddress !== "1 Main St" || shop.fields.address.status !== "kept") fail("a storefront's street is taken out");
const wrong = SM.mergeBusiness([{ ...OLD, telephone: "555-999-0000" }], FRESH, {});
if (wrong.merged.telephone !== FRESH.telephone || wrong.fields.telephone.status !== "changed" || !wrong.fields.telephone.why) fail("a wrong phone on the page isn't changed to the record's, with why");
const spec = SM.mergeBusiness([{ ...OLD, "@type": "LocalBusiness" }], { ...FRESH, "@type": "Plumber" }, {});
if (spec.merged["@type"] !== "Plumber" || spec.fields["@type"].status !== "changed") fail("a plain LocalBusiness isn't made the type for their Google category");
const none = SM.mergeBusiness([], FRESH, {});
if (Object.entries(none.fields).some(([k, x]) => k !== "@type" && x.status !== "added")) fail("with nothing on the page, every detail isn't 'added'");

// one business block left; everything else on the page untouched
const mergedTag = tag(m), out = SM.replaceBusiness(PAGE, mergedTag);
if ((out.match(/"@type":"Plumber"/g) || []).length !== 1 || !out.includes(tag(FAQ)) || !out.includes("{ broken")) fail("replacing leaves two business blocks, or touches the FAQ or a block it couldn't read");
const two = SM.replaceBusiness(`<head>${tag(OLD)}${tag({ ...OLD, name: "Acme" })}</head>`, mergedTag);
if ((two.match(/application\/ld\+json/g) || []).length !== 1) fail("a page with two business blocks keeps both (Google reads two records that disagree)");
const g2 = SM.replaceBusiness(tag({ "@context": "https://schema.org", "@graph": [{ "@type": "WebSite", name: "Acme" }, { "@type": "Plumber", name: "Acme Plumbing" }] }), mergedTag);
if (!/"WebSite"/.test(g2) || (g2.match(/"@type":\s*"Plumber"/g) || []).length !== 1) fail("a business inside an @graph is replaced along with the WebSite beside it");
if (!SM.replaceBusiness("<html><head></head></html>", mergedTag).includes(`${mergedTag}\n</head>`)) fail("a page with no business code doesn't get the block in its <head>");

// the drafter, the reader, the cleaner, the checks, the card
const at = FE.indexOf('"m1.web.schema": async'), body = FE.slice(at, at + 9000);
if (!/const live = site \? await pageText\(site, 12000\) : null;\s*if \(site && !live\) return \{[\s\S]{0,200}outcome: "indeterminate" \};/.test(body)) fail("step 41 drafts without reading the page (blind), instead of trying again");
if (!/SM\.mergeBusiness\(had, schema, \{ storefront \}\)/.test(body) || !/JSON\.stringify\(merged, null, 2\)/.test(body) || !/outcome_data: \{ snippet, locality, region, storefront, omitted, merge \}/.test(body)) fail("step 41's code isn't the merge of the page's and the record's");
if (!/if \(national\) schema\.areaServed = "United States";/.test(body)) fail("a business serving the whole country from one office is said to serve only its city");
if (!/if \(od\.merge && od\.merge\.fields\) c\.merge = od\.merge;/.test(AD)) fail("the draft reader drops what was kept, added and changed");
const cl = SC.cleanChange("m1.web.schema", { kind: "code", code: tag(m), merge: { had: 1, lost: [], fields: { telephone: { status: "kept" }, x: { status: "bogus" } } } });
if (!cl.change || !cl.change.merge || cl.change.merge.fields.telephone.status !== "kept" || cl.change.merge.fields.x.status !== "kept") fail("the cleaner drops the merge, or keeps a status that isn't one");
if (!/out\.push\(\{ ok: !\(c\.merge\.lost \|\| \[\]\)\.length, what: "Nothing true was removed" \}\)/.test(AD)) fail("the client's card doesn't check that nothing true was removed");
if (!/rows\.push\(\["Linked to"/.test(PJ) || !/Your Google profile/.test(PJ) || !/apv-facts\$\{c\.merge \? " apv-facts3" : ""\}/.test(PJ) || !/SAY = \{ kept: "already there", added: "added", changed: "changed" \}/.test(PJ)) fail("the card doesn't say per detail whether it was already there, added or changed, or hides the Google profile link");
if (/your name, phone, address and hours in its own format/.test(PB)) fail("'Why this helps' still promises an address the card leaves out");

if (bad.length) { console.error(`❌ business details start from the page — ${bad.length} regression(s):`); for (const b of bad) console.error(`  · ${b}`); process.exit(1); }
console.log("✅ step 41 starts from the page's own business code: true details kept (its Google profile link, logo, email, its phone as written), missing ones added, only wrong ones changed with why, no street for a business customers don't come to, one block left (a FAQ and unread blocks untouched), never drafted blind; the card says per detail already there / added / changed");
