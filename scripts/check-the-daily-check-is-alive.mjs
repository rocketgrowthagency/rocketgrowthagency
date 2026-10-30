#!/usr/bin/env node
// check-the-daily-check-is-alive.mjs — the morning job that keeps client data fresh actually gets to the end.
// 🔴 10-26 → 10-30: a new variable in run() had no starting value, and `set -u` kills the script on an unset variable. So from 10-27
// daily-health-check.sh died at its FIRST live gate, every morning, silently: no review reads (the client's card said "not read since
// Oct 26"), no RSVP sweep, no PageSpeed, no place-id retries, and none of its own gates. launchctl showed exit 1 and nobody reads that.
// HOLDS: (1) every variable run() reads is given a value before the first gate runs, or has a default; (2) the job's own record
// (output/gate-verdicts.jsonl) shows the review read within 50 hours, two missed mornings at most.
// Exit 0 = holds · 1 = dead or drifted · 2 = moved (indeterminate). → feedback_a_gate_that_cannot_fail
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const sh = fs.readFileSync(path.join(process.env.SCRAPER_COPY_DIR ? path.join(process.env.SCRAPER_COPY_DIR, "scripts") : HERE, "daily-health-check.sh"), "utf8");   // a mutation suite points this at a copy
const fail = [];
if (!/^set -uo pipefail$/m.test(sh)) { console.error("⚠️  INDETERMINATE — daily-health-check.sh no longer has `set -uo pipefail`; re-read this gate"); process.exit(2); }
const firstRun = sh.search(/^run /m);
const fnAt = sh.search(/^run\(\) \{/m);
if (firstRun < 0 || fnAt < 0 || fnAt > firstRun) { console.error("⚠️  INDETERMINATE — run() or the first gate moved in daily-health-check.sh"); process.exit(2); }
const before = sh.slice(0, firstRun), fnEnd = before.indexOf("\n}\n", fnAt), body = sh.slice(fnAt, fnEnd);
const outside = before.slice(0, fnAt) + before.slice(fnEnd);   // an assignment INSIDE run() doesn't count: the bug's own variable was set there, after the read
const code = body.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
const reads = new Set([...code.matchAll(/\$\{?([A-Z][A-Z0-9_]+)\}?/g)].filter((m) => !/^\$\{[A-Z0-9_]+:-/.test(code.slice(m.index, m.index + m[0].length + 2))).map((m) => m[1]));
for (const v of reads) if (!new RegExp(`(^|\\n)\\s*(export\\s+)?${v}=`).test(outside)) fail.push(`run() reads $${v}, but nothing gives it a value before the first gate: under set -u the whole morning job dies there`);
// the arithmetic, on fixed cases, so the freshness rule can't quietly stop meaning anything
const HOURS = 50, staleAt = (lastMs, nowMs) => !Number.isFinite(lastMs) || nowMs - lastMs > HOURS * 3600000;
const T = Date.parse("2026-10-30T15:00:00Z");
if (staleAt(T - 24 * 3600000, T) || !staleAt(T - 4 * 86400000, T) || !staleAt(NaN, T)) fail.push("the freshness arithmetic is wrong (a day old must pass; four days old or no record must fail)");
const file = process.env.GATE_VERDICTS || path.join(HERE, "..", "output", "gate-verdicts.jsonl");
let last = NaN;
try { for (const l of fs.readFileSync(file, "utf8").split("\n")) if (l.includes('"refresh-review-metrics.mjs"')) { const at = Date.parse(JSON.parse(l).at); if (Number.isFinite(at)) last = at; } } catch { /* no record reads as stale below */ }
// grace: the fix landed 10-30, after that morning's run; the first run that can pass is 10-31 07:30 PT
const GRACE_UNTIL = Date.parse("2026-10-31T17:00:00Z");
if (staleAt(last, Date.now())) { if (Date.now() < GRACE_UNTIL) console.log(`  ⏳ the review read last ran ${Number.isFinite(last) ? new Date(last).toISOString().slice(0, 10) : "never"}; the fix landed 10-30, so this is enforced from the 10-31 morning run`); else fail.push(`the morning job hasn't read reviews since ${Number.isFinite(last) ? new Date(last).toISOString().slice(0, 10) : "ever"} (check /tmp/com.rga.daily-health-check.err)`); }
if (fail.length) { console.log(`🔴 the morning job is dead or can die — ${fail.length} problem(s):\n${fail.map((f) => `   · ${f}`).join("\n")}`); process.exit(1); }
console.log("✅ the morning job can reach the end: run() reads only variables that have a value, and it read reviews recently");
