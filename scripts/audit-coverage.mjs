#!/usr/bin/env node
/**
 * audit-coverage.mjs — how much of the onboarding audit is actually automated.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * Chris, 2026-09-05: "list all things we should be checking?"
 *
 * 🔑 An audit that lives only in code cannot tell you what it does NOT check. Every gap is invisible,
 * and a report full of green ticks reads as completeness we do not have. config/onboarding-audit-spec.json
 * declares the FULL intended surface; this reports honestly against it.
 *
 * 🔴 A `gap` is not a failure — it is a known, named, deliberate absence. The failure mode this
 * prevents is the opposite: quietly shipping an audit that covers 40% while looking like it covers
 * everything. Same principle as the almanac's publish bar.
 *
 * Commands:
 *   audit-coverage.mjs             coverage summary by surface
 *   audit-coverage.mjs gaps        every gap, ordered by ranking weight — the build backlog
 *   audit-coverage.mjs verify      🔴 check each `automated` claim names a file that exists
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const WEB = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SPEC = path.join(REPO, "config", "onboarding-audit-spec.json");

if (!fs.existsSync(SPEC)) { console.error(`✗ spec not found: ${SPEC}`); process.exit(2); }
const spec = JSON.parse(fs.readFileSync(SPEC, "utf8"));
const cmd = process.argv[2] || "summary";

const all = [];
for (const [key, surface] of Object.entries(spec.surfaces)) {
  for (const c of surface.checks) all.push({ ...c, surface: key, surfaceLabel: surface.label });
}
const byStatus = (s) => all.filter((c) => c.status === s);

if (cmd === "summary") {
  console.log(`── onboarding audit coverage (spec ${spec.version}) ──\n`);
  for (const [key, surface] of Object.entries(spec.surfaces)) {
    const cs = surface.checks;
    const a = cs.filter((c) => c.status === "automated").length;
    const m = cs.filter((c) => c.status === "manual").length;
    const g = cs.filter((c) => c.status === "gap").length;
    const bar = "█".repeat(Math.round((a / cs.length) * 20)).padEnd(20, "░");
    console.log(`  ${surface.label.padEnd(28)} ${bar} ${String(a).padStart(2)}/${cs.length} automated` +
      `${m ? `, ${m} manual` : ""}${g ? `, ${g} GAP` : ""}`);
  }
  const a = byStatus("automated").length, m = byStatus("manual").length, g = byStatus("gap").length;
  console.log(`\n  TOTAL  ${all.length} checks · ${a} automated · ${m} manual · ${g} gaps`);
  console.log(`         ${Math.round(a / all.length * 100)}% automated, ` +
    `${Math.round((a + m) / all.length * 100)}% covered at all\n`);

  // The weighted view is the one that matters: 10 trivial gaps cost less than 2 weight-5 ones.
  const wSum = (list) => list.reduce((s, c) => s + (c.weight || 0), 0);
  const covered = wSum(all.filter((c) => c.status !== "gap"));
  console.log(`  By ranking WEIGHT: ${covered}/${wSum(all)} (${Math.round(covered / wSum(all) * 100)}%) ` +
    `— the number that matters, since a weight-5 gap costs more than five weight-1 ones.`);
  const heavy = byStatus("gap").filter((c) => (c.weight || 0) >= 5);
  if (heavy.length) {
    console.log(`\n  🔴 ${heavy.length} gap(s) at MAXIMUM weight:`);
    heavy.forEach((c) => console.log(`     ${c.id.padEnd(26)} ${c.label}`));
  }
}

if (cmd === "gaps") {
  const gaps = byStatus("gap").sort((a, b) => (b.weight || 0) - (a.weight || 0));
  console.log(`── ${gaps.length} gaps, heaviest first — this is the build backlog ──\n`);
  let lastW = null;
  for (const c of gaps) {
    if (c.weight !== lastW) { console.log(`  ${"─".repeat(6)} weight ${c.weight} ${"─".repeat(46)}`); lastW = c.weight; }
    console.log(`  ${c.id.padEnd(28)} ${c.label}`);
    if (c.note) console.log(`      ${c.note.replace(/\s+/g, " ").slice(0, 150)}`);
  }
}

if (cmd === "verify") {
  // 🔴 The whole spec is worthless if `automated` is aspirational. Every such claim names an impl;
  // check the file it names actually exists. This is the same discipline as NOT_PREFLIGHT excuses
  // being verified against their named runner.
  console.log("── verifying every `automated` claim ──\n");
  const fails = [];
  for (const c of byStatus("automated")) {
    if (!c.impl) { fails.push(`${c.id}: marked automated but names no impl`); console.log(`  🔴 ${c.id.padEnd(26)} no impl named`); continue; }
    const file = c.impl.split(":")[0];
    const candidates = [
      path.join(WEB, "netlify", "functions", `${file}.js`),
      path.join(REPO, "scripts", file),
      path.join(REPO, "scripts", `${file}.mjs`),
      path.join(WEB, "netlify", "functions", file),
    ];
    const found = candidates.find((p) => fs.existsSync(p));
    if (found) console.log(`  ✅ ${c.id.padEnd(26)} ${c.impl}`);
    else { fails.push(`${c.id}: impl "${c.impl}" names no file that exists`); console.log(`  🔴 ${c.id.padEnd(26)} ${c.impl} — NO SUCH FILE`); }
  }
  console.log("");
  if (fails.length) {
    console.error(`🔴 ${fails.length} automated claim(s) cannot be substantiated — the spec is lying`);
    process.exit(1);
  }
  console.log(`✅ all ${byStatus("automated").length} automated claims name a real implementation`);
}
