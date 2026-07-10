#!/usr/bin/env node
/**
 * outreach-health-monitor.mjs — THE BRAIN's proactive alarm (built 2026-07-10).
 *
 * WHY THIS EXISTS: on 2026-07-10 the sendable pool drained to 0 and sends fell to ~1/day, and NOBODY
 * told Chris — he had to notice. The boot health-snapshot tracked `day1Queue` (leads that merely have a
 * Video URL) but NOT the true FRESH-SENDABLE buffer (emailable + not-suppressed + never-sent), which is
 * the metric that actually predicts a stall. This monitor watches RUNWAY (buffer ÷ daily send rate) plus
 * send-stall + overproduction, and on a problem writes a STANDING alert (same pattern as the OpenAI-quota
 * alarm) + fires a macOS notification, so Chris is told the moment it's true — without asking.
 *
 * Runs daily in daily-deliverability-guard.sh (6am, before the 7am send). Claude also surfaces the alert
 * at session boot (see feedback_proactive_pipeline_health_awareness). Self-clearing: GREEN removes the alert.
 *
 * Exit: 0=GREEN (healthy, alert cleared), 2=AMBER (heads-up), 3=RED (standing alert written). Fail-safe:
 * if it can't evaluate (no creds / API error) it exits 2 and NEVER clears an existing alert or invents a RED.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRAPER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEBSITE_DIR = path.join(path.dirname(SCRAPER_DIR), 'Rocket Growth Agency Website VS Code');
const ALERT_MD = path.join(WEBSITE_DIR, 'reports', 'alerts', 'OUTREACH-HEALTH-ALERT.md');
const ALERT_FLAG = path.join(os.homedir(), 'rga-ALERT-outreach.log');
const PAUSE_FLAG = path.join(SCRAPER_DIR, 'output', 'PRODUCTION-PAUSED');
const BUILD_PLIST = path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.rga.overnight-build.plist');

// Tunables (env-overridable) — match the governor's own contract.
const RUNWAY_MIN_DAYS = Number(process.env.RUNWAY_MIN_DAYS || 2);      // below this = starving
const RUNWAY_MAX_DAYS = Number(process.env.RUNWAY_MAX_DAYS || 14);     // above this = overproducing
const BOUNCE_MAX = Number(process.env.RESUME_BOUNCE_MAX || 2.0);        // GREEN threshold
const SEND_STALL_HOURS = Number(process.env.SEND_STALL_HOURS || 30);   // fuel present but silent this long = stalled

const ENV = (() => {
  try {
    const raw = fs.readFileSync(path.join(SCRAPER_DIR, '.env'), 'utf8');
    const o = {};
    raw.split('\n').forEach((l) => { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, ''); });
    return o;
  } catch { return {}; }
})();
const K = process.env.AIRTABLE_API_KEY || ENV.AIRTABLE_API_KEY;
const B = process.env.AIRTABLE_BASE_ID || ENV.AIRTABLE_BASE_ID;

async function countAll(table, formula, field) {
  let n = 0, offset;
  do {
    const u = new URL(`https://api.airtable.com/v0/${B}/${encodeURIComponent(table)}`);
    if (formula) u.searchParams.set('filterByFormula', formula);
    if (field) u.searchParams.set('fields[]', field);
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
// Newest outbound-sent Date (ISO string) or null.
async function lastSendDate() {
  const u = new URL(`https://api.airtable.com/v0/${B}/${encodeURIComponent('Outreach Log')}`);
  u.searchParams.set('filterByFormula', 'AND({Direction}="outbound", {Outcome}="sent")');
  u.searchParams.set('fields[]', 'Date');
  u.searchParams.set('sort[0][field]', 'Date');
  u.searchParams.set('sort[0][direction]', 'desc');
  u.searchParams.set('pageSize', '1');
  const r = await fetch(u, { headers: { Authorization: 'Bearer ' + K } });
  const d = await r.json();
  if (d.error) throw new Error('Outreach Log: ' + (d.error.type || d.error.message));
  return d.records?.[0]?.fields?.Date || null;
}

function clearAlert() { for (const f of [ALERT_MD, ALERT_FLAG]) { try { fs.unlinkSync(f); } catch {} } }
function notify(title, msg) {
  try {
    execFileSync('osascript', ['-e', `display notification ${JSON.stringify(msg)} with title ${JSON.stringify(title)}`]);
  } catch {}
}

(async () => {
  if (!K || !B) { console.log('AMBER: outreach-health — no Airtable creds → cannot evaluate (fail safe; alert left as-is).'); process.exit(2); }
  const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  let buffer, sent7d, bounced7d, lastSend;
  try {
    buffer = await countAll('Leads', `AND({Email}!="", NOT({Suppressed}=1), {Funnel State}="")`, 'Email');
    sent7d = await countAll('Outreach Log', `AND({Direction}="outbound", {Outcome}="sent", IS_AFTER({Date}, "${since}"))`, 'Date');
    bounced7d = await countAll('Outreach Log', `AND({Direction}="outbound", OR({Outcome}="bounced", {Outcome}="soft-bounced", {Outcome}="permanent-bounce"), IS_AFTER({Date}, "${since}"))`, 'Date');
    lastSend = await lastSendDate();
  } catch (e) {
    console.log('AMBER: outreach-health — could not evaluate (' + e.message + ') → fail safe (alert left as-is).'); process.exit(2);
  }

  const avgDaily = sent7d / 7;
  const runwayDays = avgDaily > 0 ? buffer / avgDaily : (buffer > 0 ? 99 : 0);
  const bounceRate = sent7d > 0 ? (bounced7d / sent7d * 100) : 0;
  const bounceGreen = bounceRate < BOUNCE_MAX;
  const lastSendAgeH = lastSend ? (Date.now() - Date.parse(lastSend)) / 36e5 : Infinity;
  const dow = new Date().getDay();                 // 0 Sun … 6 Sat
  const buildScheduled = fs.existsSync(BUILD_PLIST);
  const manuallyPaused = fs.existsSync(PAUSE_FLAG);
  const selfRefillArmed = buildScheduled && !manuallyPaused && bounceGreen;   // will the loop refill on its own?

  const metrics = `buffer=${buffer} sendable, runway=${runwayDays.toFixed(1)}d, sent7d=${sent7d} (~${avgDaily.toFixed(1)}/day), bounce7d=${bounceRate.toFixed(2)}%, lastSend=${lastSendAgeH === Infinity ? 'never' : lastSendAgeH.toFixed(0) + 'h ago'}`;

  const reds = [], ambers = [];
  // 1) STARVATION — the failure that got missed.
  if (runwayDays < RUNWAY_MIN_DAYS) {
    if (selfRefillArmed) ambers.push(`Sendable pool LOW (${runwayDays.toFixed(1)}d runway). Self-refill IS armed — tonight's 1am build will top it up. Watch that it actually produces.`);
    else reds.push(`Sendable pool STARVED (${runwayDays.toFixed(1)}d runway) and the self-refill is NOT armed (${manuallyPaused ? 'PRODUCTION-PAUSED override set' : !buildScheduled ? 'nightly build job missing' : 'bounce not GREEN'}). Sends WILL stall. Intervene: clear the block / restart production.`);
  }
  // 2) SEND STALL despite fuel — cloud send engine problem.
  if (buffer > 10 && lastSendAgeH > SEND_STALL_HOURS && dow >= 2 && dow <= 6) {
    reds.push(`Sends STALLED: ${buffer} sendable leads waiting but no outbound send in ${lastSendAgeH.toFixed(0)}h. The cloud send engine (Apps Script runMorningOutreach) may be paused (OUTREACH_PAUSED) or erroring — check it.`);
  }
  // 3) OVERPRODUCTION — wasting build + staleness.
  if (runwayDays > RUNWAY_MAX_DAYS && buffer > 40) {
    ambers.push(`Overproduction: ${runwayDays.toFixed(1)}d of runway (${buffer} sendable vs ~${avgDaily.toFixed(1)}/day). Production should idle until this drains — the governor handles it, but flag if it keeps climbing.`);
  }

  if (reds.length) {
    const body = `# 🚨 RGA OUTREACH HEALTH — RED (${new Date().toISOString().slice(0, 16).replace('T', ' ')})\n\n`
      + `**Metrics:** ${metrics}\n\n`
      + reds.map((r) => `- 🔴 ${r}`).join('\n') + '\n'
      + (ambers.length ? '\n' + ambers.map((a) => `- 🟡 ${a}`).join('\n') + '\n' : '')
      + `\n_Auto-detected by outreach-health-monitor.mjs (6am guard). This file self-clears when the pool is healthy again. Surface it at session boot._\n`;
    fs.mkdirSync(path.dirname(ALERT_MD), { recursive: true });
    fs.writeFileSync(ALERT_MD, body);
    fs.writeFileSync(ALERT_FLAG, `outreach RED ${new Date().toISOString()} — ${reds[0]}\n`);
    notify('🚨 RGA outreach needs you', reds[0].slice(0, 180));
    console.log('RED: outreach-health — ' + metrics);
    reds.forEach((r) => console.log('   🔴 ' + r));
    process.exit(3);
  }
  if (ambers.length) {
    clearAlert();   // AMBER is self-healing / informational → clear any stale RED standing alert
    console.log('AMBER: outreach-health — ' + metrics);
    ambers.forEach((a) => console.log('   🟡 ' + a));
    process.exit(2);
  }
  clearAlert();
  console.log('GREEN: outreach-health — ' + metrics);
  process.exit(0);
})().catch((e) => { console.log('AMBER: outreach-health — unexpected error ' + e.message + ' → fail safe.'); process.exit(2); });
