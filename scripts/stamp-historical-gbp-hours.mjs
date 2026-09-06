#!/usr/bin/env node
/**
 * stamp-historical-gbp-hours.mjs — retire the historical hours backlog WITHOUT spending a cent.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * `backfill-gbp-hours` filtered on `{GBP Hours} = ""` and ran DAILY. A lead whose Places lookup
 * found nothing — or whose GBP genuinely publishes no hours — never got a value written, so it fell
 * back into the filter and was re-queried tomorrow. Forever.
 *
 * 1,362 leads matched, against a 32/day SearchTextRequest cap. The quota was consumed by
 * permanently-failing lookups before anything else got a single call, which is why
 * `backfill-place-ids` never once got through.
 *
 * The function is now fixed (it stamps `GBP Hours Checked` on every attempt), but at 32/day the
 * backlog would still take ~43 days to clear — and block everything else meanwhile.
 *
 * 🔑 THIS SCRIPT SPENDS NOTHING. It writes ONLY to Airtable. There is no Google API call anywhere in
 * it — that is the entire point. It marks the historical leads as "do not attempt" so the daily job
 * only enriches NEW leads from here.
 *
 * Why that is the right call: these are cold-outreach leads, hours are nice-to-have, and
 * `sales-call-queue.js` already notes the field is "usually empty — the call card says so plainly".
 *
 * 🔑 FULLY REVERSIBLE. Everything stamped carries the SAME date, so the batch is identifiable:
 *     filterByFormula: {GBP Hours Checked} = "2026-09-06"
 * Clearing that field re-queues those leads.
 *
 *   stamp-historical-gbp-hours.mjs            DRY RUN — counts, writes nothing
 *   stamp-historical-gbp-hours.mjs --commit   writes the stamp
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
for (const line of fs.readFileSync(path.resolve(HERE, "..", ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const K = process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_TOKEN;
const B = process.env.AIRTABLE_BASE_ID;
if (!K || !B) { console.error("✗ Airtable credentials unavailable"); process.exit(2); }

const COMMIT = process.argv.includes("--commit");
const TABLE = "Leads";
const STAMP = new Date().toISOString().slice(0, 10);
const AT = `https://api.airtable.com/v0/${B}/${encodeURIComponent(TABLE)}`;
const H = { Authorization: `Bearer ${K}`, "Content-Type": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Exactly the filter the fixed daily job now uses.
const FORMULA = `AND({GBP Hours} = "", {GBP Hours Checked} = "", {Business Name} != "")`;

console.log("── retire the historical GBP-hours backlog ──");
console.log(`  mode: ${COMMIT ? "COMMIT" : "DRY RUN"}   stamp date: ${STAMP}`);
console.log("  🔑 Airtable writes only — ZERO Google API calls, zero spend.\n");

// 1. Collect.
let rows = [], offset;
do {
  const url = `${AT}?pageSize=100&filterByFormula=${encodeURIComponent(FORMULA)}` +
    `&fields%5B%5D=${encodeURIComponent("Business Name")}` + (offset ? `&offset=${offset}` : "");
  const r = await fetch(url, { headers: H });
  if (!r.ok) { console.error(`✗ Airtable read ${r.status}: ${(await r.text()).slice(0, 160)}`); process.exit(1); }
  const j = await r.json();
  rows = rows.concat(j.records || []);
  offset = j.offset;
  await sleep(220);                                  // Airtable allows 5 req/sec; stay well under
} while (offset);

console.log(`  ${rows.length} lead(s) would be re-queried every day forever without this.`);
if (!rows.length) { console.log("\n✅ nothing to stamp — the backlog is already retired"); process.exit(0); }

// What it was costing, at the documented Text Search rate.
const perCall = 0.005;
console.log(`  uncapped that is ~$${(rows.length * perCall).toFixed(2)}/day = ~$${(rows.length * perCall * 30).toFixed(0)}/month`);
console.log(`  (the 32/day cap held it to ~$${(32 * perCall).toFixed(2)}/day — the cap absorbed the bug)\n`);

if (!COMMIT) {
  console.log("  DRY RUN — nothing written. Re-run with --commit to stamp them.");
  console.log(`  Reversible afterwards: clear {GBP Hours Checked} = "${STAMP}" to re-queue.`);
  process.exit(0);
}

// 2. Stamp, in batches of 10 (Airtable's PATCH limit), throttled.
let written = 0, failed = 0;
for (let i = 0; i < rows.length; i += 10) {
  const batch = rows.slice(i, i + 10).map((r) => ({ id: r.id, fields: { "GBP Hours Checked": STAMP } }));
  const r = await fetch(AT, { method: "PATCH", headers: H, body: JSON.stringify({ records: batch }) });
  if (r.ok) written += batch.length;
  else { failed += batch.length; console.log(`  🔴 batch ${i / 10 + 1}: ${r.status} ${(await r.text()).slice(0, 100)}`); }
  if ((i / 10) % 20 === 0) console.log(`  … ${written}/${rows.length}`);
  await sleep(220);
}

console.log("");
// 🔴 Verify by RE-READING, never by the write count — the same rule every other write here follows.
const check = await fetch(`${AT}?pageSize=1&filterByFormula=${encodeURIComponent(FORMULA)}&fields%5B%5D=${encodeURIComponent("Business Name")}`, { headers: H });
const remaining = ((await check.json()).records || []).length;

console.log(`  written: ${written}   failed: ${failed}`);
console.log(`  re-read: ${remaining === 0 ? "✅ zero leads still match the daily filter" : `🔴 ${remaining}+ still match — not fully stamped`}`);
if (failed || remaining) process.exit(1);
console.log(`\n✅ backlog retired. The daily job now enriches only NEW leads.`);
console.log(`   Reversible: clear {GBP Hours Checked} = "${STAMP}" to re-queue this batch.`);
