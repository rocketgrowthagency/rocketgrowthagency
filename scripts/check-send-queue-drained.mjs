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
import { isSendable, queueBreakdown } from './lib/sendable.mjs';

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

// 🔴 EVERY field the sendable rule reads must be requested. The first version asked for only
// Business Name / Video URL / Email / Email Sent Date, so Suppressed, Status, Draft Created and
// Replied all arrived UNDEFINED — and undefined passes every "not suppressed" style test. The gate
// then reported 1,152 queued with 0 suppressed, against a true 184 queued and 229 suppressed.
//
// A projection that omits a field the filter depends on does not error. It silently answers a
// different question ([[feedback-dead-check-selector-gap]]).
const REQUIRED = ['Business Name', 'Video URL', 'Email', 'Email Sent Date',
                  'Suppressed', 'Email Status', 'Status', 'Draft Created', 'Replied'];
const fields = REQUIRED.map((f) => `fields%5B%5D=${encodeURIComponent(f)}`).join('&');

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

// 🔴 2026-08-26 — WAS MEASURING THE WRONG QUEUE. This counted Video URL + Email + no send date and
// got 425, while daily-action-report.mjs published 184. The 241 difference was 229 SUPPRESSED, 29
// BOUNCED and 16 already drafted — none of which ever receive a send date. The gate would therefore
// have reported "still draining" forever and never released the pause.
//
// A restart condition that can never be satisfied is not a safety check, it is an outage. Both files
// now share lib/sendable.mjs so they cannot disagree again.
// If a rule field is missing from every single record, the projection is wrong and the verdict is
// meaningless — abort rather than report a confident wrong number.
{
  const seen = new Set();
  all.forEach((r) => Object.keys(r.fields || {}).forEach((k) => seen.add(k)));
  const missing = ['Suppressed', 'Status', 'Draft Created'].filter((k) => !seen.has(k));
  if (all.length && missing.length === 3) {
    console.error(`✗ none of ${missing.join(', ')} came back from Airtable — the field projection is`);
    console.error('  broken, so every lead would look sendable. Refusing to judge the queue.');
    process.exit(2);
  }
}
const b = queueBreakdown(all);
const queued = all.filter(isSendable);
const sent = all.filter((r) => r.fields['Email Sent Date']);
const PER_DAY = 10;   // MEASURED, not the 50/day cap. See project_production_pause_2026-08-25.
const days = Math.ceil(queued.length / PER_DAY);

if (JSON_OUT) {
  console.log(JSON.stringify({ leads: all.length, sent: sent.length, queued: queued.length, workingDays: days, breakdown: b }, null, 2));
  process.exit(queued.length === 0 ? 0 : 1);
}

console.log('\n===== SEND QUEUE =====');
console.log(`  leads total     ${all.length}`);
console.log(`  already emailed ${sent.length}`);
console.log(`  QUEUED          ${queued.length}   (sendable — the daily report's own rule)`);
console.log(`  ── not queued, and why ──`);
console.log(`  suppressed      ${b.suppressed}`);
console.log(`  bounced/invalid ${b.bounced}`);
console.log(`  draft created   ${b.draftCreated}`);
console.log(`  at ~${PER_DAY}/day M–F (measured)   ~${days} working day(s) remaining`);

const paused = fs.existsSync(path.join(ROOT, 'output', 'PRODUCTION-PAUSED'));
console.log(`  production      ${paused ? 'PAUSED' : 'RUNNING'}`);

if (queued.length === 0) {
  // 🔑 The restart checklist only applies while the pause is still in place. It lifts itself now, so
  // telling the reader to run a checklist "before removing" a flag the system already archived is
  // instructing them to undo working automation.
  const stillPaused = fs.existsSync(path.join(ROOT, 'output', 'PRODUCTION-PAUSED'));
  console.log('\n✅ DRAINED — the overage is sent.');
  console.log(stillPaused
    ? '   The pause is still in place; auto-resume lifts it the day every other condition clears.\n     memory: project_production_pause_2026-08-25.md'
    : '   Production is already running — the pause lifted itself and archived its own flag.');
  process.exit(0);
}
// 🔴🔴 THIS GATE FAILED EVERY NIGHT FOR 17 DAYS ON A HEALTHY SYSTEM. It exited 1 whenever the queue
// was non-empty and told the reader to "Leave output/PRODUCTION-PAUSED in place" — but the pause
// LIFTS ITSELF (scripts/auto-resume-production.sh, inside daily-health-check.sh) and did so correctly
// on 2026-09-14, archiving the flag as PRODUCTION-PAUSED.lifted-2026-09-14 and writing
// RESUME-FIRST-NIGHT. The guidance was written for the paused period and outlived it.
//
// 🔑 A DRAINING QUEUE IS THE EXPECTED STATE, NOT A FAULT. While the pause is in place the auto-resume
// owns the decision and this gate only reports progress. The condition that IS a fault is the one
// the pause existed for: building far faster than we can send, with nothing holding it back.
// A backlog of more than 10 working days unpaused is that. The original pause tripped at ~19 working
// days, which was already too late to notice.
// → project_production_pause_2026-08-25 · feedback_a_gate_i_never_wired_is_a_gate_that_is_always_green
const BACKLOG_FAULT_WD = 10;
if (paused) {
  console.log(`\n⏳ STILL DRAINING — ${queued.length} to go, ~${days} working day(s).`);
  console.log('   The pause lifts itself the day every condition clears; nothing to do here.');
  process.exit(0);
}
if (days > BACKLOG_FAULT_WD) {
  console.error(`\n✗ THE OVERAGE IS BACK — ${queued.length} queued, ~${days} working days, and production is RUNNING.`);
  console.error(`   We are building faster than we can send again. The 08-25 pause tripped at ~19 working`);
  console.error(`   days, which was already too late. → project_production_pause_2026-08-25`);
  process.exit(1);
}
console.log(`\n✅ SENDING NORMALLY — ${queued.length} queued, ~${days} working day(s), production RUNNING.`);
process.exit(0);
