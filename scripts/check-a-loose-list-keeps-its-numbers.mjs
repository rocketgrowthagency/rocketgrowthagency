#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — A LOOSE LIST KEEPS ITS NUMBERS
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-10-05, sending a screenshot of the kickoff call prep: five questions, every one of them
 * numbered **1.**
 *
 * The model's numbers were right. The stored text is `1. …\n\n2. …\n\n3. …` — a markdown LOOSE list,
 * blank lines between items, which is simply how a model writes a list whose items are a sentence
 * long. Our renderer CLOSED THE LIST on every blank line, so each item became its own <ol> and the
 * browser restarted each at 1.
 *
 * 🔑 A BLANK LINE INSIDE A LIST DOES NOT END THE LIST. The list ends when something that is not a
 * list item arrives — and every one of those branches already closes it.
 *
 * This runs the REAL renderer over text shaped like the real output and counts the lists it opens.
 * Nothing here re-implements the markdown rules.
 *
 * Exit 0 pass · 1 the numbering is broken again · 2 could not run.
 */
import fs from "node:fs";
import vm from "node:vm";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
let src;
try { src = fs.readFileSync(`${SITE}/admin/admin.js`, "utf8"); }
catch { console.error("⚠️  INDETERMINATE — cannot read admin.js"); process.exit(2); }

// ── lift the real renderer ──────────────────────────────────────────────────────────────────────
function lift(name) {
  const m = src.match(new RegExp("^function " + name + "\\s*\\(", "m"));
  if (!m) throw new Error(`cannot find function ${name}`);
  // 🔴 Walk the PARAMETER LIST to its closing paren first — a destructured parameter opens with a
  // brace that closes immediately, and matching from it lifts two words.
  const lp = src.indexOf("(", m.index);
  let pd = 0, after = -1;
  for (let i = lp; i < src.length; i++) {
    if (src[i] === "(") pd++;
    else if (src[i] === ")") { pd--; if (!pd) { after = i + 1; break; } }
  }
  if (after < 0) throw new Error(`unbalanced parameter list for ${name}`);
  const open = src.indexOf("{", after);
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") d++;
    else if (src[i] === "}") { d--; if (!d) return src.slice(m.index, i + 1); }
  }
  throw new Error(`unbalanced body for ${name}`);
}

// Every top-level single-line `const` — the regex tables and small arrow helpers the renderer leans
// on. Each is wrapped so that one whose own dependencies are absent is skipped rather than fatal.
const consts = (src.match(/^const [A-Za-z_$][A-Za-z0-9_$]* = .*;$/gm) || [])
  .filter((l) => !/=>\s*{\s*$/.test(l))
  .map((l) => `try { ${l.replace(/^const /, "var ")} } catch (e) {}`)
  .join("\n");

const NAMES = ["stepBodyHtml", "renderStepMarkdown", "outShapes", "parseStructuredText",
  "parseYamlish", "structuredCoversSource", "structuredHtml", "stepTableHtml", "inlineMd"];
const parts = [];
for (const n of NAMES) { try { parts.push(lift(n)); } catch { /* optional in the chain */ } }

const prelude = `
function escapeHtml(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function escapeAttribute(s){return escapeHtml(s);}
`;
const ctx = { console: { log() {}, warn() {}, error() {} } };
vm.createContext(ctx);
let render;
try {
  vm.runInContext(consts + "\n" + prelude + parts.join("\n\n") + "\nglobalThis.R = stepBodyHtml;", ctx);
  render = ctx.R;
  if (typeof render !== "function") throw new Error("stepBodyHtml did not lift");
} catch (e) {
  console.error(`⚠️  INDETERMINATE — could not lift the renderer: ${e.message}`);
  console.error("   The dependency set changed. Fix the lift; do not assume the product broke.");
  process.exit(2);
}
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const fail = [];
const openings = (html, tag) => (html.match(new RegExp(`<${tag}[^>]*>`, "g")) || []);
const items = (html) => (html.match(/<li>/g) || []).length;

// ── 1 · THE DEFECT, IN THE SHAPE IT ARRIVED ─────────────────────────────────────────────────────
// Numbered items separated by blank lines, exactly as the kickoff prep output stores them.
{
  const text = "QUESTIONS_TO_ASK\n\n"
    + "1. **Current GBP status** — Is the profile claimed and verified?\n\n"
    + "2. **Primary service categories** — Which of the three services matters most?\n\n"
    + "3. **Website ownership** — Who manages the site today?\n\n"
    + "4. **City-page strategy** — Which surrounding cities are worth targeting?\n";
  const html = render(esc(text));
  const ols = openings(html, "ol");
  if (ols.length !== 1) {
    fail.push(`a loose numbered list opened ${ols.length} <ol> elements instead of 1 — the browser `
      + `restarts the numbering at 1 for each, which is what Chris saw`);
  }
  if (items(html) !== 4) fail.push(`the loose list rendered ${items(html)} items, expected 4`);
}

// ── 2 · AND THE TIGHT LIST STILL WORKS ──────────────────────────────────────────────────────────
{
  const html = render(esc("1. one\n2. two\n3. three\n"));
  if (openings(html, "ol").length !== 1) fail.push("a tight numbered list no longer renders as one list");
  if (items(html) !== 3) fail.push("a tight numbered list lost items");
}

// ── 3 · A LIST STILL ENDS WHEN SOMETHING ELSE ARRIVES ───────────────────────────────────────────
// 🔴 The risk of not closing on a blank line is the OPPOSITE defect: a list that swallows the prose
// after it. Every non-list branch must still close it.
{
  const html = render(esc("1. one\n2. two\n\nA closing paragraph that is not a list item.\n"));
  if (items(html) !== 2) fail.push(`a paragraph after a blank line was swallowed into the list (${items(html)} items, expected 2)`);
  // 🔴 `<p[ >]` — outShapes adds a class (`<p class="ob-out-why">`), and pinning the bare tag
  // made this gate ACCUSE CORRECT CODE on its first run. → feedback_a_gate_must_pin_the_property_not_the_spelling
  if (!/<\/ol>\s*<p[ >]/.test(html)) fail.push("the list does not close before the paragraph that follows it");
}
{
  const html = render(esc("1. one\n\n## A heading\n\n1. one again\n"));
  if (openings(html, "ol").length !== 2) fail.push("a heading between two lists no longer separates them");
}

// ── 4 · TWO LIST KINDS DO NOT MERGE ─────────────────────────────────────────────────────────────
{
  const html = render(esc("- bullet one\n\n1. number one\n"));
  if (openings(html, "ul").length !== 1 || openings(html, "ol").length !== 1) {
    fail.push("a bulleted list and a numbered list separated by a blank line no longer render as two lists");
  }
}

// ── 5 · A LIST THAT GENUINELY STARTS LATE SAYS SO ───────────────────────────────────────────────
{
  const html = render(esc("4. four\n5. five\n"));
  const ol = openings(html, "ol")[0] || "";
  if (!/start="4"/.test(ol)) fail.push(`a list beginning at 4 does not carry start="4" — it would renumber from 1`);
}

// ── 6 · LOOSENESS IS MARKED, AND STYLED ─────────────────────────────────────────────────────────
// 🔑 Merging the items fixed the numbering; without this they become a cramped block, because the
// source put a blank line between them for a reason.
{
  const html = render(esc("1. one\n\n2. two\n"));
  if (!/<ol class="is-loose">/.test(html)) fail.push("a loose list is not marked, so it cannot keep the spacing its source asked for");
  try {
    const css = fs.readFileSync(`${SITE}/admin/admin.css`, "utf8");
    if (!/\.is-loose\s*>\s*li\s*\+\s*li/.test(css)) {
      fail.push("`.is-loose > li + li` is not styled — the marker renders nothing");
    }
  } catch { /* the markup test stands alone */ }
  const tight = render(esc("1. one\n2. two\n"));
  if (/is-loose/.test(tight)) fail.push("a tight list is marked loose — the marker must come from the source");
}

if (fail.length) {
  console.error("🔴 a list's numbering or structure is wrong:");
  for (const f of fail) console.error("   · " + f);
  process.exit(1);
}
console.log("✅ a loose list stays one list and keeps its numbers; a list still ends when prose, a heading or another kind arrives");
