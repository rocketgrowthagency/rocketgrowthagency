#!/usr/bin/env node
/**
 * check-absent-rank-is-never-a-position.mjs — "we searched and found nothing" must never render,
 * count, or average as a rank.
 *
 * ─── WHY (2026-09-14) ────────────────────────────────────────────────────────────────────────────
 * The geo-grid scanner seeded every cell with **21** and wrote 21 for any point where the business
 * was not found. Three months of RGA's own scans therefore stored "rank 21" at all 25 points for a
 * business that ranked NOWHERE — indistinguishable from genuinely holding position 21, and read by
 * the brain, the admin grid, the client portal and the monthly report as if it were a measurement.
 *
 * Storing NULL instead is the honest fix, and on its own it made things WORSE, because every
 * consumer compared ranks with `<=`:
 *
 *     Number(null)            === 0        // "finite", so it passed every isFinite() guard
 *     null <= 2               === true     // painted bright green at #1
 *     ranks.filter(r => r<=3) .length      // counted EVERY absent cell as a top-3 position
 *
 * A portal showing a business that ranks nowhere would have read **"best rank 0, 100% in top 3"** —
 * the exact inverse of the truth, in the client's own dashboard.
 *
 * 🔑 The class: an ABSENCE sentinel and a POSITION must never share a type. Every read of a stored
 * cell goes through one helper that returns `null` for absent, and every comparison null-guards.
 * → project_rank_grid_uniform_sentinel · feedback_an_excluded_classification_is_a_claim
 * → feedback_fix_the_class_not_the_instance
 *
 * ─── WHAT IT ASSERTS ─────────────────────────────────────────────────────────────────────────────
 *   1. The producer seeds grids with null and writes null for not-found — never a 21 sentinel.
 *   2. No consumer coerces a stored rank with bare `Number(...)`; they use the shared helper.
 *   3. BEHAVIOURAL: the real helpers, extracted from the shipped files and executed, classify
 *      null / undefined / "" / 0 / 21 as ABSENT and a real position as a position.
 *
 * Exit 0 = absent stays absent · 1 = an absence can be read as a rank · 2 = could not tell.
 */
import fs from "node:fs";
import path from "node:path";

// Overridable ONLY so the sabotage harness can point at mutated copies of these same files; the
// default is always the real repo. → feedback_a_test_nobody_runs_is_not_a_guard
const SITE = process.env.RANK_GATE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = {
  portal: path.join(SITE, "portal/portal.js"),
  admin: path.join(SITE, "admin/admin.js"),
  producer: path.join(SITE, "netlify/functions/v2-rank-grid-background.js"),
  brain: path.join(SITE, "netlify/functions/v2-brain-analysis-background.js"),
};

const problems = [];
const read = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return null; } };

const src = {};
for (const [k, p] of Object.entries(F)) {
  src[k] = read(p);
  if (src[k] == null) { console.error(`[absent-rank] INDETERMINATE — cannot read ${p}`); process.exit(2); }
}

// ── 1. The producer must not manufacture a sentinel ──────────────────────────────────────────────
// Strip comments first: this file DOCUMENTS the old `fill(21)` in prose, and a check that trips on
// its own explanation is a dead check. → feedback_a_check_must_not_validate_itself
const stripComments = (s) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const prod = stripComments(src.producer);
if (/Array\(\s*GRID\s*\)\.fill\(\s*21\s*\)/.test(prod) || /\.fill\(\s*21\s*\)/.test(prod)) {
  problems.push("v2-rank-grid-background seeds the grid with 21 — not-found must seed as null.");
}
if (/map_rank:\s*\([^)]*\)\s*\?\s*21\s*:/.test(prod)) {
  problems.push("v2-rank-grid-background writes map_rank 21 for not-found — it must write null.");
}
// Every aggregate over grid cells must null-guard, or `null <= 20` counts absence as a position.
for (const m of prod.matchAll(/allRanks\.filter\(\s*r\s*=>\s*([^)]+)\)/g)) {
  if (!/r\s*!=\s*null/.test(m[1])) {
    problems.push(`v2-rank-grid-background aggregates without a null guard: filter(r => ${m[1].trim()}) — null <= N is TRUE in JS.`);
  }
}

// ── 2. No consumer may bare-coerce a stored rank ─────────────────────────────────────────────────
// `Number(null)` is 0 and passes Number.isFinite, so a bare coercion silently turns absence into #0.
for (const [name, key] of [["portal/portal.js", "portal"], ["admin/admin.js", "admin"]]) {
  const body = stripComments(src[key]);
  for (const m of body.matchAll(/Number\(\s*([A-Za-z_$][\w$]*)\.map_rank\s*\)/g)) {
    problems.push(`${name} coerces a stored rank with Number(${m[1]}.map_rank) — route it through the shared cell-rank helper so null stays absent.`);
  }
}

// ── 3. The brain prompt must not hardcode a grid size ────────────────────────────────────────────
// The scanner dropped 9×9 → 5×5 for cost control and is env-configurable; a competitor holding all
// 25 points was described as "25/81 searches (31% coverage)".
// → feedback_a_hardcoded_count_is_a_skipped_query
const brain = stripComments(src.brain);
for (const bad of [/\/81\s+searches/, /of\s+81\s+cells/, /\*\s*0\.81/, /appearances\s*\/\s*81/]) {
  if (bad.test(brain)) problems.push(`v2-brain-analysis-background hardcodes an 81-cell grid (${bad}) — derive the count from the grid it was handed.`);
}
if (/avg_rank\s*\|\|\s*21/.test(brain)) {
  problems.push("v2-brain-analysis-background coerces a null avg_rank to 21 — 'nowhere → nowhere' then subtracts to 0 and prints 'improving'.");
}
if (/rankGrid\.avg_rank\s*>\s*20\s*\?/.test(brain)) {
  problems.push("v2-brain-analysis-background tests `avg_rank > 20` to detect not-ranking — avg_rank is NULL when nothing ranks, and null > 20 is FALSE, so that branch never fires.");
}

// ── 4. BEHAVIOURAL — run the shipped helpers, don't just read them ───────────────────────────────
// A static scan proves the text changed. Executing the real functions proves the behaviour did.
function extract(body, decl) {
  const i = body.indexOf(decl);
  if (i < 0) return null;
  // Walk braces from the first { after the declaration to find the function body.
  const start = body.indexOf("{", i);
  if (start < 0) return null;
  let depth = 0;
  for (let j = start; j < body.length; j++) {
    if (body[j] === "{") depth++;
    else if (body[j] === "}") { depth--; if (depth === 0) return body.slice(i, j + 1); }
  }
  return null;
}

const ABSENT_INPUTS = [null, undefined, "", 0, 21, 99];
const REAL_INPUTS = [1, 3, 7, 20];

// portal: CA_CELL_RANK is an arrow const, terminated by the following newline.
const caLine = src.portal.split("\n").find((l) => l.trim().startsWith("const CA_CELL_RANK"));
const caBody = extract(src.portal, "const CA_CELL_RANK");
const adminBody = extract(src.admin, "function cellRank");

if (!caBody && !caLine) problems.push("portal/portal.js no longer defines CA_CELL_RANK — the single reading of a stored cell is gone.");
if (!adminBody) problems.push("admin/admin.js no longer defines cellRank() — the single reading of a stored cell is gone.");

for (const [label, body, callee] of [["portal CA_CELL_RANK", caBody, "CA_CELL_RANK"], ["admin cellRank", adminBody, "cellRank"]]) {
  if (!body) continue;
  let fn;
  try { fn = new Function(`${body}; return ${callee};`)(); } catch (e) {
    problems.push(`${label} could not be executed: ${String(e.message).slice(0, 90)}`);
    continue;
  }
  for (const v of ABSENT_INPUTS) {
    const got = fn(v);
    // 21 and 99 are "out of range" rather than strictly absent — both must simply never be a
    // top-of-grid position. What matters is that they are not treated as a held rank <= 20.
    const okAbsent = v === 21 || v === 99 ? (got == null || got > 20) : got == null;
    if (!okAbsent) problems.push(`${label}(${JSON.stringify(v)}) returned ${JSON.stringify(got)} — an absence became a position.`);
  }
  for (const v of REAL_INPUTS) {
    if (fn(v) !== v) problems.push(`${label}(${v}) returned ${JSON.stringify(fn(v))} — a real position was lost.`);
  }
}

// The colour/class functions must paint absence as absent, never as #1.
const classBody = src.portal.split("\n").find((l) => l.trim().startsWith("const CA_GRID_CLASS"));
const adminClass = extract(src.admin, "function rankCellClass");
const adminColor = extract(src.admin, "function rankColor");

if (classBody && caBody) {
  try {
    const cls = new Function(`${caBody}; ${classBody}; return CA_GRID_CLASS;`)();
    for (const v of [null, undefined, 21]) {
      if (cls(v) !== "n") problems.push(`portal CA_GRID_CLASS(${JSON.stringify(v)}) = "${cls(v)}" — absence must use the neutral "n" class, not a ranked colour.`);
    }
    if (cls(1) !== "g1") problems.push(`portal CA_GRID_CLASS(1) = "${cls(1)}" — a real #1 lost its class.`);
  } catch (e) { problems.push(`portal CA_GRID_CLASS could not be executed: ${String(e.message).slice(0, 90)}`); }
}
if (adminClass && adminBody) {
  try {
    const cls = new Function(`${adminBody}; ${adminClass}; return rankCellClass;`)();
    for (const v of [null, undefined, 21]) {
      if (cls(v) !== "n") problems.push(`admin rankCellClass(${JSON.stringify(v)}) = "${cls(v)}" — absence must use the neutral "n" class.`);
    }
  } catch (e) { problems.push(`admin rankCellClass could not be executed: ${String(e.message).slice(0, 90)}`); }
}
if (adminColor && adminBody) {
  try {
    const col = new Function(`${adminBody}; ${adminColor}; return rankColor;`)();
    const absent = col(null);
    const first = col(1);
    // 🔴 The DISTINCTION is the property, not the literal. Asserting `=== "#c3cad6"` broke the day
    // colours moved into design tokens — rankColor now returns `var(--admin-rank-absent,#c3cad6)`,
    // which is the same colour and better code. A gate pinned to a literal fails on a correct
    // refactor and passes on a wrong one that happens to use the right string.
    // 🔑 What must hold: absent is not the #1 colour, and it names the ABSENT swatch.
    if (absent === first) problems.push(`admin rankColor(null) === rankColor(1) (${absent}) — a business absent from a point is painted as if it ranked #1 there.`);
    if (!/c3cad6|rank-absent/i.test(String(absent))) {
      problems.push(`admin rankColor(null) = ${absent} — expected the neutral absent swatch (#c3cad6 or --admin-rank-absent).`);
    }
    // The scale must still be a scale: #1 and #8-20 cannot collapse to the same colour.
    if (col(1) === col(15)) problems.push(`admin rankColor(1) === rankColor(15) — the rank scale has collapsed to one colour.`);
  } catch (e) { problems.push(`admin rankColor could not be executed: ${String(e.message).slice(0, 90)}`); }
}

// ── 5. THE STORED DATA — the check this gate did not have, and the regression walked past ───────
//
// 🔴 2026-09-22. This gate existed, ran daily, and PASSED while a uniform `21` sat in
// brain_rank_snapshots for 2026-09-21. It audited the producer CODE and executed the consumer
// HELPERS, and never once read what had actually been written. Sections 1-4 prove the code cannot
// produce a sentinel TODAY; they say nothing about the rows already on file or about a writer this
// gate never knew to look at (`saveRankGrid` stored the raw grid while `saveGridRows` normalised
// it, so ONE scan wrote nulls to the rows and 21s to the blob).
//
// 🔑 The same lesson check-ai-drafts-do-not-invent-prices already learned: scan what was WRITTEN,
// not only what writes it. A prompt fix does not un-write the bad draft; a producer fix does not
// un-write the bad row. → feedback_correct_is_not_the_same_as_happening · feedback_a_guard_must_reach_the_thing_it_guards
const U = process.env.SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!U || !K) {
  console.error("⚠️  INDETERMINATE — no Supabase credentials, so the STORED grids could not be read.");
  console.error("   Sections 1-4 passed, but those only prove the code cannot write a sentinel today.");
  process.exit(2);
}
{
  const h = { apikey: K, Authorization: `Bearer ${K}` };
  const get = async (path) => {
    const r = await fetch(`${U}/rest/v1/${path}`, { headers: h });
    if (!r.ok) return null;
    return r.json();
  };

  const snaps = await get("brain_rank_snapshots?select=client_id,snapshot_date,keyword,grid,avg_rank&order=snapshot_date.desc&limit=60");
  if (!Array.isArray(snaps)) {
    console.error("⚠️  INDETERMINATE — could not read brain_rank_snapshots.");
    process.exit(2);
  }
  for (const s of snaps) {
    const flat = Array.isArray(s.grid) ? s.grid.flat() : [];
    if (!flat.length) continue;
    const sentinels = flat.filter((v) => v != null && v > 20);
    if (sentinels.length) {
      const uniq = [...new Set(sentinels)];
      problems.push(`brain_rank_snapshots ${s.snapshot_date} "${s.keyword}" stores ${sentinels.length} `
        + `cell(s) above rank 20 (${JSON.stringify(uniq)}). Above 20 is "not found in range", not a `
        + `position — stored as a number it reads as a rank the business holds. `
        + `Normalise to null, or delete the row if it was never a real measurement.`);
    }
  }

  // The blob the brain COPIES must agree with the rows written by the same scan. This is the
  // disagreement that produced the regression: two stores of one measurement, one migrated.
  const recs = await get("client_onboarding_records?select=client_id,data&limit=200");
  for (const rec of Array.isArray(recs) ? recs : []) {
    const rg = rec?.data?.v2Campaign?.rank_grid;
    const flat = Array.isArray(rg?.grid) ? rg.grid.flat() : [];
    if (!flat.length) continue;
    const bad = flat.filter((v) => v != null && v > 20);
    if (bad.length) {
      problems.push(`the stored rank_grid blob for client ${String(rec.client_id).slice(0, 8)} holds `
        + `${bad.length} cell(s) above 20 (${JSON.stringify([...new Set(bad)])}) while saveGridRows `
        + `normalises the same scan to null. The brain copies THIS blob into the time series.`);
    }
  }
}

// ── 6. THE DATE MUST BE WHEN IT WAS MEASURED, NOT WHEN THE JOB RAN ──────────────────────────────
// 🔴 The brain wrote `snapshot_date: today` regardless of the grid's age, and it runs on its own
// schedule — so it re-snapshotted an 11-day-old blob as a fresh weekly measurement. This is a TIME
// SERIES: a re-dated copy is a data point that never happened.
{
  // `brain` is already comment-stripped above — a gate that greps raw source matches the prose
  // explaining the rule instead of the rule. → feedback_dead_check_selector_gap
  const snapWrite = brain.match(/brain_rank_snapshots`[\s\S]{0,900}?snapshot_date:\s*(\w+)/);
  if (!snapWrite) {
    problems.push("could not find the brain_rank_snapshots write — this gate can no longer tell how it is dated.");
  } else if (/^today$/.test(snapWrite[1])) {
    problems.push("v2-brain-analysis-background dates a snapshot `today` — it must date it by the "
      + "grid's own timestamp, or every run re-records an old grid as this week's measurement.");
  }
}

// ── 7. NO INLINE RANK PAINTER MAY BYPASS THE SHARED HELPERS ────────────────────────────────────
// 🔴 2026-09-22. Chris saw the admin Map coverage card showing 25 GREEN cells reading "0" above
// the caption "0% of the map in the top 3" — the grid and its own caption contradicting each other,
// both wrong, for a business found at NONE of its points.
//
// Cause: that card ran `rg.grid.flat().map(Number)`, and **`Number(null)` is 0, not NaN**. Zero
// then passed `0 <= 2` into the best colour band and `0 <= 20` into the ranked count. The shared
// `cellRank`/`rankCellClass`/`rankLabel` helpers thirty lines away handle null correctly — the card
// simply never called them, so sections 1-4 above, which audit those helpers, stayed green
// throughout. A gate that checks the shared path cannot see the copy that avoided it.
// → feedback_fix_the_class_not_the_instance
{
  const adminRaw = String(src.admin || "").replace(/^\s*\/\/.*$/gm, "");
  // `.map(Number)` applied to grid data is the exact coercion that turns absent into zero.
  for (const m of adminRaw.matchAll(/(\w+)\.flat\(\)\.map\(Number\)/g)) {
    problems.push(`admin.js coerces grid data with \`${m[1]}.flat().map(Number)\` — Number(null) is 0, which `
      + `paints "found nowhere" as rank 0 in the best colour band. Use cellRank()/rankLabel()/rankCellClass().`);
  }
  // A locally-declared colour-band function is a second palette that will drift from the shared one.
  for (const m of adminRaw.matchAll(/const\s+cls\s*=\s*\(\s*r\s*\)\s*=>[^\n]*g1/g)) {
    problems.push("admin.js declares an inline rank-colour function (`const cls = (r) => … g1 …`) instead of "
      + "rankCellClass() — a second palette that will drift from the shared one, and that null "
      + "handling has to be re-fixed in.");
  }
}

// ── Report ───────────────────────────────────────────────────────────────────────────────────────
console.log("── absent ranks stay absent ──");
if (problems.length) {
  console.error("\n✗ an absence can be read as a rank:");
  for (const p of problems) console.error(`    ${p}`);
  console.error("\n  A business that ranks NOWHERE must never display, count or average as a position.");
  console.error("  Store null, read through the shared helper, and null-guard every comparison.");
  process.exit(1);
}
console.log("  ✅ producer stores null for not-found; no bare Number() coercions");
console.log("  ✅ brain prompt derives the grid size instead of assuming 81");
console.log("  ✅ portal + admin helpers executed: null / 21 classify as ABSENT, real ranks survive");
console.log("  ✅ STORED grids carry no cell above rank 20, and snapshots are dated when measured");
console.log("\n✅ absence and position cannot be confused on any surface.");
process.exit(0);
