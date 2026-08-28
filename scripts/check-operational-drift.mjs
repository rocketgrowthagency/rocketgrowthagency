#!/usr/bin/env node
/**
 * check-operational-drift.mjs — surface slow drift in the ONE place Chris actually reads.
 *
 * ─── WHY (2026-08-24) ────────────────────────────────────────────────────────────────────────────
 * A `CLEAR-BACKLOG` flag written for a ONE-OFF drain on 08-20 was never removed. It drove 8–13
 * searches a night for four nights instead of 1, burned through every already-worked Culver City pair,
 * collapsed the build rate to 26%, and tripped the circuit breaker.
 *
 * 🔴 The system DID notice. `alert_skip()` writes to a log file and fires a macOS notification —
 * **neither of which Chris ever sees.** A notification vanishes; a log nobody opens is not an alert.
 * Meanwhile the morning report, the one artefact he reads every day, said nothing.
 *
 * > **An alert that lands somewhere nobody looks is not an alert.**
 *
 * The second drift this catches: **overproduction against the 50/day send cap**. Building 170 videos
 * in three nights against ~150 of send capacity does not help — it ages videos before they can go out.
 * The 1-category/night cadence exists precisely to keep build rate near send rate, so drift away from
 * it needs to be visible early.
 *
 * Usage:  node scripts/check-operational-drift.mjs [--json]
 * Always exits 0 — this is advisory and must never block or break the locked report format.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER = path.dirname(HERE);
const WEBSITE = path.join(path.dirname(SCRAPER), 'Rocket Growth Agency Website VS Code');
const JSON_OUT = process.argv.includes('--json');

const findings = [];
const ageDays = (p) => {
  try { return Math.floor((Date.now() - fs.statSync(p).mtimeMs) / 86400000); } catch { return null; }
};

// ── 1. Operational flags that were meant to be temporary ─────────────────────────────────────────
// Each of these changes how the night behaves. Left on, they quietly become the new normal — which is
// exactly what happened with CLEAR-BACKLOG (feedback_pending_action_memories_go_stale).
const FLAGS = [
  { file: 'output/CLEAR-BACKLOG', ttl: 3,
    what: 'raises the nightly cadence above 1 category — a DRAIN, never a cadence',
    fix: 'rm output/CLEAR-BACKLOG   (restores 1 category/night)' },
  { file: 'output/PAUSE-PIPELINE', ttl: 2,
    what: 'the overnight run is PAUSED and building nothing',
    fix: 'rm output/PAUSE-PIPELINE' },
  { file: 'output/BACKFILL', ttl: 3,
    what: 'backfill mode is on instead of the normal scrape',
    fix: 'rm output/BACKFILL' },
];
for (const f of FLAGS) {
  const p = path.join(SCRAPER, f.file);
  const age = ageDays(p);
  if (age === null) continue;                 // absent = healthy
  if (age >= f.ttl) {
    findings.push({
      kind: 'stale-flag', severity: 'high',
      msg: `\`${f.file}\` has been set for ${age} day(s) — it ${f.what}.`,
      fix: f.fix,
    });
  }
}

// ── 2. Built-but-unsent videos vs the send cap ───────────────────────────────────────────────────
// 50/day, M–F (project_outreach_machine). Building far past that does not accelerate anything; it
// just means a video is stale by the time its email goes out.
const SEND_PER_DAY = 50;
try {
  const V = path.join(WEBSITE, 'v');
  const since = Date.now() - 7 * 86400000;
  let recent = 0;
  for (const slug of fs.readdirSync(V)) {
    try {
      if (fs.statSync(path.join(V, slug, 'video.mp4')).mtimeMs >= since) recent++;
    } catch { /* not a video dir */ }
  }
  const weekCapacity = SEND_PER_DAY * 5;      // M–F
  if (recent > weekCapacity) {
    findings.push({
      kind: 'overproduction', severity: 'medium',
      msg: `${recent} videos built in the last 7 days vs ~${weekCapacity} of weekly send capacity (${SEND_PER_DAY}/day M–F).`,
      fix: 'Check the nightly cadence is 1 category/night — videos built far ahead of the send queue go stale before they ship.',
    });
  }
} catch { /* website repo unreadable — skip rather than guess */ }

// ── 3. A queue full of already-worked ground ─────────────────────────────────────────────────────
// A category×city pair is roughly a one-time harvest. Re-running a worked pair yields dedup hits, not
// prospects — that is what dragged the build rate to 26%.
try {
  const q = fs.readFileSync(path.join(SCRAPER, 'output', 'pending-rebuild-searches.txt'), 'utf8')
    .split('\n').map((l) => l.trim()).filter(Boolean);
  const step2 = path.join(SCRAPER, 'output', 'Step 2');
  const worked = new Set(
    fs.readdirSync(step2)
      .filter((f) => f.endsWith('-[step-2].csv') && !f.includes('-only-'))
      .map((f) => (f.match(/_([a-z0-9-]+-in-[a-z-]+-ca)/) || [])[1])
      .filter(Boolean));
  const key = (s) => s.toLowerCase().replace(/,/g, '').replace(/\s+/g, '-');
  const stale = q.filter((s) => worked.has(key(s)));
  if (q.length && stale.length === q.length) {
    findings.push({
      kind: 'exhausted-queue', severity: 'high',
      msg: `All ${q.length} queued searches are category×city pairs already worked. Expect dedup hits, not new prospects.`,
      fix: 'Queue unworked pairs — same proven categories in cities not yet covered.',
    });
  } else if (stale.length > q.length / 2) {
    findings.push({
      kind: 'exhausted-queue', severity: 'medium',
      msg: `${stale.length} of ${q.length} queued searches are already-worked pairs.`,
      fix: 'Top the queue up with unworked category×city pairs.',
    });
  }
} catch { /* no queue file — nothing to judge */ }

// ── 3b. Orphaned videos — full builds that can never send an email ───────────────────────────────
// 🔴 2026-08-24 — `check-orphan-videos.mjs` exists, is accurate, and is wired into NOTHING. It fails
// only when someone runs it by hand, which is the same shape as the stale-flag alert above: the
// system knew, and the one artefact Chris reads every morning said nothing.
// Each orphan is a complete build — scrape, capture, voiceover, branding, deploy — that can never
// produce an email. That is the most expensive possible way to waste a night.
// Only RECENT orphans are reported: the historical set is mostly residue of intentional dedup/DNC
// purges, and a number that never moves teaches everyone to ignore it.
try {
  const out = execFileSync('node', [path.join(SCRAPER, 'scripts', 'check-orphan-videos.mjs')],
    { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
  const m = out.match(/recent <14d:\s*(\d+)/);
  const n = m ? Number(m[1]) : 0;
  if (n > 0) {
    const who = [...out.matchAll(/🔴 \/v\/([a-z0-9-]+)\//g)].map((x) => x[1]).slice(0, 4);
    findings.push({
      kind: 'orphan-videos', severity: n >= 5 ? 'high' : 'medium',
      msg: `${n} video(s) built in the last 14 days have NO lead behind them${who.length ? ` (${who.join(', ')}${n > who.length ? ', …' : ''})` : ''}.`,
      fix: 'Each is a full build that can never be emailed. Re-scrape the search to recreate the lead, or take the video down.',
    });
  }
} catch (e) {
  // check-orphan-videos exits non-zero WHEN IT FINDS ORPHANS, so a non-zero status is the normal
  // signal, not an error — parse its output either way.
  //
  // 🔴 But distinguish "the child ran and reported orphans" from "we never ran it at all". The first
  // version of this block referenced execFileSync without importing it; the ReferenceError landed
  // here, `e.stdout` was undefined, and the check silently reported NO ORPHANS while 4 existed.
  // A catch that treats "I could not look" as "there is nothing there" is the same silent-pass class
  // this whole file exists to fight ([[feedback-indeterminate-is-not-a-finding]]).
  if (e && e.stdout === undefined) {
    findings.push({
      kind: 'orphan-check-broken', severity: 'high',
      msg: `The orphan check could not be run: ${String(e.message || e).slice(0, 120)}`,
      fix: 'Fix scripts/check-orphan-videos.mjs (or this caller) — an unrunnable check reads as a clean result.',
    });
  }
  const out = `${e.stdout || ''}`;
  const m = out.match(/recent <14d:\s*(\d+)/);
  const n = m ? Number(m[1]) : 0;
  if (n > 0) {
    const who = [...out.matchAll(/🔴 \/v\/([a-z0-9-]+)\//g)].map((x) => x[1]).slice(0, 4);
    findings.push({
      kind: 'orphan-videos', severity: n >= 5 ? 'high' : 'medium',
      msg: `${n} video(s) built in the last 14 days have NO lead behind them${who.length ? ` (${who.join(', ')}${n > who.length ? ', …' : ''})` : ''}.`,
      fix: 'Each is a full build that can never be emailed. Re-scrape the search to recreate the lead, or take the video down.',
    });
  }
}

// ── 3c. Daily send cap — domain protection is the #1 standing constraint ─────────────────────────
// 🔴 2026-08-26 — the cap was breached every weekday for at least two weeks (55-56 against 50) and
// nothing noticed, because the only number anyone looked at was Lead `Email Sent Date` (first touch,
// ~10/day). A cap nobody measures is a hope. This puts the real figure in the morning report.
try {
  execFileSync('node', [path.join(SCRAPER, 'scripts', 'check-send-cap-held.mjs'), '--days=7'],
    { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  const out = `${e.stdout || ''}${e.stderr || ''}`;
  const m = out.match(/CAP BREACHED on (\d+) of (\d+) day/);
  if (m) {
    const worst = [...out.matchAll(/(\d{4}-\d{2}-\d{2})\s+(\d+)\s+⚠/g)].map((x) => `${x[1]} ${x[2]}`).slice(-3);
    findings.push({
      kind: 'send-cap-breach', severity: 'high',
      msg: `Daily send cap BREACHED on ${m[1]} of ${m[2]} day(s)${worst.length ? ` — ${worst.join(', ')} vs 50` : ''}.`,
      fix: 'Domain protection is the #1 constraint. Check the once-per-day guard (the MORNING_RUN_DATE comparison at the top of runMorningOutreach) is in the LIVE Apps Script. Duplicate triggers were ruled out 2026-08-26 — listTriggers showed exactly 5.',
    });
  } else if (e.status === 2) {
    findings.push({ kind: 'send-cap-unknown', severity: 'medium',
      msg: 'Could not read the Outreach Log to verify the daily send cap.',
      fix: 'An unverifiable cap is not a held cap — check Airtable access.' });
  }
}

// ── 3d. Duplicate send rows — the failure mode the 08-27 fix INTRODUCES ──────────────────────────
// createOutreachDrafts now logs Day-1 sends inline, and syncSent skips them via `Latest Sent Date`.
// If that dedup stops matching, every Day-1 send is logged TWICE — countSentToday() then reads double
// and SUPPRESSES real sends. Fail-safe for the domain, but it presents as a mysteriously quiet send
// day rather than an error, so nothing else would surface it.
try {
  execFileSync('node', [path.join(SCRAPER, 'scripts', 'check-no-duplicate-send-rows.mjs'), '--days=7'],
    { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  const out = `${e.stdout || ''}${e.stderr || ''}`;
  const m = out.match(/(\d+) DUPLICATE ROW GROUP\(S\)/);
  if (m) {
    findings.push({
      kind: 'duplicate-send-rows', severity: 'high',
      msg: `${m[1]} send(s) written to the Outreach Log TWICE — countSentToday() is reading roughly double.`,
      fix: "syncSent's `Latest Sent Date === sentIso` dedup is not matching. Confirm createOutreachDrafts still stamps Latest Sent Date (check-send-cap-guards.mjs §4). Effect is suppressed sends, not over-sends.",
    });
  } else if (e.status === 2) {
    findings.push({ kind: 'duplicate-send-rows-unknown', severity: 'medium',
      msg: 'Could not check the Outreach Log for duplicate send rows.',
      fix: 'Check Airtable access — a double-write would silently starve outreach.' });
  }
}

// ── 3e. The Day-1 reservation is TEMPORARY — say so once it should be reverted ───────────────────
// 🔴 2026-08-27 — MIN_DAY1_RESERVATION was raised 5 → 20 to drain the 184-lead send backlog faster
// (~19 working days → ~9). It is correct ONLY while a backlog exists. Once drained, holding Day-1 at
// 20 starves the follow-up sequence for no benefit.
//
// A note in a comment is not a reminder — nobody re-reads the Apps Script. So this checks the LIVE
// condition (queue drained) against the LIVE setting and speaks up exactly when it becomes wrong.
// See [[feedback-pending-action-memories-go-stale]]: an action item nobody is reminded of is an
// action item that rots.
try {
  const gs = fs.readFileSync(path.join(WEBSITE, 'docs', 'apps-scripts', 'gmail-to-airtable.gs'), 'utf8');
  const m = gs.match(/^const MIN_DAY1_RESERVATION = (\d+);/m);
  const reservation = m ? Number(m[1]) : null;
  if (reservation !== null && reservation > 5) {
    let drained = false;
    try {
      execFileSync('node', [path.join(SCRAPER, 'scripts', 'check-send-queue-drained.mjs')],
        { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
      drained = true;              // exit 0 = drained
    } catch (_e) { drained = false; }  // exit 1 = still draining, 2 = unknown → stay quiet
    if (drained) {
      findings.push({
        kind: 'day1-reservation-stale', severity: 'medium',
        msg: `Send backlog is DRAINED but MIN_DAY1_RESERVATION is still ${reservation} (was raised from 5 to speed the drain).`,
        fix: 'Set it back to 5 in docs/apps-scripts/gmail-to-airtable.gs and paste into RGA Outreach Sync. Holding Day-1 high with no backlog starves the Day 4/9/16/45 follow-up sequence.',
      });
    }
  }
} catch (_e) { /* the .gs is in the other repo; never break drift over it */ }

// ── 3f. An Apps Script edited but never pasted is code that does not run ─────────────────────────
// Apps Script has no auto-deploy, so the repo lies by default: it looks like the source of truth
// while production runs whatever was last pasted by hand. That gap killed FGA report delivery for 37
// days. PASTED_STATE.json records the sha256 of what was actually pasted; this recompares.
try {
  execFileSync('node', [path.join(SCRAPER, 'scripts', 'check-apps-script-paste-owed.mjs')],
    { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  const out = `${e.stdout || ''}${e.stderr || ''}`;
  const m = out.match(/(\d+) SCRIPT\(S\) EDITED BUT NOT PASTED/);
  if (m) {
    const which = [...out.matchAll(/⚠ (.+?)\s{2,}/g)].map((x) => x[1].trim()).slice(0, 3);
    findings.push({
      kind: 'apps-script-paste-owed', severity: 'high',
      msg: `${m[1]} Apps Script(s) edited but never pasted${which.length ? ` — ${which.join(', ')}` : ''}. Production is running the OLD code.`,
      fix: 'Open the repo file, Cmd+A/Cmd+C, paste into the live project, save — then update sha256 + lastPasted in docs/apps-scripts/PASTED_STATE.json. Never update that file without a confirmed paste.',
    });
  } else if (e.status === 2) {
    findings.push({ kind: 'apps-script-state-unknown', severity: 'medium',
      msg: 'Could not determine which Apps Script version is live (PASTED_STATE.json missing or unparseable).',
      fix: 'Restore it — without it there is no record of what production is running.' });
  }
}

// ── 3g. A field the Apps Script writes but Airtable does not have breaks the WHOLE patch ─────────
// Airtable rejects an entire PATCH with 422 on any unknown field. syncReplies writes Replied,
// Reply Date, Reply Sentiment and Suggested Reply in one call; three of those did not exist, so the
// whole write failed and `Replied` was never set - repliers stayed in the follow-up sequence and one
// reply got logged 48 times. Only visible as a 422 in the Apps Script execution log.
try {
  execFileSync('node', [path.join(SCRAPER, 'scripts', 'check-airtable-fields-exist.mjs')],
    { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  const out = `${e.stdout || ''}${e.stderr || ''}`;
  const m = out.match(/(\d+) FIELD\(S\) WRITTEN BUT NOT IN AIRTABLE/);
  if (m) {
    const names = [...out.matchAll(/^\s+• (.+)$/gm)].map((x) => x[1].trim()).slice(0, 4);
    findings.push({
      kind: 'airtable-missing-fields', severity: 'high',
      msg: `${m[1]} field(s) written by gmail-to-airtable.gs do not exist in Airtable${names.length ? ` (${names.join(', ')})` : ''} — every patch containing one fails ENTIRELY.`,
      fix: 'Add the fields in Airtable (Leads table), or stop writing them in the .gs. While missing, replies never set Replied, so repliers keep receiving follow-ups.',
    });
  } else if (e.status === 2) {
    findings.push({ kind: 'airtable-schema-unknown', severity: 'medium',
      msg: 'Could not compare Apps Script writes against the Airtable schema.',
      fix: 'Check the Airtable meta API token scope.' });
  }
}

// ── 3h. Did the Day-1 reservation actually take effect in production? ────────────────────────────
// MIN_DAY1_RESERVATION was raised 5 -> 20 to drain the send backlog. Apps Script has no auto-deploy,
// so the constant means nothing until it is pasted - and the ONLY proof is the next morning's split.
// This compares the LAST-PASTED value against what actually sent, so a paste that never landed shows
// up here instead of being remembered as a human task.
try {
  const out = execFileSync('node', [path.join(SCRAPER, 'scripts', 'check-day1-reservation-took.mjs')],
    { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
  const mm = out.match(/step 1 \(new\)\s+(\d+)[\s\S]*?live MIN_DAY1_RESERVATION\s+(\d+)/)
          || out.match(/live MIN_DAY1_RESERVATION\s+(\d+)[\s\S]*?step 1 \(new\)\s+(\d+)/);
  if (/is BELOW the reservation/.test(out)) {
    const res = (out.match(/live MIN_DAY1_RESERVATION\s+(\d+)/) || [])[1];
    const s1 = (out.match(/step 1 \(new\)\s+(\d+)/) || [])[1];
    findings.push({
      kind: 'day1-reservation-not-taking', severity: 'medium',
      msg: `Day-1 sends (${s1}) are below MIN_DAY1_RESERVATION (${res}) on the last completed send day.`,
      fix: 'If the send queue still has a backlog, the Apps Script paste did not take - check MIN_DAY1_RESERVATION in the LIVE editor. If the queue is drained, this is fine: the reservation is a floor, not a quota.',
    });
  }
} catch (e) {
  const out = `${e.stdout || ''}${e.stderr || ''}`;
  if (/above the reservation/.test(out)) {
    findings.push({ kind: 'day1-reservation-exceeded', severity: 'high',
      msg: 'Day-1 sends exceeded MIN_DAY1_RESERVATION - the follow-up/Day-1 split is not being honoured.',
      fix: 'Check advanceFunnelState effectiveCap math in the live Apps Script.' });
  }
}

// ── 4. External quota runway ─────────────────────────────────────────────────────────────────────
// 🔴 2026-08-24 — SerpApi sat at 691 of 5,000 with the month still running. The pre-flight guard only
// ABORTS below 100, which is a hard stop with no warning: by the time it fires, the night is already
// lost. A quota that will run out in three nights needs saying on night one, not night three.
// Same principle as the OpenAI credit outage that cost a night — an external balance is a dependency,
// and dependencies get reported before they bite ([[feedback-notify-openai-quota]]).
try {
  const env = Object.fromEntries(
    fs.readFileSync(path.join(SCRAPER, '.env'), 'utf8').split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
  if (env.SERPAPI_KEY) {
    const r = await fetch(`https://serpapi.com/account?api_key=${env.SERPAPI_KEY}`, { signal: AbortSignal.timeout(15000) });
    if (r.ok) {
      const a = await r.json();
      const left = Number(a.total_searches_left);
      // Measured: a one-category night costs roughly 50-100 searches (website discovery + audits).
      const PER_NIGHT = 100;
      if (Number.isFinite(left)) {
        const nights = Math.floor(left / PER_NIGHT);
        if (left < PER_NIGHT) {
          findings.push({ kind: 'serpapi-quota', severity: 'high',
            msg: `SerpApi has ${left} searches left — less than one night's worth. The pre-flight guard will ABORT the run.`,
            fix: 'Top up at serpapi.com/dashboard before 21:00.' });
        } else if (nights <= 8) {   // ~a week's notice, not a surprise
          findings.push({ kind: 'serpapi-quota', severity: 'medium',
            msg: `SerpApi has ${left} searches left (~${nights} night(s) at ~${PER_NIGHT}/night). Used ${a.this_month_usage ?? '?'} of ${a.searches_per_month ?? '?'} this month.`,
            fix: 'Top up or let the month roll over — but know the run aborts below 100, not at 0.' });
        }
      }
    }
  }
} catch { /* an unreachable quota API is not a finding — never guess a balance */ }

if (JSON_OUT) { console.log(JSON.stringify({ findings }, null, 2)); process.exit(0); }

if (!findings.length) { console.log('✅ No operational drift.'); process.exit(0); }
console.log('===== OPERATIONAL DRIFT =====');
for (const f of findings) {
  console.log(`  ${f.severity === 'high' ? '🔴' : '⚠️'} ${f.msg}`);
  console.log(`     → ${f.fix}`);
}
process.exit(0);
