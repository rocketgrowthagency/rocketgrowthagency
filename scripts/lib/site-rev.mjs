// scripts/lib/site-rev.mjs: shared by the call/schedule gates (check-call-to-client, check-master-schedule, check-call-names).
// Exports a revision of the WEBSITE repo into a temp folder (only what the gates read) so a gate can be run on the build's BEFORE state (LIVE_BEFORE),
// plus small helpers. Pure Node; no network.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

export const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";

/** git archive of the folders the gates read, extracted to a temp dir. A revision that cannot be read exits 2 (INDETERMINATE), never a pass. */
export function exportRev(rev, tag = "sitegate") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${tag}-`));
  try {
    const tar = execFileSync("git", ["-C", SITE, "archive", rev, "shared", "netlify/functions", "netlify.toml", "data", "portal", "admin", "docs/supabase", "faq", "pricing", "index.html", "package.json"], { maxBuffer: 512 * 1024 * 1024 });
    execFileSync("tar", ["-x", "-C", dir], { input: tar });
  } catch (e) { console.error(`⚠️  INDETERMINATE: can't read revision ${rev} of the website (${String(e.message).slice(0, 120)})`); process.exit(2); }
  try { fs.symlinkSync(path.join(SITE, "node_modules"), path.join(dir, "node_modules")); } catch { /* optional */ }
  return dir;
}
export const reader = (root) => (p) => { try { return fs.readFileSync(path.join(root, p), "utf8"); } catch { return null; } };
export const loader = (root) => createRequire(path.join(root, "x.js"));
/** Source lines that are code, not comments (a leading // or * line is dropped; a trailing // is kept, since strings can contain it). */
export const codeLines = (src) => String(src || "").split("\n").map((l, i) => ({ l, n: i + 1 })).filter(({ l }) => !/^\s*(\/\/|\*|\/\*)/.test(l));

/** The common main(): run checkTree on the working tree, then on the BEFORE revision, which MUST fail in at least `minBefore` places. */
export async function runGate({ name, beforeRev, checkTree, minBefore = 6, argv = process.argv.slice(2) }) {
  const AGAINST = (argv.find((a) => a.startsWith("--against=")) || "").slice(10) || null;
  if (AGAINST) {
    const F = await checkTree(exportRev(AGAINST, name), `before(${AGAINST})`);
    console.log(F.length ? `✗ ${AGAINST}: ${F.length} problem(s) (this is the BEFORE state, so failing is correct)\n${F.slice(0, 40).map((x) => "  · " + x).join("\n")}` : `✓ ${AGAINST} passes`);
    process.exit(F.length ? 1 : 0);
  }
  const F = await checkTree(SITE, "after");
  if (F.length) { console.log(`✗ ${name}: ${F.length} problem(s)\n${F.map((x) => "  · " + x).join("\n")}`); process.exit(1); }
  if (argv.includes("--no-before")) { console.log(`✓ ${name} holds`); process.exit(0); }
  // LIVE_BEFORE: the gate MUST fail on the state this build branched from, or it cannot tell before from after
  const B = await checkTree(exportRev(beforeRev, name), `before(${beforeRev})`);
  if (B.length < minBefore) { console.error(`⚠️  INDETERMINATE: ${name} found only ${B.length} problem(s) on the before state ${beforeRev}; it must fail there in ${minBefore}+ places`); process.exit(2); }
  console.log(`✓ ${name} holds; on the before state ${beforeRev} it finds ${B.length} problems.`);
  process.exit(0);
}
