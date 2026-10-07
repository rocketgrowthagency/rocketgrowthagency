#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// A RULE ABOUT A CLIENT MUST WORK FOR A CLIENT WE DO NOT HAVE
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴🔴🔴 Chris, twice now: *"we need all test work to apply to any business and not just RGA"* and
// *"make sure all work we do is universal for each step."*
//
// `check-nothing-is-rga-shaped` already stops RGA's DATA being baked into the code. It cannot see
// this failure, because this one contains no RGA data at all — it is a RULE whose logic only works
// on RGA-shaped input. Measured 2026-10-07:
//
//   listingNamesBusiness  required the whole name in the slug  → 5 of 9 realistic names reported a
//                                                                REAL listing as "no listing found"
//   m1.web.https_sitemap  `website_url.startsWith("https://")` → a site stored as "acme.com" is
//                                                                reported NOT SECURE
//
// Both passed every check for a year's worth of reasons: RGA's name is clean and its URL is stored
// lowercase with a scheme. **One client row is the condition under which a rule shaped to that row
// looks universal.** → feedback_a_rule_tested_on_one_client_is_shaped_to_that_client
//
// 🔑 SO THE FIXTURE IS THE POINT. Businesses we do not have, whose shapes differ in the ways real
// records differ, exercised through the real helpers.
//
// Exit 0 healthy · 1 the product is wrong · 2 INDETERMINATE

import fs from "node:fs";
import vm from "node:vm";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const fails = [];
const F = (m) => fails.push(m);

let flow, dirmod;
try {
  flow = fs.readFileSync(`${SITE}/netlify/functions/flow-execute.js`, "utf8");
  dirmod = fs.readFileSync(`${SITE}/netlify/functions/_citation-directories.js`, "utf8");
} catch { console.error("⚠️  INDETERMINATE — cannot read the function sources"); process.exit(2); }

/** Slice a named function out of the real source and run it — never a copy of its logic. */
function lift(src, name, ctx = {}) {
  const i = src.indexOf(`function ${name}(`);
  if (i < 0) return null;
  let d = 0, end = -1;
  for (let k = src.indexOf("{", i + name.length); k < src.length; k++) {
    if (src[k] === "{") d++;
    else if (src[k] === "}") { d--; if (!d) { end = k + 1; break; } }
  }
  if (end < 0) return null;
  try {
    return vm.runInNewContext(`(${src.slice(i, end).replace(`function ${name}`, "function")})`,
      { URL, Set, String, Number, Math, JSON, ...ctx });
  } catch { return null; }
}

// ═══ 1 — THE CLIENT'S WEBSITE, AS REAL RECORDS STORE IT ══════════════════════════════════════
const clientSiteUrl = lift(flow, "clientSiteUrl");
if (!clientSiteUrl) { console.error("⚠️  INDETERMINATE — clientSiteUrl did not lift from flow-execute.js"); process.exit(2); }
const URLS = [
  ["https://rocketgrowthagency.com", "https://rocketgrowthagency.com", "the one client we have"],
  ["https://acme.com/", "https://acme.com", "a trailing slash"],
  ["acme.com", "https://acme.com", "no scheme — the commonest way a human types it"],
  ["www.acme.com", "https://www.acme.com", "no scheme, with www"],
  ["HTTPS://ACME.COM", "https://acme.com", "an uppercase scheme and host"],
  ["  acme.com  ", "https://acme.com", "surrounding whitespace"],
  ["http://acme.com", "http://acme.com", "plain http must be preserved, not silently upgraded"],
  ["not a url", null, "junk must be refused, never probed"],
  ["localhost", null, "parses as a URL but is not a public site — isolates the hostname guard"],
  ["https://localhost:3000", null, "a dev address must never be probed as a client's site"],
  ["ftp://acme.com", null, "a non-web scheme must be refused"],
  ["", null, "empty"],
  [null, null, "absent"],
];
for (const [raw, want, why] of URLS) {
  const got = clientSiteUrl({ website_url: raw });
  if (got !== want) F(`a client whose website is stored as ${JSON.stringify(raw)} (${why}) resolves to ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
}

// 🔴 AND NO STEP MAY GO BACK TO DOING ITS OWN URL SURGERY. That is how nine steps each grew their
// own assumption about what the field looks like.
{
  const code = flow.split("\n").map((l) => l.replace(/^\s*\/\/.*$/, "").replace(/\s\/\/\s.*$/, "")).join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const raw = [...code.matchAll(/client\.website_url\s*\.\s*(replace|startsWith|split|slice|substring)\s*\(/g)];
  for (const m of raw) {
    F(`flow-execute line ${code.slice(0, m.index).split("\n").length} does its own surgery on client.website_url (.${m[1]}) — use clientSiteUrl(client), which handles a record that is not shaped like RGA's`);
  }
}

// ═══ 1b — THE CLIENT'S MARKET, AS REAL RECORDS STORE IT ══════════════════════════════════════
// 🔴🔴 `primary_market` is free text a human typed, and six places split it on a comma as though it
// were always "City, ST" — RGA's format. The worst consequence was PUBLISHED: a storefront schema
// with `addressLocality: "Greater Boston"`, which is not a city and does not match the client's
// Google profile. The first rule of local SEO is that this NAP matches the GBP exactly, so a
// locality we guessed is an inconsistency we created.
// 🔑 EACH FIELD IS KNOWN OR null. A consumer omits what it does not have.
{
  const stSet = flow.match(/^const US_STATES = new Set\(\[[\s\S]*?\]\);$/m);
  const stNames = flow.match(/^const US_STATE_NAMES = \{[\s\S]*?\n\};$/m);
  const i = flow.indexOf("function clientLocality(client) {");
  let d = 0, end = -1;
  for (let k = flow.indexOf("{", i + 30); k < flow.length; k++) {
    if (flow[k] === "{") d++;
    else if (flow[k] === "}") { d--; if (!d) { end = k + 1; break; } }
  }
  if (!stSet || !stNames || i < 0 || end < 0) {
    console.error("⚠️  INDETERMINATE — clientLocality did not lift from flow-execute.js"); process.exit(2);
  }
  let locality;
  try { locality = vm.runInNewContext(`${stSet[0]}\n${stNames[0]}\n${flow.slice(i, end)}\nclientLocality`, { String, Set }); }
  catch { console.error("⚠️  INDETERMINATE — clientLocality would not evaluate"); process.exit(2); }

  const MARKETS = [
    ["Culver City, CA", "Culver City", "CA", "the one client we have"],
    ["Culver City, California", "Culver City", "CA", "a state spelled out"],
    ["New York, New York", "New York", "NY", "a city and state with the same name"],
    ["Austin, TX, USA", "Austin", "TX", "a trailing country"],
    ["Greater Boston", null, null, "a metro area — names no city and no state"],
    ["Los Angeles County", null, null, "a county is not a locality"],
    ["Springfield, ZZ", null, null, "a two-letter token that is not a state"],
    ["", null, null, "empty"],
    [null, null, null, "absent"],
  ];
  for (const [market, wantLoc, wantReg, why] of MARKETS) {
    const got = locality({ primary_market: market });
    if (got.locality !== wantLoc) F(`market ${JSON.stringify(market)} (${why}) gives locality ${JSON.stringify(got.locality)}, expected ${JSON.stringify(wantLoc)} — a guessed locality published in schema contradicts the client's Google profile`);
    if (got.region !== wantReg) F(`market ${JSON.stringify(market)} (${why}) gives region ${JSON.stringify(got.region)}, expected ${JSON.stringify(wantReg)}`);
  }

  // 🔴 AND NO STEP MAY GO BACK TO SPLITTING THE MARKET ITSELF.
  const code = flow.split("\n").map((l) => l.replace(/^\s*\/\/.*$/, "").replace(/\s\/\/\s.*$/, "")).join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of code.matchAll(/primary_market[^\n]{0,40}\.split\(/g)) {
    F(`flow-execute line ${code.slice(0, m.index).split("\n").length} splits primary_market itself — use clientLocality(client), which returns null rather than a guess`);
  }
}

// ═══ 1c — THE MARKUP WE PUBLISH ON THE CLIENT'S OWN SITE ═════════════════════════════════════
// 🔴🔴 This is the one output that leaves our product and lives on the client's homepage, where a
// wrong field contradicts their Google profile. Current guidance: a service-area business omits the
// street address entirely — a non-public dispatch address confuses Google and fails verification —
// and `addressRegion` is expected as a two-letter state.
{
  const start = flow.indexOf('  "m1.web.schema": async ({ client }) => {');
  if (start < 0) { console.error("⚠️  INDETERMINATE — the schema step is not in flow-execute.js"); process.exit(2); }
  const lp = flow.indexOf("(", start);
  let pd = 0, after = -1;
  for (let i = lp; i < flow.length; i++) { if (flow[i] === "(") pd++; else if (flow[i] === ")") { pd--; if (!pd) { after = i + 1; break; } } }
  let d = 0, end = -1;
  for (let i = flow.indexOf("{", after); i < flow.length; i++) { if (flow[i] === "{") d++; else if (flow[i] === "}") { d--; if (!d) { end = i + 1; break; } } }
  const stSet = flow.match(/^const US_STATES = new Set\(\[[\s\S]*?\]\);$/m)[0];
  const stNames = flow.match(/^const US_STATE_NAMES = \{[\s\S]*?\n\};$/m)[0];
  const grab = (name) => {
    const i = flow.indexOf(`function ${name}(`);
    let dd = 0, e = -1;
    for (let k = flow.indexOf("{", i + name.length); k < flow.length; k++) { if (flow[k] === "{") dd++; else if (flow[k] === "}") { dd--; if (!dd) { e = k + 1; break; } } }
    return flow.slice(i, e);
  };
  let runSchema;
  try {
    const ctx = vm.createContext({ URL, String, Object, JSON, Set, Math, console, svcCtx: (c) => c.primary_service || "Services" });
    const padSrc = flow.slice(flow.indexOf("const citPad = (labels)"), flow.indexOf("};", flow.indexOf("const citPad = (labels)")) + 1);
    vm.runInContext(`${stSet}\n${stNames}\n${padSrc}\n${grab("clientSiteUrl")}\n${grab("clientLocality")}`, ctx);
    runSchema = vm.runInContext(`(${flow.slice(flow.indexOf("async", start), end)})`, ctx);
  } catch (e) {
    console.error(`⚠️  INDETERMINATE — the schema step would not evaluate: ${e.message}`); process.exit(2);
  }
  const of = async (client) => JSON.parse((await runSchema({ client })).outcome_data.snippet
    .replace(/^<script[^>]*>/, "").replace(/<\/script>$/, ""));

  const sab = await of({ business_name: "Acme Plumbing LLC", primary_market: "Austin, TX",
    website_url: "acme.com", primary_contact_phone: "(512) 555-0100", geography_model: "service_area" });
  if (sab.address) F(`a service-area business publishes a street address (${JSON.stringify(sab.address)}) — current guidance omits it, and a non-public address fails Google verification`);
  if (!sab.areaServed) F("a service-area business publishes no areaServed, which is the field that replaces the address");
  if (sab.url !== "https://acme.com") F(`the published url is ${JSON.stringify(sab.url)} — a site stored without a scheme must still publish as a real URL`);

  const shop = await of({ business_name: "Katz's Deli", primary_market: "New York, NY",
    website_url: "https://katzs.com", primary_contact_phone: "(212) 254-2246", geography_model: "national_one_office" });
  if (!shop.address) F("a storefront with a city and state publishes no address at all");
  if (shop.address && shop.address.addressLocality !== "New York") F(`addressLocality is ${JSON.stringify(shop.address?.addressLocality)}, expected "New York"`);
  if (shop.address && shop.address.addressRegion !== "NY") F(`addressRegion is ${JSON.stringify(shop.address?.addressRegion)} — the spec expects a two-letter state`);

  const vague = await of({ business_name: "Boston Legal Group", primary_market: "Greater Boston",
    website_url: "https://blg.com", primary_contact_phone: "(617) 555-0100", geography_model: "national_one_office" });
  if (vague.address) F(`"Greater Boston" produced ${JSON.stringify(vague.address)} — a metro area is not a city, and publishing it as addressLocality contradicts the client's Google profile`);
}

// ═══ 2 — THE CLIENT'S NAME, AS REAL BUSINESSES ARE NAMED ═════════════════════════════════════
const citNormSrc = dirmod.match(/^const citNorm = .*;$/m);
const citTokSrc = dirmod.match(/^const CIT_NOISE = new Set\(\[[\s\S]*?\]\);$/m);
const citTokFn = dirmod.match(/^const citTokens = [\s\S]*?;$/m);
const namesFn = (() => {
  if (!citNormSrc || !citTokSrc || !citTokFn) return null;
  const i = dirmod.indexOf("function listingNamesBusiness(");
  if (i < 0) return null;
  let d = 0, end = -1;
  for (let k = dirmod.indexOf("{", i + 28); k < dirmod.length; k++) {
    if (dirmod[k] === "{") d++;
    else if (dirmod[k] === "}") { d--; if (!d) { end = k + 1; break; } }
  }
  try {
    return vm.runInNewContext(
      `${citNormSrc[0]}\n${citTokSrc[0]}\n${citTokFn[0]}\n${dirmod.slice(i, end)}\nlistingNamesBusiness`,
      { URL, Set, String, Number, Math });
  } catch { return null; }
})();
if (!namesFn) { console.error("⚠️  INDETERMINATE — listingNamesBusiness did not lift from _citation-directories.js"); process.exit(2); }

const NAMES_MATCH = [
  ["Rocket Growth Agency", "https://www.yelp.com/biz/rocket-growth-agency", "Rocket Growth Agency", "the one client we have"],
  ["Acme Plumbing LLC", "https://www.yelp.com/biz/acme-plumbing-boston", "Acme Plumbing", "a legal suffix"],
  ["Smith & Jones Law", "https://www.yelp.com/biz/smith-and-jones-law-chicago", "Smith & Jones Law", "an ampersand"],
  ["The Corner Cafe", "https://www.yelp.com/biz/corner-cafe-austin", "Corner Cafe", "a leading article"],
  ["Dr. Alan Patel, DDS", "https://www.yelp.com/biz/alan-patel-dds-miami", "Alan Patel, DDS", "an honorific and a credential"],
  ["Bright Smile Dental Group, Inc.", "https://www.yelp.com/biz/bright-smile-dental-group", "Bright Smile Dental Group", "Inc."],
  ["KFC", "https://www.yelp.com/biz/kfc-houston", "KFC", "a three-letter name"],
];
const NAMES_REJECT = [
  ["Rocket Growth Agency", "https://www.facebook.com/rocketdigitalagency/", "ROCKETDIGITAL", "a different business, measured live"],
  ["Acme Plumbing", "https://www.yelp.com/biz/acme-electrical-boston", "Acme Electrical", "same first word, different trade"],
  ["The Company", "https://www.yelp.com/biz/anything", "Anything", "a name made only of noise words"],
];
for (const [n, u, t, why] of NAMES_MATCH) if (!namesFn(u, t, n)) F(`"${n}" (${why}) would have its REAL listing reported as missing — step 52 then builds a duplicate`);
for (const [n, u, t, why] of NAMES_REJECT) if (namesFn(u, t, n)) F(`"${u}" was accepted as "${n}"'s listing (${why})`);

if (fails.length) {
  console.error("🔴 a rule about a client only works for the client we happen to have:");
  for (const f of fails) console.error("   · " + f);
  process.exit(1);
}
console.log(`✅ client rules hold for businesses we do not have — ${URLS.length} website shapes, 9 market shapes, 3 published-schema shapes, `
  + `${NAMES_MATCH.length} names that must match, ${NAMES_REJECT.length} that must not`);
