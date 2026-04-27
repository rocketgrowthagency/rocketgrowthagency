#!/usr/bin/env node
// Onboard a new client into RGA Supabase + populate baseline records.
//
// SAFETY: hardcoded to RGA project ref (jetgayimvfeslqnkbfdq).
//
// Usage:
//   node onboard-client.mjs <client.json>
//
// client.json schema:
//   {
//     "business_name": "OHH RATS!",
//     "website_url": "https://ohhrats.com/",
//     "gbp_url": "https://www.google.com/maps/place/OHH+RATS!",
//     "primary_service": "Pest Control / Extermination",
//     "primary_market": "San Francisco, CA",
//     "primary_contact_name": "John Peters",
//     "primary_contact_email": "(optional)",
//     "primary_contact_phone": "(415) 798-7849",
//     "account_manager": "Chris",
//     "baseline": {
//       "search_term": "Pest control in San Francisco, CA",
//       "map_rank": 52,
//       "rating": 5.0,
//       "review_count": 0
//     },
//     "tracked_keywords": [
//       "Pest control in San Francisco, CA",
//       "Rat removal in San Francisco, CA",
//       "Exterminator in San Francisco, CA"
//     ]
//   }

import "dotenv/config";
import fs from "node:fs";

const RGA_PROJECT_REF = "jetgayimvfeslqnkbfdq";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error("Missing SUPABASE_ACCESS_TOKEN"); process.exit(1); }

const clientPath = process.argv[2];
if (!clientPath) { console.error("Usage: node onboard-client.mjs <client.json>"); process.exit(1); }
const client = JSON.parse(fs.readFileSync(clientPath, "utf8"));

async function pgQuery(sql, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${RGA_PROJECT_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error(`✗ ${label}: HTTP ${res.status}`, JSON.stringify(data).slice(0, 400));
    process.exit(1);
  }
  return data;
}

// SQL string-literal escape (for embedding values in dynamic SQL)
function sqlStr(v) {
  if (v == null) return "null";
  return `'${String(v).replace(/'/g, "''")}'`;
}

// 1. Find workspace_id (use the one that has the most clients, or the only one)
console.log(`[onboard] looking up RGA workspace...`);
const workspaces = await pgQuery(
  `select w.id, w.name, count(c.id) as client_count
   from public.workspaces w
   left join public.clients c on c.workspace_id = w.id
   group by w.id, w.name
   order by client_count desc, w.created_at asc
   limit 1`,
  "workspace lookup"
);
if (!workspaces.length) {
  console.error("No workspaces found in RGA project. Create one first.");
  process.exit(1);
}
const workspaceId = workspaces[0].id;
console.log(`[onboard] using workspace: ${workspaces[0].name} (${workspaceId})`);

// 2. Insert client (idempotent — skip if business_name already exists in this workspace)
console.log(`[onboard] checking if client exists...`);
const existing = await pgQuery(
  `select id from public.clients
   where workspace_id = ${sqlStr(workspaceId)}
     and lower(business_name) = lower(${sqlStr(client.business_name)})
   limit 1`,
  "client existence check"
);

let clientId;
if (existing.length) {
  clientId = existing[0].id;
  console.log(`[onboard] client already exists: ${clientId}`);
} else {
  console.log(`[onboard] creating client "${client.business_name}"...`);
  const inserted = await pgQuery(
    `insert into public.clients (
       workspace_id, business_name, website_url, gbp_url,
       primary_service, primary_market,
       primary_contact_name, primary_contact_email, primary_contact_phone,
       account_manager, status, source
     ) values (
       ${sqlStr(workspaceId)}, ${sqlStr(client.business_name)},
       ${sqlStr(client.website_url)}, ${sqlStr(client.gbp_url)},
       ${sqlStr(client.primary_service)}, ${sqlStr(client.primary_market)},
       ${sqlStr(client.primary_contact_name)}, ${sqlStr(client.primary_contact_email)}, ${sqlStr(client.primary_contact_phone)},
       ${sqlStr(client.account_manager || 'Chris')}, 'active', 'scraper_baseline'
     ) returning id`,
    "client insert"
  );
  clientId = inserted[0].id;
  console.log(`[onboard] ✓ client created: ${clientId}`);
}

// 3. Create initial onboarding record (idempotent — uses unique constraint on client_id)
console.log(`[onboard] ensuring onboarding record...`);
const onboardingData = {
  baseline: client.baseline || {},
  tracked_keywords: client.tracked_keywords || [],
  notes: `Auto-onboarded from scraper baseline ${new Date().toISOString().slice(0,10)}.`
};
await pgQuery(
  `insert into public.client_onboarding_records (client_id, template_version, data)
   values (${sqlStr(clientId)}, 'month1-v2', ${sqlStr(JSON.stringify(onboardingData))}::jsonb)
   on conflict (client_id) do update set data = excluded.data, updated_at = now()`,
  "onboarding upsert"
);
console.log(`[onboard] ✓ onboarding record set`);

// 4. Insert baseline keyword rankings (one row per tracked keyword)
if (client.tracked_keywords?.length && client.baseline) {
  console.log(`[onboard] inserting baseline rankings (${client.tracked_keywords.length} keywords)...`);
  const baseRank = client.baseline.map_rank || null;
  for (const kw of client.tracked_keywords) {
    // Only the search term we actually scraped gets the real rank; others = null (untracked yet)
    const isMeasured = kw === client.baseline.search_term;
    await pgQuery(
      `insert into public.client_keyword_rankings (client_id, keyword, market, map_rank, source)
       values (${sqlStr(clientId)}, ${sqlStr(kw)}, ${sqlStr(client.primary_market)}, ${isMeasured ? baseRank : 'null'}, 'scraper_baseline')`,
      `rank insert: ${kw}`
    );
  }
  console.log(`[onboard] ✓ baseline rankings inserted`);
}

// 5. Insert baseline GBP snapshot
if (client.baseline) {
  console.log(`[onboard] inserting baseline GBP snapshot...`);
  await pgQuery(
    `insert into public.client_gbp_snapshots (
       client_id, snapshot_date, rating, review_count, source
     ) values (
       ${sqlStr(clientId)}, current_date,
       ${client.baseline.rating || 'null'},
       ${client.baseline.review_count != null ? client.baseline.review_count : 'null'},
       'scraper_baseline'
     )
     on conflict (client_id, snapshot_date, source) do update set
       rating = excluded.rating, review_count = excluded.review_count`,
    "gbp snapshot insert"
  );
  console.log(`[onboard] ✓ baseline GBP snapshot recorded`);
}

console.log(`\n✅ Client "${client.business_name}" onboarded.`);
console.log(`   client_id: ${clientId}`);
console.log(`   workspace_id: ${workspaceId}`);
console.log(`   View in admin: https://www.rocketgrowthagency.com/admin/`);
