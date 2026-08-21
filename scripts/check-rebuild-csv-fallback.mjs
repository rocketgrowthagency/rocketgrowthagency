#!/usr/bin/env node
/**
 * check-rebuild-csv-fallback.mjs — the rebuild path must be able to heal a FRESH lead.
 *
 * ─── WHY (2026-08-21, found by running it, not by reading it) ─────────────────────────────────────
 * `rebuild-broken-videos.sh` located its input with exactly one glob:
 *
 *     ls -t "output/Step 2/"*"_${SLUG}-only-"*"-[step-2].csv"
 *
 * Per-lead "-only-" CSVs exist only for leads that have ALREADY been rebuilt once. A lead from a fresh
 * scrape lives in the batch CSV (`<date>_<search>-[step-2].csv`) and has no per-lead file — so the
 * rebuild answered `no-emailable-csv` and skipped it. The healer could re-heal an old lead but could
 * never heal a new one.
 *
 * That is the dead-window case exactly. After the 2026-08-20 latched-guard night, 6 of 7 Dermatologists
 * leads were unrepairable by hand for this reason alone — nothing was wrong with the leads. The first
 * run of the repair returned "rebuilt 0 · failed 7".
 *
 * 🔑 Reading the loop looked fine. Only RUNNING it exposed this. That is the whole argument for testing
 * a repair path on real data before trusting it in the morning report.
 *
 * INVARIANTS
 *   1. rebuild-broken-videos.sh calls extract-lead-csv.mjs when no per-lead CSV is found.
 *   2. extract-lead-csv.mjs actually carves an emailable row out of a batch CSV (behavioural).
 *   3. It applies the SAME emailable rules as step-8 — never its own, or the two WILL drift.
 *
 * Exit 0 = healthy, 1 = regression.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER = path.dirname(HERE);
const REBUILD = path.join(HERE, 'rebuild-broken-videos.sh');
const EXTRACT = path.join(HERE, 'extract-lead-csv.mjs');

const fail = (m) => { console.error(`✗ FATAL: ${m}`); process.exit(1); };
const ok = (m) => console.log(`  ✓ ${m}`);

// ── 1. WIRING ────────────────────────────────────────────────────────────────────────────────────
// A fix that exists but is never called is not a fix (feedback_a_test_nobody_runs_is_not_a_guard).
if (!fs.existsSync(EXTRACT)) fail('scripts/extract-lead-csv.mjs is missing — the batch fallback is gone.');
const rb = fs.readFileSync(REBUILD, 'utf8');
if (!/extract-lead-csv\.mjs/.test(rb)) {
  fail('rebuild-broken-videos.sh never calls extract-lead-csv.mjs. A lead that only exists in a BATCH\n' +
       '         step-2 CSV can no longer be rebuilt — which is every lead from a fresh scrape.');
}
// The fallback must run when the per-lead glob found nothing, i.e. while SRC is still empty.
// 🔴 Anchor on the CALL SITE (`node scripts/extract-lead-csv.mjs`), not the first textual mention —
// the first mention is inside a comment block, and matching that made this gate fail on correct code.
// A gate that cries wolf on a good file gets disabled, which is the same end state as no gate at all.
const callIdx = rb.search(/node\s+scripts\/extract-lead-csv\.mjs/);
if (callIdx === -1) fail('extract-lead-csv.mjs is mentioned but never actually invoked.');
const before = rb.slice(Math.max(0, callIdx - 700), callIdx);
if (!/if \[ -z "\$SRC" \]/.test(before)) {
  fail('extract-lead-csv.mjs is called but not guarded by an empty-$SRC check — it must be a FALLBACK,\n' +
       '         used only when no per-lead CSV was found.');
}
ok('rebuild-broken-videos.sh falls back to the batch CSV when no per-lead CSV exists');

// ── 2. SHARED RULES ──────────────────────────────────────────────────────────────────────────────
// Stricter is NOT the goal — AGREEMENT is. A build filter stricter than the publish filter skips rows
// step-8 would happily accept (project_orphaned_videos.md).
const ex = fs.readFileSync(EXTRACT, 'utf8');
for (const fn of ['isUsableLeadRow', 'extractValidEmail']) {
  if (!new RegExp(fn).test(ex)) fail(`extract-lead-csv.mjs does not use ${fn} — it invented its own emailable rule.`);
}
if (!/email-validation\.cjs/.test(ex)) fail('extract-lead-csv.mjs does not require the shared lib/email-validation.cjs.');
if (!/csv-parser/.test(ex)) {
  fail('extract-lead-csv.mjs is not using the real csv parser. Hand-splitting on "," misaligns any row\n' +
       '         with a quoted comma and REJECTS good leads — a false negative silently drops a prospect.');
}
ok('extractor uses the shared step-8 rules + a real CSV parser');

// ── 3. BEHAVIOURAL ───────────────────────────────────────────────────────────────────────────────
// Prove it actually carves a row, on a throwaway batch CSV placed in the real Step 2 directory (the
// extractor scans that directory by design). Cleaned up in `finally` so a failure cannot leave litter.
const STEP2 = path.join(SCRAPER, 'output', 'Step 2');
const stamp = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const fixture = path.join(STEP2, `${stamp}_zzguardfixture-in-testville-ca-[step-2].csv`);
const written = [];
try {
  if (!fs.existsSync(STEP2)) { console.log('  (skipped behavioural check — no output/Step 2 dir)'); process.exit(0); }
  fs.writeFileSync(fixture, [
    'Business Name,Email,Phone,Website',
    'Zz Guard Fixture Co,"owner@zzguardfixture.test","(310) 555-0101",https://zzguardfixture.test/',
  ].join('\n') + '\n');

  let out = '';
  try {
    out = execFileSync('node', [EXTRACT, 'zz-guard-fixture-co'], { cwd: SCRAPER, encoding: 'utf8' }).trim();
  } catch (e) {
    fail(`extractor could not carve a known-good row out of a batch CSV: ${(e.stderr || e.message || '').trim()}`);
  }
  if (!out || !fs.existsSync(out)) fail('extractor reported success but wrote no file.');
  written.push(out);

  const body = fs.readFileSync(out, 'utf8');
  if (!/Zz Guard Fixture Co/.test(body)) fail('carved CSV does not contain the matched lead.');
  if (body.trim().split('\n').length !== 2) fail('carved CSV must be exactly a header + ONE row.');
  ok('behavioural: carves the right single row out of a batch CSV');

  // Negative direction — a row with no usable email must NOT be carved, or the rebuild burns a full
  // render on a lead step-8 will reject anyway.
  fs.writeFileSync(fixture, [
    'Business Name,Email,Phone,Website',
    'Zz Guard Noemail Co,"https://not-an-email.test/","(310) 555-0102",https://zzguardnoemail.test/',
  ].join('\n') + '\n');
  let rejected = false;
  try { execFileSync('node', [EXTRACT, 'zz-guard-noemail-co'], { cwd: SCRAPER, encoding: 'utf8' }); }
  catch { rejected = true; }
  if (!rejected) fail('extractor carved a row whose email is a URL — step-8 would reject it, so the render is wasted.');
  ok('behavioural: refuses a row with no usable email');
} finally {
  for (const f of [fixture, ...written]) { try { fs.unlinkSync(f); } catch { /* best effort */ } }
}

console.log('✅ rebuild CSV fallback: wired, shares step-8 rules, and works on a fresh lead.');
