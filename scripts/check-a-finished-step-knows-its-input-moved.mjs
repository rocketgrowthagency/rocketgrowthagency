#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — A FINISHED STEP WHOSE INPUT MOVED UNDERNEATH IT SAYS SO
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Found by reading the real card on 2026-10-06: step 26, "Run the geo-grid map-rank baseline", sat
 * **Done** with a result from 2026-09-15 — *"81-point geo-grid, \"seo company\" … Not found at ANY of
 * the 81 points"* — while step 25 had re-locked this month's targets that morning, and **"seo
 * company" is not one of them.** The baseline was answering a question the plan no longer asks, and
 * the card was green.
 *
 * 🔑 NOT A 25-AND-26 PROBLEM. Thirty steps declare a `dependsOn`, and every one can go stale the same
 * way. The rule is stated once over the dependency graph the checklist already has.
 * → feedback_fix_the_class_not_the_instance · feedback_a_done_step_must_be_substantiable
 *
 * Runs the REAL obStaleDeps / obStaleNoteHtml lifted out of admin.js. Nothing here re-implements it.
 *
 * Exit 0 pass · 1 a step can show Done over an input that moved · 2 could not run.
 */
import fs from "node:fs";
import { liftAdmin } from "./_lift-admin.mjs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
let src;
try { src = fs.readFileSync(`${SITE}/admin/admin.js`, "utf8"); }
catch { console.error("⚠️  INDETERMINATE — cannot read admin.js"); process.exit(2); }

const fail = [];
const ok = (c, m) => { if (!c) fail.push(m); };

const lifted = liftAdmin(["obStaleDeps", "obStaleNoteHtml", "obProducedAt", "obDependsOn"]);
const S = (step, all) => lifted.call("obStaleDeps", [step, all]);
const N = (step, all) => lifted.call("obStaleNoteHtml", [step, all]);

const mk = (id, title, ran, deps) => ({ obj: { flowId: id, t: title }, dependsOn: deps || [],
  task: ran ? { ran_at: ran } : null });

// ── THE REAL CASE ───────────────────────────────────────────────────────────────────────────────
const K = mk("m1.strategy.keywords_locations", "Lock 3-5 primary keywords + 3 sub-locations", "2026-10-06T17:55:11Z");
const G = mk("m1.audit.grid_baseline", "Run the geo-grid map-rank baseline", "2026-09-15T03:30:45Z", ["m1.strategy.keywords_locations"]);
ok(S(G, [K, G]).length === 1,
  "the grid baseline, finished three weeks BEFORE the keyword plan was re-locked, is not reported as "
  + "out of date — this is the exact card that showed Done over a measurement of a keyword the plan "
  + "no longer contains");
ok(/Run it again/i.test(N(G, [K, G])),
  "the stale note does not tell the operator what to do about it");
ok(/Lock 3-5 primary keywords/.test(N(G, [K, G])),
  "the stale note does not name WHICH input moved");

// ── FRESH STAYS SILENT ──────────────────────────────────────────────────────────────────────────
const G2 = mk("m1.audit.grid_baseline", "Grid", "2026-10-06T18:30:00Z", ["m1.strategy.keywords_locations"]);
ok(S(G2, [K, G2]).length === 0, "a step that ran AFTER its dependency is reported stale");
ok(N(G2, [K, G2]) === "", "a current step still renders a warning");

// ── 🔴 UNKNOWN IS NEVER STALE. A warning on every step is a warning on none. ─────────────────────
ok(S(mk("x", "X", "2026-09-15T03:30:45Z", []), []).length === 0,
  "a step with no declared dependency is reported stale");
ok(S(mk("y", "Y", "2026-09-15T03:30:45Z", ["gone"]), [mk("gone", "Gone", null), mk("y", "Y", "2026-09-15T03:30:45Z", ["gone"])]).length === 0,
  "a dependency that has never produced anything makes its dependent stale — an absence must not read "
  + "as 'it moved'");
ok(S(mk("z", "Z", null, ["m1.strategy.keywords_locations"]), [K]).length === 0,
  "a step that has never run is called stale — it is not finished, so it cannot be out of date");
ok(S(mk("e", "E", "2026-10-06T17:55:11Z", ["m1.strategy.keywords_locations"]), [K]).length === 0,
  "a dependency that produced at the SAME instant is treated as later");
ok(S(mk("b", "B", "not-a-date", ["m1.strategy.keywords_locations"]), [K]).length === 0,
  "an unparseable timestamp is treated as stale rather than unknown");

// ── ONLY THE ONES THAT ACTUALLY MOVED ───────────────────────────────────────────────────────────
{
  const d2 = mk("dep2", "Dep Two", "2026-10-06T19:00:00Z");
  const m = mk("c", "C", "2026-10-06T18:00:00Z", ["m1.strategy.keywords_locations", "dep2"]);
  const got = S(m, [K, d2, m]).map((x) => x.id);
  ok(got.length === 1 && got[0] === "dep2",
    `dependencies that did NOT move are reported too (got ${got.join(", ") || "none"})`);
}

// ── IT IS WIRED INTO THE ROW ────────────────────────────────────────────────────────────────────
{
  const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
  ok(/\$\{obStaleNoteHtml\(/.test(code),
    "nothing renders the stale note — the rule exists and no card shows it");
  // 🔴 ON THE DONE ROW. A warning rendered only on an active step would never appear on the one that
  // matters: the step that already finished.
  const doneRow = (() => {
    const i = code.indexOf('class="ob-step ${declined ? "declined" : "done"}');
    return i < 0 ? "" : code.slice(i, i + 1200);
  })();
  ok(doneRow && /obStaleNoteHtml\(/.test(doneRow),
    "the stale note is not rendered on the DONE row — the only row where it matters");
  ok(/ran_at/.test(String(lifted.call("obProducedAt", [{ ran_at: "2026-01-01T00:00:00Z" }]) ? "ran_at" : "")),
    "obProducedAt ignores ran_at — it must read when the step PRODUCED, not when a box was ticked");
}

if (fail.length) {
  console.error("🔴 a finished step can show Done over an input that moved:");
  for (const f of fail) console.error(`   · ${f}`);
  process.exit(1);
}
console.log("✅ a finished step whose dependency produced later says so, names which one, and tells the "
  + "operator to re-run it — and unknown timestamps never raise a false warning");
