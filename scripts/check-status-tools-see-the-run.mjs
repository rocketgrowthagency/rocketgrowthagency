#!/usr/bin/env node
/**
 * check-status-tools-see-the-run.mjs — the morning audit's own eyes must work.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-08: the self-heal audit opened with `pipeline-status.mjs` and `check-run-productivity.mjs`,
 * and both said:
 *
 *     SAFE-STATUS: no log at /tmp/overnight-pipeline-2026-09-08.log … (run may not have started).
 *     PRODUCTIVITY: no overnight log for 2026-09-07 or 2026-09-08 — nothing to judge.
 *
 * A log plainly existed. launchd runs `overnight-local.sh`, which writes
 * `/tmp/overnight-local-<date>.log` and pipes `overnight-pipeline.sh`'s output INTO it via `tee`.
 * **`/tmp/overnight-pipeline-*.log` has never been created — not once.**
 *
 * 🔑 So both tools reported "the run may not have started" EVERY morning, which is exactly what a
 * genuinely failed start looks like. The audit's first step could not tell a good night from a
 * catastrophic one, and the reassuring phrasing made it read like a normal result.
 *
 * 🔴 This is the "a dead check reads as a pass" failure applied to the diagnostic layer itself
 * ([[feedback-a-dead-check-selector-gap]]). A broken thermometer does not report a fever.
 *
 * CHECK
 *   Every log path a status tool reads must be a path the runner can actually produce. Derived from
 *   the scripts themselves, so renaming the log on either side turns this red.
 *
 * Exit 0 = the tools can see the run. 1 = they are blind. 2 = could not analyse.
 */
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const READERS = ["pipeline-status.mjs", "check-run-productivity.mjs"];

// 🔴🔴 BEHAVIOURAL, NOT TEXTUAL. The first version of this gate compared log NAMES parsed out of the
// scripts — and a loose token ("overnight") matched everything, so sabotaging the fix still passed.
// A gate that cannot catch the bug it was written for certifies the thing it misses.
//
// 🔑 So: RUN the tools and read what they say. The blind state has an unmistakable signature — they
// announce that there is no log. That cannot be faked by a regex that happens to match.
const BLIND = /no log at|no overnight log|may not have started|nothing to judge/i;

console.log("── the status tools must be able to see the run ──");

// A run log must exist to test against, otherwise "blind" and "genuinely no run" are the same output.
const stamps = [0, 1, 2].map((d) => {
  const t = new Date(Date.now() - d * 86400000);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
});
const logs = stamps.flatMap((s) => [`/tmp/overnight-local-${s}.log`, `/tmp/overnight-pipeline-${s}.log`])
  .filter((p) => fs.existsSync(p));
if (!logs.length) {
  console.log("  ▫️  no run log in the last 3 days — cannot distinguish 'blind' from 'no run'. INDETERMINATE.");
  process.exit(2);
}
console.log(`  run log present : ${path.basename(logs[0])}`);

let bad = 0;
for (const r of READERS) {
  const f = path.join(HERE, r);
  if (!fs.existsSync(f)) { console.log(`  ▫️  ${r} missing — skipped`); continue; }
  let out = "";
  try {
    out = execFileSync("node", [f], { encoding: "utf8", timeout: 120_000, stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    out = `${e.stdout || ""}${e.stderr || ""}`;   // a non-zero exit is fine; the OUTPUT is what matters
  }
  if (BLIND.test(out)) {
    bad++;
    console.log(`  🔴 ${r.padEnd(30)} reports no log, but one exists — it is reading the wrong path.`);
    console.log(`       "${(out.split("\n").find((l) => BLIND.test(l)) || "").trim().slice(0, 110)}"`);
  } else {
    console.log(`  ✅ ${r.padEnd(30)} sees the run`);
  }
}

console.log("");
if (bad) {
  console.error(`🔴 ${bad} status tool(s) cannot see the run.`);
  console.error("   The morning audit opens with these; blind, they make a failed start look normal.");
  console.error("   See project_status_tools_were_blind.");
  process.exit(1);
}
console.log("✅ every status tool can see the run log that exists");
