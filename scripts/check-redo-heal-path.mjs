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

  // 🔴 2026-08-18 — THE FOUR CHECKS ABOVE ALL PASSED WHILE THE PATH WAS BROKEN.
  // Check 4 only asserts that the gate UN-LEDGERS. Un-ledgering is necessary but NOT sufficient:
  // next-search builds `done` from the ledger AND from every Airtable lead row carrying that Search
  // Term, so one deployed lead re-adds the search and the un-ledger is cancelled out. Measured on
  // "Yoga studios in Culver City, CA" — ledger line gone, done.has(term) still true from the 5
  // deployed rows, the 4 failed leads unreachable. The gate reported 4/4 the whole time: a check that
  // cannot observe the outcome it is guarding reads as a pass ([[feedback-dead-check-selector-gap]]).
  { name: 'un-ledger is paired with the pending-rebuild override',
    ok: () => /pending-rebuild-searches/.test(read('scripts/next-search.mjs'))
           && /done\.delete/.test(read('scripts/next-search.mjs'))
           && /pending-rebuild-searches/.test(read('scripts/overnight-pipeline.sh')),
    why: 'un-ledgering alone is cancelled by any deployed lead in the same search; without the override file the pre-step-8 losses (6/6 gate, watchdog, step-3 WebM count) are unreachable forever' },

  { name: 'the pending-rebuild queue self-clears',
    ok: () => /PENDING_REBUILD_FILE/.test(read('scripts/overnight-pipeline.sh'))
           && /Self-clear the rebuild queue/.test(read('scripts/overnight-pipeline.sh')),
    why: 'a permanent queue entry re-picks the same category every night forever (cost: 17 re-runs / ~13h on Painters)' },

  { name: 'pre-step-8 loss paths re-arm',
    ok: () => {
      const s = read('scripts/overnight-pipeline.sh');
      // All three must call the helper, or that path silently loses its leads with no way back.
      return /unledger_search_for_redo "\$BIZ_NAME" "below 6\/6"/.test(s)
          && /unledger_search_for_redo "\$biz" "watchdog-timeout"/.test(s)
          && /unledger_search_for_redo "\$BIZ_NAME" "step-3 incomplete/.test(s);
    },
    why: 'the 6/6 gate, the watchdog and the step-3 WebM check all kill the lead BEFORE step-8 writes its Airtable row, so reconcile-missing-videos.mjs can never see it' },

  { name: 're-arming is capped',
    ok: () => /MAX_UNLEDGER_REDOS/.test(read('scripts/overnight-pipeline.sh'))
           && /exhausted after/.test(read('scripts/overnight-pipeline.sh')),
    why: 'an always-failing lead would re-arm forever and pin the pipeline to one category, eating the nightly capacity' },
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
