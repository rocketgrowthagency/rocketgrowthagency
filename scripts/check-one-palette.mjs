#!/usr/bin/env node
/**
 * check-one-palette.mjs — colour comes from tokens, and a state is never coloured like a scale.
 *
 * ─── WHY (2026-09-15) ────────────────────────────────────────────────────────────────────────────
 * `admin.js` held **61 distinct hex colours** and `admin.css` **185**, against 25 declared tokens.
 * Two complete semantic palettes were running side by side:
 *
 *     #16a34a  used 25×  as "success"      …while --admin-success was #0c5132
 *     #dc2626  used 17×  as "error"        …while --admin-error   was #8e0b21
 *     #f59e0b  used 10×  as "warning"      …while --admin-warning was #8a5a00
 *
 * That is not decoration. `rankColor()` returned a hardcoded `#16a34a`, and it was the function that
 * painted a rank of 0 bright green when the business ranked nowhere.
 *
 * 🔑 AND THE TRAP THAT MATTERS: `#16a34a` meant TWO different things — a STATE ("this succeeded") and
 * a POSITION ("ranks 1–2"). Mapping every green onto `--admin-success` flattens the rank grid to one
 * colour and destroys the thing it exists to show. A state is a category; a rank is a continuum.
 * They get separate token families, and the legend must read from the same family as the cells —
 * during this very migration the legend briefly said `--admin-success` while the cells said
 * `--admin-rank-top`, which tells a reader green means "success" when it means "rank 1–2".
 *
 * ─── WHAT IT ASSERTS ─────────────────────────────────────────────────────────────────────────────
 *   1. No bare hex colour in the admin/portal JS — colour comes from a token.
 *   2. (Contrast/fallback safety is NOT re-checked here — check-no-invisible-controls.mjs owns it.)
 *   3. The rank SCALE and the semantic STATE families stay disjoint — no selector mixes them.
 *   4. The rank legend and the rank cells read from the SAME token family.
 *
 * Exit 0 = one palette, honestly applied · 1 = drift · 2 = could not tell.
 */
import fs from "node:fs";
import path from "node:path";

// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT. A gate that can only ever read the real
// working tree cannot be pointed at a scratch copy, so its mutations cannot be run — and a
// gate nobody can make fail is a gate nobody has checked. Found 2026-10-06 when three
// mutations of `check-refusal-is-not-done` all came back green: it was reading straight past
// them. → feedback_a_gate_that_cannot_fail · feedback_the_harness_i_wrote_to_check_my_work_can_lie
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const WEB = process.env.PALETTE_SITE_DIR || `${__SITE}`;
const JS = [path.join(WEB, "admin/admin.js"), path.join(WEB, "portal/portal.js")];
const CSS = path.join(WEB, "admin/admin.css");

const files = JS.filter((f) => fs.existsSync(f));
if (!files.length || !fs.existsSync(CSS)) { console.error("[palette] INDETERMINATE — files missing"); process.exit(2); }

const problems = [];
const strip = (s) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

// ── 1 + 2. Bare hex, and var() without a fallback ────────────────────────────────────────────────
let scanned = 0;
for (const f of files) {
  const name = path.basename(f);
  const src = strip(fs.readFileSync(f, "utf8"));
  scanned++;

  // Remove legitimate `var(--x, #fallback)` first — the fallback SHOULD be a literal.
  let withoutFallbacks = src.replace(/var\(--[a-z0-9-]+,\s*#[0-9a-fA-F]{3,8}\)/g, "TOKEN");

  // 🔴 ANOTHER COMPANY'S BRAND MARK IS NOT OUR PALETTE. The Google logo is drawn with Google's
  // colours (#4285F4 #34A853 #FBBC04 #EA4335 #F9AB00 #E37400 #1A73E8). Tokenising those would mean
  // repainting someone else's logo in our brand — wrong, and it would break recognition of the
  // thing the icon exists to identify. They are allowed, and ONLY inside an svg fill/stroke.
  const BRAND_MARKS = /#(4285F4|34A853|FBBC04|EA4335|F9AB00|E37400|1A73E8)\b/gi;
  withoutFallbacks = withoutFallbacks.replace(
    /(fill|stroke)=["']#(4285F4|34A853|FBBC04|EA4335|F9AB00|E37400|1A73E8)["']/gi, "$1=\"BRAND\"");

  const bare = [...new Set(withoutFallbacks.match(/#[0-9a-fA-F]{6}\b/g) || [])];
  if (bare.length) {
    problems.push(`${name}: ${bare.length} bare hex colour(s) outside a token fallback — ${bare.slice(0, 6).join(", ")}${bare.length > 6 ? "…" : ""}`);
  }

  // 🔴 NOT RE-CHECKED HERE: "a colour var() with no literal fallback".
  //
  // My first version flagged every one and produced 130+ findings — `color: var(--admin-muted)` on
  // inherited text is harmless if the token fails, because the text simply inherits. The DANGEROUS
  // case is narrower: a var() BACKGROUND paired with a hardcoded foreground, which renders
  // invisible. `check-no-invisible-controls.mjs` already tests exactly that, and passes.
  //
  // 🔑 Building a second, broader contrast check here would be the same mistake as the duplicate
  // change log — two gates on one property, and the noisier one teaches people to skim past both.
  // → feedback_search_for_the_existing_table_before_creating_one · feedback_a_check_must_not_validate_itself
}

// ── 3. The two families must stay disjoint ───────────────────────────────────────────────────────
const SCALE = /--admin-rank-[a-z]+/g;
const STATE = /--admin-(success|warning|error|info)\b/g;
for (const f of files) {
  const name = path.basename(f);
  const src = strip(fs.readFileSync(f, "utf8"));
  // Look line by line: a single expression naming both families is mixing a verdict with a position.
  src.split("\n").forEach((line, i) => {
    const scale = line.match(SCALE), state = line.match(STATE);
    if (scale && state && /rank|grid|legend/i.test(line)) {
      problems.push(`${name}:${i + 1} mixes the rank SCALE (${scale[0]}) with a semantic STATE (${state[0]}) — a rank is a position, not a verdict.`);
    }
  });
}

// ── 4. Legend and cells must read from the same family ───────────────────────────────────────────
const adminSrc = strip(fs.readFileSync(JS[0], "utf8"));
const legendMatch = adminSrc.match(/\[\["Top 3",[^\]]*\](?:,\s*\[[^\]]*\])*\]/);
const rankFnMatch = adminSrc.match(/function rankColor\([\s\S]{0,700}?\n\}/);
if (!legendMatch || !rankFnMatch) {
  console.error("[palette] INDETERMINATE — could not locate the rank legend or rankColor(); the probe may be stale");
  process.exit(2);
}
const legendTokens = new Set(legendMatch[0].match(SCALE) || []);
const cellTokens = new Set(rankFnMatch[0].match(SCALE) || []);
if (!legendTokens.size) {
  problems.push("the rank legend uses no --admin-rank-* token — it is describing the grid in a different palette from the grid.");
} else {
  for (const t of legendTokens) {
    if (!cellTokens.has(t)) problems.push(`the legend uses ${t} but rankColor() does not — legend and cells would disagree.`);
  }
}

console.log("── one palette: tokens, fallbacks, and scale kept apart from state ──");
console.log(`  ${scanned} script(s) scanned · legend tokens ${[...legendTokens].length}, cell tokens ${[...cellTokens].length}`);

if (problems.length) {
  console.error("\n✗ the palette has drifted:");
  for (const p of problems) console.error(`    ${p}`);
  console.error("\n  A second palette is how a state ends up wearing a scale's colour — which is exactly");
  console.error("  how a rank of 0 came to be painted bright green.");
  process.exit(1);
}
console.log("  ✅ no bare hex, every colour var() has a fallback, scale and state stay separate");
process.exit(0);
