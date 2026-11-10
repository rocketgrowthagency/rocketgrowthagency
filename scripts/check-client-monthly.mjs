#!/usr/bin/env node
// check-client-monthly.mjs — THE CLIENT'S MONTHLY SIDE (approved client_monthly_v1, the owner 11-9). Static + fakes: no network, no email, no search, no Google write.
//
// Two halves, and the first proves itself:
//   A. SOURCE: the new pieces EXIST and the old pieces are ABSENT, read from the website repo (portal.js, _month1-report.js, monthly-reports.js, _open-month.js, _morning-run.js, portal/index.html).
//      The same checker runs on three inputs: LIVE_BEFORE (today's strings before the build; it MUST FAIL, or the gate cannot tell), AFTER (the shape the build produces; it MUST PASS) and the
//      real files (it MUST PASS). `--against=<git rev>` runs the checker on the real files at that revision (the build's own before state) and expects it to FAIL.
//   B. BEHAVIOR (shared/client-monthly.js, _month1-report.js, _open-month.js against fakes), for EVERY client, not RGA:
//      · kickoff on the 1st (no gap) and mid-month (a gap up to 30 days); Month 1 skipped instead of sent; an Eastern-time client (the same month key the server uses)
//      · posts_wanted null / 0 / 1 / 2 / 4, never a hardcoded 4; a client without call tracking; a step skipped for this client is never listed
//      · the Dashboard's next step reads the same open steps Ongoing work draws, never promises weekly posts or photos
//      · the Month 1 letter reads in client words (no GBP, NAP, GSC, GA4, H1, CTA, schema, silo, "Their ..."), the kept report is never changed, the baseline search line names its window or is left out
//      · the month rows get their number and closed state from the morning run, idempotently, nothing deleted or overwritten
// Exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module"; import { execFileSync } from "node:child_process";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const against = (process.argv.find((a) => a.startsWith("--against=")) || "").slice(10);
const F = [], fail = (m) => F.push(m);
const FILES = { portal: "portal/portal.js", report: "netlify/functions/_month1-report.js", reports: "netlify/functions/monthly-reports.js", openMonth: "netlify/functions/_open-month.js", morning: "netlify/functions/_morning-run.js", index: "portal/index.html", shared: "shared/client-monthly.js" };
const strip = (s) => String(s || "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");
function readAt(rev) {
  const out = {};
  for (const [k, rel] of Object.entries(FILES)) {
    try { out[k] = rev ? execFileSync("git", ["-C", SITE, "show", `${rev}:${rel}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }) : fs.readFileSync(path.join(SITE, rel), "utf8"); }
    catch { out[k] = ""; }   // a file that did not exist at that revision is empty: its new pieces are missing, which is the point
  }
  return out;
}

// ───────────────────────── A. the source checker ─────────────────────────
/** Every failure the source has, as sentences. [] = the new pieces are there and the old ones are gone. */
function sourceFailures(S) {
  const out = [], p = strip(S.portal), r = strip(S.report), mr = strip(S.reports), om = strip(S.openMonth), mo = strip(S.morning);
  const need = (cond, msg) => { if (!cond) out.push(`MISSING: ${msg}`); }, gone = (cond, msg) => { if (cond) out.push(`STILL THERE: ${msg}`); };
  // the between-months state
  need(/function ogBetweenHtml\(/.test(p), "the between-months card (ogBetweenHtml)");
  need(/betweenMonths\(/.test(p) && /\bbetween\b/.test(p), "the portal asks whether the client is between months");
  need(/if \(between && globalThis\.rgaClientMonthly\) return/.test(p), "ogManagedHtml draws the between-months state");
  need(/ogPostsPickHtml\(\{ posts_wanted: wanted \}\)/.test(p), "the posts chooser is drawn between months (ogPostsPickHtml)");
  need(/ogCustomersRowHtml\(clientId, lists\)/.test(p.slice(p.indexOf("function ogBetweenHtml(") >= 0 ? p.indexOf("function ogBetweenHtml(") : 0)), "the weekly customer list row is reused, not redrawn");
  { const a = p.indexOf("if (between && globalThis.rgaClientMonthly) return"), b = p.indexOf("const startsAfter = "); need(a > 0 && b > 0 && a < b, "the between-months branch comes BEFORE the old 'Starts after setup' card in ogManagedHtml"); }
  // the old words
  gone(/Emailed on the 5th/.test(p), '"Emailed on the 5th"');
  gone(/RGA writes 4\b/.test(p), '"RGA writes 4"');
  gone(/RGA is writing \$\{escapeHtml\(m\)\}'s 4\b/.test(p) || /RGA is writing [^`"]*'s 4 posts/.test(p), '"RGA is writing <month>\'s 4 posts" (the number is the client\'s choice)');
  gone(/ogReportOn5/.test(p), "ogReportOn5 (the report never sends itself on the 5th)");
  need(/ogReportEarly/.test(p) && /RGA checks it and sends it early/.test(p), 'the report says RGA checks it and sends it early next month');
  gone(/a Google post and a photo each week/.test(p), "the dashboard's weekly post and photo promise");
  need(/betweenNextStep\(/.test(p) && /ogListIsOpen\(/.test(p), "the dashboard's next step reads the same open steps as Ongoing work");
  // dashboard tiles and what to expect
  gone(/\u2014 not in the top 20/.test(p), 'an em dash in the map tile ("Checked Oct 6, then a dash, then not in the top 20 yet")');
  need(/periodSub/.test(p) && /arrives? about|arrive about/.test(p), "the Call-button taps and New reviews tiles name their month and when the next figures arrive");
  need(/next scan about/.test(p), "the map tile says the next scan date where it is known");
  need(/currentMonthOf|betweenMonths/.test(p.slice(p.indexOf("function whatToExpectHtml("))), "What to expect leads with where the client is now");
  // reports
  need(/function reportsByMonthHtml\(/.test(p) && /data-mr-upcoming/.test(p), "Reports is one card per month, with a card for the month that isn't over");
  need(/month1_letter/.test(p) && /month1LetterHtml/.test(p), "the portal opens the Month 1 letter from the server's client-words copy");
  gone(/const nextLines = \(lines\)/.test(p), "the old Month 1 report text built from the stored admin lines (nextLines)");
  need(/month1_letter === true/.test(mr) && /month1Letter\(/.test(mr), "monthly-reports answers month1_letter from the shared client-words function");
  // client text
  gone(/kept permanently —/.test(p), 'the em dash in "kept permanently"');
  gone(/of these are still too recent/.test(p) && !/is" : "are"/.test(p), '"1 of these are still too recent"');
  need(/"is" : "are"/.test(p), "'N of these is/are still too recent' agrees with its number");
  // the report builder: one decision point for the words, the baseline window
  need(/emailItems\(work, \[\]\)\.done\.map/.test(r), "the stored report's work lines read the client words (emailItems), not the admin title");
  gone(/work\.map\(\(w\) => `\$\{w\.fewer \|\| w\.title\}/.test(r), "the stored report's work lines read the admin title");
  gone(/as measured \$\{day\(capAt\)\}/.test(r), 'the baseline line "as measured <date>" with no window');
  need(/in the \$\{winDays\} days before/.test(r), 'the baseline search line names its window ("in the 90 days before Sep 15")');
  gone(/\$\{s\.clientLabel \|\| s\.title\}/.test(r), "a step line that falls back to the admin title (s.clientLabel || s.title)");
  // the data finding
  need(/async function reconcileMonths\(/.test(om) && /reconcileMonths/.test(om.slice(om.indexOf("module.exports"))), "reconcileMonths exists and is exported");
  need(/reconcileMonths\(/.test(mo), "the morning run reconciles the month rows");
  // cache busters
  { const m = /portal\.js\?v=(\d{8}[a-z]?)/.exec(S.index || ""), c = /portal\.css\?v=(\d{8}[a-z]?)/.exec(S.index || ""); need(m && m[1] >= "20261110a", "portal.js ?v= is 20261110a or later"); need(c && c[1] >= "20261110a", "portal.css ?v= is 20261110a or later"); }
  need(/client-monthly\.js\?v=/.test(S.portal || ""), "portal.js imports shared/client-monthly.js");
  return out;
}

// LIVE_BEFORE: today's strings, before the build (taken from the live files at 380620b1). The checker MUST fail on them.
const LIVE_BEFORE = {
  portal: `
    const ogReportOn5 = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + (now.getUTCDate() > 5 ? 1 : 0), 5, 12)).toISOString();
    const startsAfter = \`<div class="pm-cs pm-tabcs">\${csCard({ tone: "off", head: \`Starts after setup\`, side: "x", body: ogLr("", "Google posts", "RGA writes 4. Nothing posts until you approve.", "Every month") + ogLr("", "Your monthly report", "Emailed on the 5th.", "Every month") })}</div>\`;
    else L = ["rga", \`RGA is writing \${escapeHtml(m)}'s 4\`, "They come"];
    desc: \`From here: a Google post and a photo each week, and review asks. Nothing needs you right now.\`
    ? \`<div class="sub">Checked \${d} — not in the top 20 yet</div>\`
    const nextLines = (lines) => { return []; };
    Every change to your business, kept permanently —
    \`<b>\${n}</b> of these are still too recent to judge.\``,
  report: "const workLines = work.length ? work.map((w) => `${w.fewer || w.title}${w.at ? ` (${day(w.at)})` : \"\"}`) : []; const period = capAt ? (winDays ? `the ${winDays} days before ${day(capAt)}` : `as measured ${day(capAt)}`) : \"\"; return `${s.clientLabel || s.title}${counted}`;",
  reports: "exports.handler = async () => { if (!(await OM.hasReportsTable(d.supa))) return json(200, { ok: true, table: false, reports: [] }); };",
  openMonth: "module.exports = { openMonth, closeMonth };", morning: "const om = await OM.openMonth(d.supa, c.id, monthKey, {});", index: '<script type="module" src="/portal/portal.js?v=20261109o"></script><link href="/portal/portal.css?v=20261109b">',
  shared: "",
};
// AFTER: the minimal shape the build produces. The checker MUST pass on it.
const AFTER = {
  portal: `import "/shared/client-monthly.js?v=20261110a";
    function ogBetweenHtml({ between, clientId, lists }) { const cust = ogCustomersRowHtml(clientId, lists); return ogPostsPickHtml({ posts_wanted: wanted }); }
    function ogManagedHtml() { if (between && globalThis.rgaClientMonthly) return x; const startsAfter = y; }
    const between = betweenMonths(t); const ogListIsOpen = (x) => 1; ogListIsOpen(0); const a = betweenNextStep({});
    const ogReportEarly = () => 1; const t = "RGA checks it and sends it early next month.";
    const periodSub = \`the full month arrives about\`; const n = \` · next scan about\`;
    function whatToExpectHtml() { return currentMonthOf(t); }
    function reportsByMonthHtml() { return \`data-mr-upcoming\`; } const f = "month1_letter"; function month1LetterHtml() {}
    Every change to your business, kept permanently: ... \${Number(n) === 1 ? "is" : "are"} still too recent`,
  report: "const workLines = work.length ? emailItems(work, []).done.map((w) => w.text) : []; const period = winDays ? `in the ${winDays} days before ${day(capAt)}` : \"\"; return `${carriedWords(s)}${counted}`;",
  reports: "if (body.month1_letter === true) { const letter = CM.month1Letter(rep, pb, tasks); }",
  openMonth: "async function reconcileMonths() {} module.exports = { reconcileMonths };", morning: "await OM.reconcileMonths(d.supa, c.id, {});", index: '<script type="module" src="/portal/portal.js?v=20261110a"></script><link href="/portal/portal.css?v=20261110a">',
  shared: "x",
};
{
  const before = sourceFailures(LIVE_BEFORE); if (before.length < 8) fail(`the checker is toothless: LIVE_BEFORE (today's strings) must fail it many ways, it failed ${before.length}`);
  const after = sourceFailures(AFTER); if (after.length) fail(`the AFTER fixture must pass the checker; it failed: ${after.join(" | ")}`);
  if (process.env.SHOW_BEFORE) console.log(`LIVE_BEFORE fails ${before.length} ways:\n  - ${before.join("\n  - ")}`);
}
const REAL = readAt(against);
{
  const f = sourceFailures(REAL);
  if (against) {
    if (!f.length) fail(`--against=${against}: the checker found nothing wrong at that revision; it cannot tell before from after`);
    else console.log(`--against=${against}: the real files at that revision FAIL the checker in ${f.length} ways (as they must):\n  - ${f.join("\n  - ")}`);
    process.exit(F.length ? 1 : 0);
  }
  for (const m of f) fail(`source: ${m}`);
}

// ───────────────────────── B. behavior ─────────────────────────
Object.assign(process.env, { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "k", INTERNAL_FN_SECRET: "x" });
globalThis.fetch = async (url) => { throw new Error(`the gate must not touch the network: ${url}`); };
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));
let CM, OM, MR, PB;
try { CM = req("../../shared/client-monthly.js"); OM = req("./_open-month.js"); MR = req("./_month1-report.js"); PB = req("../../data/playbooks/playbooks.json"); }
catch (e) { console.error(`⚠️  INDETERMINATE — a module did not load: ${e.message}`); process.exit(2); }
const JARGON = /\b(GBP|NAP|GSC|GA4|H1|CTA|KPIs?|schema|silo)\b|\bTheir [A-Z]|Fill ALL/;
const sent = (iso) => ({ "m1.report.month1": { status: "done", completed_at: iso, auto_result: { sent_message_id: "m1", sent_at: iso } } });
const skipped = (iso) => ({ "m1.report.month1": { status: "skipped", skipped_at: iso } });
const DAY = 86400000, T = (iso) => Date.parse(iso);

// 1 · between months: any kickoff day, sent or skipped, any timezone
try {
  const cases = [
    ["kickoff on the 1st: report sent Oct 28", sent("2026-10-28T20:00:00Z"), "2026-10-30T12:00:00Z", "2026-11-01"],
    ["the same client on Nov 1 (Month 2 has started)", sent("2026-10-28T20:00:00Z"), "2026-11-01T00:00:00Z", null],
    ["mid-month kickoff: report sent Nov 9", sent("2026-11-09T20:19:16Z"), "2026-11-10T12:00:00Z", "2026-12-01"],
    ["sent on the 1st: the gap is a whole month", sent("2026-11-01T00:00:00Z"), "2026-11-02T00:00:00Z", "2026-12-01"],
    ["sent on the last day, a minute before the month turns", sent("2026-11-30T23:59:00Z"), "2026-11-30T23:59:30Z", "2026-12-01"],
    ["...and once the month has turned, Month 2 has started", sent("2026-11-30T23:59:00Z"), "2026-12-01T00:00:00Z", null],
    ["Month 1 report SKIPPED (not sent)", skipped("2026-11-09T20:00:00Z"), "2026-11-10T00:00:00Z", "2026-12-01"],
    ["a skip with no date is never a guess", { "m1.report.month1": { status: "skipped" } }, "2026-11-10T00:00:00Z", null],
    ["done without the send's proof is not sent", { "m1.report.month1": { status: "done", completed_at: "2026-11-09T20:00:00Z" } }, "2026-11-10T00:00:00Z", null],
    ["Month 1 not done", {}, "2026-11-10T00:00:00Z", null],
    ["an Eastern-time client: sent Nov 30 10:30 PM ET is Dec 1 UTC, so the first monthly month is January, as the server's month key says", sent("2026-11-30T22:30:00-05:00"), "2026-12-15T00:00:00Z", "2027-01-01"],
  ];
  for (const [name, tasks, now, want] of cases) { const b = CM.betweenMonths(tasks, new Date(now)); const got = b ? b.startMonth : null; if (got !== want) fail(`1 ${name}: start month ${got}, wanted ${want}`); }
  // the portal and the server agree on every instant (the same month key, UTC, so no client's timezone moves it)
  let bad = 0; for (let t = T("2026-01-01T00:00:00Z"); t < T("2028-01-01T00:00:00Z"); t += 17 * 3600000) { const iso = new Date(t).toISOString(); if (CM.firstMonthAfter(t) !== OM.firstMonthAfter(iso)) bad++; }
  if (bad) fail(`1 the portal's first monthly month differs from the server's (_open-month firstMonthAfter) at ${bad} instants`);
  const b = CM.betweenMonths(sent("2026-11-09T20:19:16Z"), new Date("2026-11-10T00:00:00Z"));
  if (!b || b.number !== 2 || b.monthName !== "December" || b.quarterName !== "January" || b.nextReportMonth !== "January") fail(`1 the between state names Month 2, December, the first quarter month January and the report in January: ${JSON.stringify(b)}`);
  if (OM.monthNumber("2026-12-01", "2026-11-09T20:20:30Z") !== 2 || CM.currentMonthOf(sent("2026-11-09T20:00:00Z"), new Date("2027-02-03T00:00:00Z")).number !== 4) fail("1 Month 2 is December and February is Month 4");
} catch (e) { fail(`1 threw: ${e.message}`); }

// 2 · the card: every line from the records, posts_wanted never a hardcoded 4, skipped or hidden steps never listed, no call tracking
try {
  const b = CM.betweenMonths(sent("2026-11-09T20:19:16Z"), new Date("2026-11-10T00:00:00Z"));
  const text = (m) => JSON.stringify(m);
  const rec = (n) => [{ reporting_month: "2026-11-01", data: { tasks: n === undefined ? {} : { "m2.exec.gbp_posts": { posts_wanted: n } } } }];
  for (const n of [null, 0, 1, 2, 4]) {
    const wanted = CM.postsWantedFrom(n === null ? rec(undefined) : rec(n), "2026-11-01");
    if (wanted !== n) fail(`2 posts_wanted ${n}: read back as ${wanted}`);
    const m = CM.betweenModel({ between: b, tasks: {}, postsWanted: wanted, scan: null });
    const posts = m.groups.flatMap((g) => g.rows).find((r) => r.key === "posts");
    if (/writes 4|RGA writes/.test(text(m))) fail(`2 posts_wanted ${n}: the card says "RGA writes ..." (a fixed number)`);
    if (n === 0 && posts) fail("2 posts_wanted 0: a Google posts line is still listed");
    if (n === 1 && !/1 a month/.test(posts && posts.small)) fail(`2 posts_wanted 1: reads "${posts && posts.small}"`);
    if (n === 2 && !/2 a month/.test(posts && posts.small)) fail(`2 posts_wanted 2: reads "${posts && posts.small}"`);
    if (n === 4 && !/About 4 a month, your choice/.test(posts && posts.small)) fail(`2 posts_wanted 4: reads "${posts && posts.small}"`);
    if (n === null && !/the recommended number/.test(posts && posts.small)) fail(`2 posts_wanted unset: must say it is the recommended number, not their choice: "${posts && posts.small}"`);
    if (!m.groups.some((g) => g.key === "choose" && g.rows.some((r) => r.kind === "posts-pick"))) fail(`2 posts_wanted ${n}: the posts chooser is missing from "Choose before ..."`);
  }
  // the older month's choice carries (the server's postsWantedOf: newest month at or before this one)
  if (CM.postsWantedFrom([{ reporting_month: "2026-09-01", data: { tasks: { "m2.exec.gbp_posts": { posts_wanted: 2 } } } }, { reporting_month: "2026-10-01", data: { tasks: {} } }], "2026-11-01") !== 2) fail("2 an earlier month's choice must carry");
  const m = CM.betweenModel({ between: b, tasks: {}, postsWanted: null, scan: null }), rows = m.groups.flatMap((g) => g.rows);
  if (m.title !== "Month 2 starts Dec 1") fail(`2 the title is "${m.title}"`);
  if (!m.groups.some((g) => g.key === "running" && g.rows.some((r) => r.kind === "customers"))) fail("2 'Running until then' must reuse the customer list row");
  if (!/Choose before Dec 1/.test(text(m.groups.map((g) => g.label)))) fail("2 the group 'Choose before Dec 1' is missing");
  const rep = rows.find((r) => r.key === "report"); if (!rep || rep.title !== "Your December report" || !/RGA checks it and sends it early January\. Every report stays under Reports\./.test(rep.small)) fail(`2 the report line: ${text(rep)}`);
  const nums = rows.find((r) => r.key === "numbers"); if (!nums || !/first in January/.test(nums.side)) fail(`2 Your numbers must name the first quarter month: ${text(nums)}`);
  if (/Emailed on the 5th/.test(text(m))) fail("2 'Emailed on the 5th'");
  // hidden or skipped for this client: never listed
  const gone = CM.betweenModel({ between: b, tasks: { "m2.exec.review_push": { status: "skipped" }, "m2.exec.review_responses": { status: "skipped" }, "m2.exec.gbp_posts": { status: "skipped" }, "m2.snap.business_outcomes": { status: "skipped" }, "m2.report.deliver": { status: "declined" }, "m2.call.monthly": { status: "skipped" } }, postsWanted: null, scan: null });
  if (gone.groups.flatMap((g) => g.rows).length) fail(`2 a step skipped for this client was still listed: ${text(gone.groups.flatMap((g) => g.rows).map((r) => r.key))}`);
  // a client without call tracking: nothing about calls tracked, leads or the lead test is invented
  const noCalls = CM.betweenModel({ between: b, tasks: {}, postsWanted: 4, scan: null, callTracking: false });
  if (/call tracking|lead test|mystery|tracked call/i.test(text(noCalls))) fail("2 a client without call tracking is shown something about call tracking or the lead test");
  // the map scan shows only when this client has scans recorded, and says a date only when it is known
  if (rows.some((r) => r.key === "map")) fail("2 the map check is listed for a client with no scan schedule");
  const scan = CM.nextScanOf({ v2Campaign: { rank_schedule: { windows: { "2026-11-1": { status: "done" } } } } }, new Date("2026-11-09T12:00:00Z"));
  if (!scan || !scan.known || CM.shortDay(scan.at) !== "Nov 15") fail(`2 next scan after a done first window on Nov 9 is Nov 15: ${text(scan)}`);
  if (CM.nextScanOf({}, new Date("2026-11-09T12:00:00Z")) !== null) fail("2 a client with no scans has no next scan");
  if (CM.nextScanOf({ v2Campaign: { rank_schedule: { windows: { "2026-11-1": { status: "retry" } } } } }, new Date("2026-11-09T12:00:00Z")).known) fail("2 a window not done must not name a date");
  // figures arrive
  if (CM.shortDay(CM.figuresArriveMs("2026-11-01")) !== "Dec 2" || CM.shortDay(CM.figuresArriveMs("2026-10-01")) !== "Nov 2") fail("2 a month's Google figures arrive about the 2nd of the month after");
} catch (e) { fail(`2 threw: ${e.message}`); }

// 3 · the Dashboard's next step reads the same open steps
try {
  const b = CM.betweenMonths(sent("2026-11-09T20:19:16Z"), new Date("2026-11-10T00:00:00Z"));
  const open = CM.betweenNextStep({ between: b, listOpen: true, listTitle: "this week's customer list", postsChosen: true, nextListDueMs: null });
  if (open.title !== "Send this week's customer list" || open.goto !== "ongoing" || open.btn !== "Open the list") fail(`3 list open: ${JSON.stringify(open)}`);
  const none = CM.betweenNextStep({ between: b, listOpen: false, postsChosen: true, nextListDueMs: T("2026-11-16T00:00:00Z") });
  if (none.title !== "Nothing needs you right now" || !/Nov 16/.test(none.desc)) fail(`3 nothing open must say so and name the next date: ${JSON.stringify(none)}`);
  const far = CM.betweenNextStep({ between: b, listOpen: false, postsChosen: true, nextListDueMs: null });
  if (far.title !== "Nothing needs you right now" || !/Dec 1/.test(far.desc)) fail(`3 with no list date the next date is the month start: ${JSON.stringify(far)}`);
  const choose = CM.betweenNextStep({ between: b, listOpen: false, postsChosen: false, nextListDueMs: null });
  if (!/Choose how many Google posts/.test(choose.title) || choose.scroll !== "step-row-og-posts-pick") fail(`3 an unmade posts choice is an open step: ${JSON.stringify(choose)}`);
  for (const a of [open, none, far, choose]) if (/each week|every week|a photo|weekly post/i.test(a.title + a.desc)) fail(`3 the next step promises weekly posts or photos: ${JSON.stringify(a)}`);
} catch (e) { fail(`3 threw: ${e.message}`); }

// 4 · the Month 1 letter reads in client words, the kept report is never changed
try {
  const pb = [
    { id: "m1.gbp.categories", title: "Lock primary + secondary categories", clientFeed: "Set your Google categories" },
    { id: "m1.web.h1", title: "Fix H1 + primary CTA", clientFeed: null, clientLabel: null },
    { id: "m1.web.nap", title: "Match NAP across header/footer/contact", clientFeed: "", clientLabel: null },
    { id: "m1.web.silo", title: "Build silo internal-link architecture", clientFeed: null },
    { id: "m1.brand.youtube_setup", title: "Their YouTube channel", clientFeed: "Set up your YouTube channel" },
    { id: "m1.gbp.photos", title: "Provide 20+ business photos", clientLabel: "Share your business photos" },
    { id: "m1.cit.priority_top10", title: "Build top-10 priority citations" },
    { id: "m1.access.analytics", title: "x", clientLabel: "Grant RGA access to Google Analytics (or skip if you don't have GA4 yet)" },
  ];
  const tasks = { "m1.gbp.categories": { status: "done", completed_at: "2026-09-14T10:00:00Z" }, "m1.web.h1": { status: "done", completed_at: "2026-11-08T10:00:00Z" }, "m1.web.nap": { status: "done", completed_at: "2026-11-07T10:00:00Z" },
    "m1.web.silo": { status: "done", completed_at: "2026-11-09T10:00:00Z" }, "m1.brand.youtube_setup": { status: "done", completed_at: "2026-11-09T11:00:00Z" },
    "m1.gbp.photos": { status: "skipped", skipped_by: "rga" }, "m1.cit.priority_top10": { status: "skipped", skipped_by: "rga", skip_reason: "Sign-ups later (Chris)" } };
  const rep = { subject: "Your Month 1 report: Acme", sections: [
    { key: "summary", title: "Summary", lines: ["This is Acme's Month 1 report, covering the work from the start through Nov 9."] },
    { key: "work", title: "Work completed in Month 1", lines: ["Lock primary + secondary categories (Sep 14)", "Fix H1 + primary CTA (Nov 8)", "Match NAP across header/footer/contact (Nov 7)", "Build silo internal-link architecture (Nov 9)", "Their YouTube channel (Nov 9)", "Verify GA4 + GSC + tag tracking (Sep 15)"] },
    { key: "open", title: "Still open", lines: ["Fill ALL relevant GBP attributes"] }, { key: "skipped", title: "Skipped by RGA", lines: ["Build top-10 priority citations (Nov 9): Sign-ups later (Chris, Nov 9)"] },
    { key: "baseline", title: "Where you started (measured Sep 15)", lines: ["Google reviews: 0", "Google Search (as measured Sep 15): 9,471 impressions, 1 click", "Mobile page speed score: 78"] },
    { key: "compare", title: "Baseline vs now", lines: ["Clicks from Google Search: 6 in September 2026 → 11 in October 2026"] },
    { key: "next", title: "Next month", lines: ["Keep the profile active: new photos and a Google post each week.", "Ask recent customers for reviews."] }] };
  const before = JSON.stringify(rep), L = CM.month1Letter(rep, pb, tasks), all = JSON.stringify(L);
  if (JARGON.test(all)) fail(`4 the letter still has admin words: ${(JARGON.exec(all) || [])[0]}`);
  if (JSON.stringify(rep) !== before) fail("4 the kept report was changed by reading it");
  const work = L.sections.find((s) => s.key === "work");
  if (!work || !/Set your Google categories \(Sep 14\)/.test(work.lines.join("|")) || !/Set up your YouTube channel/.test(work.lines.join("|"))) fail(`4 "What we did" must use the client words with their day: ${work && work.lines.join(" | ")}`);
  if (!L.sections.some((s) => s.key === "coming" && /Listings on directories/.test(s.lines.join("|")) && /Business photos: whenever you're ready/.test(s.lines.join("|")))) fail("4 'Coming next' must hold the directories and photos lines in client words");
  if (L.sections.some((s) => s.key === "open" || s.key === "skipped")) fail("4 'Still open' / 'Skipped by RGA' (with RGA's reasons and names) must not reach the client");
  if (/Chris|Sign-ups later/.test(all)) fail("4 a person's name or RGA's skip reason reached the client");
  if (/as measured/.test(all)) fail("4 the unwindowed baseline search line is still in the letter");
  if (/a Google post each week/.test(all)) fail("4 the letter promises a Google post each week");
  // every step in the REAL month 1 playbook reads in client words
  for (const s of PB.month1) for (const w of [CM.clientWords(s), CM.carriedWords(s)]) if (!/^m1\.(audit|close|kickoff|handoff|report|call)\./.test(s.id) && JARGON.test(w)) fail(`4 ${s.id} reads "${w}" to the client`);
  // the producer (one decision point): the stored report itself reads in client words, and the baseline window is named or the line left out
  const bt = (win) => ({ gsc_impressions: 9471, gsc_clicks: 1, gsc_window: win, captured_at: "2026-09-15T12:00:00Z", reviews: 0 });
  const built = MR.buildMonth1Report({ client: { business_name: "Acme", geography_model: "storefront" }, tasks, playbook: pb, months: [], baseline: bt("90d"), kickoffAt: "2026-10-09T12:00:00Z", now: new Date("2026-11-09T20:00:00Z"), mode: null });
  const sec = (r, k) => (r.sections.find((s) => s.key === k) || { lines: [] }).lines.join("\n");
  if (JARGON.test(sec(built, "work")) || JARGON.test(sec(built, "skipped"))) fail(`4 the built report's own lines still carry admin words: ${sec(built, "work")}`);
  if (!/Google Search in the 90 days before Sep 15: 9,471 impressions/.test(sec(built, "baseline"))) fail(`4 the baseline names its window: ${sec(built, "baseline")}`);
  for (const win of [null, "", "unknown"]) { const b2 = MR.buildMonth1Report({ client: { business_name: "Acme" }, tasks, playbook: pb, months: [], baseline: bt(win), kickoffAt: "2026-10-09T12:00:00Z", now: new Date("2026-11-09T20:00:00Z") }); if (/Google Search|as measured/.test(sec(b2, "baseline"))) fail(`4 no window recorded (${JSON.stringify(win)}): the baseline search line must be left out: ${sec(b2, "baseline")}`); }
} catch (e) { fail(`4 threw: ${e.message}`); }

// 5 · the month rows get their number and closed state, idempotently, nothing deleted or overwritten
try {
  const mk = (rows, m1 = "2026-11-09T20:20:30Z", cols = true) => {
    const log = [];
    const supa = async (url, init = {}) => {
      const method = init.method || "GET";
      if (/^\/client_monthly_records\?select=month_status/.test(url)) { if (!cols) throw new Error("400 column does not exist"); return []; }
      if (/^\/client_onboarding_records\?/.test(url)) return m1 ? [{ data: { tasks: { "m1.handoff.month2": { status: "done", completed_at: m1 } } } }] : [{ data: { tasks: {} } }];
      if (method === "GET" && /^\/client_monthly_records\?client_id=/.test(url)) return rows.map((r) => JSON.parse(JSON.stringify(r)));
      if (method === "PATCH") {
        const id = /id=eq\.([^&]+)/.exec(url)[1], row = rows.find((r) => r.id === id); if (!row) return [];
        if (/month_status=eq\.open/.test(url) && row.month_status !== "open") return [];
        if (/month_number=is\.null/.test(url) && row.month_number != null) return [];
        const patch = JSON.parse(init.body); Object.assign(row, patch); log.push([id, patch]); return [JSON.parse(JSON.stringify(row))];
      }
      throw new Error(`unexpected ${method} ${url}`);
    };
    return { supa, log };
  };
  const rga = () => ["2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01", "2026-11-01", "2026-12-01"].map((m, i) => ({ id: `r${i}`, reporting_month: m, month_status: "open", month_number: null, data: { tasks: {} } }));
  const NOW = T("2026-11-09T22:00:00Z");
  { const rows = rga(), { supa, log } = mk(rows), r1 = await OM.reconcileMonths(supa, "c1", { now: NOW });
    if (!r1.ok || r1.numbered !== 1 || r1.closed !== 4) fail(`5 RGA's rows: Dec numbered, Jul-Oct closed (Nov is still running): ${JSON.stringify(r1)}`);
    const by = (m) => rows.find((r) => r.reporting_month === m);
    if (by("2026-12-01").month_number !== 2 || by("2026-12-01").month_status !== "open") fail("5 December must be Month 2 and stay open");
    for (const m of ["2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"]) if (by(m).month_status !== "closed" || by(m).month_number !== null || !by(m).closed_at) fail(`5 ${m} must be closed with no number`);
    if (by("2026-11-01").month_status !== "open") fail("5 the month still running must not be closed");
    if (rows.length !== 6 || log.some(([, p]) => "data" in p)) fail("5 a row was deleted or its data overwritten");
    const r2 = await OM.reconcileMonths(supa, "c1", { now: NOW }); if (r2.numbered !== 0 || r2.closed !== 0) fail(`5 a second run must change nothing: ${JSON.stringify(r2)}`); }
  { const rows = rga(); rows[2].data = { tasks: { "m2.exec.gbp_posts": { status: "done" } } }; const { supa } = mk(rows); await OM.reconcileMonths(supa, "c1", { now: NOW }); if (rows[2].month_status !== "open") fail("5 a month with step work in it must never be closed by the backfill"); }
  { const rows = rga(), { supa } = mk(rows, null); const r = await OM.reconcileMonths(supa, "c1", { now: NOW }); if (r.numbered || r.closed || rows.some((x) => x.month_status !== "open" || x.month_number !== null)) fail(`5 with Month 1 not closed nothing may be touched: ${JSON.stringify(r)}`); }
  { OM.__resetDetect(); const rows = rga(), { supa } = mk(rows, undefined, false); const r = await OM.reconcileMonths(supa, "c1", { now: NOW }); if (!r.ok || !r.skipped || rows.some((x) => x.month_number !== null)) fail(`5 before the SQL (no month columns) it must do nothing and say so: ${JSON.stringify(r)}`); OM.__resetDetect(); }
  { // a month in the monthly cycle that is already over is NEVER closed here (only the hand-off closes it, and it sends nothing by itself); it still gets its number
    const rows = rga(), { supa } = mk(rows), r = await OM.reconcileMonths(supa, "c1", { now: T("2027-02-03T09:00:00Z") });
    const by = (m) => rows.find((x) => x.reporting_month === m);
    if (by("2026-12-01").month_status !== "open" || by("2026-12-01").month_number !== 2) fail(`5 a past month in the monthly cycle stays open (the hand-off closes it) and is numbered: ${JSON.stringify(by("2026-12-01"))}`);
    if (!r.ok) fail(`5 ${JSON.stringify(r)}`); }
  { // another client: Month 1 closed Oct 28 (kickoff on the 1st), so November is Month 2
    const rows = ["2026-09-01", "2026-10-01", "2026-11-01"].map((m, i) => ({ id: `e${i}`, reporting_month: m, month_status: "open", month_number: null, data: { tasks: {} } })), { supa } = mk(rows, "2026-10-28T20:00:00Z");
    await OM.reconcileMonths(supa, "c2", { now: T("2026-11-09T22:00:00Z") });
    if (rows[2].month_number !== 2 || rows[1].month_status !== "closed" || rows[0].month_status !== "closed") fail(`5 a client whose Month 1 closed Oct 28: Nov = Month 2, Sep and Oct closed: ${JSON.stringify(rows)}`); }
  // the morning run calls it for a monthly client (source) and a failure is reported, never thrown away
  const mo = strip(REAL.morning); if (!/out\.errors\.push\(`\$\{c\.id\}\/months/.test(mo)) fail("5 a failed reconcile must be reported in the morning run's errors");
} catch (e) { fail(`5 threw: ${e.message}`); }

if (F.length) { console.error(`❌ check-client-monthly: ${F.length} problem(s)\n  - ${F.join("\n  - ")}`); process.exit(1); }
console.log("✅ check-client-monthly: the new pieces are there and the old ones are gone; between months, the next step, the letter and the month rows hold for any kickoff day, a skipped report, any timezone, any posts choice and a client without call tracking.");
process.exit(0);
