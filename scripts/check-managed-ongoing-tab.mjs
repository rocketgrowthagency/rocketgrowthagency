#!/usr/bin/env node
// check-managed-ongoing-tab.mjs — a MANAGED client's Ongoing work tab, DRAWN (approved 11-5, "approved. go live": ongoing_overview_v1 ·
// ongoing_step08_customers_v1 · ongoing_step09_numbers_v1 · ongoing_step10_photos_v1 · ongoing_step11_video_v1 · ongoing_step12_call_v1 ·
// ongoing_win_story_v1), plus the monthly report's month (send-monthly-report picks the month just ended).
//
// BOOTS THE REAL PORTAL (scripts/lib/portal-boot-harness.mjs: the real portal.js + portal.css + shared/*, our fake database, every function
// answered and recorded, nothing leaves the laptop) on a fixed clock, and reads what the client sees. Invented clients; nothing keys on a name.
// HOLDS, for a MANAGED client:
//   SETUP · the empty reviews card is GREY with "From Google, today" green and "Your first ones come from Setup step 5 · 1 of 5 customers asked
//     so far · Go to step 5" (the press lands on Setup's step 5); step 8 is HELD (no customer-list row) inside ONE grey "Starts after setup"
//     card: "Month 1 ends about <kickoff + 30>", the lines 8 to 12 with their managed numbers in the approved words, "Done by RGA this month"
//     (posts, replies, what we watched, "Emailed on the 5th." — never "the month just ended"), "Nothing here needs you yet."
//   SETUP, step 5 done · the customer list row opens, "due Mon Nov 9" (the period's Monday, never last list + 7), no "(you chose)" without a
//     saved cadence; the reviews card points to step 8
//   MONTHLY (November) · rows 8, 10, 12 in order; 9 and 11 fold into ONE grey "Not due this month" list with their next date; "Send a video now"
//     opens step 11's link field; no win-story row of its own, "Send it in writing instead" opens its form; step 8 "Who did you finish jobs
//     for?" · "due Mon Nov 9 · weekly", "No jobs this week" posts the answer and the row reads "No jobs to ask about this week"; Pause posts its
//     date and reads "Paused until …" with "Start again now"; a stopped customer typed again is left off and named; a request the server marks
//     stopped_before reads "<name> asked you to stop on …" with "Remove <name>"; step 10 "Suggested", "When you have new ones", no quota, no
//     "usually the same day"; step 12 waits on "your October report · about Nov 5", then "Your report didn't go out on the 5th · RGA is on it";
//     ONE "Done by RGA this month" panel is the LAST thing on the tab, an approval waiting is one amber line at its top, See opens a line
//   FOLDS (ongoing_overview_v1 "Once Monthly starts") · in a normal month 8, 10 and 12 draw FOLDED (one header line: pill, title, +); + opens one
//     and leaves the others; an opened card stays open on a redraw; "Go to step 8" lands on it open; the story and video folds draw their row
//     open; only a LATE row (step 8's missed list) opens on its own; self-serve keeps today's open cards
//   STEP 8'S REQUEST LINES (ongoing_step08_customers_v1) · plain lines, never today's avatar rows: "Maria · water heater / asked Nov 10 · remind
//     once from Nov 13" + They reviewed · They asked me to stop (11-5 fix: on every asked row; Remind once only when due), "Dev · drain cleaning / asked Nov 9" + Remind Dev once · They reviewed · They asked me to stop + Read the
//     reminder, "Sam · new faucet / RGA wrote the request" + Send it (opens Text Sam + I sent it), "Dana · asked not to be contacted / No reminder
//     goes to Dana" + the day; sent: "Maria · reviewed ★ / you said so Nov 14", "Dev · asked · reminded Nov 12" + the day asked; the controls
//     still post their mark and say so
//   JANUARY · step 9 is due: "For Oct – Dec", "2 numbers · about a minute"
//   NOT MANAGED (self-serve, no mode) · today's tab: its own "Starts after setup" lines, no managed words, no panel
//   THE SENDER · pickReportRecords takes the month just ended (never the newest record), a resend's named month, and nothing when that month has
//     no record; the handler uses it
// exit 0 holds · 1 a drawn page is wrong · 2 can't tell (no browser / the page didn't boot)
import fs from "node:fs";
import { createRequire } from "node:module";
import { bootPortal, HarnessUnavailable, SITE, CID } from "./lib/portal-boot-harness.mjs";
import { SCENARIOS, RGA_CARD_TASKS } from "./lib/managed-portal-scenarios.mjs";

const F = [], fail = (m) => F.push(m);
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
const KICKOFF = "2026-10-09T16:11:50Z";   // Month 1 ends about Nov 8
const NOV4 = "2026-11-04T15:00:00Z", NOV6 = "2026-11-06T15:00:00Z", JAN7 = "2027-01-07T15:00:00Z";
const asked = (name, phone, at, extra = {}) => ({ first_name: name, phone, service_done: "drain cleaning", marked_sent_by_client: true, marked_sent_at: at, ...extra });
const LIST_OCT26 = { id: "l1", client_id: CID, workspace_id: "w1", week_label: "Week of October 26", created_at: "2026-10-26T19:59:53Z", customer_count: 1, customers: [asked("Maria", "5550100000", "2026-10-26T20:01:48Z")] };
const LIST_STOP = { id: "l0", client_id: CID, workspace_id: "w1", week_label: "Week of October 5", created_at: "2026-10-05T15:00:00Z", customer_count: 1, customers: [asked("Dana", "(720) 555-0199", "2026-10-05T15:05:00Z", { stopped: true, stopped_at: "2026-10-03T12:00:00Z" })] };
const EMPTY_REVIEWS = { ok: true, scope: "reviews", feed: { reviews: [], count: 0, rating: null, new_30d: 0, gap_days: null, checked_at: "2026-11-04T11:00:00Z", stale: false }, google: { status: "ok" }, matches: [], profile_url: null, replies: null };
const VALUE = { ok: true, in_progress: true, month_name: "November", lines: [{ text: "Your Google profile: checked nightly, nothing changed", when: "2026-11-04T10:00:00Z", mark: "ok" }] };
const baseTasks = (over = {}) => ({ ...SCENARIOS.allDone.tasks, ...RGA_CARD_TASKS, "m1.kickoff.call": { status: "done", completed_at: KICKOFF, completed_by: "client" }, "m1.review.first_5": { status: "pending" }, ...over });
const md = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

async function open(mode, { stage = "stage_4_onboarding", clock = NOV4, tasks = baseTasks(), lists = [LIST_OCT26], monthly = [], onboarding = {}, photos = [], fns = {} } = {}) {
  const calls = [];
  const h = await bootPortal({ mode, stage, clock, tasks, onboarding, tables: { client_customer_lists: lists, client_monthly_records: monthly, client_photos: photos },
    fns: { "portal-review-requests": (b) => (b && b.scope === "reviews" ? EMPTY_REVIEWS : { ok: true, requests: [], has_review_link: true }), "portal-monthly-value": () => VALUE,
      "portal-review-cadence": (b) => { calls.push(b); return b.action === "no_jobs" ? { ok: true, action: "no_jobs", review_list_no_jobs: [{ start: b.start, at: clock }], review_list_pause: null }
        : b.action === "pause" ? { ok: true, action: "pause", review_list_no_jobs: [], review_list_pause: { until: b.until, at: clock } } : { ok: true, action: "resume", review_list_no_jobs: [], review_list_pause: null }; },
      ...fns } });
  h.cadenceCalls = calls;
  try { await h.ready("[id^='action-items-list-'] .pm-step-row", 30000); } catch { await h.close(); throw new HarnessUnavailable(`the portal never drew its list (${h.errs[0] || "no error"})`); }
  await h.page.evaluate(() => document.querySelector(".portal-nav a[data-view=ongoing]")?.click());
  await tick(1800);
  return h;
}
const TAB = "([...document.querySelectorAll('.pv-ongoing .pm-og')].find((x) => x.offsetParent !== null) || document.querySelector('.pv-ongoing .pm-og'))";
const tabText = (h) => h.page.evaluate(`(() => { const t = ${TAB}; return t ? t.innerText.replace(/\\s+/g, " ").trim() : ""; })()`);
const settle = async (h) => { let last = await tabText(h), same = 0; for (let i = 0; i < 30 && same < 3; i++) { await tick(250); const now = await tabText(h); same = now === last ? same + 1 : 0; last = now; } return last; };
const rowText = (h, id) => h.page.evaluate(`(() => { const t = ${TAB}; const r = t && t.querySelector('[id="step-row-${id}"]'); return r ? r.innerText.replace(/\\s+/g, " ").trim() : null; })()`);
// the words as read, case aside (a pill is uppercase on screen); a step's number disc sits against its title ("8This week's…")
// a step row's fold: collapsed, its head's aria-expanded, the + / – it shows, whether its pill and title read, and whether any body shows
const foldsOf = (h) => h.page.evaluate(`(() => { const t = ${TAB}; const o = {}; for (const r of t.querySelectorAll('.pm-step-row[id^="step-row-"]')) { if (r.closest('[hidden]') || r.closest('.pm-og-bare')) continue;
  const hd = r.querySelector(':scope > .pm-step-row-head'); const body = [...r.children].filter((c) => c !== hd && c.offsetParent !== null && c.innerText.trim()).length;
  o[r.id.replace("step-row-", "")] = { collapsed: r.classList.contains("is-collapsed"), aria: hd && hd.getAttribute("aria-expanded"), chev: ((hd && hd.querySelector(".pm-step-chev")) || {}).textContent, pills: !!(hd && hd.querySelector(".pm-pill")), title: ((hd && hd.querySelector(".pm-step-title")) || {}).textContent || "", body }; } return o; })()`);
// open a folded row by pressing its header, as the client does (never toggles an open one shut)
const openRow = async (h, id) => { await h.page.evaluate(`(() => { const r = ${TAB}.querySelector('[id="step-row-${id}"]'); if (r && r.classList.contains("is-collapsed")) r.querySelector('[data-step-toggle], [data-og-toggle]').click(); })()`); await tick(250); };
// step 8's request lines as drawn: their words, mark, right-hand link or date, buttons; and whether today's avatar rows are still there
const rqLines = (h) => h.page.evaluate(`(() => { const r = ${TAB}.querySelector('[id="step-row-m2.exec.review_push"]'); if (!r) return { lines: [], avatars: false };
  return { avatars: !!r.querySelector('.pm-rv-c, .pm-rv-av, .pm-rv-ready'), lines: [...r.querySelectorAll('[data-review-requests] .pm-og-rq')].map((l) => ({ text: l.innerText.replace(/\\s+/g, " ").trim(),
    mark: (l.querySelector('.pm-og-mk') || { className: "" }).className.replace("pm-og-mk", "").trim(), link: ((l.querySelector(':scope > .pm-og-a') || {}).textContent || ""), dt: ((l.querySelector(':scope > .pm-og-dt') || {}).textContent || ""),
    btns: [...l.querySelectorAll('.pm-og-mv .pm-og-b, .pm-r5-q .pm-r5-lnk')].map((b) => b.textContent + (b.classList.contains("go") ? "*" : "")), read: !!l.querySelector('details.pm-og-rd > summary'), top: l.classList.contains("is-top"),
    pad: getComputedStyle(l).padding, size: getComputedStyle(l).fontSize })) }; })()`);
const has = (t, w, label) => { if (!String(t || "").toLowerCase().includes(w.toLowerCase())) fail(`${label}: missing "${w}"`); };
const hasNot = (t, w, label) => { if (String(t || "").toLowerCase().includes(w.toLowerCase())) fail(`${label}: shows "${w}"`); };

try {
  // ── SETUP, step 5 not done ─────────────────────────────────────────────────────────────────────────────
  {
    const h = await open("managed");
    try {
      const t = await settle(h), L = "managed Setup";
      for (const w of ["From Google, today", "No reviews on Google yet", "Your first ones come from Setup step 5", "1 of 5 customers asked so far", "Go to step 5", "New reviews show here the morning after they're posted.",
        "Starts after setup", "Month 1 ends about Nov 8", "Your part · your steps",
        "8This week's customer list Opens once Setup step 5 is done (1 of 5 asked). RGA writes each request; you tap send. Weekly · due Mondays",
        "9Your numbers Two numbers, about a minute. “Not sure” is a fine answer. Every 3 months", "10New photos When you have them. No monthly quota. Suggested",
        "11A video this quarter From RGA's script, about 60 seconds on your phone. Every 3 months · optional",
        "12Monthly check-in call Your report first, then about 20 minutes on Google Meet. Bring one job you're proud of. Every month",
        "Done by RGA this month", "Google posts RGA writes 4. Nothing posts until you approve. Every month", "Review replies RGA drafts each one. You approve it first. As reviews come in",
        "What we watched Your Google profile, website, speed and leads, from the checks that really ran. Every month", "Your monthly report Emailed on the 5th. Every month", "Nothing here needs you yet."]) has(t, w, L);
      for (const w of ["month just ended", "A customer win story", "A short video", "Your check-in call", "(you chose)", "5 new photos", "Your review requests are how the first ones come in"]) hasNot(t, w, L);
      const look = await h.page.evaluate(`(() => { const t = ${TAB}; const rv = t.querySelector('#step-row-og-reviews'); const card = rv && rv.querySelector('.pm-cs-card'); const pill = rv && rv.querySelector('.pm-pill');
        return { cust: !!t.querySelector('#step-row-og-customers'), cardTone: card && card.className, rowTone: rv && rv.className, pill: pill && pill.className, cards: t.querySelectorAll(':scope > .pm-cs .pm-cs-card').length, nos: [...t.querySelectorAll('.pm-og-lr .no')].map((n) => n.textContent) }; })()`);
      if (look.cust) fail(`${L}: step 8's customer list is drawn while Setup step 5 isn't done (it's held)`);
      if (!/\boff\b/.test(look.cardTone || "") || /\byou\b/.test(look.cardTone || "") || !/cs-wait/.test(look.rowTone || "")) fail(`${L}: the empty reviews card isn't grey (card ${look.cardTone}, row ${look.rowTone})`);
      if (!/\bdone\b/.test(look.pill || "")) fail(`${L}: "From Google, today" isn't the green pill (${look.pill})`);
      if (look.cards !== 1) fail(`${L}: "Starts after setup" isn't ONE card (${look.cards})`);
      if (look.nos.join(",") !== "8,9,10,11,12") fail(`${L}: the step numbers read ${look.nos.join(",")}; approved 8,9,10,11,12 (managed numbering)`);
      await h.page.evaluate(`(() => { const t = ${TAB}; t.querySelector('#step-row-og-reviews [data-portal-goto]')?.click(); })()`); await tick(1200);
      const went = await h.page.evaluate(() => { const r = document.getElementById("step-row-m1.review.first_5"); return { setup: !!document.querySelector(".pv-setup") && getComputedStyle(document.querySelector(".pv-setup")).display !== "none", row: !!r && r.offsetParent !== null }; });
      if (!went.setup || !went.row) fail(`${L}: "Go to step 5" doesn't land on Setup step 5 (${JSON.stringify(went)})`);
      if (h.errs.length) fail(`${L}: page errors ${h.errs.slice(0, 2).join(" · ")}`);
    } finally { await h.close(); }
  }
  // ── SETUP, step 5 done: step 8 opens; its due day is the period's ────────────────────────────────────────
  {
    const h = await open("managed", { tasks: baseTasks({ "m1.review.first_5": { status: "done", completed_at: "2026-10-30T12:00:00Z" } }) });
    try {
      const t = await settle(h), L = "managed Setup, step 5 done";
      const r = await rowText(h, "og-customers");
      if (!r) fail(`${L}: step 8's customer list isn't drawn once Setup step 5 is done`);
      else { has(r, "due Mon Nov 9", L); hasNot(r, "(you chose)", L); hasNot(r, "due Mon Nov 2", L); has(r, "Nov 2 – Nov 8", L); }
      hasNot(t, "Opens once Setup step 5 is done", L);
      has(t, "Your first ones come from step 8", L);
      // 11-5 walk: "No jobs this week" saved, but this row (on the Ongoing tab, which the Setup redraw never touches) kept asking and its button spun forever
      await h.page.evaluate(`(() => ${TAB}.querySelector('#step-row-og-customers [data-rc-nojobs]')?.click())()`); await tick(1200);
      if (!h.cadenceCalls.some((c) => c.action === "no_jobs")) fail(`${L}: "No jobs this week" posted nothing`);
      const nj = await rowText(h, "og-customers");
      for (const w of ["No list this week", "No jobs to ask about this week", "Next list due Mon Nov 9. No reminder goes out for this week.", "Add a customer after all"]) has(nj || "", w, `${L} after No jobs`);
      for (const w of ["Saving", "Who did you finish jobs for?"]) hasNot(nj || "", w, `${L} after No jobs`);
      // 11-6, the owner's screenshot: "Add a customer after all" opened the form with "Send my list" flush under its card (0px; every card's controls sit 12px under it)
      await h.page.evaluate(`(() => ${TAB}.querySelector('#step-row-og-customers [data-og-add]')?.click())()`); await tick(400);
      const gap = await h.page.evaluate(`(() => { const f = ${TAB}.querySelector('#step-row-og-customers .pm-og-addf:not([hidden])'); const a = f && f.querySelector(':scope > .pm-k5-acts'), k = a && a.previousElementSibling;
        return a && k && a.offsetParent !== null ? Math.round(a.getBoundingClientRect().top - k.getBoundingClientRect().bottom) : null; })()`);
      if (gap === null) fail(`${L}: "Add a customer after all" didn't open the form with its Send my list`);
      else if (gap < 12) fail(`${L}: "Send my list" sits ${gap}px under its card after "Add a customer after all" (12px, like every card's controls)`);
    } finally { await h.close(); }
  }
  // a saved cadence says so, with its day
  {
    const h = await open("managed", { tasks: baseTasks({ "m1.review.first_5": { status: "done" } }), onboarding: { review_cadence: { value: "weekly", at: "2026-10-28T12:00:00Z" } } });
    try { const r = await rowText(h, "og-customers"); if (!r || !r.includes("weekly (you chose Oct 28)") || !r.includes("No jobs this week")) fail(`managed Setup: a saved cadence doesn't read "(you chose Oct 28)" (${(r || "").slice(0, 160)})`); }
    finally { await h.close(); }
  }
  // ── MONTHLY, November ────────────────────────────────────────────────────────────────────────────────────
  const NOV_REC = (tasks = {}) => [{ id: "mr11", client_id: CID, workspace_id: "w1", reporting_month: "2026-11-01", data: { tasks } }];
  {
    const h = await open("managed", { stage: "stage_5_monthly", tasks: baseTasks({ "m1.review.first_5": { status: "done" } }), monthly: NOV_REC(), lists: [LIST_STOP, LIST_OCT26] });
    try {
      await tick(1500);
      const t = await settle(h), L = "managed Monthly";
      const order = await h.page.evaluate(`(() => { const t = ${TAB}; return [...t.querySelectorAll('.pm-step-row[id^="step-row-"]')].filter((r) => !r.closest('[hidden]') && !r.closest('.pm-og-bare')).map((r) => r.id.replace("step-row-", "")); })()`);
      const want = ["og-reviews", "m2.exec.review_push", "m2.exec.gbp_photos", "m2.call.monthly"];
      if (order.join(",") !== want.join(",")) fail(`${L}: the rows read ${order.join(", ")}; approved ${want.join(", ")} (9 and 11 folded, no win story row)`);
      // ongoing_overview_v1 "Once Monthly starts": in a normal month steps 8, 10 and 12 are FOLDED, one header line each (pill, title, +)
      const folds = await foldsOf(h);
      for (const id of ["m2.exec.review_push", "m2.exec.gbp_photos", "m2.call.monthly"]) {
        const f = folds[id];
        if (!f) { fail(`${L}: step row ${id} isn't drawn`); continue; }
        if (!f.collapsed || f.aria !== "false" || f.chev !== "+" || !f.pills || !f.title || f.body) fail(`${L}: ${id} doesn't draw folded by default (approved: one header line with its pill, title and +) ${JSON.stringify(f)}`);
      }
      if (!folds["og-reviews"] || folds["og-reviews"].collapsed) fail(`${L}: the Google reviews card is folded (approved: open at the top)`);
      // + opens one card and leaves the others as they are (cards, not an accordion); an opened card stays open on a redraw
      await openRow(h, "m2.exec.gbp_photos"); await openRow(h, "m2.call.monthly");
      const f2 = await foldsOf(h);
      if (!f2["m2.exec.gbp_photos"] || f2["m2.exec.gbp_photos"].collapsed || f2["m2.exec.gbp_photos"].chev !== "–" || !f2["m2.exec.gbp_photos"].body) fail(`${L}: + doesn't open step 10 ${JSON.stringify(f2["m2.exec.gbp_photos"])}`);
      if (!f2["m2.call.monthly"] || f2["m2.call.monthly"].collapsed) fail(`${L}: opening step 12 closed step 10, or step 12 didn't open`);
      if (f2["m2.exec.gbp_photos"] && f2["m2.exec.gbp_photos"].collapsed) fail(`${L}: opening step 12 closed step 10 (cards, not an accordion)`);
      // the reviews card's "Go to step 8" lands on step 8 OPEN, never on a bare header
      await h.page.evaluate(`(() => ${TAB}.querySelector('#step-row-og-reviews [data-portal-goto]')?.click())()`); await tick(1200);
      const g8 = (await foldsOf(h))["m2.exec.review_push"];
      if (!g8 || g8.collapsed || !g8.body) fail(`${L}: "Go to step 8" lands on a folded step 8 ${JSON.stringify(g8)}`);
      await openRow(h, "m2.exec.review_push");
      has(t, "Not due this month", L);
      const nd = await h.page.evaluate(`(() => { const c = ${TAB}.querySelector('.pm-og-nd'); return c ? c.innerText.replace(/\\s+/g, " ").trim() : ""; })()`);
      for (const w of ["9Your numbers We ask in the first week of January Next: Jan 1", "11A video this quarter Optional. RGA writes the script first", "Send a video now"]) has(nd, w, `${L} Not due list`);
      hasNot(t, "again in the first week", L);
      // step 8, due this week
      const r8 = await rowText(h, "m2.exec.review_push");
      for (const w of ["This week's customer list", "Weekly · Nov 2 – Nov 8", "Who did you finish jobs for?", "due Mon Nov 9 · weekly", "Send my list", "No jobs this week", "Who to ask", "Change how often"]) has(r8 || "", w, `${L} step 8`);
      hasNot(r8 || "", "(you chose)", `${L} step 8`); hasNot(r8 || "", "missed last list", `${L} step 8`);
      // step 10
      const r10 = await rowText(h, "m2.exec.gbp_photos");
      for (const w of ["Suggested", "When you have new ones", "No monthly quota. RGA picks the ones that help most and puts them on Google.", "Remind me later", "Add photos"]) has(r10 || "", w, `${L} step 10`);
      for (const w of ["Optional", "usually the same day", "5 new photos", "5 more"]) hasNot(r10 || "", w, `${L} step 10`);
      // step 12, before the 5th's run
      const r12 = await rowText(h, "m2.call.monthly");
      for (const w of ["First: your October report", "about Nov 5", "It's emailed on the 5th. Then you pick a time for the call here.", "Bring one job you're proud of", "What they needed, what you did, how it turned out", "Send it in writing instead"]) has(r12 || "", w, `${L} step 12`);
      hasNot(r12 || "", "RGA writes it up as a Google post", `${L} step 12`);
      // the panel: last, four lines
      const pan = await h.page.evaluate(`(() => { const t = ${TAB}; const p = t.querySelector('.pm-og-rga'); const last = [...t.children].filter((c) => !c.hidden && c.offsetParent !== null).pop();
        return p ? { text: p.innerText.replace(/\\s+/g, " ").trim(), last: !!last && last.contains(p), n: p.querySelectorAll('.pm-og-li').length, band: !!p.querySelector('.pm-cs-st.you') } : null; })()`);
      if (!pan) fail(`${L}: no "Done by RGA this month" panel`);
      else {
        if (!pan.last) fail(`${L}: the Done by RGA panel isn't at the bottom of the tab`);
        if (pan.n !== 4) fail(`${L}: the panel has ${pan.n} lines; approved 4 (posts, replies, what we watched, the report)`);
        for (const w of ["Done by RGA this month", "you approve what goes public", "Google posts · RGA is writing November's 4", "Review replies · none to answer yet", "What we watched · so far this month", "Your Google profile: checked nightly, nothing changed", "Your monthly report · about Nov 5", "Emailed on the 5th."]) has(pan.text, w, `${L} panel`);
        if (pan.band) fail(`${L}: the panel shows an approval line with nothing waiting`);
      }
      for (const w of ["What we watched for you", "Google posts for this month"]) { const rows = await h.page.evaluate(`(() => [...${TAB}.querySelectorAll('.pm-og-row')].filter((r) => !r.closest('.pm-og-bare')).map((r) => r.innerText).join(" "))()`); if (rows.includes(w)) fail(`${L}: "${w}" is still its own row`); }
      // See opens the line's card
      await h.page.evaluate(`(() => ${TAB}.querySelector('[data-og-see="value"]')?.click())()`); await tick(300);
      const seen = await h.page.evaluate(`(() => { const p = ${TAB}.querySelector('[data-og-panel="value"]'); return p && !p.hidden && /What we watched for you/.test(p.innerText); })()`);
      if (!seen) fail(`${L}: the panel's See doesn't open What we watched`);
      // Send it in writing instead → the story form
      await h.page.evaluate(`(() => ${TAB}.querySelector('[data-og-story-open]')?.click())()`); await tick(400);
      const st = await h.page.evaluate(`(() => { const f = ${TAB}.querySelector('[data-og-story-fold]'); const b = f && f.querySelector('[data-in-kind="story"] [data-in-submit]'); return !!f && !f.hidden && !!b && b.offsetParent !== null; })()`);
      if (!st) fail(`${L}: "Send it in writing instead" doesn't open the win story's form`);
      // Send a video now → step 11's link field
      await h.page.evaluate(`(() => ${TAB}.querySelector('[data-og-video-open]')?.click())()`); await tick(400);
      const vd = await h.page.evaluate(`(() => { const f = ${TAB}.querySelector('[data-og-video-fold]'); const a = f && f.querySelector('.pm-og-addf'); const i = a && a.querySelector('[data-in-kind="url"] input[data-in-field="value"]'); return !!f && !f.hidden && !!a && !a.hidden && !!i && i.offsetParent !== null; })()`);
      if (!vd) fail(`${L}: "Send a video now" doesn't open step 11's link field`);
      // a stopped customer typed again is left off and named; nothing is saved
      await h.page.evaluate(`(() => { const r = ${TAB}.querySelector('[id="step-row-m2.exec.review_push"]'); r.querySelector('[data-rc-f="first_name"]').value = "Dana"; r.querySelector('[data-rc-f="contact"]').value = "720-555-0199"; r.querySelector('button[type=submit]').click(); })()`); await tick(700);
      const stop = await h.page.evaluate(`(() => { const r = ${TAB}.querySelector('[id="step-row-m2.exec.review_push"]'); return { say: (r.querySelector('[data-customer-list-status]') || {}).textContent || "", db: (window.__DB_CALLS || []).filter((c) => c.table === "client_customer_lists" && c.op === "insert").length }; })()`);
      if (!/Dana asked you to stop on Oct 3, so we left Dana off this list\./.test(stop.say) || stop.db) fail(`${L}: a customer who asked to stop is saved again or not named (${JSON.stringify(stop)})`);
      // No jobs this week → posted, then the row says so
      await h.page.evaluate(`(() => ${TAB}.querySelector('[id="step-row-m2.exec.review_push"] [data-rc-nojobs]')?.click())()`); await tick(1200);
      const nj = h.cadenceCalls.find((c) => c.action === "no_jobs");
      if (!nj || new Date(nj.start).getDay() !== 1 || new Date(nj.start).getDate() !== 2) fail(`${L}: "No jobs this week" didn't post this week's Monday (${JSON.stringify(nj)})`);
      const r8b = await rowText(h, "m2.exec.review_push");
      for (const w of ["No list this week", "No jobs to ask about this week", "Next list due Mon Nov 9. No reminder goes out for this week.", "Add a customer after all"]) has(r8b || "", w, `${L} step 8 after No jobs`);
      // Pause → posted, then Paused until … + Start again now
      await h.page.evaluate(`(() => { const r = ${TAB}.querySelector('[id="step-row-m2.exec.review_push"]'); r.querySelector('.pm-og-addf').hidden = false; const i = r.querySelector('[data-rc-pause-until]'); i.value = "2026-12-14"; r.querySelector('[data-rc-pause]').click(); })()`); await tick(1200);
      const pz = h.cadenceCalls.find((c) => c.action === "pause");
      if (!pz || new Date(pz.until).getDate() !== 14) fail(`${L}: Pause didn't post its day (${JSON.stringify(pz)})`);
      const r8c = await rowText(h, "m2.exec.review_push");
      for (const w of ["Paused until Dec 14", "Paused until Mon Dec 14", "you paused it Nov 4", "No lists and no reminders until then", "Start again now"]) has(r8c || "", w, `${L} step 8 paused`);
      if (h.errs.length) fail(`${L}: page errors ${h.errs.slice(0, 2).join(" · ")}`);
    } finally { await h.close(); }
  }
  // the report didn't go out on the 5th · an approval waiting · a request to a customer who asked to stop
  {
    const thisWeek = { id: "l9", client_id: CID, workspace_id: "w1", week_label: "Week of November 2", created_at: "2026-11-05T15:00:00Z", customer_count: 1, customers: [{ first_name: "Lee", phone: "7205550199", service_done: "gutter repair" }] };
    const h = await open("managed", { stage: "stage_5_monthly", clock: NOV6, tasks: baseTasks({ "m1.review.first_5": { status: "done" } }), monthly: NOV_REC({ "m2.exec.gbp_posts": { status: "pending", outcome_data: { posts: [1, 2, 3, 4] } } }), lists: [LIST_STOP, thisWeek],
      photos: [{ id: "p1", client_id: CID, workspace_id: "w1", category: "at_work", storage_path: "c/p1.jpg", created_at: "2026-11-05T14:00:00Z", publish_state: "pending" }],
      fns: { "portal-deliverables": () => ({ ok: true, deliverables: [{ key: "m2.exec.gbp_posts", prepared_at: "2026-11-05T12:00:00Z" }], actions: [], items: [] }),
        "portal-review-requests": (b) => (b && b.scope === "reviews" ? EMPTY_REVIEWS : { ok: true, has_review_link: true, list: { id: "l9" }, requests: [{ index: 0, list_id: "l9", name: "Lee", phone: "7205550199", job: "gutter repair", stopped: false, stopped_before: { at: "2026-10-03T12:00:00Z" }, message: null, reminder: null }] }) } });
    try {
      await tick(2500);
      const L = "managed Monthly, Nov 6";
      for (const id of ["m2.call.monthly", "m2.exec.review_push", "m2.exec.gbp_photos"]) await openRow(h, id);
      const r12 = await rowText(h, "m2.call.monthly");
      for (const w of ["Waits on RGA", "Your report didn't go out on the 5th", "RGA is on it", "The call opens when it's sent. Nothing needed from you."]) has(r12 || "", w, `${L} step 12`);
      const pan = await h.page.evaluate(`(() => { const p = ${TAB}.querySelector('.pm-og-rga'); const b = p && p.querySelector('.pm-cs-st.you'); return p ? { band: b ? b.innerText.replace(/\\s+/g, " ").trim() : "", first: !!b && p.querySelector('.pm-og-rh').nextElementSibling === b } : null; })()`);
      if (!pan || !pan.band.includes("4 posts for your approval") || !pan.band.includes("Open For your approval") || !pan.first) fail(`${L}: an approval waiting isn't one amber line at the top of the panel (${JSON.stringify(pan)})`);
      const r8 = await rowText(h, "m2.exec.review_push");
      for (const w of ["Lee asked you to stop on Oct 3. No request goes to them.", "Remove Lee"]) has(r8 || "", w, `${L} step 8`);
      // ongoing_step08_customers_v1: the request is one plain line (mark · name · job / its muted line · its link), never today's avatar row
      const lee = await rqLines(h);
      if (lee.avatars || lee.lines.length !== 1 || lee.lines[0].text !== "Lee · gutter repair Lee asked you to stop on Oct 3. No request goes to them. Remove Lee" || lee.lines[0].mark !== "you" || lee.lines[0].link !== "Remove Lee")
        fail(`${L}: step 8's stopped-before request isn't the approved line ${JSON.stringify(lee)}`);
      // step 10 with a photo waiting on RGA: what RGA does, with no promise of when
      const r10 = await rowText(h, "m2.exec.gbp_photos");
      for (const w of ["With RGA · 1 to review", "1 photo with RGA for review", "RGA checks each one", "The good ones go on your Google profile. You'll see each one here when it's on."]) has(r10 || "", w, `${L} step 10`);
      hasNot(r10 || "", "usually the same day", `${L} step 10`);
    } finally { await h.close(); }
  }
  // ── STEP 8'S REQUEST LINES (ongoing_step08_customers_v1, "2 · Some asked, some to go" + "3 · Sent: everyone asked"), and their controls ──
  {
    const NOV12 = "2026-11-12T18:00:00Z", NOV14 = "2026-11-14T18:00:00Z";
    const cu = [asked("Maria", "5550100001", "2026-11-10T15:00:00Z", { service_done: "water heater" }), asked("Dev", "5550100002", "2026-11-09T15:00:00Z"), { first_name: "Sam", phone: "5550100003", service_done: "new faucet" },
      asked("Dana", "5550100004", "2026-11-09T15:00:00Z", { service_done: "leak", stopped: true, stopped_at: "2026-11-11T15:00:00Z" })];
    const list = { id: "l2", client_id: CID, workspace_id: "w1", week_label: "Week of November 9", created_at: "2026-11-09T14:00:00Z", customer_count: cu.length, customers: cu };
    const req = (c, i) => ({ index: i, list_id: "l2", name: c.first_name, phone: c.phone, email: "", job: c.service_done, already_marked: !!c.marked_sent_by_client, marked_at: c.marked_sent_at || null, reminded_at: c.reminded_at || null,
      reviewed_mark: !!c.reviewed_mark, reviewed_at: c.reviewed_mark_at || null, stopped: !!c.stopped, stopped_at: c.stopped_at || null, reminder: `Hi ${c.first_name}, one quick reminder about the review.`, message: `Hi ${c.first_name}, would you leave us a review?` });
    const posts = [];
    const h = await open("managed", { stage: "stage_5_monthly", clock: NOV12, tasks: baseTasks({ "m1.review.first_5": { status: "done" } }), monthly: NOV_REC(), lists: [list],
      fns: { "portal-review-requests": (b) => { if (b && b.scope === "reviews") return EMPTY_REVIEWS; if (b && b.list_id) { posts.push(b); return { ok: true, sent_total: 3, of: 4 }; } return { ok: true, has_review_link: true, list: { id: "l2" }, requests: cu.map(req) }; } } });
    try {
      await tick(1500);
      const L = "managed Monthly, step 8's requests";
      await openRow(h, "m2.exec.review_push"); await tick(600);
      const g = await rqLines(h), by = (n) => g.lines.find((l) => l.text.startsWith(`${n} `)) || null;
      if (g.avatars) fail(`${L}: today's avatar rows are still drawn (approved: plain lines)`);
      const ma = by("Maria"), dv = by("Dev"), sm = by("Sam"), dn = by("Dana");
      // 11-5 fix: "They reviewed" and "They asked me to stop" on EVERY asked row not marked either way (a stop can come any time; recording it blocks a re-ask); Remind once only when due
      if (!ma || !ma.text.startsWith("Maria · water heater asked Nov 10 · remind once from Nov 13") || ma.mark !== "ok" || ma.btns.join("|") !== "They reviewed|They asked me to stop" || ma.read || ma.link) fail(`${L}: an ask before its reminder is due isn't "Maria · water heater / asked Nov 10 · remind once from Nov 13" with They reviewed · They asked me to stop and no Remind ${JSON.stringify(ma)}`);
      if (!dv || !dv.text.startsWith("Dev · drain cleaning asked Nov 9") || dv.btns.join("|") !== "Remind|They reviewed|They asked me to stop" || !dv.text.includes("One reminder only") || !dv.read || !dv.top) fail(`${L}: a reminder that's due isn't "Dev · drain cleaning / asked Nov 9" with Remind Dev once · They reviewed · They asked me to stop and Read the reminder ${JSON.stringify(dv)}`);
      if (!sm || sm.text !== "Sam · new faucet RGA wrote the request Send it" || sm.mark !== "open" || sm.link !== "Send it" || sm.btns.length) fail(`${L}: a request not sent yet isn't "Sam · new faucet / RGA wrote the request" + Send it ${JSON.stringify(sm)}`);
      if (!dn || dn.text !== "Dana · asked not to be contacted No reminder goes to Dana Nov 11" || dn.mark !== "off" || dn.dt !== "Nov 11") fail(`${L}: a customer who asked to stop isn't "Dana · asked not to be contacted / No reminder goes to Dana" with the day ${JSON.stringify(dn)}`);
      for (const l of g.lines) if (l.pad !== "11px 16px" || l.size !== "14.5px") { fail(`${L}: a request line isn't the mockup's .li (padding 11px 16px, 14.5px): ${l.pad} ${l.size}`); break; }
      const hd = await rowText(h, "m2.exec.review_push"); has(hd || "", "3 of 4 asked", L); has(hd || "", "1 to go", L);
      // Read the reminder opens the reminder's words; Send it opens the request with Text Sam and I sent it
      const rd = await h.page.evaluate(`(() => { const d = ${TAB}.querySelector('[id="step-row-m2.exec.review_push"] details.pm-og-rd'); if (!d) return ""; d.open = true; return d.innerText.replace(/\\s+/g, " ").trim(); })()`);
      if (!rd.includes("Hi Dev, one quick reminder about the review.")) fail(`${L}: Read the reminder doesn't show the reminder (${rd})`);
      const sp = await h.page.evaluate(`(() => { const r = ${TAB}.querySelector('[id="step-row-m2.exec.review_push"]'); const b = r.querySelector('[data-og-rq-open]'); const p = b && b.closest('.pm-og-rq').nextElementSibling; const was = !!p && p.hidden; b && b.click();
        return { was, now: !!p && !p.hidden && p.offsetParent !== null, text: p ? p.innerText.replace(/\\s+/g, " ").trim() : "", text1: !!(p && p.querySelector('a[data-review-send][href^="sms:"]')), mark: !!(p && p.querySelector('[data-review-mark]')) }; })()`);
      if (!sp.was || !sp.now || !sp.text.includes("Hi Sam, would you leave us a review?") || !sp.text.includes("Text Sam") || !sp.text1 || !sp.mark) fail(`${L}: Send it doesn't open Sam's request with Text Sam and I sent it ${JSON.stringify(sp)}`);
      // the controls still record, through the one handler: They reviewed (Dev) · I sent it (Sam) · They asked me to stop (Dev), each posted with its list and index and said
      const press = async (sel) => { await h.page.evaluate(`(() => ${TAB}.querySelector('[id="step-row-m2.exec.review_push"] ${sel}')?.click())()`); await tick(900); };
      await press('[data-review-reviewed="1"]'); await press('[data-review-mark="2"]'); await press('[data-review-stop="1"]'); await press('[data-review-stop="0"]');
      const k = posts.map((b) => `${Object.keys(b).find((x) => ["sent", "reminded", "reviewed", "stopped", "not_match"].includes(x))}:${b.list_id}:${JSON.stringify(b.reviewed || b.sent || b.stopped)}`).join(" ");
      if (k !== "reviewed:l2:[1] sent:l2:[2] stopped:l2:[1] stopped:l2:[0]") fail(`${L}: the request controls didn't record (posted ${k || "nothing"}; approved reviewed [1], sent [2], stopped [1], and Maria's stop before her reminder is due [0], on list l2)`);
      const toast = await h.page.evaluate(() => document.body.innerText);
      if (!/Marked as reviewed\. No reminder goes to them\./.test(toast) && !/Got it\. Nothing more goes to them\./.test(toast)) fail(`${L}: a recorded mark says nothing`);
      if (h.errs.length) fail(`${L}: page errors ${h.errs.slice(0, 2).join(" · ")}`);
    } finally { await h.close(); }
    // everyone asked: "<name> · reviewed ★ / you said so <day>" and "<name> · asked · reminded <day>" with the day asked on the right
    const cu2 = [asked("Maria", "5550100001", "2026-11-10T15:00:00Z", { service_done: "water heater", reviewed_mark: true, reviewed_mark_at: "2026-11-14T15:00:00Z" }), asked("Dev", "5550100002", "2026-11-09T15:00:00Z", { reminded_at: "2026-11-12T15:00:00Z" })];
    const h2 = await open("managed", { stage: "stage_5_monthly", clock: NOV14, tasks: baseTasks({ "m1.review.first_5": { status: "done" } }), monthly: NOV_REC(), lists: [{ ...list, customer_count: 2, customers: cu2 }],
      fns: { "portal-review-requests": (b) => (b && b.scope === "reviews" ? EMPTY_REVIEWS : { ok: true, has_review_link: true, list: { id: "l2" }, requests: cu2.map(req) }) } });
    try {
      await tick(1500);
      const L = "managed Monthly, step 8 sent";
      const f = await foldsOf(h2);
      if (!f["m2.exec.review_push"] || !f["m2.exec.review_push"].collapsed) fail(`${L}: a done step 8 doesn't draw folded`);
      await openRow(h2, "m2.exec.review_push"); await tick(600);
      const g = await rqLines(h2), by = (n) => g.lines.find((l) => l.text.startsWith(`${n} `)) || null, ma = by("Maria"), dv = by("Dev");
      if (!ma || ma.text !== "Maria · reviewed ★ you said so Nov 14 Nov 14" || ma.dt !== "Nov 14") fail(`${L}: a reviewed customer isn't "Maria · reviewed ★ / you said so Nov 14" with the day ${JSON.stringify(ma)}`);
      if (!dv || !dv.text.startsWith("Dev · asked · reminded Nov 12") || dv.dt !== "Nov 9" || dv.btns.join("|") !== "They reviewed|They asked me to stop" || dv.read) fail(`${L}: a reminded customer isn't "Dev · asked · reminded Nov 12" with the day asked and They reviewed · They asked me to stop (no second reminder) ${JSON.stringify(dv)}`);
      const r8 = await rowText(h2, "m2.exec.review_push"); has(r8 || "", "2 customers asked", L); has(r8 || "", "Next list due Mon Nov 16.", L);
    } finally { await h2.close(); }
    // a missed list is late: step 8 opens on its own; the others stay folded
    const h3 = await open("managed", { stage: "stage_5_monthly", clock: NOV12, tasks: baseTasks({ "m1.review.first_5": { status: "done" } }), monthly: NOV_REC(), lists: [LIST_OCT26] });
    try {
      await tick(1500);
      const L = "managed Monthly, a missed list", f = await foldsOf(h3);
      if (!f["m2.exec.review_push"] || f["m2.exec.review_push"].collapsed || !f["m2.exec.review_push"].body) fail(`${L}: a late step 8 ("missed last list") doesn't open on its own ${JSON.stringify(f["m2.exec.review_push"])}`);
      if (!f["m2.exec.gbp_photos"] || !f["m2.exec.gbp_photos"].collapsed) fail(`${L}: step 10 opened with step 8 (only a late row opens on its own)`);
      has(await rowText(h3, "m2.exec.review_push") || "", "Your last list was due Mon Nov 9", L);
    } finally { await h3.close(); }
  }
  const src = fs.readFileSync(`${SITE}/netlify/functions/portal-review-requests.js`, "utf8");
  if (!/reviewed_at: c\.reviewed_mark_at \|\| null, stopped_at: c\.stopped_at \|\| null,/.test(src)) fail("portal-review-requests no longer returns the day of the client's word (reviewed_at, stopped_at): step 8 can't say \"you said so <day>\"");
  // ── JANUARY: step 9 is due, for the 3 months before ─────────────────────────────────────────────────────────
  {
    const h = await open("managed", { stage: "stage_5_monthly", clock: JAN7, tasks: baseTasks({ "m1.review.first_5": { status: "done" } }), monthly: [{ id: "mr1", client_id: CID, workspace_id: "w1", reporting_month: "2027-01-01", data: { tasks: {} } }] });
    try {
      await openRow(h, "m2.snap.business_outcomes");
      const r9 = await rowText(h, "m2.snap.business_outcomes"), L = "managed Monthly, January";
      for (const w of ["For Oct – Dec", "2 numbers · about a minute", "for Oct – Dec", "Send my numbers"]) has(r9 || "", w, `${L} step 9`);
      for (const w of ["about 2 minutes", "Jan – Mar", "quarterly report"]) hasNot(r9 || "", w, `${L} step 9`);
    } finally { await h.close(); }
  }
  // ── NOT MANAGED: today's tab ─────────────────────────────────────────────────────────────────────────────────
  for (const mode of ["self_serve", null]) {
    const h = await open(mode);
    try {
      const t = await settle(h), L = `${mode} Setup`;
      for (const w of ["Starts after setup", "nothing needed yet", "A customer win story", "Your check-in call", "We email you when it's ready."]) has(t, w, L);
      for (const w of ["Your part · your steps", "Month 1 ends about", "Emailed on the 5th.", "Your first ones come from", "Nothing here needs you yet."]) hasNot(t, w, L);
      const p = await h.page.evaluate(() => !!document.querySelector(".pm-og-m, .pm-og-rga, [data-og-card='rga'], [data-rv-way]"));
      if (p) fail(`${L}: the managed tab reached a client who isn't managed`);
    } finally { await h.close(); }
  }
  {
    const h = await open("self_serve", { stage: "stage_5_monthly", tasks: baseTasks({ "m1.review.first_5": { status: "done" } }), monthly: NOV_REC() });
    try {
      await tick(1500);
      const t = await settle(h), L = "self_serve Monthly";
      for (const w of ["Not due this month", "Send it in writing instead", "Done by RGA this month", "When you have new ones"]) hasNot(t, w, L);
      const rows = await h.page.evaluate(`(() => [...${TAB}.querySelectorAll('.pm-step-row[id^="step-row-"]')].map((r) => r.id.replace("step-row-", "")))()`);
      for (const id of ["m2.snap.business_outcomes", "m2.exec.youtube_video", "m2.win_story.capture"]) if (!rows.includes(id)) fail(`${L}: today's ${id} row is gone`);
      const sf = await foldsOf(h), shut = Object.entries(sf).filter(([, v]) => v.collapsed).map(([k]) => k);
      if (shut.length) fail(`${L}: today's open cards are folded for a client who isn't managed (${shut.join(", ")})`);
    } finally { await h.close(); }
  }
  // ── THE SENDER: the month just ended ─────────────────────────────────────────────────────────────────────────
  {
    const req = createRequire(`${SITE}/netlify/functions/x.js`), S = req("./send-monthly-report.js");
    const rec = (m) => ({ id: m, reporting_month: `${m}-01` });
    const a = S.pickReportRecords([rec("2026-11"), rec("2026-10"), rec("2026-09")], null, new Date("2026-11-05T09:00:00Z"));
    if (!a.current || a.current.id !== "2026-10" || a.prior.id !== "2026-09") fail(`the 5th's report on Nov 5 is ${a.current && a.current.id} (prior ${a.prior && a.prior.id}); approved: October, the month just ended (prior September)`);
    const b = S.pickReportRecords([rec("2026-11"), rec("2026-09")], null, new Date("2026-11-05T09:00:00Z"));
    if (b.current) fail(`with no October record the 5th's report still picks ${b.current.id} (it must send nothing rather than this month's)`);
    const c = S.pickReportRecords([rec("2026-11"), rec("2026-10"), rec("2026-09")], "2026-09", new Date("2026-11-05T09:00:00Z"));
    if (!c.current || c.current.id !== "2026-09" || Object.keys(c.prior).length) fail(`a resend of September picks ${c.current && c.current.id}`);
    if (S.reportMonthFor(new Date("2027-01-05T09:00:00Z")) !== "2026-12") fail(`the report in January covers ${S.reportMonthFor(new Date("2027-01-05T09:00:00Z"))}; approved 2026-12`);
    const src = fs.readFileSync(`${SITE}/netlify/functions/send-monthly-report.js`, "utf8");
    if (!/const pick = pickReportRecords\(recs, month\);/.test(src) || /\(recs \|\| \[\]\)\[0\]/.test(src)) fail("send-monthly-report doesn't pick its record with pickReportRecords (or still takes the newest record)");
    const R = req("./portal-review-requests.js");
    const idx = R.stoppedIndex([{ id: "a", customers: [{ phone: "(720) 555-0199", stopped: true, stopped_at: "2026-10-03T12:00:00Z" }] }, { id: "b", customers: [{ phone: "7205550199" }, { email: "x@y.test" }] }]);
    if (!R.stoppedBefore({ phone: "7205550199" }, idx, "b", 0) || R.stoppedBefore({ phone: "(720) 555-0199", stopped: true }, idx, "a", 0) || R.stoppedBefore({ email: "x@y.test" }, idx, "b", 1)) fail("portal-review-requests doesn't refuse a customer whose cell asked to stop on another list (or refuses one who didn't)");
    const rr = fs.readFileSync(`${SITE}/netlify/functions/portal-review-requests.js`, "utf8");
    if (!/MARK === "sent" && stoppedBefore\(customers\[i\], stoppedElsewhere, listId, i\)/.test(rr)) fail("portal-review-requests lets a customer who asked to stop be marked sent again");
    const cf = fs.readFileSync(`${SITE}/netlify/functions/portal-review-cadence.js`, "utf8");
    if (!/const PAUSE_MAX_DAYS = 92;/.test(cf) || !/until > Date\.now\(\) \+ PAUSE_MAX_DAYS \* 86400000/.test(cf) || !/🔴 READ IT BACK[\s\S]*listAnswer|if \(!ok\) return json\(500/.test(cf)) fail("portal-review-cadence's pause isn't capped at 3 months or its answer isn't read back");
  }
} catch (e) {
  if (e instanceof HarnessUnavailable) { console.error(`⚠️  INDETERMINATE — ${e.message}`); process.exit(2); }
  // a press on a control that isn't drawn throws; when the page already showed what's wrong, that's the finding, not "can't tell"
  if (F.length) { console.error(`🔴 the managed Ongoing work tab doesn't draw as approved: ${F.length} problem(s), then a control it needed wasn't there (${String(e.message || e).slice(0, 160)})\n` + F.map((m) => `  · ${m}`).join("\n")); process.exit(1); }
  console.error(`⚠️  INDETERMINATE — the gate threw: ${String(e.stack || e).slice(0, 400)}`); process.exit(2);
}
if (F.length) { console.error(`🔴 the managed Ongoing work tab doesn't draw as approved: ${F.length} problem(s)\n` + F.map((m) => `  · ${m}`).join("\n")); process.exit(1); }
console.log("✅ the managed Ongoing work tab draws as approved: Setup = the grey empty reviews card with Go to step 5, step 8 held, ONE Starts after setup card numbered 8–12 with Month 1's end and Done by RGA; Monthly = 8/10/12, 9 and 11 folded with Send a video now, the win story on step 12, step 8's due Monday, No jobs, Pause and the stop rule, step 10 Suggested with no quota, step 12 on the report's month and the late report, ONE panel at the bottom with its approval line; 8/10/12 folded by default (a late step 8 opens), step 8's requests as the approved plain lines with their controls; January's step 9 for Oct – Dec; self-serve and no mode draw today's tab; the 5th's report is the month just ended");
