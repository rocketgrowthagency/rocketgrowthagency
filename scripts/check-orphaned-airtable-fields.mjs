#!/usr/bin/env node
/**
 * check-orphaned-airtable-fields.mjs — a field nothing populates is worse than no field.
 *
 * ─── WHY (2026-09-03) ──────────────────────────────────────────────────────────────────────────
 * `Leads.GBP Hours` existed for months. It was declared in step-8, referenced by the FGA enrichment,
 * and a comment called it "backfilled". Asked "are we saving business hours?", the schema said yes.
 * It was populated on **4 of 1,449 rows**, with scraped DOM fragments rather than hours.
 *
 * > **An empty field reads as coverage.** It is worse than no field, because "the column exists" is
 * > the answer everybody stops at — including me. I nearly told Chris we had hours.
 *
 * The lesson went into memory as a rule. A rule nobody enforces is not a guard, so this enforces it:
 * every field on Leads is measured for POPULATION, and any field at 0% must either be fixed or
 * excused with a written reason. Same shape as NOT_PREFLIGHT in check-every-gate-is-wired.
 *
 * 🔑 It also samples a VALUE. `GBP Hours` had four non-empty rows, so a pure count would have called
 * it populated — and the values were junk. Count alone is not enough.
 *
 * Usage:  node scripts/check-orphaned-airtable-fields.mjs [--json] [--all]
 * Exit 0 = every empty field is excused · 1 = an unexplained orphan · 2 = could not measure.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRAPER = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
try { (await import('dotenv')).config({ path: path.join(SCRAPER, '.env') }); } catch {}

const JSON_OUT = process.argv.includes('--json');
const SHOW_ALL = process.argv.includes('--all');
const KEY = process.env.AIRTABLE_API_KEY;
const BASE = process.env.AIRTABLE_BASE_ID;
const TABLE = process.env.AIRTABLE_TABLE_NAME || 'Leads';
if (!KEY || !BASE) { console.error('✗ Airtable creds missing — cannot measure population. NOT healthy.'); process.exit(2); }

/**
 * Fields that are legitimately empty or sparse. Each needs a REASON, so an empty column is a
 * decision on the record rather than an oversight. "It's always been empty" is not a reason.
 */
const EXPECTED_EMPTY = {
  // Populate only on a specific, rare outcome — empty is the normal state.
  'Call Objection': 'only set on Not interested / Connected, and only when the rep picks one',
  'Reply Sentiment': 'only on leads that actually replied',
  'Reply Response Time (sec)': 'only on leads that actually replied',
  'Redo Video': 'operator checkbox, ticked ad hoc',
  'Suppressed': 'only on opt-outs and bounces',
  'Site Looks Parked': 'only when the audit detects a parked site',
  'Parked Reason': 'paired with Site Looks Parked',
  'Website Suspect': 'only when the audit finds a name/domain mismatch',
  'Website Suspect Reason': 'paired with Website Suspect',
  // Wired 2026-09-03, forward-only — will populate from the next scrape / click / call.
  'GBP Hours': 'FIXED 2026-09-03 (step-2.5 now captures the text). Forward-only: populates when scraping resumes. REMOVE THIS EXCUSE once it is >0%',
  'Video Started At': 'attribution fixed 2026-09-03 in track-click.js. Forward-only: needs a real click',
  'Video 25% At': 'as Video Started At — forward-only',
  'Video 50% At': 'as Video Started At — forward-only',
  'Video 75% At': 'as Video Started At — forward-only',
  'Video Completed At': 'as Video Started At — forward-only',
  'Highest Video Pct Watched': 'as Video Started At — forward-only',

  // Correct-empty TODAY, will populate with normal use. Not defects.
  'Next Action Date': 'written by the call console on a Callback scheduled outcome. 12 calls logged so far and NONE was a callback (3 voicemail / 3 connected / 3 no answer / 1 not interested / 1 wrong number), so empty is CORRECT. Recheck once callbacks start',

  // 🔴 DECLARED IN SCHEMA, NEVER WRITTEN. step-8 creates the column and nothing ever sets a value.
  // These are the exact shape of the GBP Hours trap: they read as coverage and hold nothing.
  // Kept rather than deleted because Airtable cannot delete a field via API (UI only).
  'Date Video Sent': 'schema-declared in step-8 but never assigned. The real send date is `Email Sent Date`. Candidate for deletion in the UI',
  'GBP Secondary Categories': 'schema-declared; the audit records only the primary category today',
  'Last Activity': 'schema-declared; superseded by the per-Day Opened/Clicked timestamps',
  'Date Contacted': 'schema-declared; superseded by `Email Sent Date`',
  'Suggested Reply': 'schema-declared for an AI reply-draft feature that was never built',
  'Last Text At': 'schema-declared; inbound SMS logs to the Outreach Log instead',

  // Legacy columns with NO writer anywhere in either repo. Left in place (API cannot delete fields).
  'Notes': 'legacy, no writer — rep notes go in the Outreach Log',
  'Manual Notes': 'legacy, no writer',
  'Tags': 'legacy, no writer',
  'Date Client Signed': 'legacy, no writer — conversion is tracked by Funnel State',
  'Date FGA Delivered': 'legacy, no writer',
  'Audit Form Submitted': 'legacy, no writer',
  'Audit Submitted Date': 'legacy, no writer',
  'FGA Audit ID': 'legacy, no writer',
  'Follow Up Date': 'legacy, no writer — follow-ups are driven by Day-N timestamps',
  'Draft Created At': 'legacy, no writer',
  'Next Scheduled Send': 'legacy, no writer — cadence is computed, not stored',
  'Day 1 Subject': 'legacy, no writer',
  'Total Opens': 'legacy, no writer — computed live from the Day-N Opened fields',
  'Total Clicks': 'legacy, no writer — computed live from the Day-N Clicked fields',
  'Engagement Score': 'legacy, no writer — lead scoring computes this at report time',
  'Days Since Last Activity': 'legacy, no writer — computed at report time',
  'Text Count': 'legacy, no writer — SMS counts come from the Outreach Log',
  '_rga_calltest': 'TEST DEBRIS from 2026-08. 0 refs, 0 values. Airtable cannot delete fields via API — Chris to remove in the UI',
};

const api = async (url) => {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 90));
  return j;
};

let fields, rows = [];
try {
  const meta = await api(`https://api.airtable.com/v0/meta/bases/${BASE}/tables`);
  const t = (meta.tables || []).find((x) => x.name === TABLE);
  if (!t) throw new Error(`table "${TABLE}" not found`);
  fields = t.fields.map((f) => ({ name: f.name, type: f.type }));

  let offset;
  do {
    const j = await api(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLE)}?pageSize=100${offset ? `&offset=${offset}` : ''}`);
    rows = rows.concat(j.records);
    offset = j.offset;
  } while (offset);
} catch (e) {
  console.error(`✗ could not read Airtable (${String(e.message).slice(0, 70)}) — indeterminate, NOT healthy.`);
  process.exit(2);
}
if (!rows.length) { console.error('✗ zero rows returned — refusing to judge population over an empty table.'); process.exit(2); }

// A value that is present but meaningless is not population. Junk = separator soup, or a value that
// is nothing but punctuation/whitespace once stripped.
const looksJunk = (v) => {
  // 🔴 Numbers, booleans and dates are NEVER junk. My first version used a 3-character minimum and
  // flagged `State` ("CA", 1,236 rows) and every single-digit count as junk — the detector was
  // wrong, not the data. A length test cannot tell a short valid value from a broken one.
  if (typeof v === 'number' || typeof v === 'boolean') return false;
  if (v instanceof Date) return false;
  const s = typeof v === 'string' ? v : Array.isArray(v) ? v.join(' ') : String(v ?? '');
  if (!s.trim()) return true;
  // Junk = nothing survives once separators are removed. That catches the real shape we hit
  // ("| | See more hours | |") without punishing "CA" or "5".
  return !/[a-z0-9]/i.test(s.replace(/[|·\-–—_/\\]+/g, ' '));
};

const stats = fields.map((f) => {
  const vals = rows.map((r) => r.fields[f.name]).filter((v) => v !== undefined && v !== '' && v !== null);
  const nonJunk = vals.filter((v) => !looksJunk(v));
  return {
    ...f,
    n: vals.length,
    good: nonJunk.length,
    pct: Math.round((vals.length / rows.length) * 100),
    sample: nonJunk.length ? String(typeof nonJunk[0] === 'object' ? JSON.stringify(nonJunk[0]) : nonJunk[0]).slice(0, 60) : '',
  };
});

// Two failure shapes: nothing at all, and "populated" with values that carry no information.
const dead = stats.filter((s) => s.n === 0 && !(s.name in EXPECTED_EMPTY));
const junky = stats.filter((s) => s.n > 0 && s.good === 0 && !(s.name in EXPECTED_EMPTY));
// A stale excuse is its own drift — the same trap as a NOT_PREFLIGHT entry nobody rechecks.
// 🔴 "Started populating" must mean REAL coverage, not a handful of legacy rows. GBP Hours has 4
// pre-fix junk captures out of 1,449; `good > 0` called that "populated" and marked the excuse
// stale, which would have had me delete an excuse that is still true. Require a meaningful share.
const STALE_MIN_PCT = 2;
const staleExcuse = Object.keys(EXPECTED_EMPTY).filter((n) => {
  const s = stats.find((x) => x.name === n);
  if (!s || !/REMOVE THIS EXCUSE/i.test(EXPECTED_EMPTY[n])) return false;
  return (s.good / rows.length) * 100 >= STALE_MIN_PCT;
});
const ghostExcuse = Object.keys(EXPECTED_EMPTY).filter((n) => !fields.some((f) => f.name === n));

if (JSON_OUT) {
  console.log(JSON.stringify({ rows: rows.length, fields: fields.length, dead, junky, staleExcuse, ghostExcuse, stats: SHOW_ALL ? stats : undefined }, null, 2));
  process.exit(dead.length || junky.length || staleExcuse.length || ghostExcuse.length ? 1 : 0);
}

console.log(`\n===== ORPHANED AIRTABLE FIELDS =====`);
console.log(`  table   ${TABLE}`);
console.log(`  rows    ${rows.length}`);
console.log(`  fields  ${fields.length}  (${Object.keys(EXPECTED_EMPTY).length} excused)`);

if (SHOW_ALL) {
  console.log('\n  ── population, lowest first ──');
  for (const s of [...stats].sort((a, b) => a.pct - b.pct).slice(0, 40)) {
    console.log(`  ${String(s.pct + '%').padStart(4)} ${String(s.good).padStart(5)} good  ${s.name.slice(0, 34).padEnd(36)} ${s.sample.slice(0, 34)}`);
  }
}

const problems = dead.length + junky.length + staleExcuse.length + ghostExcuse.length;
if (!problems) {
  console.log(`\n✅ every field is populated or explicitly excused with a reason.`);
  process.exit(0);
}

if (dead.length) {
  console.error(`\n✗ ${dead.length} field(s) exist and NOTHING populates them:`);
  for (const s of dead) console.error(`     ${s.name.padEnd(34)} ${s.type}`);
}
if (junky.length) {
  console.error(`\n✗ ${junky.length} field(s) have values but every value is junk:`);
  for (const s of junky) console.error(`     ${s.name.padEnd(34)} ${s.n} row(s), 0 usable`);
}
if (staleExcuse.length) {
  console.error(`\n✗ ${staleExcuse.length} excuse(s) are now STALE — the field started populating:`);
  for (const n of staleExcuse) console.error(`     ${n} — remove its EXPECTED_EMPTY entry`);
}
if (ghostExcuse.length) {
  console.error(`\n✗ ${ghostExcuse.length} excuse(s) name a field that no longer exists:`);
  for (const n of ghostExcuse) console.error(`     ${n}`);
}
console.error(`\n   An empty field READS AS COVERAGE. Either populate it, delete it, or excuse it`);
console.error(`   with a reason in EXPECTED_EMPTY so it is a decision on the record.`);
process.exit(1);
