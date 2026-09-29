// check-the-countdown-agrees-across-portals.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔒 Chris, 2026-09-29: "can we add a minute and hour countdown timer to kickoff call in both
// portals?" — "on the card itself."
//
// 🔑 A NUMBER THAT MEANS "WHEN IS THIS" MUST READ IDENTICALLY ON BOTH SIDES. Two copies of the
// formatting would be two chances to drift, and one client seeing two answers about one call is the
// exact defect that cost a whole morning that day. So there is ONE shared module and both import it.
//
// 🔴 AND IT COUNTS DOWN TO A CONFIRMED CALL ONLY. Counting down to a time RGA has not accepted
// claims the call is happening — the same false-claim class as everything else fixed that day.
// → project_kickoff_booking_system · feedback_a_client_message_must_agree_with_itself
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = (...p) => path.join(SITE, ...p);
const pass = [], fail = [];
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null);

// ── 1. ONE MODULE, IMPORTED BY BOTH ────────────────────────────────────────────────────────────
const mod = F("shared", "kickoff-countdown.js");
if (!fs.existsSync(mod)) { console.error("🔴 FAIL — shared/kickoff-countdown.js is gone; each portal is formatting the countdown for itself."); process.exit(1); }
for (const [rel, src] of [["portal/portal.js", read(F("portal", "portal.js"))], ["admin/admin.js", read(F("admin", "admin.js"))]]) {
  if (!src) { fail.push(`${rel} is missing.`); continue; }
  if (!/import \{ kickoffCountdown \} from "\/shared\/kickoff-countdown\.js/.test(src))
    fail.push(`${rel} — does not import the shared countdown, so it can format "when is this" differently from the other portal.`);
  else pass.push(`${rel} imports the shared countdown`);
}

// ── 2. IT RUNS, AND SAYS WHAT IT SHOULD ────────────────────────────────────────────────────────
// 🔑 Executed, not read: the whole value of one formatter is the answers it gives.
const { kickoffCountdown } = await import(pathToFileURL(mod).href);
const M = 60000, H = 60 * M, D = 24 * H;
const want = [
  [3 * D + 5 * H, /^In 3 days/, "three days out names days"],
  [5 * H + 12 * M, /^In 5h 12m$/, "hours and minutes, as asked for"],
  [24 * M, /^In 24m$/, "under an hour is minutes alone"],
  [30 * 1000, /^Starting now$/, "under a minute is a word, not a ticking zero"],
  [-5 * M, /^Happening now$/, "during the call it says so"],
  [-45 * M, /^$/, "once it is over it says nothing"],
];
for (const [ms, re, what] of want) {
  const got = kickoffCountdown(ms, 30).text;
  if (!re.test(got)) fail.push(`shared/kickoff-countdown.js — ${what}: got ${JSON.stringify(got)}.`);
}
if (!fail.some((f) => /kickoff-countdown\.js —/.test(f))) pass.push(`the formatter gives the right words across ${want.length} ranges`);

// ── 3. CONFIRMED ONLY, AND IT TICKS WITHOUT RE-RENDERING ───────────────────────────────────────
const portal = read(F("portal", "portal.js")) || "";
const admin = read(F("admin", "admin.js")) || "";
// 🔴 SCOPED TO THE COUNTDOWN'S OWN EXPRESSION. This first searched the WHOLE FILE for the guard —
// and the `joinable` line a few lines above carries the identical condition, so deleting the
// countdown's guard still matched and the check passed. Presence is not location.
// → feedback_an_inventory_is_a_claim_about_what_i_thought_to_grep
{
  const at = portal.indexOf('data-kickoff-countdown="');
  const expr = at < 0 ? "" : portal.slice(portal.lastIndexOf("${", at), at);
  if (!expr)
    fail.push("portal/portal.js — the client card renders no countdown at all.");
  else if (!/confirmed/.test(expr) || !/!ended/.test(expr))
    fail.push("portal/portal.js — the countdown is not gated on a CONFIRMED, unfinished call, so it can count down to a time RGA never accepted.");
  else pass.push("the client card counts down only to a confirmed call");
}
// 🔴🔴 THIS WAS `{0,900}` — A CHARACTER WINDOW, written minutes after gating against them, and it
// went red on correct code because the countdown sits further than 900 characters into the branch.
// Bound by the BRANCH, not by a distance: from `const html = booked ?` to the `:` that begins the
// not-booked arm. → feedback_a_gate_window_measured_in_characters_will_lie
{
  const start = admin.indexOf("const html = booked");
  const elseAt = start < 0 ? -1 : admin.indexOf(': `<div class="pm-prompt">', start);
  const bookedArm = start >= 0 && elseAt > start ? admin.slice(start, elseAt) : "";
  if (!bookedArm)
    fail.push("admin/admin.js — could not isolate the booked arm of the kickoff card; the countdown's placement cannot be judged.");
  else if (!/kickoffCountdown\(/.test(bookedArm))
    fail.push("admin/admin.js — the countdown is not inside the booked branch, so it can render for a call nobody has confirmed.");
  else pass.push("the admin card counts down only to a confirmed call");
}

// 🔴 A timer that re-renders a card is how this codebase got a fetch loop and, separately, a hang.
for (const [rel, src] of [["portal/portal.js", portal], ["admin/admin.js", admin]]) {
  const m = src.match(/setInterval\(\(\) => \{[\s\S]*?data-kickoff-countdown[\s\S]*?\n\}, \d+\);/);
  if (!m) { fail.push(`${rel} — nothing ticks the countdown, so it freezes at whatever it said when the card rendered.`); continue; }
  if (/render\w*\(/.test(m[0]))
    fail.push(`${rel} — the countdown's timer re-renders instead of patching text; a timer that re-renders is how this page hung once already.`);
  else pass.push(`${rel} ticks by patching text, not by re-rendering`);
  if (!/getAttribute\("data-kickoff-countdown"\)/.test(m[0]))
    fail.push(`${rel} — the timer does not read the start time from the element, so it can keep counting to a booking that has since moved.`);
  else pass.push(`${rel} reads the start time from the element it is updating`);
}

for (const p of pass) console.log(`  ✅ ${p}`);
if (fail.length) {
  console.error(`\n🔴 FAIL — ${fail.length} problem(s) with the kickoff countdown:`);
  for (const f of fail) console.error(`   • ${f}`);
  process.exit(1);
}
console.log(`\n✅ both portals count down to the same call, in the same words (${pass.length} checks).`);
