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
  // 🔑 Anchor on the CARD ELEMENT, not the data attribute. The attribute now sits inside the
  // returned template, so walking back from it lands on an interpolation rather than the guard.
  const at = portal.indexOf('<div class="pm-cd ');
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
// 🔑 v2 (2026-10-08, admin_kickoff_call_v1.html): the admin no longer repeats the client's countdown
// CARD on Overview — its countdown lives in step 4's console and the Your action card. What this gate
// exists for is unchanged: THE SAME WORDS. So the admin's countdown text must come from the shared
// formatter, both when it renders and when it ticks.
{
  const fn = (admin.match(/function kickoffStartsIn\([^)]*\) \{[\s\S]*?\n\}/) || [""])[0];
  if (!/kickoffCountdown\(/.test(fn)) fail.push("admin/admin.js — the console's countdown is not written by the shared formatter, so it can name the call differently from the client's card.");
  else pass.push("the admin's countdown text comes from the shared formatter");
  if (!/data-kc-countdown>(' \+ |\$\{)escapeHtml\(kickoffStartsIn\(/.test(admin)) /* v3 console is a template literal (2026-10-09) */ fail.push("admin/admin.js — the console renders its countdown without the shared formatter.");
  else pass.push("the console renders its countdown in the shared words");
  if (!/el\.textContent = kickoffStartsIn\(/.test(admin)) fail.push("admin/admin.js — the console's ticker writes its own words, so the countdown drifts from the client's as it ticks.");
  else pass.push("the console's ticker keeps the shared words");
}

for (const [rel, src] of [["portal/portal.js", portal]]) {
  const m = src.match(/setInterval\(\(\) => \{[\s\S]*?data-kickoff-countdown[\s\S]*?\n\}, \d+\);/);
  if (!m) { fail.push(`${rel} — nothing ticks the countdown, so it freezes at whatever it said when the card rendered.`); continue; }
  if (/render\w*\(/.test(m[0]))
    fail.push(`${rel} — the countdown's timer re-renders instead of patching text; a timer that re-renders is how this page hung once already.`);
  else pass.push(`${rel} ticks by patching text, not by re-rendering`);
  if (!/getAttribute\("data-kickoff-countdown"\)/.test(m[0]))
    fail.push(`${rel} — the timer does not read the start time from the element, so it can keep counting to a booking that has since moved.`);
  else pass.push(`${rel} reads the start time from the element it is updating`);
}

// ── 4. JOIN ONLY WHEN IT IS TIME, AND THE TONE MEANS SOMETHING ─────────────────────────────────
// 🔒 Chris, 2026-09-29: "dont put join the call until its time. just countdown until the time of the
// call then when call is ready put join." A way in offered before there is anything to join is an
// invitation to sit alone in a room.
{
  const join = portal.match(/const joinable = [^;]+;/);
  if (!join) fail.push("portal/portal.js — the join gate is gone.");
  else if (/startMs - \d+/.test(join[0]))
    fail.push("portal/portal.js — the join link appears BEFORE the call starts; it may only appear once it is time.");
  else if (!/Date\.now\(\) >= startMs/.test(join[0]))
    fail.push("portal/portal.js — the join link is not gated on the call having started.");
  else pass.push("the join link appears only once the call has started");
}
// 🔴 TONAL BY PROXIMITY, NOT ALWAYS RED. Red for a call three days out is an alarm about nothing,
// and teaches a client to ignore the next red thing that matters. → reference_backend_design_system
// 🔴 SCOPED TO THE RENDER BLOCK. Both of these strings also appear in the TICKER, so a whole-file
// search passed even with the render's tone and threshold deleted. A check about what is drawn must
// read what is drawn. → feedback_an_inventory_is_a_claim_about_what_i_thought_to_grep
for (const [rel, src, cls] of [["portal/portal.js", portal, "pm-cd"]]) {
  const at = src.indexOf(`<div class="${cls} `);
  if (at < 0) { fail.push(`${rel} — the countdown card is not rendered with a tone class, so it cannot say how close the call is.`); continue; }
  const block = src.slice(src.lastIndexOf("${", at), at + 40);
  if (!new RegExp(`${cls} \\$\\{tone\\}`).test(block))
    fail.push(`${rel} — the countdown card renders a fixed tone, so it looks the same whether the call is in ten minutes or ten days.`);
  else if (!/4 \* 3600000/.test(block))
    fail.push(`${rel} — the countdown's tone is not chosen by proximity, so red would mean nothing.`);
  else pass.push(`${rel} tunes the countdown's tone by how close the call is`);
}

// ── 5. THE HERO SURVIVES ITS CONTAINER ─────────────────────────────────────────────────────────
// 🔴🔴 THE ADMIN CARD SHIPPED WITH THE RIGHT BACKGROUND AND A SMALL GREY NUMBER (2026-09-29).
// It renders inside `.pm-outcome`, whose `.pm-outcome p { font-size:13px; color:muted }` is
// specificity (0,1,1) — one class plus one element — and therefore BEAT a bare `.kc-cd-big` at
// (0,1,0). The tone applied; the hero did not. Chris spotted it against the mockup.
//
// 🔑 A nested card inherits its container's ELEMENT rules. Every part of a card that lives inside
// another card must be scoped by its own card class, so two classes (0,2,0) win — and without
// naming the container, which would tie the component to where it happens to sit.
{
  const css = {
    "admin/admin.css": fs.readFileSync(F("admin", "admin.css"), "utf8"),
    "portal/portal.css": fs.readFileSync(F("portal", "portal.css"), "utf8"),
  };
  const parts = [["portal/portal.css", "pm-cd"]];
  for (const [rel, cls] of parts) {
    for (const part of ["big", "lab"]) {
      const scoped = new RegExp(`\\.${cls} \\.${cls}-${part}\\s*\\{`).test(css[rel]);
      const bare = new RegExp(`(^|[^ ])\\.${cls}-${part}\\s*\\{`, "m").test(css[rel]);
      if (!scoped && bare)
        fail.push(`${rel} — .${cls}-${part} is styled unscoped, so any container rule like ".card p" outranks it and the hero silently loses its size.`);
    }
  }
  if (!fail.some((f) => /is styled unscoped/.test(f))) pass.push("the countdown's parts outrank their container's element rules");

  // 🔑 And both cards carry the same three parts — label, number, date.
  for (const [rel, src, cls] of [["portal/portal.js", portal, "pm-cd"]]) {
    for (const part of ["lab", "big", "sub"]) {
      if (!new RegExp(`${cls}-${part}`).test(src))
        fail.push(`${rel} — the countdown card has no ${part === "sub" ? "date line" : part === "big" ? "number" : "label"}; the two portals no longer show the same component.`);
    }
  }
  if (!fail.some((f) => /no longer show the same component/.test(f))) pass.push("both cards carry the same three parts");
}

for (const p of pass) console.log(`  ✅ ${p}`);
if (fail.length) {
  console.error(`\n🔴 FAIL — ${fail.length} problem(s) with the kickoff countdown:`);
  for (const f of fail) console.error(`   • ${f}`);
  process.exit(1);
}
console.log(`\n✅ both portals count down to the same call, in the same words (${pass.length} checks).`);
