#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — A JUMP MUST MOVE THE PAGE, INCLUDING WHEN YOU ARE ALREADY ON THAT TAB
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-09-27: *"go to request button doesnt work on admin portal side."*
 *
 * He was on **Overview**, and "Needs your attention" offered **Go to the request →** carrying
 * `tab: "overview"`. The handler ran, called `setActiveTab("overview")`, the tab was already active,
 * and the page did not move a pixel. The card it meant was ~1500px further down the same page.
 *
 * 🔑 The button was wired. The handler fired. Nothing happened — which reads exactly like a broken
 * control, and is worse than one, because there is nothing to report.
 *
 * `check-every-jump-lands-somewhere-visible.mjs` does NOT cover this: it guards the client portal
 * and the opposite mistake — scrolling to an element without naming the tab it lives in. This is the
 * inverse: naming a tab and having nowhere to land.
 *
 * WHAT IS PINNED:
 *   1. `[data-goto-tab]` has exactly ONE handler. It had two — a document delegate that was added
 *      because the per-render one "did nothing anywhere else", and the per-render one, still bound.
 *   2. That handler SCROLLS, not just switches — so a jump to the tab you are on still moves.
 *   3. It falls back to the tab's own panel when no element is named, so no jump is ever a no-op.
 *   4. Every alert descriptor that points at its OWN tab names a scroll target, because for those
 *      the tab switch can do nothing by definition.
 *   5. Every named scroll target actually exists in the bundle.
 *
 * Exit 0 pass · 1 fail · 2 indeterminate. Mutation log at the bottom.
 */
import fs from "node:fs";
import path from "node:path";

const WEB = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const fail = [], indet = [], pass = [];
const p = path.join(WEB, "admin/admin.js");
if (!fs.existsSync(p)) { console.log("  ⚠️  admin.js missing"); process.exit(2); }
const src = fs.readFileSync(p, "utf8");
if (src.length < 100000) { console.log("  ⚠️  admin.js too small — cannot judge"); process.exit(2); }

// Comments quote this attribute when explaining the bug; they are not handlers.
const code = src.replace(/^\s*\/\/.*$/gm, "");
// 🔑 THE TARGETS LIVE IN THE HTML. A first version read only admin.js and reported four real,
// working jumps as landing nowhere — every one of those ids is declared in admin/index.html.
// A check that looks in one file is a claim about that file, not about the page.
// → feedback_an_inventory_is_a_claim_about_what_i_thought_to_grep
const htmlPath = path.join(WEB, "admin/index.html");
const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, "utf8") : "";
if (!html) indet.push("admin/index.html missing — scroll targets declared there cannot be verified");

// ── 1. ONE HANDLER ──────────────────────────────────────────────────────────────────────────────
// 🔑 BRACE-MATCH EACH LISTENER, DO NOT WINDOW IT. A 900-character look-ahead reported SEVEN
// handlers, because unrelated listeners sitting near one picked up its text. The handler's own body
// is the only honest boundary. → feedback_a_gate_window_measured_in_characters_will_lie
function listenerBody(from) {
  const brace = code.indexOf("{", code.indexOf("=>", from));
  if (brace < 0) return "";
  let d = 0;
  for (let i = brace; i < code.length; i++) {
    if (code[i] === "{") d++;
    else if (code[i] === "}") { d--; if (d === 0) return code.slice(from, i + 1); }
  }
  return "";
}
// 🔑 COUNT BINDING SITES, NOT LISTENERS NEAR THE TEXT. Brace-matching every click listener and
// asking "does its body mention the attribute?" over-counted too: one mis-bounded body swallowed a
// later function that merely QUERIES the button to rewrite its label. There are exactly two ways to
// bind this attribute, and both are recognisable on sight:
//   · delegation   — closest("[data-goto-tab]") inside a listener
//   · per-render   — querySelectorAll("[data-goto-tab]") … addEventListener
// A `querySelector` (singular) with no addEventListener is a LOOKUP, and must not count.
const delegated = [...code.matchAll(/closest\(\s*["']\[data-goto-tab\]["']\s*\)/g)];
const perRender = [...code.matchAll(/querySelectorAll\(\s*["']\[data-goto-tab\]["']\s*\)[\s\S]{0,240}?addEventListener/g)];
const handlers = [...delegated, ...perRender];
if (handlers.length === 0) {
  fail.push("nothing handles [data-goto-tab] — every cross-panel jump in the admin is dead.");
} else if (handlers.length > 1) {
  fail.push(`[data-goto-tab] is bound in ${handlers.length} places (${delegated.length} delegated, `
    + `${perRender.length} per-render). It had two once: a document delegate `
    + `added because the per-render one "did nothing anywhere else", and the per-render one still `
    + `bound beneath it. Behaviour added to one silently skips the other's panel.`);
} else pass.push("[data-goto-tab] has exactly one handler");

// ── 2 + 3. IT SCROLLS, AND NEVER DOES NOTHING ───────────────────────────────────────────────────
if (handlers.length === 1) {
  const body = listenerBody(handlers[0].index);
  if (!body) { indet.push("could not brace-match the [data-goto-tab] handler body"); }
  else {
    if (!/window\.scrollTo|scrollIntoView/.test(body)) {
      fail.push("the [data-goto-tab] handler only switches tabs. A jump to the tab you are ALREADY on "
        + "moves nothing, and the control reads as broken.");
    } else pass.push("the jump handler scrolls, not just switches");

    if (!/data-goto-scroll/.test(body)) {
      fail.push("the handler ignores data-goto-scroll, so a button cannot say WHERE on the tab to land.");
    } else pass.push("the handler honours a named landing element");

    // 🔑 The fallback is what guarantees no jump is ever a no-op.
    if (!/panel-/.test(body)) {
      fail.push("the handler has no fallback target, so a jump that names no element still does nothing.");
    } else pass.push("a jump with no named element still moves to the tab's panel");
  }
}

// ── 4. A JUMP TO YOUR OWN TAB MUST NAME A TARGET ────────────────────────────────────────────────
// 🔑 These are the ones that CANNOT work on the tab switch alone. Found structurally: any alert
// descriptor whose `tab:` is "overview" and which lives in the cockpit's own alert list.
{
  const re = /\{\s*k:\s*["'][a-z]["']\s*,[\s\S]{0,600}?tab:\s*["']overview["'][\s\S]{0,200}?\}/g;
  let m, n = 0;
  while ((m = re.exec(code))) {
    n++;
    if (!/scroll:\s*["'][^"']+["']/.test(m[0])) {
      const line = code.slice(0, m.index).split("\n").length;
      fail.push(`admin/admin.js:${line} — an alert ON Overview jumps to "overview" without naming a `
        + `scroll target. Switching to the tab you are already on does nothing.`);
    }
  }
  if (n === 0) indet.push("found no cockpit alert descriptor targeting the overview tab — the shape changed");
  else if (!fail.some((f) => /without naming a/.test(f))) pass.push(`all ${n} same-tab alert jump(s) name where to land`);
}

// ── 5. EVERY NAMED TARGET EXISTS ────────────────────────────────────────────────────────────────
{
  const named = new Set();
  for (const m of code.matchAll(/scroll:\s*["']([A-Za-z][\w-]*)["']/g)) named.add(m[1]);
  for (const m of code.matchAll(/data-goto-scroll="([A-Za-z][\w-]*)"/g)) named.add(m[1]);
  let bad = 0;
  for (const id of named) {
    // A literal id="x", or the panel-<tab> convention the tab renderer builds.
    const declared = new RegExp(`id="${id}"`);
    if (declared.test(code) || declared.test(html) || /^panel-/.test(id)) continue;
    bad++;
    fail.push(`a jump scrolls to "${id}", which no element in the bundle declares — it will land nowhere.`);
  }
  if (named.size && !bad) pass.push(`all ${named.size} named scroll target(s) exist`);
  if (!named.size) indet.push("no scroll targets named anywhere — the shape changed");
}

for (const x of pass) console.log(`  ✅ ${x}`);
for (const x of indet) console.log(`  ⚠️  INDETERMINATE — ${x}`);
for (const x of fail) console.log(`  🔴 ${x}`);
if (fail.length) { console.log(`\n🔴 FAIL — ${fail.length} jump(s) can do nothing at all.`); process.exit(1); }
if (indet.length) { console.log(`\n⚠️  INDETERMINATE — ${indet.length} thing(s) this gate could not read.`); process.exit(2); }
console.log(`\n✅ every jump moves the page, including to the tab you are already on (${pass.length} checks).`);

/* MUTATION LOG — filled in below. */
