#!/usr/bin/env node
/**
 * outreach-pages-play-from-storage.mjs — AN OUTREACH PAGE'S PLAYER STREAMS STRAIGHT FROM FILE STORAGE (approved rga_video_address_v1 A, the
 * owner 11-8: "do all recommended"). The player's src becomes the video's storage address, so watching never goes through the website;
 * every address a person can open stays ours (the fallback link and /v/<slug>/video.mp4 itself are served through rocketgrowthagency.com).
 * The player gets no download button and no right-click menu, so the storage address isn't offered to anyone.
 * Only the <video> tag changes; the page is otherwise byte for byte the same. Running it twice changes nothing.
 *
 *   node scripts/outreach-pages-play-from-storage.mjs <slug> [<slug> …]     (or --all: every video in data/outreach-videos.json)
 *
 * Exit 0 = every named page plays from storage · 1 = a page couldn't be changed (named).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const WEB = process.env.RGA_WEBSITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
export const STORAGE = "https://jetgayimvfeslqnkbfdq.supabase.co/storage/v1/object/public/outreach-videos";

/** The page with its player reading from storage. → { html, changed } | { error } */
export function playFromStorage(html, slug) {
  const re = /<video\b([^>]*?)\ssrc="([^"]*)"([^>]*)>/;
  const m = re.exec(html);
  if (!m) return { error: "no video player on the page" };
  const src = m[2], want = `${STORAGE}/${slug}/video.mp4`;
  const v = (src.match(/\?v=([^"&]*)/) || [])[1];
  const newSrc = src.startsWith(want) ? src : /^video\.mp4(\?|$)/.test(src) ? `${want}${v !== undefined ? `?v=${v}` : ""}` : null;
  if (!newSrc) return { error: `the player reads ${src}, not its own video` };
  let attrs = `${m[1]} src="${newSrc}"${m[3]}`;
  if (!/\bcontrolsList=/.test(attrs)) attrs += ' controlsList="nodownload"';
  if (!/\boncontextmenu=/.test(attrs)) attrs += ' oncontextmenu="return false;"';
  const out = html.replace(re, `<video${attrs}>`);
  return { html: out, changed: out !== html };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const slugs = args.includes("--all") ? JSON.parse(fs.readFileSync(`${WEB}/data/outreach-videos.json`, "utf8")).videos.map((x) => x.slug) : args.filter((s) => /^[a-z0-9-]+$/.test(s));
  if (!slugs.length) { console.error("⚠️  name a page (its slug) or --all"); process.exit(1); }
  let changed = 0, same = 0; const bad = [];
  for (const s of slugs) {
    const p = `${WEB}/v/${s}/index.html`;
    if (!fs.existsSync(p)) { bad.push(`${s}: no page`); continue; }
    const r = playFromStorage(fs.readFileSync(p, "utf8"), s);
    if (r.error) { bad.push(`${s}: ${r.error}`); continue; }
    if (r.changed) { fs.writeFileSync(p, r.html); changed++; } else same++;
  }
  for (const b of bad) console.log(`  ✗ ${b}`);
  console.log(`${bad.length ? "🚨" : "✅"} ${changed} page(s) now play from storage · ${same} already did · ${bad.length} couldn't be changed`);
  process.exit(bad.length ? 1 : 0);
}
