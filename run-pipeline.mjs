#!/usr/bin/env node
// RGA Scraper Orchestrator
//
// Runs the full 7-step outbound video outreach pipeline in sequence:
//   step 1 (scrape)       → once
//   step 2 (email enrich) → once (operates on step 1 output)
//   steps 3-7 (video)     → N times (each step has MAX_* = 1 so loop per business)
//
// Usage:
//   node run-pipeline.mjs "Dentists in Culver City, CA"                 # default count = 10
//   node run-pipeline.mjs "Dentists in Culver City, CA" 25              # up to 25 videos
//   node run-pipeline.mjs "Dentists in Culver City, CA" 25 --skip-scrape  # reuse latest step 1 CSV
//   node run-pipeline.mjs "Dentists in Culver City, CA" 25 --dry-run    # plan only, no execution
//
// Environment overrides (optional):
//   SEARCH_QUERY              same as first CLI arg
//   TARGET_UNIQUE_PLACES      how many map listings to scrape (default 55 in step 1)
//
// Exit codes:
//   0 success (all requested videos finished)
//   1 setup/arg error
//   2 step failed mid-pipeline (partial output still on disk)

import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "output");

const rawArgs = process.argv.slice(2);
const flags = new Set(rawArgs.filter((a) => a.startsWith("--")));
const positional = rawArgs.filter((a) => !a.startsWith("--"));
const DRY_RUN = flags.has("--dry-run");
const SKIP_SCRAPE = flags.has("--skip-scrape");
const SKIP_EMAIL = flags.has("--skip-email");
const SEARCH_QUERY = (positional[0] || process.env.SEARCH_QUERY || "").trim();
const MAX_VIDEOS = Number(positional[1] || 10);

if (!SEARCH_QUERY) {
  console.error("Usage: node run-pipeline.mjs \"Search query\" [count] [--skip-scrape] [--skip-email] [--dry-run]");
  process.exit(1);
}
if (!Number.isFinite(MAX_VIDEOS) || MAX_VIDEOS <= 0) {
  console.error("Count must be a positive integer.");
  process.exit(1);
}

function log(section, ...msg) {
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  console.log(`[${stamp}] [${section}]`, ...msg);
}

function runStep(label, cmd, args, env = {}) {
  if (DRY_RUN) {
    log(label, "DRY-RUN would run:", cmd, args.join(" "));
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    log(label, "→", cmd, args.join(" "));
    const start = Date.now();
    const child = spawn(cmd, args, {
      cwd: __dirname,
      env: { ...process.env, ...env },
      stdio: "inherit"
    });
    child.on("error", (err) => reject(new Error(`${label}: ${err.message}`)));
    child.on("exit", (code) => {
      const secs = Math.round((Date.now() - start) / 10) / 100;
      if (code === 0) {
        log(label, `✓ done in ${secs}s`);
        resolve();
      } else {
        reject(new Error(`${label}: exited with code ${code} after ${secs}s`));
      }
    });
  });
}

async function latestFile(suffixPattern) {
  if (!existsSync(OUTPUT_DIR)) return null;
  const entries = await readdir(OUTPUT_DIR);
  const matches = entries
    .filter((name) => suffixPattern.test(name))
    .sort((a, b) => b.localeCompare(a));
  return matches[0] ? path.join(OUTPUT_DIR, matches[0]) : null;
}

async function countEmailRows(csvPath) {
  if (!csvPath) return 0;
  const text = await readFile(csvPath, "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return 0;
  const header = lines[0].split(",").map((s) => s.replace(/^"|"$/g, "").toLowerCase());
  const emailIdx = header.findIndex((h) => h === "email" || h === "emails");
  if (emailIdx < 0) return 0;
  let count = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const value = String(cols[emailIdx] || "").replace(/^"|"$/g, "").trim();
    if (value && /@/.test(value)) count += 1;
  }
  return count;
}

async function main() {
  log("plan", `query: "${SEARCH_QUERY}"`);
  log("plan", `max videos: ${MAX_VIDEOS}`);
  log("plan", `skip-scrape: ${SKIP_SCRAPE}, skip-email: ${SKIP_EMAIL}, dry-run: ${DRY_RUN}`);

  // Step 1 — Maps scrape
  if (!SKIP_SCRAPE) {
    await runStep("step-1-maps", "node", ["step-1-maps-scraper.cjs", SEARCH_QUERY]);
  } else {
    log("step-1-maps", "SKIP (reusing latest step 1 output)");
  }

  // Step 2 — Email enrichment
  if (!SKIP_EMAIL) {
    await runStep("step-2-email", "node", ["step-2-email-scraper.mjs"]);
  } else {
    log("step-2-email", "SKIP (reusing latest step 2 output)");
  }

  // How many step-2 rows actually have an email to target?
  const step2Csv = await latestFile(/\[step-2\]\.csv$/);
  const emailRows = await countEmailRows(step2Csv);
  const targetCount = Math.min(MAX_VIDEOS, emailRows || MAX_VIDEOS);
  log("plan", `step 2 output: ${step2Csv || "(none yet)"}`);
  log("plan", `emails found: ${emailRows}, running video pipeline for: ${targetCount}`);

  if (targetCount === 0) {
    log("plan", "No email rows to process. Stopping.");
    return;
  }

  // Steps 3–7 per business (each step is MAX_* = 1 internally).
  for (let i = 1; i <= targetCount; i++) {
    log("video-loop", `--- business ${i} of ${targetCount} ---`);
    await runStep(`step-3-record [${i}]`,  "node", ["step-3-video-recorder.mjs"]);
    await runStep(`step-4-combine [${i}]`, "node", ["step-4-combine-desktop-mobile.mjs"]);
    await runStep(`step-5-brand [${i}]`,   "node", ["step-5-branding.mjs"]);
    await runStep(`step-6-voice [${i}]`,   "node", ["step-6-voiceover.mjs"]);
    await runStep(`step-7-merge [${i}]`,   "node", ["step-7-merge-branded-audio.mjs"]);
  }

  log("done", `Pipeline complete. Final videos are in ${OUTPUT_DIR}/`);
}

main().catch((err) => {
  log("error", err.message || err);
  process.exit(2);
});
