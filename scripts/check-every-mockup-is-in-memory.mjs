#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-every-mockup-is-in-memory.mjs
//
// 🔴 WHY (Chris, 2026-10-08): "make sure all work and mockups and steps we do … are all saved in
// memory and the system hardened so we dont lose any work and regress or forget." That day 26 of 73
// mockups were named in no memory file: approved designs a future session could not find, or know
// were built.
//
// HOLDS:
//   1. every mockup ADDED ON/AFTER 2026-10-08 (or not yet committed) is cited by at least one system
//      memory file — not merely the generated registry. Writing the system memory is part of the
//      work, not an afterthought. Older ones are grandfathered as "legacy · uncited" in the registry.
//   2. the registry lists every mockup on disk (it is rebuilt nightly just before this runs; a stale
//      one means a mockup was added and nobody rebuilt it).
//
// Point it at a copy: APPROVAL_ARCHIVE_SITE_DIR (the site) · RGA_MEMORY_DIR (the memory dir).
// exit 0 = every new mockup is remembered · 1 = one is not · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const MEM = process.env.RGA_MEMORY_DIR || "/Users/chris/.claude/projects/-Users-chris-RGA-Rocket-Growth-Agency-Website-VS-Code/memory";
const CUTOFF = "2026-10-08";
const NOT_A_CITATION = new Set(["reference_mockup_registry.md", "reference_gate_catalogue.md", "_audit.log"]);

let mockups, memFiles;
try {
  mockups = fs.readdirSync(`${SITE}/reports/mockups`).filter((f) => f.endsWith(".html"));
  memFiles = fs.readdirSync(MEM).filter((f) => f.endsWith(".md"));
} catch (e) { console.error(`⚠️  INDETERMINATE — cannot read mockups or memory (${e.message})`); process.exit(2); }
if (!mockups.length || !memFiles.length) { console.error("⚠️  INDETERMINATE — no mockups or no memory files found"); process.exit(2); }

const texts = memFiles.filter((f) => !NOT_A_CITATION.has(f)).map((f) => fs.readFileSync(`${MEM}/${f}`, "utf8"));
const registry = fs.existsSync(`${MEM}/reference_mockup_registry.md`) ? fs.readFileSync(`${MEM}/reference_mockup_registry.md`, "utf8") : "";
const added = (f) => {
  try {
    const out = execFileSync("git", ["-C", SITE, "log", "--diff-filter=A", "--follow", "--format=%ad", "--date=short", "--", `reports/mockups/${f}`], { encoding: "utf8" }).trim();
    return out ? out.split("\n").pop() : "uncommitted";
  } catch { return "uncommitted"; }
};

const fails = [];
let checked = 0;
for (const f of mockups) {
  const base = f.replace(/\.html$/, "");
  if (!registry.includes("`" + base + "`")) fails.push(`${f} is not in reference_mockup_registry.md — run node scripts/build-mockup-registry.mjs`);
  const when = added(f);
  if (when !== "uncommitted" && when < CUTOFF) continue;
  checked++;
  if (!texts.some((t) => t.includes(base))) {
    fails.push(`${f} (added ${when}) is cited by NO system memory file — write the system's memory (what was approved, what was built, the artifact id) before calling it done`);
  }
}

console.log(`  ${mockups.length} mockups · ${checked} added on/after ${CUTOFF} checked for a memory citation`);
if (fails.length) { console.error("🔴 a mockup could be forgotten:"); for (const x of fails) console.error("   · " + x); process.exit(1); }
console.log("✅ every mockup is registered, and every new one is cited by the memory of its system");
