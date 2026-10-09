#!/usr/bin/env node
/**
 * check-messages-have-a-shape.mjs — no client-facing message is a loose grey sentence.
 *
 * ─── WHY ─────────────────────────────────────────────────────────────────────────────────────────
 * Chris, 2026-09-25: *"any messages need to be in pill or sometype of way as this is just text
 * everywhere and not clean and organized enough."*
 *
 * The real defect was not ugliness. Four different KINDS of message looked identical — a permanent
 * fact, a thing the client just did, an error, and an instruction were all the same grey sentence —
 * so none of them could be told apart without reading all of them.
 *
 * The approved system (reports/mockups/portal_message_system_v1.html) is five shapes and one rule:
 *
 *   always true            → .pm-chip
 *   you just did it        → .pm-msg      (+ .ok / .bad / .wait / .busy)
 *   longer standing caveat → .pm-note
 *   happened and persists  → .pm-outcome
 *   the pane is empty      → .pm-prompt
 *
 * 🔴 THIS GATE'S JOB IS THE EROSION, NOT THE INITIAL BUILD. The build is done; what it prevents is
 * the next message being written as a bare <p> because that was quicker. A system with one
 * exception is not a system.
 *
 * Exit 0 = every shape exists and nothing reverted · 1 = a message lost its shape · 2 = cannot tell.
 */
import fs from "node:fs";
import path from "node:path";

// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT. A gate that can only ever read the real
// working tree cannot be pointed at a scratch copy, so its mutations cannot be run — and a
// gate nobody can make fail is a gate nobody has checked. Found 2026-10-06 when three
// mutations of `check-refusal-is-not-done` all came back green: it was reading straight past
// them. → feedback_a_gate_that_cannot_fail · feedback_the_harness_i_wrote_to_check_my_work_can_lie
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SITE = process.env.SITE_DIR || `${__SITE}`;
const JS = path.join(SITE, "portal/portal.js");
const CSS = path.join(SITE, "portal/portal.css");
const MOCK = path.join(SITE, "reports/mockups/portal_message_system_v1.html");

for (const f of [JS, CSS]) {
  if (!fs.existsSync(f)) { console.log(`  ⚠️  ${f} is missing — cannot judge.`); process.exit(2); }
}
const js = fs.readFileSync(JS, "utf8");
const css = fs.readFileSync(CSS, "utf8");
const code = js.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const fail = [];
console.log("── every message has a shape ──");

// 1 ─ all five shapes exist in CSS, or the classes below are decoration
const SHAPES = ["pm-chip", "pm-msg", "pm-note", "pm-outcome", "pm-prompt"];
for (const shape of SHAPES) {
  if (!new RegExp(`\\.${shape}\\s*\\{`).test(css)) {
    fail.push(`.${shape} has no rule — a message using it would render as unstyled text, which is what this replaced`);
  }
}
// the four tones of the status pill; without them .bad and .ok look the same
for (const tone of ["ok", "bad", "wait", "busy"]) {
  if (!new RegExp(`\\.pm-msg\\.${tone}\\s*\\{`).test(css)) {
    fail.push(`.pm-msg.${tone} has no rule — that state would be indistinguishable from the others`);
  }
}

// 2 ─ 🔴 THE SENTENCES THAT WERE CONVERTED MUST NOT COME BACK AS SENTENCES.
//     Each entry: the string, and the shape that must be within reach of it.
const CONVERTED = [
  { text: "30 min", shape: "pm-chip", was: "30 minutes. Times shown in …" },
  { text: "Pick a date", shape: "pm-prompt", was: "Pick a highlighted date to see the times available." },
  { text: "No open times", shape: "pm-prompt", was: "a bare paragraph" },
  { text: "Requested", shape: "pm-outcome", was: "two stacked paragraphs" },
  { text: "still to answer", shape: "pm-msg", was: "Saved as you go. N of M still to answer." },
  { text: "Loading available times", shape: "pm-msg", was: "a grey is-muted line" },
];
for (const { text, shape, was } of CONVERTED) {
  // 🔴 EVERY OCCURRENCE, NOT THE FIRST. Both "30 min" and "still to answer" appear earlier in
  // unrelated places — a summary badge, a step's own hint — so judging only `indexOf` failed
  // working code twice on this gate's first run. The claim is "this message appears in its shaped
  // form somewhere", so ANY occurrence carrying the shape satisfies it.
  const hits = [];
  for (let i = code.indexOf(text); i !== -1; i = code.indexOf(text, i + 1)) hits.push(i);
  if (!hits.length) continue;          // copy may legitimately change; only judge what is present
  // 🔑 Look in the enclosing TEMPLATE, not a fixed character window — a window lands mid-expression
  // and that mistake has produced false failures repeatedly.
  // → feedback_a_gate_window_measured_in_characters_will_lie
  const shaped = hits.some((i) => {
    const open = code.lastIndexOf("`", i);
    const close = code.indexOf("`", i);
    const region = code.slice(Math.max(0, open - 900), close === -1 ? i + 600 : close + 300);
    return region.includes(shape);
  });
  if (!shaped) {
    fail.push(`"${text}" is rendered without ${shape} — it was ${was}, and a bare sentence is what the message system replaced`);
  }
}

// 3 ─ the old classes must stay gone, or two systems coexist
for (const dead of ["pm-in-msg", "kc-tz", "fct-note", "fct-done"]) {
  if (new RegExp(`class="[^"]*\\b${dead}\\b`).test(code)) {
    fail.push(`${dead} is being rendered again — the pre-system message class is back alongside the new one`);
  }
}

// 4 ─ 🔴 A PILL CARRIES A DOT ELEMENT, so it cannot be filled with textContent. Anything that
//     writes one through innerHTML must escape, because these strings include API error text.
{
  const writes = [...code.matchAll(/innerHTML\s*=\s*`<span class="dot">[\s\S]{0,200}?`/g)].map((m) => m[0]);
  for (const w of writes) {
    if (/\$\{(?!escapeHtml|ICON_)/.test(w)) {
      fail.push("a status pill interpolates an unescaped value through innerHTML — error text from an API is not trusted markup");
    }
  }
}

// 5 ─ the shapes must still match the approved mockup's names (a rename here is a silent fork)
if (fs.existsSync(MOCK)) {
  const mock = fs.readFileSync(MOCK, "utf8");
  for (const [live, inMock] of [["pm-chip", "m-chip"], ["pm-msg", "m-pill"], ["pm-note", "m-note"],
                                ["pm-outcome", "m-out"], ["pm-prompt", "m-prompt"]]) {
    if (!mock.includes(inMock)) {
      console.log(`  ⚠️  the approved mockup no longer defines .${inMock} (live .${live}) — re-approve before trusting this check.`);
      process.exit(2);
    }
  }
} else {
  console.log("  ⚠️  the approved mockup is missing — cannot confirm the shapes still match it.");
  process.exit(2);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 A CONTROL HAS A KIND TOO, AND A ROW OF PEERS HIDES IT.
//
// Chris, 2026-09-26, on the admin kickoff card: *"should all these links be pills? whats best
// deisgn"*. Pills were the wrong answer — on that card a pill already MEANS state ("They asked
// for"), so re-using the shape for controls would collide with the system this gate protects, and
// pills read LOUDER, which is backwards for settings.
//
// The real defect was the same one as the messages: SIX peer links were four different kinds —
// a setting, a repair, a navigation link, and an alternative to an action — all identical, so none
// could be told apart without reading all six.
//
// 🔑 What this locks is the GROUPING, not the pixels: every control in that row lives in a labelled
// group, the repair is not a peer of the settings, and the reconnect duplicate does not come back.
// → feedback_a_message_needs_a_shape · feedback_the_escape_hatch_stays_in_the_product
// ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  const ADMIN_JS = path.join(SITE, "admin/admin.js");
  const ADMIN_CSS = path.join(SITE, "admin/admin.css");
  if (!fs.existsSync(ADMIN_JS) || !fs.existsSync(ADMIN_CSS)) {
    console.log("  ⚠️  admin/admin.js or admin.css missing — cannot judge the control grouping.");
    process.exit(2);
  }
  const aj = fs.readFileSync(ADMIN_JS, "utf8").replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const ac = fs.readFileSync(ADMIN_CSS, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

  // 🔄 RE-PINNED 2026-10-09 (approved kickoff_booking_card_v3). Chris replaced the 09-26 three-column footer: the
  // setup links were about MAKING a booking and stayed after the call, step 1's confirmation email did not belong
  // on this card, and the status line repeated the pill. What stays locked is the PROPERTY: the controls are not
  // one undifferentiated row of peers — they live in ONE labelled fold, and the repair sits apart, last.
  // 1 ─ one labelled fold, and the flat row has not come back
  if (!/<details class="pm-settings pm-settings-fold"/.test(aj) || !/<summary>Booking settings<\/summary>/.test(aj)) {
    fail.push("the kickoff card's controls are not in the Booking settings fold — they would be back to a row of peers under the card");
  }
  if (/class="pm-settings-row"/.test(aj)) {
    fail.push("the flat .pm-settings-row is being rendered again — that is the six-peer-links layout this replaced");
  }
  // 2 ─ the repair is not a peer: it sits on its own line, after the settings, inside the fold
  if (!/class="pm-set-rep">[^<]*<button class="mod-quiet" type="button" data-rga-google-connect="1">Reconnect Google<\/button>/.test(aj)) {
    fail.push("Reconnect Google is not on its own quiet line inside Booking settings — it is a repair, not a peer of the settings");
  }
  if (/data-send-confirmation="\$\{escapeAttribute\(client\.id\)\}">Send it</.test(aj)) {
    fail.push("step 1's confirmation email is back on the kickoff card — it belongs to step 1 (kickoff_booking_card_v3)");
  }
  {
    // 🔴 ONE CARD, ONE RIGHT EDGE (2026-09-26) — still true of the shapes inside the card.
    for (const cls of ["pm-note", "pm-outcome"]) {
      const ri = ac.indexOf(`.${cls}{`);
      if (ri === -1) continue;
      const rule = ac.slice(ri, ac.indexOf("}", ri));
      if (/max-width:\s*\d+ch/.test(rule)) {
        fail.push(`.${cls} has a ch-based max-width in admin.css — inside the kickoff card that produces a right edge `
          + "that does not line up with the outcome box above it or the footer below it");
      }
    }
  }

  // 3 ─ 🔴 THE REPAIR MUST STAY REACHABLE. Removing it entirely would strand Chris if RGA's Google
  //     auth lapses before any invite exists. → feedback_the_escape_hatch_stays_in_the_product
  if (!/data-rga-google-connect/.test(aj)) {
    fail.push("nothing offers Reconnect Google any more — if RGA's Google auth lapses there is no way back into the product");
  }

  // 4 ─ ...but exactly once on this card. It used to appear twice: in the settings row AND on the
  //     "No invite sent yet" line, where it read as a fault report for a card in good order.
  if (/not_sent[\s\S]{0,400}?\?\s*connect/.test(aj) || /"not_sent"\s*\?\s*connect/.test(aj)) {
    fail.push("the RSVP line offers Reconnect on `not_sent` again — that state means 'you have not pressed Confirm yet', not 'Google is broken', and it duplicates the settings-row control");
  }

  // 5 ─ every class the new row renders must actually have a rule, declared ONCE
  // 🔑 BASE DECLARATIONS ONLY — anchored to start-of-line. The loose form counted the `@media`
  // responsive override (`  .pm-set-repair{margin-left:0}`) as a duplicate and failed the clean
  // tree. A media-query override is the opposite of a collision: it is scoped on purpose.
  // 🔄 2026-10-09: the classes the Booking settings fold renders (kickoff_booking_card_v3)
  for (const cls of ["pm-settings", "pm-set-links"]) {
    const decls = (ac.match(new RegExp(`^\\.${cls}\\{`, "gm")) || []).length;
    if (decls === 0) fail.push(`.${cls} is rendered but has no rule — the group would collapse to unstyled text`);
    if (decls > 1) fail.push(`.${cls} is declared ${decls} times — a duplicate selector is not an override, it is a coin toss (this exact mistake shipped column-then-row on .pm-set-group)`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴🔴 A DIALOG HAS A KIND TOO — AND ALL 57 LOOKED IDENTICAL.
//
// Chris, 2026-09-26: *"can we make these popups better designed. send mockup for ALL popups using
// our new design"* → approved, built (reports/mockups/dialog_system_v1.html).
//
// "Delete this note?" and "this GOOGLE EMAILS the client the invitation immediately" were the same
// grey paragraph with the same two buttons. The only thing separating a reversible internal tidy-up
// from an irrevocable message to a paying client was SHOUTING IN CAPITALS inside the prose.
//
// 🔑 What this locks is the VOCABULARY, not the pixels: four kinds exist, orange still means "it
// leaves the building" on both sides, the dialog that emails a client declares itself explicitly
// rather than trusting a regex, and a result dialog never grows a second button.
// → feedback_a_control_has_a_kind_like_a_message_does · feedback_a_message_needs_a_shape
// ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  const ADMIN_JS = path.join(SITE, "admin/admin.js");
  const ADMIN_CSS = path.join(SITE, "admin/admin.css");
  const aj = fs.readFileSync(ADMIN_JS, "utf8").replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const ac = fs.readFileSync(ADMIN_CSS, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

  // 1 ─ the four kinds exist on both sides
  for (const k of ["routine", "outward", "danger", "result"]) {
    if (!new RegExp(`\\b${k}\\s*:`).test(aj.slice(aj.indexOf("RGA_DIALOG_KIND"), aj.indexOf("RGA_DIALOG_KIND") + 600))) {
      fail.push(`the admin dialog has no "${k}" kind — without it that class of dialog is indistinguishable from the rest, which is the defect this replaced`);
    }
  }
  if (!/PORTAL_MODAL_KIND/.test(code)) {
    fail.push("the portal modal has no kind map — the client's dialogs would drift back to one grey paragraph while the admin's have four kinds");
  }

  // 2 ─ 🔴 ORANGE MUST STILL MEAN "IT LEAVES THE BUILDING" on both sides, and must be the SAME
  //     orange the pills/cards already use. A second orange is a second meaning.
  {
    const i = aj.indexOf("RGA_DIALOG_KIND");
    const map = i === -1 ? "" : aj.slice(i, i + 600);
    if (!/outward\s*:\s*\{[^}]*is-turn/.test(map)) {
      fail.push("the admin's `outward` kind is not wired to .is-turn — the dialog that emails a client would not carry the orange that means exactly that everywhere else");
    }
    if (!/\.rga-modal\.is-turn\s*\{[^}]*--pm-turn/.test(ac)) {
      fail.push(".rga-modal.is-turn does not use --pm-turn — a second orange is a second meaning, and the whole point is that this colour says one thing on every surface");
    }
  }

  // 3 ─ 🔴 THE DIALOG THAT EMAILS A CLIENT DECLARES ITSELF. The regex fallback is a safety net for
  //     the other 56 call sites, never the mechanism for the one that costs the most.
  {
    // 🔑 THE DEFINITION, NOT THE FIRST MENTION. `answerKickoffRequest` appears first as a call site
    // in the click handler, ~200 lines above the function — so a window anchored there contains no
    // dialog at all and failed the clean tree. → feedback_a_gate_window_measured_in_characters_will_lie
    const i = aj.indexOf("async function answerKickoffRequest");
    // 🔄 the function's own body, not 1600 chars: a passed-request arm (2026-10-08) pushed the two
    // outward arms past the window. → feedback_a_gate_window_measured_in_characters_will_lie
    const body = i === -1 ? "" : aj.slice(i, aj.indexOf("\n}\n", i) > i ? aj.indexOf("\n}\n", i) : i + 4000);
    if (i === -1) fail.push("answerKickoffRequest is gone — that is the confirm/decline path for a client's kickoff request");
    // 🔑 BOTH ARMS. This is a ternary — confirm AND decline — and each key therefore appears twice.
    // Testing "does it appear at all" let me delete the confirm arm's tone entirely and still pass,
    // because the decline arm's copy satisfied the regex. Count them.
    // → feedback_a_check_must_not_validate_itself
    const tones = (body.match(/tone:\s*["']outward["']/g) || []).length;
    const conseq = (body.match(/consequence\s*:/g) || []).length;
    if (tones < 2) {
      fail.push(`only ${tones} of the 2 kickoff dialogs (confirm / decline) pass tone:'outward' explicitly — these stand between a click and a client's inbox, `
        + "and must not depend on a regex noticing the word 'email' in their copy");
    }
    if (conseq < 2) {
      fail.push(`only ${conseq} of the 2 kickoff dialogs state a consequence — what happens the instant you press must never be buried in the prose`);
    }
  }

  // 4 ─ a RESULT reports; it offers no choice. One button.
  if (!/isAlert\s*\?\s*""\s*:/.test(aj)) {
    fail.push("the admin dialog renders a cancel button on alerts — a dialog that only reports something is offering a choice that does not exist");
  }

  // 5 ─ legacy call sites must keep working: a bare string still splits into title + detail
  if (!/indexOf\("\\n\\n"\)/.test(aj)) {
    fail.push("rgaDialog no longer splits a legacy one-string message on its blank line — all 57 existing call sites pass `title?\\n\\ndetail`, "
      + "so without the split they collapse into one run-on headline");
  }
}

if (fail.length) {
  console.log(`\n🔴 ${fail.length} problem(s):`);
  for (const f of fail) console.log(`    ${f}`);
  console.log("\n   Five shapes, one rule: always true → chip · you just did it → pill ·");
  console.log("   longer caveat → note · happened and persists → outcome · empty pane → prompt.");
  process.exit(1);
}
console.log("  five shapes defined · four pill tones · six converted messages still shaped · no pill interpolates unescaped");
console.log("\n✅ no client-facing message has reverted to a loose sentence.");
process.exit(0);
