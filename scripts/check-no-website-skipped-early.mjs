#!/usr/bin/env node
/**
 * check-no-website-skipped-early.mjs — never pay for a build whose score is capped below the gate.
 *
 * ─── WHY (2026-08-24) ────────────────────────────────────────────────────────────────────────────
 * Two of the six verification signals are `website.websiteAuditVerified` and
 * `mobile.mobileAuditVerified` (scripts/lib/verification-signals.mjs). With no website to audit, both
 * are permanently false, so the ceiling is **4/6** and the hard 6/6 gate ALWAYS blocks.
 *
 * kings-pest-control-culver-city paid a full step-2.5 audit, a step-3 capture and a step-6 voiceover
 * before failing at exactly that:
 *
 *     [step-6 verification-state] Kings Pest Control Culver City: 4/6 verified —
 *       {"website":{"verified":false},"mobile":{"verified":false},...}
 *     ⚠ below 6/6 — correctly blocked
 *
 * The gate was right. The spend was avoidable: the answer sits in the CSV before anything runs.
 * Across the 200 most recent step-2 CSVs, **28 emailable leads have no website at all**.
 *
 * > A lead whose maximum possible score is below the pass mark is not a build. It is a skip.
 *
 * Third instance of the same lesson today, after the step-3 maps assertion and the publishability
 * pre-check: consult the thing that will refuse you BEFORE you pay.
 *
 * INVARIANTS
 *  1. The runner checks for a website before capture and before the voiceover.
 *  2. `Discovered Website` counts — a site found by discovery is still a site to film.
 *  3. An UNREADABLE CSV must NOT be treated as "no website". Absent data is not a verdict.
 *  4. The skip is recorded as `no-website` in both the ledger and the batch summary.
 *
 * Exit 0 = healthy, 1 = regression.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNNER = path.join(HERE, 'rebuild-broken-videos.sh');
const SIGNALS = path.join(HERE, 'lib', 'verification-signals.mjs');

const fail = (m) => { console.error(`✗ FATAL: ${m}`); process.exit(1); };
const ok = (m) => console.log(`  ✓ ${m}`);

const sh = fs.readFileSync(RUNNER, 'utf8');

// 0 — the premise must still hold: website/mobile really are gated on a verified audit.
const sig = fs.readFileSync(SIGNALS, 'utf8');
if (!/website:\s*audit\?\.website\?\.websiteAuditVerified === true/.test(sig)
 || !/mobile:\s*audit\?\.mobile\?\.mobileAuditVerified === true/.test(sig)) {
  fail('the website/mobile signals no longer require a verified audit. This skip is only sound while a\n' +
       '         website-less lead is arithmetically capped below 6/6 — re-derive it before trusting it.');
}
ok('premise holds: website+mobile need a verified audit, so no site ⇒ max 4/6');

// 1 — ordering.
const iCheck = sh.indexOf('no-website');
const iCapture = sh.indexOf('step-3-video-recorder.mjs');
const iVoice = sh.indexOf('step-6-voiceover.mjs');
if (iCheck === -1) fail('the runner never checks for a missing website.');
if (!(iCheck < iCapture && iCheck < iVoice)) {
  fail('the website check runs AFTER capture or voiceover — which is the spend it exists to avoid.');
}
ok('checked before capture and before the voiceover');

// 2 — discovered websites count.
if (!/discovered website/i.test(sh)) {
  fail('`Discovered Website` is ignored. A site found by discovery is still a site to film, and skipping\n' +
       '         those would drop buildable leads.');
}
ok('a Discovered Website counts as a website');

// 3 — unreadable ≠ absent.
// 🔴 Test the CODE, not the prose. The first version matched /UNKNOWN/ against the whole file, and the
// word appears in the comment ABOVE the check — so replacing `print('UNKNOWN')` with `print('')`
// (turning every unreadable CSV into a permanent "no website" verdict) still PASSED. A check a comment
// can satisfy is a check that survives the deletion of the thing it guards.
const shCode = sh.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
if (!/print\('UNKNOWN'\)/.test(shCode)) {
  fail('an unreadable CSV is not distinguished from "no website" IN CODE. Turning a failed read into a\n' +
       '         verdict is how a transient error becomes a permanently dropped lead.');
}
ok('an unreadable CSV falls through instead of becoming a verdict');

// 4 — recorded in both places.
if (!/note_fail "\$SLUG" "no-website"/.test(sh)) fail('the skip is not written to the failure ledger as no-website.');
if (!/FAILED\+=\("\$SLUG:no-website"\)/.test(sh)) fail('the skip is not carried into the batch summary as no-website.');
ok('recorded as no-website in the ledger and the batch summary');

// ── BEHAVIOURAL — run the runner's own extraction expression on real fixtures ────────────────────
const EXPR = `
import csv,sys
try:
    r=list(csv.DictReader(open(sys.argv[1],encoding='utf-8',errors='replace')))[0]
    low={(k or '').strip().lower():(v or '').strip() for k,v in r.items()}
    print(low.get('website') or low.get('discovered website') or '')
except Exception:
    print('UNKNOWN')`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nosite-'));
const mk = (n, body) => { const p = path.join(dir, n); fs.writeFileSync(p, body); return p; };
const cases = [
  ['no website at all',      mk('a.csv', 'Business Name,Website,Discovered Website,email\nNo Site,,,a@b.com\n'), ''],
  ['has a website',          mk('b.csv', 'Business Name,Website,Discovered Website,email\nSite,https://x.example,,a@b.com\n'), 'https://x.example'],
  ['discovered website only',mk('c.csv', 'Business Name,Website,Discovered Website,email\nDisc,,https://y.example,a@b.com\n'), 'https://y.example'],
  ['unreadable file',        path.join(dir, 'missing.csv'), 'UNKNOWN'],
];
for (const [label, file, want] of cases) {
  const got = execFileSync('python3', ['-c', EXPR, file], { encoding: 'utf8' }).trim();
  if (got !== want) fail(`behavioural "${label}": expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}.`);
  ok(`behavioural: ${label} → ${got === '' ? 'SKIP' : got === 'UNKNOWN' ? 'falls through' : 'build'}`);
}
fs.rmSync(dir, { recursive: true, force: true });

console.log('✅ a lead that cannot reach 6/6 is skipped before the spend, and a failed read never decides.');
