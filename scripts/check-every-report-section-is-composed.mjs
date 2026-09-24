#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-every-report-section-is-composed.mjs
//
// 🔴 WHY (2026-09-24). A dead-code sweep found that `portal/report/report.js` declares FIVE section
// builders and composes only FOUR. The orphan was `reviewsGapSection()` — the section that shows a
// business with 4 or fewer reviews the single highest-return thing it can do.
//
// 🔑 It was invisible because the function SELF-HIDES above the threshold (`if (n > 4) return ""`).
// A section that legitimately renders nothing for most clients looks identical to a section that is
// never called at all. Nobody was going to notice from the output.
//
// 🔑 And it is the exact gap the product exists to close: RGA's own audit reads 0 reviews while the
// lowest entrant in its map pack holds two. The client report was silent on precisely that.
// → feedback_a_finding_must_be_actionable_inside_the_product · project_review_requests_are_tap_to_send
//
// This is the CLIENT-SIDE twin of check-orphan-functions.mjs, which only ever scanned
// netlify/functions and so could never have seen this.
//
// Deliberately NARROW. A general "dead function" detector over browser bundles cries wolf —
// handlers referenced from markup, dynamic dispatch, and naive comment-stripping that eats code
// spans all produce false positives, and a gate that cries wolf gets muted. This checks one strict
// convention in one small file, so a failure is always real.
//
// exit 0 = every section builder is composed · 1 = one is orphaned · 2 = cannot tell
// → feedback_a_fix_without_a_gate_regresses · feedback_a_test_nobody_runs_is_not_a_guard
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const REPORT = path.join(SITE, "portal", "report", "report.js");

if (!fs.existsSync(REPORT)) {
  console.error(`⚠️  INDETERMINATE — report.js not found at ${REPORT}.`);
  process.exit(2);
}

const src = fs.readFileSync(REPORT, "utf8");

// Mask comments to spaces of equal length so offsets still line up and a `/*` inside a string or a
// regex cannot swallow real code — the failure mode of the ad-hoc sweep that found this defect.
function maskComments(s) {
  const out = s.split("");
  let i = 0;
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== "\n") out[k] = " "; };
  while (i < s.length) {
    const c = s[i], d = s[i + 1];
    if (c === "/" && d === "/") { let j = s.indexOf("\n", i); if (j < 0) j = s.length; blank(i, j); i = j; continue; }
    if (c === "/" && d === "*") { let j = s.indexOf("*/", i + 2); j = j < 0 ? s.length : j + 2; blank(i, j); i = j; continue; }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < s.length) { if (s[j] === "\\") { j += 2; continue; } if (s[j] === c) { j++; break; } j++; }
      i = j; continue;   // leave string CONTENT intact: composition happens inside template literals
    }
    i++;
  }
  return out.join("");
}

// 🔴 HTML comments live INSIDE the template literals, so the JS masker above deliberately leaves
// them alone — and a `<!-- … reviewsGapSection() … -->` note then reads as a call site. Caught by
// mutation-testing this gate: removing the real call still passed, because the comment explaining
// the call was counted as one. Mask those too, or the gate is satisfied by prose about itself.
// → feedback_a_check_must_not_validate_itself
const code = maskComments(src).replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
const declared = [...code.matchAll(/^function\s+([a-zA-Z_$][\w$]*Section)\s*\(/gm)].map((m) => m[1]);

if (declared.length < 3) {
  console.error(`⚠️  INDETERMINATE — only ${declared.length} *Section builder(s) found; the naming `
    + `convention this gate relies on has changed. Re-point it deliberately rather than deleting it.`);
  process.exit(2);
}

const problems = [];
for (const name of declared) {
  // A call site is the name followed by "(" somewhere that is NOT its own declaration.
  const calls = [...code.matchAll(new RegExp(`\\b${name}\\s*\\(`, "g"))].length;
  const decls = [...code.matchAll(new RegExp(`function\\s+${name}\\s*\\(`, "g"))].length;
  if (calls - decls < 1) {
    problems.push(`${name}() is declared but never composed into the report. It was built, it works, `
      + `and no client has ever seen it. A section that self-hides for most clients (an empty string `
      + `below a threshold) is indistinguishable from one that is never called — which is exactly `
      + `how reviewsGapSection went unnoticed.`);
  }
}

if (problems.length) {
  console.error("🔴 A CLIENT-REPORT SECTION IS BUILT BUT NEVER SHOWN\n");
  for (const p of problems) console.error(`  🔴 ${p}\n`);
  console.error("  portal/report/report.js — add it to the section list in the report template.");
  process.exit(1);
}

console.log(`✅ all ${declared.length} client-report sections are composed`);
console.log(`   ${declared.join(" · ")}`);
