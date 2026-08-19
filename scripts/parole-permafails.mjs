#!/usr/bin/env node
/**
 * parole-permafails.mjs — give a permanently-parked lead ONE fresh attempt, but only when the code that
 * rejected it has actually changed. (2026-08-19)
 *
 * THE PROBLEM
 * A lead that fails 3 times is parked (`video-unrenderable-3x` / `gate-permafail` / `build-failed`) and
 * is never retried again — deliberately, so a genuinely-broken lead can't eat the nightly capacity
 * forever. But that assumes the failure was the LEAD's fault. Historically it usually wasn't:
 * [[project-video-pipeline-integrity]] measured that the GATES were the largest single source of lost
 * videos — 48 of 75 rejections were FALSE. Leads parked by a bug we later fixed stay dead forever.
 *
 * Measured 2026-08-19: 30 parked leads, 22 of them scraped in MAY — long before the map-centre anchoring,
 * blank-hero, results+card false-reject and scale-bar fixes. Almost certainly buildable now.
 *
 * THE RULE — retry on EVIDENCE, never blindly
 * "Retry everything periodically" would re-burn capacity on genuinely dead leads. So parole is tied to a
 * fact: **the capture/gate code changed since these leads were parked.** The epoch is the commit time of
 * the last change to the files that decide whether a video passes:
 *     step-3-video-recorder.mjs · build-video-landing.mjs · check-video-visual.mjs · step-6-voiceover.mjs
 * If that timestamp is newer than the last parole we ran, every parked lead gets exactly ONE more go.
 * If nothing has changed, this is a no-op — no churn, no wasted slots.
 *
 * A paroled lead re-enters the normal heal path (Redo Video=true → ARM → rebuild → gates). If it fails
 * again it is re-parked, and will not be paroled again until the NEXT code change. So each fix buys each
 * lead exactly one attempt.
 *
 * Usage:
 *   node scripts/parole-permafails.mjs            # DRY by default — prints what it would do
 *   node scripts/parole-permafails.mjs --apply    # parole them
 *   node scripts/parole-permafails.mjs --force    # parole even if the epoch hasn't moved (manual override)
 * Exit 0 always (advisory) — never blocks a run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n').filter(Boolean)
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const KEY = env.AIRTABLE_API_KEY, BASE = env.AIRTABLE_BASE_ID || 'appSKOMBz6OpGf3qu';
const H = { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');
const STATE = path.join(ROOT, 'output', 'parole-epoch.txt');

// Files that decide whether a video passes. A change to any of them can flip a previous rejection.
const GATE_FILES = ['step-3-video-recorder.mjs', 'build-video-landing.mjs',
  'scripts/check-video-visual.mjs', 'step-6-voiceover.mjs'];

function captureEpoch() {
  try {
    return execFileSync('git', ['log', '-1', '--format=%cI', '--', ...GATE_FILES],
      { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch { return ''; }
}

const epoch = captureEpoch();
if (!epoch) { console.log('[parole] cannot read the capture-code epoch from git — skipping.'); process.exit(0); }
let last = '';
try { last = fs.readFileSync(STATE, 'utf8').trim(); } catch { /* never paroled */ }

console.log(`[parole] capture-code last changed : ${epoch}`);
console.log(`[parole] last parole ran at        : ${last || '(never)'}`);

if (!FORCE && last && last >= epoch) {
  console.log('[parole] capture code unchanged since the last parole — nothing to do. ✓');
  process.exit(0);
}

let recs = [], off = null;
do {
  const u = new URL(`https://api.airtable.com/v0/${BASE}/Leads`);
  u.searchParams.set('pageSize', '100');
  u.searchParams.set('filterByFormula',
    'AND({Email}!="", {Video URL}="", OR(FIND("video-unrenderable",{Skip Reasons}&"")>0, FIND("gate-permafail",{Skip Reasons}&"")>0, {Email Status}="build-failed"))');
  ['Business Name', 'Vid Slug', 'Skip Reasons', 'Email Status', 'Search Term', 'Status'].forEach((f) => u.searchParams.append('fields[]', f));
  if (off) u.searchParams.set('offset', off);
  const r = await fetch(u, { headers: H }); const d = await r.json();
  if (d.error) { console.error('[parole] Airtable error', JSON.stringify(d.error)); process.exit(0); }
  recs = recs.concat(d.records || []); off = d.offset;
} while (off);

// Never parole a lead that is dead or has no search term — there is nothing to rebuild from.
const eligible = recs.filter((r) => String(r.fields.Status || '').toLowerCase() !== 'dead' && r.fields['Search Term']);
const skipped = recs.length - eligible.length;

console.log(`[parole] parked leads: ${recs.length}  → eligible: ${eligible.length}${skipped ? `  (skipped ${skipped}: dead or no search term)` : ''}`);
if (!eligible.length) { console.log('[parole] nothing to parole.'); process.exit(0); }

for (const r of eligible) {
  const why = String(r.fields['Skip Reasons'] || r.fields['Email Status'] || '').slice(0, 60);
  console.log(`  ${APPLY ? 'parole' : '[DRY] parole'} ${String(r.fields['Vid Slug'] || r.fields['Business Name']).slice(0, 40).padEnd(40)} was: ${why}`);
  if (!APPLY) continue;
  // Clear the parked markers and re-enter the heal path. Email Status is only cleared when it is the
  // build-failure one we set ourselves — never touch a real terminal state (bounced/unsubscribed/…),
  // which is about the PERSON, not the video.
  const fields = { 'Redo Video': true, Suppressed: true, 'Skip Reasons': `paroled ${epoch.slice(0, 10)} (was: ${why})` };
  if (String(r.fields['Email Status'] || '').toLowerCase() === 'build-failed') fields['Email Status'] = '';
  const res = await fetch(`https://api.airtable.com/v0/${BASE}/Leads/${r.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields }) });
  const j = await res.json();
  if (j.error) console.error(`    ✗ ${JSON.stringify(j.error)}`);
}

if (APPLY) {
  // Reset the local retry ledger so reconcile-missing-videos gives them a full allowance again.
  try {
    const ap = path.join(ROOT, 'output', 'video-retry-attempts.json');
    const cur = JSON.parse(fs.readFileSync(ap, 'utf8'));
    for (const r of eligible) { const s = r.fields['Vid Slug']; if (s && cur[s] !== undefined) delete cur[s]; }
    fs.writeFileSync(ap, JSON.stringify(cur, null, 1));
  } catch { /* no ledger yet */ }
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, epoch + '\n');
  console.log(`\n[parole] ${eligible.length} lead(s) paroled — they re-enter the heal path on the next run.`);
  console.log(`[parole] epoch recorded; they will NOT be paroled again until the capture code changes.`);
} else {
  console.log(`\n[parole] DRY RUN — re-run with --apply to parole these ${eligible.length} lead(s).`);
}
