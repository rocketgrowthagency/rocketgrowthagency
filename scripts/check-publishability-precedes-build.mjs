#!/usr/bin/env node
/**
 * check-publishability-precedes-build.mjs — never spend a build on a lead the publisher will refuse.
 *
 * ─── WHY (2026-08-24) ────────────────────────────────────────────────────────────────────────────
 * katie-b-creative received a complete build — scrape, capture, voiceover, branding, deploy — and only
 * THEN did step-8 reject it as a directory/generic listing:
 *
 *     [step-8] 1 raw rows, 1 filtered (directory/generic), 0 real, 0 with valid email
 *     [step-8] nothing to publish.
 *
 * The video is live and can never be emailed. That is an ORPHAN, and it was manufactured by spending
 * on a lead the publisher was always going to refuse. 4 of the 8 recent orphans had that shape.
 *
 * > The publisher's verdict is knowable BEFORE the spend. Ask it first.
 *
 * Same principle as the step-3 maps assertion: a stage that can refuse should be consulted before the
 * expensive stage, not after.
 *
 * 🔒 ONE RULE. The check runs step-8's REAL filter via `--check-publishable`, not a re-implementation.
 * A second copy of "is this a real business" drifts from the first, and the two answers then disagree
 * exactly when it matters ([[feedback-a-test-nobody-runs-is-not-a-guard]]).
 *
 * INVARIANTS
 *  1. step-8 supports --check-publishable and exits 3 when nothing is publishable, 0 when something is.
 *  2. It reuses the real filter — the check mode sits AFTER the actual `rows` filter, not beside it.
 *  3. rebuild-broken-videos.sh consults it BEFORE step-3/step-6 (capture and voiceover).
 *  4. A refusal is recorded as `not-publishable`, not silently skipped.
 *
 * Exit 0 = healthy, 1 = regression.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const STEP8 = path.join(ROOT, 'step-8-publish-to-airtable.mjs');
const RUNNER = path.join(HERE, 'rebuild-broken-videos.sh');

const fail = (m) => { console.error(`✗ FATAL: ${m}`); process.exit(1); };
const ok = (m) => console.log(`  ✓ ${m}`);

const s8 = fs.readFileSync(STEP8, 'utf8');
const sh = fs.readFileSync(RUNNER, 'utf8');

// 1 + 2 — the mode exists and reuses the real filter.
if (!/--check-publishable/.test(s8)) fail('step-8 has no --check-publishable mode.');
const iFilter = s8.indexOf('isGenericOrDirectoryListing(r)');
const iCheck = s8.indexOf('--check-publishable', s8.indexOf('async function main'));
if (iFilter === -1 || iCheck === -1 || !(iFilter < iCheck)) {
  fail('the check mode does not sit after step-8\'s real row filter, so it is not reusing that verdict.\n' +
       '         A parallel copy of the rule drifts, and then the pre-build answer and the publish answer\n' +
       '         disagree exactly when it matters.');
}
ok('the check mode reuses step-8\'s real filter (one rule, not a copy)');

// 3 — wired ahead of the expensive stages.
const iWire = sh.indexOf('--check-publishable');
const iCapture = sh.indexOf('step-3-video-recorder.mjs');
const iVoice = sh.indexOf('step-6-voiceover.mjs');
if (iWire === -1) fail('rebuild-broken-videos.sh never asks whether the lead is publishable.');
if (!(iWire < iCapture && iWire < iVoice)) {
  fail('the publishability check runs AFTER capture or voiceover. Its whole purpose is to precede the\n' +
       '         spend — asking afterwards is what created the orphan in the first place.');
}
ok('the runner asks before capture and before the voiceover');

// 4 — recorded, not silent.
// Require BOTH call sites. A bare substring test passed while note_fail had been changed to "skip",
// because the reason still appeared in the FAILED+=() line — the ledger would have recorded a generic
// skip while the batch summary claimed otherwise. Two places write this reason; both must say it.
if (!/note_fail "\$SLUG" "not-publishable"/.test(sh)) {
  fail('the refusal is not written to the failure LEDGER as not-publishable. The ledger is what the\n' +
       '         morning report tallies — a generic "skip" there hides why the lead was dropped.');
}
if (!/FAILED\+=\("\$SLUG:not-publishable"\)/.test(sh)) {
  fail('the refusal is not carried into the batch FAILED list as not-publishable.');
}
ok('a refusal is recorded as not-publishable in both the ledger and the batch summary');

// ── BEHAVIOURAL — build fixtures and run the real binary ─────────────────────────────────────────
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pubcheck-'));
const HEAD = 'Business Name,Website,Phone,Email,Rating,Reviews,Detected Category,Google Maps URL,Map Rank';
const write = (name, line) => {
  const p = path.join(dir, `2026-08-24_${name}-[step-2].csv`);
  fs.writeFileSync(p, `${HEAD}\n${line}\n`);
  return p;
};

// An aggregator-hosted listing WITH a valid email — the case that slipped through: the no-email guard
// cannot catch it, so only the publisher's own filter can.
const bad = write('aggregator', 'Some Listing,https://www.yelp.com/biz/whatever,,hello@example.com,4.5,12,Photographer,https://maps.google.com/?cid=1,3');
const good = write('real', 'Real Business Inc,https://realbusiness.example,310-555-0100,owner@realbusiness.example,4.8,42,Photographer,https://maps.google.com/?cid=2,4');

const run = (csv) => {
  try {
    execFileSync('node', [STEP8, csv, '--check-publishable'], { cwd: ROOT, encoding: 'utf8', timeout: 90000, stdio: ['ignore', 'pipe', 'pipe'] });
    return 0;
  } catch (e) { return e.status ?? 1; }
};

const badCode = run(bad);
if (badCode !== 3) {
  fail(`an aggregator listing WITH a valid email exited ${badCode}, expected 3. This is precisely the\n` +
       '         lead the no-email guard cannot catch — if the publisher does not refuse it here, it gets\n' +
       '         a full build and becomes an orphan.');
}
ok('behavioural: an aggregator listing with a valid email is refused (exit 3)');

const goodCode = run(good);
if (goodCode !== 0) fail(`a legitimate business exited ${goodCode}, expected 0 — this would block real work.`);
ok('behavioural: a legitimate business passes (exit 0)');

fs.rmSync(dir, { recursive: true, force: true });
console.log('✅ the publisher is consulted before the spend, using its own rule.');
