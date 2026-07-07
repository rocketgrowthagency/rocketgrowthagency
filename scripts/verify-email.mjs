#!/usr/bin/env node
// scripts/verify-email.mjs — spot-check a single address through the SAME layers the pipeline uses:
//   1. isLikelyEmail (syntax + placeholder + aggregator/vendor denylist) — free, catches wrong-domain
//   2. Bouncer (if BOUNCER_API_KEY set) else SMTP probe — mailbox deliverability
//
// Usage:  node scripts/verify-email.mjs someone@business.com
//         node scripts/verify-email.mjs flawless@customerstatus.com

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { isLikelyEmail } = require(path.join(ROOT, 'lib', 'email-validation.cjs'));
const { verifyMailbox } = require(path.join(ROOT, 'lib', 'verify-mailbox.cjs'));
const { verifyEmailBouncer } = require(path.join(ROOT, 'lib', 'verify-email-bouncer.cjs'));

try {
  const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')
    .filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
  if (env.BOUNCER_API_KEY && !process.env.BOUNCER_API_KEY) process.env.BOUNCER_API_KEY = env.BOUNCER_API_KEY;
} catch (_) { /* no .env — Bouncer just won't run */ }

const email = process.argv[2];
if (!email) { console.error('Usage: node scripts/verify-email.mjs <email>'); process.exit(1); }

(async () => {
  console.log(`\nVerifying: ${email}\n`);

  // Layer 1 — free syntax/denylist gate
  const clean = isLikelyEmail(email);
  if (!clean) {
    console.log('  1. Syntax/denylist ...... ✗ REJECTED (placeholder, malformed, or aggregator/vendor domain)');
    console.log('\n  VERDICT: DROP — never reaches the mailbox check.\n');
    return;
  }
  console.log(`  1. Syntax/denylist ...... ✓ passes (${clean})`);

  // Layer 2 — mailbox verification
  const useBouncer = !!process.env.BOUNCER_API_KEY && process.env.VERIFY_ENGINE !== 'smtp';
  if (useBouncer) {
    try {
      const b = await verifyEmailBouncer(clean);
      console.log(`  2. Bouncer .............. ${b.result.toUpperCase()}  (status=${b.status}, reason=${b.reason}${b.cached ? ', cached' : ''})`);
      const drop = b.result === 'invalid' || b.result === 'disposable';
      const hold = b.result === 'catch-all' || b.result === 'risky' || b.result === 'unknown';
      console.log(`\n  VERDICT: ${drop ? 'DROP + suppress' : hold ? 'HOLD (send only under strict-favorable / re-verify)' : 'SEND'}\n`);
      return;
    } catch (e) {
      console.log(`  2. Bouncer .............. (unavailable: ${e.message}) — falling back to SMTP`);
    }
  } else {
    console.log('  2. Bouncer .............. (no BOUNCER_API_KEY — using free SMTP probe)');
  }
  const v = await verifyMailbox(clean);
  console.log(`     SMTP probe ........... ${v.result.toUpperCase()}  (code=${v.code || '-'}, detail=${v.detail})`);
  console.log(`\n  VERDICT: ${v.result === 'invalid' ? 'DROP + suppress' : 'SEND (fail-open; only 5xx mailboxes dropped)'}\n`);
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
