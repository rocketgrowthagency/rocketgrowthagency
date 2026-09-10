#!/usr/bin/env node
/**
 * check-no-shadowed-functions.mjs — a redefined function silently replaces the one you edited.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-09, THREE times in one session. Patching admin.js by inserting a rewritten helper left the
 * OLD copy in place further down the file. JavaScript hoists both and the LAST declaration wins — so
 * the new code parsed, deployed, and did nothing:
 *
 *     wireMarketPicker      defined twice — the stale <datalist> version overrode the new dropdown
 *     wireIndustryPicker    defined twice
 *     loadIndustryOptions   defined twice
 *
 * Every symptom pointed at the browser: "still not doing it", "not showing". Nothing was cached and
 * nothing was wrong with the fix — it was being shadowed by its own predecessor.
 *
 * 🔑 `node --check` CANNOT SEE THIS. Two `function` declarations of the same name is perfectly legal
 * JavaScript. A syntax check proves the file parses, not that it does what the source appears to say.
 *
 * Also flags duplicate top-level `let`/`const` of the same name, which IS a SyntaxError and would
 * take the whole admin down.
 *
 * Exit 0 = no shadowing · 1 = a definition is dead · 2 = could not tell.
 */
import fs from "node:fs";

const FILES = [
  "/Users/chris/RGA/Rocket Growth Agency Website VS Code/admin/admin.js",
  "/Users/chris/RGA/Rocket Growth Agency Website VS Code/portal/portal.js",
];
const SABOTAGE = process.env.SABOTAGE === "1";

console.log("── no function may be silently redefined ──");
let fails = 0, scanned = 0;

for (const f of FILES) {
  if (!fs.existsSync(f)) { console.log(`  ▫️  ${f.split("/").pop()} — not present, skipped`); continue; }
  let src = fs.readFileSync(f, "utf8");
  // 🔴 Strip comments first: this file's own documentation quotes `function wireMarketPicker` while
  // explaining the bug, and an earlier gate today matched its own prose.
  src = src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'])\/\/[^\n]*/g, (m, p) => p + " ".repeat(m.length - p.length));

  if (SABOTAGE && f.endsWith("admin.js")) {
    src += "\nfunction wireMarketPicker(form) { /* stale duplicate */ }\n";
  }

  const name = f.split("/").pop();
  scanned++;

  const fns = {};
  for (const m of src.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)) {
    (fns[m[1]] ||= []).push(src.slice(0, m.index).split("\n").length);
  }
  const dupFns = Object.entries(fns).filter(([, v]) => v.length > 1);

  const vars = {};
  for (const m of src.matchAll(/^(?:let|const)\s+([A-Za-z_$][\w$]*)\s*=/gm)) {
    (vars[m[1]] ||= []).push(src.slice(0, m.index).split("\n").length);
  }
  const dupVars = Object.entries(vars).filter(([, v]) => v.length > 1);

  if (!dupFns.length && !dupVars.length) {
    console.log(`  ✅ ${name.padEnd(12)} ${Object.keys(fns).length} top-level functions, none redefined`);
    continue;
  }
  fails += dupFns.length + dupVars.length;
  dupFns.forEach(([n, l]) => {
    console.log(`  🔴 ${name}: function ${n}() defined ${l.length}× (lines ${l.join(", ")})`);
    console.log(`     the LAST one wins — every earlier definition is dead code`);
  });
  dupVars.forEach(([n, l]) => {
    console.log(`  🔴 ${name}: top-level ${n} declared ${l.length}× (lines ${l.join(", ")}) — SyntaxError risk`);
  });
}

if (!scanned) { console.error("  ✗ no files scanned — probe is wrong"); process.exit(2); }

console.log("");
if (fails) {
  console.error(`🔴 ${fails} shadowed definition(s). node --check cannot see this — redeclaring a`);
  console.error("   function is legal JS, so the fix you deployed may simply never run.");
  process.exit(1);
}
console.log("✅ no shadowed definitions");
