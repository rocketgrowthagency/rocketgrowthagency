#!/usr/bin/env node
/**
 * check-run-productivity.mjs — "the run ran, but did it PRODUCE anything?"
 *
 * ─── WHY THIS EXISTS (2026-08-20, a real half-night lost silently) ───────────────────────────────
 * A latched OpenAI guard made the pipeline SKIP every lead across 7 searches from 21:00 to midnight.
 * Nothing caught it. Not one existing check could have, and the reason is structural:
 *
 *   reconcile-missing-videos, parole, audit-failed-videos and the verdict ALL start from the LEAD
 *   list — "which lead is missing a video?" A lead that was skipped BEFORE any record was written
 *   is unreachable from that direction, exactly like an orphaned video is unreachable from it
 *   (project_orphaned_videos.md). No failures, no gaps, no armed retries: a clean-looking night.
 *
 * The only honest signal is the one nobody was measuring: **work in vs artefacts out.**
 * Filesystem proof beat every log heuristic that night — all 39 videos were written between 00:15
 * and 06:57, none before midnight, which localised the fault to the minute. So this counts real
 * files on disk, never a log's claim of success (feedback_curl_status_is_useless_check_content_type).
 *
 * Usage:
 *   node scripts/check-run-productivity.mjs              # report on last night
 *   node scripts/check-run-productivity.mjs --json       # machine-readable, for the verdict
 *   node scripts/check-run-productivity.mjs --heal       # apply auto-remedies for KNOWN faults
 *
 * Exit 0 = productive (or an explained zero). Exit 1 = an unexplained dead window.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER = path.dirname(HERE);
const SITE_V = path.join(path.dirname(SCRAPER), 'Rocket Growth Agency Website VS Code', 'v');

const ARGS = process.argv.slice(2);
const JSON_OUT = ARGS.includes('--json');
const HEAL = ARGS.includes('--heal');

// ── local date, two-date span ────────────────────────────────────────────────────────────────────
// A night crosses midnight and DATE_STAMP re-stamps per search, so tonight's work is split across
// two files. toISOString() is UTC and would be the WRONG day from 17:00 local onward — the exact bug
// that blinded pipeline-status.mjs for every overnight window it ever ran in.
const localStamp = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const now = new Date();
const DATES = [localStamp(new Date(now.getTime() - 86400000)), localStamp(now)];
const LOGS = DATES.map((d) => `/tmp/overnight-pipeline-${d}.log`).filter((p) => fs.existsSync(p));

if (!LOGS.length) {
  console.log('PRODUCTIVITY: no overnight log for ' + DATES.join(' or ') + ' — nothing to judge.');
  process.exit(0);
}

// ── 1. Work IN: per-search dispatch counts, in chronological order ───────────────────────────────
const searches = [];
for (const lp of LOGS) {
  const lines = fs.readFileSync(lp, 'utf8').split('\n');
  let cur = null;
  for (const line of lines) {
    const head = line.match(/^=== Overnight pipeline: (.+?) ===/);
    if (head) { cur = { name: head[1], started: null, dispatched: 0, skips: [], log: lp }; searches.push(cur); continue; }
    if (!cur) continue;
    const st = line.match(/^Started:\s*(\d{2}:\d{2})/);
    if (st) { cur.started = st[1]; continue; }
    if (/dispatching:/.test(line)) cur.dispatched++;
    // Record WHY a search might legitimately produce nothing, so an explained zero is not an alarm.
    if (/OPENAI OUT OF CREDITS mid-run/.test(line)) cur.skips.push('openai-guard');
    if (/cross-search duplicate\(s\) detected/.test(line)) cur.skips.push('dedup');
    if (/already-emailed leads/.test(line)) cur.skips.push('already-emailed');
  }
}

// ── 2. Artefacts OUT: real files on disk, bucketed by minute ─────────────────────────────────────
// Counting FILES, not log lines. On 2026-08-20 the logs were ambiguous and the mtimes were not.
const builds = [];
if (fs.existsSync(SITE_V)) {
  for (const slug of fs.readdirSync(SITE_V)) {
    const mp4 = path.join(SITE_V, slug, 'video.mp4');
    let st; try { st = fs.statSync(mp4); } catch { continue; }
    builds.push({ slug, t: st.mtime });
  }
}
// The night window: 21:00 on the first date → 07:00 on the second.
const winStart = new Date(`${DATES[0]}T21:00:00`);
const winEnd = new Date(`${DATES[1]}T07:00:00`);
const tonight = builds.filter((b) => b.t >= winStart && b.t <= winEnd).sort((a, b) => a.t - b.t);

// ── 3. Attribute builds to searches by time window ───────────────────────────────────────────────
const withTime = searches.filter((s) => s.started);
for (let i = 0; i < withTime.length; i++) {
  const s = withTime[i];
  // A search's log date is the file it was written to; combine with its clock time.
  const d = s.log.includes(DATES[1]) ? DATES[1] : DATES[0];
  s.startAt = new Date(`${d}T${s.started}:00`);
}
withTime.sort((a, b) => a.startAt - b.startAt);
for (let i = 0; i < withTime.length; i++) {
  const from = withTime[i].startAt;
  const to = i + 1 < withTime.length ? withTime[i + 1].startAt : winEnd;
  withTime[i].built = tonight.filter((b) => b.t >= from && b.t < to).length;
}

const nightly = withTime.filter((s) => s.startAt >= winStart && s.startAt <= winEnd);

// ── 4. FAULT CATALOGUE — signature → cause → remedy ──────────────────────────────────────────────
// Each entry answers the three questions a human would ask at 7am, so the morning report can carry
// the ANSWER rather than a symptom. `auto` marks what the system may fix without being asked.
const CATALOGUE = [
  {
    id: 'openai-guard-latched',
    when: (s) => s.dispatched > 0 && s.built === 0 && s.skips.includes('openai-guard'),
    cause: 'The mid-run OpenAI credit guard latched and skipped every lead in this search.',
    remedy: 'Guard is now search-scoped + live-re-probed (check-openai-guard-scope.mjs). Re-arm the skipped leads.',
    auto: true,
  },
  {
    id: 'nothing-new-to-build',
    when: (s) => s.dispatched === 0 && s.built === 0,
    cause: 'No leads dispatched — the category was already fully worked (dedup / already-emailed).',
    remedy: 'None needed. This is a correct zero, not a failure.',
    auto: false, benign: true,
  },
  {
    id: 'dispatched-but-nothing-built',
    when: (s) => s.dispatched > 0 && s.built === 0,
    cause: 'Leads were dispatched but produced no video, with no known skip signature.',
    remedy: 'UNKNOWN — needs diagnosis. A diagnostic packet has been written.',
    auto: false,
  },
];

const findings = [];
for (const s of nightly) {
  const hit = CATALOGUE.find((c) => c.when(s));
  if (hit && !hit.benign) findings.push({ search: s.name, started: s.started, dispatched: s.dispatched, built: s.built, ...hit });
}

// ── 5. DEAD WINDOW — the signal that actually matters ────────────────────────────────────────────
// One barren search is normal. A CONTIGUOUS RUN of them while work was being dispatched means the
// pipeline was structurally broken, which is what nobody noticed on 2026-08-20.
let dead = null, streak = [];
for (const s of nightly) {
  if (s.dispatched > 0 && s.built === 0) { streak.push(s); if (!dead || streak.length > dead.length) dead = [...streak]; }
  else streak = [];
}
const deadWindow = dead && dead.length >= 2 ? dead : null;

const totalBuilt = tonight.length;
const totalDispatched = nightly.reduce((a, s) => a + s.dispatched, 0);

if (JSON_OUT) {
  console.log(JSON.stringify({ totalBuilt, totalDispatched, searches: nightly.map((s) => ({ name: s.name, started: s.started, dispatched: s.dispatched, built: s.built })), findings, deadWindow: deadWindow?.map((s) => s.name) || null }, null, 2));
  process.exit(deadWindow ? 1 : 0);
}

console.log('===== RUN PRODUCTIVITY =====');
console.log(`window        : ${DATES[0]} 21:00 → ${DATES[1]} 07:00`);
console.log(`videos built  : ${totalBuilt}   (leads dispatched: ${totalDispatched})`);
if (tonight.length) console.log(`first → last  : ${tonight[0].t.toTimeString().slice(0, 5)} → ${tonight[tonight.length - 1].t.toTimeString().slice(0, 5)}`);
console.log('');
for (const s of nightly) {
  const flag = s.dispatched > 0 && s.built === 0 ? '  ⚠️' : '';
  console.log(`  ${s.started}  ${s.name.slice(0, 42).padEnd(42)} dispatched:${String(s.dispatched).padStart(3)}  built:${String(s.built).padStart(3)}${flag}`);
}

if (deadWindow) {
  console.log(`\n🔴 DEAD WINDOW — ${deadWindow.length} consecutive searches dispatched leads and built NOTHING:`);
  for (const s of deadWindow) console.log(`     • ${s.started}  ${s.name}`);
  const known = findings.find((f) => f.auto);
  if (known) {
    console.log(`\n   CAUSE : ${known.cause}`);
    console.log(`   FIX   : ${known.remedy}`);
  } else {
    // Unknown fault: leave a complete packet so the morning fix needs no re-investigation.
    const pkt = path.join('/tmp', `rga-dead-window-${DATES[1]}.txt`);
    fs.writeFileSync(pkt, [
      `DEAD WINDOW ${DATES[0]} → ${DATES[1]}`,
      `searches: ${deadWindow.map((s) => `${s.started} ${s.name} (dispatched ${s.dispatched})`).join('\n          ')}`,
      `logs: ${LOGS.join(', ')}`,
      `builds in window: ${totalBuilt}`,
    ].join('\n'));
    console.log(`\n   CAUSE : UNKNOWN — not in the fault catalogue.`);
    console.log(`   PACKET: ${pkt}`);
  }
} else if (findings.length) {
  console.log(`\n⚠️  ${findings.length} search(es) dispatched work and built nothing (isolated, not a dead window).`);
} else {
  console.log('\n✅ No dead window. Every search either produced videos or had nothing new to build.');
}

if (HEAL) {
  // 🔴 THE REMEDY MUST MATCH THE FAULT'S DIRECTION.
  // The obvious move — run reconcile-missing-videos — is WRONG here and would have silently done
  // nothing. That reconciler starts from the LEAD list, but these leads were skipped before step-8
  // ever wrote a row, so there is no lead to reconcile. Their only recoverable identity is the SEARCH
  // they belonged to, so the repair is to re-queue those searches for the next night.
  // Same lesson as the orphaned videos: pick the direction the evidence actually survives in.
  const autos = findings.filter((f) => f.auto);
  if (!autos.length) {
    console.log('\n(heal) nothing auto-remediable.');
  } else {
    const QUEUE = path.join(SCRAPER, 'output', 'pending-rebuild-searches.txt');
    let existing = [];
    try { existing = fs.readFileSync(QUEUE, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean); } catch { existing = []; }
    const have = new Set(existing.map((l) => l.toLowerCase()));
    const added = [];
    for (const f of autos) {
      // The log records "Chiropractors in Culver City, CA" — already the queue's own format.
      const entry = f.search.trim();
      if (!entry || have.has(entry.toLowerCase())) continue;
      have.add(entry.toLowerCase());
      added.push(entry);
    }
    if (!added.length) {
      console.log('\n(heal) affected searches are already queued — nothing to add.');
    } else {
      // Prepend: these searches produced NOTHING, so they outrank whatever was already waiting.
      fs.writeFileSync(QUEUE, [...added, ...existing].join('\n') + '\n');
      console.log(`\n(heal) re-queued ${added.length} search(es) that built nothing — they run first tonight:`);
      for (const a of added) console.log(`         • ${a}`);
    }
  }
}

process.exit(deadWindow ? 1 : 0);
