#!/usr/bin/env node
// scripts/mark-permanent-fail.mjs
//
// Tier 1 #6 (locked 2026-05-27). When a lead has failed "landing not built"
// N times across pipeline restarts WITHOUT ever producing a Step 7 final MP4,
// mark the Airtable Leads row with Email Status='build-failed'. The
// overnight-pipeline.sh idempotency guard skips any lead in that state on
// subsequent runs.
//
// Without this, the same 3 problem leads (e.g., Long Beach Electric, Johns
// electric, Croff Electric in the 2026-05-26 Electricians run) burn ~5 min
// each every restart, retrying step-2.5/3/6 chain only to fail again at the
// landing-build step.
//
// Inputs (env):
//   AIRTABLE_API_KEY, AIRTABLE_BASE_ID — creds (from scraper repo .env)
//   MAX_BUILD_FAILS=3 (default) — fail count threshold
//   FAIL_LOGS — comma-separated list of pipeline log file paths to scan
//             (defaults to all /tmp/overnight-*.log files)
//
// Usage:
//   node scripts/mark-permanent-fail.mjs           # dry-run, report what would mark
//   node scripts/mark-permanent-fail.mjs --apply   # actually PATCH Airtable
//
// The script counts "✗ FAILED: <name> — landing not built" occurrences across
// the provided log files. Any name appearing ≥ MAX_BUILD_FAILS times AND
// without a Video URL in Airtable gets Email Status='build-failed'.

import "dotenv/config";
import fs from "node:fs";
import { glob } from "node:fs/promises";

const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID } = process.env;
if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error("Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");
const MAX_BUILD_FAILS = Number(process.env.MAX_BUILD_FAILS || 3);
const FAIL_PATTERN = /^\s*✗ FAILED:\s+(.+?)\s+—\s+landing not built\s*$/;

async function findLogFiles() {
  if (process.env.FAIL_LOGS) {
    return process.env.FAIL_LOGS.split(",").map((s) => s.trim()).filter(Boolean);
  }
  const out = [];
  try {
    for await (const f of glob("/tmp/overnight-*.log")) out.push(f);
  } catch {}
  try {
    for await (const f of glob("/tmp/overnight-pipeline-*.log")) out.push(f);
  } catch {}
  return [...new Set(out)];
}

function countFailsByName(logPaths) {
  const counts = new Map();
  for (const p of logPaths) {
    let text;
    try {
      text = fs.readFileSync(p, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      const m = line.match(FAIL_PATTERN);
      if (!m) continue;
      const name = m[1].trim();
      counts.set(name, (counts.get(name) || 0) + 1);
    }
  }
  return counts;
}

async function airtableLookup(name) {
  const escapeQ = (s) => String(s).replace(/"/g, '\\"');
  const formula = `{Business Name}="${escapeQ(name)}"`;
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Leads?pageSize=1&filterByFormula=${encodeURIComponent(formula)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
  const d = await r.json();
  if (d.error || !d.records || !d.records.length) return null;
  return d.records[0];
}

async function airtablePatch(recordId, fields) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Leads/${recordId}`;
  const r = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  return r.json();
}

async function main() {
  const logs = await findLogFiles();
  console.log(`[perma-fail] scanning ${logs.length} log files for "landing not built" failures`);
  const counts = countFailsByName(logs);
  const candidates = [...counts.entries()].filter(([, n]) => n >= MAX_BUILD_FAILS).sort((a, b) => b[1] - a[1]);
  console.log(`[perma-fail] found ${candidates.length} candidates with ≥ ${MAX_BUILD_FAILS} fails. mode=${APPLY ? "APPLY" : "DRY-RUN"}`);
  let marked = 0, skippedDeployed = 0, skippedAlready = 0, notInAirtable = 0;
  for (const [name, count] of candidates) {
    const rec = await airtableLookup(name);
    if (!rec) {
      console.log(`  ?  ${name} (${count} fails) — not in Airtable, skipping`);
      notInAirtable++;
      continue;
    }
    const f = rec.fields || {};
    if (f["Video URL"]) {
      console.log(`  ✓  ${name} (${count} fails) — already deployed, no action`);
      skippedDeployed++;
      continue;
    }
    if (f["Email Status"] === "build-failed") {
      console.log(`  =  ${name} (${count} fails) — already marked build-failed`);
      skippedAlready++;
      continue;
    }
    console.log(`  ${APPLY ? "MARK" : "WOULD-MARK"}  ${name} (${count} fails)`);
    if (APPLY) {
      const result = await airtablePatch(rec.id, { "Email Status": "build-failed", Status: "dead" });
      if (result.error) {
        console.warn(`    PATCH failed: ${JSON.stringify(result.error)}`);
      } else {
        marked++;
      }
    }
  }
  console.log("");
  console.log(`[perma-fail] candidates: ${candidates.length}`);
  console.log(`[perma-fail] ${APPLY ? "marked" : "would mark"}: ${APPLY ? marked : candidates.length - skippedDeployed - skippedAlready - notInAirtable}`);
  console.log(`[perma-fail] skipped (already deployed): ${skippedDeployed}`);
  console.log(`[perma-fail] skipped (already build-failed): ${skippedAlready}`);
  console.log(`[perma-fail] not in Airtable: ${notInAirtable}`);
  if (!APPLY) console.log(`[perma-fail] dry-run only. add --apply to PATCH Airtable.`);
}

main().catch((err) => {
  console.error("[perma-fail] fatal:", err.message || err);
  process.exit(1);
});
