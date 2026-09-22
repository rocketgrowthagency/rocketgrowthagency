#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-a-truncated-scan-is-not-a-measurement.mjs
//
// 🔴 WHY THIS EXISTS (audit, 2026-09-22). `m1.audit.grid_baseline` had NO executor, so the product
// answered it with a terminal command: "open the scraper repo terminal, run grid-scan.mjs, wait
// ~1 hour (81 points)". A script run by hand can be interrupted, and the partial persists as its
// own session. RGA's history holds two:
//
//     09-15  81 pts  grid_scan   complete
//     09-12  62 pts  grid_scan   TRUNCATED   <- someone's terminal, stopped at 62 of 81
//     09-12   5 pts  grid_scan   TRUNCATED   <- and again
//     09-11  25 pts  geo-grid    complete    <- the automated 5x5 path
//
// Nothing INSIDE a truncated session reveals it: indices run 0..61 contiguously and every field is
// well-formed. And `m2.snap.rank_tracker` takes the newest session — on 09-12 that was the FIVE
// point run. Grid points are geographic and scanned in order, so a scan that stops early measures
// one REGION; comparing its average with a full scan reports movement that never happened.
//
// 🔑 AND COMPLETENESS IS PER SOURCE. Two implementations write to this table at different grid
// sizes (geo-grid 5x5=25, grid_scan 9x9=81) and both are complete at their own size. The first
// version of the fix took the largest session of ANY source as the expected size, which branded
// the complete 25-point automated scan "truncated". A complete scan mislabelled as partial is the
// same defect pointing the other way, and it reads just as plausibly.
//
// exit 0 = held · exit 1 = a regression · exit 2 = cannot tell
// → feedback_an_absence_must_never_be_readable_as_a_value · feedback_no_manual_step_recommendations
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FLOW = join(SITE, "netlify/functions/flow-execute.js");
const PLAYBOOKS = join(SITE, "data/playbooks/playbooks.json");

if (!existsSync(FLOW) || !existsSync(PLAYBOOKS)) {
  console.error("⚠️  INDETERMINATE — flow-execute.js or playbooks.json not found; cannot judge.");
  process.exit(2);
}

// Comments are stripped before every assertion: a gate that greps raw source matches the prose
// explaining the rule instead of the rule. → feedback_dead_check_selector_gap
const raw = readFileSync(FLOW, "utf8");
const src = raw.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const problems = [];

// ── 1. BOTH grid steps must RUN in the product, not hand back a terminal command.
//    🔑 The monthly re-run is included deliberately. Fixing only the month-1 baseline would leave
//    the MONTHLY number — the one a client's month-2+ report is measured against — still coming
//    from a script anyone could interrupt. → feedback_fix_the_class_not_the_instance
const GRID_STEPS = ["m1.audit.grid_baseline", "m2.snap.grid_scan"];
for (const id of GRID_STEPS) {
  if (!new RegExp(`"${id.replace(/\./g, "\\.")}":\\s*async`).test(src)) {
    problems.push(`${id} has no executor in flow-execute — the product would answer it with `
      + `\`mustRunLocally\` and a terminal command, which is a manual step and cannot be `
      + `interrupted safely.`);
  }
}

// ── 2. The instructions must not send anyone to a terminal.
let steps = 0;
try {
  const pb = JSON.parse(readFileSync(PLAYBOOKS, "utf8"));
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (o && typeof o === "object") {
      if (GRID_STEPS.includes(o.id)) {
        steps++;
        const i = String(o.instructions || "");
        // 🔴 MATCH THE INSTRUCTION, NOT THE VOCABULARY. This first tested for the bare word
        // `terminal`, which fired on the replacement copy — whose whole point is the sentence
        // "there is no terminal step and nothing to install". A gate that flags text for saying
        // the opposite of the thing it forbids teaches you to edit around the gate.
        const MANUAL = [
          /open\b[^.\n]{0,40}\bterminal/i,   // "Open the scraper VS Code repo terminal"
          /\bgrid-scan\.mjs\b/i,
          /\bnode\s+[\w./-]+\.mjs/i,          // "Run: node grid-scan.mjs --client=…"
          /\bVS Code repo\b/i,
        ];
        if (MANUAL.some((re) => re.test(i))) {
          problems.push(`${o.id} instructions still describe a manual terminal procedure: `
            + `"${i.slice(0, 90)}…"`);
        }
      }
      Object.values(o).forEach(walk);
    }
  };
  walk(pb);
} catch (e) {
  console.error(`⚠️  INDETERMINATE — playbooks.json did not parse: ${e.message}`);
  process.exit(2);
}
if (steps < GRID_STEPS.length) {
  console.error(`⚠️  INDETERMINATE — found ${steps} of ${GRID_STEPS.length} grid steps in playbooks.json.`);
  process.exit(2);
}

// ── 3. Completeness must be judged PER SOURCE, in both the baseline and the comparison.
//      Anchored to the construct, not "somewhere in the file".
// 🔴 ASSERT THE FOLD, NOT THE SHAPE. This first matched `fullFor[s.source] = Math.max(` — and a
// mutation that replaced the body with `Math.max(0, ...all.map(x => x.pts.length))` kept that exact
// prefix while restoring the across-all-sources bug the gate exists to catch. The part that makes
// it per-source is that the max folds in THAT SOURCE's own running value, so match that.
const perSource = [...src.matchAll(
  /fullFor\[\s*s\.source\s*\]\s*=\s*Math\.max\(\s*fullFor\[\s*s\.source\s*\]\s*\|\|\s*0\s*,/g)].length;
// The baseline and the monthly re-run now share readGridSessions(), so the fold lives in ONE
// place plus the tracker's own copy. Fewer than two means a reader stopped judging per source.
if (perSource < 2) {
  problems.push(`completeness is judged per-source in only ${perSource} place(s) — the shared `
    + `readGridSessions() and m2.snap.rank_tracker must each do it, or a complete 25-point `
    + `automated scan gets branded truncated next to an 81-point hand-run one.`);
}

// ── 4. The comparison must actually DROP the truncated sessions rather than note them.
const tracker = src.match(/"m2\.snap\.rank_tracker":[\s\S]{0,3000}?\n\s{2}\}/);
if (!tracker) {
  console.error("⚠️  INDETERMINATE — could not isolate m2.snap.rank_tracker; the parser has drifted.");
  process.exit(2);
}
if (!/\.filter\(\s*\(s\)\s*=>\s*s\.total\s*===\s*fullFor\[\s*s\.source\s*\]\s*\)/.test(tracker[0])) {
  problems.push("m2.snap.rank_tracker no longer filters sessions down to the complete ones — a "
    + "truncated scan would be compared against a full one and report movement that never happened.");
}
// It must not silently fall back to the newest session of any size.
if (/const\s+cur\s*=\s*ordered\[0\]/.test(tracker[0])) {
  problems.push("m2.snap.rank_tracker takes `ordered[0]` — the newest session of ANY size. On "
    + "2026-09-12 that was a FIVE-point scan of an 81-point grid.");
}

if (problems.length) {
  console.error(`🔴 FAIL — ${problems.length} regression(s):\n`);
  for (const p of problems) console.error(`   • ${p}\n`);
  process.exit(1);
}

console.log("✅ a truncated scan is not a measurement — grid_baseline runs in-product, its "
  + "instructions name no terminal, and completeness is judged per source in both readers.");
process.exit(0);
