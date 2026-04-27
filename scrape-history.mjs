#!/usr/bin/env node
// Quick reporter over the Airtable "Scrape Runs" table.
//
// Usage:
//   node scrape-history.mjs                       # all runs, newest first
//   node scrape-history.mjs --stale               # only runs >= FRESH_DAYS old
//   node scrape-history.mjs --due-soon            # within 30 days of stale
//   node scrape-history.mjs --vertical=plumbers   # filter by inferred vertical
//   node scrape-history.mjs --market="Culver City"
//   node scrape-history.mjs --json                # raw JSON output (for piping)
//
// Env: AIRTABLE_API_KEY, AIRTABLE_BASE_ID, FRESH_DAYS (default 180).

import "dotenv/config";

const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID } = process.env;
const RUNS_TABLE = process.env.AIRTABLE_RUNS_TABLE || "Scrape Runs";
const FRESH_DAYS = Number(process.env.FRESH_DAYS || 180);

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error("Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID in .env");
  process.exit(1);
}

const ARGS = process.argv.slice(2);
const STALE_ONLY = ARGS.includes("--stale");
const DUE_SOON = ARGS.includes("--due-soon");
const JSON_OUT = ARGS.includes("--json");
const VERTICAL = ARGS.find((a) => a.startsWith("--vertical="))?.slice(11);
const MARKET = ARGS.find((a) => a.startsWith("--market="))?.slice(9);

const RUNS_API = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(RUNS_TABLE)}`;

async function loadAllRuns() {
  const all = [];
  let offset = null;
  do {
    const u = new URL(RUNS_API);
    u.searchParams.set("pageSize", "100");
    u.searchParams.append("sort[0][field]", "Date Run");
    u.searchParams.append("sort[0][direction]", "desc");
    if (offset) u.searchParams.set("offset", offset);
    const res = await fetch(u, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
    if (!res.ok) {
      console.error(`Airtable fetch failed: ${res.status} ${await res.text()}`);
      process.exit(1);
    }
    const data = await res.json();
    all.push(...(data.records || []));
    offset = data.offset;
  } while (offset);
  return all;
}

function daysSince(dateStr) {
  if (!dateStr) return Infinity;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function pad(s, n) { s = String(s ?? ""); return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length); }

function main() {
  loadAllRuns().then((runs) => {
    let rows = runs.map((r) => {
      const f = r.fields || {};
      return {
        id: r.id,
        query: f.Query || "",
        vertical: f.Vertical || "",
        market: f.Market || "",
        dateRun: f["Date Run"] || "",
        listings: f["Listings Scraped"] || 0,
        emails: f["Emails Found"] || 0,
        published: f["Published to Airtable"] || 0,
        status: f.Status || "",
        daysAgo: daysSince(f["Date Run"]),
      };
    });

    // De-duplicate by query — keep only the newest run per Query (already sorted desc)
    const seen = new Set();
    rows = rows.filter((r) => {
      const k = (r.query || "").toLowerCase().trim();
      if (!k) return true;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    if (VERTICAL) rows = rows.filter((r) => (r.vertical || "").toLowerCase().includes(VERTICAL.toLowerCase()));
    if (MARKET) rows = rows.filter((r) => (r.market || "").toLowerCase().includes(MARKET.toLowerCase()));
    if (STALE_ONLY) rows = rows.filter((r) => r.daysAgo >= FRESH_DAYS);
    if (DUE_SOON) rows = rows.filter((r) => r.daysAgo >= FRESH_DAYS - 30 && r.daysAgo < FRESH_DAYS);

    if (JSON_OUT) {
      console.log(JSON.stringify(rows, null, 2));
      return;
    }

    console.log(`\nFound ${rows.length} unique queries (FRESH_DAYS=${FRESH_DAYS})\n`);
    console.log(pad("Query", 50) + pad("Last Run", 12) + pad("Days Ago", 10) + pad("Listings", 10) + pad("Emails", 8) + "Stale?");
    console.log("-".repeat(100));
    for (const r of rows) {
      const stale = r.daysAgo >= FRESH_DAYS ? "YES" : (r.daysAgo >= FRESH_DAYS - 30 ? "soon" : "");
      console.log(
        pad(r.query, 50)
        + pad(r.dateRun, 12)
        + pad(String(r.daysAgo), 10)
        + pad(String(r.listings), 10)
        + pad(String(r.emails), 8)
        + stale
      );
    }
    console.log("");
    const stale = rows.filter((r) => r.daysAgo >= FRESH_DAYS).length;
    const soon = rows.filter((r) => r.daysAgo >= FRESH_DAYS - 30 && r.daysAgo < FRESH_DAYS).length;
    console.log(`Summary: ${rows.length} total, ${stale} stale (re-run now), ${soon} due soon (next 30 days)\n`);
  }).catch((err) => { console.error(err.message || err); process.exit(1); });
}

main();
