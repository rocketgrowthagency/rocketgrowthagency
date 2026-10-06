#!/usr/bin/env node
/**
 * check-no-module-tdz.mjs — a module-level `let`/`const` used above its own declaration.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * TWICE on 2026-09-10, in two different files:
 *
 *   contract-generate.js   exports.WEBSITE_LITE = WEBSITE_LITE   before `const WEBSITE_LITE`
 *                          → threw on module load; caught before deploy only because I ran it.
 *   portal/portal.js       `_portalPlans = plans` at line 307, `let _portalPlans` at line 713
 *                          → SHIPPED. Every client saw "Something went wrong". The portal was down.
 *
 * A module-level `let`/`const` sits in the **Temporal Dead Zone** until its declaration EVALUATES.
 * Touching it earlier throws ReferenceError. Hoisting saves `function`, not `let`.
 *
 * 🔑 `node --check` PASSES on this — it is a runtime error, not a syntax error. A green syntax
 * check is not evidence the module loads.
 *
 * WHAT IT CHECKS: for each module-scope `let`/`const`, no line ABOVE its declaration references it
 * outside a function body... which is undecidable in general. So it uses the cheap, high-signal
 * rule instead: **no ASSIGNMENT to a module-scope binding appears above that binding's
 * declaration.** That is exactly the shape both bugs had, and it has no false positives from
 * ordinary late-called functions.
 *
 * Exit 0 = no module-scope TDZ · 1 = a module can throw on use · 2 = could not scan.
 */
import fs from "node:fs";

// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT — so this gate can be pointed at a scratch
// copy and its mutations actually run. → feedback_a_gate_that_cannot_fail
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";

const FILES = [
  `${__SITE}/portal/portal.js`,
  `${__SITE}/admin/admin.js`,
  `${__SITE}/portal/client-login.js`,
  `${__SITE}/shared/contract-pricing.js`,
  `${__SITE}/shared/contract-doc.js`,
  `${__SITE}/netlify/functions/contract-generate.js`,
  `${__SITE}/netlify/functions/stripe-webhook.js`,
  `${__SITE}/netlify/functions/portal-payment-intent.js`,
];
const SABOTAGE = process.env.SABOTAGE === "1";

console.log("── no module-scope binding is used above its declaration ──");
let fails = 0, scanned = 0;

for (const file of FILES) {
  if (!fs.existsSync(file)) { console.log(`  ▫️  missing, skipped: ${file.split("/").pop()}`); continue; }
  scanned++;
  let lines = fs.readFileSync(file, "utf8").split("\n");
  if (SABOTAGE && file.endsWith("portal.js")) {
    lines = ["_sabotageVar = 1;", ...lines, "let _sabotageVar = null;"];
  }

  // Module-scope declarations = zero indentation. Anything indented is inside a block.
  const decl = new Map();
  lines.forEach((l, i) => {
    const m = /^(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=/.exec(l);
    if (m && !decl.has(m[1])) decl.set(m[1], i + 1);
  });

  const isComment = (l) => /^\s*(\/\/|\*|\/\*)/.test(l);
  const offenders = [];
  for (const [name, declLine] of decl) {
    // `var` hoists to undefined — no TDZ. Only let/const throw.
    if (/^\s*var\s/.test(lines[declLine - 1])) continue;
    for (let i = 0; i < declLine - 1; i++) {
      const l = lines[i];
      if (isComment(l)) continue;
      // an ASSIGNMENT to the binding, above its declaration
      // 🔴 MODULE SCOPE ONLY (zero indentation). The first version flagged any assignment above
      // the declaration, including ones inside functions that run much later — where the
      // declaration has long since evaluated and there is no TDZ at all. It produced a false
      // positive on docsPendingFile (a click handler) within a minute of being written.
      // 🔑 A gate that cries wolf gets muted, and a muted gate is a dormant one.
      if (/^\s/.test(l)) continue;
      if (new RegExp(`(^|[^\\w$.])${name}\\s*=[^=]`).test(l) && !new RegExp(`(let|const|var)\\s+${name}`).test(l)) {
        offenders.push({ name, declLine, useLine: i + 1, text: l.trim().slice(0, 76) });
        break;
      }
    }
  }

  if (!offenders.length) { console.log(`  ✅ ${file.split("/").pop()}`); continue; }
  console.log(`  🔴 ${file.split("/").pop()}`);
  offenders.forEach((o) => {
    console.log(`       ${o.name}: assigned line ${o.useLine}, declared line ${o.declLine}`);
    console.log(`         ${o.text}`);
  });
  fails++;
}

if (!scanned) { console.log("  ⚠️  scanned nothing — the file list is wrong."); process.exit(2); }
if (fails) {
  console.log(`\n🔴 ${fails} file(s) can throw ReferenceError on use.`);
  console.log("   A module-level let/const is in the Temporal Dead Zone until its declaration");
  console.log("   EVALUATES. node --check passes on this — only running the module finds it.");
  process.exit(1);
}
console.log(`\n✅ all ${scanned} module(s): every binding is declared above its first assignment.`);
process.exit(0);
