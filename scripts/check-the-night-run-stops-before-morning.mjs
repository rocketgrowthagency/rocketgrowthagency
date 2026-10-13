#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-the-night-run-stops-before-morning.mjs
//
// 🔒 WHY (Chris, 2026-10-13: "fix limit. and attempts and time if failing then record and we fix later"): the 10-12
// nightly run's retry pass STARTED at 06:12 (every time check sat between searches) and was still opening Chrome
// windows on Chris's screen at 08:23. Now scripts/overnight-local.sh:
//   1. ends at HARD_STOP (06:30) whatever is running: a watchdog stops the pipeline mid-step and records it;
//   2. starts nothing (search, retry pass, backlog rounds, paused drain) after LAST_START (04:00), and a run started
//      after 04:00 starts nothing at all;
//   3. retries ONE search in the same night (was 3);
//   4. records every stop / skip in reports/overnight-stops.md (website repo) to fix later;
//   5. never "heals" (renders video) after the hard stop.
// Runs the script's REAL clock lines on real start times. exit 0 = the night ends before morning · 1 = it can run on ·
// 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = process.env.SCRAPER_COPY_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = `${ROOT}/scripts/overnight-local.sh`;
let src;
try { src = fs.readFileSync(FILE, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${FILE}`); process.exit(2); }
const F = []; const fail = (m) => F.push(m);
const code = src.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");

// ── 1 + 2 · the real clock lines, on real start times ──
const fn = (code.match(/^next_clock_epoch\(\) \{[\s\S]*?^\}/m) || [])[0];
// 🔑 The defaults come from the script too (a gate that sets 06:30 itself can't see the script change it).
const lines = ['HARD_STOP_HHMM="', 'LAST_START_HHMM="', "HARD_STOP_EPOCH=", "LAST_START_EPOCH=", '[ "$LAST_START_EPOCH" -gt "$HARD_STOP_EPOCH" ]']
  .map((k) => code.split("\n").find((l) => l.trimStart().startsWith(k)));
if (!fn || lines.some((l) => !l)) { console.error("⚠️  INDETERMINATE — could not lift the clock lines from overnight-local.sh"); process.exit(2); }
const run = (startLocal) => {
  const sh = `${fn}\nNIGHT_START_EPOCH=$(date -j -f "%Y-%m-%d %H:%M:%S" "${startLocal}:00" +%s)\n${lines.join("\n")}\n`
    + `echo "$NIGHT_START_EPOCH $LAST_START_EPOCH $HARD_STOP_EPOCH"`;
  const env = { ...process.env }; delete env.HARD_STOP_HHMM; delete env.LAST_START_HHMM;
  try { return execFileSync("bash", ["-c", sh], { encoding: "utf8", env }).trim().split(" ").map(Number); }
  catch (e) { console.error(`⚠️  INDETERMINATE — the clock lines didn't run: ${e.message}`); process.exit(2); }
};
// 🔑 macOS `date -j` fills any field not given from NOW, seconds included, so the seconds are always given.
const at = (s) => Number(execFileSync("date", ["-j", "-f", "%Y-%m-%d %H:%M:%S", `${s}:00`, "+%s"], { encoding: "utf8" }).trim());
const CASES = [
  // start, expected last start, expected hard stop
  ["2026-10-12 21:00", "2026-10-13 04:00", "2026-10-13 06:30"],
  ["2026-10-12 23:59", "2026-10-13 04:00", "2026-10-13 06:30"],
  ["2026-10-13 01:00", "2026-10-13 04:00", "2026-10-13 06:30"],
  ["2026-10-13 04:30", "2026-10-13 04:30", "2026-10-13 06:30"],   // started too late: nothing may start
  ["2026-11-01 21:00", "2026-11-02 04:00", "2026-11-02 06:30"],   // the clocks change that night
  ["2027-03-13 21:00", "2027-03-14 04:00", "2027-03-14 06:30"],
];
for (const [start, ls, hs] of CASES) {
  const [, l, h] = run(start);
  if (h !== at(hs)) fail(`a run started ${start} stops at ${new Date(h * 1000).toString().slice(0, 21)}, not ${hs}`);
  if (l !== at(ls)) fail(`a run started ${start} may start new work until ${new Date(l * 1000).toString().slice(0, 21)}, not ${ls}`);
}

// ── 1 · the watchdog stops it mid-step and records it ──
const wd = (code.match(/\(\n\s*sleep \$\(\( HARD_STOP_EPOCH - \$\(date \+%s\) \)\)[\s\S]*?\n\) &\nHARD_STOP_PID=\$!/) || [])[0];
if (!wd) fail("no watchdog sleeps until the hard stop (the night only stops between steps)");
else {
  for (const p of ["scripts/overnight-pipeline.sh", "scripts/recovery-rounds.sh", "node step-", "step-3-video-recorder.mjs", "chrome-profile-step3", "chrome-profile-step25"]) {
    if (!wd.includes(`"${p}"`)) fail(`the hard stop doesn't stop "${p}"`);
  }
  if (!/pkill -9 -f "\$_pat"/.test(wd)) fail("the hard stop asks politely instead of stopping");
  if (!/record_stop "HARD STOP at/.test(wd)) fail("the hard stop isn't recorded");
  if (!/touch "\$HARD_STOP_MARK"/.test(wd)) fail("the hard stop leaves no mark for the reports");
}
if (!/trap 'pkill -P \$HARD_STOP_PID 2>\/dev\/null; kill \$CAFF_PID \$HARD_STOP_PID 2>\/dev\/null' EXIT/.test(code)) fail("a normal finish leaves the watchdog running");

// ── 2 · every place new work starts asks the clock ──
const starts = [
  [/if too_late_to_start; then \[ "\$n" -lt "\$MAX_SEARCHES" \] && record_stop "search/, "a new search"],
  [/if too_late_to_start; then record_stop "retry pass for/, "the retry pass"],
  [/if too_late_to_start; then record_stop "backlog rounds skipped[\s\S]{0,200}?else RECOVERY_DEADLINE_EPOCH="\$DEADLINE" bash scripts\/recovery-rounds\.sh/, "the backlog rounds"],
  [/if too_late_to_start; then record_stop "paused-drain backlog rounds skipped[\s\S]{0,200}?else RECOVERY_DEADLINE_EPOCH="\$DEADLINE" bash "\$SCRAPER_DIR\/scripts\/recovery-rounds\.sh"/, "the paused drain"],
];
for (const [re, what] of starts) if (!re.test(code)) fail(`${what} can start after ${"04:00"} (no too_late_to_start check)`);
if ((code.match(/bash (?:"\$SCRAPER_DIR\/)?scripts\/recovery-rounds\.sh/g) || []).length !== 2) fail("recovery-rounds.sh is started somewhere this gate doesn't check");
if ((code.match(/\[ "\$DEADLINE" -gt "\$HARD_STOP_EPOCH" \] && DEADLINE=\$HARD_STOP_EPOCH/g) || []).length < 2) fail("a deadline can run past the hard stop");

// ── 3 · one same-night retry ──
if (!/MAX_RECOVERY_SEARCHES="\$\{MAX_RECOVERY_SEARCHES:-1\}"/.test(code)) fail("the same night retries more than one search");

// ── 4 · recorded to fix later ──
if (!/STOPS_RECORD="\/Users\/chris\/RGA\/Rocket Growth Agency Website VS Code\/reports\/overnight-stops\.md"/.test(code)
  || !/echo "- \$\(date '\+%Y-%m-%d %H:%M'\) · run of \$\{DATE_STAMP\} · \$1" >> "\$STOPS_RECORD"/.test(code)) fail("stops aren't recorded in reports/overnight-stops.md");
if (!/record_stop "retry cap/.test(code)) fail("hitting the retry cap isn't recorded");

// ── 5 · no healing after the hard stop ──
if (!/if \[ -f "\$HARD_STOP_MARK" \]; then node scripts\/check-run-productivity\.mjs 2>&1/.test(code)) fail("the run can heal (render video) after the hard stop");

if (F.length) { console.error("🔴 the night run can keep going into the morning:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log(`✅ ${CASES.length} start times (incl. both clock changes and a late start): nothing new after 04:00, everything stops at 06:30; the watchdog stops it mid-step and records it; 4 start points ask the clock; 1 same-night retry; stops recorded to fix later; no healing after the stop`);
