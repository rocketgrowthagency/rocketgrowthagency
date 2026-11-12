#!/usr/bin/env node
// check-system-health-shows-both-pacific-times.mjs: EVERY JOB SAYS WHEN IT RUNS IN UTC AND BOTH PACIFIC TIMES (automation clock master page,
// approved 11-11, decision 5: "Keep UTC, and print the Pacific time for both seasons on System health so the drift is visible").
// Every Netlify cron is UTC and lands an hour later on the Pacific clock from March to November; the Mac keeps local time. Nothing said
// so: in summer rga-todo-morning lands with the morning check and billing at 01:00, and nobody could see it.
// HOLDS, on the WEBSITE repo, pure (no network, no clock but the dates below):
//   1  every job on the list has a schedule in words (none is left blank or guessed).
//   2  each UTC job's words are TRUE: its PST and PDT times, and the day when the time crosses midnight, equal what the time zone
//      database says for that UTC time on a winter date (Jan 13 2027) and a summer date (Jul 14 2027). Never trusts its own offsets.
//   3  each Mac job says its local time and that it is the same all year; every-N-minutes and hourly jobs say so.
//   4  the status the watcher and the card share carries the words (statusesFrom), so the card can't disagree with the list.
//   5  admin's System health row draws them as their own line (small.sh-when, escaped) on the plain, Running and Done rows, and a row
//      without a schedule draws no empty line; the class has no rule of its own in admin.css (it inherits the row's small).
//   6  admin.js's cache buster is a real token (11-11 a merge left it reading "admin/admin.js"; that it moves with the file is
//      check-every-cache-buster-moved-with-its-file's job).
// PROVES ITSELF: it must fail on the before state (website c621cc35) in 4+ places, else exit 2.
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { runTwoRepoGate, rd } from "./lib/two-repo-gate.mjs";

const TZ = "America/Los_Angeles";
const fmt = (d) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true }).format(d).replace(/ /g, " ");
const wd = (d) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(d);
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], LONG = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

function lift(src, name) {
  const a = src.indexOf(`function ${name}(`);
  if (a < 0) return null;
  const b = src.indexOf("\n}\n", a);
  return b < 0 ? null : src.slice(a, b + 2);
}

async function checkTree(site, scr, label) {
  const F = [], fail = (m) => F.push(`${label}: ${m}`), W = rd(site);
  const req = createRequire(path.join(site, "netlify/functions/x.js"));
  let S, JOBS;
  try { S = req("./_job-status.js"); JOBS = req("./_job-manifest.js").JOBS; } catch (e) { fail(`the job status or list won't load: ${String(e.message).slice(0, 80)}`); return F; }
  const words = typeof S.scheduleWords === "function" ? S.scheduleWords : null;
  if (!words) fail("_job-status has no scheduleWords: System health can't say when a job runs");
  if (words) {
    for (const j of JOBS) {
      const w = words(j);
      if (!w) { fail(`${j.job} (${j.cron}) has no schedule in words`); continue; }
      const [mi, h, dom, , dow] = j.cron.split(/\s+/);
      if (j.where === "mac") {
        const t = `${((Number(h) + 11) % 12) + 1}:${mi.padStart(2, "0")} ${Number(h) < 12 ? "AM" : "PM"}`;
        if (!w.includes(`${t} Pacific`) || !/the same all year/.test(w)) fail(`${j.job}: the Mac job's words don't say ${t} Pacific, the same all year ("${w}")`);
        continue;
      }
      if (/^\*\/\d+$/.test(mi)) { if (!w.includes(`every ${mi.slice(2)} minutes`)) fail(`${j.job}: "${w}" doesn't say every ${mi.slice(2)} minutes`); continue; }
      if (h === "*") { if (!w.includes(`hourly at :${mi.padStart(2, "0")}`)) fail(`${j.job}: "${w}" doesn't say hourly at :${mi.padStart(2, "0")}`); continue; }
      if (!w.includes(`at ${h.padStart(2, "0")}:${mi.padStart(2, "0")} UTC`)) fail(`${j.job}: "${w}" doesn't say ${h.padStart(2, "0")}:${mi.padStart(2, "0")} UTC`);
      for (const [y, mo, d, zone] of [[2027, 0, 13, "PST"], [2027, 6, 14, "PDT"]]) {
        const at = new Date(Date.UTC(y, mo, d, Number(h), Number(mi)));
        const t = fmt(at), utcDay = at.getUTCDay(), localDay = SHORT.indexOf(wd(at)), shifted = localDay !== utcDay;
        const seg = w.split(" · ").find((s) => s.includes(zone)) || "";
        if (!seg.includes(`${t} ${zone}`)) { fail(`${j.job}: ${zone} should read ${t} (${h}:${mi} UTC), the words say "${seg}"`); continue; }
        if (dow !== "*" && /^\d$/.test(dow)) {
          const want = LONG[(Number(dow) + (shifted ? -1 : 0) + 7) % 7];
          if (!seg.startsWith(want)) fail(`${j.job}: in ${zone} it runs on ${want}, the words say "${seg}"`);
        }
        if (dow !== "*" && /^\d-\d$/.test(dow)) {
          const [a, b] = dow.split("-").map(Number), sh = shifted ? -1 : 0;
          const want = `${SHORT[(a + sh + 7) % 7]} to ${SHORT[(b + sh + 7) % 7]}`;
          if (!seg.startsWith(want)) fail(`${j.job}: in ${zone} it runs ${want}, the words say "${seg}"`);
        }
        if (dom !== "*" && shifted && !/the last day of the month before|the \d+(st|nd|rd|th)/.test(seg)) fail(`${j.job}: a monthly day that moves in ${zone} isn't said ("${seg}")`);
      }
    }
    // known answers too (read by a person on 11-11)
    const K = [[{ cron: "20 6 * * 1", tz: "UTC" }, "Runs Mondays at 06:20 UTC · Sundays 10:20 PM PST in winter · Sundays 11:20 PM PDT in summer"],
      [{ cron: "30 14 * * 1-5", tz: "UTC" }, "Runs Mon to Fri at 14:30 UTC · Mon to Fri 6:30 AM PST in winter · Mon to Fri 7:30 AM PDT in summer"],
      [{ cron: "0 9 5 * *", tz: "UTC" }, "Runs on the 5th at 09:00 UTC · the 5th 1:00 AM PST in winter · the 5th 2:00 AM PDT in summer"],
      [{ cron: "0 6 1 * *", tz: "UTC" }, "Runs on the 1st at 06:00 UTC · the last day of the month before 10:00 PM PST in winter · the last day of the month before 11:00 PM PDT in summer"]];
    for (const [j, want] of K) if (words(j) !== want) fail(`${j.cron}: "${words(j)}", want "${want}"`);
  }
  try {
    const st = S.statusesFrom([], { now: Date.parse("2027-01-13T12:00:00Z"), tableReady: true, systemStart: null, jobs: JOBS });
    const offs = new Set(JOBS.filter((j) => j.off).map((j) => j.job));
    const blank = st.filter((s) => !s.schedule && !offs.has(s.job)).map((s) => s.job);
    if (blank.length) fail(`the status the card reads carries no schedule for ${blank.slice(0, 4).join(", ")}${blank.length > 4 ? "…" : ""}`);
    const offTimed = st.filter((s) => offs.has(s.job) && s.schedule).map((s) => s.job);
    if (offTimed.length) fail(`${offTimed.join(", ")} is off on purpose and the card still says when it runs`);
  } catch (e) { fail(`statusesFrom threw: ${String(e.message).slice(0, 80)}`); }

  // ── 5 the admin row ───────────────────────────────────────────────────────────────────────────────────────────────────────
  const js = W("admin/admin.js") || "", css = W("admin/admin.css") || "";
  const parts = ["escapeHtml", "escapeAttribute", "shProgress", "systemHealthRow"].map((n) => lift(js, n));
  if (parts.some((p) => !p)) fail("admin.js's System health row moved");
  else {
    const ctx = vm.createContext({});
    vm.runInContext(`${parts.join("\n")}\nthis.row = systemHealthRow;`, ctx);
    const sched = "Runs daily at 08:00 UTC · 12:00 AM PST in winter · 1:00 AM PDT in summer";
    const plain = ctx.row({ job: "billing-daily-check", label: "Billing check", line: "Nov 11, 12:01 AM", tone: "ok", tag: "OK", schedule: sched });
    if (!plain.includes(`<small class="sh-when">${sched}</small>`)) fail("the System health row doesn't draw the schedule as its own line");
    else if (plain.indexOf("sh-when") < plain.indexOf("Nov 11, 12:01 AM")) fail("the schedule is drawn above the row's reading");
    const run = ctx.row({ job: "video-move", label: "Moving", line: "10 of 100 copied", tone: "ok", tag: "OK", schedule: "Runs every 15 minutes, all year" });
    if (!/sh-when">Runs every 15 minutes/.test(run)) fail("the Running row has no schedule line");
    const done = ctx.row({ job: "video-move", label: "Moving", line: "All 1,533 in storage, each checked", tone: "ok", tag: "OK", schedule: "Runs every 15 minutes, all year" });
    if (!/sh-when">Runs every 15 minutes/.test(done)) fail("the Done row has no schedule line");
    const none = ctx.row({ job: "", label: "3 Netlify scheduled jobs", line: "a, b, c", tone: "ok", tag: "OK" });
    if (/sh-when/.test(none)) fail("a row with no schedule draws an empty schedule line");
    const evil = ctx.row({ job: "x", label: "x", line: "x", tone: "ok", tag: "OK", schedule: "<img src=x>" });
    if (/<img/.test(evil)) fail("the schedule isn't escaped");
  }
  if (/\.sh-when\b/.test(css)) fail("admin.css gives .sh-when a rule of its own; it must read exactly as the row's other small line");
  const idx = W("admin/index.html") || "";
  const v = (/\/admin\/admin\.js\?v=([^"]+)"/.exec(idx) || [])[1] || "";
  if (!/^\d{8}[a-z0-9]*$/.test(v)) fail(`admin.js's cache buster is "${v}", not a token: browsers would keep a stale admin`);
  return F;
}

try {
  await runTwoRepoGate({ name: "check-system-health-shows-both-pacific-times", siteBefore: "c621cc35", scrBefore: "686467af", checkTree, minBefore: 4 });
} catch (e) { console.error(`⚠️  INDETERMINATE: the gate threw: ${String(e && e.stack || e).slice(0, 400)}`); process.exit(2); }
