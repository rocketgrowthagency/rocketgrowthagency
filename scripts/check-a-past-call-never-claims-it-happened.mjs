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
try { vm.runInContext(`${fn[0]}\nglobalThis.__r = kickoffRequestedHtml;`, box, { timeout: 4000 }); }
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
if (!/booked && !callOver/.test(code))
  fail.push('portal/portal.js — the next-step banner is not gated on the call still being ahead, so it will read "Next up" about yesterday.');
else pass.push("the banner stops calling a past call next up");
if (!/requested && !callOver/.test(code))
  fail.push('portal/portal.js — an unconfirmed hold whose time has passed still reads "we\'re holding it".');
else pass.push("a lapsed unconfirmed hold stops claiming to be held");

for (const p of pass) console.log(`  ✅ ${p}`);
if (fail.length) {
  console.error(`\n🔴 FAIL — ${fail.length} problem(s) with a call whose time has passed:`);
  for (const f of fail) console.error(`   • ${f}`);
  process.exit(1);
}
console.log(`\n✅ a past call states only what we can prove, and claims it happened only with a recap (${pass.length} checks).`);
