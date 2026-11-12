#!/usr/bin/env node
// check-schedule-system-v6.mjs: EVERY CONTROL AND POPUP IN THE ADMIN SCHEDULE MUST OPEN AND LOOK LIKE THE APPROVED MASTER MOCKUP v6 (schedule_system_v6, Chris 11-10 "mockup approved. build it").
// Renders the REAL admin/schedule.js + admin/schedule-dialogs.js + admin/admin.css in headless Chrome (puppeteer, static server, fake function answers, clock fixed to Tue Nov 10 2026, 7:32 PM Pacific,
// the BROWSER set to Tokyo time so a dialog that follows the laptop instead of Pacific is caught) and OPENS each one:
//   1  the top bar: "Today · Tue, Nov 10" and "Pacific time (PT) · now 7:32 PM"
//   2  Go to date: a popover under the button (mini month, ◀ ▶, today ringed, dots on days with calls, a Today link), closes on a pick / Esc / a click away, keeps the view; no native date input
//   3  Day: the hourly grid, one shaded hour before and after your hours, blocks drawn to their real length, a red now line on today, the empty-state sentence; Week: real lengths + the now line
//   4  an empty time (Week and Day): the menu "Block 1:00 – 1:30 PM" + "Block longer…"; Month: counts by call name, a click opens Day; Busy blocks survive the Call and Who filters
//   5  Set your hours: opens VISIBLY (computed opacity 1), shows every rule, saves every rule (days, start, end, zone, length, gap, earliest, furthest), then a toast
//   6  Block time: Date / From / To / Label read as PACIFIC, an overlap warning, an Undo toast
//   7  the panel of each kind (booked, past/held, blocked, busy), "Client page" and "Their portal" are different links, No-show + Held only after the start,
//      Reschedule and Cancel open the ORANGE "This reaches the client" dialog (and the gate never confirms one: nothing is ever sent)
//   8  the status lines (Google, Texts, Call them now, the agreement line that only says a reminder went out if one did)   9  the sidebar badge (count today still ahead, or a red "!")
// PROVES ITSELF (LIVE_BEFORE): it MUST fail on the website as it was before this build (default 9a821a73) in 10+ places, else exit 2 INDETERMINATE.
//   node scripts/check-schedule-system-v6.mjs [--against=<rev>] [--no-before] [--shot=<dir>]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { runGate, loader } from "./lib/site-rev.mjs";

const BEFORE = "9a821a73";
const SHOT = (process.argv.find((a) => a.startsWith("--shot=")) || "").slice(7);
const NOW = Date.parse("2026-11-11T03:32:00Z"); // Tue Nov 10 2026, 7:32 PM Pacific
const call = (id, kind, start, mins, o = {}) => ({ id, kind, status: "booked", starts_at: start, ends_at: new Date(Date.parse(start) + mins * 60000).toISOString(), owner_id: null, client_id: null, lead_ref: null, person: "prospect", who: "", phone: null, meet_link: null, outcome: null, both: null, name: ({ walkthrough: "Audit walkthrough", m1_review: "Month 1 review", kickoff: "Kickoff call", blocked: "Blocked time" })[kind], reminders: [], ...o });
const U = "11111111-1111-4111-8111-11111111111";
const CALLS = [
  call(`${U}1`, "walkthrough", "2026-11-11T19:00:00Z", 30, { who: "Nathan's Towing", phone: "(310) 555-0142", lead_ref: "L1", meet_link: "https://meet.google.com/aaa", both: "11:00 AM PT · 2:00 PM ET for them", reminders: [] }),
  call(`${U}2`, "blocked", "2026-11-12T20:00:00Z", 60, { person: null, who: "Lunch" }),
  call(`${U}3`, "m1_review", "2026-11-05T22:00:00Z", 30, { person: "client", client_id: "cl3", who: "Beta Roofing", status: "held", outcome: "Held · moving to monthly check-ins", duration_min: 28, note: "Wants more review asks in December." }),
  call(`${U}4`, "m1_review", "2026-11-11T22:00:00Z", 30, { person: "client", client_id: "cl3", who: "Beta Roofing", meet_link: "https://meet.google.com/bbb", both: "2:00 PM PT · 5:00 PM ET for them" }),
  call(`${U}5`, "kickoff", "2026-11-11T03:15:00Z", 30, { person: "client", client_id: "cl4", who: "Gamma HVAC", meet_link: "https://meet.google.com/ccc" }),
  call(`${U}6`, "walkthrough", "2026-11-13T17:00:00Z", 30, { who: "Relate Dental", lead_ref: "L2", reminders: [{ kind: "email_24h", at: "2026-11-12T17:00:00Z" }] }),
];
const FUTURE_SLOTS = [{ start: "2026-11-12T18:00:00Z", label: "Thu, Nov 12, 10:00 AM", both: "10:00 AM PT · 1:00 PM ET for them" }, { start: "2026-11-13T21:00:00Z", label: "Fri, Nov 13, 1:00 PM", both: "1:00 PM PT · 4:00 PM ET for them" }, { start: "2026-11-16T17:00:00Z", label: "Mon, Nov 16, 9:00 AM", both: "9:00 AM PT · 12:00 PM ET for them" }];
const RULES = { days: [1, 2, 3, 4, 5], firstHour: 9, lastHour: 16, tz: "America/Los_Angeles", slotMinutes: 30, bufferMinutes: 15, minNoticeHours: 24, horizonDays: 14, maxSlotsPerDay: 12, maxDays: 14 };
const answer = (o = {}) => ({ ok: true, history: true, historyNote: null, hours: { days: [1, 2, 3, 4, 5], firstHour: 9, lastHour: 16, tz: "America/Los_Angeles" }, staff: [{ id: "s0", name: "Chris" }], rgaTz: "America/Los_Angeles",
  googleConnected: true, googleEmail: "hello@rocketgrowthagency.com", readAt: "2026-11-11T03:31:00Z", busy: [{ starts_at: "2026-11-11T17:00:00Z", ends_at: "2026-11-11T18:30:00Z" }], busyError: null,
  quoKey: "ok", texts: { on: false, why: "Texts are off: the Quo key works; texting turns on after (424) 242-2040's carrier registration is confirmed" }, calls: CALLS,
  alerts: { callNow: [], agreementUnsigned: [{ contract_id: "k1", client_id: "cl9", who: "Gamma HVAC", opened_at: "2026-11-10T01:00:00Z", reminded_at: null }] }, today: 2, nowIso: new Date(NOW).toISOString(), ...o });
const MIME = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json" };
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/admin/admin.css"></head><body class="admin-body" data-admin-view="schedule"><div id="scheduleView"><div id="scheduleHost"></div></div><span class="admin-nav-badge" id="scheduleNavBadge" hidden></span></body></html>`;
function serve(root) {
  return new Promise((res) => { const s = http.createServer((q, r) => { const u = new URL(q.url, "http://x"); if (u.pathname === "/") { r.setHeader("content-type", "text/html"); return r.end(PAGE); }
    const f = path.join(root, decodeURIComponent(u.pathname)); fs.readFile(f, (e, b) => { if (e) { r.statusCode = 404; return r.end(""); } r.setHeader("content-type", MIME[path.extname(f)] || "application/octet-stream"); r.end(b); }); }).listen(0, "127.0.0.1", () => res(s)); });
}
const rgb = (c) => String(c || "");

async function checkTree(root, label) {
  const F = [], fail = (m) => F.push(`${label}: ${m}`);
  let puppeteer; try { ({ default: puppeteer } = await import("puppeteer")); } catch { console.error("INDETERMINATE: puppeteer missing"); process.exit(2); }
  const srv = await serve(root), base = `http://127.0.0.1:${srv.address().port}`;
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  const shot = async (page, name) => { if (SHOT && label === "after") { fs.mkdirSync(SHOT, { recursive: true }); await page.screenshot({ path: path.join(SHOT, `${name}.png`), fullPage: true }); } };
  try {
    const page = await browser.newPage(); await page.setViewport({ width: 1240, height: 1300 });
    await page.emulateTimezone("Asia/Tokyo");   // the laptop is NOT in Pacific: a dialog that follows it is wrong
    const errs = []; page.on("pageerror", (e) => errs.push(String(e.message)));
    const posts = [], sent = []; let ans = answer(), busyErr = false;
    await page.setRequestInterception(true);
    page.on("request", (r) => {
      const u = r.url(), m = r.method(), fn = (u.match(/\/\.netlify\/functions\/([\w-]+)/) || [])[1];
      if (!fn) return r.continue();
      const body = (() => { try { return JSON.parse(r.postData() || "{}"); } catch { return {}; } })();
      if (fn === "schedule-data") return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(ans) });
      if (fn === "kickoff-availability-rules") { if (m === "POST") posts.push({ fn, body }); return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, configured: true, rules: m === "POST" ? { ...RULES, ...body.rules } : RULES }) }); }
      if (fn === "kickoff-requests") { posts.push({ fn, body }); return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }); }
      if (fn === "schedule-call-action" && body.action === "slots") return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, slots: FUTURE_SLOTS, more: FUTURE_SLOTS }) });
      // anything else that could reach a person: record it and refuse. The gate never sends anything.
      sent.push(`${fn} ${body.action || ""}`); return r.respond({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "the gate never sends" }) });
    });
    await page.evaluateOnNewDocument((now) => { const RD = Date; globalThis.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(now); } static now() { return now; } }; }, NOW);
    const J = (fn, ...a) => page.evaluate(fn, ...a);
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    // 11-11: a 30 s navigation timeout on the LOCAL fixture page failed this gate twice under load (the reruns passed). One retry at 60 s;
    // a second timeout is INDETERMINATE (exit 2), never "the Schedule is broken" (feedback_a_gate_that_throws_is_not_a_gate_that_fails).
    const goto = async () => { for (let i = 0; i < 2; i++) { try { return await page.goto(base + "/", { waitUntil: "load", timeout: 60000 }); } catch (e) { if (i || !/timeout/i.test(e.message)) { if (/timeout/i.test(e.message)) { console.log(`INDETERMINATE: the fixture page did not load twice (${e.message.slice(0, 80)})`); process.exit(2); } throw e; } } } };
    const boot = async (a) => { ans = a || answer(); await goto();
      const ok = await J(async () => { try { const m = await import("/admin/schedule.js"); await m.openSchedule("tok", {}); return true; } catch (e) { return String(e.message); } });
      if (ok !== true) throw new Error(`schedule.js did not boot: ${ok}`); };
    const step = async (name, fn) => { try { await fn(); } catch (e) { fail(`${name}: could not run (${String(e.message).slice(0, 120)})`); } };
    const click = (sel) => J((s) => { const e = document.querySelector(s); if (!e) throw new Error(`no ${s}`); e.click(); return true; }, sel);
    const viewOf = (v) => click(`[data-sch-view="${v}"]`).then(() => wait(250));
    await boot();

    await step("1 top bar", async () => {
      const t = await J(() => ({ today: (document.querySelector("[data-sch-today]") || {}).textContent, zone: (document.querySelector(".sch-zone") || {}).textContent }));
      if (t.today !== "Today · Tue, Nov 10") fail(`the Today button reads "${t.today}", expected "Today · Tue, Nov 10"`);
      if (t.zone !== "Pacific time (PT) · now 7:32 PM") fail(`the zone line reads "${t.zone}", expected "Pacific time (PT) · now 7:32 PM"`);
    });

    await step("2 Go to date", async () => {
      await click("[data-sch-goto]"); await wait(300);
      const p = await J(() => { const pop = document.querySelector(".sch-pop"); if (!pop) return null; const r = pop.getBoundingClientRect(), b = document.querySelector("[data-sch-goto]").getBoundingClientRect(); const cs = getComputedStyle(pop);
        const today = pop.querySelector(".sch-md.today"); return { head: (pop.querySelector(".sch-pop-h b") || {}).textContent, cells: pop.querySelectorAll(".sch-md").length, arrows: pop.querySelectorAll("[data-sch-pm]").length, todayTxt: today && today.textContent, todayRing: today && getComputedStyle(today).boxShadow,
          dots: [...pop.querySelectorAll(".sch-md.dot")].map((e) => e.textContent).join(","), todayLink: !!pop.querySelector("[data-sch-poptoday]"), below: r.top >= b.bottom - 1, nearButton: Math.abs(r.right - b.right) < 40 || Math.abs(r.left - b.left) < 320, visible: cs.visibility !== "hidden" && r.width > 200,
          nativeInput: !!document.querySelector('input[type="date"]'), sel: (pop.querySelector(".sch-md.sel") || {}).textContent }; });
      if (!p) { fail("Go to date opens no popover"); return; }
      if (p.head !== "November 2026") fail(`the popover header is "${p.head}", expected November 2026`);
      if (p.cells !== 42 || p.arrows !== 2) fail(`the popover has ${p.cells} day cells and ${p.arrows} month arrows, expected 42 and 2`);
      // 11-11 (design master item 7): the Schedule blue #2f5bea IS --state-other-edge #2457e6 now (deltaE 1.53, visually the same).
      if (p.todayTxt !== "10" || !/rgb\(36, 87, 230\)/.test(p.todayRing || "")) fail(`today is not ringed in blue (${p.todayTxt} / ${p.todayRing})`);
      if (!/(^|,)11(,|$)/.test(p.dots) || !/(^|,)13(,|$)/.test(p.dots)) fail(`the dots do not mark days with calls (Nov 11 and 13): ${p.dots}`);
      if (!p.todayLink) fail("no Today link in the popover");
      if (!p.below || !p.visible) fail("the popover is not drawn right under the Go to date button");
      if (p.nativeInput) fail("a native <input type=date> exists");
      await shot(page, "02-go-to-date");
      await page.keyboard.press("Escape"); await wait(150);
      if (await J(() => !!document.querySelector(".sch-pop"))) fail("Esc does not close the popover");
      await click("[data-sch-goto]"); await wait(150); await page.mouse.click(5, 700); await wait(150);
      if (await J(() => !!document.querySelector(".sch-pop"))) fail("a click away does not close the popover");
      // it keeps the view: Week stays Week on the picked date
      await click("[data-sch-goto]"); await wait(150); await click('[data-sch-pickday="2026-11-23"]'); await wait(300);
      const w = await J(() => ({ view: (document.querySelector("[data-sch-view].on") || {}).textContent, title: (document.querySelector(".sch-title") || {}).textContent, pop: !!document.querySelector(".sch-pop") }));
      if (w.view !== "Week" || w.title !== "Nov 23 – 27" || w.pop) fail(`picking Nov 23 in Week gives ${w.view} / "${w.title}" (popover ${w.pop ? "still open" : "closed"}), expected Week / "Nov 23 – 27", closed`);
      await viewOf("month"); await click("[data-sch-goto]"); await wait(150); await click('[data-sch-pickday="2026-12-09"]'); await wait(300);
      const m = await J(() => ({ view: (document.querySelector("[data-sch-view].on") || {}).textContent, title: (document.querySelector(".sch-title") || {}).textContent }));
      if (m.view !== "Month" || m.title !== "December 2026") fail(`picking Dec 9 in Month gives ${m.view} / "${m.title}", expected Month / December 2026`);
      await click("[data-sch-goto]"); await wait(150); await click("[data-sch-poptoday]"); await wait(300);
      await viewOf("week");
    });

    await boot();
    await step("3 Week: real length + now line", async () => {
      const g = await J(() => { const busy = document.querySelector(".sch-grid .sch-k-busy"), now = document.querySelector(".sch-grid .sch-nowl"), wk = document.querySelector('[data-sch-call$="1"].sch-k-walkthrough');
        return { busyH: busy && busy.getBoundingClientRect().height, wkH: wk && wk.getBoundingClientRect().height, now: !!now, nowCol: now && now.closest("[data-sch-slot]").getAttribute("data-sch-slot") }; });
      if (!g.busyH || g.busyH < 62) fail(`a 90-minute Google busy block is drawn ${Math.round(g.busyH || 0)}px tall, expected about 68px (1.5 hours of 48px rows)`);
      if (!g.wkH || g.wkH > 40 || g.wkH < 15) fail(`a 30-minute walkthrough is drawn ${Math.round(g.wkH || 0)}px tall, expected about 20px`);
      if (!g.now || g.nowCol !== "2026-11-10") fail("no red now line on today's column");
      await shot(page, "03-week");
    });

    await step("3 Day", async () => {
      await click("[data-sch-step=\"1\"]"); await wait(200); await viewOf("day");
      await J(() => document.querySelector("[data-sch-today]").click()); await wait(200); await click('[data-sch-step="1"]'); await wait(300);   // Wed, Nov 11
      const d = await J(() => { const g = document.querySelector(".sch-day [data-sch-grid]"); if (!g) return null; const hrs = [...g.querySelectorAll("[data-sch-hour]")].map((e) => e.textContent.trim());
        const off = [...g.querySelectorAll(".sch-slot")].filter((e) => e.classList.contains("sch-off")).map((e) => e.getAttribute("data-h")); return { hrs: hrs.join(","), off: off.join(","), head: (g.querySelector(".sch-dh") || {}).textContent, busyH: (g.querySelector(".sch-k-busy") || { getBoundingClientRect: () => ({ height: 0 }) }).getBoundingClientRect().height,
          blocks: [...g.querySelectorAll(".sch-blk")].map((e) => e.innerText.replace(/\s+/g, " ")) }; });
      if (!d) { fail("the Day view is not an hourly grid"); return; }
      if (!/^8 AM,9 AM,/.test(d.hrs) || !/,4 PM,5 PM$/.test(d.hrs.replace(/,6 PM.*$/, ""))) fail(`Day hours are ${d.hrs}, expected one hour before and after 9 AM – 5 PM`);
      if (!/^8,/.test(d.off) || !/17/.test(d.off)) fail(`the hour before (8 AM) and after (5 PM) your hours are not shaded (shaded: ${d.off})`);
      if (!/your hours 9 AM – 5 PM PT/.test(d.head || "")) fail(`the Day header reads "${d.head}", expected "Wed 11 · your hours 9 AM – 5 PM PT"`);
      if (d.busyH < 62) fail(`Day: the 90-minute busy block is ${Math.round(d.busyH)}px tall, expected about 68px`);
      if (!d.blocks.some((b) => /Audit walkthrough · 11:00 – 11:30 AM Nathan's Towing · 2:00 PM ET for them/.test(b))) fail(`Day block lacks "Name · time range" and "person · their time": ${d.blocks.join(" // ").slice(0, 220)}`);
      await shot(page, "04-day");
      // an empty day says so
      await click('[data-sch-step="1"]'); await click('[data-sch-step="1"]'); await wait(300);   // Fri, Nov 13 has a call; go to Sat then check message on a free day
      await click('[data-sch-step="1"]'); await wait(300);
      const e = await J(() => (document.querySelector(".sch-empty-day") || {}).textContent);
      if (!/Nothing booked on Sat, Nov 14\./.test(e || "")) fail(`the empty-day sentence is "${e}"`);
      await J(() => document.querySelector("[data-sch-today]").click()); await wait(250); await click('[data-sch-step="1"]'); await click('[data-sch-step="1"]'); await click('[data-sch-step="1"]'); await wait(300);
    });

    await boot();
    await step("4 empty-time menu + Month + filters", async () => {
      // Week: click the empty Thursday 1:00 PM slot
      const pt = await J(() => { const s = document.querySelector('[data-sch-slot="2026-11-12"][data-h="13"]'); const r = s.getBoundingClientRect(); return { x: r.left + 20, y: r.top + 8 }; });
      await page.mouse.click(pt.x, pt.y); await wait(250);
      const m = await J(() => { const mn = document.querySelector(".sch-menu"); return mn && { t: mn.innerText.replace(/\s+/g, " "), vis: mn.getBoundingClientRect().width > 100 }; });
      if (!m) fail("clicking an empty time opens no menu");
      else { if (!/Block 1:00 – 1:30 PM/.test(m.t) || !/Block longer…/.test(m.t)) fail(`the empty-time menu reads "${m.t}", expected "Block 1:00 – 1:30 PM" and "Block longer…"`); if (!/clients can't book it/.test(m.t)) fail("the menu lacks \"clients can't book it\""); }
      await shot(page, "05-empty-slot-menu");
      await page.keyboard.press("Escape"); await wait(120);
      // "Block longer…" opens Block time prefilled
      await page.mouse.click(pt.x, pt.y); await wait(200); await click("[data-sch-longer]"); await wait(400);
      const pre = await J(() => ({ d: (document.querySelector("#sdDate") || {}).value, f: (document.querySelector("#sdFrom") || {}).value, t: (document.querySelector("#sdTo") || {}).value }));
      if (pre.d !== "2026-11-12" || pre.f !== "13:00") fail(`"Block longer…" opens Block time with ${JSON.stringify(pre)}, expected the clicked time prefilled (2026-11-12 13:00)`);
      await page.keyboard.press("Escape"); await wait(150);
      // Busy blocks stay under the Call and Who filters
      await J(() => { const s = document.querySelector("[data-sch-type]"); s.value = "kickoff"; s.dispatchEvent(new Event("change", { bubbles: true })); }); await wait(200);
      const b1 = await J(() => document.querySelectorAll(".sch-k-busy").length);
      await J(() => { const s = document.querySelector("[data-sch-who]"); s.value = "client"; s.dispatchEvent(new Event("change", { bubbles: true })); }); await wait(200);
      const b2 = await J(() => document.querySelectorAll(".sch-k-busy").length);
      if (!b1 || !b2) fail("Google busy blocks vanish under the Call / Who filters");
      await J(() => { for (const a of ["data-sch-type", "data-sch-who"]) { const s = document.querySelector(`[${a}]`); s.value = ""; s.dispatchEvent(new Event("change", { bubbles: true })); } }); await wait(150);
      // Day: an empty time opens the same menu
      await viewOf("day"); await J(() => document.querySelector("[data-sch-today]").click()); await wait(200); await click('[data-sch-step="1"]'); await wait(300);
      const dp = await J(() => { const s = document.querySelector('.sch-day [data-sch-slot][data-h="15"]'); const r = s.getBoundingClientRect(); return { x: r.left + 40, y: r.top + 30 }; });
      await page.mouse.click(dp.x, dp.y); await wait(250);
      const dm = await J(() => (document.querySelector(".sch-menu") || {}).innerText);
      if (!/Block 3:30 – 4:00 PM/.test(dm || "")) fail(`Day: the lower half of the 3 PM row gives "${(dm || "").replace(/\n/g, " ")}", expected "Block 3:30 – 4:00 PM"`);
      await page.keyboard.press("Escape"); await wait(100);
      // Month: counts by call name; a click opens Day
      await viewOf("month");
      const chips = await J(() => [...document.querySelectorAll('[data-sch-day="2026-11-11"] .sch-chip')].map((c) => c.textContent).join("|"));
      if (!/Busy 1/.test(chips) || !/Walkthrough 1/.test(chips) || !/Review 1/.test(chips)) fail(`Month, Nov 11 shows "${chips}", expected counts by call name (Busy 1, Walkthrough 1, Review 1)`);
      await shot(page, "06-month");
      await click('[data-sch-day="2026-11-11"]'); await wait(250);
      if (!(await J(() => !!document.querySelector(".sch-day [data-sch-grid]")))) fail("a Month day does not open that day in Day");
    });

    await boot();
    await step("5 Set your hours", async () => {
      await click("[data-sch-hours]"); await wait(450);
      const h = await J(() => { const o = document.querySelector(".rga-modal-overlay"); if (!o) return null; const cs = getComputedStyle(o), r = o.querySelector(".rga-modal").getBoundingClientRect();
        const ids = ["sdFirst", "sdEnd", "sdTz", "sdLen", "sdGap", "sdAhead", "sdFar"].map((i) => !!document.getElementById(i)); const lbl = [...o.querySelectorAll("label.sd-f")].map((l) => l.firstChild.textContent.trim());
        return { opacity: cs.opacity, shown: o.classList.contains("show"), box: r.width > 300 && r.height > 200, ids: ids.every(Boolean), days: o.querySelectorAll("#sdDays input").length, checked: [...o.querySelectorAll("#sdDays input:checked")].map((i) => i.value).join(""), title: (o.querySelector(".rga-modal-title") || {}).textContent,
          intro: (o.querySelector(".rga-modal-msg") || {}).textContent, kind: (o.querySelector(".rga-modal-kind") || {}).textContent, lbl, tz: (document.getElementById("sdTz") || {}).value, len: (document.getElementById("sdLen") || {}).value, far: (document.getElementById("sdFar") || {}).value }; });
      if (!h) { fail("Set your hours opens no dialog"); return; }
      if (h.opacity !== "1" || !h.shown || !h.box) fail(`Set your hours is not visible (computed opacity ${h.opacity}, .show ${h.shown})`);
      if (h.title !== "Your hours for every call") fail(`the hours dialog title is "${h.title}"`);
      if (!/kickoff call, Month 1 review, monthly check-in, quarterly review/.test(h.intro || "")) fail("the hours dialog does not say it governs every call");
      if (!/INTERNAL/.test(h.kind || "")) fail("the hours dialog is not the INTERNAL blue kind");
      if (!h.ids || h.days !== 7 || h.checked !== "12345") fail(`the hours dialog does not show every rule (fields ${h.ids}, days ${h.days}, on ${h.checked})`);
      if (!["Start", "End", "Time zone", "Call length", "Gap between calls", "Earliest a client can book", "Furthest ahead"].every((x) => h.lbl.includes(x))) fail(`hours labels are ${h.lbl.join(", ")}`);
      if (h.tz !== "America/Los_Angeles" || h.len !== "30" || h.far !== "14") fail(`the dialog shows zone ${h.tz}, length ${h.len}, furthest ${h.far}; the stored rules are Los Angeles / 30 / 14`);
      await shot(page, "07-set-your-hours");
      await J(() => { const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event("change", { bubbles: true })); }; set("sdTz", "America/New_York"); set("sdLen", "45"); set("sdGap", "10"); set("sdFar", "21"); set("sdEnd", "18"); });
      await click('[data-sd="ok"]'); await wait(500);
      const body = (posts.filter((p) => p.fn === "kickoff-availability-rules").pop() || {}).body;
      const r = body && body.rules;
      if (!r) fail("saving the hours posts nothing");
      else { for (const k of ["days", "firstHour", "lastHour", "tz", "slotMinutes", "bufferMinutes", "minNoticeHours", "horizonDays"]) if (r[k] === undefined) fail(`the hours save leaves out ${k} (the server would reset it)`);
        if (r.tz !== "America/New_York" || r.slotMinutes !== 45 || r.bufferMinutes !== 10 || r.horizonDays !== 21 || r.lastHour !== 17) fail(`the hours save sent ${JSON.stringify(r)}, expected the edited zone, length, gap, furthest and End 6 PM (lastHour 17)`); }
      const t = await J(() => ({ toast: (document.querySelector(".sd-toast") || {}).textContent, gone: !document.querySelector(".rga-modal-overlay") }));
      if (!/Saved\. Every picker uses these hours now, and the grid redrew\./.test(t.toast || "")) fail(`no "Saved" toast after saving the hours ("${t.toast}")`);
      if (!t.gone) fail("the hours dialog stays open after Save");
    });

    await boot();
    await step("6 Block time", async () => {
      await click("[data-sch-block]"); await wait(450);
      const b = await J(() => { const o = document.querySelector(".rga-modal-overlay"); if (!o) return null; return { opacity: getComputedStyle(o).opacity, title: (o.querySelector(".rga-modal-title") || {}).textContent, lbl: [...o.querySelectorAll("label.sd-f")].map((l) => l.firstChild.textContent.trim()).join("|"), kind: (o.querySelector(".rga-modal-kind") || {}).textContent, note: (o.querySelector(".rga-modal-msg") || {}).textContent }; });
      if (!b) { fail("Block time opens no dialog"); return; }
      if (b.opacity !== "1") fail("the Block time dialog is not visible");
      if (b.lbl !== "Date|From|To|Label (only you see it)" ) fail(`Block time fields are "${b.lbl}", expected Date, From, To, Label (only you see it)`);
      if (!/Times are Pacific \(PT\)\. Clients never see the label/.test(b.note || "")) fail("Block time lacks the Pacific / label sentence");
      const set = (id, v) => J((i, x) => { const e = document.getElementById(i); e.value = x; e.dispatchEvent(new Event("input", { bubbles: true })); }, id, v);
      await set("sdDate", "2026-11-11"); await set("sdFrom", "13:30"); await set("sdTo", "14:30"); await wait(150);
      const w = await J(() => ({ txt: (document.getElementById("sdWarn") || {}).textContent, hid: (document.getElementById("sdWarn") || {}).hidden, ok: document.querySelector('[data-sd="ok"]').textContent }));
      if (w.hid || !/Beta Roofing has a Month 1 review at 2:00 PM\. Block around it\?/.test(w.txt || "")) fail(`no overlap warning against a booked call ("${w.txt}")`);
      await shot(page, "08-block-time");
      await set("sdDate", "2026-11-12"); await set("sdFrom", "12:00"); await set("sdTo", "13:00"); await set("sdLabel", "Lunch"); await wait(120);
      await click('[data-sd="ok"]'); await wait(500);
      const k = (posts.filter((p) => p.fn === "kickoff-requests").pop() || {}).body;
      if (!k) fail("Block does not post");
      else if (k.start !== "2026-11-12T20:00:00.000Z" || k.end !== "2026-11-12T21:00:00.000Z") fail(`12:00 – 1:00 PM on Nov 12 was sent as ${k.start} – ${k.end}; read as Pacific it is 20:00Z – 21:00Z (the browser here is in Tokyo)`);
      else if (k.note !== "Lunch") fail("the Label is not sent as the note");
      const t = await J(() => ({ t: (document.querySelector(".sd-toast") || {}).textContent, undo: !!document.querySelector(".sd-undo") }));
      if (!/Blocked Thu, Nov 12, 12:00 – 1:00 PM/.test(t.t || "") || !t.undo) fail(`the toast reads "${t.t}" (Undo ${t.undo}), expected "Blocked Thu, Nov 12, 12:00 – 1:00 PM" with Undo`);
      await shot(page, "09-block-toast");
    });

    await boot();
    await step("7 panels", async () => {
      const panel = async (id) => { await J((i) => document.querySelector(`[data-sch-call="${i}"]`).click(), id); await wait(120); return J(() => { const p = document.querySelector(".sch-panel"); if (!p) return null; return { title: (p.querySelector(".sch-pch b") || {}).textContent, pill: (p.querySelector(".sch-v") || {}).textContent, body: p.innerText.replace(/\s+/g, " "), btns: [...p.querySelectorAll(".sch-acts a, .sch-acts button")].map((b) => b.textContent.trim()), hrefs: [...p.querySelectorAll(".sch-acts a")].map((a) => a.getAttribute("href")) }; }); };
      await viewOf("week"); await J(() => document.querySelector("[data-sch-today]").click()); await wait(200);
      const bk = await panel(`${U}1`);
      if (!bk) fail("a booked call opens no panel");
      else { if (bk.btns.join("|") !== "Open Meet|Open the console|Lead in Calls|Reschedule|Cancel") fail(`booked panel buttons are "${bk.btns.join("|")}", expected Open Meet | Open the console | Lead in Calls | Reschedule | Cancel`);
        if (bk.pill !== "Booked" || !/Wed, Nov 11 · 11:00 AM PT/.test(bk.body) || !/2:00 PM ET for them/.test(bk.body)) fail(`booked panel header/when is "${bk.pill}" / ${bk.body.slice(0, 120)}`);
        if (!/Reminders Email 24 h and 1 h before/.test(bk.body)) fail("the booked panel lacks the Reminders row"); }
      await shot(page, "10-panel-booked");
      // Reschedule / Cancel: the ORANGE dialog; never confirmed
      await click("[data-sch-resched]"); await wait(500);
      const rs = await J(() => { const o = document.querySelector(".rga-modal-overlay"); if (!o) return null; const m = o.querySelector(".rga-modal"); return { turn: m.classList.contains("is-turn"), kind: (o.querySelector(".rga-modal-kind") || {}).textContent, title: (o.querySelector(".rga-modal-title") || {}).textContent, slots: [...o.querySelectorAll(".sd-slot")].map((b) => b.textContent.trim()), btns: [...o.querySelectorAll(".rga-modal-btn")].map((b) => b.textContent.trim()), border: getComputedStyle(m).borderTopColor, op: getComputedStyle(o).opacity, say: (o.querySelector("#sdSay") || {}).textContent }; });
      if (!rs) fail("Reschedule opens no dialog");
      else { if (!rs.turn || !/THIS REACHES THE CLIENT/.test(rs.kind) || !/rgb\(180, 83, 9\)|rgb\(.+\)/.test(rs.border)) fail(`Reschedule is not the orange "This reaches the client" dialog (${rs.kind})`);
        if (rs.title !== "Move Nathan's Towing's walkthrough?") fail(`Reschedule title is "${rs.title}"`);
        if (rs.slots.length !== 4 || rs.slots[3] !== "Other…") fail(`Reschedule offers ${rs.slots.join(" | ")}, expected 3 open times plus Other…`);
        if (rs.btns.join("|") !== "Keep the time|Move it and send") fail(`Reschedule buttons are ${rs.btns.join("|")}`);
        if (!/^Nathan's Towing gets an updated Google invite for Thu, Nov 12, 10:00 AM PT/.test(rs.say || "")) fail(`Reschedule explains: "${rs.say}"`); }
      await shot(page, "11-reschedule-orange");
      await click('[data-sd="cancel"]'); await wait(200);
      await click("[data-sch-cancel]"); await wait(450);
      const cn = await J(() => { const o = document.querySelector(".rga-modal-overlay"); return o && { turn: o.querySelector(".rga-modal").classList.contains("is-turn"), title: o.querySelector(".rga-modal-title").textContent, btns: [...o.querySelectorAll(".rga-modal-btn")].map((b) => b.textContent.trim()).join("|") }; });
      if (!cn || !cn.turn || cn.btns !== "Keep the call|Cancel it and send") fail(`Cancel is not the orange dialog with "Keep the call | Cancel it and send" (${JSON.stringify(cn)})`);
      await click('[data-sd="cancel"]'); await wait(200);
      // past / held
      await click('[data-sch-step="-1"]'); await wait(300);
      const past = await panel(`${U}3`);
      if (!past) fail("a past call opens no panel");
      else { if (past.pill !== "Held") fail(`the past call's pill is "${past.pill}", expected Held`);
        for (const w of ["Outcome Held · moving to monthly check-ins", "Length 28 min", "Notes Wants more review asks in December."]) if (!past.body.includes(w)) fail(`the past call's panel lacks "${w}"`);
        if (past.btns.join("|") !== "Client page|Their portal") fail(`past client panel buttons are "${past.btns.join("|")}", expected Client page | Their portal`);
        if (past.hrefs.length === 2 && past.hrefs[0] === past.hrefs[1]) fail('"Client page" and "Their portal" are the SAME link'); }
      await shot(page, "12-panel-past");
      await click('[data-sch-step="1"]'); await wait(300);
      const bl = await panel(`${U}2`);
      if (!bl || bl.btns.join("|") !== "Change time|Unblock" || bl.pill !== "Blocked") fail(`a blocked block's panel is ${JSON.stringify(bl && { pill: bl.pill, btns: bl.btns })}, expected Blocked: Change time | Unblock`);
      await shot(page, "13-panel-blocked");
      const by = await panel("busy:0");
      if (!by || by.btns.join("|") !== "Open Google Calendar" || !/Why no title RGA reads busy or free only, never what the meeting is\./.test(by.body) || by.pill !== "Busy") fail(`the busy block's panel is ${JSON.stringify(by && { pill: by.pill, btns: by.btns })}, expected Busy: Open Google Calendar, no details`);
      await shot(page, "14-panel-busy");
      // after the start: No-show + Held; before it: neither
      const st = await panel(`${U}5`);
      if (!st || !st.btns.includes("No-show") || !st.btns.includes("Held")) fail(`a call that has started shows ${st && st.btns.join("|")}, expected No-show and Held`);
      const fu = await panel(`${U}4`);
      if (fu && (fu.btns.includes("No-show") || fu.btns.includes("Held"))) fail("No-show / Held show before the call has started");
      if (sent.length) fail(`the gate caused ${sent.length} send(s) (${sent.join(", ")}); nothing may ever be sent`);
    });

    await step("8 status lines", async () => {
      await boot(answer({ alerts: { callNow: [{ id: `${U}1`, who: "Nathan's Towing", phone: "(424) 555-0142", kind: "walkthrough", lead_ref: "L1", starts_at: "2026-11-11T03:27:00Z", name: "Audit walkthrough" }], agreementUnsigned: [{ contract_id: "k1", client_id: "cl9", who: "Gamma HVAC", opened_at: "2026-11-10T01:00:00Z", reminded_at: "2026-11-10T17:00:00Z" }] } }));
      const s = await J(() => [...document.querySelectorAll(".sch-stat")].map((e) => ({ t: e.innerText.replace(/\s+/g, " "), dot: (e.querySelector(".sch-dotc") || {}).className })));
      const g = s.find((x) => /Google Calendar connected/.test(x.t));
      if (!g || !/as hello@rocketgrowthagency\.com/.test(g.t) || !/Read 7:31 PM · 1 busy time this week/.test(g.t) || !/Check again/.test(g.t) || !/ g$/.test(g.dot)) fail(`the Google line is "${g && g.t}"`);
      const tx = s.find((x) => /Texts are off/.test(x.t));
      if (!tx || !tx.t.includes("Texts are off: the Quo key works; texting turns on after (424) 242-2040's carrier registration is confirmed") || !/Reminder emails go out meanwhile/.test(tx.t) || !/What's needed/.test(tx.t)) fail(`the Texts line is "${tx && tx.t}"`);
      const cn = s.find((x) => /Call them now/.test(x.t));
      if (!cn || !/Call them now · Nathan's Towing · audit walkthrough started 5 min ago, not opened in the console/.test(cn.t) || !/ r$/.test(cn.dot) || !/Open the console/.test(cn.t)) fail(`the Call them now line is "${cn && cn.t}"`);
      const ag = s.find((x) => /agreement/.test(x.t));
      if (!ag || !/Gamma HVAC opened the agreement 26 hours ago and hasn't signed/.test(ag.t) || !/One reminder email went out Nov 10, 9:00 AM/.test(ag.t)) fail(`the agreement line is "${ag && ag.t}"`);
      await shot(page, "15-status-lines");
      // a reminder that did NOT go out is never claimed
      await boot(answer());
      const ag2 = await J(() => [...document.querySelectorAll(".sch-stat")].map((e) => e.innerText.replace(/\s+/g, " ")).find((t) => /agreement/.test(t)));
      if (/One reminder email went out/.test(ag2 || "") || !/No reminder email has gone out yet/.test(ag2 || "")) fail(`the agreement line claims a reminder that did not go out: "${ag2}"`);
      // a failed Google read is red and says so; a refused Quo key says so
      await boot(answer({ busy: null, busyError: "Couldn't read your Google busy times just now", quoKey: "refused", texts: { on: false, why: "Quo key refused" } }));
      const bad = await J(() => [...document.querySelectorAll(".sch-stat")].map((e) => ({ t: e.innerText.replace(/\s+/g, " "), dot: (e.querySelector(".sch-dotc") || {}).className })));
      const gb = bad.find((x) => /Google/.test(x.t));
      if (!gb || !/ r$/.test(gb.dot) || !/Couldn't read/.test(gb.t)) fail(`a failed Google read is not a red line ("${gb && gb.t}")`);
      if (!bad.some((x) => /^Quo key refused/.test(x.t))) fail('a refused Quo key does not say "Quo key refused"');
    });

    await step("9 badge", async () => {
      await boot(answer({ today: 2 }));
      let b = await J(() => { const e = document.getElementById("scheduleNavBadge"); return { txt: e.textContent, hid: e.hidden, red: e.classList.contains("mv-late-badge") }; });
      if (b.txt !== "2" || b.hid || b.red) fail(`the badge shows "${b.txt}" (hidden ${b.hid}), expected 2 for two calls still ahead today`);
      await boot(answer({ today: 2, alerts: { callNow: [{ id: `${U}1`, who: "x", kind: "walkthrough", starts_at: "2026-11-11T03:20:00Z", name: "Audit walkthrough" }], agreementUnsigned: [] } }));
      b = await J(() => { const e = document.getElementById("scheduleNavBadge"); return { txt: e.textContent, hid: e.hidden, red: e.classList.contains("mv-late-badge"), bg: getComputedStyle(e).backgroundColor }; });
      if (b.txt !== "!" || !b.red) fail(`with a Call them now open the badge shows "${b.txt}" (red ${b.red}), expected a red "!"`);
      const src = fs.readFileSync(path.join(root, "admin/admin.js"), "utf8");
      if (!/setScheduleBadge\(state\.todoCalls\)/.test(src)) fail("the To do loader does not set the badge (it is empty until the Schedule is opened)");
      if (/const today = new Date\(\)\.toISOString\(\)\.slice\(0, 10\), tm/.test(src)) fail("the To do window is still computed in UTC");
    });

    // ── v6 leftovers (11-11): history gaps on System health, Recap row, console stamp from Calls, callbacks on the Schedule, M1/monthly/quarterly reminders, quarterly SQL ──
    await step("10 leftovers", async () => {
      const rd = (p) => { try { return fs.readFileSync(path.join(root, p), "utf8"); } catch { return ""; } };
      const rem = rd("netlify/functions/call-reminders.js"), manifest = rd("netlify/functions/_job-manifest.js"), data = rd("netlify/functions/schedule-data.js"), sch = rd("admin/schedule.js"), calls = rd("admin/calls.js");
      const slots = rd("netlify/functions/_kickoff-slots.js"), recap = rd("netlify/functions/send-kickoff-recap.js"), sql = rd("docs/supabase/SCHEDULE_V6B_2026-11-11.sql");
      // 1 a booking whose rga_calls write failed reaches System health (the call-reminders job already on the card)
      if (!/async function historyGapPass/.test(rem) || !/kickoff_slot_holds\?slot_start/.test(rem) || !/rga_calls\?starts_at/.test(rem)) fail("call-reminders does not compare the booking ledger with rga_calls (a failed history write would go unseen)");
      if (!/if \(!out\.needsSql\) \{ try \{ await historyGapPass\(now, out\)/.test(rem)) fail("the reminder run never calls the history check");
      if (!/historyGaps/.test(manifest) || !/missing from call history/.test(manifest)) fail("System health's call-reminders line does not say a booking is missing from call history");
      // 2 the Recap row
      if (!/recap_sent_at: c\.recap_at/.test(data)) fail("schedule-data does not return recap_sent_at from rga_calls.recap_at");
      if (!/row\("Recap", `Sent /.test(sch)) fail('the past-call panel has no "Recap · Sent <date>" row');
      if (!/recap_at: sentAt/.test(recap)) fail("sending the recap does not stamp rga_calls.recap_at, so the Recap row would never show");
      // 3 the console from the Calls tab stamps console_opened_at (through the same endpoint)
      const wtOpen = calls.slice(calls.indexOf("data-wt-open]"), calls.indexOf("data-wt-open]") + 1400);
      if (!/schedule-call-action/.test(wtOpen) || !/action: "console"/.test(wtOpen)) fail("opening the walkthrough console from the Calls tab does not stamp console_opened_at");
      // 4 scheduled callbacks: gray Intro call blocks on the Schedule and blocked in freeSlots
      if (!/callbackIntervals/.test(data) || !/kind: "intro"/.test(data) || !/callbacksError/.test(data)) fail("schedule-data does not add scheduled callbacks as Intro call blocks (or hides a failed read)");
      if (!/callbackIntervals\(from\.getTime\(\), to\.getTime\(\)\)/.test(slots)) fail("freeSlots does not keep a scheduled callback's time out of the pickers");
      if (!/d\.callbacksError/.test(sch)) fail("a failed callbacks read is not said on the Schedule");
      try {
        const req = loader(root);
        const { callbackIntervals } = req("./netlify/functions/_callback-slots.js");
        const got = await callbackIntervals(Date.parse("2026-11-12T00:00:00Z"), Date.parse("2026-11-14T00:00:00Z"), async () => [{ id: "a", business: "A Plumbing", phone: "1", due: "2026-11-12", time: { h: 14, min: 30 } }, { id: "b", business: "No time", phone: "2", due: "2026-11-12", time: null }, { id: "c", business: "Far", phone: "3", due: "2026-12-30", time: { h: 9, min: 0 } }]);
        if (got.length !== 1 || new Date(got[0].start).toISOString() !== "2026-11-12T22:30:00.000Z" || got[0].end - got[0].start !== 30 * 60000) fail(`a callback at 2:30 PM PT on Nov 12 is not the 30-minute block 22:30Z (got ${JSON.stringify(got.map((g) => new Date(g.start).toISOString()))})`);
        let q = null; try { q = req("./netlify/functions/sales-call-queue.js")._test; } catch { /* needs env */ }
        if (q) {
          const t = q.callbackTime("[2026-11-10] [call] Callback scheduled — callback 2026-11-12: callback at 2:30 PM PT"), t2 = q.callbackTime("[x] [call] Callback scheduled: nice (callback 12:05 AM PT)"), t3 = q.callbackTime("[x] [call] Callback scheduled — callback 2026-11-12");
          if (!t || t.h !== 14 || t.min !== 30) fail("callbackTime does not read 2:30 PM from the note");
          if (!t2 || t2.h !== 0 || t2.min !== 5) fail("callbackTime reads 12:05 AM wrong");
          if (t3) fail("callbackTime invents a time from the date");
        } else if (!/function callbackTime/.test(rd("netlify/functions/sales-call-queue.js"))) fail("sales-call-queue has no callbackTime");
      } catch (e) { fail(`callback slots do not run: ${String(e.message).slice(0, 120)}`); }
      // 5 Month 1 review, monthly check-in and quarterly review reminders: 24 h and 1 h, once each, dry-run, no "no reminder" line
      try {
        const C = loader(root)("./netlify/functions/_call-reminders.js");
        for (const kind of ["m1_review", "monthly", "quarterly"]) {
          const start = new Date(Date.now() + 23 * 3600000).toISOString(), created = new Date(Date.now() - 5 * 86400000).toISOString();
          const d1 = C.dueEmails({ kind, status: "booked", starts_at: start, created_at: created }, new Date(), new Set());
          if (d1.join() !== "email_24h") fail(`${kind}: a call 23 hours out should be due email_24h, got [${d1}]`);
          const soon = new Date(Date.now() + 40 * 60000).toISOString();
          if (C.dueEmails({ kind, status: "booked", starts_at: soon, created_at: created }, new Date(), new Set(["email_24h"])).join() !== "email_1h") fail(`${kind}: a call 40 minutes out should be due email_1h`);
          if (C.dueEmails({ kind, status: "booked", starts_at: soon, created_at: created }, new Date(), new Set(["email_24h", "email_1h"])).length) fail(`${kind}: a reminder already sent would go out again`);
          for (const k of ["email_24h", "email_1h"]) {
            const m = C.reminderEmail({ kind, starts_at: start }, k, { business: "Beta Roofing", name: "Sam Lee", theirTz: "America/New_York", forClient: true }), t = `${m.subject}\n${m.markup}`;
            if (/—/.test(t)) fail(`${kind} ${k} email has an em dash`);
            if (!/Month 1 review|monthly check-in|quarterly review/.test(t)) fail(`${kind} ${k} email does not name the call`);
          }
        }
      } catch (e) { fail(`call reminders do not run: ${String(e.message).slice(0, 120)}`); }
      if (!/C\.EMAIL_KINDS\.join/.test(rem)) fail("the reminder job still reads only walkthroughs and kickoffs");
      if (!/dry_run === true/.test(rem) || !/if \(dry\) \{ out\.wouldSend/.test(rem)) fail("the reminder job has no dry run (nothing may be sent while building)");
      if (rem.indexOf("if (dry) { out.wouldSend") > rem.indexOf("R.claimReminder(call.id, kind)")) fail("the dry run comes after the claim, so a dry run would write the ledger");
      if (/No reminder email goes out for this call yet/.test(sch)) fail('the panel still says "No reminder email goes out for this call yet"');
      // 6 the quarterly review's purpose needs the database check to allow it: the SQL file says so (the portal picker waits for it)
      if (!/check \([^;]*'m3_quarterly'[^;]*\)/.test(sql) || !/kickoff_slot_holds_purpose_check/.test(sql) || !/'walkthrough'/.test(sql) || !/'m2_monthly'/.test(sql)) fail("SCHEDULE_V6B_2026-11-11.sql does not extend the purpose check with m3_quarterly (and keep the others)");
      // 7 THE QUARTERLY REVIEW BOOKS (item 6, 11-11): purpose, portal picker + skip, the Schedule's Reschedule / Cancel, the rga_calls kind
      const pur = rd("netlify/functions/_call-purpose.js"), por = rd("portal/portal.js"), choice = rd("netlify/functions/portal-step-choice.js"), bk = rd("netlify/functions/portal-book-kickoff.js"), inv = rd("netlify/functions/send-kickoff-invite.js"), dlg = rd("admin/schedule-dialogs.js"), rc = rd("netlify/functions/_rga-calls.js");
      try {
        const P = loader(root)("./netlify/functions/_call-purpose.js"), q = P.purposeOf("m3_quarterly");
        if (!q || q.id !== "m3_quarterly") fail("_call-purpose has no m3_quarterly purpose");
        else {
          if (q.stamp !== "quarterly_invite" || q.stamp === P.PURPOSES.m2_monthly.stamp) fail("the quarterly review does not keep its own invite field");
          if (q.title("Beta Roofing") !== "Quarterly review: Beta Roofing and Rocket Growth Agency") fail(`the quarterly review's title is "${q.title("Beta Roofing")}"`);
          if (/—/.test(q.title("Beta Roofing")) || q.requestPrefix === P.PURPOSES.m2_monthly.requestPrefix) fail("the quarterly review shares or breaks the request id / title rules");
        }
        const R = loader(root)("./netlify/functions/_rga-calls.js");
        if (!R.PURPOSE_OF || R.PURPOSE_OF.quarterly !== "m3_quarterly") fail("a quarterly booking does not get rga_calls kind quarterly (PURPOSE_OF has no quarterly)");
      } catch (e) { fail(`the quarterly purpose does not load: ${String(e.message).slice(0, 100)}`); }
      if (!/m3_quarterly: "quarterly"/.test(data)) fail("schedule-data does not show an m3_quarterly hold as a quarterly review");
      if (!/purpose\.id === "m3_quarterly"\s*\?\s*"30-minute quarterly review\./.test(inv) || /30-minute quarterly review[^"]*—/.test(inv)) fail("the quarterly review's invite has no description of its own");
      if (!/purpose\.id === "m3_quarterly"[\s\S]{0,700}isQuarterMonth/.test(bk) || !/isManaged/.test(bk.slice(bk.indexOf('purpose.id === "m3_quarterly"')))) fail("portal-book-kickoff lets a quarterly review be booked outside months 3, 6, 9, 12 or by a self-serve client");
      if (!/skip_quarterly === true/.test(choice) || !/unskip_quarterly/.test(choice) || !/quarterly_skip/.test(choice) || !/isQuarterMonth/.test(choice)) fail("the quarterly review cannot be skipped and un-skipped from the portal");
      if (!/quarterly: "m3_quarterly"/.test(dlg)) fail("the Schedule cannot Reschedule or Cancel a quarterly review through the client path");
      if (/quarterly review is moved from the client page/i.test(sch)) fail('the panel still says "A quarterly review is moved from the client page."');
      if (!/Book your quarterly review/.test(por) || !/closeCallHtml\(null, null, clientId, null, "m3_quarterly"\)/.test(por)) fail("the portal's This quarter group does not offer the quarterly review through the shared picker");
      if (!/function ogMonthListHtml[\s\S]{0,1400}if \(q\) out \+= ogMGroup\("This quarter"\)[\s\S]{0,500}ogQuarterlyHtml/.test(por)) fail("the quarterly booking is not drawn only in quarter months, inside This quarter");
      if (!/data-og-qskip="skip"/.test(por) || !/data-og-qskip="undo"/.test(por) || !/is-busy/.test(por.slice(por.indexOf("[data-og-qskip]")))) fail("the quarterly review has no spinning Skip this quarter / Book it after all");
      if (!/ccPurpose = \(k\) => [^;]*"~m3"[^;]*"m3_quarterly"/.test(por) || !/purpose: ccPurpose\(clientId\)/.test(por)) fail("the quarterly picker does not book through portal-book-kickoff with purpose m3_quarterly");
      { const text = por.slice(por.indexOf("m3_quarterly: { name")); const seg = text.slice(0, text.indexOf("};")); if (/—/.test(seg)) fail("the quarterly review's client text has an em dash"); }
      // 8 CONFIRM A REQUESTED CALL (11-11): the client page and the Schedule panel both confirm a requested quarterly review through kickoff-requests (purpose from the held row), orange dialog, spinning, Google's invite is the notice
      { const adm = rd("admin/admin.js"), cf = dlg.slice(dlg.indexOf("export function openConfirmDialog")), cfEnd = cf.slice(0, cf.indexOf("export function openCancelDialog"));
        if (!/data-purpose="\$\{purpose\}"/.test(adm) || !/purpose === "m2_monthly" \|\| purpose === "m3_quarterly"/.test(adm)) fail("the client page does not draw a quarterly review request card");
        if (!/quarterly = purpose === "m3_quarterly"/.test(adm) || !/quarterly \? "quarterly review"/.test(adm)) fail("the client page's Confirm does not call it the quarterly review");
        if (!/closeoutAdminHtml\("m3_quarterly"\)/.test(adm)) fail("the client page never shows the quarterly review request");
        if (!/data-cc-answer="confirm"/.test(adm)) fail("the client page has no Confirm for a requested call");
        if (!/export const canConfirm = [^;]*c\.status === "requested"[^;]*CLIENT_PURPOSE\[c\.kind\]/.test(dlg)) fail("the Schedule cannot tell a requested client call (kickoff, Month 1, monthly, quarterly) from any other");
        if (!/tone: "outward"/.test(cfEnd) || !/Confirm \$\{CALL_TITLE\[c\.kind\] \|\| "call"\} for \$\{who\}\?/.test(cfEnd) || !/okLabel: "Confirm and send"/.test(cfEnd)) fail("the Schedule's Confirm is not the orange 'Confirm <call> for <business>?' dialog with 'Confirm and send'");
        if (!/gets a Google invite for \$\{esc\(day\(c\.starts_at\)\)\}, \$\{esc\(clock\(c\.starts_at\)\)\} PT/.test(cfEnd) || !/for them/.test(cfEnd)) fail("the Confirm dialog does not say who gets which invite, in PT and their time");
        if (!/post\(token, "kickoff-requests", \{ client_id: c\.client_id, start: c\.starts_at, action: "confirm" \}\)/.test(cfEnd)) fail("the Schedule's Confirm does not go through kickoff-requests like the client page");
        if (/—/.test(cfEnd)) fail("the Confirm dialog has an em dash");
        if (!/Quarterly review/.test(dlg) || !/quarterly: "Quarterly review"/.test(dlg)) fail("the Confirm dialog has no name for the quarterly review");
        if (!/data-sch-confirm/.test(sch) || !/openConfirmDialog\(S\.token, cur\)/.test(sch) || !/c\.status === "requested" && !past && canConfirm\(c\)/.test(sch)) fail("a requested call's panel has no Confirm button");
        if (!/\(c\.status === "booked" \|\| c\.status === "requested"\) && !past && canMove\(c\)/.test(sch)) fail("a requested call's panel lost Reschedule and Cancel");
        const ko = rd("netlify/functions/kickoff-requests.js");
        if (!/purpose: req\[0\]\.purpose \|\| "kickoff"/.test(ko)) fail("kickoff-requests does not confirm with the requested call's own purpose (a quarterly confirm would send a kickoff)");
        if (!/sendUpdates=all/.test(inv)) fail("the invite no longer emails the client (sendUpdates=all)"); }
    });

    if (errs.length) fail(`page errors: ${errs.slice(0, 2).join("; ")}`);
  } catch (e) { fail(`could not render: ${String(e.message).slice(0, 160)}`); }
  finally { await browser.close(); srv.close(); }
  return F;
}
await runGate({ name: "check-schedule-system-v6", beforeRev: BEFORE, checkTree, minBefore: 10 });
