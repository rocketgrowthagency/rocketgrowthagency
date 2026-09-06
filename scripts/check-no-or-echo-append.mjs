#!/usr/bin/env node
/**
 * check-no-or-echo-append.mjs — ban `$(cmd … || echo N)` in the shell scripts.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * This exact pattern has now caused three separate silent failures:
 *
 *   overnight-pipeline.sh  — `grep -c "" file || echo 0`: on an empty file grep prints "0" AND
 *                            exits 1, so `|| echo 0` APPENDED a second line.
 *   daily-health-check.sh  — same shape; the test compared "0\n0" and threw
 *                            "integer expression expected".
 *   overnight-local.sh     — 2026-09-06. The governor prints the gap AND exits 1 (STAY-PAUSED);
 *                            `set -o pipefail` propagated that, so `|| echo 0` fired even though
 *                            grep had printed "8". PAUSED_OWED became $'8\n0', the test threw, and
 *                            the night logged "nothing to drain" while 8 videos were owed.
 *
 * 🔑 THE MISREADING: `|| echo N` looks like "default to N if this fails". It is not. It is "ALSO
 * print N if the exit code is non-zero" — and a command can print real output *and* exit non-zero.
 * `grep -c` does. `pipefail` makes any pipeline do it. The result is appended, not substituted.
 *
 * ✅ The correct shape — capture first, default second, outside the substitution:
 *     OUT=$(cmd) || true
 *     N=$(printf '%s' "$OUT" | grep -oE '…' | head -1)
 *     N=${N:-0}
 *
 * Exit 0 = clean. 1 = the pattern is back.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = HERE;

// 🔴 NARROW ON PURPOSE. The first version flagged every `$(… || echo …)` and caught 5 SAFE idioms:
//   stat / defaults read / curl -o /dev/null -w …  → print NOTHING on failure, so `||` substitutes
//   $([ -f x ] && echo y || echo n)                 → the standard ternary; `[` prints nothing
// A guard that flags correct code gets ignored, and then it misses the real one.
//
// The danger is only where a command prints REAL OUTPUT *and* exits non-zero:
//   grep -c / pgrep -c   → print "0" and exit 1 when there are no matches
//   any PIPELINE         → `set -o pipefail` propagates an upstream non-zero exit
const DANGEROUS = [
  { re: /\$\([^)]*\b(?:grep|pgrep)\s+-[a-z]*c[a-z]*\b[^)]*\|\|\s*echo\s/, why: "grep -c / pgrep -c print a count AND exit non-zero when the count is 0" },
  { re: /\$\([^)]*\|[^|)]+\|\|\s*echo\s/, why: "a pipeline under `set -o pipefail` exits non-zero if ANY stage does, even after printing" },
];

const offenders = [];
console.log("── banned pattern: $(cmd … || echo N) ──");

for (const f of fs.readdirSync(SCRIPTS).filter((f) => f.endsWith(".sh"))) {
  const lines = fs.readFileSync(path.join(SCRIPTS, f), "utf8").split("\n");
  lines.forEach((line, i) => {
    if (line.trim().startsWith("#")) return;          // a comment explaining the bug is fine
    const hit = DANGEROUS.find((d) => d.re.test(line));
    if (!hit) return;
    offenders.push({ file: f, line: i + 1, text: line.trim().slice(0, 110), why: hit.why });
  });
}

if (offenders.length) {
  for (const o of offenders) {
    console.log(`  🔴 ${o.file}:${o.line}`);
    console.log(`       ${o.text}`);
    console.log(`       ↳ ${o.why}`);
  }
  console.log("");
  console.error(`🔴 ${offenders.length} use(s) of \`|| echo\` inside a command substitution.`);
  console.error(`   It APPENDS on non-zero exit rather than substituting — a command can print real`);
  console.error(`   output and still exit non-zero (grep -c does; pipefail makes any pipeline do it).`);
  console.error(`   Use:  OUT=$(cmd) || true   then   N=\${N:-0}`);
  process.exit(1);
}

console.log(`  ✅ none in ${fs.readdirSync(SCRIPTS).filter((f) => f.endsWith(".sh")).length} shell script(s)`);
console.log("\n✅ the append-instead-of-default trap is absent");
