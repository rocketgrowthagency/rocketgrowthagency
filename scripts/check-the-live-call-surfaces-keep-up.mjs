#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — WHEN THE CALL STARTS, THE PAGE STARTS WITH IT
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Three defects found by Chris DURING a live kickoff call, 2026-09-30:
 *
 * 🔴🔴 1. *"is there a join now option? where did that button go."*
 *    It was never there — for him. `joinable` is decided at RENDER time (`Date.now() >= startMs`),
 *    and the client's 30-second ticker patched the label, the tone and the number but NEVER the
 *    button. A tab opened before the call flipped to "Happening now" and sat there with no way in,
 *    while a fresh load in the next tab showed it correctly.
 *    🔑 A CARD THAT UPDATES ITSELF MUST UPDATE ALL OF ITSELF. Anything gated on the same clock the
 *    ticker advances has to be advanced by the ticker.
 *
 * 🔴 2. *"I see the Join Meet. Can we make this a button."*
 *    On the admin console it was a 12.5px blue text link in a band full of numbers — the one thing
 *    you press while a client waits, styled as the quietest element on the console.
 *
 * 🔴🔴 3. *"everytime i click on the 20:00 or 24:00 mark it will take me to the next card #3 Access."*
 *    The click worked; the PAGE moved. Changing section re-renders the whole checklist, and the
 *    console's height changes with it (the cut-plan band is four paragraphs and four buttons on a
 *    behind-schedule section, absent on an on-time one). Hundreds of pixels vanish above the
 *    viewport, the browser keeps the scroll offset, and the operator is thrown to another phase —
 *    mid-call.
 *
 * Exit 0 pass · 1 fail · 2 indeterminate. Mutation log at the bottom.
 */
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const fail = [], pass = [];
const read = (rel, min) => {
  const p = path.join(SITE, rel);
  if (!fs.existsSync(p)) return null;
  const s = fs.readFileSync(p, "utf8");
  return s.length < min ? null : s;
};
const strip = (s) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const portal = read("portal/portal.js", 200000);
const admin = read("admin/admin.js", 500000);
const css = read("admin/admin.css", 50000);
if (!portal || !admin || !css) { console.error("⚠️  INDETERMINATE — sources not readable."); process.exit(2); }
const pj = strip(portal), aj = strip(admin);

// ── 1 · the client's ticker must be able to produce the Join ───────────────────────────────────
{
  const i = pj.indexOf("data-kickoff-countdown]");
  const tick = i < 0 ? "" : pj.slice(i, pj.indexOf("}, 30000);", i));
  if (!tick) {
    fail.push("portal/portal.js — the countdown ticker is gone, so a card left open freezes on "
      + "whatever it said when it was rendered.");
  } else {
    if (!/data-kickoff-meet/.test(tick)) {
      fail.push("portal/portal.js — the ticker does not read the meet link off the element, so it "
        + "cannot add the Join button when the clock crosses the start. A client with the tab "
        + "already open sees \"Happening now\" and no way in — the exact defect Chris hit mid-call.");
    } else pass.push("the ticker reads the meet link from the element it is patching");

    if (!/classList\.add\("pm-join|className = "pm-join|\.className\s*=\s*"pm-join/.test(tick)
        && !/a\.className = "pm-join on-cd"/.test(tick)) {
      fail.push("portal/portal.js — the ticker never creates the Join control. Patching the label "
        + "and the number while withholding the button makes the card contradict its own clock.");
    } else pass.push("the ticker adds the Join control when the call goes live");

    if (!/join\.remove\(\)/.test(tick)) {
      fail.push("portal/portal.js — nothing removes the Join before the start. A way in offered "
        + "early is an invitation to sit in an empty room.");
    } else pass.push("and takes it away again when the call is not live");
  }
  // 🔑 The link must only be stamped on a CONFIRMED call — a room for a time nobody agreed.
  if (!/confirmed && meetLink \? ` data-kickoff-meet=/.test(pj)) {
    fail.push("portal/portal.js — the meet link is stamped on the countdown without requiring a "
      + "CONFIRMED booking, so a merely-requested call could offer a way into a room.");
  } else pass.push("the link is only stamped on a confirmed call");
}

// ── 2 · Join is a control, not a word ──────────────────────────────────────────────────────────
{
  const i = css.indexOf(".kc-join {");
  const rule = i < 0 ? "" : css.slice(i, css.indexOf("}", i));
  if (!rule) {
    fail.push("admin/admin.css — `.kc-join` has no rule at all, so the console's Join renders as "
      + "unstyled text.");
  } else if (!/background:\s*var\(--admin-brand/.test(rule) || !/min-height:/.test(rule)) {
    fail.push("admin/admin.css — `.kc-join` is back to a bare text link. On a live call it is THE "
      + "control on the console, and it sat in a band of numbers as the quietest thing on screen.");
  } else pass.push("the console's Join is a filled control with a real height");
}

// ── 3 · changing section must not throw the page ───────────────────────────────────────────────
{
  const i = aj.indexOf('closest("[data-kc-seg],[data-kc-yes],[data-kc-cut]');   // v3 adds yes-clear + extend to the same handler
  const h = i < 0 ? "" : aj.slice(i, aj.indexOf("}, false);", i));
  if (!h) {
    fail.push("admin/admin.js — the console's section handler is gone.");
  } else {
    if (!/consoleAnchor\(\)|rerenderKeepingTheConsoleInView\(\)/.test(h)) {
      fail.push("admin/admin.js — the section handler re-renders the whole checklist without "
        + "anchoring the console. The console's height changes with the section, so the page jumps "
        + "to another card — while the operator is on a call.");
    } else pass.push("changing section keeps the console where the operator is looking");

    // 🔴 Restoring to an anchor that is no longer there would be its own jump — checked on the
    // shared helper now, because every console re-render goes through it.
    const a = aj.indexOf("function consoleAnchor()");
    const helper = a < 0 ? "" : aj.slice(a, aj.indexOf("\n}", a));
    if (!/if \(!after\) return;/.test(helper)) {
      fail.push("admin/admin.js — the scroll is restored without checking the console survived the "
        + "re-render. Scrolling to a ghost is a jump of its own.");
    } else pass.push("it only restores when the console is still on screen");
  }
}

// 🔴 ONE IMPLEMENTATION, NOT FOUR. Fixing one handler would have left the other three — the
// section marks, the outcome buttons, "Change what happened" and the recap send all rebuild 61 rows.
{
  const stray = [...aj.matchAll(/renderOnboardingChecklist\(\);/g)].length;
  const viaHelper = [...aj.matchAll(/rerenderKeepingTheConsoleInView\(\)/g)].length;
  if (viaHelper < 3) {
    fail.push(`admin/admin.js — only ${viaHelper} console-driven re-render(s) go through the anchor. `
      + "Every one of them rebuilds sixty-one rows while the console's height changes, so any that "
      + "does not anchor throws the operator into another card mid-call.");
  } else pass.push(`${viaHelper} console-driven re-renders share one anchored implementation`);
  void stray;
}

for (const x of pass) console.log(`  ✅ ${x}`);
for (const f of fail) console.log(`  🔴 ${f}`);
if (fail.length) { console.log(`\n🔴 FAIL — ${fail.length} way(s) the live call surfaces fall behind the clock.`); process.exit(1); }
console.log(`\n✅ when the call starts, the page starts with it (${pass.length} checks).`);

/* ─────────────────────────────────────────────────────────────────────────────────────────────────
 * MUTATION LOG — each must turn this gate red:
 *   1. stop stamping data-kickoff-meet                  → the ticker cannot build the Join
 *   2. remove the Join insertion from the ticker        → "Happening now" with no way in
 *   3. never remove the Join                            → a way in offered before the start
 *   4. stamp the link without requiring `confirmed`     → a room for a time nobody agreed
 *   5. revert .kc-join to a text link                   → the quietest thing on a live console
 *   6. drop the scroll anchor from the section handler  → the page jumps mid-call
 *   7. restore scroll without checking `after`          → a jump to a ghost
 * ─────────────────────────────────────────────────────────────────────────────────────────── */
