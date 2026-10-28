#!/usr/bin/env node
// check-approvals-page.mjs — 2026-10-20, approved approvals_page_v1 (Chris: "should it clear out when nothing to do… when things are
// done show in the list at bottom as done… how should this page work?"). Pins the client's For your approval page:
//   · three groups — Needs you (only open items: never a done or RGA-turn action) · With RGA · Done (collapsed while something needs
//     them, open when nothing does)
//   · nothing needs you = a small line, never a big card
//   · a confirmation (the duplicate removal) is ONE Done row from the server — never an action at the top
//   exit 0 holds · 1 regressed · 2 code moved
import fs from "node:fs";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const P = read("portal/portal.js"), DL = read("netlify/functions/portal-deliverables.js");
const F = [], fail = (m) => F.push(m);
const a = P.indexOf("  const needs = [\n"), b = P.indexOf("  host.innerHTML = `<div class=\"ib\">${top}<div class=\"ib-body\"><div class=\"ib-q\">${queueHtml}${settledHtml}</div>", a);   // the inbox (website_change_approvals_v1 option B, 10-23)
if (a < 0 || b < 0) { console.error("⚠️  the approvals renderer moved"); process.exit(2); }
const R = P.slice(a, b);
if (!/\.\.\.actionCards\.filter\(\(e\) => !e\.done && !e\.rga\)/.test(R)) fail("Needs you can hold a done or RGA-turn action (\"Nothing needs you\" above a card)");
if (!/_apItems\.filter\(\(d\) => !d\.approval\)/.test(R)) fail("unapproved items aren't in Needs you");
// 🔄 todo_inbox_v1 (10-26): To do holds steps too, so the small empty line says "Nothing is waiting on you"
if (!/<div class="ap-empty"><span class="ap-empty-i" aria-hidden="true">✓<\/span><span><b>Nothing is waiting on you<\/b>/.test(R)) fail("nothing-needs-you isn't the small empty line");
if (/Nothing needs you right now/.test(R)) fail("the old \"Nothing needs you right now\" heading is back over a list");
// 🔄 todo_inbox_v1 (10-26): "With RGA" became "RGA is working on", counting RGA's step moves too
// 🔄 approval_tab_and_sent_card_v1 (10-28): changes live in For your approval — a change they asked for is "RGA is changing it" there
if (!/RGA is working on · \$\{rgaN\}/.test(R) || !/rgaN = withRgaActions\.length \+ stepRga\.length;/.test(R) || !/const changing = items\.filter\(\(d\) => d\.approval && d\.approval\.decision !== "approved"\);/.test(P) || !/\(C\.length \? grp\("", "RGA is changing it", C, ""\) : ""\)/.test(P)) fail("a change they asked for isn't in With RGA");
// 🔄 todo_redesign_v1 (10-26): Done folds while ANYTHING is open — what needs them OR what RGA is working on
if (!/<details class="ap-done"\$\{needN \|\| rgaN \? "" : " open"\}>/.test(R)) fail("Done isn't collapsed while something is open / open when nothing is");
if (!/\.sort\(\(x, y\) => String\(y\.at \|\| ""\)\.localeCompare\(String\(x\.at \|\| ""\)\)\)/.test(R)) fail("Done isn't newest first");
if (/actions\.push\(\{ key: "m1\.audit\.gbp_duplicate", title: "Duplicate Google Business Profile removed"/.test(DL)) fail("the duplicate confirmation is an action at the top of the page again (it's a Done row)");
if (!/resolved\.push\(\{ key: "m1\.audit\.gbp_duplicate"/.test(DL)) fail("the duplicate confirmation isn't a Done row");
if (F.length) { console.error("🔴 the approvals page regressed:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ To do: Needs you (open items + their steps) · RGA is working on (changes asked + RGA's steps) · Done (newest first; collapsed while something needs them) · a small empty line · the duplicate confirmation is one Done row");
