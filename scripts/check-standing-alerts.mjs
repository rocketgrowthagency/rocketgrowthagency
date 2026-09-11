#!/usr/bin/env node
/**
 * check-standing-alerts.mjs — an alert nobody reads is not an alert.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-11. An audit found `reports/alerts/OUTREACH-HEALTH-ALERT.md` sitting RED, refreshed that
 * morning by the 6am guard:
 *
 *     Sendable pool STARVED (0.5d runway) and the self-refill is NOT armed
 *     (PRODUCTION-PAUSED override set). Sends WILL stall.
 *
 * The file ends with the line *"Surface it at session boot."* Nobody did — not that morning, and
 * not by me at boot. It was found by grepping for modified files, which is luck, not a system.
 *
 * 🔑 The monitor was wired correctly and did its job. What was missing is the LAST HOP: the alert
 * lands in a file, and nothing puts that file in front of the person who can act. The write is not
 * the delivery. → feedback_a_swallowed_send_failure_is_an_outage
 *
 * So the daily health check — the one surface that always gets read — now fails while any alert
 * file exists.
 *
 * 🔴 AND THE FIRST RUN FOUND THREE, TWO OF THEM WEEKS OLD. The outreach monitor did self-clear; the
 * other two writers only ever WROTE. An OpenAI quota alert from 2026-08-20 was still standing 22
 * days later (a live API call proved the quota fine), and a circuit-breaker alert from 2026-08-23
 * had no way to notice the deliberate production pause. Two permanently-red files are what taught
 * everyone to stop opening this directory — which is exactly how the real one went unread.
 *
 * 🔑 So the fix was not only this gate. `notify-openai-quota.sh` now clears on a clean run and
 * `run-health-check.mjs` retracts the breaker on a run back above the floor. **Only the check that
 * raised an alert can honestly retract it, and only on evidence** — never on a timer, never by
 * hand. That is what makes the presence of a file a trustworthy signal.
 *
 * Exit 0 = no standing alert · 1 = an alert is live and unread · 2 = could not tell.
 */
import fs from "node:fs";
import path from "node:path";

// Alerts are written into the WEBSITE repo (that is where reports/ lives), by scripts in this one.
const DIRS = [
  "/Users/chris/RGA/Rocket Growth Agency Website VS Code/reports/alerts",
  "/Users/chris/RGA/Rocket Growth Agency Scraper VS Code/reports/alerts",
];

console.log("── standing alerts have been seen by someone ──");

let looked = 0;
const alerts = [];
for (const dir of DIRS) {
  if (!fs.existsSync(dir)) continue;
  looked++;
  let names;
  try { names = fs.readdirSync(dir).filter((f) => f.endsWith(".md")); }
  catch (e) { console.log(`  ⚠️  could not read ${dir}: ${e.message}`); process.exit(2); }
  for (const n of names) {
    const file = path.join(dir, n);
    let body = "";
    try { body = fs.readFileSync(file, "utf8"); } catch { continue; }
    // 🔑 An empty or placeholder file is a cleared alert, not a live one.
    if (!body.trim()) continue;
    alerts.push({ file, name: n, body });
  }
}

if (!looked) {
  // 🔴 No alerts directory at all means the probe is pointed at the wrong place — that is
  // "could not tell", never "all clear". → feedback_indeterminate_is_not_a_finding
  console.log(`  ⚠️  no alerts directory found at either path — the probe must be wrong.`);
  process.exit(2);
}

if (!alerts.length) {
  console.log(`  ✅ no standing alert files — the monitors have nothing outstanding`);
  process.exit(0);
}

for (const a of alerts) {
  const headline = a.body.split("\n").find((l) => l.trim()) || a.name;
  console.log(`  🔴 ${a.name}`);
  console.log(`       ${headline.replace(/^#\s*/, "").slice(0, 120)}`);
  // The metric line and the first action line are what a human needs; print them, not the whole file.
  for (const line of a.body.split("\n")) {
    if (/^\*\*Metrics:|^- 🔴|^- ⚠️/.test(line.trim())) console.log(`       ${line.trim().slice(0, 150)}`);
  }
  console.log(`       file: ${a.file}`);
}

console.log(`\n🔴 ${alerts.length} standing alert(s) are live and unactioned.`);
console.log("   These files SELF-CLEAR when the condition recovers — so this stays red until the");
console.log("   underlying problem is actually fixed, not until someone silences it.");
process.exit(1);
