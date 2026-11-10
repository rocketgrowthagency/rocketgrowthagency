#!/usr/bin/env node
// check-monthly-once.mjs — MONTHLY SECTION 3, "ONCE A MONTH" (approved monthly_s3_monthly_v1, the owner 11-9). Runs the SHIPPED code against FAKES (no network, no model,
// no paid scan, nothing written to a real Google profile).
//   1 the merges: rank_tracker -> grid_scan, gsc + ga4 -> gbp_metrics; no dangling id anywhere; one step each; the section list matches the playbook
//   2 no Run button and no hand tick in the section (playbook, executors, admin card code, NO_HAND_DONE)
//   3 map-rank scans: the result line, compared ONLY with the same keyword + grid size (+ source), a truncated scan never compared, "next <date>"
//   4 numbers: three tiles, change vs the prior month, "not measured" is never 0 (a measured 0 is still 0), "reads on the 2nd"
//   5 competitors: top 5, a new name flagged only against a recorded earlier list
//   6 site health: "Checked N pages. Not checked: ...", never run = never "0 broken", unreachable is not broken
//   7 blog: 0 is a fine month, counts when live (indexing said only when read), drafted -> Send for approval
//   8 focus work: settles from the steps its tasks are tied to, no hand tick
//   9 listing upkeep: read from what the listing jobs did; sign-ups skipped in Month 1 show as scheduled later
//  10 the settle: marks done only what a view proves, never a failed read, never a skipped step, freezes the competitor list, refuses a closed month
//  11 the morning run: monthly replies start on a NEW unanswered review, retry a failed post daily (to 5), never on a failed read; site check once a month
//  12 wiring: cards in the admin, ?v= keys, no em dash in text a person reads
// Exit 0 holds · 1 regressed · 2 can't tell
import { oldChromeFailures } from "./_monthly-no-old-chrome.mjs";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SCR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = [], fail = (m) => F.push(m);
const read = (r, base = SITE) => { try { return fs.readFileSync(path.join(base, r), "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
Object.assign(process.env, { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "k", INTERNAL_FN_SECRET: "x" });
globalThis.fetch = async (url) => { throw new Error(`the gate must not touch the network: ${url}`); };
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));
let O, MO, MR, STEPS, PB;
try { O = req("../../shared/monthly-monthly.js"); MO = req("./_monthly-once.js"); MR = req("./_morning-run.js"); STEPS = req("../../shared/steps-57-64.js"); PB = JSON.parse(read("data/playbooks/playbooks.json")); }
catch (e) { console.error(`⚠️  INDETERMINATE — a module did not load: ${e.message}`); process.exit(2); }
const d = (s) => Date.parse(`${s}T12:00:00Z`);
const MONTH = "2026-11-01";
const RETIRED = ["m2.snap.rank_tracker", "m2.snap.gsc_metrics", "m2.snap.ga4_metrics"];
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");

// 1 the merges
{
  const m2 = PB.month2plus, ids = m2.map((s) => s.id);
  for (const r of RETIRED) if (ids.includes(r)) fail(`1 ${r} must be retired from the playbook`);
  for (const id of O.IDS) if (ids.filter((x) => x === id).length !== 1) fail(`1 ${id} must be in the playbook exactly once`);
  for (const s of m2) for (const dep of s.dependsOn || []) if (!ids.includes(dep)) fail(`1 ${s.id} depends on ${dep}, which is not in the playbook (dangling)`);
  if ((m2.find((s) => s.id === O.ID.SCANS) || {}).dependsOn.length) fail("1 the merged scans step must not wait on anything");
  const sections = req("../../shared/monthly-sections.js"), sec = sections.SECTIONS.find((s) => s.key === "m2s-month");
  if (JSON.stringify([...sec.ids].sort()) !== JSON.stringify([...O.IDS].sort())) fail(`1 the "Once a month" section must list exactly the seven steps: ${sec.ids.join(", ")}`);
  for (const s of sections.SECTIONS) for (const id of s.ids) if (!ids.includes(id)) fail(`1 section ${s.key} lists ${id}, which is not in the playbook`);
  for (const [from, to] of Object.entries(O.RETIRED)) if (!ids.includes(to)) fail(`1 ${from} is merged into ${to}, which is not in the playbook`);
  // nothing still names a retired id (comments and the RETIRED map itself are history, not wiring)
  const files = ["admin/admin.js", "portal/portal.js", "netlify/functions/flow-execute.js", "netlify/functions/_morning-run.js", "netlify/functions/_mature.js", "netlify/functions/_deliverables.js", "shared/monthly-sections.js", "shared/steps-57-64.js", "shared/monthly-start.js", "data/monthly-focus-tasks.json", "data/playbooks/what-it-does.json", "data/playbooks/client-steps.json", "data/playbooks/managed-steps.json"];
  for (const f of files) { const t = f.endsWith(".json") ? read(f) : strip(read(f)); for (const r of RETIRED) if (t.includes(r)) fail(`1 ${f} still names the retired ${r}`); }
  const mirror = read("flow/playbooks/month2plus.mjs", SCR); for (const r of RETIRED) if (mirror.includes(`id: "${r}"`)) fail(`1 the Scraper mirror still has ${r}`);
  if (!mirror.includes('id: "m2.exec.listing_upkeep"')) fail("1 the Scraper mirror must carry the new listing upkeep step");
  const rp = req("./_step-record.js"); if (rp.scopeOf("m2.exec.listing_upkeep") !== "month2plus") fail("1 the new step must live in the monthly record");
}

// 2 no Run buttons, no hand ticks
{
  const m2 = PB.month2plus, a = read("admin/admin.js"), fe = strip(read("netlify/functions/flow-execute.js"));
  for (const id of [...O.SELF, O.ID.WORK]) {
    const s = m2.find((x) => x.id === id) || {};
    if (s.hasRunner) fail(`2 ${id} must have no runner button (hasRunner)`);
    if (s.actionLabel) fail(`2 ${id} must have no action label: ${s.actionLabel}`);
    if (!STEPS.noHandDone(id)) fail(`2 ${id} must have no hand Mark step complete`);
  }
  for (const id of ["m2.snap.grid_scan", "m2.snap.gbp_metrics", "m2.snap.competitors", "m2.exec.focus_area_work"]) if (new RegExp(`"${id.replace(/\./g, "\\.")}": async`).test(fe)) fail(`2 ${id} must have no executor (a scan would cost money, a hand run would double-write)`);
  if (/startRankScan\([^)]*\)/.test(fe.replace(/async function startRankScan[\s\S]*?\n}\n/, "").replace(/"m1\.audit\.grid_baseline"[\s\S]*$/, "")) && /"m2\.snap\.grid_scan": async/.test(fe)) fail("2 the monthly scan step must not start a scan");
  const sec = a.slice(a.indexOf("MONTHLY · SECTION 3"), a.indexOf("// ── step 64 · into the monthly cycle"));
  if (sec.length < 500) fail("2 the section 3 card code was not found in the admin");
  if (/⚡|Mark step complete|data-uni-run|data-run-step|Run the |Run Grid|>Run</i.test(strip(sec))) fail("2 the section 3 cards must carry no Run button and no hand tick");
  if (!/uniSkipLinkHtml\(id, "month2plus"\)/.test(sec)) fail("2 every card must offer Skip this step");
  if (!/uniNoRowRun = \(id\) => [^\n]*rgaMonthlyOnce/.test(a)) fail("2 the row must have no Run button for the self-running steps");
}

// the fake scans: 25-point geo-grid, an 81-point grid_scan, a truncated scan, another keyword
const pts = (n, top) => Array.from({ length: n }, (_, i) => (i < top ? 3 : i % 2 ? 31 : null));
const KW = "local seo culver city";
const SESS = [
  { at: "2026-10-03T17:00:00Z", pts: pts(25, 0), source: "geo-grid", keyword: KW },     // the baseline (Month 1)
  { at: "2026-11-02T17:00:00Z", pts: pts(25, 1), source: "geo-grid", keyword: KW },
  { at: "2026-11-17T17:00:00Z", pts: pts(25, 3), source: "geo-grid", keyword: KW },
  { at: "2026-11-25T17:00:00Z", pts: pts(10, 10), source: "geo-grid", keyword: KW },    // truncated: stopped early
  { at: "2026-11-20T17:00:00Z", pts: pts(25, 9), source: "geo-grid", keyword: "plumber culver city" },   // another keyword
];
// 3 the scans
{
  const v = O.scansView({ month: MONTH, now: d("2026-11-20"), keyword: KW, sessions: SESS, nextAt: "2026-12-01T12:00:00Z" });
  const t = v.rows[0].title, line = v.rows[0].line;
  if (!/^Nov 17: in the top 20 at 3 of 25 points · local seo culver city, the same grid as Oct 3$/.test(t)) fail(`3 the result line: ${t}`);
  if (!/^Up from 1 of 25/.test(line)) fail(`3 the move must be against the Nov 2 scan of the same keyword and size: ${line}`);
  if (v.rows[0].right !== "next Dec 1") fail(`3 the card must say when the next scan runs: ${v.rows[0].right}`);
  if (v.label !== "2 of 2" || !v.done) fail(`3 two scans settle the step: ${v.label}`);
  if (v.rows.some((r) => /Nov 25|10 of 10/.test(JSON.stringify(r)))) fail("3 a truncated scan must never be the result");
  if (v.rows.some((r) => /9 of 25/.test(JSON.stringify(r)))) fail("3 another keyword's scan must never be used");
  // a different grid size in the month: the 81-point scan is NOT compared with the 25-point history
  const big = [...SESS, { at: "2026-11-21T17:00:00Z", pts: pts(81, 20), source: "grid_scan", keyword: KW }, { at: "2026-11-21T17:01:00Z", pts: [1], source: "grid_scan", keyword: KW }].map((s) => s);
  const v2 = O.scansView({ month: MONTH, now: d("2026-11-22"), keyword: KW, sessions: big.filter((s) => s.pts.length !== 1), nextAt: null });
  const cmp = O.comparable(O.completeSessions(big.filter((s) => s.pts.length !== 1), KW)[0], O.completeSessions(big.filter((s) => s.pts.length !== 1), KW));
  if (cmp) fail("3 an 81-point grid must not be compared with 25-point scans");
  if (!/no earlier scan of the same keyword and grid size/i.test(v2.rows[0].line) || v2.compared) fail(`3 no like-for-like earlier scan must say so: ${v2.rows[0].line}`);
  // no scan yet / nothing locked
  const none = O.scansView({ month: MONTH, now: d("2026-11-05"), keyword: null, sessions: [], nextAt: null, why: "No locked main keyword yet" });
  if (none.tone === "ok" || !/No scan yet this month/.test(none.rows[0].title) || !/locked main keyword/.test(none.rows[0].line)) fail(`3 no scan must say why, never a result: ${JSON.stringify(none.rows)}`);
  const one = O.scansView({ month: MONTH, now: d("2026-11-10"), keyword: KW, sessions: SESS.slice(0, 2), nextAt: "2026-11-15T12:00:00Z" });
  if (one.label !== "1 of 2" || one.done) fail(`3 one scan mid-month is "1 of 2" and not settled: ${one.label}`);
  if (MO.nextScanAt(MONTH, d("2026-11-05"), 1) !== "2026-11-15T12:00:00.000Z" || MO.nextScanAt(MONTH, d("2026-11-20"), 2) !== "2026-12-01T12:00:00.000Z") fail("3 next scan dates: day 15, then the 1st of the next month");
  const rows = MO.sessionsOf([{ map_rank: 3, measured_at: "2026-11-02T17:00:00Z", grid_session_id: "a", source: "geo-grid", keyword: KW }, { map_rank: null, measured_at: "2026-11-02T17:00:01Z", grid_session_id: "a", source: "geo-grid", keyword: KW }]);
  if (rows.length !== 1 || rows[0].pts.length !== 2 || rows[0].pts[1] !== null) fail("3 a missing rank is kept as null (not found), never dropped or zeroed");
}

// 4 the numbers
{
  const v = O.numbersView({ month: MONTH, now: d("2026-12-03"), cur: { views: 55, clicks: null, calls: 0 }, prev: { views: 60, clicks: 6, calls: 0 } });
  const by = Object.fromEntries(v.tiles.map((t) => [t.key, t]));
  if (by.views.text !== "55" || by.views.changeText !== "▼ 5" || by.views.cls !== "down") fail(`4 profile views vs the month before: ${JSON.stringify(by.views)}`);
  if (by.clicks.text !== "not measured" || by.clicks.value !== null || by.clicks.changeText) fail(`4 a number Google would not give says "not measured", never 0: ${JSON.stringify(by.clicks)}`);
  if (by.calls.text !== "0" || by.calls.changeText !== "no change") fail(`4 a measured 0 is a real 0: ${JSON.stringify(by.calls)}`);
  const up = O.numbersView({ month: MONTH, now: d("2026-12-03"), cur: { views: 11, clicks: 5, calls: 2 }, prev: { views: 6, clicks: null, calls: 2 } });
  if (up.tiles[0].changeText !== "▲ 5" || up.tiles[1].changeText !== "no month to compare") fail("4 up, and no comparison when the month before was not measured");
  const early = O.numbersView({ month: MONTH, now: d("2026-11-20"), cur: { views: 5, clicks: 5, calls: 5 }, prev: {} });
  if (!early.tiles.every((t) => /^reads Dec 2$/.test(t.text) && t.value === null) || early.done) fail(`4 before the 2nd the tiles say when the month is read: ${JSON.stringify(early.tiles.map((t) => t.text))}`);
  const all = O.numbersView({ month: MONTH, now: d("2026-12-03"), cur: { views: null, clicks: null, calls: null }, prev: {} });
  if (all.done || all.tone === "ok" || all.tiles.some((t) => t.text === "0")) fail("4 nothing measured is never done and never 0");
  // the server read: an answer Google didn't give is null
  const rec = { tasks: {}, data: {}, row: { gsc_clicks: null }, prevRow: { gsc_clicks: 7 }, prevData: {}, ob: { data: {}, tasks: {} } };
  const dep = baseDeps({ rec, nums: { months: { "2026-11-01": { values: { impressions: 55, calls: 0 }, status: { impressions: "ok", calls: "could_not_read" } }, "2026-10-01": { values: { impressions: 60, calls: 1 }, status: { impressions: "ok", calls: "ok" } } } } });
  const data = await MO.readData({ clientId: "c1", month: MONTH, deps: dep });
  if (data.numbers.cur.views !== 55 || data.numbers.cur.calls !== null || data.numbers.cur.clicks !== null || data.numbers.prev.clicks !== 7 || data.numbers.prev.calls !== 1) fail(`4 the read must keep a refused number as null: ${JSON.stringify(data.numbers)}`);
}

// 5 competitors
{
  const cur = [{ name: "Bright Local SEO" }, { name: "Culver Digital" }, { name: "Westside Web Co." }, { name: "A" }, { name: "B" }, { name: "C" }];
  const prev = [{ name: "bright local seo" }, { name: "Culver Digital" }, { name: "A" }, { name: "B" }, { name: "C" }];
  const v = O.competitorsView({ cur, prev });
  if (v.names.length !== 5 || JSON.stringify(v.newNames) !== JSON.stringify(["Westside Web Co."])) fail(`5 top 5, one new name flagged (case does not matter): ${JSON.stringify(v.newNames)} ${v.names.length}`);
  if (!/1 new name: "Westside Web Co\." \(flagged\)/.test(v.rows[0].line)) fail(`5 the flag must read on the card: ${v.rows[0].line}`);
  const first = O.competitorsView({ cur, prev: null });
  if (first.newNames.length || !/nothing is flagged as new/.test(first.rows[0].line)) fail("5 with no earlier list nothing is flagged as new, and it says why");
  const none = O.competitorsView({ cur: null, prev });
  if (none.done || none.tone === "ok" || none.names) fail("5 no list from the scans is waiting, never an empty ok");
}

// 6 site health
{
  const task = { ran_at: "2026-11-03T06:00:00Z", status: "done", outcome_data: { pages_checked: 18, pages_total: 20, broken_count: 0, unreachable: [{ url: "u" }, { url: "v" }], psi: [{ url: "h", perf: 78 }] } };
  const c = MO.siteCheckOf(task, MONTH), v = O.siteView({ check: c });
  if (!/^0 broken links · mobile speed 78$/.test(v.rows[0].title) || !/^Checked 18 pages\. Not checked: 2 pages that did not answer, /.test(v.rows[0].line)) fail(`6 the site line: ${v.rows[0].title} | ${v.rows[0].line}`);
  if (c.broken !== 0) fail("6 pages that did not answer are not broken");
  const never = O.siteView({ check: MO.siteCheckOf({}, MONTH) });
  if (never.done || /0 broken/.test(JSON.stringify(never.rows)) || never.tone === "ok") fail(`6 a check that has not run is never "0 broken": ${JSON.stringify(never.rows)}`);
  const stale = MO.siteCheckOf({ ...task, ran_at: "2026-10-03T06:00:00Z" }, MONTH);
  if (stale.ran) fail("6 last month's check must not be this month's result");
  const bad = O.siteView({ check: { ran: true, pages: 10, broken: 2, speed: null, notChecked: [] } });
  if (bad.rows[0].state !== "you" || !/mobile speed not measured/.test(bad.rows[0].title)) fail("6 broken links are flagged and a missing speed says not measured");
}

// 7 blog
{
  const zero = O.blogView({ live: 0, moving: 0, state: "none", month: MONTH, now: d("2026-12-02") });
  if (!zero.done || zero.label !== "0 is fine" || !/0 is a fine month/.test(JSON.stringify(zero.rows))) fail(`7 0 posts at the end of the month is fine and settles: ${JSON.stringify(zero)}`);
  const mid = O.blogView({ live: 0, moving: 0, state: "none", month: MONTH, now: d("2026-11-10") });
  if (mid.done) fail("7 the month is not over: 0 posts so far is not settled yet");
  const live = O.blogView({ live: 1, moving: 0, state: "none", indexed: null, month: MONTH, now: d("2026-11-10") });
  if (!live.done || !/indexing not checked/.test(JSON.stringify(live.rows))) fail("7 a live post counts; indexing is not claimed unless read");
  const idx = O.blogView({ live: 2, moving: 0, state: "none", indexed: 1, month: MONTH, now: d("2026-11-10") });
  if (!/1 of 2 held by Google/.test(JSON.stringify(idx.rows))) fail("7 an indexing read says how many are held");
  const dr = O.blogView({ live: 0, moving: 1, state: "drafted", drafted: [{ title: "What a Google profile needs" }], month: MONTH, now: d("2026-11-10") });
  if (!dr.send || dr.done || dr.tone !== "you" || !/drafted: "What a Google profile needs"/.test(dr.rows[0].title)) fail(`7 a draft is RGA's move (Send for approval) and not settled: ${JSON.stringify(dr.rows[0])}`);
  const sent = O.blogView({ live: 0, moving: 1, state: "sent", month: MONTH, now: d("2026-12-02") });
  if (sent.done || sent.send) fail("7 a post with the client is not settled and not RGA's move");
}

// 8 focus work
{
  const plan = { focus: "Reviews", tasks: [{ text: "Ask 10 recent customers", step: "m2.exec.review_push" }, { text: "Reply to every new review", step: "m2.exec.review_responses" }, { text: "A weekly post", step: "m2.exec.gbp_posts" }, { text: "Call the supplier", step: null }] };
  const v = O.workView({ plan, tasks: { "m2.exec.review_push": { status: "done" }, "m2.exec.review_responses": { status: "skipped" }, "m2.exec.gbp_posts": { status: "in_progress" } } });
  if (v.label !== "2 of 4 settled" || v.done) fail(`8 two of four settled: ${v.label}`);
  if (!v.rows[0].settled || !v.rows[1].settled || v.rows[2].settled || v.rows[3].settled) fail("8 each task settles from the step it is tied to; a skipped step settles it; a task tied to nothing does not settle itself");
  const all = O.workView({ plan: { tasks: [{ text: "a", step: "x" }, { text: "b", step: "y" }] }, tasks: { x: { status: "done" }, y: { status: "skipped" } } });
  if (!all.done || all.tone !== "ok") fail("8 done when every task is settled or skipped");
  if (O.workView({ plan: null, tasks: {} }).done) fail("8 no plan is not done");
}

// 9 listing upkeep
{
  const ran = O.listingsView({ month: MONTH, checked: "2026-11-04T13:40:00Z", live: 0, later: [{ name: "Yelp" }, { name: "Bing Places" }], on: true });
  if (!ran.done || !/^Listings checked Nov 4: no new listing went live$/.test(ran.rows[0].title)) fail(`9 a check ran, nothing went live: ${ran.rows[0].title}`);
  if (!/2 directory sign-ups scheduled later/.test(ran.rows[1].title) || !/Yelp · Bing Places/.test(ran.rows[1].line)) fail("9 sign-ups skipped in Month 1 show as scheduled later");
  const live = O.listingsView({ month: MONTH, checked: "2026-11-04T13:40:00Z", live: 2, later: [], on: true });
  if (!/2 listings went live/.test(live.rows[0].title)) fail("9 what changed is listed");
  const none = O.listingsView({ month: MONTH, checked: "2026-08-04T13:40:00Z", live: 0, later: [], on: false });
  if (none.done || none.tone === "ok" || /no new listing/.test(JSON.stringify(none.rows)) || !/switched off/.test(none.rows[0].title)) fail(`9 no check this month is never a clean result: ${JSON.stringify(none.rows)}`);
}

// 10 the settle
function baseDeps({ rec, nums = { months: {} }, sessions = [], events = [], now = d("2026-12-03"), locked = KW, onWrite } = {}) {
  const writes = [];
  return {
    writes, now: () => now,
    supa: async (p) => { if (p.startsWith("/client_keyword_rankings")) return sessions.map((s) => s.pts.map((r, i) => ({ map_rank: r, measured_at: s.at, grid_session_id: s.at + s.source, source: s.source, keyword: s.keyword }))).flat(); if (p.startsWith("/client_activity")) return events; throw new Error(`unfaked ${p}`); },
    googleNumbers: async () => nums, lockedKeyword: () => locked, titleOf: (id) => id, recheckOn: () => true,
    readRecord: async () => rec,
    readStepRecord: async () => ({ scope: "month2plus", id: "r1", client_id: "c1", reporting_month: MONTH, data: rec.data || {}, tasks: JSON.parse(JSON.stringify(rec.tasks || {})) }),
    writeStepTasks: async (r, tasks) => { if (onWrite) onWrite(); writes.push({ rec: r, tasks }); return { ...(r.data || {}), tasks }; },
  };
}
{
  const ob = { data: { v2Campaign: { rank_grid: { timestamp: "2026-11-17T17:00:00Z", competitors: [{ name: "Bright Local SEO", appearances: 20 }, { name: "Culver Digital", appearances: 12 }] } } },
    tasks: { "m1.audit.citations": { ran_at: "2026-11-04T13:50:00Z", recheck: { at: "2026-11-04T13:20:00Z" } }, "m1.platform.yelp": { status: "skipped" } } };
  const rec = { tasks: { [O.ID.SITE]: { ran_at: "2026-11-03T06:00:00Z", outcome_data: { pages_checked: 5, broken_count: 0, psi: [{ perf: 80 }] } }, [O.ID.NUMBERS]: { status: "skipped" } },
    data: { plan: { tasks: [{ text: "x", step: "m2.exec.review_push" }] } }, row: { gsc_clicks: 4 }, prevRow: null, prevData: { competitors: [{ name: "Culver Digital" }] }, ob };
  const nums = { months: { "2026-11-01": { values: { impressions: 55, calls: 2 }, status: { impressions: "ok", calls: "ok" } }, "2026-10-01": { values: {}, status: {} } } };
  const dep = baseDeps({ rec, nums, sessions: SESS.slice(0, 3), events: [] });
  const r = await MO.settle({ clientId: "c1", month: MONTH, deps: dep });
  const w = dep.writes[0] && dep.writes[0].tasks;
  if (!w) fail("10 the settle wrote nothing although the scans, site check and listing check were all in");
  else {
    for (const id of [O.ID.SCANS, O.ID.COMPETITORS, O.ID.SITE, O.ID.LISTINGS]) if (!w[id] || w[id].status !== "done" || w[id].done_by !== "checks") fail(`10 ${id} must be marked done by the checks`);
    if (w[O.ID.NUMBERS].status !== "skipped") fail("10 a skipped step must stay skipped");
    if (w[O.ID.WORK] && w[O.ID.WORK].status === "done") fail("10 the focus work must not settle while its task is open");
    if (!(dep.writes[0].rec.data.competitors || []).some((c) => c.name === "Bright Local SEO")) fail("10 the month's competitor list must be frozen into its record");
  }
  // nothing proven = nothing written
  const empty = baseDeps({ rec: { tasks: {}, data: {}, row: null, prevRow: null, prevData: null, ob: { data: {}, tasks: {} } }, sessions: [], locked: null, now: d("2026-11-10") });
  const e = await MO.settle({ clientId: "c1", month: MONTH, deps: empty });
  if (empty.writes.length || e.settled.length) fail(`10 with nothing read the settle must write nothing: ${JSON.stringify(e)}`);
  // a read that failed is not a measurement
  const broken = baseDeps({ rec: { ...rec, tasks: {} }, nums: null, sessions: [] });
  broken.now = () => d("2026-11-10");
  broken.supa = async () => { throw new Error("down"); };
  const b = await MO.settle({ clientId: "c1", month: MONTH, deps: broken });
  if (b.settled.includes(O.ID.SCANS) || b.settled.includes(O.ID.LISTINGS) || b.settled.includes(O.ID.NUMBERS)) fail("10 a failed read must never settle a step");
  // a closed month refuses (writeStepTasks throws the closed error)
  const closed = baseDeps({ rec, nums, sessions: SESS.slice(0, 3), onWrite: () => { throw Object.assign(new Error("This month is closed."), { closedMonth: true }); } });
  let refused = false; try { await MO.settle({ clientId: "c1", month: MONTH, deps: closed }); } catch (err) { refused = !!err.closedMonth; }
  if (!refused) fail("10 a closed month must refuse the settle");
  // the focus work settles from its tied step
  const wr = { ...rec, tasks: { ...rec.tasks, "m2.exec.review_push": { status: "done" } } };
  const dw = baseDeps({ rec: wr, nums, sessions: SESS.slice(0, 3) }); await MO.settle({ clientId: "c1", month: MONTH, deps: dw });
  if (!dw.writes[0] || dw.writes[0].tasks[O.ID.WORK].status !== "done") fail("10 the focus work settles from the step its task is tied to");
  // the read door carries no secret and no paid call
  const src = strip(read("netlify/functions/_monthly-once.js")) + strip(read("netlify/functions/admin-monthly-once.js"));
  if (/serpapi|startRankScan|v2-rank-grid|flow-execute-heavy/i.test(src)) fail("10 the monthly reads must buy nothing");
}

// 11 the morning run
{
  const NOW = d("2026-11-10"), R = MR.MONTHLY_REPLIES;
  const ok = (ids) => ({ status: "ok", openIds: ids });
  const covered = { auto_result: { outcome_data: { reviews: { drafted_ids: ["r1"] } } } };
  if (MR.monthlyRepliesWhyNot({}, ok(["r1"]), NOW)) fail("11 a new unanswered review starts the monthly replies");
  if (!MR.monthlyRepliesWhyNot(covered, ok(["r1"]), NOW)) fail("11 a review the last round already covers does not start it again");
  if (MR.monthlyRepliesWhyNot(covered, ok(["r1", "r2"]), NOW)) fail("11 a NEW review beyond the last round starts it");
  if (!MR.monthlyRepliesWhyNot({}, ok([]), NOW)) fail("11 no unanswered review: nothing starts");
  if (!MR.monthlyRepliesWhyNot({}, null, NOW) || !MR.monthlyRepliesWhyNot({}, { status: "disconnected", openIds: [] }, NOW)) fail("11 a read that failed must not start anything, and must not read as no review");
  if (!MR.monthlyRepliesWhyNot({ morning_run: { at: new Date(NOW - 3600000).toISOString() } }, ok(["r9"]), NOW)) fail("11 one start per day");
  if (!MR.monthlyRepliesWhyNot({ status: "skipped" }, ok(["r9"]), NOW)) fail("11 a skipped step never starts");
  const failed = (tries) => ({ reply_posts: { r1: { status: "failed", tries } }, ...covered });
  if (MR.monthlyRepliesWhyNot(failed(2), null, NOW)) fail("11 a failed reply post is retried each day, even when the reviews can't be read");
  if (!MR.monthlyRepliesWhyNot(failed(5), ok([]), NOW)) fail("11 after 5 tries it stops, as step 61 does");
  const site = MR.MONTHLY_SITE;
  if (MR.monthlySiteWhyNot({}, MONTH, NOW)) fail("11 the monthly site check starts when it has not run this month");
  if (!MR.monthlySiteWhyNot({ ran_at: "2026-11-03T06:00:00Z", outcome_data: { pages_checked: 3 } }, MONTH, NOW)) fail("11 once a month, not daily");
  if (MR.monthlySiteWhyNot({ ran_at: "2026-10-03T06:00:00Z", outcome_data: { pages_checked: 3 } }, MONTH, NOW)) fail("11 last month's result does not stop this month's check");
  // the run itself, with fakes
  const mk = ({ tasks = {}, read = ok(["r1"]) } = {}) => {
    const log = { starts: [], stamps: [], records: [], settled: 0 };
    const data = { tasks: JSON.parse(JSON.stringify(tasks)) };
    const deps = { now: () => NOW,
      readStepRecord: async () => ({ scope: "month2plus", id: "r", client_id: "c1", reporting_month: MONTH, data, tasks: data.tasks }),
      writeStepTasks: async (rec, t) => { data.tasks = t; log.stamps.push(Object.keys(t)); return data; },
      reviewsOpen: async () => { if (read === "throw") throw new Error("down"); return read; },
      settleMonth: async () => { log.settled++; return { settled: ["x"] }; },
      start: async (c, s, m) => { log.starts.push(`${c}/${s}/${m}`); }, record: async (o) => { log.records.push(o); } };
    return { deps, log, data };
  };
  const out = () => ({ due: 0, started: 0, failed: 0, errors: [], by_step: {}, monthly_settled: 0 });
  let w = mk(), o = out(); await MR.monthlyMorning({ d: w.deps, c: { id: "c1" }, month: MONTH, out: o });
  if (!w.log.starts.includes(`c1/${R}/${MONTH}`) || !w.log.starts.includes(`c1/${site}/${MONTH}`)) fail(`11 a new review and an un-run month start the replies and the site check: ${w.log.starts}`);
  if (w.log.settled !== 1 || o.monthly_settled !== 1) fail("11 the morning run settles the month's self-running steps");
  if (!w.data.tasks[R].morning_run) fail("11 the start is stamped on the month's record");
  await MR.monthlyMorning({ d: w.deps, c: { id: "c1" }, month: MONTH, out: o });
  if (w.log.starts.length !== 2) fail(`11 a second pass the same day starts nothing more: ${w.log.starts}`);
  w = mk({ read: "throw" }); o = out(); await MR.monthlyMorning({ d: w.deps, c: { id: "c1" }, month: MONTH, out: o });
  if (w.log.starts.some((s) => s.includes(R))) fail("11 a reviews read that threw must not start the replies");
  w = mk({ tasks: { [R]: { reply_posts: { r1: { status: "failed", tries: 1 } }, ...covered } }, read: ok([]) }); o = out(); await MR.monthlyMorning({ d: w.deps, c: { id: "c1" }, month: MONTH, out: o });
  if (!w.log.starts.some((s) => s.includes(R))) fail("11 a failed reply post is retried by the morning run");
  const src = strip(read("netlify/functions/_morning-run.js"));
  if (!/monthlyMorning\(\{ d, c, month: monthKey, out \}\)/.test(src) || src.indexOf("openMonth(") > src.lastIndexOf("monthlyMorning({ d, c")) fail("11 runMorning must call the monthly part after the month opens");
  if (/aiDraft|anthropic/i.test(src.slice(src.indexOf("MONTHLY (monthly_s3")))) fail("11 the morning run itself calls no model");
}

// 12 wiring
{
  const a = read("admin/admin.js"), html = read("admin/index.html");
  for (const [id, fn] of [["m2.snap.grid_scan", "oncScansCardHtml"], ["m2.snap.gbp_metrics", "oncNumbersCardHtml"], ["m2.snap.competitors", "oncCompetitorsCardHtml"], ["m2.exec.site_audit_recurring", "oncSiteCardHtml"], ["m2.exec.blog_posts", "oncBlogCardHtml"], ["m2.exec.focus_area_work", "oncWorkCardHtml"], ["m2.exec.listing_upkeep", "oncListingsCardHtml"]])
    if (!new RegExp(`id === "${id.replace(/\./g, "\\.")}" \\? ${fn}\\(`).test(a)) fail(`12 ${id}'s card is not wired into rowStepCardsHtml`);
  if (!/import "\/shared\/monthly-monthly\.js\?v=/.test(a)) fail("12 the admin must load shared/monthly-monthly.js");
const vge = (txt, re, min) => { const m = re.exec(txt); return !!m && m[1] >= min; };   // a ?v= key at least this one: later sections bump them again
  if (!vge(html, /admin\.js\?v=(\w+)/, "20261109q") || !vge(html, /admin\.css\?v=(\w+)/, "20261109f") || !vge(a, /steps-57-64\.js\?v=(\w+)/, "20261109g") || !vge(a, /monthly-sections\.js\?v=(\w+)/, "20261109c")) fail("12 the ?v= keys were not bumped");
  if (!/mo-tiles/.test(read("admin/admin.css"))) fail("12 the number tiles have no style");
  for (const f of ["shared/monthly-monthly.js", "netlify/functions/_monthly-once.js", "netlify/functions/admin-monthly-once.js"]) if (/—/.test(strip(read(f)).replace(/`[^`]*`/g, (s) => s))) fail(`12 no em dash in ${f}`);
  const sec = a.slice(a.indexOf("MONTHLY · SECTION 3"), a.indexOf("// ── step 64 · into the monthly cycle"));
  if (/—/.test(strip(sec))) fail("12 no em dash in the section 3 card text");
}

// monthly_fix_v2 (11-9): the OLD pieces must be gone too, not only the new ones present (one card per row, the To do for numbered months, Open the month settled, the quarter preview, the bottom blocks)
for (const m of oldChromeFailures(SITE)) fail(m);
if (F.length) { console.error(`🔴 check-monthly-once: ${F.length} problem(s)\n - ${F.join("\n - ")}`); process.exit(1); }
console.log("✅ check-monthly-once: merges clean (no dangling id), no Run button or hand tick, scans compared like for like, numbers say not measured never 0, new competitor flagged, site health says what it did not check, blog 0 is fine, focus work settles from its tied steps, listing upkeep from the jobs, settle proves before it writes, morning run starts monthly replies on a new review and retries failed posts");
