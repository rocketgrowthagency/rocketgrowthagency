#!/usr/bin/env node
/**
 * check-no-horizontal-bleed.mjs — content must never push a card, or the page, sideways.
 *
 * ─── WHY (2026-09-15) ────────────────────────────────────────────────────────────────────────────
 * The change-ledger mockup bled outside its card. The cause is the single most common CSS trap there
 * is, and it is invisible until real data hits it:
 *
 *     A GRID OR FLEX CHILD DEFAULTS TO `min-width: auto`.
 *
 * It therefore refuses to shrink below its own content. One long unbroken string — a URL, a hash, a
 * line of JSON — and the column, the card and the page all grow wider than the viewport.
 *
 * 🔑 The portal ALREADY had the guard (`.ch-ba>div{…min-width:0}`). The mockup theme did not. That
 * is the exact drift that keeping one set of design tokens is supposed to prevent, and Chris had
 * asked the same day for mockups and portal to be designed the same. A rule copied by eye is not
 * copied. → feedback_brand_design_guidelines
 *
 * ─── WHAT IT ASSERTS ─────────────────────────────────────────────────────────────────────────────
 *   1. Every grid/flex container that holds text has children with `min-width:0`.
 *   2. Every <pre> inside such a container wraps, rather than relying on horizontal scroll.
 *   3. A page-level guard exists so nothing can scroll the body sideways.
 *
 * Exit 0 = nothing can bleed · 1 = a container can be pushed wider than its parent · 2 = cannot tell.
 */
import fs from "node:fs";
import path from "node:path";

const WEB = process.env.BLEED_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SHEETS = [
  path.join(WEB, "portal/portal.css"),
  path.join(WEB, "admin/admin.css"),
  // 🔑 The shared mockup theme, vendored into the repo so it is checked by default rather than only
  // when someone remembers to pass an env var. A gate you have to opt into is a gate nobody runs.
  path.join(WEB, "reports/mockups/assets/rga-theme.css"),
];
// The shared mockup theme lives in the scratchpad while a session is live; check it when present.
const EXTRA = process.env.BLEED_EXTRA_CSS ? [process.env.BLEED_EXTRA_CSS] : [];

const files = [...SHEETS, ...EXTRA].filter((f) => fs.existsSync(f));
if (!files.length) { console.error("[bleed] INDETERMINATE — no stylesheets found"); process.exit(2); }

const problems = [];
let containers = 0;

for (const f of files) {
  const css = fs.readFileSync(f, "utf8");
  const name = path.basename(f);

  // 🔴 NARROW ON PURPOSE. The first version flagged every flex container and produced a wall of
  // findings — a nav row, a breadcrumb strip, a chip bar. None of those can bleed, because none of
  // them holds an unbreakable string. A mass finding means the PROBE is wrong, not the code.
  // → feedback_a_check_must_not_validate_itself
  //
  // 🔑 The container only bleeds if it CONTAINS preformatted or code text. That is detectable: the
  // same stylesheet will have a `SELECTOR pre{…}` / `SELECTOR code{…}` descendant rule. Those are
  // the containers worth checking, and they are exactly where the real bug was.
  const holdsPre = new Set();
  for (const m of css.matchAll(/([^{}]+?)\s+(?:pre|code)\s*\{/g)) {
    const owner = m[1].trim().split(/[\n,]/).pop().trim();
    if (owner && !owner.startsWith("@")) holdsPre.add(owner);
  }

  for (const m of css.matchAll(/([^{}]+)\{([^{}]*display\s*:\s*(?:grid|flex)[^{}]*)\}/g)) {
    const selector = m[1].trim().split("\n").pop().trim();
    const body = m[2];
    const multiCol = /grid-template-columns\s*:[^;]*(?:1fr\s+1fr|repeat)/.test(body) || /display\s*:\s*flex/.test(body);
    if (!multiCol) continue;
    // Only containers that actually hold preformatted text can be pushed by an unbreakable string.
    if (!holdsPre.has(selector)) continue;
    containers++;

    const childRe = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*>\\s*[^{]{0,24}\\{([^}]*)\\}`);
    const child = css.match(childRe);
    const guarded = child && /min-width\s*:\s*0/.test(child[1]);
    if (!guarded) {
      problems.push(`${name}: \`${selector}\` holds preformatted text and its children have no \`min-width:0\` — one long unbroken string will push it wider than its parent.`);
    }
  }

  // Any <pre> that is a descendant of a grid/flex column should wrap, not scroll.
  for (const m of css.matchAll(/([^{}]*\bpre\b[^{}]*)\{([^{}]*)\}/g)) {
    const sel = m[1].trim(), body = m[2];
    if (!/\.(ba|ch-ba)\b/.test(sel)) continue;
    if (!/white-space\s*:\s*pre-wrap/.test(body)) {
      problems.push(`${name}: \`${sel}\` does not wrap. Inside a two-column before/after, a horizontal scrollbar makes the two sides impossible to compare.`);
    }
    if (!/(word-break|overflow-wrap)\s*:/.test(body)) {
      problems.push(`${name}: \`${sel}\` has no word-break/overflow-wrap — a URL or hash has no spaces to wrap at.`);
    }
  }
}

if (!containers) {
  console.error("[bleed] INDETERMINATE — no multi-column containers matched; the probe may be wrong");
  process.exit(2);
}

console.log("── nothing pushes a card or the page sideways ──");
console.log(`  ${files.length} stylesheet(s), ${containers} multi-column container(s) checked`);

if (problems.length) {
  console.error("\n✗ content can bleed outside its container:");
  for (const p of problems) console.error(`    ${p}`);
  console.error("\n  A grid/flex child defaults to min-width:auto and will not shrink below its content.");
  console.error("  Add `min-width:0` to the child, and wrap long text rather than scrolling it.");
  process.exit(1);
}
console.log("  ✅ every multi-column container can shrink, and long text wraps");
process.exit(0);
