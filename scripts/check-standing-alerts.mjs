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

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔒 AN ALERT CAN ONLY LEAVE THE WAY IT CAME — approved 2026-09-28,
// reports/mockups/alert_that_vanishes_v1.html.
//
// 2026-09-28: `PIPELINE-HEALTH-ALERT.md` was deleted from the working tree and nothing in the alert
// system noticed. `deploy-site.sh` caught it only because it compares the tree against the commit —
// luck, not a system. It should not have gone: only `run-health-check.mjs` may unlink it, and only on
// a run above the floor with a real sample; `data/accumulators/` was EMPTY, zero attempts since
// Sep 21. The file was restored and what removed it was never identified.
//
// 🔴 The flaw is not the deletion. It is that this check asks *"is there a file?"* — and an empty
// directory is its happiest answer, byte-identical to a genuinely clear system.
// → feedback_an_absence_must_never_be_readable_as_a_value
//
// 🔑 So every raise records a line here. A monitor may retract its OWN alert, which clears the line
// with it. A file that vanishes while its line stands is REPORTED, with the command to restore it.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
const LEDGER = path.join(DIRS[0], "_raised.json");
function readLedger() {
  try { return JSON.parse(fs.readFileSync(LEDGER, "utf8")); } catch { return {}; }
}

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

// 🔴 RAISED, AND NOW MISSING. Checked before "all clear" can be printed, because this is the exact
// case that used to be indistinguishable from health.
const ledger = readLedger();
const present = new Set(alerts.map((a) => a.name));
const vanished = Object.entries(ledger).filter(([name]) => !present.has(name));
if (vanished.length) {
  for (const [name, meta] of vanished) {
    console.log(`  🔴 ${name} — RAISED ${meta.raised || "(date unknown)"}, FILE IS GONE`);
    console.log(`       Nothing retracted it. Only ${meta.by || "the monitor that raised it"} may, and`);
    console.log(`       only on evidence — so the condition is still unverified and something removed`);
    console.log(`       the file outside the sanctioned path.`);
    console.log(`       Restore it:  git checkout -- reports/alerts/${name}`);
  }
  console.log(`\n🔴 ${vanished.length} alert(s) were raised and have disappeared without being retracted.`);
  process.exit(1);
}

if (!alerts.length) {
  console.log(`  ✅ no standing alert files — the monitors have nothing outstanding`);
  process.exit(0);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 AN ALERT THAT CANNOT BE RE-TESTED IS "COULD NOT TELL", NOT "STILL BROKEN".
//
// This file's own header records that the 2026-08-23 circuit-breaker alert "had no way to notice
// the deliberate production pause", and that "two permanently-red files are what taught" the
// lesson — and it then failed on exactly that for a month. A permanently-red check is one people
// stop reading, which is how a REAL alert arriving next to it goes unseen. That is the failure
// mode, not a stricter version of safety.
//
// 🔑 The distinction is evidence, not age: the breaker retracts only on a real run above the floor,
// and the pipeline has produced NO build attempts since the alert was raised. There is nothing to
// judge. It still prints, in full, every day — it just reports ⚠️ (exit 2, "could not tell")
// instead of 🔴, so a genuinely new alert beside it is visible again.
// → feedback_exit_code_semantics_for_gates · feedback_an_alert_nobody_reads_is_not_an_alert
// ═══════════════════════════════════════════════════════════════════════════════════════════════
function cannotBeRetested(a) {
  // Only the pipeline breaker has this property — it is the only alert whose clearing condition is
  // "the pipeline ran again". Anything else stays a hard failure.
  if (!/PIPELINE-HEALTH-ALERT/i.test(a.name)) return null;
  const accDir = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/%20/g, " ")), "..", "data", "accumulators");
  let attempts = 0;
  try {
    // Any accumulator newer than the alert file means the pipeline HAS run since — so the alert is
    // current, not stale, and must stay red.
    const alertMtime = fs.statSync(a.file).mtimeMs;
    for (const f of fs.existsSync(accDir) ? fs.readdirSync(accDir) : []) {
      if (fs.statSync(path.join(accDir, f)).mtimeMs > alertMtime) attempts++;
    }
  } catch { return null; }          // cannot tell whether it ran → leave it red
  return attempts === 0
    ? "the pipeline has produced no build attempts since this was raised, so the condition cannot be re-tested — it clears itself on the first run back above the floor"
    : null;
}

const unverifiable = [];
for (const a of alerts) {
  const why = cannotBeRetested(a);
  if (why) { unverifiable.push({ ...a, why }); continue; }
  const headline = a.body.split("\n").find((l) => l.trim()) || a.name;
  console.log(`  🔴 ${a.name}`);
  console.log(`       ${headline.replace(/^#\s*/, "").slice(0, 120)}`);
  // The metric line and the first action line are what a human needs; print them, not the whole file.
  for (const line of a.body.split("\n")) {
    if (/^\*\*Metrics:|^- 🔴|^- ⚠️/.test(line.trim())) console.log(`       ${line.trim().slice(0, 150)}`);
  }
  console.log(`       file: ${a.file}`);
}

// Print the unverifiable ones in full — they must never become invisible, only non-blocking.
for (const a of unverifiable) {
  const headline = a.body.split("\n").find((l) => l.trim()) || a.name;
  console.log(`  ⚠️  ${a.name} — PENDING RE-VERIFICATION`);
  console.log(`       ${headline.replace(/^#\s*/, "").slice(0, 120)}`);
  console.log(`       ${a.why}`);
  console.log(`       file: ${a.file}`);
}

const live = alerts.length - unverifiable.length;
if (live > 0) {
  console.log(`\n🔴 ${live} standing alert(s) are live and unactioned.`);
  console.log("   These files SELF-CLEAR when the condition recovers — so this stays red until the");
  console.log("   underlying problem is actually fixed, not until someone silences it.");
  process.exit(1);
}
if (unverifiable.length) {
  console.log(`\n⚠️  ${unverifiable.length} alert(s) cannot be re-tested right now — reported, not silenced.`);
  console.log("   They print in full every day and go red again the moment there is evidence to judge.");
  process.exit(2);
}
console.log(`  ✅ no standing alert files — the monitors have nothing outstanding`);
process.exit(0);
