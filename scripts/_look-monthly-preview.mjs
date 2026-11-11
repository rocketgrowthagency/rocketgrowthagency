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

const OUT = "/private/tmp/claude-501/-Users-chris-RGA-Rocket-Growth-Agency-Website-VS-Code/170203bc-8331-4a47-8081-5214ffc03016/scratchpad/monthly";
const NOV_REC = (tasks = {}) => [{ id: "mr11", client_id: CID, workspace_id: "w1", reporting_month: "2026-11-01", data: { tasks } }];
const shot = async (h, name) => { await h.page.setViewport({ width: 1280, height: 900 }); await tick(400); const el = await h.page.evaluateHandle(TAB); await el.screenshot({ path: `${OUT}/${name}.png` }); console.log("shot", name); };
const ALL = ["m2.exec.review_push", "m2.exec.gbp_photos", "m2.call.monthly", "m2.snap.business_outcomes"];
{
  const h = await open("managed", { stage: "stage_5_monthly", clock: NOV6, tasks: baseTasks({ "m1.review.first_5": { status: "done" } }), monthly: NOV_REC(), lists: [LIST_OCT26] });
  try { await tick(2500); await shot(h, "1-monthly-nov6-folded"); for (const id of ALL) await openRow(h, id); await shot(h, "2-monthly-nov6-open"); } finally { await h.close(); }
}
{
  const h = await open("managed", { stage: "stage_5_monthly", clock: JAN7, tasks: baseTasks({ "m1.review.first_5": { status: "done" } }), monthly: [{ id: "mr1", client_id: CID, workspace_id: "w1", reporting_month: "2027-01-01", data: { tasks: {} } }] });
  try { await tick(2500); for (const id of ALL) await openRow(h, id); await shot(h, "3-monthly-jan7-step9-due"); for (const id of ["m2.exec.youtube_video", "m2.call.monthly"]) { const el = await h.page.$(`[id="step-row-${id}"]`); await el.evaluate((e) => e.scrollIntoView({ block: "center" })); await tick(300); await el.screenshot({ path: `${OUT}/row-${id}.png` }); } console.log(await h.page.evaluate(`(() => [...${TAB}.querySelectorAll(".pm-step-row-head")].map((x) => (x.closest(".pm-step-row")||{}).id + " | " + (() => { const n = x.querySelector(".pm-step-num"); if (!n) return "NO DISC"; const c = getComputedStyle(n), r = n.getBoundingClientRect(); return n.textContent + " disp=" + c.display + " vis=" + c.visibility + " op=" + c.opacity + " w=" + Math.round(r.width) + " color=" + c.color + " bg=" + c.backgroundColor + " rowcls=" + x.closest(".pm-step-row").className; })()).join(" ;; "))()`)); } finally { await h.close(); }
}
