#!/usr/bin/env node
// scripts/verify-email.mjs — spot-check a single address through the canonical layered pipeline
// (free denylist/disposable → free MX → Bouncer). Shows which layer decided + the send/hold/drop verdict.
//
// Usage:  node scripts/verify-email.mjs someone@business.com
//         VERIFY_ENGINE=free node scripts/verify-email.mjs someone@business.com   (skip Bouncer)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { verifyEmailLayered } = require(path.join(ROOT, 'lib', 'verify-pipeline.cjs'));

try {
  const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')
    .filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
  if (env.BOUNCER_API_KEY && !process.env.BOUNCER_API_KEY) process.env.BOUNCER_API_KEY = env.BOUNCER_API_KEY;
} catch (_) { /* no .env — pipeline runs free-only */ }

const email = process.argv[2];
if (!email) { console.error('Usage: node scripts/verify-email.mjs <email>'); process.exit(1); }

(async () => {
  const d = await verifyEmailLayered(email);
  const verdict = d.decision === 'drop' ? 'DROP + suppress'
    : d.decision === 'hold' ? 'HOLD (retain, re-verify)'
    : 'SEND';
  console.log(`\n  ${email}`);
  console.log(`  decided by : ${d.tier}${d.creditSpent ? ' (1 Bouncer credit)' : ' (free)'}`);
  console.log(`  result     : ${d.result}  (${d.reason})`);
  console.log(`  VERDICT    : ${verdict}\n`);
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
