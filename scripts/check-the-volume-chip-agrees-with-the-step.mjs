#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — THE VOLUME CHIP AGREES WITH THE STEP THAT WROTE IT
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * The keyword step writes a `searches:` label; the admin renders it as a coloured chip. They are two
 * vocabularies that must be the same vocabulary.
 *
 * 2026-10-05: the step began deliberately KEEPING keywords Google cannot size at the measured
 * geography, on autocomplete evidence — three of them in RGA's plan. The renderer knew nothing about
 * that state, so it painted all three the same red as "no data", directly above a note explaining
 * they are typed and winnable. The card argued with its own decision.
 *
 * 🔑 EVERY LABEL THE STEP CAN PRODUCE MUST MAP TO A STATE THE CARD KNOWS, AND A DELIBERATELY KEPT
 *    TERM MUST NOT WEAR THE FAILURE COLOUR.
 *
 * Universal: this is about the measurement vocabulary, not about any industry or market.
 *
 * Exit 0 pass · 1 the chip and the step disagree · 2 could not run.
 */
import fs from "node:fs";
import vm from "node:vm";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
let flow, admin, css;
try {
  flow = fs.readFileSync(`${SITE}/netlify/functions/flow-execute.js`, "utf8");
  admin = fs.readFileSync(`${SITE}/admin/admin.js`, "utf8");
  css = fs.readFileSync(`${SITE}/admin/admin.css`, "utf8");
} catch { console.error("⚠️  INDETERMINATE — cannot read the sources"); process.exit(2); }

const fail = [];

// ── 1 · HARVEST EVERY LABEL `volumeLabel` CAN RETURN ────────────────────────────────────────────
// 🔑 Read them out of the function rather than listing them here: a list in the gate goes stale the
// day someone adds a sixth wording, which is exactly how the renderer fell behind.
const fn = (() => {
  const i = flow.indexOf("const volumeLabel = (");
  if (i < 0) return "";
  const o = flow.indexOf("{", flow.indexOf("=>", i));
  let d = 0;
  for (let k = o; k < flow.length; k++) {
    if (flow[k] === "{") d++;
    else if (flow[k] === "}") { d--; if (!d) return flow.slice(i, k + 1); }
  }
  return "";
})();
if (!fn) { console.error("⚠️  INDETERMINATE — cannot read volumeLabel; re-pin this gate."); process.exit(2); }

// String literals it can return, minus the interpolated numeric one (covered separately).
const labels = [...new Set([...fn.matchAll(/"([^"]{3,60})"/g)].map((m) => m[1])
  .filter((x) => !/^\s*$/.test(x)))];
// 🔴 THIS THRESHOLD WAS 3 AND SWALLOWED A REAL REGRESSION. Deleting the kept-term wordings leaves
// exactly two labels, which tripped the "extraction is broken" guard and reported INDETERMINATE over
// a genuine fault. Two labels is plenty to prove the extraction worked; the assertions below then
// say what is actually missing. A guard against a broken harness must not also hide a broken product.
// → feedback_a_gate_that_cannot_fail
if (labels.length < 2) {
  console.error(`⚠️  INDETERMINATE — only ${labels.length} label(s) harvested; the extraction is wrong.`);
  process.exit(2);
}

// ── 2 · LIFT THE CARD'S OWN CLASSIFIER ──────────────────────────────────────────────────────────
const blk = admin.slice(admin.indexOf("const VOL_FLOOR = 10;"), admin.indexOf("const isQuery ="));
if (!blk || blk.length < 200) { console.error("⚠️  INDETERMINATE — cannot lift volState."); process.exit(2); }
const ctx = vm.createContext({ console });
try {
  vm.runInContext(
    `const b={items:[]};\n${blk}\nglobalThis.S=volState; globalThis.T=volText;`.replace(
      "const peak = Math.max(0, ...b.items.map((it) => volNumber((it.fields || {}).searches || (it.fields || {}).volume) || 0));",
      "let peak = 0; globalThis.setPeak = (p)=>{peak=p;};"), ctx);
  ctx.setPeak(2400);
} catch (e) {
  console.error(`⚠️  INDETERMINATE — could not lift the chip classifier: ${e.message}`);
  process.exit(2);
}

// ── 3 · EVERY LABEL MUST CLASSIFY, AND NONE MAY FALL THROUGH ────────────────────────────────────
for (const label of labels) {
  const st = ctx.S(label);
  if (!st) {
    fail.push(`the step can write "${label}" and the card classifies it as NOTHING — the chip would `
      + "not render at all, so the keyword would show no volume state");
  }
}

// ── 4 · A DELIBERATELY KEPT TERM MUST NOT WEAR THE FAILURE COLOUR ───────────────────────────────
{
  const kept = labels.filter((l) => /too specific to size/i.test(l));
  if (!kept.length) {
    fail.push("volumeLabel can no longer say a term is too specific to size — a keyword kept on "
      + "autocomplete evidence would be labelled \"no data\" and painted as dead");
  }
  for (const l of kept) {
    const st = ctx.S(l);
    if (st === "none" || st === "floor") {
      fail.push(`"${l}" classifies as "${st}" — the failure colour, over a keyword the step chose to keep`);
    }
    if (st && !new RegExp(`\\.ob-vol\\.${st}\\s*\\{`).test(css)) {
      fail.push(`\`.ob-vol.${st}\` is not defined in admin.css — the chip would render unstyled`);
    }
  }
  // 🔴 And the kept state must be tested BEFORE the floor/no-data branches, or a future wording
  // containing "floor" would fall through to red.
  const iKept = blk.indexOf("too specific to size");
  const iFloor = blk.indexOf('t.includes("floor")');
  if (iKept >= 0 && iFloor >= 0 && iKept > iFloor) {
    fail.push("the kept state is tested AFTER the floor branch — a label mentioning the floor would "
      + "be painted red before the kept branch is ever reached");
  }
}

// ── 5 · THE NUMERIC LABEL STILL WORKS ───────────────────────────────────────────────────────────
for (const [n, want] of [["2,400 searches/mo", "ok"], ["300 searches/mo", "low"]]) {
  if (ctx.S(n) !== want) fail.push(`"${n}" classifies as "${ctx.S(n)}", expected "${want}"`);
}

// ── 6 · AND THE STEP MUST NOT TELL THE OPERATOR TO REPLACE A TERM IT KEPT ───────────────────────
// 🔴 The card printed "N are below Google's floor … Replace them before locking" about the very
// keywords the floor rule had just kept on evidence.
{
  const code = flow.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  // 🔴 THE WHOLE STATEMENT, NOT THE FIRST LINE. The declaration spans two lines, and a `^.*$`
  // alternative matched only the first — which does not contain the guard — so the gate accused
  // correct code on its first run.
  const deadDecl = (code.match(/const dead = demand\.filter[\s\S]{0,300}?;/) || [""])[0];
  if (!deadDecl) {
    fail.push("cannot find the `dead` list — the replace-these instruction may be unguarded");
  } else if (!/floorKeptBy/.test(deadDecl)) {
    fail.push("the \"below Google's floor — replace them\" list does not exclude the terms kept on "
      + "autocomplete evidence, so the card instructs the operator to undo its own decision");
  }
}

if (fail.length) {
  console.error("🔴 the volume chip and the step that wrote it disagree:");
  for (const f of fail) console.error("   · " + f);
  process.exit(1);
}
console.log(`✅ all ${labels.length} labels the step can write classify on the card, a kept term never wears the failure colour, and nothing tells the operator to replace what the step deliberately kept`);
