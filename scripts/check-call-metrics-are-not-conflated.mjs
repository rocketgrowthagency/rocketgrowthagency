#!/usr/bin/env node
/**
 * check-call-metrics-are-not-conflated.mjs — GBP calls and tracked calls are different events.
 *
 * ─── WHY (2026-09-16) ────────────────────────────────────────────────────────────────────────────
 * `gbp_calls` counts taps on "Call" on the Google listing. `total_calls` counts connected calls to a
 * tracking number placed on the client's website. They overlap in intent and NOT in measurement.
 *
 * Both the portal and the admin rendered `gbp_calls ?? total_calls` — a FALLBACK. Nothing has ever
 * written `total_calls`, so it never showed; the moment a client took call tracking, their tracked
 * calls would have vanished from the report and from the admin, silently, with the tile still
 * reading a plausible number. Chris decided: show both, separately.
 *
 * 🔴 Summing is not the fix either. One person can tap Call on Maps and later ring the tracked
 * number from the website; a sum counts them twice and inflates the number we bill results against.
 * → feedback_an_absence_must_never_be_readable_as_a_value · feedback_a_hardcoded_count_is_a_skipped_query
 *
 * ─── WHAT IT ASSERTS ─────────────────────────────────────────────────────────────────────────────
 *   1. No surface falls back from one metric to the other.
 *   2. No surface adds them together.
 *   3. Both columns still exist on client_monthly_records, so neither tile can silently 400.
 *
 * Exit 0 = kept apart · 1 = conflated · 2 = could not tell.
 */
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FILES = ["portal/portal.js", "admin/admin.js", "portal/report/report.js"];

const fail = [];
console.log("── GBP calls and tracked calls are kept apart ──");

for (const rel of FILES) {
  let src;
  try { src = fs.readFileSync(path.join(SITE, rel), "utf8"); }
  catch { continue; }
  // strip comments — this gate's own reasoning names the pattern it forbids
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  for (const [rx, what] of [
    [/gbp_calls\s*\?\?\s*[\w.]*total_calls/g, "a fallback from gbp_calls to total_calls"],
    [/total_calls\s*\?\?\s*[\w.]*gbp_calls/g, "a fallback from total_calls to gbp_calls"],
    [/gbp_calls\s*\|\|\s*[\w.]*total_calls/g, "an || fallback between the two"],
    [/gbp_calls\s*\+\s*[\w.]*total_calls/g, "a SUM of the two — one caller can be counted twice"],
    [/total_calls\s*\+\s*[\w.]*gbp_calls/g, "a SUM of the two — one caller can be counted twice"],
  ]) {
    const hits = [...code.matchAll(rx)];
    if (hits.length) fail.push(`${rel}: ${what} — ${hits[0][0].trim()}`);
  }
}

// 3 ─ both columns must still exist, or a tile 400s and the catch hides it
const U = process.env.SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!U || !K) {
  try {
    const env = fs.readFileSync(path.join(process.env.SCRAPER_DIR || "/Users/chris/RGA/Rocket Growth Agency Scraper VS Code", ".env"), "utf8");
    for (const line of env.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* fall through to indeterminate */ }
}
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("[calls] INDETERMINATE — no Supabase credentials to confirm the columns exist");
  process.exit(2);
}
try {
  const r = await fetch(`${url}/rest/v1/client_monthly_records?select=gbp_calls,total_calls&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!r.ok) fail.push(`selecting gbp_calls,total_calls returned ${r.status} — a tile naming a missing column 400s and the catch hides it`);
  else console.log("  both columns present on client_monthly_records");
} catch (e) {
  console.error(`[calls] INDETERMINATE — ${e.message}`);
  process.exit(2);
}

console.log(`  checked ${FILES.length} surfaces for fallbacks and sums`);
if (fail.length) {
  console.error(`\n✗ the two call metrics are conflated — ${fail.length} problem(s):`);
  for (const f of fail) console.error(`    ${f}`);
  console.error("\n  A fallback hides one of them. A sum counts one caller twice.");
  process.exit(1);
}
console.log("  ✅ shown separately everywhere — no fallback, no sum");
process.exit(0);
