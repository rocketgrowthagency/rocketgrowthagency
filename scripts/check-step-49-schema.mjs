#!/usr/bin/env node
// check-step-49-schema.mjs — step 49 emits Service + BreadcrumbList + a visible FAQ with its FAQPage markup per service page,
// NEVER AggregateRating, never a guessed page URL, and no FAQ markup without the visible FAQ it describes.
// 🔴 WHY (atlas review + step mockup m1-49, "approved build all" 10-19): it emitted Service only while its title promised
// FAQPage + Breadcrumb, and its instructions asked for AggregateRating (self-serving review stars — not shown since 2019).
// Exit 0 pass · 1 fail · 2 indeterminate.
import fs from "node:fs";
import vm from "node:vm";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
let flow, pb; try { flow = fs.readFileSync(`${SITE}/netlify/functions/flow-execute.js`, "utf8"); pb = JSON.parse(fs.readFileSync(`${SITE}/data/playbooks/playbooks.json`, "utf8")); } catch { console.error("⚠️  INDETERMINATE — cannot read flow-execute.js / playbooks.json"); process.exit(2); }
const at = flow.indexOf('"m1.web.expanded_schema": async');
if (at < 0) { console.error("⚠️  INDETERMINATE — step 49's runner moved"); process.exit(2); }
const fnStart = flow.indexOf("async", at);
let d = 0, end = -1;
for (let i = flow.indexOf("{", flow.indexOf("=>", fnStart)); i < flow.length; i++) { if (flow[i] === "{") d++; else if (flow[i] === "}") { d--; if (!d) { end = i + 1; break; } } }
const fails = []; const F = (m) => fails.push(m);
const run = (draft, site = "https://acme.com") => vm.runInContext(`(${flow.slice(fnStart, end)})`, vm.createContext({ JSON, String, Array,
  clientSiteUrl: () => site, clientCtx: () => "ctx", aiDraft: async () => draft }));
const QA = "Q: Do you offer same-day service?\nA: Often, depending on the schedule.\n\nQ: Do you work on weekends?\nA: Yes, by appointment.\n\nQ: How long does a typical job take?\nA: Most take an hour or two.";
const client = { business_name: "Acme Plumbing", secondary_services: ["Drain cleaning", "Water heaters"], primary_market: "Austin, TX" };
const r = await (run(QA))({ client });
const blocks = [...r.summary.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const types = blocks.map((b) => b["@type"]);
for (const t of ["Service", "BreadcrumbList", "FAQPage"]) if (types.filter((x) => x === t).length !== 2) F(`expected one ${t} per service page (2), got ${types.filter((x) => x === t).length}`);
if (blocks.some((b) => JSON.stringify(b).includes("AggregateRating"))) F("AggregateRating is emitted — Google doesn't show stars for a business's own reviews on its own site");
const crumb = blocks.find((b) => b["@type"] === "BreadcrumbList");
if (!crumb || crumb.itemListElement[0].item !== "https://acme.com" || crumb.itemListElement[1].item !== "{{PAGE_URL}}") F("the breadcrumb isn't Home → {{PAGE_URL}} (a guessed URL would publish a page that may not exist)");
if (!/Visible FAQ for the page/.test(r.summary) || !/Do you offer same-day service\?/.test(r.summary)) F("the FAQ markup ships without the visible FAQ it describes");
const bad = await (run("Sure! Here are some ideas about drains."))({ client });
if (/FAQPage/.test(bad.summary)) F("an unparsed draft still produced FAQPage markup");
const noMarket = await (run(QA))({ client: { business_name: "Acme", secondary_services: ["Tax prep"] } });
if (/"areaServed"/.test(noMarket.summary)) F("areaServed is published with no market on the record");
// up to 3 AI calls in a row (~1,500 tokens) → the background runner, or the 26s ceiling 504s it
const heavy = (flow.match(/const HEAVY = new Set\(\[[\s\S]*?\]\);/) || [""])[0];
if (!heavy) { console.error("⚠️  INDETERMINATE — the HEAVY set moved"); process.exit(2); }
if (!heavy.includes('"m1.web.expanded_schema",')) F("step 49 isn't in HEAVY — three AI calls in a row would hit Netlify's 26s ceiling");
const step = pb.month1.find((s) => s.id === "m1.web.expanded_schema");
if (/AggregateRating \(if reviews exist\)|rich snippets\)/.test(step?.instructions || "")) F("step 49's instructions still ask for AggregateRating / promise FAQ rich snippets");
if (fails.length) { console.error("🔴 step 49's schema isn't the approved set:"); for (const f of fails) console.error("   · " + f); process.exit(1); }
console.log("✅ step 49: Service + BreadcrumbList (Home → {{PAGE_URL}}) + visible FAQ with FAQPage per page · no AggregateRating · no FAQ markup from an unparsed draft · no areaServed without a market");
