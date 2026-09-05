#!/usr/bin/env node
/**
 * refresh-review-metrics.mjs — daily runner for the review time series.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * Review VELOCITY is weighted above raw count (whitespark_lsrf_2026), and velocity only exists if
 * somebody observes the count on a schedule. A number fetched once is a fact; fetched daily it is a
 * trend, and the trend is what a client is actually paying to move.
 *
 * 🔴 A DROP is the finding that matters most — reviews removed, or the listing merged or suspended.
 * It exits 1 so it cannot be scrolled past.
 *
 * EXIT CODES: 0 = refreshed. 1 = a review count DROPPED. 2 = indeterminate (quota/network).
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
if (!TOKEN) { console.error("✗ QUO_WEBHOOK_TOKEN not set"); process.exit(2); }

let res;
try {
  const r = await fetch(`https://www.rocketgrowthagency.com/.netlify/functions/refresh-review-metrics?token=${encodeURIComponent(TOKEN)}`,
    { signal: AbortSignal.timeout(120000) });
  const text = await r.text();
  try { res = JSON.parse(text); }
  catch { console.error(`✗ non-JSON (HTTP ${r.status}): ${text.slice(0, 140)}`); process.exit(r.status >= 500 ? 2 : 1); }
} catch (e) {
  console.error(`✗ could not reach the refresher: ${String(e.message).slice(0, 140)}`);
  process.exit(2);
}
if (!res.ok) { console.error(`✗ ${String(res.error).slice(0, 180)}`); process.exit(res.verdict === "indeterminate" ? 2 : 1); }

console.log("── review metrics ──");
let dropped = 0, indet = 0;
for (const r of res.results || []) {
  if (r.alert) { dropped++; console.log(`  🔴 ${String(r.client).padEnd(24)} ${r.alert}`); continue; }
  if (r.indeterminate) { indet++; console.log(`  ⏳ ${String(r.client).padEnd(24)} ${String(r.error).slice(0, 90)}`); continue; }
  if (r.error) { console.log(`  ▫️  ${String(r.client).padEnd(24)} ${String(r.error).slice(0, 90)}`); continue; }
  if (r.skipped) { console.log(`  ▫️  ${String(r.client).padEnd(24)} ${r.skipped}`); continue; }
  const d = r.delta == null ? "" : r.delta > 0 ? `  +${r.delta} since ${r.since}` : "  no change";
  console.log(`  ✅ ${String(r.client).padEnd(24)} ${r.review_count} review(s), rating ${r.rating ?? "—"}${d}`);
  if (r.cache_error) console.log(`      🔴 ${r.cache_error}`);
}

console.log("");
if (dropped) { console.error(`🔴 ${dropped} client(s) LOST reviews — investigate before any client report goes out`); process.exit(1); }
if (indet && indet === (res.results || []).length) { console.error(`⚠️  all ${indet} blocked on Places quota — indeterminate, retries tomorrow`); process.exit(2); }
console.log(`✅ ${res.stored} client(s) refreshed${indet ? `, ${indet} indeterminate` : ""}`);
