#!/usr/bin/env node
// check-out-of-date-means-something-new.mjs — "OUT OF DATE" ONLY WHEN SOMETHING IT RELIES ON PRODUCED SOMETHING NEW, NEVER ON A BASELINE
// (approved out_of_date_means_changed_v1, the owner 11-8 walk: RGA's 26 turned out of date because 25 re-checked and found it already right;
// 21-23 are baselines, meant to be older). Admin's banner and the autopilot's redo share the rule. exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs"; import path from "node:path"; import vm from "node:vm"; import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = [], fail = (m) => F.push(m);
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));
let A, SC, AR;
try { A = fs.readFileSync(path.join(SITE, "admin/admin.js"), "utf8"); SC = req(path.join(SITE, "shared/site-change.js")); AR = req(path.join(SITE, "netlify/functions/_website-autorun.js")); }
catch (e) { console.error(`⚠️  INDETERMINATE: ${e.message}`); process.exit(2); }
const lift = (name) => { const m = new RegExp(`^function ${name}\\(`, "m").exec(A); if (!m) throw new Error(`${name} moved`); return A.slice(m.index, A.indexOf("\n}\n", m.index) + 2); };
const line = (name) => { const m = new RegExp(`^const ${name} = [^\\n]*;$`, "m").exec(A); if (!m) throw new Error(`${name} moved`); return m[0].replace(/^const /, "var "); };
try {
  const ctx = vm.createContext({ globalThis: { rgaSiteChange: SC }, escapeHtml: (s) => String(s), ZC_CARD_STEPS: new Set(), descriptionOnGoogle: () => false,
    obDependsOn: (s) => s.deps || [] });
  vm.runInContext([line("OB_BASELINES"), lift("obProducedAt"), lift("obOutputAt"), lift("obFoundNothingNew"), lift("obStaleDeps"), lift("obStaleNoteHtml")].join("\n"), ctx);
  const S = (id, task, deps = []) => ({ id, obj: { flowId: id, t: id }, task, deps });
  ctx.__steps = [];
  const note = (step, all) => { ctx.__s = step; ctx.__all = all; return vm.runInContext("obStaleNoteHtml(__s, __all)", ctx); };
  const t0 = "2026-11-07T22:01:00Z", later = "2026-11-09T03:10:48Z";
  // 26 after 25's re-check that found it already right → not out of date
  const s25 = S("m1.web.tracking", { ran_at: later, auto_result: { outcome: "verified" }, no_change_needed: { at: later } });
  const s26 = S("m1.tracking.form_setup", { ran_at: t0, status: "done" }, ["m1.web.tracking"]);
  if (note(s26, [s25, s26]) !== "") fail("a re-check that found it already right still makes the next step out of date");
  // a re-check recorded only by its outcome (no "nothing needs changing" mark) also isn't something new
  const s25b = S("m1.web.tracking", { ran_at: later, auto_result: { outcome: "verified" } });
  if (note(s26, [s25b, s26]) !== "") fail("a verified re-check (by outcome alone) still makes the next step out of date");
  // a dependency that produced something new → still out of date, naming it
  const s19 = S("m1.strategy.keywords_locations", { ran_at: later, auto_result: { summary: "new plan" } });
  const s27 = S("m1.gbp.business_description", { ran_at: t0 }, ["m1.strategy.keywords_locations"]);
  const n27 = note(s27, [s19, s27]);
  if (!/OUT OF DATE/.test(n27) || !/m1\.strategy\.keywords_locations/.test(n27)) fail(`a dependency that produced something new no longer marks the step out of date (${n27})`);
  // the three baselines: never out of date, say what they are
  for (const [id, noun] of [["m1.audit.competitors", "snapshot"], ["m1.audit.grid_baseline", "map rank"], ["m1.audit.kpi_baseline", "numbers"]]) {
    const b = S(id, { ran_at: "2026-10-06T12:00:00Z", status: "done" }, ["m1.strategy.keywords_locations"]);
    const nb = note(b, [s19, b]);
    if (/OUT OF DATE/.test(nb) || !new RegExp(`The starting ${noun} · Oct 6`).test(nb)) fail(`baseline ${id} reads out of date, or doesn't say what it is (${nb})`);
  }
  // the shared rule itself (admin's re-check line reads it directly): a baseline has no stale dependencies
  ctx.__b = S("m1.audit.grid_baseline", { ran_at: "2026-10-06T12:00:00Z" }, ["m1.strategy.keywords_locations"]); ctx.__all = [s19, ctx.__b];
  if (vm.runInContext("obStaleDeps(__b, __all).length", ctx) !== 0) fail("a baseline reports stale dependencies to the steps that read them");
  // the autopilot's redo shares the rule
  const T = { "m1.web.tracking": { ran_at: later, auto_result: { outcome: "verified" } }, "m1.web.schema": { ran_at: t0 } };
  if (AR.outOfDate({ id: "m1.web.schema", dependsOn: ["m1.web.tracking"] }, T) !== null) fail("the autopilot redrafts after a re-check that found it already right");
  const T2 = { "m1.strategy.keywords_locations": { ran_at: later, auto_result: { summary: "new" } }, "m1.web.schema": { ran_at: t0 } };
  if (!AR.outOfDate({ id: "m1.web.schema", dependsOn: ["m1.strategy.keywords_locations"] }, T2)) fail("the autopilot no longer redrafts after something new");
} catch (e) { console.error(`⚠️  INDETERMINATE: ${String(e.stack || e.message).split("\n").slice(0, 2).join(" ")}`); process.exit(2); }
if (F.length) { console.error(`❌ out of date — ${F.length} regression(s):`); for (const x of F) console.error(`  · ${x}`); process.exit(1); }
console.log("✅ 'out of date' means something new: a re-check that found it already right never marks later steps out of date (admin or autopilot), a new result still does and names it, and the three baselines say 'The starting …' instead");
