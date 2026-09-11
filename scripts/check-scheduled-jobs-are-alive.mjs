#!/usr/bin/env node
/**
 * check-scheduled-jobs-are-alive.mjs — the jobs that run the business must still be loaded.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-11 audit. Six launchd agents run RGA when nobody is watching: the overnight build (21:00),
 * the deliverability guard (06:00), the daily health check (07:30), the blog engine (09:00), the
 * night rehearsal (19:00). Every gate in this repo is invoked BY one of them.
 *
 * 🔴 Nothing checked that they were still loaded, or that they still point at a file that exists.
 * Rename a script, move a repo, let an agent get unloaded by an OS update — and the work simply
 * stops. There is no error, because nothing ran. The morning report does not appear, and an absent
 * report reads exactly like a quiet night.
 *
 * 🔑 This is the same shape as every other lesson here: a gate nobody invokes, an alert nobody
 * reads, a webhook that stopped delivering. The work being CORRECT is not the same as the work
 * HAPPENING. This checks the happening.
 *
 * 🔑 The first version of this probe reported all six as broken: it joined ProgramArguments into one
 * string and tested THAT as a path. A mass finding means the probe is wrong — so it now resolves
 * each argument, including the `./scripts/x.sh` inside a `bash -lc "cd … && …"` form.
 * → feedback_a_check_must_not_validate_itself
 *
 * Exit 0 = every job loaded and pointing at real files · 1 = one is dead · 2 = could not tell.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const DIR = path.join(os.homedir(), "Library/LaunchAgents");
// Jobs whose absence is a real outage. A new com.rga.* agent is picked up automatically.
const PREFIX = "com.rga.";

console.log("── the scheduled jobs that run RGA are loaded and pointing at real files ──");

if (!fs.existsSync(DIR)) {
  console.log(`  ⚠️  no LaunchAgents directory at ${DIR} — cannot tell.`);
  process.exit(2);
}

let files;
try {
  files = fs.readdirSync(DIR).filter((f) => f.startsWith(PREFIX) && f.endsWith(".plist"));
} catch (e) {
  console.log(`  ⚠️  could not read ${DIR}: ${e.message}`);
  process.exit(2);
}
// 🔴 `.disabled` and `.bak-*` files are deliberately NOT .plist — they are excluded by the filter
// above, which is correct: a job someone turned off is not a job that broke.

if (!files.length) {
  // A mass-empty result means the probe is looking in the wrong place, not that RGA stopped running.
  console.log("  ⚠️  found NO com.rga.* agents at all — the probe must be wrong.");
  process.exit(2);
}

let loadedOut = "";
try {
  loadedOut = execFileSync("launchctl", ["list"], { encoding: "utf8" });
} catch (e) {
  console.log(`  ⚠️  could not run launchctl: ${e.message}`);
  process.exit(2);
}

let fails = 0;
for (const f of files) {
  const file = path.join(DIR, f);
  let d;
  try {
    // plutil converts to JSON without needing a plist parser dependency.
    const json = execFileSync("plutil", ["-convert", "json", "-o", "-", file], { encoding: "utf8" });
    d = JSON.parse(json);
  } catch (e) {
    console.log(`  🔴 ${f} — could not be parsed: ${e.message}`);
    fails++; continue;
  }

  const label = d.Label || f.replace(/\.plist$/, "");
  const args = d.ProgramArguments || (d.Program ? [d.Program] : []);
  const isLoaded = loadedOut.split("\n").some((line) => line.split("\t").pop() === label);

  // Absolute paths, plus the `./scripts/x.sh` hidden inside a `bash -lc "cd '…' && ./scripts/x.sh"`.
  const targets = args.filter((a) => typeof a === "string" && a.startsWith("/"));
  for (const a of args) {
    if (typeof a !== "string") continue;
    for (const m of a.matchAll(/(?:cd\s+"([^"]+)"[\s\S]*?)?(\.\/scripts\/[\w.-]+)/g)) {
      targets.push(m[1] ? path.join(m[1], m[2].replace(/^\.\//, "")) : m[2]);
    }
  }
  const missing = targets.filter((t) => !fs.existsSync(t));

  const problems = [];
  if (!isLoaded) problems.push("NOT LOADED — it will never fire");
  for (const m of missing) problems.push(`points at a file that does not exist: ${m}`);
  if (!targets.length) problems.push("no resolvable target — the plist shape changed");

  if (problems.length) {
    console.log(`  🔴 ${label}`);
    problems.forEach((p) => console.log(`       ${p}`));
    fails++;
  } else {
    const s = d.StartCalendarInterval;
    const when = Array.isArray(s) ? s.map((x) => `${String(x.Hour ?? "*").padStart(2, "0")}:${String(x.Minute ?? 0).padStart(2, "0")}`).join(",")
      : s ? `${String(s.Hour ?? "*").padStart(2, "0")}:${String(s.Minute ?? 0).padStart(2, "0")}`
      : d.StartInterval ? `every ${d.StartInterval}s` : "(no schedule)";
    console.log(`  ✅ ${label.padEnd(32)} loaded · ${when}`);
  }
}

if (fails) {
  console.log(`\n🔴 ${fails} scheduled job(s) will not run. Nothing will report an error — the work`);
  console.log("   simply stops, and an absent morning report reads exactly like a quiet night.");
  console.log("   Reload with: launchctl unload <plist>; launchctl load <plist>");
  process.exit(1);
}
console.log(`\n✅ all ${files.length} scheduled job(s) are loaded and point at files that exist.`);
process.exit(0);
