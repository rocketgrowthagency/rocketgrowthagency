#!/usr/bin/env node
/**
 * check-landing-pages-serve-real.mjs — every outreach video must have a real landing page.
 *
 * ─── WHY (2026-08-31) ────────────────────────────────────────────────────────────────────────────
 * Three prospects were emailed a personalised video link and landed on the HOMEPAGE.
 *
 *   v/ez-plumbing · v/hay-cool-hvac · v/phase-electric
 *
 * Each had video.mp4 and thumb.jpg but NO index.html. Each had a real lead whose Video URL pointed
 * there, and all three had been emailed — one had reached `reengagement_opened`, so somebody
 * clicked.
 *
 * 🔴 The URL returned **HTTP 200**. The request fell through to the SPA fallback and served the
 * homepage: 101,916 bytes, title "Rocket Growth Agency", ZERO <video> tags — against a working
 * page's ~14,900 bytes, "Growth Audit for <business>", one <video>.
 *
 * > **A 200 proves the server answered, not that it answered with the right thing.** The content is
 * > the proof. ([[feedback-curl-status-is-useless-check-content-type]])
 *
 * This is the most expensive failure shape on the site: the whole point of the outreach is the
 * personalised video, and the prospect sees a generic homepage instead — while the CRM records the
 * click as engagement.
 *
 * ─── WHAT IT CHECKS ──────────────────────────────────────────────────────────────────────────────
 * Local, static, instant: every v/<slug>/ carrying a video.mp4 must also carry an index.html that
 * looks like a rendered landing page — a <video> tag and no unrendered {{PLACEHOLDERS}}.
 *
 * Deliberately does NOT hit the network: the local tree is what deploys, so catching it here stops
 * the page before it ships rather than after a prospect finds it.
 *
 * Usage:  node scripts/check-landing-pages-serve-real.mjs [--json]
 * Exit 0 = every video has a real page · 1 = a video would serve the fallback · 2 = could not tell.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRAPER = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const WEBSITE = path.join(path.dirname(SCRAPER), 'Rocket Growth Agency Website VS Code');
const JSON_OUT = process.argv.includes('--json');

const V = path.join(WEBSITE, 'v');
if (!fs.existsSync(V)) { console.error('✗ v/ not found — refusing to judge.'); process.exit(2); }

let dirs;
try { dirs = fs.readdirSync(V, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); }
catch (e) { console.error(`✗ could not read v/: ${String(e.message).slice(0, 80)}`); process.exit(2); }
if (!dirs.length) { console.error('✗ v/ is empty — refusing to report healthy over nothing.'); process.exit(2); }

// Slugs deliberately 404'd in netlify.toml (client asked for removal, wrong business filmed, etc).
// They still have a local index.html, so the check below passes them — but reporting "every video
// has a live page" would be false. Counted and named separately so the number is honest.
let takedowns = new Set();
try {
  const toml = fs.readFileSync(path.join(WEBSITE, 'netlify.toml'), 'utf8');
  takedowns = new Set([...toml.matchAll(/from\s*=\s*"\/v\/([a-z0-9-]+)(?:\/\*)?"/g)].map((m) => m[1]));
} catch {}

const broken = [];
let withVideo = 0, tookDown = 0;
for (const slug of dirs) {
  const d = path.join(V, slug);
  if (!fs.existsSync(path.join(d, 'video.mp4'))) continue;   // no video = nothing promised
  withVideo++;
  if (takedowns.has(slug)) { tookDown++; continue; }         // deliberately 404'd — not a failure
  const idx = path.join(d, 'index.html');
  if (!fs.existsSync(idx)) { broken.push({ slug, why: 'no index.html — the URL serves the homepage fallback' }); continue; }
  let html;
  try { html = fs.readFileSync(idx, 'utf8'); } catch { broken.push({ slug, why: 'index.html unreadable' }); continue; }
  if (!/<video[\s>]/i.test(html)) { broken.push({ slug, why: 'index.html has no <video> tag' }); continue; }
  const ph = html.match(/\{\{[A-Z_]+\}\}/g);
  if (ph) broken.push({ slug, why: `unrendered placeholders: ${[...new Set(ph)].slice(0, 3).join(' ')}` });
}

if (JSON_OUT) {
  console.log(JSON.stringify({ dirs: dirs.length, withVideo, broken }, null, 2));
  process.exit(broken.length ? 1 : 0);
}

console.log(`\n===== OUTREACH LANDING PAGES =====`);
console.log(`  v/ directories     ${dirs.length}`);
console.log(`  carrying a video   ${withVideo}`);
console.log(`  taken down (404'd) ${tookDown}  — deliberate, excluded below`);
console.log(`  expected live      ${withVideo - tookDown}`);

if (!broken.length) { console.log(`\n✅ all ${withVideo - tookDown} live videos have a real, rendered landing page.`); process.exit(0); }

console.error(`\n✗ ${broken.length} video(s) whose page would NOT render:`);
for (const b of broken.slice(0, 15)) console.error(`     v/${b.slug}  —  ${b.why}`);
if (broken.length > 15) console.error(`     … and ${broken.length - 15} more`);
console.error(`\n   These URLs return HTTP 200 and serve the HOMEPAGE. A prospect who was emailed this`);
console.error(`   link sees a generic page and the CRM logs it as engagement.`);
console.error(`\n   FIX: REQUIRE_SLUG=1 BUILD_ONLY_SLUG=<slug> node build-video-landing.mjs`);
console.error(`   (rebuilds from the Step 7 MP4, so the page matches the other 1,136)`);
process.exit(1);
