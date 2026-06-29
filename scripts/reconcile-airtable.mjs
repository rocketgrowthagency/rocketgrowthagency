#!/usr/bin/env node
/**
 * reconcile-airtable.mjs — one-time + re-runnable Leads-table cleanup.
 *
 * WHY (2026-06-29): the funnel engine (advanceFunnelState) only processes
 * NON-terminal leads, so when a lead becomes terminal (suppressed / replied /
 * bounced / unsubscribed) its `Funnel State` is never stamped to the correct
 * closed_* value — it stays on a stale active state ('day_4_sent') or empty.
 * Audit found 289 such leads. Plus 82 leads carry a vestigial `Resend Count`
 * from the now-retired queueResendDrafts pipeline.
 *
 * This recomputes the canonical `Funnel State` for EVERY lead using the exact
 * same logic as computeFunnelState() in gmail-to-airtable.gs, and (optionally)
 * clears the vestigial Resend Count. Truthful history in the Outreach Log is
 * never touched.
 *
 * Usage:
 *   node scripts/reconcile-airtable.mjs            # DRY RUN (default) — prints every change, writes nothing
 *   node scripts/reconcile-airtable.mjs --apply    # writes the changes
 *   node scripts/reconcile-airtable.mjs --apply --clear-resend   # also null vestigial Resend Count
 */
import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const CLEAR_RESEND = process.argv.includes('--clear-resend');

// ---- creds from .env ----
const envPath = path.join(process.cwd(), '.env');
const env = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8').split('\n').filter(Boolean).map((l) => {
    const i = l.indexOf('='); return i < 0 ? [l, ''] : [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);
const KEY = env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN || env.AIRTABLE_PAT;
const BASE = env.AIRTABLE_BASE_ID || 'appSKOMBz6OpGf3qu';
const TABLE = 'Leads';
if (!KEY) { console.error('No AIRTABLE_API_KEY in .env'); process.exit(1); }

const headers = { Authorization: `Bearer ${KEY}` };

async function loadAll(table) {
  const out = [];
  let offset = null;
  do {
    const u = new URL(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(table)}`);
    u.searchParams.set('pageSize', '100');
    if (offset) u.searchParams.set('offset', offset);
    const res = await fetch(u, { headers });
    if (!res.ok) throw new Error(`${table} load ${res.status}: ${await res.text()}`);
    const d = await res.json();
    out.push(...(d.records || []));
    offset = d.offset;
  } while (offset);
  return out;
}

// EXACT port of computeFunnelState() from gmail-to-airtable.gs (logRows branch
// is unused here, matching how advanceFunnelState calls it with []).
function computeFunnelState(f) {
  if (f['Email Status'] === 'unsubscribed') return 'closed_unsubscribed';
  if (['bounced', 'permanent-bounce', 'no-replacement-found', 'invalid', 'blocked'].indexOf(f['Email Status']) >= 0) return 'closed_bounced';
  if (f['Suppressed']) return 'closed_dnc';
  if (f['Replied']) return 'closed_replied';
  if (f['Date Client Signed']) return 'converted_to_client';
  if (f['Audit Form Submitted']) return 'fga_submitted';
  if (f['CTA Clicked At']) return 'cta_clicked';
  if (f['Video Completed At']) return 'video_completed';
  if (f['Video 75% At']) return 'video_75_pct';
  if (f['Video 50% At']) return 'video_50_pct';
  if (f['Video 25% At']) return 'video_25_pct';
  if (f['Video Started At']) return 'video_started';
  if (f['Day 45 Sent At']) return f['Day 45 Opened At'] ? 'reengagement_opened' : 'reengagement_sent';
  if (f['Day 16 Sent At']) return f['Day 16 Opened At'] ? 'breakup_opened' : 'breakup_sent';
  if (f['Day 9 Sent At']) return f['Day 9 Clicked At'] ? 'day_9_clicked' : (f['Day 9 Opened At'] ? 'day_9_opened' : 'day_9_sent');
  if (f['Day 4 Sent At']) return f['Day 4 Clicked At'] ? 'day_4_clicked' : (f['Day 4 Opened At'] ? 'day_4_opened' : 'day_4_sent');
  if (f['Day 1 Clicked At'] || f['Thumbnail Clicked']) return 'day_1_clicked';
  if (f['Day 1 Opened At'] || f['Email Opened']) return 'day_1_opened';
  if (f['Email Sent Date']) return 'day_1_sent';
  return 'not_yet_sent';
}

// The complete set of states computeFunnelState() can emit. Any CURRENT state
// outside this set is a custom/manual annotation (e.g. closed_deceased_owner,
// no_website_no_email, closed_no_response) — we must NEVER overwrite those.
const KNOWN_STATES = new Set([
  'closed_unsubscribed', 'closed_bounced', 'closed_dnc', 'closed_replied',
  'converted_to_client', 'fga_submitted', 'cta_clicked', 'video_completed',
  'video_75_pct', 'video_50_pct', 'video_25_pct', 'video_started',
  'reengagement_opened', 'reengagement_sent', 'breakup_opened', 'breakup_sent',
  'day_9_clicked', 'day_9_opened', 'day_9_sent', 'day_4_clicked', 'day_4_opened',
  'day_4_sent', 'day_1_clicked', 'day_1_opened', 'day_1_sent', 'not_yet_sent',
]);

async function patchBatch(records) {
  for (let i = 0; i < records.length; i += 10) {
    const batch = records.slice(i, i + 10);
    const res = await fetch(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLE)}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: batch, typecast: true }),
    });
    if (!res.ok) throw new Error(`PATCH ${res.status}: ${await res.text()}`);
  }
}

const leads = await loadAll(TABLE);
console.log(`Loaded ${leads.length} leads.\n`);

const stateChanges = [];   // {id, name, from, to}
const resendClears = [];   // {id, name, was}
const transitions = {};

for (const r of leads) {
  const f = r.fields || {};
  const name = f['Business Name'] || '(unknown)';
  const cur = f['Funnel State'] || '';
  const want = computeFunnelState(f);
  const fields = {};
  // PRESERVE custom/manual states — only correct empty or engine-produced ones.
  const protectedCustom = cur && !KNOWN_STATES.has(cur);
  if (cur !== want && !protectedCustom) {
    fields['Funnel State'] = want;
    stateChanges.push({ id: r.id, name, from: cur || '(empty)', to: want });
    const k = `${cur || '(empty)'} -> ${want}`;
    transitions[k] = (transitions[k] || 0) + 1;
  }
  if (CLEAR_RESEND && (f['Resend Count'] || 0) > 0) {
    fields['Resend Count'] = null;
    resendClears.push({ id: r.id, name, was: f['Resend Count'] });
  }
  r._patch = Object.keys(fields).length ? { id: r.id, fields } : null;
}

console.log(`=== Funnel State changes: ${stateChanges.length} ===`);
const tEntries = Object.entries(transitions).sort((a, b) => b[1] - a[1]);
for (const [k, n] of tEntries) console.log(`  ${n.toString().padStart(4)}  ${k}`);
console.log('\n  sample (first 12):');
for (const c of stateChanges.slice(0, 12)) console.log(`    ${c.name.slice(0, 42).padEnd(42)} ${c.from}  ->  ${c.to}`);

if (CLEAR_RESEND) console.log(`\n=== Vestigial Resend Count to clear: ${resendClears.length} ===`);

const patches = leads.map((r) => r._patch).filter(Boolean);
console.log(`\n${patches.length} records need a write.`);

if (!APPLY) {
  console.log('\nDRY RUN — nothing written. Re-run with --apply to commit.' + (CLEAR_RESEND ? '' : ' (add --clear-resend to also null Resend Count.)'));
} else {
  await patchBatch(patches);
  console.log(`\nAPPLIED — patched ${patches.length} leads.`);
}
