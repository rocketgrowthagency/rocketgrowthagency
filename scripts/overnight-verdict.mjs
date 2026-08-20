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
import fsSync from 'node:fs';
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

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 RUN-LEVEL BLOCKERS (added 2026-08-20)
//
// This verdict used to read ONLY Airtable lead state, so it could see nothing wrong with a night that
// was completely halted. On 2026-08-19 OpenAI ran out of credits at 04:00; every recovery round from
// then on aborted at pre-flight, and this script still printed "✅ Nothing needs you." It was right
// about the leads and wrong about the night.
//
// A blocker is NOT self-healing by definition: no number of retries fixes an empty account. It needs a
// human, so it belongs in the NEEDS-YOU count — that line is the one thing Chris reads.
//
// Logs are scanned for BOTH the run's date and the next day, because a night crosses midnight and the
// pipeline re-stamps its date per search (same trap fixed in run-health-check.mjs).
// ─────────────────────────────────────────────────────────────────────────────
const BLOCKERS = [
  { re: /OpenAI OUT OF CREDITS|OpenAI balance\/quota exceeded/i,
    what: 'OpenAI is out of credits — no voiceover can be generated',
    fix : 'Add funds: https://platform.openai.com/settings/organization/billing' },
  { re: /SerpAPI quota (exhausted|too low)|SerpAPI.*below the floor/i,
    what: 'SerpAPI search quota is exhausted — no new leads can be scraped',
    fix : 'Top up SerpApi (5k/mo plan): https://serpapi.com/dashboard' },
  { re: /CIRCUIT BREAKER TRIPPED/i,
    what: 'The circuit breaker stopped the run — something systemic broke',
    fix : 'Diagnose the cause, then: node scripts/parole-permafails.mjs --apply' },
];

function findBlockers(dateStr) {
  const nextDay = (d) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); };
  const hits = new Map();
  for (const d of [dateStr, nextDay(dateStr)]) {
    for (const f of [`/tmp/overnight-local-${d}.log`, `/tmp/overnight-pipeline-${d}.log`]) {
      let txt = ''; try { txt = fsSync.readFileSync(f, 'utf8'); } catch { continue; }
      for (const b of BLOCKERS) {
        const n = (txt.match(new RegExp(b.re.source, 'gi')) || []).length;
        if (n) hits.set(b.what, { ...b, n: (hits.get(b.what)?.n || 0) + n });
      }
    }
  }
  return [...hits.values()];
}
const RUN_DATE = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) || new Date().toISOString().slice(0, 10);
const blockers = findBlockers(RUN_DATE);

const parkedNow = (r) => /gate-permafail|video-unrenderable|exhausted after/i.test(String(f(r, 'Skip Reasons') || ''))
  || String(f(r, 'Email Status') || '').toLowerCase() === 'build-failed';
const needsHuman = (r) => !selfHealing(r) && parkedNow(r);

const live = recs.filter((r) => !isDead(r) && !isDedup(r) && !isBounced(r));
const healing = live.filter(selfHealing);
const stuck = live.filter(needsHuman);
const other = live.filter((r) => !selfHealing(r) && !needsHuman(r));

if (BRIEF) {
  const parts = [];
  if (blockers.length) parts.push(`🔴 ${blockers.length} BLOCKER(S) need you — ${blockers.map((b) => b.what.split(' — ')[0]).join('; ')}`);
  if (stuck.length) parts.push(`🔴 ${stuck.length} video(s) NEED YOU (retries exhausted) · ${healing.length} self-healing.`);
  if (!parts.length) parts.push(`✅ No action needed — ${healing.length} video(s) self-healing, 0 need you.`);
  console.log(parts.join('\n'));
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
} else if (!blockers.length) {
  console.log(`\n✅ Nothing needs you. Every outstanding gap is armed and will be retried automatically.`);
}

// A blocker outranks everything above: while it is open, the "self-healing" leads are NOT healing.
if (blockers.length) {
  console.log(`\n🔴 ${blockers.length} RUN BLOCKER(S) — these do NOT self-heal, they need you:`);
  for (const b of blockers) {
    console.log(`  • ${b.what}`);
    console.log(`    → ${b.fix}`);
    console.log(`    (hit ${b.n}× in tonight's log)`);
  }
  console.log(`\n  ⚠️  While this is open the ${healing.length} "self-healing" video(s) above are NOT healing —`);
  console.log(`      every retry aborts at pre-flight. Clear the blocker, then they resume automatically.`);
}
