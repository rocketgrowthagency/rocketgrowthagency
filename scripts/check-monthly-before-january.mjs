#!/usr/bin/env node
// check-monthly-before-january.mjs — "WHAT'S LEFT BEFORE MONTH 3" (approved monthly_before_january_v1, the owner 11-9). Runs the SHIPPED code against FAKES (no network, no model,
// no email, no search, no Google write). Five parts:
//   1 Tracking still works: "Working · data through <date>" when Analytics still receives ANY events; no forms since the last send is a NEUTRAL line; "Check it" only for
//     (a) no events for 7+ days of the pulled data, (b) contact-page visits with zero form starts; a failed read stays "couldn't check"; RGA's live case reads Working
//   2 The client's yes cards (portal For your approval): attribute / holiday hours / win story call portal-quarter-answer; yes, change them, no; client words, no ids
//   3 Holiday hours: upcoming US holidays in 8 weeks, a suggestion carries the day + closed / same / custom, goes to the client's yes card, then the existing GBP write path
//   4 Posts per month: the client chooses None / 1 / 2 / About 4, saved + read back, RGA's card says it, the drafting asks for only that many
//   5 Links proven live: a place is live ONLY when the page names the business AND links to its website; read weekly; a page that would not open changes nothing
// Exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = [], fail = (m) => F.push(m);
const read = (r) => { try { return fs.readFileSync(path.join(SITE, r), "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
Object.assign(process.env, { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "k", INTERNAL_FN_SECRET: "x" });
globalThis.fetch = async (url) => { throw new Error(`the gate must not touch the network: ${url}`); };
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));
let M, Q, W, MO, MQ, GP, GPR, B, PA, PW;
try {
  M = req("../../shared/monthly-monthly.js"); Q = req("../../shared/monthly-quarter.js"); W = req("../../shared/monthly-weekly.js");
  MO = req("./_monthly-once.js"); MQ = req("./_monthly-quarter.js"); GP = req("./_gbp-posts.js"); GPR = req("./_gbp-profile.js"); B = req("./_citation-build.js");
  PA = req("./portal-quarter-answer.js");
} catch (e) { console.error(`⚠️  INDETERMINATE — a module did not load: ${e.message}`); process.exit(2); }
try { PW = req("./portal-posts-wanted.js"); } catch (e) { PW = null; }   // missing = the part is not built: a failure below, not "can't tell"
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");
const NOW = Date.parse("2026-11-09T14:00:00Z"), MONTH = "2026-11-01", QMONTH = "2027-03-01";

// ── 1 · Tracking still works
try {
  const text = (v) => JSON.stringify([v.label, v.rows]);
  const GA = { through: "2026-11-02", eventsLatest: "2026-11-02", contactVisits: 0, formStarts: 0 };
  // RGA's live case: events through Nov 2, forms last Oct 14, call tracking off
  const rga = M.trackingView({ read: true, forms: { tracked: true, count: 0, lastAt: "2026-10-14" }, calls: { on: false }, ga: GA });
  if (rga.label !== "Working · data through Nov 2" || !rga.done || rga.tone !== "ok") fail(`1 RGA's live case must read "Working · data through Nov 2": ${rga.label} / ${rga.tone}`);
  if (!rga.rows.some((r) => /No form was started or sent since Oct 14/.test(r.title) && r.state === "off")) fail(`1 no forms since the last send is a neutral line naming the date: ${JSON.stringify(rga.rows.map((r) => [r.state, r.title]))}`);
  if (/Check it|none recorded/i.test(text(rga))) fail("1 a quiet month must not say 'Check it' or 'none recorded'");
  if (!/data through Nov 2/.test(rga.label) || !/pulled weekly/.test(JSON.stringify(rga.rows))) fail("1 the card must say how fresh its data is (data through <date>, pulled weekly)");
  // events stopped for a week of the pulled data
  const dead = M.trackingView({ read: true, forms: { tracked: true, count: 0, lastAt: "2026-10-14" }, calls: { on: false }, ga: { ...GA, through: "2026-11-09", eventsLatest: "2026-11-01" } });
  if (dead.label !== "Check it" || dead.done) fail(`1 no events for 7+ days of the data is 'Check it': ${dead.label}`);
  const six = M.trackingView({ read: true, forms: { tracked: true, count: 0, lastAt: "2026-10-14" }, calls: { on: false }, ga: { ...GA, through: "2026-11-08", eventsLatest: "2026-11-03" } });
  if (six.label === "Check it") fail("1 events 5 days before the data's end are still receiving");
  const contact = M.trackingView({ read: true, forms: { tracked: true, count: 0, lastAt: "2026-10-14" }, calls: { on: false }, ga: { ...GA, contactVisits: 6, formStarts: 0 } });
  if (contact.label !== "Check it") fail(`1 contact-page visits with zero form starts is 'Check it': ${contact.label}`);
  const contactOk = M.trackingView({ read: true, forms: { tracked: true, count: 2, lastAt: "2026-11-01" }, calls: { on: false }, ga: { ...GA, contactVisits: 6, formStarts: 2 } });
  if (contactOk.label === "Check it") fail("1 contact-page visits with form starts is not 'Check it'");
  const failed = M.trackingView({ read: false });
  if (failed.label !== "Couldn't check" || failed.done || /Working/.test(text(failed))) fail("1 a failed read stays 'couldn't check'");
  const nodata = M.trackingView({ read: true, forms: { tracked: true, count: 0 }, calls: { on: false }, ga: { through: null, eventsLatest: null, contactVisits: 0, formStarts: 0 } });
  if (nodata.done || /^Working/.test(nodata.label)) fail("1 no data pulled at all is never 'working'");
  // the producer, with the live data shape: Analytics rows by kind
  const rows = [
    { kind: "event", event_name: "video_play", date: "2026-11-02", events: 12, page: "/" }, { kind: "event", event_name: "generate_lead", date: "2026-10-14", events: 1, page: "/contact" },
    { kind: "page", date: "2026-11-02", page: "/", views: 30, sessions: 20 }, { kind: "page", date: "2026-10-30", page: "/contact", views: 0, sessions: 0 },
  ];
  const supa = async (q) => q.startsWith("/client_ga4_daily") ? rows : q.startsWith("/clients?") ? [{ call_tracking_provider: null }] : [];
  const t = await MO.trackingOf({ clientId: "c1", month: MONTH, rec: { row: {} }, now: NOW, d: { supa } });
  const v = M.trackingView(t);
  if (!t.read || !t.ga || t.ga.through !== "2026-11-02" || v.label !== "Working · data through Nov 2") fail(`1 RGA's live data (events through Nov 2, forms last Oct 14) must read Working: ${JSON.stringify(t.ga)} → ${v.label}`);
  // the producer must COUNT contact-page visits and form starts in the last 7 days of the pulled data (a /contact row with views, no form start)
  { const rows2 = [{ kind: "event", event_name: "video_play", date: "2026-11-02", events: 12, page: "/" }, { kind: "page", date: "2026-11-01", page: "/contact", views: 6, sessions: 5 }, { kind: "page", date: "2026-11-02", page: "/", views: 30, sessions: 20 }];
    const supa2 = async (q) => q.startsWith("/client_ga4_daily") ? rows2 : q.startsWith("/clients?") ? [{ call_tracking_provider: null }] : [];
    const tc = await MO.trackingOf({ clientId: "c1", month: MONTH, rec: { row: {} }, now: NOW, d: { supa: supa2 } });
    if (!tc.ga || tc.ga.contactVisits !== 6 || tc.ga.formStarts !== 0 || M.trackingView(tc).label !== "Check it") fail(`1 the producer must count contact-page visits (6 views, no form start = Check it): ${JSON.stringify(tc.ga)}`); }
  const t2 = await MO.trackingOf({ clientId: "c1", month: MONTH, rec: { row: {} }, now: NOW, d: { supa: async (q) => { throw new Error("down"); } } });
  if (t2.read !== false) fail("1 a failed Analytics read is read:false");
  const src = strip(read("shared/monthly-monthly.js"));
  if (/none recorded/.test(src) || /If the business had calls or forms, check the tracking/.test(src)) fail("1 the old 'none recorded … check the tracking' wording must be removed at its producer");
} catch (e) { fail(`crashed: ${e.message}`); }

// ── 2 + 3 · The client's yes cards, holiday hours
const fake = (over = {}) => {
  const f = { store: {}, writes: 0, profileWrites: [] };
  Object.assign(f, {
    now: () => NOW, readStepRecord: async () => ({ tasks: JSON.parse(JSON.stringify(f.store)) }),
    writeStepTasks: async (rec, tasks) => { f.writes++; f.store = JSON.parse(JSON.stringify(tasks)); return { tasks: JSON.parse(JSON.stringify(f.store)) }; },
    monthNumber: async () => 3, businessName: async () => "Sam's Plumbing", websiteOf: async () => "https://samsplumbing.test",
    fiveStarReview: async () => ({ text: "Sam showed up on time and fixed the leak in an hour. Great price and he cleaned up after himself.", stars: 5, author: "J. Lee", at: "2027-02-06T10:00:00Z" }),
    writeProfile: async (id, c) => { f.profileWrites.push(c); return { state: "on_google" }; },
  });
  return Object.assign(f, over);
};
const act = (f, action, body) => MQ.act({ clientId: "c1", month: QMONTH, action, body, deps: f, by: "rga@test" });
const ans = (f, kind, key, answer, note) => MQ.clientAnswer({ clientId: "c1", month: QMONTH, kind, key, answer, note, deps: f });
const PROFILE = Q.ID.PROFILE;
try {
  const hol = Q.usHolidays(Date.parse("2026-11-09T12:00:00Z"), 8).map((h) => `${h.date} ${h.name}`);
  for (const want of ["2026-11-11 Veterans Day", "2026-11-26 Thanksgiving", "2026-12-24 Christmas Eve", "2026-12-25 Christmas Day"]) if (!hol.includes(want)) fail(`3 the next 8 weeks must list ${want}: ${hol.join(", ")}`);
  if (hol.some((h) => /Martin Luther King|Presidents/.test(h))) fail("3 holidays beyond 8 weeks must not be listed");

  const f = fake();
  let r = await act(f, "profile_suggest", { label: "Holiday hours for Dec 25 (Christmas Day)", kind: "hours", value: { date: "2026-12-25", mode: "closed", name: "Christmas Day" } });
  if (!r.ok || !(f.store[PROFILE].profile_changes || []).some((c) => c.kind === "hours" && c.key === "hours:2026-12-25" && c.value && c.value.mode === "closed" && c.state === "suggested")) fail(`3 a holiday-hours suggestion carries its day and mode: ${JSON.stringify(f.store[PROFILE])}`);
  r = await act(f, "profile_suggest", { label: "Holiday hours for Dec 24", kind: "hours", value: { date: "2026-12-24", mode: "custom", open: "09:00", close: "13:00" } });
  if (!r.ok) fail(`3 custom hours are accepted: ${r.error}`);
  r = await act(f, "profile_suggest", { label: "Holiday hours for Dec 31", kind: "hours", value: { date: "2026-12-31", mode: "custom", open: "13:00", close: "09:00" } });
  if (r.ok) fail("3 custom hours that close before they open are refused");
  r = await act(f, "profile_suggest", { label: "Holiday hours", kind: "hours", value: { mode: "closed" } });
  if (r.ok) fail("3 a holiday suggestion with no day is refused");
  r = await act(f, "profile_suggest", { label: "Online appointments", kind: "attribute", key: "has_online_appointments" });
  if (!r.ok) fail("2 an attribute suggestion still works");
  let p = await MQ.clientPending({ clientId: "c1", month: QMONTH, deps: f });
  if (p.changes.length) fail("2 a suggestion that was not sent to the client is not a client card");
  r = await act(f, "profile_send", {});
  p = await MQ.clientPending({ clientId: "c1", month: QMONTH, deps: f });
  if (p.changes.length !== 3 || !p.changes.some((c) => c.kind === "hours" && c.value && c.value.date === "2026-12-24") || !p.changes.some((c) => c.kind === "attribute" && c.label === "Online appointments")) fail(`2 the sent changes reach the client's cards: ${JSON.stringify(p.changes)}`);
  if (/m2\.|m1\./.test(JSON.stringify(p))) fail("2 the client's cards must carry no internal ids");
  { const off = await MQ.clientPending({ clientId: "c1", month: QMONTH, deps: { ...f, monthNumber: async () => 2 } });
    if (off.changes.length || off.win) fail("2 changes already sent to the client must still not show as yes cards outside a quarter month"); }
  // answers
  r = await ans(f, "profile", "hours:2026-12-25", "yes"); if (!r.ok || f.store[PROFILE].profile_changes.find((c) => c.key === "hours:2026-12-25").state !== "approved") fail("2 yes approves the change (read back)");
  r = await ans(f, "profile", "hours:2026-12-24", "change", ""); if (r.ok) fail("2 'Change them' without saying what hours is refused");
  r = await ans(f, "profile", "hours:2026-12-24", "change", "Dec 24 open 9 AM to 2 PM"); const ch = (f.store[PROFILE].profile_changes || []).find((c) => c.key === "hours:2026-12-24");
  if (!r.ok || ch.state !== "changed" || !/9 AM to 2 PM/.test(ch.client_note || "")) fail(`2 'Change them' records the client's hours for RGA: ${JSON.stringify(ch)}`);
  if (!Q.profileView({ task: f.store[PROFILE] }).rows.some((x) => /9 AM to 2 PM/.test(x.line || ""))) fail("2 RGA's card shows the hours the client wants");
  r = await ans(f, "profile", "has_online_appointments", "no"); if (!r.ok || f.store[PROFILE].profile_changes.find((c) => c.key === "has_online_appointments").state !== "declined") fail("2 no settles it (declined)");
  if (f.profileWrites.length) fail("2 nothing is written to Google before RGA applies the approved changes");
  r = await act(f, "profile_apply", {});
  if (f.profileWrites.length !== 1 || f.profileWrites[0].key !== "hours:2026-12-25" || f.store[PROFILE].profile_changes.find((c) => c.key === "hours:2026-12-25").state !== "readback") fail(`3 only the approved holiday goes through the existing write path and is read back: ${JSON.stringify(f.profileWrites.map((c) => c.key))}`);
  // the existing write path: a closed day and a custom-hours day are built on what Google shows now (the weekly hours ride along)
  const so = GPR.specialFromAnswer({ holidays: [], oneOffs: [{ from: "2026-12-25", label: "Christmas Day" }], specialOpen: [{ date: "2026-12-24", open: "09:00", close: "13:00" }] }, new Date(NOW));
  if (!so.some((x) => x.closed && x.startDate.day === 25) || !so.some((x) => x.closed === false && x.openTime.hours === 9 && x.closeTime.hours === 13 && x.startDate.day === 24)) fail(`3 closed and custom special hours are both sent: ${JSON.stringify(so)}`);
  // a holiday on custom hours counts only when Google SHOWS that day open with those times (read back); a Google that drops it is not "on_google"
  for (const [keeps, want] of [[true, "on_google"], [false, "with_rga"]]) {
    let sh = { specialHourPeriods: [] }, rh = null;
    const fetchG = async (url, init = {}) => { const ok = (j) => ({ ok: true, status: 200, json: async () => j });
      if (init.method === "PATCH") { const b = JSON.parse(init.body); if (b.regularHours) rh = b.regularHours; if (b.specialHours) sh = { specialHourPeriods: b.specialHours.specialHourPeriods.filter((x) => keeps || x.closed) }; return ok({}); }
      return ok({ regularHours: rh, specialHours: sh }); };
    const val = { days: { mon: { open: "09:00", close: "17:00" } }, holidays: [], oneOffs: [], specialOpen: [{ date: "2026-12-24", open: "09:00", close: "13:00" }] };
    const res = await GPR.applyForStep(GPR.STEP.HOURS, val, { fetch: fetchG, token: "t", loc: "locations/1", now: NOW });
    if (res.state !== want) fail(`3 custom holiday hours ${keeps ? "Google kept" : "Google dropped"} must read ${want}, got ${res.state}`);
  }
  // the win story
  const g = fake(); r = await act(g, "win_draft", {});
  p = await MQ.clientPending({ clientId: "c1", month: QMONTH, deps: g });
  if (!r.ok || !p.win || !p.win.draft || p.win.author !== "J. Lee" || !/Sam showed up/.test(p.win.source)) fail(`2 the win story reaches the client with its review source: ${JSON.stringify(p.win)}`);
  r = await ans(g, "win", "", "yes"); p = await MQ.clientPending({ clientId: "c1", month: QMONTH, deps: g });
  if (!r.ok || g.store[Q.ID.WIN].win.answer !== "yes" || p.win) fail("2 yes on the story is recorded and the card clears");
  const nq = fake({ monthNumber: async () => 2 }); p = await MQ.clientPending({ clientId: "c1", month: QMONTH, deps: nq });
  if (p.changes.length || p.win) fail("2 no yes cards outside a quarter month");
  // the door: signed-in client, pending is read only
  let denied = false;
  PA.__useDeps({ ...g, gate: { error: { statusCode: 403, body: "{}" } } });
  const dres = await PA.handler({ httpMethod: "POST", body: JSON.stringify({ client_id: "11111111-1111-1111-1111-111111111111", kind: "pending" }) }); denied = dres.statusCode === 403;
  if (!denied) fail("2 portal-quarter-answer must keep the signed-in client door for the pending read");
  PA.__useDeps({ ...fake({ monthNumber: async () => 3 }), gate: {} });
  const pres = await PA.handler({ httpMethod: "POST", body: JSON.stringify({ client_id: "11111111-1111-1111-1111-111111111111", kind: "pending", month: QMONTH }) });
  if (pres.statusCode !== 200 || JSON.parse(pres.body).ok !== true) fail(`2 the pending read answers: ${pres.statusCode}`);
  PA.__useDeps(null);

  // the portal: the cards exist, in the client's words, and call the existing function
  const po = strip(read("portal/portal.js")), at = po.indexOf("function quarterYesHtml"), cards = at < 0 ? "" : po.slice(at, po.indexOf("async function quarterYesCall"));
  if (!cards) fail("2 portal.js has no yes cards (quarterYesHtml)");
  for (const w of ['Add "', "to your Google profile?", "Holiday hours for", "Can we share this story?", "Yes, add it", "Yes, these are right", "Change them", "Yes, share it", ">No<"]) if (cards && !cards.includes(w)) fail(`2 the yes cards must say "${w}"`);
  if (cards && /m2\.|m1\.|profile_changes|\.key\b.*head/.test(cards.replace(/data-qy-keys/g, ""))) fail("2 the yes cards must carry no internal ids in client words");
  if (cards && /—/.test(cards)) fail("2 no em dash in client-facing text");
  if (!/\/\.netlify\/functions\/portal-quarter-answer["'`]/.test(po) || !/kind: "pending"/.test(po)) fail("2 the portal must call portal-quarter-answer (pending + answers)");
  if (!/paintQuarterYes\(clientId, host\)/.test(po)) fail("2 the yes cards must be painted in For your approval (loadApprovals)");
  const ad = strip(read("admin/admin.js"));
  for (const w of ["Holiday hours", "data-qrt-hday", "data-qrt-hmode", "Send to the client", "usHolidays"]) if (!ad.includes(w)) fail(`3 the admin Suggest a change must have ${w}`);
  if (/Holiday hours are added from the client's profile step/.test(ad) || /"Send for approval"/.test(ad.slice(ad.indexOf("function qrtProfileCardHtml"), ad.indexOf("function qrtOverlapCardHtml")))) fail("3 the old holiday-hours refusal and 'Send for approval' wording must be removed at the producer");
} catch (e) { fail(`crashed: ${e.message}`); }

// ── 4 · Posts per month
try {
  const rec = (n, month = MONTH) => ({ reporting_month: month, data: { tasks: { "m2.exec.gbp_posts": n === undefined ? {} : { posts_wanted: n } } } });
  const sup = (rows) => async () => rows;
  for (const [n, want] of [[0, 0], [1, 1], [2, 2], [4, 4]]) { const got = await GP.postsWantedOf(sup([rec(n)]), "c1", MONTH); if (got !== want) fail(`4 posts_wanted ${n} must read back ${want}: ${got}`); }
  if (await GP.postsWantedOf(sup([rec(undefined)]), "c1", MONTH) !== 4) fail("4 nothing chosen means about 4 (the recommended)");
  if (await GP.postsWantedOf(sup([rec(undefined), rec(2, "2026-10-01")]), "c1", MONTH) !== 2) fail("4 a month with no choice keeps the client's last choice");
  if (await GP.postsWantedOf(sup([rec(3)]), "c1", MONTH) !== 4) fail("4 a value that is not none / 1 / 2 / 4 is ignored");
  let bad = false; try { await GP.postsWantedOf(async () => null, "c1", MONTH); } catch { bad = true; }
  if (!bad) fail("4 a failed read must not read as 'the client wants 4'");
  if (!PW) fail("4 portal-posts-wanted.js is missing");
  else {
    const store = { tasks: { "m2.exec.gbp_posts": { status: "pending" } } };
    const d = { now: () => NOW, gate: {}, supa: async (q) => (q.startsWith("/client_monthly_records") ? [{ reporting_month: MONTH, data: { tasks: store.tasks } }] : q.startsWith("/client_onboarding_records") ? [{ id: "ob", data: { tasks: {} } }] : []) };
    // the step-record layer writes through supa PATCH; give it a recording store
    d.supa = async (q, init = {}) => {
      if (init.method === "PATCH") { const body = JSON.parse(init.body); if (d.dropWrite) return [{ data: { tasks: store.tasks } }]; store.tasks = body.data.tasks; return [{ data: body.data }]; }
      if (q.startsWith("/client_monthly_records")) return [{ id: "mr", reporting_month: MONTH, data: { tasks: store.tasks } }];
      if (q.startsWith("/client_onboarding_records")) return [{ id: "ob", data: { tasks: {} } }];
      if (q.startsWith("/clients_monthly_status") || q.includes("month_status")) return [];
      return [];
    };
    PW.__useDeps(d);
    const call = (b) => PW.handler({ httpMethod: "POST", body: JSON.stringify({ client_id: "11111111-1111-1111-1111-111111111111", ...b }) });
    let res = await call({ wanted: 2 }), j = JSON.parse(res.body);
    if (res.statusCode !== 200 || j.wanted !== 2 || store.tasks["m2.exec.gbp_posts"].posts_wanted !== 2 || store.tasks["m2.exec.gbp_posts"].posts_wanted_by !== "client") fail(`4 the client's choice is saved on their record and read back: ${res.statusCode} ${res.body}`);
    res = await call({ wanted: 3 }); if (res.statusCode === 200) fail("4 a choice that is not none / 1 / 2 / about 4 is refused");
    d.dropWrite = true; res = await call({ wanted: 1 }); if (res.statusCode === 200) fail("4 a save that did not read back must not say it saved"); d.dropWrite = false;
    PW.__useDeps(null);
  }
  const v2 = W.postsView({ task: { posts_wanted: 2, status: "pending" }, month: MONTH, now: NOW, skips: {} }), v0 = W.postsView({ task: { posts_wanted: 0 }, month: MONTH, now: NOW, skips: {} });
  if (!v2.rows.some((r) => /2 a month, the client's choice/.test(r.title)) || v2.total !== 2) fail(`4 RGA's posts card shows "2 a month, the client's choice" and plans 2: ${JSON.stringify(v2.rows.map((r) => r.title))} total ${v2.total}`);
  if (!v0.rows.some((r) => /None this month, the client's choice/.test(r.title)) || v0.total !== 0) fail("4 a client who chose none sees 'None', and nothing is expected");
  const fx = strip(read("netlify/functions/flow-execute.js")), at = fx.indexOf('"m2.exec.gbp_posts": async'), run = fx.slice(at, at + 4500);
  if (!/postsWantedOf\(/.test(run) || !/\$\{wantedN\}/.test(run) || /Draft 4 Google Business Profile posts/.test(run)) fail("4 the drafting must ask for only the number of posts the client chose (not a fixed 4)");
  if (!/wantedN === 0/.test(run)) fail("4 a client who chose none gets nothing drafted");
  const po = strip(read("portal/portal.js"));
  for (const w of ["How many Google posts a month?", "About 4 (recommended)", "portal-posts-wanted", "data-posts-wanted"]) if (!po.includes(w)) fail(`4 the portal's Google posts card must have ${w}`);
} catch (e) { fail(`crashed: ${e.message}`); }

// ── 5 · Links proven live by reading the page
try {
  const site = "https://samsplumbing.test";
  const named = (extra) => `<html><title>Members</title><body><h1>Sam's Plumbing</h1><p>Plumber in Austin</p>${extra}</body></html>`;
  const yes = (h) => MQ.linksToSite(h, site);
  if (!yes('<a href="https://www.samsplumbing.test/about">Sam</a>') || !yes("<a class='x' href='http://samsplumbing.test'>site</a>")) fail("5 a link to the business's website is seen");
  if (yes('<a href="https://other.test/samsplumbing.test">x</a>') || yes("<p>samsplumbing.test</p>") || yes('<a href="/local">x</a>') || yes('<a href="https://samsplumbing.test.evil.test/">x</a>')) fail("5 only a real link to the website counts (not text, not another host, not a relative link)");
  const pages = { "https://a.test/p": named('<a href="https://samsplumbing.test">website</a>'), "https://b.test/p": named("<p>No link</p>"), "https://c.test/p": "<html><body><a href=\"https://samsplumbing.test\">a plumber</a></body></html>", "https://d.test/p": null };
  const places = (over = {}) => ({ "a.test": { state: "asked", url: "https://a.test/p", name: "Chamber", asked_at: "2026-11-02T10:00:00Z", ...over.a }, "b.test": { state: "asked", url: "https://b.test/p", name: "Journal", asked_at: "2026-11-02T10:00:00Z", ...over.b },
    "c.test": { state: "asked", url: "https://c.test/p", asked_at: "2026-11-02T10:00:00Z", ...over.c }, "d.test": { state: "asked", url: "https://d.test/p", asked_at: "2026-11-02T10:00:00Z", ...over.d }, "e.test": { state: "drafted", url: "https://a.test/p", ask: "x" } });
  const f = fake({ readPage: async (u) => { f.pageReads = (f.pageReads || 0) + 1; return pages[u] ? { status: 200, html: pages[u] } : { status: 0, html: "" }; }, pageNames: B.pageNames });
  f.store = { [Q.ID.LINKS]: { places: places() } };
  const r = await MQ.linksRead({ clientId: "c1", month: QMONTH, deps: f }), pl = f.store[Q.ID.LINKS].places;
  if (pl["a.test"].state !== "live" || !pl["a.test"].live_seen_at || !pl["a.test"].read_at) fail(`5 a page that names the business AND links to its website is live: ${JSON.stringify(pl["a.test"])}`);
  if (pl["b.test"].state !== "asked" || pl["b.test"].live_seen_at || !pl["b.test"].read_at) fail(`5 a page that names the business with no link is NOT live (read, still asked): ${JSON.stringify(pl["b.test"])}`);
  if (pl["c.test"].state !== "asked" || pl["c.test"].live_seen_at) fail("5 a page that links but does not name the business is NOT live");
  if (pl["d.test"].state !== "asked" || pl["d.test"].read_at) fail("5 a page that would not open changes nothing (never 'no link')");
  if (pl["e.test"].state !== "drafted") fail("5 a place that was never asked is not read");
  if (r.live !== 1 || r.still !== 2 || r.failed !== 1) fail(`5 the run counts what it read: ${JSON.stringify(r)}`);
  const before = f.pageReads; f.store[Q.ID.LINKS].places["b.test"].read_at = new Date(NOW - 2 * 86400000).toISOString();
  await MQ.linksRead({ clientId: "c1", month: QMONTH, deps: f });
  if (f.pageReads - before !== 1) fail(`5 a page read within the week is not read again; only the one that never opened is retried: ${f.pageReads - before} reads`);
  const old = fake({ readPage: async () => ({ status: 200, html: pages["https://b.test/p"] }), pageNames: B.pageNames }); old.store = { [Q.ID.LINKS]: { places: { "b.test": { state: "asked", url: "https://b.test/p", read_at: new Date(NOW - 8 * 86400000).toISOString() } } } };
  const r2 = await MQ.linksRead({ clientId: "c1", month: QMONTH, deps: old }); if (r2.read !== 1) fail("5 a page last read 8 days ago is read again");
  const noSite = fake({ websiteOf: async () => null, readPage: async () => ({ status: 200, html: pages["https://a.test/p"] }), pageNames: B.pageNames }); noSite.store = { [Q.ID.LINKS]: { places: places() } };
  await MQ.linksRead({ clientId: "c1", month: QMONTH, deps: noSite }); if (Object.values(noSite.store[Q.ID.LINKS].places).some((p) => p.state === "live")) fail("5 with no website on file nothing is marked live");
  // the morning run reads them: settle() calls it
  const s = fake({ gscRows: async () => null, videoLive: async () => null, readPage: async (u) => ({ status: 200, html: pages["https://a.test/p"] }), pageNames: B.pageNames }); s.store = { [Q.ID.LINKS]: { places: { "a.test": { state: "asked", url: "https://a.test/p" } } } };
  const so = await MQ.settle({ clientId: "c1", month: QMONTH, deps: s });
  if (!so.links || so.links.live !== 1 || s.store[Q.ID.LINKS].places["a.test"].state !== "live") fail(`5 the morning run's settle reads the asked pages: ${JSON.stringify(so.links)}`);
  // the card's words
  const v = Q.linksView({ task: { searched_at: "2027-01-05T10:00:00Z", places: { "x.test": { state: "live", name: "Culver City Chamber of Commerce", live_seen_at: "2027-01-12T09:00:00Z", read_at: "2027-01-12T09:00:00Z" }, "y.test": { state: "asked", name: "Westside Business Journal", asked_at: "2027-01-05T09:00:00Z", read_at: "2027-01-12T09:00:00Z" } } } });
  const lines = v.rows.map((r) => `${r.title} | ${r.line}`).join("\n");
  if (!/Culver City Chamber of Commerce \| Live · the page names the business and links to its website · read Jan 12/.test(lines)) fail(`5 the live line: ${lines}`);
  if (!/Westside Business Journal \| Asked Jan 5 · no link on the page yet · read again weekly/.test(lines)) fail(`5 the asked line: ${lines}`);
  if (/Link seen live|Asked, waiting/.test(strip(read("shared/monthly-quarter.js")))) fail("5 the old 'Link seen live' / 'Asked, waiting' wording must be removed at the producer");
  const nm = MQ.defaultDeps.toString(); if (!/readPage/.test(nm) || !/B\.pageNames/.test(nm)) fail("5 the live deps must reuse the free page read and pageNames from _citation-build");
  if (/serpSearch|search\(/.test(MQ.linksRead.toString())) fail("5 reading a page must be free: no search");
} catch (e) { fail(`crashed: ${e.message}`); }

if (F.length) { console.log(`🔴 check-monthly-before-january: ${F.length} problem(s)`); for (const m of F) console.log(" - " + m); process.exit(1); }
console.log("✅ check-monthly-before-january: RGA's live tracking case reads Working with its data date, a quiet month is a neutral line and 'Check it' needs evidence; the client's yes cards (attribute, holiday hours, win story) call portal-quarter-answer and the holiday goes through the existing write path; the client's posts-per-month choice is saved, read back, shown and drafted to; a link is live only when the page names the business and links to its website");
