#!/usr/bin/env node
/**
 * retry-place-id-backfill.mjs — keep resolving google_place_id until every client has one.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * google_place_id is the STRONGEST duplicate-detection key (project_client_duplicate_detection).
 * On 2026-09-05 the first backfill resolved RGA authoritatively via GBP OAuth but hit a Places API
 * daily-quota 429 for the archived client. That is a TRANSIENT failure with a known expiry — the
 * quota resets daily — so leaving it unresolved and hoping someone remembers is the wrong shape.
 *
 * 🔑 Self-healing: this runs daily and simply retries. The backfill function only touches clients
 * whose place id is still null, so a completed client costs nothing and it converges on its own.
 *
 * 🔴 EXIT CODES (feedback_exit_code_semantics_for_gates):
 *   0  every client has a place id, OR progress was made this run
 *   2  INDETERMINATE — quota/network stopped us telling. NOT a failure; retry tomorrow.
 *   1  a real fault: the endpoint is broken, or a resolution collided with an existing place id
 *      (which means two client rows are the same physical business — a genuine finding).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
for (const line of fs.readFileSync(path.resolve(HERE, "..", ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const TOKEN = process.env.QUO_WEBHOOK_TOKEN;
if (!TOKEN) { console.error("✗ QUO_WEBHOOK_TOKEN not set — cannot call the backfill"); process.exit(2); }

const url = `https://www.rocketgrowthagency.com/.netlify/functions/backfill-place-ids?token=${encodeURIComponent(TOKEN)}`;

let res;
try {
  const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
  const text = await r.text();
  // 🔴 Parse defensively. A Netlify error page is HTML, and JSON.parse would throw a SyntaxError that
  // hides the real status — the "a failure reason can be a mask" pattern.
  try { res = JSON.parse(text); }
  catch {
    console.error(`✗ backfill returned non-JSON (HTTP ${r.status}): ${text.slice(0, 140)}`);
    process.exit(r.status >= 500 ? 2 : 1);
  }
} catch (e) {
  console.error(`✗ could not reach the backfill: ${String(e.message).slice(0, 140)}`);
  process.exit(2);
}

if (!res.ok) { console.error(`✗ backfill error: ${String(res.error).slice(0, 180)}`); process.exit(1); }

console.log("── google_place_id backfill ──");
console.log(`  clients missing a place id: ${res.checked}`);
if (!res.checked) {
  console.log("\n✅ every client has a place id — the strongest dedupe key is fully populated");
  process.exit(0);
}

let quotaBlocked = 0, realFault = 0;
for (const r of res.results || []) {
  if (r.written) console.log(`  ✅ ${String(r.client).padEnd(24)} ${r.place_id}  (${r.confidence})`);
  else {
    const reason = String(r.reason || "unknown");
    // 429/quota/5xx are indeterminate, not findings — do not report a business as unresolvable
    // when we simply could not ask (feedback_indeterminate_is_not_a_finding).
    if (/429|quota|rate limit|50\d\b/i.test(reason)) {
      quotaBlocked++;
      // 🔑 Google Places quotas reset at MIDNIGHT PACIFIC, not UTC. Saying "tomorrow" at 18:00 PT is
      // misleading — it is hours away, not a day. Say when, so nobody re-runs this pointlessly or
      // concludes it is broken because a new UTC day did not clear it.
      const pt = new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit", hour12: false });
      const hrs = (24 - Number(pt.split(":")[0])) % 24 || 24;
      console.log(`  ⏳ ${String(r.client).padEnd(24)} SearchText quota exhausted — resets in ~${hrs}h (midnight Pacific; now ${pt} PT)`);
    }
    else if (/DUPLICATE FOUND/i.test(reason)) { realFault++; console.log(`  🔴 ${String(r.client).padEnd(24)} ${reason}`); }
    else console.log(`  ▫️  ${String(r.client).padEnd(24)} ${reason.slice(0, 100)}`);
  }
}

console.log("");
if (realFault) { console.error(`🔴 ${realFault} client(s) collided on place id — two rows are the same business`); process.exit(1); }
if (res.resolved) { console.log(`✅ resolved ${res.resolved} this run; ${res.skipped} still open`); process.exit(0); }
if (quotaBlocked) {
  console.error(`⚠️  ${quotaBlocked} blocked on the Places SearchText daily quota — INDETERMINATE, not a fault.`);
  console.error(`   Places DETAILS is a SEPARATE quota and still works — which is why review metrics`);
  console.error(`   succeed while this does not. Without that distinction the two look contradictory.`);
  console.error(`   Resets at midnight PACIFIC; the daily run picks it up on its own.`);
  process.exit(2);
}
console.log(`▫️  ${res.skipped} unresolved for non-transient reasons — see above; these need a manual place id or a GBP connection`);
process.exit(0);
