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

if (JSON_OUT) { console.log(JSON.stringify({ findings }, null, 2)); process.exit(0); }

if (!findings.length) { console.log('✅ No operational drift.'); process.exit(0); }
console.log('===== OPERATIONAL DRIFT =====');
for (const f of findings) {
  console.log(`  ${f.severity === 'high' ? '🔴' : '⚠️'} ${f.msg}`);
  console.log(`     → ${f.fix}`);
}
process.exit(0);
