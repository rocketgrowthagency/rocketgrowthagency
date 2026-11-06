#!/usr/bin/env node
// check-a-quiet-period-runs-no-live-check.mjs — WHILE THE CLIENTS' DATABASE IS IN A QUIET PERIOD, NO SCHEDULED CHECK READS IT (11-6).
// RGA's Supabase is on the Free plan and passed its 5 GB monthly egress on Nov 6; the owner can't upgrade yet, and the cycle resets Nov 18.
// The night check and the morning health check read the live database hundreds of times a night. scripts/db-quiet-until.txt holds the date;
// until it, every live-reading gate, suite, walk and side by side says "couldn't check" with the reason (never a pass), and the night fixer is told.
// HOLDS: the date rule (quiet before the day, not on or after it; no file or a bad date = not quiet) · the live test matches what the health
// check already uses · before-confirming skips live gates, their suites, walks and side by sides · daily-health-check skips live gates ·
// the night fixer's prompt names the quiet period. No network.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dbQuiet, READS_LIVE } from "./lib/db-quiet.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// a mutation run points SCRAPER_COPY_DIR at a copy of the scraper files (run-mutations.mjs)
const DIR = process.env.SCRAPER_COPY_DIR ? path.join(process.env.SCRAPER_COPY_DIR, "scripts") : HERE;
const F = [], fail = (m) => F.push(m);
const read = (f) => fs.readFileSync(path.join(DIR, f), "utf8");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "quiet-")), file = path.join(tmp, "q.txt");
fs.writeFileSync(file, "2026-11-18 · Free plan egress over 5 GB\n");
if (!dbQuiet(new Date(2026, 10, 17, 23, 59), file)) fail("the day before the date isn't quiet");
if (dbQuiet(new Date(2026, 10, 18, 0, 1), file)) fail("the date itself is still quiet (it must end on the day)");
if (dbQuiet(new Date(2026, 10, 20), file)) fail("a day after the date is still quiet");
if ((dbQuiet(new Date(2026, 10, 10), file) || {}).reason !== "Free plan egress over 5 GB") fail("the reason isn't carried");
fs.writeFileSync(file, "soon\n");
if (dbQuiet(new Date(2026, 10, 10), file)) fail("a file with no date makes it quiet (it must not)");
if (dbQuiet(new Date(2026, 10, 10), path.join(tmp, "none.txt"))) fail("no file makes it quiet (it must not)");
fs.rmSync(tmp, { recursive: true, force: true });

// (the samples are split so this gate's own source never reads as live: it runs during the quiet period too)
for (const s of ["SUPA" + "BASE_URL", "SUPA" + "BASE_SERVICE_ROLE_KEY", "_admin" + "-session", "https://www.rocketgrowth" + "agency.com/admin/"]) if (!READS_LIVE.test(s)) fail(`"${s}" isn't read as live`);
if (READS_LIVE.test(fs.readFileSync(fileURLToPath(import.meta.url), "utf8"))) fail("this gate reads as live itself, so a quiet period would skip it");
const hc = read("daily-health-check.sh");
if (!hc.includes(`grep -qE "${READS_LIVE.source}"`)) fail("the health check's own live test changed; keep READS_LIVE the same");
if (!/if \[ -n "\$is_live" \] && QUIET_WHY=\$\(node scripts\/lib\/db-quiet\.mjs 2>\/dev\/null\); then[\s\S]{0,200}SKIPPED[\s\S]{0,80}return/.test(hc)) fail("the morning health check runs live gates during a quiet period");
const bc = read("before-confirming.mjs");
if (!/for \(const g of toRun\) \(QUIET && readsLive\(g\)\) \? quietSkip\(/.test(bc)) fail("the night check runs live gates during a quiet period");
if (!/for \(const s of suites\) \(QUIET && readsLive\(`\$\{s\}\.mjs`\)\) \? quietSkip\(/.test(bc)) fail("the night check runs a live gate's mutation suite during a quiet period");
if (!/QUIET \? quietSkip\(`walk \$\{st\}`\)/.test(bc) || !/if \(compares\.length && !QUIET\)/.test(bc)) fail("the night check walks the live portals during a quiet period");
if (!/code: 2[^\n]*skipped: database quiet until/.test(bc)) fail("a skipped gate reads as a pass (it must be couldn't check, with the reason)");
if (!/DATABASE QUIET PERIOD/.test(read("nightly-fixer-prompt.md"))) fail("the night fixer isn't told about the quiet period (it would chase the skips)");

if (F.length) { console.error("🔴 a quiet period can still read the clients' database:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ a quiet period runs no live check: the date rule holds, the night check and the morning health check skip every live gate, suite and walk as couldn't check with the reason, and the night fixer is told");
