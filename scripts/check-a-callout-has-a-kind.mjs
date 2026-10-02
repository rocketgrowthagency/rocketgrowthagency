#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — "HOW THIS STEP WORKS" HAS ONE SCALE, AND A CALLOUT CARRIES ITS KIND
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-10-02: *"can we do a mockup for How this step works to match the design we just
 * updated"* → approved: reports/mockups/admin_how_this_step_works_v1.html
 *
 * The fold had THREE type sizes and not one of them was chosen: 16px prose with the BROWSER'S
 * default leading, a 13px list, and an 11px italic automation note — so the most useful sentence on
 * the card (what the Run button will actually do) was its smallest text.
 *
 * 🔑 NOTHING HERE IS INVENTED. Counted across all 61 month-1 steps, exactly FOUR callout markers
 * are in use — 🔴 ×14 in 13 steps, 🔑 ×3, 📄 ×3, ▶️ ×1 — and each becomes a NAMED kind. A fifth
 * marker must fall through to an ordinary paragraph rather than being guessed at.
 * 🔴 My first count missed ▶️: I scanned ☀-➿ and ▶ is U+25B6, below that range.
 *
 * Most of this cannot be seen on screen most days: the fold renders on the ACTIVE step only, and
 * the active step rarely contains a callout. So the markup is asserted at the source and the CSS
 * is asserted as rules — the live render is diffed separately against the mockup.
 *
 * Exit 0 pass · 1 fail · 2 could not run.
 */
import fs from "node:fs";

const W = "/Users/chris/RGA/Rocket Growth Agency Website VS Code/";
let src, css, playbooks;
try {
  src = fs.readFileSync(W + "admin/admin.js", "utf8");
  css = fs.readFileSync(W + "admin/admin.css", "utf8");
  playbooks = JSON.parse(fs.readFileSync(W + "data/playbooks/playbooks.json", "utf8"));
} catch { console.error("⛔ cannot read the admin sources"); process.exit(2); }

const fail = [];
const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");          // 🔴 a substring in a COMMENT is not a rule
const hasRule = (sel) => new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*[,{]").test(bare);

// ═══ PART 1 — THE FOUR KINDS, and that they are the ones the SOURCE uses ═════════════════════
const KINDS = [
  { marker: "🔴", kind: "crit", label: "Critical" },
  { marker: "🔑", kind: "rule", label: "The rule" },
  { marker: "▶️", kind: "run", label: "What the Run button does" },
  { marker: "📄", kind: "ref", label: "Reference" },
];
const tbl = src.match(/const SOP_CALLOUTS = \[[\s\S]*?\];/);
if (!tbl) fail.push("SOP_CALLOUTS is gone — a callout no longer carries a kind");
else {
  for (const k of KINDS) {
    if (!tbl[0].includes(k.marker)) fail.push(`the ${k.marker} callout is no longer typed`);
    if (!tbl[0].includes(`kind: "${k.kind}"`)) fail.push(`the "${k.kind}" kind is gone`);
    if (!tbl[0].includes(`label: "${k.label}"`)) fail.push(`the "${k.kind}" callout no longer reads "${k.label}"`);
  }
}
// 🔴 A bare marker with no text is not a callout — it would render an empty labelled box.
if (!/if \(!body\) return null;/.test(src)) fail.push("a bare marker with no text is no longer rejected");

// 🔑 And the kinds must still cover what the PLAYBOOK actually writes. A new marker appearing in
// the SOP is a design decision, not something this gate should silently pass.
// 🔴 A JS STRING IS UTF-16: an emoji is a SURROGATE PAIR, and a character class matches half of
// one. My first version reported a replacement character 20× because it had cut every marker in
// two. Iterate CODE POINTS. → feedback_a_property_read_is_a_claim_about_the_shape
const leadMarker = (line) => {
  const cps = Array.from(line.trim());
  if (!cps.length) return "";
  const first = cps[0];
  if (/[\w\s\-*•·>#("'[]/.test(first) || first.codePointAt(0) < 0x2000) return "";
  let sym = first;
  if (cps[1] === "\uFE0F") sym += cps[1];
  const rest = cps.slice(sym.length === 1 ? 1 : 2).join("").trim();
  return rest ? sym : "";
};
const seen = new Map();
for (const s of playbooks.month1 || []) {
  for (const line of String(s.instructions || "").split("\n")) {
    const sym = leadMarker(line);
    if (sym) seen.set(sym, (seen.get(sym) || 0) + 1);
  }
}
const known = new Set(KINDS.map((k) => k.marker.replace(/️/g, "")));
for (const [sym, n] of seen) {
  if (!known.has(sym.replace(/️/g, ""))) {
    fail.push(`the instructions use a callout marker this design does not name: ${sym} (${n}×) — give it a kind or confirm it should read as plain prose`);
  }
}

// ═══ PART 2 — THE MARKUP the renderer emits ══════════════════════════════════════════════════
if (!/<div class="ob-note \$\{call\.kind\}"><span class="lab">\$\{escapeHtml\(call\.label\)\}<\/span>/.test(src)) {
  fail.push("a callout no longer renders as .ob-note with its kind and a label");
}
// 🔴 The tools row is ABSENT when there is none — only 21 of 61 steps declare one.
if (!/\(o\.tools \|\| \[\]\)\.length\s*\n?\s*\? `<div class="ob-runs">/.test(src)) {
  fail.push("the tools row is no longer gated on there BEING a tool — an empty labelled strip would render");
}
if (!/<span class="lab">Runs on<\/span>/.test(src)) fail.push('the tools row lost its "Runs on" label');
if (!/<div class="ob-runnote"><span class="lab">What the Run button does<\/span>/.test(src)) {
  fail.push("the automation note is no longer a labelled block — it was the smallest text on the card");
}
// the heading over a list reads as a group, with the list's OWN length
if (!/<div class="ob-grp-h"><b>\$\{escapeHtml\(head/.test(src)) fail.push("a heading over its list no longer renders as a group heading");
if (!/<span class="c">\$\{items\.length\}<\/span>/.test(src)) fail.push("the group count is not the list's own length");

// ═══ PART 3 — ONE SCALE, and no orphans in either direction ══════════════════════════════════
if (!/\.ob-how \.ob-how-in \{[^}]*font-size:\s*14\.5px[^}]*line-height:\s*1\.65/.test(bare)) {
  fail.push("the fold no longer states one scale (14.5px / 1.65) — it inherited 16px with the browser's default leading");
}
// 🔴 .ob-sop sets 13px inside it, so a note that does not state its size inherits the LIST's size.
if (!/\.ob-note \{[^}]*font-size:\s*14\.5px/.test(bare)) {
  fail.push("a callout no longer states its own size — it would inherit 13px from .ob-sop");
}
for (const sel of [".ob-note", ".ob-note.crit", ".ob-note.rule", ".ob-note.run", ".ob-note.ref",
  ".ob-runs", ".ob-runnote", ".ob-tool"]) {
  if (!hasRule(sel)) fail.push(`${sel} has no rule of its own — a class no stylesheet defines throws nothing`);
}
// 🔴 AND NOTHING LEFT BEHIND. Their producers were deleted; a rule with no producer is dead weight.
for (const [sel, why] of [[".ob-ref", "the 📄 fold was replaced by a typed note"],
  [".ob-tools", ".ob-runs replaced it"], [".ob-autonote", ".ob-runnote replaced it"]]) {
  if (hasRule(sel)) fail.push(`${sel} still has a rule although ${why}`);
  if (new RegExp(`class="[^"]*\\b${sel.slice(1)}\\b`).test(src)) fail.push(`${sel} is still emitted by admin.js`);
}
// 🔴 .ob-auto named the automation BADGE, retired 2026-09-30. Do not resurrect it for a new thing.
if (hasRule(".ob-auto")) fail.push(".ob-auto has a rule again — that name belonged to the retired automation badge");

if (fail.length) {
  console.error("🔴 the step's reference fold is not matching its approved design:");
  for (const f of fail) console.error("   · " + f);
  process.exit(1);
}
console.log(`✅ the fold has one scale and ${KINDS.length} named callout kinds — every marker the 61 steps use is covered, nothing orphaned`);
