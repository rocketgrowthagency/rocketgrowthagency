#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-memory-has-no-drift.mjs — the website repo's memory-audit, run STRICT in the nightly sweep.
//
// 🔴 WHY (2026-10-08): memory-audit.mjs ran after every memory edit and caught broken [[links]],
// orphaned files and files not mirrored to git — but it always exited 0, so nothing ever failed on
// it. A memory written with bash (which bypasses the mirror hook) or a pointer lost in a compaction
// could sit unnoticed for weeks. Chris: "the system hardened so we dont lose any work."
// exit 0 = memory is linked and mirrored · 1 = drift (see memory/_audit.log) · 2 = can't run
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const script = `${SITE}/scripts/memory-audit.mjs`;
if (!fs.existsSync(script)) { console.error(`⚠️  INDETERMINATE — ${script} is missing`); process.exit(2); }
const r = spawnSync(process.execPath, [script, "--strict"], { encoding: "utf8" });
const out = `${r.stdout || ""}${r.stderr || ""}`.trim();
if (r.status === null) { console.error(`⚠️  INDETERMINATE — memory-audit did not finish (${r.error?.message || r.signal})`); process.exit(2); }
if (r.status !== 0) { console.error(`🔴 memory has drifted: ${out}`); process.exit(1); }
if (!/OK \(\d+ files mirrored/.test(out)) { console.error(`⚠️  INDETERMINATE — unexpected audit output: ${out}`); process.exit(2); }
console.log(`✅ ${out.replace(/^\[memory-audit\]\s*/, "memory ")}`);
