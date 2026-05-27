#!/usr/bin/env node
// scripts/cleanup-after-deploy.mjs
//
// Tier 1 #4 (locked 2026-05-26 — empirical baseline 8.5hr/48-lead run).
// After a lead has been successfully deployed (Step 7 final MP4 exists +
// landing page exists), the intermediate artifacts under Step 3/4/5/6/6b
// for that lead become dead weight: ~40 MB/lead, never re-read.
//
// This script enumerates every Step 7 (Final Merge MP4) run directory, and
// for each <slug> with a final MP4 + a landing-pages/v/<slug>/index.html,
// it deletes the matching <slug>-prefixed contents under:
//   - output/Step 3 (Video Recorder - Raw WebM)/<run>/
//   - output/Step 4 (Combine Desktop+Mobile)/<run>/
//   - output/Step 5 (Branding Overlay)/<run>/
//   - output/Step 6 (Voiceover MP3)/<run>/ (per-segment subdir + the concatenated MP3)
//   - output/Step 6b (Subtitles)/<run>/
//
// Safe-by-default: dry-run unless `--apply` is passed.
//
// Usage:
//   node scripts/cleanup-after-deploy.mjs            # dry-run, report what would delete
//   node scripts/cleanup-after-deploy.mjs --apply    # actually delete
//   node scripts/cleanup-after-deploy.mjs --apply --since=7  # only clean leads whose Step 7 MP4 is >7 days old
//
// Never touches:
//   - Step 7 (Final Merge MP4) — the shipped artifact
//   - output/landing-pages/v/<slug>/ — the live landing page
//   - output/Step 2/ — the master CSVs (small, used for regression/replay)
//   - output/Step 2.5 (Audit)/ — audit findings (used for ongoing diagnostics)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "output");

const APPLY = process.argv.includes("--apply");
const sinceArg = process.argv.find((a) => a.startsWith("--since="));
const SINCE_DAYS = sinceArg ? Number(sinceArg.slice(8)) : 0;

const STEP7_DIR = path.join(OUTPUT, "Step 7 (Final Merge MP4)");
const LANDING_DIR = path.join(OUTPUT, "landing-pages", "v");
const PRUNABLE = [
  "Step 3 (Video Recorder - Raw WebM)",
  "Step 4 (Combine Desktop+Mobile)",
  "Step 5 (Branding Overlay)",
  "Step 6 (Voiceover MP3)",
  "Step 6b (Subtitles)",
];

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function dirSize(p) {
  if (!fs.existsSync(p)) return 0;
  let total = 0;
  const stack = [p];
  while (stack.length) {
    const cur = stack.pop();
    const st = fs.statSync(cur);
    if (st.isDirectory()) {
      for (const child of fs.readdirSync(cur)) stack.push(path.join(cur, child));
    } else {
      total += st.size;
    }
  }
  return total;
}

function parseSlugFromFilename(name) {
  const m = name.replace(/\.(mp4|webm|mp3)$/i, "").match(/^\d+_(.+?)(?:_desktop_maps|_desktop_website|_mobile|_combined|_segments)?$/);
  return m ? m[1] : name.replace(/\.(mp4|webm|mp3)$/i, "");
}

function landingExistsForSlug(slug) {
  return fs.existsSync(path.join(LANDING_DIR, slug, "index.html"));
}

const stats = {
  candidates: 0,
  deleted: 0,
  bytesFreed: 0,
  skippedNoLanding: 0,
  skippedTooRecent: 0,
};

if (!fs.existsSync(STEP7_DIR)) {
  console.log(`[cleanup] no Step 7 dir at ${STEP7_DIR}; nothing to do`);
  process.exit(0);
}

const cutoffMs = SINCE_DAYS ? Date.now() - SINCE_DAYS * 24 * 60 * 60 * 1000 : Infinity;

const runs = fs.readdirSync(STEP7_DIR).filter((d) => {
  try { return fs.statSync(path.join(STEP7_DIR, d)).isDirectory(); } catch { return false; }
});

console.log(`[cleanup] scanning ${runs.length} Step 7 run directories. mode=${APPLY ? "APPLY" : "DRY-RUN"} since=${SINCE_DAYS || "any age"}`);

for (const runDir of runs) {
  const step7RunPath = path.join(STEP7_DIR, runDir);
  const finals = fs.readdirSync(step7RunPath).filter((f) => f.toLowerCase().endsWith(".mp4"));
  for (const final of finals) {
    const slug = parseSlugFromFilename(final);
    const finalMp4 = path.join(step7RunPath, final);
    let mtimeMs = 0;
    try { mtimeMs = fs.statSync(finalMp4).mtimeMs; } catch { continue; }

    if (SINCE_DAYS && mtimeMs > cutoffMs) {
      stats.skippedTooRecent++;
      continue;
    }
    if (!landingExistsForSlug(slug)) {
      stats.skippedNoLanding++;
      continue;
    }

    stats.candidates++;

    for (const prunableStep of PRUNABLE) {
      const candidatePath = path.join(OUTPUT, prunableStep, runDir);
      if (!fs.existsSync(candidatePath)) continue;
      // For Step 3/4/5/6b, delete files matching the slug; for Step 6, also the per-slug _segments subdir
      const entries = fs.readdirSync(candidatePath);
      for (const entry of entries) {
        const looksLikeSlugMatch = entry.includes(`_${slug}`) || entry === slug;
        if (!looksLikeSlugMatch) continue;
        const full = path.join(candidatePath, entry);
        const size = dirSize(full);
        if (APPLY) {
          fs.rmSync(full, { recursive: true, force: true });
        }
        stats.bytesFreed += size;
        stats.deleted++;
        console.log(`  ${APPLY ? "DEL" : "WOULD-DEL"}  ${path.relative(ROOT, full)}  (${fmtBytes(size)})`);
      }
    }
  }
}

console.log("");
console.log(`[cleanup] candidates: ${stats.candidates}`);
console.log(`[cleanup] entries ${APPLY ? "deleted" : "to delete"}: ${stats.deleted}`);
console.log(`[cleanup] bytes ${APPLY ? "freed" : "to free"}: ${fmtBytes(stats.bytesFreed)}`);
console.log(`[cleanup] skipped (no landing): ${stats.skippedNoLanding}`);
if (SINCE_DAYS) console.log(`[cleanup] skipped (too recent < ${SINCE_DAYS}d): ${stats.skippedTooRecent}`);
if (!APPLY) console.log(`[cleanup] dry-run only. add --apply to delete.`);
