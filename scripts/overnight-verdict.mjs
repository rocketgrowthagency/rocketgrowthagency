#!/usr/bin/env node
/**
 * overnight-verdict.mjs — answer "were there issues, and do I need to do anything?" without being asked.
 *
 * WHY THIS EXISTS (Chris, 2026-08-19):
 *   "i dont need to get here in the morning and say ok were there issues, if yes then fix. you build
 *    into the system to do this in the nightly run?"
 *
 * The overnight report already LISTS failures, but reading it still required a human to decide which
 * ones matter. Almost all of them don't: the pipeline arms a redo and re-renders it, usually the same
 * night via the recovery pass, otherwise on the next run. The only rows worth a person's attention are
 * the ones that have STOPPED retrying.
 *
 * So this splits every outstanding video gap into exactly two buckets:
 *
 *   🟢 SELF-HEALING — armed, under the attempt cap. The system will retry these. Do nothing.
 *   🔴 NEEDS YOU    — retries exhausted: `gate-permafail`, `Email Status=build-failed`, or
 *                     `video-unrenderable-Nx`. These will NEVER be retried again automatically.
 *
 * The morning answer is then a single line: "N self-healing, K need you" — and K is usually 0.
 *
 * Deliberately READ-ONLY. It changes nothing; it only classifies. Fixing is the pipeline's job, and
 * deciding what to do about a permafail is Chris's.
 *
 * Usage:  node scripts/overnight-verdict.mjs           # human-readable
 *         node scripts/overnight-verdict.mjs --brief   # one line, for the chat summary
 * Exit 0 always (advisory).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n').filter(Boolean)
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const KEY = env.AIRTABLE_API_KEY, BASE = env.AIRTABLE_BASE_ID || 'appSKOMBz6OpGf3qu';
const H = { Authorization: 'Bearer ' + KEY };
const BRIEF = process.argv.includes('--brief');

async function all() {
  let recs = [], off = null;
  do {
    const u = new URL(`https://api.airtable.com/v0/${BASE}/Leads`);
    u.searchParams.set('pageSize', '100');
    // Every lead that has an email but no video is a potential gap; classify in JS (clearer than a formula).
    u.searchParams.set('filterByFormula', 'AND({Email}!="", {Video URL}="")');
    ['Business Name', 'Vid Slug', 'Search Term', 'Skip Reasons', 'Email Status', 'Suppressed', 'Status', 'Redo Video']
      .forEach((f) => u.searchParams.append('fields[]', f));
    if (off) u.searchParams.set('offset', off);
    const r = await fetch(u, { headers: H }); const d = await r.json();
    if (d.error) { console.error('[verdict] Airtable error', JSON.stringify(d.error)); process.exit(0); }
    recs = recs.concat(d.records || []); off = d.offset;
  } while (off);
  return recs;
}

const f = (r, k) => r.fields[k];
const recs = await all();

// Terminal states a human owns. `dead`/`dedup-skip` are deliberate exclusions, NOT issues.
const isDead = (r) => String(f(r, 'Status') || '').toLowerCase() === 'dead';
const isDedup = (r) => /dedup-skip|dedup-duplicate/i.test(String(f(r, 'Skip Reasons') || ''));
const isBounced = (r) => /bounced|unsubscribed|invalid|blocked/i.test(String(f(r, 'Email Status') || ''));
// 🔴 ARMED STATE WINS OVER HISTORICAL TEXT.
// Skip Reasons keeps HISTORY as well as current state — parole-permafails.mjs writes
// `paroled <date> (was: video-unrenderable-3x)`, deliberately, so the past isn't lost. But matching
// "video-unrenderable" anywhere in that string classified a freshly-PAROLED lead as still stuck: the
// verdict read 24 "need you" seconds after those exact 24 had been re-armed and were about to retry.
// Whether a lead is retrying is a fact about its CURRENT state (`Redo Video` / `redo-armed`), never
// about words describing what once happened to it — so self-healing is evaluated first and wins.
const selfHealing = (r) => f(r, 'Redo Video') || /redo-armed|^paroled |\bparoled /i.test(String(f(r, 'Skip Reasons') || ''));
const parkedNow = (r) => /gate-permafail|video-unrenderable|exhausted after/i.test(String(f(r, 'Skip Reasons') || ''))
  || String(f(r, 'Email Status') || '').toLowerCase() === 'build-failed';
const needsHuman = (r) => !selfHealing(r) && parkedNow(r);

const live = recs.filter((r) => !isDead(r) && !isDedup(r) && !isBounced(r));
const healing = live.filter(selfHealing);
const stuck = live.filter(needsHuman);
const other = live.filter((r) => !selfHealing(r) && !needsHuman(r));

if (BRIEF) {
  console.log(stuck.length === 0
    ? `✅ No action needed — ${healing.length} video(s) self-healing, 0 need you.`
    : `🔴 ${stuck.length} video(s) NEED YOU (retries exhausted) · ${healing.length} self-healing.`);
  process.exit(0);
}

console.log(`Overnight verdict — ${new Date().toISOString().slice(0, 10)}\n`);
console.log(`  🟢 self-healing (armed, will retry) : ${healing.length}`);
console.log(`  🔴 NEEDS YOU (retries exhausted)    : ${stuck.length}`);
if (other.length) console.log(`  ⚪ no video, not armed              : ${other.length}  (picked up by the next reconcile)`);

if (stuck.length) {
  console.log(`\nThese have STOPPED retrying and will not fix themselves:`);
  for (const r of stuck) {
    console.log(`  • ${String(f(r, 'Business Name') || '?').slice(0, 40).padEnd(40)} ${String(f(r, 'Skip Reasons') || f(r, 'Email Status') || '').slice(0, 70)}`);
  }
  console.log(`\n  To retry one anyway: set Redo Video=true on the lead (it re-enters the heal path).`);
} else {
  console.log(`\n✅ Nothing needs you. Every outstanding gap is armed and will be retried automatically.`);
}
