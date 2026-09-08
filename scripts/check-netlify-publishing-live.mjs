#!/usr/bin/env node
/**
 * check-netlify-publishing-live.mjs — is production serving a build that CONTAINS THE VIDEOS?
 *
 * ─── 🔴🔴 THIS GATE WAS BUILT ON A WRONG PREMISE, AND THE FIX CAUSED AN OUTAGE ──────────────────
 * 2026-09-06 I found production "locked", called it a defect, unlocked it, and wrote this gate to
 * fail whenever it was locked again. 2026-09-08 the consequence landed:
 *
 *     every outreach video on the live site returned text/html instead of video/mp4
 *     0 of 1,139 .mp4 files are in git — they are gitignored on purpose
 *
 * **The lock was the protection, not the bug.** This site publishes with
 * `netlify deploy --prod --dir=.`, which uploads the WORKING TREE. Git holds the landing pages but
 * not the videos, so a git-triggered publish ships a site where every outreach link is dead. The
 * lock exists to stop exactly that, and `preflight-site-deploy.sh` documents the intended dance:
 * unlock → deploy --dir=. → verify → RELOCK.
 *
 * 🔑 **BEFORE REMOVING ANY LIMIT, FIND OUT WHAT IT WAS PROTECTING AGAINST.** Chris taught this on
 * 2026-09-06 about the Places quota — the same day, on the same reasoning, I did it again here
 * ([[feedback-google-cloud-billing-safety]], [[project-places-searchtext-quota-ceiling]]).
 *
 * WHAT THIS NOW CHECKS — the invariant that actually matters
 *   1. 🔴 A sampled landing-page video must serve `video/mp4`. Content is the ONLY proof; the dead
 *      state returned HTTP **200** with `text/html`, so a status check saw nothing wrong.
 *   2. ⚠️ If the published deploy is a GIT commit deploy, say so loudly — that build cannot contain
 *      the videos.
 *   3. ▫️ Locked is EXPECTED and is reported as such, never as a failure.
 *
 * Exit 0 = videos are live. 1 = they are not. 2 = could not tell.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SITE = "38f275c7-a4a8-4531-9989-1fc1ccb78f9e";
const WEB = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const ORIGIN = "https://www.rocketgrowthagency.com";

function api(method, data) {
  try {
    return JSON.parse(execFileSync("netlify", ["api", method, "--data", JSON.stringify(data)], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 60_000, maxBuffer: 64 * 1024 * 1024,
    }));
  } catch { return null; }
}

console.log("── production must serve a build that contains the videos ──");

// 1. THE CONTENT CHECK — this is the one that matters.
const vDir = path.join(WEB, "v");
if (!fs.existsSync(vDir)) { console.log("  ▫️  no v/ directory — cannot sample"); process.exit(2); }
// 🔴 2026-09-08 — SKIP THE TAKEDOWN LIST. 68 slugs are 404 ON PURPOSE (netlify.toml, the
// 2026-07-20 emergency takedown). Sampling one and reporting "videos are not serving" would be a
// false alarm — and chasing exactly that false alarm cost an hour before the list was found.
const tomlPath = path.join(WEB, "netlify.toml");
const takendown = fs.existsSync(tomlPath)
  ? new Set([...fs.readFileSync(tomlPath, "utf8").matchAll(/from\s*=\s*"\/v\/([a-z0-9-]+)"/g)].map((m) => m[1]))
  : new Set();
const slugs = fs.readdirSync(vDir)
  .filter((d) => fs.existsSync(path.join(vDir, d, "video.mp4")) && !takendown.has(d))
  .slice(0, 3);

if (!slugs.length) { console.log("  ▫️  no local videos to sample against"); process.exit(2); }

let bad = 0;
for (const slug of slugs) {
  let ct = "", code = "";
  try {
    const out = execFileSync("curl", ["-sIL", "-o", "/dev/null", "-w", "%{http_code} %{content_type}",
      `${ORIGIN}/v/${slug}/video.mp4`], { encoding: "utf8", timeout: 45_000 });
    [code, ct] = out.trim().split(/\s+/);
  } catch { console.log(`  ▫️  ${slug}: request failed — indeterminate`); process.exit(2); }

  // 🔴 A 200 proves nothing. The dead state WAS a 200 — serving the HTML fallback.
  if (/video\/mp4/.test(ct)) {
    console.log(`  ✅ ${slug.slice(0, 44).padEnd(44)} ${ct}`);
  } else {
    bad++;
    console.log(`  🔴 ${slug.slice(0, 44).padEnd(44)} HTTP ${code} ${ct} — NOT a video`);
  }
}

// 2 + 3. Context, so a failure explains itself.
const site = api("getSite", { site_id: SITE });
if (site) {
  const pub = site.published_deploy || {};
  const fromGit = !!pub.commit_ref;
  console.log("");
  console.log(`  published deploy : ${String(pub.id).slice(0, 8)}  ${fromGit ? `git ${String(pub.commit_ref).slice(0, 8)}` : "manual (working tree)"}`);
  console.log(`  locked           : ${pub.locked ? "yes — EXPECTED, this is what stops a video-less git publish" : "🔴 NO — a git push can publish a build with no videos"}`);
  if (fromGit) {
    console.log("  🔴 production is serving a GIT deploy. Git holds the landing pages but NOT the .mp4s");
    console.log("     (0 tracked, gitignored on purpose), so that build cannot contain the videos.");
  }
  if (!pub.locked) {
    console.log("     Re-lock:  netlify api lockDeploy --data '{\"deploy_id\":\"" + pub.id + "\"}'");
  }
} else {
  console.log("  ▫️  Netlify API unreachable — deploy context unavailable (content check above still stands)");
}

console.log("");
if (bad) {
  console.error(`🔴 ${bad}/${slugs.length} sampled video(s) are NOT being served.`);
  console.error("   Restore:  cd '" + WEB + "' && netlify deploy --prod --dir=.   then RE-LOCK.");
  console.error("   See project_netlify_deploy_lock_stranded_pushes.");
  process.exit(1);
}
console.log(`✅ ${slugs.length}/${slugs.length} sampled videos serve video/mp4 — production carries the working-tree build`);
