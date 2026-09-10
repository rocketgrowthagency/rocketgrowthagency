#!/usr/bin/env node
/**
 * check-one-action-one-button.mjs — arriving somewhere must not still show the way there.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * Chris, 2026-09-10: *"i clicked go to contract and then on the contract page that button go to
 * contract is still there just yellow instead of blue. this is confusing."*
 *
 * The Dashboard's next-step banner NAVIGATED to Setup. The Setup tab then rendered the same banner
 * with the same words — "Go to Contract →" — directly above a step card whose own button did the
 * real thing. Two buttons, one action, and the top one was the button he had just pressed.
 *
 * 🔑 Someone had already noticed and fixed the BEHAVIOUR: the Setup button scrolled instead of
 * navigating, with a comment saying "so it's not a dead/redundant click". The LABEL was left alone,
 * and the scroll target was already on screen — so nothing visibly happened. **A button whose label
 * does not change is the same button to the person reading it.** Fixing what it does, without
 * fixing what it says, fixes nothing.
 *
 * This is the same shape as the magic link that ended on a login form (check-signed-in-user-never-
 * sees-login-form): a screen that has reached its destination still offering the trip.
 *
 * WHAT IT CHECKS: the Setup-tab ("amber") variant of the next-step banner renders NO button. The
 * step card below owns the click.
 *
 * Exit 0 = one action, one button · 1 = a duplicate button is back · 2 = could not tell.
 */
import fs from "node:fs";

const PORTAL = "/Users/chris/RGA/Rocket Growth Agency Website VS Code/portal/portal.js";
const SABOTAGE = process.env.SABOTAGE === "1";

console.log("── one action offers exactly one button ──");
if (!fs.existsSync(PORTAL)) { console.log(`  ⚠️  missing: ${PORTAL}`); process.exit(2); }

// Strip comments: this gate's own rationale, and the source's, both quote the button text.
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
let src = strip(fs.readFileSync(PORTAL, "utf8"));

const fn = src.match(/function buildPortalNextActionHtml[\s\S]*?\n}\n/);
if (!fn) { console.log("  ⚠️  could not locate buildPortalNextActionHtml() — the shape changed."); process.exit(2); }
let body = fn[0];

// 🔴 Scoped to its own case. This block used to fire on ANY SABOTAGE=1, so the admin sabotage
// cases below never actually ran — they tripped this portal check first and "passed" for the
// wrong reason. A sabotage test that fails on the wrong assertion proves nothing.
if (SABOTAGE && (process.env.SABOTAGE_CASE || "1") === "1") {
  body = body.replace(/const btnHtml = \(action\.btn && !isAmber\)/, "const btnHtml = (action.btn)");
}

// The guard must be present: no button when the banner is the Setup-tab variant.
const guarded = /const btnHtml\s*=\s*\(\s*action\.btn\s*&&\s*!isAmber\s*\)/.test(body);
if (guarded) {
  console.log("  ✅ the Setup-tab banner renders no button — the step card owns the click");
} else {
  console.log("  🔴 the Setup-tab next-step banner can render a button again.");
  console.log("     That duplicates the step card's button for the SAME action, on the page the");
  console.log("     user reached by pressing it. Guard btnHtml with `&& !isAmber`.");
  process.exit(1);
}

// And the amber variant must not still be wired to a scroll target, which is what made the
// duplicate look dead rather than merely redundant.
if (SABOTAGE && (process.env.SABOTAGE_CASE || "") === "2") {
  body += "\nconst btnAttr = isAmber ? 'data-portal-scroll=\"portal-active-step\"' : 'x';\n";
}
if (/isAmber \? 'data-portal-scroll/.test(body)) {
  console.log("  🔴 the amber banner is still wired to scroll — that was the disguise, not the fix.");
  process.exit(1);
}
console.log("  ✅ no scroll-instead-of-navigate disguise remains");

// ── ADMIN: the accept-signed-contract moment must offer ONE control, not four. ─────────────────
// 2026-09-10. Chris: *"only make next step the button to click theres too much going on here."*
// The client page showed FOUR ways to do one thing: a Pending-actions banner button, "Review signed
// contract →", "✓ Accept & Send Payment Link", and a raw "Advance to 2. Payment" — sitting beside
// copy that told you to use the Accept button instead. 🔑 The raw Advance was not a shortcut: it
// moves the STAGE only, skipping acceptance and the payment link, so the client would be marked as
// owing money nobody had asked them for. An escape hatch beside the correct path is a trap.
const ADMIN = "/Users/chris/RGA/Rocket Growth Agency Website VS Code/admin/admin.js";
if (!fs.existsSync(ADMIN)) { console.log(`  ⚠️  missing: ${ADMIN}`); process.exit(2); }
let admin = strip(fs.readFileSync(ADMIN, "utf8"));
const acase = process.env.SABOTAGE_CASE || "";
if (SABOTAGE && acase === "3") admin = admin.replace(/if \(viewingClientId\) \{ host\.innerHTML = ""; return; \}/, "");
if (SABOTAGE && acase === "4") admin = admin.replace(/if \(inAdminReview\) \{\s*els\.advanceStageButton\.style\.display = "none";\s*\} else if \(next\)/, "if (next)");

let adminFails = 0;
if (/if \(viewingClientId\) \{ host\.innerHTML = ""; return; \}/.test(admin)) {
  console.log("  ✅ admin: no pending-actions banner on a client you are already viewing");
} else { console.log("  🔴 admin: the pending-actions banner restates the next-action card below it"); adminFails++; }

if (/if \(inAdminReview\) \{\s*els\.advanceStageButton\.style\.display = "none";/.test(admin)) {
  console.log("  ✅ admin: raw stage-advance hidden while the Accept action owns the transition");
} else {
  console.log("  🔴 admin: 'Advance to 2. Payment' is offered during admin review. It skips accepting");
  console.log("     the agreement AND sending the payment link — the client is billed unasked.");
  adminFails++;
}
if (adminFails) { console.log(`\n🔴 ${adminFails} admin check(s) failed — more than one control for one moment.`); process.exit(1); }

console.log("\n✅ arriving somewhere no longer shows the way there.");
process.exit(0);
