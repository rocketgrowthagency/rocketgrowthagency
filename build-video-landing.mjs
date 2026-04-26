#!/usr/bin/env node
// Build Netlify landing pages + thumbnails for each final outreach video.
//
// For each MP4 under output/Step 7 (Final Merge MP4)/<run>/, this script:
//   1. Extracts a thumbnail at 3s with ffmpeg → thumb.jpg
//   2. Generates index.html from templates/video-landing.html (business name substituted)
//   3. Copies MP4 + thumbnail + index.html into output/landing-pages/v/<slug>/
//   4. Updates each matching Airtable Lead with Video URL (and Video File if not already set)
//
// After running, sync output/landing-pages/v/ into the RGA website repo's /v/ dir
// and deploy via `netlify deploy --prod`.
//
// Usage:
//   node build-video-landing.mjs                       # process all step-7 MP4s
//   node build-video-landing.mjs --dry-run             # show what would happen, no writes
//   node build-video-landing.mjs --no-airtable         # skip Airtable updates
//   node build-video-landing.mjs --base-url=https://...  # override landing URL base
//
// Env:
//   AIRTABLE_API_KEY, AIRTABLE_BASE_ID (for Airtable updates)
//   VIDEO_BASE_URL (defaults to https://www.rocketgrowthagency.com/v)

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import slugify from "slugify";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STEP7_DIR = path.join(__dirname, "output", "Step 7 (Final Merge MP4)");
const LANDING_OUT_DIR = path.join(__dirname, "output", "landing-pages", "v");
const TEMPLATE_PATH = path.join(__dirname, "templates", "video-landing.html");

const DRY = process.argv.includes("--dry-run");
const NO_AIRTABLE = process.argv.includes("--no-airtable");
const BASE_URL = (process.argv.find((a) => a.startsWith("--base-url="))?.slice(11)
  || process.env.VIDEO_BASE_URL
  || "https://www.rocketgrowthagency.com/v").replace(/\/$/, "");

const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID } = process.env;
const AIRTABLE_TABLE = process.env.AIRTABLE_TABLE_NAME || "Leads";

function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }
function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => { stderr += String(d); });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${cmd} exit ${code}: ${stderr.slice(0, 300)}`)));
  });
}

// Parse the business slug out of "01_pacific-plumbing-team.mp4"
function parseFilename(name) {
  const stripped = name.replace(/\.mp4$/i, "");
  const m = stripped.match(/^(\d+)_(.+)$/);
  return m ? { rank: Number(m[1]), slug: m[2] } : { rank: null, slug: stripped };
}

// Prefer a clean business-name slug; fall back to filename slug.
function finalSlug(businessName, fileSlug) {
  if (businessName) {
    const s = slugify(businessName, { lower: true, strict: true });
    if (s) return s;
  }
  return fileSlug;
}

async function findMp4s() {
  const results = [];
  if (!fs.existsSync(STEP7_DIR)) return results;
  const runs = fs.readdirSync(STEP7_DIR).filter((d) => fs.statSync(path.join(STEP7_DIR, d)).isDirectory());
  for (const runDir of runs) {
    const fullRun = path.join(STEP7_DIR, runDir);
    const files = fs.readdirSync(fullRun).filter((f) => f.toLowerCase().endsWith(".mp4"));
    for (const f of files) {
      results.push({ runDir, file: f, fullPath: path.join(fullRun, f) });
    }
  }
  return results;
}

async function extractThumbnail(mp4Path, outJpg) {
  // Take a frame at 3s + composite a centered grey play button (templates/play-button.png)
  // so the thumbnail visually reads as a clickable video player in email.
  const playOverlay = path.join(__dirname, "templates", "play-button.png");
  await run("ffmpeg", [
    "-y",
    "-ss", "3",
    "-i", mp4Path,
    "-i", playOverlay,
    "-filter_complex",
    "[0:v]scale=1280:-2[bg];[bg][1:v]overlay=(W-w)/2:(H-h)/2[final]",
    "-map", "[final]",
    "-frames:v", "1",
    "-q:v", "3",
    outJpg
  ]);
}

// Cache all leads once so we can slug-match instead of relying on exact name.
let _allLeadsCache = null;
async function getAllLeads() {
  if (_allLeadsCache) return _allLeadsCache;
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) { _allLeadsCache = []; return _allLeadsCache; }
  const all = [];
  let offset = null;
  do {
    const u = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE)}`);
    u.searchParams.set("pageSize", "100");
    if (offset) u.searchParams.set("offset", offset);
    const res = await fetch(u, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
    if (!res.ok) break;
    const data = await res.json();
    all.push(...(data.records || []));
    offset = data.offset;
  } while (offset);
  _allLeadsCache = all;
  return all;
}

async function fetchLeadBySlug(targetSlug) {
  const all = await getAllLeads();
  const target = String(targetSlug).toLowerCase();
  for (const r of all) {
    const name = r.fields?.["Business Name"] || "";
    const s = slugify(name, { lower: true, strict: true });
    if (s === target) return r;
  }
  // Fallback: substring match (handles slight slug differences from & / apostrophes)
  for (const r of all) {
    const s = slugify(r.fields?.["Business Name"] || "", { lower: true, strict: true });
    if (s && (s.includes(target) || target.includes(s))) return r;
  }
  return null;
}

async function updateLeadVideoUrl(recordId, videoUrl, videoFile) {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) return false;
  const body = { fields: { "Video URL": videoUrl } };
  if (videoFile) body.fields["Video File"] = videoFile;
  const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE)}/${recordId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return res.ok;
}

function renderTemplate(tpl, vars) {
  return Object.entries(vars).reduce((out, [k, v]) => out.replaceAll(`{{${k}}}`, v), tpl);
}

async function main() {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    console.error("Template not found:", TEMPLATE_PATH);
    process.exit(1);
  }
  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");

  const mp4s = await findMp4s();
  if (!mp4s.length) {
    console.log("[build-landing] no MP4s found in", STEP7_DIR);
    return;
  }
  console.log(`[build-landing] found ${mp4s.length} videos to process`);

  ensureDir(LANDING_OUT_DIR);

  let built = 0;
  let airtableWrites = 0;
  for (const v of mp4s) {
    const { slug: fileSlug, rank } = parseFilename(v.file);
    let businessName = fileSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    let airtableRecord = null;
    if (!NO_AIRTABLE) {
      airtableRecord = await fetchLeadBySlug(fileSlug);
    }
    if (airtableRecord?.fields?.["Business Name"]) businessName = airtableRecord.fields["Business Name"];

    const slug = finalSlug(businessName, fileSlug);
    const outDir = path.join(LANDING_OUT_DIR, slug);
    const thumbPath = path.join(outDir, "thumb.jpg");
    const videoDest = path.join(outDir, "video.mp4");
    const htmlPath = path.join(outDir, "index.html");
    const landingUrl = `${BASE_URL}/${slug}/`;

    if (DRY) {
      console.log(`[DRY] ${slug}: ${v.file} → ${landingUrl}`);
      continue;
    }

    ensureDir(outDir);
    fs.copyFileSync(v.fullPath, videoDest);
    try {
      await extractThumbnail(v.fullPath, thumbPath);
    } catch (err) {
      console.warn(`[build-landing] thumbnail failed for ${slug}: ${err.message}`);
    }
    // Variant-aware copy. Prefer Airtable's Video Variant field; fall back
    // to deriving from Map Rank if the field isn't set yet.
    const airtableVariant = airtableRecord?.fields?.["Video Variant"];
    const airtableRank = parseInt(airtableRecord?.fields?.["Map Rank"], 10);
    const isTop3 = airtableVariant
      ? airtableVariant === 'top-3'
      : (Number.isFinite(airtableRank) && airtableRank >= 1 && airtableRank <= 3);

    // Recorded date — prefer Airtable's Date Scraped, fall back to today.
    const dateScraped = airtableRecord?.fields?.["Date Scraped"];
    const recordedDate = dateScraped
      ? new Date(dateScraped).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    // Build the body intro from the locked Option B template:
    // "This video was created for {Business} on {Date}, based on the search '{Term}'.
    //  It covers your business across Google Maps, your website, and mobile — {variant tail}."
    const searchTerm = airtableRecord?.fields?.["Search Term"] || '';
    const variantTail = isTop3
      ? `your top 3 ranking and the gaps a competitor could exploit`
      : `your current rank and the top issues holding you back from the top 3`;
    const searchClause = searchTerm
      ? `, based on the search "${searchTerm}"`
      : '';
    const bodyIntro = `This video was created for ${businessName} on ${recordedDate}${searchClause}. It covers your business across Google Maps, your website, and mobile — ${variantTail}.`;

    const bodyOutcome = isTop3
      ? `defend your top 3 spot and push for #1`
      : `move you into the top 3 and capture more leads`;

    fs.writeFileSync(htmlPath, renderTemplate(template, {
      BUSINESS_NAME: businessName,
      SLUG: slug,
      BODY_INTRO: bodyIntro,
      BODY_OUTCOME: bodyOutcome,
      RECORDED_DATE: recordedDate,
    }));
    console.log(`[build-landing] ✓ ${slug} → ${landingUrl}`);
    built += 1;

    if (!NO_AIRTABLE && airtableRecord?.id) {
      const ok = await updateLeadVideoUrl(airtableRecord.id, landingUrl, v.file);
      if (ok) airtableWrites += 1;
    }
  }

  console.log(`\n[build-landing] done — ${built} landing pages generated, ${airtableWrites} Airtable rows updated.`);
  console.log(`[build-landing] Sync ${LANDING_OUT_DIR} into the RGA website repo's /v/ dir, then netlify deploy --prod.`);
}

main().catch((err) => { console.error("[build-landing] fatal:", err.message || err); process.exit(1); });
