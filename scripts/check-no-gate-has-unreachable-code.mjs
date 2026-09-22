#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-no-gate-has-unreachable-code.mjs
//
// 🔴 WHY (Chris, 2026-09-22): "lets harden this so it doesnt keep happening or happen again."
//
// Twice in one day I appended a new assertion to a gate AFTER its top-level `process.exit(...)`.
// The code never ran. The gate reported green through every mutation I threw at it, and only
// running those mutations — rather than trusting the green — revealed it. The second time, the
// first occurrence was already written down in memory.
//
// 🔑 A GATE IS THE ONE PIECE OF CODE WHERE "IT NEVER RUNS" IS INVISIBLE. Ordinary dead code shows
// up as a missing feature. Dead code in a gate shows up as a PASS — the most reassuring output it
// has. Nothing else in the repo fails this way.
//
// WHAT IT ASSERTS: no `scripts/check-*.mjs` has executable statements after a TOP-LEVEL
// `process.exit(...)`. Exits nested inside `if`/`try`/functions are normal early-outs and ignored;
// only an exit at brace depth 0 ends the program.
//
// exit 0 = every gate's code is reachable · 1 = a gate has dead code · 2 = cannot tell
// → feedback_dead_check_selector_gap · feedback_a_fix_without_a_gate_regresses
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const files = fs.readdirSync(HERE).filter((f) => f.startsWith("check-") && f.endsWith(".mjs"));

if (!files.length) {
  console.error("⚠️  INDETERMINATE — no check-*.mjs found; this gate is looking in the wrong place.");
  process.exit(2);
}

/**
 * Blank out comments and string/template literals so a `process.exit(` mentioned in prose or inside
 * a quoted example is never mistaken for a real call — and so braces inside strings do not corrupt
 * the depth count. Newlines are preserved so line numbers stay true.
 */
function blankNonCode(src) {
  let out = "", i = 0;
  const keep = (ch) => (ch === "\n" ? "\n" : " ");
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === "//") { while (i < src.length && src[i] !== "\n") out += keep(src[i++]); continue; }
    if (two === "/*") { const e = src.indexOf("*/", i + 2); const end = e === -1 ? src.length : e + 2; while (i < end) out += keep(src[i++]); continue; }
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      const q = c; out += " "; i++;
      while (i < src.length) {
        if (src[i] === "\\") { out += "  "; i += 2; continue; }
        if (src[i] === q) { out += " "; i++; break; }
        out += keep(src[i++]);
      }
      continue;
    }
    out += c; i++;
  }
  return out;
}

const problems = [];
let scanned = 0, exitsFound = 0;

for (const f of files) {
  if (f === path.basename(fileURLToPath(import.meta.url))) continue;   // never judge itself
  const raw = fs.readFileSync(path.join(HERE, f), "utf8");
  const code = blankNonCode(raw);
  scanned++;

  // 🔴 DEPTH-COUNTING BRACES DOES NOT SURVIVE THIS CODEBASE. A first version tracked ()[]{} to find
  // an exit at depth 0 — and reported TEN gates as broken, because these files are full of regex
  // literals like /[^)]*/ and /^[\s;})\]]*$/ whose unbalanced brackets corrupt the count. A mass
  // finding means the PROBE is wrong, not the codebase. → feedback_a_check_must_not_validate_itself
  //
  // 🔑 Every gate here is written in the same house style: top-level statements start at column 0,
  // early-outs inside if/try are indented. So "unindented `process.exit(`" identifies a terminating
  // exit exactly, with no parsing at all.
  const lines = code.split("\n");
  const rawLines = raw.split("\n");
  let exitLine = -1;
  for (let n = 0; n < lines.length; n++) {
    if (/^process\.exit\s*\(/.test(lines[n])) { exitLine = n; break; }
  }
  if (exitLine === -1) continue;
  exitsFound++;

  // Anything executable after it is unreachable — EXCEPT a hoisted declaration.
  //
  // 🔴 `function` and `class` declarations HOIST, so defining a helper below a terminating exit and
  // calling it above is correct, idiomatic, and common here:
  //     if (SELF_TEST) { await selfTest(); process.exit(0); }   // line 42
  //     ...
  //     async function selfTest() { … }                          // line 149  — hoisted, fine
  // A first version flagged exactly that as dead code. A gate that fails correct code gets muted,
  // which costs more than it catches. → feedback_a_cleanup_that_only_runs_on_success_is_not_a_cleanup
  const live = [];
  let skipUntilBalanced = 0, inDecl = false;
  for (let k = exitLine + 1; k < lines.length; k++) {
    const l = lines[k];
    if (inDecl) {
      for (const ch of l) { if (ch === "{") skipUntilBalanced++; else if (ch === "}") skipUntilBalanced--; }
      if (skipUntilBalanced <= 0) { inDecl = false; skipUntilBalanced = 0; }
      continue;
    }
    if (/^(?:export\s+)?(?:async\s+)?function\s|^class\s/.test(l)) {
      inDecl = true; skipUntilBalanced = 0;
      for (const ch of l) { if (ch === "{") skipUntilBalanced++; else if (ch === "}") skipUntilBalanced--; }
      if (skipUntilBalanced <= 0) { inDecl = false; skipUntilBalanced = 0; }
      continue;
    }
    if (l.trim() && !/^[\s;})\]]*$/.test(l)) live.push([l, k]);
  }

  if (live.length) {
    const firstDead = rawLines[live[0][1]] || "";
    problems.push(`${f}: ${live.length} executable line(s) AFTER the top-level process.exit() on `
      + `line ${exitLine + 1}.\n       First unreachable (line ${live[0][1] + 1}): `
      + `"${firstDead.trim().slice(0, 90)}"\n`
      + `       In a gate this reports as a PASS — move the block ABOVE the exit.`);
  }
}

if (!scanned || !exitsFound) {
  console.error(`⚠️  INDETERMINATE — scanned ${scanned} file(s), found ${exitsFound} top-level exit(s). `
    + `The parser has drifted; a gate that finds nothing to check has not checked anything.`);
  process.exit(2);
}

if (problems.length) {
  console.error(`🔴 FAIL — ${problems.length} gate(s) carry unreachable code:\n`);
  for (const p of problems) console.error(`   • ${p}\n`);
  process.exit(1);
}

console.log(`✅ ${scanned} gate(s) scanned, ${exitsFound} with a top-level exit — no executable code `
  + `after any of them.`);
process.exit(0);
