#!/usr/bin/env node
/**
 * check-portal-data-boundary.mjs — the client portal never touches RGA's work product.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * Chris, 2026-09-05: "all the saving and data is stored in admin portal and client is merely the
 * basics and reporting."
 *
 * 🔑 THE BOUNDARY, stated precisely — the portal DOES write, and that is correct:
 *
 *   ✅ ALLOWED — things the CLIENT supplies or does:
 *      their photos, their customer list, their onboarding answers, their activity trail.
 *      That is the "basics" half. A portal that could not accept input would be useless.
 *
 *   🔴 FORBIDDEN — RGA's WORK PRODUCT:
 *      client_state_snapshots (every audit), client_change_log (the before→after ledger),
 *      brain_action_log, lead_intakes (other businesses' data).
 *
 *   ▫️  ALLOWED VIA A GATED FUNCTION — vertical_benchmarks. See ALLOWED_VIA_FUNCTION below; it
 *      surfaces a BENCHMARK ("top performers in your vertical hold N reviews"), never the corpus.
 *
 * Two independent reasons the forbidden list is forbidden:
 *
 * 1. 🔴 COMMERCIAL. Chris, 2026-07-24: "if they know everything they can just copy and stop our
 *    service." The audit findings and the prioritised fix plan ARE the engagement
 *    (feedback_client_never_sees_playbook). The portal shows OUTCOMES — rankings, calls, reports.
 *    Admin shows the WORK.
 *
 * 2. 🔴 INTEGRITY. client_state_snapshots is append-only and client_change_log requires a
 *    before-state; they are the evidence that our work caused a result
 *    (project_data_ownership_system). Nothing reachable from a browser session should be able to
 *    write to either.
 *
 * Exit 0 = boundary intact. 1 = the portal touches something it must not.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const PORTAL = path.join(WEB, "portal");

// RGA's work product. The portal must neither read nor write these.
const FORBIDDEN = [
  { table: "client_state_snapshots", why: "every audit we run — the fix plan lives here" },
  { table: "client_change_log", why: "the before→after ledger proving our work caused results" },
  { table: "brain_action_log", why: "internal Brain decisions" },
  { table: "lead_intakes", why: "other businesses' data — never one client's to see" },
];

// 🔑 DELIBERATELY ALLOWED, and worth explaining because it looks like a violation.
// `vertical_benchmarks` reaches the portal ONLY through portal-vertical-targets, which is
// auth-gated and returns ONE row for the client's own search term with four fields. It powers the
// "Benchmark Targets" card — "top performers in your vertical hold N reviews" — so RGA's targets are
// empirical rather than arbitrary. That is REPORTING, which is the portal's job. It exposes a
// benchmark, never the corpus and never our methodology.
const ALLOWED_VIA_FUNCTION = {
  vertical_benchmarks: "read only via the auth-gated portal-vertical-targets endpoint, scoped to the client's own search term",
};

// Internal surfaces that must never render client-side.
const FORBIDDEN_SYMBOLS = [
  { sym: "renderFixPlan", why: "the prioritised fix plan is admin-only" },
  { sym: "automatable_now", why: "internal automation planning" },
  { sym: "onboarding-audit-spec", why: "our audit methodology" },
];

if (!fs.existsSync(PORTAL)) { console.error(`✗ portal dir not found: ${PORTAL}`); process.exit(2); }

const files = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|html)$/.test(e.name)) files.push(p);
  }
};
walk(PORTAL);

const fails = [];
console.log("── client portal data boundary ──");

// 🔴 STRIP COMMENTS FIRST. The first version flagged `vertical_benchmarks` because portal.js
// MENTIONS it in a comment explaining where the data comes from. A guard that cannot tell a query
// from a code comment produces false positives, and a false positive in a boundary check is how a
// real one later gets waved through as "probably another comment".
const stripComments = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, " ")      // block comments
  .replace(/^\s*\/\/.*$/gm, " ")           // whole-line // comments
  .replace(/([^:])\/\/.*$/gm, "$1");        // trailing // comments, sparing "https://"

const code = new Map(files.map((f) => [f, stripComments(fs.readFileSync(f, "utf8"))]));

for (const { table, why } of FORBIDDEN) {
  const hits = files.filter((f) => code.get(f).includes(table));
  if (hits.length) {
    fails.push(table);
    console.log(`  🔴 ${table} referenced in ${hits.map((h) => path.basename(h)).join(", ")} — ${why}`);
  }
}
for (const { sym, why } of FORBIDDEN_SYMBOLS) {
  const hits = files.filter((f) => code.get(f).includes(sym));
  if (hits.length) {
    fails.push(sym);
    console.log(`  🔴 "${sym}" appears in ${hits.map((h) => path.basename(h)).join(", ")} — ${why}`);
  }
}

// Report what the portal DOES write, so the allowed half stays visible and reviewable rather than
// becoming an unexamined blank cheque.
const portalJs = [...code.values()].join("\n");
const writes = [...portalJs.matchAll(/\.from\("([a-z_]+)"\)\s*\n?\s*\.\s*(insert|update|upsert|delete)/g)]
  .map((m) => `${m[1]}.${m[2]}`);
const uniqueWrites = [...new Set(writes)].sort();

if (!fails.length) {
  console.log(`  ✅ no forbidden table or symbol appears in portal CODE (comments ignored)`);
  for (const [t, why] of Object.entries(ALLOWED_VIA_FUNCTION)) console.log(`  ▫️  ${t} — allowed: ${why}`);
  console.log(`  ℹ️  portal writes (all client-supplied, which is the "basics" half):`);
  uniqueWrites.forEach((w) => console.log(`       ${w}`));
}

console.log("");
if (fails.length) {
  console.error(`🔴 the portal touches ${fails.length} thing(s) it must not.`);
  console.error(`   Admin stores the data and the work. The client portal is basics + reporting only.`);
  process.exit(1);
}
console.log("✅ boundary intact: admin holds the work product, the portal holds basics + reporting");
