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

// 1 ─ 🔴 A CONFIRMED CALL MUST BE ITS OWN STATE. This is the whole defect: `event_id` existing has
//     to be handled BEFORE the fallback, or it drops into the reassurance copy.
if (!/event_id/.test(branch)) {
  fail.push("the branch never reads event_id — a confirmed call cannot be distinguished from no call at all, "
    + "so a booked kickoff falls through to \"Your foundation is being built\"");
}
{
  const iBooked = branch.search(/const booked\s*=|if \(booked\)/);
  const iFallback = branch.indexOf("foundation is being built");
  if (iBooked === -1) {
    fail.push("there is no `booked` state — the approved ladder puts a dated commitment first");
  } else if (iFallback !== -1 && iBooked > iFallback) {
    fail.push("the booked state is evaluated AFTER the reassurance copy — the fallback wins and the call is never named");
  }
}

// 2 ─ the dated state carries the DATE and the NEXT UP eyebrow
{
  const b = branch.slice(branch.search(/if \(booked\)/) >>> 0, branch.indexOf("if (requested)") >>> 0);
  if (!/eyebrow:\s*["']Next up["']/i.test(b)) {
    fail.push('the booked state does not set the "Next up" eyebrow — a scheduled call is not a step the client performs, '
      + 'and "Your next step" over a dated event is the label/content mismatch this replaced');
  }
  if (!/toLocaleString|\bwhen\(/.test(b)) {
    fail.push("the booked state does not render the date — naming the call without saying when is the same non-answer as the old copy");
  }
}

// 3 ─ 🔴 "YOU'RE ALL SET" ONLY ON A SEEN ACCEPTANCE. Done means accepted, not sent.
if (/all set/i.test(branch) && !/rsvp\s*===\s*["']accepted["']/.test(branch)) {
  fail.push('the card can say "you\'re all set" without checking rsvp === "accepted" — that claims a booking from the fact we SENT an invite, '
    + "which is the exact failure the kickoff flow exists to prevent");
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

if (fail.length) {
  console.log(`\n🔴 ${fail.length} problem(s):`);
  for (const f of fail) console.log(`    ${f}`);
  console.log("\n   Ladder: dated commitment → their open action → reassurance. The eyebrow names which.");
  process.exit(1);
}
console.log("  booked state first · dated + NEXT UP · \"all set\" gated on a seen acceptance · requested names the time");
console.log("  eyebrow driven by state · owed line hidden until known · every card updated, not the first");
console.log("\n✅ the next-step card names the soonest concrete thing.");
process.exit(0);
