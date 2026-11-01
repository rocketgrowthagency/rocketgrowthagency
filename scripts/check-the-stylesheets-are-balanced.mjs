#!/usr/bin/env node
// check-the-stylesheets-are-balanced.mjs — 2026-11-01 (audit leftovers). admin.css carried a stray line,
// `border-radius:8px;font:inherit;font-size:var(--fs-xs)}`, after a closed rule. A browser reads a stray declaration at the top level as
// the START of the next rule's selector, so the next rule (.am-seg, the Messages control) was silently dropped. Nothing failed.
// This gate reads admin.css and portal.css with comments and strings removed and fails on a `}` with no `{`, on text left open at the
// end, and on a declaration (a `;`) sitting between rules.
// exit 0 = balanced · 1 = a stray brace or declaration · 2 = can't tell
import fs from "node:fs";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = [];
for (const sheet of ["admin/admin.css", "portal/portal.css"]) {
  let src;
  try { src = fs.readFileSync(`${SITE}/${sheet}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE: cannot read ${sheet}`); process.exit(2); }
  src = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, (m) => '"' + " ".repeat(m.length - 2) + '"').replace(/url\([^)]*\)/g, "url()");
  let depth = 0, line = 1, between = "", betweenLine = 1;
  const blocks = []; // what opened each depth: "rule" or "group" (@media, @supports ...)
  for (const ch of src) {
    if (ch === "\n") line++;
    if (ch === "{") {
      const sel = between.trim();
      if (depth === 0 || blocks[depth - 1] === "group") { if (/;/.test(sel.replace(/@import[^;]*;|@charset[^;]*;/g, "")) && sel) F.push(`${sheet}:${betweenLine}: a declaration sits between rules, so the next rule is lost: ${sel.slice(0, 70)}`); }
      blocks.push(/^@(media|supports|container|layer|document)\b/.test(sel) ? "group" : "rule"); depth++; between = ""; betweenLine = line; continue;
    }
    if (ch === "}") {
      if (depth === 0) { F.push(`${sheet}:${line}: a } with no { before it`); between = ""; betweenLine = line; continue; }
      depth--; blocks.pop(); between = ""; betweenLine = line; continue;
    }
    if (depth === 0 || blocks[depth - 1] === "group") between += ch;
  }
  if (depth !== 0) F.push(`${sheet}: ${depth} block(s) never closed`);
}
if (F.length) { console.error(`🔴 a stylesheet has a stray brace or declaration:\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log("✅ admin.css and portal.css are balanced: no stray } and no declaration between rules.");
