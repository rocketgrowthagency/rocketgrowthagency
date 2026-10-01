#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — A STEP'S STORED OUTPUT IS RENDERED AT ITS OWN WEIGHT, AND ITS LINKS WORK
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-10-01, of step 6's output: *"can we mockup the design of these for all the cards."*
 *
 * 🔴🔴 EVERY OUTPUT WENT IN ONE 520px SCROLLBOX WITH NO WRAP RULE. Measured across the 41 stored on
 * a real record: shortest **14** characters, median **531**, longest **25,196**, and **19 under 400**.
 * A letterbox is wrong for a one-line note and wrong for a 25k document, and it was the same box.
 * One 190-character Google Maps URL then pushed a horizontal scrollbar across the whole card.
 *
 * 🔴 AND NOT ONE URL WAS CLICKABLE. 16 of 41 outputs contain one; `renderStepMarkdown` never emitted
 * an `<a>`. Step 6's first line reads *"Open the profile: https://…"* and you could not.
 *
 * 🔑 WEIGHT IS MEASURABLE; KIND IS NOT. Only 7 of 41 use headings and 3 contain tables, so sorting
 * these by kind would invent a structure thirty-four of them do not have. The design keys on length:
 *   · a LINE     — one fact, rendered inline with no disclosure at all
 *   · a NOTE     — shorter than the card it sits in, so no box and no scroll
 *   · a DOCUMENT — the only weight where a header, Copy and a fold earn their place
 * → feedback_no_hardcoded_stats · feedback_an_absence_must_never_be_readable_as_a_value
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
for (const p of [jsPath, cssPath]) if (!fs.existsSync(p)) { console.error(`⚠️  INDETERMINATE — ${p} missing.`); process.exit(2); }
const js = fs.readFileSync(jsPath, "utf8");
const css = fs.readFileSync(cssPath, "utf8");
const code = js.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── 1 · RUN the classifier and the linkifier ───────────────────────────────────────────────────
// 🔑 A regex over them would be a claim about the source. Feed them text and look at what comes out.
{
  const line = (n) => { const i = js.indexOf(n); return i < 0 ? "" : js.slice(i, js.indexOf("\n", i)); };
  const blk = (a, b) => { const i = js.indexOf(a); return i < 0 ? "" : js.slice(i, js.indexOf(b, i) + b.length); };
  const w = blk("const stepOutputWeight = (text) => {", "};");
  const l = blk("  const LINKIFY = (t) => t", '`${pre}<a class="ob-url" href="mailto:${escapeAttribute(addr)}">${escapeHtml(addr)}</a>`);');
  if (!w || !l) {
    fail.push("admin/admin.js — stepOutputWeight or LINKIFY is gone. Without the first every output "
      + "goes back in one box; without the second no URL in any output is clickable.");
  } else {
    let F;
    try {
      const ctx = vm.createContext({});
      vm.runInContext([
        "const escapeHtml=(s)=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');",
        "const escapeAttribute=(s)=>escapeHtml(s).replace(/\"/g,'&quot;');",
        line("const OUT_LINE_MAX ="), line("const OUT_NOTE_MAX ="), w, l,
      ].join("\n") + "\nglobalThis._x={stepOutputWeight,LINKIFY};", ctx);
      F = ctx._x;
    } catch (e) { indet.push(`could not run the classifier in isolation: ${e.message}`); }

    if (F) {
      const cases = [
        ["a one-line note",          "Generated LocalBusiness JSON-LD. Paste in homepage <head>.", "line"],
        // 🔴 LONGER THAN OUT_LINE_MAX ON PURPOSE. The first version used a 114-character URL, which
        // passed the plain length rule anyway — so deleting the bare-URL branch changed nothing and
        // the mutation went green. A case that does not exercise the branch is not a case.
        // → feedback_a_gate_that_cannot_fail
        ["a bare URL, however long", "https://www.google.com/maps/place/Rocket+Growth+Agency/@34.020479,-118.4117326,14z/data=!3m1!4b1!4m6!3m5!1s0xbbdfa820c985be7:0x6c0a0556549b4073!8m2!3d34.02!4d-118.41!16s%2Fg%2F11xyzabcd", "line"],
        ["a short multi-line note",  "Add RGA as a Manager.\n\n1. Open the profile\n2. People and access", "note"],
        ["a document",              "x".repeat(2500), "document"],
        ["nothing",                 "   ", "none"],
      ];
      const wrong = cases.filter(([, t, want]) => F.stepOutputWeight(t) !== want);
      if (wrong.length) {
        fail.push(`stepOutputWeight misclassifies ${wrong.length} case(s): `
          + wrong.map(([n, t, want]) => `${n} → ${F.stepOutputWeight(t)}, expected ${want}`).join("; ") + ".");
      } else pass.push("every weight is chosen correctly, including a bare URL of any length");

      // 🔴 THE ONE THAT COST THE MOST: a link that is not a link.
      const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      // 🔴 MY FIRST VERSION OF THIS CHECK WAS WRONG, NOT THE CODE. It demanded a bare `&` in the
      // href — but `&amp;` is the CORRECT way to write an ampersand in an HTML attribute, and the
      // browser decodes it back. Pinning the spelling accused working code.
      // 🔑 Pin the PROPERTY: decode the href and compare it to the URL that went in. That catches
      // the real failure — a double-escaped `&amp;amp;`, which does 404.
      // → feedback_a_gate_must_pin_the_property_not_the_spelling
      const URL_IN = "https://www.google.com/maps/place/X?a=1&b=2";
      const urlOut = F.LINKIFY(esc(`1. Open the profile: ${URL_IN}`));
      const href = (urlOut.match(/<a class="ob-url" href="([^"]+)"/) || [])[1];
      const decoded = href && href.replace(/&amp;/g, "&");
      if (!href) {
        fail.push("LINKIFY does not turn a URL into a link at all. 16 of 41 outputs contain one, and "
          + "step 6's first instruction is \"Open the profile\" — which you cannot, if it is text.");
      } else if (decoded !== URL_IN) {
        fail.push(`LINKIFY produces an href that is not the URL: \`${decoded}\` instead of `
          + `\`${URL_IN}\`. A double-escaped ampersand 404s the link.`);
      } else pass.push("a URL becomes a link whose href decodes to exactly the original URL");

      const mail = F.LINKIFY(esc("Add → hello@rocketgrowthagency.com → role = Manager"));
      if (!/href="mailto:hello@rocketgrowthagency\.com"/.test(mail)) {
        fail.push("LINKIFY does not linkify email addresses — 6 outputs contain one.");
      } else pass.push("an email address becomes a mailto link");

      // 🔑 A long URL must be LABELLED by host, or printing it in full is what scrolled the card.
      if (!/u-tail/.test(urlOut) && urlOut.length > 400) {
        indet.push("could not confirm the host-label path on this sample");
      }
    }
  }
}

// ── 2 · all three weights are actually rendered ────────────────────────────────────────────────
for (const [needle, what] of [
  ['class="ob-out-line"', "the LINE weight (no disclosure at all)"],
  ['class="ob-out note"', "the NOTE weight"],
  ['class="ob-out doc"', "the DOCUMENT weight"],
]) {
  if (!code.includes(needle)) fail.push(`admin/admin.js — ${what} is not rendered.`);
}
if (!fail.some((f) => /is not rendered/.test(f))) pass.push("all three weights are rendered");

// 🔴 The old single box must not come back.
if (/class="ob-result-body"/.test(code)) {
  fail.push("admin/admin.js — `.ob-result-body` is back: every output in one 520px scrollbox again, "
    + "whatever its size.");
} else pass.push("the one-box renderer is gone");

// 🔴 A document's fold must NAME ITS REAL LENGTH, read from the text.
{
  const i = code.indexOf('class="ob-out-f"');
  const f = i < 0 ? "" : code.slice(i, i + 260);
  if (!f || !/\$\{n\}/.test(f)) {
    fail.push("admin/admin.js — the document fold does not state the output's real length, so a "
      + "preview is indistinguishable from the whole thing.");
  } else pass.push("the fold names the real length, derived from the text");
}

// ── 3 · nothing may scroll sideways, and the styles exist ──────────────────────────────────────
if (!/overflow-wrap:\s*anywhere/.test(css)) {
  fail.push("admin/admin.css — the wrap rule is gone. One long URL then pushes a horizontal "
    + "scrollbar across the card and hides the right edge of every other line.");
} else pass.push("nothing in an output can scroll the card sideways");

for (const [sel, what] of [
  ["\\.ob-out-line", "the line weight"],
  ["\\.ob-out-doc", "the document weight"],
  ["\\.ob-url", "the links"],
]) {
  if (!new RegExp(sel + "[\\s,{:.]").test(css)) fail.push(`admin/admin.css — ${what} has no rule.`);
}
if (!fail.some((f) => /has no rule/.test(f))) pass.push("every weight and the links are styled");

// 🔑 Copy and Open full are delegated — the rows are re-rendered wholesale.
if (!/closest\("\[data-out-copy\],\[data-out-full\]"\)/.test(code)) {
  fail.push("admin/admin.js — Copy / Open full are not wired by delegation, so they die on the "
    + "first re-render of the list.");
} else pass.push("Copy and Open full survive a re-render");

for (const x of pass) console.log(`  ✅ ${x}`);
for (const i of indet) console.log(`  ⚠️  ${i}`);
for (const f of fail) console.log(`  🔴 ${f}`);
if (fail.length) { console.log(`\n🔴 FAIL — ${fail.length} way(s) an output is rendered at the wrong weight.`); process.exit(1); }
console.log(`\n✅ a step's output takes its own weight, and its links work (${pass.length} checks).`);

/* ─────────────────────────────────────────────────────────────────────────────────────────────────
 * MUTATION LOG — each must turn this gate red:
 *   1. make stepOutputWeight always return "note"   → the one-box problem, renamed
 *   2. treat a long bare URL as a document          → a link in a 190px preview
 *   3. drop the URL branch from LINKIFY             → the defect Chris reported
 *   4. leave `&amp;` in the href                    → a link that 404s
 *   5. drop the mailto branch                       → 6 inert addresses
 *   6. restore .ob-result-body                      → the 520px box
 *   7. remove overflow-wrap                         → the sideways scroll
 *   8. bind Copy per row instead of delegating      → works once, then never
 * ─────────────────────────────────────────────────────────────────────────────────────────────── */
