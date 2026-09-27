#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — THE KICKOFF STEP COMPLETES ON ACCEPTANCE, NOT ON SENDING
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-09-27: *"is it built out yet? if not build it."*
 *
 * Half of it was. `kickoff-rsvp-check` has been able to read the client's acceptance off the Google
 * event since the day it was written — and stored it for DISPLAY only, while `send-kickoff-invite`
 * wrote `status: "done"` the moment the event was created.
 *
 * So the standard every surface states had **a reader and no writer**:
 *   · the admin card — *"Done when the invite is ACCEPTED, not sent"*
 *   · the playbook, in capitals — *"DONE = the invite is ACCEPTED, not sent. An unaccepted invite
 *     is not a booked call."*
 *   · and `kickoff-rsvp-check`'s own header, describing the defect it was written to fix.
 *
 * A client who never opened the invite, or who DECLINED it, looked identical to one who had
 * confirmed the call. → feedback_correct_is_not_the_same_as_happening
 *
 * WHAT IS PINNED:
 *   1. Sending does NOT complete the step.
 *   2. Accepting DOES — and `unknown` never moves it, because a failed read of Google is not
 *      evidence about the client.
 *   3. A hand-marked completion is never quietly undone (the escape hatch stays).
 *   4. Something OTHER than an admin page view calls the checker — a capability nobody calls looks
 *      finished, and for two weeks the only caller was a tab being opened.
 *
 * Exit 0 pass · 1 fail · 2 indeterminate. Mutation log at the bottom.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const WEB = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
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

// Pull the object literal written for the kickoff step, so the assertion is about THAT step.
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

// ── 1. SENDING DOES NOT COMPLETE IT ─────────────────────────────────────────────────────────────
{
  const src = read(WEB, "netlify/functions/send-kickoff-invite.js", 5000);
  if (src) {
    const lit = stepLiteral(strip(src));
    if (!lit) indet.push("send-kickoff-invite.js: could not find the step literal it writes");
    else if (/status:\s*["']done["']/.test(lit)) {
      fail.push(`send-kickoff-invite.js — sending writes status "done" for ${STEP}. A client who never `
        + `opened the invite, or who declined it, then looks identical to one who confirmed the call. `
        + `Every surface says DONE = ACCEPTED, not sent.`);
    } else pass.push("send-kickoff-invite.js — sending records the send, it does not complete the step");
  }
}

// ── 2 + 3. ACCEPTING COMPLETES IT; UNKNOWN NEVER MOVES IT ───────────────────────────────────────
{
  const src = read(WEB, "netlify/functions/kickoff-rsvp-check.js", 3000);
  if (src) {
    const code = strip(src);
    if (!new RegExp(`"${STEP}"`).test(code)) {
      fail.push(`kickoff-rsvp-check.js — never writes ${STEP}. It reads the acceptance and acts on `
        + `nothing, which is the exact defect its own header was written about.`);
    } else pass.push("kickoff-rsvp-check.js — writes the step, not only the display field");

    // 🔴 RUN THE DECISION, DO NOT SCAN FOR IT. Two mutations escaped a static version of this:
    // `false && state === "accepted"` left the text intact, and renaming the hand-marked guard left
    // the words in the comments. The decision is a pure function; call it.
    // → feedback_a_gate_that_it_exists_is_not_a_gate_that_it_works
    const fn = (() => {
      const at = code.indexOf("function nextKickoffTask(");
      if (at < 0) return null;
      const open = code.indexOf("{", at);
      let d = 0;
      for (let i = open; i < code.length; i++) {
        if (code[i] === "{") d++;
        else if (code[i] === "}") { d--; if (d === 0) return code.slice(at, i + 1); }
      }
      return null;
    })();
    if (!fn) {
      fail.push("kickoff-rsvp-check.js — nextKickoffTask() is gone, so the acceptance decision is "
        + "inline again and cannot be exercised.");
    } else {
      try {
        const ctx = { Date, Object, result: null };
        vm.createContext(ctx);
        vm.runInContext(fn + `
          const SENT = { status: "pending", auto_result: { summary: "Invite sent" } };
          const ACCEPTED_DONE = { status: "done", auto_result: { accepted_at: "2026-09-27T00:00:00Z" } };
          const HAND_DONE = { status: "done", auto_result: { summary: "marked by hand" } };
          result = {
            accepts:    nextKickoffTask("accepted", SENT, {}),
            unknown:    nextKickoffTask("unknown", SENT, {}),
            awaiting:   nextKickoffTask("awaiting", SENT, {}),
            declinesReal: nextKickoffTask("declined", ACCEPTED_DONE, {}),
            declinesHand: nextKickoffTask("declined", HAND_DONE, {}),
          };`, ctx, { timeout: 2000 });
        const r = ctx.result;
        if (r.accepts.status !== "done") {
          fail.push(`kickoff-rsvp-check.js — an ACCEPTED invite leaves the step "${r.accepts.status}". Acceptance completes nothing.`);
        } else if (!r.accepts.auto_result?.accepted_at) {
          fail.push("kickoff-rsvp-check.js — acceptance completes the step without recording WHEN they accepted, so the completion is not substantiable.");
        } else pass.push("kickoff-rsvp-check.js — an acceptance completes the step, with the acceptance as proof");

        if (r.unknown !== undefined && r.unknown.status !== "pending") {
          fail.push(`kickoff-rsvp-check.js — an UNKNOWN read moved the step to "${r.unknown.status}". A failed read of Google is not evidence about the client.`);
        } else if (r.awaiting.status !== "pending") {
          fail.push(`kickoff-rsvp-check.js — an AWAITING answer moved the step to "${r.awaiting.status}".`);
        } else pass.push("kickoff-rsvp-check.js — unknown and awaiting never move the step");

        if (r.declinesReal.status !== "pending") {
          fail.push("kickoff-rsvp-check.js — a client who accepted and then DECLINED leaves the step done. They have un-booked the call.");
        } else pass.push("kickoff-rsvp-check.js — a later decline reopens the step");

        if (r.declinesHand.status !== "done") {
          fail.push("kickoff-rsvp-check.js — a HAND-MARKED completion is reopened by a decline. Chris marked it done deliberately; that must not be undone behind him.");
        } else pass.push("kickoff-rsvp-check.js — a hand-marked completion survives a decline");

        // 🔴 A NETLIFY FUNCTION'S CLOCK IS UTC. Without an explicit timeZone, `toLocaleString`
        // rendered a 12:00 PM Pacific call as "7:00 PM" — right instant, wrong hour, no zone named —
        // into the checklist summary Chris reads. Caught the first time a real acceptance completed
        // a step. → project_client_timezone_rule
        const ctx2 = { Date, Object, result: null };
        vm.createContext(ctx2);
        vm.runInContext(fn + `
          const P = { attendee: "c@x.com", start: "2026-09-28T19:00:00Z" };
          result = {
            tz:   nextKickoffTask("accepted", { status: "pending" }, { ...P, tz: "America/Los_Angeles" }).auto_result.summary,
            noTz: nextKickoffTask("accepted", { status: "pending" }, { ...P, tz: null }).auto_result.summary,
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
  }
}

// ── 4. "SENT, WAITING ON THEM" IS A STATE THE CARDS MUST DESCRIBE ───────────────────────────────
// 🔴 MAKING ACCEPTANCE THE COMPLETION CREATED A THIRD STATE AND IMMEDIATELY RE-OPENED AN OLD BUG.
// While sending marked the step done there were only two states to describe: nothing sent, or
// finished. Now there is an in-between — the invite is out and unanswered — and every card that
// picks "the first step that is not done" fell through to the step's own instruction:
// *"Send the kickoff calendar invite."* That button books the FIRST FREE SLOT, so following the
// admin's own advice would book a second, different time for a call already in the diary.
//
// The identical defect was found on 2026-09-26 with a pending REQUEST and guarded; the guard reads
// `_kickoffPendingAsk`, which is empty in this new state. A fix that creates a state must check every
// card that enumerates states. → feedback_fix_the_class_not_the_instance
{
  const admin = read(WEB, "admin/admin.js", 100000);
  if (admin) {
    const code = strip(admin);
    const at = code.indexOf("function kickoffSentAwaiting(");
    if (at < 0) {
      fail.push("admin/admin.js — kickoffSentAwaiting() is gone, so nothing distinguishes \"invite sent, "
        + "waiting on them\" from \"no invite sent\", and the cards fall back to \"Send the calendar invite\".");
    } else {
      const open = code.indexOf("{", at);
      let d = 0, fn = "";
      for (let i = open; i < code.length; i++) {
        if (code[i] === "{") d++;
        else if (code[i] === "}") { d--; if (d === 0) { fn = code.slice(at, i + 1); break; } }
      }
      try {
        const ctx = { Date, Math, state: {}, result: null };
        vm.createContext(ctx);
        vm.runInContext(fn + `
          const run = (k) => { state.onboardingData = k ? { kickoff_invite: k } : null; return kickoffSentAwaiting(); };
          const SENT = { event_id: "e1", rsvp: "awaiting", sent_at: new Date(Date.now() - 3*3600000).toISOString(), start: "2026-09-28T19:00:00Z", attendee: "c@x.com" };
          result = {
            awaiting:  run(SENT),
            stale:     run({ ...SENT, sent_at: new Date(Date.now() - 40*3600000).toISOString() }),
            accepted:  run({ ...SENT, rsvp: "accepted" }),
            declined:  run({ ...SENT, rsvp: "declined" }),
            neverSent: run({ rsvp: "awaiting" }),
            nothing:   run(null),
          };`, ctx, { timeout: 2000 });
        const r = ctx.result;
        if (!r.awaiting) fail.push("admin/admin.js — a sent, unanswered invite is not recognised, so the cards will tell Chris to send another one.");
        else pass.push("admin/admin.js — a sent, unanswered invite is a state the cards can see");
        if (r.accepted || r.declined) fail.push("admin/admin.js — an ANSWERED invite still reads as waiting; the card would nag after they replied.");
        else pass.push("admin/admin.js — an answered invite is not 'waiting'");
        if (r.neverSent || r.nothing) fail.push("admin/admin.js — a client with NO invite reads as waiting, which would hide the real instruction to send one.");
        else pass.push("admin/admin.js — no invite sent is not mistaken for waiting");
        if (!r.stale || r.stale.chase !== true) fail.push("admin/admin.js — an invite unanswered for 40h does not raise the chase; the playbook's 24h rule is not applied.");
        else pass.push("admin/admin.js — an invite unanswered past 24h asks to be chased");
      } catch (e) { indet.push(`admin/admin.js: kickoffSentAwaiting would not run in isolation (${e.message})`); }

      // 🔑 And both cards that name the next action must CONSULT it — a reader nobody calls is the
      // very shape this whole gate exists for.
      const callers = (code.match(/kickoffSentAwaiting\s*\(/g) || []).length - 1;
      if (callers < 2) {
        fail.push(`admin/admin.js — kickoffSentAwaiting is called ${callers} time(s); both the next-action `
          + `sequencer and the cockpit alert must consult it or one of them still says "Send the invite".`);
      } else pass.push(`admin/admin.js — ${callers} cards consult the waiting state`);
    }
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

// ── 6. SOMETHING OTHER THAN A PAGE VIEW ASKS ────────────────────────────────────────────────────
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
if (fail.length) { console.log(`\n🔴 FAIL — ${fail.length} way(s) an unaccepted invite passes as a booked call.`); process.exit(1); }
if (indet.length) { console.log(`\n⚠️  INDETERMINATE — ${indet.length} thing(s) this gate could not read.`); process.exit(2); }
console.log(`\n✅ the kickoff step completes on acceptance, and something asks without being asked (${pass.length} checks).`);

/* MUTATION LOG — filled in below. */
