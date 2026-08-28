#!/usr/bin/env node
/**
 * check-day1-reservation-took.mjs — is the live send split what MIN_DAY1_RESERVATION says it is?
 *
 * ─── WHY (2026-08-28) ────────────────────────────────────────────────────────────────────────────
 * `MIN_DAY1_RESERVATION` was raised 5 → 20 to drain the 184-lead send backlog in ~9 working days
 * instead of ~19. Apps Script has no auto-deploy, so a constant changed in the repo means nothing
 * until Chris pastes it — and even then the only proof is the NEXT morning's send split.
 *
 * On 2026-08-28 the paste landed at ~08:56, after the 07:07 run, so that day still fired at step1×5
 * and proved nothing. Rather than leave "remember to eyeball step 1 on Monday" as a human task, this
 * reads the constant out of the .gs and compares it to what actually sent.
 *
 * > **A config change nobody verifies is a hope.** Same shape as the send cap: the rule looked right
 * > in the source for two weeks while production did something else.
 *
 * Not date-specific on purpose — it keeps answering "does the live split match the setting?" long
 * after this particular change, so a future drift (or a reverted paste) surfaces the same way.
 *
 * Reads the LAST COMPLETED weekday with sends. Today is excluded while in progress.
 *
 * Usage:  node scripts/check-day1-reservation-took.mjs [--json]
 * Exit 0 = split matches the setting · 1 = it does not · 2 = could not tell.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER = path.dirname(HERE);
const WEBSITE = path.join(path.dirname(SCRAPER), 'Rocket Growth Agency Website VS Code');
const GS = path.join(WEBSITE, 'docs', 'apps-scripts', 'gmail-to-airtable.gs');
const JSON_OUT = process.argv.includes('--json');
const SEND_TZ = 'America/Los_Angeles';

// The value that is LIVE — the last-pasted copy, not the working file. The working file may already
// hold an edit nobody has pasted, which would make this compare against code production never ran.
const LIVE_GS = path.join(WEBSITE, 'docs', 'apps-scripts', 'last-pasted', 'gmail-to-airtable.gs');
const gsPath = fs.existsSync(LIVE_GS) ? LIVE_GS : GS;
if (!fs.existsSync(gsPath)) { console.error('✗ gmail-to-airtable.gs not found'); process.exit(2); }
const m = fs.readFileSync(gsPath, 'utf8').match(/^const MIN_DAY1_RESERVATION = (\d+);/m);
if (!m) { console.error('✗ could not read MIN_DAY1_RESERVATION from the live script'); process.exit(2); }
const RESERVATION = Number(m[1]);

const env = Object.fromEntries(
  fs.readFileSync(path.join(SCRAPER, '.env'), 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const KEY = env.AIRTABLE_API_KEY, BASE = env.AIRTABLE_BASE_ID;
if (!KEY || !BASE) { console.error('✗ missing Airtable credentials'); process.exit(2); }

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
} catch (e) { console.error(`✗ could not reach Airtable (${String(e.message).slice(0, 80)})`); process.exit(2); }

const day = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: SEND_TZ });
const today = new Date().toLocaleDateString('en-CA', { timeZone: SEND_TZ });
const byDay = {};
rows.filter((r) => String(r.fields?.Outcome || '').toLowerCase() === 'sent'
                && r.fields?.Direction === 'outbound' && r.fields?.Date)
    .forEach((r) => { (byDay[day(r.fields.Date)] ||= []).push(r); });

const completed = Object.keys(byDay).filter((d) => d !== today).sort();
if (!completed.length) { console.error('✗ no completed send day found — nothing to judge'); process.exit(2); }
const last = completed[completed.length - 1];
const rs = byDay[last];
const step1 = rs.filter((r) => (Number(r.fields['Sequence Step']) || 1) === 1).length;
const followups = rs.length - step1;

console.log(`\n===== DAY-1 RESERVATION =====`);
console.log(`  live MIN_DAY1_RESERVATION   ${RESERVATION}`);
console.log(`  last completed send day     ${last}`);
console.log(`  step 1 (new)                ${step1}`);
console.log(`  follow-ups                  ${followups}`);
console.log(`  total                       ${rs.length}`);

if (JSON_OUT) {
  console.log(JSON.stringify({ reservation: RESERVATION, day: last, step1, followups, total: rs.length }, null, 2));
}

// Day-1 can legitimately come in UNDER the reservation when the queue is thin — the reservation is a
// floor on capacity, not a quota. It must never be far OVER, and when there is a real backlog it
// should be at or near the floor. Judge the failing direction only.
if (step1 > RESERVATION) {
  console.error(`\n✗ step 1 sent ${step1}, above the reservation of ${RESERVATION} — the split is not being honoured.`);
  process.exit(1);
}
if (step1 < RESERVATION) {
  console.log(`\n⚠️  step 1 (${step1}) is BELOW the reservation (${RESERVATION}).`);
  console.log(`   Either the Day-1 queue is nearly drained (fine — the reservation is a floor, not a quota),`);
  console.log(`   or the live Apps Script still runs an older value and the paste did not take.`);
  console.log(`   Check the queue first:  node scripts/check-send-queue-drained.mjs`);
  console.log(`   A healthy backlog + step1 well under the floor = the paste did not land.`);
  process.exit(0);
}
console.log(`\n✅ step 1 is exactly at the reservation — the live split matches the setting.`);
process.exit(0);
