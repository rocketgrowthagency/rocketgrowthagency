#!/usr/bin/env node
// scripts/check-duplicate-listing-same-business.mjs
//
// Regression guard for the DUPLICATE-LISTING false-positive (caught 2026-06-12, Chris).
//
// step-2.5's SerpAPI duplicate lookup counted any listing sharing 2+ name tokens as
// a "duplicate of you", so genuinely DIFFERENT competitors with similar names were
// flagged. Doctor Pipe | Los Angeles Plumbing Specialist falsely flagged "Pipe Doctor
// Rooter & Plumbing Company" (reversed words, different address/Place ID/phone, 55 vs
// 13 reviews) as a duplicate → video claimed "Google shows 1 other listing under your
// business name." A REAL duplicate is the SAME business listed twice.
//
// Two-layer fix this test locks:
//   1. step-2.5 — match requires the candidate title to contain the target's ORDERED
//      brand phrase AND (when phones known) the same phone.
//   2. step-6  — trueDuplicateCount() recomputes from stored duplicateListings using the
//      same ordered-brand-phrase test, correcting CACHED audits at render time.
//
// Usage:  node scripts/check-duplicate-listing-same-business.mjs   (0 = pass, 1 = fail)
// Runs pre-flight in scripts/overnight-pipeline.sh.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const fail = (m) => { console.error(`  ✗ ${m}`); failed++; };
const pass = (m) => console.log(`  ✓ ${m}`);

// ── static presence ─────────────────────────────────────────────────────────
const step6 = fs.readFileSync(path.join(ROOT, 'step-6-voiceover.mjs'), 'utf8');
const step25 = fs.readFileSync(path.join(ROOT, 'step-2.5-audit.mjs'), 'utf8');
if (/function trueDuplicateCount\s*\(/.test(step6) && /isSameListedBusiness/.test(step6) && /const dupCount = trueDuplicateCount/.test(step6))
  pass('step-6 recounts duplicates via trueDuplicateCount (ordered brand phrase)');
else fail('step-6 trueDuplicateCount guard MISSING — competitor listings would count as your duplicates');
if (/tgtPhrase/.test(step25) && /n\.includes\(tgtPhrase\)/.test(step25))
  pass('step-2.5 duplicate match requires the target ordered brand phrase');
else fail('step-2.5 ordered-brand-phrase duplicate filter MISSING');

// ── logic (mirrors step-6 trueDuplicateCount) ───────────────────────────────
const DUP = new Set(['the','and','for','llc','inc','ltd','co','corp','of','at','your','best','top','our','dba','garage','door','doors','repair','repairs','service','services','company','companies','shop','store','center','centers','solution','solutions','group','team','home','professional','professionals','expert','experts','specialist','specialists','pro','pros','plumbing','plumber','plumbers','hvac','heating','cooling','air','conditioning','comfort','roofing','roofer','roofers','rooter','rooters','locksmith','locksmiths','dentist','dental','auto','automotive','car','cars','painting','painters','cleaning','cleaners','water','landscaping','landscape','lawn','tree','trees','pest','control','exterminator','electric','electrician','electricians','contractor','contractors','construction','remodeling','los','angeles','beverly','hills','santa','monica','city','county','ca']);
function phrase(name) { const t = String(name||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(Boolean); const p=[]; for (const x of t){ if(x.length<2||DUP.has(x)){if(p.length)break;else continue;} p.push(x);} return p.join(' '); }
function same(tn, ct){ const bp=phrase(tn); if(!bp)return false; const c=String(ct||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim(); return c.includes(bp); }
function count(target, listings){ const s=listings.filter(d=>same(target,d.title)); const ids=new Set(s.map(d=>d.placeId).filter(Boolean)); return Math.max(0, ids.size-1); }

const CASES = [
  ['Doctor Pipe | Los Angeles Plumbing Specialist',
    [{title:'Doctor Pipe | Los Angeles Plumbing Specialist',placeId:'a'},{title:'Pipe Doctor Rooter & Plumbing Company',placeId:'b'}], 0,
    'reversed-word competitor is NOT a duplicate'],
  ['A-1 Performance Rooter & Plumbing',
    [{title:'A-1 Performance Rooter & Plumbing',placeId:'a'},{title:'A-1 Performance Rooter and Plumbing',placeId:'b'}], 1,
    'two real same-name listings = 1 duplicate'],
  ['Doctor Pipe',
    [{title:'Doctor Pipe',placeId:'a'},{title:'Doctor Pipe LA',placeId:'b'},{title:'Pipe Doctor Rooter',placeId:'c'}], 1,
    'keeps real dup, drops reversed-word competitor'],
  ['ABC Plumbing',
    [{title:'ABC Plumbing',placeId:'a'},{title:'XYZ Drains',placeId:'b'}], 0,
    'unrelated competitor is not a duplicate'],
];
for (const [target, listings, expect, note] of CASES) {
  const got = count(target, listings);
  if (got === expect) pass(`count=${got} — ${target} (${note})`);
  else fail(`${target}: expected ${expect} got ${got} (${note})`);
}

if (failed) { console.error(`\nduplicate-listing same-business guard: ${failed} FAILED`); process.exit(1); }
console.log('\nduplicate-listing same-business guard: all checks passed');
