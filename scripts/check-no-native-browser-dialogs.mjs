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
const FILES = ["admin/admin.js", "portal/portal.js", "portal/client-login.js", "portal/report/report.js"];

// 🔑 `window.`-prefixed forms count too. My first conversion pass excluded them with a lookbehind on
// `.` and left six behind — including three the client could see.
const NATIVE = /(?:^|[^.\w$"'`])(?:window\.)?(alert|confirm|prompt)\s*\(/g;

console.log("── no native browser dialogs ──");

let checked = 0;
const found = [];
for (const rel of FILES) {
  const p = path.join(SITE, rel);
  if (!fs.existsSync(p)) continue;
  const raw = fs.readFileSync(p, "utf8");
  if (raw.length < 1000) {
    console.log(`  ⚠️  ${rel} is only ${raw.length} bytes — cannot judge.`);
    process.exit(2);
  }
  checked++;
  const src = raw.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of src.matchAll(NATIVE)) {
    const line = src.slice(0, m.index).split("\n").length;
    found.push({ rel, line, kind: m[1], snippet: src.slice(m.index, m.index + 90).replace(/\s+/g, " ").trim() });
  }
}

// 🔴 An empty run is not a pass. If the paths moved, this would report "none" forever.
if (checked === 0) {
  console.log(`  ⚠️  none of the ${FILES.length} known script(s) were found under ${SITE} — cannot judge.`);
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

console.log(`  ✅ ${checked} script(s) scanned, zero native alert/confirm/prompt.`);
console.log("\n✅ every popup goes through the dialog system.");
process.exit(0);
