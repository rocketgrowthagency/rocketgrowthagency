#!/usr/bin/env node
// check-a-link-counts-only-when-seen-live.mjs — THE LINK AND LOCAL PR PILOT COUNTS A LINK ONLY WHEN IT IS SEEN LIVE (approved tier3_best_in_class_v1 §8, the owner 11-11).
//
// WHAT IT HOLDS
//  1. "Live" needs the place's page READ in the last 35 days holding a link to the client's own domain (www / http / a deep path / rel="sponsored" all count;
//     a look-alike domain does not). A yes, an ask, a page that would not open, or an old read is never a link. A live page read again without the link is lost.
//  2. A page that did not answer changes nothing (never "no link"); outside the pilot nothing is read or searched.
//  3. A paid, "scholarship" or guest-post offer is refused on sight and is never drafted or sent; no client text promises a number of links.
//  4. The pilot: 2 clients a quarter, RGA's press, refused when full or when the count cannot be read; every link press refuses outside the pilot.
//  5. What the client sees: live links (seen, with the day) and the yeses ("they said yes"), never a yes drawn as a link; the report counts only live-now links.
//  6. Each live link is kept in client_backlinks (best effort, the step's record stays the truth); the admin endpoint accepts the pilot's presses.
// Universal fixtures: a .co.uk client, a sponsor link, a www/no-www mix, a page in another language.
// FAKES ONLY: no page fetch, no search, no model, no database. SELF-PROVING: after a pass, the same checks on the website at LIVE_BEFORE must fail 5+ ways
// (else exit 2). --against=<revision> runs them on that revision and exits 1 when they fail.
// Exit 0 healthy · 1 a rule is broken · 2 INDETERMINATE
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { createRequire } from "node:module"; import { execFileSync } from "node:child_process";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const WEB_GIT = process.env.WEBSITE_GIT_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const AGAINST = (process.argv.find((a) => a.startsWith("--against=")) || "").slice(10);
const LIVE_BEFORE = process.env.LIVE_BEFORE || "b1a48dda";
const MIN_BEFORE_FAILS = 5;
const strip = (t) => String(t || "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const DAY = 86400000;

async function checks(root) {
  const F = [], fail = (m) => F.push(m);
  const req = createRequire(`${root}/netlify/functions/`);
  const read = (r) => { try { return fs.readFileSync(`${root}/${r}`, "utf8"); } catch { return null; } };
  let Q, MQ;
  try { Q = req("../../shared/monthly-quarter.js"); MQ = req("./_monthly-quarter.js"); } catch (e) { return [`the links step does not load: ${String(e.message).split("\n")[0]}`]; }
  const now = Date.parse("2026-11-16T15:00:00Z"), iso = (d) => new Date(now - d * DAY).toISOString(), month = "2026-11-01", L = "m2.exec.local_pr";
  const mk = (task, o = {}) => {
    const store = { tasks: { [L]: JSON.parse(JSON.stringify(task)) } }, seen = { reads: [], backlinks: [], searches: 0 };
    const d = { now: () => now,
      readStepRecord: async () => ({ tasks: JSON.parse(JSON.stringify(store.tasks)) }), writeStepTasks: async (rec, tasks) => { store.tasks = JSON.parse(JSON.stringify(tasks)); return { tasks: store.tasks }; },
      readPage: async (u) => { seen.reads.push(u); const p = (o.pages || {})[u]; if (p === "throw") throw new Error("timeout"); return p || { status: 404, html: "" }; },
      pageNames: () => true, businessName: async () => "Beta Roofing & Sons", websiteOf: async () => o.site || "https://www.betaroofing.co.uk",
      recordBacklink: async (x) => { seen.backlinks.push(x); if (o.backlinkFails) throw new Error("table missing"); return true; },
      pilotCount: async () => (o.count === "fail" ? (() => { throw new Error("db"); })() : o.count == null ? 0 : o.count),
      draftAsk: async () => ({ subject: "A story idea", body: "Hello" }), searchOff: () => false,
      findPlaces: async () => { seen.searches++; return { searches: 4, places: [{ host: "leedsnews.co.uk", name: "Leeds News", url: "https://leedsnews.co.uk/business" }, { host: "scholarships4u.com", name: "Roofing scholarship: get a link", url: "https://scholarships4u.com/apply" }, { host: "blog.example", name: "Write for us", url: "https://blog.example/write-for-us" }] }; },
      monthNumber: async () => 3 };
    return { d, store, seen, task: () => store.tasks[L] };
  };
  const pilot = { pilot: { on: true, at: iso(20) } };
  // ── 1, 2 · the morning run's read ──
  const pages = {
    "https://a.org/sponsors": { status: 200, html: '<p>Nos sponsors</p><a rel="sponsored noopener" href="http://betaroofing.co.uk/">Beta</a>' },
    "https://b.org/members": { status: 200, html: '<a href="https://WWW.betaroofing.co.uk/about/team?x=1">Beta Roofing</a>' },
    "https://c.org/list": { status: 200, html: '<p>Beta Roofing & Sons is a member</p><a href="https://betaroofing.co.uk.evil.net/">x</a><a href="https://notbetaroofing.co.uk/">y</a>' },
    "https://d.org/x": "throw", "https://e.org/y": { status: 500, html: "" },
    "https://f.org/old": { status: 200, html: "<p>We removed our sponsors page.</p>" },
  };
  let x = mk({ ...pilot, places: {
    "a.org": { state: "asked", name: "Club des sports", url: "https://a.org/sponsors", asked_at: iso(10) },
    "b.org": { state: "replied", name: "Chamber", url: "https://b.org/members", replied_at: iso(5) },
    "c.org": { state: "asked", name: "Look-alike", url: "https://c.org/list", asked_at: iso(10) },
    "d.org": { state: "asked", name: "Times out", url: "https://d.org/x", asked_at: iso(10) },
    "e.org": { state: "replied", name: "Server error", url: "https://e.org/y", replied_at: iso(10) },
    "f.org": { state: "live", name: "Was live", url: "https://f.org/old", live_seen_at: iso(30), read_at: iso(30) } } }, { pages });
  let out = null;
  try { out = await MQ.linksRead({ clientId: "c", month, deps: x.d }); } catch (e) { fail(`the morning run's link read threw: ${e.message}`); }
  const P = (h) => (x.task().places || {})[h] || {};
  if (P("a.org").state !== "live" || !P("a.org").live_seen_at) fail("a sponsor link (rel=sponsored, http, no www) to the client's domain was not counted live");
  if (P("b.org").state !== "live") fail("a link with WWW, a path and a query to the client's domain was not counted live");
  if (P("c.org").state === "live") fail("a page that only names the business, or links to a look-alike domain, was counted live");
  if (P("c.org").state !== "asked" || !P("c.org").read_at) fail("a page read without the link did not stay asked with its read day");
  if (P("d.org").read_at || P("e.org").read_at || P("d.org").state !== "asked" || P("e.org").state !== "replied") fail("a page that did not answer changed the place (it must change nothing, never 'no link')");
  if (P("f.org").state === "live" || !P("f.org").lost_at) fail("a live page read again without the link stayed live (it must go back to replied, lost)");
  if (!x.seen.backlinks.some((b) => b.status === "live" && /a\.org/.test(b.sourceUrl) && /sponsored/.test(b.rel || ""))) fail("a link seen live was not kept in client_backlinks with its rel");
  if (!x.seen.backlinks.some((b) => b.status === "removed" && /f\.org/.test(b.sourceUrl))) fail("a lost link was not marked removed in client_backlinks");
  // a failing backlink table never blocks the step
  x = mk({ ...pilot, places: { "a.org": { state: "asked", name: "Club", url: "https://a.org/sponsors", asked_at: iso(10) } } }, { pages, backlinkFails: true });
  try { await MQ.linksRead({ clientId: "c", month, deps: x.d }); } catch (e) { fail(`a failing client_backlinks write broke the read: ${e.message}`); }
  if (((x.task().places || {})["a.org"] || {}).state !== "live") fail("with client_backlinks failing, the seen link was not recorded on the step");
  // outside the pilot nothing is read
  x = mk({ places: { "a.org": { state: "asked", name: "Club", url: "https://a.org/sponsors", asked_at: iso(10) } } }, { pages });
  await MQ.linksRead({ clientId: "c", month, deps: x.d }).catch(() => null);
  if (x.seen.reads.length) fail("a client outside the pilot had its pages read");
  // a paid place is never read as a link target
  x = mk({ ...pilot, places: { "s.com": { state: "asked", name: "Scholarship page", url: "https://a.org/sponsors", asked_at: iso(10), paid: true } } }, { pages });
  await MQ.linksRead({ clientId: "c", month, deps: x.d }).catch(() => null);
  if (((x.task().places || {})["s.com"] || {}).state === "live") fail("a paid place was counted as a live link");

  // ── 1 · the 35 days, and a clock that was not handed ──
  const T = (seen) => ({ ...pilot, places: { "a.org": { state: "live", name: "Club", live_seen_at: iso(seen) } } });
  if (Q.linksState(T(34), now).live.length !== 1) fail("a link read 34 days ago is not counted live");
  if (Q.linksState(T(36), now).live.length !== 0) fail("a link read 36 days ago still counts live (35 days is the limit)");
  if (typeof Q.linksState === "function" && Q.linksState(T(1)).live.length !== 0) fail("without a clock a link still counts live (it must not guess)");
  if (Q.linksState({ ...pilot, places: { "a.org": { state: "live", name: "Club" } } }, now).live.length) fail("a place marked live with no read day counts live");
  const v36 = Q.linksView({ task: T(36), now, site: "betaroofing.co.uk" });
  if (!v36 || (v36.rows || []).some((r) => r.right === "Live")) fail("the admin card shows Live for a link read 36 days ago");
  // the report's block counts only live-now links
  const blk = Q.blockOf({ tasks: { [L]: { ...pilot, places: { "a.org": { state: "live", name: "Club", live_seen_at: iso(40) }, "b.org": { state: "replied", name: "B" } } } }, monthNumber: 3, now });
  if (blk && blk.lines.some((l) => /link/i.test(l))) fail("the report counts a link not read in 35 days, or a yes, as a new link");

  // ── 3, 4 · the presses ──
  const act = async (task, action, body = {}, o = {}) => { const y = mk(task, o); const r = await MQ.act({ clientId: "c", month, action, body, deps: y.d, by: "rga@x" }).catch((e) => ({ ok: false, error: e.message })); return { r, y }; };
  const paidPlace = { ...pilot, places: { "s.com": { state: "drafted", name: "Roofing scholarship page", url: "https://s.com/scholarship", ask: { subject: "Hi", body: "x" } }, "g.com": { state: "drafted", name: "Home blog", url: "https://g.com/write-for-us", ask: { subject: "Guest post", body: "x" } } } };
  for (const h of ["s.com", "g.com"]) { const { r } = await act(paidPlace, "links_asked", { host: h }); if (r.ok) fail(`a ${h === "s.com" ? "scholarship" : "guest-post"} offer was marked sent`); }
  { const { r } = await act({ ...pilot, places: { "s.com": { state: "found", name: "Paid link placement", url: "https://s.com/x" } } }, "links_ask", { host: "s.com" }); if (r.ok) fail("an ask was drafted for a paid-link offer"); }
  { const { r, y } = await act({ ...pilot }, "links_find"); if (!r.ok) fail(`the finder did not run in the pilot: ${r.error}`); else { const ps = y.task().places || {};
      if ((ps["scholarships4u.com"] || {}).state !== "not_for" || (ps["blog.example"] || {}).state !== "not_for") fail("the finder kept a scholarship or write-for-us page as a place to ask");
      if ((ps["leedsnews.co.uk"] || {}).state !== "found") fail("the finder lost a real local place"); } }
  { const { r, y } = await act({ ...pilot }, "links_add", { name: "Guest post opportunity", url: "https://x.com/guest-posts" }); if (r.ok && ((y.task().places || {})["x.com"] || {}).state !== "not_for") fail("a guest-post page added by hand was not refused"); }
  { const { r, y } = await act({ ...pilot, places: { "a.org": { state: "asked", name: "Club", url: "https://a.org/sponsors", asked_at: iso(3) } } }, "links_replied", { host: "a.org" });
    if (!r.ok || ((y.task().places || {})["a.org"] || {}).state !== "replied") fail("a yes was not recorded as Replied");
    else if (Q.linksState(y.task(), now).live.length) fail("a yes counts as a live link"); }
  { const { r } = await act({}, "links_find"); if (r.ok) fail("the finder ran for a client outside the pilot"); }
  { const { r } = await act({}, "links_pilot", {}, { count: 2 }); if (r.ok) fail("a third client joined a pilot of 2"); }
  { const { r } = await act({}, "links_pilot", {}, { count: "fail" }); if (r.ok) fail("a client joined the pilot when the count could not be read"); }
  { const { r, y } = await act({}, "links_pilot", {}, { count: 1 }); if (!r.ok || !(y.task().pilot || {}).on) fail(`the second pilot client could not join: ${r.error || ""}`); }
  { const { r, y } = await act({ ...pilot }, "links_hours", { hours: 1.5 }); if (!r.ok || Number(((y.task().outcome_data || {}).hours)) !== 1.5) fail("hours could not be logged"); }
  const off = Q.linksView({ task: {}, now, pilot: { count: 2, max: 2 } });
  if (!off || !(off.rows || []).some((r) => /^Links and local press start after the pilot\.$/.test(r.title))) fail("outside the pilot the card is not the one folded line");

  // ── 5 · what the client sees ──
  const cv = typeof Q.linksClientView === "function" ? Q.linksClientView({ ...pilot, places: { "a.org": { state: "live", name: "Club", live_seen_at: iso(2) }, "b.org": { state: "replied", name: "Chamber" }, "c.org": { state: "asked", name: "Hidden" }, "d.org": { state: "live", name: "Stale", live_seen_at: iso(50) } } }, now) : null;
  if (!cv) fail("there is no client view of the pilot's links");
  else {
    if (cv.live.map((l) => l.name).join() !== "Club") fail(`the client sees as live: ${cv.live.map((l) => l.name).join(", ")} (a stale or unseen link must not show as live)`);
    if (!cv.replied.some((l) => l.name === "Chamber") || cv.live.some((l) => l.name === "Chamber")) fail("a yes is drawn as a link for the client");
  }
  if (typeof Q.linksClientView === "function" && Q.linksClientView({ places: {} }, now) !== null) fail("a client outside the pilot is shown the links card");
  const portal = read("portal/portal.js") || "", card = (portal.match(/function linksCardHtml\([\s\S]*?\n\}/) || [""])[0];
  if (!card) fail("the client portal has no Places that link to you card");
  if (card && !/We never buy links/.test(card)) fail("the client card does not say we never buy links");
  const promise = /(guarantee|we will get you|at least \d+ links?|\d+ (new )?links? (a|per|each|every) (month|quarter))/i;
  for (const [f, t] of [["portal linksCardHtml", card], ["shared/monthly-quarter.js", strip(read("shared/monthly-quarter.js") || "")]]) if (promise.test(t)) fail(`${f} promises a number of links: "${(t.match(promise) || [])[0]}"`);
  // ── 6 · wired ──
  const ep = strip(read("netlify/functions/admin-monthly-quarter.js") || "");
  for (const a of ["links_asked", "links_pilot", "links_replied", "links_refuse", "links_hours", "links_add"]) if (!new RegExp(`"${a}"`).test(ep)) fail(`the admin endpoint refuses "${a}"`);
  const pq = strip(read("netlify/functions/portal-quarter-answer.js") || "");
  if (!/kind === "links"/.test(pq) || !/kind === "part_of"/.test(pq) || !/requirePortalOwner/.test(pq)) fail("the client's links card is not read and answered through the owner-only endpoint");
  const srv = strip(read("netlify/functions/_monthly-quarter.js") || "");
  if (!/client_backlinks/.test(srv)) fail("a live link is not kept in client_backlinks");
  return F;
}

function extract(rev) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "linkslive-"));
  try { execFileSync("sh", ["-c", `git -C "$0" archive "$1" shared netlify/functions portal/portal.js data/playbooks | tar -x -C "$2"`, WEB_GIT, rev, dir], { stdio: ["ignore", "ignore", "pipe"] }); return dir; }
  catch { return null; }
}

if (!fs.existsSync(`${SITE}/shared/monthly-quarter.js`)) { console.error(`⚠️  INDETERMINATE — cannot read ${SITE}/shared/monthly-quarter.js`); process.exit(2); }
if (AGAINST) {
  const dir = extract(AGAINST); if (!dir) { console.error(`⚠️  INDETERMINATE — could not read the website at ${AGAINST}`); process.exit(2); }
  const F = await checks(dir); fs.rmSync(dir, { recursive: true, force: true });
  console.log(F.length ? `✗ ${F.length} rule(s) fail at ${AGAINST}:\n${F.map((f) => `  - ${f}`).join("\n")}` : `✓ every rule holds at ${AGAINST}`);
  process.exit(F.length ? 1 : 0);
}
const F = await checks(SITE);
if (F.length) { console.error(`✗ check-a-link-counts-only-when-seen-live: ${F.length} problem(s)\n${F.map((f) => `  - ${f}`).join("\n")}`); process.exit(1); }
const dir = extract(LIVE_BEFORE);
if (!dir) { console.error(`⚠️  INDETERMINATE — could not read the website at ${LIVE_BEFORE} to prove this checker can fail`); process.exit(2); }
const B = await checks(dir); fs.rmSync(dir, { recursive: true, force: true });
if (B.length < MIN_BEFORE_FAILS) { console.error(`⚠️  INDETERMINATE — on the before state (${LIVE_BEFORE}) only ${B.length} rule(s) failed; it must fail ${MIN_BEFORE_FAILS}+ to prove it can tell`); process.exit(2); }
console.log(`✓ check-a-link-counts-only-when-seen-live: live = read in 35 days with a link to their domain; a yes, an ask or a dead page is never a link; paid offers refused; the 2-client pilot; the client sees only seen links (before state ${LIVE_BEFORE}: ${B.length} failures)`);
process.exit(0);
