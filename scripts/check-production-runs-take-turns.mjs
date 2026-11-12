#!/usr/bin/env node
// check-production-runs-take-turns.mjs: ONE TURN AT A TIME ON THE CLIENTS' DATABASE (automation clock master page, approved 11-11,
// decision 1: "One shared lock: whichever run holds it, the others wait; each has a hard end time, and the full check never runs past
// 06:00"). On 11-10/11 the night full check ran 23:30 to 06:19 beside the overnight run, and the morning check and the backup read the
// same database with no interlock.
// HOLDS (both repos; the lock itself is RUN in a temp directory, nothing else is touched):
//   1  scripts/lib/production-turn.sh: a free turn is taken (holder line names who + pid); a live holder inside its time makes a taker
//      wait and then refuse, naming the holder; a holder whose process is gone is taken over; one alive 10 minutes past its hard end is
//      taken over; the guardian gives the turn back when the holder's process ends; a run started by a holder inherits it.
//   2  scripts/lib/production-turn.mjs keeps the same rules on the same lock (a Node run and a bash run can't both hold it).
//   3  the morning check, the night full check and the client data backup each take the turn before they read anything, and a refused
//      turn is a check-in that says "Did not run" (never silence, never running beside the holder).
//   4  the night full check's hard end is 06:00 by default, and a watchdog stops it there (and only if it is still running).
//   5  the 9 PM video run's pre-flight gates read no client data (no Supabase key, no admin session), so it needs no turn; this fails the
//      day one does.
//   6  the night rehearsal pages before the 9 PM run: its due time + grace, at the watcher's next :05, is before 21:00.
// PROVES ITSELF: it must fail on the before state (website c621cc35, scraper 686467af) in 4+ places, else exit 2.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { runTwoRepoGate, rd, REAL_SCR } from "./lib/two-repo-gate.mjs";

// 🔴 11-12: NOT THE OUTER TURN. Inside the night full check this gate runs as a child of the turn's holder, so it inherits
// RGA_PRODUCTION_TURN_HELD, and every test lock below "inherited" the turn instead of taking it: no holder line, no wait, no refusal
// (red only in the night run, green by hand). Each test lock starts clean; a test that means to inherit passes the variable itself.
const { RGA_PRODUCTION_TURN_HELD: _outerTurn, ...OWN_ENV } = process.env;
const bash = (script, env = {}) => spawnSync("bash", ["-c", script], { encoding: "utf8", env: { ...OWN_ENV, RGA_PRODUCTION_TURN_POLL_SEC: "1", ...env }, timeout: 30000 });
const tmpLock = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "turn-")), "lock");
const sleeper = () => { const p = spawn("sleep", ["60"], { stdio: "ignore", detached: true }); p.unref(); return p; };
const now = () => Math.floor(Date.now() / 1000);
const waitGone = async (p, ms = 6000) => { const t = Date.now(); while (fs.existsSync(p) && Date.now() - t < ms) await new Promise((r) => setTimeout(r, 200)); return !fs.existsSync(p); };

async function checkTree(site, scr, label) {
  const F = [], fail = (m) => F.push(`${label}: ${m}`), S = rd(scr), W = rd(site);
  const libSh = path.join(scr, "scripts/lib/production-turn.sh"), libMjs = path.join(scr, "scripts/lib/production-turn.mjs");

  // ── 1 the bash lock, run ──────────────────────────────────────────────────────────────────────────────────────────────────
  if (!fs.existsSync(libSh)) fail("scripts/lib/production-turn.sh is missing: nothing makes the night runs take turns");
  else {
    const src = `. "${libSh}"`;
    { const L = tmpLock(); const r = bash(`${src}; production_turn_take tester 0 $(( $(date +%s) + 600 )); echo "rc=$?"; head -1 "${L}/holder" | cut -f1; sleep 0.2`, { RGA_PRODUCTION_TURN_DIR: L });
      if (!/rc=0/.test(r.stdout) || !/tester/.test(r.stdout)) fail(`a free turn wasn't taken, or the holder line doesn't name who (${(r.stdout + r.stderr).trim().slice(0, 120)})`); }
    { const L = tmpLock(), p = sleeper(); fs.mkdirSync(L); fs.writeFileSync(`${L}/holder`, `nightly-full-check\t${p.pid}\t${now()}\t${now() + 3600}\n`);
      const r = bash(`${src}; production_turn_take tester 0 0; echo "rc=$? why=$PRODUCTION_TURN_WHY"`, { RGA_PRODUCTION_TURN_DIR: L });
      if (!/rc=1/.test(r.stdout)) fail("a live holder inside its time didn't make the taker wait and refuse: two runs would read the database at once");
      else if (!/why=nightly-full-check held/.test(r.stdout)) fail(`a refused turn doesn't name who holds it (${r.stdout.trim().slice(0, 120)})`);
      if (fs.readFileSync(`${L}/holder`, "utf8").split("\t")[1] !== String(p.pid)) fail("a refused taker changed the live holder's lock");
      try { process.kill(p.pid); } catch { /* gone */ } }
    { const L = tmpLock(); fs.mkdirSync(L); fs.writeFileSync(`${L}/holder`, `daily-health-check\t999999\t${now() - 100}\t${now() + 3600}\n`);
      const r = bash(`${src}; production_turn_take tester 0 0; echo "rc=$?"`, { RGA_PRODUCTION_TURN_DIR: L });
      if (!/rc=0/.test(r.stdout)) fail("a holder whose process is gone wasn't taken over: one crash would stop every other run"); }
    { const L = tmpLock(), p = sleeper(); fs.mkdirSync(L); fs.writeFileSync(`${L}/holder`, `stuck-run\t${p.pid}\t${now() - 9000}\t${now() - 700}\n`);
      const r = bash(`${src}; production_turn_take tester 0 0; echo "rc=$?"`, { RGA_PRODUCTION_TURN_DIR: L });
      if (!/rc=0/.test(r.stdout)) fail("a holder alive 10 minutes past its own hard end wasn't taken over: one stuck run would stop every other run");
      try { process.kill(p.pid); } catch { /* gone */ } }
    { const L = tmpLock(), p = sleeper(); fs.mkdirSync(L); fs.writeFileSync(`${L}/holder`, `on-time\t${p.pid}\t${now() - 100}\t${now() - 300}\n`);
      const r = bash(`${src}; production_turn_take tester 0 0; echo "rc=$?"`, { RGA_PRODUCTION_TURN_DIR: L });
      if (!/rc=1/.test(r.stdout)) fail("a holder only 5 minutes past its hard end was taken over: the grace is 10 minutes");
      try { process.kill(p.pid); } catch { /* gone */ } }
    { const L = tmpLock(); bash(`${src}; production_turn_take tester 0 0`, { RGA_PRODUCTION_TURN_DIR: L, RGA_PRODUCTION_TURN_GUARD_SEC: "1" });
      if (!(await waitGone(L))) fail("the turn wasn't given back when its holder's process ended: every later run would wait for nothing"); }
    { const L = tmpLock(), p = sleeper(); fs.mkdirSync(L); fs.writeFileSync(`${L}/holder`, `daily-health-check\t${p.pid}\t${now()}\t${now() + 3600}\n`);
      const r = bash(`${src}; production_turn_take a-gate-inside 0 0; echo "rc=$?"`, { RGA_PRODUCTION_TURN_DIR: L, RGA_PRODUCTION_TURN_HELD: "daily-health-check" });
      if (!/rc=0/.test(r.stdout)) fail("a run started by the holder didn't inherit the turn: the morning check's own gates would wait on it");
      try { process.kill(p.pid); } catch { /* gone */ } }
    { const r = bash(`${src}; e=$(production_turn_next_clock 0600); echo "$e"`);
      const e = Number(r.stdout.trim()), d = new Date(e * 1000);
      const hm = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
      if (!(e > now() && e - now() <= 86400 + 3600) || hm !== "06:00") fail(`the next 06:00 isn't the next 06:00 on the clock (got ${hm}, ${Math.round((e - now()) / 3600)} h ahead)`); }
  }

  // ── 2 the Node lock, same rules ───────────────────────────────────────────────────────────────────────────────────────────
  if (!fs.existsSync(libMjs)) fail("scripts/lib/production-turn.mjs is missing: the backup can't take its turn");
  else {
    const { takeTurn } = await import(`${libMjs}?v=${label}`);
    { const L = tmpLock(), p = sleeper(); fs.mkdirSync(L); fs.writeFileSync(`${L}/holder`, `daily-health-check\t${p.pid}\t${now()}\t${now() + 3600}\n`);
      const t = await takeTurn({ who: "client-data-backup", maxWaitMin: 0, env: { RGA_PRODUCTION_TURN_DIR: L }, sleepMs: 10 });
      if (t.ok !== false || !/daily-health-check held/.test(t.why || "")) fail(`the Node lock didn't refuse beside a live bash holder (${JSON.stringify(t).slice(0, 100)})`);
      try { process.kill(p.pid); } catch { /* gone */ } }
    { const L = tmpLock(); fs.mkdirSync(L); fs.writeFileSync(`${L}/holder`, `x\t999999\t${now()}\t${now() + 3600}\n`);
      const env = { RGA_PRODUCTION_TURN_DIR: L };
      const t = await takeTurn({ who: "client-data-backup", maxWaitMin: 0, env, sleepMs: 10 });
      const line = fs.existsSync(`${L}/holder`) ? fs.readFileSync(`${L}/holder`, "utf8") : "";
      if (t.ok !== true || !line.startsWith(`client-data-backup\t${process.pid}\t`)) fail("the Node lock didn't take over a dead holder, or didn't write who holds it");
      if (env.RGA_PRODUCTION_TURN_HELD !== "client-data-backup") fail("the Node lock doesn't pass the turn on to what it starts");
      fs.rmSync(L, { recursive: true, force: true }); }
    { const L = tmpLock(), p = sleeper(); fs.mkdirSync(L); fs.writeFileSync(`${L}/holder`, `stuck\t${p.pid}\t${now() - 9000}\t${now() - 700}\n`);
      const t = await takeTurn({ who: "client-data-backup", maxWaitMin: 0, env: { RGA_PRODUCTION_TURN_DIR: L }, sleepMs: 10 });
      if (t.ok !== true) fail("the Node lock didn't take over a holder 10 minutes past its hard end");
      fs.rmSync(L, { recursive: true, force: true }); try { process.kill(p.pid); } catch { /* gone */ } }
  }

  // ── 3 + 4 who takes it ────────────────────────────────────────────────────────────────────────────────────────────────────
  const dh = S("scripts/daily-health-check.sh"), nf = S("scripts/nightly-full-check.sh"), bk = S("scripts/backup-client-data.mjs");
  if (!dh || !nf || !bk) { fail("the morning check, the night full check or the backup moved"); return F; }
  {
    const take = dh.search(/^if ! production_turn_take daily-health-check \d+ /m), firstGate = dh.search(/^run [a-z0-9-]+\.mjs /m);
    if (!/^\. scripts\/lib\/production-turn\.sh$/m.test(dh) || take < 0) fail("the morning check doesn't take the turn on the clients' database");
    else if (firstGate >= 0 && take > firstGate) fail("the morning check takes the turn after its gates have started reading");
    const refused = dh.slice(take, take + 600);
    if (take >= 0 && !/job-checkin\.mjs finish daily-health-check --ok 0 --error "Did not run: \$PRODUCTION_TURN_WHY"/.test(refused)) fail("a morning check that can't get the turn doesn't say 'Did not run' on System health");
    if (take >= 0 && !/exit 0/.test(refused)) fail("a morning check that can't get the turn still runs beside the holder");
  }
  {
    const take = nf.search(/! production_turn_take nightly-full-check \d+ "\$FULL_CHECK_HARD_END"/), range = nf.indexOf("# ── 1 · the range");
    if (take < 0) fail("the night full check doesn't take the turn on the clients' database");
    else if (range >= 0 && take > range) fail("the night full check takes the turn after it has started");
    if (!/FULL_CHECK_HARD_END=\$\(production_turn_next_clock "\$\{FULL_CHECK_HARD_END_HHMM:-0600\}"\)/.test(nf)) fail("the night full check's hard end isn't 06:00");
    const refused = nf.slice(take, take + 500);
    if (take >= 0 && !/finish nightly-full-check --ok 0 --error "Did not run: \$PRODUCTION_TURN_WHY"/.test(refused)) fail("a full check that can't get the turn doesn't say 'Did not run'");
    const dog = /\( main=\$\$; sleep \$\(\( FULL_CHECK_HARD_END - \$\(date \+%s\) \)\)[\s\S]{0,200}kill -0 "\$main" 2>\/dev\/null \|\| exit 0[\s\S]{0,400}kill -TERM "\$main"[\s\S]{0,200}full_check_kill_tree/.exec(nf);
    if (!dog) fail("nothing stops the full check at its hard end (or it would stop a run that already finished)");
    if (!/## Stopped at the 06:00 hard end/.test(nf)) fail("a full check stopped at 06:00 doesn't say so in the morning report");
  }
  {
    const take = bk.search(/takeTurn\(\{ who: "client-data-backup", maxWaitMin: \d+, hardEndEpoch:/), read = bk.indexOf("await get(`${SUPA}/rest/v1/`)");
    if (take < 0) fail("the client data backup doesn't take the turn on the clients' database");
    else if (read >= 0 && take > read) fail("the backup takes the turn after it has started reading");
    if (take >= 0 && !/if \(!turn\.ok\) \{ const m = `Did not run: \$\{turn\.why\}`;[^\n]*record\(\{ ok: false, problem: m \}\)/.test(bk)) fail("a backup that can't get the turn doesn't record 'Did not run'");
    if (!/if \(!process\.env\.BACKUP_DATA_STATUS\) \{\s*\n\s*const \{ takeTurn \}/.test(bk)) fail("the gate's own copy of the backup (inside the morning check) would wait on the morning check's turn");
  }

  // ── 5 the 9 PM run's pre-flight reads no client data ─────────────────────────────────────────────────────────────────────
  {
    const op = S("scripts/overnight-pipeline.sh");
    const a = op ? op.indexOf("# Pre-flight: verification-gate regression") : -1, b = op ? op.indexOf("✓ pre-flight gates passed") : -1;
    if (a < 0 || b < a) fail("the 9 PM run's pre-flight block moved, so it can't be shown to read no client data");
    else {
      const names = [...new Set([...op.slice(a, b).matchAll(/scripts\/([a-z0-9-]+\.mjs)/g)].map((m) => m[1]))];
      if (names.length < 20) fail(`only ${names.length} pre-flight gates found; the block moved`);
      for (const n of names) {
        const t = rd(scr)(`scripts/${n}`) ?? rd(REAL_SCR)(`scripts/${n}`);
        if (t && /SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|_admin-session/.test(t)) fail(`the 9 PM pre-flight runs ${n}, which reads the clients' database: the 9 PM run must take the turn too`);
      }
    }
  }

  // ── 6 the rehearsal pages before the run it protects ─────────────────────────────────────────────────────────────────────
  {
    let JOBS = [];
    try { JOBS = createRequire(path.join(site, "netlify/functions/x.js"))("./_job-manifest.js").JOBS; } catch (e) { fail(`the job list won't load: ${String(e.message).slice(0, 80)}`); }
    const reh = JOBS.find((j) => j.job === "night-rehearsal"), night = JOBS.find((j) => j.job === "overnight-build"), w = JOBS.find((j) => j.job === "job-watcher");
    if (!reh || !night || !w) fail("night-rehearsal, overnight-build or job-watcher isn't on the job list, so a rehearsal that never starts reaches no one");
    else {
      const hm = (c) => { const [mi, h] = String(c).split(/\s+/); return Number(h) * 60 + Number(mi); };
      const due = hm(reh.cron) + reh.grace_min, wm = Number(String(w.cron).split(/\s+/)[0]);
      let tick = Math.floor(due / 60) * 60 + wm; if (tick < due) tick += 60;
      if (tick >= hm(night.cron)) fail(`a rehearsal that never starts is first reported at ${String(Math.floor(tick / 60)).padStart(2, "0")}:${String(tick % 60).padStart(2, "0")}, not before the ${night.cron.split(" ")[1]}:00 run it protects (grace ${reh.grace_min})`);
    }
  }
  return F;
}

try {
  await runTwoRepoGate({ name: "check-production-runs-take-turns", siteBefore: "c621cc35", scrBefore: "686467af", checkTree, minBefore: 4 });
} catch (e) { console.error(`⚠️  INDETERMINATE: the gate threw: ${String(e && e.stack || e).slice(0, 400)}`); process.exit(2); }
