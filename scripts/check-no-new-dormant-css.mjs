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
  // 🔴 STRIP COMMENTS FIRST. This scanned the raw file, so a class name MENTIONED in a comment —
  // "exactly as `.cal-foot` is in the approved mockup" — was counted as a declared rule and then
  // reported as dormant. The gate flagged prose. A selector only exists outside a comment.
  const src = fs.readFileSync(path.join(SITE, cssPath), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴🔴 A `var()` FALLBACK BESIDE A DECLARED TOKEN IS DORMANT CODE THAT READS AS A DECISION.
//
// 2026-09-26. Porting the client's five message shapes into admin.css, I wrote
// `border-left-color: var(--admin-warning, #b45309)` — meaning "the client's orange". But
// `--admin-warning` IS declared (#8a5a00, a brown), so the declared value always wins and the
// fallback is unreachable. Live, the shapes rendered in the admin's brown: the exact drift the port
// existed to prevent. The code SAID #b45309, the screen SHOWED #8a5a00, and every reader of the
// source would have agreed with me. A fallback only applies when the token is ABSENT.
//
// 🔑 This is worse than an unmatched rule, because an unmatched rule is merely inert — this one
// actively misinforms the next person about what colour the surface is.
// → feedback_a_css_rule_that_looks_applied_can_be_losing
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 AND IT MUST BE BASELINED, NOT ZEROED. My first version demanded zero and reported 180 — the
// house style across both sheets is `var(--token, #hex-from-the-mockup)`, and almost all of those
// fallbacks are unreachable and harmless. It failed identically with and without the bug it was
// written for, which is a gate that cannot PASS: exactly as worthless as one that cannot fail.
// → feedback_a_gate_that_cannot_fail
const FALLBACK_BASELINE = { "portal/portal.css": 81, "admin/admin.css": 71 };
console.log("\n── no NEW var() fallback that can never apply ──");
let deadFallbacks = 0;
for (const sheet of SHEETS) {
  let sheetDead = 0;
  const src = fs.readFileSync(path.join(SITE, sheet), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  // Which custom properties does this sheet actually declare a value for?
  const declared = new Set([...src.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map((m) => m[1]));
  for (const m of src.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)\s*,\s*([^),;]+)\)/g)) {
    const [, token, fallback] = m;
    if (!declared.has(token)) continue;                    // genuinely a fallback — fine
    // 🔑 Only judge COLOURS. A declared token with a differing numeric fallback (a length, a
    // z-index) is harmless belt-and-braces; a differing colour is a lie about what you will see.
    if (!/^#[0-9a-fA-F]{3,8}$/.test(fallback.trim())) continue;
    // What is the token's own value? Compare only when both are plain hex.
    const decl = src.match(new RegExp(token.replace(/-/g, "\\-") + "\\s*:\\s*(#[0-9a-fA-F]{3,8})\\s*[;}]"));
    if (!decl) continue;                                   // computed/derived — cannot compare
    const norm = (h) => h.toLowerCase().replace(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/, "#$1$1$2$2$3$3");
    if (norm(decl[1]) === norm(fallback.trim())) continue;  // agrees — no one is misled
    sheetDead++;
    deadFallbacks++;
    // Only NAME the offenders when the sheet is over its ceiling — otherwise 180 lines of known debt
    // buries the one line that is new.
    if (sheetDead > (FALLBACK_BASELINE[sheet] ?? 0)) {
      failed = true;
      console.log(`  🔴 ${sheet}: var(${token}, ${fallback.trim()}) — ${token} is declared ${decl[1]}, so`);
      console.log(`       ${fallback.trim()} NEVER applies. The source claims one colour, the screen shows another.`);
      console.log(`       Fix: use the colour you mean directly, or give it its OWN token (e.g. --pm-turn).`);
    }
  }
  const cap = FALLBACK_BASELINE[sheet] ?? 0;
  if (sheetDead > cap) console.log(`  🔴 ${sheet}: ${sheetDead} unreachable colour fallback(s), baseline ${cap} — ${sheetDead - cap} NEW.`);
  else if (sheetDead < cap) console.log(`  ✅ ${sheet}: ${sheetDead} unreachable (baseline ${cap}) — 🔑 lower FALLBACK_BASELINE["${sheet}"] to ${sheetDead}.`);
  else console.log(`  ✅ ${sheet}: ${sheetDead} unreachable colour fallback(s), unchanged from baseline.`);
}

if (failed) {
  console.log("\n🔴 A rule nothing can match is dead weight every browser still downloads and parses.");
  console.log("   Either emit the class, or delete the rule. Do not raise the baseline.");
  process.exit(1);
}

console.log(`\n✅ ${total} known-dormant rule(s), none new. Debt may shrink; it may not grow.`);
process.exit(0);
