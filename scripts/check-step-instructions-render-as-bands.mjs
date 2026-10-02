#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — A BULLET IS NOT A NUMBERED ITEM, AND PROSE IS NOT A LIST ITEM
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-09-30, on "Run the kickoff call": the instructions give `1. 2. 3.` for what to COVER
 * and `·` bullets for what to COLLECT. The card rendered **all eight in one `<ol>`**, so the five
 * bullets came out as **4, 5, 6, 7, 8** — a bulleted list numbered as the continuation of a
 * numbered one. Every step that mixes the two did it.
 *
 * Prose was in that list too, as `<li class="ob-sop-note">`, with a CSS counter stopping it from
 * incrementing — the shape of the old fix. The real problem was one list doing three jobs.
 *
 * 🔑 A RUN OF ONE KIND IS ONE LIST, and a heading line above a run is that run's band. Approved
 * 2026-09-30, reports/mockups/admin_run_the_kickoff_call_v1.html — *"do this for all cards too."*
 * 🔑 🔴 on a heading marks the critical band: which band is loud is DATA, never a name the renderer
 * or the stylesheet recognises. → feedback_fix_the_class_not_the_instance
 *
 * Exit 0 pass · 1 fail · 2 indeterminate. Mutation log at the bottom.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const fail = [], pass = [], indet = [];

const jsPath = path.join(SITE, "admin/admin.js");
const cssPath = path.join(SITE, "admin/admin.css");
const pbPath = path.join(SITE, "data/playbooks/playbooks.json");
for (const p of [jsPath, cssPath, pbPath]) {
  if (!fs.existsSync(p)) { console.error(`⚠️  INDETERMINATE — ${p} missing.`); process.exit(2); }
}
const js = fs.readFileSync(jsPath, "utf8");
const css = fs.readFileSync(cssPath, "utf8");
const code = js.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── 1 · RUN the splitter against the real SOP ─────────────────────────────────────────────────
// 🔑 A regex over sopBlocks would be a claim about its source. The only honest answer to "does a
// bullet stay a bullet" is to feed it the instructions and look.
{
  const line = (needle) => { const i = js.indexOf(needle); return i < 0 ? "" : js.slice(i, js.indexOf("\n", i)); };
  const a = js.indexOf("function sopBlocks(raw) {");
  const body = a < 0 ? "" : js.slice(a, js.indexOf("\n}", a) + 2);
  const src = [line("const SOP_LI ="), line("const SOP_BU ="), line("const sopStrip ="), body].join("\n");
  let F;
  if (!body || !line("const SOP_BU =")) {
    fail.push("admin/admin.js — SOP_BU or sopBlocks is gone. Without a separate marker for bullets "
      + "there is only one kind of list item again, and a bulleted run continues the numbering of "
      + "the run above it.");
  } else {
    try {
      const ctx = vm.createContext({});
      vm.runInContext(src + "\nglobalThis._x = { sopBlocks, SOP_LI, SOP_BU, sopStrip };", ctx);
      F = ctx._x;
    } catch (e) { indet.push(`could not run sopBlocks in isolation: ${e.message}`); }
  }

  if (F) {
    const pb = JSON.parse(fs.readFileSync(pbPath, "utf8"));
    const all = [...(pb.month1 || []), ...(pb.month2plus || [])];
    const kind = (x) => (x.startsWith(F.SOP_LI) ? "ol" : x.startsWith(F.SOP_BU) ? "ul" : "p");

    // The step that exposed it, by name — a regression here is the reported bug returning.
    const k = all.find((s) => s.id === "m1.kickoff.call");
    if (!k) indet.push("m1.kickoff.call not in the playbook");
    else {
      const p = F.sopBlocks(k.instructions);
      const ols = p.filter((x) => kind(x) === "ol").length;
      const uls = p.filter((x) => kind(x) === "ul").length;
      if (!(ols >= 1 && uls >= 1)) {
        fail.push(`admin/admin.js — on m1.kickoff.call sopBlocks yields ${ols} numbered and ${uls} `
          + "bulleted items. Its instructions contain both, so collapsing them to one kind is the "
          + "defect: the bullets render as 4, 5, 6, 7, 8 under the three numbered ones.");
      } else pass.push(`the step that exposed it splits correctly — ${ols} numbered, ${uls} bulleted`);
    }

    // 🔑 AND EVERY OTHER STEP. "I fixed the one Chris screenshotted" is a claim about one card.
    const broken = all.filter((s) => {
      const raw = String(s.instructions || "");
      const hasNum = /^\s*\d{1,2}[.)](?!\d)/m.test(raw);
      const hasBul = /^\s*[•·*]\s/m.test(raw);
      if (!(hasNum && hasBul)) return false;
      const p = F.sopBlocks(raw);
      const ks = new Set(p.map(kind));
      return !(ks.has("ol") && ks.has("ul"));
    });
    if (broken.length) {
      fail.push(`${broken.length} step(s) whose instructions mix numbered and bulleted lists still `
        + `collapse to one kind: ${broken.slice(0, 4).map((s) => s.id).join(", ")}.`);
    } else pass.push("every step that mixes the two kinds keeps them apart");
  }
}

// ── 2 · the renderer closes a list when the kind changes ──────────────────────────────────────
if (!/const kindOf = \(x\) =>/.test(code) || !/kindOf\(sopParts\[j\]\) === kind/.test(code)) {
  fail.push("admin/admin.js — the instruction renderer no longer groups by kind, so one list holds "
    + "both again. The marker being right does not help if the markup ignores it.");
} else pass.push("the renderer closes a list when the kind changes");

// 🔴 Prose inside a list is a paragraph wearing a list's semantics — and it is what the old CSS
// counter existed to paper over.
if (/<li class="ob-sop-note">/.test(code)) {
  fail.push("admin/admin.js — prose is being emitted as a list item again. That is what the counter "
    + "hack in the stylesheet was compensating for; prose belongs in a <p>.");
} else pass.push("prose is a paragraph, not a list item");

// ── 3 · a heading above a run becomes a band, and 🔴 is what makes one critical ────────────────
{
  if (!/const isHeading = \(x\) =>/.test(code) || !/class="ob-band/.test(code)) {
    fail.push("admin/admin.js — headings no longer open a band, so the instructions are a flat wall "
      + "again. Approved shape: cover this · leave with this · then send this.");
  } else pass.push("a heading above a run opens that run's band");

  if (!/\/\^🔴\/\.test\(head\)/.test(code)) {
    fail.push("admin/admin.js — the critical band is no longer chosen by the 🔴 the SOP itself "
      + "carries. Whatever replaces it is this renderer recognising particular wording, which is an "
      + "instance fix wearing a design.");
  } else pass.push("the critical band is chosen by the SOP's own marker, not by wording");

  // 🔴 A SUBSTRING IS NOT A SELECTOR — `.ob-band.is-criticalX` matched the first version. Third
  // time this exact trap has bitten me in a gate today. Pin the boundary.
  // → feedback_a_gate_must_pin_the_property_not_the_spelling
  if (!/\.ob-band\.is-critical[\s,{:]/.test(css)) {
    fail.push("admin/admin.css — `.ob-band.is-critical` has no rule, so the band the step turns on "
      + "looks like every other one.");
  } else pass.push("the critical band is styled");
  if (!/\.ob-band[\s]*\{/.test(css)) {
    fail.push("admin/admin.css — `.ob-band` has no rule; the bands render unstyled.");
  } else pass.push("the bands are styled");
}

// ── 4 · the four shapes the SOP's own markers produce ─────────────────────────────────────────
// 🔑 Each is a convention the instructions already used as PLAIN TEXT. None of them names a step —
// a rule that recognised "After" or "talk track" would be one card dressed as a design.
// → feedback_fix_the_class_not_the_instance
for (const [needle, what, why] of [
  ["const isBandNote =", "a 🔑 note under a list",
   "a note written under a band's items belongs INSIDE that band; outside it reads as a new thought about nothing"],
  // 🔑 RE-POINTED 2026-10-02, NOT DELETED. The PROPERTY this defends is unchanged — a 📄 reference
  // is set apart from the instruction prose rather than left inline as file-path sentences. What
  // changed is the SHAPE: Chris approved admin_how_this_step_works_v1, where a reference is a typed
  // note ("Reference", quiet, no fill) instead of a <details> fold. The old `isRef` was folded into
  // the four-kind callout table. A gate that fails on the fix it was asked for is a gate defending
  // its own wording. → feedback_a_gate_must_pin_the_property_not_the_spelling
  ['{ re: /^📄', "a 📄 reference, set apart from the prose",
   "reference is read once — left inline it is two sentences of file-path prose in the middle of the instructions"],
  ['label: "Reference"', "the 📄 reference's own label",
   "an unlabelled quiet box does not say what kind of thing it is"],
  ["const LABEL =", "a `Label: sentence` line",
   "\"AFTER:\" rendered as shouted prose; it is a label and its sentence, one paragraph"],
  ["const liHtml =", "the bold lead in a list item",
   "`Scope — what RGA delivers` without the lead in bold is a wall of identical lines"],
]) {
  if (!code.includes(needle)) {
    fail.push(`admin/admin.js — ${what} is gone. ${why}.`);
  } else pass.push(`${what} is rendered`);
}

// 🔴 THE GUARDS MATTER MORE THAN THE RULES. Without a length cap, any sentence with a colon has
// its first half bolded and any mid-sentence dash bolds half a line — a formatting rule that
// starts rewriting prose. Pin that both stay bounded.
{
  const lab = (code.match(/const LABEL = (\/.*\/);/) || [])[1];
  if (lab && !/\{0,\d+\}|\{1,\d+\}/.test(lab)) {
    fail.push("admin/admin.js — the label rule has no length cap, so any sentence containing a colon "
      + "gets its first half bolded.");
  } else if (lab) pass.push("the label rule is bounded, so it cannot bold half a sentence");

  // 🔴 A CHECK THAT MATCHES NOTHING PASSES SILENTLY. The first version tried to extract this
  // pattern with `[^)]*`, which stops at the first `)` — and the pattern is full of capture groups,
  // so it never matched and neither branch ran. Take the function body instead.
  // → feedback_a_gate_that_cannot_fail
  const li = code.indexOf("const liHtml =");
  const liBody = li < 0 ? "" : code.slice(li, code.indexOf("};", li));
  if (!liBody) {
    fail.push("admin/admin.js — liHtml is gone, so list items lose their bold lead.");
  } else if (!/\{1,\s*\d+\}/.test(liBody)) {
    fail.push("admin/admin.js — the bold-lead rule has no length cap, so a mid-sentence dash bolds "
      + "everything before it.");
  } else pass.push("the bold-lead rule is bounded, so a mid-sentence dash is safe");
}

// 🔑 AND EVERY SHAPE HAS A STYLE, or it is an invisible control's quieter cousin: markup nobody sees.
for (const [sel, what] of [
  ["\\.ob-band-note", "the band note"],
  ["\\.ob-line", "the labelled line"],

]) {
  if (!new RegExp(sel + "[\\s,{:>]").test(css)) {
    fail.push(`admin/admin.css — ${what} has no rule, so it renders unstyled.`);
  } else pass.push(`${what} is styled`);
}

// 🔴 THE REFERENCE NOTE IS THE QUIET ONE. Checking that ".ob-note.ref" merely APPEARS passes on
// ".ob-note.ref p" alone — a substring is not a rule, and a renamed base rule slipped through.
// Pin the property that makes it a reference: no fill, so it recedes behind the three louder kinds.
{
  const i = css.indexOf(".ob-note.ref {");
  const rule = i < 0 ? "" : css.slice(i, css.indexOf("}", i));
  if (!rule) fail.push("admin/admin.css — the reference note has no rule of its own, so it renders like any other callout.");
  else if (!/background:\s*transparent/.test(rule)) {
    fail.push("admin/admin.css — the reference note has a fill; it is the quiet kind and must recede behind the other three.");
  } else pass.push("the reference note is the quiet kind");
}

// ── 5 · the critical band is not wearing the WARNING fill ─────────────────────────────────────
// 🔴 `--admin-warn-bg` is the fill for something that has gone WRONG. On this band nothing has —
// it is what the call is for — and at full strength it read as an alert. Chris: *"closer but not
// fully there"*; diffing the live card against the mockup put the whole difference in three
// background colours, this the loudest. → feedback_a_state_a_scale_and_a_series_are_three_palettes
{
  const i = css.indexOf(".ob-band.is-critical {");
  const rule = i < 0 ? "" : css.slice(i, css.indexOf("}", i));
  if (!rule) {
    fail.push("admin/admin.css — the critical band rule is gone.");
  } else if (/--admin-warn-bg/.test(rule)) {
    fail.push("admin/admin.css — the critical band is filled with `--admin-warn-bg`, the WARNING "
      + "background. Nothing has gone wrong on this band; at that strength it reads as an alert "
      + "about a problem rather than a grouping of what the call is for.");
  } else pass.push("the critical band is tinted, not alarmed");
}

for (const x of pass) console.log(`  ✅ ${x}`);
for (const i of indet) console.log(`  ⚠️  ${i}`);
for (const f of fail) console.log(`  🔴 ${f}`);
if (fail.length) { console.log(`\n🔴 FAIL — ${fail.length} way(s) the instructions misrepresent their own structure.`); process.exit(1); }
if (indet.length && !pass.length) { console.log("\n⚠️  INDETERMINATE"); process.exit(2); }
console.log(`\n✅ a bullet stays a bullet, prose stays prose, headings open bands (${pass.length} checks).`);

/* ─────────────────────────────────────────────────────────────────────────────────────────────────
 * MUTATION LOG — each must turn this gate red:
 *   1. drop SOP_BU and mark every item SOP_LI      → the reported bug, on every mixed step
 *   2. render all parts into one list              → same, from the other end
 *   3. emit prose as <li class="ob-sop-note">      → a paragraph wearing list semantics
 *   4. stop treating a heading as a band opener    → the flat wall returns
 *   5. pick the critical band by its wording       → an instance fix wearing a design
 *   6. delete .ob-band or .ob-band.is-critical     → unstyled / undifferentiated bands
 * ─────────────────────────────────────────────────────────────────────────────────────────────── */
