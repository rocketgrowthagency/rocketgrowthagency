#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — A KEYWORD PLAN FITS THE BUSINESS, WHATEVER THE BUSINESS IS
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-10-05: *"fix it so its best it can be when it runs for any business type and not just
 * for RGA specifically must be a universal fix."*
 *
 * His drafted plan had **marketing agency near me**, **digital marketing services** and **internet
 * marketing service** — three of five keywords for a business he does not run. Two causes, both in
 * the seed line, and the same wrong line appeared TWICE:
 *   1. `client.secondary_service` — SINGULAR, a column that does not exist. The real service list
 *      had never seeded the candidate pool, for any client.
 *   2. `"seo", "local seo", "digital marketing"` hardcoded — an adjacent industry imported into
 *      every client's pool. A plumber was being seeded with digital marketing.
 *
 * 🔑 THE POOL COMES FROM THE CLIENT'S OWN RECORD, AND A CANDIDATE MUST SHARE REAL VOCABULARY WITH IT.
 * → project_the_product_is_client_shaped · feedback_a_property_read_is_a_claim_about_the_shape
 *
 * Runs the REAL svcTokens/svcFits over several trades. Nothing here re-implements the rule.
 *
 * Exit 0 pass · 1 the plan can drift off the business · 2 could not run.
 */
import fs from "node:fs";
import vm from "node:vm";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = `${SITE}/netlify/functions/flow-execute.js`;
let src;
try { src = fs.readFileSync(F, "utf8"); }
catch { console.error("⚠️  INDETERMINATE — cannot read flow-execute.js"); process.exit(2); }

const fail = [];
const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

// ── 1 · NO HARDCODED INDUSTRY IN THE SEEDS, AND THE REAL FIELD IS READ ──────────────────────────
{
  const m = code.match(/const seeds = \[([\s\S]{0,400}?)\]\s*\.map/);
  if (!m) {
    console.error("⚠️  INDETERMINATE — cannot find the seed list; re-pin this gate.");
    process.exit(2);
  }
  const seeds = m[1];
  if (/"[a-z][^"]*"/i.test(seeds)) {
    fail.push(`the keyword seeds contain a hardcoded phrase (${(seeds.match(/"[^"]*"/) || [])[0]}) — `
      + "that industry is imported into EVERY client's candidate pool");
  }
  if (!/secondary_services/.test(seeds)) {
    fail.push("the seeds do not read `secondary_services` — the client's real service list never "
      + "reaches the pool");
  }
  if (/\bsecondary_service\b(?!s)/.test(code)) {
    fail.push("`client.secondary_service` (singular) is read somewhere — that column does not exist "
      + "and silently yields undefined");
  }
  // 🔴 ONE PRODUCER. The same wrong seed line existed twice: once for the GEOGRAPHY PROBE and once
  // for the ideas call, so a plumber's geography was resolved from SEO volumes.
  const n = (code.match(/const seeds = \[/g) || []).length;
  if (n !== 1) fail.push(`the seed list is built ${n} times — two copies drift, and one of them feeds the geography probe`);
}

// ── 2 · THE FILTER IS APPLIED BEFORE THE MODEL SEES THE LIST ────────────────────────────────────
{
  // 🔴 A CALL, NOT THE DEFINITION. The first version searched for `svcFits(` and found
  // `function svcFits(` — so replacing the actual filter with `ideas.slice()` still passed.
  const callRe = /(?<!function\s)\bsvcFits\s*\(/g;
  const calls = [...code.matchAll(callRe)].map((m) => m.index);
  const iEvidence = code.indexOf("REAL SEARCH VOLUME");
  if (!calls.length) fail.push("nothing CALLS svcFits — candidates are not filtered by what the business sells");
  else if (iEvidence >= 0 && Math.min(...calls) > iEvidence) {
    fail.push("candidates are filtered AFTER the evidence list is built — the model still chooses "
      + "from the unfiltered pool");
  }
  // And it must filter the list the model is shown.
  // 🔴 `\b` MATCHED `kept.concat(...)` TOO, so deleting the real assignment still passed. Require
  // the statement itself.
  if (!/ideas\s*=\s*kept\s*;/.test(code) && !/ideas\s*=\s*ideas\.filter\([^)]*svcFits/.test(code)) {
    fail.push("the filtered list is never assigned back to `ideas` — the filter runs and is discarded");
  }
  // 🔴 USED, NOT MERELY ASSIGNED. Removing the push left every assignment in place and this passed.
  if (!/lines\.push\(\s*serviceFitNote\s*\)/.test(code)) {
    fail.push("the service-fit note is computed but never pushed onto the card — a filter nobody can "
      + "see is a decision nobody can audit");
  }
}

// ── 2b · THE GEO ASK IS VERIFIED, AND THE SEEDS USE EVERY VERIFIED RUNG ─────────────────────────
// 🔴 "AT LEAST 3 of the 5 MUST carry a geo-modifier" was asked of the model and never checked. RGA's
// locked plan came back with ZERO. A requirement asked for and never verified is a hope.
{
  if (!/AT LEAST 3 of the 5 MUST carry a geo-modifier/.test(code)) {
    fail.push("the prompt no longer asks a local client for geo-modified keywords");
  }
  if (!/geoShortfallNote/.test(code) || !/lines\.push\(\s*geoShortfallNote\s*\)/.test(code)) {
    fail.push("the plan's geo-modifier count is never checked against the ask, or the shortfall is "
      + "never put on the card — the requirement would go unmet in silence");
  }
  // 🔴 The seeds must use the LADDER, not only the town. For a suburb the town is the one level with
  // no measurable demand, so seeding it alone guarantees a pool with no geo candidate worth taking.
  if (!/geoLadder/.test(code)) {
    fail.push("the geography ladder is not used — geo seeds would be built from the town alone");
  }
  const gs = (code.match(/const geoSeeds =[\s\S]{0,300}?;/) || [""])[0];
  if (gs && !/placeNames/.test(gs)) {
    fail.push("geo seeds are not built from the resolved place names");
  }
  // 🔴 And the classifier must know the same places, or a term naming a rung is judged `bare`.
  const gt = (code.match(/const geoTokens =[\s\S]{0,300}?\];/) || [""])[0];
  if (gt && !/geoLadder/.test(gt)) {
    fail.push("the geo classifier does not know the ladder's place names — a term naming the metro "
      + "we seed with would be classified as a bare head term and dropped from the pool");
  }
}

// ── 2c · FIT BINDS THE FINAL PLAN, NOT JUST THE SHORTLIST ───────────────────────────────────────
// 🔴 Measured 2026-10-05: with the shortlist correctly filtered, the model STILL returned "internet
// marketing service" — it is told it may choose "close variants" and reached outside the list. A
// filter on what it sees is not a rule about what it picks.
{
  const loop = (code.match(/for \(const d2 of demand\)[\s\S]*?\n        \}/) || [""])[0];
  if (!loop) {
    console.error("⚠️  INDETERMINATE — cannot find the swap loop; re-pin this gate.");
    process.exit(2);
  }
  if (!/svcFits\s*\(/.test(loop)) {
    fail.push("the swap loop does not check service fit — a term the model invented outside the "
      + "shortlist stays in the locked plan");
  }
  if (!/swaps\.push\([^)]*not one of this business/.test(loop)) {
    fail.push("a term dropped for not fitting the business is not disclosed as a swap — the plan "
      + "would change with no reason given");
  }
}

// ── 2d · A CARRIED-OVER REASON MUST NOT DESCRIBE A SWAP THAT DID NOT HAPPEN ─────────────────────
// 🔴 "internet marketing service" carried *"Chosen to replace 'seo services near me'"* while this
// run's swaps list was EMPTY — reasoning preserved from an earlier run, read as a statement about
// the run on screen.
if (!/chosen to replace\\b/i.test(code) || !/priorRaw/.test(code)) {
  fail.push("a carried-over `why` is reused without checking it is still true of THIS run — a "
    + "keyword can claim it replaced something that was never replaced");
}

// ── 2e · THE GEO NOTE'S CLAIMS ARE MEASURED, NOT ASSERTED ───────────────────────────────────────
// 🔴🔴 It told Chris *"No keyword name a place … Say so on the kickoff call"* while the plan held
// "la seo company". A note that instructs someone to repeat it to a CLIENT must be true of this run.
{
  // 🔴 RE-PINNED: the block now tests the FINAL plan, so its condition names `planTerms`.
  const blk = (code.match(/if \(!national && planTerms\.length\)[\s\S]*?\n    \}/) || [""])[0];
  if (!blk) {
    console.error("⚠️  INDETERMINATE — cannot find the geo-shortfall block; re-pin this gate.");
    process.exit(2);
  }
  if (!/townIdeas/.test(blk) || !/ideas\.filter/.test(blk)) {
    fail.push("the geo note does not measure what the town-name candidates actually returned — it "
      + "would assert there is no city demand without looking");
  }
  // 🔴 The old wording was built by concatenating "No keyword" with "name", which is ungrammatical
  // AND absolute. The count must be reported as a number out of the total.
  if (/No keyword["'`]/.test(blk)) {
    fail.push("the geo note still uses the absolute 'No keyword' phrasing — it was both "
      + "ungrammatical and a claim the place test cannot support");
  }
  // 🔑 `planTerms.length` or `terms.length` — the property is that it reports N of N, not which
  // variable holds the total.
  if (!/withPlace/.test(blk) || !/(plan)?[Tt]erms\.length/.test(blk)) {
    fail.push("the geo note does not report how many of how many keywords name a place");
  }
  // 🔑 The places it tests against must be the VERIFIED ones, and short enough to catch an
  // abbreviation the ladder supplies.
  if (!/geoLadder/.test(blk)) {
    fail.push("the geo note does not test against the resolved ladder's place names");
  }
  if (/length > 3/.test(blk)) {
    fail.push("the geo note still filters place words to 4+ characters — a two-letter metro "
      + "abbreviation could never be recognised");
  }
  // 🔴🔴 IT MUST JUDGE THE PLAN, NOT THE DRAFT. Measured 2026-10-05: the model proposed four
  // town-named phrases, the check saw them and stayed silent, and every one was then SWAPPED OUT for
  // having no demand — so the plan that reached the card named no place at all, with no note.
  // 🔴 THE DECLARATION ITSELF must derive from `demand`. Testing the file for `demand.map(`
  // anywhere passed while `planTerms` was reassigned to the draft — the match came from elsewhere.
  const decl = (code.match(/^.*const planTerms\s*=.*$/m) || [""])[0];
  if (!decl) {
    fail.push("the geo check has no `planTerms` — it would judge the model's draft rather than the "
      + "plan that survived the swaps");
  } else if (!/\bdemand\b/.test(decl)) {
    fail.push("`planTerms` is not derived from the final `demand` list — the geo check would judge "
      + "terms that the swaps already removed");
  }
  if (/\bterms\.filter\(namesPlace\)/.test(blk)) {
    fail.push("the geo check counts `terms` — the model's original answer — instead of the final plan");
  }
}

// ── 3 · THE RULE ITSELF, OVER SEVERAL TRADES ────────────────────────────────────────────────────
const lift = (name) => {
  const m = src.match(new RegExp("^function " + name + "\\s*\\(", "m"));
  if (!m) throw new Error(`cannot find ${name}`);
  const lp = src.indexOf("(", m.index);
  let pd = 0, a = -1;
  for (let i = lp; i < src.length; i++) {
    if (src[i] === "(") pd++;
    else if (src[i] === ")") { pd--; if (!pd) { a = i + 1; break; } }
  }
  const open = src.indexOf("{", a);
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") d++;
    else if (src[i] === "}") { d--; if (!d) return src.slice(m.index, i + 1); }
  }
  throw new Error(`unbalanced ${name}`);
};
let T, Fit;
try {
  const sets = ["SVC_GENERIC", "SVC_WEAK"]
    .map((n) => (src.match(new RegExp(`^const ${n} = new Set\\(\\[[\\s\\S]*?\\]\\);`, "m")) || [""])[0])
    .join("\n");
  const ctx = vm.createContext({ console });
  vm.runInContext(`${sets}\n${["svcStem", "svcTokens", "svcFits"].map(lift).join("\n\n")}\n`
    + "globalThis.T=svcTokens; globalThis.F=svcFits;", ctx);
  T = ctx.T; Fit = ctx.F;
  if (typeof T !== "function" || typeof Fit !== "function") throw new Error("did not lift");
} catch (e) {
  console.error(`⚠️  INDETERMINATE — could not lift the fit rule: ${e.message}`);
  process.exit(2);
}

const CASES = [
  // 🔴 THE REAL RGA ROW: its GBP `business_type` is literally "Internet marketing service", which is
  // why that keyword survived two rounds of fixes. A declared service list must not be widened by a
  // Google category. This case is the regression test for exactly that.
  { name: "local SEO agency (GBP category is an umbrella)",
    client: { primary_service: "seo company", business_type: "Internet marketing service",
      secondary_services: ["Google Business Profile Optimization", "Google Maps Local SEO", "Website Support for Local SEO"] },
    keep: ["seo company near me", "local seo los angeles", "google maps seo", "seo near me"],
    drop: ["marketing agency near me", "digital marketing services", "internet marketing service", "content marketers"] },
  { name: "plumber",
    client: { primary_service: "plumber", secondary_services: ["Drain Cleaning", "Water Heater Repair", "Emergency Plumbing"] },
    keep: ["emergency plumber near me", "drain cleaning service", "water heater repair los angeles", "plumbing company near me"],
    drop: ["hvac contractor", "electrician near me", "roof repair", "digital marketing services"] },
  { name: "dentist",
    client: { primary_service: "dentist", secondary_services: ["Teeth Whitening", "Dental Implants", "Invisalign"] },
    keep: ["dentist near me", "dental implants cost", "teeth whitening near me"],
    drop: ["chiropractor near me", "marketing agency", "plumber near me"] },
  { name: "roofer",
    client: { primary_service: "roofing contractor", secondary_services: ["Roof Replacement", "Gutter Installation"] },
    keep: ["roof replacement cost", "roofing contractor near me", "gutter installation"],
    drop: ["water heater repair", "dentist near me"] },
  // 🔑 The weak-word rule: `repair` counts here because it is what the business IS.
  { name: "appliance repair (a weak word IS the business)",
    client: { primary_service: "appliance repair", secondary_services: ["Refrigerator Repair", "Washer Repair"] },
    keep: ["refrigerator repair near me", "appliance repair los angeles", "washer repair"],
    drop: ["plumber near me"] },
  // 🔑 No service list → the GBP category is the only evidence there is, and it must count.
  { name: "plumber with only a GBP category",
    client: { primary_service: "", business_type: "Plumber", secondary_services: [] },
    keep: ["emergency plumber near me", "plumbing company"],
    drop: ["dentist near me", "roof repair"] },
  // 🔴 Nothing on file: the filter must NOT pretend to judge.
  { name: "no services on file",
    client: { primary_service: "", secondary_services: [] },
    keep: ["anything at all"], drop: [] },
];

for (const c of CASES) {
  const tok = T(c.client);
  for (const k of c.keep) if (!Fit(k, tok)) fail.push(`${c.name}: "${k}" is one of their services and was DROPPED`);
  for (const d of c.drop) if (Fit(d, tok)) fail.push(`${c.name}: "${d}" is not their business and was KEPT`);
}

if (fail.length) {
  console.error("🔴 a keyword plan can drift off the business it is for:");
  for (const f of fail) console.error("   · " + f);
  process.exit(1);
}
console.log(`✅ seeds come from the client's own record, candidates are filtered before the model sees them, and the fit rule holds across ${CASES.length} business types`);
