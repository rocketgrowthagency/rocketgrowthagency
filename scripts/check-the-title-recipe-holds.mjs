#!/usr/bin/env node
/**
 * check-the-title-recipe-holds.mjs — STEP 43'S LOCKED RECIPE (approved title_meta_recipe_v1, the owner 11-7: "send mockup of how step 43 will be
 * drafted so we can lock it down and not have issues or errors again" → "approved").
 *
 * The 11-7 audit found step 43 was one draft from the default model, blind to the page's own numbers, with nothing checking its length or
 * keyword, and RGA's own prices handed to every client's draft. The recipe: evidence → three options from a pinned model → rule checks → rule
 * pick → measured after. This gate runs it on fixtures, with fakes for every outside read:
 *   RGA's real case · a plumber with no price on file · a client with no Search Console · a long business name · a client in two cities.
 * Exit 0 = the recipe holds. 1 = it doesn't. 2 = couldn't tell.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const req = createRequire(import.meta.url);
const read = (p) => fs.readFileSync(path.join(SITE, p), "utf8");
let TM, PM;
try { TM = req(path.join(SITE, "netlify/functions/_title-meta.js")); PM = req(path.join(SITE, "netlify/functions/_page-measure.js")); }
catch (e) { console.error(`⚠️  INDETERMINATE — couldn't load the recipe: ${e.message}`); process.exit(2); }
const bad = [];
const fail = (m) => bad.push(m);

const RGA = { id: "rga", business_name: "Rocket Growth Agency", primary_market: "Culver City, CA", website_url: "https://www.rocketgrowthagency.com/", identity_phone: "(424) 242-2040" };   // the BUSINESS phone (calls_catchup_v1 F, 11-11)
const PLAN = { keywords: ["local seo services near me", "google business profile optimization", "local seo agency culver city", "seo company culver city ca"], locations: ["Mar Vista", "Palms", "Playa Vista"] };
const PAGE = `<html><head><title>Local SEO &amp; Google Maps Agency | Rocket Growth Agency</title><meta name="description" content="We set up and keep up your Google Business Profile."></head><body>Cancel anytime.</body></html>`;
const OPTIONS = [
  { title: "Local SEO Services in Culver City | Rocket Growth Agency", description: "Google Business Profile & Maps SEO for Culver City businesses. Month-to-month from $625/mo. Call (424) 242-2040.", why: "plan #1" },
  { title: "Local SEO Agency in Culver City, CA | Rocket Growth Agency", description: "Culver City local SEO with a 24/7 team. Call (424) 242-2040.", why: "plan #3" },
  { title: "Google Maps SEO in Culver City | Rocket Growth Agency", description: "Get found on Google Maps in Culver City. Same-day start, $499/mo.", why: "maps" },
];
const deps = (o = {}) => {
  const seen = { prompt: "", models: null };
  return { seen, page: async () => o.html ?? PAGE, gsc: async () => (o.gsc === undefined ? [{ query: "rocket growth", clicks: 1, impressions: 41, position: 18.8 }, { query: "local seo culver city", clicks: 2, impressions: 30, position: 9 }] : o.gsc),
    ownPrices: () => o.prices ?? ["$625", "$1,250"], competitors: async () => o.comp ?? { titles: [], why: "SerpAPI has 0 searches left this month" }, services: () => "local SEO",
    ai: async (sys, user, opt) => { seen.prompt = user; seen.models = opt.models; if (opt.info) { opt.info.model = o.model || "claude-sonnet-5-5"; opt.info.fell_back = !!o.fellBack; } return o.text ?? `Here you go:\n${JSON.stringify({ options: o.options || OPTIONS })}`; } };
};
const run = async (client, o = {}) => { const d = deps(o); const r = await TM.draftTitleMeta({ client, tasks: {}, data: o.data || {}, plan: o.plan || PLAN, d }); return { r, d }; };

// 1 · RGA's real case: the plan's #1 + their city wins; "24/7", "$499", "Same-day" and the off-plan keyword fail, each named
{
  const { r, d } = await run(RGA);
  const rec = r.outcome_data.recipe;
  if (rec.pick !== 0 || r.outcome_data.draft !== `TITLE: ${OPTIONS[0].title}\nMETA: ${OPTIONS[0].description}`) fail(`RGA: the winner isn't the plan's #1 keyword with Culver City (picked ${rec.pick})`);
  const o2 = rec.options[1], o3 = rec.options[2];
  if (o2.ok || !o2.checks.some((c) => c.id === "claims" && !c.ok) || !o2.checks.some((c) => c.id === "facts" && !c.ok)) fail("RGA: a 24/7 promise passes");
  if (o3.ok || !o3.checks.some((c) => c.id === "keyword_city" && !c.ok) || !o3.checks.some((c) => c.id === "facts" && /\$499/.test(c.what))) fail("RGA: an off-plan keyword or a price that isn't theirs passes");
  if (JSON.stringify(d.seen.models) !== JSON.stringify(TM.MODELS) || rec.model !== "claude-sonnet-5-5" || TM.MODELS[0] !== "claude-sonnet-5-5") fail("the model isn't pinned (newest first) and recorded on the draft");
  for (const want of ["Its title today: Local SEO & Google Maps Agency | Rocket Growth Agency", "rocket growth · 41 · 1 · 18.8", "Their prices (use only these, exactly): $625; $1,250", "(couldn't check)"]) if (!d.seen.prompt.includes(want)) fail(`RGA: the evidence the model gets is missing "${want}"`);
  if (!rec.evidence.earned.includes("local seo culver city") || rec.evidence.earned.includes("rocket growth")) fail("RGA: a search the page earns clicks for isn't kept (or a brand search counts as one)");
  if (!rec.evidence.notes.some((n) => /SerpAPI has 0 searches left/.test(n))) fail("RGA: competitors that couldn't be checked aren't said to be");
}
// 1b · a contact cell never reaches a title (calls_catchup_v1 F, 11-11): a client with only the owner's cell on file is told "no phone"
{
  const { r, d } = await run({ ...RGA, identity_phone: null, primary_contact_phone: "(310) 555-0199" });
  if (!/Phone: none on file \(don't write one\)/.test(d.seen.prompt) || /555-0199/.test(d.seen.prompt) || r.outcome_data.recipe.options[0].ok) fail("a contact cell reaches the title draft (only the business phone may)");
}
// 2 · a plumber with no price on file: the model is told there's no price, and an option with one fails
{
  const P = { id: "p", business_name: "Acme Plumbing", primary_market: "Austin, TX", website_url: "https://acmeplumbing.test", identity_phone: "(512) 555-0100" };
  const plan = { keywords: ["emergency plumber near me", "water heater repair austin"], locations: ["Hyde Park"] };
  const { r, d } = await run(P, { prices: [], plan, options: [
    { title: "Emergency Plumber in Austin | Acme Plumbing", description: "Fast plumbing in Austin from $99. Call (512) 555-0100.", why: "" },
    { title: "Emergency Plumber in Austin | Acme Plumbing", description: "Burst pipe or no hot water in Austin? Call (512) 555-0100.", why: "" }] });
  if (!/Prices: none on file \(never state a price/.test(d.seen.prompt)) fail("plumber: the model isn't told there's no price");
  if (r.outcome_data.recipe.options[0].ok || r.outcome_data.recipe.pick !== 1) fail("plumber: an invented price passes");
}
// 3 · no Search Console: said so, and the draft still goes on
{
  const { r } = await run(RGA, { gsc: null });
  if (!r.outcome_data.recipe.evidence.notes.includes("Couldn't read Search Console") || r.outcome_data.recipe.pick !== 0) fail("no Search Console: not said, or the draft stops");
}
// 4 · a long business name: brand at the end makes every title too long → no lines, every reason, never a half-draft
{
  const L = { ...RGA, business_name: "Westside Emergency Plumbing & Drain Co. LLC" };
  const { r } = await run(L, { plan: { keywords: ["emergency plumber near me"], locations: [] }, options: [{ title: "Emergency Plumber in Culver City | Westside Emergency Plumbing & Drain Co. LLC", description: "Call (424) 242-2040 in Culver City.", why: "" }] });
  if (r.outcome_data.recipe.pick !== -1 || r.outcome_data.draft !== "" || !/Option 1: .*of 60 characters/.test((r.outcome_data.problems || []).join(" "))) fail("long name: a title over 60 characters goes out, or the reason isn't named");
}
// 5 · two cities: the title names their own city (the primary market), not only the other one
{
  const two = { ...RGA, primary_market: "Culver City, CA" }, plan = { keywords: ["local seo agency"], locations: ["Santa Monica"] };
  const { r } = await run(two, { plan, options: [{ title: "Local SEO Agency in Santa Monica | Rocket Growth Agency", description: "Santa Monica SEO. Call (424) 242-2040.", why: "" }, { title: "Local SEO Agency in Culver City | Rocket Growth Agency", description: "Culver City SEO. Call (424) 242-2040.", why: "" }] });
  if (r.outcome_data.recipe.options[0].ok || r.outcome_data.recipe.pick !== 1) fail("two cities: a title without their own city passes");
}
// the checks themselves
{
  const pack = { city: "Culver City", brand: "Rocket Growth Agency", keywords: PLAN.keywords, places: PLAN.locations, phone: "(424) 242-2040", factsText: "Rocket Growth Agency (424) 242-2040 $625 Culver City", siteText: "", otherTitles: ["Local SEO Services in Culver City | Rocket Growth Agency"] };
  if (TM.checkOption(OPTIONS[0], pack).checks.find((c) => c.id === "not_duplicate").ok) fail("a title another page already has passes");
  if (TM.checkOption({ title: "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW", description: "x" }, pack).checks.find((c) => c.id === "title_fits").ok) fail("a title too wide for Google (pixels) passes");
  if (TM.checkOption({ title: OPTIONS[0].title, description: "Since 2015 in Culver City. Call (424) 242-2040." }, { ...pack, otherTitles: [] }).ok) fail("a number that isn't on file (a year) passes");
  // 11-7, the first real run: the brand's own words don't count toward a keyword ("| Rocket Growth Agency" is not "local seo AGENCY")
  if (TM.checkOption({ title: "Google Maps Local SEO in Culver City | Rocket Growth Agency", description: "Culver City. Call (424) 242-2040." }, { ...pack, otherTitles: [] }).checks.find((c) => c.id === "keyword_city").ok) fail("the business name's words count toward a plan keyword");
  // 11-7 night fixer: two failure tests went uncaught. Case 1's losers fail other checks, so nothing proved the PLAN's order picks the
  // winner, and a phone was only ever their own. Both checked here directly.
  { const P0 = { ...pack, otherTitles: [] }, d = "Local SEO for Culver City businesses. Call (424) 242-2040.";
    const hi = { title: "Local SEO Services in Culver City | Rocket Growth Agency", description: d }, lo = { title: "Local SEO Agency in Culver City | Rocket Growth Agency", description: d };
    if (!TM.checkOption(hi, P0).ok || !TM.checkOption(lo, P0).ok) fail("the plan-order fixture doesn't pass its own checks");
    else if (TM.pickOption([hi, lo], P0) !== 0) fail("the winner isn't the plan's highest keyword (the shorter, lower-ranked title won)");
    const f = TM.checkOption({ ...hi, description: "Local SEO for Culver City businesses. Call (310) 555-0199." }, P0).checks.find((c) => c.id === "facts");
    if (f.ok || !/isn't their phone/.test(f.what)) fail("a phone that isn't theirs passes"); }
  if (TM.parseOptions("no json here").length !== 0 || TM.parseOptions(`x {"options":[{"title":"a","description":"b"}]} y`).length !== 1) fail("the model's answer isn't read safely");
}
// measured after: the 28 days before, and "doing worse" only with 100+ views and a lower click rate
{
  const pub = "2026-09-01T00:00:00Z", rows = [];
  for (let k = 1; k <= 27; k++) rows.push({ date: new Date(Date.parse(pub) - k * 864e5 - 864e5).toISOString().slice(0, 10), clicks: 1, impressions: 10, position: 9 });
  for (let k = 0; k < 14; k++) rows.push({ date: new Date(Date.parse(pub) + k * 864e5).toISOString().slice(0, 10), clicks: 0, impressions: 10, position: 9 });
  const m = PM.measurePage(rows, pub, new Date("2026-11-07"));
  if (!m.before || m.before.state !== "ok" || m.before.impressions !== 270) fail(`measure: the 28 days before aren't read (${JSON.stringify(m.before)})`);
  if (!m.worse || m.worse.before !== 10) fail("measure: a lower click rate on 100+ views isn't 'doing worse'");
  if (PM.worseThanBefore([{ state: "ok", weeks: 2, clicks: 0, impressions: 50 }], { state: "ok", clicks: 5, impressions: 50 })) fail("measure: 'doing worse' is said on fewer than 100 views");
}
// wired: step 43 runs the recipe; the model ladder only moves on "that model doesn't exist"; a failed recipe redrafts once; the card shows it
{
  const FE = read("netlify/functions/flow-execute.js"), AR = read("netlify/functions/_website-autorun.js"), A = read("admin/admin.js"), AD = read("netlify/functions/admin-deliverables.js");
  if (!/"m1\.web\.homepage_meta": async \(\{ client \}\) => \{[\s\S]{0,600}require\("\.\/_title-meta"\)\.draftTitleMeta\(/.test(FE)) fail("step 43 doesn't run the recipe");
  const AMs = read("netlify/functions/_ai-models.js");   // 11-12 (setup D): the ladder lives in _ai-models.callClaude; it moves on for a missing model, a refused setting AND an empty answer
  if (!/if \(!last && \(r\.status === 404 \|\| r\.status === 400\)\) continue;/.test(AMs) || !/if \(!last\) continue;/.test(AMs) || !/if \(info\) \{ info\.model = got\.model \|\| ladder\[0\]; info\.fell_back = got\.fellBack; \}/.test(FE)) fail("the model ladder doesn't move on (missing model, refused setting, empty answer), or doesn't record the model");
  if (!/!od\.recipe && !!first;/.test(AR)) fail("a recipe with no passing option reads as a check finding (it should redraft once)");
  if (!/function wcRecipeHtml\(id, task\)/.test(A) || !/data-ob-tm-use=/.test(A) || !/wcRecipeHtml\(id, task\) : "";/.test(A)) fail("step 43's card doesn't show how its draft was made, or has no Use this one");
  if (!/\(isPage \|\| id === "m1\.web\.homepage_meta"\) && c && !c\.removes_page \? wcMeasureHtml\(id, task\)/.test(A) || !/Your move · doing worse than before/.test(A)) fail("a live title + description isn't measured, or 'doing worse' isn't RGA's move");
  if (!/from: new Date\(Date\.parse\(p0\.at\) - 29 \* 864e5\)/.test(AD)) fail("the measure read doesn't reach the 28 days before");
}

if (bad.length) { console.error(`❌ the title recipe — ${bad.length} regression(s):`); for (const b of bad) console.error(`  · ${b}`); process.exit(1); }
console.log("✅ the title recipe holds: evidence (today's lines, 90-day Search Console, plan + city, facts, competitors or 'couldn't check') → three options from the pinned newest model → rule checks → rule pick; RGA · plumber with no price · no Search Console · long name · two cities; measured against the 28 days before");
