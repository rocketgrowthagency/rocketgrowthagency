// check-the-join-link-is-the-invites-link.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 A SECOND MEETING LINK WOULD BE A SECOND MEETING. Chris asked, 2026-09-28, "this is the same
// link as the calendar invite?" — and then "can we add a join meet in the client portal too."
//
// It is the same link precisely because nothing mints one: `send-kickoff-invite` reads
// `ev.hangoutLink` off the Google event it created with conferenceDataVersion=1, and every surface
// reads that one stored value. The day something calls Meet itself, or builds a URL from a room
// code, the client and RGA can end up in different rooms at the same time — and each would see a
// working link and an empty room.
//
// 🔑 This pins the PROVENANCE, not the spelling: one writer, off the invite's own event.
// → feedback_a_client_message_must_agree_with_itself
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = (...p) => path.join(SITE, ...p);
const pass = [], fail = [];
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null);

// ── 1. ONE WRITER, AND IT COPIES THE EVENT'S OWN LINK ──────────────────────────────────────────
const invite = read(F("netlify", "functions", "send-kickoff-invite.js"));
if (!invite) { console.error("⚠️  INDETERMINATE — send-kickoff-invite.js not found."); process.exit(2); }
if (!/meet_link:\s*ev\.hangoutLink/.test(invite))
  fail.push("netlify/functions/send-kickoff-invite.js — meet_link is no longer copied from the calendar event's own hangoutLink, so the portal and the invite can name different rooms.");
else pass.push("the stored link is the calendar event's own hangoutLink");
if (!/conferenceDataVersion=1/.test(invite))
  fail.push("netlify/functions/send-kickoff-invite.js — conferenceDataVersion=1 is gone; Google will not mint a Meet link at all and every join button becomes dead.");
else pass.push("the event is created with a conference attached");

// 🔴 Nothing may invent a room. A hand-built meet.google.com URL is the failure this gate exists for.
for (const [rel, src] of [
  ["portal/portal.js", read(F("portal", "portal.js"))],
  ["admin/admin.js", read(F("admin", "admin.js"))],
  ["netlify/functions/kickoff-availability.js", read(F("netlify", "functions", "kickoff-availability.js"))],
]) {
  if (!src) continue;
  const code = src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  if (/["'`]https:\/\/meet\.google\.com/.test(code))
    fail.push(`${rel} — builds a meet.google.com URL itself instead of using the link the invite stored. Two links means two rooms.`);
}
if (!fail.some((f) => /meet\.google\.com URL itself/.test(f))) pass.push("no surface builds its own Meet URL");

// ── 2. THE PORTAL ONLY OFFERS IT ONCE THE TIME IS CONFIRMED ────────────────────────────────────
const avail = read(F("netlify", "functions", "kickoff-availability.js"));
if (!avail) fail.push("netlify/functions/kickoff-availability.js is missing.");
else {
  // 🔴 THIS USED TO READ ONE LINE — `meetLink:[^\n]*` — and demand the literal `status === "booked"`
  // on it. meetLink became a multi-line IIFE (authuser pinning, 09-30) and the check fell off the
  // end of the first line: it reported a guard that was there all along. Worse, a one-line regex
  // could never have seen the REAL defect, which was WHICH hold the guard was reading.
  // So: RUN the expressions out of the file, over the states a client can actually be in.
  // → feedback_a_gate_must_pin_the_property_not_the_spelling · feedback_a_gate_that_it_exists_is_not_a_gate_that_it_works
  const grab = (key) => {
    const i = avail.indexOf(`${key}: (() => {`);
    if (i < 0) return null;
    let d = 0, j = avail.indexOf("{", i + key.length);
    for (; j < avail.length; j++) { if (avail[j] === "{") d++; else if (avail[j] === "}") { d--; if (!d) break; } }
    const end = avail.indexOf("(),", j);
    return end < 0 ? null : avail.slice(i + key.length + 2, end + 2);
  };
  const srcLink = grab("meetLink"), srcCode = grab("meetCode");
  if (!srcLink) {
    fail.push("netlify/functions/kickoff-availability.js — the portal is no longer sent a meetLink, so the client has no way into the call from the page.");
  } else {
    let link, code;
    try {
      link = new Function("mine", "onb", `return ${srcLink};`);
      code = srcCode ? new Function("mine", "onb", `return ${srcCode};`) : () => null;
    } catch (e) { fail.push(`kickoff-availability.js — meetLink/meetCode will not execute: ${e.message}`); }
    if (link) {
      const onb = [{ data: { kickoff_invite: { meet_link: "https://meet.google.com/abc-defg-hij", attendee: "owner@acme.com" } } }];
      const BOOKED = { status: "booked", slot_start: "2026-10-08T21:00:00Z" };
      const EARLIER_REQ = { status: "requested", slot_start: "2026-10-07T17:00:00Z" };
      const cases = [
        ["a confirmed booking", [BOOKED], true],
        ["a request nobody has confirmed", [EARLIER_REQ], false],
        // 🔴 THE ONE THAT WAS BROKEN. `mine` is ordered by slot_start, so a client asking to move a
        // confirmed call to an EARLIER time put the REQUEST at mine[0]; a guard reading mine[0]
        // returned null and took the Join button off a call that is still the agreed one.
        ["an earlier request alongside a standing booking (a MOVE)", [EARLIER_REQ, BOOKED], true],
        ["no holds at all", [], false],
      ];
      for (const [what, mine, wantLink] of cases) {
        let got, gotCode;
        try { got = !!link(mine, onb); gotCode = code(mine, onb); }
        catch (e) { fail.push(`kickoff-availability.js — meetLink threw on ${what}: ${e.message}`); continue; }
        if (got !== wantLink) {
          fail.push(wantLink
            ? `kickoff-availability.js — with ${what} the client is given NO join link, for a call that IS agreed.`
            : `kickoff-availability.js — with ${what} a join link is returned, handing them a room for a time nobody has agreed.`);
        }
        if (!!gotCode !== wantLink) {
          fail.push(`kickoff-availability.js — with ${what} the dial-in code disagrees with the join button; two ways into one room must not disagree.`);
        }
      }
    }
  }
  if (!fail.some((f) => /kickoff-availability\.js/.test(f))) pass.push("the link, and the code, are sent only for a booking that is confirmed — including while a move is pending");
}
const portal = read(F("portal", "portal.js"));
if (!portal) fail.push("portal/portal.js is missing.");
else {
  // 🔴 THIS PINNED THE SPELLING `confirmed && meetLink`, and broke the day the gate got STRICTER:
  // the condition became `joinable`, which is confirmed AND inside the call's time window. A gate
  // that names an expression cannot tell a tightening from a removal.
  // 🔑 Pin the PROPERTY: the link renders only behind a condition, and that condition must require
  // both a confirmed booking and the call not having ended.
  // → feedback_a_gate_must_pin_the_property_not_the_spelling
  // 🔑 The join moved ONTO the countdown card and gained a modifier class, so an exact-class match
  // stopped finding it. Match the class as a PREFIX. → feedback_a_gate_must_pin_the_property_not_the_spelling
  // 🔑 Whitespace-tolerant: the markup wraps across lines now that the join sits on the countdown
  // card. A regex that assumes one line is pinning formatting, not behaviour.
  const joinRender = portal.match(/(\w+) && meetLink\s*\?\s*`<a class="pm-join[^"]*"/);
  if (!joinRender)
    fail.push("portal/portal.js — the join control is not gated on a link existing; it can render a dead button.");
  else {
    const cond = joinRender[1];
    const decl = new RegExp(`const ${cond} = ([^;]+);`).exec(portal);
    const src = cond === "confirmed" ? "confirmed" : (decl ? decl[1] : "");
    if (!/confirmed/.test(src))
      fail.push(`portal/portal.js — the join control's condition (\`${cond}\`) does not require a CONFIRMED booking, so it can offer a room for a time nobody agreed.`);
    else if (cond !== "confirmed" && !/ended|Date\.now\(\)/.test(src))
      fail.push(`portal/portal.js — the join control's condition (\`${cond}\`) is not time-aware, so it survives the end of the call.`);
    else pass.push("the portal renders the join only for a confirmed booking, inside its time window");
  }
  const css = read(F("portal", "portal.css")) || "";
  if (!/\.pm-join\{/.test(css)) fail.push("portal/portal.css — .pm-join has no styling, so the join control renders as a bare link.");
  else pass.push("the join control is styled");
}

for (const p of pass) console.log(`  ✅ ${p}`);
if (fail.length) {
  console.error(`\n🔴 FAIL — ${fail.length} problem(s) with the join link:`);
  for (const f of fail) console.error(`   • ${f}`);
  process.exit(1);
}
console.log(`\n✅ one event, one room: every surface joins the link the invite carries (${pass.length} checks).`);
