#!/usr/bin/env node
/**
 * check-no-two-clients-share-a-google-property.mjs — one client, one business's data.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-11. Chris, at the Google consent screen launched from the TEST client's portal:
 * *"should I try with hello@rocketgrowthagency.com for this step?"*
 *
 * 🔴 No — and the reason is in `oauth-google-callback.js`. There is no property picker. It binds
 * the **first** thing it finds on whichever Google account signs in:
 *
 *     accountSummaries[0].propertySummaries[0].property   → ga4_property_id
 *     accounts[0].name                                    → gbp_account_id
 *     locations[0].name                                   → gbp_location_id
 *
 * So signing in as `hello@rocketgrowthagency.com` from the FAKE client's portal would have written
 * RGA's own GA4 property, GBP account and location onto **Lux's** oauth row. Lux would then report
 * RGA's real traffic, calls and impressions as its own — and every report, KPI and Brain analysis
 * for that client would be measuring a different business entirely.
 *
 * 🔑 This is the rank-grid lesson again: a number that is confidently wrong survives far longer than
 * a number that is missing. A client silently reporting another business's data looks completely
 * healthy. → project_rank_grid_uniform_sentinel
 *
 * 🔑 The connect flow cannot be made safe by remembering to be careful — so this asserts the
 * INVARIANT instead: no two clients may point at the same GA4 property, Search Console site, GBP
 * location, or Google account.
 *
 * Exit 0 = every client measures its own business · 1 = two clients share a source · 2 = can't tell.
 */
const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("── no two clients are measuring the same Google property ──");

if (!SUPA_URL || !SUPA_KEY) {
  console.log("  ⚠️  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — cannot tell.");
  process.exit(2);
}

async function supa(path) {
  const r = await fetch(`${SUPA_URL}/rest/v1${path}`, {
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${text.slice(0, 160)}`);
  return text ? JSON.parse(text) : [];
}

let rows, clients;
try {
  rows = await supa("/client_google_oauth?select=client_id,ga4_property_id,gsc_site_url,gbp_location_id,gbp_account_id,google_account_email,connected_at");
  clients = await supa("/clients?select=id,business_name");
} catch (e) {
  console.log(`  ⚠️  could not read the connections: ${e.message}`);
  process.exit(2);
}

const nameOf = new Map(clients.map((c) => [c.id, c.business_name || c.id]));

if (!rows.length) {
  // Nothing connected is a legitimate state (no client has finished onboarding), not a fault.
  console.log("  ✅ no Google connections on record yet — nothing can collide");
  process.exit(0);
}

// Each field is a claim about WHICH business this client is. Two clients making the same claim
// means at least one of them is reporting someone else's numbers.
const FIELDS = [
  ["ga4_property_id", "GA4 property"],
  ["gsc_site_url", "Search Console site"],
  ["gbp_location_id", "Business Profile location"],
  ["gbp_account_id", "Business Profile account"],
];

let fails = 0;
for (const [field, label] of FIELDS) {
  const seen = new Map();
  for (const r of rows) {
    const v = r[field];
    if (!v) continue;                       // not connected for this source — not a collision
    if (!seen.has(v)) seen.set(v, []);
    seen.get(v).push(r.client_id);
  }
  for (const [value, ids] of seen) {
    if (ids.length < 2) continue;
    console.log(`  🔴 ${label} ${value} is claimed by ${ids.length} clients:`);
    ids.forEach((id) => console.log(`       ${nameOf.get(id) || id}  (${id})`));
    fails++;
  }
}

if (fails) {
  console.log(`\n🔴 ${fails} Google source(s) are shared between clients.`);
  console.log("   At least one client is reporting another business's traffic, calls and rankings");
  console.log("   as its own — and it looks completely healthy while doing it.");
  console.log("   Cause is almost always the connect flow: oauth-google-callback binds the FIRST");
  console.log("   property on whichever Google account signed in, with no picker and no confirmation.");
  process.exit(1);
}

console.log(`  ✅ ${rows.length} connection(s), each measuring its own business:`);
for (const r of rows) {
  const bits = [r.ga4_property_id && "GA4", r.gsc_site_url && "GSC", r.gbp_location_id && "GBP"].filter(Boolean);
  console.log(`       ${(nameOf.get(r.client_id) || r.client_id).padEnd(26)} ${bits.join("+") || "(no sources bound)"}  via ${r.google_account_email || "?"}`);
}
process.exit(0);
