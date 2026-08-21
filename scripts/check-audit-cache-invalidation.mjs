#!/usr/bin/env node
/**
 * check-audit-cache-invalidation.mjs — a 6/6 failure must not be made permanent by a cached audit.
 *
 * ─── WHY (2026-08-21) ────────────────────────────────────────────────────────────────────────────
 * `rebuild-broken-videos.sh` reuses today's `audit-findings.json` if it exists. That is correct for a
 * step-3/step-4 retry — re-scraping Google costs minutes and a CAPTCHA budget. It is catastrophic when
 * the previous failure was a VERIFICATION signal, because the retry re-reads the same bad scrape and
 * fails identically. Forever.
 *
 * California Dermatology Institute failed `5/6 — Missing: reviews` three times (09:35, 10:26, 11:25).
 * SerpApi independently reports **rating 4.5, 6 reviews** — the business HAS reviews. The first scrape
 * returned `review cards found: 0, widget=true, emptyState=false`, and every retry reused that zero.
 *
 * Two costs, both severe:
 *   • the lead can never heal, no matter how many nights run;
 *   • a BAD SCRAPE becomes indistinguishable from a genuinely thin listing, so the failure looks like
 *     the prospect's fault. "Missing: reviews" is the largest single rejection reason (7 of 11).
 *
 * It also silently voided the documented "re-run before you fix it" rule
 * (feedback_blank_photos_is_transient) — re-running proves nothing if the retry never re-scrapes.
 *
 * INVARIANTS
 *  1. The cache is invalidated when the failure ledger shows a prior verification failure for the slug.
 *  2. It is invalidated BEFORE the cache-hit branch, or the stale file is read anyway.
 *  3. The cache still applies otherwise — re-scraping every retry would burn the CAPTCHA budget.
 *  4. The ledger count is read safely (`${n:-0}`), never `grep -c … || echo 0`.
 *
 * Exit 0 = healthy, 1 = regression.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REBUILD = path.join(HERE, 'rebuild-broken-videos.sh');

const fail = (m) => { console.error(`✗ FATAL: ${m}`); process.exit(1); };
const ok = (m) => console.log(`  ✓ ${m}`);

if (!fs.existsSync(REBUILD)) fail('rebuild-broken-videos.sh not found.');
const src = fs.readFileSync(REBUILD, 'utf8');

// 1 + 2. Invalidation exists and precedes the cache-hit branch.
const invIdx = src.indexOf('discarding the cached audit');
const cacheIdx = src.indexOf('step-2.5 cached');
if (invIdx === -1) {
  fail('no cached-audit invalidation. A lead that failed 6/6 will re-read the same bad scrape on every\n' +
       '         retry and can never heal — and the bad scrape will look like a thin listing.');
}
if (cacheIdx === -1) fail('the step-2.5 cache branch is gone — every retry would re-scrape and burn the CAPTCHA budget.');
if (!(invIdx < cacheIdx)) {
  fail('invalidation runs AFTER the cache-hit branch, so the stale audit is read anyway.');
}
ok('cached audit is invalidated before the cache-hit branch');

// The trigger must be a PRIOR VERIFICATION failure, not "always".
const block = src.slice(Math.max(0, invIdx - 1400), invIdx + 400);
if (!/rebuild-failures\.tsv/.test(block)) {
  fail('invalidation is not driven by the failure ledger — it cannot know a verification failure happened.');
}
if (!/below-6of6/.test(block)) {
  fail('invalidation does not key on below-6of6, the failure mode it exists to break out of.');
}
ok('keyed on a prior below-6of6 in the failure ledger');

// 3. Not unconditional — the cache must still work for ordinary retries.
if (/rm -f "output\/Step 2\.5 \(Audit\)\/\$\{RUN\}\/audit-findings\.json"\s*\n\s*fi\s*\n\s*#? *step-2\.5 audit —/.test(src)
    && !/_prior_verif_fail/.test(block)) {
  fail('the audit is discarded unconditionally — every retry would re-scrape Google.');
}
ok('cache still applies when the prior failure was not a verification failure');

// 4. Safe numeric read — the most-repeated bug in this repo.
if (/grep -c[^\n]*\|\|\s*echo 0/.test(block)) {
  fail('uses `grep -c … || echo 0`. On an empty file grep prints 0 AND exits 1, so BOTH fire and the\n' +
       '         substitution captures "0\\n0", which makes the test throw (feedback_empty_output_...).');
}
if (!/_prior_verif_fail:-0|_prior_verif_fail=\$\{_prior_verif_fail:-0\}/.test(block)) {
  fail('the ledger count is not defaulted with ${n:-0}; an empty ledger would make the test throw.');
}
ok('ledger count read safely with ${n:-0}');

// ── BEHAVIOURAL — the awk probe must actually count the right rows ───────────────────────────────
const tmp = path.join(process.env.TMPDIR || '/tmp', `rga-ledger-${process.pid}.tsv`);
const countFor = (slug) => {
  const out = execFileSync('awk', ['-F\t', `$2=="${slug}" && $3 ~ /below-6of6|gate/ {n++} END{print n+0}`, tmp], { encoding: 'utf8' });
  return Number(out.trim());
};
try {
  fs.writeFileSync(tmp, [
    '2026-08-21\tcalifornia-dermatology-institute\tbelow-6of6\t',
    '2026-08-21\tsome-other-lead\tstep-3-timeout\t',
    '2026-08-21\tcalifornia-dermatology-institute\tbelow-6of6\t',
    '2026-08-21\tthird-lead\tno-emailable-csv\t',
  ].join('\n') + '\n');
  if (countFor('california-dermatology-institute') !== 2) fail('ledger probe miscounts prior verification failures.');
  if (countFor('some-other-lead') !== 0) fail('ledger probe counts a step-3 timeout as a verification failure — that would re-scrape needlessly.');
  if (countFor('third-lead') !== 0) fail('ledger probe counts a CSV failure as a verification failure.');
  ok('behavioural: ledger probe counts only verification failures, per slug');

  // Empty ledger must yield 0, not a throw — the exact trap this repo hits most.
  fs.writeFileSync(tmp, '');
  if (countFor('anything') !== 0) fail('an EMPTY ledger does not yield 0 — the guard would throw and fail open.');
  ok('behavioural: empty ledger yields 0');
} finally {
  try { fs.unlinkSync(tmp); } catch { /* best effort */ }
}

console.log('✅ audit cache: invalidated on a prior 6/6 failure, retained otherwise, counted safely.');
