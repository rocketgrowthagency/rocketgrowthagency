#!/usr/bin/env node
// run-gates-fast.mjs — the full gate suite in ~1/3 of the time (Chris 10-22: "is there anyway we can speed up the tests full check
// its always 25 min plus?").
//
// 🔑 WHY IT WAS SLOW: all ~415 gates ran one after another. Only the gates that touch PRODUCTION must take turns (they share the
// clients' Supabase and sign in to the live site → feedback_my_test_runs_share_the_clients_database). Every gate that only reads
// files (and fakes its network) is independent, so those run in parallel.
//
// 🔒 CLASSIFICATION IS BY WHAT THE FILE DOES, and errs toward "live" (sequential): a gate is LIVE when it reads the real Supabase env
// without faking it, opens the live site, or uses the walk/admin session helpers. A wrong "live" only costs time; a wrong
// "file-only" could put two production gates side by side — so FORCE_LIVE below overrides anything the heuristic misses.
//
// usage: node scripts/run-gates-fast.mjs [--jobs=N] [--changed] [--force: skip the 60-min live cool-down]   (--changed: only gates that read a file changed since HEAD~1,
//        plus every live gate; the full run still happens daily at 07:30 in daily-health-check.sh)
// output: one FAIL line per failing gate, then "---ran N · failing F · Xs", and the 15 slowest gates with their time.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const args = process.argv.slice(2);
const JOBS = Math.max(1, Number((args.find((a) => a.startsWith("--jobs=")) || "").slice(7)) || Math.min(6, os.cpus().length - 1));
const CHANGED = args.includes("--changed");
const SKIP = new Set(["check-video-visual.mjs"]);   // a per-video tool, never a standalone gate (same as the old full.sh)
const FORCE_LIVE = new Set([]);                     // add a gate here if the heuristic ever calls a production gate "file-only"

const gates = fs.readdirSync(HERE).filter((f) => /^check-.*\.mjs$/.test(f) && !SKIP.has(f)).sort();
const src = (g) => fs.readFileSync(path.join(HERE, g), "utf8");
const isLive = (g) => {
  if (FORCE_LIVE.has(g)) return true;
  const s = src(g);
  const fakesSupabase = /process\.env\.SUPABASE_URL\s*=\s*["'`]https?:\/\/(?:db|stub)/.test(s);
  const readsSupabase = /process\.env\.SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ACCESS_TOKEN|AIRTABLE_API_KEY/.test(s) && !fakesSupabase;
  const opensLiveSite = /https:\/\/www\.rocketgrowthagency\.com|_admin-session\.mjs|acceptance\/guard\.mjs|generate_link/.test(s);
  const spawnsOthers = /execSync\(|spawnSync\(|execFileSync\(/.test(s) && /node /.test(s);
  return readsSupabase || opensLiveSite || spawnsOthers;
};
let pick = gates;
if (CHANGED) {
  let changed = [];
  try { changed = execSync("git diff --name-only HEAD~1 HEAD; git diff --name-only", { cwd: SITE, encoding: "utf8" }).split("\n").filter(Boolean); } catch { /* no git → run all */ }
  try { changed.push(...execSync("git diff --name-only HEAD~1 HEAD; git diff --name-only", { cwd: path.dirname(HERE), encoding: "utf8" }).split("\n").filter(Boolean).map((f) => `scraper:${f}`)); } catch { /* fine */ }
  pick = gates.filter((g) => isLive(g) || changed.some((f) => {
    const base = path.basename(f.replace(/^scraper:/, ""));
    return f === `scraper:scripts/${g}` || src(g).includes(base) || (f.startsWith("scraper:scripts/mutations/") && base === g.replace(/\.mjs$/, ".json"));
  }));
}
const live = pick.filter(isLive), files = pick.filter((g) => !isLive(g));
const env = { ...process.env };
const run1 = (g) => new Promise((resolve) => {
  const t0 = Date.now();
  const child = execFile("node", [path.join(HERE, g)], { env, maxBuffer: 32 * 1024 * 1024, timeout: 240000 }, (err, stdout, stderr) => {
    const rc = err ? (typeof err.code === "number" ? err.code : 1) : 0;
    const out = `${stdout || ""}${stderr || ""}`.split("\n").filter((l) => l.trim() && !/^\s*✓/.test(l) && !/^\s+at /.test(l));
    resolve({ g, rc, ms: Date.now() - t0, tail: out.slice(-2).join(" ").slice(0, 200) });
  });
  child.stdin && child.stdin.end();
});
const results = [];
const t0 = Date.now();
// file-only gates: a pool of JOBS workers
await new Promise((done) => {
  let i = 0, active = 0;
  const next = () => {
    if (i >= files.length && active === 0) return done();
    while (active < JOBS && i < files.length) {
      const g = files[i++]; active++;
      run1(g).then((r) => { results.push(r); active--; next(); });
    }
  };
  next();
});
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴🔴 THE LIVE GATES SHARE THE CLIENTS' DATABASE (10-26: four full runs in one afternoon; the last one's live phase hit it with
// ~600 data requests + 160 sign-ins a minute at 4:24–4:31 PM, and the database, sign-in and data API all went UNHEALTHY —
// every client portal sat on "Loading" until it was restarted). Two guards, so a test run can never be what takes clients down:
//   1 · COOL-DOWN: the live phase won't start within 60 min of the last one (--force overrides, on purpose only)
//   2 · HEALTH BEFORE EACH LIVE GATE: one cheap read; slow (> 4 s) or failing → wait 30 s and look once more; still bad → STOP
//       every remaining live gate and say so. Never pile on a struggling database. → feedback_my_test_runs_share_the_clients_database
// ═══════════════════════════════════════════════════════════════════════════════════════════════
const STAMP = path.join(os.tmpdir(), "rga-gates-last-live-run");
const FORCE = process.argv.includes("--force");
async function dbOk() {
  const U = process.env.SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!U || !K) return { ok: true, why: "no database env (live gates will report INDETERMINATE themselves)" };
  const t = Date.now();
  try {
    const r = await fetch(`${U}/rest/v1/clients?select=id&limit=1`, { headers: { apikey: K, Authorization: `Bearer ${K}` }, signal: AbortSignal.timeout(8000) });
    const ms = Date.now() - t;
    return r.ok && ms <= 4000 ? { ok: true, ms } : { ok: false, why: r.ok ? `slow (${ms} ms)` : `HTTP ${r.status}` };
  } catch (e) { return { ok: false, why: e.name === "TimeoutError" ? "no answer in 8 s" : e.message }; }
}
let stopped = null;
const last = (() => { try { return Number(fs.readFileSync(STAMP, "utf8")) || 0; } catch { return 0; } })();
if (live.length && !FORCE && Date.now() - last < 60 * 60000) {
  stopped = `the last live run ended ${Math.round((Date.now() - last) / 60000)} min ago (cool-down 60 min; --force to override)`;
} else {
  for (let k = 0; k < live.length; k++) {
    let h = await dbOk();
    if (!h.ok) { console.log(`⏸  the clients' database is struggling (${h.why}); waiting 30 s before the next live gate…`); await new Promise((r) => setTimeout(r, 30000)); h = await dbOk(); }
    if (!h.ok) { stopped = `the clients' database is struggling (${h.why}) — ${live.length - k} live gate(s) NOT run, so nothing piles on`; break; }
    results.push(await run1(live[k]));
  }
  if (live.length) try { fs.writeFileSync(STAMP, String(Date.now())); } catch { /* the cool-down is best-effort */ }
}
if (stopped) console.log(`🛑 LIVE GATES STOPPED: ${stopped}`);
const fails = results.filter((r) => r.rc !== 0).sort((a, b) => a.g.localeCompare(b.g));
for (const r of fails) console.log(`FAIL ${r.rc} ${r.g} :: ${r.tail}`);
console.log(`---ran ${results.length} (${files.length} file-only × ${JOBS} at once · ${live.length} live, one at a time) · failing ${fails.length} · ${Math.round((Date.now() - t0) / 1000)}s`);
console.log("slowest:");
for (const r of [...results].sort((a, b) => b.ms - a.ms).slice(0, 15)) console.log(`  ${String(Math.round(r.ms / 1000)).padStart(4)}s ${isLive(r.g) ? "live" : "file"} ${r.g}`);
process.exit(stopped ? 3 : 0);
