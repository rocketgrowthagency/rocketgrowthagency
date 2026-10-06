#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// A NOTE MUST NOT STATE SOMETHING THE MEASUREMENT BESIDE IT CONTRADICTS
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴🔴 WHAT WENT WRONG (on the live card, 2026-10-06). Three rows apart:
//
//   WHERE YOU COMPETE   local seo agency culver city   [map pack]   32 reviews
//                       seo company culver city ca     [map pack]   32 reviews
//
//   How this plan was narrowed
//     Below Google's floor  2 keywords — local seo agency culver city · seo company culver city ca
//                           kept: autocomplete confirms they are typed, SO A PAGE CAN RANK FOR THEM.
//
// The surface was MEASURED for those exact terms and said map pack. The note asserted page. The
// sentence was hardcoded in both producers, written before the surface measurement existed, and the
// data to be right was in the same object it rendered from.
//
// 🔑 A BLOCK THAT MEASURES A PROPERTY OWNS THAT PROPERTY. A note beside it may say why a term was
// KEPT; it may not say where that term competes.
//
// 🔴 AND "UNSIZED" WAS TWO FACTS REPORTED AS ONE. `atFloorV` is true for a volume AT Google's floor
// bucket and for a volume of `null`. "local seo agency culver city" came back 10; "seo company
// culver city ca" came back null; the note called both "below Google's reporting floor — too
// specific for the Keyword Planner to size", a precise claim about a measurement that, for the
// second term, never happened.
//
// 🔴 AND THE CHIPS IN "Candidates dropped" WERE THE MEASURING STICK. It rendered RGA's own service
// names in the same `.tag` chip the row above uses for dropped keywords, reading as "here are three
// of the twenty we dropped" — the opposite of true.
//
// → feedback_a_client_message_must_agree_with_itself · feedback_an_absence_must_never_be_readable_as_a_value
// → feedback_a_control_has_a_kind_like_a_message_does · project_a_keyword_has_a_surface
//
// Exit 0 healthy · 1 the product is wrong · 2 INDETERMINATE

import fs from "node:fs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const fails = [];
const F = (m) => fails.push(m);

function read(p, what) {
  try { return fs.readFileSync(p, "utf8"); }
  catch { console.error(`⚠️  INDETERMINATE — cannot read ${what}`); process.exit(2); }
}
const adminSrc = read(`${SITE}/admin/admin.js`, "admin.js");
const execSrc = read(`${SITE}/netlify/functions/flow-execute.js`, "flow-execute.js");
const cssSrc = read(`${SITE}/admin/admin.css`, "admin.css");

/** Brace-match a top-level `function NAME(...)`. */
function liftFunction(src, name) {
  const m = src.match(new RegExp("^function " + name + "\\s*\\(", "m"));
  if (!m) return "";
  const lp = src.indexOf("(", m.index);
  let pd = 0, afterParams = -1;
  for (let i = lp; i < src.length; i++) {
    if (src[i] === "(") pd++;
    else if (src[i] === ")") { pd--; if (!pd) { afterParams = i + 1; break; } }
  }
  const open = src.indexOf("{", afterParams);
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") d++;
    else if (src[i] === "}") { d--; if (!d) return src.slice(m.index, i + 1); }
  }
  return "";
}

// 🔴 LINE COMMENTS FIRST. Every comment in this file explains the bug using the exact banned
// wording, so a stripper in the wrong order — or none at all — makes this gate accuse itself.
// → feedback_a_comment_stripper_in_the_wrong_order_deletes_code
const decomment = (s) => s.replace(/^[ \t]*\/\/.*$/gm, " ").replace(/\/\*[\s\S]*?\*\//g, " ");

// ───────────────────────────────────────────────────────────────────────────────────────────────────
// 1 — THE UNSIZED NOTE MAKES NO CLAIM ABOUT WHERE A TERM COMPETES
// ───────────────────────────────────────────────────────────────────────────────────────────────────
// Pinned as a property of the SURFACE VOCABULARY, not as the one sentence that was wrong: any claim
// about pack-vs-page inside this note is the defect, however it comes to be worded.
const SURFACE_WORDS = /\b(a page can rank|map pack|the pack|on the content side|won with a page|needs a page)\b/i;

const narrowed = liftFunction(decomment(adminSrc), "obNarrowedBlockHtml");
if (!narrowed) F("admin.js: obNarrowedBlockHtml not found — the narrowed panel has no renderer to check");
else {
  const floorRow = narrowed.slice(0, narrowed.indexOf("service_fit_note") >= 0 ? narrowed.indexOf("service_fit_note") : narrowed.length);
  if (SURFACE_WORDS.test(floorRow)) {
    F(`admin.js: the unsized-keyword row still claims where a term competes (${(floorRow.match(SURFACE_WORDS) || [])[0]}) — the surface block measures that`);
  }
}

// Same sentence, server side.
const execClean = decomment(execSrc);
const floorNote = (execClean.match(/below Google[’']s reporting floor[\s\S]{0,900}/) || [""])[0]
  || (execClean.match(/could not be\s*`?\s*\+?\s*`?sized in[\s\S]{0,900}/) || [""])[0];
if (!floorNote) F("flow-execute.js: could not find the unsized-keyword note to check");
else if (SURFACE_WORDS.test(floorNote)) {
  F(`flow-execute.js: the unsized-keyword note still claims where a term competes (${(floorNote.match(SURFACE_WORDS) || [])[0]})`);
}

// ───────────────────────────────────────────────────────────────────────────────────────────────────
// 2 — AN UNSIZED TERM SAYS WHICH KIND, AND THE THREE STATES ARE DISTINCT
// ───────────────────────────────────────────────────────────────────────────────────────────────────
// `sized` must be RECORDED where the volume is still in hand…
if (!/sized:\s*d2\.volume\s*!==\s*null/.test(execClean))
  F("flow-execute.js: floorKept does not record whether Google actually sized the term — null and at-the-floor collapse into one claim again");

// …and both renderers must branch on it into THREE distinct answers (true / false / neither).
for (const [label, src] of [["flow-execute.js", execClean], ["admin.js", narrowed]]) {
  if (!src) continue;
  // 🔴 THE WINDOW ENDED AT THE FIRST `?`, WHICH IS THE ONE OPENING THE SECOND BRANCH — so the gate
  // only ever saw the FIRST answer and reported two different sentences as identical. Read to the
  // end of the statement instead of guessing a character count.
  // → feedback_a_gate_window_measured_in_characters_will_lie
  const m = src.match(/sized\s*===\s*true[\s\S]*?;/);
  if (!m || !/sized\s*===\s*false/.test(m[0])) {
    F(`${label}: the unsized reason does not branch on sized===true AND sized===false — a draft with neither flag borrows a wording it did not earn`);
    continue;
  }
  const branch = m[0];
  // 🔴 A NAIVE LITERAL REGEX SPLIT ON THE APOSTROPHE INSIDE "below Google's reporting floor" and
  // compared the fragment "below Google" against itself, reporting the two branches as identical
  // when they differ. Scan double-quoted and template strings properly, honouring escapes.
  // → feedback_the_harness_i_wrote_to_check_my_work_can_lie
  const answers = [
    ...branch.matchAll(/"((?:[^"\\]|\\.)*)"/g),
    ...branch.matchAll(/`((?:[^`\\]|\\.)*)`/g),
  ].map((x) => x[1].trim().toLowerCase()).filter((x) => x.length >= 6);
  const distinct = new Set(answers);
  if (distinct.size < 2) F(`${label}: the sized branches do not produce different sentences (${[...distinct].join(" / ") || "none found"})`);
  // The at-the-floor wording must not be the one an ABSENT measurement gets.
  const floorish = answers.filter((a) => /floor/.test(a));
  if (floorish.length > 1) F(`${label}: more than one sized state is described as "the floor" — ${floorish.join(" / ")}`);
}

// ───────────────────────────────────────────────────────────────────────────────────────────────────
// 3 — A CHIP IN THIS PANEL IS A KEYWORD, NEVER THE CRITERION IT WAS JUDGED AGAINST
// ───────────────────────────────────────────────────────────────────────────────────────────────────
if (narrowed) {
  const fitIdx = narrowed.indexOf("service_fit_note");
  const fitRow = fitIdx >= 0 ? narrowed.slice(fitIdx) : "";
  if (!fitRow) F("admin.js: the Candidates-dropped row was not found");
  else if (/class="tag"/.test(fitRow))
    F("admin.js: the Candidates-dropped row still chips the business's SERVICES — the same chip the row above uses for dropped keywords, so the criterion reads as the subject");
}

// ───────────────────────────────────────────────────────────────────────────────────────────────────
// 4 — ANY CLASS THIS PANEL INTRODUCES HAS A STYLE, AND DOES NOT STEAL AN EXISTING NAME
// ───────────────────────────────────────────────────────────────────────────────────────────────────
if (narrowed) {
  const cssClean = decomment(cssSrc);
  for (const m of narrowed.matchAll(/class="([a-z0-9 _-]+)"/gi)) {
    for (const cls of m[1].split(/\s+/).filter(Boolean)) {
      // 🔑 ONLY THE COMPONENT NAMESPACE. `.tag`, `.k` and `.b` are deliberately panel-local
      // utilities scoped by their parent — reusing those short names is the pattern, not the bug.
      // An `ob-`-prefixed name is a COMPONENT, and two components sharing one is how `.ob-note`
      // came to inherit a bordered box's size and ink in production.
      if (!/^ob-/.test(cls)) {
        if (!new RegExp("\\." + cls + "\\b").test(decomment(cssSrc)))
          F(`admin.css: the narrowed panel renders .${cls} and nothing styles it`);
        continue;
      }
      if (!new RegExp("\\." + cls + "\\b").test(cssClean))
        F(`admin.css: the narrowed panel renders .${cls} and nothing styles it`);
      // A class used elsewhere in the product must not be re-pointed by a scoped override here.
      const usesOutside = (decomment(adminSrc).split(`class="`).filter((x) => x.startsWith(cls + `"`) || x.startsWith(cls + ` `)).length);
      const scoped = new RegExp("\\.ob-ctx-row\\s+\\." + cls + "\\b").test(cssClean);
      if (scoped && usesOutside > 1)
        F(`admin.css: .${cls} is scoped for this panel but the name is already used by ${usesOutside - 1} other element(s) — two components share a name, which is how .ob-note inherited a box's ink`);
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────────────────────────────
// 5 — THE UNSIZED ANNOTATION OWNS ITS CLASS NAME
// ───────────────────────────────────────────────────────────────────────────────────────────────────
// 🔴 The first build called it `.ob-why` — a name ALREADY TAKEN by a paragraph on five step rows
// (the decline label and the editorial "why"). It still rendered, because that global rule exists,
// so nothing looked broken: the annotation simply inherited a paragraph's size and ink, which is the
// `.ob-note` failure exactly. Styling it by a scoped rule is not optional — it is what proves the
// name belongs to this panel. → feedback_fix_the_class_not_the_instance
if (narrowed) {
  const ann = narrowed.match(/unsizedWhy?\s*\([\s\S]{0,300}?class="(ob-[a-z0-9_-]+)"/i)
    || narrowed.match(/class="(ob-[a-z0-9_-]+)">\$\{esc\(w\)\}/i);
  if (!ann) F("admin.js: could not find the class the unsized reason is rendered with");
  else {
    const cls = ann[1];
    const cssClean = decomment(cssSrc);
    if (!new RegExp("\\.ob-ctx-row\\s+\\." + cls + "\\b").test(cssClean))
      F(`admin.css: .${cls} carries the unsized reason but has no rule scoped to this panel — if it looks right it is borrowing another component's styles, which is how .ob-note inherited a box's ink`);
  }
}

// ───────────────────────────────────────────────────────────────────────────────────────────────────
if (fails.length) {
  console.error(`❌ A NOTE CONTRADICTS THE MEASUREMENT BESIDE IT — ${fails.length} problem(s):\n`);
  for (const f of fails) console.error(`   · ${f}`);
  process.exit(1);
}
console.log("✅ the unsized note claims no surface · each unsized term says which kind · chips are keywords only · no class collisions");
