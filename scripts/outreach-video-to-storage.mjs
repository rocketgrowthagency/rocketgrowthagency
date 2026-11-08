#!/usr/bin/env node
/**
 * outreach-video-to-storage.mjs — A NEW OR REBUILT OUTREACH VIDEO GOES TO FILE STORAGE AND IS READ BACK (approved rga_videos_to_storage_v1,
 * the owner 11-8: "must setup for new videos too right?"). The site forwards /v/<slug>/video.mp4 to the public outreach-videos bucket, so a
 * video is live only once it's stored there. Each one: saved (a rebuilt video replaces the old one at the same address), then read back from
 * where viewers get it: same size, video/mp4, the same fingerprint, and a skip-ahead request answered with exactly those bytes.
 *
 *   node scripts/outreach-video-to-storage.mjs <slug> [<slug> …]
 *
 * Exit 0 = every one stored and read back identical · 1 = one or more weren't (named) · 2 = couldn't run (no key, no file).
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const req = createRequire(import.meta.url);
req("dotenv").config({ quiet: true, path: fileURLToPath(new URL("../.env", import.meta.url)) });
const WEB = process.env.RGA_WEBSITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const U = process.env.SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY;
const slugs = process.argv.slice(2).filter((s) => /^[a-z0-9-]+$/.test(s));
if (!U || !K) { console.error("⚠️  couldn't run: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set"); process.exit(2); }
if (!slugs.length) { console.error("⚠️  couldn't run: no video named (slugs are letters, numbers and dashes)"); process.exit(2); }

const H = { apikey: K, Authorization: `Bearer ${K}` };
const md5 = (b) => crypto.createHash("md5").update(b).digest("hex");
async function storeOne(slug) {
  const file = `${WEB}/v/${slug}/video.mp4`;
  if (!fs.existsSync(file)) return `no video file at v/${slug}/video.mp4`;
  const buf = fs.readFileSync(file), sum = md5(buf);
  const up = await fetch(`${U}/storage/v1/object/outreach-videos/${slug}/video.mp4`, { method: "POST", headers: { ...H, "Content-Type": "video/mp4", "x-upsert": "true", "cache-control": "no-cache" }, body: buf, signal: AbortSignal.timeout(180000) });
  if (!up.ok) return `storage refused it (${up.status} ${(await up.text()).slice(0, 80)})`;
  const pub = `${U}/storage/v1/object/public/outreach-videos/${slug}/video.mp4?check=${sum.slice(0, 12)}`;
  const back = await fetch(pub, { method: "HEAD", signal: AbortSignal.timeout(30000) });
  const len = Number(back.headers.get("content-length")), ct = back.headers.get("content-type") || "", etag = String(back.headers.get("etag") || "").replace(/^W\//, "").replace(/"/g, "");
  if (back.status !== 200 || len !== buf.length || !/^video\/mp4/i.test(ct)) return `storage reads back ${back.status}, ${len} bytes, ${ct || "no type"}`;
  if (etag !== sum) { const full = Buffer.from(await (await fetch(pub)).arrayBuffer()); if (md5(full) !== sum) return "the stored file isn't this video"; }
  const at = Math.max(0, Math.min(buf.length - 100, 1000000));
  const rg = await fetch(pub, { headers: { Range: `bytes=${at}-${at + 99}` }, signal: AbortSignal.timeout(30000) });
  const rb = Buffer.from(await rg.arrayBuffer());
  if (rg.status !== 206 || !rb.equals(buf.subarray(at, at + 100))) return `skipping ahead doesn't work (${rg.status})`;
  return null;
}

let bad = 0;
for (const s of slugs) {
  const why = await storeOne(s).catch((e) => `failed: ${String(e.message).slice(0, 120)}`);
  if (why) { bad++; console.log(`  ✗ ${s}: ${why}`); } else console.log(`  ✓ ${s}: in storage, read back identical, skips ahead`);
}
console.log(bad ? `🚨 ${bad} of ${slugs.length} video(s) not in storage — their leads must not get a link` : `✅ ${slugs.length} video(s) in storage, each read back identical`);
process.exit(bad ? 1 : 0);
