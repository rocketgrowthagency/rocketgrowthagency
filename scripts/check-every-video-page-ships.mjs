#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-every-video-page-ships.mjs
//
// 🔴 WHY (2026-10-09): deploy-site.sh ships the COMMIT and holds back every untracked file. The main
// pipeline's batched deploy has always `git add v/$slug` first; rebuild-broken-videos.sh never did. On
// 10-07 and 10-08 nine rebuilt leads went live with their video.mp4 (gitignored → always deployed) but
// WITHOUT their index.html, so /v/<slug>/ served the SPA homepage — and the rebuild's only check was
// "video.mp4 serves video/*", which passed, so step-8 published the Video URL to Airtable.
//
// HOLDS:
//   1. rebuild-broken-videos.sh commits `v/$s` BEFORE it calls deploy-site.sh
//   2. its verify step checks the PAGE (the landing page references video.mp4; the homepage never does),
//      and a lead is published only when both the video and the page serve
//   3. REALITY: no v/<slug>/index.html in the website repo has sat uncommitted for over 2 hours —
//      whatever wrote it, an untracked page is a page that does not ship
// exit 0 = every page ships · 1 = one does not · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REBUILD = process.env.REBUILD_SCRIPT
  || (process.env.SCRAPER_COPY_DIR ? path.join(process.env.SCRAPER_COPY_DIR, "scripts/rebuild-broken-videos.sh") : path.join(HERE, "rebuild-broken-videos.sh"));
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const fails = [];

let src;
try { src = fs.readFileSync(REBUILD, "utf8"); } catch { console.error("⚠️  INDETERMINATE — cannot read rebuild-broken-videos.sh"); process.exit(2); }
const code = src.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");

// 1
const iAdd = code.search(/git -C "\$WEB" add "v\/\$s"/);
const iCommit = code.search(/git -C "\$WEB"[^\n]*\n?[^\n]*commit/);
const iDeploy = code.indexOf("scripts/deploy-site.sh");
if (iDeploy < 0) fails.push("rebuild-broken-videos.sh no longer calls deploy-site.sh — re-read this gate");
else {
  if (iAdd < 0 || iAdd > iDeploy) fails.push("the rebuild does not `git add v/$s` before deploy-site.sh — its landing pages are held back as untracked");
  if (iCommit < 0 || iCommit > iDeploy) fails.push("the rebuild does not commit before deploy-site.sh — deploy-site.sh ships only the commit");
}
// 2
if (!/curl -s "https:\/\/www\.rocketgrowthagency\.com\/v\/\$s\/[^"]*" \| grep -c "video\.mp4"/.test(code))
  fails.push("the rebuild's verify no longer fetches the PAGE — a missing index.html serves the homepage and passes a video-only check");
if (!/video\/\*\) \[ "\$\{PG:-0\}" -gt 0 \] && \{ SERVED\+=/.test(code))
  fails.push("a lead is published without the page proven to serve");

// 3 — reality
// A COPY (mutation run) has no git history — the static part is what a mutation can reach; reality runs on the real repo.
const isCopy = !!process.env.REBUILD_SCRIPT || !fs.existsSync(path.join(SITE, ".git"));
if (!isCopy) {
  let out = "";
  try { out = execFileSync("git", ["-C", SITE, "ls-files", "--others", "--exclude-standard", "v/"], { encoding: "utf8" }); }
  catch { console.error("⚠️  INDETERMINATE — cannot read the website repo's git status"); process.exit(2); }
  const stale = out.split("\n").filter((f) => /^v\/[^/]+\/index\.html$/.test(f)).filter((f) => {
    try { return Date.now() - fs.statSync(path.join(SITE, f)).mtimeMs > 2 * 3600e3; } catch { return false; }
  });
  if (stale.length) fails.push(`${stale.length} video landing page(s) uncommitted for >2h, so NOT live (the URL serves the homepage): ${stale.slice(0, 6).map((f) => f.split("/")[1]).join(", ")}${stale.length > 6 ? " …" : ""} — commit them and run deploy-site.sh`);
}

if (fails.length) { console.error("🔴 a video landing page does not ship:"); for (const f of fails) console.error("   · " + f); process.exit(1); }
console.log("✅ every video landing page ships: the rebuild commits before deploying, verifies the page, and none sits uncommitted");
