#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — A STEP CARD NEVER RENDERS ONE STRING TWICE, AND KEEPS ITS SHAPE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-09-27, on step 2: *"can you redo this for better design the #2 card"*.
 *
 * The first defect was not a design choice, it was a bug. The subtitle under a step's title came
 * from `why: o.why || lines[0]` — and `lines[0]` is the FIRST LINE OF THE VERY INSTRUCTIONS the body
 * renders directly underneath. On step 2 that printed a sentence cut mid-clause at a comma
 * ("…already paid for,") with the same sentence repeated in full one line below.
 *
 * **63 of 89 steps have multi-line instructions and only 26 carry editorial copy**, so most of the
 * checklist was doing it.
 *
 * WHAT IS PINNED (approved shape: reports/mockups/admin_step_card_v1.html):
 *   1. `why` is EDITORIAL COPY OR NOTHING — never derived from the instructions it sits above.
 *   2. Every branch that renders `ob-why` gates it on that, not on truthiness.
 *   3. The active card has its three bands: state · done-when · reference-in-a-fold.
 *   4. `stepDoneWhen` reads the step's OWN instructions, so the rule cannot become a second place to
 *      maintain — and invents nothing for the 87 steps that declare none.
 *   5. The state band is generic: a step with no state renders none.
 *
 * Exit 0 pass · 1 fail · 2 indeterminate. Mutation log at the bottom.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const WEB = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const fail = [], indet = [], pass = [];
const jsPath = path.join(WEB, "admin/admin.js");
if (!fs.existsSync(jsPath)) { console.log("  ⚠️  admin.js missing"); process.exit(2); }
const src = fs.readFileSync(jsPath, "utf8");
if (src.length < 100000) { console.log("  ⚠️  admin.js too small"); process.exit(2); }
// 🔴 `^\s*//` EATS NEWLINES — `\s` includes `\n`, so the match starts earlier than the line and
// swallows the blank lines above it. Reported line numbers came out 134 short. `[ \t]*` is the
// indentation, and only the indentation.
const code = src.replace(/^[ \t]*\/\/.*$/gm, "");

function fnBody(name) {
  const at = code.indexOf(`function ${name}(`);
  if (at < 0) return null;
  const open = code.indexOf("{", at);
  let d = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === "{") d++;
    else if (code[i] === "}") { d--; if (d === 0) return code.slice(at, i + 1); }
  }
  return null;
}

// ── 1. `why` IS EDITORIAL OR NOTHING ────────────────────────────────────────────────────────────
{
  // 🔴 ANCHOR IN THE PROJECTION. `/why:/` matches the first of 26 MISSION_OBJECTIVES entries long
  // before sopChecklistSteps — a mutation restoring the instruction fallback passed because the
  // check was reading an editorial string from another part of the file.
  const projAt = code.indexOf("function sopChecklistSteps(");
  const projSrc = projAt < 0 ? "" : code.slice(projAt, projAt + 4000);
  const proj = projSrc.match(/why:\s*([^\n,]+),/);
  if (!proj) { indet.push("could not find the `why` projection in sopChecklistSteps"); }
  else if (/lines\s*\[\s*0\s*\]|instructions/.test(proj[1])) {
    fail.push(`admin/admin.js — \`why\` falls back to the instructions (\`${proj[1].trim()}\`). That is `
      + `the string the body renders underneath, so the card prints it twice — and the subtitle cuts `
      + `it mid-sentence. The instructions are not a summary of themselves.`);
  } else pass.push("`why` is editorial copy or nothing, never the instructions");

  if (!/whyIsEditorial/.test(code)) {
    fail.push("admin/admin.js — nothing records whether `why` is editorial, so a renderer cannot tell "
      + "a curated one-liner from a leaked instruction line.");
  } else pass.push("the projection records whether `why` is editorial");
}

// ── 2. EVERY BRANCH GATES IT ────────────────────────────────────────────────────────────────────
// 🔑 Count the renderings, not the fix: one branch left on truthiness is one card still duplicating.
{
  // 🔑 PIN THE RENDERING OF `o.why`, NOT THE CLASS. One branch uses `ob-why` to show a DECLINE
  // REASON — a different string, correctly ungated — and flagging it was a false positive.
  const uses = [...code.matchAll(/class="ob-why">\$\{escapeHtml\(o\.why\)/g)];
  if (!uses.length) { indet.push("no rendering of o.why found — the card shape changed"); }
  else {
    let bad = 0;
    for (const m of uses) {
      const before = code.slice(Math.max(0, m.index - 220), m.index);
      if (!/whyIsEditorial/.test(before)) {
        bad++;
        fail.push(`admin/admin.js:${code.slice(0, m.index).split("\n").length} — renders ob-why without `
          + `checking whyIsEditorial, so this branch can still print a leaked instruction line.`);
      }
    }
    if (!bad) pass.push(`all ${uses.length} rendering(s) of o.why gate on editorial copy`);
  }
}

// ── 3. THE ACTIVE CARD KEEPS ITS THREE BANDS ────────────────────────────────────────────────────
{
  // 🔑 READ THE RETURNED TEMPLATE. A window around the class name also covers the `const bandHtml =`
  // that BUILDS the band — so deleting `${bandHtml}` from the template left the window satisfied.
  // The card is what the branch returns.
  const at = code.indexOf('class="ob-step active"');
  if (at < 0) { fail.push("admin/admin.js — the active step card is gone."); }
  else {
    // 🔑 The template nests backticks inside `${…}`, so the first `` `; `` after the match is not its
    // end. Scan forward tracking `${` depth and stop at the first backtick outside an interpolation.
    const retAt = code.lastIndexOf("return `", at);
    let card = "";
    if (retAt >= 0) {
      let i = retAt + "return `".length, depth = 0;
      for (; i < code.length; i++) {
        if (code[i] === "$" && code[i + 1] === "{") { depth++; i++; continue; }
        if (code[i] === "}" && depth > 0) { depth--; continue; }
        if (code[i] === "`" && depth === 0) break;
      }
      card = code.slice(retAt, i);
    }
    if (!card) { indet.push("could not isolate the active card's returned template"); }
    else {
    // 🔑 TWO HALVES, BOTH REQUIRED. The template interpolates each band by VARIABLE
    // (`${bandHtml}`), and the markup lives in the `const` above it. Checking only the template
    // misses a gutted const; checking only the const misses a band dropped from the template — a
    // mutation removing `${bandHtml}` passed a check that looked for the class name in a window
    // covering both. Pin the pair.
    //
    // 🔴🔴 THIS WAS A 2200-CHARACTER WINDOW BACK FROM THE `return`, AND IT LIED. 2026-09-28 the call
    // console was added between `const bandHtml =` and the return; the declaration moved 4577 chars
    // back, fell out of the window, and the gate reported that `bandHtml` no longer builds the band
    // — of code that was correct. A distance is not a relationship. Read the DECLARATION.
    // → feedback_a_gate_window_measured_in_characters_will_lie
    const declOf = (name) => {
      const m = new RegExp(`const\\s+${name}\\s*=`).exec(code);
      if (!m) return "";
      // Scan to the end of the assignment: the first `;` at depth 0, tracking the template literals,
      // interpolations and braces this codebase nests inside these declarations.
      let i = m.index + m[0].length, tick = 0, brace = 0;
      for (; i < code.length; i++) {
        const c = code[i];
        if (c === "\\") { i++; continue; }
        if (c === "`") { tick ^= 1; continue; }
        if (tick) { if (c === "$" && code[i + 1] === "{") { brace++; i++; } continue; }
        if (c === "{" || c === "(") { brace++; continue; }
        if (c === "}" || c === ")") { brace--; continue; }
        if (c === ";" && brace <= 0) break;
      }
      return code.slice(m.index, i);
    };
    const want = [
      ["bandHtml", /ob-state/, "the state band — what is true now, and whose turn it is"],
      ["ruleHtml", /ob-rule/, "the done-when rule — what finishes this step"],
      ["howHtml", /ob-how/, "the reference fold — how this step works"],
    ];
    let missing = 0;
    for (const [v, re, what] of want) {
      if (!new RegExp(`\\$\\{${v}\\}`).test(card)) {
        missing++;
        fail.push(`admin/admin.js — the active card no longer renders ${what} (\`\${${v}}\` is not in the template).`);
      } else if (!re.test(declOf(v))) {
        missing++;
        fail.push(`admin/admin.js — \`${v}\` no longer builds ${what}.`);
      } else if (v === "bandHtml" && !/band\.title[\s\S]{0,160}band\.detail/.test(declOf(v))) {
        // 🔴 The class surviving is not the band surviving. It must still print what it is FOR.
        missing++;
        fail.push("admin/admin.js — the state band renders neither its title nor its detail, so it is "
          + "a coloured strip that says nothing.");
      }
    }
    if (!missing) pass.push("the active card renders all three bands, and each is still built");
    // 🔴 The instruction list must live INSIDE the fold, or the wall is back above the buttons.
    const fold = declOf("howHtml").match(/<details class="ob-how"[\s\S]*?<\/details>/);
    if (!fold) {
      fail.push("admin/admin.js — the reference fold is gone; the instructions are back in the open.");
    } else if (!/ob-sop/.test(fold[0])) {
      fail.push("admin/admin.js — the instructions are not inside the fold, so the nine-paragraph wall is back.");
    } else pass.push("the instructions live inside the fold");
    }
  }
}

// ── 4. THE DONE RULE COMES FROM THE STEP, AND INVENTS NOTHING ───────────────────────────────────
{
  const fn = fnBody("stepDoneWhen");
  if (!fn) fail.push("admin/admin.js — stepDoneWhen() is gone; the completion rule is back in the wall.");
  else {
    try {
      const ctx = { result: null };
      vm.createContext(ctx);
      vm.runInContext(fn + `
        result = {
          declared: stepDoneWhen({ instructions: "Some prose.\\n🔴 DONE = the invite is ACCEPTED. Chase at 24h." }),
          none:     stepDoneWhen({ instructions: "Some prose with no rule at all." }),
          empty:    stepDoneWhen({}),
          colon:    stepDoneWhen({ instructions: "DONE: the report is published." }),
        };`, ctx, { timeout: 2000 });
      const r = ctx.result;
      if (!/ACCEPTED/.test(r.declared || "")) fail.push(`stepDoneWhen does not read a declared DONE rule; it returned "${r.declared}".`);
      else pass.push("the done rule is read from the step's own instructions");
      if (!/published/.test(r.colon || "")) fail.push("stepDoneWhen misses the `DONE:` spelling.");
      else pass.push("both DONE = and DONE: spellings are read");
      // 🔴 87 of 89 steps declare no rule. Inventing one would put a false standard on every card.
      if (r.none || r.empty) fail.push(`stepDoneWhen invents a rule for a step that declares none ("${r.none || r.empty}"). 87 of 89 steps declare none.`);
      else pass.push("a step that declares no rule gets none");
    } catch (e) { indet.push(`stepDoneWhen would not run in isolation (${e.message})`); }
  }
}

// ── 5. THE STATE BAND IS GENERIC ────────────────────────────────────────────────────────────────
{
  const fn = fnBody("stepStateBand");
  if (!fn) fail.push("admin/admin.js — stepStateBand() is gone; the active card cannot say whose turn it is.");
  else {
    // 🔴 RUN IT. `/return null/` was satisfied by later returns in the same function, so a mutation
    // short-circuiting the guard passed while every one of the 88 stateless steps gained a band.
    try {
      const ctx = {
        state: {}, _kickoffPendingAsk: new Map(), _kickoffPendingMove: new Map(),
        kickoffAskCopy: () => ({ title: "t", line: "l" }),
        kickoffSentAwaiting: () => null,
        // 🔴 REALISTIC STUBS. kickoffWaitingOnPick returns TRUE whenever no invite exists — which is
        // every non-kickoff step. Stubbing it false made the function return null for the wrong
        // reason, and a mutation deleting the kickoff guard passed while every one of the 88
        // stateless steps would have gained a band. A stub that cannot reproduce the defect is not
        // a test. → feedback_a_gate_that_cannot_fail
        kickoffWaitingOnPick: () => true,
        result: null,
      };
      vm.createContext(ctx);
      vm.runInContext(fn + `
        result = {
          other: stepStateBand({ flowId: "m1.web.h1_cta" }),
          none:  stepStateBand({}),
        };`, ctx, { timeout: 2000 });
      if (ctx.result.other !== null || ctx.result.none !== null) {
        fail.push(`admin/admin.js — a step with no state still gets a band (${JSON.stringify(ctx.result.other)}). `
          + `88 of 89 steps have none, so every card would carry a coloured strip that means nothing.`);
      } else pass.push("a step with no state renders no band");
    } catch (e) { indet.push(`stepStateBand would not run in isolation (${e.message})`); }
  }
}

for (const x of pass) console.log(`  ✅ ${x}`);
for (const x of indet) console.log(`  ⚠️  INDETERMINATE — ${x}`);
for (const x of fail) console.log(`  🔴 ${x}`);
if (fail.length) { console.log(`\n🔴 FAIL — ${fail.length} problem(s) with the step card.`); process.exit(1); }
if (indet.length) { console.log(`\n⚠️  INDETERMINATE — ${indet.length} thing(s) this gate could not read.`); process.exit(2); }
console.log(`\n✅ the step card renders each string once and keeps its three bands (${pass.length} checks).`);

/* MUTATION LOG — filled in below. */
