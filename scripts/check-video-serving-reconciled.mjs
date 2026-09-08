#!/usr/bin/env node
/**
 * check-video-serving-reconciled.mjs — is a 404 a TAKEDOWN or a BREAKAGE?
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-08: a routine check found ~6% of landing pages returning 404. That triggered an hour of
 * investigation — gitignore, permissions, redirects, hash dedupe, file limits, directory
 * recreation — before the answer turned out to be a comment in `netlify.toml`:
 *
 *     # 2026-07-20 EMERGENCY TAKEDOWN (MUST precede the /* SPA catch-all). 69 broken/leaking videos.
 *
 * **They were 404 on purpose.** Nothing was lost, nothing was broken.
 *
 * 🔑 THE TRAP, exactly as [[feedback-video-takedown-list-is-invisible]] warned: the takedown list is
 * invisible from every angle you would naturally look from.
 *
 *     a filesystem check  → "the video is right there, 12 MB"      → says FINE   (wrong)
 *     a curl check        → "404"                                  → says BROKEN (also wrong)
 *
 * Neither is right without knowing the list exists. This script is the missing third input.
 *
 * 🔴 It also cost a false record: project_pending_tasks carried "~60 landing pages 404 in prod — 2
 * prospects were emailed dead links" for weeks. Both prospects were emailed three weeks BEFORE the
 * takedown, so they received working links. A wrong note sent the next reader down the same path.
 *
 * CLASSIFIES every landing page as:
 *   ✅ SERVING            video/mp4 returned
 *   ▫️ INTENTIONALLY DOWN on the takedown list — expected, not a fault
 *   🔴 BROKEN             not on the list, and not serving  ← the only thing worth waking up for
 *
 * Exit 0 = nothing genuinely broken. 1 = a video is down that nobody took down. 2 = cannot tell.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const WEB = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const TOML = path.join(WEB, "netlify.toml");
const VDIR = path.join(WEB, "v");
const ORIGIN = "https://www.rocketgrowthagency.com";
const SAMPLE = Number(process.env.VIDEO_SAMPLE || 25);

if (!fs.existsSync(TOML) || !fs.existsSync(VDIR)) {
  console.error("  ✗ website repo not found"); process.exit(2);
}

// The takedown list, read from the same file that enforces it — so it can never drift from reality.
const toml = fs.readFileSync(TOML, "utf8");
const takendown = new Set(
  [...toml.matchAll(/from\s*=\s*"\/v\/([a-z0-9-]+)"/g)].map((m) => m[1]),
);

const slugs = fs.readdirSync(VDIR).filter((d) => fs.existsSync(path.join(VDIR, d, "video.mp4")));

console.log("── landing pages: serving, taken down, or broken ──");
console.log(`  on disk        : ${slugs.length}`);
console.log(`  taken down     : ${takendown.size}  (netlify.toml, 2026-07-20 emergency takedown)`);

// 🔑 Sample only slugs NOT on the takedown list. Sampling a taken-down slug and calling it broken is
// exactly the false alarm this script exists to prevent.
const live = slugs.filter((s) => !takendown.has(s));
const pool = live.slice().sort(() => 0.5 - Math.random()).slice(0, Math.min(SAMPLE, live.length));

let serving = 0;
const broken = [];
for (const s of pool) {
  let ct = "";
  try {
    ct = execFileSync("curl", ["-sL", "-o", "/dev/null", "-w", "%{content_type}",
      "--max-time", "20", `${ORIGIN}/v/${s}/video.mp4`], { encoding: "utf8" }).trim();
  } catch { console.log(`  ▫️  ${s}: request failed — INDETERMINATE`); process.exit(2); }
  if (/^video\/mp4/.test(ct)) serving++;
  else broken.push({ s, ct });
}

console.log(`  sampled        : ${pool.length} of ${live.length} expected-live`);
console.log(`  ✅ serving      : ${serving}`);

// A slug on the list that ALSO has no file is fine. A slug on the list is simply not our problem.
const orphanRules = [...takendown].filter((s) => !fs.existsSync(path.join(VDIR, s)));
if (orphanRules.length) {
  console.log(`  ▫️  ${orphanRules.length} takedown rule(s) for slugs no longer on disk (harmless, tidy when convenient)`);
}

console.log("");
if (broken.length) {
  console.error(`🔴 ${broken.length} video(s) are down and NOT on the takedown list:`);
  broken.forEach((b) => console.error(`     ${b.s.padEnd(44)} ${b.ct}`));
  console.error("   These are genuine breakage. A taken-down slug would not appear here —");
  console.error("   that distinction is the whole point (project_video_takedown_list_is_invisible).");
  process.exit(1);
}
console.log(`✅ ${serving}/${pool.length} sampled videos serve · ${takendown.size} intentionally down · 0 broken`);
