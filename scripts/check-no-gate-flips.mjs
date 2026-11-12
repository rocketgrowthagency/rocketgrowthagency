#!/usr/bin/env node
// check-no-gate-flips.mjs — NO GATE FLIPS BETWEEN PASS AND FAIL (checkers build 11-11; master map approved by Chris).
// → memory feedback_a_flaky_gate_is_worse_than_a_failing_one
//
// GUARDS: a gate that is red one run and green the next on code that did not change teaches the reader that red means "run it again",
// and then its real red is ignored. Permanently blind gates were caught (check-no-gate-is-permanently-indeterminate); a gate that FLIPS
// was not (11-10: check-the-detection-block-matches-the-mockup failed in both full runs and passed alone).
// HOLDS: in output/gate-verdicts.jsonl (every gate's exit, every morning run), no gate went pass→fail or fail→pass more than twice in the
// last 7 days. A could-not-tell (exit 2) is neither side. A flipper is named with its run-by-run sequence (P pass, F fail, ? could not tell).
// Fixing one: find what differs between its runs (an order dependency, a clock, a live read, a race), not loosen it.
// 🔑 SELF-PROVING: the rules (scripts/lib/gate-flips.mjs, read from SCRAPER_COPY_DIR when set) run on a fixture log first; inside the
// mutation harness only that runs.
// Exit 0 = no flipper · 1 = a gate flipped 3+ times in 7 days · 2 = INDETERMINATE (no log, no recent lines, self-test failed).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REAL = path.dirname(HERE);
const SCR = process.env.SCRAPER_COPY_DIR || REAL;
const idk = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
const lib = fs.existsSync(path.join(SCR, "scripts/lib/gate-flips.mjs")) ? path.join(SCR, "scripts/lib/gate-flips.mjs") : path.join(REAL, "scripts/lib/gate-flips.mjs");
const L = await import(pathToFileURL(lib).href);
const MAX = 2, DAYS = 7;

// ── self-test ────────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const now = Date.UTC(2026, 10, 11, 20);
  const day = (d, h = 15) => new Date(Date.UTC(2026, 10, d, h)).toISOString();
  const L1 = (gate, exit, at) => JSON.stringify({ gate, exit, at });
  const log = [
    ...[0, 1, 0, 1].map((e, i) => L1("flaky.mjs", e, day(6 + i))),                   // 3 flips → named
    ...[0, 1, 2, 1, 0].map((e, i) => L1("blind-sometimes.mjs", e, day(6 + i))),      // 2 flips (the 2 is no side) → fine
    ...[1, 1, 1, 1].map((e, i) => L1("always-red.mjs", e, day(6 + i))),             // red, but steady → fine (other gates say so)
    ...[0, 1, 0, 1].map((e, i) => L1("old-flaky.mjs", e, day(1 + i))),              // flipped, but more than 7 days ago → fine
    "not json",
  ].join("\n");
  const got = L.flippers(L.verdictsSince(log, now, DAYS), MAX).map((f) => `${f.gate}:${f.flips}:${f.seq}`).join(",");
  if (got !== "flaky.mjs:3:PFPF") idk(`self-test: found [${got}], not exactly [flaky.mjs:3:PFPF]`);
}
if (process.env.SCRAPER_COPY_DIR) { console.log("✅ self-test held (mutation copy: the real verdict log is not judged)"); process.exit(0); }

const LOG = path.join(REAL, "output/gate-verdicts.jsonl");
let text = "";
try { text = fs.readFileSync(LOG, "utf8"); } catch { idk(`no verdict log at ${LOG}`); }
const by = L.verdictsSince(text, Date.now(), DAYS);
if (by.size < 50) idk(`only ${by.size} gates have a verdict in the last ${DAYS} days: the morning run is not recording`);
const f = L.flippers(by, MAX);
if (f.length) {
  console.error(`🔴 ${f.length} gate(s) flipped between pass and fail more than ${MAX} times in ${DAYS} days (a flaky gate is worse than a failing one):`);
  for (const x of f) console.error(`   · ${x.gate}: ${x.flips} flips · runs ${x.seq}`);
  console.error("   Find what differs between its runs (order, clock, a live read, a race) and fix that. Never loosen the gate.");
  process.exit(1);
}
console.log(`✅ no gate flips: ${by.size} gates over ${DAYS} days, none went pass↔fail more than ${MAX} times`);
