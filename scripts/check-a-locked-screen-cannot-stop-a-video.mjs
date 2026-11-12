#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-a-locked-screen-cannot-stop-a-video.mjs
//
// 🔒 WHY (Chris, 2026-11-12: "for every failure find the reason and fix … so we never forget or regress"):
// the night of 11-11 built 3 videos out of 13 leads. 8 failed "step-3 incomplete (2/3 WebMs)" because the
// Mac screen was LOCKED: the Maps freeze frames come from macOS `screencapture`, which returns nothing on a
// locked screen, so "every grabFreeze() returned null" and the Maps WebM was never written. The 3 that
// shipped had their card opened in-page, so they took the page-shot path, which reads the browser, not
// the display. The night's report then made it worse in two ways:
//   - the log line blamed "website or mobile … likely bot-blocked site", the opposite of what happened;
//   - the "Whole night" roll-up, written at 23:38, read the PREVIOUS night (11-10 Veterinarians) and said
//     "No dead window", and listed every search twice.
// This gate holds all three fixes:
//   1. step-3-video-recorder.mjs: grabFreeze() goes to the page shot when the screen is locked, and falls
//      back to it when a desktop grab comes back empty; the lock is read from CGSSessionScreenIsLocked.
//   2. overnight-pipeline.sh: the "only N/3 WebMs" line names the MISSING recording and never guesses
//      "bot-blocked".
//   3. check-run-productivity.mjs: run at 23:38 and at 07:30 the next morning it reads the SAME night,
//      and a search that is in both night logs is counted once (behavioural, on a fixture night).
// exit 0 = a locked screen cannot stop a video and the report says why · 1 = it can · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = process.env.SCRAPER_COPY_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readCode = (rel, comment) => {
  let src;
  try { src = fs.readFileSync(path.join(ROOT, rel), "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${rel}`); process.exit(2); }
  return src.split("\n").filter((l) => !comment.test(l)).join("\n");
};
const F = []; const fail = (m) => F.push(m);

// ── 1 · the recorder's freeze grab ──
const rec = readCode("step-3-video-recorder.mjs", /^\s*\/\//);
// The block form (the fix) or the one-line form it replaced (which must FAIL below, not read as unknown).
const gf = (rec.match(/const grabFreeze = async \(\) => \{[\s\S]*?\n  \};/) || rec.match(/const grabFreeze = async \(\) =>.*$/m) || [])[0];
if (!gf) { console.error("⚠️  INDETERMINATE — could not find grabFreeze() in step-3-video-recorder.mjs"); process.exit(2); }
const lockFn = (rec.match(/const screenIsLocked = \(\) => \{[\s\S]*?\n  \};/) || [])[0];
if (!lockFn) fail("1a step-3: no screenIsLocked() — the freeze grab cannot know the screen is locked");
else if (!/CGSSessionScreenIsLocked/.test(lockFn) || !/<true\\\/>/.test(lockFn)) fail("1b step-3: screenIsLocked() does not read CGSSessionScreenIsLocked = true from ioreg");
if (!/if \([^)]*screenIsLocked\(\)[^)]*\)\s*return grabViaPageShot\(\)/.test(gf)) fail("1c step-3: a locked screen does not send grabFreeze() to the page shot");
if (!/\(await grabViaScreenCapture\(\)\)\s*\|\|\s*grabViaPageShot\(\)/.test(gf)) fail("1d step-3: an empty desktop grab does not fall back to the page shot");
if (/:\s*grabViaScreenCapture\(\)\s*\)?\s*;?\s*$/m.test(gf)) fail("1e step-3: grabFreeze() still ends on a bare desktop grab");

// ── 2 · the pipeline names the missing recording ──
const pipe = readCode("scripts/overnight-pipeline.sh", /^\s*#/);
const only = pipe.split("\n").find((l) => /step-3 produced only/.test(l)) || "";
if (!only) fail("2a overnight-pipeline: the \"step-3 produced only N/3 WebMs\" line is gone (the failure is no longer said)");
if (/bot-blocked/.test(only)) fail("2b overnight-pipeline: the N/3 WebMs line guesses \"bot-blocked site\" instead of naming what is missing");
if (only && !/missing: \$\{WEBM_MISSING/.test(only)) fail("2c overnight-pipeline: the N/3 WebMs line does not name the missing recording");
for (const seg of ["desktop_website", "mobile", "desktop_maps"]) {
  if (!new RegExp(`for _seg in[^\\n]*\\b${seg}\\b`).test(pipe)) fail(`2d overnight-pipeline: the missing-recording check does not look for ${seg}`);
}

// ── 3 · the night roll-up reads tonight, once ──
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rga-lockgate-"));
const night = "=== Overnight pipeline: Pest control in El Segundo, CA ===\nStarted: 21:30\n>>> [worker-1] dispatching: A\n>>> [worker-2] dispatching: B\n";
const prev = "=== Overnight pipeline: Veterinarians in El Segundo, CA ===\nStarted: 21:00\n";
fs.writeFileSync(path.join(dir, "overnight-local-2026-11-11.log"), night);
fs.writeFileSync(path.join(dir, "overnight-pipeline-2026-11-11.log"), night);
fs.writeFileSync(path.join(dir, "overnight-local-2026-11-10.log"), prev);
const roll = (now) => {
  try {
    return execFileSync("node", [path.join(ROOT, "scripts/check-run-productivity.mjs")], {
      encoding: "utf8", env: { PATH: process.env.PATH, HOME: process.env.HOME, PRODUCTIVITY_LOG_DIR: dir, PRODUCTIVITY_NOW: now },
    });
  } catch (e) { return String(e.stdout || ""); }
};
for (const now of ["2026-11-11T23:38:00", "2026-11-12T07:30:00"]) {
  const out = roll(now);
  if (!/===== RUN PRODUCTIVITY =====/.test(out)) { fs.rmSync(dir, { recursive: true, force: true }); console.error(`⚠️  INDETERMINATE — the roll-up printed nothing at ${now}`); process.exit(2); }
  if (!/window\s*:\s*2026-11-11 21:00 → 2026-11-12 07:00/.test(out)) fail(`3a roll-up at ${now}: does not read the night of 11-11 → 11-12 (${(out.match(/window\s*:.*/) || ["no window line"])[0]})`);
  if (/Veterinarians/.test(out)) fail(`3b roll-up at ${now}: shows the PREVIOUS night's search`);
  const rows = out.split("\n").filter((l) => /^\s+21:30\s+Pest control/.test(l)).length;
  if (rows !== 1) fail(`3c roll-up at ${now}: the search in both night logs is listed ${rows} times, not once`);
  if (!/leads dispatched:\s*2\)/.test(out)) fail(`3d roll-up at ${now}: dispatches counted twice or not at all (${(out.match(/leads dispatched:\s*\d+/) || ["none"])[0]})`);
}
fs.rmSync(dir, { recursive: true, force: true });

if (F.length) {
  console.log(`❌ A LOCKED SCREEN CAN STOP A VIDEO, OR THE REPORT HIDES WHY (${F.length}):`);
  for (const f of F) console.log("   • " + f);
  console.log("   → project_night_run_needs_an_unlocked_screen (memory)");
  process.exit(1);
}
console.log("✅ a locked screen cannot stop a video: the Maps frames fall back to the page, the failure line names the missing recording, the night roll-up reads tonight once");
process.exit(0);
