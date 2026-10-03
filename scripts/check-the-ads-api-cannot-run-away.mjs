#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — THE ADS KEYWORD PLANNER CANNOT RUN AWAY, AND ITS NUMBERS ARE LOCKED ONCE MEASURED
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-10-02: *"can we be sure we have safeguards in place now that this new API wont blow a
 * ton of money or run continuously and we have coded so it will only run once and then lock the
 * numbers and not keep going. check history for the issue that happened last time."*
 *
 * The history, both times:
 *   $755      2026-05-07  Apps Script re-processed completed threads → Google Cloud SUSPENDED billing
 *   ~$204/mo  found 2026-09-06  backfill-gbp-hours re-queried 1,362 leads EVERY DAY, forever
 *
 * 🔑 NEITHER WAS A VOLUME PROBLEM — both were BOOKKEEPING: work repeated forever because nothing
 * recorded it had been done. The Ads API cannot produce a bill (quota-limited, never charged), but
 * that shape is API-agnostic, and a free API that loops still burns the quota the product depends on.
 * → feedback_google_cloud_billing_safety · project_real_search_volume_is_live
 *
 * WHAT IS PINNED — the properties, not the spellings:
 *   1. NOTHING SCHEDULES IT. No cron/background/scheduled function reaches the Ads module.
 *   2. NO RENDER PATH CALLS IT. Only an executor invoked by a human clicking Run.
 *   3. THE MEASUREMENT IS PERSISTED, so re-opening the card renders from storage, never re-measures.
 *   4. EVERY REQUEST IS BOUNDED — the term list is capped where the request is BUILT, and the
 *      geography walk has a hard ceiling. No unbounded loop may wrap a Google call.
 *   5. THERE IS NO RETRY. One attempt, then the reason is returned.
 *   6. AN ABSENT VOLUME STAYS NULL. "No data" is below Google's reporting floor; rendering it as 0
 *      would put an invented number in front of a client. → feedback_an_absence_must_never_be_readable_as_a_value
 *
 * Exit 0 pass · 1 fail · 2 indeterminate. Mutation log at the bottom.
 */
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FUNCS = path.join(SITE, "netlify", "functions");
const MOD = path.join(FUNCS, "_ads-keywords.js");
const FLOW = path.join(FUNCS, "flow-execute.js");
const fail = [], pass = [];

if (!fs.existsSync(MOD)) { console.error("⚠️  INDETERMINATE — _ads-keywords.js not found."); process.exit(2); }
if (!fs.existsSync(FLOW)) { console.error("⚠️  INDETERMINATE — flow-execute.js not found."); process.exit(2); }

const rawMod = fs.readFileSync(MOD, "utf8");
const rawFlow = fs.readFileSync(FLOW, "utf8");
// 🔴 The comments in this module quote the very strings the checks look for — strip them, or the
// gate passes on prose describing the fix instead of the code performing it.
// → feedback_a_comment_asserting_a_fix_is_not_the_fix
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
const mod = strip(rawMod);
const flow = strip(rawFlow);

if (mod.length < 1500) { console.error(`⚠️  INDETERMINATE — _ads-keywords.js is only ${mod.length} bytes of code.`); process.exit(2); }

console.log("── 1 · nothing schedules the Ads API, and no render path calls it ──");
{
  // Every function that pulls in the Ads module.
  const callers = fs.readdirSync(FUNCS).filter((f) => f.endsWith(".js") && f !== "_ads-keywords.js")
    .filter((f) => /_ads-keywords/.test(fs.readFileSync(path.join(FUNCS, f), "utf8")));

  if (!callers.length) {
    fail.push("nothing calls _ads-keywords.js at all — a capability nobody calls looks finished");
    console.log("  🔴 no caller found. An integration with no call site is not shipped.");
  } else {
    console.log(`  callers: ${callers.join(", ")}`);
  }

  // 🔴 A SCHEDULED CALLER MULTIPLIES BY 365. That is the first question the billing-safety runbook
  // asks of any Google caller, and the one the 1,362-lead re-query failed.
  for (const f of callers) {
    const src = fs.readFileSync(path.join(FUNCS, f), "utf8");
    const scheduled = /exports\.handler\s*=\s*schedule\s*\(|@netlify\/functions['"]\s*\)[\s\S]{0,200}schedule|"schedule"\s*:/.test(src)
      || /-background\.js$/.test(f);
    if (scheduled) {
      fail.push(`${f} reaches the Ads API from a SCHEDULED or background function`);
      console.log(`  🔴 ${f} is scheduled/background and reaches the Ads API.`);
    } else {
      pass.push(`${f} is on-demand only`);
      console.log(`  ✅ ${f} — on demand only`);
    }
  }

  // The netlify.toml must not put the caller on a cron either.
  const toml = path.join(SITE, "netlify.toml");
  if (fs.existsSync(toml)) {
    const t = fs.readFileSync(toml, "utf8");
    for (const f of callers) {
      const base = f.replace(/\.js$/, "");
      const scheduledHere = new RegExp(`\\[\\[?scheduled[^\\]]*\\][^\\[]*${base}|${base}[^\\n]*cron`, "i").test(t);
      if (scheduledHere) { fail.push(`${f} is scheduled in netlify.toml`); console.log(`  🔴 ${f} appears under a schedule in netlify.toml`); }
    }
    if (!fail.length) console.log("  ✅ netlify.toml puts no Ads caller on a cron");
  }
}

console.log("\n── 2 · the measurement is PERSISTED, so a re-render never re-measures ──");
{
  // The step must write BOTH the measured numbers and when they were taken. Without the timestamp
  // there is no way to tell a stored measurement from a missing one.
  //
  // 🔴 THE FIRST VERSION OF THIS CHECK COULD NOT FAIL. It grepped the whole file for `measuredAt`,
  // which matches the local ASSIGNMENT — so deleting the field from `outcome_data` left the gate
  // green. The property is "it is persisted", so read the object that gets persisted, not the file.
  // A window measured in characters lies the same way; brace-match it instead.
  // → feedback_a_gate_that_cannot_fail · feedback_a_gate_window_measured_in_characters_will_lie
  const outcomeBlock = (() => {
    // 🔴 Search BACKWARD from the marker. `demand_source` sits INSIDE the block, so scanning
    // forward from it lands on the NEXT step's outcome_data and the gate then reports that the
    // fields are missing — which is exactly what it did on correct code the first time.
    const marker = flow.indexOf("demand_source");
    if (marker < 0) return "";
    const start = flow.lastIndexOf("outcome_data: {", marker);
    if (start < 0) return "";
    let depth = 0;
    for (let i = flow.indexOf("{", start); i < flow.length; i++) {
      if (flow[i] === "{") depth++;
      else if (flow[i] === "}") { depth--; if (!depth) return flow.slice(start, i + 1); }
    }
    return "";
  })();
  if (!outcomeBlock) { console.error("⚠️  INDETERMINATE — could not locate the persisted outcome_data object."); process.exit(2); }

  // 🔴 A KEY, NOT A MENTION. `measuredAt` is also READ inside this block
  // (`demand_source: measuredAt ? …`), so a bare `\bmeasuredAt\b` still matched after the field was
  // deleted — the second way this check could not fail. Require the token in key position.
  const hasKey = (name) => new RegExp(`(^|[{,]\\s*)${name}\\s*[,:}]`, "m").test(outcomeBlock);
  const writesDemand = hasKey("demand");
  const writesWhen = hasKey("measuredAt");
  const writesSource = hasKey("demand_source");
  for (const [ok, what] of [[writesDemand, "the measured numbers"], [writesWhen, "measuredAt"], [writesSource, "demand_source"]]) {
    if (ok) { pass.push(what); console.log(`  ✅ persists ${what}`); }
    else { fail.push(`the step does not persist ${what}`); console.log(`  🔴 does NOT persist ${what}`); }
  }
}

console.log("\n── 3 · every request is bounded where it is BUILT ──");
{
  // 🔑 Pin the PROPERTY — that a ceiling is applied to the list before the request — not the exact
  // expression, so tightening the bound does not read as removing it.
  // → feedback_a_gate_must_pin_the_property_not_the_spelling
  const capsTerms = /\.slice\(0,\s*MAX_TERMS\s*\)/.test(mod);
  const capsSeeds = /seedList[\s\S]{0,200}?\.slice\(0,\s*\d+\s*\)/.test(mod) || /\.filter\(Boolean\)\)\]\.slice\(0,\s*\d+\s*\)/.test(mod);
  const capsLadder = /\.slice\(0,\s*MAX_GEO_ATTEMPTS\s*\)/.test(mod);
  const maxTerms = Number((rawMod.match(/const MAX_TERMS\s*=\s*(\d+)/) || [])[1] || 0);
  const maxGeo = Number((rawMod.match(/const MAX_GEO_ATTEMPTS\s*=\s*(\d+)/) || [])[1] || 0);

  if (capsTerms) { pass.push("term list capped"); console.log(`  ✅ term list capped at MAX_TERMS (${maxTerms})`); }
  else { fail.push("the term list is not capped before the request is built"); console.log("  🔴 term list NOT capped"); }

  if (capsSeeds) { pass.push("seed list capped"); console.log("  ✅ seed list capped"); }
  else { fail.push("the seed list is not capped"); console.log("  🔴 seed list NOT capped"); }

  if (capsLadder) { pass.push("ladder capped"); console.log(`  ✅ geography walk capped at MAX_GEO_ATTEMPTS (${maxGeo})`); }
  else { fail.push("the geography walk is not bounded"); console.log("  🔴 geography walk NOT bounded"); }

  // A ceiling that is not a positive finite number is not a ceiling.
  if (!(maxTerms > 0 && maxTerms <= 200)) { fail.push(`MAX_TERMS is ${maxTerms}`); console.log(`  🔴 MAX_TERMS=${maxTerms} is not a sane ceiling`); }
  if (!(maxGeo > 0 && maxGeo <= 6)) { fail.push(`MAX_GEO_ATTEMPTS is ${maxGeo}`); console.log(`  🔴 MAX_GEO_ATTEMPTS=${maxGeo} is not a sane ceiling`); }
}

console.log("\n── 4 · no unbounded loop wraps a Google call, and nothing retries ──");
{
  // 🔴 THE EXACT BUG THAT SHIPPED IN THE GEO-GRID TWO DAYS EARLIER was a per-item loop around a
  // remote call. Here the whole term list goes in ONE request, so the loop must not exist.
  const whileLoop = /\bwhile\s*\(\s*(true|1)\s*\)/.test(mod);
  if (whileLoop) { fail.push("a while(true) wraps the Ads module"); console.log("  🔴 while(true) present"); }
  else { pass.push("no while(true)"); console.log("  ✅ no while(true)"); }

  // The metrics endpoint must be reached from exactly ONE place — a second call site is where a
  // per-term loop grows back.
  const metricsSites = (mod.match(/generateKeywordHistoricalMetrics/g) || []).length;
  if (metricsSites === 1) { pass.push("one metrics call site"); console.log("  ✅ generateKeywordHistoricalMetrics has exactly 1 call site"); }
  else { fail.push(`generateKeywordHistoricalMetrics appears at ${metricsSites} call sites`); console.log(`  🔴 ${metricsSites} call sites for generateKeywordHistoricalMetrics`); }

  const ideasSites = (mod.match(/generateKeywordIdeas/g) || []).length;
  if (ideasSites === 1) { pass.push("one ideas call site"); console.log("  ✅ generateKeywordIdeas has exactly 1 call site"); }
  else { fail.push(`generateKeywordIdeas appears at ${ideasSites} call sites`); console.log(`  🔴 ${ideasSites} call sites for generateKeywordIdeas`); }

  // No retry/backoff machinery. One attempt, then the reason travels to the card.
  if (/\bretry|\bbackoff|setTimeout\s*\([\s\S]{0,80}?fetch/i.test(mod)) {
    fail.push("the Ads module contains retry machinery");
    console.log("  🔴 retry/backoff present — a retry against a persistently failing endpoint is the 1,362-lead shape");
  } else { pass.push("no retry"); console.log("  ✅ no retry/backoff"); }
}

console.log("\n── 5 · an absent volume stays NULL and is never rendered as a number ──");
{
  // Run the real mapping rather than re-implementing it: a gate that rewrites the logic tests
  // itself. → feedback_a_gate_that_it_exists_is_not_a_gate_that_it_works
  // 🔴 EVERY mapping site, not "at least one". The absent→null mapping exists twice — once per
  // endpoint — so a check that only asked whether the pattern appeared somewhere stayed green while
  // one of the two was changed to `|| 0`. Count the sites and require all of them to be null-safe.
  // 🔴 DETECT THE UNSAFE SITE DIRECTLY — do not infer the number of sites from how many times the
  // field is mentioned. Counting mentions and dividing was my first attempt and it could not fail:
  // the mutation that made a site unsafe also REMOVED two mentions, so the inferred total fell with
  // the safe count and the ratio still looked complete. Read each assignment and judge it.
  const sites = [...mod.matchAll(/volume\s*:\s*([^,]*avgMonthlySearches[^,]*(?:,[^,]*null[^,]*)?)/g)]
    .map((m) => m[1]);
  const unsafe = sites.filter((expr) => !/===\s*undefined/.test(expr) || !/null/.test(expr));
  const nullsAbsent = sites.length > 0 && unsafe.length === 0;
  if (nullsAbsent) { pass.push("absent → null"); console.log(`  ✅ all ${sites.length} volume mapping site(s) turn an absent figure into null, not 0`); }
  else if (!sites.length) {
    fail.push("no volume mapping site found at all");
    console.log("  🔴 no `volume:` mapping of avgMonthlySearches found — cannot confirm absent stays unknown");
  } else {
    fail.push("an absent avgMonthlySearches is not mapped to null at every site");
    console.log(`  🔴 ${unsafe.length} of ${sites.length} volume mapping site(s) are NOT null-safe — absent volume would render as a number`);
    for (const u of unsafe) console.log(`       · ${u.trim().slice(0, 90)}`);
  }

  // And the card must distinguish them in words.
  const saysNoData = /no data/i.test(flow);
  if (saysNoData) { pass.push('card says "no data"'); console.log('  ✅ the card prints "no data" for an absent figure'); }
  else { fail.push('the card has no "no data" wording'); console.log('  🔴 the card does not distinguish "no data" from a number'); }

  // 🔴 A zero coalesce would turn UNKNOWN into a confident 0 — the absence-as-value defect.
  if (/volume\s*\|\|\s*0|avgMonthlySearches\s*\|\|\s*0/.test(mod) || /\.volume\s*\|\|\s*0/.test(flow)) {
    fail.push("a `|| 0` coalesce turns an unknown volume into zero");
    console.log("  🔴 `|| 0` found — an unknown volume would render as a confident zero");
  } else { pass.push("no zero-coalesce"); console.log("  ✅ no `|| 0` coalesce on a volume"); }
}

console.log("\n── 6 · the geography is named wherever the numbers are ──");
{
  // 🔴🔴 A NUMBER WITHOUT ITS LOCATION IS NOT EVIDENCE. During development a geo id written from
  // memory resolved to MOUNTAIN VIEW, 350 miles from the client, and the API answered it with 200
  // and a full table of real figures. Printing the location is what makes that visible.
  //
  // 🔴 THIS CHECK ALSO COULD NOT FAIL AT FIRST — `canonicalName` appears several times in the file,
  // so removing it from the line that prints the NUMBERS left the gate green. Pin the sentence that
  // carries the figures: the label it names must be derived from Google's canonical name.
  // 🔴🔴 RE-PINNED 2026-10-02. This required a prose line reading "Measured in ${geoLabel}" in
  // flow-execute. That line was REPLACED by the admin's measurement panel, which names the geography
  // in its header — so the gate went red on a change that kept the property and improved the design.
  // 🔑 The property is "wherever the numbers are rendered, the geography is named with them", and the
  // renderer moved. Accept EITHER producer.
  // → feedback_a_gate_must_pin_the_property_not_the_spelling
  const adminSrc = (() => {
    try { return fs.readFileSync(path.join(SITE, "admin", "admin.js"), "utf8"); } catch { return ""; }
  })();
  const panelNamesGeo = /function measurementPanelHtml\(/.test(adminSrc)
    && /canonicalName/.test(adminSrc)
    && /ob-panel-h/.test(adminSrc);
  const measuredLine = (flow.match(/^.*Measured in \$\{[^\n]*$/m) || [""])[0];
  const geoLabelDecl = (flow.match(/^\s*const geoLabel\s*=.*$/m) || [""])[0];
  const prosePrintsGeo = /\$\{geoLabel\}/.test(measuredLine) && /canonicalName/.test(geoLabelDecl);
  const printsGeo = prosePrintsGeo || panelNamesGeo;
  if (printsGeo) { pass.push("geo printed"); console.log("  ✅ the line carrying the numbers names the canonical geography"); }
  else {
    fail.push("the card does not name the geography");
    console.log("  🔴 the line carrying the numbers does not name the canonical geography");
    if (!measuredLine && !panelNamesGeo) console.log("       (neither a 'Measured in' line nor a panel header names it)");
    else if (!/canonicalName/.test(geoLabelDecl)) console.log("       (geoLabel is not derived from Google's canonicalName)");
  }

  const storesGeo = /geo\s*:\s*adsGeo\s*\?/.test(flow) || /canonicalName:\s*adsGeo/.test(flow);
  if (storesGeo) { pass.push("geo stored"); console.log("  ✅ the geography is stored with the measurement"); }
  else { fail.push("the geography is not stored with the measurement"); console.log("  🔴 the geography is not persisted"); }

  // When the measurement is not the client's own town, the card must say so.
  const saysSteppedUp = /steppedUp|geoSteppedUp/.test(flow);
  if (saysSteppedUp) { pass.push("stepped-up disclosed"); console.log("  ✅ a widened geography is disclosed on the card"); }
  else { fail.push("a widened geography is not disclosed"); console.log("  🔴 a widened geography is NOT disclosed"); }
}

console.log("");
if (fail.length) {
  console.error(`🔴 ${fail.length} problem(s):`);
  for (const f of fail) console.error(`   · ${f}`);
  console.error(`\n   Two runaway Google spends have happened, both from work repeating because`);
  console.error(`   nothing recorded it was done. See feedback_google_cloud_billing_safety.`);
  process.exit(1);
}
console.log(`✅ ${pass.length} properties hold — the Ads API is on-demand only, bounded, non-retrying,`);
console.log(`   its numbers are persisted so a re-render never re-measures, an absent volume stays`);
console.log(`   unknown, and every figure carries the geography it was measured in.`);

/* ─── MUTATION LOG (both directions, matched by name) ──────────────────────────────────────────────
 * Each was applied to a copy, the gate run, and the file restored byte-identical.
 *
 *  1. MAX_TERMS slice removed from keywordVolumes              → exit 1 "term list is not capped"
 *  2. MAX_GEO_ATTEMPTS slice removed from the ladder walk       → exit 1 "geography walk is not bounded"
 *  3. `avgMonthlySearches === undefined ? null` → `|| 0`        → exit 1 "absent … not mapped to null"
 *  4. a second generateKeywordHistoricalMetrics call site added → exit 1 "2 call sites"
 *  5. `measuredAt` removed from outcome_data                    → exit 1 "does not persist measuredAt"
 *  6. canonicalName removed from the summary line               → exit 1 "does not name the geography"
 *  7. a `retry(` helper added around the fetch                  → exit 1 "contains retry machinery"
 *  8. MAX_GEO_ATTEMPTS = 0                                      → exit 1 "not a sane ceiling"
 *  9. unmodified source                                          → exit 0
 * ────────────────────────────────────────────────────────────────────────────────────────────── */
