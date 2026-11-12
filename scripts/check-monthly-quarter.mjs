#!/usr/bin/env node
// check-monthly-quarter.mjs — MONTHLY SECTION 4, "EVERY QUARTER" (approved monthly_s4_quarterly_v1, the owner 11-9). Runs the SHIPPED code against FAKES (no network, no model,
// no email, no search, no Google write: every outside reach is a recording fake).
//   1 the steps: seven, one section in order, each in the playbook once; the two link steps are MERGED into one (no dangling id anywhere); mystery shop is the lead test
//   2 shown only in quarter months (3, 6, 9, 12 ...) and folded otherwise; the report's quarter block is the same
//   3 14 "Not sure" is a fine answer, never blocks, the answer is labeled as theirs
//   4 15 links: the finder is capped and once a quarter, off when the search is off; a link counts only when seen live
//   5 16 profile: nothing leaves "suggested" without the client; only approved ones reach Google; each counts only when read back
//   6 17 overlap: runs itself from Search Console rows, names both pages, a failed read is never "no overlap", no Run button
//   7 18 win story: only from a 5-star review, used only on the client's one-tap yes
//   8 19 video: counts only when read live on their channel (a failed read is not "not live")
//   9 20 lead test: hidden without call tracking; refused without it; one result recorded
//  10 the report: a short "This quarter" block in a quarter month only; builds with every quarter step open; no separate quarterly report
//  11 nothing blocks the close; every card skips; no hand tick
//  12 wiring: cards in the admin, ?v= keys, the doors, no sender, no em dash
// Exit 0 holds · 1 regressed · 2 can't tell
import { oldChromeFailures } from "./_monthly-no-old-chrome.mjs";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = [], fail = (m) => F.push(m);
const read = (r, base = SITE) => { try { return fs.readFileSync(path.join(base, r), "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
Object.assign(process.env, { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "k", INTERNAL_FN_SECRET: "x" });
const realFetch = globalThis.fetch;
let FETCH = async (url) => { throw new Error(`the gate must not touch the network: ${url}`); };
globalThis.fetch = (...a) => FETCH(...a);
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));
let Q, MQ, SEC, MC, E, YT, PB;
try {
  Q = req("../../shared/monthly-quarter.js"); MQ = req("./_monthly-quarter.js"); SEC = req("../../shared/monthly-sections.js"); MC = req("../../shared/monthly-close.js");
  E = req("./_monthly-report-email.js"); YT = req("./_youtube-read.js"); PB = JSON.parse(read("data/playbooks/playbooks.json"));
} catch (e) { console.error(`⚠️  INDETERMINATE — a module did not load: ${e.message}`); process.exit(2); }
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");
const ID = Q.ID, MONTH = "2027-02-01", NOW = Date.parse("2027-02-10T12:00:00Z");

/** A recording fake: the month's record in memory, the outside calls counted. */
function fake(over = {}) {
  const f = { store: {}, writes: 0, gscCalls: 0, videoCalls: 0, found: [], profileWrites: [], findCalls: 0, findCap: null, draftCalls: 0, sent: 0 };
  Object.assign(f, {
    now: () => NOW,
    readStepRecord: async () => ({ tasks: JSON.parse(JSON.stringify(f.store)) }),
    writeStepTasks: async (rec, tasks) => { f.writes++; f.store = JSON.parse(JSON.stringify(tasks)); return { tasks: JSON.parse(JSON.stringify(f.store)) }; },
    readRecord: async () => ({ tasks: f.store }),
    monthNumber: async () => 3, callTracking: async () => true, businessName: async () => "Sam's Plumbing",
    fiveStarReview: async () => ({ text: "Sam showed up on time and fixed the leak in an hour. Great price and he cleaned up after himself.", stars: 5, author: "J. Lee" }),
    videoLive: async () => { f.videoCalls++; return true; },
    gscRows: async () => { f.gscCalls++; return [{ query: "plumber austin", page: "https://x.test/a", impressions: 100 }, { query: "plumber austin", page: "https://x.test/b", impressions: 80 }, { query: "water heater", page: "https://x.test/c", impressions: 90 }]; },
    searchOff: () => false,
    findPlaces: async (id, cap) => { f.findCalls++; f.findCap = cap; return { places: [{ host: "austinchamber.test", name: "Chamber", url: "https://austinchamber.test" }], searches: cap }; },
    draftAsk: async () => { f.draftCalls++; return { subject: "A link", body: "Hello" }; },
    writeProfile: async (id, c) => { f.profileWrites.push(c.key); return f.profileResult ? f.profileResult(c) : { state: "on_google" }; },
  });
  return Object.assign(f, over);
}
const act = (f, action, body) => MQ.act({ clientId: "c1", month: MONTH, action, body, deps: f, by: "rga@test" });
const ans = (f, kind, key, answer) => MQ.clientAnswer({ clientId: "c1", month: MONTH, kind, key, answer, deps: f });
const task = (f, id) => f.store[id] || {};

// 1 the steps
{
  const sec = SEC.SECTIONS.find((s) => s.key === "m2s-quarter"), ids = PB.month2plus.map((s) => s.id);
  // mature_account_health_v1 (11-10): three steps were ADDED to every quarter (31 letter, 32 grow the plan, 33 AI search check, shared/monthly-health.js). The seven stay first, in order, untouched.
  if (JSON.stringify(sec.ids.slice(0, Q.IDS.length)) !== JSON.stringify(Q.IDS) || sec.ids.length !== Q.IDS.length + 3) fail(`1 the "Every quarter" section must list the seven steps in order, then the three added ones: ${sec.ids.join(", ")}`);
  if (Q.IDS.length !== 7) fail("1 section 4 has seven steps");
  for (const id of Q.IDS) if (ids.filter((x) => x === id).length !== 1) fail(`1 ${id} must be in the playbook exactly once`);
  for (const [gone, kept] of Object.entries(Q.RETIRED)) {
    if (ids.includes(gone)) fail(`1 the merged step ${gone} is still in the playbook`);
    if (!ids.includes(kept)) fail(`1 ${gone} was merged into ${kept}, which is not in the playbook`);
    if (SEC.SECTIONS.some((s) => s.ids.includes(gone))) fail(`1 the merged step ${gone} is still in a section`);
    for (const file of ["data/playbooks/what-it-does.json", "data/monthly-focus-tasks.json", "data/playbooks/client-steps.json", "admin/admin.js", "portal/portal.js", "shared/steps-57-64.js", "shared/step-lock.js"]) {
      if (new RegExp(`["']${gone.replace(/\./g, "\\.")}["']`).test(strip(read(file)))) fail(`1 ${file} still names the merged step ${gone}`);
    }
    if (new RegExp(`["']${gone.replace(/\./g, "\\.")}["']`).test(strip(read("netlify/functions/flow-execute.js")))) fail(`1 flow-execute.js still names the merged step ${gone}`);
  }
  for (const s of PB.month2plus) for (const dep of s.dependsOn || []) if (!ids.includes(dep)) fail(`1 ${s.id} depends on ${dep}, which is not in the playbook`);
  if (JSON.stringify(Object.keys(Q.RETIRED).sort()) !== JSON.stringify(["m2.exec.brand_mentions", "m2.exec.competitor_backlink_steal"]) || Object.values(Q.RETIRED).some((k) => k !== ID.LINKS)) fail(`1 BOTH old link steps (brand mentions, competitor backlinks) must be recorded as merged into the one link step: ${JSON.stringify(Q.RETIRED)}`);
  if (/mystery/i.test(Q.TITLES[ID.LEAD] || "") || !/Lead-handling test/.test(Q.TITLES[ID.LEAD] || "") || /mystery/i.test(Q.leadView({ callTracking: true, task: {} }).title || "")) fail("1 the card the admin sees must call the lead step the lead-handling test, never a mystery shop");
  const lead = PB.month2plus.find((s) => s.id === ID.LEAD) || {};
  if (/mystery/i.test(lead.title || "") || !/call tracking/i.test(lead.title || "")) fail("1 the lead test replaces the mystery shop and says it needs call tracking");
  const links = PB.month2plus.find((s) => s.id === ID.LINKS) || {};
  if (!/Links and local press/.test(links.title || "")) fail("1 the merged step is named Links and local press");
}

// 2 quarter months only
{
  for (const n of [3, 6, 9, 12, 15]) if (!SEC.showsQuarter(n)) fail(`2 Month ${n} is a quarter month`);
  for (const n of [1, 2, 4, 5, 7, 8, 10, 11]) if (SEC.showsQuarter(n)) fail(`2 Month ${n} is not a quarter month`);
  if (SEC.idsFor(4).some((i) => Q.IDS.includes(i))) fail("2 the quarter's steps leave the count in a plain month");
  if (!Q.IDS.every((i) => SEC.idsFor(6).includes(i))) fail("2 the quarter's steps count in Month 6");
  const tasks = { [ID.OUTCOMES]: { client_input: { jobs_from_leads: "12" } } };
  if (Q.blockOf({ tasks, monthNumber: 4 }) !== null) fail("2 the report's quarter block is empty in a plain month");
  if (Q.blockOf({ tasks, monthNumber: null }) !== null) fail("2 an unknown month number makes no quarter claim");
  if (!Q.blockOf({ tasks, monthNumber: 3 })) fail("2 the quarter block appears in Month 3");
  const a = strip(read("admin/admin.js"));
  if (!/Hidden this month · next in Month/.test(a) || !/sec\.quarterOnly && !quarterOn\) return foldedQ/.test(a)) fail("2 the admin folds the quarter section in a plain month");
}

// 3 their numbers
{
  const open = Q.outcomesView({ task: {} }), ns = Q.outcomesView({ task: { status: "done", client_input: { not_sure: ["jobs_from_leads", "avg_job_value"] } } });
  const yes = Q.outcomesView({ task: { status: "done", client_input: { jobs_from_leads: "12 of 20", avg_job_value: "450" } } });
  if (!/About how many jobs came from Google this quarter\?/.test(JSON.stringify(open.rows))) fail("3 the ask is worded as approved");
  { const stale = Q.outcomesView({ task: { status: "done", client_input: { jobs_from_leads: "777", avg_job_value: "9876", not_sure: ["jobs_from_leads", "avg_job_value"] } } });
    if (/777|9876/.test(JSON.stringify(stale.rows))) fail("3 a number the client then marked Not sure must never be shown as a number"); }
  if (!ns.done || !ns.answered || !/not sure/i.test(JSON.stringify(ns.rows))) fail("3 \"Not sure\" is an answer and settles the step");
  if (/\b0\b/.test(JSON.stringify(ns.rows.map((r) => r.title)))) fail("3 not sure is never shown as 0");
  if (!/Reported by them/.test(JSON.stringify(yes.rows)) || !yes.done) fail("3 their answer is labeled as theirs");
  const cl = PB.month2plus.find((s) => s.id === ID.OUTCOMES), fields = ((cl.clientInput || {}).fields || []);
  if (!fields.every((x) => x.allowNotSure)) fail("3 every field accepts \"Not sure\"");
  if (!fields.some((x) => /About how many jobs came from Google this quarter\?/.test(x.label))) fail("3 the portal asks the approved question");
  const blk = Q.blockOf({ tasks: { [ID.OUTCOMES]: { client_input: { not_sure: ["jobs_from_leads", "avg_job_value"] } } }, monthNumber: 3 });
  if (blk) fail("3 a \"not sure\" answer puts nothing in the report");
  const b2 = Q.blockOf({ tasks: { [ID.OUTCOMES]: { client_input: { jobs_from_leads: "12" } } }, monthNumber: 3 });
  if (!b2 || !/reported by you/.test(b2.lines.join(" "))) fail("3 the report labels their numbers as theirs");
}

// 4 links. tier3_best_in_class_v1 item 8 (the owner 11-11): the step is the LINK PILOT now (2 clients a quarter); outside it nothing is searched. The pilot's own rules
// (35-day live, paid offers refused, the client's card) are held by check-a-link-counts-only-when-seen-live; here the step's quarter behavior, in the pilot.
{
  const PIL = { pilot: { on: true, at: "2027-02-01T00:00:00Z" } };
  const outside = fake(); let r = await act(outside, "links_find");
  if (r.ok || outside.findCalls !== 0) fail("4 the finder ran for a client outside the link pilot");
  const f = fake(); f.store[ID.LINKS] = { ...PIL }; r = await act(f, "links_find");
  if (!r.ok || f.findCalls !== 1 || f.findCap !== Q.LINK_SEARCHES_MAX || Q.LINK_SEARCHES_MAX > 4) fail(`4 the finder is capped at ${Q.LINK_SEARCHES_MAX} searches (cap ${f.findCap})`);
  r = await act(f, "links_find"); if (r.ok || f.findCalls !== 1) fail("4 the finder runs once a quarter");
  const off = fake({ searchOff: () => true }); off.store[ID.LINKS] = { ...PIL }; await act(off, "links_find");
  if (off.findCalls !== 0 || task(off, ID.LINKS).searched_at) fail("4 no search is spent while the search is off, and nothing is claimed");
  if (!/Waiting|off/i.test(JSON.stringify(Q.linksView({ task: task(off, ID.LINKS), now: NOW }).rows))) fail("4 off says so");
  r = await act(f, "links_ask", { host: "austinchamber.test" }); if (!r.ok || f.draftCalls !== 1 || task(f, ID.LINKS).places["austinchamber.test"].state !== "drafted") fail("4 the ask is drafted by the ask drafter");
  r = await act(f, "links_ask", { host: "not-on-the-list.test" }); if (r.ok) fail("4 an ask for a place that isn't on the list is refused");
  const asked = Q.linksView({ task: { ...PIL, searched_at: "x", places: { "a.test": { state: "live" }, "b.test": { state: "asked" } } }, now: NOW });
  if (asked.live !== 0) fail("4 a link counts only when seen live (live_seen_at)");
  if (Q.linksView({ task: { ...PIL, searched_at: "x", places: { "a.test": { state: "live", live_seen_at: "2027-02-01" } } }, now: NOW }).live !== 1) fail("4 a link seen live counts");
  if (Q.linksView({ task: { ...PIL }, now: NOW }).done) fail("4 'no place found' is not said before the finder ran");
  if (!/mentionQueries/.test(read("netlify/functions/_monthly-quarter.js")) || !/searchOff/.test(read("netlify/functions/_monthly-quarter.js"))) fail("4 the finder is Month 1's (mentionQueries / placesFrom) and respects searchOff");
}

// 5 profile
{
  const f = fake();
  await act(f, "profile_suggest", { label: "Online appointments", kind: "attribute", key: "appointments" });
  await act(f, "profile_suggest", { label: "Wheelchair accessible entrance", kind: "attribute", key: "wheelchair" });
  let r = await act(f, "profile_apply"); if (r.ok || f.profileWrites.length) fail("5 nothing the client hasn't approved reaches Google");
  r = await act(f, "profile_send"); if (!r.ok || r.sent !== 2) fail("5 the suggestions go to the client");
  r = await act(f, "profile_apply"); if (r.ok || f.profileWrites.length) fail("5 a change that is only SENT (not approved) is not written");
  for (const c of task(f, ID.PROFILE).profile_changes) if (c.state === "approved") fail("5 RGA cannot approve a change for the client");
  r = await ans(f, "profile", "appointments", "yes"); if (!r.ok) fail("5 the client approves in one tap");
  await ans(f, "profile", "wheelchair", "no");
  r = await ans(f, "profile", "appointments", "yes"); if (r.ok) fail("5 an answered change can't be re-answered");
  const v0 = Q.profileView({ task: task(f, ID.PROFILE) }); if (v0.done) fail("5 approved is not done until Google reads it back");
  f.profileResult = () => ({ state: "failed", error: "Google refused" });
  r = await act(f, "profile_apply"); if (task(f, ID.PROFILE).profile_changes.find((c) => c.key === "appointments").state === "readback") fail("5 a refused write is never counted");
  f.profileResult = null;
  // a failed one is retried by the next press? only approved|written are applied, a failed one goes back to RGA
  const t = task(f, ID.PROFILE); t.profile_changes.find((c) => c.key === "appointments").state = "approved"; f.store[ID.PROFILE] = t;
  r = await act(f, "profile_apply");
  if (JSON.stringify(f.profileWrites.filter((k) => k === "wheelchair")) !== "[]") fail("5 a change the client declined is never sent");
  const v1 = Q.profileView({ task: task(f, ID.PROFILE) }); if (!v1.done || v1.readback !== 1) fail(`5 read back = counted, declined = left alone: ${JSON.stringify([v1.done, v1.readback])}`);
  if (!Q.blockOf({ tasks: f.store, monthNumber: 3 }) || !/1 detail/.test(Q.blockOf({ tasks: f.store, monthNumber: 3 }).lines.join(" "))) fail("5 only the read-back change reaches the report");
  const none = Q.profileView({ task: {} }); if (none.done) fail("5 'nothing to change' is not claimed before RGA looked");
  const src = strip(read("netlify/functions/_monthly-quarter.js")), actSrc = src.slice(src.indexOf("async function act("), src.indexOf("async function clientAnswer"));
  if (/state: "approved"/.test(actSrc) && !/c\.state === "approved"/.test(actSrc)) fail("5 act() never sets a change to approved");
  if (/state: "approved"/.test(actSrc.replace(/c\.state === "approved"/g, ""))) fail("5 act() must not write the approved state: only the client does");
  if (!/GP\.applyForStep/.test(src)) fail("5 approved changes go through the existing GBP write path (applyForStep)");
}

// 6 overlap
{
  const f = fake(); let r = await MQ.settle({ clientId: "c1", month: MONTH, deps: f });
  const t = task(f, ID.OVERLAP);
  if (r.overlap !== "read" || t.status !== "done" || !t.overlap.read) fail(`6 the overlap check runs itself in a quarter month: ${JSON.stringify(r)}`);
  const v = Q.overlapView({ task: t }); if (v.clashes !== 1 || !(/x\.test\/a/.test(JSON.stringify(v.rows)) && /x\.test\/b/.test(JSON.stringify(v.rows)))) fail("6 a clash names BOTH pages");
  const quiet = fake({ gscRows: async () => [{ query: "a", page: "p1", impressions: 200 }, { query: "a", page: "p2", impressions: 5 }, { query: "b", page: "p3", impressions: 90 }] });
  await MQ.settle({ clientId: "c1", month: MONTH, deps: quiet });
  if (Q.overlapView({ task: task(quiet, ID.OVERLAP) }).clashes !== 0 || !/No two pages compete/.test(JSON.stringify(Q.overlapView({ task: task(quiet, ID.OVERLAP) }).rows))) fail("6 a page with a sliver of a search is not a clash");
  const bad = fake({ gscRows: async () => null }); r = await MQ.settle({ clientId: "c1", month: MONTH, deps: bad });
  if (task(bad, ID.OVERLAP).status === "done" || Q.overlapView({ task: task(bad, ID.OVERLAP) }).done || /No two pages compete/.test(JSON.stringify(Q.overlapView({ task: task(bad, ID.OVERLAP) }).rows))) fail("6 a failed Search Console read is never 'no overlap'");
  const plain = fake({ monthNumber: async () => 4 }); r = await MQ.settle({ clientId: "c1", month: MONTH, deps: plain });
  if (plain.gscCalls || plain.videoCalls || plain.writes || r.quarter) fail("6 nothing is read or written in a plain month");
  const skipped = fake(); skipped.store[ID.OVERLAP] = { status: "skipped" }; await MQ.settle({ clientId: "c1", month: MONTH, deps: skipped });
  if (skipped.gscCalls || task(skipped, ID.OVERLAP).status !== "skipped") fail("6 a skipped step is left alone");
  if (!Q.SELF.includes(ID.OVERLAP)) fail("6 17 runs itself (SELF)");
  const a = strip(read("admin/admin.js"));
  if (!/globalThis\.rgaMonthlyQuarter && globalThis\.rgaMonthlyQuarter\.IDS\.includes\(id\)/.test(a)) fail("6 the admin gives the quarter's rows no Run button");
  if (!/rgaMonthlyQuarter\.SELF\.includes\(id\)[^;]*runsOn\(/.test(a)) fail("6 the row says 'Runs itself'");
  const m = read("netlify/functions/_morning-run.js"); if (!/settleQuarter/.test(m)) fail("6 the morning run settles the quarter");
}

// 7 win story
{
  const f = fake(); let r = await ans(f, "win", null, "yes"); if (r.ok) fail("7 there is nothing to answer before a draft");
  r = await act(f, "win_draft"); const t = task(f, ID.WIN);
  if (!r.ok || !t.win || !t.win.draft || t.win.answer !== null) fail("7 the story is drafted from the review and waits");
  if (!/Sam showed up on time/.test(t.win.draft)) fail("7 the draft is the review's own words");
  const w0 = Q.winView({ task: t }); if (w0.used || w0.done) fail("7 a drafted story is not used and not done before the client's yes");
  if (Q.blockOf({ tasks: f.store, monthNumber: 3 })) fail("7 an unanswered story is not in the report");
  const four = fake({ fiveStarReview: async () => ({ text: "Fine work overall and we'd use them again for sure.", stars: 4 }) }); r = await act(four, "win_draft");
  if (r.ok || task(four, ID.WIN).win) fail("7 only a 5-star review is drafted from");
  const none = fake({ fiveStarReview: async () => null }); r = await act(none, "win_draft"); if (r.ok) fail("7 no review, no story (nothing is invented)");
  const no = fake(); await act(no, "win_draft"); await ans(no, "win", null, "no");
  if (Q.winView({ task: task(no, ID.WIN) }).used || Q.blockOf({ tasks: no.store, monthNumber: 3 })) fail("7 'no' means the story is used nowhere");
  await ans(f, "win", null, "yes"); if (!Q.winView({ task: task(f, ID.WIN) }).used || !/Your story/.test((Q.blockOf({ tasks: f.store, monthNumber: 3 }) || { lines: [] }).lines.join(" "))) fail("7 'yes' makes the story usable");
  r = await ans(f, "win", null, "maybe"); if (r.ok) fail("7 only yes or no");
}

// 8 video
{
  const live = fake(); await MQ.settle({ clientId: "c1", month: MONTH, deps: live });
  if (task(live, ID.VIDEO).status !== "done" || task(live, ID.VIDEO).video_live !== true) fail("8 a video read live on their channel counts");
  const not = fake({ videoLive: async () => false }); await MQ.settle({ clientId: "c1", month: MONTH, deps: not });
  if (task(not, ID.VIDEO).status === "done" || Q.videoView({ task: task(not, ID.VIDEO), live: false }).done) fail("8 'scripts sent' is not a video; not live is not done");
  { const sv = Q.videoView({ task: { scripts: 2 }, live: false }), sn = Q.videoView({ task: { scripts: 2 }, live: null });
    if (sv.done || sv.live || sn.done || sn.live) fail("8 two scripts sent is not a video: only a read-live video counts"); }
  const unread = fake({ videoLive: async () => null }); const unreadR = await MQ.settle({ clientId: "c1", month: MONTH, deps: unread });
  if (unreadR.video !== "no_read") fail(`8 a failed YouTube read must say no_read, never not_live: ${unreadR.video}`);
  if (task(unread, ID.VIDEO).status === "done" || task(unread, ID.VIDEO).video_live) fail("8 a failed read counts nothing");
  if (Q.blockOf({ tasks: { [ID.VIDEO]: { status: "done" } }, monthNumber: 3 })) fail("8 a done flag without the read is not in the report");
  const ok = (items) => async (u) => ({ ok: true, json: async () => (/channels/.test(u) ? { items: [{ contentDetails: { relatedPlaylists: { uploads: "UU1" } } }] } : { items }) });
  let r = await YT.readUploads("@sams", "2027-01-01T00:00:00Z", { key: "SECRETKEY", fetchFn: ok([{ contentDetails: { videoPublishedAt: "2027-01-20T00:00:00Z" } }]) });
  if (r.state !== "ok" || r.live !== true) fail("8 the YouTube read finds a video published this quarter");
  r = await YT.readUploads("@sams", "2027-01-01T00:00:00Z", { key: "SECRETKEY", fetchFn: ok([{ contentDetails: { videoPublishedAt: "2026-06-20T00:00:00Z" } }]) });
  if (r.state !== "ok" || r.live !== false) fail("8 an old video is not this quarter's");
  r = await YT.readUploads("@sams", "2027-01-01T00:00:00Z", { key: "SECRETKEY", fetchFn: async () => { throw new Error("https://x?key=SECRETKEY"); } });
  if (r.state !== "cant" || /SECRETKEY/.test(JSON.stringify(r))) fail("8 a failed read is 'cant' and never carries the key");
  r = await YT.readUploads("@sams", "2027-01-01T00:00:00Z", { key: "" }); if (r.state !== "cant") fail("8 no key = can't tell");
}

// 9 lead test
{
  if (Q.leadView({ callTracking: false, task: {} }) !== null) fail("9 the lead test card is hidden without call tracking");
  if (Q.visibleIds({ callTracking: false }).includes(ID.LEAD) || !Q.visibleIds({ callTracking: true }).includes(ID.LEAD)) fail("9 the lead test is in the list only with call tracking");
  const no = fake({ callTracking: async () => false }); let r = await act(no, "lead_record", { result: "answered in 3 rings" }); if (r.ok || task(no, ID.LEAD).lead_test) fail("9 no call tracking = refused, nothing recorded");
  const yes = fake(); r = await act(yes, "lead_record", { result: "" }); if (r.ok) fail("9 a test needs a result");
  r = await act(yes, "lead_record", { result: "Answered in 3 rings; quoted a price on the call" });
  if (!r.ok || task(yes, ID.LEAD).status !== "done" || !Q.leadView({ callTracking: true, task: task(yes, ID.LEAD) }).done) fail("9 one test call, its result recorded");
  const a = strip(read("admin/admin.js")); if (!/qrtHideStep/.test(a) || !/if \(!qrtData\(\)\) return ""/.test(a)) fail("9 the admin hides the lead test's row and card");
}

// 10 the report
{
  const frozen = { at: "2027-03-02T12:00:00Z", status: {}, google: { views: 120, calls: 9, prev_views: 100, prev_calls: 9 }, other: { clicks: 40, prev_clicks: 45 } };
  const tasksQ = { [ID.OUTCOMES]: { client_input: { jobs_from_leads: "12 of 20" } }, [ID.LINKS]: { searched_at: "x", places: { "a.test": { state: "live", live_seen_at: "2027-02-01" } } } };
  const q = E.buildMonthlyEmail({ month: "2027-02-01", monthNumber: 3, frozen, client: { business_name: "Sam's" }, playbook: PB.month2plus, tasks: tasksQ });
  if (!q.ok) fail(`10 the letter must build in a quarter month: ${q.why}`);
  else {
    if (!q.quarter || !/This quarter/.test(q.html) || !/reported by you/.test(q.html) || !q.lines.some((l) => /THIS QUARTER/.test(l))) fail("10 a quarter month's letter has a short 'This quarter' block (html and text)");
    if (/—/.test(q.html + q.lines.join(""))) fail("10 no em dash in the letter's quarter block");
  }
  const p = E.buildMonthlyEmail({ month: "2027-01-01", monthNumber: 2, frozen, client: {}, playbook: PB.month2plus, tasks: tasksQ });
  if (p.ok && (p.quarter || /This quarter/.test(p.html))) fail("10 a plain month has no quarter block");
  const open = E.buildMonthlyEmail({ month: "2027-02-01", monthNumber: 3, frozen, client: {}, playbook: PB.month2plus, tasks: {} });
  if (!open.ok || /This quarter/.test(open.html)) fail("10 with every quarter step open the letter still builds, with no quarter block");
  if (fs.existsSync(path.join(SITE, "netlify/functions/send-quarterly-report.js"))) fail("10 there is no separate quarterly report");
  const tm = read("netlify.toml"); if (/^\s*[^#\s].*quarterly[-_]report/mi.test(tm)) fail("10 the quarterly cron stays off");
}

// 11 nothing blocks the close
{
  const close = strip(read("shared/monthly-close.js")) + strip(read("netlify/functions/_monthly-close.js"));
  for (const id of Q.IDS) { if (MC.IDS.includes(id)) fail(`11 the close lists ${id}`); if (new RegExp(`["']${id.replace(/\./g, "\\.")}["']`).test(close)) fail(`11 the close names ${id}: it must not wait on it`); }
  const a = strip(read("admin/admin.js")), blk = a.slice(a.indexOf("const QRT_FN"), a.indexOf("// ── step 64"));
  if (/noSkip: true/.test(blk)) fail("11 every quarter card has 'Skip this step…'");
  if (!/noSkip && !\["done", "skipped", "declined"\]/.test(a)) fail("11 the shared card draws the skip link");
  if (/Mark step complete|Mark complete/.test(blk)) fail("11 no hand tick on the quarter cards");
  if (/blocked|waits on the quarter/i.test(JSON.stringify(Object.values(PB.month2plus.filter((s) => Q.IDS.includes(s.id)).map((s) => s.dependsOn))))) fail("11 nothing depends on the quarter");
  const dep = PB.month2plus.filter((s) => (s.dependsOn || []).some((d) => Q.IDS.includes(d))); if (dep.length) fail(`11 ${dep.map((s) => s.id)} depends on a quarter step`);
}

// 12 wiring
{
  const a = read("admin/admin.js"), ih = read("admin/index.html");
  if (!((/import "\/shared\/monthly-quarter\.js\?v=(\w+)"/.exec(a) || [])[1] >= "20261109b")) fail("12 the admin imports shared/monthly-quarter.js");
  if (!((/monthly-sections\.js\?v=(\w+)/.exec(a) || [])[1] >= "20261109e")) fail("12 monthly-sections.js ?v= bumped (e)");
  if (!(((ih.match(/admin\.js\?v=([0-9a-z]+)/) || [])[1] || "") >= "20261109u")) fail("12 admin.js ?v= bumped (u)");
  for (const fn of ["qrtOutcomesCardHtml", "qrtLinksCardHtml", "qrtProfileCardHtml", "qrtOverlapCardHtml", "qrtWinCardHtml", "qrtVideoCardHtml", "qrtLeadCardHtml"]) if (!new RegExp(`${fn}\\(\\)`).test(a)) fail(`12 the admin draws ${fn}`);
  const ad = read("netlify/functions/admin-monthly-quarter.js"), po = read("netlify/functions/portal-quarter-answer.js");
  if (!/requireWorkspaceForClient/.test(ad)) fail("12 the admin door is RGA's workspace only");
  if (!/requirePortalOwner/.test(po)) fail("12 the client door needs the signed-in owner");
  for (const f of ["netlify/functions/_monthly-quarter.js", "netlify/functions/admin-monthly-quarter.js", "netlify/functions/portal-quarter-answer.js", "shared/monthly-quarter.js"]) {
    const s = strip(read(f));
    if (/gmail|sendMail|nodemailer|sendEmail|send-email/i.test(s)) fail(`12 ${f} must not reach an email sender`);
    const said = s.match(/"[^"\n]{12,}"|`[^`\n]{12,}`/g) || []; if (said.some((x) => /—/.test(x))) fail(`12 ${f}: no em dash in text a person reads`);
  }
  const ca = a.slice(a.indexOf("const QRT_FN"), a.indexOf("// ── step 64")), said = ca.match(/"[^"\n]{12,}"|`[^`\n]{12,}`/g) || []; if (said.some((x) => /—/.test(x))) fail("12 no em dash in the card text");
  if (!read("netlify/functions/_monthly-quarter.js").includes("require(\"../../shared/monthly-quarter.js\")")) fail("12 the server reads the same view module as the admin");
}

// monthly_fix_v2 (11-9): the OLD pieces must be gone too, not only the new ones present (one card per row, the To do for numbered months, Open the month settled, the quarter preview, the bottom blocks)
for (const m of oldChromeFailures(SITE)) fail(m);
if (F.length) { console.error(`❌ ${F.length} problem(s):\n` + F.map((x) => " · " + x).join("\n")); process.exit(1); }
console.log("✅ check-monthly-quarter: seven quarter steps shown only in months 3/6/9/12 (folded otherwise); the link steps merged with no dangling id; 'Not sure' never blocks and is labeled theirs; the finder is capped and once a quarter; a link counts only when seen live; profile changes need the client's yes and are read back; overlap runs itself and names both pages; a story needs the one-tap yes; a video counts only when live; the lead test hides without call tracking; the report gets a short quarter block; nothing blocks the close.");
