#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — ONE LIST. THE CLIENT'S STEPS ARE THE SAME ROWS FILTERED, NEVER A SECOND CARD
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-09-30, of twenty screenshots of one tab's scroll length:
 *   *"is this correct or just many different iterations all into one?"*
 *
 * 🔴🔴 THE ONBOARDING TAB HELD THREE RENDERINGS OF ONE TRUTH.
 *   · the checklist                       — 59 RGA steps
 *   · "Onboarding Tasks (RGA-side)"       — the SAME 59, own progress bar, own "29/59 done" (deleted)
 *   · "Client Action Items"               — 16 steps, FOURTEEN of them already on the checklist
 *
 * `rgaSide()` dropped the two `actor: "client"` steps from the checklist, which is why the third
 * card had to exist at all. Three consequences, none visible from the line that did it:
 *   1. the checklist said **59** and the SOP has **61**
 *   2. one store (`client_onboarding_records.data.tasks`), two screens, free to disagree — and they
 *      did: the card read `status` raw while the checklist also honours the clock unlock and the graph
 *   3. 🔴 **the lock graph could not see the two steps.** Ten steps declare a dependency on one of
 *      them, and `known` did not contain them — so "optimise GBP categories" was offered as ready
 *      while the profile was still unverified. A dependency the list cannot see is one it cannot honour.
 *
 * 🔑 APPROVED SHAPE (reports/mockups/admin_onboarding_tab_rebuilt_v1.html): one list, ten phases, a
 * VIEW SWITCH — *"so 'what the client sees' is the same rows filtered, never a separate truth"* —
 * one pill per row (You · Client · Runs itself), and Done/Skip/Reset moved onto the client rows.
 *
 * WHAT IS PINNED:
 *   1. The playbook is not filtered before it reaches the checklist.
 *   2. The pill and the view switch read ONE function, so they cannot disagree about a row.
 *   3. The three kinds stay exclusive and exhaustive over the real 61.
 *   4. The client override lives on the rows, and the write refreshes the list that shows it.
 *   5. The second card and its second playbook cache are gone, and stay gone.
 *   6. A filter says what it hides and how to undo it.
 *
 * Exit 0 pass · 1 fail · 2 indeterminate. Mutation log at the bottom.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const fail = [], indet = [], pass = [];

const read = (rel, min) => {
  const p = path.join(SITE, rel);
  if (!fs.existsSync(p)) { indet.push(`${rel} does not exist`); return null; }
  const s = fs.readFileSync(p, "utf8");
  if (s.length < min) { indet.push(`${rel} is only ${s.length} bytes`); return null; }
  return s;
};

const js = read("admin/admin.js", 500000);
const html = read("admin/index.html", 50000);
const pbPath = path.join(SITE, "data/playbooks/playbooks.json");
if (!js || !html || !fs.existsSync(pbPath)) {
  for (const i of indet) console.log(`  ⚠️  ${i}`);
  console.error("⚠️  INDETERMINATE — sources not readable."); process.exit(2);
}
let m1;
try { m1 = JSON.parse(fs.readFileSync(pbPath, "utf8")).month1; }
catch (e) { console.error(`⚠️  INDETERMINATE — playbooks.json will not parse: ${e.message}`); process.exit(2); }

// 🔴 COMMENTS ARE NOT CODE. The first version of this gate matched the word `rgaSide` and went red
// on the comment explaining its removal — it accused the very change it exists to confirm.
// → feedback_a_gate_must_pin_the_property_not_the_spelling · feedback_a_comment_asserting_a_fix_is_not_the_fix
const code = js.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── 1 · nothing filters the playbook on its way to the checklist ────────────────────────────────
if (/\brgaSide\s*[=(]/.test(code)) {
  fail.push("admin/admin.js — rgaSide() is back. It drops the two `actor: \"client\"` steps, which "
    + "makes the checklist say 59 of a 61-step SOP, hides ten steps' real blocker from the lock "
    + "graph, and forces the client's steps into a second card that can contradict this one.");
} else pass.push("the playbook reaches the checklist unfiltered");

if (!/state\.flowM1Playbook = state\.flowAllPlaybooks\.month1/.test(code)) {
  fail.push("admin/admin.js — flowM1Playbook is no longer assigned the whole month-1 playbook, so "
    + "some transformation sits between the SOP and every surface that counts it.");
} else pass.push("flowM1Playbook is the whole month-1 playbook");

// ── 2 · the pill and the switch are ONE function, run against the real data ─────────────────────
{
  const grab = (start, end) => {
    const a = js.indexOf(start);
    if (a < 0) return null;
    const b = js.indexOf(end, a);
    return b < 0 ? null : js.slice(a, b + end.length);
  };
  const parts = {
    sopClientFacing: grab("const sopClientFacing = (s) =>", ";"),
    stepKind: grab("const stepKind = (o) =>", ";"),
    OB_VIEWS: grab("const OB_VIEWS = [", "\n];"),
  };
  const missing = Object.entries(parts).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    fail.push(`admin/admin.js — ${missing.join(", ")} not found. The pill on the row and the view `
      + "switch above it are supposed to be one function; if either is gone they are two answers to "
      + "\"is this the client's step\" and the separate-card defect is back in a new shape.");
  } else {
    // 🔑 RUN IT, do not read it. A taxonomy that is exhaustive in the source and not over the data
    // is exactly the kind of claim a regex cannot check.
    // → feedback_a_gate_that_it_exists_is_not_a_gate_that_it_works
    let F, K, V;
    try {
      const ctx = vm.createContext({});
      vm.runInContext(`${parts.sopClientFacing}\n${parts.stepKind}\n${parts.OB_VIEWS}\n`
        + "globalThis._x = { sopClientFacing, stepKind, OB_VIEWS };", ctx);
      ({ sopClientFacing: F, stepKind: K, OB_VIEWS: V } = ctx._x);
    } catch (e) {
      indet.push(`could not run the three declarations in isolation: ${e.message}`);
    }
    if (F && K && V) {
      const kinds = m1.map((s) => K({ clientFacing: F(s), sopType: s.type }));
      const tally = {};
      kinds.forEach((k) => { tally[k] = (tally[k] || 0) + 1; });
      const keys = V.map((v) => v.key).filter((k) => k !== "all");

      if (kinds.some((k) => k == null || k === "")) {
        fail.push("admin/admin.js — stepKind returns nothing for at least one step, so a row renders "
          + "with no pill and no view can claim it. A step that belongs to nobody is invisible.");
      } else pass.push(`every one of the ${m1.length} steps gets exactly one pill (${JSON.stringify(tally)})`);

      const unreachable = keys.filter((k) => !tally[k]);
      if (unreachable.length) {
        fail.push(`admin/admin.js — the view(s) ${unreachable.join(", ")} match no step, so selecting `
          + "one empties the page. The switch must filter on the values stepKind actually returns.");
      } else pass.push("every view filters to a non-empty set of real rows");

      const strays = [...new Set(kinds)].filter((k) => !keys.includes(k));
      if (strays.length) {
        fail.push(`admin/admin.js — stepKind returns ${strays.join(", ")}, which no view offers. Those `
          + "rows can be seen only under Everything, and nothing on screen says so.");
      } else pass.push("the switch offers a view for every kind the pill can show");

      const both = m1.filter((s) => F(s) && s.type === "auto");
      if (both.length) {
        fail.push(`admin/admin.js — ${both.length} step(s) are BOTH the client's and automatic `
          + `(${both.slice(0, 3).map((s) => s.id).join(", ")}). The pill has to pick one, so the other `
          + "view silently loses them — a filter that hides rows it claims to show.");
      } else pass.push("no step is both the client's and automatic, so the three kinds partition cleanly");
    }
  }
}

// ── 3 · the override is ON the row, and the write refreshes the row ────────────────────────────
// 🔴 "IT APPEARS SOMEWHERE" IS NOT "IT APPEARS ON THE ROW YOU NEED IT ON". The first version of
// this check only asked whether `clientOverride(o, s.task)` occurred at all — and passed a mutation
// that stripped it from the ACTIVE and READY rows, which are the two states an operator is actually
// looking at. Every row state that can still take an answer is pinned separately.
// → feedback_an_inventory_is_a_claim_about_what_i_thought_to_grep
if (!/const clientOverride = \(o, task[,)]/.test(code)) {
  fail.push("admin/admin.js — clientOverride is gone, so the Done/Skip/Reset override is no longer "
    + "rendered onto the checklist rows. It is the client's status; it has to sit beside the status "
    + "it overrides, or it goes back into a card 200 rows away that can disagree with this one.");
} else {
  // 🔴🔴 BOUND EACH BRANCH ON A SYNTACTIC EDGE, NEVER ON A CHARACTER WINDOW. The first version
  // sliced from each `uiState` test to a landmark that was a COMMENT — and this gate strips comments
  // before matching, so the landmark was never found, the slice fell back to `start + 4000`, and the
  // ready branch's window spilled into the locked branch and read ITS override as its own. It
  // reported one missing state when two were.
  // 🔑 A row's markup begins at `class="ob-step <state>"` and ends at the backtick that closes the
  // returned template. Both are real edges in the source.
  // → feedback_a_gate_window_measured_in_characters_will_lie
  // 🔴🔴 AND THE EDGE STILL STARTED TOO LATE (2026-10-05). Slicing from `class="ob-step queued"`
  // reads only the TEMPLATE. The queued branch builds its controls one line ABOVE that string —
  // `const qActions = \`${qRerun}${clientOverride(o, s.task)}\`` — so the override was present and
  // this gate reported it missing. It accused correct code.
  //
  // 🔑 THE BRANCH IS THE UNIT, NOT THE MARKUP. Start at the `if (s.uiState === "<state>")` that owns
  // the row and brace-match to its close; everything the branch assembles is then inside the window.
  // A state with no such `if` (the active one is reached differently) falls back to the markup edge.
  // → feedback_a_gate_window_measured_in_characters_will_lie · feedback_a_gate_must_pin_the_property_not_the_spelling
  const braceBlockAt = (from) => {
    const open = code.indexOf("{", from);
    if (open < 0) return null;
    let d = 0;
    for (let i = open; i < code.length; i++) {
      if (code[i] === "{") d++;
      else if (code[i] === "}") { d--; if (!d) return code.slice(from, i + 1); }
    }
    return null;
  };
  const branchOf = (stateCls) => {
    const ifAt = code.indexOf(`if (s.uiState === "${stateCls}")`);
    if (ifAt >= 0) {
      const blk = braceBlockAt(ifAt);
      if (blk) return blk;
    }
    const a = code.indexOf(`class="ob-step ${stateCls}"`);
    if (a < 0) return null;
    const b = code.indexOf("`;", a);
    return b < 0 ? null : code.slice(a, b);
  };
  const states = ["active", "queued", "ready", "locked"];
  const slices = states.map((k) => [k, branchOf(k)]);
  if (slices.some(([, v]) => v === null)) {
    indet.push("could not locate every row-state branch: "
      + slices.filter(([, v]) => v === null).map(([k]) => k).join(", "));
  } else {
    const missing = slices.filter(([, v]) => !/clientOverride\(o, s\.task[,)]/.test(v)).map(([k]) => k);
    if (missing.length) {
      fail.push(`admin/admin.js — the client override is missing from the ${missing.join(", ")} row `
        + "state(s). A client tells us by phone that their profile is verified; if the row they told "
        + "us about will not take the answer, the operator goes looking for the card that is gone.");
    } else pass.push(`every row state that can still take an answer carries the override (${states.join(", ")})`);

    // 🔴 TWO BUTTONS, ONE EFFECT. The first build put the override's "Done" beside the row's own
    // "✓ Mark step complete" on the active card — both write `tasks[id].status = "done"` to the same
    // record, so the second was pure doubt about which one is real. Active and ready already carry a
    // Done; queued and locked do not, which is why the override must reach THEM.
    // → feedback_a_control_has_a_kind_like_a_message_does
    const doubled = slices.filter(([k, v]) => ["active", "ready"].includes(k)
      && !/clientOverride\(o, s\.task, true\)/.test(v)).map(([k]) => k);
    if (doubled.length) {
      fail.push(`admin/admin.js — the ${doubled.join(", ")} row(s) offer the override's "Done" beside `
        + "their own Done control. Two buttons writing one field is the operator asking which is real.");
    } else pass.push("no row offers two buttons for one effect");
  }
}

{
  // 🔴🔴 TWO IN-MEMORY COPIES OF ONE DATABASE ROW. `setClientTaskStatus` writes through
  // `state.onboardingData`; the checklist reads `state.flowM1State`. Same row in Supabase, different
  // objects in the tab — so without a re-fetch the click saves and the row does not move, which
  // reads as the button being broken. → feedback_correct_is_not_the_same_as_happening
  const a = code.indexOf("async function setClientTaskStatus(");
  const body = a < 0 ? "" : code.slice(a, code.indexOf("\n}", a));
  if (!body) {
    fail.push("admin/admin.js — setClientTaskStatus is gone; the override buttons write nowhere.");
  } else if (!/await reloadScopeAndRerender\("month1"\)/.test(body)) {
    fail.push("admin/admin.js — setClientTaskStatus does not re-fetch the scope. It writes through "
      + "state.onboardingData while the checklist reads state.flowM1State — two copies of one "
      + "database row — so the click saves and the row does not move.");
  } else pass.push("an override re-fetches the scope, so the row it changed actually changes");
}

// 🔴 The buttons are re-rendered on every checklist paint, so a per-row listener would be bound to
// elements that no longer exist. Delegation, or the second click does nothing.
if (!/closest\("\[data-task-set\]"\)/.test(code)) {
  fail.push("admin/admin.js — nothing listens for [data-task-set] by delegation. The rows are "
    + "re-rendered wholesale, so a listener bound per row dies on the first re-render and the "
    + "override silently stops working.");
} else pass.push("the override is wired by delegation, so it survives a re-render");

// ── 4 · the second card, and its second cache of the SOP, stay gone ────────────────────────────
for (const [needle, what] of [
  ['id="clientActionItemsList"', "the Client Action Items list"],
  ["<h3>Client Action Items</h3>", "the Client Action Items card"],
]) {
  if (html.includes(needle)) {
    fail.push(`admin/index.html — ${what} is back. It re-renders 16 steps the checklist already `
      + "holds, from the same store, with a status computed differently — which is how the two "
      + "surfaces disagreed.");
  }
}
if (!html.includes('id="clientFactsAdmin"')) {
  fail.push("admin/index.html — the five owner questions lost their host. They are not a duplicate "
    + "of anything: they gate 41 drafts and were the other half of the deleted card.");
} else pass.push("the owner questions kept their home; only the duplicate list went");

if (/\bensureAdminPlaybookLoaded\s*[=(]/.test(code)) {
  fail.push("admin/admin.js — a second cache of /.netlify/functions/admin-playbook is back. Two "
    + "caches of one endpoint are two answers to \"what does the SOP say\", from different minutes.");
} else pass.push("there is one cache of the playbook endpoint");

// ── 5 · a filter must not read as a deletion ───────────────────────────────────────────────────
{
  const a = code.indexOf("const viewNote =");
  const note = a < 0 ? "" : code.slice(a, a + 700);
  if (!note) {
    fail.push("admin/admin.js — the filtered list no longer says what it is hiding. \"Showing 16\" "
      + "with no denominator reads as a list that lost 45 steps.");
  } else {
    const saysTotal = /steps\.length/.test(note);
    const wayBack = /data-ob-view="all"/.test(note);
    if (!saysTotal || !wayBack) {
      fail.push("admin/admin.js — the filter note must give the TOTAL it is filtering from"
        + `${saysTotal ? "" : " (it does not)"} and a way back to everything`
        + `${wayBack ? "" : " (it does not)"}. Otherwise a filter is indistinguishable from steps `
        + "having been removed. → feedback_an_absence_must_never_be_readable_as_a_value");
    } else pass.push("a filtered list names its total and offers the way back");
  }
  // 🔴 The head's "N of M done", the bar and the phase counts must all describe the SAME set the
  // body renders. A pill still reading "29 of 61" over 16 rows is the old defect in a new place.
  if (!/obPhasedHtml\(steps, rowHtmlList, isM1, visible\)/.test(code)) {
    fail.push("admin/admin.js — the phase list is not given the filtered set, so its counts describe "
      + "rows the screen is not showing.");
  } else pass.push("the phases count the rows the filter actually leaves on screen");
}

for (const p of pass) console.log(`  ✅ ${p}`);
for (const i of indet) console.log(`  ⚠️  ${i}`);
for (const f of fail) console.log(`  🔴 ${f}`);
if (fail.length) { console.log(`\n🔴 FAIL — ${fail.length} way(s) the one list has split in two again.`); process.exit(1); }
if (indet.length && !pass.length) { console.log("\n⚠️  INDETERMINATE"); process.exit(2); }
console.log(`\n✅ one list: the client's steps are the same rows filtered (${pass.length} checks).`);

/* ─────────────────────────────────────────────────────────────────────────────────────────────────
 * MUTATION LOG — each must turn this gate red:
 *   1. restore rgaSide()                                   → 59 of 61, and the blind lock graph
 *   2. give the view switch its own predicate              → two answers to "is this the client's"
 *   3. make a step both clientFacing and type:auto         → one view silently loses it
 *   4. drop clientOverride from the rows                   → the override goes back to a second card
 *   5. remove the reloadScopeAndRerender from the write    → the click saves and nothing moves
 *   6. bind [data-task-set] per row instead of delegating  → works once, then never
 *   7. re-add the Client Action Items markup               → the duplicate returns
 *   8. remove the filter note or its "show everything"     → a filter reads as a deletion
 *   9. pass the unfiltered set to obPhasedHtml             → counts describe rows not on screen
 * ─────────────────────────────────────────────────────────────────────────────────────────────── */
