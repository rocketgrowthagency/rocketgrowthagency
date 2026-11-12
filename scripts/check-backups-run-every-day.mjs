#!/usr/bin/env node
// check-backups-run-every-day.mjs: THE CLIENT DATA BACKUP RUNS EVERY DAY, WEEKENDS INCLUDED (automation clock master page, approved 11-11,
// decision 3: "Run it every day, including weekends"). It ran Monday to Friday, so a Saturday or Sunday change waited until Monday.
// The LaCie backup (chats, memory, repos) stays Monday to Friday: Chris chose that on 11-1 (feedback_backup_to_x10_only).
// HOLDS (both repos plus the Mac's installed LaunchAgent, read only):
//   1  this repo's scripts/launchd/com.rga.client-data-backup.plist runs backup-client-data.mjs at 06:40 every day: one calendar entry,
//      no Weekday, and plutil can read it.
//   2  the job list says what runs TODAY and what it becomes: `every_day_cron` is "40 6 * * *"; `cron` equals what the installed
//      LaunchAgent says. Installed daily + list still Monday to Friday = red ("change cron to every_day_cron"), so System health never
//      reads Saturday as late or misses it.
//   3  until it is installed, docs/supabase/PENDING_FOR_CHRIS.md carries the exact one line that installs this plist.
// PROVES ITSELF: it must fail on the before state (website c621cc35, scraper 686467af) in 3+ places, else exit 2.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { runTwoRepoGate, rd } from "./lib/two-repo-gate.mjs";

const plist = (file) => JSON.parse(execFileSync("plutil", ["-convert", "json", "-o", "-", file], { encoding: "utf8" }));
const INSTALLED = process.env.RGA_LAUNCH_AGENTS_DIR || path.join(os.homedir(), "Library/LaunchAgents");

async function checkTree(site, scr, label) {
  const F = [], fail = (m) => F.push(`${label}: ${m}`), W = rd(site);
  const repoPlist = path.join(scr, "scripts/launchd/com.rga.client-data-backup.plist");
  if (!fs.existsSync(repoPlist)) fail("there is no every-day LaunchAgent for the client data backup in the repo");
  else {
    let d = null; try { d = plist(repoPlist); } catch { fail("the repo's client-data-backup plist can't be read by plutil"); }
    if (d) {
      const c = d.StartCalendarInterval;
      if (!c || Array.isArray(c) || c.Weekday != null || c.Day != null || c.Hour !== 6 || c.Minute !== 40) fail(`the repo's plist doesn't run at 06:40 every day (${JSON.stringify(c)})`);
      if (d.Label !== "com.rga.client-data-backup" || !(d.ProgramArguments || []).some((a) => /scripts\/backup-client-data\.mjs$/.test(a))) fail("the repo's plist doesn't run the client data backup under its own label");
    }
  }
  let JOBS = []; try { JOBS = createRequire(path.join(site, "netlify/functions/x.js"))("./_job-manifest.js").JOBS; } catch (e) { fail(`the job list won't load: ${String(e.message).slice(0, 80)}`); }
  const j = JOBS.find((x) => x.job === "client-data-backup");
  if (!j) { fail("client-data-backup isn't on the job list"); return F; }
  if (j.every_day_cron !== "40 6 * * *") fail(`the job list doesn't say the backup becomes every day (every_day_cron ${j.every_day_cron})`);
  const live = path.join(INSTALLED, "com.rga.client-data-backup.plist");
  let installedDaily = null;
  if (fs.existsSync(live)) { try { const c = plist(live).StartCalendarInterval; installedDaily = !!c && !Array.isArray(c) && c.Weekday == null; } catch { installedDaily = null; } }
  if (installedDaily === true && j.cron !== "40 6 * * *") fail(`the Mac runs the backup every day now: change cron on the client-data-backup line to "${j.every_day_cron}", or System health won't watch Saturday and Sunday`);
  if (installedDaily === false && j.cron !== "40 6 * * 1-5") fail(`the Mac still runs the backup Monday to Friday and the list says ${j.cron}: Saturday would read late`);
  if (installedDaily !== true) {
    const pend = W("docs/supabase/PENDING_FOR_CHRIS.md") || "";
    const line = 'cp "/Users/chris/RGA/Rocket Growth Agency Scraper VS Code/scripts/launchd/com.rga.client-data-backup.plist" ~/Library/LaunchAgents/ && launchctl bootout gui/$(id -u)/com.rga.client-data-backup 2>/dev/null; launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.rga.client-data-backup.plist';
    if (!pend.includes(line)) fail("the one line that installs the every-day backup isn't in docs/supabase/PENDING_FOR_CHRIS.md");
  }
  const lacie = JOBS.find((x) => x.job === "lacie-backup");
  if (lacie && lacie.cron !== "0 7 * * 1-5") fail(`the LaCie backup moved off Monday to Friday (${lacie.cron}); Chris chose weekdays on 11-1`);
  return F;
}

try {
  await runTwoRepoGate({ name: "check-backups-run-every-day", siteBefore: "c621cc35", scrBefore: "686467af", checkTree, minBefore: 3 });
} catch (e) { console.error(`⚠️  INDETERMINATE: the gate threw: ${String(e && e.stack || e).slice(0, 400)}`); process.exit(2); }
