#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — THE KICKOFF CALL IS BOOKED WHEN **RGA CONFIRMS**, AND THE CLIENT'S RSVP HOLDS NOTHING UP
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-09-29, after a week on one step: *"RGA side doesnt wait on client to accept invite.
 * the sequnce is this. client picks date and time. then its RGA side, they then confrim it. Then its
 * BOOKED. so make all verbiage and cards for this!!!"*
 *
 * 🔴🔴 THIS GATE USED TO ENFORCE THE OPPOSITE, AND THAT IS THE LESSON IN IT.
 *
 * Two days earlier I had built, gated and locked "DONE = the invite is ACCEPTED, not sent" —
 * reasoning from a slogan that several surfaces already carried, and never once checking it against
 * how the business actually books a call. It produced a **fourth state that does not exist**:
 * *waiting on the client's Google RSVP*. Every step after the kickoff sat behind a click in somebody
 * else's inbox, three admin cards faithfully reported a step that could not finish, and the client's
 * portal asked them for something after they had already done their part.
 *
 * A gate makes the rule it was given harder to change. So a gate written from a misread requirement
 * is worse than no gate: it defends the misreading. Pinning a rule is only safe once the rule has
 * come from Chris in his own words, not from prose already in the repo.
 * → feedback_do_what_chris_asked_not_the_principled_version · project_kickoff_meeting_lifecycle
 *
 * THE SEQUENCE, WHICH IS THREE STATES AND NOT FOUR:
 *   1. the client picks a date and time  → waiting on RGA
 *   2. RGA confirms it                   → BOOKED, and step 2 is DONE
 *   3. the RSVP arrives, or never does   → news about attendance; nothing waits on it
 *
 * WHAT IS PINNED:
 *   1. Confirming DOES complete the step, and records `confirmed_at` so the completion is
 *      substantiable — a `done` nothing can evidence is the defect one layer down.
 *   2. An acceptance completes NOTHING and must not move a pending step. `unknown` and `deleted`
 *      move nothing either, because a failed read of Google is not evidence about the client.
 *   3. A DECLINE is the one answer that reopens it — a call the client refused is not happening —
 *      and a hand-marked completion still survives it (the escape hatch stays).
 *   4. A booking confirmed under the OLD rule reconciles itself, because changing the writer does
 *      nothing for the records the old rule stranded.
 *   5. No surface may present the RSVP as an outstanding ask, and nothing may chase one.
 *   6. The states that DO exist are still distinguishable, so no card falls back to the step title
 *      and tells Chris to "Send the calendar invite" over a call already booked.
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
const SCRAPER = "/Users/chris/RGA/Rocket Growth Agency Scraper VS Code";
const fail = [], indet = [], pass = [];
const STEP = "m1.close.kickoff_invite";

function read(base, rel, min = 1000) {
  const p = path.join(base, rel);
  if (!fs.existsSync(p)) { indet.push(`${rel} does not exist`); return null; }
  const s = fs.readFileSync(p, "utf8");
  if (s.length < min) { indet.push(`${rel} is only ${s.length} bytes`); return null; }
  return s;
}
const strip = (s) => s.replace(/^\s*\/\/.*$/gm, "");   // comments quote these strings when explaining

function stepLiteral(src) {
  const at = src.indexOf(`"${STEP}": {`);
  if (at < 0) return null;
  const open = src.indexOf("{", at);
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") d++;
    else if (src[i] === "}") { d--; if (d === 0) return src.slice(at, i + 1); }
  }
  return null;
}

// Pull a named function's source out of a bundle so the gate can RUN the decision instead of
// scanning for it. A static version of these checks was escaped twice — once by
// `false && state === "accepted"`, once by a rename that left the words in the comments.
// → feedback_a_gate_that_it_exists_is_not_a_gate_that_it_works
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

// ── 1. CONFIRMING COMPLETES THE STEP, WITH EVIDENCE ─────────────────────────────────────────────
// 🔴 The inverse of what this section used to demand. `send-kickoff-invite` wrote `status: "pending"`
// with the summary *"Waiting on them to accept — this step completes when they do."* That one write
// was the SOURCE of the fourth state; every card downstream was reporting it correctly.
{
  const src = read(WEB, "netlify/functions/send-kickoff-invite.js", 5000);
  if (src) {
    const lit = stepLiteral(strip(src));
    if (!lit) indet.push("send-kickoff-invite.js: could not find the step literal it writes");
    else {
      if (!/status:\s*["']done["']/.test(lit)) {
        fail.push(`send-kickoff-invite.js — confirming does NOT write status "done" for ${STEP}. RGA `
          + `confirming a time the client picked is what books the call, so it is what completes the `
          + `step. Leaving it pending is the fourth state Chris removed on 2026-09-29: every step `
          + `after this one then waits on a click in the client's inbox.`);
      } else pass.push("send-kickoff-invite.js — confirming the time completes the step");

      // 🔑 A `done` that nothing can evidence is the defect one layer down, and STEP_ARTIFACTS is
      // built to ask for exactly this. → feedback_a_done_step_must_be_substantiable
      if (!/confirmed_at/.test(lit)) {
        fail.push(`send-kickoff-invite.js — the completion records no \`confirmed_at\`, so nothing can `
          + `substantiate it and the step is indistinguishable from one ticked by hand.`);
      } else pass.push("send-kickoff-invite.js — the completion records when RGA confirmed");

      if (/[Ww]aiting on them to accept|completes when they do/.test(lit)) {
        fail.push("send-kickoff-invite.js — the summary still tells the reader the step completes when "
          + "the client accepts. The ledger line outlives the bug and is what everyone acts on.");
      } else pass.push("send-kickoff-invite.js — the summary describes a booking, not a wait");
    }
  }
}

// ── 2 + 3. THE RSVP IS NEWS: IT COMPLETES NOTHING, AND ONLY A DECLINE UNDOES A BOOKING ──────────
{
  const src = read(WEB, "netlify/functions/kickoff-rsvp-check.js", 3000);
  if (src) {
    const code = strip(src);
    const fn = fnSource(code, "nextKickoffTask");
    if (!fn) {
      fail.push("kickoff-rsvp-check.js — nextKickoffTask() is gone, so the RSVP decision is inline "
        + "again and cannot be exercised.");
    } else {
      try {
        const ctx = { Date, Object, result: null };
        vm.createContext(ctx);
        vm.runInContext(fn + `
          const P = { attendee: "c@x.com", start: "2026-09-28T19:00:00Z", tz: "America/Los_Angeles" };
          const BOOKED    = { status: "done", auto_result: { confirmed_at: "2026-09-29T00:00:00Z" } };
          const STRANDED  = { status: "pending", auto_result: { summary: "Invite sent" } };
          const HAND_DONE = { status: "done", auto_result: { summary: "marked by hand" } };
          result = {
            acceptKeepsDone: nextKickoffTask("accepted", BOOKED, P),
            awaitingBooked:  nextKickoffTask("awaiting", BOOKED, P),
            tentativeBooked: nextKickoffTask("tentative", BOOKED, P),
            unknownBooked:   nextKickoffTask("unknown", BOOKED, P),
            deletedBooked:   nextKickoffTask("deleted", BOOKED, P),
            declineReal:     nextKickoffTask("declined", BOOKED, P),
            declineHand:     nextKickoffTask("declined", HAND_DONE, P),
            healAwaiting:    nextKickoffTask("awaiting", STRANDED, { ...P, sentAt: "2026-09-27T01:00:00Z" }),
            healAccepted:    nextKickoffTask("accepted", STRANDED, { ...P, sentAt: "2026-09-27T01:00:00Z" }),
            unknownPending:  nextKickoffTask("unknown", STRANDED, P),
            deletedPending:  nextKickoffTask("deleted", STRANDED, P),
          };`, ctx, { timeout: 2000 });
        const r = ctx.result;

        // ── an acceptance is recorded, never required ──────────────────────────────────────────
        if (r.acceptKeepsDone.status !== "done") {
          fail.push(`kickoff-rsvp-check.js — an acceptance moved a BOOKED step to `
            + `"${r.acceptKeepsDone.status}". A confirmed booking is already done; an RSVP must not `
            + `re-adjudicate it.`);
        } else if (!r.acceptKeepsDone.auto_result?.accepted_at) {
          fail.push("kickoff-rsvp-check.js — an acceptance is not recorded at all, so the admin card "
            + "can never tell a client who confirmed they are coming from one who has not replied.");
        } else pass.push("kickoff-rsvp-check.js — an acceptance is recorded as news, and changes no status");

        // 🔴 THE REGRESSION THIS SECTION EXISTS FOR: acceptance quietly becoming the completion
        // again, by way of a pending step it feels entitled to finish. A pending step here means the
        // CONFIRM never landed, and the cure for that is confirming.
        if (r.healAccepted.status === "done" && !r.healAccepted.auto_result?.confirmed_at) {
          fail.push("kickoff-rsvp-check.js — an acceptance completed a pending step with no "
            + "`confirmed_at`. That is the old rule back: the client's click, not RGA's confirm, "
            + "is finishing the step.");
        } else pass.push("kickoff-rsvp-check.js — acceptance alone never supplies the completion");

        // ── nothing else moves it ──────────────────────────────────────────────────────────────
        const inert = [["awaiting", r.awaitingBooked], ["tentative", r.tentativeBooked],
                       ["unknown", r.unknownBooked], ["deleted", r.deletedBooked]];
        const moved = inert.filter(([, v]) => v.status !== "done");
        if (moved.length) {
          fail.push(`kickoff-rsvp-check.js — ${moved.map(([n, v]) => `${n} → "${v.status}"`).join(", ")} `
            + `on a booked call. Only a DECLINE takes a booking away; a failed read of Google is not `
            + `evidence about the client.`);
        } else pass.push("kickoff-rsvp-check.js — awaiting, tentative, unknown and deleted leave a booking alone");

        const stranded = [["unknown", r.unknownPending], ["deleted", r.deletedPending]];
        const wrong = stranded.filter(([, v]) => v.status === "done");
        if (wrong.length) {
          fail.push(`kickoff-rsvp-check.js — ${wrong.map(([n]) => n).join(", ")} completed a pending step. `
            + `Neither answer says an event exists, so neither is evidence of a booking.`);
        } else pass.push("kickoff-rsvp-check.js — a read that found no live event never completes the step");

        // ── a decline reopens it; a hand-marked done survives ──────────────────────────────────
        if (r.declineReal.status !== "pending") {
          fail.push("kickoff-rsvp-check.js — a DECLINE leaves the step done. The client has said they "
            + "are not coming, so somebody must agree a new time.");
        } else pass.push("kickoff-rsvp-check.js — a decline reopens the step");

        if (r.declineHand.status !== "done") {
          fail.push("kickoff-rsvp-check.js — a HAND-MARKED completion is reopened by a decline. Chris "
            + "marked it done deliberately; that must not be undone behind him.");
        } else pass.push("kickoff-rsvp-check.js — a hand-marked completion survives a decline");

        // ── 4. the records the old rule stranded reconcile themselves ──────────────────────────
        // 🔴 Changing the writer fixes the NEXT booking and does nothing for the ones already held
        // at pending with a real event on Google. "Correct going forward" is not the same as right
        // on the screen Chris is looking at. → feedback_correct_is_not_the_same_as_happening
        if (r.healAwaiting.status !== "done") {
          fail.push(`kickoff-rsvp-check.js — a live event on a PENDING step stays `
            + `"${r.healAwaiting.status}". Every client confirmed before 2026-09-29 is in exactly that `
            + `shape, so their kickoff step never completes and every later step stays blocked.`);
        } else if (r.healAwaiting.auto_result?.confirmed_at !== "2026-09-27T01:00:00Z") {
          fail.push(`kickoff-rsvp-check.js — the reconciled completion stamps `
            + `"${r.healAwaiting.auto_result?.confirmed_at}" instead of the invite's own sent_at. `
            + `Backdating to when RGA actually confirmed is the point; today's date invents a fact.`);
        } else pass.push("kickoff-rsvp-check.js — a live event on a stranded step completes it, dated to the real confirm");

        // 🔴 A NETLIFY FUNCTION'S CLOCK IS UTC. Without an explicit timeZone, `toLocaleString`
        // rendered a 12:00 PM Pacific call as "7:00 PM" — right instant, wrong hour, no zone named —
        // into the checklist summary Chris reads. → project_client_timezone_rule
        const ctx2 = { Date, Object, result: null };
        vm.createContext(ctx2);
        vm.runInContext(fn + `
          const P = { attendee: "c@x.com", start: "2026-09-28T19:00:00Z" };
          const S = { status: "pending" };
          result = {
            tz:   nextKickoffTask("awaiting", S, { ...P, tz: "America/Los_Angeles" }).auto_result.summary,
            noTz: nextKickoffTask("awaiting", S, { ...P, tz: null }).auto_result.summary,
          };`, ctx2, { timeout: 2000 });
        const q = ctx2.result;
        if (!/12:00\s*PM/.test(q.tz)) {
          fail.push(`kickoff-rsvp-check.js — a 19:00Z call does not render as 12:00 PM for a client in `
            + `America/Los_Angeles: "${q.tz}". The summary names an hour the client never agreed to.`);
        } else pass.push("kickoff-rsvp-check.js — the summary uses the client's own zone");
        if (!/UTC/.test(q.noTz)) {
          fail.push(`kickoff-rsvp-check.js — with no client zone the summary prints a BARE hour: `
            + `"${q.noTz}". An unlabelled time from a UTC server reads as local and is wrong by hours.`);
        } else pass.push("kickoff-rsvp-check.js — with no zone known, the summary says UTC out loud");
      } catch (e) {
        indet.push(`kickoff-rsvp-check.js: nextKickoffTask would not run in isolation (${e.message})`);
      }
    }

    // ── nothing chases an RSVP ────────────────────────────────────────────────────────────────
    // 🔴 A "chase it" banner over a booked call is the fourth state wearing a different hat, and it
    // would have survived every wording fix. `chase_due` is pinned false at the source.
    // 🔴 THE LOOKAHEAD MUST SWALLOW THE WHITESPACE, or `*` backtracks to zero width and the negative
    // lookahead sits on " false" — which is not "false", so the gate accuses correct code. Two
    // spellings of this check went red on `chase_due: false` before the regex itself was the bug.
    // → feedback_a_gate_must_pin_the_property_not_the_spelling
    if (/chase_due:(?![ \t]*false\b)/.test(code)) {
      fail.push("kickoff-rsvp-check.js — `chase_due` is computed again. Nothing is waiting on the "
        + "RSVP, so telling RGA to chase one re-creates the state Chris removed.");
    } else pass.push("kickoff-rsvp-check.js — nothing computes a reason to chase the RSVP");
  }
}

// ── 4b. THE FOURTH STATE IS GONE FROM THE ADMIN, NOT RENAMED ────────────────────────────────────
// 🔴🔴 A STATE THAT SHOULD NOT EXIST IS REMOVED, NOT REWORDED. Rewording the three cards would have
// left `kickoffSentAwaiting()` computing it, still blocking step 3, and still ready to come back the
// next time somebody asked what the card should say. → feedback_fix_the_class_not_the_instance
{
  const admin = read(WEB, "admin/admin.js", 100000);
  if (admin) {
    const code = strip(admin);

    if (fnSource(code, "kickoffSentAwaiting")) {
      fail.push("admin/admin.js — kickoffSentAwaiting() is back. It computes \"waiting on the client to "
        + "accept the invite\", which is not a state this business has: the client picks, RGA confirms, "
        + "and then it is BOOKED.");
    } else pass.push("admin/admin.js — the acceptance-waiting state is gone, not reworded");

    const nags = [
      [/[Ww]aiting on the client to accept the invite/, '"Waiting on the client to accept the invite"'],
      [/This step completes when the client accepts/, '"This step completes when the client accepts"'],
      [/[Cc]hase the (kickoff )?invite/, '"Chase the invite"'],
      [/[Dd]one when the invite is <strong>accepted/, '"Done when the invite is accepted"'],
      // 🔴 CASE AND MARKUP ARE NOT THE PROPERTY. This pinned `not accepted yet</strong>` and a
      // mutation writing `Not accepted yet</strong>` walked straight past it. The phrase itself is
      // the fourth state, wherever it appears and however it is capitalised.
      // → feedback_a_gate_must_pin_the_property_not_the_spelling
      [/not accepted yet/i, '"not accepted yet" as a state'],
      [/[Nn]ot booked until/, '"not booked until they accept"'],
    ];
    const found = nags.filter(([re]) => re.test(code)).map(([, label]) => label);
    if (found.length) {
      fail.push(`admin/admin.js — ${found.length} surface(s) still present the RSVP as an outstanding `
        + `ask: ${found.join(", ")}. Confirming books the call; the RSVP holds nothing up.`);
    } else pass.push("admin/admin.js — no surface presents the RSVP as an outstanding ask");

    // 🔑 And the proof of done must be the BOOKING. Asking for `accepted_at` is what made a
    // confirmed call read as unsubstantiated. → feedback_a_done_step_must_be_substantiable
    const art = stepLiteral(code);
    if (!art) indet.push("admin/admin.js: could not find the STEP_ARTIFACTS entry for the kickoff step");
    else if (!/confirmed_at/.test(art)) {
      fail.push("admin/admin.js — STEP_ARTIFACTS does not accept `confirmed_at` as proof of the kickoff "
        + "step, so every call RGA confirms renders as \"Done — unverified\".");
    } else pass.push("admin/admin.js — a confirmed booking substantiates the completed step");

    // ── THE STATES THAT DO EXIST: nothing picked yet, versus picked and waiting on RGA ─────────
    // 🔴 After a client cancelled, the admin's headline read "Step 2 · Send the kickoff calendar
    // invite" while the portal had just told them "Pick a new time whenever you're ready." Chris
    // asked, reasonably, *"do we need to send calendar invite?"* — the step's OWN card says
    // "You usually do not need this button at all." The cards were reading the step's TITLE, which
    // names the fallback, and presenting it as the primary act.
    const wfn = fnSource(code, "kickoffWaitingOnPick");
    if (!wfn) {
      fail.push("admin/admin.js — kickoffWaitingOnPick() is gone. With nothing sent and nothing "
        + "picked, the cards fall back to the step title and tell Chris to book on the client's "
        + "behalf while the client is mid-choice.");
    } else {
      try {
        const c3 = { state: {}, _kickoffPendingAsk: new Map(), result: null };
        vm.createContext(c3);
        vm.runInContext(wfn + `
          const set = (k, ask) => { state.onboardingData = k ? { kickoff_invite: k } : null;
            _kickoffPendingAsk.clear(); if (ask) _kickoffPendingAsk.set("c1", ask);
            return kickoffWaitingOnPick("c1"); };
          result = {
            nothing:  set(null, null),
            cancelled: set({}, null),
            picked:   set(null, "Mon 12:00 PM"),
            sent:     set({ event_id: "e1" }, null),
          };`, c3, { timeout: 2000 });
        const w = c3.result;
        if (!w.nothing || !w.cancelled) fail.push("admin/admin.js — a client who has not picked is not recognised as waiting on THEM, so the admin is told to book on their behalf.");
        else pass.push("admin/admin.js — nothing sent and nothing picked reads as the client's turn");
        if (w.picked) fail.push("admin/admin.js — a client who HAS picked still reads as waiting on them; the request would be ignored.");
        else pass.push("admin/admin.js — a pending request is RGA's turn, not the client's");
        if (w.sent) fail.push("admin/admin.js — a confirmed booking still reads as waiting on the client to pick.");
        else pass.push("admin/admin.js — a confirmed booking is not 'waiting on the client to pick'");
      } catch (e) { indet.push(`admin/admin.js: kickoffWaitingOnPick would not run in isolation (${e.message})`); }

      // 🔴 COUNT REACHABLE CALLS, NOT CALL TEXT. `if (false && kickoffWaitingOnPick(...))` leaves
      // the call spelled out while the branch can never run — a mutation doing exactly that passed.
      const pickCalls = [...code.matchAll(/kickoffWaitingOnPick\s*\(/g)].slice(1);
      const dead = pickCalls.filter((m) => /false\s*&&\s*$/.test(code.slice(Math.max(0, m.index - 40), m.index)));
      const pickCallers = pickCalls.length - dead.length;
      if (dead.length) {
        fail.push(`admin/admin.js — ${dead.length} call(s) to kickoffWaitingOnPick are behind a literal `
          + `false, so the branch can never run while the call still reads as present.`);
      }
      if (pickCallers < 2) {
        fail.push(`admin/admin.js — kickoffWaitingOnPick is reachably called ${pickCallers} time(s); both `
          + `the next-action sequencer and the cockpit alert must consult it.`);
      } else if (!dead.length) pass.push(`admin/admin.js — ${pickCallers} cards consult the waiting-on-pick state`);

      // 🔑 And the copy must exist on BOTH — a consulted flag with nothing to show for it is the
      // same defect one layer down. 🔴 The spelling is NOT pinned: an earlier version of this check
      // grepped "Waiting on them to pick", which went red the day Chris asked for "them" → "client"
      // on a change that was entirely correct. Pin the PROPERTY — that both cards name a wait on the
      // client's pick. → feedback_a_gate_must_pin_the_property_not_the_spelling
      const pickCopy = (code.match(/[Ww]aiting on the client to pick a (kickoff )?time/g) || []).length;
      if (pickCopy < 2) {
        fail.push(`admin/admin.js — a wait on the client's own pick is named ${pickCopy} time(s); the `
          + `next-action card and the cockpit alert must each say it, or one still reads `
          + `"Send the kickoff calendar invite" while the client is mid-choice.`);
      } else pass.push("admin/admin.js — both cards say they are waiting on the client to pick");
    }
  }
}

// ── 4c. THE CLIENT PORTAL NEVER ASKS FOR THE RSVP EITHER ────────────────────────────────────────
// 🔴 The client half of the same invented state: the portal withheld "you're all set" until it had
// seen their Google click, so it asked them for something after they had already done their part.
{
  const portal = read(WEB, "portal/portal.js", 100000);
  if (portal) {
    const code = strip(portal);
    const asks = [
      [/[Aa]ccept the invite so it/, '"Accept the invite so it shows on your calendar"'],
      [/accept it so it shows on your calendar/, '"accept it so it shows on your calendar"'],
      [/rsvp === "accepted"\s*\n?\s*\?/, "gating the reassurance on rsvp === \"accepted\""],
    ];
    const found = asks.filter(([re]) => re.test(code)).map(([, l]) => l);
    if (found.length) {
      fail.push(`portal/portal.js — ${found.length} place(s) still make the client's RSVP a condition: `
        + `${found.join(", ")}. RGA confirmed the time they picked, so the call is booked and they owe `
        + `nothing.`);
    } else pass.push("portal/portal.js — a confirmed booking tells the client they are all set");

    // 🔑 And it must still SAY booked. Removing the ask without leaving the reassurance would be a
    // card that describes a confirmed call and reassures nobody.
    if (!/You're all set/.test(code)) {
      fail.push("portal/portal.js — nothing tells a client with a booked call that they are all set.");
    } else pass.push("portal/portal.js — the booked call is stated as settled");
  }
}

// ── 5. NOTHING MAY READ "STEP NOT DONE" AS "NO INVITE SENT" ─────────────────────────────────────
// 🔴🔴 THE FIFTH SURFACE, AND MY OWN FIX BROKE IT. The onboarding banner asked
// `!stepDone("m1.close.kickoff_invite")` to mean *"no invite has been sent"* — true only while
// SENDING was what completed the step. Acceptance-gating turned that expression into *"sent, but
// unanswered"*, and the banner went on announcing **"none has been sent yet. Send it from step 2
// below"** — pointing at the button that books the FIRST FREE SLOT — to a client who already had the
// invite in their inbox. Four other surfaces of that same stale instruction had been corrected on
// 09-26 and are documented three lines above where this one lived.
//
// 🔑 "Was an invite sent?" and "is the step done?" became two different questions on 2026-09-27.
// Anything asking the first must test the INVITE, never the step.
// → feedback_fix_the_class_not_the_instance · feedback_a_promise_in_client_copy_is_a_commitment
{
  const admin = read(WEB, "admin/admin.js", 100000);
  if (admin) {
    const code = strip(admin);
    // Find every claim that nothing has been sent, and check what it is conditioned on.
    // 🔑 SCOPE IT TO THE KICKOFF. A first version matched any "no invite has been sent" and flagged
    // the PORTAL-ACCESS banner — "No invite has been sent, so they have no way in" — which is a
    // different invite entirely. The claim only matters where a CALENDAR invite is the subject.
    const re = /none has been sent yet|no invite has been sent|has not been sent/gi;
    let m, found = 0;
    while ((m = re.exec(code))) {
      const near = code.slice(Math.max(0, m.index - 400), m.index + 200);
      if (!/calendar invite|kickoff/i.test(near)) continue;   // a different kind of invite
      found++;
      // 🔴 READ THE GUARD'S OWN EXPRESSION, NOT A WINDOW BEFORE IT. A 4000-character look-back was
      // satisfied by the word `inviteSent` still being DECLARED above — a mutation that reverted the
      // condition to `!stepDone(...)` left that declaration in place, unused, and the check passed.
      // The flag that guards this copy is what has to be examined.
      // → feedback_a_gate_window_measured_in_characters_will_lie
      const line = code.slice(0, m.index).split("\n").length;
      const decl = code.match(/const\s+promiseGap\s*=\s*([^;]+);/);
      if (!decl) { indet.push("admin/admin.js: could not find the promiseGap expression"); continue; }
      const expr = decl[1];
      const guardsOnStep = /!stepDone\(\s*["']m1\.close\.kickoff_invite["']\s*\)/.test(expr);
      const guardsOnInvite = /inviteSent|kickoff_invite\?\.event_id|kickoff_invite\.event_id/.test(expr);
      if (guardsOnStep && !guardsOnInvite) {
        fail.push(`admin/admin.js:${line} — claims no invite has been sent, conditioned on the STEP not `
          + `being done. Since acceptance became the completion that is true while the invite is sitting `
          + `in the client's inbox, and the copy points at the button that books a different slot.`);
      } else if (!guardsOnInvite) {
        fail.push(`admin/admin.js:${line} — claims no invite has been sent without testing whether one `
          + `exists (kickoff_invite.event_id).`);
      } else {
        // 🔑 And the flag it trusts must actually read the invite — a `const inviteSent = true` would
        // satisfy the name and nothing else.
        const flag = code.match(/const\s+inviteSent\s*=\s*([^;]+);/);
        if (flag && !/kickoff_invite\??\.?\[?["']?kickoff_invite|event_id/.test(flag[1])) {
          fail.push(`admin/admin.js:${line} — inviteSent is not derived from the invite's event_id: `
            + `\`${flag[1].trim().slice(0, 80)}\``);
        } else pass.push(`admin/admin.js:${line} — "nothing sent" is conditioned on the invite, not the step`);
      }
    }
    if (!found) indet.push("admin/admin.js: found no \"none has been sent\" copy — the banner was reworded");

    // And a completed step must be substantiable by the ACCEPTANCE now that acceptance is what completes it.
    if (!/accepted_at/.test((code.match(/"m1\.close\.kickoff_invite":\s*\{[\s\S]{0,400}?\}/) || [""])[0])) {
      fail.push("admin/admin.js — the step's proof rule does not accept `accepted_at`. Done now means "
        + "accepted, so the acceptance is what substantiates it.");
    } else pass.push("admin/admin.js — a completed kickoff step is substantiated by the acceptance");
  }
}

// ── 6. SOMETHING ASKS WHETHER THE CALL HAPPENED ─────────────────────────────────────────────────
// 🔴 ACCEPTING THE INVITE COMPLETES STEP 2. NOTHING COMPLETES THE CALL. `m1.kickoff.call` is
// `actor: both` and has no automatic completion — correctly, because only a human knows whether a
// meeting took place. What was missing until 2026-09-28 is that **nothing asked**: the step sat
// pending with no prompt on any surface, and FOUR access steps are locked behind it — the vault,
// GBP manager, GA4 admin and GSC owner, which gate the Brain and everything downstream.
//
// 🔑 IT ASKS, IT NEVER ASSUMES. The end time passing is evidence the call was SCHEDULED to have
// happened, not that it did; Google cannot say whether anyone joined.
// → feedback_a_done_step_must_be_substantiable · feedback_every_action_must_report_its_result
{
  const admin = read(WEB, "admin/admin.js", 100000);
  if (admin) {
    const code = strip(admin);
    const at = code.indexOf("function kickoffCallDue(");
    if (at < 0) {
      fail.push("admin/admin.js — kickoffCallDue() is gone. Nothing asks whether the kickoff call "
        + "happened, and four access steps stay locked behind a tick nobody is prompted to make.");
    } else {
      const open = code.indexOf("{", at);
      let d = 0, fn = "";
      for (let i = open; i < code.length; i++) {
        if (code[i] === "{") d++;
        else if (code[i] === "}") { d--; if (d === 0) { fn = code.slice(at, i + 1); break; } }
      }
      try {
        const ctx = { Date, Number, Math, state: {}, result: null };
        vm.createContext(ctx);
        vm.runInContext(fn + `
          const put = (k) => { state.onboardingData = { kickoff_invite: k }; return kickoffCallDue(); };
          const iso = (ms) => new Date(Date.now() + ms).toISOString();
          result = {
            future:  put({ event_id: "e", start: iso(4 * 3600000) }),
            justStarted: put({ event_id: "e", start: iso(-5 * 60000) }),
            justEnded: put({ event_id: "e", start: iso(-90 * 60000) }),
            longAgo: put({ event_id: "e", start: iso(-30 * 3600000) }),
            nothing: put({}),
            // 🔴 A START WITH NO EVENT means nothing was ever sent. The empty-object case above is
            // masked by the NaN guard further down, so it cannot tell whether event_id is checked.
            // (No backticks in here — this comment lives INSIDE a template literal, and one backtick
            //  ends the string early. The gate then fails to parse and exits 1 for EVERY mutation,
            //  which reads exactly like five perfect catches.)
            noEvent: put({ start: iso(-90 * 60000) }),
          };`, ctx, { timeout: 2000 });
        const r = ctx.result;
        // 🔴 A call still in the future must NOT be asked about — that is a prompt to lie.
        // 🔄 START-TIME semantics since 2026-09-28: the card speaks from the moment the call BEGINS,
        // because that is when the steps behind it unlock and when Chris is on the call working them.
        if (r.future !== null) fail.push("admin/admin.js — a call four hours in the FUTURE already reads as happening.");
        else pass.push("admin/admin.js — a call that has not started says nothing");
        if (!r.justStarted || r.justStarted.live !== true) fail.push("admin/admin.js — a call that started five minutes ago does not read as live, so the card does not say the checklist is open.");
        else pass.push("admin/admin.js — a call in progress reads as live");
        if (!r.justEnded || r.justEnded.live !== false) fail.push("admin/admin.js — a call that ended an hour ago still reads as live.");
        else pass.push("admin/admin.js — a finished call stops reading as live");
        if (!r.longAgo) fail.push("admin/admin.js — a call 30h past says nothing at all.");
        else pass.push("admin/admin.js — a past call is still described");
        if (r.nothing !== null) fail.push("admin/admin.js — a client with NO booking is asked whether the call happened.");
        else if (r.noEvent !== null) fail.push("admin/admin.js — a time with no calendar EVENT is asked about. Nothing was ever sent, so there was no call to hold.");
        else pass.push("admin/admin.js — no booking, and no event, means no question");
      } catch (e) { indet.push(`admin/admin.js: kickoffCallDue would not run in isolation (${e.message})`); }

      // 🔑 And every surface that names the next action must ASK it — step card, sequencer, cockpit.
      // 🔴 FOUR, NOT THREE. The step card's band, the next-action sequencer, the cockpit alert AND
      // the button label all consult it — a `< 3` threshold let a mutation delete the cockpit's call
      // and still pass. Count what is actually there.
      // 🔄 THREE since 2026-09-28, not four. The button label used to consult this to ask "did we
      // hold it?"; the clock model removed that question, so the button is a plain completion again.
      // A threshold left at 4 is a check describing a design that no longer exists.
      const callers = (code.match(/kickoffCallDue\s*\(/g) || []).length - 1;
      if (callers < 3) {
        fail.push(`admin/admin.js — kickoffCallDue is called ${callers} time(s), expected 3: the step `
          + `card's band, the next-action sequencer and the cockpit alert. One missing is one surface `
          + `Chris might be looking at that stays silent.`);
      } else pass.push(`admin/admin.js — ${callers} surfaces describe the call window`);

      // 🔄 REMOVED 2026-09-28. This required the button to read "Yes — we held it", the answer to
      // "did the kickoff call happen?". The clock model stopped asking, so the check was pinning a
      // sentence the product deliberately no longer says — a gate enforcing a retired design is a
      // gate that blocks the fix. The rule it protected now lives in check 7: the unlock is what
      // matters, not the tick. → feedback_a_ledger_line_outlives_the_bug
    }
  }
}

// ── 7. THE CALL UNLOCKS THE NEXT STEPS ON THE CLOCK ─────────────────────────────────────────────
// 🔒 Chris, 2026-09-28: *"lets make it time based so after the call time, we then unlock it… so then
// we can be on the call with them and walk through anything."* Four access steps sit behind
// `m1.kickoff.call` — the vault, GBP, GA4 and Search Console — and gating them on a manual tick meant
// they were still locked during the very call where they get set up together.
//
// 🔑 DERIVED, NOT WRITTEN: nothing runs at 1:30 to make this true. It is computed from the confirmed
// booking on every render, so it cannot drift, cannot fire twice and needs no scheduler.
{
  const admin = read(WEB, "admin/admin.js", 100000);
  if (admin) {
    const code = strip(admin);
    if (!/callStarted/.test(code)) {
      fail.push("admin/admin.js — nothing completes the kickoff call on the clock. The four access "
        + "steps behind it stay locked through the call itself, waiting on a manual tick.");
    } else {
      // 🔴 EIGHT `const done =` EXIST in this bundle. Anchor on the one that follows the callStarted
      // computation, not the first in the file. Nth time.
      // → feedback_an_inventory_is_a_claim_about_what_i_thought_to_grep
      const csAt = code.indexOf("const callStarted");
      const m = csAt < 0 ? null : code.slice(csAt).match(/const\s+done\s*=\s*([^;]+);/);
      if (!m) indet.push("could not find the step done-ness expression after callStarted");
      else if (!/callStarted/.test(m[1])) {
        fail.push("admin/admin.js — `callStarted` is computed but the step's done-ness ignores it, so "
          + "nothing actually unlocks.");
      } else pass.push("the kickoff call completes on the clock, unlocking the steps behind it");

      // 🔴 IT MUST BE THE START, NOT THE END. Unlocking after the call defeats the point.
      const blk = code.slice(code.indexOf("const callStarted"), code.indexOf("const callStarted") + 600);
      if (/\+\s*30\s*\*\s*60000|30 \* 60000/.test(blk)) {
        fail.push("admin/admin.js — the unlock is offset past the start time. It must fire AT the "
          + "start, so the checklist is open while the call is happening.");
      } else if (!/Date\.now\(\)\s*>=/.test(blk)) {
        fail.push("admin/admin.js — the unlock does not compare the clock to the booked start.");
      } else pass.push("the unlock fires at the START of the call, not after it");

      // 🔑 And only for a real booking.
      if (!/event_id/.test(blk)) {
        fail.push("admin/admin.js — the clock unlock does not require a real booking, so a client with "
          + "no call could have the steps unlocked by a stale timestamp.");
      } else pass.push("the clock unlock requires a confirmed booking");
    }
  }
}

// ── 8. THE CALL CONSOLE READS REAL STATUS, AND NEVER SENDS ──────────────────────────────────────
// 🔒 Approved 2026-09-28 — reports/mockups/admin_kickoff_call_console_v1.html. A talk track already
// existed and the step already linked to it; the gap was that nothing brought it to the call, and
// that the five things the SOP says the call exists to COLLECT are already steps with real status.
{
  const admin = read(WEB, "admin/admin.js", 100000);
  if (admin) {
    const code = strip(admin);
    // 🔑 The collect list must point at REAL steps. A label with no step behind it is a checklist
    // that cannot know whether the thing arrived.
    const ids = [...code.matchAll(/id:\s*"(m1\.[a-z_.]+)",\s*label:/g)].map((m) => m[1]);
    if (ids.length < 5) {
      fail.push(`admin/admin.js — the call console lists ${ids.length} collect item(s); the SOP names `
        + `five: GBP, GA4, Search Console, website/CMS and photos, plus the customer list.`);
    } else {
      const pb = path.join(WEB, "data/playbooks/playbooks.json");
      try {
        const raw = JSON.parse(fs.readFileSync(pb, "utf8"));
        const known = new Set();
        (function walk(o) {
          if (Array.isArray(o)) return o.forEach(walk);
          if (o && typeof o === "object") { if (o.id && o.title) known.add(o.id); Object.values(o).forEach(walk); }
        })(raw);
        const ghosts = ids.filter((i) => !known.has(i));
        if (ghosts.length) {
          fail.push(`admin/admin.js — the call console reads step(s) that do not exist: ${ghosts.join(", ")}. `
            + `Their status would silently read "still need" forever.`);
        } else pass.push(`admin/admin.js — all ${ids.length} collect items point at real playbook steps`);
      } catch (e) { indet.push(`could not read playbooks.json (${e.message})`); }
    }

    // 🔴 THE RECAP DRAFTS, IT NEVER SENDS. This composes a client-facing email.
    const rc = code.indexOf("data-kickoff-recap");
    if (rc < 0) {
      fail.push("admin/admin.js — the call console has no recap. The SOP requires one after every call.");
    } else {
      const h = code.indexOf('closest("[data-kickoff-recap]")');
      const body = h < 0 ? "" : code.slice(h, h + 3000);
      if (!body) indet.push("could not isolate the recap handler");
      else if (/send-|sendUpdates|notify-rga|method:\s*"POST"/.test(body)) {
        fail.push("admin/admin.js — the recap handler posts somewhere. It must DRAFT only: it composes "
          + "a client-facing email, and nothing here may reach a client without Chris pressing send in "
          + "his own mail client.");
      } else if (!/window\.open/.test(body)) {
        fail.push("admin/admin.js — the recap never opens a draft, so the button does nothing.");
      } else pass.push("admin/admin.js — the recap opens a draft and sends nothing");

      // 🔴 An empty To: is a hatch that looks like it worked.
      if (!/if \(!to\)/.test(body)) {
        fail.push("admin/admin.js — the recap opens a compose window even with no contact email, which "
          + "looks like it worked and is not recoverable.");
      } else pass.push("admin/admin.js — no contact email is reported, not silently drafted");
    }

    // 🔴 NO DEAD CONTROL TO THE TALK TRACK. /docs/* is 404'd at the edge on purpose and DOCS_LIBRARY
    // serves PDFs by filename — a markdown file in a blocked path is in neither.
    if (/data-open-talk-track/.test(code)) {
      fail.push("admin/admin.js — a button links to the talk track, but /docs/* is blocked at the edge "
        + "and the docs library serves PDFs. That control cannot work.");
    } else pass.push("admin/admin.js — no dead control pointing at the blocked docs path");
  }
}

// ── 9. SOMETHING OTHER THAN A PAGE VIEW ASKS ────────────────────────────────────────────────────
// 🔑 THE HALF THAT MADE IT INVISIBLE. The checker worked; its only caller was `refreshKickoffRsvp`,
// which runs when Chris opens a client's Overview. A client could accept on Friday and the record
// still read "awaiting" on Monday. → feedback_a_capability_nobody_calls_looks_finished
{
  let callers = [];
  for (const [base, dir] of [[SCRAPER, "scripts"]]) {
    const d = path.join(base, dir);
    for (const f of fs.existsSync(d) ? fs.readdirSync(d) : []) {
      // 🔑 A GATE THAT MENTIONS THE ENDPOINT IS NOT A CALLER OF IT, and neither is the runner that
      // lists the callers. Counting itself was how the first run "found" four.
      if (!/\.(mjs|sh)$/.test(f)) continue;
      if (/^check-/.test(f) || f === "daily-health-check.sh") continue;
      let body = "";
      try { body = fs.readFileSync(path.join(d, f), "utf8"); } catch { continue; }
      if (/kickoff-rsvp-check/.test(strip(body))) callers.push(f);
    }
  }
  if (!callers.length) {
    fail.push("nothing outside the admin UI ever calls kickoff-rsvp-check. The only thing that would "
      + "notice an acceptance is somebody opening that client's Overview tab.");
  } else {
    // And that caller must itself be scheduled, or it is one more thing nobody runs.
    const runner = read(SCRAPER, "scripts/daily-health-check.sh", 500) || "";
    const scheduled = callers.some((c) => runner.includes(c));
    if (!scheduled) {
      fail.push(`kickoff-rsvp-check is called by ${callers.join(", ")}, but none of those are run by `
        + `daily-health-check.sh — so nothing runs them either.`);
    } else pass.push(`an acceptance is swept for on a schedule (${callers.join(", ")})`);
  }
}

for (const x of pass) console.log(`  ✅ ${x}`);
for (const x of indet) console.log(`  ⚠️  INDETERMINATE — ${x}`);
for (const x of fail) console.log(`  🔴 ${x}`);
if (fail.length) { console.log(`\n🔴 FAIL — ${fail.length} way(s) the kickoff booking disagrees with "client picks, RGA confirms, BOOKED".`); process.exit(1); }
if (indet.length) { console.log(`\n⚠️  INDETERMINATE — ${indet.length} thing(s) this gate could not read.`); process.exit(2); }
console.log(`\n✅ the kickoff is booked when RGA confirms the time the client picked; the RSVP holds nothing up (${pass.length} checks).`);

/* MUTATION LOG — filled in below. */
