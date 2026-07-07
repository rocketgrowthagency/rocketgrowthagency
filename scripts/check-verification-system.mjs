#!/usr/bin/env node
// scripts/check-verification-system.mjs
//
// REGRESSION GUARD for the email-verification system (locked 2026-07-07). Asserts every layer is
// present + behaving, and that the SEND PATH still honors suppression. Exit 0 = intact, 1 = a
// regression (details printed). Run pre-flight in daily-deliverability-guard.sh so a broken
// verification system ABORTS before it can leak bounces. Run manually anytime:
//   node scripts/check-verification-system.mjs
//
// This is the "never regress" backstop Chris asked for — mirrors the website's check-locked-pages.mjs.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(path.dirname(ROOT), 'Rocket Growth Agency Website VS Code');
const fails = [];
const ok = (m) => console.log('  ✓ ' + m);
const bad = (m) => { fails.push(m); console.log('  ✗ ' + m); };

// 1. Required files exist
console.log('\n[1] files present');
for (const rel of ['lib/email-validation.cjs', 'lib/verify-email-bouncer.cjs', 'lib/verify-pipeline.cjs',
  'config/disposable-domains.txt', 'scripts/verify-sendable-mailboxes.mjs', 'scripts/compare-free-vs-bouncer.mjs']) {
  fs.existsSync(path.join(ROOT, rel)) ? ok(rel) : bad(`MISSING ${rel}`);
}

// 2. Disposable list is substantial + has known disposables
console.log('\n[2] disposable blocklist');
const { isLikelyEmail, isDisposableDomain, DISPOSABLE_DOMAINS } = require(path.join(ROOT, 'lib', 'email-validation.cjs'));
DISPOSABLE_DOMAINS.size >= 50000 ? ok(`${DISPOSABLE_DOMAINS.size} domains loaded`) : bad(`only ${DISPOSABLE_DOMAINS.size} disposable domains (expected ≥50k — list not loading?)`);
for (const d of ['mailinator.com', 'guerrillamail.com', '10minutemail.com']) {
  isDisposableDomain(d) ? ok(`flags ${d}`) : bad(`does NOT flag known disposable ${d}`);
}

// 3. Free layer: known-bad rejected, known-good accepted
console.log('\n[3] free denylist / malformed');
const BAD = ['flawless@customerstatus.com', 'test@mailinator.com', 'info@napalawoffice.com.com',
  'stressful.@usjunkyards.com', 'jane.doe@aireserv.com', 'info@yelp.com', 'user@domain.com'];
const GOOD = ['info@realplumbing.com', 'edna@californiahitechplumbing.com', 'hello@rocketgrowthagency.com'];
for (const e of BAD) isLikelyEmail(e) ? bad(`should REJECT ${e}`) : ok(`rejects ${e}`);
for (const e of GOOD) isLikelyEmail(e) ? ok(`accepts ${e}`) : bad(`should ACCEPT ${e}`);

// 4. Pipeline decisions (free-only, 0 credits)
console.log('\n[4] layered pipeline decisions (free-only)');
process.env.VERIFY_ENGINE = 'free';
const { verifyEmailLayered } = require(path.join(ROOT, 'lib', 'verify-pipeline.cjs'));
const cases = [
  ['test@mailinator.com', 'drop'], ['flawless@customerstatus.com', 'drop'],
  ['info@realplumbing.com', 'send'], ['hello@rocketgrowthagency.com', 'send'],
];
for (const [e, want] of cases) {
  const d = await verifyEmailLayered(e);
  d.decision === want ? ok(`${e} → ${d.decision}`) : bad(`${e} → ${d.decision}, expected ${want}`);
}

// 5. Gate uses the pipeline
console.log('\n[5] gate wired to pipeline');
const gate = fs.readFileSync(path.join(ROOT, 'scripts', 'verify-sendable-mailboxes.mjs'), 'utf8');
gate.includes('verify-pipeline') && gate.includes('verifyEmailLayered') ? ok('verify-sendable-mailboxes imports the pipeline') : bad('gate no longer uses verify-pipeline');

// 6. CRITICAL: send path honors suppression (both senders filter NOT({Suppressed}))
console.log('\n[6] send path honors suppression (the load-bearing invariant)');
const gsPath = path.join(WEB, 'docs', 'apps-scripts', 'gmail-to-airtable.gs');
if (!fs.existsSync(gsPath)) { bad(`send-path Apps Script not found at ${gsPath}`); }
else {
  const gs = fs.readFileSync(gsPath, 'utf8');
  const suppressCount = (gs.match(/NOT\(\{Suppressed\}\)/g) || []).length;
  gs.includes('function createOutreachDrafts') ? ok('createOutreachDrafts (Day-1 sender) present') : bad('createOutreachDrafts missing from send path');
  gs.includes('function advanceFunnelState') ? ok('advanceFunnelState (follow-up sender) present') : bad('advanceFunnelState missing from send path');
  suppressCount >= 2 ? ok(`NOT({Suppressed}) present in send filters (${suppressCount}×)`)
                     : bad(`NOT({Suppressed}) found only ${suppressCount}× — a sender may no longer exclude suppressed leads!`);
}

// 7. Unit tests pass
console.log('\n[7] email-validation unit tests');
try {
  const out = execFileSync('node', [path.join(ROOT, 'lib', 'email-validation.test.cjs')], { encoding: 'utf8' });
  /(\d+) passed, 0 failed/.test(out) ? ok(out.trim().split('\n').pop()) : bad('unit tests FAILED:\n' + out);
} catch (e) { bad('unit test run errored: ' + e.message); }

// Verdict
if (fails.length) {
  console.error(`\n❌ VERIFICATION SYSTEM REGRESSION — ${fails.length} check(s) failed. Fix before sending.\n`);
  process.exit(1);
}
console.log('\n✅ verification system intact — all layers + send-path suppression verified.\n');
