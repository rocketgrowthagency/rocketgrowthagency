#!/usr/bin/env node
/**
 * check-step8-owns-its-input.mjs — step-8 writes to the CRM. It must never guess silently.
 *
 * ─── WHY (2026-08-24) ────────────────────────────────────────────────────────────────────────────
 * Invoked as `node step-8-publish-to-airtable.mjs "<hive-pro csv>"`, step-8 accepted only `--file=`
 * and `$STEP2_CSV`. The positional path was SILENTLY DISCARDED, execution fell through to
 * latestStep2Csv() — newest by mtime — and it published a completely different business:
 *
 *     [step-8] reading 2026-08-23_american-city-pest-and-termite-…csv    ← not what was passed
 *     [step-8] ✓ patched 1 in Leads
 *     [step-8] done — created=0, patched=1.
 *
 * The count was TRUE. It patched a real record. Just not the one anyone asked for — while hive-pro
 * got no row at all and its already-live video became an orphan. Four separate Airtable queries (name,
 * email, video URL, website domain) all returned zero before the cause became visible, because the log
 * line naming the file scrolled past unread.
 *
 * > **A wrong write that reports success is worse than a crash.** The crash stops. This propagates,
 * > and every downstream heal believes the counter.
 *
 * INVARIANTS
 *  1. A positional `*.csv` argument is honoured as the input.
 *  2. A path-shaped argument that is NOT a csv ABORTS. Never guess an input for a process that writes.
 *  3. The mtime fallback still exists (run-queue/run-pipeline rely on it) but ANNOUNCES itself, names
 *     the file, and says what it beat — a silent guess is indistinguishable from an instruction.
 *  4. A stale guess (>24h) is fatal, so step-8 cannot republish yesterday's leads as fresh.
 *
 * Exit 0 = healthy, 1 = regression.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const STEP8 = path.join(ROOT, 'step-8-publish-to-airtable.mjs');

const fail = (m) => { console.error(`✗ FATAL: ${m}`); process.exit(1); };
const ok = (m) => console.log(`  ✓ ${m}`);

if (!fs.existsSync(STEP8)) fail('step-8-publish-to-airtable.mjs is missing.');
const raw = fs.readFileSync(STEP8, 'utf8');
const src = raw.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');

// 1 + 2 — static
if (!/POSITIONAL/.test(src) || !/\\\.csv\$\/i\.test\(a\)/.test(src)) {
  fail('a positional .csv argument is not honoured. It was silently discarded once already, and step-8\n' +
       '         published a different business than the one it was handed.');
}
ok('a positional .csv argument is read as the input');

if (!/unrecognised argument/.test(src) || !/process\.exit\(2\)/.test(src)) {
  fail('a path-shaped argument that is not a csv does not abort. Falling through to a guess is how the\n' +
       '         wrong CRM record got patched.');
}
ok('an unrecognised path-shaped argument aborts');

// 3 — the guess must be loud
if (!/NO INPUT SPECIFIED/.test(src)) {
  fail('the mtime fallback is silent. In the log a silent guess is indistinguishable from an explicit\n' +
       '         instruction, which is precisely why this went unnoticed.');
}
for (const needed of ['chose:', 'beat ']) {
  if (!src.includes(needed)) fail(`the fallback warning omits "${needed}" — it must name the file and what it beat.`);
}
ok('the mtime fallback announces itself, the file, and what it beat');

// 4 — stale guard
if (!/24 \* 60/.test(src)) {
  fail('no staleness bound on the guess. Publishing an old CSV pushes stale leads in as freshly scraped.');
}
ok('a guess older than 24h is fatal');

// ── BEHAVIOURAL — actually run it ────────────────────────────────────────────────────────────────
const run = (args) => {
  try {
    return { code: 0, out: execFileSync('node', [STEP8, ...args], { cwd: ROOT, encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout || ''}${e.stderr || ''}` };
  }
};

const stray = run(['./definitely/not/a/csv', '--dry-run']);
if (stray.code !== 2 || !/unrecognised argument/i.test(stray.out)) {
  fail(`a stray path did not abort (exit ${stray.code}). It must never reach the publish path.`);
}
ok('behavioural: a stray path aborts with exit 2');

// Find any real step-2 csv to prove the positional form is actually read.
const dir = path.join(ROOT, 'output', 'Step 2');
const csv = fs.existsSync(dir)
  ? fs.readdirSync(dir).filter((n) => /\[step-2\]\.csv$/.test(n)).sort().pop()
  : null;
if (csv) {
  const r = run([path.join(dir, csv), '--dry-run']);
  if (!r.out.includes(csv)) {
    fail(`passed ${csv} but step-8 read something else — the positional path is still being ignored.`);
  }
  if (/NO INPUT SPECIFIED/.test(r.out)) {
    fail('step-8 fell through to the mtime guess despite being handed an explicit file.');
  }
  ok(`behavioural: the file passed positionally is the file read (${csv.slice(0, 44)}…)`);
} else {
  console.log('  – no step-2 CSV present to exercise the positional path (static checks stand)');
}

console.log('✅ step-8 owns its input: explicit wins, strays abort, and a guess says so out loud.');
