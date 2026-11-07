#!/usr/bin/env node
// check-system-health-covers-every-job.mjs — every automated job is on the one list, wrapped, on the right schedule (approved admin_system_health_v1,
// Chris 10-31: "Automated systems fail quietly, so each one needs its own check").
// 🔴 A job missing from the list is the failure this whole feature exists to prevent, and it would fail silently: nothing compares what nothing lists.
// HOLDS: (1) the list's Netlify jobs are exactly what's scheduled (netlify.toml + any schedule inside a function's own file), with the same cron;
// (2) each is wrapped by withCheckin under its own name, and the wrapper is the handler that ships; (3) each Mac job's cron matches its LaunchAgent,
// "not installed" on the list means there's no LaunchAgent, and its script posts a start and a finish; (4) the morning and night checks can't call
// a run that died "reached the end"; the Mac watches the watcher; (5) the SQL file makes every column, and the table and view are closed to the
// public; (6) the check-in endpoint, the watcher and the admin read each check their caller; the admin slot exists.
// Files only, plus the Mac's own plists. Exit 0 = holds · 1 = a job isn't covered · 2 = moved (indeterminate). → memory project_system_health
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SCR = process.env.SCRAPER_COPY_DIR || path.dirname(HERE);
const read = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return null; } };
const site = (p) => read(`${SITE}/${p}`), scr = (p) => read(`${SCR}/${p}`);
const F = [];
const idk = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };

let JOBS;
try { JOBS = createRequire(`${SITE}/netlify/functions/x.js`)("./_job-manifest.js").JOBS; } catch (e) { F.push(`the job list won't load: ${e.message}`); JOBS = []; }
const toml = site("netlify.toml");
if (toml == null) idk("netlify.toml moved");

// ── (1) the list = what's scheduled ─────────────────────────────────────────────────────────────────────────────────
const scheduled = new Map();
for (const m of toml.matchAll(/^\[functions\."([^"]+)"\]\s*\n\s*schedule\s*=\s*"([^"]+)"/gm)) scheduled.set(m[1], m[2]);
if (scheduled.size < 5) idk(`only ${scheduled.size} schedules parsed from netlify.toml; the format moved`);
const fnDir = `${SITE}/netlify/functions`;
for (const f of fs.readdirSync(fnDir).filter((x) => x.endsWith(".js"))) {
  const m = /exports\.config\s*=\s*\{[^}]*schedule:\s*"([^"]+)"/.exec(read(`${fnDir}/${f}`) || "");
  if (m) scheduled.set(f.replace(/\.js$/, ""), m[1]);
}
const net = JOBS.filter((j) => j.where === "netlify"), mac = JOBS.filter((j) => j.where === "mac");
for (const [name, cron] of scheduled) {
  const j = net.find((x) => x.job === name);
  if (!j) F.push(`${name} is scheduled (${cron}) and isn't on the job list, so nothing would notice if it stopped`);
  else if (j.cron !== cron) F.push(`${name}: the list says ${j.cron}, its schedule says ${cron}, so it would read late or early`);
}
for (const j of net) if (!scheduled.has(j.job) && !j.off) F.push(`${j.job} is on the list but nothing schedules it: it would read late forever`);
// 🔒 OFF ON PURPOSE must be true: a job marked off that something still schedules would run with the card saying it doesn't (the owner 11-7).
for (const j of JOBS) if (j.off) {
  if (scheduled.has(j.job)) F.push(`${j.job} is marked off on purpose, and ${scheduled.get(j.job)} still schedules it: take the schedule out, or take \`off\` off the list`);
  if (typeof j.off !== "string" || j.off.trim().length < 20) F.push(`${j.job} is marked off without saying why in words`);
  if (j.unproven || j.installed === false) F.push(`${j.job} is marked off and also unproven/not installed: one state only`);
}
for (const j of JOBS) {
  if (!(j.grace_min > 0) || !(j.max_run_min > 0) || !(j.keep_days > 0) || !j.label) F.push(`${j.job}: the list is missing its grace, run limit, keep or label`);
  if (j.where === "netlify" && typeof j.read !== "function") F.push(`${j.job}: no way to read how many it did`);
}

// ── (2) wrapped ─────────────────────────────────────────────────────────────────────────────────────────────────────
for (const j of net) {
  const t = read(`${fnDir}/${j.job}.js`);
  if (t == null) { F.push(`${j.job}: no function file`); continue; }
  const assigns = [...t.matchAll(/^exports\.handler\s*=\s*(.*)$/gm)];
  const last = assigns[assigns.length - 1];
  if (!last || !last[1].includes(`withCheckin("${j.job}", exports.handler)`)) F.push(`${j.job} isn't wrapped by withCheckin under its own name as the handler that ships, so it would never check in`);
}

// ── (3) the Mac ─────────────────────────────────────────────────────────────────────────────────────────────────────
const plistCron = (file) => {
  const d = JSON.parse(execFileSync("plutil", ["-convert", "json", "-o", "-", file], { encoding: "utf8" }));
  const c = d.StartCalendarInterval;
  if (!c) return null;
  // 🔒 Chris 11-1: a job on several days has a list of times. They must share a time, and the days become a range: Monday to Friday is 1-5.
  if (Array.isArray(c)) {
    const days = c.map((x) => x.Weekday).sort((x, y) => x - y), same = c.every((x) => x.Hour === c[0].Hour && x.Minute === c[0].Minute);
    const run = days.every((x, i) => i === 0 || x === days[i - 1] + 1);
    if (!same || !run || days[0] == null) return null;
    return `${c[0].Minute ?? 0} ${c[0].Hour ?? "*"} * * ${days[0]}-${days[days.length - 1]}`;
  }
  return `${c.Minute ?? 0} ${c.Hour ?? "*"} ${c.Day ?? "*"} ${c.Month ?? "*"} ${c.Weekday ?? "*"}`;
};
const AGENTS = path.join(os.homedir(), "Library/LaunchAgents");
const SCRIPT = { "client-data-backup": "scripts/backup-client-data.mjs", "lacie-backup": "scripts/backup-lacie.sh", "daily-health-check": "scripts/daily-health-check.sh", "nightly-full-check": "scripts/nightly-full-check.sh", "weekly-audit": "scripts/weekly-audit.sh" };
for (const j of mac) {
  const live = `${AGENTS}/${j.plist}.plist`, src = `${path.dirname(HERE)}/scripts/launchd/${j.plist}.plist`;
  const installed = fs.existsSync(live);
  if (j.installed === false && installed) F.push(`${j.job} is installed now (${j.plist}). Take installed:false off the list, or the card keeps saying "Not installed"`);
  if (j.installed !== false && !installed) F.push(`${j.job}: the list says it runs, and there's no LaunchAgent ${j.plist}`);
  const file = installed ? live : src;
  if (!fs.existsSync(file)) { F.push(`${j.job}: no plist to read at ${file}`); continue; }
  let cron = null;
  try { cron = plistCron(file); } catch { idk(`can't read ${file}`); }
  if (cron !== j.cron) F.push(`${j.job}: the list says ${j.cron}, ${j.plist} says ${cron}`);
  const name = SCRIPT[j.job];
  if (!name) { F.push(`${j.job}: this gate doesn't know its script`); continue; }
  const t = scr(name);
  if (t == null) idk(`${name} moved`);
  const posts = (phase) => new RegExp(`${phase}"?,? +"?${j.job}\\b`).test(t) && /job-checkin\.mjs/.test(t);
  // checkin_pending = the check-in couldn't be added yet (the job was running during the build). It reads "Not recorded", so the list and the script must agree.
  if (j.checkin_pending) {
    if (posts("start") || posts("finish")) F.push(`${name} posts its check-in now. Take checkin_pending off ${j.job} on the list, or the card can't alert on it`);
    continue;
  }
  if (!posts("start")) F.push(`${name} never posts its start, so a run that dies leaves no trace`);
  if (!posts("finish")) F.push(`${name} never posts its finish`);
}

// ── (4) a run that died can't read as having reached the end ───────────────────────────────────────────────────────
const dh = scr("scripts/daily-health-check.sh"), nf = scr("scripts/nightly-full-check.sh");
if (dh == null || nf == null) idk("the morning or night check moved");
for (const [name, t] of [["daily-health-check.sh", dh], ["nightly-full-check.sh", nf]]) {
  if (!/job_checkin_finish\b/.test(t) || !/^trap .*job_checkin_finish.* EXIT$/m.test(t)) F.push(`${name}: no EXIT trap, so a run killed partway never says so (10-27 to 10-30, four mornings)`);
  if (!/\[ -n "\$JOB_REACHED_END" \] && ok=1/.test(t)) F.push(`${name}: a finish no longer depends on having reached the end`);
  if (!/^JOB_REACHED_END=""/m.test(t)) F.push(`${name}: JOB_REACHED_END has no starting value, and set -u would kill the trap`);
}
{
  const gatesEnd = dh.indexOf('if [ "$UNRUNNABLE" -gt 0 ]; then'), mark = dh.search(/^JOB_REACHED_END=1/m);
  if (gatesEnd < 0) idk("the morning check's could-the-gates-run block moved");
  if (mark < gatesEnd) F.push("daily-health-check.sh marks the end before checking the gates could launch, so a run where none could would read as fine");
  if (!/^run check-job-watcher-ran\.mjs /m.test(dh)) F.push("daily-health-check.sh doesn't check the watcher ran: nothing watches the watcher");
  const before = nf.indexOf("job_checkin_finish() {"), start = nf.indexOf('job-checkin.mjs" start nightly-full-check'), guard = nf.search(/daytime — the full check runs at night/);
  if (before < 0 || start < 0 || guard < 0) F.push("nightly-full-check.sh lost its check-in");
  else if (start < guard) F.push("nightly-full-check.sh posts its start before the daytime guard: a refused start would read as a dead run");
  if (nf.indexOf("JOB_REACHED_END=1", nf.indexOf("full check done")) < 0 && !/JOB_REACHED_END=1\necho "full check done/.test(nf)) F.push("nightly-full-check.sh never marks a finished night");
}

// ── (5) the SQL ─────────────────────────────────────────────────────────────────────────────────────────────────────
const sql = site("supabase/job_checkins.sql");
if (sql == null) F.push("supabase/job_checkins.sql is gone: nothing can be set up");
else {
  const block = /create table if not exists public\.job_checkins \(([\s\S]*?)\n\);/.exec(sql);
  for (const col of ["job", "started_at", "finished_at", "ok", '"count"', "expected_min", "note", "error"]) if (!block || !new RegExp(`^\\s*${col}\\s`, "m").test(block[1])) F.push(`the SQL file has no ${col} column`);
  if (!/alter table public\.job_checkins enable row level security/.test(sql)) F.push("job_checkins isn't closed with row level security");
  if (!/revoke all on public\.job_checkins from anon, authenticated/.test(sql)) F.push("job_checkins isn't revoked from the public roles");
  if (!/revoke all on public\.job_checkins_latest from anon, authenticated/.test(sql) || !/security_invoker = true/.test(sql)) F.push("the view isn't closed: a view can hand the anon key what the table refuses");
  if (/^\s*drop table/im.test(sql)) F.push("the SQL file drops a table");
}

// ── (6) who may call what ───────────────────────────────────────────────────────────────────────────────────────────
const chk = site("netlify/functions/job-checkin.js"), wat = site("netlify/functions/job-watcher.js"), adm = site("netlify/functions/admin-system-health.js");
if (!chk || !wat || !adm) F.push("a system health function is missing");
else {
  if (!/const gate = requireInternalSecret\(event\); if \(gate\.error\) return gate\.error;/.test(chk)) F.push("job-checkin accepts a post without checking the internal secret");
  if (!/m\.where !== "mac"/.test(chk)) F.push("job-checkin lets a caller fake a Netlify job's check-in");
  if (!/const g = requireCronOrInternal\(event\); if \(g\.error\) return g\.error;/.test(wat)) F.push("job-watcher can be started by anyone");
  if (!/const gate = await requireWorkspaceUser\(event\);\s*if \(gate\.error\) return gate\.error;/.test(adm)) F.push("admin-system-health is readable without signing in");
  if (/process\.env\.RGA_NOTIFICATION_WEBHOOK_URL\s*[,)}]/.test(adm) && !/Boolean\(process\.env\.RGA_NOTIFICATION_WEBHOOK_URL\)/.test(adm)) F.push("admin-system-health could hand out the webhook address");
}
const idx = site("admin/index.html"), js = site("admin/admin.js");
if (!idx || !js) idk("admin moved");
if (!/<div id="systemHealthCard" hidden><\/div>/.test(idx)) F.push("admin has no System health slot");
if (idx.indexOf('id="systemHealthCard"') > idx.indexOf('id="dashboardView"')) F.push("the card isn't above the views: it has to be the top of admin");
if (!/try \{ syncSystemHealth\(name\); \} catch/.test(js)) F.push("showView doesn't show the card, or a throw in the card could cost a view its render");

if (F.length) { console.error(`🔴 a job isn't covered by System health:\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log(`✅ System health covers every job: ${net.length} Netlify (${scheduled.size} schedules, each wrapped), ${mac.length} on the Mac (LaunchAgents match), SQL closed, callers checked`);
