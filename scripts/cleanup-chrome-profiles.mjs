#!/usr/bin/env node
// scripts/cleanup-chrome-profiles.mjs
//
// Tier 1 #5 (locked 2026-05-26). The 5 puppeteer Chrome profiles under
// output/chrome-profile-*/ accumulate ~3.2 GB of cache that never needs to
// persist across runs. Cookies, localStorage, and IndexedDB DO persist (login
// state for Google Maps consent flows, etc.) and must NOT be touched.
//
// Per-profile, this script wipes:
//   - Default/Cache/
//   - Default/Code Cache/
//   - Default/GPUCache/
//   - Default/Service Worker/CacheStorage/
//   - Default/Service Worker/ScriptCache/
//   - Default/blob_storage/
//   - Default/Application Cache/
//   - GrShaderCache/
//   - ShaderCache/
//   - GraphiteDawnCache/
//   - component_crx_cache/
//   - extensions_crx_cache/
//   - Crashpad/completed/
//   - Crashpad/pending/
//
// Preserves:
//   - Cookies, Cookies-journal
//   - Local Storage/
//   - Session Storage/
//   - IndexedDB/
//   - Preferences, Local State
//   - History (small, useful for diagnostics)
//
// Usage:
//   node scripts/cleanup-chrome-profiles.mjs              # dry-run
//   node scripts/cleanup-chrome-profiles.mjs --apply      # actually wipe
//
// Safe to run while a puppeteer step is active — only touches dirs that
// Chrome itself regenerates on demand.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "output");

const APPLY = process.argv.includes("--apply");

const WIPABLE_REL_PATHS = [
  "Default/Cache",
  "Default/Code Cache",
  "Default/GPUCache",
  "Default/Service Worker/CacheStorage",
  "Default/Service Worker/ScriptCache",
  "Default/blob_storage",
  "Default/Application Cache",
  "GrShaderCache",
  "ShaderCache",
  "GraphiteDawnCache",
  "component_crx_cache",
  "extensions_crx_cache",
  "Crashpad/completed",
  "Crashpad/pending",
];

function dirSize(p) {
  if (!fs.existsSync(p)) return 0;
  let total = 0;
  const stack = [p];
  while (stack.length) {
    const cur = stack.pop();
    let st;
    try { st = fs.statSync(cur); } catch { continue; }
    if (st.isDirectory()) {
      let kids = [];
      try { kids = fs.readdirSync(cur); } catch {}
      for (const child of kids) stack.push(path.join(cur, child));
    } else {
      total += st.size;
    }
  }
  return total;
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

const profileDirs = fs.readdirSync(OUTPUT)
  .filter((d) => d.startsWith("chrome-profile"))
  .map((d) => path.join(OUTPUT, d))
  .filter((p) => {
    try { return fs.statSync(p).isDirectory(); } catch { return false; }
  });

if (!profileDirs.length) {
  console.log("[chrome-cleanup] no chrome-profile-* dirs found in output/");
  process.exit(0);
}

console.log(`[chrome-cleanup] found ${profileDirs.length} profile dirs. mode=${APPLY ? "APPLY" : "DRY-RUN"}`);

let totalFreed = 0;
let totalDeleted = 0;

for (const profile of profileDirs) {
  const profileName = path.basename(profile);
  let profileFreed = 0;
  for (const rel of WIPABLE_REL_PATHS) {
    const target = path.join(profile, rel);
    if (!fs.existsSync(target)) continue;
    const sz = dirSize(target);
    if (sz === 0) continue;
    if (APPLY) {
      try { fs.rmSync(target, { recursive: true, force: true }); } catch (err) {
        console.warn(`  ! could not wipe ${rel}: ${err.message}`);
        continue;
      }
    }
    profileFreed += sz;
    totalFreed += sz;
    totalDeleted++;
    console.log(`  ${APPLY ? "WIPE" : "WOULD-WIPE"}  ${profileName}/${rel}  (${fmtBytes(sz)})`);
  }
  if (profileFreed > 0) {
    console.log(`  → ${profileName}: ${APPLY ? "freed" : "would free"} ${fmtBytes(profileFreed)}`);
  }
}

console.log("");
console.log(`[chrome-cleanup] dirs ${APPLY ? "wiped" : "to wipe"}: ${totalDeleted}`);
console.log(`[chrome-cleanup] total ${APPLY ? "freed" : "to free"}: ${fmtBytes(totalFreed)}`);
if (!APPLY) console.log(`[chrome-cleanup] dry-run only. add --apply to wipe.`);
