#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — A KEYWORD DRAFT SURVIVES THE WHOLE ROUND TRIP
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * The keyword step writes a fenced YAML draft. The admin parses it, builds the structured card, and
 * paints a coloured chip from the `searches:` line. Four pieces of machinery, each gated separately —
 * and every defect Chris hit on 2026-10-05 lived in the SEAMS between them:
 *
 *   · the rebuild dropped the opening fence, so the parser never ran and the card showed raw text
 *     (that one is owned by `check-a-rebuilt-draft-keeps-its-fences`; this gate proves the fence is
 *     load-bearing, and deliberately does not duplicate it);
 *   · the step invented a new `searches:` wording the chip classifier had never heard of, so three
 *     deliberately-kept keywords were painted the same red as "no data".
 *
 * 🔑 EVERY PIECE PASSING IS NOT THE SAME AS THE CHAIN WORKING. This runs a draft shaped exactly as
 * the step writes one through the REAL renderer and asserts what comes out the other end.
 *
 * Universal: the draft shape is the same for every client and every trade.
 *
 * Exit 0 pass · 1 the chain is broken · 2 could not run.
 */
import fs from "node:fs";
import vm from "node:vm";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
let src, flow;
try {
  src = fs.readFileSync(`${SITE}/admin/admin.js`, "utf8");
  flow = fs.readFileSync(`${SITE}/netlify/functions/flow-execute.js`, "utf8");
} catch { console.error("⚠️  INDETERMINATE — cannot read the sources"); process.exit(2); }

const lift = (n) => {
  const m = src.match(new RegExp("^function " + n + "\\s*\\(", "m"));
  if (!m) return "";
  const lp = src.indexOf("(", m.index);
  let pd = 0, a = -1;
  for (let i = lp; i < src.length; i++) {
    if (src[i] === "(") pd++;
    else if (src[i] === ")") { pd--; if (!pd) { a = i + 1; break; } }
  }
  const o = src.indexOf("{", a);
  let d = 0;
  for (let i = o; i < src.length; i++) {
    if (src[i] === "{") d++;
    else if (src[i] === "}") { d--; if (!d) return src.slice(m.index, i + 1); }
  }
  return "";
};

// Top-level one-line consts: the regex tables the renderers lean on. Each is wrapped so one whose own
// dependencies are absent is skipped rather than fatal.
const consts = (src.match(/^const [A-Za-z_$][A-Za-z0-9_$]* = .*;$/gm) || [])
  .filter((l) => !/=>\s*{\s*$/.test(l))
  .map((l) => `try { ${l.replace(/^const /, "var ")} } catch (e) {}`)
  .join("\n");

const prelude = `function escapeHtml(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function escapeAttribute(s){return escapeHtml(s);}\n`;

// 🔑 THE LABELS COME FROM THE STEP, NOT FROM HERE. A list written into this gate would go stale the
// day someone adds a sixth wording — which is exactly how the chip classifier fell behind.
const labelFn = (() => {
  const i = flow.indexOf("const volumeLabel");
  if (i < 0) return "";
  const brace = flow.indexOf("{", flow.indexOf("=>", i));
  let d = 0;
  for (let k = brace; k < flow.length; k++) {
    if (flow[k] === "{") d++;
    else if (flow[k] === "}") { d--; if (!d) return flow.slice(i, k + 1); }
  }
  return "";
})();
if (!labelFn) { console.error("⚠️  INDETERMINATE — cannot read volumeLabel; re-pin this gate."); process.exit(2); }
// 🔴 STRIP THE COMMENTS FIRST. A quoted phrase inside an explanatory comment is not a label the step
// can write, and harvesting one made this gate demand that the card classify a sentence.
// → feedback_the_harness_i_wrote_to_check_my_work_can_lie
const labelCode = labelFn.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
const stepLabels = [...new Set([...labelCode.matchAll(/"([^"]{3,60})"/g)].map((m) => m[1]))];
if (stepLabels.length < 2) { console.error("⚠️  INDETERMINATE — harvested too few labels."); process.exit(2); }

// A measured figure is interpolated, not a literal, so it is added explicitly.
const labels = [...stepLabels, "2,400 searches/mo"];

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const draft = ["```yaml", "keywords:"]
  .concat(labels.flatMap((lab, i) => ([
    `  - term: example keyword ${i + 1}`,
    `    searches: ${lab}`,
    "    why: >",
    "      A reason that spans one line.",
  ])))
  .concat(["locations:", "  - Somewhere (a short clause)", "```"])
  .join("\n");

// ── RUN THE REAL RENDERER, RESOLVING ITS DEPENDENCY SET ─────────────────────────────────────────
const ctx = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
const seen = new Set();
const parts = [];
for (const n of ["stepBodyHtml", "renderStepMarkdown", "outShapes", "parseStructuredText",
  "parseYamlish", "structuredCoversSource", "structuredHtml", "stepTableHtml", "inlineMd"]) {
  const f = lift(n);
  if (f) { parts.push(f); seen.add(n); }
}
let html = null;
for (let attempt = 0; attempt < 20 && html === null; attempt++) {
  try {
    vm.runInContext(`${consts}\n${prelude}${parts.join("\n\n")}\nglobalThis.R = stepBodyHtml;`, ctx);
    html = ctx.R(esc(draft));
  } catch (e) {
    const m = /(\w+) is not defined/.exec(e.message);
    if (!m || seen.has(m[1])) {
      console.error(`⚠️  INDETERMINATE — could not run the renderer: ${e.message}`);
      process.exit(2);
    }
    const f = lift(m[1]);
    if (!f) { console.error(`⚠️  INDETERMINATE — missing dependency ${m[1]}`); process.exit(2); }
    parts.unshift(f); seen.add(m[1]);
  }
}
if (html === null) { console.error("⚠️  INDETERMINATE — gave up resolving the renderer."); process.exit(2); }

const fail = [];
const chips = [...html.matchAll(/<span class="ob-vol ([a-z]+)">([^<]*)<\/span>/g)]
  .map((m) => ({ state: m[1], text: m[2] }));
const pills = (html.match(/class="ob-q"/g) || []).length;

// ── 1 · THE DRAFT BECAME A STRUCTURED CARD AT ALL ───────────────────────────────────────────────
if (!pills) {
  fail.push("the draft rendered with NO query pills — it was not recognised as structured output");
}

// ── 1b · AND THE FENCE IS LOAD-BEARING, WHICH IS WHY ITS OWN GATE EXISTS ────────────────────────
// 🔑 HONEST COVERAGE BOUNDARY. This gate BUILDS its own fenced draft, so it cannot see the rebuild
// dropping a fence — `check-a-rebuilt-draft-keeps-its-fences` owns that, and a mutation proved this
// one blind to it. What this CAN prove is that the fence matters: strip it and the structured card
// disappears. Stating the boundary stops a future reader assuming this covers more than it does.
// → feedback_an_inventory_is_a_claim_about_what_i_thought_to_grep
{
  const unfenced = draft.split("\n").filter((l) => !/^```/.test(l)).join("\n");
  // 🔴 THE UNFENCED PATH NEEDS MORE OF THE RENDERER. It walks `parseStructuredText`, whose own
  // dependency set the first render never touched — so the first version of this check reported a
  // throw as a product failure. Resolve for THIS call too, and treat a still-unresolved throw as
  // INDETERMINATE, never as a finding. → feedback_a_gate_that_throws_is_not_a_gate_that_fails
  let plain = null;
  for (let a = 0; a < 20 && plain === null; a++) {
    try { plain = ctx.R(esc(unfenced)); }
    catch (e) {
      const m = /(\w+) is not defined/.exec(e.message);
      if (!m || seen.has(m[1])) {
        console.error(`⚠️  INDETERMINATE — could not render the unfenced control: ${e.message}`);
        process.exit(2);
      }
      const f = lift(m[1]);
      if (!f) { console.error(`⚠️  INDETERMINATE — missing dependency ${m[1]}`); process.exit(2); }
      parts.unshift(f); seen.add(m[1]);
      vm.runInContext(`${consts}\n${prelude}${parts.join("\n\n")}\nglobalThis.R = stepBodyHtml;`, ctx);
    }
  }
  const plainPills = (plain.match(/class="ob-q"/g) || []).length;
  if (plainPills !== 0) {
    fail.push(`an UNFENCED draft still produced ${plainPills} query pill(s) — the fence is supposed `
      + "to be what makes this structured output, so this gate cannot tell a lost fence from a good "
      + "one and check-a-rebuilt-draft-keeps-its-fences is carrying that alone");
  }
}

// ── 2 · EVERY LABEL THE STEP CAN WRITE PRODUCED A CHIP ──────────────────────────────────────────
if (chips.length !== labels.length) {
  fail.push(`${chips.length} of ${labels.length} labels produced a volume chip — a label the step can `
    + "write is rendering as nothing, so that keyword would show no volume state at all");
}

// ── 3 · AND NO DELIBERATELY-KEPT TERM IS PAINTED AS DEAD ────────────────────────────────────────
for (const c of chips) {
  if (/too specific to size/i.test(c.text) && (c.state === "none" || c.state === "floor")) {
    fail.push(`"${c.text}" renders in the "${c.state}" state — the failure colour, over a keyword the `
      + "step deliberately kept on autocomplete evidence");
  }
}

// ── 4 · THE MEASURED FIGURE STILL READS AS MEASURED ─────────────────────────────────────────────
if (!chips.some((c) => c.state === "ok" && /searches\/mo/.test(c.text))) {
  fail.push("a measured volume no longer renders in the \"ok\" state — the ordinary case is broken");
}

if (fail.length) {
  console.error("🔴 a keyword draft does not survive the round trip:");
  for (const f of fail) console.error("   · " + f);
  console.error(`\n   rendered chips: ${JSON.stringify(chips)}`);
  process.exit(1);
}
console.log(`✅ a draft written by the step renders as ${pills} query pill(s) with ${chips.length} chips, `
  + "every label the step can write classifies, and no kept term is painted dead");
