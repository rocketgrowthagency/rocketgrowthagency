#!/usr/bin/env node
/**
 * refresh-pagespeed.mjs — trigger the PageSpeed background function and VERIFY BY SIDE EFFECT.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 🔴 A Netlify background function returns 202 BEFORE the handler runs. A bad token, a crash, a
 * missing env var — all still return 202. On 2026-09-06 this exact function returned 202 and wrote
 * nothing for three consecutive attempts, with no error anywhere.
 *
 * 🔑 So the status code is checked for "was it accepted", and NOTHING ELSE. Success means a NEW
 * snapshot appeared in client_state_snapshots. Verify by side effect or do not claim success.
 *
 * 🔴 Invoked by POST BODY, not query string — a background invocation does not reliably surface
 * queryStringParameters, which is what silently broke it.
 *
 * EXIT CODES: 0 = a new snapshot landed. 2 = accepted but nothing appeared in time (INDETERMINATE —
 * Lighthouse is genuinely slow and variable, so this is not automatically a fault). 1 = rejected.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
for (const line of fs.readFileSync(path.resolve(HERE, "..", ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { QUO_WEBHOOK_TOKEN: TOKEN, SUPABASE_URL: U, SUPABASE_SERVICE_ROLE_KEY: K } = process.env;
if (!TOKEN || !U || !K) { console.error("✗ credentials unavailable"); process.exit(2); }
const h = { apikey: K, Authorization: `Bearer ${K}` };

const mark = new Date().toISOString().slice(0, 19);
let accepted = false;
try {
  const r = await fetch("https://www.rocketgrowthagency.com/.netlify/functions/refresh-pagespeed-background", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: TOKEN }), signal: AbortSignal.timeout(40000),
  });
  accepted = r.status === 202 || r.ok;
  if (!accepted) { console.error(`✗ rejected: HTTP ${r.status}`); process.exit(1); }
} catch (e) {
  console.error(`✗ could not reach it: ${String(e.message).slice(0, 120)}`);
  process.exit(2);
}

console.log("── pagespeed refresh ──");
console.log("  accepted (202). 🔑 That proves nothing — waiting for a snapshot to appear.");

for (let i = 1; i <= 8; i++) {
  await new Promise((r) => setTimeout(r, 20000));
  const rows = await (await fetch(
    `${U}/rest/v1/client_state_snapshots?surface=eq.pagespeed&captured_at=gt.${mark}` +
    `&order=captured_at.desc&limit=5&select=captured_at,source,payload,client_id`, { headers: h })).json();
  if (Array.isArray(rows) && rows.length) {
    console.log(`\n  ✅ ${rows.length} snapshot(s) written:`);
    for (const s of rows) {
      const p = s.payload || {};
      console.log(`     perf=${p.performance} seo=${p.seo} lcp=${p.lcp_ms}ms cls=${p.cls} · via ${s.source}`);
    }
    // 🔑 Lighthouse scores swing widely run to run (67→87 observed on ONE site in ten minutes).
    // Say so, so nobody reports a single number to a client as if it were precise.
    console.log("\n  ⚠️  Lighthouse is variable run-to-run — treat one score as a range, not a reading.");
    process.exit(0);
  }
  console.log(`  t+${i * 20}s — nothing yet`);
}

console.error("\n⚠️  accepted but no snapshot in 160s — INDETERMINATE.");
console.error("   Lighthouse is genuinely slow and variable; this is not automatically a fault.");
console.error("   🔴 But a background function that reports nothing has no other channel — if this");
console.error("   persists, check the Netlify function log directly. 202 will never tell you.");
process.exit(2);
