#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — A LOCAL PLAN HAS LOCAL TERMS, AND AN IMPRESSION IS NOT A LOCATION
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-10-02, on RGA's own keyword plan: *"why did it choose Chicago IL and Houston TX? I am
 * local in Culver City?"* and *"we do only local SEO so this is also not good."*
 *
 * Two failures, and the keyword half hid behind the location half:
 *  1. NOT ONE of the five keywords carried a geo-modifier. RGA's baseline is an 81-point geo-grid
 *     around its own office; the map pack is proximity-bound, so a bare national head term cannot be
 *     won from one address. The plan could not move the number the audit measures.
 *  2. Search Console impressions for NATIONAL INFORMATIONAL queries ("local seo for gutter
 *     installers") were read as evidence of a MARKET and became Chicago and Houston. An impression
 *     is evidence of a TOPIC; it is never evidence of a location.
 *
 * 🔑 The locations half was NOT a bug — `geography_model` was `national_one_office`, and that branch
 * asks for metros by design. The setting was wrong for the business, not the code.
 * → project_geography_model_drives_strategy
 *
 * Exit 0 pass · 1 the generator can produce a national plan for a local business · 2 could not run.
 */
import fs from "node:fs";

const W = "/Users/chris/RGA/Rocket Growth Agency Website VS Code/";
let src;
try { src = fs.readFileSync(W + "netlify/functions/flow-execute.js", "utf8"); }
catch { console.error("⛔ cannot read flow-execute.js"); process.exit(2); }

const fail = [];
const i = src.indexOf('"m1.strategy.keywords_locations"');
if (i < 0) { console.error("⛔ the keyword step is gone"); process.exit(2); }
// 🔴 BRACE-MATCH FROM THE ARROW'S BODY. The first `{` after the key is the DESTRUCTURING brace in
// `async ({ client, clientId }) =>`, which opens and closes immediately — matching from there made
// `step` two words long and every assertion below failed at once. A total failure is a harness
// result, not a product result. → feedback_three_ways_i_broke_my_own_sweep
const bodyStart = src.indexOf("=> {", i);
if (bodyStart < 0) { console.error("⛔ cannot find the handler body"); process.exit(2); }
let d = 0, end = -1;
for (let k = src.indexOf("{", bodyStart); k < src.length; k++) {
  if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) { end = k + 1; break; } }
}
if (end < 0) { console.error("⛔ the handler body is unbalanced"); process.exit(2); }
const step = src.slice(bodyStart, end);
if (step.length < 800) { console.error(`⛔ the extracted handler is only ${step.length} chars — the extraction is wrong, not the code`); process.exit(2); }

// ── 1 · THE KEYWORD ASK IS CONDITIONAL ON HOW THE BUSINESS IS FOUND ─────────────────────────
if (!/const keywordAsk = national/.test(step)) {
  fail.push("the keyword ask is no longer conditional on the geography model — a local business would be asked for national terms");
}
if (!/AT LEAST 3 of the 5 MUST carry a geo-modifier/.test(step)) {
  fail.push("a non-national client is no longer required to produce geo-modified keywords");
}
// 🔴 and the requirement must name the client's OWN market, not a generic word
if (!/\$\{market\}/.test(step)) fail.push("the keyword ask no longer names the client's own market");
if (!/const market = client\.primary_market/.test(step)) fail.push("`market` is no longer read from the client record");

// ── 2 · AN IMPRESSION IS A TOPIC, NOT A LOCATION ────────────────────────────────────────────
if (!/const evidenceCaveat = national \|\| !evidence \? "" :/.test(step)) {
  fail.push("the evidence caveat is gone — Search Console impressions can become target cities again");
}
if (!/tells you a TOPIC, never a LOCATION/.test(step)) fail.push("the caveat no longer says an impression is a topic, not a location");
// 🔴 It must actually REACH the model. A caveat computed and never passed is the defect it fixes.
if (!/\$\{clientCtx\(client\)\}\$\{evidence\}\$\{evidenceCaveat\}/.test(step)) {
  fail.push("the evidence caveat is computed but never passed to the prompt");
}
if (!/\$\{keywordAsk\} and \$\{locationAsk\}/.test(step)) fail.push("the keyword ask is computed but never passed to the prompt");

// ── 3 · THE LOCATION ASK STILL RESPECTS THE MODEL, AND STAYS IN THE MARKET ──────────────────
if (!/never a metro in another state/.test(step)) {
  fail.push("a service-area client can be given a metro in another state again");
}
if (!/3 TARGET METROS/.test(step)) fail.push("the national_one_office branch lost its metro ask — that branch was correct");

// ── 4 · NO INVENTED GEOGRAPHY ───────────────────────────────────────────────────────────────
// The first corrected draft said Playa Vista is "directly east" of Culver City (southwest) and
// Mar Vista is "immediately north" (west). Right towns, invented bearings.
if (!/Never state a compass direction, a distance or a drive time/.test(step)) {
  fail.push("the prompt no longer forbids inventing compass directions and distances between places");
}

if (fail.length) {
  console.error("🔴 the keyword plan can be national for a local business:");
  for (const f of fail) console.error("   · " + f);
  process.exit(1);
}
console.log("✅ a local client is required to produce geo-modified keywords and in-market locations; an impression cannot become a city");
