#!/usr/bin/env node
// check-the-page-builder.mjs: website_system_v2 builds 3 to 6 and 15 (approved 10-28, built 11-01). RUNS the real modules on fixtures for different clients, no network:
//   3 · the brief: a page that already shows is a warning; no Search Console is "unknown", never "nothing ranks"; competitors' length and sections, never their words
//   4 · proof: only from the client's own hand; none = none; the ask is owner-only, read back, optional; Google's review text is never read into a page
//   5 · one pipeline: service page (one at a time, skipping what exists), service × area, plan from data, any trade, no website / no services stop and say so
//   6 · quality: keyword stuffing fails the words and blocks the send; duplicate sentences are flagged; the owner's real slip is caught
//  15 · improving a page they have: rules find the lines, every before is exact and unique, nothing else moves
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = [], fail = (m) => F.push(m);
const req = createRequire(`${SITE}/netlify/functions/x.js`);
let PB, BR, SC, PF;
try { PB = req(`${SITE}/netlify/functions/_page-builder.js`); BR = req(`${SITE}/netlify/functions/_page-brief.js`); SC = req(`${SITE}/shared/site-change.js`); PF = req(`${SITE}/netlify/functions/portal-page-proof.js`); } catch (e) { console.error(`⚠️  INDETERMINATE: ${e.message}`); process.exit(2); }
const read = (r) => fs.readFileSync(`${SITE}/${r}`, "utf8");
const FE = read("netlify/functions/flow-execute.js"), AD = read("netlify/functions/admin-deliverables.js"), PD = read("netlify/functions/portal-deliverables.js"), P = read("portal/portal.js"), PPF = read("netlify/functions/portal-page-proof.js");

// ── 3 · the brief ────────────────────────────────────────────────────────────────────────────
const rows = [{ page: "https://sparks.test/panels/", query: "electrician springfield", clicks: 3, impressions: 120, position: 8.2 }, { page: "https://sparks.test/", query: "panel upgrade", clicks: 9, impressions: 400, position: 3 },
  { page: "https://sparks.test/far/", query: "electrician springfield", clicks: 0, impressions: 40, position: 44 }];
const r1 = BR.alreadyRanks(rows, ["electrician springfield"], "Springfield");
if (r1.state !== "ok" || r1.pages.length !== 1 || r1.pages[0].url !== "https://sparks.test/panels/") fail(`the page that already shows isn't found, or a page on position 44 counts (${JSON.stringify(r1.pages)})`);
if (BR.alreadyRanks(null, ["x"], "y").state !== "unknown") fail("no Search Console reads as a finding, not \"unknown\"");
if (BR.alreadyRanks([], ["x"], "y").state !== "no_data") fail("an empty Search Console reads as a finding");
const lines = (b) => BR.briefLines(b);
const warned = lines(BR.makeBrief({ searches: ["electrician springfield"], pageFor: "Springfield", gscRows: rows, competitors: { asked: 0, read: [] } }));
if (!warned.some((l) => l.warn && /sparks\.test\/panels/.test(l.text))) fail("\"already shows\" isn't a warning on the card");
const unk = lines(BR.makeBrief({ searches: ["x"], pageFor: "y", gscRows: null, competitors: { asked: 3, read: [] } }));
if (unk.some((l) => l.warn) || !unk.some((l) => l.open && /Couldn't read Search Console/.test(l.text))) fail("an unread Search Console isn't said plainly");
if (!unk.some((l) => l.open && /None of the 3 competitor sites/.test(l.text))) fail("unread competitor sites aren't counted");
const homeWith = '<a href="/springfield/">x</a><p>' + "word ".repeat(200) + "</p>", cityPage = "<h2>Our work</h2><h2>Prices</h2><p>" + "secret-phrase ".repeat(500) + "</p>";
const comp = await BR.competitorPages(["https://rival.test", "https://down.test", "ftp://nope.test"], "Springfield", async (u) => (u === "https://rival.test" ? homeWith : u === "https://rival.test/springfield/" ? cityPage : null));
if (comp.asked !== 2 || comp.read.length !== 1 || !comp.read[0].own_page || comp.read[0].words < 400) fail(`competitor pages aren't read through their own city page (${JSON.stringify(comp).slice(0, 160)})`);
const brief = BR.makeBrief({ searches: [], pageFor: "Springfield", gscRows: [], competitors: comp });
if (brief.length_guide !== comp.read[0].words || !brief.sections.includes("Prices")) fail("the length guide or sections don't come from their pages");
if (JSON.stringify(comp).includes("secret-phrase") || JSON.stringify(brief).includes("secret-phrase") || BR.briefPrompt(brief).includes("secret-phrase")) fail("a competitor's own words are kept in the brief");
const gscFn = req(`${SITE}/netlify/functions/_page-brief.js`).readGscRows;
const noTable = await gscFn({ supa: async (p) => { if (p.startsWith("/client_gsc_daily")) throw new Error("PGRST205"); return []; }, clientId: "c", token: async () => "t" });
if (noTable !== null) fail("no history table and no Google connection isn't \"couldn't read\"");
const live = await gscFn({ supa: async (p) => { if (p.startsWith("/client_gsc_daily")) throw new Error("PGRST205"); return [{ gsc_site_url: "https://sparks.test/" }]; }, clientId: "c", token: async () => "t", fetchFn: async () => ({ ok: true, json: async () => ({ rows: [{ keys: ["https://sparks.test/a/", "q"], clicks: 1, impressions: 2, position: 3 }] }) }) });
if (!live || live[0].page !== "https://sparks.test/a/") fail("with no history table it doesn't ask Google once");

// ── 4 · proof ────────────────────────────────────────────────────────────────────────────────
if (PB.proofOf({}).result !== null || PB.proofOf({}).quote !== null) fail("no answer makes proof out of nothing");
const pr = PB.proofOf({ "m1.web.page_proof": { client_input: { result: "Fixed it.", quote: "Great work", quote_name: "Dana Smith" } } });
if (pr.result !== "Fixed it." || pr.quote_name !== "Dana") fail("the client's result or first name doesn't reach the page");
if (!PF.answerFrom({ result: "", quote: "" }).error || !PF.answerFrom({ skip: true }).skipped) fail("the ask takes an empty answer, or Skip doesn't record a skip");
const ansE = PF.answerFrom({ result: "Done 🎉", quote: "Nice", quote_name: "Dana Smith" });
if (/🎉/.test(ansE.result) || ansE.quote_name !== "Dana") fail("the ask keeps an emoji or a full name");
if (!/requirePortalOwner\(event, clientId\)/.test(PPF) || !/if \(!t\.ask\) return json\(409/.test(PPF) || !/saved\.answered_at !== at/.test(PPF) || !/recordSubmission\(/.test(PPF)) fail("the ask isn't owner-only, asked-first, read back and recorded");
if (/v2-fetch-reviews|client_state_snapshots|reviews_feed|_reviews-feed/.test(read("netlify/functions/_page-builder.js") + read("netlify/functions/_page-brief.js"))) fail("a page reads Google's review text (30-day rule): only the client's own copy");
for (const bad of ["average_rating", "review_count", "reviewCount"]) if (read("netlify/functions/_page-builder.js").includes(bad)) fail(`a page reads ${bad} from Google`);
if (!/page_proof = pp && pp\.ask \?/.test(PD) || !/pageProofCardHtml\(\) \+ fyaHtml\(_apItems/.test(P)) fail("the ask doesn't reach the client's For your approval");
if (/stepEmail|sendEmail|send-step-email/.test(AD.slice(AD.indexOf('if (act === "proof_ask")'), AD.indexOf('if (act === "proof_ask")') + 800))) fail("the ask emails the client");

// ── 5 · one pipeline, any client ─────────────────────────────────────────────────────────────
const xml = (l) => l.map((u) => `<loc>${u}</loc>`).join("");
const base = { site: "https://sparks.test", client: { primary_market: "Springfield, IL", secondary_services: ["Panel upgrades", "Lighting", "Rewiring"] }, tasks: {}, sitemapUrl: "https://sparks.test/sitemap.xml", gbpAreas: ["Chatham, IL, USA"], planLocations: ["Rochester"], keywords: ["panel upgrades springfield", "electrician springfield"], filesOnGithub: true };
const a1 = PB.planServicePage({ ...base, sitemapXml: xml(["https://sparks.test/", "https://sparks.test/lighting/"]) });
if (!a1.plan || a1.plan.page_for !== "Panel upgrades" || a1.plan.url !== "https://sparks.test/panel-upgrades/") fail(`the first service page isn't the first service with no page (${JSON.stringify(a1.plan || a1).slice(0, 120)})`);
if (a1.plan && (a1.page_of.at !== 1 || a1.page_of.of !== 2)) fail(`a service that already has a page counts toward the pages to build (${JSON.stringify(a1.page_of)})`);
if (a1.plan && JSON.stringify(a1.plan.searches) !== '["panel upgrades springfield"]') fail("the page's searches aren't the plan's terms for it");
if (a1.plan && a1.plan.files[0].path !== "panel-upgrades/index.html") fail("the file isn't the new page's own");
const a2 = PB.planServicePage({ ...base, sitemapXml: xml(["https://sparks.test/", "https://sparks.test/lighting/"]), done: ["https://sparks.test/panel-upgrades/"] });
if (!a2.plan || a2.plan.page_for !== "Rewiring" || a2.page_of.at !== 2 || a2.page_of.of !== 2) fail(`the next page isn't the next one (${JSON.stringify(a2.page_of)})`);
if (!PB.planServicePage({ ...base, sitemapXml: xml(["https://sparks.test/panel-upgrades/", "https://sparks.test/lighting/", "https://sparks.test/rewiring/"]) }).none) fail("a site with every service page still gets one");
if (!PB.planServicePage({ ...base, site: "" , sitemapXml: "" }).error) fail("no website gets a page anyway");
if (!PB.planServicePage({ ...base, client: { primary_market: "x" }, sitemapXml: "" }).error) fail("no services gets a guessed page");
// page_placement_and_links_v1 (11-7): a business's own type ("Dentist") is its homepage's job, so the one service here is a real service
const uk = PB.planServicePage({ ...base, site: "https://smiths.example.co.uk", client: { primary_market: "Bristol", primary_service: "Dentist", secondary_services: ["Teeth Whitening"] }, keywords: [], sitemapXml: "", filesOnGithub: false });
if (!uk.plan || uk.plan.url !== "https://smiths.example.co.uk/teeth-whitening/" || uk.plan.files[0].path !== "teeth-whitening/" || uk.plan.areas[0] !== "Bristol") fail("a business with one service, no state, no sitemap and a builder doesn't plan");
const ukOnly = PB.planServicePage({ ...base, site: "https://smiths.example.co.uk", client: { primary_market: "Bristol", primary_service: "Dentist" }, keywords: [], sitemapXml: "", filesOnGithub: false });
if (!ukOnly.none) fail("a dentist whose only service is 'Dentist' gets a /dentist/ page that competes with its own homepage");
const g = PB.servicesOf({ secondary_services: ["Listed"] }, { "m1.gbp.services_products": { approval: { decision: "approved", approved_content: 'displayName: "From Google"' } } });
if (g[0] !== "From Google") fail("the services Google lists don't come first");
const m1 = PB.planServiceAreaPage({ ...base, sitemapXml: xml(["https://sparks.test/panel-upgrades-rochester/"]) });
if (!m1.plan || m1.plan.url !== "https://sparks.test/panel-upgrades-chatham/" || m1.plan.service !== "Panel upgrades") fail(`a service × area page isn't the first pair with no page (${JSON.stringify(m1.plan || m1).slice(0, 120)})`);
const P1 = { page_for: "Springfield", searches: ["electrician springfield", "emergency electrician near me"] };
const good = { title: "Electrician in Springfield, IL | Sparks", description: "Electrical work.", h1: "Your electrician in Springfield", intro: "We work on homes here. We also work on shops.", how: "Call, look, quote, fix.", button: "Call us", faq: [1, 2, 3, 4, 5].map((n) => ({ q: `Q${n}?`, a: `A${n}. More.` })) };
if (PB.checkPageWords(good, P1).problems) fail(`good words are refused (${PB.checkPageWords(good, P1).problems})`);
for (const [what, patch] of [["a made-up count", { intro: "We have 200+ customers. Ask us." }], ["a guarantee", { how: "Guaranteed results." }], ["no city in the title", { title: "Electrician | Sparks" }]]) if (!PB.checkPageWords({ ...good, ...patch }, P1).problems) fail(`the words are kept with ${what}`);
const prompt = PB.wordsPrompt({ kind: "service", service: "Panel upgrades", page_for: "Panel upgrades", searches: ["x"] }, "Sparks", null, null);
if (!/Never state a number, a result, a ranking, a review count, a price or a guarantee, and never quote a customer/.test(prompt)) fail("the prompt no longer forbids invented numbers, prices and quotes");
if (!/"m1\.web\.priority_pages": async[\s\S]{0,4500}draftOnePage\(\{ client, _plan, plan: r\.plan, ctx, page_of: r\.page_of \}\)/.test(FE)) fail("service pages don't go through the one pipeline");
if (!/"m1\.web\.location_pages": async[\s\S]{0,4000}draftOnePage\(\{ client, _plan, plan:/.test(FE)) fail("the city page doesn't go through the one pipeline");
if (!/"m1\.web\.service_location_matrix": async[\s\S]{0,5000}draftOnePage\(\{ client, _plan, plan: \{ \.\.\.r\.plan, searches: own, place_facts:/.test(FE)) fail("service × area pages don't go through the one pipeline");
if (/"m1\.web\.blog_seed": async[\s\S]{0,400}draftOnePage/.test(FE)) fail("the blog was pulled into the page builder (it keeps its own system)");
const d1 = PB.draftOf({ kind: "service", page_for: "Panel upgrades", url: "u", path: "/p/", links: [], areas: [], searches: [], files: [] }, good, { proof: { result: "Fixed it.", quote: "Great", quote_name: "Dana" }, page_of: { at: 1, of: 2 } });
if (d1.result !== "Fixed it." || d1.quote !== "“Great” Dana" || !d1.page_of) fail("the draft loses the proof or which page it is");
if (PB.draftOf({ url: "u", links: [], areas: [], searches: [], files: [] }, good, {}).quote) fail("a draft with no proof has a quote");
const ADpf = AD.slice(AD.indexOf("async function prefillChange"));
if (!/set\("A real result", d\.result\); set\("A customer's words", d\.quote\);/.test(ADpf) || !/if \(d\.page_of\) c\.page_of = d\.page_of;/.test(ADpf)) fail("the prefill drops the proof or which page it is");

// ── 6 · quality ──────────────────────────────────────────────────────────────────────────────
const stuffed = { searches: ["local seo services near me", "google business profile optimization"], items: [{ label: "Opening", after: "If you want to compete for local seo services near me searches, google business profile optimization results, and map pack visibility, we are ready." }] };
if (!SC.stuffingFlags(stuffed).length) fail("the real slip from the first city page draft isn't caught");
if (SC.stuffingFlags({ searches: stuffed.searches, items: [{ label: "Opening", after: "We help shops here get found on Google. Every plan starts with a look at your listing." }] }).length) fail("plain prose is flagged as stuffing");
const rep = "Best plumber Denver. ".repeat(5);
if (!SC.stuffingFlags({ searches: [], items: [{ label: "Opening", after: rep }] }).length) fail("a phrase repeated over and over isn't caught");
if (!SC.stuffingFlags({ searches: ["plumber denver"], items: [{ label: "How we work", after: "We are your plumber denver. Call your plumber denver. Trust your plumber denver." }] }).length) fail("a search phrase repeated past twice isn't caught");
if (SC.stuffingFlags({ searches: ["x y"], items: [{ label: "Page title", after: "x y x y x y x y" }] }).length) fail("a title counts as prose");
if (!PB.checkPageWords({ ...good, intro: "We rank for electrician springfield and emergency electrician near me here. More words follow." }, P1).problems) fail("stuffed words pass the page rules");
const dup = SC.duplicateSentences("Our team shows up on time and leaves your home clean every single day. New words here.", [{ url: "https://x.test/a/", text: "Hello. Our team shows up on time and leaves your home clean every single day." }]);
if (dup.length !== 1 || dup[0].url !== "https://x.test/a/") fail("a sentence copied from a sibling page isn't flagged");
if (SC.duplicateSentences("Call us today.", [{ url: "u", text: "Call us today." }]).length) fail("a short common sentence is flagged as a copy");
if (!/const stuffed = SC\.stuffingFlags\(t\.site_change\);\n\s*if \(stuffed\.length\) return json\(409/.test(AD)) fail("a stuffed draft can be sent");
if (AD.indexOf("const stuffed = SC.stuffingFlags") > AD.indexOf("const b = await buildChangeFiles(key, t.site_change")) fail("the stuffing check runs after the page is built");
const A = read("admin/admin.js");
if (!/st\.map\(\(x\) => `<div class="ob-wc-warn">/.test(A) || !/\(d && d\.duplicates\)/.test(A)) fail("the flags don't show on the draft card");

// ── 15 · improving a page they have ──────────────────────────────────────────────────────────
const page = `<html><main><h2>Why hvac in Denver lose the calls</h2><p>Studies show that most customers call the first business they find.</p><p>We answer the phone.</p><p>We are the best company in Denver.</p></main></html>`;
const weak = PB.weakLines(page);
if (weak.length !== 3 || !weak.some((w) => /Why hvac/.test(w.text)) || !weak.some((w) => /Studies show/.test(w.text)) || !weak.some((w) => /best company/.test(w.text))) fail(`the rules don't find the lowercase trade, the unsourced study and the superlative (${JSON.stringify(weak).slice(0, 180)})`);
if (PB.weakLines("<main><p>We answer the phone every day of the week.</p></main>").length) fail("a clean page is found to have weak lines");
const edits = { lines: [{ before: "Why hvac in Denver lose the calls", after: "Why HVAC companies in Denver lose calls" }, { before: "Studies show that most customers call the first business they find.", after: "Most people call the first business they find." }] };
const ok1 = PB.checkLineEdits(edits, weak, page);
if (!ok1.lines || ok1.lines.length !== 2) fail(`a good rewrite is refused (${ok1.problems})`);
if (!PB.checkLineEdits({ lines: [{ before: "We answer the phone.", after: "New" }] }, weak, page).problems) fail("the model can rewrite a line nobody asked about");
if (!PB.checkLineEdits({ lines: [{ before: weak[0].text, after: "We are the #1 choice" }] }, weak, page).problems) fail("a rewrite can add a claim we can't back");
if (!PB.checkLineEdits({ lines: [] }, weak, page).problems) fail("a rewrite with no lines passes");
const twice = page + page;
if (!PB.checkLineEdits(edits, weak, twice).problems) fail("a line on the page twice is edited anyway");
const applied = PB.applyLineEdits(page, [{ before: edits.lines[0].before, after: "New & better" }]);
if (!applied.html || !applied.html.includes("New &amp; better") || !applied.html.includes("We answer the phone.") || applied.html.includes("Why hvac")) fail("the approved line isn't replaced, escaped, with everything else untouched");
if (!PB.applyLineEdits(page, [{ before: "not on the page", after: "x" }]).error) fail("a line that's gone still builds");
if (!PB.serviceAreaPages(["https://x.test/local-seo/hvac-in-culver-city-ca/", "https://x.test/about/", "https://x.test/culver-city/"], ["Culver City"]).every((u) => /hvac/.test(u))) fail("a plain city page or another page counts as a service × area page");
if (!/if \(weak\.length\) return improveOnePage\(/.test(FE) || !/const r = j \? PB\.checkLineEdits\(j, weak, html\)/.test(FE)) fail("improving a page isn't wired through the rules");

// 11-8: a lowercase trade or acronym is fixed exactly, the line keeping its own casing (the model title-cased RGA's CPA page's lines)
{ const fx = PB.fixAcronyms;
  if (fx("Why cpas in Culver City lose the calls") !== "Why CPAs in Culver City lose the calls" || fx("How we work on your cpas business") !== "How we work on your CPA business" || fx("hvac and seo help") !== "HVAC and SEO help" || fx("Our HVAC team") !== "Our HVAC team" || fx("A cpasomething word") !== "A cpasomething word") fail("a lowercase acronym isn't fixed exactly word for word (or the rest of the line, or a word that only starts with it, changes)");
  if (!/const exact = weak\.filter\(\(l\) => \/trade or acronym\/\.test\(l\.why\)\)\.map\(\(l\) => \(\{ before: l\.text, after: PB\.fixAcronyms\(l\.text\)/.test(FE) || !/if \(!weak\.length && exact\.length\) \{/.test(FE)) fail("an acronym-only line still goes to the model (it title-cased the whole line)"); }
if (F.length) { console.error(`❌ the page builder: ${F.length} regression(s):\n  · ${F.join("\n  · ")}`); process.exit(1); }
console.log("✅ the page builder: brief from Search Console + competitors (unknown is never a finding), proof only from the client, one pipeline for any client, stuffing blocks the send, copies flagged, an edit changes only named lines");
