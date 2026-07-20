#!/usr/bin/env node
/**
 * reconcile-missing-videos.mjs — GUARANTEE every emailed lead gets a video (2026-07-11, Chris:
 * "ALL emails we get MUST have a video"). This is the safety net under the fast parallel pipeline:
 * after a run, ANY lead that has an Email but NO Video URL (and isn't terminal) is the gap — this
 * finds that gap and re-queues those leads for a SLOWER, single-worker retry pass so nothing is lost.
 *
 * WHAT COUNTS AS A GAP (a lead that SHOULD have a video but doesn't):
 *   Email present  AND  Video URL empty  AND  not Suppressed  AND  Status != 'dead'
 *   AND Email Status not terminal (bounced/blocked/invalid/unsubscribed/…)  AND  a known Search Term.
 *
 * WHAT IT DOES (idempotent, safe to run repeatedly):
 *   - Counts attempts per lead in output/video-retry-attempts.json (local ledger — no new Airtable field).
 *   - For leads under MAX_ATTEMPTS: bump the count, remove their Search Term from attempted-searches.log
 *     (so BOTH tonight's recovery pass AND tomorrow's main run re-render them; others idempotency-skip),
 *     and add the distinct search to output/missing-video-searches.txt for the same-night slow pass.
 *   - For leads AT/over MAX_ATTEMPTS: tag Skip Reasons='video-unrenderable-Nx' and SURFACE them (never
 *     silently looped, never silently dropped) — these need eyes (bot-blocked site / genuinely low signal).
 *   - Leads with NO Search Term: surfaced as 'video-missing-no-search-term' (can't auto-retry).
 *
 * Prints machine-parseable `MISSING_VIDEO_SEARCHES=N`. Exit 0 always (advisory). DRY=1 to preview.
 * Env: MAX_VIDEO_ATTEMPTS (default 3).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n').filter(Boolean).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const KEY = env.AIRTABLE_API_KEY, BASE = env.AIRTABLE_BASE_ID || 'appSKOMBz6OpGf3qu';
const H = { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
const DRY = process.env.DRY === '1';
const MAX_ATTEMPTS = Number(process.env.MAX_VIDEO_ATTEMPTS || 3);
const LEDGER = path.join(ROOT, 'output', 'attempted-searches.log');
const ATTEMPTS_FILE = path.join(ROOT, 'output', 'video-retry-attempts.json');
const SEARCHES_OUT = path.join(ROOT, 'output', 'missing-video-searches.txt');
const TERMINAL_ES = ['bounced', 'blocked', 'invalid', 'unsubscribed', 'queued-recovery', 'no-replacement-found', 'permanent-bounce', 'soft-bounced', 'build-failed'];
const norm = (s) => String(s || '').toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ').trim();

async function all(fields) {
  let recs = [], off = null;
  do {
    const u = new URL(`https://api.airtable.com/v0/${BASE}/Leads`);
    u.searchParams.set('pageSize', '100');
    // Server-side narrow: has Email, no Video URL. The rest we filter in JS (clearer + fewer formula bugs).
    u.searchParams.set('filterByFormula', 'AND({Email}!="", {Video URL}="")');
    fields.forEach((f) => u.searchParams.append('fields[]', f));
    if (off) u.searchParams.set('offset', off);
    const r = await fetch(u, { headers: H }); const d = await r.json();
    if (d.error) throw new Error(JSON.stringify(d.error));
    recs = recs.concat(d.records || []); off = d.offset;
  } while (off);
  return recs;
}
async function patch(id, fields) {
  if (DRY) return;
  const r = await fetch(`https://api.airtable.com/v0/${BASE}/Leads/${id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields }) });
  const d = await r.json(); if (d.error) throw new Error(JSON.stringify(d.error));
}
function loadAttempts() { try { return JSON.parse(fs.readFileSync(ATTEMPTS_FILE, 'utf8')); } catch { return {}; } }
function saveAttempts(o) { if (!DRY) { fs.mkdirSync(path.dirname(ATTEMPTS_FILE), { recursive: true }); fs.writeFileSync(ATTEMPTS_FILE, JSON.stringify(o, null, 2)); } }
function unLedgerSearches(terms) {
  try {
    if (!fs.existsSync(LEDGER)) return;
    const drop = new Set([...terms].map(norm));
    const keep = fs.readFileSync(LEDGER, 'utf8').split('\n').filter((l) => l.trim() && !drop.has(norm(l)));
    if (!DRY) fs.writeFileSync(LEDGER, keep.join('\n') + '\n');
  } catch { /* best-effort */ }
}

const f = (r, k) => r.fields[k];
const isTerminal = (r) => TERMINAL_ES.indexOf(String(f(r, 'Email Status') || '').toLowerCase()) >= 0;
const raw = await all(['Business Name', 'Email', 'Video URL', 'Suppressed', 'Status', 'Email Status', 'Search Term', 'Skip Reasons']);

// A GAP = active emailable lead with no video. Exclude terminal / suppressed / dead.
// Exclude dedup-skipped leads: they matched an existing business in a later search (a repeat/multi-location
// duplicate) and MUST NOT get their own video — building one would duplicate a business we already prospected.
const isDedupSkip = (r) => /dedup-skip/i.test(String(f(r, 'Skip Reasons') || ''));
const gaps = raw.filter((r) => !f(r, 'Suppressed') && String(f(r, 'Status') || '').toLowerCase() !== 'dead' && !isTerminal(r) && !isDedupSkip(r));

const attempts = loadAttempts();
const toRetrySearches = new Set();
let requeued = 0, exhausted = 0, noSearch = 0;

for (const r of gaps) {
  const name = f(r, 'Business Name') || r.id;
  const term = (f(r, 'Search Term') || '').trim();
  if (!term) {
    noSearch++;
    console.log(`  ⚠ no Search Term — can't auto-retry: ${name}`);
    if (!/video-missing-no-search-term/.test(f(r, 'Skip Reasons') || '')) await patch(r.id, { 'Skip Reasons': 'video-missing-no-search-term' });
    continue;
  }
  const n = (attempts[r.id] || 0) + 1;
  if (n > MAX_ATTEMPTS) {
    exhausted++;
    console.log(`  ✗ EXHAUSTED (${n - 1} attempts) — surfacing + retiring to build-failed: ${name} [search: ${term}]`);
    // Surface for review AND retire to a terminal Email Status. Previously we only stamped the
    // Skip Reasons tag and left the lead an active gap forever — so it re-fired the failed-video
    // audit EVERY night and re-consumed render attempts on every ledger reset (the 28-lead
    // FAILED↔draining oscillation, 2026-07-15→07-19). 'build-failed' is already in both scripts'
    // TERMINAL_ES, so this drops the lead from the gap set cleanly. The lead has no Video URL and so
    // is already non-sendable (verify-sendable-mailboxes requires a Video URL). To re-attempt after
    // fixing the source, clear Skip Reasons AND reset Email Status. See feedback-every-email-gets-a-video.
    await patch(r.id, { 'Skip Reasons': `video-unrenderable-${n - 1}x`, 'Email Status': 'build-failed' });
    continue;
  }
  attempts[r.id] = n;
  toRetrySearches.add(term);
  requeued++;
  // Self-heal: a re-queued lead is being retried, so clear any stale 'video-unrenderable' tag
  // (otherwise the failed-videos audit false-alarms on a lead that is actually re-rendering).
  if (!DRY && /video-unrenderable/i.test(f(r, 'Skip Reasons') || '')) await patch(r.id, { 'Skip Reasons': '' });
  console.log(`  ↻ re-queue (attempt ${n}/${MAX_ATTEMPTS}): ${name} [search: ${term}]`);
}

saveAttempts(attempts);
unLedgerSearches(toRetrySearches);
const searchList = [...toRetrySearches];
if (!DRY) fs.writeFileSync(SEARCHES_OUT, searchList.join('\n') + (searchList.length ? '\n' : ''));

console.log(`\n${DRY ? '[DRY] ' : ''}Missing-video reconcile: ${gaps.length} emailable leads without a video → ${requeued} re-queued across ${searchList.length} search(es), ${exhausted} exhausted (flagged for review), ${noSearch} lack a search term.`);
if (searchList.length) console.log('  Searches to re-render (slow single-worker pass):\n' + searchList.map((s) => '    - ' + s).join('\n'));
console.log(`MISSING_VIDEO_SEARCHES=${searchList.length}`);
