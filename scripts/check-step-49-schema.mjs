#!/usr/bin/env node
// check-step-49-schema.mjs — step 49 writes Service + BreadcrumbList code for each REAL service page, read from that page, its provider
// the homepage's business record (by @id), with real addresses; NO FAQPage, never AggregateRating, never a placeholder address.
// 🔴 WHY (approved website_steps_46_50_research_v1, the owner 11-7): it wrote NEW FAQ questions that weren't on the page, for FAQ rich
// results Google stopped showing on May 7, 2026; took services from the record, not the pages; left the address as {{PAGE_URL}}; and
// said "paste into the <head>". Earlier (10-19): AggregateRating was asked for (self-serving stars, not shown since 2019).
// Fixtures: a made-up plumber's site with two service pages, a hub, and a homepage business record with an @id.
// Exit 0 pass · 1 fail · 2 indeterminate.
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
let flow, pb, AD, PJ, SC;
try { flow = fs.readFileSync(`${SITE}/netlify/functions/flow-execute.js`, "utf8"); pb = JSON.parse(fs.readFileSync(`${SITE}/data/playbooks/playbooks.json`, "utf8")); AD = fs.readFileSync(`${SITE}/netlify/functions/admin-deliverables.js`, "utf8"); PJ = fs.readFileSync(`${SITE}/portal/portal.js`, "utf8"); SC = createRequire(import.meta.url)(`${SITE}/shared/site-change.js`); }
catch { console.error("⚠️  INDETERMINATE — couldn't read step 49's code"); process.exit(2); }
const at = flow.indexOf('"m1.web.expanded_schema": async');
if (at < 0) { console.error("⚠️  INDETERMINATE — step 49's runner moved"); process.exit(2); }
const fnStart = flow.indexOf("async", at);
let d = 0, end = -1;
for (let i = flow.indexOf("{", flow.indexOf("=>", fnStart)); i < flow.length; i++) { if (flow[i] === "{") d++; else if (flow[i] === "}") { d--; if (!d) { end = i + 1; break; } } }
const fails = []; const F = (m) => fails.push(m);
const B = "https://acme.test";
const page = (title, desc, extra = "") => `<html><head><title>${title} | Acme Plumbing</title><meta name="description" content="${desc}">${extra}</head><body><main><h1>${title}</h1><h2>Questions</h2><details><summary>Do you work weekends?</summary><p>Yes.</p></details></main></body></html>`;
const WEB = { [`${B}/`]: page("Acme Plumbing", "Plumbers in Austin.", `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Plumber","@id":"${B}/#acme","name":"Acme Plumbing"}</script>`),
  [`${B}/services/`]: page("Our Services", "All our services."), [`${B}/services/drain-cleaning/`]: page("Drain Cleaning", "Clear slow and blocked drains."), [`${B}/services/water-heaters/`]: page("Water Heaters", "Water heater repair.") };
const SMX = `<urlset>${Object.keys(WEB).map((u) => `<url><loc>${u}</loc></url>`).join("")}</urlset>`;
const siteReq = createRequire(`${SITE}/netlify/functions/x.js`);
let modelCalls = 0;
const run = (client, web = WEB) => vm.runInContext(`(${flow.slice(fnStart, end)})`, vm.createContext({ JSON, String, Array, Set, URL, Object, Number, Math, require: (m) => siteReq(m),
  pageContext: async () => ({ site: B, smXml: SMX, smUrl: `${B}/sitemap.xml`, tk: {}, gbpAreas: [] }), pageText: async (u) => web[u] || null, clientCtx: () => "ctx", aiDraft: async () => { modelCalls++; return "{}"; } }))({ client });
const client = { business_name: "Acme Plumbing", secondary_services: ["Drain Cleaning", "Water Heaters"], primary_market: "Austin, TX", geography_model: "service_area" };
let r;
try { r = await run(client); } catch (e) { console.error(`⚠️  INDETERMINATE — step 49's runner wouldn't run on the fixture: ${e.message}`); process.exit(2); }
const pages = (r.outcome_data || {}).pages || [];
if (pages.length !== 2) F(`expected one code pair per real service page (2), got ${pages.length}: ${r.summary}`);
for (const p of pages) {
  const blocks = [...p.code.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const sv = blocks.find((b) => b["@type"] === "Service"), cr = blocks.find((b) => b["@type"] === "BreadcrumbList");
  if (!sv || !cr || blocks.length !== 2) { F(`${p.url}: not exactly a Service and a BreadcrumbList`); continue; }
  if (sv.provider["@id"] !== `${B}/#acme` || sv.url !== p.url) F(`${p.url}: the Service doesn't name the homepage's business by its own @id, or isn't this page's`);
  if (p.url.includes("drain") && (sv.name !== "Drain Cleaning" || sv.description !== "Clear slow and blocked drains.")) F("a Service isn't read from its page (its name and description)");
  if (JSON.stringify(cr.itemListElement.map((x) => x.item)) !== JSON.stringify([`${B}/`, `${B}/services/`, p.url])) F(`${p.url}: the breadcrumb isn't Home › the hub › this page with real addresses`);
}
if (/FAQPage|AggregateRating|\{\{PAGE_URL\}\}/.test(JSON.stringify(r))) F("step 49 still writes FAQ code, review stars or a placeholder address");
if (modelCalls) F("step 49 asks the model for words (it should only describe what each page already says)");
const nat = await run({ ...client, geography_model: "national_one_office" });
if (!((nat.outcome_data || {}).pages || []).length || !nat.outcome_data.pages.every((p) => /"areaServed": "United States"/.test(p.code))) F("a business serving the whole country is said to serve one city");
const none = await run({ ...client, secondary_services: ["Pipe Relining"] });
if (none.outcome !== "blocked" || (none.outcome_data || {}).pages) F("a service with no page gets code (it needs its page first)");
const blind = await run(client, { ...WEB, [`${B}/`]: undefined });
if (blind.outcome !== "indeterminate") F("step 49 drafts without reading the homepage's business record");
// the rest of the pipeline
if (!/c\.pages = pages\.map\(\(x\) => \(\{ url: x\.url, name: x\.name, path: x\.path, code: x\.code \}\)\);/.test(AD) || !/if \(Array\.isArray\(c\.pages\) && c\.pages\.length\) \{\s*const files = \[\], notes = \[\];/.test(AD) || !/const codePages = c\.kind === "code" && Array\.isArray\(c\.pages\)/.test(AD)) F("step 49's pages aren't each built into their own file and read back on their own page");
const cl = SC.cleanChange("m1.web.expanded_schema", { kind: "code", code: pages.map((p) => p.code).join("\n"), pages });
if (!cl.change || !cl.change.pages || cl.change.pages.length !== 2) F("the cleaner drops step 49's pages");
const SMm = siteReq("./_schema-merge");
const old = `<html><head><script type="application/ld+json">{"@type":"Service","name":"Old"}</script><script type="application/ld+json">{"@type":"FAQPage"}</script></head></html>`;
const put = SMm.applyCode(old, pages[0] ? pages[0].code : "", "m1.web.expanded_schema");
if (/"Old"/.test(put) || !/FAQPage/.test(put) || (put.match(/"@type": "Service"/g) || []).length !== 1) F("the page's old Service code is doubled instead of replaced (or something else on the page is taken out)");
if (!/No questions code: Google stopped showing questions in search results in May 2026/.test(PJ)) F("the client's card doesn't list each page, or still promises questions in search");
const step = pb.month1.find((s) => s.id === "m1.web.expanded_schema");
if (/FAQ/i.test(`${step.title} ${step.clientHint || ""} ${step.clientFeed || ""}`) || /common questions/.test(SC.STEPS["m1.web.expanded_schema"].adds)) F("step 49's title, hint, feed or 'what it adds' still promise FAQs");
const heavy = (flow.match(/const HEAVY = new Set\(\[[\s\S]*?\]\);/) || [""])[0];
if (!heavy.includes('"m1.web.expanded_schema",')) F("step 49 isn't in HEAVY (it reads every service page)");
if (fails.length) { console.error("🔴 step 49's schema isn't the approved set:"); for (const f of fails) console.error("   · " + f); process.exit(1); }
console.log("✅ step 49: a Service + BreadcrumbList per real service page, read from the page, provider the homepage's business by @id, real addresses · no FAQ code, no stars, no placeholder · old code replaced, never doubled · each page built, read back and watched");
