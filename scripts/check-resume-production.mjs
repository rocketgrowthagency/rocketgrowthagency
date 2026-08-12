#!/usr/bin/env node
// check-resume-production.mjs — CAPACITY-AWARE production governor (2026-07-11, Chris).
//
// Sizes nightly video production to the REAL room for new #1 (video) emails, because sends are M-F
// capped at DAILY_CAP and follow-ups #2-#5 draw from that SAME cap FIRST. So:
//     #1 room  =  DAILY_CAP  −  (follow-ups DUE)          (0 if follow-ups already fill the cap)
//     to build =  max(0, #1 room  −  existing unsent-#1 backlog)   (don't overbuild what's already ready)
//     searches =  ceil(to build ÷ VIDEOS_PER_SEARCH), capped at MAX_SEARCHES_CAP
// Domain protection = rule #1: bounce must be GREEN or we build nothing. Follow-up "due" uses the send
// engine's OWN day-gap logic (shouldFireFollowUp: Day4 @+4d, Day9 @+5d, Day16 @+7d, Day45 @+29d) so this
// can never disagree with what the Apps Script actually sends. Validated live 2026-07-11 (66 due, 110 backlog).
//
// Prints `RECOMMEND_SEARCHES=N` (machine-parseable for overnight-local.sh) + a human line.
// Exit 0 = build (N>=1), exit 1 = build nothing (N=0), exit 2 = could-not-evaluate → FAIL SAFE (build nothing).
// Env-tunable: RESUME_BOUNCE_MAX, PROD_DAILY_CAP, VIDEOS_PER_SEARCH, MAX_SEARCHES_CAP.

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
const DAILY_CAP = Number(process.env.PROD_DAILY_CAP || 50);          // matches Apps Script DAILY_CAP_OVERRIDE
const MIN_DAY1_RESERVATION = Number(process.env.MIN_DAY1_RESERVATION || 5);  // matches Apps Script — #1 slots reserved/day when #1 supply exists
const VIDEOS_PER_SEARCH = Number(process.env.VIDEOS_PER_SEARCH || 22);
const MAX_SEARCHES_CAP = Number(process.env.MAX_SEARCHES_CAP || 3);   // hard ceiling — never build more/night
const MIN_SEARCHES_FLOOR = Number(process.env.MIN_SEARCHES_FLOOR || 1); // steady-state floor: once the missing-video
// backlog is drained ("fresh system"), do at least this many NEW categories/night regardless of send-cap room —
// Chris 2026-07-11: "1 category per night until we raise our daily send cap". Suppressed during catch-up (gap>0).

function bail(msg, code) { console.log('RECOMMEND_SEARCHES=0'); console.log(msg); process.exit(code); }

async function countLog(formula) {
  let n = 0, offset;
  do {
    const u = new URL(`https://api.airtable.com/v0/${B}/${encodeURIComponent('Outreach Log')}`);
    u.searchParams.set('filterByFormula', formula);
    u.searchParams.set('fields[]', 'Date');
    u.searchParams.set('pageSize', '100');
    if (offset) u.searchParams.set('offset', offset);
    const r = await fetch(u, { headers: { Authorization: 'Bearer ' + K } });
    const d = await r.json();
    if (d.error) throw new Error('Outreach Log: ' + (d.error.type || d.error.message));
    n += (d.records || []).length; offset = d.offset;
  } while (offset);
  return n;
}
async function loadLeads() {
  const fields = ['Email', 'Video URL', 'Status', 'Draft Created', 'Suppressed', 'Replied', 'Date Client Signed',
    'Email Status', 'Email Sent Date', 'Day 4 Sent At', 'Day 9 Sent At', 'Day 16 Sent At', 'Day 45 Sent At', 'Skip Reasons'];
  let all = [], offset;
  do {
    const u = new URL(`https://api.airtable.com/v0/${B}/Leads`);
    fields.forEach((f) => u.searchParams.append('fields[]', f));
    u.searchParams.set('pageSize', '100');
    if (offset) u.searchParams.set('offset', offset);
    const r = await fetch(u, { headers: { Authorization: 'Bearer ' + K } });
    const d = await r.json();
    if (d.error) throw new Error('Leads: ' + (d.error.type || d.error.message));
    all = all.concat(d.records || []); offset = d.offset;
  } while (offset);
  return all;
}

const TERMINAL_ES = ['bounced', 'blocked', 'invalid', 'unsubscribed', 'queued-recovery', 'no-replacement-found', 'permanent-bounce', 'soft-bounced', 'build-failed'];
const daysSince = (v) => { const s = (typeof v === 'string' && v.length >= 10) ? v.slice(0, 10) : ''; return s ? (Date.now() - new Date(s + 'T00:00:00Z').getTime()) / 864e5 : null; };
// Exact port of the Apps Script shouldFireFollowUp gaps (Day4 +4, Day9 +5 since D4, Day16 +7 since D9, Day45 +29 since D16).
function fireDay(f) {
  if (!f['Day 4 Sent At']) { const d = daysSince(f['Email Sent Date']); if (d !== null && d >= 4) return 4; }
  else if (!f['Day 9 Sent At']) { const d = daysSince(f['Day 4 Sent At']); if (d !== null && d >= 5) return 9; }
  else if (!f['Day 16 Sent At']) { const d = daysSince(f['Day 9 Sent At']); if (d !== null && d >= 7) return 16; }
  else if (!f['Day 45 Sent At']) { const d = daysSince(f['Day 16 Sent At']); if (d !== null && d >= 29) return 45; }
  return null;
}
const fuActive = (f) => !!(f['Email Sent Date'] && !f['Date Client Signed'] && !f['Replied'] && !f['Suppressed'] && f['Status'] !== 'dead' && TERMINAL_ES.indexOf(f['Email Status']) < 0);

(async () => {
  if (!K || !B) bail('STAY-PAUSED: no Airtable creds → cannot evaluate (fail safe)', 2);
  const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  let sent7d, bounced7d, leads;
  try {
    sent7d = await countLog(`AND({Direction}="outbound", {Outcome}="sent", IS_AFTER({Date}, "${since}"))`);
    bounced7d = await countLog(`AND({Direction}="outbound", OR({Outcome}="bounced", {Outcome}="soft-bounced", {Outcome}="permanent-bounce"), IS_AFTER({Date}, "${since}"))`);
    leads = await loadLeads();
  } catch (e) { bail('STAY-PAUSED: could not evaluate (' + e.message + ') → fail safe', 2); }

  const bounceRate = sent7d > 0 ? (bounced7d / sent7d * 100) : 0;
  const bounceOk = bounceRate < BOUNCE_MAX;
  let followupsDue = 0, backlog1 = 0, missingVideoGap = 0;
  for (const l of leads) {
    const f = l.fields || {};
    if (fuActive(f) && fireDay(f)) followupsDue++;
    if (f.Email && f['Video URL'] && (!f.Status || f.Status === 'new') && !f['Draft Created'] && !f.Suppressed) backlog1++;
    // MISSING-VIDEO GAP = emailable lead with NO video, still active, not a dedup duplicate. While this is >0
    // we're in CATCH-UP: the recovery pass renders these; NEW-category scraping stays 0 so we finish existing
    // work first. Once 0 ("fresh system"), the steady-state floor of 1 new category/night kicks in.
    if (f.Email && !f['Video URL'] && !f.Suppressed && String(f.Status || '').toLowerCase() !== 'dead'
        && TERMINAL_ES.indexOf(f['Email Status']) < 0 && !/dedup-skip/i.test(f['Skip Reasons'] || '')) missingVideoGap++;
  }
  // #1 slots per send-day: follow-ups eat the cap FIRST, but the Apps Script ALWAYS reserves
  // MIN_DAY1_RESERVATION for #1 once #1 supply exists — so the floor is the reservation, not 0.
  const room1 = Math.max(MIN_DAY1_RESERVATION, DAILY_CAP - followupsDue);
  const need1 = Math.max(0, room1 - backlog1);              // ...beyond the #1s already built + waiting
  let searches = Math.min(MAX_SEARCHES_CAP, Math.ceil(need1 / VIDEOS_PER_SEARCH));
  // STEADY-STATE FLOOR (Chris 2026-07-11): once the missing-video backlog is drained (fresh system), do at
  // LEAST MIN_SEARCHES_FLOOR new category/night even if send-cap room is 0 — build inventory until the daily
  // send cap is raised. Suppressed during catch-up (gap>0) so recovery finishes existing leads first.
  const fresh = missingVideoGap === 0;
  if (bounceOk && fresh) searches = Math.min(MAX_SEARCHES_CAP, Math.max(searches, MIN_SEARCHES_FLOOR));
  if (!bounceOk) searches = 0;                              // domain protection = rule #1

  const phase = fresh ? 'FRESH (steady: >=1 new category/night)' : `CATCH-UP (${missingVideoGap} videos owed — recovery drains these; new-scrape held at 0)`;
  const detail = `bounce7d=${bounceRate.toFixed(2)}% (<${BOUNCE_MAX}%? ${bounceOk}), phase=${phase}, followupsDue=${followupsDue}, dailyCap=${DAILY_CAP} -> #1 room=${room1}, unsent-#1 backlog=${backlog1}, missing-video gap=${missingVideoGap} -> need=${need1} -> searches=${searches} [sent7d=${sent7d}]`;
  console.log('RECOMMEND_SEARCHES=' + searches);
  if (searches >= 1) { console.log('BUILD: ' + detail); process.exit(0); }
  const why = !bounceOk ? 'bounce not GREEN (domain rule #1). '
            : !fresh ? `CATCH-UP: ${missingVideoGap} emailable leads still owe a video — recovery pass drains them before new scraping. `
            : backlog1 >= room1 ? `enough #1 backlog already built (${backlog1} >= ${room1}/day room). `
            : 'no #1 room today. ';
  console.log('STAY-PAUSED (build 0): ' + why + detail);
  process.exit(1);
})().catch((e) => { bail('STAY-PAUSED: unexpected error ' + e.message + ' → fail safe', 2); });
