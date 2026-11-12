// scripts/lib/two-repo-gate.mjs: the main() for a gate that reads BOTH repos (website + this one) and proves itself on the state its
// build branched from (LIVE_BEFORE). The automation clock + runbooks build (11-11) touched Mac scripts here and functions there, so its
// gates check both, and each must fail on the before state of both in N+ places, or it exits 2 (it can't tell before from after).
// Pure Node; no network. A revision that can't be read is INDETERMINATE, never a pass.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SITE, exportRev } from "./site-rev.mjs";

const HERE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));   // scripts/
export const SCR = process.env.SCRAPER_COPY_DIR || path.dirname(HERE);
/** This repo's own history: the working repo when it has git (a worktree has a .git file), else the main checkout. */
const GIT_SCR = fs.existsSync(path.join(path.dirname(HERE), ".git")) ? path.dirname(HERE) : "/Users/chris/RGA/Rocket Growth Agency Scraper VS Code";
export const REAL_SCR = path.dirname(HERE);

export function exportScraperRev(rev, tag = "scrgate") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${tag}-`));
  try {
    const tar = execFileSync("git", ["-C", GIT_SCR, "archive", rev, "scripts"], { maxBuffer: 512 * 1024 * 1024 });
    execFileSync("tar", ["-x", "-C", dir], { input: tar });
  } catch (e) { console.error(`⚠️  INDETERMINATE: can't read revision ${rev} of the Scraper repo (${String(e.message).slice(0, 120)})`); process.exit(2); }
  return dir;
}
export const rd = (root) => (p) => { try { return fs.readFileSync(path.join(root, p), "utf8"); } catch { return null; } };

/** checkTree(siteRoot, scrRoot, label) → string[] problems. */
export async function runTwoRepoGate({ name, siteBefore, scrBefore, checkTree, minBefore = 4, argv = process.argv.slice(2) }) {
  const F = await checkTree(SITE, SCR, "after");
  if (F.length) { console.log(`✗ ${name}: ${F.length} problem(s)\n${F.map((x) => "  · " + x).join("\n")}`); process.exit(1); }
  if (argv.includes("--no-before")) { console.log(`✓ ${name} holds`); process.exit(0); }
  const B = await checkTree(exportRev(siteBefore, name), exportScraperRev(scrBefore, name), `before(${siteBefore}/${scrBefore})`);
  if (B.length < minBefore) { console.error(`⚠️  INDETERMINATE: ${name} found only ${B.length} problem(s) on the before state; it must fail there in ${minBefore}+ places`); process.exit(2); }
  console.log(`✓ ${name} holds; on the before state (website ${siteBefore}, scraper ${scrBefore}) it finds ${B.length} problems.`);
  process.exit(0);
}
