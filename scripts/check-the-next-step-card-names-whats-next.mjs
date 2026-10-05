#!/usr/bin/env node
/**
 * check-the-next-step-card-names-whats-next.mjs — the card must name the soonest concrete thing.
 *
 * ─── WHY ─────────────────────────────────────────────────────────────────────────────────────────
 * Chris, 2026-09-26: *"i think this should say Next Up waiting for kickoff call. thats first step."*
 *
 * All three kickoff branches tested for the call being ARRANGED — not picked, or picked-and-waiting.
 * The moment RGA confirmed it, `event_id` existed and the card fell THROUGH every one of them into
 * the last-resort copy, *"Your foundation is being built."* A booked call four days out was invisible
 * on the one card whose job is to say what is next — under an eyebrow promising YOUR NEXT STEP while
 * the body described what WE were doing, undated and unactionable.
 *
 * The approved ladder (reports/mockups/next_step_card_v1.html), in priority order:
 *   1 booked          → NEXT UP + the date          4 nothing dated, items owed → their next action
 *   2 requested       → names the time they picked  5 nothing owed → reassurance, LAST
 *   3 nothing yet     → pick a time
 *
 * Exit 0 = the ladder holds · 1 = a state can fall through · 2 = cannot tell.
 */
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const P = path.join(SITE, "portal/portal.js");
if (!fs.existsSync(P)) { console.log(`  ⚠️  ${P} missing — cannot judge.`); process.exit(2); }
const raw = fs.readFileSync(P, "utf8");
if (raw.length < 100000) { console.log(`  ⚠️  portal.js is only ${raw.length} bytes — cannot judge.`); process.exit(2); }
const src = raw.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const fail = [];
console.log("── the next-step card names what is actually next ──");

// 🔴 THE BRANCH, NOT THE FIRST MENTION OF THE NAME. `stage_4_onboarding:` also labels an entry in
// the stage-bar map ~270 lines earlier, so a bare indexOf sliced a completely different object and
// every check below failed against code that was never the target. Fourth time in one day that a
// check anchored on the first occurrence of a name rather than the one it meant.
// → feedback_position_is_not_identity · feedback_a_gate_window_measured_in_characters_will_lie
const i = src.indexOf("stage_4_onboarding: (() =>");
if (i === -1) { console.log("  ⚠️  the stage_4_onboarding action branch is gone — cannot judge."); process.exit(2); }
const branch = src.slice(i, src.indexOf("})(),", i));
if (!/const booked/.test(branch)) {
  console.log("  ⚠️  sliced a branch with no kickoff logic in it — the anchor is wrong, not the code.");
  process.exit(2);
}

// 1 ─ 🔴 A CONFIRMED CALL MUST BE ITS OWN STATE. This is the whole defect: a confirmed booking has
//     to be handled BEFORE the fallback, or it drops into the reassurance copy.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 RE-PINNED 2026-10-05 — THIS WENT RED ON A CORRECT CHANGE. It tested for the literal string
// `event_id` inside this branch. The branch was tightened so the kickoff state is resolved by
// `kickoffFacts`, which reads the holds LEDGER first and the `event_id` stamp only as a fallback —
// strictly more correct, because the stamp is a best-effort write that is allowed to fail. The
// `event_id` read moved one function along and the gate called it a deletion.
//
// 🔑 THE PROPERTY IS "A CONFIRMED CALL IS DISTINGUISHABLE FROM NO CALL", not the name of the column
// it is distinguished by. Accept either: the branch reads the stamp itself, OR it resolves a booked
// instant through the facts resolver.
// → feedback_a_gate_must_pin_the_property_not_the_spelling · feedback_a_gate_written_for_a_temporary_state_outlives_it
// ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  const readsStamp = /event_id/.test(branch);
  const resolvesBooked = /kickoffFacts\s*\(/.test(branch) && /\bbookedIso\b/.test(branch);
  if (!readsStamp && !resolvesBooked) {
    fail.push("the branch cannot tell a confirmed call from no call at all — it neither reads the "
      + "event_id stamp nor resolves a booked instant through kickoffFacts, so a booked kickoff "
      + "falls through to \"Your foundation is being built\"");
  }
  // 🔴 And wherever it is resolved, a BOOKED instant must actually reach kickoffPhase — a resolver
  // that is called and whose answer is never used is the defect this gate exists for.
  if (resolvesBooked && !/bookedIso:\s*facts\.bookedIso/.test(branch)) {
    fail.push("kickoffFacts is called but its booked instant is never passed to kickoffPhase");
  }
}
{
  // 🔴 `if \(booked\)` was a SPELLING. The branch was correctly tightened to `if (booked && !callOver)`
  // — so that a call in the past stops being "Next up" — and this gate read the tightening as the
  // branch having been deleted. → feedback_a_gate_must_pin_the_property_not_the_spelling
  const iBooked = branch.search(/const booked\s*=|if \(booked\b/);
  const iFallback = branch.indexOf("foundation is being built");
  if (iBooked === -1) {
    fail.push("there is no `booked` state — the approved ladder puts a dated commitment first");
  } else if (iFallback !== -1 && iBooked > iFallback) {
    fail.push("the booked state is evaluated AFTER the reassurance copy — the fallback wins and the call is never named");
  }
}

// 2 ─ the dated state carries the DATE and the NEXT UP eyebrow
{
  // 🔴 TWO MORE SPELLINGS, AND A MISS THAT LOOKED LIKE A SLICE. Both anchors were the exact text
  // `if (booked)` / `if (requested)`, which stopped matching when the branches were tightened to
  // `if (booked && !callOver)`. And `-1 >>> 0` is 4294967295, so a failed search produced an EMPTY
  // window rather than an error — every check below then failed against nothing at all.
  // 🔑 Anchor on the identifier, and refuse to judge an empty window.
  // → feedback_a_gate_must_pin_the_property_not_the_spelling · feedback_unloaded_is_not_an_answer
  const iStart = branch.search(/if \(booked\b/);
  const iEnd = branch.search(/if \(requested\b/);
  if (iStart === -1 || iEnd === -1 || iEnd <= iStart) {
    console.log("  ⚠️  could not isolate the booked state between its own branch and the next one.");
    process.exit(2);
  }
  const b = branch.slice(iStart, iEnd);
  if (!/eyebrow:\s*["']Next up["']/i.test(b)) {
    fail.push('the booked state does not set the "Next up" eyebrow — a scheduled call is not a step the client performs, '
      + 'and "Your next step" over a dated event is the label/content mismatch this replaced');
  }
  if (!/toLocaleString|\bwhen\(/.test(b)) {
    fail.push("the booked state does not render the date — naming the call without saying when is the same non-answer as the old copy");
  }
}

// 3 ─ 🔴🔴 INVERTED 2026-09-29. This used to demand the OPPOSITE: that "you're all set" be gated on
// `rsvp === "accepted"`. Chris: *"RGA side doesnt wait on client to accept invite. the sequence is
// this. client picks date and time. then its RGA side, they then confrim it. Then its BOOKED."*
// Reaching the booked branch means RGA confirmed, so the client owes nothing and withholding the
// reassurance until they clicked Yes in Gmail asked them for something they had already done.
//
// 🔑 A second gate had quietly pinned the same misreading, and it went red on the correct fix — which
// is what a gate written from a slogan rather than from the requirement does.
// → project_kickoff_meeting_lifecycle · feedback_do_what_chris_asked_not_the_principled_version
if (/rsvp\s*===\s*["']accepted["']\s*\n?\s*\?/.test(branch)) {
  fail.push('the booked state gates its copy on rsvp === "accepted" again — RGA confirming is what '
    + "books the call, so the client's RSVP must not decide what the card says");
} else if (!/all set/i.test(branch)) {
  fail.push('the booked state never tells the client they are all set — a confirmed call that reads '
    + "like an outstanding task is the defect this branch exists to remove");
}

// 4 ─ the requested state must name the time it is holding
{
  const r = branch.indexOf("if (requested)");
  if (r !== -1) {
    const rb = branch.slice(r, r + 700);
    if (!/\$\{at\}|requested_start/.test(rb)) {
      fail.push('the "we have your kickoff time" state does not name the time — the client has to go and check we got it right');
    }
  }
}

// 5 ─ the eyebrow must be driven by the state, not hardcoded
if (/<div class="eyebrow">Your next step<\/div>/.test(src)) {
  fail.push("the eyebrow is hardcoded to \"Your next step\" — it cannot say NEXT UP for a dated commitment");
}

// 6 ─ the owed line must exist AND stay hidden until something knows the count
{
  if (!/data-nextstep-owed/.test(src)) {
    fail.push("the card has no owed line — the count of what the client still needs to do has nowhere to render");
  } else if (!/data-nextstep-owed[^>]*\shidden/.test(src)) {
    fail.push("the owed line is not hidden by default — the card cannot compute the count synchronously, so it would render an empty or wrong number");
  }
  if (!/querySelectorAll\(["']\.pm-nextstep["']\)/.test(src)) {
    fail.push("the checklist updates at most one .pm-nextstep — the Dashboard and Setup each render one, so a querySelector would leave the other stale");
  }
}

// 7 ─ 🔴 THE OWED LINE MUST NOT INVENT A DEADLINE.
//     I shipped "N other things still need you BEFORE THEN" beside the kickoff date. The open list
//     includes "Attend Month 1 close-out call" and "Send review requests to 5 past customers" —
//     end-of-month work, not pre-kickoff. The call's own copy says nothing needs preparing. Counting
//     what is open is a fact; saying when it is due is a claim, and that one was false.
//     → feedback_we_never_promise_what_we_dont_do · feedback_a_client_message_must_agree_with_itself
// 🔑 A plain substring, not a clever one. My first pattern was
// /still need[^`"']{0,20}you before then/ — and the gap between "need" and "you" is
// `${mine.length === 1 ? "s" : ""} `, which contains the very quote characters the class excluded.
// It matched nothing and the mutation sailed through. → feedback_a_gate_that_cannot_fail
if (/you before then/i.test(src)) {
  fail.push('the owed line says items are needed "before then" — the open list includes month-end work with no such deadline, '
    + "and the kickoff call itself needs nothing prepared. Count what is open; do not invent when it is due");
}

// 8 ─ 🔴 THE COUNT MUST NOT INCLUDE WHAT THE CLIENT IS WAITING ON US FOR.
//     The card said "10 other things still need you" while four of those rows carried a
//     clientWaitingNote saying the opposite on the same screen — "We'll book this with you at the
//     end of month 1", "We are building your keyword plan", "We check this with Google directly".
//     Two messages, one page, contradicting, with the number doing the shouting.
//     🔑 Counted on the SAME field the row renders, so the number and the row cannot disagree.
//     → feedback_a_client_message_must_agree_with_itself
if (!/clientWaitingNote/.test(src.slice(src.indexOf("const mine = open.filter"), src.indexOf("const mine = open.filter") + 400))) {
  fail.push("the owed count does not exclude items carrying a clientWaitingNote — those rows tell the client WE are handling it, "
    + "so counting them as \"still needs you\" contradicts the row's own text on the same screen");
}

// ── ONE KIND, ONE EYEBROW ───────────────────────────────────────────────────────────────────────
// 🔴🔴 2026-09-29. Chris asked whether every card follows next_step_card_v1. Six of seven states did.
// The seventh — "Waiting on Rocket Growth Agency", shown once every Google service is connected —
// rendered the DEFAULT eyebrow, **YOUR NEXT STEP**, directly above *"nothing more is needed from you
// right now"*. That is the precise mismatch the mockup was written to remove ("the eyebrow promises
// their step and the body gives ours"), surviving in the one state nobody re-read. The correct
// eyebrow already existed two branches below, on the kickoff's identical situation.
//
// 🔑 PIN THE NARROW PROPERTY, NOT "no card may say YOUR NEXT STEP over calm copy". The last-resort
// card — "Your foundation is being built … Nothing needs you right now" — is APPROVED with YOUR NEXT
// STEP in the mockup's own ladder table, so the broad rule would go red on Chris's own decision.
// The property that is actually true: **a state that declares RGA is the actor names itself as one.**
// → feedback_a_gate_must_pin_the_property_not_the_spelling · feedback_a_message_needs_a_shape
{
  // 🔴 `branch` is the KICKOFF sub-branch only — 3 states. The card's whole ladder spans the
  // `stage_3_setup` branch too, and the state this check exists for lives THERE. Slicing the wrong
  // region made the check print a warning and pass, which is a gate that cannot fail.
  // → feedback_a_gate_that_cannot_fail · feedback_position_is_not_identity
  const ladderFrom = src.indexOf("stage_3_setup: (function () {");
  const ladderTo = src.indexOf("const action = ACTIONS[stage];");
  const ladder = (ladderFrom !== -1 && ladderTo > ladderFrom) ? src.slice(ladderFrom, ladderTo) : "";
  const states = [...ladder.matchAll(/return \{([\s\S]*?)\n\s*\};/g)].map((m) => m[1]);
  if (states.length < 6) {
    fail.push(`only ${states.length} ladder states parsed from the card builder (expected 6+). Either the `
      + `ladder was restructured or this check is slicing the wrong region — and a check that cannot `
      + `see the states cannot judge them, so it fails rather than reassuring`);
  } else {
    const waiting = states.filter((b) => /title:\s*["'`]Waiting on/.test(b));
    if (!waiting.length) {
      fail.push('no ladder state has a "Waiting on …" headline any more — either the state is gone, or '
        + "it has been renamed and this check has stopped watching anything");
    }
    for (const b of waiting) {
      const t = (b.match(/title:\s*["'`]([^"'`]+)/) || [])[1] || "?";
      if (!/eyebrow:\s*["'`]Waiting on RGA["'`]/.test(b)) {
        const eye = (b.match(/eyebrow:\s*["'`]([^"'`]+)/) || [])[1] || "the default, YOUR NEXT STEP";
        fail.push(`the state headed "${t}" carries the eyebrow "${eye}". A card whose body says the ball `
          + `is with RGA must not be labelled as a step the client takes — the kickoff branch already `
          + `says "Waiting on RGA" for the same kind, and two labels for one kind is the defect`);
      }
    }
    if (waiting.length && !fail.length) {
      console.log(`  ${waiting.length} "waiting on RGA" state(s) · each labelled as one, not as the client's step`);
    }
  }
}

if (fail.length) {
  console.log(`\n🔴 ${fail.length} problem(s):`);
  for (const f of fail) console.log(`    ${f}`);
  console.log("\n   Ladder: dated commitment → their open action → reassurance. The eyebrow names which.");
  process.exit(1);
}
console.log("  booked state first · dated + NEXT UP · \"all set\" once RGA has confirmed · requested names the time");
console.log("  eyebrow driven by state · owed line hidden until known · every card updated, not the first");
console.log("\n✅ the next-step card names the soonest concrete thing.");
process.exit(0);
