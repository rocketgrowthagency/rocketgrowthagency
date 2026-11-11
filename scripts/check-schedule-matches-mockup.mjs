#!/usr/bin/env node
// check-schedule-matches-mockup.mjs: THE LIVE SCHEDULE TAB MUST LOOK LIKE THE APPROVED MOCKUP (master_schedule_v1 B / B2 / B3 / B5 / C), not just contain the same words.
// Renders the REAL admin/schedule.js + admin/admin.css in headless Chrome (puppeteer, static server, fake schedule-data answer, clock fixed to 2026-11-10 PT) and asserts:
//   one admin card; Day/Week/Month pills (active filled blue); human range "Nov 9 – 13" (never an ISO date); a "Go to date…" pill and NO visible <input type=date>;
//   the Week is an HOURLY grid (hour rows from the workspace rules, working-day columns only, calls as coloured blocks with name + person, grey Busy, amber Blocked · note);
//   colours: walkthrough blue, kickoff green, Month 1 / monthly / quarterly ONE purple, blocked amber, busy grey, intro grey-blue (blocks AND legend);
//   Day = list rows (time, bar, "Name · person", small line with both zones, tag); Month = day cells with "N calls", a click opens that day;
//   the click panel buttons (prospect: Open the console / Call card / Join Meet / Reschedule; client: Open the console / Client page / Their portal / Join Meet);
//   controls use admin-button / admin-button-secondary and styled selects; the Google banner is the amber warn card with its button; texts-off is a quiet line;
//   ABSENCE: no old day boxes (.sch-col), no .mod-alt controls, no "Week of", no ISO date text, no unstyled select, no visible date input;
//   "Showing" only with 2+ staff.
// (v6, 11-10: Day is the hourly grid, Month shows chips by call name, Go to date is a popover, the panel has Open Meet / Reschedule / Cancel; the old assertions for the list Day and the native picker were retired.)
// PROVES ITSELF (LIVE_BEFORE): it MUST fail on the website as it was before this build (default ab370a9e) in 10+ places, else exit 2 INDETERMINATE.
//   node scripts/check-schedule-matches-mockup.mjs [--against=<rev>] [--no-before] [--shot=<png>]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { runGate } from "./lib/site-rev.mjs";

const BEFORE = "ab370a9e";
const SHOT = (process.argv.find((a) => a.startsWith("--shot=")) || "").slice(7);
const NOW = Date.parse("2026-11-10T20:00:00Z"); // Tue Nov 10 2026, noon PT
const call = (id, kind, start, mins, o = {}) => ({ id, kind, status: "booked", starts_at: start, ends_at: new Date(Date.parse(start) + mins * 60000).toISOString(), owner_id: null, client_id: null, lead_ref: null, person: "prospect", who: "", phone: null, meet_link: null, outcome: null, both: null, ...o });
const CALLS = [
  call("c1", "kickoff", "2026-11-09T18:00:00Z", 30, { person: "client", client_id: "cl1", who: "Acme Plumbing", meet_link: "https://meet.google.com/aaa", both: "10:00 AM PT · 1:00 PM ET for them" }),
  call("c2", "blocked", "2026-11-10T20:00:00Z", 60, { person: null, who: "Lunch" }),
  call("c3", "walkthrough", "2026-11-10T22:00:00Z", 30, { who: "Relate Dental", phone: "(310) 555-0100", lead_ref: "L1", meet_link: "https://meet.google.com/bbb", both: "2:00 PM PT · 5:00 PM ET for them" }),
  call("c4", "monthly", "2026-11-12T22:00:00Z", 20, { person: "client", client_id: "cl2", who: "Rocket Growth Agency", meet_link: "https://meet.google.com/ccc" }),
  call("c5", "walkthrough", "2026-11-13T18:00:00Z", 30, { who: "Nathan's Towing", phone: "(310) 555-0101", lead_ref: "L2" }),
  call("c6", "m1_review", "2026-11-11T23:00:00Z", 30, { person: "client", client_id: "cl3", who: "Beta Roofing" }),
  call("c7", "quarterly", "2026-11-11T21:00:00Z", 30, { person: "client", client_id: "cl4", who: "Gamma HVAC" }),
  call("c8", "intro", "2026-11-12T19:00:00Z", 15, { who: "Delta Lawn" }),
];
const ANSWER = (staff = 1) => ({ ok: true, history: true, historyNote: null, hours: { days: [1, 2, 3, 4, 5], firstHour: 9, lastHour: 16, tz: "America/Los_Angeles" }, staff: Array.from({ length: staff }, (_, i) => ({ id: `s${i}`, name: `Person ${i}` })),
  rgaTz: "America/Los_Angeles", googleConnected: false, texts: { on: false, why: "Texts are off: the Quo key works; texting turns on after (424) 242-2040's carrier registration is confirmed" }, calls: CALLS, busy: [{ starts_at: "2026-11-11T17:00:00Z", ends_at: "2026-11-11T17:30:00Z" }, { starts_at: "2026-11-12T17:00:00Z", ends_at: "2026-11-12T17:30:00Z" }],
  alerts: { callNow: [], agreementUnsigned: [] }, today: 2 });
const MIME = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json" };
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/admin/admin.css"></head><body class="admin-body" data-admin-view="schedule"><div id="scheduleView"><div id="scheduleHost"></div></div><span id="scheduleNavBadge" hidden></span></body></html>`;

function serve(root) {
  return new Promise((res) => { const s = http.createServer((q, r) => { const u = new URL(q.url, "http://x"); if (u.pathname === "/") { r.setHeader("content-type", "text/html"); return r.end(PAGE); }
    const f = path.join(root, decodeURIComponent(u.pathname)); fs.readFile(f, (e, b) => { if (e) { r.statusCode = 404; return r.end(""); } r.setHeader("content-type", MIME[path.extname(f)] || "application/octet-stream"); r.end(b); }); }).listen(0, "127.0.0.1", () => res(s)); });
}

async function checkTree(root, label) {
  const F = [], fail = (m) => F.push(`${label}: ${m}`);
  let puppeteer; try { ({ default: puppeteer } = await import("puppeteer")); } catch { console.error("INDETERMINATE: puppeteer missing"); process.exit(2); }
  const srv = await serve(root), base = `http://127.0.0.1:${srv.address().port}`;
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage(); await page.setViewport({ width: 1200, height: 1300 });
    const errs = []; page.on("pageerror", (e) => errs.push(String(e.message)));
    let staff = 1;
    await page.setRequestInterception(true);
    page.on("request", (r) => { if (r.url().includes("/.netlify/functions/schedule-data")) return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(ANSWER(staff)) });
      if (r.url().includes("/.netlify/functions/")) return r.respond({ status: 200, contentType: "application/json", body: "{}" }); r.continue(); });
    await page.evaluateOnNewDocument((now) => { const RD = Date; globalThis.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(now); } static now() { return now; } }; }, NOW);
    const boot = async () => { await page.goto(base + "/", { waitUntil: "load" });
      const ok = await page.evaluate(async () => { try { const m = await import("/admin/schedule.js"); await m.openSchedule("tok", { blockTime: async () => {}, openHours() {} }); return true; } catch (e) { return String(e.message); } });
      if (ok !== true) throw new Error(`schedule.js did not boot: ${ok}`); };
    await boot();
    const J = (fn, ...a) => page.evaluate(fn, ...a);
    // ── the card + header ──
    const head = await J(() => { const h = document.querySelector("#scheduleHost"); const card = h.querySelector(".sch"); const seg = [...h.querySelectorAll("[data-sch-view]")];
      const on = seg.find((b) => b.classList.contains("on")); const gt = [...h.querySelectorAll("button")].find((b) => /Go to date/.test(b.textContent));
      const vis = (e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 2 && r.height > 2 && cs.visibility !== "hidden" && cs.opacity !== "0" && cs.display !== "none"; };
      return { card: !!card && card.classList.contains("admin-card"), segs: seg.map((b) => b.textContent.trim()).join("|"), onTxt: on && on.textContent.trim(), onBg: on && getComputedStyle(on).backgroundColor,
        range: (h.querySelector(".sch-title") || {}).textContent || "", step: [...h.querySelectorAll("[data-sch-step]")].map((b) => b.textContent.trim()).join(""), today: !!h.querySelector("[data-sch-today]"), goto: !!gt,
        dateInputVisible: [...h.querySelectorAll('input[type="date"]')].some(vis), cards: h.querySelectorAll(".admin-card").length, text: h.innerText }; });
    if (!head.card) fail("the schedule is not ONE admin card (.sch.admin-card)");
    if (head.segs !== "Day|Week|Month" || head.onTxt !== "Week") fail(`the Day / Week / Month pill group is wrong (${head.segs}, active ${head.onTxt})`);
    if (!/rgb\(36, 87, 230\)|rgb\(47, 91, 234\)/.test(head.onBg || "")) fail(`the active pill is not filled blue (${head.onBg})`);
    if (head.range !== "Nov 9 – 13") fail(`the range is "${head.range}", expected the human "Nov 9 – 13"`);
    if (!head.today || !head.goto) fail("no Today link or no \"Go to date…\" pill");
    if (head.dateInputVisible) fail("a raw <input type=date> is visible by default");
    if (/\b20\d\d-\d\d-\d\d\b/.test(head.text) || /Week of/.test(head.text)) fail('the header/body shows an ISO date or "Week of"');
    // ── absence of the old markup + unstyled controls ──
    const old = await J(() => { const h = document.querySelector("#scheduleHost"); const sels = [...h.querySelectorAll("select")].map((s) => { const cs = getComputedStyle(s); return { ap: cs.appearance, bw: cs.borderTopWidth, br: cs.borderTopLeftRadius }; });
      return { col: h.querySelectorAll(".sch-col").length, modalt: h.querySelectorAll(".mod-alt").length, week7: h.querySelectorAll(".sch-week").length, sels, none: /Nothing booked/.test(h.innerText) && h.querySelectorAll(".sch-col").length > 0 }; });
    if (old.col || old.week7) fail("the old 7-day boxes are still drawn (.sch-col / .sch-week)");
    if (old.modalt) fail(`${old.modalt} control(s) still use the unstyled .mod-alt class`);
    if (!old.sels.length || old.sels.some((s) => s.ap !== "none" || parseFloat(s.bw) < 1 || parseFloat(s.br) < 4)) fail("a select is an unstyled browser default");
    // ── the Week hourly grid ──
    const grid = await J(() => { const g = document.querySelector("[data-sch-grid]"); if (!g) return null; const hrs = [...g.querySelectorAll("[data-sch-hour]")].map((e) => e.textContent.trim()); const heads = [...g.querySelectorAll(".sch-dh")].map((e) => e.textContent.trim());
      const col = (sel) => { const e = g.querySelector(sel); return e ? getComputedStyle(e).color : null; };
      const blk = (id) => document.querySelector(`[data-sch-call="${id}"]`);
      const busy = g.querySelector(".sch-k-busy"), blocked = g.querySelector(".sch-k-blocked");
      return { hrs, heads, kick: col(".sch-k-kickoff"), walk: col(".sch-k-walkthrough"), m1: col(".sch-k-m1_review"), mon: col(".sch-k-monthly"), qtr: col(".sch-k-quarterly"), blockedC: col(".sch-k-blocked"), busyC: col(".sch-k-busy"),
        kickTxt: blk("c1") && blk("c1").innerText.replace(/\s+/g, " "), blockedTxt: blocked && blocked.innerText.replace(/\s+/g, " "), busyTxt: busy && busy.innerText.replace(/\s+/g, " "), walkTxt: blk("c3") && blk("c3").innerText.replace(/\s+/g, " "),
        legend: [...document.querySelectorAll(".sch-legend i")].map((i) => getComputedStyle(i).backgroundColor) }; });
    if (!grid) fail("the Week is not an hourly time grid (no [data-sch-grid])");
    else {
      if (grid.hrs.join(",") !== "8 AM,9 AM,10 AM,11 AM,12 PM,1 PM,2 PM,3 PM,4 PM,5 PM") fail(`grid hours are ${grid.hrs.join(",")}, expected your hours 9 AM to 5 PM plus ONE shaded hour before and after (v6)`);
      if (grid.heads.join(",") !== "Mon 9,Tue 10,Wed 11,Thu 12,Fri 13") fail(`grid columns are ${grid.heads.join(",")}, expected the working days Mon 9 to Fri 13 only`);
      if (!/Kickoff call Acme Plumbing/.test(grid.kickTxt || "")) fail("a block does not show the call name plus the person");
      if (!/Blocked Lunch/.test(grid.blockedTxt || "")) fail("blocked time is not shown as amber Blocked + its note");
      if (!/^Busy/.test(grid.busyTxt || "")) fail("Google busy time is not a grey Busy block");
      const same = (a, b) => a && a === b;
      if (!(same(grid.m1, grid.mon) && same(grid.mon, grid.qtr))) fail(`Month 1 review / monthly / quarterly are not ONE purple (${grid.m1} | ${grid.mon} | ${grid.qtr})`);
      const distinct = new Set([grid.walk, grid.kick, grid.m1, grid.blockedC, grid.busyC]);
      if (distinct.size !== 5) fail("walkthrough blue, kickoff green, purple, blocked amber and busy grey are not five distinct colours");
      if (!/rgb\(47, 91, 234\)/.test(grid.walk || "")) fail(`audit walkthrough is not the mockup blue (${grid.walk})`);
      if (!/rgb\(18, 128, 92\)/.test(grid.kick || "")) fail(`kickoff is not the mockup green (${grid.kick})`);
      if (!/rgb\(109, 75, 216\)/.test(grid.m1 || "")) fail(`purple is not the mockup purple (${grid.m1})`);
      if (!/rgb\(180, 83, 9\)/.test(grid.blockedC || "")) fail(`blocked is not the mockup amber (${grid.blockedC})`);
      const lg = new Set(grid.legend.slice(0, 7)); if (lg.size > 5) fail(`the legend shows ${lg.size} different colours, expected 5 (blue, green, one purple, amber, grey-blue)`);
    }
    if (SHOT && label === "after") await page.screenshot({ path: SHOT.replace(/\.png$/, "") + "-week.png" });
    // ── the click panel: prospect, then client ──
    const panelOf = async (id) => { await page.evaluate((i) => document.querySelector(`[data-sch-call="${i}"]`).click(), id); return J(() => { const p = document.querySelector(".sch-panel"); if (!p) return null; return { title: p.querySelector(".sch-pch").innerText.replace(/\s+/g, " "), body: p.innerText, btns: [...p.querySelectorAll(".sch-acts a, .sch-acts button")].map((b) => ({ t: b.textContent.trim(), c: b.className })) }; }); };
    const p1 = await panelOf("c5");
    if (!p1) fail("clicking a block opens no panel");
    else {
      if (!/Audit walkthrough · Nathan's Towing/.test(p1.title)) fail(`panel title is "${p1.title}", expected the call name and person`);
      if (!/Fri, Nov 13/.test(p1.body) || !/10:00 AM PT/.test(p1.body)) fail("panel's When row lacks the date and the Pacific time (v6 section 7)");
      const t = p1.btns.map((b) => b.t).join("|"); if (t !== "Open the console|Lead in Calls|Reschedule|Cancel") fail(`prospect panel buttons are "${t}", expected Open Meet (when there is one) | Open the console | Lead in Calls | Reschedule | Cancel`);
      if (p1.btns.some((b) => !/admin-button/.test(b.c))) fail("panel buttons do not use the admin button classes");
    }
    const p1m = await panelOf("c3"); if (p1m && !p1m.btns.some((b) => /^Open Meet/.test(b.t))) fail("a prospect call with a Meet link has no Open Meet button");
    const p2 = await panelOf("c4");
    if (p2) { const t = p2.btns.map((b) => b.t).join("|"); if (t !== "Open Meet|Client page|Reschedule|Cancel") fail(`client panel buttons are "${t}"`); } else fail("client block opens no panel");
    // ── Day = the same hourly grid as Week, for one day (v6 section 3) ──
    await J(() => document.querySelector('[data-sch-view="day"]').click()); await page.waitForSelector(".sch-day", { timeout: 3000 }).catch(() => {});
    const day = await J(() => ({ grid: !!document.querySelector(".sch-day [data-sch-grid]"), blocks: [...document.querySelectorAll(".sch-day .sch-blk")].map((r) => r.innerText.replace(/\s+/g, " ")), list: document.querySelectorAll(".sch-day .sch-ev").length }));
    if (!day.grid || day.list) fail("Day is not the hourly grid (v6)");
    else if (!day.blocks.some((r) => /Audit walkthrough · 2:00 – 2:30 PM Relate Dental/.test(r))) fail(`Day block lacks name, time range and person: ${day.blocks.join(" // ").slice(0, 200)}`);
    // ── Month = counts by call name ──
    await J(() => document.querySelector('[data-sch-view="month"]').click()); await page.waitForSelector(".sch-month", { timeout: 3000 }).catch(() => {});
    const mon = await J(() => ({ chips: [...document.querySelectorAll(".sch-chip")].map((c) => c.textContent), cell: !!document.querySelector('[data-sch-day="2026-11-10"]') }));
    if (!mon.chips.includes("Walkthrough 1") || !mon.chips.includes("Busy 1") || !mon.chips.includes("Kickoff 1")) fail(`Month cells do not show counts by call name: ${mon.chips.join(",")}`);
    await J(() => document.querySelector('[data-sch-day="2026-11-10"]').click()); await page.waitForSelector(".sch-day", { timeout: 3000 }).catch(() => {});
    if (!(await J(() => !!document.querySelector(".sch-day")))) fail("clicking a Month day does not open that day");
    // ── Go to date: a popover under the button, never the native picker ──
    await J(() => document.querySelector("[data-sch-goto]").click());
    if (!(await J(() => !!document.querySelector(".sch-pop")))) fail("Go to date does not open the popover");
    if (await J(() => !!document.querySelector("input.sch-pick"))) fail("Go to date still uses the hidden native date input");
    // ── controls + banners ──
    await J(() => document.querySelector('[data-sch-view="week"]').click()); await page.waitForSelector("[data-sch-grid]", { timeout: 3000 }).catch(() => {});
    const ctl = await J(() => { const h = document.querySelector("#scheduleHost"); const b = (sel) => { const e = h.querySelector(sel); return e ? e.className : null; };
      const warn = h.querySelector(".sch-warn"); return { block: b("[data-sch-block]"), hours: b("[data-sch-hours]"), grant: warn && (warn.querySelector("[data-kickoff-grant-freebusy]") || {}).className, warnBg: warn && getComputedStyle(warn).backgroundColor,
        quiet: [...h.querySelectorAll(".sch-stat")].map((e) => e.textContent).join(" "), quietIsBanner: !!h.querySelector(".sch-banner"), showing: !!h.querySelector("[data-sch-owner]"), zone: /Pacific time/.test(h.innerText) }; });
    if (!/admin-button(\s|$)/.test(ctl.block || "") || !/admin-button-secondary/.test(ctl.hours || "")) fail(`Block time / Set your hours do not use the admin button classes (${ctl.block} | ${ctl.hours})`);
    if (!/admin-button/.test(ctl.grant || "")) fail("the Google banner's button is not an admin button inside the amber warn card");
    if (!/rgb\(255, 244, 230\)/.test(ctl.warnBg || "")) fail(`the Google banner is not the mockup's amber warn card (${ctl.warnBg})`);
    if (!/Texts are off/.test(ctl.quiet || "")) fail('"Texts are off" is not a status line');
    if (ctl.showing) fail('"Showing" appears with one staff row');
    if (!ctl.zone) fail("times do not say Pacific time");
    staff = 2; await boot();
    if (!(await J(() => !!document.querySelector("[data-sch-owner]")))) fail('"Showing: All people" does not appear with 2+ staff');
    // the shot: the Week with the panel closed, one staff row
    staff = 1; await boot();
    if (SHOT && label === "after") await page.screenshot({ path: SHOT, fullPage: true });
    if (errs.length) fail(`page errors: ${errs.slice(0, 2).join("; ")}`);
  } catch (e) { fail(`could not render: ${String(e.message).slice(0, 160)}`); }
  finally { await browser.close(); srv.close(); }
  return F;
}
await runGate({ name: "check-schedule-matches-mockup", beforeRev: BEFORE, checkTree, minBefore: 10 });
