#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — THE CLOCK UNLOCKS THE WORK; ONLY A PERSON SAYS THE CALL HAPPENED
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-09-29: *"is there a way we can define if a call was met or missed? or can admin press a
 * button to confirm?"* — then, getting to the root of it: *"or does our system just go to next step
 * automatically once the time of meeting has passed?"*
 *
 * **It did.** A clock unlock marks `m1.kickoff.call` done at its START time so the four access steps
 * open DURING the call — which is right, you collect the logins live. But nothing ever asked whether
 * anyone joined, so **a no-show was recorded identically to a call that went perfectly.**
 *
 * And the two surfaces disagreed: the client's portal has always refused to say the call happened
 * without a recap, while the admin's step flipped to done off the clock alone.
 *
 * 🔑 THREE DIFFERENT THINGS, AND THE GATE KEEPS THEM APART:
 *   · the CLOCK unlocks the work        — evidence of nothing
 *   · a DISPOSITION is Chris attesting  — a person says what happened
 *   · a RECAP is evidence               — written by someone who was there
 *
 * WHAT IS PINNED:
 *   1. All three outcomes are offered, and asked BEFORE the recap is.
 *   2. The pane does not claim the call took place on the clock alone.
 *   3. A no-show / move RELEASES the booking for real — the confirm says it does, so it must.
 *   4. The endpoint refuses a call that has not started, and reports whether the hold actually cleared.
 *   5. Its auth uses the gate the right way — `requireWorkspaceForClient` RETURNS `{error}`.
 *
 * Exit 0 pass · 1 fail · 2 indeterminate. Mutation log at the bottom.
 */
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const fail = [], indet = [], pass = [];

const read = (rel, min) => {
  const p = path.join(SITE, rel);
  if (!fs.existsSync(p)) { indet.push(`${rel} does not exist`); return null; }
  const s = fs.readFileSync(p, "utf8");
  if (s.length < min) { indet.push(`${rel} is only ${s.length} bytes`); return null; }
  return s;
};
const strip = (s) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

// ── 1 · the admin asks, and asks before it offers the recap ─────────────────────────────────────
{
  const raw = read("admin/admin.js", 100000);
  if (raw) {
    const code = strip(raw);
    for (const [v, label] of [["held", "It happened"], ["no_show", "They did not show"], ["rescheduled", "Moved to a new time"]]) {
      if (!new RegExp(`data-kickoff-outcome="${v}"`).test(code)) {
        fail.push(`admin/admin.js — the "${label}" disposition is gone. Without all three a no-show has `
          + `nowhere to be recorded and reads exactly like a call that went perfectly.`);
      }
    }
    if (!fail.length) pass.push("all three dispositions are offered");

    // 🔴 The QUESTION must come before the ANSWER. Drafting a recap for a call nobody attended is the
    // wrong next act, and offering both at once makes the operator choose between them.
    const after = code.slice(code.indexOf('class="kc kc-after"'));
    const askAt = after.indexOf("data-kickoff-outcome=");
    const recapAt = after.indexOf("data-kickoff-recap=");
    // The UNANSWERED arm only: from the first disposition to the end of the footer.
    const uStart = after.indexOf('data-kickoff-outcome="held"');
    const uEnd = after.indexOf("</div></div>", uStart);
    const unanswered = uStart >= 0 && uEnd > uStart ? after.slice(uStart, uEnd) : "";
    if (askAt < 0 || recapAt < 0) {
      indet.push("could not locate both controls in the after-call pane");
    } else if (!/oc\s*\?/.test(after.slice(0, 2600))) {
      fail.push("admin/admin.js — the after-call pane does not branch on whether an outcome is "
        + "recorded, so it cannot lead with the question and it cannot lead with the recap after.");
    // 🔴 THE FIRST VERSION COMPARED POSITIONS ACROSS TWO MUTUALLY EXCLUSIVE BRANCHES. The
    // outcome-recorded arm renders the recap, the unanswered arm renders the question — so in SOURCE
    // order the recap "precedes" the question while on SCREEN they never appear together. Order only
    // means something INSIDE one branch. → feedback_position_is_not_identity
    } else if (unanswered && unanswered.indexOf("data-kickoff-recap") < unanswered.indexOf('data-kickoff-outcome="held"')) {
      // 🔑 The QUESTION leads while it is open; the RECAP stays reachable beside it. My first
      // version hid the recap entirely until an outcome was recorded — overriding a prior decision
      // (`check-the-kickoff-call-fits-its-slot`: the pane must offer a way to draft the recap) that
      // Chris never asked me to change. Both are pinned now, which is what stops me doing it again.
      // → feedback_do_what_chris_asked_not_the_principled_version
      fail.push("admin/admin.js — the recap is offered before the disposition, so the pane answers "
        + "before it asks.");
    } else pass.push("the question leads, and the recap stays reachable beside it");

    // 🔴 And it must not assert the call took place on the clock alone.
    // 🔴 PINNED ON THE PHRASE, NOT THE RENDERED MARKUP. The first version matched
    // `<b>The call is over</b>`, which never appears in source — the pane concatenates its tags, so
    // `'<b>' + ('The call is over') + '</b>'` walked straight past it. A gate that pins the OUTPUT
    // shape cannot read a template that builds it. → feedback_a_gate_must_pin_the_property_not_the_spelling
    if (/The call is over/.test(after.slice(0, 2600))) {
      fail.push('admin/admin.js — the after-call pane says "The call is over" again. The clock knows '
        + "only that the time passed; the client's portal says \"This call's time has passed\" and this "
        + "surface must agree with it until somebody answers.");
    } else pass.push("the pane does not claim the call happened on the clock alone");
  }
}

// ── 2 · the endpoint keeps the promise the dialog makes ─────────────────────────────────────────
{
  const raw = read("netlify/functions/kickoff-call-outcome.js", 2000);
  if (raw) {
    const code = strip(raw);

    // 🔴🔴 THE GATE RETURNS `{error}` — IT DOES NOT THROW. A try/catch around it let an
    // unauthenticated POST through on production. → project_security_the_guard_that_answered_into_a_void
    if (!/const gate = await requireWorkspaceForClient\(/.test(code) || !/if \(gate\.error\) return gate\.error;/.test(code)) {
      fail.push("netlify/functions/kickoff-call-outcome.js — the workspace gate is not called and "
        + "checked in the required shape. It RETURNS {error}; it never throws.");
    } else pass.push("the endpoint gates on the workspace, checked the right way");

    // 🔴 A mis-click hours early must not record a no-show for a call that has not happened.
    if (!/Date\.now\(\) < startMs/.test(code)) {
      fail.push("netlify/functions/kickoff-call-outcome.js — a call that has NOT STARTED can be "
        + "dispositioned, so a mis-click releases a booking that is still standing.");
    } else pass.push("a call that has not started cannot be dispositioned");

    // 🔴 The confirm says the slot is released. That has to be true, not an intention.
    if (!/kickoff_slot_holds/.test(code) || !/method: "DELETE"/.test(code)) {
      fail.push("netlify/functions/kickoff-call-outcome.js — a no-show does not release the hold, so "
        + 'the admin\'s confirm ("their portal starts offering times again") is a promise the code '
        + "does not keep, and that hour stays blocked for every client.");
    } else pass.push("a no-show or move actually releases the hold");

    if (!/slotFreed/.test(code)) {
      fail.push("netlify/functions/kickoff-call-outcome.js — it does not report whether the hold "
        + "actually cleared, so a caller will tell Chris the slot is open when it is still blocked.");
    } else pass.push("it reports whether the hold really cleared");

    // 🔑 `held` must release NOTHING — the call happened; the booking is history, not a live hold.
    if (!/held:\s*\{\s*label:[^}]*reopens:\s*false/.test(code)) {
      fail.push('netlify/functions/kickoff-call-outcome.js — "held" no longer declares reopens:false. '
        + "Releasing the booking after a call that happened would offer the client a second kickoff.");
    } else pass.push("a call that happened releases nothing");
  }
}

// ── 3 · un-answering is a WRITE, and only a `held` may be un-answered ──────────────────────────
// 🔴🔴 "Change what happened" deleted `call_outcome` from the admin's own in-memory copy and then
// called `reloadScopeAndRerender`, which re-READS the record — so the value came straight back and
// the pane went on saying "The call happened". The button had no server side at all.
// 🔑 A local delete followed by a read is not a change, it is a flicker.
// → feedback_verify_the_write_not_just_the_intent
{
  const raw = read("netlify/functions/kickoff-call-outcome.js", 2000);
  const adm = read("admin/admin.js", 100000);
  if (raw && adm) {
    const fn = strip(raw), aj = strip(adm);

    if (!/outcome === "clear"/.test(fn)) {
      fail.push("netlify/functions/kickoff-call-outcome.js — there is no way to un-answer an outcome, "
        + 'so "Change what happened" can only clear a copy the next read overwrites.');
    } else pass.push("the endpoint can un-answer an outcome");

    // 🔴 A released booking cannot be un-released, so it must not be un-answerable either.
    if (!/cur !== "held"/.test(fn)) {
      fail.push("netlify/functions/kickoff-call-outcome.js — a no-show or a move can be cleared. "
        + "Those RELEASE the slot and there is no undo for a release, so clearing one puts the "
        + "question back on screen for a booking that is already free and possibly re-taken.");
    } else pass.push("only a held call — which releases nothing — can be un-answered");

    const i = aj.indexOf('closest("[data-kickoff-outcome-reset]")');
    const h = i < 0 ? "" : aj.slice(0, aj.indexOf("const REOPENS", i) > 0 ? aj.indexOf("const REOPENS", i) : i + 4000).slice(i);
    if (!h) {
      indet.push("could not locate the reset branch in admin.js");
    } else if (/delete inv\.call_outcome/.test(h)) {
      fail.push("admin/admin.js — the reset deletes the outcome from the in-memory record again. "
        + "reloadScopeAndRerender re-reads from Supabase, so the value returns and the pane keeps "
        + "saying the call happened.");
    } else if (!/outcome: "clear"/.test(h)) {
      fail.push("admin/admin.js — the reset does not call the endpoint, so nothing is written and "
        + "the old answer survives the re-read.");
    } else pass.push("the reset writes, rather than clearing a copy the next read overwrites");
  }
}

for (const p of pass) console.log(`  ✅ ${p}`);
for (const i of indet) console.log(`  ⚠️  ${i}`);
for (const f of fail) console.log(`  🔴 ${f}`);
if (fail.length) {
  console.log(`\n🔴 FAIL — ${fail.length} way(s) the system decides a call happened without being told.`);
  process.exit(1);
}
if (indet.length && !pass.length) { console.log("\n⚠️  INDETERMINATE"); process.exit(2); }
console.log(`\n✅ the clock unlocks the work; only a person says the call happened (${pass.length} checks).`);

/* ─────────────────────────────────────────────────────────────────────────────────────────────────
 * MUTATION LOG — each must turn this gate red:
 *   1. remove any one of the three dispositions                       → a no-show has nowhere to go
 *   2. offer the recap without branching on the recorded outcome      → asks and answers at once
 *   3. put "The call is over" back                                    → the clock claiming occurrence
 *   4. wrap requireWorkspaceForClient in a try/catch                  → the void-gate bug
 *   5. drop the not-yet-started guard                                 → a mis-click releases a live booking
 *   6. stop deleting the hold                                         → the confirm becomes a lie
 *   7. make "held" reopen the booking                                 → a second kickoff offered
 * ─────────────────────────────────────────────────────────────────────────────────────────────── */
