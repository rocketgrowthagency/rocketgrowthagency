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
  const line = avail.match(/meetLink:[^\n]*/);
  if (!line) fail.push("netlify/functions/kickoff-availability.js — the portal is no longer sent a meetLink, so the client has no way into the call from the page.");
  else if (!/status === "booked"/.test(line[0]))
    fail.push('netlify/functions/kickoff-availability.js — meetLink is returned without checking the hold is "booked", so a client could be handed a room for a time nobody has agreed.');
  else pass.push("the link is only sent once the booking is confirmed");
}
const portal = read(F("portal", "portal.js"));
if (!portal) fail.push("portal/portal.js is missing.");
else {
  if (!/confirmed && meetLink \? `<a class="pm-join"/.test(portal))
    fail.push("portal/portal.js — the join control is not gated on the booking being confirmed AND a link existing; one of those missing renders a dead or premature button.");
  else pass.push("the portal renders the join only when confirmed and a link exists");
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
