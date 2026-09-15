#!/usr/bin/env node
/**
 * check-no-gate-is-permanently-indeterminate.mjs — a gate that can only ever say "I could not tell"
 * is not a gate.
 *
 * ─── WHY (2026-09-15) ────────────────────────────────────────────────────────────────────────────
 * I wrote `check-ga4-property-is-the-one-receiving-data.mjs` to call Google directly from the scraper
 * repo. `GOOGLE_OAUTH_CLIENT_ID/SECRET` live in Netlify, not here — so it exited 2 on its very first
 * line, every time, forever:
 *
 *     [ga4] INDETERMINATE — credentials unavailable
 *
 * It was wired, documented, excused, counted among the gates. And it could never once have reached
 * the thing it was written to check. **A dead check wearing a warning label.**
 *
 * 🔑 Exit 2 is the honest answer to "I could not look", and this system deliberately treats it as
 * NOT-healthy. That honesty is exactly what makes a permanently-indeterminate gate so dangerous: it
 * looks like a system being careful, forever, about nothing.
 * → feedback_dead_check_selector_gap · feedback_exit_code_semantics_for_gates
 *
 * ─── WHAT IT ASSERTS ─────────────────────────────────────────────────────────────────────────────
 * Runs every gate the daily health check runs, and reports any that exit 2 on a machine that has the
 * credentials. One indeterminate run can be a network blip; this records them so a PERMANENT one is
 * visible rather than blending into the noise.
 *
 * 🔴 It does NOT fail on a single indeterminate result — that would make a flaky network able to
 * break the build, and would itself become the noisy gate people skim past. It fails when a gate has
 * been indeterminate on EVERY recorded run and never once returned a verdict.
 *
 * Exit 0 = every gate can reach its subject · 1 = a gate has never once returned a verdict
 *        · 2 = not enough history yet to judge.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const RUNNER = path.join(HERE, "daily-health-check.sh");
const LEDGER = path.join(ROOT, "output", "gate-verdicts.jsonl");
// A gate needs this many recorded runs before "always indeterminate" means anything.
const MIN_RUNS = Number(process.env.GATE_MIN_RUNS || 3);

if (!fs.existsSync(RUNNER)) { console.error("[gates] INDETERMINATE — no daily-health-check.sh"); process.exit(2); }

// 🔴 THIS DOES NOT RUN THE GATES. The first version executed every gate itself — slow, duplicated
// the whole daily run, and would have recursed into itself. The runner already knows each exit code;
// it RECORDS, this JUDGES. A check that re-does the work it is auditing is its own second system.
// → feedback_search_for_the_existing_table_before_creating_one
let hist = {};
try {
  for (const line of fs.readFileSync(LEDGER, "utf8").split("\n").filter(Boolean)) {
    let r; try { r = JSON.parse(line); } catch { continue; }
    if (!r?.gate) continue;
    const h = (hist[r.gate] ||= { runs: 0, verdicts: 0, indeterminate: 0 });
    h.runs++;
    // 0 or 1 is a VERDICT — the gate looked and answered. Only 2 means "I could not tell".
    if (r.exit === 2) h.indeterminate++; else h.verdicts++;
    h.lastExit = r.exit;
  }
} catch {
  console.error(`[gates] INDETERMINATE — no verdict history at ${LEDGER}. daily-health-check.sh writes it; run that first.`);
  process.exit(2);
}

const tracked = Object.keys(hist).length;
if (!tracked) { console.error("[gates] INDETERMINATE — the verdict history is empty"); process.exit(2); }

console.log("── every gate can reach the thing it checks ──");

// 🔑 The finding is "never once answered", not "answered 'could not tell' today".
const dead = Object.entries(hist).filter(([, h]) => h.runs >= MIN_RUNS && h.verdicts === 0);
const young = Object.entries(hist).filter(([, h]) => h.runs < MIN_RUNS).length;

console.log(`  ${tracked} gate(s) tracked · ${young} with fewer than ${MIN_RUNS} run(s) — too new to judge`);

if (dead.length) {
  console.error("\n✗ these gates have NEVER returned a verdict — they cannot reach what they check:");
  for (const [g, h] of dead) {
    console.error(`    ${g} — ${h.runs} run(s), all indeterminate. Wired, counted, and blind.`);
  }
  console.error("\n  Exit 2 is honest for 'I could not look'. A gate that can ONLY say that is a dead");
  console.error("  check wearing a warning label. Move it to where the credentials are, or delete it.");
  process.exit(1);
}
console.log("  ✅ every tracked gate has returned a real verdict at least once");
process.exit(0);
