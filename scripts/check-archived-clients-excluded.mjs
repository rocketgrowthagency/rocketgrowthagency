#!/usr/bin/env node
/**
 * check-archived-clients-excluded.mjs — an archived client is not work, not revenue, not a KPI.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * Archiving shipped 2026-09-05. Every READ path still carried the pre-archive definition of "live",
 * and I found them one screenshot at a time over a single day:
 *
 *   1. dashboard work queue  → queued "Contract awaiting signature" for an archived client
 *   2. pipeline KPI strip    → counted it
 *   3. pipeline BOARD        → a card in the Contract column with a next action nobody will do
 *   4. headline counts       → "2 active" when one of the two was archived
 *   5. MRR + rank averages   → an archived client inflating the book
 *
 * 🔑 Fixes 3–5 only happened because Chris sent another screenshot. **I fixed the two places I could
 * see instead of sweeping for the predicate** — which is exactly what
 * [[feedback-a-new-lifecycle-state-must-be-taught-to-every-filter]] warns about, written that same
 * morning. Knowing the rule did not make me apply it; only a mechanical check does.
 *
 * CHECK
 *   Every client-partitioning expression in admin.js (a status/stage filter, or a forEach that
 *   accumulates money or averages) must be archived-aware — either testing `archived_at` itself, or
 *   consuming a set that already did.
 *
 * Exit 0 = archived is excluded everywhere it should be. 1 = a leak. 2 = could not analyse.
 */
import fs from "node:fs";

const ADMIN = "/Users/chris/RGA/Rocket Growth Agency Website VS Code/admin/admin.js";

// Expressions that partition clients for WORK, MONEY or KPIs. Each must be archived-aware.
// Deliberately narrow: the Clients LIST is allowed to show archived rows (that is how you find and
// restore one), so this targets the surfaces where an archived row is a lie.
const PATTERNS = [
  { re: /const\s+live\s*=\s*clients\.filter\(/g, what: "a 'live' client set" },
  { re: /const\s+live\s*=\s*visible\.filter\(/g, what: "a 'live' visible set" },
  { re: /clients\.filter\(\(c\)\s*=>\s*String\(c\.status[^)]*\)\s*===\s*"active"\)/g, what: "an active-client count" },
  { re: /clients\.filter\(\(c\)\s*=>\s*String\(c\.status[^)]*\)\s*===\s*"onboarding"\)/g, what: "an onboarding count" },
  { re: /^\s*clients\.forEach\(\(c\)\s*=>\s*\{/gm, what: "a client accumulation loop (MRR / averages)" },
];

if (!fs.existsSync(ADMIN)) { console.error("  ✗ admin.js not found"); process.exit(2); }
const src = fs.readFileSync(ADMIN, "utf8");
const lines = src.split("\n");

console.log("── archived clients must be excluded from work, money and KPIs ──");

const leaks = [];
for (const { re, what } of PATTERNS) {
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(src)) !== null) {
    const line = src.slice(0, m.index).split("\n").length;
    // Archived-aware if this expression tests archived_at, or the 12 lines around it do (the set it
    // consumes was filtered just above).
    const win = lines.slice(Math.max(0, line - 8), line + 4).join("\n");
    if (/archived_at/.test(m[0]) || /archived_at/.test(win)) continue;
    leaks.push({ line, what });
    console.log(`  🔴 admin.js:${line} — ${what} that does not exclude archived clients.`);
  }
}

// 🔴🔴 STRUCTURAL CHECK — the regex list above did NOT catch the leak this gate was written for.
// Sabotage-testing it by deleting `visible = visible.filter((c) => !c.archived_at)` from
// renderClientBoard() still passed, because that expression matches none of the patterns. A gate that
// cannot catch its own founding bug is worse than no gate: it certifies the thing it misses.
//
// So: name the surfaces that MUST be archived-aware and assert it inside each function body.
const MUST_FILTER = {
  renderClientBoard: "the Pipeline board — an archived client rendered as a card with a next action",
  renderPipelineKpis: "the Pipeline KPI strip",
};
for (const [fn, why] of Object.entries(MUST_FILTER)) {
  const m = src.match(new RegExp(`function\\s+${fn}\\s*\\([^)]*\\)\\s*\\{`));
  if (!m) {
    console.log(`  ▫️  ${fn}() not found — selector drifted, cannot verify`);
    process.exit(2);
  }
  // Brace-match the body.
  let depth = 0, end = m.index;
  const open = src.indexOf("{", m.index);
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (!depth) { end = i; break; } }
  }
  const body = src.slice(open, end);
  if (!/archived_at/.test(body)) {
    const line = src.slice(0, m.index).split("\n").length;
    leaks.push({ line, what: `${fn}() — ${why}` });
    console.log(`  🔴 admin.js:${line} — ${fn}() does not exclude archived clients (${why}).`);
  }
}

if (!leaks.length) {
  const guards = (src.match(/archived_at/g) || []).length;
  console.log(`  ✅ every partitioning expression is archived-aware (${guards} archived_at guards in admin.js)`);
}

console.log("");
if (leaks.length) {
  console.error(`🔴 ${leaks.length} archived-client leak(s).`);
  console.error("   An archived client shown as work trains you to skim the queue; shown as revenue it");
  console.error("   overstates the book. See feedback_a_new_lifecycle_state_must_be_taught_to_every_filter.");
  process.exit(1);
}
console.log("✅ archived clients are excluded from work queues, boards, counts and money");
