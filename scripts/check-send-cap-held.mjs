#!/usr/bin/env node
/**
 * check-send-cap-held.mjs — did we actually stay under the daily send cap?
 *
 * ─── WHY (2026-08-26) ────────────────────────────────────────────────────────────────────────────
 * Domain protection is the #1 standing constraint, and nothing measured whether the cap actually
 * HELD. It did not: 55–56 sends a day against a 50 cap, every weekday with Day-1 demand, for at
 * least two weeks. Nobody noticed because the only visible number was Lead `Email Sent Date`, which
 * records first touch and showed a comfortable ~10/day.
 *
 * The cap logic was fine — the morning run stopped precisely at 50. A SECOND run fired 15–44 minutes
 * later and sent 5 more Day-1 emails:
 *
 *     08-25  07:06:54 → 07:11:07  50 sends (cap)  ·  07:21:11  5 more, all Sequence Step 1
 *     08-24  07:06:43 → 07:10:39  50 sends (cap)  ·  07:50:21  5 more, all Sequence Step 1
 *
 * The script lock is `tryLock`, so it only blocks CONCURRENT runs — the first had already finished.
 * Fixed with a once-per-day date-stamp guard in gmail-to-airtable.gs.
 *
 * > **A cap nobody measures is a hope.** This is the measurement.
 *
 * 🔴 HOW TO COUNT SENDS — the mistake that hid this for weeks:
 *   ✅ Outreach Log: Direction='outbound', Outcome='sent', grouped by LOCAL (PT) date.
 *   ❌ Lead 'Email Sent Date' — FIRST TOUCH ONLY. The cap is a daily TOTAL including the Day
 *      4/9/16/45 follow-up sequence, so first-touch understates real volume by ~5×.
 *   See [[feedback-send-volume-is-the-outreach-log]].
 *
 * Usage:  node scripts/check-send-cap-held.mjs [--days=14] [--json]
 * Exit 0 = cap held · 1 = breached · 2 = could not tell (never read as "held").
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const JSON_OUT = process.argv.includes('--json');
const DAYS = Number((process.argv.find((a) => a.startsWith('--days=')) || '--days=14').split('=')[1]) || 14;

// The cap the Apps Script actually enforces. Kept here so a breach is judged against the REAL
// number; update both together if the ramp override changes.
//   gmail-to-airtable.gs: DAILY_CAP_OVERRIDE = 50  (ramp week 5+ would otherwise allow 100)
const DAILY_CAP = 50;
const SEND_TZ = 'America/Los_Angeles';

const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));

const KEY = env.AIRTABLE_API_KEY, BASE = env.AIRTABLE_BASE_ID;
if (!KEY || !BASE) { console.error('✗ missing Airtable credentials — cannot judge the cap'); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let rows = [], offset;
try {
  do {
    const url = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent('Outreach Log')}?pageSize=100`
      + (offset ? `&offset=${offset}` : '');
    const r = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` } });
    const j = await r.json();
    // An unreachable log must never read as "cap held" — that is the same class of silent pass the
    // whole breach hid behind.
    if (j.error) { console.error(`✗ Outreach Log read failed: ${JSON.stringify(j.error).slice(0, 140)}`); process.exit(2); }
    rows = rows.concat(j.records); offset = j.offset;
    await sleep(200);
  } while (offset);
} catch (e) {
  console.error(`✗ could not reach Airtable (${String(e.message || e).slice(0, 90)}) — refusing to guess`);
  process.exit(2);
}

const localDay = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: SEND_TZ });
const sent = rows.filter((r) => {
  const f = r.fields || {};
  return String(f.Outcome || '').toLowerCase() === 'sent'
      && String(f.Direction || '') === 'outbound'
      && f.Date;
});
if (!sent.length) { console.error('✗ no outbound "sent" rows at all — the query or the log is wrong'); process.exit(2); }

const byDay = {};
sent.forEach((r) => { const d = localDay(r.fields.Date); (byDay[d] ||= []).push(r); });

const cutoff = new Date(Date.now() - DAYS * 86400000).toLocaleDateString('en-CA', { timeZone: SEND_TZ });
const days = Object.keys(byDay).filter((d) => d >= cutoff).sort();
const today = new Date().toLocaleDateString('en-CA', { timeZone: SEND_TZ });

// Today is still in progress — a partial count is not a pass and not a breach.
const judged = days.filter((d) => d !== today);
const breaches = judged.filter((d) => byDay[d].length > DAILY_CAP);

if (JSON_OUT) {
  console.log(JSON.stringify({ cap: DAILY_CAP, days: judged.map((d) => ({ day: d, sent: byDay[d].length })), breaches: breaches.length }, null, 2));
  process.exit(breaches.length ? 1 : 0);
}

console.log(`\n===== DAILY SEND CAP (${DAILY_CAP}/day, PT) =====`);
for (const d of days) {
  const n = byDay[d].length;
  const partial = d === today ? '  (today, in progress)' : '';
  const flag = d !== today && n > DAILY_CAP ? `  ⚠ +${n - DAILY_CAP} OVER` : '';
  console.log(`  ${d}  ${String(n).padStart(3)}${flag}${partial}`);
}

if (!breaches.length) {
  console.log(`\n✅ cap held on all ${judged.length} completed day(s).`);
  process.exit(0);
}

console.error(`\n✗ CAP BREACHED on ${breaches.length} of ${judged.length} day(s).`);
// Burst analysis: a second run after the first finished is the known cause, so name it rather than
// leaving the reader to re-derive it.
const worst = breaches[breaches.length - 1];
const times = byDay[worst].map((r) => new Date(r.fields.Date)).sort((a, b) => a - b);
let bursts = 1;
for (let i = 1; i < times.length; i++) if ((times[i] - times[i - 1]) / 60000 > 10) bursts++;
console.error(`   ${worst}: ${byDay[worst].length} sends in ${bursts} burst(s).`);
if (bursts > 1) {
  console.error('   More than one burst means the morning run executed twice. The script lock is');
  console.error('   tryLock — it stops CONCURRENT runs only, not a second run after the first ended.');
  console.error('   Check: the once-per-day guard (LAST_OUTREACH_RUN_DATE) is present in the LIVE');
  console.error('   Apps Script, and no duplicate trigger exists for runMorningOutreach or');
  console.error('   createOutreachDrafts.');
}
process.exit(1);
