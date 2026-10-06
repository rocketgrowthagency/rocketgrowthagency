#!/usr/bin/env node
/**
 * check-setup-step-count-agrees.mjs — the client's setup journey is N steps, and both portals say N.
 *
 * ─── WHY (2026-09-16) ────────────────────────────────────────────────────────────────────────────
 * "Step 3 of 4" renders in the CLIENT's portal and, word for word, in the ADMIN's client detail —
 * Chris's standing rule is that admin must always match what the client sees. The number lived as a
 * literal in sixteen places across the two files: `total: 4` on seven stage entries, "Step N of 4"
 * inside seven descriptions, the heading in each portal, and the WORD "Four" in the setup header.
 *
 * The admin's kickoff card had exactly this shape and drifted the moment a question was added,
 * rendering "Four things to ask" directly above "1 of 5 captured".
 * → feedback_a_hardcoded_count_is_a_skipped_query · project_admin_portal_data_boundary
 *
 * ─── WHAT IT ASSERTS ─────────────────────────────────────────────────────────────────────────────
 *   1. Each portal declares SETUP_STEP_COUNT exactly once.
 *   2. The two declarations agree.
 *   3. Neither file contains a spelled-out "Step N of M" or a "total: <number>" literal — the number
 *      must come from the constant, or it will drift again.
 *
 * Exit 0 = both portals agree · 1 = drifted · 2 = could not tell.
 */
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FILES = ["portal/portal.js", "admin/admin.js"];

const src = {};
for (const f of FILES) {
  try { src[f] = fs.readFileSync(path.join(SITE, f), "utf8"); }
  catch (e) { console.error(`[steps] INDETERMINATE — cannot read ${f}: ${e.message}`); process.exit(2); }
}

const fail = [];
console.log("── both portals agree on the setup step count ──");

const counts = {};
for (const f of FILES) {
  const decls = [...src[f].matchAll(/const SETUP_STEP_COUNT\s*=\s*(\d+)/g)].map((m) => Number(m[1]));
  if (decls.length === 0) { fail.push(`${f} does not declare SETUP_STEP_COUNT — the number is a literal again`); continue; }
  if (decls.length > 1) fail.push(`${f} declares SETUP_STEP_COUNT ${decls.length}×`);
  counts[f] = decls[0];
}
const vals = [...new Set(Object.values(counts))];
if (vals.length > 1) {
  fail.push(`the two portals disagree: ${Object.entries(counts).map(([f, n]) => `${f}=${n}`).join(", ")} — the client and admin would show different step counts for the same client`);
}

// 3 ─ no literal spelled the long way
for (const f of FILES) {
  // strip comments: this gate's own explanation names the thing it forbids
  const code = src[f].replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const [rx, what] of [
    [/Step \$\{[^}]+\} of \d+/g, "an interpolated step number against a literal total"],
    [/Step \d+ of \d+/g, "a fully literal \"Step N of M\""],
    [/total:\s*\d+/g, "a literal `total:` on a stage entry"],
  ]) {
    const hits = [...code.matchAll(rx)].map((m) => m[0]);
    if (hits.length) fail.push(`${f} contains ${what}: ${[...new Set(hits)].slice(0, 3).join(", ")}`);
  }
}

console.log(`  ${FILES.map((f) => `${f.split("/").pop()}=${counts[f] ?? "?"}`).join(" · ")}`);

if (fail.length) {
  console.error(`\n✗ the setup step count drifted — ${fail.length} problem(s):`);
  for (const f of fail) console.error(`    ${f}`);
  console.error("\n  The client and the admin render this sentence for the same client. They must agree.");
  process.exit(1);
}
console.log("  ✅ one constant per portal, both agree, no literals left");
process.exit(0);
