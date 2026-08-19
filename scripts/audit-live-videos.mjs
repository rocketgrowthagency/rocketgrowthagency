#!/usr/bin/env node
/**
 * audit-live-videos.mjs — does every SENDABLE lead actually serve a video? (2026-08-18)
 *
 * WHY THIS EXISTS
 * On 2026-08-18 a content-type audit found 26 leads with `Video URL` set, not suppressed, and ALREADY
 * EMAILED — whose video did not exist. Prospects had been sent links to nothing between 2026-05-12 and
 * 2026-08-06. Nothing in the system noticed for three months, because:
 *
 *   🔴 netlify.toml ends in a `/*` SPA catch-all, so EVERY absent path answers `200 text/html`.
 *      A slug that has never existed returns 200. So does its /video.mp4.
 *      => An HTTP STATUS CODE CANNOT DETECT A MISSING VIDEO ON THIS SITE.
 *      Only slugs explicitly force-404'd in netlify.toml's takedown list ever return 404.
 *
 * The ONLY reliable signal is the response CONTENT TYPE:
 *      200 video/mp4              -> a real video is served
 *      200/206 text/html          -> NO video (the catch-all shell)
 *      404                        -> explicitly taken down
 *
 * This is the same class of mistake as inferring "live" from the filesystem
 * ([[feedback-video-takedown-list-is-invisible]]) — the probe returned the same answer for a real page
 * and for a page that cannot exist, so it measured nothing.
 *
 * WHAT IT CHECKS
 *   Email present AND Video URL present AND NOT Suppressed  -> outreach can send this, so the video
 *   must exist. Anything in that set without `video/mp4` is a prospect-facing dead link.
 *
 * Usage:
 *   node scripts/audit-live-videos.mjs           # report only, exit 0 (advisory)
 *   node scripts/audit-live-videos.mjs --strict  # exit 1 if any dead link is found
 *   node scripts/audit-live-videos.mjs --fix     # suppress the offenders (stops further sends)
 *
 * A CONTROL URL is probed first and MUST come back as not-a-video. If a slug that cannot exist ever
 * reports `video/mp4`, this probe is broken and the script refuses to report rather than print a
 * reassuring "0 dead links" — a green result from a broken sensor is worse than no result.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n').filter(Boolean)
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const KEY = env.AIRTABLE_API_KEY, BASE = env.AIRTABLE_BASE_ID || 'appSKOMBz6OpGf3qu';
const H = { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
const STRICT = process.argv.includes('--strict');
const FIX = process.argv.includes('--fix');
const SITE = 'https://www.rocketgrowthagency.com';
const CONC = 6;   // deliberately low: this audit gets rate-limited above ~10, and a throttled run is useless

const isVideo = (ct) => /video\/mp4/i.test(ct || '');

// 🔴 2026-08-18 — A 403 IS NOT A MISSING VIDEO. THIS NEARLY SUPPRESSED 151 GOOD LEADS.
// The first version classified anything that wasn't `video/mp4` as a dead link. Running it repeatedly at
// 20-way concurrency got this client RATE-LIMITED, and Netlify started answering `403 text/html` — which
// the script dutifully reported as 151 prospect-facing dead links. `hot-8-yoga`, deployed and verified
// hours earlier, was in that list. Acting on it would have suppressed 151 healthy leads and pulled them
// out of outreach.
//
// So the classification is now THREE-valued, not two. "Not a video" and "I could not tell" are different
// answers, and only the first is a finding:
//   video/mp4                  -> HEALTHY
//   200/206 + text/html        -> DEAD (the SPA catch-all — genuinely no file)
//   403 / 429 / 5xx / network  -> INDETERMINATE — retried with backoff, and if it still won't resolve the
//                                 audit ABORTS rather than reporting. Never suppress on this.
const INDETERMINATE = (code) => code === 403 || code === 429 || code === 408 || (typeof code === 'number' && code >= 500) || code === 'ERR';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probeOnce(slug) {
  // Range: bytes=0-0 so a real 10MB video costs one byte, not a full download.
  try {
    const r = await fetch(`${SITE}/v/${slug}/video.mp4`, { headers: { Range: 'bytes=0-0' } });
    return { code: r.status, ct: r.headers.get('content-type') || '' };
  } catch (e) { return { code: 'ERR', ct: String(e.message).slice(0, 60) }; }
}

async function probe(slug) {
  let res = await probeOnce(slug);
  // Exponential backoff on throttling. Being slow is fine; being wrong is not.
  for (let attempt = 1; attempt <= 4 && INDETERMINATE(res.code); attempt++) {
    await sleep(attempt * 1500);
    res = await probeOnce(slug);
  }
  return res;
}

// ── Sensor self-test. A slug that cannot exist must NOT look like a video.
const control = await probe('zzz-control-slug-that-cannot-exist');
if (isVideo(control.ct)) {
  console.error(`❌ PROBE BROKEN: the control slug reported ${control.ct}. Refusing to audit — a "0 dead links"`);
  console.error(`   result from a broken sensor is worse than none. Investigate before trusting this script.`);
  process.exit(2);
}
console.log(`sensor OK — control slug returns ${control.code} ${control.ct.split(';')[0]} (correctly not a video)\n`);

let recs = [], off = null;
do {
  const u = new URL(`https://api.airtable.com/v0/${BASE}/Leads`);
  u.searchParams.set('pageSize', '100');
  u.searchParams.set('filterByFormula', 'AND({Video URL}!="", {Email}!="", NOT({Suppressed}))');
  ['Business Name', 'Vid Slug', 'Video URL', 'Email Sent Date'].forEach((f) => u.searchParams.append('fields[]', f));
  if (off) u.searchParams.set('offset', off);
  const r = await fetch(u, { headers: H }); const d = await r.json();
  if (d.error) { console.error('[audit-live-videos] Airtable error', JSON.stringify(d.error)); process.exit(2); }
  recs = recs.concat(d.records || []); off = d.offset;
} while (off);

const rows = recs.map((r) => ({
  id: r.id,
  name: r.fields['Business Name'] || '?',
  slug: r.fields['Vid Slug'] || String(r.fields['Video URL'] || '').replace(/\/+$/, '').split('/').pop(),
  sent: r.fields['Email Sent Date'] || '',
})).filter((r) => r.slug);

const dead = [], unknown = [];
let i = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  while (i < rows.length) {
    const row = rows[i++];
    const res = await probe(row.slug);
    if (isVideo(res.ct)) continue;
    if (INDETERMINATE(res.code)) unknown.push({ ...row, ...res });
    else dead.push({ ...row, ...res });
  }
}));

console.log(`Sendable leads audited (Email + Video URL + not Suppressed): ${rows.length}`);
console.log(`  ✅ serving a real video : ${rows.length - dead.length - unknown.length}`);
console.log(`  🔴 DEAD LINK           : ${dead.length}`);
console.log(`  ❓ INDETERMINATE       : ${unknown.length}`);

// A throttled run tells us nothing. Reporting "N dead links" from it would be a false accusation, and
// with --fix it would suppress healthy leads. Refuse the whole result.
if (unknown.length) {
  console.error(`\n❌ ABORTING — ${unknown.length} lead(s) could not be resolved (${[...new Set(unknown.map((u) => u.code))].join(', ')}).`);
  console.error(`   This is almost always rate limiting from running the audit repeatedly, NOT missing videos.`);
  console.error(`   Wait a few minutes and re-run, or lower CONC. No lead has been suppressed.`);
  console.error(`   Sample: ${unknown.slice(0, 5).map((u) => u.slug).join(', ')}`);
  process.exit(2);
}

if (dead.length) {
  dead.sort((a, b) => String(b.sent).localeCompare(String(a.sent)));
  console.log('\nThese leads can be emailed a link to a video that does not exist:');
  for (const d of dead) console.log(`  ${d.slug.slice(0, 44).padEnd(44)} emailed:${d.sent || 'never'}  ${d.code} ${d.ct.split(';')[0]}`);
  if (FIX) {
    for (const d of dead) {
      const fields = { Suppressed: true, 'Skip Reasons': `dead-video-link: Video URL set but no video served (${d.code} ${d.ct.split(';')[0]})` };
      const r = await fetch(`https://api.airtable.com/v0/${BASE}/Leads/${d.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields }) });
      const j = await r.json();
      console.log(j.error ? `  ✗ ${d.slug}: ${JSON.stringify(j.error)}` : `  ✓ suppressed ${d.slug}`);
    }
    console.log('\nSuppressed. They still need a REBUILD — suppression only stops further sends,');
    console.log('it does nothing for prospects already holding the link.');
  } else {
    console.log('\nRe-run with --fix to suppress them (stops further sends). A rebuild is still required.');
  }
}
process.exit(STRICT && dead.length ? 1 : 0);
