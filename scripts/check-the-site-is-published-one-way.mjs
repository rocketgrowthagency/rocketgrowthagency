#!/usr/bin/env node
/**
 * check-the-site-is-published-one-way.mjs — EVERYTHING THAT PUTS RGA'S SITE LIVE GOES THROUGH deploy-site.sh, AND NEW VIDEOS GO TO FILE
 * STORAGE FIRST (approved rga_videos_to_storage_v1, the owner 11-8: "test everything and confirm the system now will be updated so it will
 * still work seamlessly and automatically" · "must setup for new videos too right?").
 * Once the site builds from GitHub, one stray `netlify deploy` from this Mac would lock production back to a Mac copy (the trap in
 * project_netlify_deploy_lock_stranded_pushes) and stop every GitHub build without a word. So:
 *   1. no script in either repo runs `netlify deploy` except deploy-site.sh;
 *   2. deploy-site.sh's GitHub mode pushes only main, brings in what was merged on GitHub (a clash publishes nothing), waits for THAT
 *      commit's Netlify build to be the published one, and verifies a video by content (following the forward to storage);
 *   3. the overnight pipeline, video rebuilds and the one-lead test put each new video in storage (read back) BEFORE the page goes live,
 *      take the deploy's own exit code, and check each video through its address following the forward;
 *   4. the storage step reads each video back: size, type, fingerprint, and a skip-ahead request.
 * Static, both repos. Exit 0 = holds · 1 = doesn't · 2 = couldn't tell.
 */
import fs from "node:fs";
import path from "node:path";
const WEB = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SCR = process.env.SCRAPER_COPY_DIR || "/Users/chris/RGA/Rocket Growth Agency Scraper VS Code";
const read = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return null; } };
const DS = read(`${WEB}/scripts/deploy-site.sh`), OP = read(`${SCR}/scripts/overnight-pipeline.sh`), RB = read(`${SCR}/scripts/rebuild-broken-videos.sh`), TL = read(`${SCR}/scripts/test-realtime-one-lead.sh`), UP = read(`${SCR}/scripts/outreach-video-to-storage.mjs`), MODE = read(`${WEB}/scripts/deploy-mode`);
if ([DS, OP, RB, TL, UP, MODE].some((x) => x === null)) { console.error("⚠️  INDETERMINATE — a publish script is missing"); process.exit(2); }
const bad = [], fail = (m) => bad.push(m);

// 1 · one way to publish
const files = [];
for (const [dir, deep] of [[`${WEB}/scripts`, false], [`${SCR}/scripts`, false], [SCR, false]]) {
  for (const f of fs.readdirSync(dir)) if (/\.(sh|mjs|js)$/.test(f) && !/^check-|^_look-/.test(f)) files.push(path.join(dir, f));
}
for (const f of files) {
  if (f === `${WEB}/scripts/deploy-site.sh`) continue;
  const lines = String(read(f) || "").split("\n");
  lines.forEach((l, i) => {
    const t = l.trim();
    if (/^(#|\/\/|\*)/.test(t) || /^echo\b|console\.(log|error)\(/.test(t)) return;
    if (/\bnetlify\s+deploy\b/.test(t) || /api\.netlify\.com\/api\/v1\/deploys\/[^/]+\/(unlock|lock)/.test(t) || /netlify api (unlockDeploy|lockDeploy|restoreSiteDeploy)/.test(t)) fail(`${path.relative(path.dirname(WEB), f)}:${i + 1} publishes or unlocks the site around deploy-site.sh`);
  });
}

// 2 · deploy-site.sh's GitHub mode
if (!/^(mac|github)\b/.test(MODE.trim())) fail(`scripts/deploy-mode says "${MODE.split("\n")[0]}", not mac or github`);
const gh = DS.slice(DS.indexOf('if [ "$DEPLOY_MODE" = "github" ]; then'), DS.indexOf('HOLD_DIR=""'));
if (!/DEPLOY_MODE="\$\(head -1 "\$WEB\/scripts\/deploy-mode"/.test(DS) || gh.length < 200) fail("deploy-site.sh doesn't read scripts/deploy-mode, or its GitHub mode is missing");
if (DS.indexOf('if [ "$DEPLOY_MODE" = "github" ]') > DS.indexOf("HOLD_DIR=\"\"") || DS.indexOf("# ── 0. WOULD THIS SHIP A BLANK PAGE?") > DS.indexOf('if [ "$DEPLOY_MODE" = "github" ]')) fail("GitHub mode doesn't come after the blank-page and sitemap checks and before the Mac upload");
if (!/\[ "\$BR" = "main" \] \|\| \{[^}]*exit 1; \}/.test(gh)) fail("GitHub mode can push from a branch other than main");
if (!/merge --no-edit -q origin\/main; then\s*\n\s*git merge --abort/.test(gh)) fail("a change merged on GitHub isn't brought in first, or a clash isn't backed out");
if (!/git push -q origin HEAD:main \|\| \{[^}]*exit 1; \}/.test(gh)) fail("a refused push isn't a failure");
if (!/x\.commit_ref===process\.env\.SHA/.test(gh) || !/\[ "\$STATE" != "ready" \]/.test(gh) || !/\[ "\$PUB" != "\$DID" \]/.test(gh)) fail("GitHub mode doesn't wait for THAT commit's build to be the published one");
if (!/curl -sL -o \/dev\/null -w '%\{content_type\}'[^\n]*video\.mp4/.test(gh) || !/video\/mp4\*\) echo "  4\. ✅/.test(gh) || !/\*\)\s+echo "  4\. 🔴[^\n]*exit 1/.test(gh)) fail("GitHub mode doesn't verify a video by content, following the forward to storage");

// 3 · new and rebuilt videos: storage first, then the page, then each checked
const pub = OP.slice(OP.indexOf("# === Tier 2 (locked 2026-05-27)"), OP.indexOf('echo ">>> No new landing pages to deploy this run"'));
const iUp = pub.indexOf('outreach-video-to-storage.mjs" "${PENDING_DEPLOY_SLUGS[@]}"'), iDs = pub.indexOf('bash "$WEBSITE_DIR/scripts/deploy-site.sh" "$COMMIT_MSG"');
if (iUp < 0 || iDs < 0 || iUp > iDs) fail("the overnight pipeline doesn't put each new video in storage before its page goes live through deploy-site.sh");
if (!/deploy-site\.sh" "\$COMMIT_MSG" 2>&1 \| tee -a "\$LOGFILE"\n\s*_drc=\$\{PIPESTATUS\[0\]\}/.test(pub)) fail("the overnight pipeline doesn't take the deploy's own exit code");
if (!/for _s in "\$\{PENDING_DEPLOY_SLUGS\[@\]\}"; do\s*\n\s*_ct=\$\(curl -sL /.test(pub) || !/grep -c "video\.mp4"/.test(pub)) fail("the overnight pipeline doesn't check every new video and page through its address (following the forward)");
if (!/hold-leads-without-live-video\.mjs --apply/.test(pub)) fail("a lead whose video isn't playing isn't held");
const rUp = RB.indexOf('outreach-video-to-storage.mjs" "${OK[@]}"'), rDs = RB.indexOf('/scripts/deploy-site.sh" "rebuild broken videos');
if (rUp < 0 || rDs < 0 || rUp > rDs) fail("video rebuilds don't replace the stored copy before the page goes live");
if (!/CT=\$\(curl -sL -o \/dev\/null -w '%\{content_type\}' "https:\/\/www\.rocketgrowthagency\.com\/v\/\$s\/video\.mp4"\)/.test(RB)) fail("video rebuilds check the video without following the forward to storage");
if (!/outreach-video-to-storage\.mjs" "\$BUILD_SLUG"[^\n]*\|\| die "video to storage"/.test(TL) || !/deploy-site\.sh" "test lead: \$BUILD_SLUG"[^\n]*\|\| die "deploy"/.test(TL)) fail("the one-lead test doesn't use storage and deploy-site.sh");

// 4 · the storage step reads each one back
if (!/"x-upsert": "true"/.test(UP) || !/len !== buf\.length/.test(UP) || !/\^video\\\/mp4/.test(UP) || !/etag !== sum/.test(UP) || !/rg\.status !== 206 \|\| !rb\.equals/.test(UP) || !/process\.exit\(bad \? 1 : 0\)/.test(UP)) fail("the storage step doesn't read each video back (replace, size, type, fingerprint, skip-ahead) or exit 1 when one fails");

// 5 · rga_video_address_v1 A (11-8): a new page's player streams from storage with no download button or right-click menu
const TPL = read(`${SCR}/templates/video-landing.html`) || "", PS = read(`${SCR}/scripts/outreach-pages-play-from-storage.mjs`) || "";
const tag = (TPL.match(/<video\b[^>]*>/) || [""])[0];
if (!tag.includes('src="https://jetgayimvfeslqnkbfdq.supabase.co/storage/v1/object/public/outreach-videos/{{SLUG}}/video.mp4?v={{CACHE_VERSION}}"') || !/controlsList="nodownload"/.test(tag) || !/oncontextmenu="return false;"/.test(tag)) fail("the page template's player doesn't stream from storage with the guard");
if (!/<a href="video\.mp4\?v=\{\{CACHE_VERSION\}\}">Download the video<\/a>/.test(TPL)) fail("the template's fallback link doesn't use our own address");
if (!/attrs \+= ' controlsList="nodownload"'/.test(PS) || !/attrs \+= ' oncontextmenu="return false;"'/.test(PS) || !/\/\^video\\\.mp4\(\\\?\|\$\)\/\.test\(src\)/.test(PS)) fail("the page script doesn't add the guard, or would point a page at another video");

if (bad.length) { console.error(`❌ the site isn't published one way — ${bad.length} regression(s):`); for (const x of bad) console.error(`  · ${x}`); process.exit(1); }
console.log(`✅ the site is published one way: no script deploys around deploy-site.sh (${files.length} scanned); its GitHub mode pushes only main, brings in merged changes (a clash publishes nothing), waits for that commit's build to be live and verifies a video by content; new and rebuilt videos go to storage (read back) before their pages, each checked through its address`);
