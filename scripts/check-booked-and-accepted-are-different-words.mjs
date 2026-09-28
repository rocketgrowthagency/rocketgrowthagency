#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — "BOOKED" AND "ACCEPTED" ARE TWO FACTS, AND MUST NOT BE SPOKEN AS ONE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * 2026-09-27. The admin's RSVP line read:
 *
 *     Sent for Mon, Sep 28, 10:00 AM — no answer yet. NOT BOOKED until they accept.
 *
 * At that exact moment the client's portal said **"Confirmed · This one is in the diary"**, our own
 * ledger held the row as `status: "booked"`, and the card directly above the line said *"the meeting
 * already in your diary"*. Chris had both screens open.
 *
 * 🔑 A Google Calendar event exists from the instant the invite is sent, and it holds the slot
 * whether or not anyone clicks Yes. So:
 *   · **Booked**   = the event exists and the time is held.  (true as soon as the invite goes out)
 *   · **Accepted** = they have said they are coming.          (true only after they RSVP)
 * Conflating them is what made one screen contradict another — and made `accepted` read as though
 * the call had not been booked a moment earlier.
 *
 * WHAT IS PINNED:
 *   1. No RSVP state may assert the call is NOT booked. The awaiting/tentative states describe
 *      attendance, never the existence of the booking.
 *   2. The `accepted` state may not claim to be the moment the call became booked.
 *   3. The portal's own confirmed copy still says the call is in the diary — so the two surfaces are
 *      checked against each other, not each against my memory of the other.
 *
 * Exit 0 pass · 1 fail · 2 indeterminate. Mutation log at the bottom.
 */
import fs from "node:fs";
import path from "node:path";

const WEB = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const fail = [], indet = [], pass = [];

function read(rel) {
  const p = path.join(WEB, rel);
  if (!fs.existsSync(p)) { indet.push(`${rel} does not exist`); return null; }
  const s = fs.readFileSync(p, "utf8");
  if (s.length < 5000) { indet.push(`${rel} is only ${s.length} bytes — not the bundle`); return null; }
  return s;
}

const admin = read("admin/admin.js");
const portal = read("portal/portal.js");

// ── 1 + 2. THE ADMIN'S RSVP COPY ────────────────────────────────────────────────────────────────
if (admin) {
  const at = admin.indexOf("const COPY = {");
  if (at < 0) {
    indet.push("admin/admin.js: could not find the RSVP COPY map");
  } else {
    let d = 0, end = -1;
    for (let i = admin.indexOf("{", at); i < admin.length; i++) {
      if (admin[i] === "{") d++;
      else if (admin[i] === "}") { d--; if (d === 0) { end = i; break; } }
    }
    const lit = end > 0 ? admin.slice(at, end + 1) : "";
    if (!lit) { indet.push("admin/admin.js: could not brace-match the RSVP COPY map"); }
    else {
      // 🔴 THE EXACT SENTENCE THAT CONTRADICTED THE PORTAL, and its near neighbours. A state that
      // describes ATTENDANCE must not make a claim about whether the meeting exists.
      const DENIES_BOOKING = [
        /not booked/i,
        /isn.t booked/i,
        /not a confirmed booking/i,
        /no booking until/i,
      ];
      const hit = DENIES_BOOKING.find((re) => re.test(lit));
      if (hit) {
        const line = lit.split("\n").find((l) => hit.test(l)) || "";
        fail.push(`admin/admin.js — an RSVP state denies the call is booked: "${line.trim().slice(0, 120)}". `
          + `The event exists and holds the slot from the moment the invite is sent; the portal is `
          + `telling the client "Confirmed · in the diary" at the same time. Describe ATTENDANCE here.`);
      } else pass.push("admin/admin.js — no RSVP state denies that the call is booked");

      // 🔑 And `accepted` must not claim to be the moment it BECAME booked.
      // 🔑 A TEMPLATE LITERAL HERE CONTAINS NESTED BACKTICKS — `${when ? ` for …` : ""}` — so
      // /`[^`]*`/ truncates at the inner one and the value read is a fragment. Slice from the key to
      // the next key instead, which is the real boundary in this object.
      // → feedback_a_gate_window_measured_in_characters_will_lie
      const valueOf = (key) => {
        const m = lit.match(new RegExp(`\\n\\s*${key}:\\s*`));
        if (!m) return "";
        const from = m.index + m[0].length;
        const rest = lit.slice(from);
        const next = rest.search(/\n\s+[a-z_]+:\s/);
        return (next > 0 ? rest.slice(0, next) : rest).trim();
      };
      const acc = valueOf("accepted");
      if (!acc) indet.push("admin/admin.js: could not isolate the `accepted` RSVP copy");
      else if (/the call is booked|now booked|booked now/i.test(acc)) {
        fail.push(`admin/admin.js — the accepted state says the call IS booked as though it were not `
          + `before: ${acc.slice(0, 120)}. Accepting confirms ATTENDANCE, not the booking.`);
      } else pass.push("admin/admin.js — accepting confirms attendance, not the booking");

      // The awaiting state still has to say something is outstanding, or the fix has gone too far.
      // 🔴 STRIP THE KEY BEFORE TESTING THE VALUE. The first version tested the whole match, which
      // begins `awaiting:` — so an alternation containing /awaiting/ matched the key name and the
      // check could never fail. A gate that reads its own label is not reading the copy.
      // → feedback_a_gate_that_cannot_fail
      const aw = valueOf("awaiting");
      if (!aw) indet.push("admin/admin.js: could not isolate the `awaiting` RSVP copy");
      else if (!/not accepted|no answer|not confirmed|not replied|has not/i.test(aw)) {
        fail.push(`admin/admin.js — the awaiting state no longer says anything is outstanding: `
          + `"${aw.slice(0, 120)}". It must still be clear they have not replied.`);
      } else pass.push("admin/admin.js — awaiting still says they have not replied");
    }
  }
}

// ── 3. THE OTHER SURFACE, READ RATHER THAN REMEMBERED ───────────────────────────────────────────
// 🔑 The contradiction is only a contradiction because the PORTAL says the opposite. Assert that,
// instead of trusting my recollection of what the portal says.
// → feedback_a_client_message_must_agree_with_itself
if (portal) {
  // 🔑 Ignore comments: "in the diary" also appears in a comment ABOUT this copy, so scanning the
  // whole file found the premise intact after the real sentence had been changed.
  const code = portal.replace(/^[ \t]*\/\/.*$/gm, "");
  // 🔑 PIN THE CLAIM, NOT THE WORDING. This checked for the literal phrase "in the diary" — and when
  // that copy was rewritten on 2026-09-27 ("diary" is British; the clients are American) the gate
  // went INDETERMINATE and said so, which is the behaviour I wanted. But a premise expressed as one
  // exact sentence will do that on every innocent edit. What matters is that the portal TELLS THE
  // CLIENT THE CALL IS SETTLED, however it words it — that is what makes the admin saying
  // "not booked" a contradiction. → feedback_a_gate_must_pin_the_property_not_the_spelling
  const ASSERTS_BOOKED = /locked in|in the diary|is booked|in your calendar|on your calendar/i;
  if (!ASSERTS_BOOKED.test(code)) {
    indet.push("portal/portal.js: the confirmed-kickoff copy no longer asserts the call is settled in "
      + "ANY of the known wordings — the premise of this gate changed. Re-read both surfaces before "
      + "editing either.");
  } else pass.push("portal/portal.js — still tells the client the confirmed call is settled");
}

for (const p of pass) console.log(`  ✅ ${p}`);
for (const i of indet) console.log(`  ⚠️  INDETERMINATE — ${i}`);
for (const f of fail) console.log(`  🔴 ${f}`);
if (fail.length) { console.log(`\n🔴 FAIL — ${fail.length} contradiction(s) between what the admin and the portal say.`); process.exit(1); }
if (indet.length) { console.log(`\n⚠️  INDETERMINATE — ${indet.length} thing(s) this gate could not read. Not a pass.`); process.exit(2); }
console.log(`\n✅ booked and accepted are described as two different facts (${pass.length} checks).`);

/* MUTATION LOG — filled in below. */
