#!/usr/bin/env node
// check-every-mac-job-checks-in.mjs — EVERY SCHEDULED MAC JOB IS ON SYSTEM HEALTH (checkers build 11-11; master map approved by Chris).
//
// GUARDS: a job launchd runs on this Mac can't fail, stop, or never start without System health seeing it. Before 11-11 four of them
// (night-rehearsal, deliverability-guard, blog-engine, overnight-build) were in no list: the rehearsal's red on 11-10 reached no one and
// the 9 PM run refused to start. check-system-health-covers-every-job walks the LIST and checks each listed job; this walks the MAC.
// HOLDS, for every ~/Library/LaunchAgents/com.rga.*.plist (".plist" only; .disabled and .bak copies are not scheduled):
//   1 · it is a Mac job on website netlify/functions/_job-manifest.js (matched by `plist`), or EXEMPT below with a reason;
//   2 · the script it runs (read from ProgramArguments, or from the AppleScript inside an .app) posts a start AND a finish through
//       scripts/job-checkin.mjs under that job's name;
//   3 · every job name a scraper script checks in under is on the list (job-checkin answers 400 "Not a Mac job on the list" otherwise,
//       and the check-in is silently lost);
//   4 · every Mac job on the list has its plist installed.
// Reads the plists (RGA_LAUNCHAGENTS_DIR overrides), the manifest from APPROVAL_ARCHIVE_SITE_DIR, the scripts from SCRAPER_COPY_DIR.
// Exit 0 = every Mac job checks in · 1 = a job runs unseen · 2 = INDETERMINATE (no plists, the list won't load).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REAL = path.dirname(HERE);
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SCR = process.env.SCRAPER_COPY_DIR || REAL;
const AGENTS = process.env.RGA_LAUNCHAGENTS_DIR || path.join(os.homedir(), "Library/LaunchAgents");
const idk = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
const F = [];
const scr = (rel) => { for (const base of [SCR, REAL]) { try { return fs.readFileSync(path.join(base, rel), "utf8"); } catch { /* next */ } } return null; };

// 🔑 EXEMPT = a launchd entry that is not a job with a run: each needs a reason in words, and must still be a real plist.
const EXEMPT = {
  "com.rga.shrink-screenshots": "the screenshot shrinker app runs every 3 seconds; it checks and publishes nothing, and a check-in every 3 seconds would grow job_checkins by 28,800 rows a day",
};

let JOBS;
try { JOBS = createRequire(`${SITE}/netlify/functions/x.js`)("./_job-manifest.js").JOBS; } catch (e) { idk(`the job list won't load: ${e.message}`); }
const mac = JOBS.filter((j) => j.where === "mac");
let plists;
try { plists = fs.readdirSync(AGENTS).filter((f) => /^com\.rga\.[a-z0-9-]+\.plist$/.test(f)); } catch { idk(`can't read ${AGENTS}`); }
if (!plists.length) idk(`no com.rga.*.plist in ${AGENTS}`);

const scriptOf = (file) => {
  let d;
  try { d = JSON.parse(execFileSync("plutil", ["-convert", "json", "-o", "-", file], { encoding: "utf8" })); } catch { return { err: "unreadable plist" }; }
  const list = (d.ProgramArguments || [d.Program]).filter(Boolean), args = list.join(" ");
  const m = /(scripts\/[A-Za-z0-9._-]+\.(?:sh|mjs))/.exec(args);
  if (m) return { rel: m[1] };
  const appPath = list.find((a) => /\.app\/?$/.test(a));
  const app = appPath ? [appPath, appPath.replace(/\/$/, "")] : null;
  if (app) {
    try {
      const src = execFileSync("osadecompile", [path.join(app[1], "Contents/Resources/Scripts/main.scpt")], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      const s = /(scripts\/[A-Za-z0-9._-]+\.(?:sh|mjs))/.exec(src);
      if (s) return { rel: s[1] };
    } catch { /* not an AppleScript app */ }
    return { app: app[1] };
  }
  return { err: `no script in ProgramArguments (${args.slice(0, 80)})` };
};
// the same rule check-system-health-covers-every-job uses (it accepts every idiom here: `job-checkin.mjs start x`, `checkin start x`,
// `checkin(["start", "x"])`), plus the file must actually call job-checkin.mjs
const posts = (text, phase, job) => new RegExp(`${phase}"?,? +"?${job}(?![a-z0-9-])`).test(text) && /job-checkin\.mjs/.test(text);

for (const f of plists) {
  const label = f.replace(/\.plist$/, "");
  if (label in EXEMPT) { if (String(EXEMPT[label]).length < 40) F.push(`${label} is exempt without a real reason`); continue; }
  const j = mac.find((x) => x.plist === label);
  if (!j) { F.push(`${label} runs on this Mac and is not on System health (_job-manifest.js): if it stops or never starts, nobody hears`); continue; }
  if (j.off) continue;   // off on purpose, with its reason on the list (check-system-health-covers-every-job holds that)
  const s = scriptOf(path.join(AGENTS, f));
  if (s.err) { F.push(`${label}: ${s.err}`); continue; }
  if (s.app) { F.push(`${label} runs ${s.app}, and no script inside it could be read, so nothing proves it checks in`); continue; }
  const text = scr(s.rel);
  if (text == null) { F.push(`${label} runs ${s.rel}, which is not in this repo`); continue; }
  if (!posts(text, "start", j.job)) F.push(`${s.rel} (${label}) never posts its start as ${j.job}: a run that dies leaves no trace`);
  if (!posts(text, "finish", j.job)) F.push(`${s.rel} (${label}) never posts its finish as ${j.job}: System health can't say it ran`);
}

// 3 · every name a script checks in under is on the list
const listed = new Set(mac.map((j) => j.job));
for (const dir of ["scripts", "scripts/lib"]) {
  let files = [];
  try { files = fs.readdirSync(path.join(REAL, dir)).filter((x) => /\.(sh|mjs)$/.test(x) && x !== "job-checkin.mjs" && x !== path.basename(fileURLToPath(import.meta.url))); } catch { continue; }
  for (const x of files) {
    const t = scr(`${dir}/${x}`) || "";
    for (const m of t.matchAll(/job-checkin\.mjs"?\s+(?:start|finish)\s+([a-z0-9-]+)/g)) {
      if (!listed.has(m[1])) F.push(`${dir}/${x} checks in as "${m[1]}", which is not a Mac job on the list: job-checkin refuses it and the run goes unrecorded`);
    }
  }
}
// 4 · every listed Mac job is installed
for (const j of mac) if (j.installed !== false && !j.off && !plists.includes(`${j.plist}.plist`)) F.push(`${j.job} is on the list as a Mac job, and ${j.plist}.plist is not installed: it will read late forever`);

if (F.length) { console.error(`🔴 a Mac job runs unseen by System health:\n${[...new Set(F)].map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log(`✅ every Mac job checks in: ${plists.length} com.rga.* plists, ${plists.length - Object.keys(EXEMPT).filter((l) => plists.includes(`${l}.plist`)).length} on System health with a start and a finish, ${Object.keys(EXEMPT).length} exempt with a reason`);
