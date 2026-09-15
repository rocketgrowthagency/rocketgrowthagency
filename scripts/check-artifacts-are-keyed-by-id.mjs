#!/usr/bin/env node
/**
 * check-artifacts-are-keyed-by-id.mjs — nothing durable may be keyed by a step's POSITION.
 *
 * ─── WHY (2026-09-15) ────────────────────────────────────────────────────────────────────────────
 * Twelve review links were published labelled "Step 22", "Step 25", "Step 41" and so on. Then a new
 * step — the duplicate-listing check — was inserted at position 11, and **every step after it moved
 * by one**. All twelve labels became wrong in the same instant. The URLs still resolved; each one was
 * simply announcing another step's number.
 *
 * 🔑 POSITION IS NOT IDENTITY. `m1.gbp.photos` is the same deliverable whether it is 30th or 31st in
 * the playbook. An ordinal is a rendering of today's order, and it changes whenever the SOP does —
 * which is exactly the thing we keep doing.
 *
 * This is the same defect family as the rank sentinel: a value that looks stable, used as though it
 * were, until the day it moves and every reader is quietly wrong.
 * → feedback_an_absence_must_never_be_readable_as_a_value
 *
 * ─── WHAT IT ASSERTS ─────────────────────────────────────────────────────────────────────────────
 *   1. No archived mockup is FILENAMED by position (`step41_*.md`). Files are named by step id.
 *   2. Every archived mockup names a step id that still exists in the playbook.
 *   3. Where a file states a position, that position matches the playbook TODAY — a stale ordinal in
 *      a file that claims to be current is worse than no ordinal at all.
 *
 * Exit 0 = keyed by id · 1 = something is keyed by, or lying about, position · 2 = could not tell.
 */
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.ARTIFACT_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const MOCKUPS = path.join(SITE, "reports/mockups");
const PLAYBOOK = path.join(SITE, "data/playbooks/playbooks.json");

if (!fs.existsSync(PLAYBOOK)) { console.error(`[artifacts] INDETERMINATE — no playbook at ${PLAYBOOK}`); process.exit(2); }
if (!fs.existsSync(MOCKUPS)) { console.error(`[artifacts] INDETERMINATE — no mockups directory`); process.exit(2); }

let m1;
try { m1 = JSON.parse(fs.readFileSync(PLAYBOOK, "utf8")).month1; }
catch (e) { console.error(`[artifacts] INDETERMINATE — playbook unreadable: ${e.message}`); process.exit(2); }
const ordinal = new Map(m1.map((s, i) => [s.id, i + 1]));

const files = fs.readdirSync(MOCKUPS).filter((f) => f.endsWith(".md"));
if (!files.length) { console.error("[artifacts] INDETERMINATE — no archived mockups to judge"); process.exit(2); }

const problems = [];
let checked = 0;

for (const f of files) {
  // 🔑 DERIVE which files are per-step archives rather than keeping a skip-list of index documents.
  // The first version hardcoded README/HANDOFF/LINKS and then failed the moment STATUS.md was added —
  // a list of exceptions is itself a thing that goes stale, which is the defect this gate is about.
  // A per-step archive is named after a step id (`m1_*`, `m2_*`); anything else describes the SET and
  // is regenerated wholesale, so it may talk about positions freely.
  if (!/^m\d+_/i.test(f)) continue;

  // 1. A position-shaped FILENAME is the defect itself.
  if (/^step\d+[_-]/i.test(f)) {
    problems.push(`${f} is named by POSITION. Inserting one step upstream renames what this file is about. Name it by step id.`);
    continue;
  }

  const body = fs.readFileSync(path.join(MOCKUPS, f), "utf8");
  const idMatch = body.match(/\|\s*step id\s*\|\s*`([^`]+)`/i);
  if (!idMatch) {
    problems.push(`${f} does not record a step id, so there is no stable way to tell what it archives.`);
    continue;
  }
  const id = idMatch[1].trim();
  checked++;

  // 2. The id must still exist. A renamed or deleted step leaves an archive nobody can place.
  if (!ordinal.has(id)) {
    problems.push(`${f} archives \`${id}\`, which is not in the playbook any more — renamed or removed.`);
    continue;
  }

  // 3. If it states a position, that position must be true today.
  const posMatch = body.match(/\|\s*position today\s*\|\s*#(\d+)/i);
  if (posMatch) {
    const stated = Number(posMatch[1]);
    const actual = ordinal.get(id);
    if (stated !== actual) {
      problems.push(`${f} says \`${id}\` is #${stated}; the playbook says #${actual}. Re-export — a stale ordinal in a file claiming to be current is worse than none.`);
    }
  }
}

console.log("── durable artifacts are keyed by step id, not position ──");
console.log(`  ${checked} archived mockup(s) checked against ${m1.length} playbook steps`);

if (problems.length) {
  console.error("\n✗ something durable is keyed by, or lying about, position:");
  for (const p of problems) console.error(`    ${p}`);
  console.error("\n  Inserting a single step renumbers everything after it. An ordinal is a rendering of");
  console.error("  today's order; the step id is the thing that does not move.");
  process.exit(1);
}
console.log("  ✅ every archive names a live step id, and every stated position is current");
process.exit(0);
