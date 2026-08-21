#!/usr/bin/env node
/**
 * check-unpublished-heal.mjs — the "scraped but never published" heal must stay wired and honest.
 *
 * ─── WHY (2026-08-21) ────────────────────────────────────────────────────────────────────────────
 * Of the 7 emailable Dermatologists leads lost to the 2026-08-20 dead window, 0 of 7 had an Airtable
 * row and 0 of 7 had a video. Every heal in overnight-local.sh starts from the Airtable LEAD list, so
 * none of them could ever see those leads. Measured across that night: ~150 selected leads dropped,
 * with 8 searches losing 100% of their intake.
 *
 * INVARIANTS
 *  1. WIRED  — overnight-local.sh actually runs it with --apply. An unwired heal is a heal that
 *              never happens, and the morning report would still claim the night was handled.
 *  2. ONE RULE — "should have been built" comes from the pipeline's own select-emailable-leads.py,
 *              never a re-implementation. The first draft re-derived the emailable test and ignored
 *              the >60-mile geo filter, whose purpose is to reject leads whose Maps card renders a
 *              blank or wrong-city map — rebuilding those manufactures bad videos.
 *  3. TWO ARTEFACTS — a lead counts as lost only if it has NEITHER a video NOR a CRM row.
 *  4. FAILS SAFE — an unreachable Airtable must ABORT, never be read as "no leads exist", which
 *              would rebuild the entire backlog.
 *  5. CAPPED, LOUDLY — the overflow beyond --max must be reported, never silently dropped.
 *
 * Exit 0 = healthy, 1 = regression.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HEAL = path.join(HERE, 'heal-unpublished-leads.mjs');
const LOCAL = path.join(HERE, 'overnight-local.sh');

const fail = (m) => { console.error(`✗ FATAL: ${m}`); process.exit(1); };
const ok = (m) => console.log(`  ✓ ${m}`);

if (!fs.existsSync(HEAL)) fail('heal-unpublished-leads.mjs is missing.');
const src = fs.readFileSync(HEAL, 'utf8');

// 1. WIRED
if (!fs.existsSync(LOCAL)) fail('overnight-local.sh not found.');
const local = fs.readFileSync(LOCAL, 'utf8');
const call = local.split('\n').find((l) => /node\s+scripts\/heal-unpublished-leads\.mjs/.test(l));
if (!call) {
  fail('overnight-local.sh never runs heal-unpublished-leads.mjs. Leads skipped before step-8 have no\n' +
       '         Airtable row, so no other heal in that file can ever see them.');
}
if (!/--apply/.test(call)) fail('the nightly call omits --apply — it would report and repair nothing.');
ok('wired into overnight-local.sh with --apply');

// 🔴🔴 6. THIS STEP CAPTURES — it must re-check the night window immediately before running.
// --apply calls rebuild-broken-videos.sh, which records the SCREEN and has no interlock of its own.
// This block runs AFTER the search loop, so on a long night it can start past 07:00 and film Chris's
// desktop into a public outreach video — the 2026-07-18 incident the NO-OVERRIDE interlock exists for.
// The first version of this call carried only a COMMENT asserting it ran inside the window.
// An assumption is not an interlock.
const callIdx = local.indexOf(call);
const guardWindow = local.slice(Math.max(0, callIdx - 900), callIdx);
if (!/10#\$\(date \+%H\)/.test(guardWindow)) {
  fail('the heal does not re-check the clock before capturing. It runs after the search loop, so on a\n' +
       '         long night it would capture into the workday — the exact failure the night-only\n' +
       '         interlock is locked against. A comment saying "runs inside the window" is not a check.');
}
if (!/-ge 7 \] && \[ .*-lt 21 \]/.test(guardWindow)) {
  fail('the heal\'s clock check does not use the 21:00–06:59 capture window.');
}
ok('re-checks the 21:00–06:59 capture window immediately before capturing');

// 2. ONE RULE — must shell out to the pipeline's selector, and must NOT re-derive the emailable test.
if (!/select-emailable-leads\.py/.test(src)) {
  fail('does not use select-emailable-leads.py. "Should have been built" must be the PIPELINE\'s answer,\n' +
       '         or the two rules drift — the bug that produced the orphaned videos.');
}
for (const own of ['isUsableLeadRow', 'extractValidEmail']) {
  if (new RegExp(`\\b${own}\\s*\\(`).test(src)) {
    fail(`re-implements the emailable test via ${own}(). That is a SECOND rule for a question the\n` +
         `         selector already answers, and it silently bypasses the >60-mile geo filter.`);
  }
}
ok('defers to select-emailable-leads.py (no duplicated emailable rule)');

// 3. TWO ARTEFACTS
if (!/hasVideo\s*\(/.test(src)) fail('never checks for a video on disk.');
if (!/known\.has\(/.test(src)) fail('never checks whether an Airtable row already exists — it would rebuild healthy leads.');
ok('requires BOTH artefacts missing before calling a lead lost');

// 4. FAILS SAFE on an unreachable CRM
const cat = src.indexOf('catch (e)');
const around = cat === -1 ? '' : src.slice(cat, cat + 420);
if (!/ABORT|Refusing to guess/.test(around) || !/process\.exit\(0\)/.test(around)) {
  fail('an Airtable read failure does not abort. Reading an unreachable CRM as "no leads exist" would\n' +
       '         rebuild the entire backlog (feedback_indeterminate_is_not_a_finding).');
}
ok('aborts on an unreachable Airtable instead of guessing');

// 5. CAPPED, LOUDLY
if (!/--max|MAX/.test(src)) fail('no cap — an uncapped backlog would eat the night and starve the fresh scrape.');
if (!/carry to the next run|capped at/.test(src)) {
  fail('the cap is silent. A truncated pass that does not say so reads as "covered everything".');
}
ok('capped, and reports the overflow');

// ── BEHAVIOURAL — the report must distinguish a DEAD WINDOW from scattered failures ──────────────
// A whole search at 100% loss and a handful scattered across many searches need opposite responses;
// if the output cannot tell them apart, the morning report cannot either.
if (!/ENTIRE search lost/.test(src)) {
  fail('the by-search breakdown does not flag a search that lost 100% of its intake, which is the\n' +
       '         signature that separates a systemic dead window from ordinary per-lead build failures.');
}
ok('flags searches that lost their entire intake');

console.log('✅ unpublished-lead heal: wired, single-rule, artefact-verified, fails safe, capped.');
