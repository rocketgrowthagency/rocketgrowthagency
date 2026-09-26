#!/usr/bin/env node
/**
 * check-no-native-browser-dialogs.mjs — no popup may bypass the dialog system.
 *
 * ─── WHY ─────────────────────────────────────────────────────────────────────────────────────────
 * Chris, 2026-09-26, after the dialog system shipped: *"check for all other popups in case you
 * missed some."* I had. Fifty-six raw `alert()` / `confirm()` / `prompt()` calls bypassed it
 * entirely — 36 in the admin, 20 in the client portal.
 *
 * These cannot be styled, they freeze the page, and the browser captions them with our own domain:
 * a paying client saw a grey OS box reading **"www.rocketgrowthagency.com says"** with everything
 * around it designed. One admin `confirm()` guarded *"Send this to the client? They will see it in
 * their portal immediately."* — an irreversible outward action wearing the least serious shell in
 * the product, while "Delete this note?" had a proper red dialog.
 *
 * 🔑 THE REAL LESSON IS ABOUT THE AUDIT, NOT THE DIALOGS. I rebuilt 57 modals and reported the job
 * done, having enumerated only the two helpers I already knew about. "All the popups" was a claim
 * about which function names I had thought to grep for.
 * → feedback_a_literal_grep_misses_computed_writes · feedback_fix_the_class_not_the_instance
 *
 * Exit 0 = none · 1 = a native dialog is back · 2 = could not tell.
 */
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";

// 🔴🔴 MY FIRST VERSION NAMED FOUR FILES — and that list was the same mistake one level up. It
// missed `admin/calls.js` (a window.alert in the Call Console) and two standalone playbook pages
// whose reset button used a native confirm inside an inline <script>. A hand-written file list is a
// claim about what I thought to include; it goes stale the moment anyone adds a file.
// 🔑 WALK THE TREE instead. Every .js and every inline <script> in every .html the site serves.
// → feedback_an_inventory_is_a_claim_about_what_i_thought_to_grep
const SKIP_DIRS = new Set(["node_modules", ".git", ".netlify", "vendor", "reports", "docs", "netlify", "scripts"]);

// 🔑 `window.`-prefixed forms count too. My first conversion pass excluded them with a lookbehind on
// `.` and left six behind — including three the client could see.
const NATIVE = /(?:^|[^.\w$"'`])(?:window\.)?(alert|confirm|prompt)\s*\(/g;

console.log("── no native browser dialogs ──");

const strip = (s) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
let checked = 0;
const found = [];

function scan(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { scan(full); continue; }
    const rel = path.relative(SITE, full);
    let raw;
    if (e.name.endsWith(".js")) {
      try { raw = strip(fs.readFileSync(full, "utf8")); } catch { continue; }
    } else if (e.name.endsWith(".html")) {
      // Inline <script> blocks only — prose in the markup is not code.
      let html; try { html = fs.readFileSync(full, "utf8"); } catch { continue; }
      raw = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => strip(m[1])).join("\n");
    } else continue;
    checked++;
    for (const m of raw.matchAll(NATIVE)) {
      const line = raw.slice(0, m.index).split("\n").length;
      found.push({ rel, line, kind: m[1], snippet: raw.slice(m.index, m.index + 90).replace(/\s+/g, " ").trim() });
    }
  }
}
scan(SITE);

// 🔴 An empty run is not a pass. If the tree moved, this would report "none" forever.
if (checked < 20) {
  console.log(`  ⚠️  only ${checked} script source(s) found under ${SITE} — cannot judge.`);
  process.exit(2);
}

if (found.length) {
  console.log(`\n🔴 ${found.length} native browser dialog(s) — these bypass the dialog system entirely:\n`);
  for (const f of found) console.log(`  ${f.rel}:${f.line}  ${f.kind}( …  ${f.snippet.slice(0, 70)}`);
  console.log("\n  They cannot be styled, they freeze the page, and the browser captions them with our own");
  console.log("  domain — a client sees \"www.rocketgrowthagency.com says\" inside a designed product.");
  console.log("  Use rgaAlert / rgaConfirm / rgaPrompt (admin) or portalAlert / portalConfirm (portal).");
  console.log("  🔑 rgaConfirm and portalConfirm are ASYNC — a bare `if (confirm(x))` must become `await`.");
  process.exit(1);
}

console.log(`  ✅ ${checked} script source(s) scanned across the whole site — zero native alert/confirm/prompt.`);
console.log("\n✅ every popup goes through the dialog system.");
process.exit(0);
