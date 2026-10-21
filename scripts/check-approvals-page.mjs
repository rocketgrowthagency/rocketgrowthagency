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
const a = P.indexOf("  const settled = _apItems.filter((d) => d.approval);"), b = P.indexOf("  host.innerHTML = queueHtml + settledHtml;", a);
if (a < 0 || b < 0) { console.error("⚠️  the approvals renderer moved"); process.exit(2); }
const R = P.slice(a, b);
if (!/\.\.\.actionCards\.filter\(\(e\) => !e\.done && !e\.rga\)/.test(R)) fail("Needs you can hold a done or RGA-turn action (\"Nothing needs you\" above a card)");
if (!/_apItems\.filter\(\(d\) => !d\.approval\)/.test(R)) fail("unapproved items aren't in Needs you");
if (!/Nothing needs your approval right now/.test(R) || !/class="ap-empty"/.test(R)) fail("nothing-needs-you isn't the small empty line");
if (/Nothing needs you right now/.test(R)) fail("the old \"Nothing needs you right now\" heading is back over a list");
if (!/With RGA · \$\{withRgaActions\.length \+ changingItems\.length\}/.test(R) || !/settled\.filter\(\(d\) => d\.approval\.decision !== "approved"\)/.test(R)) fail("a change they asked for isn't in With RGA");
if (!/<details class="ap-done"\$\{needs\.length \? "" : " open"\}>/.test(R)) fail("Done isn't collapsed while something needs them / open when nothing does");
if (!/\.sort\(\(x, y\) => String\(y\.at \|\| ""\)\.localeCompare\(String\(x\.at \|\| ""\)\)\)/.test(R)) fail("Done isn't newest first");
if (/actions\.push\(\{ key: "m1\.audit\.gbp_duplicate", title: "Duplicate Google Business Profile removed"/.test(DL)) fail("the duplicate confirmation is an action at the top of the page again (it's a Done row)");
if (!/resolved\.push\(\{ key: "m1\.audit\.gbp_duplicate"/.test(DL)) fail("the duplicate confirmation isn't a Done row");
if (F.length) { console.error("🔴 the approvals page regressed:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ For your approval: Needs you (open items only) · With RGA (changes asked) · Done (newest first; collapsed while something needs them) · a small empty line · the duplicate confirmation is one Done row");
