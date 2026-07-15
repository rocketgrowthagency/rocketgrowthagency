#!/usr/bin/env node
/**
 * audit-failed-videos.mjs — SELF-CHECKING SAFEGUARD (Chris 2026-07-11): after every production run, verify
 * there are NO failed videos, and if there ever are, NOTIFY Chris so we fix the issue. This is the guardrail
 * on the "ALL emails MUST get a video" rule ([[feedback-every-email-gets-a-video]]) — the reconciler drains
 * transient gaps silently; THIS alerts on the ones the system can't self-heal.
 *
 * A lead = an emailable prospect with NO video: Email present, Video URL empty, not Suppressed/dead/terminal.
 * Split into:
 *   - FAILED (actionable → ALERT): retries EXHAUSTED (Skip Reasons ~ video-unrenderable-Nx) OR no Search Term
 *     (Skip Reasons ~ video-missing-no-search-term). The system tried and cannot self-recover → Chris fixes.
 *   - DRAINING (informational, no alarm): still within retry budget — the nightly recovery pass will render it.
 *
 * If FAILED > 0: fires the same alert channels as notify-openai-quota (macOS notification + persistent alert
 * file at $HOME/rga-ALERT-failed-videos.log + website reports/alerts/FAILED-VIDEOS-ALERT.md), and exits 2.
 * If FAILED == 0: clears any stale alert file, prints all-clear, exits 0. DRY=1 suppresses the notification.
 *
 * Wired into overnight-local.sh AFTER the recovery pass (audits the FINAL state). Also runnable standalone.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n').filter(Boolean).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const KEY = env.AIRTABLE_API_KEY, BASE = env.AIRTABLE_BASE_ID || 'appSKOMBz6OpGf3qu';
const WEBSITE_DIR = env.WEBSITE_DIR || '/Users/chris/RGA/Rocket Growth Agency Website VS Code';
const H = { Authorization: 'Bearer ' + KEY };
const DRY = process.env.DRY === '1';
const TERMINAL_ES = ['bounced', 'blocked', 'invalid', 'unsubscribed', 'queued-recovery', 'no-replacement-found', 'permanent-bounce', 'soft-bounced', 'build-failed'];
const ALERT_HOME = path.join(process.env.HOME || '/Users/chris', 'rga-ALERT-failed-videos.log');
const ALERT_MD = path.join(WEBSITE_DIR, 'reports', 'alerts', 'FAILED-VIDEOS-ALERT.md');

async function all() {
  let recs = [], off = null;
  const fields = ['Business Name', 'Email', 'Video URL', 'Suppressed', 'Status', 'Email Status', 'Search Term', 'Skip Reasons'];
  do {
    const u = new URL(`https://api.airtable.com/v0/${BASE}/Leads`);
    u.searchParams.set('pageSize', '100');
    u.searchParams.set('filterByFormula', 'AND({Email}!="", {Video URL}="")');
    fields.forEach((f) => u.searchParams.append('fields[]', f));
    if (off) u.searchParams.set('offset', off);
    const r = await fetch(u, { headers: H }); const d = await r.json();
    if (d.error) throw new Error(JSON.stringify(d.error));
    recs = recs.concat(d.records || []); off = d.offset;
  } while (off);
  return recs;
}
const f = (r, k) => r.fields[k];
const stamp = () => { try { return execSync("date '+%Y-%m-%d %H:%M'", { encoding: 'utf8' }).trim(); } catch { return ''; } };

let raw;
try { raw = await all(); }
catch (e) { console.error('[audit-failed-videos] Airtable query failed: ' + e.message + ' — cannot audit (fail loud).'); process.exit(1); }

const sr = (r) => String(f(r, 'Skip Reasons') || '');
// Dedup-skipped leads are intentional duplicates (same business seen in a later search) — they should NEVER
// get a video, so they're not a "gap". Exclude them from the audit exactly as the reconciler does.
const gaps = raw.filter((r) => !f(r, 'Suppressed') && String(f(r, 'Status') || '').toLowerCase() !== 'dead' && TERMINAL_ES.indexOf(String(f(r, 'Email Status') || '').toLowerCase()) < 0 && !/dedup-skip/i.test(sr(r)));
const exhausted = gaps.filter((r) => /video-unrenderable/i.test(sr(r)));
const noSearch = gaps.filter((r) => /video-missing-no-search-term/i.test(sr(r)) || !String(f(r, 'Search Term') || '').trim());
const failedSet = new Map();
[...exhausted, ...noSearch].forEach((r) => failedSet.set(r.id, r));
const failed = [...failedSet.values()];
const draining = gaps.filter((r) => !failedSet.has(r.id));

console.log(`[audit-failed-videos] ${stamp()} — emailable leads with no video: ${gaps.length} total → ${failed.length} FAILED (need a fix), ${draining.length} draining (recovery pass will render).`);
if (draining.length) console.log(`  draining (${draining.length}): ${draining.slice(0, 8).map((r) => f(r, 'Business Name')).join(', ')}${draining.length > 8 ? ' …' : ''}`);

if (failed.length === 0) {
  // All-clear: remove any stale alert so the boot/report doesn't show a resolved problem.
  try { if (fs.existsSync(ALERT_HOME)) fs.unlinkSync(ALERT_HOME); } catch {}
  try { if (fs.existsSync(ALERT_MD)) fs.unlinkSync(ALERT_MD); } catch {}
  console.log('  ✓ NO failed videos — every emailable lead has a video or is on track. FAILED_VIDEOS=0');
  process.exit(0);
}

// There ARE failed videos → alert Chris (same channels as notify-openai-quota).
const lines = failed.map((r) => `  - ${f(r, 'Business Name')} — ${/video-unrenderable/i.test(sr(r)) ? 'retries exhausted (' + (sr(r).match(/video-unrenderable-(\d+)x/i)?.[1] || '?') + ' tries)' : 'no search term'} [search: ${f(r, 'Search Term') || '—'}]`);
const MSG = `${failed.length} lead(s) have an email but NO video and the system can't self-recover — needs a fix.`;
console.log(`🚨 ALERT: ${MSG}`);
console.log(lines.join('\n'));
console.log(`FAILED_VIDEOS=${failed.length}`);

if (!DRY) {
  try {
    fs.appendFileSync(ALERT_HOME, `${stamp()} — ${MSG}\n${lines.join('\n')}\n\n`);
    fs.mkdirSync(path.dirname(ALERT_MD), { recursive: true });
    fs.writeFileSync(ALERT_MD, `# 🚨 FAILED VIDEOS ALERT — ${stamp()}\n\n${MSG}\n\nThese emailable leads have no video and exhausted auto-retry (bot-blocked site / genuinely low signal / missing search term). Each represents a paid-for email with no video:\n\n${lines.join('\n')}\n\n**Fix path:** check the site/scrape for each, correct the source (right website / re-scrape), then clear its Skip Reasons so the recovery pass retries it. Delete this file once resolved.\n`);
    // execFileSync (no shell) so apostrophes/em-dashes in MSG can't break shell quoting — the old
    // single-quoted `osascript -e '…'` broke on "can't", so the alert notification never fired.
    try { execFileSync('osascript', ['-e', `display notification "${MSG.replace(/"/g, '\\"')}" with title "RGA: failed videos" sound name "Sosumi"`]); } catch {}
  } catch (e) { console.error('  (alert write failed: ' + e.message + ')'); }
}
process.exit(2);
