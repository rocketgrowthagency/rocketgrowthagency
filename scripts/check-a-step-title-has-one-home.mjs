#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — A STEP'S TITLE HAS ONE HOME, AND A SIGNPOST ASKS FOR IT RATHER THAN COPYING IT
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * 2026-09-29. Chris: *"maybe we need to change the title of step 2. to just Kickoff Call"* —
 * `m1.close.kickoff_invite` was titled **"Send the kickoff calendar invite"**, which named the
 * FALLBACK BUTTON rather than the step. (The step's own instructions say *"You usually do not need
 * this button at all."*) Renamed to **"Book the kickoff call"**.
 *
 * 🔴 AND A BANNER IN THE ADMIN HELD ITS OWN COPY OF THE OLD TITLE:
 *
 *     "…none has been sent yet. Send it from step 2 below, <strong>Send the kickoff calendar
 *      invite</strong>."
 *
 * One rename in `playbooks.json` turned that into **a signpost to a step that no longer exists under
 * that name** — on the Onboarding tab, which is the one surface most of my checks do not look at.
 * That exact banner had already been the *fourth surface of one stale instruction* on 2026-09-26.
 * → feedback_fix_the_class_not_the_instance · feedback_instruct_by_what_is_on_screen
 *
 * 🔑 THE RULE. `data/playbooks/playbooks.json` is the one home of every step title. Any surface that
 * NAMES a step reads it from there. A second copy is a second implementation: it does not break
 * loudly, it simply goes on naming something that is gone — and 30 of the 88 SOP steps were already
 * known to have two implementations. → project_sop_step_audit_2026-09-08
 *
 * WHAT IS PINNED:
 *   1. No step title appears verbatim in admin.js or portal.js — with ONE allowance, the documented
 *      fallback inside `kickoffStepTitle()`, so a signpost never renders an empty name.
 *   2. That reader exists, resolves against the playbook by step ID, and is actually CALLED.
 *   3. The banner that names step 2 calls it rather than embedding a title.
 *
 * Exit 0 pass · 1 fail · 2 indeterminate. Mutation log at the bottom.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT. A gate that can only ever read the real
// working tree cannot be pointed at a scratch copy, so its mutations cannot be run — and a
// gate nobody can make fail is a gate nobody has checked. Found 2026-10-06 when three
// mutations of `check-refusal-is-not-done` all came back green: it was reading straight past
// them. → feedback_a_gate_that_cannot_fail · feedback_the_harness_i_wrote_to_check_my_work_can_lie
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const WEB = `${__SITE}`;
const fail = [], indet = [], pass = [];
const STEP = "m1.close.kickoff_invite";

function read(rel, min = 1000) {
  const p = path.join(WEB, rel);
  if (!fs.existsSync(p)) { indet.push(`${rel} does not exist`); return null; }
  const s = fs.readFileSync(p, "utf8");
  if (s.length < min) { indet.push(`${rel} is only ${s.length} bytes`); return null; }
  return s;
}
// 🔴 Comments QUOTE these titles while explaining the very defect this gate is about, so a gate that
// scans raw source accuses the explanation. Strip line comments first.
// → feedback_a_gate_must_pin_the_property_not_the_spelling
const strip = (s) => s.replace(/^\s*\/\/.*$/gm, "");

function fnSource(code, name) {
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

// ── the titles, from their one home ─────────────────────────────────────────────────────────────
let titles = [];
{
  const raw = read("data/playbooks/playbooks.json", 5000);
  if (raw) {
    try {
      const d = JSON.parse(raw);
      for (const k of ["month1", "month2plus"]) {
        for (const s of d[k] || []) {
          const t = String(s.title || "").trim();
          // Short titles risk matching ordinary prose; the defect is a full title pasted into copy.
          if (t.length >= 12) titles.push({ id: s.id, t });
        }
      }
    } catch (e) { indet.push(`playbooks.json will not parse: ${e.message}`); }
  }
  if (titles.length < 40) {
    indet.push(`only ${titles.length} step titles found — the file shape changed, so this gate is not measuring what it thinks`);
  } else pass.push(`playbooks.json — ${titles.length} step titles read from their one home`);
}

// ── 1. NO SURFACE HOLDS A SECOND COPY ───────────────────────────────────────────────────────────
// The single allowance: `kickoffStepTitle()`'s fallback. An absence must never be readable as a
// value, so the reader needs a literal to fall back to — but exactly one, inside that function.
// → feedback_an_absence_must_never_be_readable_as_a_value
if (titles.length >= 40) {
  for (const rel of ["admin/admin.js", "portal/portal.js"]) {
    const raw = read(rel, 50000);
    if (!raw) continue;
    const code = strip(raw);
    const reader = fnSource(code, "kickoffStepTitle") || "";
    const outside = code.split(reader || "\u0000__never__").join(" ");
    const dupes = [];
    for (const { id, t } of titles) {
      const n = outside.split(t).length - 1;
      if (n > 0) dupes.push(`${id} ("${t}") ×${n}`);
    }
    if (dupes.length) {
      fail.push(`${rel} — ${dupes.length} step title(s) are pasted into the source instead of read `
        + `from playbooks.json: ${dupes.join(" · ")}. Rename the step and this surface goes on naming `
        + `something that no longer exists — silently, because a wrong name does not throw.`);
    } else pass.push(`${rel} — names no step by a copied title`);
  }
}

// ── 2. THE READER EXISTS, RESOLVES BY ID, AND IS CALLED ─────────────────────────────────────────
{
  const raw = read("admin/admin.js", 50000);
  if (raw) {
    const code = strip(raw);
    const fn = fnSource(code, "kickoffStepTitle");
    if (!fn) {
      fail.push("admin/admin.js — kickoffStepTitle() is gone, so any surface naming step 2 is back to "
        + "holding its own copy of the title.");
    } else {
      // 🔴 RUN IT. A reader that returns its fallback whatever the playbook says is a hardcoded
      // title wearing a function's clothes, and no amount of scanning shows that.
      // → feedback_a_gate_that_it_exists_is_not_a_gate_that_it_works
      try {
        const ctx = { state: {}, result: null };
        vm.createContext(ctx);
        vm.runInContext(fn + `
          const run = (pb) => { state.flowM1Playbook = pb; return kickoffStepTitle(); };
          result = {
            real:    run([{ id: "${STEP}", title: "A TITLE FROM THE PLAYBOOK" }]),
            other:   run([{ id: "m1.close.confirm", title: "WRONG STEP" }]),
            empty:   run([]),
            missing: run(null),
          };`, ctx, { timeout: 2000 });
        const r = ctx.result;
        if (r.real !== "A TITLE FROM THE PLAYBOOK") {
          fail.push(`admin/admin.js — kickoffStepTitle() returned "${r.real}" for a playbook that `
            + `plainly says otherwise. It is not reading the title; it is reciting one.`);
        } else pass.push("admin/admin.js — the title is read from the playbook, by step id");

        if (r.other === "WRONG STEP") {
          fail.push("admin/admin.js — kickoffStepTitle() returned ANOTHER step's title. It is taking "
            + "the first entry rather than matching on the id. → feedback_position_is_not_identity");
        } else pass.push("admin/admin.js — it matches on the step id, not on position");

        for (const [k, v] of [["an empty playbook", r.empty], ["an unloaded playbook", r.missing]]) {
          if (!v || !String(v).trim()) {
            fail.push(`admin/admin.js — with ${k} the title is empty, so the signpost renders `
              + `"Send it from step 2 below, ." An absence must never be readable as a value.`);
          }
        }
        if (String(r.empty || "").trim() && String(r.missing || "").trim()) {
          pass.push("admin/admin.js — an unloaded playbook still yields a usable name");
        }
      } catch (e) {
        indet.push(`admin/admin.js: kickoffStepTitle would not run in isolation (${e.message})`);
      }

      // 🔴 COUNT REACHABLE CALLS, NOT CALL TEXT. A reader nobody calls looks finished.
      // → feedback_a_capability_nobody_calls_looks_finished
      const calls = [...code.matchAll(/kickoffStepTitle\s*\(/g)].slice(1);
      const dead = calls.filter((m) => /false\s*&&\s*$/.test(code.slice(Math.max(0, m.index - 40), m.index)));
      if (dead.length) {
        fail.push(`admin/admin.js — ${dead.length} call(s) to kickoffStepTitle are behind a literal false.`);
      }
      if (calls.length - dead.length < 1) {
        fail.push("admin/admin.js — kickoffStepTitle() is never called. The signpost that names step 2 "
          + "is still carrying its own copy of the title, or has stopped naming it at all.");
      } else if (!dead.length) pass.push(`admin/admin.js — ${calls.length - dead.length} surface(s) ask for the title`);
    }

    // ── 3. AND THE SIGNPOST ITSELF STILL NAMES THE STEP ──────────────────────────────────────────
    // 🔑 Removing the name would also pass check 1, and would be worse: "Send it from step 2 below."
    // with no name is the instruction Chris cannot ⌘F. → feedback_instruct_by_what_is_on_screen
    const at = code.indexOf("Send it from step 2 below");
    if (at < 0) {
      fail.push('admin/admin.js — the "Send it from step 2 below" signpost is gone. It is the banner '
        + "that tells Chris where to act when the confirmation email promised an invite that has not "
        + "been booked.");
    } else {
      const win = code.slice(at, at + 220);
      if (!/kickoffStepTitle\s*\(/.test(win)) {
        fail.push('admin/admin.js — the "Send it from step 2 below" signpost does not call '
          + "kickoffStepTitle(); it names the step some other way, which is the copy this gate exists "
          + "to prevent.");
      } else pass.push("admin/admin.js — the signpost asks for the step's name");
    }
  }
}

// ── report ──────────────────────────────────────────────────────────────────────────────────────
for (const p of pass) console.log(`  ✅ ${p}`);
for (const i of indet) console.log(`  ⚠️  ${i}`);
for (const f of fail) console.log(`  🔴 ${f}`);
if (fail.length) {
  console.log(`\n🔴 FAIL — ${fail.length} way(s) a step title lives somewhere other than its one home.`);
  process.exit(1);
}
if (indet.length && !pass.length) { console.log("\n⚠️  INDETERMINATE"); process.exit(2); }
console.log(`\n✅ a step title has one home, and the signpost asks for it (${pass.length} checks).`);

/* ─────────────────────────────────────────────────────────────────────────────────────────────────
 * MUTATION LOG — each of these must turn this gate red:
 *   1. paste any step title back into admin.js or portal.js outside kickoffStepTitle  → check 1
 *   2. kickoffStepTitle returns its literal unconditionally                            → check 2
 *   3. it takes pb[0] instead of matching the id                                       → check 2
 *   4. its fallback becomes ""                                                         → check 2
 *   5. remove every call to it                                                         → check 2
 *   6. the signpost embeds a title again instead of calling it                         → check 3
 * ─────────────────────────────────────────────────────────────────────────────────────────────── */
