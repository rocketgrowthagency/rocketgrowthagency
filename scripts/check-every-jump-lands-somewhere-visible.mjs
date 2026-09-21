#!/usr/bin/env node
/**
 * check-every-jump-lands-somewhere-visible.mjs
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 `scrollIntoView` ON AN ELEMENT IN A HIDDEN TAB DOES NOTHING, AND THROWS NOTHING.
 *
 * The client portal is a tabbed single page: every view except the active one sits at
 * `display:none`. `document.getElementById` still finds elements inside those hidden views, and
 * `scrollIntoView()` on one returns normally having moved nothing at all.
 *
 * 2026-09-17 — the billing banner. It renders on the DASHBOARD, and every one of its states
 * ("Invoice overdue", "Account pause warning", "Account paused") offered a single control:
 *
 *     <button onclick="...getElementById('portal-step-2-done').scrollIntoView(...)">View invoice →</button>
 *
 * `#portal-step-2-done` lives inside `.pv-setup`. The button was INERT in every billing state —
 * and for a paused client, whose data has been deliberately walled off, that button is the only
 * route back to paying us. An account could pause and the client had no working way to fix it.
 *
 * 🔑 WHY NOTHING CAUGHT IT. The element existed. Every check that asked "does the target exist?"
 * passed, in every state, truthfully. The question that mattered was "can the client SEE it?" —
 * and no static read of the source distinguishes the two. What answered it was rendering the page
 * and asking the browser, which replied "element is not visible" in one line after three rounds of
 * careful reasoning had concluded the code was fine.
 *
 * This gate enforces the structural rule that makes the failure impossible to express:
 *   1. No inline `onclick` may hand-roll a DOM jump — that is how this one escaped review.
 *   2. Any control that scrolls to a card must also NAME THE TAB that card is in.
 *   3. One handler must own both, so the tab switch is applied before the scroll is measured.
 *
 * → feedback_a_guard_must_reach_the_thing_it_guards · feedback_poll_for_what_the_screen_renders
 * → feedback_fix_the_class_not_the_instance
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 */
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FILE = path.join(SITE, "portal/portal.js");

let fail = 0;
const bad = (m) => { console.log(`  🔴 ${m}`); fail++; };

console.log("── every in-portal jump lands on something the client can actually see ──");

if (!fs.existsSync(FILE)) { console.error("[jumps] INDETERMINATE — portal/portal.js not found"); process.exit(2); }
const src = fs.readFileSync(FILE, "utf8");
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── 1. No hand-rolled jumps ────────────────────────────────────────────────────────────────────
// An inline onclick that looks up an element and scrolls it is the exact shape that shipped broken.
// It bypasses the shared handler, so it cannot benefit from the tab switch the handler performs.
for (const m of code.matchAll(/onclick\s*=\s*"[^"]*getElementById[^"]*"/g)) {
  const line = src.slice(0, src.indexOf(m[0])).split("\n").length;
  bad(`portal/portal.js:${line} — an inline onclick hand-rolls a DOM jump. `
    + `If its target is in another tab it will silently do nothing. Use data-portal-goto + data-portal-scroll.`);
}
for (const m of code.matchAll(/onclick\s*=\s*"[^"]*scrollIntoView[^"]*"/g)) {
  const line = src.slice(0, src.indexOf(m[0])).split("\n").length;
  bad(`portal/portal.js:${line} — an inline onclick scrolls directly; a hidden tab would swallow it.`);
}

// ── 2. Every scroll names its tab ──────────────────────────────────────────────────────────────
// We cannot tell from source which view an id is rendered into, so the rule is that the control
// must say. Naming the tab it is already in costs nothing; NOT naming it is how a jump dies.
const TAG = /<(?:button|a)\b[^>]*data-portal-scroll[^>]*>/g;
let scrolls = 0;
for (const m of code.matchAll(TAG)) {
  scrolls++;
  if (!/data-portal-goto\s*=/.test(m[0])) {
    const line = src.slice(0, src.indexOf(m[0])).split("\n").length;
    bad(`portal/portal.js:${line} — \`${m[0].slice(0, 70)}…\` scrolls to a card but does not name the tab it is in. `
      + `If that card is in another view the control is inert and says nothing.`);
  }
}

// ── 3. The handler actually applies the switch before the scroll ───────────────────────────────
// Two separate listeners cannot express "switch, wait for layout, then scroll": the goto handler's
// own scroll-to-top races the scroll-to-card. One handler, and it must wait a frame.
// 🔑 ANCHOR ON THE SELECTOR, NOT ON PROXIMITY. The first draft matched "the click listener within
// 1400 chars of the words data-portal-goto" and locked onto the NAV listener that happens to sit
// just above it — reporting the nav's own selector as the jump handler's. A gate that identifies
// the wrong code reads as a real failure and gets muted.
const selectors = [...code.matchAll(/closest\(\s*["'`]([^"'`]+)["'`]\s*\)/g)]
  .filter((m) => /data-portal-(goto|scroll)/.test(m[1]));
if (!selectors.length) {
  bad("no click handler binds data-portal-goto — every cross-tab jump in the portal is dead");
} else if (selectors.length > 1) {
  bad(`${selectors.length} separate listeners bind the jump attributes (${selectors.map((s) => s[1]).join(" · ")}) — `
    + "a control carrying both is then served by two handlers whose scrolls race each other");
} else {
  const at = selectors[0].index;
  const h = code.slice(at, at + 1400);
  // 🔑 IT MUST BE THE SELECTOR, NOT JUST THE BODY. The first draft of this assertion searched the
  // whole handler for "data-portal-scroll" — which the body always contains, because it reads the
  // attribute. Narrowing the closest() selector back to goto-only left scroll-only controls
  // unbound and the gate still passed. A check that matches the mention rather than the mechanism
  // confirms nothing. → feedback_a_check_must_not_validate_itself
  const sel = selectors[0][1];
  if (!/data-portal-goto/.test(sel) || !/data-portal-scroll/.test(sel)) {
    bad(`the jump handler binds \`${sel}\` — it must match BOTH data-portal-goto and data-portal-scroll. `
      + "Binding one leaves the other unbound, so a scroll-only control does nothing at all.");
  }
  if (!/requestAnimationFrame/.test(h)) {
    bad("the jump handler scrolls without waiting for a frame — a tab switched in the same tick has "
      + "no geometry yet, so the scroll measures the OLD layout");
  }
  if (!/keepScroll/.test(h)) {
    bad("the jump handler does not suppress setPortalView's scroll-to-top — two smooth scrolls fight "
      + "and the client lands somewhere neither control intended");
  }
}
if (!/function setPortalView\([^)]*keepScroll/.test(code)) {
  bad("setPortalView no longer accepts keepScroll — it will always scroll to the top, discarding the target");
}

// ── 4. The banner's route back to paying still exists ──────────────────────────────────────────
// 🔑 The paused state is the one where this matters most and the one nobody renders: a walled-off
// client with no working control has no way to pay and no way to tell us.
const banner = code.match(/function buildBillingBannerHtml[\s\S]*?\n\}/);
if (!banner) {
  bad("buildBillingBannerHtml is gone — nothing tells an overdue client they owe us");
} else {
  for (const state of ["overdue", "warning", "paused"]) {
    const block = banner[0].match(new RegExp(`billingStatus === "${state}"[\\s\\S]{0,1200}?return \``));
    const seg = block ? banner[0].slice(banner[0].indexOf(block[0]), banner[0].indexOf(block[0]) + 1800) : "";
    if (!seg || !/data-portal-scroll="portal-step-2-done"/.test(seg)) {
      bad(`the "${state}" banner no longer routes to the invoice card — the client is told to pay with no way to do it`);
    }
  }
  if (!/data-ask/.test(banner[0])) {
    bad("the terminated banner has lost its composer — a closed account cannot reach us from inside the portal");
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE OTHER JUMP MECHANISM. `data-jump-to` predates the shared handler and scrolls to a SELECTOR
// rather than an id, so it cannot use it. Today its two targets share a view with their buttons —
// but nothing enforced that, and moving either form would have made them inert in the same silent
// way the billing banner was. It must switch the view itself before it measures anything.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  const jumpTo = (code.match(/querySelectorAll\("\[data-jump-to\]"\)[\s\S]{0,900}?\n  \}\);/) || [""])[0];
  if (jumpTo) {
    if (!/setPortalView\(/.test(jumpTo)) {
      bad("the data-jump-to handler scrolls without switching view — if its target ever moves tab it goes silently inert");
    }
    if (!/requestAnimationFrame/.test(jumpTo)) {
      bad("the data-jump-to handler scrolls in the same tick as the view switch — it would measure the OLD layout");
    }
  }
}

console.log(fail
  ? `\n🔴 ${fail} jump(s) that could land nowhere.`
  : `\n✅ ${scrolls} in-portal jump(s): each names its tab, and one handler switches before it scrolls.`);
process.exit(fail ? 1 : 0);
