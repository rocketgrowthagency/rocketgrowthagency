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
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";

const W = "/Users/chris/RGA/Rocket Growth Agency Website VS Code/";
let src;
try { src = fs.readFileSync(W + "netlify/functions/flow-execute.js", "utf8"); }
catch { console.error("⛔ cannot read flow-execute.js"); process.exit(2); }

const fail = [];
// 🔴 LOCATE THE HANDLER, NOT A MENTION OF IT. `readLockedPlan` now reads
// `tasks["m1.strategy.keywords_locations"]` and is DEFINED EARLIER in the file, so a bare
// indexOf of the quoted id found that mention and extracted the wrong function — every assertion
// below then failed against code it was never meant to read. Match the key AND its handler.
// → feedback_a_symbol_name_is_a_claim_about_the_codebase
const i = src.search(/"m1\.strategy\.keywords_locations":\s*async\s*\(/);
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

// ── 5 · A PHRASE NOBODY TYPES IS NOT A KEYWORD ──────────────────────────────────────────────
// Two of the five locked terms returned ZERO Google autocomplete suggestions. The plan was
// internally consistent and demand-blind. → project_the_keyword_plan_audit
if (!/const demandOf = async \(term\)/.test(step)) fail.push("the demand check is gone — a phrase nobody types can be locked again");
if (!/engine=google_autocomplete/.test(step)) fail.push("the demand check no longer asks Google what it suggests");
if (!/if \(!key\) return null;\s*\/\/ unknown is not zero/.test(step)) {
  fail.push("a missing SERPAPI_KEY no longer returns UNKNOWN — it would read as zero demand");
}
if (!/d2\.suggestions === 0/.test(step)) fail.push("zero-suggestion terms are no longer flagged");
if (!/never suggested/.test(step)) fail.push("the card no longer says which phrases Google has never suggested");
// ── 🔴🔴 UPDATED 2026-10-02 — THESE THREE WENT RED ON A CORRECT CHANGE ───────────────────────────
// They pinned the SPELLING of a temporary situation: that we had no real search volume and could
// only approximate it with autocomplete. The Ads Keyword Planner went live, the step now measures
// actual volume, and the gate read that as the safeguard being removed. A gate written for an
// episode outlives the episode; what is permanent is the PROPERTY underneath:
//
//   🔑 A PROXY MUST NEVER BE PRESENTED AS A MEASUREMENT.
//
// So: if the step still uses autocomplete, that branch must disclaim it; and if the step names
// search volume, it must actually be reading the Keyword Planner.
// → feedback_a_gate_written_for_a_temporary_state_outlives_it · feedback_a_gate_must_pin_the_property_not_the_spelling
// 🔴 STRIP THE COMMENTS FIRST. The comments inside this very step explain that autocomplete is not
// search volume — so the disclaimer check passed on the PROSE after the actual disclaimer had been
// deleted from the card. A comment asserting a fix is not the fix.
// → feedback_a_comment_asserting_a_fix_is_not_the_fix
const code = step.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

const usesAutocomplete = /engine=google_autocomplete/.test(code);
const namesVolume = /search volume/i.test(code);
const measuresVolume = /_ads-keywords/.test(code) && /keywordVolumes|volumeFor/.test(code);

if (usesAutocomplete) {
  // The disclaimer must exist, in whatever words — pin that it says what autocomplete is NOT.
  const disclaims = /autocomplete[^.]{0,240}?(not search volume|not a search count|indicates only)/i.test(code)
    || /(not search volume|not a search count)[^.]{0,240}?autocomplete/i.test(code);
  if (!disclaims) fail.push("autocomplete is used without saying it is not a search count — a proxy presented as a measurement");
}
if (namesVolume && !measuresVolume) {
  fail.push("the step names search volume without reading the Keyword Planner — that is a claim it cannot support");
}
// 🔑 And where it DOES measure, the figure must be labelled with the geography it was measured in.
// A number without its location is not evidence: during development a geo id written from memory
// resolved to a city 350 miles away and the API answered it with 200 and real figures.
// 🔴 Pin the LINE THAT CARRIES THE NUMBERS, not the file — `canonicalName` appears several times,
// so a whole-step test stayed green after the measured line stopped naming the place.
if (measuresVolume) {
  // 🔴 RE-PINNED 2026-10-02 — the prose "Measured in …" line was replaced by the admin's measurement
  // panel, which names the geography in its header. The property is unchanged; the producer moved.
  // → feedback_a_gate_must_pin_the_property_not_the_spelling
  const measuredLine = (code.match(/^.*Measured in \$\{[^\n]*$/m) || [""])[0];
  const geoLabelDecl = (code.match(/^\s*const geoLabel\s*=.*$/m) || [""])[0];
  const prose = /\$\{geoLabel\}/.test(measuredLine) && /canonicalName/.test(geoLabelDecl);
  let panel = false;
  try {
    const a = fs.readFileSync(path.join(SITE, "admin", "admin.js"), "utf8");
    panel = /function measurementPanelHtml\(/.test(a) && /canonicalName/.test(a) && /ob-panel-h/.test(a);
  } catch { /* if admin.js cannot be read the prose test stands alone */ }
  if (!prose && !panel) {
    fail.push("measured volume is printed without naming the geography it was measured in");
  }
}

// The demand result must be CARRIED, not just computed. Read the persisted object by brace-matching
// rather than pinning its exact field list, which grew when real volume landed.
{
  const at = step.lastIndexOf("outcome_data: {");
  let block = "";
  if (at >= 0) {
    let depth = 0;
    for (let i = step.indexOf("{", at); i < step.length; i++) {
      if (step[i] === "{") depth++;
      else if (step[i] === "}") { depth--; if (!depth) { block = step.slice(at, i + 1); break; } }
    }
  }
  if (!block || !/(^|[{,]\s*)demand\s*[,:}]/m.test(block)) {
    fail.push("the demand result is computed but not carried in outcome_data");
  }
}

if (fail.length) {
  console.error("🔴 the keyword plan can be national for a local business:");
  for (const f of fail) console.error("   · " + f);
  process.exit(1);
}
console.log("✅ a local client is required to produce geo-modified keywords and in-market locations; an impression cannot become a city");
