#!/usr/bin/env node
// check-admin-dashboard-opens-on-itself.mjs — admin_dashboard_top_v2 (the owner 11-9: "fix admin portal dashboard to not show the TO DO list
// at top"; then, after research, approved): the Dashboard opens on its own heading. No to-do card draws above it:
//   · the System health card is its own tab only (the Dashboard counts it in ONE Your work queue line, shLooks)
//   · the Blog card lives on the Website Work tab of the client whose site it watches (BL.clientId from admin-blog's client_id)
//   · the blog's presses are counted in ONE home (blogMoves): the card's "N things waiting", the To do rows and the Dashboard line
// Source only (no network). It proves itself: the same checker runs on the website at the build's before state (380620b1 by default,
// --against=<rev>) and MUST fail there; if it can't read that revision it is INDETERMINATE and exits 2, never green.
// → feedback_a_build_must_remove_what_it_replaces (a check of ABSENCE, not only presence)
import fs from "node:fs";
import { execFileSync } from "node:child_process";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const BEFORE = (process.argv.find((a) => a.startsWith("--against=")) || "--against=380620b1").slice(10);

function check({ A, IDX, FN }) {
  const bad = [];
  const need = (ok, msg) => { if (!ok) bad.push(msg); };
  // absence: nothing draws above the Dashboard
  const blogAt = IDX.indexOf('id="blogCard"'), dashAt = IDX.indexOf('id="dashboardView"'), wwAt = IDX.indexOf('id="panel-websitework"');
  need(blogAt > -1 && wwAt > -1 && blogAt > wwAt, "the Blog card's host is not inside the Website Work tab (it would draw above every view)");
  need(!(blogAt > -1 && dashAt > -1 && blogAt < dashAt && blogAt < wwAt), "the Blog card's host still sits above the Dashboard");
  need(!/BLOG_VIEWS = new Set\(\["dashboard"\]\)/.test(A), "the Blog card is still drawn on the Dashboard (BLOG_VIEWS)");
  need(!/SH\.view !== "dashboard"\)\) \{ host\.hidden = true;/.test(A), "the System health card still draws on the Dashboard");
  need(/if \(!full\) \{ host\.hidden = true;/.test(A), "the System health card isn't limited to its own tab");
  // where they live now
  need(/const blogShownHere = \(\) => SH\.view === "client" && state\.activeTab === "websitework" && !!BL\.clientId && !!state\.selectedClient && state\.selectedClient\.id === BL\.clientId;/.test(A),
    "the Blog card isn't tied to its own client's Website Work tab");
  need(/if \(!blogShownHere\(\)\) \{ host\.hidden = true; host\.innerHTML = ""; return; \}/.test(A), "paintBlogCard doesn't hide the card everywhere else");
  need(/card\.client_id = \(g\.oauth && g\.oauth\.client_id\) \|\| null;/.test(FN), "admin-blog doesn't say which client the blog belongs to");
  need(/if \(fresh && fresh\.client_id\) BL\.clientId = fresh\.client_id;/.test(A), "a failed read would lose which client the card belongs to");
  // one home for the presses
  need(/function blogMoves\(d\)/.test(A) && /const you = blogMoves\(d\)\.length;/.test(A), "the card's 'N things waiting' doesn't count blogMoves");
  need(/const blog = BL\.clientId \? blogMoves\(BL\.data\) : \[\];/.test(A) && /blog\.map\(mvBlogRowHtml\)/.test(A), "To do doesn't list the blog's presses");
  need(/const blogM = BL\.clientId \? blogMoves\(BL\.data\) : \[\];/.test(A) && /if \(blogM\.length\) todo\.push\(\{ n: blogM\.length,[^\n]*"Moves in To do"[^\n]*nav: "openTodoButton" \}\);/.test(A), "the Dashboard has no 'Moves in To do' line counted from blogMoves");
  // one short line, never the list itself (the first live look repeated "approve or decline 12 posts…" five times)
  need(!/s: blogM\.map\(/.test(A), "the Dashboard line lists every blog press instead of one grouped line");
  need(/const looks = shLooks\(\);\s*\n\s*if \(looks\) todo\.push\(\{[^\n]*nav: "openSystemHealthButton" \}\);/.test(A), "the Dashboard has no System health line");
  need(/data-mv-blog/.test(A) && /navigateTo\("client", \{ clientId: id, tab: "websitework" \}\);/.test(A), "a blog row's Open doesn't go to the Website Work tab");
  // the two screens redraw when the blog or System health arrives
  need(/if \(SH\.view === "dashboard"\) \{ try \{ renderDashboardExtra\(\); \}/.test(A) && /if \(SH\.view === "todo"\) \{ try \{ renderTodoQueue\(\); \}/.test(A), "the Dashboard / To do don't redraw when the counts arrive");
  return bad;
}

const read = (p) => fs.readFileSync(`${SITE}/${p}`, "utf8");
const now = check({ A: read("admin/admin.js"), IDX: read("admin/index.html"), FN: read("netlify/functions/admin-blog.js") });
let before;
try {
  const show = (p) => execFileSync("git", ["-C", SITE, "show", `${BEFORE}:${p}`], { encoding: "utf8", maxBuffer: 64 << 20 });
  before = check({ A: show("admin/admin.js"), IDX: show("admin/index.html"), FN: show("netlify/functions/admin-blog.js") });
} catch (e) {
  console.log(`INDETERMINATE: couldn't read the before state ${BEFORE} (${String(e.message).slice(0, 120)}), so this check can't prove it can fail`);
  process.exit(2);
}
if (before.length < 5) { console.log(`INDETERMINATE: the checker finds only ${before.length} problem(s) at ${BEFORE}; it can't tell the old Dashboard from the new one`); process.exit(2); }
if (now.length) { console.log(`❌ the admin Dashboard opens on itself — ${now.length} problem(s):`); now.forEach((m) => console.log(`  · ${m}`)); process.exit(1); }
console.log(`✅ the admin Dashboard opens on itself: no to-do card above it, System health on its tab, the Blog card on its client's Website Work tab, its presses counted once (To do + one Dashboard line). Proven: the old code at ${BEFORE} fails ${before.length} ways.`);
