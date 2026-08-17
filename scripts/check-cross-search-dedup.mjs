#!/usr/bin/env node
// scripts/check-cross-search-dedup.mjs
//
// Regression guard for the ONE-EMAIL-PER-BUSINESS-EVER rule (Chris, 2026-06-03 +
// re-emphasized 2026-06-12). A business that appears in multiple searches (e.g. Roto-
// Rooter or any legit shop in BOTH "Plumbers in Beverly Hills" AND "Plumbers in Culver
// City") must get exactly ONE video + ONE cold email — ever. The 2nd+ appearance is
// captured as data on the existing Airtable record, never re-rendered or re-emailed.
//
// Enforcement chain this test locks:
//   1. lib/dedup-by-email.mjs checkDuplicate() matches by normalized (case-insensitive)
//      EMAIL first, then Place ID, against an index of ALL existing Airtable leads.
//   2. step-2-email-scraper.mjs CLEARS the email (record.email='') on a dedup match.
//   3. overnight-pipeline.sh builds emailable_leads.txt requiring a valid '@' email, so
//      email-cleared (deduped) rows are excluded from rendering + outreach. step-2.5/
//      step-3 also skip empty-email rows.
//
// Usage:  node scripts/check-cross-search-dedup.mjs   (0 = pass, 1 = fail)
// Runs pre-flight in scripts/overnight-pipeline.sh.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const fail = (m) => { console.error(`  ✗ ${m}`); failed++; };
const pass = (m) => console.log(`  ✓ ${m}`);

// ── logic: the REAL checkDuplicate against a realistic index ─────────────────
const { checkDuplicate } = await import('../lib/dedup-by-email.mjs');
const index = {
  emailToRecord: new Map([['info@rotorooter.com', 'recRoto'], ['hello@lordsplumbing.com', 'recLords']]),
  placeIdToRecord: new Map([['PID_ROTO', 'recRoto'], ['PID_LORDS', 'recLords']]),
  domainToRecord: new Map([['rotorooter.com', 'recRoto'], ['lordsplumbing.com', 'recLords']]),
};
const L = [
  ['same email, exact', { email: 'info@rotorooter.com', placeId: '' }, true, 'email'],
  ['same email, different CASE', { email: 'INFO@RotoRooter.com', placeId: '' }, true, 'email'],
  ['same email w/ whitespace', { email: '  hello@lordsplumbing.com ', placeId: '' }, true, 'email'],
  ['same Place ID, no email', { email: '', placeId: 'PID_LORDS' }, true, 'placeId'],
  ['brand-new business', { email: 'new@freshco.com', placeId: 'PID_NEW' }, false, null],
  // website-domain dedup (2026-07-11): franchise 2nd location — different city, NO email, NEW Place ID,
  // but SAME corporate domain → dedup by domain (don't render/email a 2nd time).
  ['franchise 2nd loc, same domain', { email: '', placeId: 'PID_ROTO_SF', website: 'https://www.rotorooter.com/sanfrancisco/' }, true, 'domain'],
  ['same domain, no scheme/path', { email: '', placeId: '', website: 'rotorooter.com' }, true, 'domain'],
  // MUST NOT over-dedup: shared-host builder pages (business.site / Google Sites / Yelp) — many distinct
  // businesses share the hostname → domain key is suppressed → treated as brand-new.
  ['distinct biz on business.site', { email: '', placeId: 'PID_X', website: 'https://coolplumbingla.business.site/' }, false, null],
  ['distinct biz on Google Sites', { email: '', placeId: 'PID_Y', website: 'https://sites.google.com/view/abcplumbing' }, false, null],
  ['distinct biz on Yelp page', { email: '', placeId: 'PID_Z', website: 'https://www.yelp.com/biz/some-plumber' }, false, null],
  ['distinct local, own domain', { email: '', placeId: 'PID_W', website: 'https://garysrooter.com/' }, false, null],
];
for (const [label, input, expectDup, expectBy] of L) {
  const r = checkDuplicate(input, index);
  if (r.isDuplicate === expectDup && (!expectDup || r.matchedBy === expectBy)) pass(`${label} → dup=${r.isDuplicate}${r.matchedBy ? ' by ' + r.matchedBy : ''}`);
  else fail(`${label} → got dup=${r.isDuplicate} by ${r.matchedBy} (expected dup=${expectDup} by ${expectBy})`);
}

// ── static: the enforcement chain must stay intact ──────────────────────────
const s2 = fs.readFileSync(path.join(ROOT, 'step-2-email-scraper.mjs'), 'utf8');
const ov = fs.readFileSync(path.join(ROOT, 'scripts', 'overnight-pipeline.sh'), 'utf8')
  // 2026-08-17: the emailable-list builder moved out of an inline heredoc into its own script so the
  // geographic filter could be tested. The invariant is unchanged and still load-bearing — step-2
  // CLEARS the email on a cross-search dedup match, so requiring a valid email is what keeps a
  // deduped business from getting a second video. Scan both files so this follows the code.
  + '\n' + fs.readFileSync(path.join(ROOT, 'scripts', 'select-emailable-leads.py'), 'utf8');
if (/isDuplicate/.test(s2) && /record\.email\s*=\s*''/.test(s2) && /Skip Reason.*dedup/.test(s2))
  pass('step-2 clears email + flags Skip Reason on cross-search dedup match');
else fail('step-2 dedup email-clear MISSING — deduped leads could be re-rendered/re-emailed');
if (/preloadDedupIndex/.test(s2)) pass('step-2 preloads the full Airtable dedup index');
else fail('step-2 preloadDedupIndex call MISSING');
if (/'@' in email/.test(ov)) pass('overnight emailable-list builder requires a valid email (excludes deduped rows)');
else fail('overnight emailable-list builder no longer gates on email — deduped rows could leak in');

if (failed) { console.error(`\ncross-search dedup: ${failed} FAILED`); process.exit(1); }
console.log('\ncross-search dedup: all checks passed (one email per business, ever)');
