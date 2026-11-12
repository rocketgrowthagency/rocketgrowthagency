#!/usr/bin/env node
// check-airtable-calls-will-last.mjs — AIRTABLE'S MONTHLY CALLS LAST TO THE END OF THE MONTH (checkers build 11-11; master map approved by
// Chris). → memory project_airtable_outage_2026_11 · feedback_an_api_refusal_is_never_no_data
//
// GUARDS: the workspace has a monthly cap on Airtable API calls (100,000 on the plan; AIRTABLE_MONTHLY_CAP overrides). It was blown on 10-08
// (125,148) and Airtable refused every call Nov 3-6, and both times it was found AFTER the cap was hit: the meter counted calls and
// airtable-watch caught the refusal, but nothing looked ahead. Like check-netlify-credits-will-last, this forecasts.
// HOW: output/airtable-calls.log (one line per metered node process, scripts/_airtable-meter.mjs) → this calendar month's calls so far, a
// daily pace (the higher of the month's average and the last 7 days'), projected to month end. RED at 80% of the cap.
// 🔴 A LOWER BOUND: only the Mac's jobs are metered. The website's Netlify functions that call Airtable (the open/click pixels, the sales
// queue, contract-sign …) and the Apps Script send are not, so the output names how many unmetered callers there are. A meter that wrote
// nothing for 2 days is INDETERMINATE (the meter is broken, or nothing ran), never green.
// 🔑 SELF-PROVING: the arithmetic (scripts/lib/airtable-forecast.mjs, read from SCRAPER_COPY_DIR when set) runs on a fixture log first.
// Exit 0 = the month will last · 1 = forecast at or over 80% · 2 = INDETERMINATE.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REAL = path.dirname(HERE);
const SCR = process.env.SCRAPER_COPY_DIR || REAL;
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const idk = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
const lib = fs.existsSync(path.join(SCR, "scripts/lib/airtable-forecast.mjs")) ? path.join(SCR, "scripts/lib/airtable-forecast.mjs") : path.join(REAL, "scripts/lib/airtable-forecast.mjs");
const L = await import(pathToFileURL(lib).href);
const CAP = Number(process.env.AIRTABLE_MONTHLY_CAP) || 100000;
const WARN = 0.8;

// ── self-test: 10 days into a 30-day month, 30,000 calls (3,000/day) → 90,000 projected = 90% (red); the last week twice as busy wins ──
{
  const now = Date.UTC(2026, 10, 11);   // Nov 11, 00:00 UTC: 10 whole days in, 20 left
  const line = (iso, job, n) => `${iso}  ${job}  x.mjs  calls=${n} get=${n} write=0 cached=0`;
  const even = Array.from({ length: 10 }, (_, d) => line(new Date(Date.UTC(2026, 10, 1 + d, 12)).toISOString(), "daily-health-check", 3000)).join("\n") + "\n" + line("2026-10-31T12:00:00.000Z", "old-month", 99999) + "\nnot a meter line\n";
  const p = L.parseLog(even);
  const f = L.forecast(p.rows, now, 100000);
  if (p.bad !== 1) idk(`self-test: ${p.bad} unparsed lines, not 1`);
  if (f.mtd !== 30000) idk(`self-test: this month's calls read ${f.mtd}, not 30000 (another month counted, or one dropped)`);
  if (f.projected !== 90000 || f.pct !== 90) idk(`self-test: 3,000 a day for 20 more days projects to ${f.projected} (${f.pct}%), not 90000 (90%)`);
  const busy = even + "\n" + Array.from({ length: 7 }, (_, d) => line(new Date(Date.UTC(2026, 10, 4 + d, 13)).toISOString(), "overnight-local", 3000)).join("\n");
  const g = L.forecast(L.parseLog(busy).rows, now, 100000);
  if (g.perDay !== 6000 || g.byJob["overnight-local"] !== 21000) idk(`self-test: a busier last week (42,000 in 7 days) does not set the pace to 6000 a day (${g.perDay}) or a job is not counted`);
}

// ── the real meter ───────────────────────────────────────────────────────────────────────────────────────────────────────
const LOG = path.join(REAL, "output/airtable-calls.log");
let text = "";
try { text = fs.readFileSync(LOG, "utf8"); } catch { idk(`no meter log at ${LOG}: Airtable calls are not being counted`); }
const { rows } = L.parseLog(text);
if (!rows.length) idk("the meter log has no lines");
const now = Date.now();
const f = L.forecast(rows, now, CAP);
if (!f.lastAt || now - f.lastAt > 2 * 864e5) idk(`the meter wrote nothing for ${f.lastAt ? Math.round((now - f.lastAt) / 864e5) : "?"} days: it is broken, or no metered job ran`);
let unmetered = 0;
try { unmetered = fs.readdirSync(path.join(SITE, "netlify/functions")).filter((x) => x.endsWith(".js") && /api\.airtable\.com/.test(fs.readFileSync(path.join(SITE, "netlify/functions", x), "utf8"))).length; } catch { /* the count is a note */ }
const top = Object.entries(f.byJob).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([j, n]) => `${j} ${n.toLocaleString("en-US")}`).join(" · ");
const line = `${f.mtd.toLocaleString("en-US")} metered calls this month · ${f.perDay.toLocaleString("en-US")}/day · projected ${f.projected.toLocaleString("en-US")} of ${CAP.toLocaleString("en-US")} (${f.pct}%) with ${f.daysLeft} days left · ${top}`;
const note = `a lower bound: ${unmetered} website function(s) and the Apps Script send call Airtable unmetered`;
if (f.projected >= CAP * WARN) {
  console.error(`🔴 Airtable's monthly calls will run out (or near it) before the month ends: ${line}`);
  console.error(`   ${note}. Find the job spending them (by job above) before Airtable starts refusing (Nov 3-6).`);
  process.exit(1);
}
console.log(`✅ Airtable's calls will last the month: ${line} (${note})`);
