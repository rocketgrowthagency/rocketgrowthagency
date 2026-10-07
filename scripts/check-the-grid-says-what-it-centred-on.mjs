#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — THE GRID SAYS WHAT IT CENTRED ON, AND CAN ACTUALLY RUN
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-10-02: *"why are we doing from culver city office?"* · *"what if customer is located
 * in texas?"* · *"how is this location derived?"* · *"should we remove 'office' … and just put
 * location (as this is standard practice)"*
 *
 * Three defects, one chain:
 *  1. 🔴 IT COULD NOT RUN. Places SearchText is 32/day and usage was 44; one 5×5 grid is ~25 calls.
 *     Raising the quota is forbidden — the 2026-05-07 spike hit $755 and billing was SUSPENDED.
 *     SerpAPI is now primary (already in this stack, ~4,300 searches spare); Places is the fallback.
 *  2. 🔴🔴 A SILENT FALLBACK. The centre is resolved by searching "<business> <market>", then the
 *     name, then THE MARKET ALONE. That third attempt centres on the CITY — and the scan carried on
 *     and reported identically. "Not found across 81 points" reads the same whether we searched
 *     around the client or around downtown. The anchor is recorded AND READ now.
 *  3. 🔴 "OFFICE" IS A FACT WE DO NOT HOLD. The client row has no address field; a service-area
 *     business may have no public office. The summary says the CLIENT'S NAME and "location".
 *
 * Exit 0 pass · 1 fail · 2 could not run.
 */
import fs from "node:fs";

// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT. A gate that can only ever read the real
// working tree cannot be pointed at a scratch copy, so its mutations cannot be run — and a
// gate nobody can make fail is a gate nobody has checked. Found 2026-10-06 when three
// mutations of `check-refusal-is-not-done` all came back green: it was reading straight past
// them. → feedback_a_gate_that_cannot_fail · feedback_the_harness_i_wrote_to_check_my_work_can_lie
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const W = `${__SITE}/`;
let grid, flow;
try {
  grid = fs.readFileSync(W + "netlify/functions/v2-rank-grid-background.js", "utf8");
  flow = fs.readFileSync(W + "netlify/functions/flow-execute.js", "utf8");
} catch { console.error("⛔ cannot read the rank sources"); process.exit(2); }

const fail = [];

// ── 1 · IT CAN RUN WITHOUT THE EXHAUSTED QUOTA ──────────────────────────────────────────────
if (!/async function serpMapsSearch\(/.test(grid)) fail.push("the SerpAPI rank source is gone — the scan is back on a quota that is already exhausted");
if (!/async function rankSearch\(/.test(grid)) fail.push("rankSearch (the one door over both sources) is gone");
if (!/const serp = process\.env\.SERPAPI_KEY;\s*\n\s*if \(serp\) return serpMapsSearch/.test(grid)) {
  fail.push("SerpAPI is no longer PREFERRED over Places — the exhausted quota would be used first");
}
if (!/return placesTextSearch\(query, lat, lng, placesKey, fieldMask\);/.test(grid)) {
  fail.push("Places is no longer the fallback — one source becomes a single point of failure");
}
// 🔴 and both call sites must go through the door, or one still spends Places directly
// 🔑 Exactly ONE caller, and it is rankSearch. Counting `await placesTextSearch(` found zero,
// because the one legitimate call is `return placesTextSearch(...)` — the regex, not the code.
const callers = (grid.match(/(?<!async function )placesTextSearch\(/g) || []).length;
if (callers !== 1) fail.push(`placesTextSearch has ${callers} caller(s); exactly 1 is expected, inside rankSearch`);
if (!/await rankSearch\(query, null, null,/.test(grid)) fail.push("the centre lookup no longer goes through rankSearch");
if (!/await rankSearch\(kw, lat, lng,/.test(grid)) fail.push("the per-point scan no longer goes through rankSearch");
// 🔴 the env guard must not demand a key the scan no longer needs
if (/if \(!SUPABASE_URL \|\| !SUPABASE_SERVICE_ROLE_KEY \|\| !GOOGLE_PLACES_API_KEY\)/.test(grid)) {
  fail.push("the env guard still REQUIRES GOOGLE_PLACES_API_KEY — it would refuse to run on SerpAPI alone");
}
if (!/!\(process\.env\.SERPAPI_KEY \|\| GOOGLE_PLACES_API_KEY\)/.test(grid)) {
  fail.push("the env guard no longer accepts either rank source");
}

// ── 2 · THE ANCHOR IS RECORDED *AND* READ ───────────────────────────────────────────────────
if (!/let anchorKind = "none";/.test(grid)) fail.push("the grid no longer tracks which anchor won");
if (!/anchorKind = "business";/.test(grid)) fail.push('the grid never records a "business" anchor');
if (!/anchorKind = "area";/.test(grid)) fail.push('the grid never records the "area" fallback');
if (!/(?<![\w$])anchor: \{ kind: anchorKind,/.test(grid)) fail.push("the anchor is no longer saved with the grid under that exact key");
// 🔴 recorded and never read is the defect it was added to fix
// 🔑 PIN THE PROPERTY, NOT THE SPELLING. This used to require the exact line
// `let anchorKind = "unknown";` and went RED on a correct 2026-10-02 change that added a second
// declarator (`let anchorKind = "unknown", anchorErr = null;`) so the catch could record WHY the
// read failed. A tightening must not read as a removal.
// → feedback_a_gate_must_pin_the_property_not_the_spelling
if (!/\banchorKind\s*=\s*"unknown"/.test(flow)) {
  fail.push("the step no longer defaults the anchor to unknown — an absent anchor would read as confirmed");
}
if (!/\banchorKind\b/.test(flow.replace(/anchorKind\s*=\s*"unknown"/g, ""))) {
  fail.push("the step no longer reads the anchor back — recorded and never read");
}
if (!/v2Campaign\?\.rank_grid\?\.anchor/.test(flow)) fail.push("the step no longer reads the anchor from the record the grid writes");
if (!/anchorKind = a2\.kind;/.test(flow)) fail.push("the anchor is fetched but never ASSIGNED — the value is read and thrown away");
if (!/anchorKind === "area"/.test(flow)) fail.push("the summary no longer distinguishes an area-centred grid from a listing-centred one");
// 🔴🔴 THIS PINNED A WORD ORDER AND MY OWN CORRECT REWRITE BROKE IT (2026-10-06). It required the
// literal `could not find ${client.business_name} on Google Maps`; the summary was restructured into
// the approved design and now reads `${client.business_name} could not be found on Google Maps` —
// the same fact, the same name, the same reason. The gate reported a defect that did not exist.
// 🔑 PIN THE PROPERTY: the area branch must NAME THE BUSINESS and GIVE A REASON. How it is worded
// is the writer's business. → feedback_a_gate_must_pin_the_property_not_the_spelling
{
  const i = flow.indexOf('anchorKind === "area"');
  const branch = i < 0 ? "" : flow.slice(i, i + 700);
  // 🔴 EACH SIDE OF THE TERNARY IS JUDGED ON ITS OWN. Testing the whole 800-char window let the
  // LISTING side satisfy a claim about the AREA side: a mutation that removed the business name from
  // the area branch passed, because the name was still there four lines down.
  // → feedback_a_gate_window_measured_in_characters_will_lie
  const sides = branch.match(/\?([\s\S]*?)\n\s*:\s/);
  const areaSide = sides ? sides[1] : "";
  if (!areaSide) fail.push("cannot read the area side of the centred-on ternary");
  const namesBusiness = /\$\{client\.business_name\}/.test(areaSide);
  const givesReason = /could not be found|could not find|not found on|because/i.test(areaSide);
  if (!branch || !namesBusiness || !givesReason) {
    fail.push("an area-centred grid no longer says WHY it is centred on the market"
      + ` (names the business: ${namesBusiness}, gives a reason: ${givesReason})`);
  }
}
// 🔴 an older scan has no anchor; unknown must not be assumed to be "business"
if (!/anchorKind = "unknown"/.test(flow) || /anchorKind = "business";[\s\S]{0,200}catch/.test(flow)) {
  fail.push("a missing anchor is being assumed rather than left unknown");
}

// ── 3 · IT NAMES THE CLIENT, AND SAYS "LOCATION" NOT "OFFICE" ───────────────────────────────
// 🔴 PIN THE PROPERTY, NOT THE LINE BREAK. This matched the literal "grid centred on ${anchorKind"
// and failed when the summary legitimately grew — it now names how many locked keywords were
// measured before saying where — so the two halves sit on different lines.
// → feedback_a_gate_must_pin_the_property_not_the_spelling
if (!/grid centred on /.test(flow) || !/anchorKind === "area"/.test(flow)) {
  fail.push("the summary no longer states what the grid was centred on, or no longer distinguishes a "
    + "grid centred on the LISTING from one that fell back to the AREA");
}
// 🔑 THE LISTING BRANCH NAMES THE CLIENT AND THEIR MARKET. Property, not phrasing.
//
// 🔴🔴 THIS PINNED `${client.business_name}'s location` AND A CORRECT REWRITE BROKE IT — the SECOND
// spelling pin in this one gate to do that in two days. The approved scan header (2026-10-07) reads
// `Centred on  <business>` with the market as a sub-value, so the business is named and the market
// is named and the possessive is gone. Pin what must be TRUE, not how it reads.
// → feedback_a_gate_must_pin_the_property_not_the_spelling
{
  // 🔴 FIND THE TERNARY THAT ACTUALLY WRITES THE HEADER. Searching for `anchorKind === "area"` AFTER
  // the first "Centred on" walked past it to the one in `outcome_data`, and the gate then judged the
  // wrong branch. Take the `anchorKind === "area"` that is followed by "Centred on".
/** The `: …` side of the centred-on ternary — what runs when the grid IS on the client's listing. */
const sidesOf = (b) => { const m2 = b.match(/\n\s*:\s([\s\S]*)$/); return m2 ? m2[1] : ""; };
  let i = -1;
  for (let at = flow.indexOf('anchorKind === "area"'); at >= 0; at = flow.indexOf('anchorKind === "area"', at + 1)) {
    if (flow.slice(at, at + 400).includes("Centred on")) { i = at; break; }
  }
  const branch = i < 0 ? "" : flow.slice(i, i + 800);
  if (!branch) fail.push("the grid summary no longer branches on the anchor where it names the centre");
  else {
    // the non-area side of the ternary is what names the client
    const listing = sidesOf(branch);
    if (!/\$\{client\.business_name\}/.test(listing)) fail.push("the summary no longer names the CLIENT when the grid is centred on their listing");
    if (!/\$\{market\b|\bmarket\b/.test(listing)) fail.push("the summary no longer names the MARKET the client's grid sits in");
  }
}
// 🔴 Scoped to the GRID SUMMARY, not the whole file. A blanket ban caught `national_one_office`
// (a geography-model key) and the metros prompt — both legitimate. A gate that accuses correct code
// is noise, and noise is how a real failure gets ignored.
// → feedback_a_gate_must_pin_the_property_not_the_spelling
{
  // 🔴 ANCHORED ON THE LITERAL "point grid centred on", which the restructure removed — the summary
  // now reads "${fullSize}-point geo-grid, N locked keywords, centred on …". Find the summary by
  // the PROPERTY that it is the grid step's `summary:`, then read it as a block.
  // 🔴 NOT THE FIRST `summary:` AFTER THE STEP ID — the executor returns several REFUSAL summaries
  // before it reaches the baseline ("No tracked keyword is set…", "has not been validated…"), and
  // the first match was one of those, which states no grid size and never could.
  // 🔑 The baseline summary is the only one built as an ARRAY, because it is the only one with a
  // shape the design reads. → feedback_a_gate_must_pin_the_property_not_the_spelling
  const si = flow.indexOf("summary: [", flow.indexOf('"m1.audit.grid_baseline"'));
  let sentence = "";
  if (si >= 0) {
    // to the end of the statement, never a character window
    // → feedback_a_gate_window_measured_in_characters_will_lie
    let depth = 0, j = si;
    for (; j < flow.length; j++) {
      const c = flow[j];
      if (c === "[" || c === "(" || c === "{") depth++;
      else if (c === "]" || c === ")" || c === "}") { if (!depth) break; depth--; }
      else if (c === "," && !depth) break;
    }
    sentence = flow.slice(si, j);
  }
  if (!sentence) fail.push("the grid summary is gone");
  else if (!/\$\{fullSize\}/.test(sentence)) fail.push("the grid summary no longer states the grid's size");
  else if (/office/i.test(sentence.replace(/^\s*\/\/.*$/gm, ""))) {
    fail.push('the grid summary says "office" again — we hold a map pin, not an office address');
  }
}
// the anchor travels to every reader, not just the sentence
// 🔴 Two fields, not one adjacency. They were on one line; the record grew and they are not any more.
if (!/anchor: anchorKind/.test(flow) || !/centred_on:/.test(flow)) {
  fail.push("outcome_data no longer carries the anchor and what it centred on — a grid centred on the "
    + "city centre reports identically to one centred on the client's own listing");
}

// ── 4 · IT MEASURES THE LOCKED PLAN, AND SIZES ITSELF TO IT ─────────────────────────────────
// 🔴 The scan measured `primary_service` — ONE term — while the plan locks FIVE, so four of every
// five were never measured. And the default 5×5 @ 0.5mi reaches only 1.61 km, while RGA's locked
// sub-locations sit at 1.4 / 2.7 / 4.6 km — TWO WERE OUTSIDE THE GRID and would still have been
// reported "not found". An absence we did not look for is the worst number this system can produce.
if (!/function readLockedPlan\(/.test(flow)) fail.push("readLockedPlan is gone — the scan would measure a placeholder term again");
// 🔴 PIN THE PROPERTY, NOT THE LINE. This matched the literal `const plan = readLockedPlan(recs);`
// and failed when the read legitimately MOVED EARLIER in the function — it now has to happen before
// the stored-scan freshness check, so that check can ask about the plan rather than the placeholder.
// The property is that the grid step reads the locked plan and scans it.
// → feedback_a_gate_must_pin_the_property_not_the_spelling
{
  // 🔴 BRACE-MATCH, NEVER A CHARACTER COUNT. A 9000-char window stopped ~150 lines into an executor
  // that is longer than that, so `startRankScan(... plan.keywords ...)` fell outside it and the gate
  // reported the opposite of the truth. → feedback_a_gate_window_measured_in_characters_will_lie
  const gi = flow.indexOf('"m1.audit.grid_baseline"');
  let body = "";
  if (gi >= 0) {
    const o = flow.indexOf("{", flow.indexOf("=>", gi));
    let d = 0;
    for (let k = o; k < flow.length; k++) {
      if (flow[k] === "{") d++;
      else if (flow[k] === "}") { d--; if (!d) { body = flow.slice(gi, k + 1); break; } }
    }
  }
  if (!/readLockedPlan\(recs\)/.test(body)) fail.push("the grid step no longer reads the locked plan");
  if (!/startRankScan\([^)]*plan\.keywords/.test(body)) {
    fail.push("the grid step no longer SCANS the locked plan's keywords — reading the plan and then "
      + "scanning something else is the state this gate exists to prevent");
  }
}
if (!/if \(!plan\) \{/.test(flow)) fail.push("the grid step no longer refuses when the plan is not locked");
if (!/startRankScan\(client, clientId, plan\.keywords, market, plan\.locations\)/.test(flow)) {
  fail.push("the scan is not being given the locked keywords and sub-locations");
}
if (!/keywords: list, subLocations: locations/.test(flow)) fail.push("the plan is not reaching the grid function");

// the grid scans EVERY keyword, not the first one five times
if (!/for \(const kw of kwList\)/.test(grid)) fail.push("the grid no longer loops the locked keywords");
if (!/await rankSearch\(kw, lat, lng,/.test(grid)) fail.push("🔴 the per-point scan uses the OUTER keyword — every keyword would scan the same term");
{
  const li = grid.indexOf("for (const kw of kwList) {");
  const lo = grid.indexOf("perKeyword.push(");
  const body = li >= 0 && lo > li ? grid.slice(li, lo) : "";
  if (!body) fail.push("the per-keyword loop body could not be read — re-check this gate before trusting it");
  else {
    if (/(?<![\w.$])keyword(?![\w:])/.test(body.replace(/^\s*\/\/.*$/gm, ""))) {
      fail.push("the outer `keyword` is used inside the per-keyword loop");
    }
    if (/saveMonthlyRankSummary/.test(body)) {
      fail.push("the monthly summary is back INSIDE the loop — it would write `tracked: 1` once per keyword");
    }
  }
}
if (!/keywords_tracked_count: perKeyword\.length/.test(grid)) fail.push("the monthly summary no longer counts the whole plan");

// the radius is derived from the plan, with a floor
if (!/let reachKm = 5, locationsUsed = \[\];/.test(grid)) fail.push("the radius is no longer derived, or lost its 5 km floor");
if (!/reachKm = Math\.max\(reachKm, d2 \* 1\.15\)/.test(grid)) fail.push("the furthest locked sub-location no longer sets the reach, with margin");
if (!/\(reachKm \/ KM_PER_MI\) \/ HALF/.test(grid)) fail.push("the grid spacing is no longer computed from the reach — a fixed span can miss the plan entirely");
if (!/radius_km: Math\.round\(reachKm \* 10\) \/ 10/.test(grid)) fail.push("the radius actually used is not recorded with the scan");

if (fail.length) {
  console.error("🔴 the grid cannot run, or does not say what it measured:");
  for (const f of fail) console.error("   · " + f);
  process.exit(1);
}
console.log("✅ the grid runs on SerpAPI (Places as fallback), records AND reads its anchor, and names the client's location");
