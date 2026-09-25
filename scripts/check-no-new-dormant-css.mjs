#!/usr/bin/env node
/**
 * check-no-new-dormant-css.mjs — a style rule nothing can ever match is dormant code.
 *
 * 2026-09-25. Removing the three dead rules left over from the kickoff picker raised the obvious
 * question: how many more are there? 71, across portal.css and admin.css — leftovers from views that
 * were replaced (the old dashboard, an `ax-*` board, `fct-*`/`fq-*` from a mockup that shipped in a
 * different shape).
 *
 * 🔴 THIS GATE DOES NOT DEMAND THEY BE DELETED. Deleting 71 rules unread is a bigger risk than
 * carrying them: each one costs bytes, and a wrong delete costs a broken surface. What it does is
 * LOCK THE NUMBER, so the debt can shrink and can never quietly grow — the same shape as the client
 * instruction backlog, which went to zero once it could not get worse.
 *
 * 🔑 A CLASS NAME CAN BE BUILT. `cc-when-${key}` and "admin-repeater-row-" + id never appear whole
 * in the source, so a literal search calls them dead and is wrong. A name is only counted here when
 * neither the whole name NOR any prefix-followed-by-interpolation appears in the code.
 * → feedback_a_literal_grep_misses_computed_writes
 *
 * Exit 0 = the count did not grow · 1 = new dormant rules · 2 = could not tell.
 */
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SHEETS = ["portal/portal.css", "admin/admin.css"];

// The ceiling, measured 2026-09-25. Lower it whenever a cleanup lands. Never raise it.
const BASELINE = { "portal/portal.css": 20, "admin/admin.css": 51 };

const SKIP_DIRS = new Set(["node_modules", ".git", ".netlify", "reports"]);
const CODE = /\.(js|mjs|cjs|html|json)$/;

function readAllCode(root) {
  let out = "";
  let files = 0;
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (SKIP_DIRS.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (CODE.test(e.name)) { try { out += fs.readFileSync(p, "utf8"); files++; } catch {} }
    }
  };
  walk(root);
  return { text: out, files };
}

function dormantIn(cssPath, code) {
  const src = fs.readFileSync(path.join(SITE, cssPath), "utf8");
  const names = new Set([...src.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]{2,})/g)].map((m) => m[1]));
  const dormant = [];
  for (const name of names) {
    if (code.includes(name)) continue;
    // Could it be assembled? Look for the prefix immediately before an interpolation or a concat.
    const parts = name.split("-");
    let built = false;
    for (let i = parts.length - 1; i >= 1 && !built; i--) {
      const prefix = parts.slice(0, i).join("-") + "-";
      const esc = prefix.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      if (new RegExp(esc + "(\\$\\{|[\"'`]\\s*\\+)").test(code)) built = true;
    }
    if (!built) dormant.push(name);
  }
  return dormant.sort();
}

console.log("── no NEW dormant CSS ──");

const { text: code, files } = readAllCode(SITE);
// 🔴 An empty haystack would mark EVERY class dormant and read as a catastrophic regression. That is
// a broken gate, not a finding. → feedback_indeterminate_is_not_a_finding
if (files < 50 || code.length < 200000) {
  console.log(`  ⚠️  only ${files} code file(s) / ${code.length} chars read from ${SITE} — cannot judge.`);
  process.exit(2);
}

let failed = false;
let total = 0;

for (const sheet of SHEETS) {
  const full = path.join(SITE, sheet);
  if (!fs.existsSync(full)) {
    console.log(`  ⚠️  ${sheet} not found — cannot judge.`);
    process.exit(2);
  }
  const dormant = dormantIn(sheet, code);
  const cap = BASELINE[sheet];
  total += dormant.length;
  if (dormant.length > cap) {
    failed = true;
    console.log(`  🔴 ${sheet}: ${dormant.length} dormant rule(s), baseline ${cap} — ${dormant.length - cap} NEW.`);
    console.log(`       ${dormant.join(" ")}`);
  } else if (dormant.length < cap) {
    console.log(`  ✅ ${sheet}: ${dormant.length} dormant (baseline ${cap}) — ${cap - dormant.length} cleaned up.`);
    console.log(`       🔑 Lower BASELINE["${sheet}"] to ${dormant.length} in this file so it cannot creep back.`);
  } else {
    console.log(`  ✅ ${sheet}: ${dormant.length} dormant, unchanged from baseline.`);
  }
}

if (failed) {
  console.log("\n🔴 A rule nothing can match is dead weight every browser still downloads and parses.");
  console.log("   Either emit the class, or delete the rule. Do not raise the baseline.");
  process.exit(1);
}

console.log(`\n✅ ${total} known-dormant rule(s), none new. Debt may shrink; it may not grow.`);
process.exit(0);
