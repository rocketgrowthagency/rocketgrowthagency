#!/usr/bin/env node
// check-daily-reds-reach-chris.mjs — A RED GATE REACHES CHRIS, NOT JUST A LOG (checkers build 11-11; master map approved by Chris:
// "every step with no checker gets one").
//
// GUARDS: the three runs that check everything tell Chris when something is red, through the one path that is read (System health:
// the job-watcher emails hello@ on a "Failed" row).
//   1 · the 07:30 daily-health-check records every gate's verdict with its first failing line, writes them to
//       website reports/daily-health/<date>.md (scripts/write-daily-health-report.mjs), and its check-in finish says "N red" as an
//       ERROR (--ok 0) when N > 0. Before: 20 reds on 11-11 sat in /tmp and gate-verdicts.jsonl; the card said "Ran".
//   2 · the 19:00 rehearsal checks in, and a red rehearsal is its error, so Chris hears before the 9 PM run refuses to start (11-10).
//   3 · the 23:30 full check's finish is an error when not everything held, never "Ran" over red items.
// HOW: static rules on the three scripts, then BEHAVIOUR: each script's own job_checkin_finish function is lifted and run in bash
// against a fake check-in server (nothing is posted for real; INTERNAL_FN_SECRET is a fake), and the report writer is run on a
// fixture verdict file into a temp folder. Reads the scripts from SCRAPER_COPY_DIR when set, so its mutation suite can break them.
// Exit 0 = the reds reach Chris · 1 = a red would stay unheard · 2 = INDETERMINATE (a script moved; a lift failed).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REAL = path.dirname(HERE);
const SCR = process.env.SCRAPER_COPY_DIR || REAL;
const F = [];
const idk = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
const scrFile = (rel) => (fs.existsSync(path.join(SCR, rel)) ? path.join(SCR, rel) : path.join(REAL, rel));
const read = (rel) => { try { return fs.readFileSync(scrFile(rel), "utf8"); } catch { return null; } };

const dh = read("scripts/daily-health-check.sh"), reh = read("scripts/rehearse-night-run.sh"), nf = read("scripts/nightly-full-check.sh");
if (!dh || !reh || !nf) idk("the daily, rehearsal or nightly script moved");
if (!fs.existsSync(scrFile("scripts/write-daily-health-report.mjs"))) F.push("scripts/write-daily-health-report.mjs is gone: the daily reds are written nowhere");

// ── 1 · static: every verdict arm records itself; the finish writes the report ─────────────────────────────────────────────────
const classify = /classify\(\) \{([\s\S]*?)\n\}/.exec(dh);
if (!classify) idk("classify() moved in daily-health-check.sh");
for (const [arm, verdict] of [["FAIL=$((FAIL+1))", "red"], ["INDET=$((INDET+1))", "indeterminate"]]) {
  const at = classify[1].indexOf(arm);
  if (at < 0) idk(`classify() lost its ${arm} arm`);
  const tail = classify[1].slice(at, at + 260);
  if (!new RegExp(`note_verdict ${verdict} "\\$script"`).test(tail)) F.push(`daily-health-check.sh: a ${verdict} gate is counted but not recorded for the report (classify ${arm})`);
}
if (!/THREW=\$\(\(THREW\+1\)\)\s*\n\s*note_verdict threw/.test(dh)) F.push("daily-health-check.sh: a gate that threw is counted but not recorded for the report");
if (!/^RUN_VERDICTS=\$\(mktemp\)$/m.test(dh)) F.push("daily-health-check.sh: no per-run verdict file, so the report has nothing to list");
const dfin = /job_checkin_finish\(\) \{([\s\S]*?)\n\}/.exec(dh);
if (!dfin) idk("job_checkin_finish moved in daily-health-check.sh");
if (!/node scripts\/write-daily-health-report\.mjs --verdicts "\$\{RUN_VERDICTS/.test(dfin[1])) F.push("daily-health-check.sh: the finish no longer writes reports/daily-health/<date>.md");
const rfin = /job_checkin_finish\(\) \{([\s\S]*?)\n\}/.exec(reh);
if (!rfin) F.push("rehearse-night-run.sh has no check-in finish: a red rehearsal reaches no one (11-10)");
if (!/^trap job_checkin_finish EXIT$/m.test(reh)) F.push("rehearse-night-run.sh: no EXIT trap, so a rehearsal that dies says nothing");
if (!/node scripts\/job-checkin\.mjs start night-rehearsal/.test(reh)) F.push("rehearse-night-run.sh never posts its start");
if (!/^JOB_REACHED_END=1$/m.test(reh) || reh.search(/^JOB_REACHED_END=1$/m) < reh.indexOf("phase \"D. arming state\"")) F.push("rehearse-night-run.sh marks the end before its last phase ran");
const nfin = /job_checkin_finish\(\) \{([\s\S]*?)\n\}/.exec(nf);
if (!nfin) idk("job_checkin_finish moved in nightly-full-check.sh");
if (!/if grep -q "FAILED" "\$FINAL" \|\| \[ -n "\$EVERY_NIGHT_RED" \]; then\s*\n\s*JOB_RED=/.test(nf)) F.push("nightly-full-check.sh never names what stayed red for System health, so a red night reads \"Ran\"");

// ── 2 · behaviour: the report writer on a fixture ─────────────────────────────────────────────────────────────────────────────
const T = fs.mkdtempSync(path.join(os.tmpdir(), "rga-reds-"));
process.on("exit", () => { try { fs.rmSync(T, { recursive: true, force: true }); } catch { /* gone */ } });
fs.mkdirSync(path.join(T, "scripts"), { recursive: true });
fs.copyFileSync(path.join(REAL, "scripts/job-checkin.mjs"), path.join(T, "scripts/job-checkin.mjs"));
if (fs.existsSync(scrFile("scripts/write-daily-health-report.mjs"))) fs.copyFileSync(scrFile("scripts/write-daily-health-report.mjs"), path.join(T, "scripts/write-daily-health-report.mjs"));
const SITE_T = path.join(T, "site");
const FIX = [
  ["ok", "check-a.mjs", "guards a", ""],
  ["red", "check-red-one.mjs", "the first red thing", "✗ the first red line"],
  ["red", "check-red-two.mjs", "the second red thing", "🔴 the second red line"],
  ["indeterminate", "check-retried.mjs", "a live gate", "skipped: the clients' database is struggling"],
  ["ok", "check-retried.mjs", "a live gate", ""],          // retried at the end and passed: must not be listed
  ["indeterminate", "check-blind.mjs", "a blind gate", "⚠️  INDETERMINATE — no token"],
  ["threw", "check-threw.mjs", "a crashing gate", "TypeError: x is not a function"],
  ["red", "brain-record-audit", "the brain is re-recorded", "brain recorded for 1 client(s), 1 FAILED"],
].map((r) => r.join("\t")).join("\n") + "\n";
const verdicts = path.join(T, "verdicts.tsv");
fs.writeFileSync(verdicts, FIX);
let report = "";
try {
  execFileSync("node", [path.join(T, "scripts/write-daily-health-report.mjs"), "--verdicts", verdicts, "--ok", "2", "--fail", "3", "--indet", "1", "--threw", "1", "--reached", "1", "--date", "2026-11-11"],
    { env: { ...process.env, APPROVAL_ARCHIVE_SITE_DIR: SITE_T }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  report = fs.readFileSync(path.join(SITE_T, "reports/daily-health/2026-11-11.md"), "utf8");
} catch (e) { F.push(`the report writer did not write reports/daily-health/<date>.md on a fixture: ${String(e.message).split("\n")[0].slice(0, 140)}`); }
if (report) {
  for (const g of ["check-red-one.mjs", "check-red-two.mjs", "brain-record-audit"]) if (!report.includes(`🔴 \`${g}\``)) F.push(`the daily report leaves out a red: ${g}`);
  if (!/the first red line/.test(report)) F.push("the daily report lists a red without its one-line detail");
  if (!report.includes("⚠️ `check-blind.mjs`")) F.push("the daily report leaves out a could-not-tell gate");
  if (!report.includes("`check-threw.mjs`")) F.push("the daily report leaves out a gate that threw");
  if (/`check-retried\.mjs`/.test(report)) F.push("the daily report lists a gate that was retried and passed (the later verdict must win)");
  if (/counted red, \d+ listed/.test(report)) F.push("the daily report's red list disagrees with the run's red count on a fixture that agrees");
  if (!/3 red · 1 could not tell · 1 threw · 2 healthy/.test(report)) F.push("the daily report does not carry the run's counts");
}

// ── 3 · behaviour: each script's own finish, against a fake check-in server ───────────────────────────────────────────────────
const posts = [];
const server = http.createServer((req, res) => {
  let b = ""; req.on("data", (c) => { b += c; });
  req.on("end", () => { try { posts.push(JSON.parse(b)); } catch { posts.push({ unreadable: b }); } res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"ok":true,"id":null}'); });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const URL_ = `http://127.0.0.1:${server.address().port}`;
const finish = (fnText, vars) => {
  posts.length = 0;
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, INTERNAL_FN_SECRET: "fake-secret-for-the-gate-only", JOB_CHECKIN_URL: URL_, JOB_CHECKIN_DIR: path.join(T, "ids"), APPROVAL_ARCHIVE_SITE_DIR: SITE_T, SCR: T, ...vars };
  const script = `${Object.entries(vars).map(([k, v]) => `${k}=${JSON.stringify(String(v))}`).join("\n")}\njob_checkin_finish() {${fnText}\n}\njob_checkin_finish\n`;
  return new Promise((resolve) => {
    import("node:child_process").then(({ execFile }) => execFile("bash", ["-c", script], { cwd: T, env, timeout: 20000 }, () => resolve(posts.slice())));
  });
};
const one = (got, label) => { const f = got.filter((p) => p.phase === "finish"); if (f.length !== 1) { F.push(`${label}: posted ${f.length} finish(es), not one`); return null; } return f[0]; };

// the daily: 3 red → ok false, error names "3 red" and the first reds and the report
fs.writeFileSync(verdicts, FIX);
let p = one(await finish(dfin[1], { FAIL: 3, INDET: 1, OK: 2, THREW: 1, UNRUNNABLE: 0, JOB_REACHED_END: 1, RUN_VERDICTS: verdicts }), "daily-health-check (3 red)");
if (p) {
  if (p.job !== "daily-health-check") F.push(`the daily finish posts as ${p.job}`);
  if (p.ok !== false) F.push("the daily finish says OK with 3 red gates: System health would read \"Ran\" and nobody hears");
  if (!/^3 red\b/.test(p.error || "")) F.push(`the daily finish's error does not start "3 red" (got: ${String(p.error).slice(0, 80)})`);
  if (!/check-red-one/.test(p.error || "")) F.push("the daily finish's error does not name the red gates");
  if (!/reports\/daily-health\/\d{4}-\d{2}-\d{2}\.md/.test(p.error || "")) F.push("the daily finish's error does not point at the day's report");
}
fs.writeFileSync(verdicts, FIX.split("\n").filter((l) => /^ok\t/.test(l)).join("\n") + "\n");
p = one(await finish(dfin[1], { FAIL: 0, INDET: 0, OK: 2, THREW: 0, UNRUNNABLE: 0, JOB_REACHED_END: 1, RUN_VERDICTS: verdicts }), "daily-health-check (all green)");
if (p && (p.ok !== true || p.error)) F.push("the daily finish reports a problem on an all-green run (a red every day teaches the reader to ignore it)");
p = one(await finish(dfin[1], { FAIL: 0, INDET: 0, OK: 2, THREW: 0, UNRUNNABLE: 0, JOB_REACHED_END: "", RUN_VERDICTS: verdicts }), "daily-health-check (died)");
if (p && p.ok !== false) F.push("the daily finish says OK for a run that stopped before the end");

// the rehearsal: a red phase → ok false + the phase
if (rfin) {
  p = one(await finish(rfin[1], { FAIL: 1, FAILED_LINES: "check-every-gate-is-wired.mjs FAILS: the 9 PM run will stop here", JOB_REACHED_END: 1 }), "rehearsal (red)");
  if (p) {
    if (p.job !== "night-rehearsal") F.push(`the rehearsal finish posts as ${p.job}`);
    if (p.ok !== false) F.push("a red rehearsal checks in as OK: the 9 PM refusal would reach no one (11-10)");
    if (!/check-every-gate-is-wired/.test(p.error || "")) F.push("a red rehearsal's error does not say which phase failed");
  }
  p = one(await finish(rfin[1], { FAIL: 0, FAILED_LINES: "", JOB_REACHED_END: 1 }), "rehearsal (green)");
  if (p && (p.ok !== true || p.error)) F.push("a green rehearsal checks in as a problem");
}

// the nightly: not everything held → ok false
p = one(await finish(nfin[1], { JOB_REACHED_END: 1, JOB_NOTE: "Not everything held; see the morning report", JOB_RED: "Not everything held: 4 item(s) red" }), "nightly (red)");
if (p) {
  if (p.ok !== false) F.push("a red night checks in as OK (\"Ran\"): it reaches Chris only if he opens the report");
  if (!/Not everything held/.test(p.error || "")) F.push("a red night's error does not say what stayed red");
}
p = one(await finish(nfin[1], { JOB_REACHED_END: 1, JOB_NOTE: "Everything held", JOB_RED: "" }), "nightly (held)");
if (p && (p.ok !== true || p.error)) F.push("a night where everything held checks in as a problem");
server.close();

if (F.length) { console.error(`🔴 a red gate would not reach Chris:\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log("✅ the reds reach Chris: the morning run lists every red, could-not-tell and threw gate in reports/daily-health/<date>.md and says N red as its System health error; a red rehearsal and a red night are errors too (fake check-in server, nothing posted)");
