#!/usr/bin/env node
/**
 * check-redo-heal-path.mjs — static guard on the THREE things a flagged redo needs to actually heal.
 * Every one of them has silently broken before, and the symptom is identical each time: the redo queue
 * just never drains (0 of 10 healed on 2026-08-11) while everything reports success.
 *
 *   1. next-search must re-pick an armed redo's search        (feedback_redo_heal_requires_repickable_search)
 *   2. dedup must NOT blank an armed redo's email             (it matches ITSELF on the re-scrape)
 *   3. a gate block must still arm when the lead has no Airtable row yet (first-time builds)
 *
 * Usage: node scripts/check-redo-heal-path.mjs   Exit 0 = intact, 1 = the redo queue can't drain.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const CHECKS = [
  { name: 'next-search re-picks armed redos',
    ok: () => /redo-armed/.test(read('scripts/next-search.mjs')) && /redoPending/.test(read('scripts/next-search.mjs')),
    why: 'without it the search never re-runs, so the lead is never re-scraped' },
  { name: 'dedup index tracks armed redos',
    ok: () => /armedRedos/.test(read('lib/dedup-by-email.mjs')),
    why: 'the index must know which records are waiting to rebuild' },
  { name: 'dedup lets an armed redo through',
    ok: () => /armedRedos\?\.has\(matchedRecordId\)/.test(read('step-2-email-scraper.mjs')),
    why: 'a re-scraped redo matches ITSELF; blocking it blanks the email and step-3 skips the lead' },
  { name: 'gate blocks arm without an Airtable row',
    ok: () => /no Airtable row yet \(first-time build\)/.test(read('build-video-landing.mjs')),
    why: 'first-time builds have no lead row until step-8, so nothing was ever queued for retry' },
];

let bad = 0;
for (const c of CHECKS) {
  let pass = false;
  try { pass = !!c.ok(); } catch { pass = false; }
  if (pass) console.log(`  ✓ ${c.name}`);
  else { console.error(`  ✗ ${c.name} — ${c.why}`); bad++; }
}
if (bad) {
  console.error(`\n❌ ${bad} break(s) in the redo heal path — flagged videos will never rebuild.`);
  process.exit(1);
}
console.log(`\n✅ redo heal path intact (${CHECKS.length}/${CHECKS.length}).`);
