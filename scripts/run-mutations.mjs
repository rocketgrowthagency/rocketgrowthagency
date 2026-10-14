#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// RE-PROVE THAT A GATE CAN FAIL.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴🔴 WHY THIS EXISTS. Every gate here is mutation-tested when it is written — and until 2026-10-06
// those runs lived in a scratch directory that vanished with the session. The NUMBER survived in a
// commit message ("9/9 mutations"); the ability to check it did not. So a gate that silently went
// blind months later looked exactly like one that still worked.
//
// Two of those happened in one day: `check-refusal-is-not-done` pinned a literal title and reported
// INDETERMINATE from the moment a better design shipped, and 100 of 289 gates hardcoded their paths
// so no mutation could ever reach them.
//
// 🔑 A CLAIM THAT A GATE CAN FAIL IS WORTH WHAT IT COSTS TO RE-CHECK IT. These suites are part of
// the repo now, and this runs them.
//
//   node scripts/run-mutations.mjs                      # every suite
//   node scripts/run-mutations.mjs check-a-done-step…   # one (or several names)
//   --jobs=N     run N mutations at once, each in its own copy (default 4)
//   --fresh      ignore the cache and run every mutation
//
// 🔑 FAST BY DEFAULT (2026-10-14, Chris: "harden system… so it doesnt take so long"). One 116-mutation run took ~40
// minutes, because (1) it RE-COPIED THE WHOLE SITE before every mutation, (2) it ran them one at a time, though the
// browser gates spend ~20s each mostly waiting, and (3) it re-ran mutations nothing had touched. Now each worker gets
// ONE copy and restores only the file it mutated; workers run in parallel; and a mutation already caught is skipped
// while its gate, its suite entry and every file the suite targets are byte-identical (`.mutation-cache.json`, which
// expires after 7 days so a full run still happens weekly). Only a CAUGHT result is cached: a miss always re-runs.
//
// A suite is a JSON array of [name, file, find, replace, expect?]. `file` names a source the gate
// reads; `expect` is the exit code the mutation should produce and defaults to 1.
//
// 🔑 SOMETIMES THE RIGHT ANSWER IS "I CANNOT TELL". A mutation that breaks the gate's PREMISE rather
// than the product — moving the condition the gate mirrors — should make it exit 2 and ask to be
// re-read, not accuse whatever happens to use that condition. Writing `2` records that intent, so
// the day it starts exiting 1 instead (quietly accusing correct code) the suite says so.
// → feedback_a_gate_that_throws_is_not_a_gate_that_fails
//
// Each mutation is applied to a THROWAWAY COPY of the site — never the working tree. An unmutated
// run must exit 0.
//
// → feedback_a_gate_that_cannot_fail · feedback_a_gate_that_cannot_be_pointed_at_a_copy_was_never_tested
// Exit 0 all suites prove their gate can fail · 1 a gate could not be made to fail · 2 INDETERMINATE

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
// 🔴 fileURLToPath, NOT `.pathname` — a path containing spaces comes back percent-encoded
// ("Rocket%20Growth"), and every lookup under it then misses. → feedback_correct_is_not_the_same_as_happening
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = `${HERE}/mutations`;
// The target map is shared with check-every-mutation-still-applies (daily). → scripts/lib/mutation-targets.mjs
import { FILES } from "./lib/mutation-targets.mjs";
// 🔴 A HAND-WRITTEN FILE LIST IS A PROMISE SOMEBODY WILL REMEMBER — copy the source directories by rule, skipping
// media, so a gate that starts reading a new file needs nothing here. A directory allow-list is the same promise one
// level up: copy everything that is not obviously not-code, and name what is skipped instead.
// → feedback_a_lift_list_is_a_promise_somebody_will_remember
const SKIP_DIRS = /^(node_modules|\.git|\.claude|\.netlify|v|dist|coverage|reports)$/;
const SKIP = /\.(mp4|mov|png|jpe?g|gif|webp|pdf|zip|ico|woff2?)$/i;

const args = process.argv.slice(2);
const JOBS = Math.max(1, Number((args.find((a) => a.startsWith("--jobs=")) || "--jobs=4").slice(7)) || 4);
const FRESH = args.includes("--fresh");
const names = args.filter((a) => !a.startsWith("--")).map((a) => a.replace(/\.(mjs|json)$/, ""));

let suites;
try { suites = fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).sort(); }
catch { console.error(`⚠️  INDETERMINATE — no mutation suites at ${DIR}`); process.exit(2); }
if (names.length) suites = suites.filter((f) => names.some((n) => f.includes(n)));
if (!suites.length) { console.error(`⚠️  INDETERMINATE — no suite matches "${names.join(" ")}"`); process.exit(2); }

// ── one copy of the site per worker ─────────────────────────────────────────────────────────────────────
const copyTree = (tmp, rel) => {
  let entries;
  try { entries = fs.readdirSync(`${SITE}/${rel}`, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const r = `${rel}/${e.name}`;
    if (e.isDirectory()) { copyTree(tmp, r); continue; }
    if (SKIP.test(e.name)) continue;
    fs.mkdirSync(path.dirname(`${tmp}/${r}`), { recursive: true });
    try { fs.copyFileSync(`${SITE}/${r}`, `${tmp}/${r}`); } catch { /* unreadable → the gate will say so */ }
  }
};
const seed = (tmp) => {
  // 🔴 THE ROOT FILES COUNT TOO (script.js calls verify-turnstile; netlify.toml names the scheduled functions)
  for (const e of fs.readdirSync(SITE, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.test(e.name)) copyTree(tmp, e.name); }
    else if (!SKIP.test(e.name)) { try { fs.copyFileSync(`${SITE}/${e.name}`, `${tmp}/${e.name}`); } catch { /* unreadable */ } }
  }
  copyTree(tmp, "reports/mockups"); // `reports` is skipped wholesale except the mockups, which render-diff gates read
  // scraper-side targets: an unmutated copy of each, so a gate pointed at SCRAPER_COPY_DIR always finds them
  fs.rmSync(`${tmp}/__scraper`, { recursive: true, force: true });
  for (const rel of Object.values(FILES)) {
    if (!rel || !rel.startsWith("scraper:")) continue;
    const r = rel.slice(8);
    fs.mkdirSync(path.dirname(`${tmp}/__scraper/${r}`), { recursive: true });
    fs.copyFileSync(`${path.dirname(HERE)}/${r}`, `${tmp}/__scraper/${r}`);
  }
};
const runGate = (gate, tmp) => new Promise((resolve) => {
  execFile("node", [`${HERE}/${gate}`], { env: { ...process.env, APPROVAL_ARCHIVE_SITE_DIR: tmp, SCRAPER_COPY_DIR: `${tmp}/__scraper` }, maxBuffer: 64 * 1024 * 1024 },
    (err) => resolve(err ? (err.code ?? 99) : 0));
});
const targetPaths = (rel, tmp) => rel.startsWith("scraper:")
  ? { src: `${path.dirname(HERE)}/${rel.slice(8)}`, dst: `${tmp}/__scraper/${rel.slice(8)}` }
  : { src: `${SITE}/${rel}`, dst: `${tmp}/${rel}` };

// ── the cache: a CAUGHT mutation, keyed on everything that could change its answer ───────────────────────
const CACHE_FILE = path.join(path.dirname(HERE), ".mutation-cache.json");
const WEEK = 7 * 24 * 3600e3;
let cache = {};
try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")); } catch { cache = {}; }
const sha = (x) => crypto.createHash("sha256").update(x).digest("hex");
const fileSha = (p) => { try { return sha(fs.readFileSync(p)); } catch { return "missing"; } };

const pool = Array.from({ length: JOBS }, () => fs.mkdtempSync(path.join(os.tmpdir(), "rga-mut-")));
pool.forEach(seed);
const cleanup = () => pool.forEach((t) => fs.rmSync(t, { recursive: true, force: true }));
process.on("SIGINT", () => { cleanup(); process.exit(130); });

let gatesOk = 0, gatesBad = 0, totalCaught = 0, totalRun = 0, totalCached = 0;
const t0 = Date.now();
for (const file of suites) {
  const gate = file.replace(/\.json$/, ".mjs");
  if (!fs.existsSync(`${HERE}/${gate}`)) { console.log(`⚠️  ${gate} — suite exists, gate does not`); gatesBad++; continue; }
  const muts = JSON.parse(fs.readFileSync(`${DIR}/${file}`, "utf8"));
  // an unmutated run must exit 0 — always run, never cached (it IS the gate passing today)
  const base = await runGate(gate, pool[0]);
  if (base !== 0) { console.log(`⚠️  ${gate} — UNMUTATED run exits ${base}; cannot judge its mutations`); gatesBad++; continue; }
  // every file this suite targets, plus the gate: if any of them changes, every cached result for the suite is void
  const suiteKey = sha([fileSha(`${HERE}/${gate}`), ...[...new Set(muts.map((m) => FILES[m[1]]).filter(Boolean))].sort().map((rel) => `${rel}:${fileSha(targetPaths(rel, "").src)}`)].join("|"));

  let caught = 0, skipped = 0, cached = 0;
  const work = [];
  for (const m of muts) {
    const [name, which, find, repl, expect] = m;
    const rel = FILES[which];
    if (!rel) { console.log(`   ⚠️  unknown target "${which}" for: ${name}`); skipped++; continue; }
    const { src } = targetPaths(rel, "");
    const orig = fs.readFileSync(src, "utf8");
    const n = orig.split(find).length - 1;
    // 🔑 AN ANCHOR THAT NO LONGER MATCHES IS NEWS, NOT A PASS. → feedback_a_lift_list_is_a_promise_somebody_will_remember
    if (n !== 1) { console.log(`   ⚠️  anchor matched ${n}×, mutation not applied: ${name}`); skipped++; continue; }
    const key = sha(`${suiteKey}|${JSON.stringify(m)}`);
    if (!FRESH && cache[key] && Date.now() - cache[key] < WEEK) { caught++; cached++; continue; }
    work.push({ m, rel, orig, key });
  }
  // the workers: each takes its own copy, mutates ONE file, runs the gate, restores that file
  let next = 0;
  await Promise.all(pool.map(async (tmp) => {
    while (next < work.length) {
      const { m: [name, , find, repl, expect], rel, orig, key } = work[next++];
      const { dst } = targetPaths(rel, tmp);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.writeFileSync(dst, orig.replace(find, repl));
      const want = expect ?? 1;
      const got = await runGate(gate, tmp);
      fs.writeFileSync(dst, orig);
      if (got === want) { caught++; cache[key] = Date.now(); }
      else console.log(`   🔴 NOT CAUGHT: ${name} (expected exit ${want}, got ${got})`);
    }
  }));
  totalCaught += caught; totalRun += muts.length - skipped; totalCached += cached;
  const ok = caught === muts.length - skipped && !skipped;
  console.log(`${ok ? "✅" : "🔴"} ${gate.replace(/\.mjs$/, "")} — ${caught}/${muts.length - skipped} caught${cached ? ` (${cached} unchanged since they last passed)` : ""}${skipped ? ` · ${skipped} SKIPPED` : ""}`);
  if (ok) gatesOk++; else gatesBad++;
}
cleanup();
try { fs.writeFileSync(CACHE_FILE, JSON.stringify(cache)); } catch { /* a cache that can't be written just means a full run next time */ }

console.log(`\n${gatesBad ? "🔴" : "✅"} ${gatesOk}/${gatesOk + gatesBad} suite(s) prove their gate can fail · ${totalCaught}/${totalRun} mutations caught${totalCached ? ` · ${totalCached} from cache` : ""} · ${Math.round((Date.now() - t0) / 1000)}s with ${JOBS} at once`);
process.exit(gatesBad ? 1 : 0);
