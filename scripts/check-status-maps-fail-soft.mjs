#!/usr/bin/env node
/**
 * check-status-maps-fail-soft.mjs — a status the app writes must never crash the page that reads it.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-06, found from a screenshot: the admin's FLOW panel showed
 *
 *     Flow unavailable: Cannot read properties of undefined (reading 'cls')
 *
 * `renderFlowStepRowScoped` looked a task's status up in a badge map with **no `declined` key and no
 * fallback**, so the lookup returned undefined and `.cls` threw — taking out all 58 onboarding rows.
 *
 * 🔑 THE DAMNING PART: "declined" is a status **the admin writes itself**. `setOnboardStepOutcome()`
 * persists it when you press "Customer declined call tracking" — a first-class button in the same
 * product. The app stored a value its own renderer could not read, and the panel had been dead ever
 * since someone pressed it.
 *
 * 🔴 A missing key is a cosmetic bug. A missing FALLBACK is an outage. One unrecognised string should
 * never be able to hide an entire section ([[feedback-a-dead-check-selector-gap]]).
 *
 * CHECKS
 *   1. Every status/badge map lookup (`}[expr];` closing an object literal with cls:/bg:) must have a
 *      `|| fallback`.
 *   2. Every status the code can WRITE must be a key in the flow badge maps.
 *
 * Exit 0 = fails soft. 1 = a lookup can return undefined. 2 = could not read the sources.
 */
import fs from "node:fs";
import path from "node:path";

const WEB = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FILES = [path.join(WEB, "admin", "admin.js"), path.join(WEB, "portal", "portal.js")];

console.log("── status maps must fail soft ──");

const fails = [];
for (const f of FILES) {
  if (!fs.existsSync(f)) { console.error(`  ✗ missing ${f}`); process.exit(2); }
  const src = fs.readFileSync(f, "utf8");
  const lines = src.split("\n");
  const rel = path.relative(WEB, f);

  lines.forEach((ln, i) => {
    // A map lookup that closes an object literal: `}[something]` — with or without a fallback.
    const m = ln.match(/^\s*\}\[([^\]]+)\]\s*(\|\|)?/);
    if (!m) return;
    // Only care about maps whose entries carry render attributes; those are the ones that crash a row.
    const back = lines.slice(Math.max(0, i - 12), i).join("\n");
    if (!/\b(cls|bg|color|text)\s*:/.test(back)) return;
    if (m[2]) return;                                   // has a `||` fallback — fine
    fails.push(`${rel}:${i + 1}`);
    console.log(`  🔴 ${rel}:${i + 1} — lookup on \`${m[1].trim()}\` has NO fallback.`);
    console.log(`       An unrecognised status returns undefined and the next property read throws.`);
  });
}

// 2. Statuses the code writes must be renderable.
const admin = fs.readFileSync(FILES[0], "utf8");
const WRITTEN = ["done", "skipped", "declined", "blocked", "in_progress", "pending"];
const badgeBlocks = [...admin.matchAll(/const statusBadge = \{([\s\S]{0,700}?)\}\[/g)].map((m) => m[1]);
if (!badgeBlocks.length) {
  console.log("  ▫️  no statusBadge maps found — selector may have drifted; cannot verify coverage");
  process.exit(fails.length ? 1 : 2);
}
badgeBlocks.forEach((blk, n) => {
  // Only the flow maps carry task statuses (done/pending); skip unrelated ones (yes/no/unknown).
  if (!/\bdone\s*:/.test(blk) || !/\bpending\s*:/.test(blk)) return;
  const missing = WRITTEN.filter((s) => !new RegExp(`\\b${s}\\s*:`).test(blk));
  if (missing.length) {
    fails.push(`badge-map-${n}`);
    console.log(`  🔴 flow badge map #${n + 1} has no case for: ${missing.join(", ")}`);
    console.log(`       setOnboardStepOutcome() can write these. A written status must be renderable.`);
  } else {
    console.log(`  ✅ flow badge map #${n + 1} covers all ${WRITTEN.length} writable statuses`);
  }
});

console.log("");
if (fails.length) {
  console.error(`🔴 ${fails.length} status map(s) can return undefined and crash a section.`);
  console.error("   See project_flow_panel_crashed_on_its_own_status.");
  process.exit(1);
}
console.log("✅ every status map has a fallback and covers every status the app can write");
