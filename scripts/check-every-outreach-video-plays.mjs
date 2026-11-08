#!/usr/bin/env node
/**
 * check-every-outreach-video-plays.mjs — EVERY OUTREACH PAGE'S VIDEO PLAYS FROM FILE STORAGE, LIVE (rga_videos_to_storage_v1, the owner 11-8:
 * "how can we test all current live videos get switched over to new supabase video links?"). Reads the real site, not the code: for each of
 * the videos in data/outreach-videos.json, its address (www.rocketgrowthagency.com/v/<slug>/video.mp4) must stay ours, be served from storage, and answer
 * video/mp4 at the size the live site served on 11-8; a handful of pages must still be the landing page; every taken-down video stays 404.
 * HEAD requests only. Exit 0 = every one plays · 1 = one or more don't (named) · 2 = couldn't tell (the site or storage didn't answer).
 */
import fs from "node:fs";
const WEB = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SITE = "https://www.rocketgrowthagency.com";
let LIST, TOML;
try { LIST = JSON.parse(fs.readFileSync(`${WEB}/data/outreach-videos.json`, "utf8")).videos; TOML = fs.readFileSync(`${WEB}/netlify.toml`, "utf8"); }
catch (e) { console.error(`⚠️  INDETERMINATE — couldn't read the list: ${e.message}`); process.exit(2); }
const takenDown = [...new Set((TOML.match(/from = "\/v\/[a-z0-9-]+/g) || []).map((x) => x.slice(11)))];
const bad = [], unread = [];
let i = 0, ok = 0;
await Promise.all(Array.from({ length: 16 }, async () => {
  while (i < LIST.length) {
    const x = LIST[i++];
    try {
      const r = await fetch(`${SITE}/v/${x.slug}/video.mp4`, { method: "HEAD", signal: AbortSignal.timeout(30000) });
      const ct = r.headers.get("content-type") || "", len = Number(r.headers.get("content-length"));
      if (r.status === 200 && /^video\/mp4/i.test(ct) && len === x.size && r.headers.get("sb-project-ref") && new URL(r.url).host === "www.rocketgrowthagency.com") ok++;
      else bad.push(`${x.slug}: ${r.status} ${ct || "no type"} ${len} bytes from ${new URL(r.url).host}`);
    } catch { unread.push(x.slug); }
  }
}));
// a blip isn't a broken video: anything that didn't answer is asked twice more, one at a time
for (const s of unread.splice(0)) {
  const x = LIST.find((v) => v.slug === s); let done = false;
  for (let k = 0; k < 2 && !done; k++) {
    const r = await fetch(`${SITE}/v/${s}/video.mp4`, { method: "HEAD", signal: AbortSignal.timeout(30000) }).catch(() => null);
    if (!r) continue;
    done = true;
    if (r.status === 200 && /^video\/mp4/i.test(r.headers.get("content-type") || "") && Number(r.headers.get("content-length")) === x.size && r.headers.get("sb-project-ref") && new URL(r.url).host === "www.rocketgrowthagency.com") ok++;
    else bad.push(`${s}: ${r.status} ${r.headers.get("content-type") || "no type"}`);
  }
  if (!done) unread.push(s);
}
// rga_video_address_v1 A (11-8): every page's player streams straight from storage, with no download button or right-click menu
const STORAGE = "https://jetgayimvfeslqnkbfdq.supabase.co/storage/v1/object/public/outreach-videos";
for (const x of LIST) {
  const h = fs.existsSync(`${WEB}/v/${x.slug}/index.html`) ? fs.readFileSync(`${WEB}/v/${x.slug}/index.html`, "utf8") : "";
  const tag = (h.match(/<video\b[^>]*>/) || [""])[0];
  if (!tag.includes(`src="${STORAGE}/${x.slug}/video.mp4`) || !/controlsList="nodownload"/.test(tag) || !/oncontextmenu="return false;"/.test(tag)) bad.push(`${x.slug}: the page's player doesn't stream from storage with the guard`);
}
let pagesOk = 0;
for (const x of LIST.filter((_, k) => k % Math.ceil(LIST.length / 5) === 0)) {
  const h = await fetch(`${SITE}/v/${x.slug}/`, { signal: AbortSignal.timeout(30000) }).then((r) => (r.ok ? r.text() : "")).catch(() => "");
  if (h.includes(`${STORAGE}/${x.slug}/video.mp4`)) pagesOk++; else bad.push(`${x.slug}: the page isn't the landing page`);
}
for (const s of takenDown) {
  const r = await fetch(`${SITE}/v/${s}/video.mp4`, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(30000) }).catch(() => null);
  if (!r) unread.push(s); else if (r.status !== 404) bad.push(`${s}: taken down but answers ${r.status}`);
}
// rga_video_expiry_plan_v1 (approved 11-8): videos never expire, nothing deletes outreach pages on a schedule, and a taken-down video shows the
// walkthrough-expired page (still a 404) instead of "Page Not Found"
if (fs.existsSync(`${WEB}/.github/workflows/prune-expired-videos.yml`)) bad.push("the monthly job that deletes expired outreach pages is back");
const tdRules = [...TOML.matchAll(/from = "\/v\/[a-z0-9-]+(?:\/\*)?"\s*\n\s*to = "([^"]+)"/g)].map((m) => m[1]);
if (!tdRules.length || tdRules.some((to) => to !== "/walkthrough-expired/index.html")) bad.push("a takedown rule doesn't show the walkthrough-expired page");
const tpl = fs.existsSync(`${WEB}/../Rocket Growth Agency Scraper VS Code/build-video-landing.mjs`) ? fs.readFileSync(`${WEB}/../Rocket Growth Agency Scraper VS Code/build-video-landing.mjs`, "utf8") : "";
if (tpl && !/const expiryDate = '';/.test(tpl)) bad.push("the page builder sets an expiry date again");
for (const x of LIST) { const h = fs.existsSync(`${WEB}/v/${x.slug}/index.html`) ? fs.readFileSync(`${WEB}/v/${x.slug}/index.html`, "utf8") : ""; if (/var exp = "\d/.test(h)) bad.push(`${x.slug}: the page has an expiry date`); }
if (takenDown.length) {
  const exp = await fetch(`${SITE}/v/${takenDown[0]}/`, { signal: AbortSignal.timeout(30000) }).catch(() => null);
  const body = exp ? await exp.text() : "";
  if (!exp) unread.push(`${takenDown[0]} (expired page)`);
  else if (exp.status !== 404 || !body.includes("This walkthrough has expired.") || !body.includes('href="/free-growth-audit/">Get my free audit')) bad.push(`${takenDown[0]}: a taken-down video doesn't show the walkthrough-expired page (${exp.status})`);
}
if (unread.length > LIST.length / 10) { console.error(`⚠️  INDETERMINATE — ${unread.length} addresses didn't answer`); process.exit(2); }
if (bad.length || unread.length) { console.error(`❌ ${bad.length + unread.length} outreach video(s) don't play from storage:`); for (const b of [...bad, ...unread.map((s) => `${s}: didn't answer`)].slice(0, 20)) console.error(`  · ${b}`); process.exit(1); }
console.log(`✅ all ${ok} outreach videos play from file storage at their own address, each at its full size under our own address; every page's player streams from storage (no download, no right-click); ${pagesOk} live pages sampled agree; all ${takenDown.length} taken-down videos stay blocked and show the walkthrough-expired page; no page expires and nothing deletes pages on a schedule`);
