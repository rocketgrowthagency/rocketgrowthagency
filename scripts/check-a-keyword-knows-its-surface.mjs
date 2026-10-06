#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — A LOCAL KEYWORD KNOWS WHICH SURFACE IT IS WON ON
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-10-05: *"is there a way to look up the info for the map listing top 3 and use this to
 * compare or compete or help in the decision?"*
 *
 * Asking it broke a premise the whole step rested on. MEASURED at a Culver City location:
 *
 *   "local seo services culver city"  →  NO map pack. organic_results only.
 *   "seo company near me"            →  map pack: 71 · 39 · 181 reviews
 *   "local seo agency los angeles"   →  map pack: 181 · 71 · 5 reviews
 *
 * The plan's own first keyword cannot be won in the map pack, because Google does not show one for
 * that phrase — while month one's baseline is an 81-point GEO GRID, which measures nothing else. The
 * plan was being graded on a surface some of its terms never appear on, and the review-count
 * "difficulty" printed beside those terms came from `engine=google_maps`, which returns local
 * businesses WHATEVER you type. A real number about the wrong contest.
 *
 * 🔴 AND THE CODE HAD TALKED ITSELF OUT OF LOOKING. A comment in flow-execute.js concluded that the
 * difficulty probe "cannot catch this" because a maps search cannot tell a head term from a local one.
 * That was true of that engine, and it became a reason not to ask. `engine=google` discriminates
 * perfectly and was one parameter away.
 * 🔑 "THE MEASUREMENT CANNOT TELL THEM APART" IS A FACT ABOUT THE REQUEST I CHOSE, NOT ABOUT GOOGLE.
 * → project_the_grid_runs_on_serpapi · project_proving_the_work_works
 *
 * Runs the real `localSurface` against responses recorded from the live API on 2026-10-05, with
 * `globalThis.fetch` stubbed — no request, no metered call.
 *
 * Exit 0 pass · 1 a keyword's surface can be assumed, or a pack figure can describe a term with no
 * pack · 2 could not run.
 */
import fs from "node:fs";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
let flow;
try { flow = fs.readFileSync(`${SITE}/netlify/functions/flow-execute.js`, "utf8"); }
catch { console.error("⚠️  INDETERMINATE — cannot read flow-execute.js"); process.exit(2); }

let ads;
try {
  const require = createRequire(`${SITE}/netlify/functions/`);
  ads = require("./_ads-keywords.js");
} catch (e) { console.error(`⚠️  INDETERMINATE — cannot load _ads-keywords.js: ${e.message}`); process.exit(2); }
for (const f of ["localSurface", "serpLocation"]) {
  if (typeof ads[f] !== "function") {
    console.error(`⚠️  INDETERMINATE — ${f} is not exported; re-pin this gate.`);
    process.exit(2);
  }
}

const fail = [];
const ok = (c, msg) => { if (!c) fail.push(msg); };

// ── RECORDED FROM THE LIVE SERPAPI, 2026-10-05, at "Culver City, California, United States" ─────
const PACK = [
  { title: "Eclipse Marketing - Los Angeles SEO Agency", rating: 5, reviews: 71, type: "Internet marketing service" },
  { title: "405 Ads SEO Los Angeles", rating: 5, reviews: 39, type: "Internet marketing service" },
  { title: "The Los Angeles SEO Company", rating: 5, reviews: 181, type: "Internet marketing service" },
];
const SERP = {
  // the plan's own #1 keyword: organic only
  "local seo services culver city": { organic_results: [{ position: 1 }], related_questions: [] },
  "seo company near me": { local_results: { places: PACK }, local_map: {}, organic_results: [] },
  "local seo agency los angeles": { local_results: { places: [PACK[2], PACK[0],
    { title: "Los Angeles SEO Services", rating: 5, reviews: 5, type: "Marketing agency" }] }, organic_results: [] },
  // the client itself holding a pack
  "rocket growth agency near me": { local_results: { places: [
    { title: "Rocket Growth Agency", rating: 5, reviews: 12, type: "Marketing agency", place_id: "OWNPLACE" },
    PACK[0], PACK[1]] } },
  // a pack whose rows carry no review counts at all
  "unreviewed service near me": { local_results: { places: [{ title: "A" }, { title: "B" }] } },
};

const realFetch = globalThis.fetch;
let calls = 0, sawLocationParam = false, sawEngine = null;
globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  calls++;
  sawEngine = u.searchParams.get("engine");
  if (u.searchParams.get("location")) sawLocationParam = true;
  const q = String(u.searchParams.get("q") || "").toLowerCase();
  if (q === "boom") return { ok: false, status: 429, async json() { return {}; }, async text() { return "rate limited"; } };
  const body = SERP[q];
  if (!body) return { ok: true, status: 200, async json() { return { error: "unseeded fixture: " + q }; }, async text() { return ""; } };
  return { ok: true, status: 200, async json() { return body; }, async text() { return ""; } };
};
process.env.SERPAPI_KEY = process.env.SERPAPI_KEY || "stub";

try {
  // ── 1 · THE LOCATION COMES FROM GOOGLE'S OWN CANONICAL NAME ───────────────────────────────────
  ok(ads.serpLocation("Culver City,California,United States") === "Culver City, California, United States",
    "serpLocation does not turn an Ads canonical name into the spaced form SerpAPI needs — the pack would "
    + "be measured somewhere other than where the volumes were");
  ok(ads.serpLocation("", "") === null,
    "serpLocation invents a location out of nothing — a pack measured at the wrong place is worse than none");

  const loc = ads.serpLocation("Culver City,California,United States");
  const r = await ads.localSurface(
    ["local seo services culver city", "seo company near me", "local seo agency los angeles"],
    { location: loc });
  ok(!r.error, `localSurface could not run: ${r.error}`);
  const by = new Map((r.rows || []).map((x) => [x.term, x]));

  // ── 2 · THE WEB SERP, NOT THE MAPS ENGINE ─────────────────────────────────────────────────────
  ok(sawEngine === "google", `the surface probe asks engine=${sawEngine} — a maps search returns local `
    + "businesses whatever you type, so it can never tell a pack term from an organic one. Only the web "
    + "SERP answers this question");
  ok(sawLocationParam, "the surface probe sends no location — a map pack is different in every town, so an "
    + "unlocated answer describes nowhere");

  // ── 3 · THE HEADLINE FACT: A TERM WITH NO PACK IS REPORTED AS HAVING NO PACK ──────────────────
  const organic = by.get("local seo services culver city") || {};
  ok(organic.pack === false,
    `"local seo services culver city" reports pack=${organic.pack} — Google returns organic results and no `
    + "local pack for it, and this is the exact term Chris's plan ranked first");
  ok(organic.reviews === null || organic.reviews === undefined,
    `a term with NO map pack carries a review count (${organic.reviews}) — that is a difficulty figure for a `
    + "contest it is not in");
  ok(!organic.top || !organic.top.length,
    "a term with no map pack still carries a top three");

  const pack = by.get("seo company near me") || {};
  ok(pack.pack === true, `"seo company near me" reports pack=${pack.pack} — it does return a map pack`);
  ok(pack.reviews === 71, `the pack's median review count is ${pack.reviews}, not the median of 71/39/181 — `
    + "the MEDIAN is used so one outlier cannot make a winnable map look impossible");
  ok((pack.top || []).length === 3, `the pack's top three were not captured (got ${(pack.top || []).length})`);
  ok((pack.top || []).every((x) => x.name && typeof x.reviews === "number"),
    "a captured pack row is missing the name or the review count — Chris asked for who holds the pack so the "
    + "plan can compete with them, which needs both");
  ok((pack.top || []).some((x) => x.category),
    "no pack row carries its category — category match is one of the three things that decides pack entry");

  // ── 4 · ALREADY IN THE PACK IS THE MOST USEFUL THING THE PROBE CAN SAY ────────────────────────
  {
    const mine = await ads.localSurface(["rocket growth agency near me"],
      { location: loc, ownName: "Rocket Growth Agency" });
    const row = (mine.rows || [])[0] || {};
    ok(row.mine === true, "the client standing in its own map pack is not detected by name — a term whose pack "
      + "they already hold is a defence job, not a climb");
    ok((row.top || []).some((x) => x.mine === true), "the client's own row in the pack is not marked");
  }
  {
    const mine = await ads.localSurface(["rocket growth agency near me"],
      { location: loc, ownPlaceId: "OWNPLACE", ownName: "Something Else Entirely" });
    ok(((mine.rows || [])[0] || {}).mine === true,
      "the client is not matched by place id — two businesses can share a name and one business can be "
      + "renamed, so the id is the reliable key");
  }

  // ── 5 · AN UNREADABLE OR FAILED PROBE IS UNKNOWN, NEVER "NO PACK" ─────────────────────────────
  {
    const r2 = await ads.localSurface(["boom"], { location: loc });
    const row = (r2.rows || [])[0] || {};
    ok(row.pack === null, `a failed probe reports pack=${row.pack} — an unanswered request must never `
      + "reclassify a keyword as organic-only, which would move it off the profile and onto the content plan");
  }
  {
    const r3 = await ads.localSurface(["unreviewed service near me"], { location: loc });
    const row = (r3.rows || [])[0] || {};
    ok(row.pack === true, "a pack whose rows carry no review counts is reported as having no pack — `pack` is "
      + "the presence of the block, not whether three numbers could be read out of it");
    ok(row.reviews === null, "a pack with no readable review counts reports a review count anyway");
  }
  {
    const saved = process.env.SERPAPI_KEY;
    delete process.env.SERPAPI_KEY;
    const r4 = await ads.localSurface(["seo company near me"], { location: loc });
    process.env.SERPAPI_KEY = saved;
    ok(r4.error && !(r4.rows || []).length,
      "with no SerpAPI key the surface probe returns rows anyway — an unconfigured install must not classify "
      + "every keyword's surface");
  }
  ok((await ads.localSurface(["seo company near me"], { location: null })).error,
    "the surface probe runs without a location — the answer would describe nowhere in particular");

  // ── 6 · IT IS BOUNDED ─────────────────────────────────────────────────────────────────────────
  ok(typeof ads.MAX_SURFACE_PROBES === "number" && ads.MAX_SURFACE_PROBES <= 8,
    `the surface probe is bounded at ${ads.MAX_SURFACE_PROBES} — SerpAPI is a metered plan and this must `
    + "never run over a candidate pool");

  // ── 7 · THE STEP USES IT TO DECIDE AND TO DISCLOSE ────────────────────────────────────────────
  const code = flow.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
  // 🔴 A LIVE CALL. `surf = surf || await ads.localSurface(…)` satisfied a bare search for the call and
  // never ran, because `surf` is initialised to a truthy placeholder. Pin the assignment.
  // → feedback_a_literal_grep_misses_computed_writes
  ok(/surf\s*=\s*await ads\.localSurface\(/.test(code),
    "flow-execute never calls ads.localSurface as a live assignment — every keyword's surface is assumed, "
    + "which is the state this gate exists to end");
  ok(/surface_note:/.test(code) && /surface:\s*surfaceRows/.test(code),
    "the surface measurement is not written to outcome_data, so nothing downstream can tell a pack term "
    + "from a page term");
  ok(/pack_rivals:/.test(code),
    "the businesses holding the pack are not stored — Chris asked for the top three so the plan can compete "
    + "with them, and the competitor map should be built from the same list");
  // 🔑 The pack's own figure must WIN over the maps-search one for a pack term, and a term with no pack
  // must lose its review count entirely.
  ok(/h\.pack === false \? null/.test(code),
    "a term measured as having NO map pack keeps whatever review count the maps search gave it — a real "
    + "number describing a contest the term is not in");
  ok(/geo grid|geo-grid/i.test(code) && /no keyword in this plan triggers a map pack/i.test(code),
    "the card never says that a plan with no pack term cannot be measured by the geo-grid baseline — the "
    + "operator would report grid position over a plan that can never move it");
} catch (e) {
  globalThis.fetch = realFetch;
  console.error(`⚠️  INDETERMINATE — the gate itself threw: ${e.message}`);
  console.error("   Fix the gate; do NOT read this as a product failure.");
  process.exit(2);
}
globalThis.fetch = realFetch;

if (!calls) { console.error("⚠️  INDETERMINATE — the stub was never called; nothing was exercised."); process.exit(2); }
if (fail.length) {
  console.error("🔴 a keyword's surface can be assumed rather than measured:");
  for (const f of fail) console.error(`   · ${f}`);
  process.exit(1);
}
console.log(`✅ every locked keyword is asked of the web SERP at the client's own location over ${calls} recorded `
  + "responses: a term with no map pack is reported as having none and carries no pack difficulty, the top three "
  + "are captured with names and review counts, the client's own listing is recognised, and a failed probe is "
  + "unknown rather than organic");
