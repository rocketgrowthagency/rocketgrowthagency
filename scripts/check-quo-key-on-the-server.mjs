#!/usr/bin/env node
// check-quo-key-on-the-server.mjs — 11-10: Netlify's QUO_API_KEY held a dead value (401) and nothing noticed, while the Schedule said
// "Texts are off: Quo key not working" without ever testing it. Chris re-pasted the one key (Quo "rga-crm-sync") into Netlify. This asks
// the LIVE site's schedule-data, as the admin, for its server-side test of the key (GET /v1/phone-numbers) and fails on anything but "ok".
// The laptop key is check-quo-webhooks-live's job; this is the SERVER's key (a laptop fetch is not the server's fetch). Never prints a key.
// No Supabase env or the site unreachable = INDETERMINATE (2), never green.
const U = process.env.SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!U || !K) { console.log("INDETERMINATE: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set (run with --env-file=.env)"); process.exit(2); }
let j;
try {
  const g = await (await fetch(`${U}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: "hello@rocketgrowthagency.com" }) })).json();
  const v = await (await fetch(`${U}/auth/v1/verify`, { method: "POST", headers: { apikey: K, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: g.hashed_token || (g.properties && g.properties.hashed_token) }) })).json();
  const d = new Date(), day = (n) => new Date(d.getTime() + n * 86400000).toISOString().slice(0, 10);
  const r = await fetch(`https://www.rocketgrowthagency.com/.netlify/functions/schedule-data?from=${day(0)}&to=${day(7)}`, { headers: { Authorization: `Bearer ${v.access_token}` } });
  if (!r.ok) { console.log(`INDETERMINATE: schedule-data answered ${r.status}`); process.exit(2); }
  j = await r.json();
} catch (e) { console.log(`INDETERMINATE: could not reach the live site (${e.message})`); process.exit(2); }
if (j.quoKey === undefined) { console.log("❌ schedule-data no longer reports quoKey, so the server's Quo key is untested"); process.exit(1); }
if (j.quoKey !== "ok") { console.log(`❌ the live server's QUO_API_KEY is "${j.quoKey}": call tracking and reminder texts can't reach Quo. Re-paste the Quo "rga-crm-sync" key into Netlify QUO_API_KEY and redeploy (memory reference_quo_api_key)`); process.exit(1); }
console.log("✅ the live server's Quo key works (Quo answered its phone-number list)");
