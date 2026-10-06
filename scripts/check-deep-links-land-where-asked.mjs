#!/usr/bin/env node
/**
 * check-deep-links-land-where-asked.mjs — a deep link must open the view it names.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-09, Chris: *"we MUST STOP pipeline being the catch all page im tired of this."*
 *
 * `getRequestedView()` carefully resolves ten view names from `?view=`. The boot path then did:
 *
 *     showView(requestedView === "create" || requestedView === "dashboard" ? requestedView : "list")
 *
 * `list` is the PIPELINE page. So every view except create and dashboard was thrown away:
 * `?view=clients`, `?view=leads`, `?view=calls`, `?view=approvals`, `?view=portal-accounts` — all
 * landed on Pipeline. Every deep link and every reload "reset to Pipeline", and the sidebar
 * highlight followed, so it looked like the app had decided to go there.
 *
 * 🔑 THE SHAPE: **two places deciding the same thing.** The resolver whitelists and falls back;
 * the caller then re-decided with a narrower list and won. A second opinion downstream of a
 * resolver is not a safety net — it is an override.
 *
 * Exit 0 = the boot path honours the resolver · 1 = views are being overridden · 2 = cannot tell.
 */
import fs from "node:fs";

// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT. A gate that can only ever read the real
// working tree cannot be pointed at a scratch copy, so its mutations cannot be run — and a
// gate nobody can make fail is a gate nobody has checked. Found 2026-10-06 when three
// mutations of `check-refusal-is-not-done` all came back green: it was reading straight past
// them. → feedback_a_gate_that_cannot_fail · feedback_the_harness_i_wrote_to_check_my_work_can_lie
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const ADMIN = `${__SITE}/admin/admin.js`;
const SABOTAGE = process.env.SABOTAGE === "1";
if (!fs.existsSync(ADMIN)) { console.error("  ✗ admin.js not found"); process.exit(2); }

let src = fs.readFileSync(ADMIN, "utf8");
// 🔴 Strip comments — the comment explaining this fix quotes the defective line verbatim, and a
// naive scan reads its own documentation as code. That trap has fired repeatedly.
src = src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/(^|[^:"'])\/\/[^\n]*/g, (m, p) => p + " ".repeat(m.length - p.length));

if (SABOTAGE) {
  src = src.replace(/showView\(requestedView\);/,
    'showView(requestedView === "create" || requestedView === "dashboard" ? requestedView : "list");');
}

console.log("── a deep link must open the view it names ──");
const fails = [];

// 1. Which views can the resolver return?
const resolved = [...src.matchAll(/if \(rawView === "([a-z-]+)"\) return "([a-z-]+)";/g)].map((m) => m[2]);
if (resolved.length < 5) { console.error("  ✗ could not read getRequestedView — probe wrong"); process.exit(2); }
console.log(`  resolver can return: ${[...new Set(resolved)].join(", ")}`);

// 2. The boot path must not re-decide with a narrower whitelist.
const override = src.match(/showView\(\s*requestedView\s*===\s*"[a-z-]+"[^)]*\?[^)]*:\s*"([a-z-]+)"\s*\)/);
if (override) {
  const forced = override[1];
  const allowed = [...override[0].matchAll(/requestedView\s*===\s*"([a-z-]+)"/g)].map((m) => m[1]);
  const lost = [...new Set(resolved)].filter((v) => v !== "client" && v !== forced && !allowed.includes(v));
  fails.push("boot path overrides the resolver");
  console.log(`  🔴 the boot path forces every view except ${allowed.join("/")} to "${forced}"`);
  console.log(`     ${lost.length} view(s) silently redirected: ${lost.join(", ")}`);
} else if (/showView\(requestedView\);/.test(src)) {
  console.log("  ✅ the boot path passes the resolved view straight through");
} else {
  console.log("  ▫️  boot path not recognised — renamed?");
  process.exit(2);
}

// 3. Every view the resolver returns needs a flag, or code reading flags cannot see it.
const flagsBlock = src.match(/const flags = \{[\s\S]*?\n\s*\};/);
if (flagsBlock) {
  const flagged = [...flagsBlock[0].matchAll(/([a-zA-Z]+):\s*name ===/g)].map((m) => m[1].toLowerCase().replace(/[^a-z]/g, ""));
  const missing = [...new Set(resolved)].filter((v) => !flagged.includes(v.replace(/[^a-z]/g, "")));
  if (missing.length) {
    fails.push("views with no flag");
    console.log(`  🔴 resolver returns these but the flags map has no entry: ${missing.join(", ")}`);
  } else {
    console.log(`  ✅ all ${new Set(resolved).size} resolvable views have a flag`);
  }
}

console.log("");
if (fails.length) {
  console.error(`🔴 deep links do not land where they say (${fails.join(", ")}).`);
  console.error("   A second opinion downstream of a resolver is not a safety net — it is an override.");
  process.exit(1);
}
console.log("✅ every deep link opens the view it names");
