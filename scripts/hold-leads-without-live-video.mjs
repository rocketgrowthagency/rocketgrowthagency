#!/usr/bin/env node
/**
 * hold-leads-without-live-video.mjs — a lead must never be emailable while its video page is dead.
 * (2026-08-20)
 *
 * THE FAILURE THIS PREVENTS
 * On 2026-08-19 Netlify ran out of build credits. `netlify deploy --prod` answered
 * `JSONHTTPError: Forbidden`, the pipeline swallowed the exit code, and 53 of 71 landing pages were
 * never published. Because netlify.toml ends in a /* SPA catch-all, every one of those URLs still
 * answered 200 with the HOMEPAGE. step-8 had already written each lead's Video URL — it never checks
 * that the URL serves — so the leads were fully sendable. Five outreach emails went out the next
 * morning pointing real prospects at a page with no video on it.
 *
 * Nothing in the chain connected "the deploy failed" to "do not email these people". This does.
 *
 * WHAT IT DOES
 * For every lead with a Video URL and no Email Sent Date, fetch the video and require
 * `content-type: video/mp4`. Anything else means the page is not really there.
 *   - definitely NOT serving  → set Email Status = 'held-video-not-live' so the sender skips it
 *   - serving again later     → clear that hold automatically (the deploy may simply have been late)
 *
 * 🔴 A STATUS CODE PROVES NOTHING HERE. The SPA catch-all returns 200 text/html for every absent path,
 * including an invented slug. Only the content-type distinguishes a real video from the homepage.
 * See feedback_curl_status_is_useless_check_content_type.
 *
 * 🔴 INDETERMINATE IS NOT A FINDING. 403/429/5xx/timeouts mean we could not tell — never a hold. A
 * throttled probe once declared 151 healthy leads dead. Retries with backoff, then leaves them alone.
 * See feedback_indeterminate_is_not_a_finding.
 *
 * Usage: node scripts/hold-leads-without-live-video.mjs [--apply]   (default = dry run)
 */
import 'dotenv/config';

const KEY = process.env.AIRTABLE_API_KEY;
const BASE = process.env.AIRTABLE_BASE_ID;
const TABLE = process.env.AIRTABLE_TABLE_NAME || 'Leads';
const APPLY = process.argv.includes('--apply');
const HOLD = 'held-video-not-live';
const SITE = 'https://www.rocketgrowthagency.com';

if (!KEY || !BASE) { console.error('✗ missing AIRTABLE_API_KEY / AIRTABLE_BASE_ID'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const IND = (c) => c === 403 || c === 429 || c === 408 || (typeof c === 'number' && c >= 500) || c === 'ERR';

async function once(url) {
  try {
    const r = await fetch(url, { headers: { Range: 'bytes=0-0' } });
    return { code: r.status, ct: r.headers.get('content-type') || '' };
  } catch { return { code: 'ERR', ct: '' }; }
}
/** true = serving a real video · false = definitely not · null = could not tell (never act on null) */
async function serving(url) {
  let r = await once(url);
  for (let a = 1; a <= 4 && IND(r.code); a++) { await sleep(a * 1500); r = await once(url); }
  if (IND(r.code)) return null;
  return /video\/mp4/i.test(r.ct);
}

// Sensor self-test — a slug that cannot exist must read as NOT serving. If it reads as a video the
// probe is broken and every verdict below would be garbage, so refuse to run.
if (await serving(`${SITE}/v/zzz-control-slug-that-cannot-exist/video.mp4`) !== false) {
  console.error('✗ probe broken (control slug looks like a live video) — refusing to touch any lead.');
  process.exit(2);
}

const api = (path) => `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLE)}${path}`;
let all = [], offset;
do {
  const r = await fetch(api(`?pageSize=100${offset ? `&offset=${offset}` : ''}`), { headers: { Authorization: `Bearer ${KEY}` } });
  const j = await r.json();
  if (j.error) { console.error('✗ airtable:', JSON.stringify(j.error).slice(0, 200)); process.exit(1); }
  all.push(...(j.records || [])); offset = j.offset;
} while (offset);

const f = (r, k) => r.fields[k];

// 🔴 ONLY LEADS THAT COULD ACTUALLY BE SENT. The first version of this filtered on
// "has a Video URL and no Email Sent Date" and flagged 56 leads — every single one of which was already
// `closed_dnc` / `closed_bounced` in Funnel State and therefore unsendable. Holding them would have
// gained nothing and OVERWRITTEN 5 meaningful statuses (invalid, no-mx) with a hold.
//
// A uniform mass finding means the PROBE is wrong, not that the world is broken
// (feedback_suppression_reason_lives_in_funnel_state). Suppression lives in Funnel State, not in
// Skip Reasons or Email Status — check it before concluding a lead is live.
//
// Likewise, never clobber a status that already carries a reason: invalid / no-mx / bounced are
// themselves holds, and replacing them would destroy why the lead was set aside.
// Our OWN hold must stay in scope, or a lead held while the deploy was late could never be released.
const CLOSED = /^closed_/i;
const MEANINGFUL_STATUS = /^(invalid|no-mx|bounced|held-)/i;
const candidates = all.filter((r) => {
  const status = String(f(r, 'Email Status') || '');
  return f(r, 'Video URL') &&
    !f(r, 'Email Sent Date') &&
    !CLOSED.test(String(f(r, 'Funnel State') || '')) &&
    (status === HOLD || !MEANINGFUL_STATUS.test(status));
});
const heldNow = all.filter((r) => String(f(r, 'Email Status') || '') === HOLD);

const toHold = [], toRelease = [], unknown = [];
let i = 0;
const CONC = 6;
await Promise.all(Array.from({ length: CONC }, async () => {
  while (i < candidates.length) {
    const rec = candidates[i++];
    const url = String(f(rec, 'Video URL')).replace(/\/$/, '') + '/video.mp4';
    const live = await serving(url.includes('/video.mp4') ? url : `${url}/video.mp4`);
    const status = String(f(rec, 'Email Status') || '');
    if (live === null) unknown.push(rec);
    else if (live === false && status !== HOLD) toHold.push(rec);
    else if (live === true && status === HOLD) toRelease.push(rec);
  }
}));

console.log(`  checked ${candidates.length} unsent lead(s) with a Video URL`);
console.log(`  🔴 to HOLD (video not serving) : ${toHold.length}`);
console.log(`  🟢 to RELEASE (serving again)  : ${toRelease.length}`);
console.log(`  ❓ indeterminate (left alone)  : ${unknown.length}`);
console.log(`  currently held                 : ${heldNow.length}`);
for (const r of toHold.slice(0, 20)) console.log(`     hold: ${f(r, 'Business Name')}`);
for (const r of toRelease.slice(0, 20)) console.log(`     release: ${f(r, 'Business Name')}`);

if (!APPLY) { console.log('\n  (dry run — pass --apply to write)'); process.exit(toHold.length ? 1 : 0); }

async function patch(recs, status) {
  for (let k = 0; k < recs.length; k += 10) {
    const chunk = recs.slice(k, k + 10).map((r) => ({ id: r.id, fields: { 'Email Status': status } }));
    const res = await fetch(api(''), {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: chunk }),
    });
    if (!res.ok) console.error('   ✗ patch failed:', (await res.text()).slice(0, 160));
  }
}
if (toHold.length) await patch(toHold, HOLD);
if (toRelease.length) await patch(toRelease, '');
console.log(`\n  ✅ applied — ${toHold.length} held, ${toRelease.length} released`);
process.exit(0);
