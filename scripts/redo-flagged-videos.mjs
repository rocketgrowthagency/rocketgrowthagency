#!/usr/bin/env node
/**
 * redo-flagged-videos.mjs — self-healing for manually-flagged bad videos (2026-07-02).
 *
 * Chris ticks the `Redo Video` checkbox on any lead whose video is bad. This runner reads that
 * flag and drives a 3-state machine (idempotent — safe to run repeatedly / daily):
 *
 *   ARM      (Redo Video=true, has a Video URL, not yet armed):
 *              → Suppress (bad video can't send) + delete the live /v/<slug> page + clear Video URL
 *                + Vid Slug + remove the lead's Search Term from the attempted-searches ledger so the
 *                overnight run re-scrapes that search and RE-RENDERS this lead (others idempotency-skip).
 *                Tag Skip Reasons='redo-armed'.
 *   PENDING  (armed, Video URL still empty): awaiting the re-render — do nothing.
 *   FINALIZE (armed, Video URL present again = re-rendered & passed the 6/6 gate):
 *              → Un-suppress + clear Redo Video + clear the tag. The fresh 6/6 video can now send.
 *
 * Run standalone (`node scripts/redo-flagged-videos.mjs`) or it runs at the start of overnight-local.sh.
 * DRY=1 to preview.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n').filter(Boolean).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const KEY = env.AIRTABLE_API_KEY, BASE = env.AIRTABLE_BASE_ID || 'appSKOMBz6OpGf3qu';
const WEBSITE_DIR = env.WEBSITE_DIR || '/Users/chris/RGA/Rocket Growth Agency Website VS Code';
const LEDGER = path.join(ROOT, 'output', 'attempted-searches.log');
const H = { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
const DRY = process.env.DRY === '1';
const norm = (s) => String(s).toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ').trim();

async function all(fields) {
  let recs = [], off = null;
  do {
    const u = new URL(`https://api.airtable.com/v0/${BASE}/Leads`);
    u.searchParams.set('pageSize', '100');
    u.searchParams.set('filterByFormula', '{Redo Video}');
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
function unLedgerSearch(term) {
  try {
    if (!fs.existsSync(LEDGER)) return;
    const keep = fs.readFileSync(LEDGER, 'utf8').split('\n').filter((l) => l.trim() && norm(l) !== norm(term));
    if (!DRY) fs.writeFileSync(LEDGER, keep.join('\n') + '\n');
  } catch { /* best-effort */ }
}
function deletePage(slug) {
  if (!slug) return;
  const dir = path.join(WEBSITE_DIR, 'v', slug);
  try { if (fs.existsSync(dir) && !DRY) fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
}

// A clean ARM tag is exactly `redo-armed` (set by the ARM branch below). armRedoAfterGateFail() writes
// `redo-armed (attempt N): <gateName> <reason>` — same prefix, but it records a REJECTION, not a
// rebuild. Distinguishing them is what stops a gate-failed video being un-suppressed.
const isGateFailArm = (skip) => /redo-armed\s*\(attempt\s*\d+\)/i.test(String(skip || ''));

const leads = await all(['Business Name', 'Video URL', 'Vid Slug', 'Suppressed', 'Skip Reasons', 'Search Term', 'Redo Video']);
const f = (r, k) => r.fields[k];
let armed = 0, pending = 0, finalized = 0;
for (const r of leads) {
  const name = f(r, 'Business Name'), url = f(r, 'Video URL'), slug = f(r, 'Vid Slug'), skip = f(r, 'Skip Reasons') || '', term = f(r, 'Search Term');
  const isArmed = /redo-armed/.test(skip);
  if (!isArmed && url) {
    // ARM: remove the bad video, block sending, queue the search for re-render.
    deletePage(slug);
    unLedgerSearch(term);
    await patch(r.id, { Suppressed: true, 'Video URL': '', 'Vid Slug': '', 'Skip Reasons': 'redo-armed' });
    console.log(`  🔧 ARMED (will re-render): ${name}  [${term}]  — video removed, send blocked`);
    armed++;
  } else if (isArmed && url && !isGateFailArm(skip)) {
    // FINALIZE: re-rendered (fresh 6/6 video present again) → allow sending, clear the flag.
    await patch(r.id, { Suppressed: false, 'Redo Video': false, 'Skip Reasons': '' });
    console.log(`  ✅ FINALIZED (re-rendered, ready to send): ${name}`);
    finalized++;
  } else if (isArmed && url && isGateFailArm(skip)) {
    // 🔴 2026-08-18 — REFUSE TO FINALIZE ON A GATE-FAILURE RE-ARM.
    // FINALIZE used to be plain `isArmed && url`, i.e. it inferred "successfully re-rendered" purely
    // from a Video URL existing. But armRedoAfterGateFail() wrote `redo-armed (attempt N): <failure>`
    // WITHOUT clearing the URL, so a lead whose video had just FAILED the gate looked identical to one
    // that had passed. A DRY run caught three in that state (Terra Towing, Santa Monica Auto Body,
    // Mar Vista Detail) about to be un-suppressed with broken videos.
    // That writer now clears the URL, so this state should not recur — which is exactly why this branch
    // must stay: a state that "can't happen" arriving anyway is the signal, and un-suppressing is the
    // one action we must never take on a guess. Un-suppressing is irreversible in effect (the email
    // goes out), so this fails CLOSED. Positive proof or nothing — [[feedback-verification-gates-must-be-strict]].
    console.warn(`  ⛔ REFUSING to finalize ${name}: armed with a GATE FAILURE but still carrying a Video URL.`);
    console.warn(`     Its last recorded outcome was a gate rejection, so the URL is not evidence of a good rebuild.`);
    console.warn(`     Staying suppressed. Skip Reasons: ${String(skip).slice(0, 120)}`);
    pending++;
  } else {
    console.log(`  ⏳ PENDING re-render: ${name}  [${term}]`);
    pending++;
  }
}
console.log(`\n${DRY ? '[DRY] ' : ''}Redo Video: armed ${armed}, pending ${pending}, finalized ${finalized} (of ${leads.length} flagged)`);
if (armed) console.log('  → the armed searches are back in the queue; the next overnight run re-renders those leads through the 6/6 gate.');
