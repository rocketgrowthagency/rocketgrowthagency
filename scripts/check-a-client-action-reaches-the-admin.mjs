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

for (const p of pass) console.log(`  ✅ ${p}`);
if (fail.length) {
  console.error(`\n🔴 FAIL — ${fail.length} problem(s): a client's action may not reach the admin.`);
  for (const f of fail) console.error(`   • ${f}`);
  process.exit(1);
}
console.log(`\n✅ a client's pending request reaches the admin's next action from anywhere in the checklist (${pass.length} checks).`);
