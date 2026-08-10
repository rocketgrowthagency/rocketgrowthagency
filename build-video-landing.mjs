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
const AUDIT_ROOT = path.join(__dirname, "output", "Step 2.5 (Audit)");
const STEP6_ROOT = path.join(__dirname, "output", "Step 6 (Voiceover MP3)");
const STEP2_DIR = path.join(__dirname, "output", "Step 2");

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

// POST-RENDER VISUAL GATE (2026-07-20). Looks at the FINAL rendered pixels — the one thing no other gate
// did — and rejects quarter-scale/blank-region renders AND wrong-window desktop bleeds (the complete-auto
// IDE/Liberty-Tribune leak). A failing video must NEVER get a landing page or a Video URL. No bypass: the
// entire 07-18 incident was a bypassed rule. See scripts/check-video-visual.mjs + feedback_video_capture_screen_must_be_clear.
function runVisualGate(mp4Path) {
  return new Promise((resolve) => {
    const child = spawn("node", [path.join(__dirname, "scripts", "check-video-visual.mjs"), mp4Path, "--json"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (d) => { out += String(d); });
    child.stderr.on("data", (d) => { err += String(d); });
    child.on("error", (e) => resolve({ pass: false, reason: "gate spawn error: " + e.message }));
    child.on("exit", (code) => {
      let reason = "";
      try { reason = (JSON.parse(out).reasons || []).join(" | "); } catch { reason = (err || out).slice(0, 200); }
      // exit 0 = pass; 2 = visual defect; 1 = analysis error → fail loud (never deploy an unverifiable video).
      resolve({ pass: code === 0, reason: reason || `gate exit ${code}` });
    });
  });
}

// ACCEPTANCE GATE (2026-08-10). The deterministic, fail-CLOSED judgement of the FINISHED video:
// rank overlay on screen + detail card actually open + hero band is a real photo (not a white void)
// + map at city zoom. Local Apple-Vision OCR + ffmpeg pixel stats — no API, no fail-open path.
// Built after three distinct broken videos shipped from the 08-09 run (blank hero / no card / zoom).
// See scripts/check-video-acceptance.mjs + project_video_pipeline_rework.md.
function runAcceptanceGate(mp4Path, { business, rank } = {}) {
  return new Promise((resolve) => {
    const args = [path.join(__dirname, "scripts", "check-video-acceptance.mjs"), mp4Path, "--json"];
    if (business) args.push("--business", business);
    if (Number.isFinite(rank)) args.push("--rank", String(rank));
    const child = spawn("node", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (d) => { out += String(d); });
    child.stderr.on("data", (d) => { err += String(d); });
    child.on("error", (e) => resolve({ pass: false, reason: "acceptance spawn error: " + e.message }));
    child.on("exit", (code) => {
      let reason = "";
      try { reason = (JSON.parse(out).reasons || []).join(" | "); } catch { reason = (err || out).slice(0, 200); }
      // exit 0 = accept; 2 = a proven defect; 1 = could not analyse → reject (fail-closed by design).
      resolve({ pass: code === 0, reason: reason || `acceptance exit ${code}` });
    });
  });
}

// Parse the business slug out of "01_pacific-plumbing-team.mp4".
// NOTE: the numeric prefix is the batch sequence order, NOT the Maps rank.
function parseFilename(name) {
  const stripped = name.replace(/\.mp4$/i, "");
  const m = stripped.match(/^(\d+)_(.+)$/);
  return m ? { slug: m[2] } : { slug: stripped };
}

// Build a slug→rank map from all Step 2 CSVs so we have the real Map Rank
// when Airtable is skipped or the lead isn't in Airtable yet.
// Uses csv-parser to handle quoted fields with embedded newlines.
import csvParser from "csv-parser";

// Airtable fetch timeout (2026-07-27) — un-guarded fetch() to Airtable can stall open on a dead socket
// and hang node forever → holds the pipeline's stdout pipe → wedges the run. Give ONLY Airtable calls a
// hard timeout; other fetches untouched. Watchdog backstops this; the timeout makes a stalled call fail
// fast (retry-able) instead of hanging.
{
  const _rgaFetch = globalThis.fetch;
  const _atMs = Number(process.env.AIRTABLE_FETCH_TIMEOUT_MS || 30000);
  globalThis.fetch = (u, o = {}) =>
    (String(u).includes("api.airtable.com") && !o.signal)
      ? _rgaFetch(u, { ...o, signal: AbortSignal.timeout(_atMs) })
      : _rgaFetch(u, o);
}
async function loadStep2Data() {
  const rankMap = {};
  const nameMap = {}; // slug → original scraped Business Name (preserves BRGD, KNR, etc.)
  const searchTermMap = {}; // slug → search term (so landing page can show "Audit performed for the search: X")
  if (!fs.existsSync(STEP2_DIR)) return { rankMap, nameMap, searchTermMap };
  // Read CSVs newest-first by mtime, and use FIRST-WRITE-WINS so the freshest
  // scrape's rank for each business is canonical. Without this, older CSVs with
  // the same business at a different rank (different city/search term) silently
  // overwrite today's data and ship to the landing page title.
  // Caught 2026-05-21: Enviro Plumbing shipped as #21 (April Culver City) when
  // today's Santa Monica scrape had rank 3 — `enviro-plumbing-single-[step-2].csv`
  // sorted last alphabetically and won, even though it was older.
  const csvFiles = fs.readdirSync(STEP2_DIR)
    .filter(f => f.endsWith('.csv'))
    .map(f => ({ file: f, mtime: fs.statSync(path.join(STEP2_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .map(o => o.file);
  for (const file of csvFiles) {
    await new Promise((resolve) => {
      fs.createReadStream(path.join(STEP2_DIR, file))
        .pipe(csvParser())
        .on('data', (row) => {
          const name = row['Business Name'] || row['name'] || '';
          const rank = parseInt(row['Map Rank'] || row['rank'] || '', 10);
          const sterm = row['Search Term'] || row['searchTerm'] || '';
          if (name) {
            const s = slugify(name, { lower: true, strict: true });
            if (s) {
              if (!(s in nameMap)) nameMap[s] = name;
              if (Number.isFinite(rank) && !(s in rankMap)) rankMap[s] = rank;
              if (sterm && !(s in searchTermMap)) searchTermMap[s] = sterm;
            }
          }
        })
        .on('end', resolve)
        .on('error', resolve);
    });
  }
  return { rankMap, nameMap, searchTermMap };
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
      const fp = path.join(fullRun, f);
      results.push({ runDir, file: f, fullPath: fp, mtimeMs: fs.statSync(fp).mtimeMs });
    }
  }
  // 2026-06-02: DEDUPE by lead slug, keep NEWEST mp4 per slug. Caught when
  // Beverly Hills Roofing Contractors landing served a May-19 SM-search
  // version (orphan dir `beverly-hills-roofing-contractors-single-[step-2]`)
  // instead of today's fresh BH-search version. Multiple orphan dirs across
  // history can produce identically-named MP4s; whichever the readdir
  // returned first was winning the slot non-deterministically. Now: group
  // by file name (which contains the lead slug), keep highest mtimeMs.
  const bySlug = new Map();
  for (const r of results) {
    const existing = bySlug.get(r.file);
    if (!existing || r.mtimeMs > existing.mtimeMs) bySlug.set(r.file, r);
  }
  return Array.from(bySlug.values());
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

// Derive Audit Summary directly from the voiceover manifest so Airtable matches the video exactly.
// Captures ALL three sections (Maps + Website + Mobile) and formats them with section labels so
// downstream consumers (FGA form transfer, follow-up emails, sales notes) can see exactly which
// issues the prospect heard, grouped by surface.
function loadAuditSummaryFromManifest(slug) {
  if (!fs.existsSync(STEP6_ROOT)) return null;
  const runs = fs.readdirSync(STEP6_ROOT).sort().reverse();
  for (const run of runs) {
    const runPath = path.join(STEP6_ROOT, run);
    if (!fs.statSync(runPath).isDirectory()) continue;
    const segDirs = fs.readdirSync(runPath).filter((d) => d.endsWith("_segments"));
    for (const segDir of segDirs) {
      const manifestPath = path.join(runPath, segDir, "manifest.json");
      if (!fs.existsSync(manifestPath)) continue;
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        if (manifest.slug !== slug) continue;
        const sections = [];
        for (const sectionKey of ["maps", "website", "mobile"]) {
          const text = manifest.segments?.[sectionKey]?.text || "";
          if (!text) continue;
          // Each finding starts with First:/Second:/Third: and extends until the
          // next label OR end of segment. Lookahead-based capture so periods inside
          // findings (e.g. "3.4 seconds", "sswhitegaragedoors.com") aren't treated
          // as terminators.
          const matches = [...text.matchAll(/(?:First|Second|Third):\s*([\s\S]+?)(?=\b(?:First|Second|Third):|$)/gi)];
          const findings = matches.map((m) => m[1].trim().replace(/\s+/g, " ").replace(/\.+$/, "")).filter(Boolean);
          if (findings.length) {
            const label = sectionKey === "maps" ? "MAPS" : sectionKey === "website" ? "WEBSITE" : "MOBILE";
            sections.push(`${label}: ${findings.join(" | ")}`);
          }
        }
        return sections.length ? sections.join("\n\n") : null;
      } catch {}
    }
  }
  return null;
}

function loadAuditSummary(slug) {
  if (!fs.existsSync(AUDIT_ROOT)) return null;
  const dirs = fs.readdirSync(AUDIT_ROOT).sort().reverse(); // newest first
  for (const dir of dirs) {
    const p = path.join(AUDIT_ROOT, dir, "audit-findings.json");
    if (!fs.existsSync(p)) continue;
    try {
      const all = JSON.parse(fs.readFileSync(p, "utf-8"));
      const entry = all[slug];
      if (!entry) continue;
      // Flatten all sections into labelled finding strings
      const lines = [];
      const LABELS = {
        isHttps: "No SSL",
        hasViewportMeta: "Not mobile-friendly",
        hasLocalBusinessSchema: "Missing schema markup",
        hasMetaDescription: "No meta description",
        h1IncludesCity: "H1 missing city name",
        h1IncludesCategory: "H1 missing service category",
        websitePhoneMatchesGbp: "Phone mismatch (site vs GBP)",
        clickToCallAboveFold: "No click-to-call above fold",
        gbpHasPosts: "No GBP posts", gbpPhotoCountAdequate: "Low GBP photo count",
        gbpHasDescription: "Missing GBP description", gbpHasServices: "No GBP services listed",
        gbpFullyVerified: "GBP not fully verified",
      };
      const flat = { ...(entry.website || {}), ...(entry.mobile || {}), ...(entry.gbp || {}) };
      for (const [k, v] of Object.entries(flat)) {
        if (v === false && LABELS[k]) lines.push(LABELS[k]);
      }
      return lines.length ? lines.join(" · ") : "No issues flagged";
    } catch {}
  }
  return null;
}

async function updateLeadVideoUrl(recordId, videoUrl, videoFile, slug) {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) return false;
  const body = { fields: { "Video URL": videoUrl } };
  if (videoFile) body.fields["Video File"] = videoFile;
  if (slug) body.fields["Vid Slug"] = slug;
  const auditSummary = loadAuditSummaryFromManifest(slug) || loadAuditSummary(slug);
  if (auditSummary) body.fields["Audit Summary"] = auditSummary;
  const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE)}/${recordId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.warn(`[build-landing] Airtable update failed (${res.status}) for record ${recordId}: ${errText.slice(0, 200)}`);
  }
  return res.ok;
}

// A gate-rejected render must AUTO-REDO, not just leave a gap (Chris 2026-08-10: "any fail = auto-redo").
// This arms the existing self-heal state machine directly, because no Video URL was ever written and
// redo-flagged-videos.mjs only ARMs leads that HAVE one:
//   • Redo Video = true      → the lead is tracked as a redo and FINALIZEs once it re-renders
//   • Suppressed = true      → it cannot be emailed while it has no good video
//   • Skip Reasons contains "redo-armed" → next-search.mjs re-picks this lead's Search Term even though
//     the lead exists (scrapedSet excludes armed redos — feedback_redo_heal_requires_repickable_search)
//   • the Search Term is dropped from output/attempted-searches.log so the search itself is re-run
// The next overnight run then rebuilds this lead; when a passing video is published, redo-flagged-videos
// FINALIZEs it (un-suppress, clear the flag) and it becomes sendable. No manual step anywhere.
const ATTEMPTED_LEDGER = path.join(__dirname, "output", "attempted-searches.log");
function unLedgerSearch(term) {
  if (!term) return;
  const norm = (s) => String(s).toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ").trim();
  try {
    if (!fs.existsSync(ATTEMPTED_LEDGER)) return;
    const keep = fs.readFileSync(ATTEMPTED_LEDGER, "utf8").split("\n").filter((l) => l.trim() && norm(l) !== norm(term));
    fs.writeFileSync(ATTEMPTED_LEDGER, keep.join("\n") + "\n");
  } catch { /* best-effort — the Airtable flag is the load-bearing part */ }
}
// A lead that fails the gate on every rebuild would otherwise re-arm forever and eat a slot of the
// nightly capacity each time. After MAX_GATE_REDOS attempts it is parked as 'build-failed' (the same
// state the pipeline's idempotency guard already skips) so a human can look at it.
const MAX_GATE_REDOS = 3;
async function armRedoAfterGateFail(record, gateName, reason) {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) return false;
  const prior = parseInt((record?.fields?.["Skip Reasons"] || "").match(/attempt (\d+)/)?.[1], 10);
  const attempt = (Number.isFinite(prior) ? prior : 0) + 1;
  const giveUp = attempt >= MAX_GATE_REDOS;
  const fields = giveUp
    ? { "Redo Video": false, "Suppressed": true, "Email Status": "build-failed",
        "Skip Reasons": `gate-permafail after ${attempt} attempts: ${gateName} ${String(reason).slice(0, 140)}` }
    : { "Redo Video": true, "Suppressed": true,
        "Skip Reasons": `redo-armed (attempt ${attempt}): ${gateName} ${String(reason).slice(0, 140)}` };
  if (!giveUp) unLedgerSearch(record?.fields?.["Search Term"]);
  const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE)}/${record.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields })
  });
  if (!res.ok) console.warn(`[build-landing] auto-redo arm failed (${res.status}) for ${record.id}`);
  else console.log(`[build-landing] ${giveUp ? `⛔ gate-permafail (attempt ${attempt}) — parked as build-failed` : `↻ auto-redo armed (attempt ${attempt}) — rebuilds on the next run`}`);
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

  let mp4s = await findMp4s();
  if (!mp4s.length) {
    console.log("[build-landing] no MP4s found in", STEP7_DIR);
    return;
  }

  // Tier 1 #1 (2026-05-26): per-lead scoping. When BUILD_ONLY_SLUG is set,
  // iterate only that one slug's manifest instead of rebuilding all 130+
  // landing pages every loop iteration. Wired into overnight-pipeline.sh
  // so each per-lead step-7 call rebuilds just the current lead. Cuts
  // ~25 min per 48-lead run. Empty/unset = legacy behavior (build all).
  const ONLY_SLUG = (process.env.BUILD_ONLY_SLUG || "").trim();
  // 🔴 ROOT-CAUSE GUARD (2026-07-11 — locked). The per-lead pipeline calls this once per lead. If a
  // lead's step-7 made no MP4, BUILD_ONLY_SLUG arrives EMPTY — and the old code then fell through to
  // rebuilding ALL ~500 landing pages (+~450 Airtable writes), which takes ~8min and trips the 8-min
  // per-lead watchdog, SIGKILLing an otherwise-good lead MID-REBUILD. It got worse every night as the
  // library grew (O(N) per lead → O(N²) per run) and wiped whole searches. The per-lead pipeline sets
  // REQUIRE_SLUG=1 so an empty/zero-match slug EXITS FAST building nothing — a corpus rebuild can only
  // happen on a DELIBERATE full call (REQUIRE_SLUG unset). See feedback_landing_build_must_be_scoped.md.
  const REQUIRE_SLUG = process.env.REQUIRE_SLUG === "1";
  if (REQUIRE_SLUG && !ONLY_SLUG) {
    console.log("[build-landing] REQUIRE_SLUG=1 but BUILD_ONLY_SLUG is empty — building NOTHING (per-lead safety; refusing full-corpus rebuild). Nothing to publish for this lead.");
    return;
  }
  if (ONLY_SLUG) {
    const before = mp4s.length;
    mp4s = mp4s.filter((v) => parseFilename(v.file).slug === ONLY_SLUG);
    console.log(`[build-landing] BUILD_ONLY_SLUG=${ONLY_SLUG} filtered ${before} → ${mp4s.length} manifests`);
    if (!mp4s.length) {
      console.log(`[build-landing] no MP4 matched slug "${ONLY_SLUG}" — exiting clean`);
      return;
    }
  }

  console.log(`[build-landing] found ${mp4s.length} videos to process`);

  ensureDir(LANDING_OUT_DIR);

  const { rankMap: step2Ranks, nameMap: step2Names, searchTermMap: step2SearchTerms } = await loadStep2Data();

  let built = 0;
  let airtableWrites = 0;
  for (const v of mp4s) {
    const { slug: fileSlug } = parseFilename(v.file);
    // Fallback priority: Airtable → step-2 CSV name (preserves BRGD/KNR casing) → slug-derived title-case
    let businessName = step2Names[fileSlug]
      || fileSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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

    // ── THE TWO PIXEL GATES — both run BEFORE anything is written, so a broken video can never get a
    // landing page, a Video URL, or an email. Any failure auto-arms a redo. No bypass on either.
    //
    // 1) ACCEPTANCE GATE (deterministic, fail-CLOSED): is the video actually the thing we promised —
    //    card open, real hero photo, rank overlay, city zoom? Runs first: it's local, free and precise.
    const expectedRank = (() => {
      const csv = parseInt(step2Ranks[slug] ?? step2Ranks[fileSlug], 10);
      if (Number.isFinite(csv)) return csv;
      const at = parseInt(airtableRecord?.fields?.["Map Rank"], 10);
      return Number.isFinite(at) ? at : null;
    })();
    const accept = await runAcceptanceGate(v.fullPath, { business: businessName, rank: expectedRank });
    if (!accept.pass) {
      console.error(`[build-landing] 🚫 ACCEPTANCE GATE FAILED — NOT publishing ${slug}: ${accept.reason}`);
      if (!NO_AIRTABLE && airtableRecord?.id) {
        try { await armRedoAfterGateFail(airtableRecord, "acceptance-gate:", accept.reason); } catch (e) { console.warn(`[build-landing] auto-redo failed: ${e.message}`); }
      }
      continue;
    }
    // 2) POST-RENDER VISUAL GATE — reject quarter-scale / wrong-window (desktop-leak) renders BEFORE they get a
    // page or a Video URL, so a bad video can never reach a prospect. No bypass. (2026-07-20 incident.)
    const gate = await runVisualGate(v.fullPath);
    if (!gate.pass) {
      console.error(`[build-landing] 🚫 VISUAL GATE FAILED — NOT publishing ${slug}: ${gate.reason}`);
      if (!NO_AIRTABLE && airtableRecord?.id) {
        try { await armRedoAfterGateFail(airtableRecord, "visual-gate:", gate.reason); } catch (e) { console.warn(`[build-landing] auto-redo failed: ${e.message}`); }
      }
      continue;
    }

    ensureDir(outDir);
    fs.copyFileSync(v.fullPath, videoDest);
    // Cache version derived from the freshly-copied video's mtime — every re-render
    // produces a new value, busting browser caches automatically without manual ?v=N.
    const cacheVersion = String(fs.statSync(videoDest).mtimeMs | 0);
    try {
      await extractThumbnail(v.fullPath, thumbPath);
    } catch (err) {
      console.warn(`[build-landing] thumbnail failed for ${slug}: ${err.message}`);
    }
    // Variant-aware copy. Prefer Airtable's Video Variant field; fall back
    // to CSV rank, then nothing. Never use the filename prefix as rank (it's batch sequence).
    // CSV rank is authoritative for THIS scrape session — Airtable may hold a stale
    // Map Rank from a prior scrape of the same business (different city/search term),
    // and step-8-publish runs AFTER build-video-landing in the orchestrator. The
    // in-video overlay uses CSV rank, so the title must match. (Locked 2026-05-21
    // after SM Drain Co./Monkey Wrench/Enviro all shipped with title #34/#9/#21
    // while overlay correctly showed #1/#2/#3.)
    const airtableVariant = airtableRecord?.fields?.["Video Variant"];
    const airtableRank = parseInt(airtableRecord?.fields?.["Map Rank"], 10);
    const csvRank = step2Ranks[slug] || step2Ranks[fileSlug] || null;
    const effectiveRank = Number.isFinite(csvRank) ? csvRank : (Number.isFinite(airtableRank) ? airtableRank : null);
    const isTop3 = airtableVariant
      ? airtableVariant === 'top-3'
      : (Number.isFinite(effectiveRank) && effectiveRank >= 1 && effectiveRank <= 3);

    // 2026-05-27 FIX: use today's date (when the video is being rendered)
    // instead of Airtable's "Date Scraped" field. The Airtable field reflects
    // the FIRST scrape (when the lead was added) and goes stale on every re-
    // render. The video's audit data (website, mobile, GBP findings) is
    // always FRESH from the most recent step-2.5 + step-3 run, so the
    // displayed date should match that, not the original scrape date.
    // Chris caught this 2026-05-27 — Fenn + New Systems both said "May 26"
    // when the re-render happened on May 27.
    const recordedDateObj = new Date();
    const recordedDate = recordedDateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    // 2026-06-29: EXPIRY DISABLED. The 30-day client-side expiry (based on page BUILD date) sent
    // PROSPECTS to a dead "This walkthrough has expired" page: the outreach sequence runs to Day 45
    // and backlog/follow-up sends land weeks after the page was built, so pages expired BEFORE or
    // DURING the campaign (138 of 371 live pages were expired when the Monday send fired). A dead
    // link to a prospect is far worse than a slightly-old video. Emit empty EXPIRY_DATE → the page's
    // `if (exp && ...)` gate is skipped → never expires. Revisit later with a soft "recorded on X"
    // note instead of killing the video.
    const expiryDate = '';

    // Build the body intro from the locked Option B template:
    // "This video was created for {Business} on {Date}, based on the search '{Term}'.
    //  It covers your business across Google Maps, your website, and mobile — {variant tail}."
    // Search term: prefer Airtable; fall back to step-2 CSV (so the landing
    // page footer shows the real search even when Airtable lookup misses).
    // The footer template renders `Audit performed for the search: "{SEARCH_TERM}"`
    // — without this fallback it shows empty quotes ("") and there's nothing
    // on the page validating the ranking claim. Caught 2026-05-28 on Target
    // Plumbers landing.
    const searchTerm = airtableRecord?.fields?.["Search Term"] || step2SearchTerms?.[slug] || '';
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

    // Same priority as effectiveRank above — CSV wins, Airtable is the fallback.
    const resolvedRank = Number.isFinite(csvRank) ? csvRank : (Number.isFinite(airtableRank) ? airtableRank : null);
    const eyebrowLabel = resolvedRank !== null
      ? (resolvedRank >= 1 && resolvedRank <= 3)
        ? `Currently ranking #${resolvedRank} · Top 3 spot`
        : `Currently ranking #${resolvedRank} · Outside the top 3`
      : '';

    // 2026-05-29: ranking-source validation line. Without this the page just
    // says "RANKING #N" with no evidence — prospects have to trust the
    // number. With the validation line they can re-run the same search
    // themselves and see for themselves. Format:
    //   "Ranking measured from Google Maps top-10 results for this search,
    //    recorded May 28, 2026."
    // Falls back to a generic line if rank wasn't resolved.
    const rankValidationLine = resolvedRank !== null && searchTerm
      ? `Ranking measured from Google Maps top-10 results for this search, recorded ${recordedDate}.`
      : (searchTerm
        ? `Ranking based on Google Maps results, recorded ${recordedDate}.`
        : `Recorded ${recordedDate}.`);

    fs.writeFileSync(htmlPath, renderTemplate(template, {
      BUSINESS_NAME: businessName,
      SLUG: slug,
      BODY_INTRO: bodyIntro,
      BODY_OUTCOME: bodyOutcome,
      RECORDED_DATE: recordedDate,
      EXPIRY_DATE: expiryDate,
      EYEBROW_LABEL: eyebrowLabel,
      SEARCH_TERM: searchTerm,
      RANK_VALIDATION_LINE: rankValidationLine,
      CACHE_VERSION: cacheVersion,
    }));
    console.log(`[build-landing] ✓ ${slug} → ${landingUrl}`);
    built += 1;

    if (!NO_AIRTABLE && airtableRecord?.id) {
      const ok = await updateLeadVideoUrl(airtableRecord.id, landingUrl, v.file, slug);
      if (ok) airtableWrites += 1;
    }
  }

  console.log(`\n[build-landing] done — ${built} landing pages generated, ${airtableWrites} Airtable rows updated.`);
  console.log(`[build-landing] Sync ${LANDING_OUT_DIR} into the RGA website repo's /v/ dir, then netlify deploy --prod.`);
}

main().catch((err) => { console.error("[build-landing] fatal:", err.message || err); process.exit(1); });
