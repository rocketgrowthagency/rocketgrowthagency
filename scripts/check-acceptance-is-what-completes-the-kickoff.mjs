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
      } catch (e) {
        indet.push(`kickoff-rsvp-check.js: nextKickoffTask would not run in isolation (${e.message})`);
      }
    }
  }
}

// ── 4. SOMETHING OTHER THAN A PAGE VIEW ASKS ────────────────────────────────────────────────────
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
