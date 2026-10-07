// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// SHARED LIFTER — run real admin.js functions inside a gate, with their dependencies resolved.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴🔴 THE SAME FAILURE THREE TIMES IN ONE DAY (2026-10-05). Three gates lift the `ob*` numbering
// family, and each carried its own hand-written list of which functions to bring:
//
//   · `check-the-checklist-has-one-numbering-system` threw on `obRespectDeps` (2026-10-02)
//   · it threw again on `obPhaseIndexOf`, and so did `check-a-step-number-has-one-home` (10-05)
//   · `check-a-step-never-renders-before-its-dependency` threw on `obDependsOn` (10-05)
//
// Every time the product grew a helper, three lists needed updating by hand and at least one was
// missed — and a gate that throws is not a gate that fails. It is noise in the sweep, which is how a
// real red signal gets ignored. The fix is not a fourth careful list.
//
// 🔑 A LIFT MUST RESOLVE ITS OWN DEPENDENCY SET. Ask for what you want; this walks the
// ReferenceErrors until the code runs, and reports INDETERMINATE (never a product failure) if it
// cannot. → feedback_a_gate_that_throws_is_not_a_gate_that_fails · feedback_fix_the_class_not_the_instance
//
// Usage:
//   import { liftAdmin } from "./_lift-admin.mjs";
//   const { ctx, get, missing } = liftAdmin(["obPageNumbers", "obPageOrdered"]);
//   const pageNo = get("obPageNumbers")(steps);

import fs from "node:fs";
import vm from "node:vm";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";

/** Brace-match a `function NAME(...)` declaration out of the source. */
function liftFunction(src, name) {
  // 🔑 `async` IS PART OF THE DECLARATION. Matching only `function NAME(` silently lifted nothing
  // for every async helper — reported as "could not be lifted", which reads like the name is wrong
  // rather than like the matcher is. Found lifting `auditCitations` out of flow-execute.js.
  const m = src.match(new RegExp("^(?:async )?function " + name + "\\s*\\(", "m"));
  if (!m) return "";
  // 🔴 WALK THE PARAMETER LIST FIRST. A destructured parameter (`function f({a, b} = {})`) opens with
  // a brace that closes immediately; matching from it lifts two words and every later assertion then
  // fails against code it never read.
  const lp = src.indexOf("(", m.index);
  let pd = 0, afterParams = -1;
  for (let i = lp; i < src.length; i++) {
    if (src[i] === "(") pd++;
    else if (src[i] === ")") { pd--; if (!pd) { afterParams = i + 1; break; } }
  }
  if (afterParams < 0) return "";
  const open = src.indexOf("{", afterParams);
  if (open < 0) return "";
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") d++;
    else if (src[i] === "}") { d--; if (!d) return src.slice(m.index, i + 1); }
  }
  return "";
}

/**
 * A `const NAME = …;` — one line, or a bracketed literal spanning lines.
 * 🔑 INDENTED DECLARATIONS COUNT. `OB_GLYPH` and `obMarker` live INSIDE `obPhasedHtml`, and a lifter
 * that only matched column-zero `const` returned nothing for them — the gate then read `null[...]`
 * and crashed with a TypeError that looked nothing like a missing lift. Anything a gate names is
 * something it needs, wherever the product happens to declare it.
 */
function liftConst(src, name) {
  const one = src.match(new RegExp(`^\\s*const ${name} = .*;$`, "m"));
  if (one) return one[0].trim();
  const m = src.match(new RegExp(`^\\s*const ${name} = `, "m"));
  if (!m) return "";
  let d = 0, started = false;
  for (let k = m.index; k < src.length; k++) {
    const c = src[k];
    if (c === "[" || c === "(" || c === "{") { d++; started = true; }
    else if (c === "]" || c === ")" || c === "}") {
      d--;
      if (started && !d) {
        const semi = src.indexOf(";", k);
        return semi < 0 ? "" : src.slice(m.index, semi + 1).replace(/^\s+/, "");
      }
    }
  }
  return "";
}

/**
 * Lift the named admin functions and whatever they need.
 * Returns { ctx, get, included } — or exits 2 with a clear reason if it cannot run.
 */
export function liftAdmin(wanted, { extraGlobals = {}, maxRounds = 40, file = "admin/admin.js" } = {}) {
  // 🔑 ONE LIFTER, ANY FILE. `file` defaults to admin.js so every gate written before this keeps
  // working untouched — but the brace-matching, the dependency walk and the browser globals are not
  // facts about the admin, and a second copy of them for `flow-execute.js` would be the third place
  // this logic lives. → feedback_fix_the_class_not_the_instance
  const WHERE = String(file).split("/").pop();
  let src;
  try { src = fs.readFileSync(`${SITE}/${file}`, "utf8"); }
  catch { console.error(`⚠️  INDETERMINATE — cannot read ${file}`); process.exit(2); }

  // 🔴 A FRESH CONTEXT PER REBUILD. Re-evaluating the lifted code into the SAME context redeclares
  // every `const` it contains — "Identifier has already been declared" — which looked like a product
  // error the first time it happened. Contexts are cheap; rebuild rather than patch.
  // 🔴🔴 THE BROWSER GLOBALS THE PRODUCT ASSUMES. `stValue` does `new URL(t)` to decide whether a
  // link should read "Search Google ↗" or show its raw address — and in a context without `URL` it
  // threw, took its catch, and rendered the full 105-character percent-encoded query as the link
  // TEXT. A gate reading that would report a defect the product does not have. Found 2026-10-07
  // walking the citation audit: the row was correct on screen and wrong in the sandbox.
  //
  // 🔑 A SANDBOX THAT IS MISSING WHAT THE BROWSER HAS DOES NOT TEST THE PRODUCT, IT TESTS THE
  // SANDBOX. Anything standard and side-effect-free belongs here; a caller can still add its own.
  // → feedback_the_harness_i_wrote_to_check_my_work_can_lie · feedback_correct_is_not_the_same_as_happening
  const makeCtx = () => vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    document: undefined,
    URL, URLSearchParams, TextEncoder, TextDecoder,
    Intl, Date, Math, JSON, RegExp, Number, String, Array, Object, Boolean, Map, Set,
    encodeURIComponent, decodeURIComponent, encodeURI, decodeURI, isFinite, isNaN, parseInt, parseFloat,
    ...extraGlobals,
  });
  let ctx = makeCtx();

  // Small, always-safe shims the renderers assume exist in a browser.
  const prelude = `function escapeHtml(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function escapeAttribute(s){return escapeHtml(s);}\n`;

  const included = new Set();
  const parts = [];
  for (const n of wanted) {
    const f = liftFunction(src, n) || liftConst(src, n);
    if (f) { parts.push(f); included.add(n); }
  }
  if (!parts.length) {
    console.error(`⚠️  INDETERMINATE — none of [${wanted.join(", ")}] could be lifted from ${WHERE}.`);
    process.exit(2);
  }

  const expose = wanted.map((n) => `try { globalThis[${JSON.stringify(n)}] = ${n}; } catch (e) {}`).join("\n");

  // 🔑 RESOLVE AT EVAL TIME **AND** AT CALL TIME. Evaluating the lifted code only proves it parses;
  // a helper used on one branch is not missed until that branch runs. The first version resolved
  // only eval-time errors and then reported INDETERMINATE the moment a call reached `obDependsOn`.
  const addDep = (name) => {
    const dep = liftFunction(src, name) || liftConst(src, name);
    if (!dep) return false;
    parts.unshift(dep);
    included.add(name);
    ctx = makeCtx();
    vm.runInContext(`${prelude}${parts.join("\n\n")}\n${expose}`, ctx);
    return true;
  };

  for (let round = 0; round < maxRounds; round++) {
    try {
      vm.runInContext(`${prelude}${parts.join("\n\n")}\n${expose}`, ctx);
      const api = {
        get ctx() { return ctx; },
        included: [...included],
        get(name) {
          const fn = vm.runInContext(`typeof ${name} === "function" ? ${name} : null`, ctx);
          if (!fn) {
            console.error(`⚠️  INDETERMINATE — ${name} did not lift from ${WHERE}.`);
            process.exit(2);
          }
          return fn;
        },
        /**
         * Read a lifted CONSTANT, pulling it in on demand. Returns the value, or exits 2 — never
         * `null`, because a gate that goes on to index a null reports a TypeError that looks nothing
         * like the missing lift it actually is.
         */
        constant(name) {
          for (let i = 0; i < 5; i++) {
            const v = vm.runInContext(`typeof ${name} !== "undefined" ? ${name} : undefined`, ctx);
            if (v !== undefined) return v;
            if (included.has(name) || !addDep(name)) break;
          }
          console.error(`⚠️  INDETERMINATE — the constant ${name} did not lift from ${WHERE}.`);
          process.exit(2);
        },
        /** Call a lifted function, resolving any dependency it reaches for mid-run. */
        call(name, args = [], rounds = 20) {
          // 🔑 RESOLVE THE NAMED FUNCTION ITSELF, not only what it reaches for. `obMarker` is an
          // indented arrow declared inside another function; asking for it without pulling it in
          // first reported "did not lift" when the lifter could perfectly well have fetched it.
          if (!included.has(name)) {
            const present = vm.runInContext(`typeof ${name} === "function"`, ctx);
            if (!present) addDep(name);
          }
          // 🔴🔴 AN ASYNC FUNCTION REJECTS, IT DOES NOT THROW. This loop's try/catch sees nothing
          // when the lifted function is `async`: the ReferenceError arrives as a rejected promise
          // AFTER `call` has already returned, so the dependency walk never ran and the gate died
          // with a raw stack trace that looked like a product bug. Found 2026-10-07 lifting
          // `auditCitations`. A sync lift still returns synchronously and is untouched.
          // → feedback_a_gate_that_throws_is_not_a_gate_that_fails
          const giveUp = (e) => {
            console.error(`⚠️  INDETERMINATE — ${name} needs a dependency the lift cannot supply: ${e.message}`);
            console.error("   Fix the lift; do NOT read this as a product failure.");
            process.exit(2);
          };
          const resolvable = (e) => {
            const m = /(\w+) is not defined/.exec(e.message || "");
            return m && !included.has(m[1]) && addDep(m[1]);
          };
          const attemptAsync = async (left) => {
            for (let i = 0; i < left; i++) {
              try { return await api.get(name)(...args); }
              catch (e) { if (!resolvable(e)) giveUp(e); }
            }
            console.error(`⚠️  INDETERMINATE — gave up resolving dependencies for ${name}.`);
            process.exit(2);
          };
          for (let i = 0; i < rounds; i++) {
            try {
              const out = api.get(name)(...args);
              if (out && typeof out.then === "function") {
                return out.catch((e) => { if (!resolvable(e)) giveUp(e); return attemptAsync(rounds); });
              }
              return out;
            } catch (e) { if (!resolvable(e)) giveUp(e); }
          }
          console.error(`⚠️  INDETERMINATE — gave up resolving dependencies for ${name}.`);
          process.exit(2);
        },
      };
      return api;
    } catch (e) {
      const m = /(\w+) is not defined/.exec(e.message || "");
      if (!m || included.has(m[1])) {
        console.error(`⚠️  INDETERMINATE — could not evaluate the lifted code: ${e.message}`);
        console.error("   Fix the lift; do NOT read this as a product failure.");
        process.exit(2);
      }
      const dep = liftFunction(src, m[1]) || liftConst(src, m[1]);
      if (!dep) {
        console.error(`⚠️  INDETERMINATE — ${m[1]} is needed but is not a top-level function or const.`);
        process.exit(2);
      }
      parts.unshift(dep);
      included.add(m[1]);
    }
  }
  console.error("⚠️  INDETERMINATE — gave up resolving the lift's dependency set.");
  process.exit(2);
}

/**
 * Calling a lifted function can ALSO throw for a missing dependency — the eval only proves the code
 * parses, not that every path runs. Wrap the call so that is INDETERMINATE too, never a finding.
 */
export function safeCall(fn, args, what = "a lifted function") {
  try { return fn(...args); }
  catch (e) {
    if (/is not defined/.test(e.message || "")) {
      console.error(`⚠️  INDETERMINATE — ${what} needs a dependency the lift did not bring: ${e.message}`);
      process.exit(2);
    }
    throw e;
  }
}
