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
  // ── client_monthly_cycle_v1 (the owner 11-10): the monthly month is ONE month card; the separate cards, the win-story form and the step numbers are gone from it (managed only) ──
  need(/function ogMonthHtml\(/.test(p) && /function ogMonthRows\(/.test(p) && /function ogMonthListHtml\(/.test(p), "the month card (ogMonthHtml) and its producer filter (ogMonthRows, ogMonthListHtml)");
  need(/monthChips\(/.test(p) && /_ogMonthNow\.set\(/.test(p), "the portal asks whether the managed client is in a monthly month (monthChips) before the list is built");
  { const a = p.indexOf("if (inMonth) return"), b = p.indexOf("if (!isSetupPhase && month2StepsHtml) return"); need(a > 0 && b > 0 && a < b, "the month card is drawn BEFORE the old stack of Month-2 step cards in ogManagedHtml"); }
  need(/num: monthNow \? null/.test(p), "no step number on a monthly card (num is null in a monthly month)");
  { const i = p.indexOf("function ogMonthRows("), body = i >= 0 ? p.slice(i, p.indexOf("\n}", i)) : "";
    need(/keep = new Set\(\[OG_IDS\.photos, OG_IDS\.call\]\)/.test(body), "the monthly month keeps only the photos row and the call's booking");
    need(/if \(q\) \{ keep\.add\(OG_IDS\.numbers\); keep\.add\(OG_IDS\.video\); \}/.test(body), "the quarter's numbers and video are drawn only in a quarter month");
    gone(/OG_IDS\.story/.test(body), "the monthly win-story form is kept in the monthly month (ogMonthRows names OG_IDS.story)");
    gone(/OG_IDS\.list\b/.test(body), "the old weekly list row is kept beside the month card's own list card"); }
  need((p.match(/ogMonthly\(c\.clientId\)/g) || []).length >= 2, "the call card draws no win-story line in a monthly month");
  need(/way\.monthly/.test(p) && /your customer list/.test(p) && /Open your customer list/.test(p), 'the reviews card says "from your customer list" (no step number) in a monthly month');
  gone(/We email you the moment it's ready/.test(p), '"We email you the moment it\'s ready" (a report never sends itself)');
  need(/In progress \\u00b7 RGA checks it and sends it early/.test(p), 'Reports: the month in progress says "In progress, RGA checks it and sends it early <next>"');
  need(/monthlyAction/.test(p) && /betweenNextStep\(\{ month:/.test(p), "the Dashboard's next step reads this month's open client steps (betweenNextStep, one rule)");
  need(/monthlyNow \? thisMonthHtml\(/.test(p) && /function thisMonthHtml\(/.test(p), 'the Dashboard shows a "This month" card in a monthly month (not "What to expect")');
  need(/function monthlyKpisHtml\(/.test(p) && /monthTiles\(/.test(p) && /rankTileOf\(/.test(p), "the monthly tiles name their period (monthlyKpisHtml, monthTiles, rankTileOf)");
  need(/_ogMonthNow\.has\(client\.id\) \? "Not measured yet\. RGA's tracking check reads this\."/.test(p), '"Live once your campaign starts" is never shown to a client in a monthly month');
  need(/rgaWork\(/.test(p) && /monthCard\(/.test(p) && /pastMonthCard\(/.test(p), "RGA's work this month and the past months are read from the shared month functions");
  need(/data-og-mchip/.test(p) && /data-og-call-open/.test(p), "the month chips open a month; the call line opens its booking");
  { const sh = strip(S.shared); need(/function rgaWork\(/.test(sh) && /function monthCard\(/.test(sh) && /function monthTiles\(/.test(sh) && /function rankTileOf\(/.test(sh) && /function thisMonthCard\(/.test(sh) && /function monthNextStep\(/.test(sh), "shared/client-monthly.js has the month functions");
    need(/Sections\.idsFor\(/.test(sh) && /Weekly\.postsView\(/.test(sh), "RGA's work uses the admin Monthly's own rules (idsFor, postsView), not its own list"); }
  need(/monthly-sections\.js\?v=/.test(S.portal || "") && /monthly-weekly\.js\?v=/.test(S.portal || "") && /monthly-monthly\.js\?v=/.test(S.portal || ""), "portal.js imports the admin Monthly's shared rules");
  // cache busters
  { const m = /portal\.js\?v=(\d{8}[a-z]?)/.exec(S.index || ""), c = /portal\.css\?v=(\d{8}[a-z]?)/.exec(S.index || ""); need(m && m[1] >= "20261110e", "portal.js ?v= is 20261110e or later"); need(c && c[1] >= "20261110e", "portal.css ?v= is 20261110e or later"); }
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
    \`<b>\${n}</b> of these are still too recent to judge.\`
    csNote("We email you the moment it's ready.")
    if (!isSetupPhase && month2StepsHtml) return x; const numbered = items.map((it) => ({ ...it, num: pmNo(it.step) ?? null }));
    const row = ogLr(OG_IDS.video, "A video this quarter", "x", "Every 3 months") + ogLr(OG_IDS.call, "Monthly check-in call", "x", "Every month"); const story = "Share one customer win story";
    emptyExp: "Live once your campaign starts."`,
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
    Every change to your business, kept permanently: ... \${Number(n) === 1 ? "is" : "are"} still too recent
    import "/shared/monthly-sections.js?v=20261110e"; import "/shared/monthly-weekly.js?v=20261110e"; import "/shared/monthly-monthly.js?v=20261110e";
    const _ogMonthNow = new Map(); const monthlyNow = monthChips(t); _ogMonthNow.set(a, monthlyNow);
    function ogMonthRows(numbered, m) { const q = globalThis.rgaClientMonthly.isQuarterMonth(m.cur.number), keep = new Set([OG_IDS.photos, OG_IDS.call]);
      if (q) { keep.add(OG_IDS.numbers); keep.add(OG_IDS.video); }
      return numbered.filter((r) => keep.has(r.step.id)); }
    function ogMonthListHtml() {} function ogMonthHtml() { return rgaWork(x) + monthCard(x) + pastMonthCard(x) + \`data-og-mchip data-og-call-open\`; }
    function ogManagedHtml() { if (inMonth) return x; if (!isSetupPhase && month2StepsHtml) return y; }
    const numbered = items.map((it) => ({ ...it, num: monthNow ? null : pmNo(it.step) ?? null }));
    const a2 = ogMonthly(c.clientId) ? "" : story; const b2 = ogMonthly(c.clientId) ? "" : storyLi;
    const way = { monthly: inMonth }; const at = way.monthly ? "your customer list" : "step"; const bt = "Open your customer list";
    const rp = \`In progress \\u00b7 RGA checks it and sends it early \${next}\`;
    const monthlyAction = x ? CMo.betweenNextStep({ month: m.cur }) : null;
    const dash = monthlyNow ? thisMonthHtml(a, b, c) : whatToExpectHtml(o); function thisMonthHtml() {}
    function monthlyKpisHtml() { return CM.monthTiles({ rank: CM.rankTileOf(r) }); }
    const e1 = _ogMonthNow.has(client.id) ? "Not measured yet. RGA's tracking check reads this." : "Live once your campaign starts.";`,
  report: "const workLines = work.length ? emailItems(work, []).done.map((w) => w.text) : []; const period = winDays ? `in the ${winDays} days before ${day(capAt)}` : \"\"; return `${carriedWords(s)}${counted}`;",
  reports: "if (body.month1_letter === true) { const letter = CM.month1Letter(rep, pb, tasks); }",
  openMonth: "async function reconcileMonths() {} module.exports = { reconcileMonths };", morning: "await OM.reconcileMonths(d.supa, c.id, {});", index: '<script type="module" src="/portal/portal.js?v=20261110e"></script><link href="/portal/portal.css?v=20261110e">',
  shared: "function rgaWork() { Sections.idsFor(); Weekly.postsView(); } function monthCard() {} function monthTiles() {} function rankTileOf() {} function thisMonthCard() {} function monthNextStep() {}",
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


// 6 · client_monthly_cycle_v1 (the owner 11-10): the month card, RGA's work, the next step, the tiles. For EVERY client, not RGA: each case is a different kickoff day, timezone, posts choice, tracking setup, skipped step or unread record.
try {
  const SEC = req("../../shared/monthly-sections.js");
  const dayMs = (iso) => Date.parse(iso);
  const cur = (number, month) => ({ number, month, monthName: CM.monthName(month) });
  const txt = (x) => JSON.stringify(x);
  const noStepWords = (what, x) => { const t = txt(x); if (/\bstep \d+\b/i.test(t)) fail(`6 ${what}: reads a "step N" (${(/\bstep \d+\b/i.exec(t) || [])[0]})`); if (/—/.test(t)) fail(`6 ${what}: has an em dash`); if (/Live once your campaign starts/.test(t)) fail(`6 ${what}: says "Live once your campaign starts"`); if (/We email you the moment/.test(t)) fail(`6 ${what}: says a report sends itself`); };
  const inProgress = { "m2.exec.gbp_posts": { status: "in_progress", posts_wanted: 4, post_queue: [{ week: 1, status: "live" }] }, "m2.exec.review_responses": { status: "in_progress" }, "m2.snap.grid_scan": { status: "in_progress" } };
  const rec = (tasks, extra) => ({ reporting_month: "2026-12-01", data: { tasks, ...(extra || {}) } });

  // 6a · the months: a kickoff on the 1st and a mid-month kickoff, an Eastern-time client, a skipped Month 1 report, the first monthly month
  const A = CM.monthChips(sent("2026-10-28T20:00:00Z"), dayMs("2026-11-05T12:00:00Z"));   // kickoff on the 1st: Month 1 done Oct 28, November is Month 2
  if (!A || A.cur.number !== 2 || A.cur.month !== "2026-11-01" || A.chips.length !== 2 || !/^Month 1 · done Oct 28$/.test(A.chips[0].label) || A.chips[1].label !== "Month 2 · November") fail(`6a a kickoff on the 1st: chips ${txt(A && A.chips)}`);
  const B = CM.monthChips(sent("2026-11-09T20:19:16Z"), dayMs("2026-12-08T12:00:00Z"));    // mid-month kickoff: report Nov 9, December is Month 2
  if (!B || B.cur.number !== 2 || B.cur.month !== "2026-12-01" || B.chips.map((c) => c.label).join("|") !== "Month 1 · done Nov 9|Month 2 · December") fail(`6a a mid-month kickoff: ${txt(B && B.chips)}`);
  if (CM.monthChips(sent("2026-11-09T20:19:16Z"), dayMs("2026-11-20T12:00:00Z"))) fail("6a between months (Dec has not started) must not be a monthly month");
  if (CM.monthChips({}, dayMs("2026-12-08T12:00:00Z"))) fail("6a Month 1 not done must not be a monthly month");
  const E = CM.monthChips(sent("2026-11-30T22:30:00-05:00"), dayMs("2027-01-02T12:00:00Z"));   // an Eastern-time client: 10:30 PM ET Nov 30 is Dec 1 UTC, the server's month key, so January is Month 2
  if (!E || E.cur.month !== "2027-01-01" || E.cur.number !== 2) fail(`6a an Eastern-time client: ${txt(E && E.cur)}`);
  const E2 = CM.monthChips(sent("2026-11-09T15:00:00-05:00"), dayMs("2027-01-01T04:30:00Z"));   // Dec 31 11:30 PM ET is already Jan 1 in the month key: Month 3 (January), a quarter month
  if (!E2 || E2.cur.month !== "2027-01-01" || E2.cur.number !== 3) fail(`6a Dec 31 11:30 PM ET is January in the month key: ${txt(E2 && E2.cur)}`);
  const S = CM.monthChips(skipped("2026-11-09T20:00:00Z"), dayMs("2026-12-08T12:00:00Z"));
  if (!S || S.cur.number !== 2 || !/done Nov 9/.test(S.chips[0].label)) fail(`6a a skipped Month 1 report is the same state: ${txt(S && S.chips)}`);
  if (CM.rangeWords("2026-12-01", dayMs("2026-12-08T12:00:00Z")) !== "Dec 1 to Dec 31 · day 8") fail(`6a range: ${CM.rangeWords("2026-12-01", dayMs("2026-12-08T12:00:00Z"))}`);
  if (CM.rangeWords("2027-02-01", dayMs("2027-02-10T12:00:00Z")) !== "Feb 1 to Feb 28 · day 10") fail(`6a a short month ends on its own last day: ${CM.rangeWords("2027-02-01", dayMs("2027-02-10T12:00:00Z"))}`);

  // 6b · quarter months: This quarter in 3, 6, 9, 12 and only there; one "Coming up" line in the month before each, and not in a quarter month
  let m0 = "2026-12-01";
  for (let n = 2; n <= 13; n++, m0 = CM.addMonths(m0, 1)) {
    const card = CM.monthCard({ cur: cur(n, m0), nowMs: dayMs(m0.slice(0, 8) + "10T12:00:00Z"), record: rec({}), postsWanted: 4, callTracking: true, listOpen: false });
    const q = n % 3 === 0;
    if (!!card.quarter !== q) fail(`6b Month ${n}: This quarter is ${card.quarter ? "shown" : "missing"}`);
    if (CM.isQuarterMonth(n) !== SEC.showsQuarter(n)) fail(`6b Month ${n}: the client's quarter rule differs from the admin's (rgaMonthly.showsQuarter)`);
    const wantComing = !q && (n + 1) % 3 === 0;
    if (!!card.coming !== wantComing) fail(`6b Month ${n}: the "Coming up" line is ${card.coming ? "shown" : "missing"} (next month is ${(n + 1) % 3 === 0 ? "" : "not "}a quarter month)`);
    if (card.coming && !new RegExp(`^${CM.monthName(CM.addMonths(m0, 1))} is a quarter month$`).test(card.coming.title)) fail(`6b Month ${n}: Coming up reads "${card.coming.title}"`);
    if (card.quarter && !card.quarter.rows.some((r) => r.kind === "numbers") || card.quarter && !card.quarter.rows.some((r) => r.kind === "video")) fail(`6b Month ${n}: This quarter lacks the numbers or the video`);
    if (/win story|Share one customer/i.test(txt(card))) fail(`6b Month ${n}: the month card still offers the monthly win-story form`);
    noStepWords(`Month ${n} card`, card);
  }

  // 6c · posts_wanted null / 0 / 1 / 2 / 4: the number is the client's choice, never a fixed 4; a green line only when the admin step is done
  for (const n of [null, 0, 1, 2, 4]) {
    const r = CM.rgaWork({ cur: cur(2, "2026-12-01"), nowMs: dayMs("2026-12-08T12:00:00Z"), record: rec({ "m2.exec.gbp_posts": { status: "in_progress", ...(n === null ? {} : { posts_wanted: n }), post_queue: n === 0 || n === null ? [] : [{ week: 1, status: "live" }] } }), postsWanted: n, callTracking: true });
    const p = r.rows.find((x) => x.key === "posts");
    if (!p) { fail(`6c posts_wanted ${n}: no posts line`); continue; }
    if (n === 0) { if (p.title !== "No Google posts" || p.counted || p.side !== "your choice") fail(`6c posts_wanted 0: ${txt(p)}`); }
    else {
      const total = n === null ? 4 : n, live = n === null ? 0 : 1;
      if (p.side !== `${live} of ${total} live`) fail(`6c posts_wanted ${n}: side "${p.side}", wanted "${live} of ${total} live"`);
      if (p.mark === "ok") fail(`6c posts_wanted ${n}: green while the step is still in progress`);
      if (p.bar !== Math.round(live / total * 100)) fail(`6c posts_wanted ${n}: bar ${p.bar}`);
      if (n === null && !/recommended number/.test(p.small)) fail(`6c posts_wanted unset: must say it is the recommended number: "${p.small}"`);
      if (n === 4 && !/About 4 a month, your choice/.test(p.small)) fail(`6c posts_wanted 4: "${p.small}"`);
      if (n === 2 && !/2 a month, your choice/.test(p.small)) fail(`6c posts_wanted 2: "${p.small}"`);
    }
  }
  { const r = CM.rgaWork({ cur: cur(2, "2026-12-01"), nowMs: dayMs("2026-12-20T12:00:00Z"), record: rec({ "m2.exec.gbp_posts": { status: "done", posts_wanted: 2, post_queue: [{ week: 1, status: "live" }, { week: 3, status: "live" }] } }), postsWanted: 2, callTracking: true });
    const p = r.rows.find((x) => x.key === "posts"); if (!p || p.mark !== "ok" || p.side !== "2 of 2 live" || !p.done) fail(`6c a settled posts step reads ${txt(p)}`); }

  // 6d · RGA's work reads the admin record: green only when settled, skipped/declined never listed, hidden by the admin's own rule, unread says so and is never done
  { const base = { cur: cur(2, "2026-12-01"), nowMs: dayMs("2026-12-08T12:00:00Z"), postsWanted: 4, callTracking: true };
    const all = CM.rgaWork({ ...base, record: rec({}) });
    const want = ["posts", "replies", "scan", "site", "watch", "focus", "tracking", "competitors", "listings"];
    if (all.rows.map((r) => r.key).join(",") !== want.join(",")) fail(`6d the lines are ${all.rows.map((r) => r.key).join(",")}, wanted ${want.join(",")}`);
    for (const id of CM.WORK_ORDER) if (!SEC.idsFor(2, { callTracking: true }).includes(id)) fail(`6d ${id} is a client line but not a step the admin Monthly counts in Month 2`);
    if (all.rows.some((r) => r.mark === "ok" || r.done) || all.done !== 0) fail("6d nothing is settled, yet a line is green");
    const sk = CM.rgaWork({ ...base, record: rec({ "m2.exec.profile_watch": { status: "skipped" }, "m2.exec.listing_upkeep": { status: "declined" } }) });
    if (sk.rows.some((r) => r.key === "watch" || r.key === "listings") || sk.total !== all.total - 2) fail(`6d a skipped or declined step is still listed (${sk.rows.map((r) => r.key)} / total ${sk.total})`);
    const dn = CM.rgaWork({ ...base, record: rec({ "m2.exec.profile_watch": { status: "done", completed_at: "2026-12-02T10:00:00Z" }, "m2.exec.tracking_check": { status: "done", completed_at: "2026-12-07T10:00:00Z", monthly_once: { settled_at: "2026-12-07T10:00:00Z", label: "Working · data through Dec 7" } } }) });
    const w = dn.rows.find((r) => r.key === "watch"), t = dn.rows.find((r) => r.key === "tracking");
    if (!w || w.mark !== "ok" || !t || t.mark !== "ok" || t.side !== "data through Dec 7" || dn.done !== 2) fail(`6d settled lines: ${txt([w, t, dn.done])}`);
    // a line that is "done" in a past month is read-only and only lists what was done
    const past = CM.pastMonthCard({ cur: cur(2, "2026-12-01"), record: rec({ "m2.exec.profile_watch": { status: "done", completed_at: "2026-12-02T10:00:00Z" }, "m2.exec.site_audit_recurring": { status: "in_progress" } }), callTracking: true, postsWanted: 4 });
    if (past.work.rows.length !== 1 || past.work.rows[0].key !== "watch" || past.report.go !== "reports" || !/Your December report/.test(past.report.title)) fail(`6d a past month must list only what was done and link its report: ${txt(past)}`);
    // an unread record: every line says so, none is done, no count of "done"
    for (const [what, r] of [["null record", null], ["a record with no tasks", { data: {} }], ["tasks is not an object", { data: { tasks: "x" } }]]) {
      const u = CM.rgaWork({ ...base, record: r });
      if (!u.unread || u.done !== 0 || u.total !== 0 || u.rows.some((x) => x.mark === "ok" || x.done || x.side !== "couldn't read")) fail(`6d ${what}: ${txt(u)}`);
      const card = CM.monthCard({ cur: base.cur, nowMs: base.nowMs, record: r, postsWanted: 4, callTracking: true, listOpen: false });
      if (!card.unread) fail(`6d ${what}: the month card does not know it is unread`);
    }
    // no call tracking: the tracking line says forms only, and the lead test is not in the admin's count either
    const nc = CM.rgaWork({ ...base, callTracking: false, record: rec({}) });
    if (!/^Form leads are recorded$/.test((nc.rows.find((r) => r.key === "tracking") || {}).small)) fail("6d no call tracking: the tracking line must say form leads only");
    if (SEC.idsFor(3, { callTracking: false }).includes("m2.exec.mystery_shop")) fail("6d no call tracking: the lead test must not count");
    noStepWords("RGA's work", [all, dn, nc]);
  }

  // 6e · what needs the client: the oldest open step first (approve, then the list, then photos); nothing open says so with the next date
  { const NS = (o) => CM.betweenNextStep({ month: cur(2, "2026-12-01"), nowMs: dayMs("2026-12-08T12:00:00Z"), nextMonthName: "January", ...o });
    const a1 = NS({ approvePosts: 2, listOpen: true, listTitle: "this week's customer list", listDueMs: dayMs("2026-12-14T12:00:00Z") });
    if (a1.title !== "Approve 2 Google posts" || !/Your customer list is due Mon, Dec 14\./.test(a1.desc) || a1.goto !== "approve") fail(`6e approve comes first: ${txt(a1)}`);
    const a2 = NS({ approvePosts: 1 }); if (a2.title !== "Approve 1 Google post") fail(`6e one post: ${a2.title}`);
    const a3 = NS({ approveReplies: 3 }); if (a3.title !== "Approve 3 review replies") fail(`6e replies: ${a3.title}`);
    const a4 = NS({ listOpen: true, listTitle: "this week's customer list" }); if (a4.title !== "Send this week's customer list" || a4.goto !== "ongoing") fail(`6e the list is next: ${txt(a4)}`);
    const a5 = NS({ photosOpen: true }); if (a5.title !== "Add new photos") fail(`6e photos are last: ${a5.title}`);
    const a6 = NS({ listDueMs: dayMs("2026-12-14T12:00:00Z") }); if (a6.title !== "Nothing needs you right now" || !/Mon, Dec 14/.test(a6.desc)) fail(`6e nothing open: ${txt(a6)}`);
    const a7 = NS({}); if (a7.title !== "Nothing needs you right now" || !/early January/.test(a7.desc)) fail(`6e nothing open and no list date must name the report date: ${txt(a7)}`);
    if (/weekly|each week/i.test(txt([a1, a2, a3, a4, a5, a6, a7]).replace(/this week's|these 2 weeks'/g, ""))) fail("6e the next step promises weekly work");
    noStepWords("next step", [a1, a2, a3, a4, a5, a6, a7]);
    // approvals are read from the record: drafts RGA sent the client that wait for a yes, never a guess
    const ap = CM.toApprove(rec({ "m2.exec.gbp_posts": { status: "in_progress", internal_review: { decision: "approved" }, auto_result: { outcome_data: { posts: [{}, {}] } } }, "m2.exec.review_responses": { auto_result: { outcome_data: { reviews: { status: "ok", drafted: 1, drafted_ids: ["r1"] } } }, internal_review: { decision: "approved" } } }));
    if (ap.posts !== 2 || ap.replies !== 1) fail(`6e toApprove ${txt(ap)}`);
    const none = CM.toApprove(rec({ "m2.exec.gbp_posts": { internal_review: { decision: "approved" }, approval: { decision: "approved" }, auto_result: { outcome_data: { posts: [{}] } } } }));
    if (none.posts !== 0) fail("6e a post the client already answered is still counted");
    if (CM.toApprove(null).posts !== 0 || CM.toApprove({}).replies !== 0) fail("6e an unread record must count 0 to approve, not throw");
    const c1 = CM.monthCard({ cur: cur(2, "2026-12-01"), nowMs: dayMs("2026-12-08T12:00:00Z"), record: rec({ "m2.exec.gbp_posts": { internal_review: { decision: "approved" }, auto_result: { outcome_data: { posts: [{}, {}] } } } }), postsWanted: 4, callTracking: true, listOpen: true });
    if (c1.your.needs !== 2 || c1.your.rows[0].kind !== "customers" || !c1.your.rows.some((r) => r.key === "approve-posts" && r.go === "approve") || !c1.your.rows.some((r) => r.kind === "photos")) fail(`6e Your part: ${txt(c1.your)}`);
    const c0 = CM.monthCard({ cur: cur(2, "2026-12-01"), nowMs: dayMs("2026-12-08T12:00:00Z"), record: rec({}), postsWanted: 0, callTracking: true, listOpen: false });
    if (c0.your.needs !== 0 || c0.your.rows.some((r) => r.key === "approve-posts")) fail(`6e a client who chose no posts is asked to approve none: ${txt(c0.your)}`);
    // end of the month: the report sentence is exact; the call only books after the report
    const rep = c1.end.find((r) => r.key === "report");
    if (!rep || rep.small !== "RGA checks it and sends it early January. Every report stays under Reports.") fail(`6e the report line: ${txt(rep)}`);
    if ((c1.end.find((r) => r.key === "call") || {}).canBook) fail("6e the call must not book before the report");
    const sentRec = rec({ "m2.report.deliver": { status: "done", completed_at: "2026-12-05T10:00:00Z", auto_result: { sent_at: "2026-12-05T10:00:00Z", summary: "Sent the 2026-12 report" } } });
    const c2 = CM.monthCard({ cur: cur(2, "2026-12-01"), nowMs: dayMs("2026-12-08T12:00:00Z"), record: sentRec, postsWanted: 4, callTracking: true, listOpen: false });
    if (!(c2.end.find((r) => r.key === "call") || {}).canBook) fail("6e the call must book once the report is sent");
    if (/Sent the 2026-11 report/.test("") || CM.monthCard({ cur: cur(2, "2026-12-01"), nowMs: dayMs("2026-12-08T12:00:00Z"), record: rec({ "m2.report.deliver": { status: "done", auto_result: { sent_at: "2026-12-05T10:00:00Z", summary: "Sent the 2026-11 report" } } }), postsWanted: 4, callTracking: true, listOpen: false }).end.find((r) => r.key === "report").mark === "ok") fail("6e last month's report being sent must not turn THIS month's report line green");
  }

  // 6f · the tiles: each names its period; no number is "not measured yet", never 0; the first monthly month has no earlier monthly report to lean on
  { const T = (o) => CM.monthTiles({ cur: cur(2, "2026-12-01"), nextScan: null, ...o });
    const cell = (sid, kw, at, ranks, mkt) => ranks.map((r, i) => ({ grid_session_id: sid, keyword: kw, market: mkt || "m", map_rank: r, measured_at: at, grid_index: i }));
    const rows = [...cell("s1", "plumber", "2026-11-03T12:00:00Z", [20, 14, 12, 18]), ...cell("s2", "plumber", "2026-12-02T12:00:00Z", [10, 12, 14, 20])];
    const r = CM.rankTileOf(rows);
    if (!r || r.avg !== 14 || !r.prev || r.prev.avg !== 16) fail(`6f rank like-for-like: ${txt(r)}`);
    const t1 = T({ rank: r, taps: { value: 3 }, leads: { calls: 1, forms: 1, trackingTask: { status: "done", monthly_once: { label: "Working · data through Dec 7" } } }, reviews: { value: 2 } });
    if (t1.rank.value !== 14 || !/^Dec 2 scan · same grid as Nov 3 \(16\)$/.test(t1.rank.small)) fail(`6f rank tile: ${txt(t1.rank)}`);
    if (t1.taps.value !== 3 || t1.taps.small !== "in November · December's arrive about Jan 2") fail(`6f taps name the last complete month and when the next arrives: ${txt(t1.taps)}`);
    if (t1.leads.value !== 2 || t1.leads.small !== "calls and forms so far in December · data through Dec 7") fail(`6f leads read the tracking step: ${txt(t1.leads)}`);
    if (t1.reviews.value !== 2 || t1.reviews.small !== "since December 1 · checked today") fail(`6f reviews: ${txt(t1.reviews)}`);
    // a different grid size or keyword is NEVER compared
    const r2 = CM.rankTileOf([...cell("s1", "plumber", "2026-11-03T12:00:00Z", [20, 14, 12]), ...cell("s2", "plumber", "2026-12-02T12:00:00Z", [10, 12, 14, 20])]);
    if (r2.prev) fail("6f a scan with a different number of points was compared");
    const r3 = CM.rankTileOf([...cell("s1", "drain cleaning", "2026-11-03T12:00:00Z", [20, 14, 12, 18]), ...cell("s2", "plumber", "2026-12-02T12:00:00Z", [10, 12, 14, 20])]);
    if (r3.prev) fail("6f a scan of another keyword was compared");
    const r4 = CM.rankTileOf([...cell("s1", "plumber", "2026-11-03T12:00:00Z", [20, 14, 12, 18]), ...cell("s2", "plumber", "2026-12-02T12:00:00Z", [10, 12])]);   // the newest scan stopped early: it is not "the latest scan"
    if (!r4 || r4.at !== Date.parse("2026-11-03T12:00:00Z")) fail(`6f an incomplete scan was used as the latest: ${txt(r4)}`);
    const first = CM.rankTileOf(cell("s2", "plumber", "2026-12-02T12:00:00Z", [10, 12, 14, 20]));   // the first monthly month: nothing earlier
    if (!first || first.prev || !/no earlier scan of the same grid to compare with/.test(T({ rank: first }).rank.small)) fail("6f the first scan must say there is nothing to compare with");
    // no number: not measured yet, never 0
    const t0 = T({ rank: null, taps: { value: null }, leads: { calls: null, forms: null, trackingTask: null }, reviews: { value: null } });
    for (const k of ["rank", "taps", "leads", "reviews"]) { if (t0[k].value !== null) fail(`6f ${k}: no number must be null, it is ${t0[k].value}`); if (!/[Nn]ot measured yet/.test(t0[k].small)) fail(`6f ${k}: no number must say "Not measured yet": "${t0[k].small}"`); }
    const t00 = T({ rank: null, taps: { value: 0 }, leads: { calls: 0, forms: 0, trackingTask: { status: "done" } }, reviews: { value: 0 } });
    if (t00.taps.value !== 0 || t00.leads.value !== 0 || t00.reviews.value !== 0) fail("6f a real zero must stay a zero");
    // no call tracking: forms only, no lead test; a half-read pair is not a total
    const nc = T({ rank: null, taps: { value: null }, leads: { calls: null, forms: 2, callTracking: false, trackingTask: { status: "done", monthly_once: { label: "Working · data through Dec 7" } } }, reviews: { value: null } });
    if (nc.leads.value !== 2 || !/^form leads so far in December/.test(nc.leads.small)) fail(`6f no call tracking: ${txt(nc.leads)}`);
    const half = T({ rank: null, taps: { value: null }, leads: { calls: null, forms: 2, trackingTask: { status: "done" } }, reviews: { value: null } });
    if (half.leads.value !== null) fail("6f calls were never read but a total was shown");
    const stopped = T({ rank: null, taps: { value: null }, leads: { calls: 1, forms: 1, trackingTask: { status: "blocked" } }, reviews: { value: null } });
    if (stopped.leads.value !== null || !/Tracking needs a look/.test(stopped.leads.small)) fail(`6f what stopped must be said: ${txt(stopped.leads)}`);
    noStepWords("tiles", [t1, t0, t00, nc, half, stopped]);
    // "This month" replaces "What to expect"
    const tm = CM.thisMonthCard({ cur: cur(2, "2026-12-01"), work: { done: 5, total: 9, unread: false }, nextMonthName: "January" });
    if (tm.rows[0].title !== "RGA's work: 5 of 9 done" || tm.rows[0].go !== "ongoing" || !/early January/.test(tm.rows[1].small) || !/never promise|We never promise/i.test(tm.rows[2].title)) fail(`6f This month: ${txt(tm)}`);
    if (!/couldn't read/.test(CM.thisMonthCard({ cur: cur(2, "2026-12-01"), work: { done: 0, total: 0, unread: true } }).rows[0].title)) fail("6f This month: an unread record must say it couldn't read");
    noStepWords("This month", tm);
  }
} catch (e) { fail(`6 threw: ${e.stack || e.message}`); }

if (F.length) { console.error(`❌ check-client-monthly: ${F.length} problem(s)\n  - ${F.join("\n  - ")}`); process.exit(1); }
console.log("✅ check-client-monthly: the new pieces are there and the old ones are gone; between months, the next step, the letter and the month rows hold for any kickoff day, a skipped report, any timezone, any posts choice and a client without call tracking.");
process.exit(0);
