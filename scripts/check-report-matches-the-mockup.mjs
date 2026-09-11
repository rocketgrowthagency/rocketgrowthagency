#!/usr/bin/env node
/**
 * check-report-matches-the-mockup.mjs — the client report must not drift from its approved design.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-11. Chris: *"MUST MATCH THE MOCKUP EXACTLY no exceptions."* So `portal/report/report.css`
 * was GENERATED from `mockup-monthly-report.html` rather than written to resemble it, and
 * `report.js` emits the same markup section for section.
 *
 * 🔴 That match is a point-in-time fact, and nothing protects it. One hand-edit to either file —
 * a colour nudged, a section renamed, a card padding "just tidied" — and the live report quietly
 * stops being the thing that was approved. Nobody would notice until a client opened it.
 *
 * 🔑 This does not diff the files (they are different languages — a template vs a page). It asserts
 * the things the match DEPENDS on: the design tokens are identical, and every section heading in
 * the mockup still exists in the renderer.
 *
 * If the mockup is intentionally redesigned, REGENERATE report.css from it and update the headings
 * in report.js — that is the workflow this gate enforces, not a prohibition on changing the design.
 *
 * Exit 0 = report still matches its mockup · 1 = drift · 2 = could not tell.
 */
import fs from "node:fs";

const SITE = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const MOCKUP = `${SITE}/mockup-monthly-report.html`;
const CSS = `${SITE}/portal/report/report.css`;
const JS = `${SITE}/portal/report/report.js`;

console.log("── the client report still matches its approved mockup ──");

let mock, css, js;
try {
  mock = fs.readFileSync(MOCKUP, "utf8");
  css = fs.readFileSync(CSS, "utf8");
  js = fs.readFileSync(JS, "utf8");
} catch (e) {
  console.log(`  ⚠️  cannot read one of the files: ${e.message}`);
  process.exit(2);
}

let fails = 0;

// ── 1. Design tokens must be identical. These carry the whole visual identity, so a single changed
//      hex is a real divergence even though everything still renders.
const tokens = (src) => {
  const block = (src.match(/:root\s*\{([^}]*)\}/) || [])[1] || "";
  return Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)]
    .map((m) => [m[1], m[2].trim().replace(/\s+/g, " ")]));
};
const mt = tokens(mock), ct = tokens(css);
if (!Object.keys(mt).length || !Object.keys(ct).length) {
  console.log("  ⚠️  could not read :root tokens from one of the files — the probe must be wrong.");
  process.exit(2);
}
const drifted = Object.keys(mt).filter((k) => mt[k] !== ct[k]);
const missing = Object.keys(mt).filter((k) => !(k in ct));
if (drifted.length || missing.length) {
  for (const k of drifted) console.log(`  🔴 token ${k}: mockup "${mt[k]}" · report "${ct[k]}"`);
  for (const k of missing) console.log(`  🔴 token ${k} exists in the mockup but not in report.css`);
  fails++;
} else {
  console.log(`  ✅ all ${Object.keys(mt).length} design tokens identical`);
}

// ── 2. Every section the approved design shows must still be rendered.
const headings = [...mock.matchAll(/<div class="sec-head"><h2>([^<]+)<\/h2>/g)].map((m) => m[1].trim());
if (!headings.length) {
  console.log("  ⚠️  found NO section headings in the mockup — the probe must be wrong.");
  process.exit(2);
}
// The renderer builds two headings from data (the market name, the month), so compare on a stable
// prefix rather than the whole string.
const lost = headings.filter((h) => {
  const stem = h.replace(/\s+across .*/, " across").slice(0, 28);
  return !js.includes(stem);
});
if (lost.length) {
  lost.forEach((h) => console.log(`  🔴 section missing from report.js: "${h}"`));
  fails++;
} else {
  console.log(`  ✅ all ${headings.length} approved sections are still rendered`);
}

// ── 3. The masthead must stay type, never the favicon tile that Chris rejected.
if (/rga_favicon-locked\.png/.test(js)) {
  console.log("  🔴 report.js is rendering rga_favicon-locked.png again — that is the brand tile with a");
  console.log("     solid background, replaced on 2026-09-11 by the wordmark.");
  fails++;
} else {
  console.log("  ✅ masthead is the wordmark, not the favicon tile");
}

if (fails) {
  console.log(`\n🔴 the live report has drifted from ${MOCKUP.split("/").pop()}.`);
  console.log("   If the design changed on purpose: regenerate report.css from the mockup and update");
  console.log("   the section headings — do not hand-edit one side.");
  process.exit(1);
}
console.log("\n✅ report matches its approved mockup.");
process.exit(0);
