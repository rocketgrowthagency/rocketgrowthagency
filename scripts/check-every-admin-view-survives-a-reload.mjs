#!/usr/bin/env node
/**
 * check-every-admin-view-survives-a-reload.mjs
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 A NEW ADMIN VIEW MUST BE REGISTERED IN FOUR PLACES, AND NOTHING CHECKED THAT IT WAS.
 *
 * Chris, 2026-09-21, on the new Messages tab: *"its requiring a login again this was an issue for
 * all new pages we build. fix it. and make sure it doesnt default to Pipeline tab also as that was
 * a known issue."* Both symptoms, one cause — `admin.js` carries FOUR separate registries:
 *
 *   1. `showView()`'s `flags`   — which section is shown
 *   2. `getRequestedView()`     — an if-chain that reads ?view= back off the URL
 *   3. `buildAdminUrl()`        — an if-chain that WRITES ?view= into the URL
 *   4. `NAV_FOR_VIEW`           — which sidebar item is highlighted
 *
 * Miss (3) and `navigateTo` produces a URL with NO view param at all. Miss (2) and a reload falls
 * through to the default — which is the "it went back to Pipeline" report. And the missing param is
 * also the re-login: arriving by magic link puts the token in the URL hash, and a pushState to a
 * bare `/admin/` drops that hash before Supabase has persisted the session.
 *
 * 🔑 THIS IS NOT A ONE-OFF. Running it the first time found `playbook` missing from (2) and (3) —
 * Sales Playbook had never survived a reload or a shared link, for as long as the view existed, and
 * nobody had reported it. That is what "an issue for all new pages we build" actually looks like.
 *
 * → feedback_a_fix_without_a_gate_regresses · feedback_fix_the_class_not_the_instance
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 */
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FILE = path.join(SITE, "admin/admin.js");

let fail = 0;
const bad = (m) => { console.log(`  🔴 ${m}`); fail++; };

console.log("── every admin view survives a reload and a shared link ──");

if (!fs.existsSync(FILE)) { console.error("[admin-views] INDETERMINATE — admin/admin.js not found"); process.exit(2); }
const src = fs.readFileSync(FILE, "utf8");

// ── The four registries ────────────────────────────────────────────────────────────────────────
const flags = (src.match(/const flags = \{[\s\S]*?\n {2}\};/) || [""])[0];
const requested = (src.match(/function getRequestedView\(\)[\s\S]*?\n\}/) || [""])[0];
const builder = (src.match(/function buildAdminUrl\([\s\S]*?\n\}/) || [""])[0];
const navMap = (src.match(/const NAV_FOR_VIEW = \{[\s\S]*?\n {2}\};/) || [""])[0];

for (const [name, block] of [["showView flags", flags], ["getRequestedView", requested],
                             ["buildAdminUrl", builder], ["NAV_FOR_VIEW", navMap]]) {
  if (!block) bad(`could not find ${name} — this gate cannot verify anything without it`);
}
if (fail) { console.error("\n[admin-views] INDETERMINATE — the registries could not be read"); process.exit(2); }

// The views showView knows about are the source of truth for "what exists".
const views = [...new Set([...flags.matchAll(/^\s*([a-zA-Z]+):\s*name === "([a-z-]+)"/gm)].map((m) => m[2]))];
if (views.length < 5) bad(`only ${views.length} view(s) parsed out of showView — the shape has changed and this gate is reading the wrong thing`);

// 🔑 NOT EVERY VIEW IS NAVIGABLE. `auth` and `booting` are lifecycle states — there is no URL for
// "still booting", and inventing one would be worse than the gap. Excused BY NAME so a new
// exclusion has to be a decision, not an accident.
const NOT_NAVIGABLE = {
  auth: "the signed-out screen — there is no URL for it and a link to it would be meaningless",
  booting: "a transient state while the session resolves, never a destination",
};
// 🔑 And `client` deliberately has no fixed NAV entry: a client record is reachable from both
// Pipeline and Clients, so the highlight is computed from where it was opened. Hardcoding it is
// what lit the wrong tab before.
const NO_FIXED_NAV = { client: "reachable from both Pipeline and Clients — the highlight is computed from the origin" };

let checked = 0;
for (const v of views) {
  if (NOT_NAVIGABLE[v]) continue;
  checked++;
  // 🔴 READ: a reload must land back on this view rather than the default.
  if (!new RegExp(`rawView === "${v}"`).test(requested)) {
    bad(`"${v}" is not in getRequestedView — a reload or a shared link falls through to the default `
      + `(this is the "it went back to Pipeline" report)`);
  }
  // 🔴 WRITE: without this, navigateTo builds a URL with no view param at all — and on a magic-link
  // arrival that pushState also drops the token hash, which is the unexpected re-login.
  if (!new RegExp(`view === "${v}"`).test(builder)) {
    bad(`"${v}" is not in buildAdminUrl — navigating there produces a URL with no ?view=, so the `
      + `view is lost on reload and a magic-link hash can be dropped with it`);
  }
  if (!NO_FIXED_NAV[v] && !new RegExp(`(^|\\s)"?${v}"?:\\s*"`, "m").test(navMap)) {
    bad(`"${v}" is not in NAV_FOR_VIEW — the right view renders under the wrong sidebar highlight`);
  }
}

// 🔴 AND THE VIEW MUST ACTUALLY BE SHOWN. A flag nothing reads is a view that never appears.
for (const v of views) {
  if (NOT_NAVIGABLE[v]) continue;
  const camel = v.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const shows = new RegExp(`hidden = !flags\\.${camel}\\b`).test(src) || new RegExp(`flags\\.${camel}\\b`).test(src);
  if (!shows) bad(`nothing reads flags.${camel} — "${v}" would never be revealed by showView`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴🔴 THE TWO THAT ACTUALLY CAUSED THE LOGIN SCREEN ARE IN THE CSS. Admin view visibility is
// CSS-driven off `body[data-admin-view]`, and `.admin-client-list-view` is `display:none` by
// default. So a new view can be in every JS registry, be in the DOM, carry content and have
// `hidden=false` — and still render nothing, with the lock shell left on top. From the outside that
// is indistinguishable from being signed out, which is exactly how Chris reported it.
//
// The rule was already written in admin.css: *"A NEW ADMIN VIEW NEEDS BOTH OF THESE OR IT IS
// INVISIBLE… I shipped neither on the first attempt and Chris got the login screen."* It was
// written, and then repeated on the next view anyway — a comment is not a gate.
// → feedback_admin_view_visibility_is_css_driven
// ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  const cssPath = path.join(SITE, "admin/admin.css");
  if (!fs.existsSync(cssPath)) {
    bad("admin/admin.css not found — view visibility cannot be verified");
  } else {
    const css = fs.readFileSync(cssPath, "utf8");
    // The section id each view reveals, read from the JS so the two cannot drift.
    for (const v of views) {
      if (NOT_NAVIGABLE[v]) continue;
      const showsIt = new RegExp(`data-admin-view="${v}"\\]\\s*\\[id=`).test(css);
      if (!showsIt) {
        bad(`no CSS rule reveals the "${v}" view — \`.admin-client-list-view\` is display:none by `
          + `default, so the section stays invisible however correct the JS is`);
      }
      const clearsLock = new RegExp(`data-admin-view="${v}"\\]\\s*\\.admin-lock-shell`).test(css);
      if (!clearsLock) {
        bad(`"${v}" is missing its \`.admin-lock-shell\` rule — the login screen stays on top of it, `
          + `which reads as "it asked me to log in again"`);
      }
    }
  }
}

// 🔴 AND A VIEW MUST HAVE AN OPENER, or a deep link switches the chrome and loads nothing. The
// invariant already written in admin.js: "a URL must land in the same state as a click."
{
  const openers = (src.match(/const VIEW_OPENER = \{[\s\S]*?\n {4}\};/) || [""])[0];
  const BOOT_BRANCH = (v) => new RegExp(`requestedView === "${v}"`).test(src);
  // 🔑 A VIEW NEEDS AN OPENER ONLY IF IT HAS DATA TO FETCH. These three demonstrably render from a
  // deep link without one — verified in the browser, not assumed — so they are excused BY NAME with
  // the reason. Anything else that appears here is a new view that will switch the chrome and load
  // nothing. → feedback_a_check_must_not_validate_itself (do not loosen a check to silence a
  // truthful pass; name the exception)
  const NO_OPENER_NEEDED = {
    client: "opened with a client id; loadSelectedClient runs from the boot branch",
    dashboard: "its data is loaded by the boot flow before any view branch runs",
    create: "a static form with nothing to fetch",
  };
  for (const v of views) {
    if (NOT_NAVIGABLE[v] || NO_OPENER_NEEDED[v]) continue;
    if (!new RegExp(`(^|\\s)"?${v}"?:\\s*handleOpen`, "m").test(openers) && !BOOT_BRANCH(v)) {
      bad(`"${v}" has neither a VIEW_OPENER entry nor a boot branch — a deep link would switch the `
        + `sidebar and load nothing`);
    }
  }
}

console.log(fail
  ? `\n🔴 ${fail} registration gap(s). A view missing from any registry is one that cannot be linked to or reloaded.`
  : `\n✅ all ${checked} navigable view(s) are registered in every registry — each survives a reload and a shared link.`);
process.exit(fail ? 1 : 0);
