#!/usr/bin/env node
/**
 * check-no-duplicate-send-rows.mjs — did the Day-1 inline-logging fix start double-writing?
 *
 * ─── WHY (2026-08-27) ────────────────────────────────────────────────────────────────────────────
 * The 55/day cap breach was caused by `createOutreachDrafts` sending the Day-1 email and NEVER
 * writing an Outreach Log row — `syncSent` backfilled it ~40 min later. `countSentToday()` reads that
 * log, so it undercounted by exactly the Day-1 batch and a re-entrant run saw a falsely open budget.
 *
 * The fix logs inline. But `syncSent` ALSO logs these sends, so the fix depends on a second change —
 * stamping `Latest Sent Date`, which is what syncSent dedupes on. If that dedup ever stops matching,
 * every Day-1 send gets written TWICE.
 *
 * > **The new failure mode is the mirror image of the old one, and it is quieter.** A double-write
 * > INFLATES countSentToday, which SUPPRESSES sends. That is fail-safe for the domain — but it shows
 * > up as a mysteriously low send day, never as an error. Nothing else would catch it.
 *
 * A duplicate is: same Lead + same Sequence Step + same PT day, outbound/sent, more than once. Each
 * lead gets exactly one first touch and one Day-N of each kind, so that combination is unique by
 * construction. Resends are steps 2-3 and are still one-per-day.
 *
 * Usage:  node scripts/check-no-duplicate-send-rows.mjs [--days=14] [--json]
 * Exit 0 = clean · 1 = duplicates found · 2 = could not tell (never reads as clean).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const JSON_OUT = process.argv.includes('--json');
const DAYS = Number((process.argv.find((a) => a.startsWith('--days=')) || '--days=14').split('=')[1]) || 14;

// The day the inline-logging fix went live. Duplicates BEFORE this are historical noise from other
// causes; duplicates ON OR AFTER it point straight at the dedup breaking.
const FIX_LIVE_DATE = '2026-08-27';
const SEND_TZ = 'America/Los_Angeles';

const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));

const KEY = env.AIRTABLE_API_KEY, BASE = env.AIRTABLE_BASE_ID;
if (!KEY || !BASE) { console.error('✗ missing Airtable credentials — cannot judge'); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let rows = [], offset;
try {
  do {
    const url = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent('Outreach Log')}?pageSize=100`
      + (offset ? `&offset=${offset}` : '');
    const r = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` } });
    const j = await r.json();
    if (j.error) { console.error(`✗ Outreach Log read failed: ${JSON.stringify(j.error).slice(0, 140)}`); process.exit(2); }
    rows = rows.concat(j.records); offset = j.offset;
    await sleep(200);
  } while (offset);
} catch (e) {
  console.error(`✗ could not reach Airtable (${String(e.message || e).slice(0, 90)}) — refusing to guess`);
  process.exit(2);
}

const localDay = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: SEND_TZ });
const cutoff = new Date(Date.now() - DAYS * 86400000).toLocaleDateString('en-CA', { timeZone: SEND_TZ });

const sent = rows.filter((r) => {
  const f = r.fields || {};
  return String(f.Outcome || '').toLowerCase() === 'sent'
      && String(f.Direction || '') === 'outbound'
      && f.Date && localDay(f.Date) >= cutoff;
});
// 🔴 If the Lead link is missing we cannot group, and "no duplicates found" would be a lie rather
// than a result. Same class as the field-projection bug that reported 1,152 queued with 0 suppressed.
if (sent.length && !sent.some((r) => (r.fields.Lead || [])[0])) {
  console.error('✗ no row carries a Lead link — cannot group by lead, so a duplicate could not be');
  console.error('  detected. Refusing to report clean.');
  process.exit(2);
}

const groups = {};
sent.forEach((r) => {
  const f = r.fields;
  const lead = (f.Lead || [])[0];
  if (!lead) return;
  const key = `${lead}::${f['Sequence Step'] ?? 1}::${localDay(f.Date)}`;
  (groups[key] ||= []).push(r);
});

const dupes = Object.entries(groups)
  .filter(([, v]) => v.length > 1)
  .map(([k, v]) => {
    const [lead, step, day] = k.split('::');
    return { lead, step: Number(step), day, count: v.length, business: v[0].fields['Activity'] || '' };
  })
  .sort((a, b) => a.day.localeCompare(b.day));

const sinceFix = dupes.filter((d) => d.day >= FIX_LIVE_DATE);

if (JSON_OUT) {
  console.log(JSON.stringify({ windowDays: DAYS, rowsChecked: sent.length, duplicates: dupes.length, sinceFix: sinceFix.length, detail: sinceFix.slice(0, 20) }, null, 2));
  process.exit(sinceFix.length ? 1 : 0);
}

console.log(`\n===== DUPLICATE SEND ROWS (last ${DAYS}d, ${sent.length} outbound rows) =====`);
if (!dupes.length) {
  console.log('  ✅ none — every (lead, step, day) appears exactly once.');
  console.log(`  The Latest Sent Date dedup is holding; syncSent is not re-logging Day-1 sends.`);
  process.exit(0);
}

for (const d of dupes.slice(0, 20)) {
  const flag = d.day >= FIX_LIVE_DATE ? '  ⚠ SINCE FIX' : '  (historical)';
  console.log(`  ${d.day}  step ${String(d.step).padStart(2)}  ×${d.count}${flag}`);
}
if (dupes.length > 20) console.log(`  … and ${dupes.length - 20} more`);

if (!sinceFix.length) {
  console.log(`\n✅ no duplicates since the fix went live (${FIX_LIVE_DATE}).`);
  console.log('   The ones above predate it and have a different cause — the inline log is behaving.');
  process.exit(0);
}

console.error(`\n✗ ${sinceFix.length} DUPLICATE ROW GROUP(S) SINCE ${FIX_LIVE_DATE}.`);
console.error('   createOutreachDrafts logs inline AND syncSent is logging the same send again, so the');
console.error("   `Latest Sent Date === sentIso` dedup in syncSent is not matching. Check that");
console.error("   createOutreachDrafts still stamps `Latest Sent Date` (check-send-cap-guards.mjs §4).");
console.error('   Effect: countSentToday() reads roughly double, so the budget shrinks and real sends');
console.error('   get SUPPRESSED. It is fail-safe for the domain but it silently starves outreach.');
process.exit(1);
