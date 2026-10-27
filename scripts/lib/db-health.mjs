// db-health.mjs — ONE cheap read of the clients' database: exit 0 healthy (answers in ≤ 4 s), 1 struggling (slow / failing /
// no answer in 8 s), with the reason on stdout. Used by daily-health-check.sh before every live gate and mirrored in
// run-gates-fast.mjs — so a test run never piles on a database that is already struggling (10-26 outage, restart needed).
// → feedback_my_test_runs_share_the_clients_database
const U = process.env.SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!U || !K) { console.log("no database env"); process.exit(0); }
const t = Date.now();
try {
  const r = await fetch(`${U}/rest/v1/clients?select=id&limit=1`, { headers: { apikey: K, Authorization: `Bearer ${K}` }, signal: AbortSignal.timeout(8000) });
  const ms = Date.now() - t;
  if (r.ok && ms <= 4000) { console.log(`ok ${ms} ms`); process.exit(0); }
  console.log(r.ok ? `slow (${ms} ms)` : `HTTP ${r.status}`); process.exit(1);
} catch (e) { console.log(e.name === "TimeoutError" ? "no answer in 8 s" : e.message); process.exit(1); }
