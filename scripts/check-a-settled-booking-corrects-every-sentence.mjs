// check-a-settled-booking-corrects-every-sentence.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴🔴 WHY THIS EXISTS (2026-09-28)
//
// Chris, on a card whose pill read DONE and whose booking read "Confirmed":
//   "i asked you to update this and you still have not?"
// Under it: **CHOOSE A DATE AND TIME**, and "You are done when you tell us below — we cannot detect
// this one, so the step waits until you do."
//
// Both sentences WERE gated on `settled || _kickoffMine.get(clientId) === "booked"`, and the gate
// could never fire: the step list renders BEFORE the kickoff fetch resolves, so the map is empty and
// `undefined !== "booked"`. An ABSENCE was read as the value "not booked".
//
// 🔑 The correction happens in `markKickoffWaitingOnRga`, in place. So the only honest check is to
// RUN it against a DOM and read what it changed. A grep for the selectors proves nothing: the pill
// correction shipped with `.pm-step-instructions` and then `.how-lede`, both of which matched
// nothing, and both of which a grep would have called present.
// → feedback_a_gate_that_it_exists_is_not_a_gate_that_it_works · feedback_unloaded_is_not_an_answer
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const JS = path.join(SITE, "portal", "portal.js");
const CSS = path.join(SITE, "portal", "portal.css");

const pass = [], fail = [], indet = [];

if (!fs.existsSync(JS)) { console.error("⚠️  INDETERMINATE — portal.js not found."); process.exit(2); }
const code = fs.readFileSync(JS, "utf8");

// ── Extract the function under test, with its one module-level dependency. ──────────────────────
const fnAt = code.indexOf("function markKickoffWaitingOnRga(");
if (fnAt < 0) {
  console.error("🔴 FAIL — markKickoffWaitingOnRga() is gone; nothing corrects a settled booking in place.");
  process.exit(1);
}
let i = code.indexOf("{", fnAt), depth = 0, end = -1;
for (let j = i; j < code.length; j++) {
  if (code[j] === "{") depth++;
  else if (code[j] === "}") { depth--; if (!depth) { end = j + 1; break; } }
}
const fnSrc = code.slice(fnAt, end);

// ── A DOM small enough to read, shaped like the real card. ──────────────────────────────────────
function makeEl(cls, text) {
  return {
    className: cls, textContent: text, hidden: false, dataset: {},
    classList: {
      contains: (c) => (`${cls}`).split(/\s+/).includes(c),
      toggle() {},
    },
  };
}
function buildDom() {
  const pill = makeEl("pm-pill you", "Your turn");
  const lede = makeEl("pm-ask", "Pick a 30-minute slot below.");
  const doitH = makeEl("pm-doit-h", "Choose a date and time");
  const knowDone = makeEl("pm-knowdone", "You are done when …");
  const row = {
    classList: { toggle() {}, contains: () => false },
    querySelector: (sel) => {
      if (sel.includes("pm-pill")) return pill;
      if (sel.includes("pm-ask") || sel.includes("how-lede")) return lede;
      if (sel.includes("pm-doit-h")) return doitH;
      if (sel.includes("pm-knowdone")) return knowDone;
      return null;
    },
  };
  return { pill, lede, doitH, knowDone, row };
}

function run(status) {
  const dom = buildDom();
  const sandbox = {
    _kickoffMine: new Map(status ? [["c1", status]] : []),
    // 🔑 The corrector gained a third state on 2026-09-29 — "we could not load" — and without this
    // stub it threw, turning this gate INDETERMINATE, which reads as "not checked". Empty on purpose:
    // this gate is about what a KNOWN booking corrects; the unknown case has its own gate
    // (check-a-failed-load-never-says-you-have-not-booked).
    // → feedback_unloaded_is_not_an_answer
    _kickoffUnknown: new Set(),
    // 🔑 The corrector now also reads the call's own facts (start, length, recap) to decide the
    // lede's tense. A missing stub makes this gate INDETERMINATE, which reads like "not checked"
    // — so it is stubbed with an upcoming call, the case this gate is actually about.
    _kickoffWhen: new Map([["c1", { startMs: Date.now() + 3600000, mins: 30, recapSentAt: null }]]),
    // 🔑 The corrector now also refreshes the next-step headline, because the card and the headline
    // are driven by one booking fact. Stubbed so this gate tests the CARD, not the page around it.
    refreshNextStepCards: () => {},
    // 🔑 The picker's "way out" (2026-10-01) — the set of clients mid-pick, so a reopened picker can
    // be closed without changing the time. Empty on purpose: this gate is about a SETTLED booking.
    _kickoffPicking: new Set(),
    document: { querySelector: () => ({ closest: () => dom.row }) },
  };
  vm.createContext(sandbox);
  vm.runInContext(`${fnSrc}\nmarkKickoffWaitingOnRga("c1");`, sandbox, { timeout: 4000 });
  return dom;
}

// ── 1. A CONFIRMED BOOKING SETTLES EVERY SENTENCE ON THE CARD ───────────────────────────────────
let booked;
try { booked = run("booked"); }
catch (e) {
  // 🔴🔴 A MISSING STUB IS OUR BUG, NOT AN ENVIRONMENT LIMIT. Every time the corrector gained a
  // symbol — _kickoffUnknown, _kickoffWhen, refreshNextStepCards, _kickoffPicking — this gate threw
  // and exited 2, which reads as "could not check" and gets scrolled past. It then protected
  // NOTHING, while the defect class it exists for ("You are done when…" surviving a confirmed
  // booking) is one Chris has hit three times. A ReferenceError means ADD ONE LINE to the sandbox,
  // so it is a FAILURE and it names the symbol. Exit 2 stays for a genuinely unreadable source.
  // → feedback_a_gate_that_cannot_fail · feedback_a_line_that_must_never_appear_cannot_be_gated
  if (e instanceof ReferenceError || /is not defined/.test(e.message)) {
    const sym = (e.message.match(/(\w+) is not defined/) || [])[1] || "a symbol";
    console.error(`🔴 THIS GATE COULD NOT RUN, AND THAT IS A DEFECT IN THE GATE, NOT THE PRODUCT.`);
    console.error(`   markKickoffWaitingOnRga now reads \`${sym}\`, which the sandbox does not stub.`);
    console.error(`   Add \`${sym}\` to the sandbox in run() — stubbed for a SETTLED booking — and re-run.`);
    console.error(`   Until then nothing is checking that a confirmed booking settles every sentence.`);
    process.exit(1);
  }
  console.error(`⚠️  INDETERMINATE — could not execute the correction: ${e.message}`);
  process.exit(2);
}

const SURFACES = [
  ["the pill", () => booked.pill.textContent === "Done", () => `pill reads "${booked.pill.textContent}"`],
  ["the lede", () => /booked/i.test(booked.lede.textContent), () => `lede reads "${booked.lede.textContent}"`],
  ["the control heading", () => !/choose a date/i.test(booked.doitH.textContent),
    () => `heading still reads "${booked.doitH.textContent}" — it is telling them to pick a time they have picked`],
  // 🔑 The done-when strip used to be checked here. Chris DELETED it on 2026-09-29 — "i never want
  // to see this again" — so there is no longer a sentence to settle. Its absence is enforced by
  // check-the-done-when-line-is-gone.mjs, which bans the producer outright rather than gating it.
];
for (const [what, ok, why] of SURFACES) {
  if (ok()) pass.push(`a confirmed booking settles ${what}`);
  else fail.push(`portal/portal.js — a CONFIRMED booking does not settle ${what}: ${why()}`);
}

// ── 2. AND A CLIENT WITH NO HOLD AT ALL IS STILL ASKED ─────────────────────────────────────────
// 🔴🔴 THIS CHECK USED TO ASSERT THE OPPOSITE, AND IT WAS WRONG (corrected 2026-09-29). It read
// "a REQUESTED booking hides the done-when line; the client is still waiting and needs it" — written
// when `requested` was assumed to mean *we are still waiting on them*. It does not: a requested hold
// is a time THEY HAVE ALREADY CHOSEN, sitting with us to confirm. Telling them "the step waits until
// you do" is then false, and the pill beside it already says RGA IS DOING IT.
//
// 🔑 The state that still needs asking is NO HOLD AT ALL. That is what this now tests — the real
// other direction. A gate that encodes a wrong assumption defends the defect.
// → feedback_a_client_message_must_agree_with_itself
try {
  const none = run(null);
  if (!/choose a date/i.test(none.doitH.textContent)) fail.push(`portal/portal.js — a client with NO booking sees the heading "${none.doitH.textContent}"; they still have to pick.`);
  else pass.push("a client with no booking is still asked to choose");
} catch (e) { indet.push(`could not execute the no-booking case: ${e.message}`); }

// ── 3. THE HIDE MUST ACTUALLY HIDE ─────────────────────────────────────────────────────────────
// 🔴 `.pm-knowdone{display:block}` is an AUTHOR rule and beats the UA's `[hidden]{display:none}`,
// so `el.hidden = true` alone is a silent no-op that looks exactly like a shipped fix.
if (!fs.existsSync(CSS)) indet.push("portal.css not found; cannot verify the hide takes effect");
else {
  const css = fs.readFileSync(CSS, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  if (/\.pm-knowdone\[hidden\]\s*\{[^}]*display\s*:\s*none/.test(css)) pass.push("`hidden` on the done-when block actually hides it");
  else fail.push("portal/portal.css — `.pm-knowdone` sets `display:block` with no `[hidden]` rule, so hiding it does nothing.");
}

// ── 4. A REQUESTED HOLD IS SETTLED TOO — ONE VOCABULARY ACROSS THE CARD ────────────────────────
// 🔴🔴 Chris, 2026-09-29: "lets get the lingo the same." The pill read RGA IS DOING IT and the
// booking read "Requested · Tue 29 Sep, 10:00 AM", while the lede above still said "Pick a
// 30-minute slot below", the heading still said "Choose a date and time", and the done-when line
// still said "the step waits until you do" — of a step waiting on US. Every one of those was gated
// on the hold being BOOKED, and a reschedule leaves it REQUESTED.
{
  const req = run("requested");
  if (!/confirming/i.test(req.lede.textContent))
    fail.push("portal/portal.js — with a time requested, the lede still gives the booking instruction, contradicting the pill beside it.");
  else pass.push("a requested hold gets its own lede, not the booking instruction");
  // 🔑 The third and last check of the done-when strip. Deleted with the strip itself (09-29).
  // 🔴 And the heading must not still be asking them to choose.
  // 🔴 SCOPED TO THE DECLARATION. Testing the whole file for `_kickoffMine.has(clientId)` passed even
  // when the HEADING was reverted, because another surface uses the same call. Read the declaration.
  // → feedback_an_inventory_is_a_claim_about_what_i_thought_to_grep
  const bs = code.match(/const bookingSettled = [^;]*;/);
  if (!bs)
    fail.push("portal/portal.js — bookingSettled is gone; the control heading cannot know the booking is settled.");
  else if (!/_kickoffMine\.has\(/.test(bs[0]))
    fail.push('portal/portal.js — the control heading is settled only by a BOOKED hold, so a rescheduled client is told to "Choose a date and time" over the time they just chose.');
  else pass.push("any hold settles the control heading");
}

// ── 5. EVERY SENTENCE READS ONE DECISION, NOT ITS OWN COPY OF THE CONDITION ────────────────────
// 🔴🔴 Three separate `state.cls === "done"` tests lived in this corrector, and when the
// "RGA is confirming" state arrived I updated TWO of them. The third — the control heading — went
// on saying "Choose a date and time" over a time the client had already picked.
// 🔑 Three copies of a condition is three chances to update two. One boolean, declared once.
{
  const i = code.indexOf("function markKickoffWaitingOnRga");
  const body = i < 0 ? "" : code.slice(i, code.indexOf("\n}", i));
  if (!body) fail.push("portal/portal.js — markKickoffWaitingOnRga() is gone.");
  else {
    if (!/const clientHasChosen = /.test(body))
      fail.push("portal/portal.js — the card's sentences do not share one settled decision, so they can drift apart state by state.");
    else pass.push("every sentence on the card reads one shared decision");
    // 🔴 And no SENTENCE may keep its own private copy of the test.
    // 🔑 Counted precisely: comments are stripped (this gate's own rationale quotes the test), the
    // declaration of the shared boolean is excluded, and `is-kickoff-booked` is left alone — that
    // CSS class asks a genuinely different question (BOOKED, not merely chosen).
    // → feedback_a_check_must_not_validate_itself
    const live = body
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      .split("\n")
      .filter((l) => !/const clientHasChosen/.test(l) && !/is-kickoff-booked/.test(l))
      .join("\n");
    const copies = (live.match(/state\.cls === "done"/g) || []).length;
    if (copies)
      fail.push(`portal/portal.js — ${copies} sentence(s) keep a private copy of the settled test instead of reading clientHasChosen; adding a state will update some and miss others.`);
    else pass.push("no sentence keeps a private copy of the settled test");
  }
  // 🔑 And it must actually settle all three, proven by running it.
  const req = run("requested");
  if (/choose a date/i.test(req.doitH.textContent))
    fail.push('portal/portal.js — with a time requested the heading still says "Choose a date and time" over the time they just picked.');
  else pass.push("a requested hold settles the control heading");
}

for (const p of pass) console.log(`  ✅ ${p}`);
for (const d of indet) console.log(`  ▫️  ${d}`);
if (fail.length) {
  console.error(`\n🔴 FAIL — ${fail.length} sentence(s) on a settled booking still ask for something:`);
  for (const f of fail) console.error(`   • ${f}`);
  process.exit(1);
}
if (indet.length && !pass.length) process.exit(2);
console.log(`\n✅ a confirmed booking settles every sentence on the card (${pass.length} checks).`);
