#!/usr/bin/env node
// check-the-daily-check-keeps-each-gates-output.mjs
// WHY (audit 10-31 item 42): run() in daily-health-check.sh printed only the first 3 lines holding a cross or red dot, so
// `check-nothing-reaches-a-client-unreviewed` printed its heading and lost the deliverable's name. The full output of every gate is now kept in
// output/gate-last/<gate>.txt (overwritten each run). This gate pins that the write exists, comes after the output is read, and covers the
// threw and timeout paths (it sits before the "threw" check), and that a failing write can't stop the sweep.
// exit 0 holds · 1 broken · 2 can't tell
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.SCRAPER_COPY_DIR ? path.join(process.env.SCRAPER_COPY_DIR, "scripts") : HERE;
let sh; try { sh = fs.readFileSync(path.join(root, "daily-health-check.sh"), "utf8"); } catch { console.error("⚠️  INDETERMINATE: cannot read daily-health-check.sh"); process.exit(2); }
const code = sh.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
const fails = [];
const iOut = code.indexOf('out=$(cat "$tmp")');
const iSave = code.indexOf('output/gate-last/');
const iThrew = code.indexOf("GATE THREW");
if (iOut < 0 || iThrew < 0) { console.error("⚠️  INDETERMINATE: run() no longer has the shape this gate reads"); process.exit(2); }
if (iSave < 0) fails.push("a gate's full output is no longer kept in output/gate-last");
else {
  if (iSave < iOut) fails.push("the output is saved before it is read, so the file would be empty");
  if (iSave > iThrew) fails.push("the output is saved after the threw check returns, so a gate that threw loses its output");
  if (!/gate-last\/\$\{script%\.mjs\}\.txt"[^\n]*\|\| true/.test(code)) fails.push("a failed write is no longer harmless: it could stop the sweep");
  if (!/mkdir -p output\/gate-last/.test(code)) fails.push("the folder is never made, so the first write fails quietly");
  if (!/printf '%s\\n' "\$out" >/.test(code)) fails.push("the file does not hold the gate's whole output");
}
if (fails.length) { console.log("🔴 the morning check loses a gate's reason:"); fails.forEach((f) => console.log("   ✗ " + f)); process.exit(1); }
console.log("✅ every gate's full output is kept in output/gate-last, before the threw check, and a failed write can't stop the sweep");
