// check-a-client-action-reaches-the-admin.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴🔴 WHOSE TURN IT IS IS NOT A FUNCTION OF WHERE OUR CHECKLIST HAPPENS TO BE.
//
// Chris, 2026-09-29, after rescheduling from the client side: "admin side shows next step is GBP
// manager access. so both sides need to sync and link for each step. this has to happen for each
// step, change, cancel and redo."
//
// The client had asked to move their kickoff call. The request was sitting in `_kickoffPendingAsk`.
// The admin's next-action card said "Step 6 · Get GBP manager access" — because the check for a
// pending request was gated on the ACTIVE STEP being a kickoff step, and the kickoff step had
// completed on the clock. An act the client has taken, that needs an answer from us, IS the next
// action; our checklist can wait, the client cannot.
//
// 🔑 Two halves, and the first without the second is a fix that never happens:
//   1. the check is not gated on which step is active, and
//   2. the card that renders it actually ASKS for the answer, and re-renders when it lands.
// → feedback_correct_is_not_the_same_as_happening · feedback_a_cache_another_tab_fills_is_not_a_source_of_truth
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const JS = path.join(SITE, "admin", "admin.js");
const pass = [], fail = [];

if (!fs.existsSync(JS)) { console.error("⚠️  INDETERMINATE — admin.js not found."); process.exit(2); }
const code = fs.readFileSync(JS, "utf8");

// ── 1. THE PENDING REQUEST IS NOT GATED ON THE ACTIVE STEP ─────────────────────────────────────
// 🔴 SCOPED TO THE CARD THAT MATTERS. This first counted reads across the WHOLE FILE — and other
// surfaces read the same map — so re-gating the next-action read still left an ungated read
// elsewhere and the count check passed. A check about one decision must read that decision.
// → feedback_an_inventory_is_a_claim_about_what_i_thought_to_grep
{
  const i = code.indexOf("const onboardingNext = (() => {");
  if (i < 0) fail.push("admin/admin.js — onboardingNext is gone; the next-action card cannot name a step.");
  else {
    const block = code.slice(i, code.indexOf("\n  })();", i));
    const uses = [...block.matchAll(/if \(([^)]*_kickoffPendingAsk\.get\([^)]*\)[^)]*)\)/g)].map((m) => m[1]);
    if (!uses.length)
      fail.push("admin/admin.js — the next-action computation never reads a pending kickoff request, so a client waiting on us is invisible there.");
    else if (uses.every((u) => /flowId|active\./.test(u)))
      fail.push("admin/admin.js — every read of a pending kickoff request inside the next-action computation is gated on which step is active, so a request is invisible once the kickoff step is done.");
    else pass.push("the next-action computation reads a pending request without a step guard");
  }
}

// ── 2. THE CARD THAT USES IT ASKS FOR IT ───────────────────────────────────────────────────────
// 🔴 The map was filled by the CHECKLIST's loader. On a tab where the checklist has not rendered it
// is empty — and an empty map reads exactly like "no request".
{
  const i = code.indexOf("function renderNextAction()");
  if (i < 0) fail.push("admin/admin.js — renderNextAction() is gone.");
  else {
    const body = code.slice(i, code.indexOf("\n}", i));
    if (!/ensureKickoffPendingAsk\(/.test(body))
      fail.push("admin/admin.js — renderNextAction() never asks for the client's pending request, so it reads an empty map as \"nothing pending\".");
    else pass.push("the next-action card asks for the answer itself");
  }
}

// ── 3. EVERY SURFACE THAT ASKED IS TOLD ────────────────────────────────────────────────────────
// 🔴 The probe runs ONCE per client. Keeping only the first caller's callback leaves the second
// surface rendering a stale answer forever.
{
  const i = code.indexOf("async function ensureKickoffPendingAsk");
  if (i < 0) fail.push("admin/admin.js — ensureKickoffPendingAsk() is gone.");
  else {
    const body = code.slice(i, code.indexOf("\n}", i));
    if (!/_kickoffAskListeners/.test(body))
      fail.push("admin/admin.js — the probe keeps a single callback, so only the surface that asked first learns the answer.");
    else if (!/for \(const fn of/.test(body))
      fail.push("admin/admin.js — listeners are collected but never all called.");
    else pass.push("every surface that asked is told when the answer lands");
    if (!/try \{ fn\(\); \} catch/.test(body))
      fail.push("admin/admin.js — one failing listener would stop the rest, leaving the page half-updated.");
    else pass.push("one failing listener cannot stop the others");
  }
}

// ── 4. AND THE PROBE CAN BE RETRIED WHEN IT COULD NOT TELL ─────────────────────────────────────
{
  const i = code.indexOf("async function ensureKickoffPendingAsk");
  const body = i < 0 ? "" : code.slice(i, code.indexOf("\n}", i));
  if (body && !/_kickoffAskProbed\.delete/.test(body))
    fail.push("admin/admin.js — a failed probe is never retried, so one bad response hides every later request for the session.");
  else if (body) pass.push("a probe that could not tell is retried");
}

// ── 5. AND A CANCEL READS AS A CANCEL, NOT AS "THEY HAVEN'T PICKED YET" ────────────────────────
// 🔴 Both leave us waiting on the same act — the client choosing a time — so before this they
// produced the SAME sentence. A call being called off looked like a client who had not got round
// to it. The reopened invite step carries "Cancelled — … was called off on …"; that is the trace,
// because the invite record itself is removed rather than emptied.
{
  if (!/function kickoffWasCancelled\(\)/.test(code))
    fail.push("admin/admin.js — nothing reads the cancellation trace, so a cancelled call reads exactly like a client who never picked.");
  else {
    const i = code.indexOf("function kickoffWasCancelled()");
    const body = code.slice(i, code.indexOf("\n}", i));
    if (!/auto_result/.test(body))
      fail.push("admin/admin.js — the cancellation reader does not read the reopened step's auto_result, which is the only surviving trace.");
    else pass.push("the cancellation trace is read from the reopened step");
    // 🔑 It must be USED on the waiting branch, not merely defined.
    const waitAt = code.indexOf("kickoffWaitingOnPick(askedId)");
    const after = waitAt < 0 ? "" : code.slice(waitAt, waitAt + 900);
    if (!/kickoffWasCancelled\(\)/.test(after))
      fail.push("admin/admin.js — the waiting-on-them branch never asks whether they cancelled, so both states produce the same sentence.");
    else pass.push("the waiting branch distinguishes a cancel from a client who never picked");
  }
}

// ── 6. AND NOTIFYING THEM CANNOT LOOP ──────────────────────────────────────────────────────────
// 🔴🔴 THIS HUNG THE ENTIRE ADMIN ON 2026-09-29 — a blank page that sat there loading, with no
// error, because it was never a crash. Listeners lived in a Set and every caller passed a FRESH
// arrow, so `add` never deduped; firing them re-entered the renderer, which registered ANOTHER
// listener into the Set being iterated — and a Set VISITS ITEMS ADDED DURING ITERATION.
// 🔑 Two properties, and one without the other still loops: keyed registration, and a snapshot.
{
  const i = code.indexOf("async function ensureKickoffPendingAsk");
  const body = i < 0 ? "" : code.slice(i, code.indexOf("\n}", i));
  if (!body) fail.push("admin/admin.js — ensureKickoffPendingAsk() is gone.");
  else {
    if (/\.add\(onChange\)/.test(body))
      fail.push("admin/admin.js — listeners are added to a Set by identity, so every render registers another one and firing them never ends.");
    else if (!/\.set\(key \|\| onChange, onChange\)/.test(body))
      fail.push("admin/admin.js — listeners are not keyed by surface, so re-registering accumulates instead of replacing.");
    else pass.push("listeners are keyed by surface, so re-registering replaces");
    if (!/\[\.\.\./.test(body))
      fail.push("admin/admin.js — the listener loop iterates the live collection; a listener that registers another extends the loop it is running inside.");
    else pass.push("the listener loop iterates a snapshot");
  }
  // 🔑 Both call sites must actually pass a key, or the Map degrades to identity again.
  const calls = [...code.matchAll(/ensureKickoffPendingAsk\(([^;]*)\);/g)].map((m) => m[1]);
  const unkeyed = calls.filter((c) => c.split(",").length < 3);
  if (unkeyed.length)
    fail.push(`admin/admin.js — ${unkeyed.length} call(s) to ensureKickoffPendingAsk pass no key, so their listeners accumulate on every render.`);
  else pass.push(`all ${calls.length} callers pass a stable key`);
}

// ── 7. EVERY SURFACE THAT READS THE ANSWER ASKS FOR IT ─────────────────────────────────────────
// 🔴🔴 THIS IS THE CLASS, not the instance. `_kickoffPendingAsk` is filled by ONE probe. Any surface
// that reads it without calling that probe renders whatever happens to be in the map — and an empty
// map reads exactly like "this client has made no request". Three surfaces did this in turn: the
// onboarding checklist, the next-action card, and the cockpit alert, each found only when Chris
// screenshotted it.
// 🔑 A reader either asks, or is re-rendered by a function that does.
{
  const lines = code.split("\n");
  // 🔴🔴 THE NEAREST PRECEDING `function` IS NOT THE ENCLOSING ONE. This scanned backwards for the
  // last `function X` at any depth — so a helper DECLARED INSIDE another function captured every
  // read below it. On 2026-09-29 `obPhaseBody` / `obPhasedHtml` were added inside the body of
  // `renderOnboardingChecklist`, and from that moment this gate blamed `obPhasedHtml()` for a read
  // that belongs to `renderOnboardingChecklist` — which DOES call the probe, on its first line.
  //
  // It accused correct code, and it stayed red unnoticed for a day because that session's sweep died
  // partway and exited 0. The helpers have been lifted to top level; this now tracks brace depth so
  // it cannot make the same mistake about the next one.
  // 🔑 A heuristic that names a function is a claim about SCOPE. Scope is depth, not distance.
  // → feedback_a_gate_must_pin_the_property_not_the_spelling · feedback_a_gate_window_measured_in_characters_will_lie
  const owner = (() => {
    const stack = [];           // [{ name, depth }]
    const at = [];              // enclosing function name per line
    let depth = 0;
    lines.forEach((ln) => {
      const m = ln.match(/^\s*(?:async\s+)?function\s+(\w+)/);
      if (m) stack.push({ name: m[1], depth });
      at.push(stack.length ? stack[stack.length - 1].name : "(top level)");
      // Strings and regexes can carry stray braces; the count is close enough because a declaration
      // only ever POPS when depth returns to the level it was opened at.
      for (const ch of ln) { if (ch === "{") depth++; else if (ch === "}") depth--; }
      while (stack.length && depth <= stack[stack.length - 1].depth) stack.pop();
    });
    return (i) => at[i] || "(top level)";
  })();
  // Helpers that only COMPUTE from the map, and renderers driven by one that asks, are excused here
  // with a reason — the same discipline the pre-flight excuse list uses.
  const EXCUSED = {
    kickoffWaitingOnPick: "a pure predicate — its callers ask",
    kickoffSentAwaiting: "a pure reader of the invite, not of the request map",
    ensureKickoffPendingAsk: "this IS the probe",
    loadKickoffRequests: "fetches the answer itself via fetchKickoffAnswers",
    stepStateBand: "rendered by renderOnboardingChecklist, which asks",
    kickoffAskCopy: "formats a value it is handed",
    kickoffBookingBeingMoved: "compares two times it is handed",
    kickoffState: "a pure reader — every function that CALLS it must ask (checked just below)",
  };
  const readers = new Map();
  lines.forEach((ln, i) => {
    if (/^\s*(\/\/|\*)/.test(ln)) return;
    if (!/_kickoffPendingAsk\.get\(/.test(ln)) return;
    const f = owner(i);
    if (!readers.has(f)) readers.set(f, i + 1);
  });
  const deaf = [];
  for (const [fn, line] of readers) {
    if (EXCUSED[fn]) continue;
    const at = code.indexOf(`function ${fn}(`);
    const body = at < 0 ? "" : code.slice(at, code.indexOf("\n}", at));
    if (!/ensureKickoffPendingAsk\(/.test(body)) deaf.push(`${fn}() (line ${line})`);
  }
  // 🔑 kickoffState() is excused only because its CALLERS ask. Hold that: each function that calls
  // it either probes, is itself a pure reader, or is rendered inside one that probes.
  const STATE_CALLER_OK = {
    kickoffAlertFor: "formats the state it is handed",
    kickoffStep2Open: "a predicate over the state it is handed",
    kickoffCallOpen: "formats a number",
    kickoffConsoleHtml: "rendered by renderOnboardingChecklist, which asks",
    obPhasedHtml: "its only caller is renderOnboardingChecklist (line ~8309), which asks",
    kickoffReopened: "a predicate over the state it is handed",
    kickoffNextAction: "its only caller is renderNextAction, which asks",
    kickoffPassedNote: "only reachable from a control drawn by Your action or the request card, both of which ask",
    _refreshKickoffRsvp: "the Overview footer — the booking-card loader beside it fetches the requests",
    loadKickoffRequests: "fetches the answer itself via fetchKickoffAnswers",
  };
  lines.forEach((ln, i) => {
    if (/^\s*(\/\/|\*)/.test(ln) || !/kickoffState\(/.test(ln) || /function kickoffState\(/.test(ln)) return;
    const f = owner(i);
    if (f === "(top level)" || EXCUSED[f] || STATE_CALLER_OK[f]) return;
    const at = code.indexOf(`function ${f}(`);
    const body = at < 0 ? "" : code.slice(at, code.indexOf("\n}", at));
    if (!/ensureKickoffPendingAsk\(/.test(body)) deaf.push(`${f}() calls kickoffState() (line ${i + 1})`);
  });
  if (deaf.length)
    fail.push(`admin/admin.js — ${deaf.length} surface(s) read a client's pending request without asking for it, so they render an empty map as "no request": ${deaf.join(", ")}.`);
  else pass.push(`all ${readers.size} reader(s) of a pending request either ask for it or are excused with a reason`);
}

// ── 8. 🔒 THE NEXT-ACTION CARD v2 — THE FACT IS THE HERO ───────────────────────────────────────
// Approved 2026-09-29 (reports/mockups/admin_next_action_card_v2.html). The old card buried the one
// thing you needed — the time — in the sixth word of a three-sentence paragraph, gave three
// instructions equal weight, and filled its second column with the same sentence for every client
// in every state. Principle 4: numbers are the hero.
{
  const html = fs.readFileSync(path.join(SITE, "admin", "index.html"), "utf8");
  for (const [id, what] of [
    ["adminNextActionFact", "the fact (usually the time), at metric size"],
    ["adminNextActionWas", "the time it replaces, struck through"],
    ["adminNextActionCaution", "the caution, in its own shape"],
    ["clientNextActionCount", "a real count of what the client still owes"],
    ["clientNextActionList", "the names of what they owe"],
  ]) {
    if (!html.includes(`id="${id}"`)) fail.push(`admin/index.html — the card has no slot for ${what}.`);
  }
  if (!fail.some((f) => /no slot for/.test(f))) pass.push("the card has slots for the fact, the strike-through, the caution and the client's real list");

  // 🔑 Every one must be FILLED, not merely present — an empty slot is a shape that renders nothing.
  const i = code.indexOf("function renderNextAction()");
  const body = i < 0 ? "" : code.slice(i, code.indexOf("\n}", i));
  if (!/adminNextActionFact/.test(body)) fail.push("admin/admin.js — nothing fills the fact slot, so the time stays buried in prose.");
  else if (!/clientNextActionCount/.test(body)) fail.push("admin/admin.js — nothing fills the client column's count, so it is furniture again.");
  else pass.push("the renderer fills the fact and the client's real list");

  // 🔴 And the column must DISAPPEAR when there is nothing to say, rather than saying "nothing".
  if (!/col\.style\.display = "none"/.test(body))
    fail.push("admin/admin.js — the client column never hides, so with nothing outstanding it exists only to say so.");
  else pass.push("the client column hides when nothing is outstanding");

  // 🔴 The move state must carry the time it replaces — a move you can SEE, not read.
  if (!/function kickoffPriorBookingWhen\(\)/.test(code))
    fail.push("admin/admin.js — nothing reads the booking a pending request would replace, so a move cannot be shown as one.");
  else pass.push("a pending move can show the time it replaces");
}

// ── 9. THE CARD IS WRITTEN FROM THE ADMIN'S SIDE, AND THE BADGE AGREES WITH THE SENTENCE ───────
// 🔴🔴 Two faults Chris caught on one screenshot, 2026-09-29:
//   · the badge read "● YOUR ACTION" above "Waiting on them to accept the invite" — whose turn it
//     was had been decided per STAGE (onboarding hardcoded to "you") while the individual state knew
//     perfectly well it was waiting on somebody else. Two claims, one card.
//   · the right column's pill read "WAITING ON RGA" — written from the CLIENT's point of view and
//     then shown to RGA. "the admin is RGA."
// 🔑 A state that knows whose turn it is overrides the stage's guess, and every label on this card
// is written from the side that reads it.
{
  const i = code.indexOf("function renderNextAction()");
  const body = i < 0 ? "" : code.slice(i, code.indexOf("\n}", i));
  if (!/data\.admin\.owner/.test(body))
    fail.push("admin/admin.js — the turn badge is decided per stage only, so a state that is waiting on the client can still be labelled \"Your action\".");
  else pass.push("a state that knows whose turn it is overrides the stage's guess");
  if (/ownerClient\.textContent = [^;]*Waiting on RGA/.test(body))
    fail.push("admin/admin.js — the client column is labelled \"Waiting on RGA\" on RGA's own screen.");
  else pass.push("no column tells RGA it is waiting on RGA");

  // 🔴 "them" is the client. On an operator's screen the actor should be named.
  // 🔑 Comments are stripped — the notes explaining this very fix quote the old wording.
  const live = code.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const vague = [...live.matchAll(/"[^"]*\b(?:on|with|for) them\b[^"]*"/g)].map((m) => m[0]);
  if (vague.length)
    fail.push(`admin/admin.js — ${vague.length} admin string(s) still say "them" where they mean the client: ${vague.slice(0, 2).join(" · ")}`);
  else pass.push("admin copy names the client rather than saying \"them\"");
}

// ── THE CARD THAT NAMES THE DECISION MUST BE ABLE TO MAKE IT ────────────────────────────────────
// 🔒 Approved 2026-09-29 — Chris: *"do it and match mockups exactly"*, answering the open question in
// reports/mockups/admin_next_action_card_v2.html: *"Approve from the card, or keep the jump?"*
//
// The card described the decision in full and then offered "Go to the request →" — another tab, to
// press a button saying the same thing. A card that names the next action and cannot perform it is
// the same defect as a step that says "do it" with no control on it.
// → feedback_a_finding_must_be_actionable_inside_the_product
{
  const live = code.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

  // 1 · the approve action is emitted, and ONLY with a real ISO behind it.
  if (!/approve:\s*askedIso\s*\?/.test(live)) {
    fail.push('admin/admin.js — the pending-request branch does not emit an `approve` action gated on '
      + "a known ISO. Either the card is back to only pointing at the work, or it can render an "
      + "Approve button with no slot behind it.");
  } else pass.push("the pending-request card offers the approval itself, only when the slot is known");

  // 2 · the label carries the TIME. A bare "Approve" reads the same on every request, so the button
  //     cannot be checked against the card it sits on. → feedback_instruct_by_what_is_on_screen
  if (!/label:\s*`Approve \$\{kickoffShortWhen\(/.test(live)) {
    fail.push("admin/admin.js — the approve button's label no longer names the time it would confirm.");
  } else pass.push("the approve button names the slot it confirms");

  // 3 · pressing it must reach the real sender, with the move-ness it was rendered with.
  //     🔴 `movesFrom` decides whether the dialog describes a MOVE or a first booking, and whether
  //     Google sends a reschedule notice or an invitation. Dropping it silently mis-describes both.
  const wired = /onclick\s*=\s*\(\)\s*=>\s*\n?\s*answerKickoffRequest\(a\.clientId,\s*a\.start,\s*"confirm"/.test(live);
  if (!wired) {
    fail.push("admin/admin.js — the approve button is not wired to answerKickoffRequest, so it renders "
      + "as a control and does nothing.");
  } else if (!/a\.movesFrom/.test(live)) {
    fail.push("admin/admin.js — the approve button drops `movesFrom`, so a reschedule would be "
      + "described to Chris, and emailed to the client, as a first booking.");
  } else pass.push("the approve button reaches the real sender, carrying whether it is a move");

  // 4 · 🔴🔴 THE GHOST HAD NO HANDLER. `handleTabClick` is bound to `els.tabButtons`, not the
  //     document, so `data-tab` on a button inside a card is read by NOBODY. Nothing populated `alt`
  //     until today, so it was a dead control waiting to be switched on.
  //     → feedback_a_capability_nobody_calls_looks_finished
  const altBlock = live.slice(live.indexOf("const alt = document.getElementById(\"adminNextActionAlt\")"));
  if (!altBlock) {
    fail.push("admin/admin.js — the secondary action on the next-action card is gone.");
    // 🔴 `alt.onclick =` ALONE IS SATISFIED BY THE TEARDOWN. The else-branch sets `alt.onclick = null`
    // to clear it, and a mutation that deleted the real handler still passed on that line. Require an
    // assignment to a FUNCTION, which only the live branch can have.
    // → feedback_a_gate_must_pin_the_property_not_the_spelling
  } else if (!/alt\.onclick\s*=\s*(\(\s*\)|function|async)/.test(altBlock.slice(0, 1400))) {
    fail.push("admin/admin.js — the next-action card's secondary button has NO click handler. It sets "
      + "data-tab, but handleTabClick is bound to the tab bar, not the document — so it renders, "
      + "looks pressable, and does nothing.");
  } else pass.push("the card's secondary action is actually wired, not merely attributed");

  // 5 · the handler must be ASSIGNED, never added, or a re-render stacks a second confirm.
  if (/adminNextActionBtn\.addEventListener\("click"[\s\S]{0,200}answerKickoffRequest/.test(live)) {
    fail.push("admin/admin.js — the approve handler is ADDED rather than assigned, so a re-render "
      + "stacks another one and a single click confirms the slot twice.");
  } else pass.push("the approve handler is assigned, so a re-render cannot stack a second one");

  // 6 · and it must be cleared on every other branch, or it survives onto the next client's card.
  const cleared = (live.match(/adminNextActionBtn\.onclick\s*=\s*null/g) || []).length;
  if (cleared < 2) {
    fail.push(`admin/admin.js — the approve handler is cleared on ${cleared} other branch(es); it must `
      + `be cleared on every one, or a card for a client with nothing pending still confirms the last `
      + `client's slot.`);
  } else pass.push("the approve handler is cleared on every branch that does not use it");
}

for (const p of pass) console.log(`  ✅ ${p}`);
if (fail.length) {
  console.error(`\n🔴 FAIL — ${fail.length} problem(s): a client's action may not reach the admin.`);
  for (const f of fail) console.error(`   • ${f}`);
  process.exit(1);
}
console.log(`\n✅ a client's pending request reaches the admin's next action from anywhere in the checklist (${pass.length} checks).`);
