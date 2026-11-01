#!/usr/bin/env node
// check-the-parked-excuse-names-its-reason.mjs
// WHY (Chris 11-1): the parked video gate (check-every-video-page-ships) kept the night red. It is excused BY NAME in before-confirming.mjs (PARKED) and
// reads as an ongoing state in daily-health-check.sh. An excuse is a claim, so:
//   1. every name in PARKED is a real gate file, and carries a reason of real length (the reason stays visible in the output)
//   2. only exit 1 is excused (exit 2, could not tell, still shows)
//   3. the excuse prints the reason, and no wildcard or "all video" excuse exists
//   4. daily-health-check.sh lists the video gate as `status` and says PARKED
// exit 0 holds · 1 broken · 2 can't tell
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.SCRAPER_COPY_DIR ? path.join(process.env.SCRAPER_COPY_DIR, "scripts") : HERE;
const read = (f) => { try { return fs.readFileSync(path.join(root, f), "utf8"); } catch { return null; } };
const bc = read("before-confirming.mjs"), dh = read("daily-health-check.sh");
if (!bc || !dh) { console.error("⚠️  INDETERMINATE: cannot read before-confirming.mjs or daily-health-check.sh"); process.exit(2); }
const fails = [];
const m = bc.match(/const PARKED = \{([\s\S]*?)\n\};/);
if (!m) { console.error("⚠️  INDETERMINATE: the PARKED list is not where this gate looks"); process.exit(2); }
const entries = [...m[1].matchAll(/"([^"]+)":\s*"([^"]*)"/g)];
if (!entries.length) fails.push("PARKED is empty: the excuse the owner approved is gone, so the night goes red again");
for (const [, name, why] of entries) {
  if (!fs.existsSync(path.join(HERE, `${name}.mjs`))) fails.push(`PARKED names ${name}, which is not a gate file`);
  if (why.length < 40 || !/parked/i.test(why)) fails.push(`${name}: the excuse has no visible reason that says why it is parked`);
  if (/[*?]|^all|video$/i.test(name)) fails.push(`${name}: an excuse must be one gate by name, never a pattern`);
}
if (!/r\.status === 1 && PARKED\[label\]/.test(bc)) fails.push("the excuse is not limited to exit 1 on a named gate (exit 2 must still show)");
if (!/excused by name: \$\{PARKED\[label\]\}/.test(bc)) fails.push("the excuse no longer prints its reason");
if (!/run check-every-video-page-ships\.mjs[^\n]*PARKED[^\n]*status\s*$/m.test(dh)) fails.push("daily-health-check.sh no longer lists the parked video gate as `status` with PARKED in its line");
if (fails.length) { console.log("🔴 the parked excuse is broken:"); fails.forEach((f) => console.log("   ✗ " + f)); process.exit(1); }
console.log(`✅ ${entries.length} parked gate(s) excused by name, each with its reason, exit 1 only`);
