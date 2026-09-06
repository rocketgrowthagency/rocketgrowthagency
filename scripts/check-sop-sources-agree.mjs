#!/usr/bin/env node
/**
 * check-sop-sources-agree.mjs — the delivery SOP exists in two files; they must not drift.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * The Month-1 SOP is defined twice:
 *
 *   flow/playbooks/month1.mjs      — CANONICAL. Its own header says "Source of truth for what to do
 *                                    for a new client in Month 1". Holds the executable run()s.
 *   data/playbooks/playbooks.json  — what the ADMIN UI renders. Holds UI-only metadata (actor,
 *                                    clientLabel, clientForm) that cannot live in the .mjs.
 *
 * Neither is a superset, so merging them would lose something. What we CAN enforce is that they
 * describe the SAME PROCESS.
 *
 * 🔴 On 2026-09-06 they had silently drifted: 49 steps local, 58 in admin. Nine steps appeared in the
 * admin that the runner could not execute, and `m1.kickoff.call` was `manual` in one and `hybrid`
 * with `hasRunner: true` in the other — so the admin offered a Run button for a handler that existed
 * nowhere. Nobody noticed, because nothing compared them.
 *
 * 🔑 Two definitions of one process is silent drift BY CONSTRUCTION
 * (project_section_gutter_two_implementations). The only defence is a check that reads both.
 *
 * Checks:
 *   1. Same step IDs, in the same ORDER (order is the SOP — it encodes dependency).
 *   2. Same `type` per step (manual/auto/hybrid drives what the UI offers).
 *   3. Every `hasRunner: true` in the admin has a real handler — in flow-execute OR the local runner.
 *
 * Exit 0 = they agree. 1 = drift.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER = path.resolve(HERE, "..");
const WEB = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const LOCAL = path.join(SCRAPER, "flow", "playbooks", "month1.mjs");
const ADMIN = path.join(WEB, "data", "playbooks", "playbooks.json");
const EXEC = path.join(WEB, "netlify", "functions", "flow-execute.js");

for (const f of [LOCAL, ADMIN, EXEC]) {
  if (!fs.existsSync(f)) { console.error(`✗ missing: ${f}`); process.exit(2); }
}

const { month1: local } = await import(LOCAL);
const admin = JSON.parse(fs.readFileSync(ADMIN, "utf8")).month1.filter((t) => t && t.id);
const execSrc = fs.readFileSync(EXEC, "utf8");

const fails = [];
console.log("── delivery SOP: do both sources describe the same process? ──");

// 1. Same IDs, same order.
const lIds = local.map((s) => s.id), aIds = admin.map((t) => t.id);
const onlyLocal = lIds.filter((i) => !aIds.includes(i));
const onlyAdmin = aIds.filter((i) => !lIds.includes(i));

if (onlyLocal.length) {
  fails.push("local-only steps");
  console.log(`  🔴 ${onlyLocal.length} step(s) in the CANONICAL runner that the admin never shows — invisible work:`);
  onlyLocal.forEach((i) => console.log(`       ${i}`));
}
if (onlyAdmin.length) {
  fails.push("admin-only steps");
  console.log(`  🔴 ${onlyAdmin.length} step(s) the admin shows that the canonical runner does not define:`);
  onlyAdmin.forEach((i) => console.log(`       ${i}`));
}
if (!onlyLocal.length && !onlyAdmin.length) {
  console.log(`  ✅ same ${lIds.length} step IDs in both`);
  // Order matters: it encodes the sequence a human follows.
  const misordered = lIds.findIndex((id, i) => aIds[i] !== id);
  if (misordered >= 0) {
    fails.push("order");
    console.log(`  🔴 ORDER differs from position ${misordered + 1}: canonical "${lIds[misordered]}" vs admin "${aIds[misordered]}"`);
  } else {
    console.log("  ✅ identical order");
  }
}

// 2. Same type per step.
const aBy = new Map(admin.map((t) => [t.id, t]));
const typeDrift = local.filter((s) => aBy.has(s.id) && aBy.get(s.id).type !== s.type)
  .map((s) => `${s.id}: canonical=${s.type} admin=${aBy.get(s.id).type}`);
if (typeDrift.length) {
  fails.push("type drift");
  console.log(`  🔴 ${typeDrift.length} step(s) disagree on TYPE — this changes what the UI offers:`);
  typeDrift.forEach((d) => console.log(`       ${d}`));
} else console.log("  ✅ types agree");

// 3. hasRunner must be true only where a handler exists.
//    🔑 A false claim here is the worst of the three: the admin renders a Run button, the user clicks
//    it, and gets a confident wrong explanation instead of the work happening.
// 🔴 The first version regex-matched the step ID in the local file and called that a handler. But a
// MANUAL step is also "defined" there — so `m1.kickoff.call` (no run(), manual) passed while claiming
// hasRunner:true. The check tested EXISTENCE and reported it as EXECUTABILITY, and its sabotage test
// caught it. Ask the imported module directly instead of pattern-matching source text.
const localBy = new Map(local.map((s) => [s.id, s]));
const liars = [];
for (const t of admin) {
  if (!t.hasRunner) continue;
  const canonicalHasRun = typeof localBy.get(t.id)?.run === "function";
  const inExec = new RegExp(`"${t.id.replace(/\./g, "\\.")}"`).test(execSrc);
  if (!canonicalHasRun && !inExec) liars.push(t.id);
}
if (liars.length) {
  fails.push("hasRunner lies");
  console.log(`  🔴 ${liars.length} step(s) claim hasRunner:true with NO handler anywhere:`);
  liars.forEach((i) => console.log(`       ${i}`));
} else console.log(`  ✅ every hasRunner:true claim resolves to a real handler`);

console.log("");
if (fails.length) {
  console.error(`🔴 the two SOP definitions have DRIFTED (${fails.join(", ")}).`);
  console.error(`   flow/playbooks/month1.mjs is CANONICAL — make data/playbooks/playbooks.json match it.`);
  process.exit(1);
}
console.log(`✅ both SOP sources agree — ${lIds.length} steps, same order, same types, no false runner claims`);
