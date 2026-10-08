#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — A STEP THAT HAS PRODUCED SOMETHING CAN ALWAYS BE RE-RUN
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-10-02, looking at step 25 holding a 1,323-character draft: *"how do i re-run step 25?"*
 * He could not. The `queued` branch rendered the stored output and the client Done/Skip/Reset, and
 * **no run control** — so a visibly stale draft sat there with nothing able to refresh it.
 *
 * 🔑 THIS IS THE SAME DEFECT, ONE STATE OVER, AS THE ONE FIXED IN SEPTEMBER. Then, `resultBlock` was
 * declared inside the DONE branch, so a step that had run showed nothing until it was marked
 * complete — and you would only mark it complete after reading the draft. **The control you need
 * was hidden behind the state you needed it to reach.** It came back on a different branch.
 * → feedback_a_capability_nobody_calls_looks_finished · feedback_fix_the_class_not_the_instance
 *
 * WHAT IS PINNED — on EVERY branch that can render stored output:
 *   1. A step with a runner and stored output offers a re-run control.
 *   2. That control carries the scope, or it posts against the wrong playbook.
 *   3. One-step-at-a-time survives: a queued step with NO output offers no run button.
 *
 * Exit 0 pass · 1 fail · 2 indeterminate. Mutation log at the bottom.
 */
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const JS = path.join(SITE, "admin", "admin.js");
const fail = [], pass = [];

if (!fs.existsSync(JS)) { console.error("⚠️  INDETERMINATE — admin.js not found."); process.exit(2); }
const raw = fs.readFileSync(JS, "utf8");
if (raw.length < 100000) { console.error(`⚠️  INDETERMINATE — admin.js is only ${raw.length} bytes.`); process.exit(2); }
// 🔴 The comments here quote the fix in detail; strip them or the gate passes on the prose.
const code = raw.replace(/^\s*\/\/.*$/gm, " ").replace(/\/\*[\s\S]*?\*\//g, " ");

/**
 * The source of the checklist's `if (s.uiState === "<name>")` branch.
 *
 * 🔴 `s.uiState === "done"` appears THREE times and `"queued"` twice — admin.js has more than one
 * renderer. Taking the first match read a different function entirely and reported that the done
 * branch shows no output, which is false.
 *
 * 🔴 And the obvious anchor, `obMarker(n, "<name>")`, is wrong for `done`: it is written
 * `obMarker(n, declined ? "declined" : "done")`. An anchor that assumes a literal where the code
 * computes one finds nothing and the gate goes INDETERMINATE — right answer, wrong reason.
 * Each branch is identified by a signature only the checklist row emits.
 * → feedback_a_symbol_name_is_a_claim_about_the_codebase
 */
const SIGNATURE = { done: 'class="ob-step ', queued: 'class="ob-step queued"' };
function branch(name) {
  let from = 0;
  for (;;) {
    const at = code.indexOf(`s.uiState === "${name}"`, from);
    if (at < 0) return null;
    const open = code.indexOf("{", at);
    if (open < 0) return null;
    let d = 0, body = null;
    for (let i = open; i < code.length; i++) {
      if (code[i] === "{") d++;
      else if (code[i] === "}") { d--; if (!d) { body = code.slice(open, i + 1); break; } }
    }
    // 🔴 AND REJECT AN ENCLOSING BLOCK. The first `s.uiState === "queued"` match sits inside a larger
    // function whose brace-matched body is 12,387 chars and CONTAINS the done branch — so both
    // lookups returned the same text and the gate compared the done branch against itself twice.
    // A row renderer is one branch: if the body still contains another `s.uiState ===` test, it is
    // the wrapper, not the branch. → feedback_a_gate_window_measured_in_characters_will_lie
    const isOneBranch = body && (body.match(/s\.uiState === "/g) || []).length === 0;
    if (body && isOneBranch && body.includes(SIGNATURE[name]) && body.includes("obMarker(n,")) return body;
    from = at + 1;
  }
}

/**
 * Is `needle` reachable from what this branch RETURNS?
 *
 * Starts at the `return \`…\`` template, collects every `${identifier}` it interpolates, and walks
 * those identifiers' declarations transitively. A string that is built and never interpolated is
 * not rendered, however complete it looks.
 */
function renders(branchSrc, needle) {
  // 🔑 The ROW's return, not the last `return \`` in the branch: since 2026-10-08 the done row
  // interpolates IIFEs (its status pill) that have their own `return \``, and lastIndexOf landed on
  // that pill — a `<span>` that never contains the run button — so a correct row read as "no re-run".
  const rowAt = branchSrc.indexOf('return `<div class="ob-step');
  const retAt = rowAt >= 0 ? rowAt : branchSrc.lastIndexOf("return `");
  if (retAt < 0) return false;
  const template = branchSrc.slice(retAt);
  const decls = new Map();
  for (const m of branchSrc.matchAll(/const\s+(\w+)\s*=\s*([\s\S]*?);\n/g)) decls.set(m[1], m[2]);

  const seen = new Set();
  const queue = [template];
  while (queue.length) {
    const chunk = queue.pop();
    if (chunk.includes(needle)) return true;
    for (const m of chunk.matchAll(/\$\{([A-Za-z_$][\w$]*)/g)) {
      const name = m[1];
      if (seen.has(name)) continue;
      seen.add(name);
      if (decls.has(name)) queue.push(decls.get(name));
    }
  }
  return false;
}

console.log("── every branch that shows stored output can re-run it ──");
// `done` and `queued` both render `resultBlock`. `active` has its own run button by construction.
for (const name of ["done", "queued"]) {
  const b = branch(name);
  if (!b) { console.error(`⚠️  INDETERMINATE — could not isolate the "${name}" branch.`); process.exit(2); }
  const showsOutput = /resultBlock/.test(b);
  if (!showsOutput) { console.log(`  ▫️  ${name}: renders no stored output — nothing to re-run`); continue; }

  // 🔴🔴 CONSTRUCTED IS NOT RENDERED. A first version asked only whether `data-onboard-run=` appeared
  // anywhere in the branch — so deleting the button from the RETURNED markup, while leaving its
  // `const` in place, passed. That is the "computed and never read" defect this codebase keeps
  // rediscovering, and the gate reproduced it. Follow the interpolations from the return template
  // and require the control to actually be reachable from what is rendered.
  // → feedback_a_capability_nobody_calls_looks_finished
  const hasRun = renders(b, "data-onboard-run=");
  if (hasRun) { pass.push(`${name} can re-run`); console.log(`  ✅ ${name}: shows output AND offers a re-run control`); }
  else { fail.push(`the "${name}" branch shows stored output with no way to re-run it`); console.log(`  🔴 ${name}: shows output, NO re-run control`); }

  // 🔴 A run control without the scope posts against the wrong playbook — month 1 vs month 2+.
  if (hasRun) {
    const runIdx = b.indexOf("data-onboard-run=");
    const window = b.slice(runIdx, runIdx + 400);
    // 🔑 Accept either spelling. The done branch emits the attribute through a local — `${sc}`,
    // declared in the same branch as ` data-onboard-scope="…"` — which is correct code that a
    // literal-only test calls a defect. Pin that the scope REACHES the button, not how it is typed.
    // → feedback_a_gate_must_pin_the_property_not_the_spelling
    const viaLocal = /\$\{(\w+)\}/.test(window)
      && (window.match(/\$\{(\w+)\}/g) || []).some((m) => {
        const v = m.slice(2, -1);
        const decl = new RegExp(`const ${v}\\s*=[^;]*data-onboard-scope=`).exec(b);
        return Boolean(decl);
      });
    if (/data-onboard-scope=/.test(window) || viaLocal) { pass.push(`${name} carries scope`); console.log(`  ✅ ${name}: the re-run control carries its scope`); }
    else { fail.push(`the "${name}" re-run control does not carry its scope`); console.log(`  🔴 ${name}: re-run control is missing data-onboard-scope`); }
  }
}

console.log("\n── one step at a time survives: no output, no run button ──");
{
  const b = branch("queued");
  // The control must be CONDITIONAL on there being something to replace. An unconditional run
  // button on every queued row is the wall the one-step-at-a-time rule exists to prevent.
  const conditional = /\(\s*runnable\s*&&\s*result\s*\)|runnable\s*&&\s*result\s*\?/.test(b);
  if (conditional) { pass.push("queued run is conditional"); console.log("  ✅ the queued re-run appears only where output already exists"); }
  else { fail.push("the queued run control is not conditional on existing output"); console.log("  🔴 a queued step with no output would offer a run button"); }
}

console.log("");
if (fail.length) {
  console.error(`🔴 ${fail.length} problem(s):`);
  for (const f of fail) console.error(`   · ${f}`);
  console.error(`\n   A step that produced something must offer: read it, run it again, undo it.`);
  process.exit(1);
}
console.log(`✅ ${pass.length} properties hold — every branch that shows a stored result can replace it,`);
console.log(`   each run control carries its scope, and an unrun queued step still offers nothing.`);

/* ─── MUTATION LOG (both directions, matched by name) ──────────────────────────────────────────────
 *  1. qRerun removed from the queued branch        → exit 1 "queued" branch shows stored output…
 *  2. data-onboard-scope dropped from qRerun        → exit 1 "does not carry its scope"
 *  3. `runnable && result` → `runnable`             → exit 1 "not conditional on existing output"
 *  4. rerunBtn removed from the done branch         → exit 1 "done" branch shows stored output…
 *  5. unmodified source                              → exit 0
 * ────────────────────────────────────────────────────────────────────────────────────────────── */
