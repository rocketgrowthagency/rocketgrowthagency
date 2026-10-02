#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — NO STEP RENDERS BEFORE SOMETHING IT DEPENDS ON
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-10-02: *"why are these out of order."* The list read **21 · 26 · 22 · 23 · 24 · 25**,
 * with the geo-grid baseline (26) shown a whole phase before the keyword lock (25) it `dependsOn` —
 * and the step's own SOP line says *"keyword/competitor research comes BEFORE the baseline (the
 * geo-grid scan needs the target keyword)."*
 *
 * TWO causes, and the second is why this gate EXECUTES rather than reads:
 *
 *   1. A phase is derived from the step id's namespace — `m1.audit.grid_baseline` → "The audit" —
 *      while its dependency `m1.strategy.keywords_locations` is `strategy` → "Decide", a later
 *      phase. The grouping contradicted the graph.
 *
 *   2. 🔴🔴 `obRespectDeps` read `steps[i].dependsOn` when the data lives at `steps[i].obj.dependsOn`.
 *      Every lookup returned undefined, `blockers` was always empty, and **the topological sort had
 *      never reordered a single row since the day it was written** — while memory recorded page
 *      order as "a stable topological sort, 0 backwards". It was green because it never had
 *      anything to repair.
 *
 * 🔑 A SOURCE-READING GATE WOULD HAVE PASSED #2. The function was present, wired, correctly shaped
 * and structurally a no-op. So this runs the real `obBuckets` over real playbook data and counts
 * backwards edges in what it returns.
 * → feedback_a_property_read_is_a_claim_about_the_shape · feedback_a_gate_that_it_exists_is_not_a_gate_that_it_works
 *
 * Exit 0 pass · 1 fail · 2 indeterminate. Mutation log at the bottom.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const JS = path.join(SITE, "admin", "admin.js");
const PB = path.join(SITE, "data", "playbooks", "playbooks.json");

if (!fs.existsSync(JS)) { console.error("⚠️  INDETERMINATE — admin.js not found."); process.exit(2); }
if (!fs.existsSync(PB)) { console.error("⚠️  INDETERMINATE — playbooks.json not found."); process.exit(2); }
const raw = fs.readFileSync(JS, "utf8");

/** Lift a declaration out of admin.js by its opening and closing text. */
function slice(open, close, label) {
  const i = raw.indexOf(open);
  if (i < 0) { console.error(`⚠️  INDETERMINATE — could not find ${label}.`); process.exit(2); }
  const j = raw.indexOf(close, i + open.length);
  if (j < 0) { console.error(`⚠️  INDETERMINATE — could not close ${label}.`); process.exit(2); }
  return raw.slice(i, j + close.length);
}

const ctx = vm.createContext({});
try {
  vm.runInContext([
    slice("const obGroupOf =", ";", "obGroupOf"),
    slice("const OB_PHASES = [", "\n];", "OB_PHASES"),
    slice("function obRespectDeps(", "\n}", "obRespectDeps"),
    slice("function obPhaseIndexOf(", "\n}", "obPhaseIndexOf"),
    slice("function obBuckets(", "\n}", "obBuckets"),
    "globalThis._x = { obBuckets, obRespectDeps, OB_PHASES };",
  ].join("\n"), ctx);
} catch (e) {
  console.error(`⚠️  INDETERMINATE — the lifted ordering code did not evaluate: ${e.message}`);
  process.exit(2);
}
const { obBuckets, obRespectDeps } = ctx._x;

// ── real steps, from the real playbook ──────────────────────────────────────────────────────────
const pb = JSON.parse(fs.readFileSync(PB, "utf8"));
const found = [];
(function walk(o) {
  if (Array.isArray(o)) return o.forEach(walk);
  if (o && typeof o === "object") {
    if (o.id && (o.title || o.name)) found.push(o);
    Object.values(o).forEach(walk);
  }
})(pb);
const m1 = found.filter((s) => String(s.id).startsWith("m1."));
if (m1.length < 30) { console.error(`⚠️  INDETERMINATE — only ${m1.length} month-1 steps parsed.`); process.exit(2); }
const steps = m1.map((s) => ({ obj: { flowId: s.id, dependsOn: s.dependsOn || [] } }));

console.log("── the dependency sort actually reorders ──");
{
  // 🔑 PROVE IT IS NOT A NO-OP. The bug was a sort that returned its input untouched. Hand it a list
  // that is deliberately backwards and require it to move something.
  const a = { obj: { flowId: "x.b", dependsOn: ["x.a"] } };
  const b = { obj: { flowId: "x.a", dependsOn: [] } };
  const got = obRespectDeps([a, b], [0, 1]);
  if (got[0] === 1 && got[1] === 0) console.log("  ✅ a dependant placed first is moved behind its dependency");
  else {
    console.error("  🔴 obRespectDeps did NOT reorder a backwards pair — it is a no-op");
    console.error(`     given [b(needs a), a] it returned [${got.join(", ")}], expected [1, 0]`);
    console.error("\n   This is the exact defect of 2026-10-02: the sort read the wrong property,");
    console.error("   so blockers was always empty and it never repaired anything.");
    process.exit(1);
  }
}

console.log("\n── no backwards edge in the rendered order ──");
{
  const buckets = obBuckets(steps);
  const order = [].concat(...buckets.map((x) => x.idx));
  if (order.length !== steps.length) {
    console.error(`  🔴 ${steps.length} steps in, ${order.length} out — rows are being dropped or duplicated.`);
    process.exit(1);
  }
  const at = new Map(order.map((i, k) => [steps[i].obj.flowId, k]));
  const backwards = [];
  order.forEach((i, k) => {
    for (const d of steps[i].obj.dependsOn) {
      if (at.has(d) && at.get(d) > k) backwards.push(`${steps[i].obj.flowId} renders at ${k} but needs ${d} at ${at.get(d)}`);
    }
  });
  if (!backwards.length) console.log(`  ✅ ${order.length} steps, 0 backwards edges`);
  else {
    console.error(`  🔴 ${backwards.length} step(s) render before something they depend on:`);
    for (const b of backwards.slice(0, 8)) console.error(`     · ${b}`);
    console.error("\n   A step shown before its dependency invites someone to run it on missing input.");
    process.exit(1);
  }
}

console.log("\n✅ the checklist cannot show a step before something it depends on, and the sort that");
console.log("   guarantees it has been proven to actually move a row.");

/* ─── MUTATION LOG (both directions, matched by name) ──────────────────────────────────────────────
 *  1. obRespectDeps reads `steps[i].dependsOn` again (the real 10-02 bug) → exit 1 "it is a no-op"
 *  2. obPhaseIndexOf promotion loop removed  → exit 1 "render before something they depend on",
 *     naming BOTH real cross-phase pairs: grid_baseline↔keywords_locations and
 *     knowledge_panel↔expanded_schema. The second was found by this gate, not by eye.
 *  3. unmodified source                      → exit 0
 *
 * 🔑 HONEST LIMIT: removing the within-phase `obRespectDeps(steps, idx)` call does NOT fail today,
 * because no month-1 phase currently contains a pair that needs reordering once promotion has run.
 * That call is defensive, and the synthetic pair in check 1 is what proves the sort itself works.
 * Claiming a mutation that does not fire would make this log a decoration.
 * ────────────────────────────────────────────────────────────────────────────────────────────── */
