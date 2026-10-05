#!/usr/bin/env node
/**
 * check-css-declarations-are-valid.mjs
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 AN INVALID CSS DECLARATION IS DROPPED SILENTLY, AND THE PAGE STILL LOADS.
 *
 * Chris, 2026-09-16: *"can we make the check again and those buttons better design more css and on
 * brand and on design. they seem off"*. They were off, and not for a reason anybody could name by
 * looking: EIGHT declarations across the portal read
 *
 *     font: 600 14px/1.2 inherit;
 *
 * `inherit` is legal as the ENTIRE value of `font` — but it is not a font-family token, so inside
 * the shorthand the whole declaration is invalid and the browser discards it. Every one of those
 * controls was rendering in the browser's default button font instead of the site's typeface. No
 * error, no warning, no failed test. It just quietly looked wrong for as long as it existed.
 *
 * This gate is deliberately narrow: it checks the shapes that FAIL SILENTLY and that we have
 * actually shipped. It is not a CSS validator.
 *
 * → feedback_dead_check_selector_gap · feedback_a_check_must_not_validate_itself
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 */
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FILES = ["portal/portal.css", "admin/admin.css", "styles.css"];

let fail = 0;
const bad = (m) => { console.log(`  🔴 ${m}`); fail++; };

console.log("── every CSS declaration we ship is one the browser will keep ──");

// A family token that is really a CSS-wide keyword. Valid alone (`font: inherit`), fatal inside the
// shorthand. `system-ui`, `sans-serif`, `monospace` etc. are genuine families and must NOT fire.
const KEYWORD_AS_FAMILY = /font:\s*(?:[a-z-]+\s+)*?\d[^;{}]*?\b(inherit|initial|unset|revert)\b\s*(?:;|})/g;

let checked = 0;
for (const rel of FILES) {
  const full = path.join(SITE, rel);
  if (!fs.existsSync(full)) continue;
  checked++;
  const src = fs.readFileSync(full, "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "");   // the note explaining this bug quotes it

  for (const m of code.matchAll(KEYWORD_AS_FAMILY)) {
    const line = code.slice(0, m.index).split("\n").length;
    bad(`${rel}:${line} — \`${m[0].trim().slice(0, 52)}\` uses "${m[1]}" as the font FAMILY. `
      + `The whole declaration is invalid and dropped; the control falls back to the browser's font.`);
  }

  // 🔑 The same silent-drop class: a var() with no fallback inside a shorthand that cannot
  // partially apply. Caught here because the failure mode is identical — nothing renders wrong
  // enough to notice, it just is not ours.
  for (const m of code.matchAll(/font:\s*[^;{}]*var\(--[a-z0-9-]+\)[^;{}]*(?:;|})/g)) {
    if (!m[0].includes(",")) {
      const line = code.slice(0, m.index).split("\n").length;
      bad(`${rel}:${line} — \`${m[0].trim().slice(0, 52)}\` puts a var() with no fallback in the \`font\` shorthand; if it fails to resolve the whole declaration goes.`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴🔴 THE GENERAL CASE, ADDED 2026-10-05 — AND THIS GATE WAS GREEN WHILE TEN OF THEM SHIPPED.
  //
  // `var(--x)` with NO FALLBACK, where `--x` is never defined, makes the whole declaration invalid
  // and it is DROPPED SILENTLY: no error, no warning, the rule simply does not apply. Found in
  // `admin.css`: `--admin-dim`, `--admin-line`, `--admin-text` — 10 uses, 0 definitions — so a row
  // of Docs-tab borders and Playbook text colours were never actually being set.
  //
  // 🔑 IT HAD ALREADY BITTEN ONCE. `--admin-brand-bg` was in exactly this state, which is why every
  // "Running…" banner lost its icon tile while success, error and warning kept theirs. Chris found
  // that by eye; nothing in the build could have.
  //
  // 🔑 A FALLBACK IS ALWAYS ACCEPTABLE. This does not demand the variable exist — only that the
  // declaration survives if it does not. → feedback_an_invalid_css_declaration_is_dropped_silently
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  {
    const defined = new Set();
    for (const d of code.matchAll(/(--[a-z0-9-]+)\s*:/g)) defined.add(d[1]);
    const seen = new Set();
    for (const u of code.matchAll(/var\(\s*(--[a-z0-9-]+)\s*\)/g)) {   // no comma = no fallback
      const name = u[1];
      if (defined.has(name) || seen.has(name)) continue;
      seen.add(name);
      const line = code.slice(0, u.index).split("\n").length;
      const uses = (code.match(new RegExp(`var\\(\\s*${name}\\s*\\)`, "g")) || []).length;
      bad(`${rel}:${line} — \`var(${name})\` has no fallback and \`${name}\` is never defined `
        + `(${uses} use${uses === 1 ? "" : "s"}). Every one of those declarations is invalid and is `
        + `dropped silently — the rule simply does not apply.`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴🔴 A CLASS NAME THAT IS ALREADY TAKEN INHERITS WHAT IT DID NOT ASK FOR.
//
// 2026-09-17: the checklist row was given `.pm-row` — a name already used by an unrelated
// label/value component carrying `align-items:center`, `justify-content:space-between` and a
// `border-bottom`. The new block set `display:flex` and `flex-direction:column`, so it WON on
// those and silently inherited the other three. Every child of every row rendered centred, and
// nothing failed: the CSS was valid, the classes existed, the styles applied. It just looked
// wrong — the only symptom this class of bug ever has.
//
// 🔑 A GENERAL SWEEP FOR THIS WAS WRITTEN AND THEN PULLED. It flagged seven pre-existing pairs and
// its line numbers did not correspond to real duplicate blocks — it was mis-parsing descendant
// selectors. Base-plus-refinement is a legitimate, widely-used pattern here, so telling a real
// collision from an intentional override needs judgement this cannot exercise.
// **A gate that cries wolf gets muted, which is worse than no gate at all.**
// → feedback_a_check_must_not_validate_itself
//
// What remains is narrow and certain: the classes the checklist row owns must be defined ONCE.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  const css = fs.readFileSync(path.join(SITE, "portal/portal.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  // 🔴 `pm-hint` WAS REMOVED FROM THIS LIST on 2026-10-01. portal.js stopped emitting it in
  // 5bfec788 ("Every client step leads with what to do"), so the rule matched nothing from that
  // commit on — and when the dormant-CSS sweep deleted it, this gate reported the DELETION of dead
  // code as a defect. A gate must require a rule only while something can wear it; otherwise it
  // forces dead code to be carried forever. Its siblings are all still emitted and still listed.
  // → feedback_a_gate_must_pin_the_property_not_the_spelling
  for (const cls of ["pm-step-row", "pm-step-row-head", "pm-detail"]) {
    const blocks = [...css.matchAll(new RegExp(`(^|\\n)\\.${cls}\\s*\\{`, "g"))];
    if (blocks.length === 0) bad(`.${cls} is gone — the checklist row would fall back to browser defaults`);
    if (blocks.length > 1) {
      bad(`.${cls} is defined ${blocks.length}× — a second component is wearing the checklist row's class name `
        + `and it will silently inherit whatever the other block sets. Rename one.`);
    }
  }
  // 🔴 The row must pin its cross-axis. Relying on the `stretch` default is what let an inherited
  // `align-items:center` centre every child of every row.
  if (!/\.pm-step-row\{[^}]*align-items:\s*stretch/.test(css)) {
    bad(".pm-step-row does not pin align-items — an inherited value would centre every row's contents");
  }
  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 🔴🔴 NOTHING INSIDE THE ROW MAY SET ITS OWN VERTICAL MARGIN. The row is a flex column with
  // one `gap`, and a margin on any child ADDS to it. On 2026-09-17 the drawer's `margin-top:2px`
  // made the one seam above it 12px while every other pair was 10px — reintroducing, in a single
  // place, the uneven rhythm the gap had been introduced that same day to fix.
  //
  // 🔑 The rule is easy to state and easy to break by accident, which is exactly what a gate is
  // for: sibling spacing belongs to the parent.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  {
    const ROW_CHILDREN = ["pm-hint", "pm-detail", "pm-waiting", "pm-flagged", "pm-evidence",
                          "pm-attested", "pm-said", "pm-input", "pm-choices", "pm-recheck-result"];
    for (const cls of ROW_CHILDREN) {
      const m = css.match(new RegExp(`\\.${cls}\\{([^}]*)\\}`));
      if (!m) continue;
      const decl = m[1];
      // `margin:0 …` and `margin:0` are fine; anything with a non-zero FIRST value is not.
      const mm = decl.match(/(?:^|;)\s*margin:\s*([^;]+)/);
      if (!mm) continue;
      const top = mm[1].trim().split(/\s+/)[0];
      if (top !== "0" && top !== "0px") {
        bad(`.${cls} sets its own top margin (${mm[1].trim()}) — it ADDS to the row's gap and makes one seam taller than every other`);
      }
    }
  }

  // 🔑 And the controls inside it must not stretch to full width.
  if (!/\.pm-step-row > \.pm-amend[\s\S]{0,120}?align-self:\s*flex-start/.test(css)) {
    bad("the row's buttons do not opt out of stretch — 'Check now' would render the full width of the card");
  }
  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 🔴 AN OPEN ROW MUST NOT LOOK LIKE A CLOSED ONE. Chris, 2026-09-17: the instructions
  // "blend too much with the current other area … it needs more differenciation". The panel
  // was a white card with the same radius and border as the white row containing it, so
  // nothing marked where the step ended and the instructions began.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  if (!/\.pm-step-row\.is-open\{[^}]*border-color:\s*var\(--portal-accent/.test(css)) {
    bad("an open row is not visually distinguished — it would look identical to the collapsed rows around it");
  }
  if (!/\.pm-detail\{[\s\S]{0,200}?margin:0 -14px -12px/.test(css)) {
    bad("the instructions panel no longer meets the row's edges — it reads as a card floating inside the row rather than a drawer of it");
  }
  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 🔴🔴 A SURFACE, NOT A STROKE. Chris, 2026-09-17: *"its just a border … maybe a color
  // underneath. think shopify."* Shopify layers surfaces — page grey, white card, subdued tray
  // inside the card — rather than outlining nested content. Approved design (mockup v2, option
  // A's tray with option C's label) needs THREE things, and a border is not one of them.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  if (!/--portal-tray:/.test(css)) {
    bad("the tray token is gone — the drawer would sit on the page colour, which reads as a hole in the row");
  }
  if (!/\.pm-detail\{[\s\S]{0,260}?background:var\(--portal-tray/.test(css)) {
    bad("the drawer no longer sits on the tray — it is back to being differentiated by a border alone");
  }
  if (!/\.how-strip\{[\s\S]{0,200}?background:var\(--portal-accent/.test(css)) {
    bad('the "How to do this" strip has lost its accent — nothing names the drawer');
  }
  if (!/\.how-sec\{[\s\S]{0,200}?background:var\(--portal-card/.test(css)) {
    bad("the sections are no longer white cards on the tray — the three-surface nesting collapses to two");
  }
}

if (!checked) { console.error("[css] INDETERMINATE — no stylesheet found"); process.exit(2); }

console.log(fail
  ? `\n🔴 ${fail} declaration(s) the browser will silently discard.`
  : `\n✅ ${checked} stylesheet(s): no declaration that a browser would drop without saying so.`);
process.exit(fail ? 1 : 0);
