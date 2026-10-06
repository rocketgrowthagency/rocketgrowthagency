#!/usr/bin/env node
/**
 * check-hosting-bandwidth-headroom.mjs — the site must not run out of bandwidth without warning.
 *
 * ─── WHY (2026-09-14) ────────────────────────────────────────────────────────────────────────────
 * The **entire site went down**: homepage, pricing, admin, the client portal and all 1,139 outreach
 * videos returned `503 {"error":"usage_exceeded"}`. Netlify's free tier includes 100 GB of bandwidth
 * a month; the repo publishes **13 GB of video across 1,139 files**, and every outreach email sends
 * someone to one of them.
 *
 * 🔑 Nothing warned first. The outage was discovered by the DEPLOY's own verification step, which
 * happened to run minutes later — otherwise the first signal would have been a prospect clicking a
 * dead video link, or Chris opening the admin.
 *
 * 🔴 The real fault is architectural: **13 GB of video on a web host is a monthly outage waiting to
 * recur.** Video belongs on object storage with cheap egress (R2/Bunny), with the site serving pages
 * only. Until that migration happens, this check is the tripwire.
 *
 * ─── WHAT IT ASSERTS ─────────────────────────────────────────────────────────────────────────────
 *   1. The live site actually serves — a page AND a video, by CONTENT TYPE, not status alone.
 *   2. The published video payload is reported, so growth is visible before it becomes an outage.
 *   3. `usage_exceeded` is named explicitly, because a 503 has many causes and only this one means
 *      "you have run out of the allowance you are paying for".
 *
 * Exit 0 = serving · 1 = the site is down or out of allowance · 2 = could not tell.
 */
import fs from 'node:fs';
import path from 'node:path';

// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT — so this gate can be pointed at a scratch
// copy and its mutations actually run. A gate nobody can make fail is a gate nobody has
// checked. → feedback_a_gate_that_cannot_fail
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SITE_DIR = `${__SITE}`;
const ORIGIN = 'https://www.rocketgrowthagency.com';
// A page and a video: they fail differently. A page can serve while video egress is throttled.
const PROBES = [
  { url: '/', expect: 'text/html', label: 'homepage' },
  { url: '/v/1-800-got-junk-greater-los-angeles/video.mp4', expect: 'video/mp4', label: 'an outreach video' },
];
// Warn while there is still time to act, not once it is already dark.
const WARN_GB = 8;

function videoPayloadGB() {
  const root = path.join(SITE_DIR, 'v');
  let bytes = 0, files = 0;
  const walk = (d) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.mp4')) { try { bytes += fs.statSync(full).size; files++; } catch {} }
    }
  };
  walk(root);
  return { gb: bytes / 1e9, files };
}

const problems = [];
let checked = 0;

for (const p of PROBES) {
  let res;
  try {
    res = await fetch(`${ORIGIN}${p.url}?cb=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } });
  } catch (e) {
    console.error(`[bandwidth] INDETERMINATE — could not reach ${p.label}: ${String(e.message).slice(0, 80)}`);
    process.exit(2);
  }
  checked++;
  const ct = res.headers.get('content-type') || '';
  if (res.status === 503) {
    let why = '';
    try { why = (await res.json())?.error || ''; } catch {}
    problems.push(why === 'usage_exceeded'
      // 🔴 Name it exactly. "503" sends someone looking for a bug; "usage_exceeded" sends them to billing.
      ? `${p.label} is 503 usage_exceeded — the hosting allowance is spent. The site is DOWN for everyone, including the client portal and every outreach link.`
      : `${p.label} is 503 (${why || 'no reason given'}) — the site is down.`);
    continue;
  }
  if (!res.ok) { problems.push(`${p.label} returned HTTP ${res.status}`); continue; }
  // 🔑 A 200 proves nothing on its own — an error page is a 200 with the wrong content type.
  if (!ct.includes(p.expect)) {
    problems.push(`${p.label} returned 200 but content-type "${ct}" — expected ${p.expect}`);
  }
}

const { gb, files } = videoPayloadGB();
console.log(`[bandwidth] ${checked} probe(s) · published video: ${gb.toFixed(1)} GB across ${files} file(s)`);

if (gb >= WARN_GB && !problems.length) {
  console.log(`[bandwidth] ⚠️  ${gb.toFixed(1)} GB of video is served from the web host. Every view spends`);
  console.log('           bandwidth allowance. Moving /v/ to object storage removes this failure mode.');
}

if (problems.length) {
  console.error('\n✗ hosting is not serving:');
  for (const p of problems) console.error(`    ${p}`);
  console.error('\n  Restore service first, then move /v/ off the web host — 13 GB of video on a page');
  console.error('  host is a monthly outage waiting to recur.');
  process.exit(1);
}
console.log('✅ pages and videos are both serving with the right content type.');
process.exit(0);
