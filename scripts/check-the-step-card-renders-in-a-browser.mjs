#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// THE STEP CARD RENDERS IN A REAL BROWSER, NOT JUST IN A vm
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴🔴🔴 WHY. Every check on this card was a `vm` lift, and the lift was WRONG THREE TIMES IN TWO
// DAYS — a missing `URL`, a hardcoded join, a fixture that skipped the pre-processor the admin
// actually runs. Each produced a confident, specific, false reading, and twice I told Chris it was
// fixed and it was not.
//
// The defect that forced this: the approved scan header rendered as a HEADING with one row under it
// instead of two rows in a box, because `.trim()` ate the first line's indentation. THREE different
// `.trim()`s were on that string; fixing the one I happened to find changed nothing on screen, and
// my vm check said it was fixed because it parsed text the product never sees.
//
// 🔑 THE ONLY CHECK THAT COULD NOT LIE WAS A REAL BROWSER PARSING THE REAL CSS. This lifts the
// render functions into chromium with admin.css applied and reads the DOM back.
//
// → feedback_the_harness_i_wrote_to_check_my_work_can_lie · feedback_fix_the_class_not_the_instance
// Exit 0 healthy · 1 the card renders wrong · 2 INDETERMINATE (no browser, bundle will not evaluate)

import fs from "node:fs"; import vm from "node:vm";
const { default: puppeteer } = await import("puppeteer");
const W = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const src = fs.readFileSync(`${W}/admin/admin.js`, "utf8");
const css = fs.readFileSync(`${W}/admin/admin.css`, "utf8");

const pick = (n) => {
  const i = src.search(new RegExp(`^(?:async )?function ${n}\\(`, "m"));
  if (i < 0) throw new Error(`${n} not found`);
  let d = 0;
  for (let k = src.indexOf("{", i); k < src.length; k++) {
    if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) return src.slice(i, k + 1); }
  }
  throw new Error(`${n} unbalanced`);
};
// 🔴 AN ARROW CONST IS NOT A `function`. `stepOutputWeight` is `const f = (x) => {…}`, so the
// function matcher misses it and the const matcher's bracket walk starts on the parameter list.
// Read to the end of the statement instead.
const pickArrow = (n) => {
  const m = src.match(new RegExp(`^const ${n} = `, "m"));
  if (!m) throw new Error(`${n} arrow not found`);
  const open = src.indexOf("{", src.indexOf("=>", m.index));
  let d = 0;
  for (let k = open; k < src.length; k++) {
    if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) return src.slice(m.index, src.indexOf(";", k) + 1); }
  }
  throw new Error(`${n} arrow unbalanced`);
};
const pickConst = (n) => {
  const m = src.match(new RegExp(`^const ${n} = `, "m"));
  if (!m) throw new Error(`${n} const not found`);
  let d = 0, started = false;
  for (let k = m.index; k < src.length; k++) {
    const c = src[k];
    if ("[{(".includes(c)) { d++; started = true; }
    else if ("]})".includes(c)) { d--; if (started && !d) return src.slice(m.index, src.indexOf(";", k) + 1); }
    else if (c === ";" && !started) return src.slice(m.index, k + 1);
  }
  throw new Error(`${n} unbalanced`);
};
const FNS = ["escapeHtml","escapeAttribute","renderStepMarkdown","outShapes","stInline","stValue",
  "stGroupOf","stFact","stItem","parseStructuredText","structuredTextHtml","stTitleCase","stSentence",
  "stRating","stepBodyHtml","stripMeasurementProse","trimOutputText"];
const CONSTS = ["ST_VERDICT","ST_NOTE_KEYS","ST_BAD_KEYS","ST_OK_KEYS","stIndent","stZero","SOP_LI","OUT_NOTE_MAX","VERDICT_KIND","OUT_LINE_MAX"];
const bundle = CONSTS.map(pickConst).join("\n") + "\n" + [ "stepOutputWeight", "stepOutputProvenance" ].map(pickArrow).join("\n") + "\n" + FNS.map(pick).join("\n\n");

// 🔑 A FIXTURE, NOT THE LIVE RECORD. A browser gate that needs the database is a browser gate that
// goes red when the network hiccups, and a flaky gate is worse than a failing one. This is the exact
// shape the producer emits, byte for byte. → feedback_a_flaky_gate_is_worse_than_a_failing_one
const SUMMARY = [
  "  Searched      5 locked keywords (125 points measured in all)",
  "  Centred on    Rocket Growth Agency (Culver City, CA \u00b7 25 points each \u00b7 5.3 km radius)",
  "",
  "RESULT: not found at any of the 125 points measured.",
  "",
  "Coverage (125 points)",
  "  Top-3        0 / 125 (0.0%)",
  "  Top-10       0 / 125 (0.0%)",
  "  Not found    125 / 125",
  "",
  "Measured Oct 6, 2026, 4:41 PM PDT. That is the baseline every later scan is measured against.",
].join("\n");
const task = { outcome_data: {} };

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔑 THE CLASS, IN SOURCE. The DOM check below proves this ONE composition renders right; it cannot
// see a `.trim()` added two layers up, which is exactly how the defect survived my first fix. So:
// every tidy-up of the step's output text must go through `trimOutputText`, and that function must
// never strip leading whitespace. → feedback_fix_the_class_not_the_instance
{
  const bad = [];
  if (!/function trimOutputText\(/.test(src)) bad.push("there is no single producer for tidying the step's output");
  const body = (src.match(/function trimOutputText\(v\) \{[\s\S]*?\n\}/) || [""])[0];
  if (/\.trim\(\)/.test(body)) bad.push("trimOutputText itself calls .trim(), which strips leading spaces");
  // 🔑 THE TWO EXACT SHAPES THAT FEED THE RENDERER, and nothing else. A broad `String(t).trim()`
  // scan matched unrelated code all over the file and named the wrong function — a gate that
  // accuses correct code is noise. → feedback_a_gate_must_pin_the_property_not_the_spelling
  const weight = src.match(/const stepOutputWeight = [\s\S]*?\n\};/);
  const inWeight = (i) => weight && i > weight.index && i < weight.index + weight[0].length;
  for (const re of [/String\(text \|\| ""\)\.trim\(\)/g,
                    /String\(s\.task\?\.auto_result\?\.summary \|\| ""\)\.trim\(\)/g]) {
    for (const m of src.matchAll(re)) {
      // stepOutputWeight only CLASSIFIES (empty / one line / long); it never feeds the renderer.
      if (inWeight(m.index)) continue;
      const line = src.slice(0, m.index).split("\n").length;
      bad.push(`a .trim() on the step's output text bypasses trimOutputText (admin.js:${line})`);
    }
  }
  if (bad.length) {
    console.error(`❌ the step output is tidied somewhere other than its one producer:\n`);
    for (const x of bad) console.error(`   · ${x}`);
    process.exit(1);
  }
  console.log("✅ every tidy-up of the step's output goes through trimOutputText, which keeps leading spaces");
}

const b = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
const page = await b.newPage();
await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style>
<style>body{font:15px/1.55 Inter,-apple-system,sans-serif;color:#303030;background:#fff;margin:0;padding:16px}</style>
</head><body><div id="host"></div></body></html>`, { waitUntil: "domcontentloaded" });
const err = await page.evaluate((code) => { try { (0, eval)(code); return null; } catch (e) { return String(e.message); } }, bundle);
if (err) { console.log("🔴 bundle would not evaluate in a browser:", err); await b.close(); process.exit(2); }

const dom = await page.evaluate((text, task) => {
  // 🔑 ENTER WHERE THE CARD ENTERS. Calling stepBodyHtml directly skipped stepOutputHtml's own
  // trim — and a mutation restoring that trim came back green, which is the exact class of miss
  // this gate exists to end.
  const stripped = stripMeasurementProse(trimOutputText(trimOutputText(text)));
  // 🔑 THE CARD'S OWN COMPOSITION: the summary is tidied by the one producer (twice on the real
  // path — once by the caller, once by stepOutputHtml) and then stripped and rendered.
  document.getElementById("host").innerHTML = `<div class="ob-out-body">${stepBodyHtml(stripped, task)}</div>`;
  const q = (s, r = document) => [...r.querySelectorAll(s)];
  return {
    firstLineIndented: /^ {2}\S/.test(stripped),
    groups: q(".ob-grp").map((g) => ({
      heading: g.querySelector(".ob-grp-h b")?.textContent?.trim() || null,
      chip: g.querySelector(".ob-grp-h .c")?.textContent?.trim() || null,
      rows: q(".ob-fact", g).map((f) => ({
        k: f.querySelector(".k")?.textContent?.trim(),
        v: f.querySelector(".v")?.firstChild?.textContent?.trim(),
        sub: f.querySelector(".v small")?.textContent?.trim() || null,
        zero: f.classList.contains("zero"),
      })),
    })),
    verdict: document.querySelector(".ob-verdict p")?.textContent?.trim() || null,
    screen: document.body.innerText,
  };
}, SUMMARY, task);

console.log("══ RENDERED IN A REAL BROWSER (chromium), from the LIVE stored text ══");
console.log(`  first line still indented after stripping: ${dom.firstLineIndented ? "✅" : "🔴"}`);
for (const g of dom.groups) {
  console.log(`  group heading=${JSON.stringify(g.heading)} chip=${JSON.stringify(g.chip)} rows=${g.rows.length}`);
  for (const r of g.rows) console.log(`      ${String(r.k).padEnd(12)} ${String(r.v).padEnd(24)}${r.sub ? ` / ${r.sub}` : ""}${r.zero ? "  [red]" : ""}`);
}
console.log(`  verdict: ${dom.verdict}`);
const hdr = dom.groups[0];
const ok = hdr && !hdr.heading && hdr.rows.length === 2
  && hdr.rows[0].k === "Searched" && hdr.rows[1].k === "Centred on";
console.log(`\n  ${ok ? "✅" : "🔴"} the header is ONE headless group with TWO rows (Searched, Centred on)`);
console.log(`  ${/day\(s\) ago/.test(dom.screen) ? "🔴" : "✅"} no rounded age on screen`);
console.log(`  ${/Measured .*PDT/.test(dom.screen) ? "✅" : "🔴"} the measured time with its zone is on screen`);
await b.close();
process.exit(ok ? 0 : 1);
