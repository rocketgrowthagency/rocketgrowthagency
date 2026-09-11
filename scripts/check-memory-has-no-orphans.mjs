#!/usr/bin/env node
/**
 * check-memory-has-no-orphans.mjs — a memory nothing links to is a memory nobody will read.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * Only `MEMORY.md` auto-loads into context. Every other file is found by following a link from it,
 * from a hub (`MEMORY_admin`, `MEMORY_client`, …), or from the archive. A file that nothing points
 * at still exists on disk and still passes the memory auditor — and will never be opened again.
 * The lesson it holds is lost exactly when it would have prevented a repeat.
 *
 * 🔴 THIS GATE EXISTS BECAUSE MY AD-HOC PROBE WAS WRONG. 2026-09-10 I checked for orphans by
 * grepping the UNDERSCORE filename (`project_phase1_test_client`). Links are written as HYPHEN
 * slugs (`[[project-phase1-test-client]]`), so every file read as unreferenced and I reported
 * three false orphans, then "fixed" them. A mass finding means the probe is wrong —
 * → feedback_a_check_must_not_validate_itself. A real checker, run every day, beats a probe
 * improvised under time pressure.
 *
 * BOTH link forms count:
 *   [[project-billing-testability]]      ← wikilink, matches the `name:` frontmatter
 *   ](project_billing_testability.md)    ← markdown link, matches the filename
 *
 * Exit 0 = every memory is reachable · 1 = one or more orphans · 2 = could not tell.
 */
import fs from "node:fs";
import path from "node:path";

const MEM = "/Users/chris/.claude/projects/-Users-chris-RGA-Rocket-Growth-Agency-Website-VS-Code/memory";
const SABOTAGE = process.env.SABOTAGE === "1";

// Roots are reachable by definition: MEMORY.md auto-loads, the rest are its declared entry points.
const ROOTS = new Set(["MEMORY.md", "MEMORY_alerts.md", "MEMORY_archive_full.md", "MEMORY_hard_rules.md"]);

console.log("── every memory file is reachable from the index, a hub, or the archive ──");

if (!fs.existsSync(MEM)) { console.log(`  ⚠️  missing: ${MEM}`); process.exit(2); }

let files;
try {
  files = fs.readdirSync(MEM).filter((f) => f.endsWith(".md") && !f.startsWith("_"));
} catch (e) { console.log(`  ⚠️  could not list memory: ${e.message}`); process.exit(2); }

if (files.length < 50) { console.log(`  ⚠️  only ${files.length} files — the path looks wrong.`); process.exit(2); }

// Collect every link target mentioned anywhere, in either form, lowercased.
const linked = new Set();
for (const f of files) {
  let src;
  try { src = fs.readFileSync(path.join(MEM, f), "utf8"); } catch { continue; }

  for (const m of src.matchAll(/\[\[([^\]|#]+)\]\]/g)) linked.add(m[1].trim().toLowerCase());
  for (const m of src.matchAll(/\]\(([A-Za-z0-9_.\-]+\.md)\)/g)) linked.add(m[1].trim().toLowerCase());
}

if (!linked.size) { console.log("  ⚠️  found NO links at all — the probe is wrong."); process.exit(2); }

// 🔴 SABOTAGE BY ADDING AN UNLINKED FILE, not by unlinking an existing one. My first attempt
// deleted one MEMORY.md line for project_billing_testability — which is ALSO wikilinked from two
// other files, so it stayed reachable and the sabotage silently proved nothing. That is the exact
// failure this repo has hit before: a sabotage that does not actually break the property is a
// green light nobody earned. → feedback_a_check_must_not_validate_itself
if (SABOTAGE) files.push("__sabotage_orphan__.md");

// A file is reachable if EITHER its filename OR its declared `name:` slug is linked.
const orphans = [];
for (const f of files) {
  if (ROOTS.has(f)) continue;
  let src = "";
  try { src = fs.readFileSync(path.join(MEM, f), "utf8"); } catch { /* missing or unreadable — no slug */ }
  const slug = (src.match(/^name:\s*(.+)$/m) || [])[1]?.trim().toLowerCase();
  // Fall back to deriving the slug the way the convention does: underscores → hyphens.
  const derived = f.replace(/\.md$/, "").replace(/_/g, "-").toLowerCase();

  const reachable = linked.has(f.toLowerCase())
    || (slug && linked.has(slug))
    || linked.has(derived);

  if (!reachable) orphans.push({ file: f, slug: slug || "(no name: field)" });
}

console.log(`  scanned ${files.length} memory files · ${linked.size} distinct link targets`);

if (orphans.length) {
  console.log(`\n  🔴 ${orphans.length} orphaned memor${orphans.length === 1 ? "y" : "ies"} — on disk, reachable from nothing:`);
  orphans.forEach((o) => console.log(`       ${o.file.padEnd(52)} name: ${o.slug}`));
  console.log("\n     Link each from MEMORY.md, a MEMORY_* hub, or MEMORY_archive_full.md.");
  console.log("     An unreachable memory is lost exactly when it would have prevented a repeat.");
  process.exit(1);
}
console.log("\n✅ no orphans — every memory is reachable.");
process.exit(0);
