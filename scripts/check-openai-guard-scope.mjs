#!/usr/bin/env node
/**
 * check-openai-guard-scope.mjs — the mid-run OpenAI guard must be SEARCH-scoped and RE-PROBED.
 *
 * WHY THIS EXISTS (2026-08-21, real loss)
 * `$LOGFILE` is DAY-scoped — "/tmp/overnight-pipeline-<date>.log" — and every search on that date
 * appends to it. The mid-run OpenAI-credit guard grepped the WHOLE file, so ONE transient 429 latched
 * it for the rest of the calendar day.
 *
 * On 2026-08-20 a 04:13 credit outage (already fixed by a top-up hours earlier) made the 21:00 run skip
 * EVERY lead across 7 searches. Filesystem proof: all 39 videos that night were written between 00:15
 * and 06:57 — not one between 21:00 and midnight — because DATE_STAMP rolled at 00:00 and handed the
 * run a clean logfile. The alert re-fired once per search, so it read as noise instead of a stuck
 * pipeline, and the morning report showed a search with 0 videos.
 *
 * TWO INVARIANTS, both required:
 *   1. SCOPE   — the guard reads only lines added since this search's baseline, never the bare $LOGFILE.
 *   2. CONFIRM — a log 429 is not proof; it must be re-probed live before latching.
 *
 * Exit 0 = both hold. Exit 1 = a regression. Runs pre-flight in overnight-pipeline.sh.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 🔴 fileURLToPath, never new URL().pathname — this repo's path contains spaces and pathname
// percent-encodes them, which silently breaks every child process (see project_orphaned_videos.md).
const HERE = path.dirname(fileURLToPath(import.meta.url));
// argv[2] lets a sabotage test point at a mutated COPY, so proving this guard can fail never requires
// editing the real pipeline (feedback_a_test_nobody_runs_is_not_a_guard: a guard nobody can break is
// indistinguishable from one that always passes).
const PIPE = process.argv[2] || path.join(HERE, 'overnight-pipeline.sh');

const fail = (msg) => { console.error(`✗ FATAL: ${msg}`); process.exit(1); };
const ok = (msg) => console.log(`  ✓ ${msg}`);

if (!fs.existsSync(PIPE)) fail(`overnight-pipeline.sh not found at ${PIPE}`);
const src = fs.readFileSync(PIPE, 'utf8');

// The credit signature the guard looks for. Kept here so the test breaks loudly if the guard's
// wording drifts away from what step-6 actually logs.
const SIGNATURE = /no credits remaining\|429 \.\*no credits\|add credits to continue\|exceeded your current quota/;

// ── 1. SCOPE ──────────────────────────────────────────────────────────────────
// Locate the guard's signature test and prove it is not reading the whole logfile.
const sigLines = src.split('\n')
  .map((l, i) => ({ l, n: i + 1 }))
  .filter(({ l }) => SIGNATURE.test(l) && /grep/.test(l));

if (!sigLines.length) fail('could not find the mid-run OpenAI signature grep at all — has the guard been removed?');

for (const { l, n } of sigLines) {
  // The pre-flight probe block is allowed to reference the raw log; the per-lead GUARD is not.
  if (/grep\s+-qiE\s+"[^"]*"\s+"\$LOGFILE"/.test(l)) {
    fail(`line ${n}: guard greps the whole DAY-scoped $LOGFILE. One transient 429 will latch it for the\n` +
         `         rest of the calendar day (2026-08-20: 7 searches, ~3 h of leads skipped).\n` +
         `         It must read only this search's own output, e.g. tail -n "+$((baseline+1))" "$LOGFILE".`);
  }
}
ok('guard does not grep the whole day-scoped $LOGFILE');

if (!/tail -n "\+\$\(\( *_ogb_now \+ 1 *\)\)" "\$LOGFILE"/.test(src)) {
  fail('the search-scoped read (tail from the per-search baseline) is missing.');
}
ok('guard reads only lines added since this search\'s baseline');

if (!/rga-openai-guard-baseline/.test(src)) fail('the per-search baseline marker file is never written.');
// The baseline must be (re)written at SEARCH START, not only inside the guard, or the very first
// search of a date would inherit whatever the file held from the previous run.
const baselineWrites = (src.match(/> \/tmp\/rga-openai-guard-baseline/g) || []).length;
if (baselineWrites < 2) {
  fail(`baseline is written ${baselineWrites}x — expected >=2 (once at search start, once when a\n` +
       `         transient 429 is cleared). Without the start write it carries over between searches.`);
}
ok(`baseline written at search start and on transient-clear (${baselineWrites} sites)`);

// ── 2. CONFIRM ────────────────────────────────────────────────────────────────
// A log 429 must be re-probed live before the guard latches and starts skipping leads.
const guardIdx = src.indexOf('_ogb_now');
const guardTail = guardIdx === -1 ? '' : src.slice(guardIdx, guardIdx + 2600);
if (!/_oai_recheck=\$\(curl/.test(guardTail)) {
  fail('no live re-probe before latching. A 429 already fixed by a top-up would still skip every\n' +
       '         remaining lead — exactly the 2026-08-20 failure.');
}
ok('latching is gated on a live re-probe, not on log text alone');

if (!/rga-openai-out-confirmed/.test(src)) {
  fail('no confirmed-out latch marker. A shell variable cannot work here — the guard runs inside\n' +
       '         parallel worker subshells that cannot mutate the parent environment.');
}
ok('confirmed-out latch uses a marker FILE (survives worker subshells)');

// Indeterminate (000 / no key / network down) must be treated as STILL OUT — the log signature came
// from a real TTS call that really failed, so continuing would burn captures that can get no audio.
if (!/_oai_recheck:-000\}" = "000"/.test(guardTail)) {
  fail('an unreachable probe (HTTP 000) is not treated as still-out. That fails OPEN on a network\n' +
       '         blip and wastes a night of captures with no voiceover.');
}
ok('indeterminate probe (000) fails closed');

// Both markers must be re-armed at search start or a latch would persist across searches forever.
for (const m of ['rga-openai-out-alerted', 'rga-openai-out-confirmed']) {
  if (!new RegExp(`rm -f /tmp/${m}`).test(src)) fail(`marker /tmp/${m} is never cleared at run start.`);
}
ok('both markers re-armed at run start');

// ── 3. BEHAVIOURAL — the scoping mechanism actually isolates a stale signature ──
// Static checks can drift from reality; prove the tail-from-baseline arithmetic on a real fixture.
const tmp = path.join(process.env.TMPDIR || '/tmp', `rga-guard-scope-${process.pid}.log`);
try {
  const stale = '     ⚠️  TTS error attempt 1/3: 429 You have no credits remaining. Add credits to continue';
  fs.writeFileSync(tmp, ['old line', stale, 'old line'].join('\n') + '\n');
  const baseline = fs.readFileSync(tmp, 'utf8').split('\n').length - 1;   // this search starts here
  fs.appendFileSync(tmp, ['=== Overnight pipeline: Test ===', 'fresh work', 'fresh work'].join('\n') + '\n');

  const all = fs.readFileSync(tmp, 'utf8');
  const scoped = all.split('\n').slice(baseline).join('\n');
  const re = /no credits remaining|429 .*no credits|add credits to continue|exceeded your current quota/i;

  if (!re.test(all)) fail('sensor self-test broken: the stale signature is not detectable at all.');
  if (re.test(scoped)) fail('SCOPING IS INEFFECTIVE — a previous search\'s 429 is still visible to this search.');
  ok('behavioural: a prior search\'s 429 is invisible to the current search');

  // And the opposite direction — a signature INSIDE this search must still be caught, or the guard
  // is merely disabled rather than corrected.
  fs.appendFileSync(tmp, stale + '\n');
  const scoped2 = fs.readFileSync(tmp, 'utf8').split('\n').slice(baseline).join('\n');
  if (!re.test(scoped2)) fail('SENSOR DEAD — a 429 inside this search is no longer detected.');
  ok('behavioural: a 429 inside this search IS still detected');
} finally {
  try { fs.unlinkSync(tmp); } catch { /* fixture cleanup is best-effort */ }
}

console.log('✅ mid-run OpenAI guard: search-scoped, re-probed, fails closed on indeterminate.');
