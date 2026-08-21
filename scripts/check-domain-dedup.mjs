#!/usr/bin/env node
/**
 * check-domain-dedup.mjs — one website must never become several prospects.
 *
 * ─── WHY (2026-08-21) ────────────────────────────────────────────────────────────────────────────
 * Chris opened the video for "Neal M. Ammar, MD" and saw Beach Cities Dermatology's website. Nothing had
 * been contaminated — Google's own Maps data lists three separate entities on one site:
 *
 *     Beach City Dermatology / William J. Wickwire, MD / Neal M. Ammar, MD → beachcitiesderm.com
 *
 * One practice was about to receive THREE cold emails, each with a video about the same website. Across
 * 25 searches: 46 same-domain groups, 66 redundant leads. Kaiser Permanente appeared as 4 "prospects".
 * That reads as spam to the recipient and burns the sending domain the whole system depends on.
 *
 * INVARIANTS
 *  1. WIRED   — overnight-pipeline.sh runs the dedup between select-emailable-leads.py and the build.
 *  2. FAILS OPEN — if dedup errors, the raw list is used. Building a duplicate is far cheaper than
 *              dropping a real prospect (feedback_unreachable_contact_emails: a false positive DROPS
 *              a real prospect).
 *  3. KEEPS THE PRACTICE — of leads sharing a domain, the survivor is the one whose name matches the
 *              domain, not an arbitrary first-wins.
 *  4. NEVER COLLAPSES UNKNOWNS — no website, unparsable website, or an aggregator host (yelp,
 *              facebook, booksy…) must never merge two businesses into one.
 *
 * Exit 0 = healthy, 1 = regression.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER = path.dirname(HERE);
const DEDUP = path.join(HERE, 'dedupe-by-website-domain.mjs');
const PIPE = path.join(HERE, 'overnight-pipeline.sh');

const fail = (m) => { console.error(`✗ FATAL: ${m}`); process.exit(1); };
const ok = (m) => console.log(`  ✓ ${m}`);

if (!fs.existsSync(DEDUP)) fail('dedupe-by-website-domain.mjs is missing.');
const pipeSrc = fs.readFileSync(PIPE, 'utf8');

// 1. WIRED — and specifically on the path that feeds the build.
if (!/node scripts\/dedupe-by-website-domain\.mjs/.test(pipeSrc)) {
  fail('overnight-pipeline.sh never runs the domain dedup. A group practice will receive one cold\n' +
       '         email per physician, all about the same website.');
}
if (!/emailable_leads\.txt/.test(pipeSrc.slice(pipeSrc.indexOf('dedupe-by-website-domain.mjs')))) {
  fail('the dedup output does not feed /tmp/emailable_leads.txt — the build would use the raw list.');
}
ok('wired between select-emailable-leads.py and the build');

// 2. FAILS OPEN
const after = pipeSrc.slice(pipeSrc.indexOf('dedupe-by-website-domain.mjs'), pipeSrc.indexOf('dedupe-by-website-domain.mjs') + 900);
if (!/cp \/tmp\/emailable_raw\.txt \/tmp\/emailable_leads\.txt/.test(after)) {
  fail('no fail-open fallback to the raw list. If dedup errors the night would build NOTHING, which is\n' +
       '         far worse than building a duplicate.');
}
ok('falls back to the raw list if dedup errors or empties');

// ── BEHAVIOURAL ──────────────────────────────────────────────────────────────────────────────────
const tmp = path.join(process.env.TMPDIR || '/tmp', `rga-dedup-check-${process.pid}.csv`);
const run = (names) => {
  try {
    return execFileSync('node', [DEDUP, tmp], { input: names.join('\n') + '\n', encoding: 'utf8', cwd: SCRAPER })
      .split('\n').map((s) => s.trim()).filter(Boolean);
  } catch (e) { fail(`dedup crashed: ${(e.stderr || e.message || '').toString().trim()}`); }
};

try {
  // 3. KEEPS THE PRACTICE — the real Beach Cities case, with the practice listed LAST so a naive
  //    first-wins implementation would keep a practitioner and fail this test.
  fs.writeFileSync(tmp, [
    'Business Name,Email,Phone,Website',
    'Neal M. Ammar MD,a@x.test,(310) 555-0101,http://www.beachcitiesderm.com/',
    'William J. Wickwire MD,b@x.test,(310) 555-0102,http://www.beachcitiesderm.com/',
    'Beach City Dermatology,c@x.test,(310) 555-0103,http://beachcitiesderm.com/',
  ].join('\n') + '\n');
  const kept = run(['Neal M. Ammar MD', 'William J. Wickwire MD', 'Beach City Dermatology']);
  if (kept.length !== 1) fail(`three listings on one domain should collapse to 1, got ${kept.length}.`);
  if (!/Beach City Dermatology/i.test(kept[0])) {
    fail(`kept "${kept[0]}" — the survivor must be the PRACTICE whose name matches the domain, not a\n` +
         `         practitioner. A first-wins rule would email the doctor and drop the business.`);
  }
  ok('collapses a group practice to the practice itself');

  // 4a. Distinct domains must all survive.
  fs.writeFileSync(tmp, [
    'Business Name,Email,Phone,Website',
    'Alpha Clinic,a@x.test,(310) 555-0101,https://alphaclinic.test/',
    'Beta Clinic,b@x.test,(310) 555-0102,https://betaclinic.test/',
  ].join('\n') + '\n');
  if (run(['Alpha Clinic', 'Beta Clinic']).length !== 2) fail('collapsed two DIFFERENT domains — that deletes a real prospect.');
  ok('never collapses distinct domains');

  // 4b. No website, and aggregator hosts, must never merge unrelated businesses.
  fs.writeFileSync(tmp, [
    'Business Name,Email,Phone,Website',
    'Nowebsite One,a@x.test,(310) 555-0101,',
    'Nowebsite Two,b@x.test,(310) 555-0102,',
    'Yelp One,c@x.test,(310) 555-0103,https://www.yelp.com/biz/one',
    'Yelp Two,d@x.test,(310) 555-0104,https://www.yelp.com/biz/two',
  ].join('\n') + '\n');
  const kept2 = run(['Nowebsite One', 'Nowebsite Two', 'Yelp One', 'Yelp Two']);
  if (kept2.length !== 4) {
    fail(`websiteless/aggregator listings collapsed (${kept2.length}/4 kept). Two businesses that both\n` +
         `         have no site, or both sit on yelp.com, are NOT the same prospect.`);
  }
  ok('never collapses websiteless or aggregator-hosted leads');
} finally {
  try { fs.unlinkSync(tmp); } catch { /* best effort */ }
}

console.log('✅ domain dedup: wired, fails open, keeps the practice, never merges unknowns.');
