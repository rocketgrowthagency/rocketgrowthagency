#!/usr/bin/env node
// check-no-duplicate-google-listing.mjs
//
// Does a SECOND Google listing exist for this client's business name?
//
// 🔴 WHY THIS EXISTS — RGA, 2026-09-11. A rank grid ran 81 points over 90 minutes and reported the
// business nowhere on Maps. The real cause was not rank at all: there were TWO live listings named
// "Rocket Growth Agency", same website, different phone and category. Two entities with one name in
// one market split Google's confidence and one gets suppressed. A rank number cannot say that; only
// counting the listings can.
//
// 🔑 AND THE OBVIOUS PROBE DOES NOT WORK. The Business Profile API answers "how many locations do we
// OWN" (RGA: exactly 1) — a duplicate claimed under a DIFFERENT Google account is invisible to it.
// `googleLocations:search` was tried under six query shapes and never returned the duplicate once;
// it matches on address and both listings are address-less service-area businesses. What it DID
// return was "Growth Rocket", a different company entirely.
//
// So this searches MAPS BY NAME — the thing that actually found it — and compares every same-name
// result against the place key we have on record.
//
// Usage:
//   node scripts/check-no-duplicate-google-listing.mjs --client=<uuid>
//   node scripts/check-no-duplicate-google-listing.mjs --all
//
// Exit codes → feedback_exit_code_semantics_for_gates
//   0  every client resolved to exactly ONE listing under its own name
//   1  a duplicate listing exists (real finding, needs an ownership action)
//   2  could not tell — no coordinates, no stored place key, no SerpApi key, API error, zero results

import "dotenv/config";

const RGA_PROJECT_REF = "jetgayimvfeslqnkbfdq";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const SERPAPI_KEY = process.env.SERPAPI_KEY;

const args = process.argv.slice(2);
const argVal = (name, def) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : def;
};
const CLIENT_ID = argVal("client");
const ALL = args.includes("--all");
// --self-test needs no credentials and no target: it exercises the verdict logic on fixtures, so it
// must still run on a machine that has neither. → feedback_a_test_nobody_runs_is_not_a_guard
const SELF_TEST = args.includes("--self-test");

if (!CLIENT_ID && !ALL && !SELF_TEST) {
  console.error("Usage: --client=<uuid> | --all");
  process.exit(2);
}
if (!SELF_TEST && !TOKEN) { console.error("[dupe] INDETERMINATE — missing SUPABASE_ACCESS_TOKEN"); process.exit(2); }
if (!SELF_TEST && !SERPAPI_KEY) { console.error("[dupe] INDETERMINATE — missing SERPAPI_KEY, cannot search Maps"); process.exit(2); }

async function pgQuery(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${RGA_PROJECT_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`PG: ${res.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

const sqlStr = (v) => (v == null ? "null" : `'${String(v).replace(/'/g, "''")}'`);

// "Rocket Growth Agency" and "rocket-growth agency." are one business to a human, so they must be to us.
// 🔑 This is an EXACT-name test on purpose. "Growth Rocket" is a real different agency in the same
// city; reporting it as a duplicate would be a fabricated finding.
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const latLngFrom = (url) => {
  const m = String(url || "").match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  return m ? { lat: parseFloat(m[1]), lng: parseFloat(m[2]) } : null;
};
const placeKeyFrom = (url) => {
  const m = String(url || "").match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i);
  return m ? m[1].toLowerCase() : null;
};

// The whole verdict, as one pure function — so `--self-test` exercises the SAME logic that runs live
// rather than a re-implementation of it that can silently drift. → feedback_a_check_must_not_validate_itself
function classify(businessName, ownKey, results) {
  const sameName = (results || []).filter((r) => norm(r.title) === norm(businessName));
  if (!sameName.length) {
    // The business did not come back for its OWN name. Never a pass — either the search is wrong or
    // something is badly broken with the listing.
    return { verdict: "indeterminate", reason: `no result for its own name (${(results || []).length} other results)` };
  }
  const others = sameName.filter((r) => String(r.data_id || "").toLowerCase() !== ownKey);
  return others.length ? { verdict: "duplicate", others } : { verdict: "clean", others: [] };
}

if (SELF_TEST) {
  const OURS = "0xbbdfa820c985be7:0x6c0a0556549b4073";
  const DUPE = "0x80417503491dc593:0x74379b231b7d60e4";
  const cases = [
    ["one listing only → clean", "Rocket Growth Agency", OURS,
      [{ title: "Rocket Growth Agency", data_id: OURS }], "clean"],
    ["the real RGA case → duplicate", "Rocket Growth Agency", OURS,
      [{ title: "Rocket Growth Agency", data_id: OURS }, { title: "Rocket Growth Agency", data_id: DUPE }], "duplicate"],
    ["a similarly-named COMPETITOR is not a duplicate", "Rocket Growth Agency", OURS,
      [{ title: "Rocket Growth Agency", data_id: OURS }, { title: "Growth Rocket", data_id: "0x80c2b09f34d2f055:0x2207cc511ef1e7dd" }], "clean"],
    ["punctuation/case differences are the SAME business", "Rocket Growth Agency", OURS,
      [{ title: "rocket-growth agency.", data_id: OURS }, { title: "Rocket Growth Agency", data_id: DUPE }], "duplicate"],
    ["absent from its own name search → indeterminate, NOT clean", "Rocket Growth Agency", OURS,
      [{ title: "Growth Rocket", data_id: "0xzzz:0xzzz" }], "indeterminate"],
    ["zero results → indeterminate, NOT clean", "Rocket Growth Agency", OURS, [], "indeterminate"],
  ];
  let bad = 0;
  for (const [label, name, key, results, want] of cases) {
    const got = classify(name, key, results).verdict;
    const ok = got === want;
    if (!ok) bad++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}  (want ${want}, got ${got})`);
  }
  console.log(`\n[dupe] self-test: ${cases.length - bad}/${cases.length} passed`);
  process.exit(bad ? 1 : 0);
}

const where = ALL
  ? `where archived_at is null and gbp_url is not null`
  : `where id = ${sqlStr(CLIENT_ID)}`;
let clients;
try {
  clients = await pgQuery(
    `select id, business_name, gbp_url, primary_market from public.clients ${where} order by business_name`
  );
} catch (e) {
  // 🔴 A query that blows up is "we could not look", never "we looked and it was clean" — and never a
  // FINDING either. Exit 2. → feedback_exit_code_semantics_for_gates
  console.error(`[dupe] INDETERMINATE — could not load clients: ${e.message}`);
  process.exit(2);
}

if (!clients.length) {
  console.error("[dupe] INDETERMINATE — no clients matched");
  process.exit(2);
}

let duplicates = 0;
let indeterminate = 0;

for (const c of clients) {
  const center = latLngFrom(c.gbp_url);
  const ownKey = placeKeyFrom(c.gbp_url);
  if (!center || !ownKey) {
    console.log(`[dupe] ? ${c.business_name} — INDETERMINATE: gbp_url lacks ${!center ? "@lat,lng" : "the !1s place key"}`);
    indeterminate++;
    continue;
  }

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_maps");
  url.searchParams.set("q", c.business_name);
  url.searchParams.set("ll", `@${center.lat},${center.lng},14z`);
  url.searchParams.set("hl", "en");
  url.searchParams.set("gl", "us");
  url.searchParams.set("api_key", SERPAPI_KEY);

  let data;
  try {
    const res = await fetch(url);
    data = await res.json();
    // 🔴 A non-200 or an error payload is NOT "no duplicate". It is "we could not look."
    if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  } catch (e) {
    console.log(`[dupe] ? ${c.business_name} — INDETERMINATE: Maps search failed (${e.message})`);
    indeterminate++;
    continue;
  }

  const results = data.local_results || (data.place_results ? [data.place_results] : []);
  const v = classify(c.business_name, ownKey, results);

  if (v.verdict === "indeterminate") {
    console.log(`[dupe] ? ${c.business_name} — INDETERMINATE: ${v.reason}`);
    indeterminate++;
    continue;
  }
  if (v.verdict === "clean") {
    console.log(`[dupe] OK ${c.business_name} — exactly one listing (${ownKey})`);
    continue;
  }

  duplicates++;
  console.log(`[dupe] FAIL ${c.business_name} — ${v.others.length} DUPLICATE listing(s) beyond the one on record`);
  console.log(`         ours: ${ownKey}`);
  for (const o of v.others) {
    console.log(`         dupe: ${o.data_id} | ${o.type || "?"} | ${o.phone || "no phone"} | ${o.website || "no site"}`);
    if (o.place_id) {
      console.log(`               claim / request ownership: https://business.google.com/arc/p/${o.place_id}`);
    }
  }
}

console.log(`\n[dupe] ${clients.length} client(s): ${duplicates} with duplicates, ${indeterminate} indeterminate`);
if (duplicates) process.exit(1);
if (indeterminate) process.exit(2);
process.exit(0);
