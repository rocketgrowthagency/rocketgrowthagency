#!/usr/bin/env node
// scripts/check-absence-finding-gates.mjs
//
// Static scan of step-6-voiceover.mjs that flags any absence finding (claim
// of the form "no X" / "you don't have X" / "X is missing") that ISN'T
// wrapped in a verification gate. Companion to scripts/regression-audit-detectors.mjs
// (which tests specific cases). This script catches a different failure mode:
// a NEW absence finding added in the future without a gate.
//
// Exit:  0 = clean, 1 = ungated absence finding(s) detected
// Usage: node scripts/check-absence-finding-gates.mjs
//
// Locked 2026-05-21 alongside the universal verification-gate hardening pass.
// Memory: feedback_verification_gates_must_be_strict.md.

import fs from 'fs';
import path from 'path';
import url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '..', 'step-6-voiceover.mjs');
const src = fs.readFileSync(SRC, 'utf-8');

const ABSENCE_KW = /\b(no\s|don'?t\s|doesn'?t|isn'?t|aren'?t|missing|lack|haven'?t)/i;
const GATE_TOKENS = ['Verified', 'ParsedCount', 'webVerified', 'mobVerified', 'gbpVerified', 'noUrl', 'isParked', 'isSuspect', 'sitePhones.length'];

function findAllEnclosingIfs(src, pushStart) {
  let pos = pushStart - 1;
  let depth = 0;
  const ifs = [];
  while (pos > 0) {
    const c = src[pos];
    if (c === '}') depth++;
    else if (c === '{') {
      if (depth === 0) {
        const look = src.slice(Math.max(0, pos - 400), pos);
        const m = look.match(/if\s*\(([^)]+(?:\([^)]*\)[^)]*)*)\)\s*$/);
        if (m) ifs.push(m[1].trim());
      } else {
        depth--;
      }
    }
    pos--;
  }
  return ifs;
}

const pattern = /out\.push\(\{[^}]*?key:\s*'([a-zA-Z0-9]+)'[^}]*?score:\s*([0-9.]+)[^}]*?finding:\s*[`'"]([^`'"]{15,800})[`'"]/gs;
const gaps = [];
let m;
while ((m = pattern.exec(src)) !== null) {
  const [, key, scoreStr, finding] = m;
  const score = parseFloat(scoreStr);
  if (score >= 100) continue; // positives are a different risk class
  if (!ABSENCE_KW.test(finding.slice(0, 120))) continue;
  const enclosingIfs = findAllEnclosingIfs(src, m.index);
  const joined = enclosingIfs.join(' | ');
  const hasGate = GATE_TOKENS.some((tok) => joined.includes(tok));
  if (!hasGate) gaps.push({ key, joined: joined.slice(0, 120) });
}

if (gaps.length) {
  console.log(`❌ ${gaps.length} ungated absence finding(s) detected — every absence claim MUST require a verification gate:`);
  for (const g of gaps) console.log(`  - ${g.key}: enclosing=${g.joined}`);
  console.log('\nFix: wrap the out.push in `if (xVerified === true && ...)` where xVerified proves the data was actually scraped.');
  console.log('See memory/feedback_verification_gates_must_be_strict.md');
  process.exit(1);
}
console.log('✓ Zero ungated absence findings in step-6-voiceover.mjs');
