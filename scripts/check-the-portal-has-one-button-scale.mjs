#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — THE CLIENT PORTAL HAS TWO BUTTON SIZES, AND SIZE CARRIES NO MEANING
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-09-29, looking at four blue buttons down one checklist:
 * *"but the size all sizes should be the same right? go through all buttons and make them all the
 * same right?"* — then: *"go through each card"*.
 *
 * Measured, the portal had **SIX** heights for controls that mean the same thing:
 *
 *     28px  .pm-amend                 Change the time · + Add another
 *     30px  .pm-act / .is-go          Show me how → · Upload photos → · Book another time
 *    ~31px  .pm-btn                   platform chips · Message us
 *    ~37px  .portal-svc-btn/.pm-c-btn Yes, I have it · Sign agreement →
 *     38px  .pm-commit                Send it securely · Save my hours
 *    ~39px  .pm-m-send                Send
 *     40px  .portal-button            Looks good — publish it · Yes, that's mine
 *
 * **Upload photos →**, **Send it securely**, **Save my hours** and **Book another time** are the same
 * idea — the action a step is asking for — and rendered at 30, 38, 38 and 30.
 *
 * 🔑 THE RULE (approved: reports/mockups/portal_one_button_scale_v1.html):
 *   · `--pm-h` **38px / 14px text / 0 18px** — a step's ACTION, and every control in a card's action row
 *   · `--pm-h-sm` **30px / 13px text / 0 12px** — controls that are NOT the step's action
 *   **Size stops carrying meaning; WEIGHT keeps it** — filled is the one thing to do, outline an
 *   alternative, red outline the one that gives something up.
 *
 * WHAT IS PINNED: every control family resolves to one of the two tokens, and to the text size that
 * goes with it. A family that hardcodes a pixel height is a seventh size waiting to happen.
 *
 * 🔴 NOT PINNED: which family a given button belongs to. That is intent, and it lives in each card's
 * own gate. This one only asks whether the scale still has two rungs.
 * → feedback_a_gate_must_pin_the_property_not_the_spelling
 *
 * Exit 0 pass · 1 fail · 2 indeterminate. Mutation log at the bottom.
 */
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const CSS = path.join(SITE, "portal", "portal.css");
const fail = [], indet = [], pass = [];

if (!fs.existsSync(CSS)) { console.error("⚠️  INDETERMINATE — portal.css not found."); process.exit(2); }
const css = fs.readFileSync(CSS, "utf8");
if (css.length < 20000) { console.error(`⚠️  INDETERMINATE — portal.css is only ${css.length} bytes.`); process.exit(2); }

// The two rungs, read from the file rather than assumed — if Chris changes 38 to 40 this follows.
function token(name) {
  const m = css.match(new RegExp("--" + name + "\\s*:\\s*([0-9]+)px"));
  return m ? Number(m[1]) : null;
}
const H = token("pm-h"), HSM = token("pm-h-sm");
if (H == null || HSM == null) {
  fail.push(`portal.css — the scale tokens are gone (--pm-h=${H}, --pm-h-sm=${HSM}). Without them every `
    + `family is free to invent its own height again, which is how six of them appeared.`);
} else if (H <= HSM) {
  fail.push(`portal.css — --pm-h (${H}px) is not larger than --pm-h-sm (${HSM}px); the action size must be the bigger one.`);
} else pass.push(`the scale is two rungs: ${H}px for an action, ${HSM}px for everything quieter`);

// 🔴 READ THE BLOCK THAT ACTUALLY SIZES THE FAMILY, NOT THE FIRST ONE THAT MENTIONS IT.
// `.pm-commit` appears first inside the SHARED base `.pm-act,.pm-commit{…}`, which sets no height —
// so the first version of this gate reported "declares NO min-height" about a family sized correctly
// two rules later. Presence is not location, again. Gather every block whose selector mentions the
// family and merge their declarations. → feedback_a_gate_must_pin_the_property_not_the_spelling
function block(openSel) {
  const name = openSel.trim().replace(/[{,]$/, "").trim();
  let out = "", found = false, from = 0, i;
  while ((i = css.indexOf(name, from)) !== -1) {
    from = i + name.length;
    // It must be a SELECTOR here, not a substring: nothing word-ish before it, and the next
    // non-space character opens the block or continues the selector list. This is what lets
    // `.pm-act` find `.pm-act,` and `.pm-act{` while correctly skipping `.pm-act.is-go{`.
    if (/[\w.-]/.test(css[i - 1] || "")) continue;
    if (!/^\s*[,{]/.test(css.slice(from, from + 40))) continue;
    const open = css.indexOf("{", from);
    const close = css.indexOf("}", open);
    if (open === -1 || close === -1) continue;
    found = true;
    out += ";" + css.slice(open + 1, close);
  }
  return found ? out : null;
}

const decl = (b, prop) => {
  const m = b && b.match(new RegExp("(?:^|[;{\\s])" + prop + "\\s*:\\s*([^;]+)"));
  return m ? m[1].trim() : null;
};

// family → [opening selector, which rung it must sit on]
const FAMILIES = [
  [".pm-act.is-go{", "action", "the step's action, filled"],
  [".pm-commit{", "action", "the act that completes a step"],
  [".pm-m-send{", "action", "Send, on a step's thread"],
  [".pm-btn.brand, .pm-btn.amber{", "action", "a card's primary — View invoice, Sign agreement"],
  [".portal-button,", "action", "the approval answers — Looks good, Yes that's mine"],
  [".portal-svc-btn {", "action", "the service yes/no answers"],
  [".pm-c-btn {", "action", "the contract buttons"],
  [".pm-act{", "quiet", "Show me how →, View → — not the step's action"],
  [".pm-amend{", "quiet", "Change the time, + Add another"],
  [".pm-btn {", "quiet", "platform chips, Message us"],
  [".portal-svc-btn-ghost {", "quiet", "Change, Disconnect, Recheck"],
  [".fq-ask{", "quiet", "Ask us about this"],
  [".fq-clear{", "quiet", "Clear my answer"],
];
const WANT_H = { action: "--pm-h", quiet: "--pm-h-sm" };
const WANT_FS = { action: "--fs-md", quiet: "--fs-sm" };

let checked = 0;
for (const [sel, rung, why] of FAMILIES) {
  const b = block(sel);
  if (!b) { indet.push(`\`${sel.replace(/\{$/, "")}\` is gone — not judged`); continue; }
  checked++;
  const mh = decl(b, "min-height");
  if (!mh) {
    fail.push(`portal.css — \`${sel.replace(/\{$/, "")}\` (${why}) declares NO min-height, so its size comes `
      + `from padding and line-height and drifts on its own. Every control family sits on a token.`);
    // 🔴 `.includes("--pm-h")` is TRUE for `var(--pm-h-lg)`. Require the token to end where it ends.
  } else if (!new RegExp("var\\(\\s*" + WANT_H[rung] + "\\s*[,)]").test(mh)) {
    fail.push(`portal.css — \`${sel.replace(/\{$/, "")}\` (${why}) is ${mh}, not \`var(${WANT_H[rung]})\`. `
      + `It belongs on the ${rung} rung; a hardcoded height is a seventh size waiting to happen.`);
  }
  const fsz = decl(b, "font-size");
  if (fsz && !fsz.includes(WANT_FS[rung])) {
    fail.push(`portal.css — \`${sel.replace(/\{$/, "")}\` (${why}) sets font-size ${fsz}, but the ${rung} rung `
      + `is \`var(${WANT_FS[rung]})\`. Matching heights with mismatched text is still two sizes.`);
  }
}
if (checked < FAMILIES.length - 2) {
  indet.push(`only ${checked} of ${FAMILIES.length} families found — the stylesheet was restructured, so this gate is not measuring what it thinks`);
} else if (!fail.length) {
  pass.push(`all ${checked} control families sit on one of the two rungs, text size included`);
}

// ── EVERY CONTROL IN USE, NOT A LIST I REMEMBERED TO WRITE ──────────────────────────────────────
// 🔴🔴 2026-09-29. Chris: *"it is so fucked up i cant keep asking you to fix it. go through every
// step in detail and then fix all."* He was right, and the reason it kept happening is that the
// section above checks a HARDCODED list of families — so every family I did not think to add was
// invisible to the gate, and only became visible when he saw it.
//
// A pass over all 16 client steps found THIRTEEN more sizing themselves from padding: .pm-choice,
// .pm-plat-opt, .fq-opt, .pm-join, .kickoff-slot, .pm-in-tick, .pm-in-closed and the rest.
//
// 🔑 THIS CHECK ENUMERATES WHAT THE PORTAL ACTUALLY RENDERS and demands every one of them declare a
// min-height. It cannot go stale when a new control is added, which the list above can.
// → feedback_an_inventory_is_a_claim_about_what_i_thought_to_grep
//
// EXEMPT, each for a stated reason — a control with `padding:0` is a text link, and a disclosure
// header is a full-width row, not a button. Adding to this list is a decision, not a shortcut.
const EXEMPT = {
  "fq-undo": "text link (padding:0)",
  "how-ask": "text link (padding:0)",
  "pm-link": "text link (padding:0)",
  "ap-head": "disclosure header — a full-width row, not a button",
  "fq-head": "disclosure header — a full-width row, not a button",
  "ai-pointer": "an inline pointer banner, not a control in the scale",
};
{
  const jsPath = path.join(SITE, "portal", "portal.js");
  if (!fs.existsSync(jsPath)) indet.push("portal.js not found — the exhaustive sweep did not run");
  else {
    const js = fs.readFileSync(jsPath, "utf8")
      .replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const used = new Set();
    for (const m of js.matchAll(/<(?:button|a)\b[^>]*?class="([^"]*)"/g)) {
      // 🔑 The LITERAL PREFIX, before any `${…}` — `class="pm-choice${on}"` is still `.pm-choice`.
      for (const c of m[1].split("${")[0].split(/\s+/)) {
        if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(c)) used.add(c);
      }
    }
    if (used.size < 25) {
      indet.push(`only ${used.size} control families found in portal.js — the markup shape changed, so the exhaustive sweep is not measuring what it thinks`);
    } else {
      const off = [];
      for (const c of [...used].sort()) {
        if (EXEMPT[c]) continue;
        const b = block("." + c);
        if (!b || /min-height/.test(b)) continue;
        if (/padding\s*:/.test(b)) off.push(c);
      }
      if (off.length) {
        fail.push(`portal.css — ${off.length} control family(ies) size themselves from padding instead of `
          + `declaring a rung: ${off.map((c) => "." + c).join(" · ")}. Each is a height nobody chose, and `
          + `it only becomes visible when Chris sees it.`);
      } else pass.push(`all ${used.size} control families in portal.js are on the scale or explicitly exempt`);
    }
  }
}

// ── THE OVERRIDES THAT ARE TARGETED BY ATTRIBUTE, WHICH A CLASS SWEEP CANNOT SEE ────────────────
// 🔴 The sweep above enumerates CLASS rules. "Check now" is raised by `[data-step-recheck]`, so
// deleting that rule left the sweep green — the button falls back to `.pm-amend` (quiet), which is
// correctly sized for its class and wrong for its role. Found by mutation-testing the sweep.
// → feedback_a_gate_must_pin_the_property_not_the_spelling
{
  const b = block("[data-step-recheck]{");
  if (!b) {
    fail.push('portal.css — the `[data-step-recheck]` size rule is gone, so "Check now" drops to the '
      + "quiet size. It is the ONLY control on a detected step — steps 4, 6 and \"Add RGA as "
      + "Manager\" — and the way that step resolves.");
  } else {
    const mh = decl(b, "min-height");
    if (!mh || !/var\(\s*--pm-h\s*[,)]/.test(mh)) {
      fail.push(`portal.css — "Check now" is ${mh || "unsized"}, not \`var(--pm-h)\`.`);
    } else pass.push('"Check now" — the sole control on a detected step — takes the action size');
  }
}

// ── AND THE ACTION ROW RAISES ITS AMENDMENTS ────────────────────────────────────────────────────
// 🔴 2026-09-29, Chris pointing at "Pick a different time": the only control on a settled kickoff
// card, drawn at the quiet 30px while every other card's control row is 38px. The scale says 38px is
// "a step's action, AND every control in a card's action row" — those three buttons ARE the row.
// They stay OUTLINED (nothing there is the one thing to do); only the size moves.
// 🔑 Scoped to `.pm-row-actions` so it reaches exactly those three and no inline amendment.
{
  const b = block(".pm-row-actions .pm-amend{");
  if (!b) {
    fail.push("portal.css — `.pm-row-actions .pm-amend` is gone, so \"Change the time\", \"Can't make it\" "
      + "and \"Pick a different time\" drop back to the quiet size and a settled kickoff card is the "
      + "only card in the portal whose control row is smaller than every other.");
  } else {
    const mh = decl(b, "min-height");
    if (!mh || !/var\(\s*--pm-h\s*[,)]/.test(mh)) {
      fail.push(`portal.css — the action row's amendments are ${mh || "unsized"}, not \`var(--pm-h)\`.`);
    } else pass.push("an amendment inside a card's action row takes the action size, outlined");
  }
}

for (const p of pass) console.log(`  ✅ ${p}`);
for (const i of indet) console.log(`  ⚠️  ${i}`);
for (const f of fail) console.log(`  🔴 ${f}`);
if (fail.length) {
  console.log(`\n🔴 FAIL — ${fail.length} way(s) the portal has more than two button sizes again.`);
  process.exit(1);
}
if (indet.length && !pass.length) { console.log("\n⚠️  INDETERMINATE"); process.exit(2); }
console.log(`\n✅ the portal has one button scale — ${H}px for an action, ${HSM}px for everything else.`);

/* ─────────────────────────────────────────────────────────────────────────────────────────────────
 * MUTATION LOG — each must turn this gate red:
 *   1. give any family a hardcoded px height (the 28px .pm-amend bug, exactly)      → fail
 *   2. move a quiet family onto --pm-h, or an action family onto --pm-h-sm          → fail
 *   3. delete a family's min-height so it sizes itself from padding                 → fail
 *   4. leave the heights right but set a family's font-size to the other rung's     → fail
 *   5. remove the --pm-h / --pm-h-sm tokens                                         → fail
 * ─────────────────────────────────────────────────────────────────────────────────────────────── */
