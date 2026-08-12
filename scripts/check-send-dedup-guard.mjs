#!/usr/bin/env node
/**
 * check-send-dedup-guard.mjs — REGRESSION GUARD (locked 2026-07-11): the send engine
 * (docs/apps-scripts/gmail-to-airtable.gs) MUST keep the "one first-email per inbox" guard so it can never
 * send two cold #1s to the same email (Chris: "we don't want to send multiple first emails to the same
 * company"). Because the .gs is manually pasted into Apps Script, a stale paste could silently drop it —
 * this asserts the source-of-truth file still contains both layers. See feedback_company_dedup_protocol.
 *
 * Exit 0 = present, exit 1 = missing (a paste regressed the guard). Wired into the daily deliverability guard.
 */
import fs from 'node:fs';

const GS = '/Users/chris/RGA/Rocket Growth Agency Website VS Code/docs/apps-scripts/gmail-to-airtable.gs';
let src;
try { src = fs.readFileSync(GS, 'utf8'); }
catch (e) { console.error('✗ cannot read gmail-to-airtable.gs: ' + e.message); process.exit(1); }

// Only inspect the createOutreachDrafts function body (where #1s are sent).
const start = src.indexOf('function createOutreachDrafts()');
const body = start >= 0 ? src.slice(start, start + 6000) : '';
let fail = 0;
const need = (re, label) => { if (re.test(body)) console.log('  ✓ ' + label); else { console.error('  ✗ MISSING: ' + label); fail++; } };

if (start < 0) { console.error('✗ createOutreachDrafts() not found — send engine changed shape; verify the dedup guard by hand.'); process.exit(1); }
need(/alreadyFirstTouched/, 'cross-row inbox guard (alreadyFirstTouched set built from Draft Created / Email Sent Date)');
need(/!alreadyFirstTouched\.has\(/, 'sendable filter excludes an inbox already first-touched on another row');
need(/sentThisRunEmails/, 'within-run inbox guard (sentThisRunEmails) so two never-touched dupes cant both send');

if (fail) { console.error(`\nFAIL: ${fail} send-dedup guard check(s) missing — a stale .gs paste dropped the "one first-email per inbox" protection. Re-paste the current gmail-to-airtable.gs.`); process.exit(1); }
console.log('\nPASS: send engine enforces one first-email per inbox (cross-row + within-run).');
