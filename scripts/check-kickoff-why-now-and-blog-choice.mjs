#!/usr/bin/env node
// check-kickoff-why-now-and-blog-choice.mjs — approved mockup client_kickoff_why_now_v1 (Nov 1). File-only, no network, no database.
// HOLDS:
//  A. the kickoff question: first line of "Their why" on the call console; "did not say" saves nothing and never saves "no"; the note is RGA-only
//     (report.js never reads or prints why_now_note); the tile is editable; a missing column says so instead of pretending.
//  B. the blog card: the client's "no" is kept (blog_posts_off_at, one SQL file), only the signed-in OWNER can say no or turn it back on, the monthly
//     step reads it (no more literal `vetoed: false`), a page list that could not be read names no missing page, and no copy promises calls or a Maps rank.
// exit 0 = holds · 1 = broken · 2 = can't tell
import fs from "node:fs";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`INDETERMINATE: cannot read ${r}`); process.exit(2); } };
const adm = read("admin/admin.js"), rep = read("portal/report/report.js"), flow = read("netlify/functions/flow-execute.js"), fn = read("netlify/functions/portal-blog-posts.js");
const sql = read("supabase/blog_client_choice.sql"), portal = read("portal/portal.js"), whySql = read("supabase/report_why_now.sql");
const F = []; const fail = (m) => F.push(m);
const strip = (t) => t.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
// ── A
const their = adm.slice(adm.indexOf('t: "Their why"'), adm.indexOf('t: "The plan"'));
if (!/blocks: \[\s*\["whynow"\]/.test(their)) fail('"Their why" no longer starts with the why-now question');
if (!/if \(k === "whynow"\) return whyNowBlockHtml\(\)/.test(adm)) fail("the call console does not draw the why-now block");
const save = adm.slice(adm.indexOf("[data-whynow-save]"), adm.indexOf("function kickoffTopicHtml"));
if (!/d\.pick !== "yes" && d\.pick !== "no"/.test(save)) fail('"did not say" can reach the save (only yes or no may)');
if (!/why_now_slow: d\.pick === "yes"/.test(save)) fail('"yes" no longer saves true and "no" false');
if (/why_now_slow: (false|null)\b/.test(save)) fail("the save writes a literal no/empty");
if (!/report_why_now\.sql/.test(save)) fail("a missing column is not named to the person pressing Save");
if (!/data-whynow-open/.test(adm.slice(adm.indexOf("function whyNowTileHtml"), adm.indexOf("function renderKpiHeadline")))) fail("the tile has no way to change the answer later");
if (/why_now_note/.test(strip(rep))) fail("the client's report reads the RGA-only note");
if (!/alter table public\.clients add column if not exists why_now_slow/.test(whySql) || !/why_now_note/.test(whySql)) fail("report_why_now.sql lost a column");
if (!/Nothing saved\. The report prints nothing\./.test(adm)) fail('the "did not say" line is gone');
// ── B
if (!/blog_posts_off_at timestamptz/.test(sql) || !/add column if not exists/.test(sql)) fail("the veto column is not in the SQL file, safe to run twice");
if (/vetoed:\s*false/.test(flow)) fail("the monthly step hardcodes vetoed: false again");
if (!/vetoed: Boolean\(client\.blog_posts_off_at\)/.test(flow)) fail("the monthly step does not read the client's no");
if (!/action === "read" \? await requirePortalOwnerOrWorkspace\(event, clientId\) : await requirePortalOwner\(event, clientId\)/.test(fn)) fail("saying no / turning posts back on is not owner-only");
if (!/s\.off !== off/.test(fn)) fail("the veto write is not read back before it says done");
if (/requirePortalOwnerOrWorkspace\(event, clientId\) : await requirePortalOwnerOrWorkspace/.test(fn) || (fn.match(/requirePortalOwnerOrWorkspace\(/g) || []).length !== 1) fail("RGA could be allowed to press the client's buttons");
if (!/blogPlanHostHtml\(clientId\)/.test(portal.slice(portal.indexOf("function recordCardHtml"), portal.indexOf("function recordCardHtml") + 900))) fail("the blog card is not on the website access step");
if (!/data-blog-off/.test(portal) || !/data-blog-on/.test(portal)) fail("the card lost Say no / Turn posts back on");
const NEVER_OK = /never sold as a way to rank on Maps and never promise calls/;
const req = createRequire(import.meta.url);
const { blogCard } = req(`${SITE}/netlify/functions/_blog-client-plan.js`);
const text = (c) => [c.title, c.side, c.note, c.actionLabel, ...(c.rows || []).flatMap((r) => [r.label, r.value, r.sub])].join(" | ");
const cases = {
  "no website": { hasSite: false, pagesRead: false, services: [], facts: [] },
  "no services": { hasSite: true, pagesRead: true, pages: ["/"], services: [], facts: [] },
  "service with no page, UK-style name": { hasSite: true, pagesRead: true, pages: ["/"], services: [{ name: "Gas Safe boiler servicing", path: null }], facts: [] },
  "page list unreadable": { hasSite: true, pagesRead: false, services: [{ name: "Drain cleaning", path: null }], facts: [{ text: "x", source: "y" }] },
  "ready": { hasSite: true, pagesRead: true, pages: ["/drain-cleaning/"], services: [{ name: "Drain cleaning", path: "/drain-cleaning/" }], facts: [{ text: "a job", source: "their result" }] },
  "ready, no material": { hasSite: true, pagesRead: true, pages: ["/a/"], services: [{ name: "A", path: "/a/" }], facts: [] },
  "off": { off: true, offAt: "Nov 3", hasSite: true, pagesRead: true, services: [], facts: [] },
};
const want = { "no website": "pages_first", "no services": "pages_first", "service with no page, UK-style name": "pages_first", "page list unreadable": "unread", "ready": "ready", "ready, no material": "no_material", "off": "off" };
for (const [name, inp] of Object.entries(cases)) {
  let c; try { c = blogCard(inp); } catch (e) { fail(`${name}: the card throws (${e.message})`); continue; }
  if (c.state !== want[name]) fail(`${name}: state is ${c.state}, wanted ${want[name]}`);
  const t = text(c);
  if (/—/.test(t)) fail(`${name}: an em dash in the copy`);
  if (/\b(rank|ranking)\b/i.test(t.replace(NEVER_OK, "")) || /\b(guarantee|more calls|more customers|will bring|first page)\b/i.test(t)) fail(`${name}: the copy promises a result: ${t.slice(0, 120)}`);
  if (name === "page list unreadable" && /Not yet/.test(t)) fail("an unreadable page list was turned into a claim that pages are missing");
  if (name === "off" && c.action !== "on") fail("a client who said no has no way to turn posts back on");
}
if (F.length) { console.error("the kickoff question or the blog choice can break:"); for (const f of F) console.error("   - " + f); process.exit(1); }
console.log("OK: the why-now question saves only a real answer; the blog card keeps the client's no, owner-only, and promises nothing");
