#!/usr/bin/env node
// check-resume-production.mjs
//
// The PRODUCTION GOVERNOR's auto-resume. PRODUCTION-PAUSED (set 2026-07-03) said the governor would
// "auto-clear when buffer drains + bounce is GREEN" — but nothing ever evaluated that, so production
// silently stalled (0 sendable leads by 2026-07-09; Chris had to notice). This restores the auto-clear.
//
// Prints RESUME or STAY-PAUSED + reason. Exit 0 = resume conditions MET (caller may clear the flag),
// exit 1 = stay paused, exit 2 = could-not-evaluate → FAIL SAFE (stay paused; never resume blind).
//
// Resume requires BOTH (per the flag's own contract, protecting the domain = rule #1):
//   1. 7-day bounce rate < RESUME_BOUNCE_MAX (default 2.0%) — GREEN, and
//   2. sendable buffer <= RESUME_BUFFER_MAX (default 30) — drained enough to justify producing more.
// Env-tunable: RESUME_BOUNCE_MAX, RESUME_BUFFER_MAX.

import fs from 'node:fs';
import path from 'node:path';

const ENV = (() => {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
    const o = {};
    raw.split('\n').forEach((l) => { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, ''); });
    return o;
  } catch { return {}; }
})();
const K = process.env.AIRTABLE_API_KEY || ENV.AIRTABLE_API_KEY;
const B = process.env.AIRTABLE_BASE_ID || ENV.AIRTABLE_BASE_ID;
const BOUNCE_MAX = Number(process.env.RESUME_BOUNCE_MAX || 2.0);
const BUFFER_MAX = Number(process.env.RESUME_BUFFER_MAX || 30);

async function countAll(table, formula, field) {
  let n = 0, offset;
  do {
    const u = new URL(`https://api.airtable.com/v0/${B}/${encodeURIComponent(table)}`);
    if (formula) u.searchParams.set('filterByFormula', formula);
    if (field) u.searchParams.set('fields[]', field);   // one existing field = light payload for counting
    u.searchParams.set('pageSize', '100');
    if (offset) u.searchParams.set('offset', offset);
    const r = await fetch(u, { headers: { Authorization: 'Bearer ' + K } });
    const d = await r.json();
    if (d.error) throw new Error(`${table}: ${d.error.type || d.error.message || JSON.stringify(d.error)}`);
    n += (d.records || []).length;
    offset = d.offset;
  } while (offset);
  return n;
}

(async () => {
  if (!K || !B) { console.log('STAY-PAUSED: no Airtable creds → cannot evaluate (fail safe)'); process.exit(2); }
  const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  let buffer, sent7d, bounced7d;
  try {
    buffer = await countAll('Leads', `AND({Email}!="", NOT({Suppressed}=1), {Funnel State}="")`, 'Email');
    sent7d = await countAll('Outreach Log', `AND({Direction}="outbound", {Outcome}="sent", IS_AFTER({Date}, "${since}"))`, 'Date');
    bounced7d = await countAll('Outreach Log', `AND({Direction}="outbound", OR({Outcome}="bounced", {Outcome}="soft-bounced", {Outcome}="permanent-bounce"), IS_AFTER({Date}, "${since}"))`, 'Date');
  } catch (e) {
    console.log('STAY-PAUSED: could not evaluate (' + e.message + ') → fail safe'); process.exit(2);
  }
  const bounceRate = sent7d > 0 ? (bounced7d / sent7d * 100) : 0;
  const bounceOk = bounceRate < BOUNCE_MAX;
  const bufferOk = buffer <= BUFFER_MAX;
  const line = `bounce7d=${bounceRate.toFixed(2)}% (<${BOUNCE_MAX}%? ${bounceOk}), buffer=${buffer} (<=${BUFFER_MAX}? ${bufferOk}) [sent7d=${sent7d}, bounced7d=${bounced7d}]`;
  if (bounceOk && bufferOk) { console.log('RESUME: conditions met — ' + line); process.exit(0); }
  console.log('STAY-PAUSED: ' + line); process.exit(1);
})().catch((e) => { console.log('STAY-PAUSED: unexpected error ' + e.message + ' → fail safe'); process.exit(2); });
