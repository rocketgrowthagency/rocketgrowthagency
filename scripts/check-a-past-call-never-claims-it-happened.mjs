// check-a-past-call-never-claims-it-happened.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔒 Approved 2026-09-29 — reports/mockups/client_call_after_the_time_v1.html
//
// 🔴🔴 NOTHING IN THE PRODUCT OBSERVES WHETHER THE KICKOFF CALL HAPPENED. The clock only knows the
// time passed. The morning after a missed call the portal still offered "Join the video call",
// "Change the time" and "Can't make it", under a banner reading NEXT UP.
//
// The rule this pins: the ONLY state that may say the call took place is the one backed by
// `recapSentAt` — a recap sent from the call console by a person who was there. Every other
// after-the-time state may state the time passed and nothing more.
//
// 🔑 IT RENDERS THE CARD. Every defect in this feature this week was a value computed and never
// read, or read before it was filled — none of which a scan of the source can see.
// → feedback_verification_gates_must_be_strict · feedback_a_gate_that_it_exists_is_not_a_gate_that_it_works
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const JS = path.join(SITE, "portal", "portal.js");
const pass = [], fail = [];

if (!fs.existsSync(JS)) { console.error("⚠️  INDETERMINATE — portal.js not found."); process.exit(2); }
const code = fs.readFileSync(JS, "utf8");

const fn = code.match(/function kickoffRequestedHtml\([\s\S]*?\n\}/);
if (!fn) { console.error("🔴 FAIL — kickoffRequestedHtml() is gone; the client sees nothing about their call."); process.exit(1); }

const box = {
  escapeHtml: (x) => String(x == null ? "" : x),
  escapeAttribute: (x) => String(x == null ? "" : x),
  clientReadingZone: () => "America/Los_Angeles",
  Date, Math, Number, String, Boolean, console,
};
vm.createContext(box);
// 🔑 The card now reads the SHARED definition, so the harness must load it too — otherwise this
// gate reports the structural fix as a crash.
const phaseFn = code.match(/function kickoffPhase\(\{[\s\S]*?\n\}/);
if (!phaseFn) { console.error("🔴 FAIL — kickoffPhase() is gone; every surface derives the kickoff's state for itself again."); process.exit(1); }
try { vm.runInContext(`${phaseFn[0]}\n${fn[0]}\nglobalThis.__r = kickoffRequestedHtml;`, box, { timeout: 4000 }); }
catch (e) { console.error(`⚠️  INDETERMINATE — could not execute the renderer: ${e.message}`); process.exit(2); }

const MIN = 60000;
// (minutesFromStart, recapSentAt) → html
const render = (mins, recap) =>
  box.__r(new Date(Date.now() - mins * MIN).toISOString(), "America/Los_Angeles", "booked", "c1",
          "https://meet.google.com/abc-defg-hij", recap || null, 30);

// ── 1. AHEAD OF TIME — unchanged, and Join only when it is near ────────────────────────────────
const early = render(-120);            // two hours before
if (/pm-join/.test(early)) fail.push("portal/portal.js — the Join link shows two hours early; it leads to an empty room.");
else pass.push("two hours ahead there is no Join link");
if (!/Confirmed/.test(early)) fail.push("portal/portal.js — an upcoming confirmed call no longer reads Confirmed.");
else pass.push("ahead of time it reads Confirmed");

const near = render(-5);               // five minutes before
if (!/pm-join/.test(near)) fail.push("portal/portal.js — five minutes before the call there is no way in.");
else pass.push("five minutes before, the Join link is there");

const during = render(10);
if (!/pm-join/.test(during)) fail.push("portal/portal.js — during the call there is no Join link.");
else pass.push("during the call the Join link is there");

// ── 2. ONCE IT HAS ENDED, WITH NO RECAP — STATE THE FACT AND NOTHING MORE ──────────────────────
const after = render(90);              // an hour after a 30-minute call
if (/pm-join/.test(after)) fail.push("portal/portal.js — the Join link survives the end of the call; it points at a room nobody is in.");
else pass.push("after the call, the Join link is gone");
if (/data-kickoff-release/.test(after)) fail.push('portal/portal.js — "Can\'t make it" is still offered for a call that already happened.');
else pass.push("a finished call cannot be declined");
for (const claim of ["Done", "finished", "Thanks for your time"]) {
  if (new RegExp(claim, "i").test(after))
    fail.push(`portal/portal.js — with no recap sent, the card says "${claim}" — a claim that the call happened, which nothing observed.`);
}
if (!/Time has passed/.test(after)) fail.push("portal/portal.js — after the end time the card does not say the time has passed.");
else pass.push("it states the one thing we can prove: the time has passed");
// 🔴 They may well have attended. Telling them they missed it is a claim too.
if (/you missed it/i.test(after) && !/If you missed it/i.test(after))
  fail.push("portal/portal.js — the card asserts they missed the call, which nothing observed.");
else pass.push("it never asserts they missed it");
if (!/data-kickoff-change/.test(after)) fail.push("portal/portal.js — after a missed call there is no way to book another time.");
else pass.push("there is one control, and it is the useful one");

// ── 3. WITH A RECAP — AND ONLY THEN — IT MAY SAY THE CALL HAPPENED ─────────────────────────────
const held = render(90, new Date().toISOString());
if (!/Done/.test(held)) fail.push("portal/portal.js — with a recap sent, the card still does not report the call as done.");
else pass.push("a recap makes the card report the call as done");
if (!/recap/i.test(held)) fail.push("portal/portal.js — the done state does not mention the recap, which is the evidence for it.");
else pass.push("the done state names its own evidence");
if (/data-kickoff-change|data-kickoff-release|pm-join/.test(held))
  fail.push("portal/portal.js — the done state still carries controls; there is nothing left to do on a finished call.");
else pass.push("a finished call carries no controls");

// ── 4. THE BANNER STOPS CALLING A PAST CALL "NEXT UP" ──────────────────────────────────────────
// 🔴 PINNED A SPELLING, AND THE CONDITION CORRECTLY GREW. It was `booked && !callOver`; it is now
// `booked && !requested && !callOver`, because a booking superseded by a pending request must also
// yield the headline. Match the PROPERTY: the dated branch must require the call to be ahead.
// → feedback_a_gate_must_pin_the_property_not_the_spelling
{
  const dated = code.match(/if \(booked[^)]*\)/);
  if (!dated || !/!callOver/.test(dated[0]))
    fail.push('portal/portal.js — the next-step banner is not gated on the call still being ahead, so it will read "Next up" about yesterday.');
  else pass.push("the banner stops calling a past call next up");
}
// 🔴 THIS PINNED THE SPELLING `requested && !callOver`, and the code moved ON — the branch now
// fires for ANY pending request and distinguishes the lapsed case INSIDE it, which is strictly
// better: a request we never answered is still owed, and dropping it from the headline was the
// defect Chris reported. The property is checked in section 10, against the branch's contents.
// → feedback_a_gate_must_pin_the_property_not_the_spelling
pass.push("the lapsed-hold wording is checked against the branch, not a spelling");

// ── 5. AND THE HEADLINE MUST NOT RE-OFFER THE BOOKING ──────────────────────────────────────────
// 🔴🔴 THE REGRESSION THE FIRST FIX CAUSED. Gating the banner on `!callOver` made it fall through to
// the last-resort copy — which is then replaced by the first OPEN client action, and the kickoff
// step was still in that list. The page read **"Book your kickoff call · Pick a 30-minute slot
// below"** directly above a card saying **DONE · Time has passed**.
// 🔑 The card has treated a `booked` hold as settled since 09-28. The open-actions list must use the
// SAME fact, or the headline and the card can always disagree.
{
  const filter = code.match(/const mine = open\.filter\([\s\S]{0,400}?\);/);
  if (!filter) fail.push("portal/portal.js — the open-actions filter is gone; the headline cannot name the next thing.");
  else if (!/kickoff_booking/.test(filter[0]))
    fail.push("portal/portal.js — the open-actions list does not exclude a settled kickoff, so the headline can tell a client to book a call they have already had.");
  else if (!/_kickoffMine\.get\(clientId\) === "booked"/.test(code))
    fail.push("portal/portal.js — the exclusion is not driven by the same booked fact the card uses, so the two can disagree.");
  else pass.push("a settled kickoff is not offered as the next open action");
}

// ── 6. THE PAST PILL HAS NO INVISIBLE DOT ──────────────────────────────────────────────────────
// 🔴 Every pill kind colours its own dot. The past state had none, so a 7px TRANSPARENT dot and its
// gap sat inside the pill and pushed the text off-centre.
{
  const pill = code.match(/<span class="pm-msg past">([\s\S]{0,80}?)<\/span>/);
  if (!pill) fail.push("portal/portal.js — the time-has-passed pill is gone.");
  else if (/class="dot"/.test(pill[0])) {
    const css = fs.readFileSync(path.join(SITE, "portal", "portal.css"), "utf8");
    if (!/\.pm-msg\.past \.dot\s*\{[^}]*background/.test(css))
      fail.push("portal/portal.js — the time-has-passed pill renders a dot that no CSS colours, so it is an invisible element taking up space inside the pill.");
    else pass.push("the past pill's dot is actually visible");
  } else pass.push("the past pill carries no dot, so its text is not pushed off-centre");
}

// ── 7. THE LEDE ABOVE THE CARD SAYS THE SAME THING THE CARD DOES ───────────────────────────────
// 🔴 It read "Your kickoff call is booked. The calendar invite is in your inbox — accept it so it
// shows on your calendar" the morning AFTER the call: present tense, and an instruction to accept
// an invite for a meeting that had been and gone, directly above "Time has passed".
{
  const fnLede = code.match(/function markKickoffWaitingOnRga[\s\S]*?\n\}/);
  if (!fnLede) fail.push("portal/portal.js — markKickoffWaitingOnRga() is gone; nothing corrects the step in place.");
  else {
    // 🔴 A DECLARATION IS NOT A DECISION. This first tested that `callEnded` appeared anywhere in
    // the function — so replacing the lede's condition with `true` left the declaration standing and
    // the check passed. Require the lede's own assignment to branch on it.
    // → feedback_a_gate_must_pin_the_property_not_the_spelling
    // 🔴🔴 AND THIS WAS A CHARACTER WINDOW — `{0,400}` — WRITTEN THE SAME DAY THAT TRAP WAS
    // DOCUMENTED. The assignment is longer than 400 chars, so the gate went red on correct code.
    // Bound it by the SYNTAX (the statement's own semicolon), never by a distance.
    // → feedback_a_gate_window_measured_in_characters_will_lie
    const ledeAssign = fnLede[0].match(/const ledeText = [^;]*;/);
    if (!ledeAssign)
      fail.push("portal/portal.js — the lede's text is no longer chosen in one place, so its states cannot be checked.");
    else if (!/callEnded/.test(ledeAssign[0]))
      fail.push("portal/portal.js — the lede's wording does not branch on whether the call has ended, so it will say the call \"is booked\" after it has happened.");
    else pass.push("the lede's wording branches on whether the call has ended");
    // 🔴 The same evidence rule as the card: only a recap may say it happened.
    const done = fnLede[0].match(/recapSentAt[\s\S]{0,160}/);
    if (!done || !/is done/.test(done[0]))
      fail.push("portal/portal.js — the lede's \"done\" wording is not gated on a recap, so it can claim the call happened from the clock alone.");
    else pass.push("only a recap lets the lede say the call is done");
  }
  // 🔑 Two maps describing one booking must be cleared together, or a cancelled call leaves its
  // time behind and the lede reads a slot that no longer exists.
  const sets = (code.match(/_kickoffMine\.(set|delete)\(/g) || []).length;
  const whens = (code.match(/_kickoffWhen\.(set|delete)\(/g) || []).length;
  if (whens < sets)
    fail.push(`portal/portal.js — the booking status map is written in ${sets} places but the call-facts map in only ${whens}; a cancel can leave a stale time behind.`);
  else pass.push("the booking's status and its facts are written and cleared together");
}

// ── 8. A RESCHEDULE SHOWS THE NEW TIME, AND THE HEADLINE AGREES WITH THE CARD ──────────────────
// 🔴🔴 Chris moved a Sep 28 call to Sep 29 and his portal showed **Sep 28, "Time has passed"**, with
// the new request nowhere — because the endpoint took `order=slot_start.asc&limit=1` and the OLD
// booking sorts first. Above it the headline still read "Book your kickoff call", because it is
// computed from a map the kickoff fetch fills and was never re-run.
{
  const availRaw = fs.readFileSync(path.join(SITE, "netlify", "functions", "kickoff-availability.js"), "utf8");
  // 🔑 Strip comments: the note explaining this very bug quotes the old query, so the raw file always
  // contains it. A gate that reads its own rationale as the defect is no gate at all.
  // → feedback_a_check_must_not_validate_itself
  const avail = availRaw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  if (/order=slot_start\.asc&limit=1/.test(avail))
    fail.push("kickoff-availability.js — the booking is read as the EARLIEST hold, so after a reschedule the client is shown their old time and the new request is invisible.");
  else pass.push("the endpoint does not pick the earliest hold");
  // 🔴 PRESENCE IS NOT PRECEDENCE. This first checked only that "requested" appeared in the
  // expression — and swapping the two so the BOOKING wins still contains it. Check the order.
  // → feedback_a_gate_must_pin_the_property_not_the_spelling
  const yr = avail.match(/yourRequest:[^\n]*/);
  const iReq = yr ? yr[0].indexOf('status === "requested"') : -1;
  const iBook = yr ? yr[0].indexOf('status === "booked"') : -1;
  if (iReq === -1)
    fail.push("kickoff-availability.js — a pending request is never considered, so a reschedule cannot reach the card.");
  else if (iBook !== -1 && iBook < iReq)
    fail.push("kickoff-availability.js — a standing booking outranks a pending request, so a client who rescheduled is shown their OLD time.");
  else pass.push("a pending request outranks a standing booking");
  if (!/movingFrom:/.test(avail))
    fail.push("kickoff-availability.js — the card is never told a reschedule IS a move, so it greets one as a first booking.");
  else pass.push("the card is told when a request is a move");

  // 🔑 The headline and the card are driven by ONE call, or they disagree on screen.
  if (!/function refreshNextStepCards\(\)/.test(code))
    fail.push("portal/portal.js — the next-step headline cannot be re-run, so it keeps its first-paint answer after the kickoff fetch lands.");
  else {
    const mk = code.match(/function markKickoffWaitingOnRga[\s\S]*?\n\}/);
    if (!mk || !/refreshNextStepCards\(\)/.test(mk[0]))
      fail.push("portal/portal.js — correcting the card does not refresh the headline above it, so a DONE card can sit under \"Book your kickoff call\".");
    else pass.push("correcting the card also refreshes the headline");
  }
  // 🔴 A rescheduled client has a `requested` hold, not a booked one. Booking is not their next action.
  if (/kickoffSettled = _kickoffMine\.get\(clientId\) === "booked"/.test(code))
    fail.push("portal/portal.js — only a BOOKED hold settles the kickoff, so a client who rescheduled is told to book it again.");
  else pass.push("any hold, requested or booked, settles the kickoff for the headline");
}

// ── 9. THE HEADLINE PATCH MUST BE ABLE TO CORRECT ITSELF ───────────────────────────────────────
// 🔴🔴 It replaced the headline only while the title still read "foundation is being built" — so the
// FIRST pass (before the kickoff answer landed) wrote "Book your kickoff call", and every re-run
// afterwards failed that same test and left it there, above a card reading RGA IS DOING IT.
// 🔑 A patch that reads the text it wrote last time can only ever be right on its first pass.
{
  const i = code.indexOf("function refreshNextStepCards()");
  if (i < 0) fail.push("portal/portal.js — refreshNextStepCards() is gone; the headline cannot be corrected after the answer lands.");
  else {
    const body = code.slice(i, code.indexOf("\n}\n", i));
    if (!/nsOrigTitle/.test(body))
      fail.push("portal/portal.js — the headline patch does not remember the original copy, so it cannot recompute and its first answer is final.");
    else if (/test\(titleEl\.textContent\)/.test(body))
      fail.push("portal/portal.js — the headline patch still branches on the text it wrote itself, so a re-run cannot correct it.");
    else pass.push("the headline patch recomputes from the original copy");
  }
}

// ── 10. A REQUEST WE NEVER ANSWERED IS STILL OWED ──────────────────────────────────────────────
// 🔴🔴 Chris, 2026-09-29: "should say waiting on RGA to approve kickoff call right?" His headline had
// skipped a kickoff request he was waiting on US to confirm and named his CMS login instead —
// because the branch was gated on `!callOver`, which ALSO dropped it once the requested slot itself
// went by. Two different facts behind one flag.
// 🔑 A pending request is never the client's next action and never nothing. A slot that passes
// unconfirmed does not stop being owed — it becomes MORE owed.
{
  const reqBranch = code.match(/if \(requested\)[\s\S]{0,1800}?\n      \}/);
  if (!reqBranch) {
    if (/if \(requested && !callOver\)/.test(code))
      fail.push("portal/portal.js — a pending kickoff request is dropped from the headline once its slot passes, so a client waiting on RGA is shown their own to-do list instead.");
    else fail.push("portal/portal.js — the pending-request branch of the headline is gone.");
  } else {
    if (!/Waiting on RGA/.test(reqBranch[0]))
      fail.push("portal/portal.js — the headline does not say a pending request is waiting on RGA, so the client cannot tell whose turn it is.");
    else pass.push("a pending request tells the client it is waiting on RGA");
    if (!/callOver/.test(reqBranch[0]))
      fail.push("portal/portal.js — the headline gives the same wording whether the requested slot is ahead or already past.");
    else pass.push("a lapsed request gets its own wording, not \"we're holding it\"");
  }
  // 🔑 And the card must stop promising an invite for a time that has gone.
  const cardFn = code.match(/function kickoffRequestedHtml\([\s\S]*?\n\}/);
  if (cardFn && !/has now passed and we haven/.test(cardFn[0]))
    fail.push("portal/portal.js — the card keeps saying it is holding a requested time after that time has passed.");
  else if (cardFn) pass.push("the card owns a request it never confirmed");
}

// ── 11. BOOKED AND REQUESTED CAN BE TRUE AT ONCE, AND THE REQUEST WINS ─────────────────────────
// 🔴🔴 THE ROOT CAUSE OF A WHOLE MORNING (2026-09-29). `portal-book-kickoff` SPREADS the existing
// invite and adds `requested_start` — it never clears `event_id`. So a reschedule leaves a confirmed
// OLD booking and a pending NEW request on the same record. The headline computed
// `requested = requested_start && !booked`, which is false in exactly that case, so the request
// branch could never run; the old booking's time had passed so its branch was skipped too; and the
// headline fell through to the client's own to-do list.
//
// 🔑 The card (holds table, via kickoff-availability) and the headline (kickoff_invite, on the
// onboarding record) read DIFFERENT RECORDS. They must at least agree on the RULE: a request that
// disagrees with the booking supersedes it.
{
  const i = code.indexOf("stage_4_onboarding: (() => {");
  const branch = i < 0 ? "" : code.slice(i, code.indexOf("\n    })(),", i));
  if (!branch) fail.push("portal/portal.js — the onboarding headline branch is gone.");
  else {
    // 🔑 THE RULE MOVED INTO `kickoffPhase`, WHICH IS THE POINT. Check the property wherever it
    // lives: either the headline derives it itself and must handle a superseding request, or it
    // delegates — and the shared function's own supersession rule is checked below.
    // → feedback_a_gate_must_pin_the_property_not_the_spelling
    const phaseSrc = (code.match(/function kickoffPhase\(\{[\s\S]*?\n\}/) || [""])[0];
    if (/const requested = k\?\.requested_start && !booked;/.test(branch))
      fail.push("portal/portal.js — the headline treats booked and requested as mutually exclusive, so a reschedule (which leaves BOTH on the record) can never reach the request branch.");
    else if (!/movePending/.test(branch) && !/kickoffPhase\(/.test(branch))
      fail.push("portal/portal.js — the headline has no notion of a request that supersedes a standing booking, so a reschedule is invisible to it.");
    else if (/kickoffPhase\(/.test(branch) && !/rTime !== bTime/.test(phaseSrc))
      fail.push("portal/portal.js — the shared definition no longer treats a disagreeing request as superseding the booking, so a reschedule is invisible everywhere at once.");
    else pass.push("a disagreeing request supersedes the booking");
    // 🔴 And the superseded booking must stop claiming to be the dated commitment.
    if (!/if \(booked && !requested && !callOver\)/.test(branch))
      fail.push("portal/portal.js — a booking that has been superseded by a pending request still claims the headline as a dated commitment.");
    else pass.push("a superseded booking yields the headline to the request");
    // 🔑 And the clock must measure whichever time is currently authoritative.
    const cs = branch.match(/const callStartMs = [^;]+;/);
    const delegated = cs && /phase\.startMs/.test(cs[0]);
    if (cs && !delegated && !/requested \? /.test(cs[0]))
      fail.push("portal/portal.js — the headline's clock always measures the BOOKED time, so a pending move is judged against the call it replaced.");
    else if (delegated && !/pending \? rTime/.test(phaseSrc))
      fail.push("portal/portal.js — the shared definition no longer measures the authoritative time, so a pending move is judged against the call it replaced.");
    else if (cs) pass.push("the clock measures whichever time is authoritative");
  }
}

// ── 12. 🔒 ONE DEFINITION OF THE KICKOFF'S STATE, AND EVERY SURFACE READS IT ────────────────────
// 🔴🔴 THE STRUCTURAL FIX, 2026-09-29. Chris: "why is this so much back and forth. LETS FIX IT ONCE
// AND FOR ALL!!!" He was right and the reason was structural: the headline derived the state from
// the onboarding record and the card derived it from the holds ledger, so every fix corrected ONE
// derivation while the other went on being wrong. Four rounds, one morning.
// 🔑 Two stores may keep existing. They must agree on the RULE — so the rule is a pure function and
// both surfaces feed it. Nothing may compute "is it over" for itself.
{
  if (!/function kickoffPhase\(\{/.test(code))
    fail.push("portal/portal.js — kickoffPhase() is gone; each surface is deriving the kickoff's state for itself again, which is what caused a morning of contradictory cards.");
  else {
    pass.push("there is one definition of the kickoff's state");
    const headline = code.slice(code.indexOf("stage_4_onboarding: (() => {"), code.indexOf("\n    })(),", code.indexOf("stage_4_onboarding: (() => {")));
    if (!/kickoffPhase\(/.test(headline))
      fail.push("portal/portal.js — the next-step headline does not read kickoffPhase(), so it can disagree with the card about the same call.");
    else pass.push("the headline reads the shared definition");
    const cardFn = code.match(/function kickoffRequestedHtml\([\s\S]*?\n\}/);
    if (cardFn && !/kickoffPhase\(/.test(cardFn[0]))
      fail.push("portal/portal.js — the step card does not read kickoffPhase(), so it can disagree with the headline about the same call.");
    else if (cardFn) pass.push("the card reads the shared definition");
    // 🔴 And no surface may quietly recompute "is it over" from a raw timestamp.
    const strays = [headline, cardFn ? cardFn[0] : ""].filter((b) => /Date\.now\(\) >= \w+ \+ \w* ?\* ?60000/.test(b));
    if (strays.length)
      fail.push(`${strays.length} surface(s) still compute the end of the call from a raw timestamp instead of reading the shared definition.`);
    else pass.push("no surface recomputes the end of the call for itself");
  }
}

for (const p of pass) console.log(`  ✅ ${p}`);
if (fail.length) {
  console.error(`\n🔴 FAIL — ${fail.length} problem(s) with a call whose time has passed:`);
  for (const f of fail) console.error(`   • ${f}`);
  process.exit(1);
}
console.log(`\n✅ a past call states only what we can prove, and claims it happened only with a recap (${pass.length} checks).`);
