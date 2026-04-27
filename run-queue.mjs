#!/usr/bin/env node
// Master runner for the Search Queue.
//
// Loop:
//   1. Pull next Status='pending' row (highest Priority first), set to 'in-progress'
//   2. Run the scrape pipeline: step-1 → step-2 → step-2.5-audit → step-8
//      (step-1 has its own freshness check; --force is passed so the queue
//       row is the source of truth for "should we run this")
//   3. On success: read the Scrape Run record id back, link it to the queue
//      row, set Status='done' + listings/emails counts.
//   4. On failure: increment Fail Count, store error, set back to 'pending'
//      if Fail Count < MAX_FAILS, else set 'failed'.
//   5. Repeat until queue empty or --max-runs hit.
//
// Usage:
//   node run-queue.mjs                       # run forever (until queue empty)
//   node run-queue.mjs --max-runs=5          # stop after 5 successful runs
//   node run-queue.mjs --dry-run             # show next 5 picks, no execution
//   node run-queue.mjs --vertical=Plumbers   # only run rows where Vertical matches
//   node run-queue.mjs --city="Beverly Hills"
//
// Env: AIRTABLE_API_KEY, AIRTABLE_BASE_ID, plus everything step-1..step-8 need.

import "dotenv/config";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID } = process.env;
if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error("Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID");
  process.exit(1);
}

const QUEUE_TABLE = process.env.AIRTABLE_QUEUE_TABLE || "Search Queue";
const RUNS_TABLE = process.env.AIRTABLE_RUNS_TABLE || "Scrape Runs";
const MAX_FAILS = Number(process.env.MAX_FAILS || 3);

const ARGS = process.argv.slice(2);
const DRY = ARGS.includes("--dry-run");
const MAX_RUNS = Number((ARGS.find((a) => a.startsWith("--max-runs="))?.slice(11)) || 0);
const FILTER_VERT = ARGS.find((a) => a.startsWith("--vertical="))?.slice(11);
const FILTER_CITY = ARGS.find((a) => a.startsWith("--city="))?.slice(7);

const QUEUE_API = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(QUEUE_TABLE)}`;
const RUNS_API = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(RUNS_TABLE)}`;

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json", ...(opts.headers || {}) } });
  if (!res.ok) throw new Error(`${opts.method || "GET"} ${url} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function getNextPending() {
  const u = new URL(QUEUE_API);
  u.searchParams.set("pageSize", "10");
  u.searchParams.append("sort[0][field]", "Priority");
  u.searchParams.append("sort[0][direction]", "desc");
  u.searchParams.append("sort[1][field]", "Fail Count");
  u.searchParams.append("sort[1][direction]", "asc");
  // Filter: Status='pending' + optional vertical/city
  const clauses = [`{Status}="pending"`];
  if (FILTER_VERT) clauses.push(`{Vertical}="${FILTER_VERT.replace(/"/g, '\\"')}"`);
  if (FILTER_CITY) clauses.push(`{City}="${FILTER_CITY.replace(/"/g, '\\"')}"`);
  u.searchParams.set("filterByFormula", clauses.length === 1 ? clauses[0] : `AND(${clauses.join(",")})`);
  const data = await fetchJson(u.toString());
  return data.records?.[0] || null;
}

async function patchQueue(id, fields) {
  return fetchJson(`${QUEUE_API}/${id}`, { method: "PATCH", body: JSON.stringify({ fields, typecast: true }) });
}

async function findScrapeRun(query, dateRun) {
  const u = new URL(RUNS_API);
  // Match same-day Query (case-insensitive)
  const safeQ = String(query).replace(/"/g, '\\"');
  u.searchParams.set(
    "filterByFormula",
    `AND(LOWER({Query})=LOWER("${safeQ}"), IS_SAME({Date Run}, "${dateRun}", "day"))`
  );
  u.searchParams.set("maxRecords", "1");
  const data = await fetchJson(u.toString());
  return data.records?.[0] || null;
}

function runStep(label, cmd, args, env = {}) {
  return new Promise((resolve, reject) => {
    console.log(`\n[runner] ▶ ${label}: node ${args.join(" ")}`);
    const proc = spawn(cmd, args, {
      cwd: __dirname,
      stdio: ["ignore", "inherit", "inherit"],
      env: { ...process.env, ...env },
    });
    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (code === 0) {
        console.log(`[runner] ✓ ${label} done`);
        resolve();
      } else {
        reject(new Error(`${label} exited ${code}`));
      }
    });
  });
}

async function runScrapePipeline(query) {
  // step-1 (with --force so the queue is the source of truth, freshness check
  // would otherwise block re-runs that the queue specifically asked for).
  await runStep("step-1 (maps scrape)", "node", ["step-1-maps-scraper.cjs", "--force", query]);
  // step-2 (email scraping from website list)
  await runStep("step-2 (email scrape)", "node", ["step-2-email-scraper.mjs"]);
  // step-2.5 (audit findings) — safe to run even if minimal value at scrape stage
  await runStep("step-2.5 (audit)", "node", ["step-2.5-audit.mjs"]);
  // step-8 (publish to Airtable: dedupe by Place ID, link to Scrape Run)
  await runStep("step-8 (publish)", "node", ["step-8-publish-to-airtable.mjs"]);
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function processOne() {
  const row = await getNextPending();
  if (!row) {
    console.log(`[runner] no pending rows in queue.`);
    return null;
  }
  const f = row.fields || {};
  const query = f.Query;
  console.log(`\n[runner] picked: "${query}" (priority=${f.Priority}, attempts=${f["Fail Count"] || 0})`);

  if (DRY) {
    console.log(`[DRY] would run scrape pipeline for "${query}"`);
    return { dry: true, query };
  }

  // Mark in-progress
  await patchQueue(row.id, { Status: "in-progress", "Last Attempted": new Date().toISOString() });

  try {
    await runScrapePipeline(query);
    // Look up the Scrape Run we just created so we can link + record stats
    const run = await findScrapeRun(query, todayIso());
    const updateFields = { Status: "done" };
    if (run) {
      updateFields["Listings Found"] = run.fields?.["Listings Scraped"] || 0;
      updateFields["Emails Found"] = run.fields?.["Emails Found"] || 0;
    }
    await patchQueue(row.id, updateFields);
    console.log(`[runner] ✓ "${query}" complete (listings=${updateFields["Listings Found"] ?? "?"}, emails=${updateFields["Emails Found"] ?? "?"})`);
    return { success: true, query };
  } catch (err) {
    const failCount = (Number(f["Fail Count"]) || 0) + 1;
    const newStatus = failCount >= MAX_FAILS ? "failed" : "pending";
    await patchQueue(row.id, {
      Status: newStatus,
      "Fail Count": failCount,
      "Last Error": String(err.message || err).slice(0, 9000),
    });
    console.error(`[runner] ✗ "${query}" failed (#${failCount}, status=${newStatus}): ${err.message}`);
    return { success: false, query, error: err.message };
  }
}

async function main() {
  console.log(`[runner] queue=${QUEUE_TABLE}, dry=${DRY}, max_runs=${MAX_RUNS || "∞"}, max_fails=${MAX_FAILS}`);
  let processed = 0;
  while (true) {
    if (MAX_RUNS && processed >= MAX_RUNS) {
      console.log(`[runner] hit --max-runs=${MAX_RUNS}, stopping.`);
      break;
    }
    const result = await processOne();
    if (!result) break; // queue empty
    processed += 1;
    if (DRY) break; // dry mode = single peek
    // small pacing delay so we don't slam Airtable / Google
    await new Promise((r) => setTimeout(r, 4000));
  }
  console.log(`\n[runner] done — processed ${processed} run(s).`);
}

main().catch((err) => { console.error(`[runner] fatal: ${err.message || err}`); process.exit(1); });
