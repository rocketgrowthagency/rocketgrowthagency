#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — A SUB-LOCATION IS A REAL PLACE, IN THIS CLIENT'S MARKET
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-10-05: *"STEP 25: Lock 3-5 primary keywords + 3 sub-locations … deep dive research this
 * and confirm you are doing it correct."*
 *
 * The keyword half of that step had been hardened over and over. The LOCATION half was asked of a
 * language model and stored with **no check at all** — and three location pages, nine
 * service×location pages and the geo grid's outer ring all read that list. On 2026-10-02 it produced
 * CHICAGO and HOUSTON for a Culver City business; what was written then was a better prompt, and a
 * prompt is not a check.
 *
 * 🔴 EXISTENCE IS NOT THE CHECK. Measured against the live API: "Houston" resolves (City, Texas,
 * reach 12.7M) and "Chicago" resolves (City, Illinois, 16.2M). Both are perfectly real places. What
 * makes them wrong is that this client's market is in California.
 * 🔑 THE QUESTION IS NOT "IS THIS A PLACE" BUT "IS THIS A PLACE *HERE*".
 *
 * ── HOW THIS RUNS THE REAL CODE WITHOUT THE NETWORK ────────────────────────────────────────────
 * It requires the real `_ads-keywords.js` and stubs `globalThis.fetch` — which is what `adsFetch`
 * calls — with **responses recorded from the live Google Ads API on 2026-10-05**. So the product's
 * own selection logic runs, over answers Google actually gave, with no request and no metered call.
 *
 * 🔴 AND THE FIXTURES CAUGHT THREE BUGS IN THIS VERY LOGIC the first time it ran live: "Mar Vista"
 * resolved to a ZIP code, "90232" passed as a place, and **"Chicago" came back ok=true with a
 * California county's name attached** — because the rule was "highest reach in my state" and Google's
 * suggest returns loosely related places, so "anything in my state" nearly always finds something.
 * That is the Mountain View shape: the API answered a wrong question successfully.
 * → feedback_a_symbol_name_is_a_claim_about_the_codebase · project_a_local_plan_has_local_terms
 *
 * Exit 0 pass · 1 a sub-location could be wrong, unreal or unchecked · 2 could not run.
 */
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
let flow;
try { flow = fs.readFileSync(`${SITE}/netlify/functions/flow-execute.js`, "utf8"); }
catch { console.error("⚠️  INDETERMINATE — cannot read flow-execute.js"); process.exit(2); }

let ads;
try {
  const require = createRequire(`${SITE}/netlify/functions/`);
  ads = require("./_ads-keywords.js");
} catch (e) {
  console.error(`⚠️  INDETERMINATE — cannot load _ads-keywords.js: ${e.message}`);
  process.exit(2);
}
for (const f of ["verifyPlaces", "nearbyPlaces", "stateOf"]) {
  if (typeof ads[f] !== "function") {
    console.error(`⚠️  INDETERMINATE — ${f} is not exported; re-pin this gate.`);
    process.exit(2);
  }
}

const fail = [];

// ── RECORDED FROM THE LIVE API, 2026-10-05 ──────────────────────────────────────────────────────
const G = (name, type, reach) => ({ geoTargetConstant: { resourceName: `geoTargetConstants/${reach}`,
  id: String(reach), canonicalName: name, targetType: type }, reach: String(reach) });
const SUGGEST = {
  "palms": [G("Palms,California,United States", "Neighborhood", 196000),
            G("Palm Springs,California,United States", "City", 176000),
            G("Isle of Palms,South Carolina,United States", "City", 129000)],
  "mar vista": [G("Mar Vista,California,United States", "Neighborhood", 110000),
                G("90064,California,United States", "Postal Code", 178000),
                G("93033,California,United States", "Postal Code", 139000)],
  "houston": [G("Houston,Texas,United States", "City", 12700000),
              G("Houston County,Texas,United States", "County", 39000),
              G("Northeast Houston,Texas,United States", "Neighborhood", 531000)],
  "chicago": [G("Chicago,Illinois,United States", "City", 16200000),
              G("Placer County,California,United States", "County", 1230000)],
  "90232": [G("90232,California,United States", "Postal Code", 129000)],
  "zzqxwv falls": [],
  // 🔴 THE FIXTURE THAT PINS NAME MATCHING. A California client proposing "Brooklyn" gets the real
  // Brooklyn (New York) plus a loosely related CALIFORNIA CITY — page-worthy, in-state, and nothing
  // to do with what was asked. A rule of "highest reach in my state" approves Oakland and reports it
  // as a verified sub-location called Brooklyn. Only matching the NAME refuses it.
  // (Chicago's own list happens to offer a County, which a separate rule already excludes, so it
  // cannot pin this on its own — a fixture must fail for the reason it is testing.)
  "brooklyn": [G("Brooklyn,New York,United States", "City", 2600000),
               G("Brooklyn Park,Minnesota,United States", "City", 86000),
               G("Oakland,California,United States", "City", 440000)],
  "culver city, ca": [G("Culver City,California,United States", "City", 270000),
                      G("Jefferson Park,California,United States", "Neighborhood", 45000),
                      G("Fox Hills,California,United States", "Neighborhood", 60000),
                      G("90232,California,United States", "Postal Code", 129000)],
  "round rock, tx": [G("Round Rock,Texas,United States", "City", 695000),
                     G("Teravista,Texas,United States", "Neighborhood", 59000),
                     G("Forest Creek,Texas,United States", "Neighborhood", 11000)],
};

const realFetch = globalThis.fetch;
let calls = 0;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  calls++;
  if (u.includes("oauth2.googleapis.com/token")) {
    return { ok: true, status: 200, async json() { return { access_token: "stub" }; }, async text() { return ""; } };
  }
  if (u.includes("geoTargetConstants:suggest")) {
    const body = JSON.parse(init.body || "{}");
    const name = String((body.locationNames?.names || [])[0] || "").toLowerCase();
    const rows = SUGGEST[name];
    if (rows === undefined) {
      return { ok: false, status: 500, async json() { return {}; }, async text() { return "unseeded fixture: " + name; } };
    }
    return { ok: true, status: 200, async json() { return { geoTargetConstantSuggestions: rows }; }, async text() { return ""; } };
  }
  return { ok: false, status: 418, async json() { return {}; }, async text() { return "unexpected call"; } };
};
for (const k of ["GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_ADS_REFRESH_TOKEN", "GOOGLE_ADS_CUSTOMER_ID"]) {
  process.env[k] = process.env[k] || "stub";
}

const ok = (c, msg) => { if (!c) fail.push(msg); };

try {
  // ── 1 · stateOf reads the state out of a canonical name ──────────────────────────────────────
  ok(ads.stateOf("Culver City,California,United States") === "california",
    "stateOf cannot read the state out of an Ads canonical name — the containment check has nothing to compare");
  ok(ads.stateOf("Houston,Texas,United States") === "texas",
    "stateOf misreads a Texas canonical name");
  ok(ads.stateOf("") === "",
    "stateOf invents a state for an empty name — an absence must never read as a value");

  // ── 2 · THE 10-02 BUG: a real place in the wrong state is REFUSED ────────────────────────────
  const v = await ads.verifyPlaces(
    ["Palms", "Mar Vista", "Houston", "Chicago", "Brooklyn", "Zzqxwv Falls", "90232"],
    { stateName: "California" });
  ok(!v.error, `verifyPlaces could not run: ${v.error}`);
  const by = new Map((v.rows || []).map((r) => [r.name.toLowerCase(), r]));
  const row = (n) => by.get(n.toLowerCase()) || {};

  ok(row("Houston").ok === false && row("Houston").reason === "wrong-state",
    `"Houston" was not refused for a California client (got ok=${row("Houston").ok}, `
    + `reason=${row("Houston").reason}) — this is the exact phrase the 2026-10-02 bug produced`);
  ok(row("Chicago").ok === false && row("Chicago").reason === "wrong-state",
    `"Chicago" was not refused for a California client (got ok=${row("Chicago").ok}, `
    + `reason=${row("Chicago").reason}, matched=${row("Chicago").detail}) — an earlier version of this `
    + "logic APPROVED it by attaching a California county's name to it");
  ok(row("Brooklyn").ok === false && row("Brooklyn").reason === "wrong-state",
    `"Brooklyn" was accepted for a California client as "${row("Brooklyn").detail}" (ok=${row("Brooklyn").ok}, `
    + `reason=${row("Brooklyn").reason}) — Google's suggest list for it contains a real California city, so a `
    + "rule of \"highest reach in my state\" verifies a place nobody asked about and prints the proposed "
    + "name beside it. The answer must be about the thing we asked for");
  ok(row("Zzqxwv Falls").ok === false && row("Zzqxwv Falls").reason === "unknown-place",
    "a place Google has never heard of was not refused");
  ok(row("90232").ok === false && row("90232").reason === "not-a-place",
    `a ZIP code passed as a sub-location (got ok=${row("90232").ok}) — nobody searches "90232 plumber", `
    + "so a page about one cannot rank");

  // ── 3 · AND A CORRECT LOCAL NAME MUST SURVIVE ───────────────────────────────────────────────
  ok(row("Palms").ok === true && row("Palms").targetType === "Neighborhood",
    `"Palms" did not verify as a California neighborhood (got ok=${row("Palms").ok}, `
    + `${row("Palms").detail}) — Google also returns "Isle of Palms, South Carolina" for it, and the `
    + "louder match must not fail a correct local name");
  ok(row("Mar Vista").ok === true && row("Mar Vista").targetType === "Neighborhood",
    `"Mar Vista" resolved to ${row("Mar Vista").targetType} / ${row("Mar Vista").detail} instead of the `
    + "California neighborhood — ranking by reach picks the bigger ZIP code over the real place");

  // ── 4 · A FAILED LOCATION IS REPLACED FROM GOOGLE'S OWN TREE, NOT BY ASKING AGAIN ────────────
  const near = await ads.nearbyPlaces("Culver City, CA", { stateName: "California" });
  ok(near.length >= 2, `nearbyPlaces returned ${near.length} candidate(s) for a market Google has `
    + "neighborhoods for — a failed sub-location then has nothing to be replaced with");
  ok(near.every((x) => x.targetType === "Neighborhood" || x.targetType === "City"),
    `nearbyPlaces offers a ${near.map((x) => x.targetType).find((t) => t !== "Neighborhood" && t !== "City")} `
    + "as a sub-location — a page can only be written about a place people name");
  ok(!near.some((x) => /^\d+$/.test(x.name)),
    "nearbyPlaces offers a ZIP code as a sub-location");
  ok(near.every((x) => ads.stateOf(x.canonicalName) === "california"),
    "nearbyPlaces offers a replacement outside the client's state");
  ok(near.some((x) => x.name === "Fox Hills") && near.some((x) => x.name === "Jefferson Park"),
    `nearbyPlaces did not surface the neighborhoods Google ties to Culver City (got: ${near.map((x) => x.name).join(", ")})`);
  ok(near[0] && near.every((x, i) => i === 0 || near[i - 1].reach >= x.reach),
    "nearbyPlaces is not ordered by reach — the biggest available area should be offered first");

  // ── 5 · IT IS NOT HARDCODED TO ONE MARKET ───────────────────────────────────────────────────
  const tx = await ads.nearbyPlaces("Round Rock, TX", { stateName: "Texas" });
  ok(tx.some((x) => x.name === "Teravista"),
    `a Texas market got no Texas sub-location candidates (${tx.map((x) => x.name).join(", ") || "none"}) — `
    + "the replacement source must work for any client, not just RGA's own town");
  ok(tx.every((x) => ads.stateOf(x.canonicalName) === "texas"),
    "a Texas market was offered a sub-location outside Texas");

  // ── 6 · AN UNAVAILABLE CHECK IS UNKNOWN, NEVER APPROVAL ─────────────────────────────────────
  {
    const saved = process.env.GOOGLE_ADS_REFRESH_TOKEN;
    delete process.env.GOOGLE_ADS_REFRESH_TOKEN;
    const r = await ads.verifyPlaces(["Palms"], { stateName: "California" });
    process.env.GOOGLE_ADS_REFRESH_TOKEN = saved;
    ok(r.error && !(r.rows || []).some((x) => x.ok === true),
      "with the Ads API unconfigured, verifyPlaces still reported a place as verified — an absence must "
      + "never read as approval");
  }
  {
    const r = await ads.verifyPlaces(["Palms"], {});   // no stateName at all
    const p = (r.rows || [])[0] || {};
    ok(p.ok === true, "with no state supplied, a real place was refused — a national or multi-location "
      + "client's locations are deliberately out of state and must not be failed for it");
  }

  // ── 6b · A BOUND MUST REPORT WHAT IT EXCLUDED, NOT DROP IT ──────────────────────────────────
  // 🔴 FOUND BY THIS GATE: the probe loop used to `slice(0, 6)`, so a seventh proposed location came
  // back as nothing at all — neither verified nor refused, which every caller reads as "fine".
  {
    const many = Array.from({ length: (ads.MAX_PLACE_PROBES || 8) + 3 }, (_, i) => i === 0 ? "Palms" : `Nowhere ${i}`);
    const r = await ads.verifyPlaces(many, { stateName: "California" });
    ok((r.rows || []).length === many.length,
      `verifyPlaces was given ${many.length} locations and returned ${(r.rows || []).length} — the ones it `
      + "dropped are stored as neither verified nor flagged, and an absence reads as approval");
    ok((r.rows || []).slice(-1)[0]?.reason === "unchecked",
      "a location past the per-run probe limit is not reported as unchecked");
  }

  // ── 6c · READING THE LOCATIONS OUT OF A DRAFT, AND REPLACING ONE WITHOUT DAMAGING IT ────────
  // 🔑 A failed sub-location is rewritten IN PLACE. This step has previously eaten its own opening
  // fence by rebuilding a document from parts, so the reader returns LINE INDEXES and the only thing
  // that changes is the one line. → check-a-rebuilt-draft-keeps-its-fences
  {
    const fn = (() => {
      const m = flow.match(/^function readDraftLocations\s*\(/m);
      if (!m) return "";
      const o = flow.indexOf("{", flow.indexOf(")", m.index));
      let d = 0;
      for (let i = o; i < flow.length; i++) {
        if (flow[i] === "{") d++;
        else if (flow[i] === "}") { d--; if (!d) return flow.slice(m.index, i + 1); }
      }
      return "";
    })();
    if (!fn) {
      console.error("⚠️  INDETERMINATE — cannot lift readDraftLocations; re-pin this gate.");
      process.exit(2);
    }
    const c2 = vm.createContext({});
    vm.runInContext(`${fn}\nglobalThis.R = readDraftLocations;`, c2);
    const R = c2.R;
    const real = ["```yaml", "keywords:",
      "  - term: local seo services culver city", "    why: buyers in the city",
      "    searches: no volume data", "locations:",
      "  - Palms (dense rental market next to the office)",
      "  - Mar Vista (affluent homeowners)",
      "  - Houston (large metro)", "```"].join("\n");
    const got = R(real);
    ok(got.entries.map((e) => e.place).join("|") === "Palms|Mar Vista|Houston",
      `the locations were read as [${got.entries.map((e) => e.place).join(", ")}] — the verification then checks `
      + "the wrong strings, or none");
    ok(got.entries[0].clause === "dense rental market next to the office",
      "the clause beside a location is lost, so a verified location would be rewritten without its reason");
    // 🔴 THE FIXTURE MUST PUT A LIST ITEM AFTER THE FENCE. With only prose after it, deleting the
    // fence guard changed nothing — prose is not a list item either way, so the test passed over a
    // removed check. A fixture has to fail for the reason it is testing.
    ok(R(["locations:", "  - Palms (x)", "```", "- Appendix note", "- Another note"].join("\n")).entries.length === 1,
      "the location list runs past the closing fence and swallows whatever follows it as sub-locations");
    ok(R(["locations:", "  - Palms (x)", "notes:", "  - not a place"].join("\n")).entries.length === 1,
      "a following top-level key does not end the location list");
    ok(R(['locations:', '  - "Fox Hills"', "  - Jefferson Park,"].join("\n"))
      .entries.map((e) => e.place).join("|") === "Fox Hills|Jefferson Park",
      "quotes and trailing punctuation are not stripped, so a real place is sent for verification as a "
      + "string Google will not match");
    ok(R(["keywords:", "  - term: a"].join("\n")).start === -1,
      "a draft with no locations section still reports one — the keywords would be verified as places");
    ok(R(["locations:", "  - Palms (x)", "", "  - Fox Hills (y)"].join("\n")).entries.length === 2,
      "a blank line inside the list ends it");
    for (const [n, v] of [["null", null], ["undefined", undefined], ["an empty string", ""]]) {
      let threw = false, res = null;
      try { res = R(v); } catch { threw = true; }
      ok(!threw && res && res.entries.length === 0, `${n} draft throws or invents entries`);
    }
    // THE FENCE PROPERTY: replacing one entry by its index changes exactly one line.
    {
      const out = got.lines.slice();
      out[got.entries[2].i] = "  - Fox Hills (replaced)";
      const after = out.join("\n");
      const diff = after.split("\n").filter((l, i) => l !== real.split("\n")[i]).length;
      ok(after.startsWith("```yaml") && after.trimEnd().endsWith("```"),
        "replacing a sub-location in place destroys the draft's fences");
      ok(diff === 1, `replacing one sub-location changed ${diff} lines — it must change exactly one`);
      ok(!/Houston/.test(after), "the replaced sub-location is still in the draft");
    }
  }

  // ── 7 · THE STEP ACTUALLY CALLS IT, AND READS THE DRAFT'S LOCATIONS ──────────────────────────
  const code = flow.replace(/^[ \t]*\/\/.*$/gm, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
  ok(/await ads\.verifyPlaces\(/.test(code),
    "flow-execute never calls ads.verifyPlaces — the sub-locations reach the record unverified, which is "
    + "the state this gate exists to end");
  ok(/await ads\.nearbyPlaces\(/.test(code),
    "flow-execute never calls ads.nearbyPlaces — a sub-location that fails verification has no replacement");
  ok(/readDraftLocations\(draft\)/.test(code),
    "flow-execute does not read the locations out of the draft — there is nothing for the check to check");
  ok(/location_note:/.test(code) && /locations:\s*locationRows/.test(code),
    "the verification result is not written to outcome_data — a decision nobody can query gets reasoned "
    + "about instead");
  // 🔑 The state rule must be SKIPPED for the models whose locations are meant to be elsewhere.
  ok(/\(national \|\| multi\)\s*\?\s*null/.test(code),
    "the containment check is applied to every geography model — a national client is explicitly asked "
    + "for target metros ANYWHERE, so checking them against the home state is the same bug reversed");
} catch (e) {
  globalThis.fetch = realFetch;
  console.error(`⚠️  INDETERMINATE — the gate itself threw: ${e.message}`);
  console.error("   Fix the gate; do NOT read this as a product failure.");
  process.exit(2);
}
globalThis.fetch = realFetch;

if (!calls) {
  console.error("⚠️  INDETERMINATE — the stub was never called, so nothing was actually exercised.");
  process.exit(2);
}
if (fail.length) {
  console.error("🔴 a sub-location can reach the plan wrong, unreal or unchecked:");
  for (const f of fail) console.error(`   · ${f}`);
  process.exit(1);
}
console.log(`✅ sub-locations are verified against Google's own geo tree over ${calls} recorded responses: a `
  + "real place in the wrong state is refused, a ZIP is not a place, a correct local name survives a louder "
  + "match elsewhere, replacements come from the market's own tree, and an unavailable check is never approval");
