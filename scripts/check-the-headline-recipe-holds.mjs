#!/usr/bin/env node
/**
 * check-the-headline-recipe-holds.mjs — STEP 44'S LOCKED RECIPE (approved headline_cta_recipe_v1, the owner 11-7).
 * RGA's step 44 draft named neither Culver City nor a plan keyword, and read the line under the headline and the button as NEW (only the
 * headline was read), so it would have ADDED a second line and button. The recipe reads today's three lines live, drafts three options from the
 * pinned model, and checks each by rule. Fixtures (fakes for every outside read):
 *   RGA's real page · a plumber whose button says "Call now" · a page with no line under the headline (New is right) · a long business name ·
 *   a site whose button goes to a booking page.
 * Exit 0 = holds. 1 = doesn't. 2 = couldn't tell.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const req = createRequire(import.meta.url);
const read = (p) => fs.readFileSync(path.join(SITE, p), "utf8");
let HC;
try { HC = req(path.join(SITE, "netlify/functions/_headline-cta.js")); } catch (e) { console.error(`⚠️  INDETERMINATE — couldn't load the recipe: ${e.message}`); process.exit(2); }
const bad = [], fail = (m) => bad.push(m);

const RGA = { id: "rga", business_name: "Rocket Growth Agency", primary_market: "Culver City, CA", website_url: "https://www.rocketgrowthagency.com/", primary_contact_phone: "(424) 242-2040", secondary_services: ["Google Business Profile optimization", "local SEO"] };
const PLAN = { keywords: ["local seo services near me", "google business profile optimization", "local seo agency culver city"], locations: ["Palms"] };
const RGA_PAGE = `<html><head><title>Local SEO Services in Culver City | Rocket Growth Agency</title></head><body><h1>Get found on Google Maps. <span>See every change we make.</span></h1>
<p>We set up and keep up your Google Business Profile, clean up your listings, and improve the pages Google reads.</p><a class="btn primary" href="/#audit">Get your free audit</a><p>A free audit of your Google listing.</p></body></html>`;
const run = async (client, o) => {
  const seen = {};
  const d = { page: async () => o.html, ownPrices: () => o.prices || [], services: () => "local SEO",
    ai: async (sys, user, opt) => { seen.user = user; if (opt.info) opt.info.model = "claude-opus-5-5"; return JSON.stringify({ options: o.options }); } };
  const r = await HC.draftHeadline({ client, tasks: {}, data: {}, plan: o.plan || PLAN, d });
  return { r, seen };
};

// 1 · RGA: today's three lines are read (so each replaces), the keyword + city option wins, the old draft's headline fails
{
  const { r, seen } = await run(RGA, { html: RGA_PAGE, options: [
    { headline: "Local SEO That Puts Your Business on the Map", sub: "Rocket Growth Agency optimizes your Google Business Profile so Culver City customers find you.", button: "Get Your Free Google Listing Audit", why: "old" },
    { headline: "Local SEO Services in Culver City", sub: "We set up and keep up the Google Business Profile for Culver City businesses.", button: "Get your free audit", why: "plan #1" },
    { headline: "Local SEO Services in Culver City, Same-Day Start", sub: "Local SEO for Culver City businesses.", button: "Book a strategy call", why: "" }] });
  const rec = r.outcome_data.recipe;
  if (rec.evidence.today.headline !== "Get found on Google Maps. See every change we make." || !/^We set up and keep up/.test(rec.evidence.today.sub) || rec.evidence.today.button !== "Get your free audit") fail(`RGA: today's headline, line or button isn't read (${JSON.stringify(rec.evidence.today)})`);
  if (rec.pick !== 1) fail(`RGA: the keyword + city option doesn't win (picked ${rec.pick})`);
  if (rec.options[0].ok || rec.options[0].checks.find((c) => c.id === "keyword_city").ok) fail("RGA: the old draft's headline (no city, no plan keyword) passes");
  const o3 = rec.options[2];
  if (o3.ok || o3.checks.find((c) => c.id === "claims").ok || o3.checks.find((c) => c.id === "button_offer").ok) fail("RGA: a timing promise, or a button offering what the site doesn't (a strategy call), passes");
  if (!/Its button today: Get your free audit \(goes to \/#audit\)/.test(seen.user) || !/Its live title: Local SEO Services in Culver City/.test(seen.user)) fail("RGA: the model isn't given today's button or the live title");
  if (!/^H1: Local SEO Services in Culver City\nSUB: .+\nPRIMARY_CTA: Get your free audit$/.test(r.outcome_data.draft)) fail("RGA: the winner isn't written for the reader (H1 / SUB / PRIMARY_CTA)");
}
// 2 · a plumber whose button says "Call now": "Call now" stays possible; a made-up offer doesn't
{
  const P = { id: "p", business_name: "Acme Plumbing", primary_market: "Austin, TX", website_url: "https://acme.test", primary_contact_phone: "(512) 555-0100", secondary_services: ["drain cleaning", "water heater repair"] };
  const html = `<title>Emergency Plumber in Austin | Acme Plumbing</title><h1>Austin plumbers</h1><p>Drain cleaning and water heater repair.</p><a class="button" href="tel:5125550100">Call now</a>`;
  const { r } = await run(P, { html, plan: { keywords: ["emergency plumber near me"], locations: [] }, options: [
    { headline: "Emergency Plumber in Austin", sub: "Drain cleaning and water heater repair for Austin homeowners.", button: "Call now", why: "" },
    { headline: "Emergency Plumber in Austin", sub: "Drain cleaning for Austin homeowners.", button: "Get a free quote", why: "" }] });
  const o = r.outcome_data.recipe.options;
  if (!o[0].ok) fail(`plumber: "Call now" fails (${o[0].checks.filter((c) => !c.ok).map((c) => c.what)})`);
  if (o[1].ok) fail("plumber: a button offering a free quote the site doesn't offer passes");
}
// 3 · a page with no line under the headline: New is right, and nothing claims to replace it
{
  const html = `<title>Local SEO Services in Culver City | Rocket Growth Agency</title><h1>Local SEO</h1><a class="btn" href="/#audit">Get your free audit</a> free audit Google Business Profile`;
  const { r } = await run(RGA, { html, options: [{ headline: "Local SEO Services in Culver City", sub: "We set up the Google Business Profile for Culver City businesses.", button: "Get your free audit", why: "" }] });
  const rec = r.outcome_data.recipe, rp = rec.options[0].checks.find((c) => c.id === "replaces");
  if (rec.evidence.today.sub !== "" || !rp.ok || /(today's |, )line\b/.test(rp.what)) fail(`no line today: it claims to replace one (${rp.what})`);
}
// 4 · a long business name stays out of the headline's keyword (the brand's words don't count)
{
  const L = { ...RGA, business_name: "Culver City Local SEO Agency of Greater Los Angeles" };
  const { r } = await run(L, { html: RGA_PAGE, options: [{ headline: "Culver City Local SEO Agency of Greater Los Angeles", sub: "We set up the Google Business Profile for Culver City businesses.", button: "Get your free audit", why: "" }] });
  if (r.outcome_data.recipe.options[0].checks.find((c) => c.id === "keyword_city").ok) fail("long name: a headline that's only the business name counts as the plan keyword");
}
// 5 · a site whose button goes to a booking page: the model is told where it goes; "Book" offers what the site offers
{
  const html = `<title>Local SEO Services in Culver City | Rocket Growth Agency</title><h1>Local SEO</h1><p>Local SEO for Culver City businesses.</p><a class="cta" href="https://cal.example.com/rga">Book a call</a>`;
  const { r, seen } = await run(RGA, { html, options: [{ headline: "Local SEO Services in Culver City", sub: "Local SEO and Google Business Profile help for Culver City businesses.", button: "Book a call", why: "" }] });
  if (!/goes to https:\/\/cal\.example\.com\/rga/.test(seen.user) || !r.outcome_data.recipe.options[0].ok) fail("booking: the button's target isn't given, or a booking button that matches fails");
}
// none passes → no lines, every reason
{
  const { r } = await run(RGA, { html: RGA_PAGE, options: [{ headline: "x", sub: "", button: "", why: "" }] });
  if (r.outcome_data.recipe.pick !== -1 || r.outcome_data.draft !== "" || !(r.outcome_data.problems || []).length) fail("no passing option still writes a draft");
}
// wired
{
  const FE = read("netlify/functions/flow-execute.js"), AD = read("netlify/functions/admin-deliverables.js"), AR = read("netlify/functions/_website-autorun.js"), A = read("admin/admin.js");
  if (!/"m1\.web\.h1_cta": async \(\{ client \}\) => \{[\s\S]{0,600}require\("\.\/_headline-cta"\)\.draftHeadline\(/.test(FE)) fail("step 44 doesn't run the recipe");
  if (!/const hero = require\("\.\/_headline-cta"\)\.readHero\(html\);\s*c\.items\[1\]\.before = hero\.sub; c\.items\[2\]\.before = hero\.button;/.test(AD)) fail("the reader still treats the line and the button as New");
  if (!/RECIPE_STEPS\.includes\(key\) && c\.drafted_by === AUTO_WHO && !ar0\.recipe && !done\["redo:recipe"\]/.test(AR)) fail("a draft from before the recipe doesn't redraft by it");
  if (!/r\.kind === "headline"/.test(A) || !/i\.label === "Main button" \? \{ \.\.\.i, after: o\.button \}/.test(A)) fail("the card doesn't show the headline options, or Use this one doesn't fill all three lines");
}
if (bad.length) { console.error(`❌ the headline recipe — ${bad.length} regression(s):`); for (const b of bad) console.error(`  · ${b}`); process.exit(1); }
console.log("✅ the headline recipe holds: today's headline, line and button read live (each replaces), three options from the pinned model, rule checks (70/160/30, keyword + city, agrees with the title, button offers only what the site does, facts, claims); RGA · plumber 'Call now' · no line today · long name · booking button");
