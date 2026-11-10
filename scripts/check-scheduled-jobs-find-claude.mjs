#!/usr/bin/env node
// check-scheduled-jobs-find-claude.mjs — 11-10: the Sunday weekly audit failed "claude not found" from Nov 8 (email reminder 3) because
// Claude Code moved to ~/.npm-global/bin and the job's launchd PATH didn't list it. For every Mac schedule (~/Library/LaunchAgents/com.rga.*.plist)
// whose script runs the `claude` CLI: the script must source scripts/lib/find-claude.sh BEFORE its first `claude` call, and with ONLY the
// PATH that plist gives it, `claude` must resolve. Read-only; it runs nothing but `command -v`. No plist or no claude install = INDETERMINATE (2).
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { execFileSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url)), LIB = path.join(HERE, "lib/find-claude.sh");
const AGENTS = path.join(os.homedir(), "Library/LaunchAgents");
let plists; try { plists = fs.readdirSync(AGENTS).filter((f) => /^com\.rga\..*\.plist$/.test(f)); } catch { console.log("INDETERMINATE: no LaunchAgents folder here"); process.exit(2); }
if (!fs.existsSync(LIB)) { console.log("❌ scripts/lib/find-claude.sh is missing"); process.exit(1); }
const read = (p) => { try { return JSON.parse(execFileSync("plutil", ["-convert", "json", "-o", "-", p], { encoding: "utf8" })); } catch { return null; } };
const bad = [], checked = [];
for (const f of plists) {
  const j = read(path.join(AGENTS, f)); if (!j) continue;
  const script = (j.ProgramArguments || []).find((a) => /\.(sh|mjs)$/.test(a)); if (!script || !fs.existsSync(script)) continue;
  const src = fs.readFileSync(script, "utf8"), first = src.search(/(^|[^a-z_-])claude (-p|--)/m);
  if (first < 0) continue;
  const sourced = src.search(/\.\s+"?\$\(dirname "\$0"\)\/lib\/find-claude\.sh"?/);
  if (sourced < 0 || sourced > first) { bad.push(`${f}: ${path.basename(script)} calls claude without sourcing lib/find-claude.sh first`); continue; }
  const PATH = (j.EnvironmentVariables && j.EnvironmentVariables.PATH) || "/usr/bin:/bin:/usr/sbin:/sbin";
  let found = "";
  try { found = execFileSync("env", ["-i", `HOME=${os.homedir()}`, `PATH=${PATH}`, "bash", "-c", `. "${LIB}"; command -v claude`], { encoding: "utf8" }).trim(); } catch {}
  if (!found) bad.push(`${f}: with its own PATH (${PATH}), claude does not resolve even after find-claude.sh`);
  else checked.push(`${f} → ${found}`);
}
if (!checked.length && !bad.length) { console.log("INDETERMINATE: no scheduled job here runs claude, or claude isn't installed"); process.exit(2); }
if (bad.length) { console.log(`❌ ${bad.length} scheduled job(s) can't find claude:`); bad.forEach((b) => console.log(`  · ${b}`)); process.exit(1); }
checked.forEach((c) => console.log(`  ✓ ${c}`));
console.log(`✅ every Mac-scheduled job that runs claude finds it with its own PATH (${checked.length} checked)`);
