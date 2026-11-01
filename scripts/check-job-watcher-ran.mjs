#!/usr/bin/env node
// check-job-watcher-ran.mjs — THE MAC WATCHES THE WATCHER (approved admin_system_health_v1, Chris 10-31). job-watcher checks the Mac's jobs every hour; this checks,
// every morning, that job-watcher itself ran. If both die, nothing notices: the outside ping service in the mockup isn't chosen yet.
// 🔴 ONE READ of one row of the clients' database (daily-health-check guards it with db-health). Not set up yet is exit 2, "could not tell": never healthy.
// Pointed at a copy (a mutation run) it reads nothing live and judges a healthy fixture. Its logic always proves itself on bad fixtures first.
// Exit 0 = it ran · 1 = it hasn't, or it failed · 2 = could not tell. → memory project_system_health
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
let watcherRan;
try { ({ watcherRan } = createRequire(`${SITE}/netlify/functions/x.js`)("./_job-status.js")); }
catch (e) { console.error(`🔴 the status code won't load: ${e.message}`); process.exit(1); }

// The verdict must be able to go every way before it's believed.
const now = Date.now(), ago = (m) => new Date(now - m * 60000).toISOString();
const proof = [
  ["silent for hours", { started_at: ago(400), finished_at: ago(399), ok: true }, {}, 1],
  ["failed", { started_at: ago(20), finished_at: ago(19), ok: false, error: "x" }, {}, 1],
  ["never finished", { started_at: ago(30) }, {}, 1],
  ["healthy", { started_at: ago(20), finished_at: ago(19), ok: true }, {}, 0],
  ["no table", null, { tableReady: false }, 2],
  ["no row", null, {}, 2],
];
for (const [name, row, opts, want] of proof) {
  const got = watcherRan(row, now, opts).exit;
  if (got !== want) { console.error(`🔴 the watcher check can't tell "${name}": exit ${got}, want ${want}`); process.exit(1); }
}

let row = null, tableReady = true;
if (process.env.SCRAPER_COPY_DIR) row = { started_at: ago(20), finished_at: ago(19), ok: true };
else {
  const U = process.env.SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!U || !K) { console.error("⚠️  INDETERMINATE — no database settings; nothing shows the watcher ran"); process.exit(2); }
  try {
    const r = await fetch(`${U}/rest/v1/job_checkins?job=eq.job-watcher&select=started_at,finished_at,ok,error&order=started_at.desc&limit=1`, { headers: { apikey: K, Authorization: `Bearer ${K}` }, signal: AbortSignal.timeout(8000) });
    const t = await r.text();
    if (r.status === 404 || /PGRST205|schema cache/.test(t)) tableReady = false;
    else if (!r.ok) { console.error(`⚠️  INDETERMINATE — reading the check-ins said HTTP ${r.status}`); process.exit(2); }
    else row = JSON.parse(t)[0] || null;
  } catch (e) { console.error(`⚠️  INDETERMINATE — couldn't read the check-ins: ${e.name === "TimeoutError" ? "no answer in 8 s" : e.message}`); process.exit(2); }
}
const v = watcherRan(row, now, { tableReady });
if (v.exit === 0) console.log(`✅ ${v.line}`);
else if (v.exit === 2) console.error(`⚠️  INDETERMINATE — ${v.line}`);
else console.error(`🔴 ${v.line}. Hourly alerts have stopped: open Netlify's function log for job-watcher`);
process.exit(v.exit);
