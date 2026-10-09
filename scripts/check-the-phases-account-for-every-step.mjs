#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — EVERY STEP LANDS IN A PHASE, AND THE PHASE COUNTS ARE READ, NEVER WRITTEN
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Month 1 renders as ten phases (approved 2026-09-30,
 * reports/mockups/admin_onboarding_condensed_v1.html). 61 steps, collapsed into groups, with the
 * automated audit checks rolled into one summary line.
 *
 * 🔴🔴 THE FAILURE MODE THIS EXISTS FOR — caught during the build, in the MOCKUP:
 *
 * The rollup said **"14 checks run automatically"**. The audit phase has 14 steps but only **11**
 * are `type: auto`; three (top-3 competitors, the geo-grid baseline, the citation audit) are hybrid
 * and need Chris to click through. **Matching the mockup exactly would have shipped a claim that
 * three manual jobs run themselves** — and the operator would have stopped looking for them.
 *
 * 🔑 A SUMMARY THAT COUNTS ITS OWN SUBJECT CANNOT LIE. The implementation derives the number from
 * the steps it is summarising; this gate pins that it stays derived.
 * → feedback_no_hardcoded_stats · feedback_we_never_promise_what_we_dont_do
 *
 * WHAT IS PINNED:
 *   1. Every step id-group is claimed by exactly one phase — nothing silently vanishes.
 *   2. The phase denominators sum to the real step count.
 *   3. The rollup counts `type: auto` steps, and is not a written number.
 *   4. The rollup is a TOGGLE — the automated steps keep their Run button and their output.
 *
 * Exit 0 pass · 1 fail · 2 indeterminate. Mutation log at the bottom.
 */
import { liftAdmin } from "./_lift-admin.mjs";
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const fail = [], indet = [], pass = [];

const js = fs.existsSync(path.join(SITE, "admin/admin.js"))
  ? fs.readFileSync(path.join(SITE, "admin/admin.js"), "utf8") : null;
const pbPath = path.join(SITE, "data/playbooks/playbooks.json");
if (!js || !fs.existsSync(pbPath)) {
  console.error("⚠️  INDETERMINATE — admin.js or playbooks.json not found."); process.exit(2);
}
const code = js.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
let m1;
try { m1 = JSON.parse(fs.readFileSync(pbPath, "utf8")).month1; }
catch (e) { console.error(`⚠️  INDETERMINATE — playbooks.json will not parse: ${e.message}`); process.exit(2); }

// ── the phase table, read out of the source rather than restated here ───────────────────────────
const tableAt = code.indexOf("const OB_PHASES = [");
if (tableAt < 0) {
  fail.push("admin/admin.js — OB_PHASES is gone, so Month 1 is back to one flat list of 61 rows.");
} else {
  const table = code.slice(tableAt, code.indexOf("];", tableAt));
  const claimed = [...table.matchAll(/groups:\s*\[([^\]]*)\]/g)]
    .flatMap((mm) => [...mm[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));

  // 🔑 2026-10-08 — the card a step sits in is what the PRODUCT's obGroupOf says (an id map for the
  // steps whose middle segment does not name their card, approved onboarding_order_audit_v1), so the
  // real function is lifted and asked, never re-derived from the id here.
  const groupOf = (() => { try { return liftAdmin(["obGroupOf", "OB_CARD_OF", "OB_SEGMENT_CARD"]).get("obGroupOf"); } catch { return null; } })();
  if (typeof groupOf !== "function") { console.error("⚠️  INDETERMINATE — obGroupOf could not be lifted"); process.exit(2); }
  // 1 · every group in the DATA is claimed by a phase
  const groups = [...new Set(m1.map((s) => groupOf(s.id)))];
  const unclaimed = groups.filter((g) => !claimed.includes(g));
  if (unclaimed.length) {
    fail.push(`admin/admin.js — ${unclaimed.length} step group(s) belong to no phase: ${unclaimed.join(", ")}. `
      + `They fall into the last phase rather than vanishing, but the phase they land in will be wrong `
      + `and its count will not match its name.`);
  } else pass.push(`all ${groups.length} step groups are claimed by a phase`);

  // 2 · a group claimed twice would count its steps twice
  const dupes = claimed.filter((g, i) => claimed.indexOf(g) !== i);
  if (dupes.length) {
    fail.push(`admin/admin.js — group(s) claimed by more than one phase: ${[...new Set(dupes)].join(", ")}.`);
  } else pass.push("no group is claimed by two phases");

  // 3 · the denominators must sum to the real total
  const perPhase = [...table.matchAll(/groups:\s*\[([^\]]*)\]/g)]
    .map((mm) => [...mm[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]))
    .map((gs) => m1.filter((s) => gs.includes(groupOf(s.id))).length);
  const sum = perPhase.reduce((a, b) => a + b, 0);
  if (sum !== m1.length) {
    fail.push(`admin/admin.js — the phases account for ${sum} steps but Month 1 has ${m1.length}. `
      + `A phased list whose parts do not add up to the whole is hiding or double-counting work.`);
  } else pass.push(`the phases account for all ${m1.length} steps`);
}

// ── the rollup must COUNT, not claim ────────────────────────────────────────────────────────────
{
  const fn = code.indexOf("function obPhaseBody(");
  if (fn < 0) {
    fail.push("admin/admin.js — obPhaseBody is gone, so the automated audit checks are back to 11 separate rows.");
  } else {
    const body = code.slice(fn, code.indexOf("\n}", fn));
    // 🔑 2026-10-08: the rollup takes the leading AUTOMATED run in page order — it stops at the first
    // step that is not automatic (`sopType !== "auto"`), so it can still never summarise manual work.
    if (!/sopType\)\s*===\s*"auto"/.test(body) && !/sopType === "auto"/.test(body)
        && !/firstHuman = ordered\.findIndex\(\(i\) => \(steps\[i\]\.obj \|\| \{\}\)\.sopType !== "auto"\)/.test(body)) {
      fail.push("admin/admin.js — the rollup no longer selects on `sopType === \"auto\"`, so it can "
        + "summarise steps that are NOT automatic and tell Chris work runs itself when it does not.");
    } else pass.push("the rollup selects the steps that really are automatic");

    if (!/\$\{autoIdx\.length\} checks run automatically/.test(body)) {
      fail.push('admin/admin.js — the rollup\'s count is not derived from the steps it covers. The '
        + 'MOCKUP said "14 checks run automatically" when only 11 are — a written number is exactly '
        + "how that claim gets shipped.");
    } else pass.push("the rollup counts its own subject, so it cannot overstate");

    // 🔴 BOUNDARY, OR `data-ob-rollup-toggleX` SATISFIES IT. A substring is not an attribute —
    // the same trap as `.pm-amend` matching `.pm-amend-RENAMED`.
    // → feedback_a_gate_must_pin_the_property_not_the_spelling
    if (!/data-ob-rollup-toggle[\s>"']/.test(body)) {
      fail.push("admin/admin.js — the rollup is not a toggle, so the automated steps' Run buttons and "
        + "stored output are unreachable. A long page traded for a dead end.");
    } else pass.push("the rollup opens, keeping every step reachable");
  }
  if (!/data-ob-rollup-toggle/.test(code.slice(code.indexOf("addEventListener(\"click\"")))) {
    // the handler must exist somewhere, not only the attribute
    if (!/closest\("\[data-ob-rollup-toggle\]"\)/.test(code)) {
      fail.push("admin/admin.js — nothing listens for the rollup toggle, so it renders as a control "
        + "and does nothing.");
    }
  }
}

for (const p of pass) console.log(`  ✅ ${p}`);
for (const i of indet) console.log(`  ⚠️  ${i}`);
for (const f of fail) console.log(`  🔴 ${f}`);
if (fail.length) { console.log(`\n🔴 FAIL — ${fail.length} way(s) the phased list misrepresents the work.`); process.exit(1); }
if (indet.length && !pass.length) { console.log("\n⚠️  INDETERMINATE"); process.exit(2); }
console.log(`\n✅ every step lands in a phase and the counts are read, not written (${pass.length} checks).`);

/* ─────────────────────────────────────────────────────────────────────────────────────────────────
 * MUTATION LOG — each must turn this gate red:
 *   1. drop a group from OB_PHASES                       → unclaimed group
 *   2. claim one group in two phases                     → double count
 *   3. hardcode the rollup's number                      → the mockup's "14" bug
 *   4. roll up steps regardless of sopType               → manual work claimed as automatic
 *   5. remove the rollup toggle                          → steps unreachable
 * ─────────────────────────────────────────────────────────────────────────────────────────────── */
