#!/usr/bin/env node
// before-confirming.mjs — RUN THIS BEFORE EVERY "it's live / it matches / done" (Chris 10-28, 1:52 PM: "each round you must run a
// check on everything before confirming"; 1:44 PM: "every round you do to live you must spend the time to make sure it's exactly like
// mockup"). One command, so the check can't be skipped or half-done:
//   1 · EVERY gate that reads a file changed this round (website + scraper since --since), one at a time (some read production)
//   2 · the mutation suite of every gate EDITED this round (a gate that can't fail proves nothing)
//   3 · the cross-checks: every mutation still applies · every gate is wired · colours from the system · memory links
//   4 · the signed-in, read-only walk of each --steps id (admin + portal)
//   5 · SIDE BY SIDE: each --compare "mockup.html::selector=>admin|portal:step" → the mockup section and the live card cropped at the
//       same width into reports/acceptance/<date>/compare/ — then LOOK at both and list every difference before confirming
//
//   node scripts/before-confirming.mjs --since=<website commit> [--scraper-since=<commit>] [--steps=m1.access.website,…]
//        [--compare="reports/mockups/x.html::.gc=>admin:m1.access.website"]
// exit 0 = everything held (still LOOK at the side-by-side pairs) · 1 = something failed · 2 = couldn't run
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const SCRAPER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// the side-by-side reads the walk's photos by the day the run STARTED as well as today (a night run crosses midnight)
const RUN_START = Date.now(), START_DAY = new Date(RUN_START).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const arg = (k) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const since = arg("since"), sSince = arg("scraper-since"), steps = (arg("steps") || "").split(",").filter(Boolean), compares = process.argv.filter((x) => x.startsWith("--compare=")).map((x) => x.slice(10));
if (!since) { console.error("⚠️  --since=<website commit> is required (the last commit you confirmed)"); process.exit(2); }
const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
let siteFiles, scraperFiles;
try {
  siteFiles = git(SITE, ["diff", "--name-only", `${since}..HEAD`]).split("\n").filter(Boolean).filter((f) => !/^(\.claude|reports)\//.test(f));
  scraperFiles = sSince ? git(SCRAPER, ["diff", "--name-only", `${sSince}..HEAD`]).split("\n").filter(Boolean) : [];
} catch (e) { console.error(`⚠️  INDETERMINATE — git: ${e.message.split("\n")[0]}`); process.exit(2); }
// the gates that read live data need the scraper .env, exactly as daily-health-check.sh loads it (values never printed)
const ENV = { ...process.env };
try { for (const l of fs.readFileSync(`${SCRAPER}/.env`, "utf8").split("\n")) { const m = l.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/); if (m && !(m[1] in process.env)) ENV[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2"); } } catch { console.log("⚠️  no scraper .env: the live-reading gates will say couldn't check"); }
const results = [];
const run = (label, cmd, args, cwd = SCRAPER) => {
  const t0 = Date.now(), r = spawnSync(cmd, args, { cwd, env: ENV, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 15 * 60 * 1000 });
  const ok = r.status === 0, out = `${r.stdout || ""}${r.stderr || ""}`.trim().split("\n").filter((l) => l.trim());
  results.push({ label, ok, code: r.status, secs: Math.round((Date.now() - t0) / 1000), why: ok ? "" : out.slice(-3).join(" | ").slice(0, 300) });
  process.stdout.write(`${ok ? "✅" : r.status === 2 ? "⚠️ " : "❌"} ${label} (${Math.round((Date.now() - t0) / 1000)}s)\n`);
  return ok;
};
console.log(`\n═══ CHECK BEFORE CONFIRMING · website ${since}..HEAD (${siteFiles.length} files)${sSince ? ` · scraper ${sSince}..HEAD (${scraperFiles.length})` : ""} ═══\n`);
// 1 · every gate that reads a changed website file (by its path or its file name)
const gates = fs.readdirSync(`${SCRAPER}/scripts`).filter((f) => /^check-.*\.mjs$/.test(f));
const needles = siteFiles.map((f) => [f, path.basename(f)]);
const touched = gates.filter((g) => { const src = fs.readFileSync(`${SCRAPER}/scripts/${g}`, "utf8"); return needles.some(([f, b]) => src.includes(f) || (b.length > 6 && src.includes(b))); });
const edited = scraperFiles.filter((f) => /^scripts\/check-.*\.mjs$/.test(f)).map((f) => path.basename(f));
const toRun = [...new Set([...touched, ...edited.filter((g) => gates.includes(g))])].sort();
console.log(`1 · ${toRun.length} gate(s) read what changed:`);
for (const g of toRun) run(g.replace(/\.mjs$/, ""), "node", [`scripts/${g}`]);
// 2 · mutation suites of the gates edited this round (+ the touched gates that have one)
const suites = [...new Set([...edited, ...touched].map((g) => g.replace(/\.mjs$/, "")).filter((g) => fs.existsSync(`${SCRAPER}/scripts/mutations/${g}.json`)))];
console.log(`\n2 · ${suites.length} mutation suite(s):`);
for (const s of suites) run(`mutations: ${s}`, "node", ["scripts/run-mutations.mjs", s]);
// 3 · the cross-checks
console.log("\n3 · cross-checks:");
run("every mutation still applies", "node", ["scripts/check-every-mutation-still-applies.mjs"]);
run("every gate is wired", "node", ["scripts/check-every-gate-is-wired.mjs"]);
run("colours come from the system", "node", ["scripts/check-colours-come-from-the-system.mjs"]);
run("memory links", "node", ["scripts/memory-audit.mjs"], SITE);
// 4 · the signed-in walk of each step (read-only)
if (steps.length) { console.log(`\n4 · the walk (${steps.length} step(s)):`); for (const st of steps) run(`walk ${st}`, "node", ["scripts/acceptance-walk.mjs", `--step=${st}`]); }
// 5 · side by side: the mockup section + the live card, same width
if (compares.length) {
  console.log(`\n5 · side by side (${compares.length}):`);
  let puppeteer; try { puppeteer = (await import("puppeteer")).default; } catch { console.error("⚠️  puppeteer unavailable — can't render the mockups"); process.exit(2); }
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const dir = `${SITE}/reports/acceptance/${day}/compare`; fs.mkdirSync(dir, { recursive: true });
  const b = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  try {
    for (const c of compares) {
      const m = c.match(/^(.+?)::(.+?)=>(admin|portal):(.+)$/);
      if (!m) { results.push({ label: `compare ${c}`, ok: false, why: "use mockup.html::selector=>admin|portal:step" }); continue; }
      const [, file, sel, side, st] = m, name = `${st}__${path.basename(file, ".html")}`;
      const p = await b.newPage(); await p.setViewport({ width: 1000, height: 900 });
      await p.goto(`file://${path.resolve(SITE, file)}`, { waitUntil: "networkidle0", timeout: 45000 }).catch(() => null);
      const el = await p.$(sel);
      if (el) await el.screenshot({ path: `${dir}/${name}-MOCKUP.png` });
      // 🔴 THE WALK CAN CROSS MIDNIGHT (night of 10-29: business_facts was walked into 10-29/, then looked up in 10-30/ → "no live
      // screenshot"). Look in the day this run STARTED and today, and take only a photo taken during THIS run — a stale one from an
      // earlier run (or an earlier copy in compare/) never stands in for tonight's.
      const shots = [...new Set([START_DAY, day])].flatMap((d) => { const sd = `${SITE}/reports/acceptance/${d}/${side}`; return fs.existsSync(sd) ? fs.readdirSync(sd).filter((f) => f.includes(st)).map((f) => `${sd}/${f}`) : []; })
        .filter((f) => fs.statSync(f).isFile() && fs.statSync(f).mtimeMs >= RUN_START).sort((x, y) => fs.statSync(y).mtimeMs - fs.statSync(x).mtimeMs);
      fs.rmSync(`${dir}/${name}-LIVE.png`, { force: true });
      if (shots.length) fs.copyFileSync(shots[0], `${dir}/${name}-LIVE.png`);
      const ok = !!el && fs.existsSync(`${dir}/${name}-LIVE.png`);
      results.push({ label: `side by side ${name}`, ok, why: ok ? "" : !el ? `no ${sel} in the mockup` : `no live screenshot for ${st} (walk it with --steps)` });
      console.log(`${ok ? "📸" : "❌"} ${name}: ${dir}/${name}-MOCKUP.png  +  ${name}-LIVE.png${ok ? "  ← LOOK at both, list every difference" : ""}`);
      await p.close();
    }
  } finally { await b.close(); }
}
const bad = results.filter((r) => !r.ok);
console.log(`\n═══ ${results.length - bad.length} of ${results.length} held${bad.length ? ` · ${bad.length} FAILED:` : ""} ═══`);
for (const r of bad) console.log(`  ✗ ${r.label}: ${r.why}`);
if (!bad.length && compares.length) console.log("  → everything held. Now LOOK at each MOCKUP/LIVE pair and fix every difference before confirming.");
process.exit(bad.length ? 1 : 0);
