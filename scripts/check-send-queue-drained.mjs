#!/usr/bin/env node
/**
 * check-send-queue-drained.mjs — has the send backlog actually drained?
 *
 * ─── WHY (2026-08-25) ────────────────────────────────────────────────────────────────────────────
 * Production was paused because we had built far ahead of what we can send: 430 leads with a video
 * and an email address and no send date, against 50/day Mon–Fri — about 9 working days.
 *
 * Chris: *"when the overages get all sent lmk and then we can start doing new scrapes again."*
 *
 * The restart condition therefore has to be a MEASUREMENT, not a date and not a feeling. The
 * PRODUCTION-PAUSED flag goes "stale" after 3 days and the nightly log starts calling it forgotten —
 * which is exactly how a deliberate pause gets deleted early. This script is the only thing that
 * should end the pause.
 *
 * QUEUED = has a Video URL + an Email + no Email Sent Date. That is precisely what the Apps Script
 * `createOutreachDrafts` cron picks up.
 *
 * Usage:  node scripts/check-send-queue-drained.mjs [--json]
 * Exit 0 = drained (safe to resume) · 1 = still draining · 2 = could not tell.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const JSON_OUT = process.argv.includes('--json');

const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));

const KEY = env.AIRTABLE_API_KEY, BASE = env.AIRTABLE_BASE_ID;
const TABLE = env.AIRTABLE_TABLE_NAME || 'Leads';
if (!KEY || !BASE) { console.error('✗ missing Airtable credentials — cannot judge the queue'); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fields = ['Business Name', 'Video URL', 'Email', 'Email Sent Date']
  .map((f) => `fields%5B%5D=${encodeURIComponent(f)}`).join('&');

let all = [], offset;
try {
  do {
    const url = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLE)}?pageSize=100&${fields}`
      + (offset ? `&offset=${offset}` : '');
    const r = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` } });
    const j = await r.json();
    // 🔴 An unreachable CRM must never read as "drained" — that would resume production on no evidence.
    if (j.error) { console.error(`✗ Airtable read failed: ${JSON.stringify(j.error).slice(0, 140)}`); process.exit(2); }
    all = all.concat(j.records); offset = j.offset;
    await sleep(220);
  } while (offset);
} catch (e) {
  console.error(`✗ could not reach Airtable (${String(e.message || e).slice(0, 90)}) — refusing to guess`);
  process.exit(2);
}

const queued = all.filter((r) => r.fields['Video URL'] && r.fields['Email'] && !r.fields['Email Sent Date']);
const sent = all.filter((r) => r.fields['Email Sent Date']);
const PER_DAY = 50;
const days = Math.ceil(queued.length / PER_DAY);

if (JSON_OUT) {
  console.log(JSON.stringify({ leads: all.length, sent: sent.length, queued: queued.length, workingDays: days }, null, 2));
  process.exit(queued.length === 0 ? 0 : 1);
}

console.log('\n===== SEND QUEUE =====');
console.log(`  leads total     ${all.length}`);
console.log(`  already emailed ${sent.length}`);
console.log(`  QUEUED          ${queued.length}`);
console.log(`  at ${PER_DAY}/day M–F   ~${days} working day(s) remaining`);

const paused = fs.existsSync(path.join(ROOT, 'output', 'PRODUCTION-PAUSED'));
console.log(`  production      ${paused ? 'PAUSED' : 'RUNNING'}`);

if (queued.length === 0) {
  console.log('\n✅ DRAINED — the overage is sent.');
  console.log('   Tell Chris, then run the restart checklist BEFORE removing output/PRODUCTION-PAUSED:');
  console.log('     memory: project_production_pause_2026-08-25.md');
  process.exit(0);
}
console.log(`\n⏳ STILL DRAINING — ${queued.length} to go. Leave output/PRODUCTION-PAUSED in place.`);
console.log('   The nightly log will call the flag "stale" after 3 days. That is expected; ignore it.');
process.exit(1);
