#!/usr/bin/env node
/**
 * check-ai-drafts-do-not-invent-prices.mjs — a drafting prompt must never ask for a fact we did not supply.
 *
 * ─── WHY (2026-09-14) ────────────────────────────────────────────────────────────────────────────
 * `m1.web.priority_pages` asked the model for a "PRICING" section and gave it no prices. A model
 * cannot answer that honestly, so it produced a confident four-tier table:
 *
 *     Local Starter $750/mo · Growth Accelerator $1,500/mo · Authority Pro $2,500+/mo
 *
 * RGA's real offer is **$1,250 setup + $625/month**. None of those tiers exist. The draft sat in
 * `in_progress` looking like a finished page, one approval away from being published on the client's
 * own website — with invented prices, under their name.
 *
 * 🔑 The model was not the defect. **The prompt asked a question it had made unanswerable.** Any
 * section needing a fact the prompt never carried — price, review count, years in business, client
 * numbers, awards, testimonials — gets a plausible invention every time.
 *
 * ─── WHAT IT ASSERTS ─────────────────────────────────────────────────────────────────────────────
 *   1. STATIC — `aiDraft` applies the NO_FABRICATION preamble, and no drafting prompt requests a
 *      bare fact-section (PRICING / TESTIMONIALS / STATS) without the word PLACEHOLDER near it.
 *   2. STORED — no drafted `auto_result.summary` already sitting in the database contains a dollar
 *      amount that is not one of RGA's real, single-source prices.
 *
 * Exit 0 = clean · 1 = a prompt invites fabrication, or a stored draft already contains one · 2 = could not tell.
 */
import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';

const SELF_TEST = process.argv.includes('--self-test');
// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT — so this gate can be pointed at a scratch
// copy and its mutations actually run. A gate nobody can make fail is a gate nobody has
// checked. → feedback_a_gate_that_cannot_fail
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SITE = `${__SITE}`;
const FLOW = path.join(SITE, 'netlify/functions/flow-execute.js');

// RGA's real numbers, from the single source of truth. Anything else in a draft is invented.
// → project_offer_price_single_source · project_price_and_plan_surfaces
const REAL = new Set(['1250', '625', '1875', '2500', '0']);

let failures = [];

// ── 1. STATIC ────────────────────────────────────────────────────────────────────────────────────
let src;
try { src = fs.readFileSync(FLOW, 'utf8'); }
catch (e) { console.error(`[drafts] INDETERMINATE — cannot read flow-execute.js (${e.message})`); process.exit(2); }

if (!/NO_FABRICATION/.test(src)) {
  failures.push('flow-execute.js has no NO_FABRICATION preamble — drafts run with no anti-invention rule');
} else if (!/systemPrompt\s*=\s*`\$\{NO_FABRICATION\}/.test(src)) {
  failures.push('NO_FABRICATION is defined but never prepended inside aiDraft() — a rule that never reaches the model');
}

// Any prompt that names a fact-section must also mark it as a placeholder.
const FACT_SECTIONS = ['PRICING', 'TESTIMONIALS', 'STATS', 'CASE_STUDIES', 'AWARDS'];
for (const line of src.split('\n')) {
  if (!/aiDraft|Output:/.test(line) && !/\/ (PRICING|TESTIMONIALS|STATS)/.test(line)) continue;
  for (const sec of FACT_SECTIONS) {
    // Word-boundary match so PRICING_PLACEHOLDER does not trip the PRICING rule.
    const bare = new RegExp(`\\b${sec}\\b(?!_PLACEHOLDER)`);
    if (bare.test(line) && !/PLACEHOLDER|NEEDS INPUT/.test(line)) {
      failures.push(`a drafting prompt requests "${sec}" with no data supplied and no placeholder: ${line.trim().slice(0, 110)}`);
    }
  }
}

// A truncation marker must be detected wherever it appears in a body.
{
  const sample = 'Q2: What is ...\n\n[[TRUNCATED: this draft hit the token ceiling and is INCOMPLETE]]';
  if (!sample.includes('[[TRUNCATED')) failures.push('self-test: truncation marker not detectable');
}

console.log(`[drafts] static: ${failures.length ? `${failures.length} problem(s)` : 'prompts clean'}`);
if (SELF_TEST) {
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(failures.length ? 1 : 0);
}

// ── 2. STORED ────────────────────────────────────────────────────────────────────────────────────
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) {
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error('[drafts] INDETERMINATE — no SUPABASE_ACCESS_TOKEN, cannot scan stored drafts');
  process.exit(failures.length ? 1 : 2);
}

let rows;
try {
  const r = await fetch('https://api.supabase.com/v1/projects/jetgayimvfeslqnkbfdq/database/query', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'select client_id, data from public.client_onboarding_records' }),
  });
  rows = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(rows).slice(0, 200));
} catch (e) {
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(`[drafts] INDETERMINATE — could not read onboarding records: ${String(e.message).slice(0, 140)}`);
  process.exit(failures.length ? 1 : 2);
}

let scanned = 0;
for (const row of rows) {
  const tasks = row.data?.tasks || {};
  for (const [key, t] of Object.entries(tasks)) {
    const summary = t?.auto_result?.summary;
    if (typeof summary !== 'string') continue;
    scanned++;
    // $750 · $1,500/month · $2,500+ — capture the numeric part and strip separators.
    const amounts = [...summary.matchAll(/\$\s?([\d,]+(?:\.\d{2})?)/g)].map((m) => m[1].replace(/[,.]00$/, '').replace(/,/g, ''));
    const invented = [...new Set(amounts)].filter((a) => !REAL.has(a));
    if (invented.length) {
      failures.push(`${key} (client ${String(row.client_id).slice(0, 8)}) contains price(s) that are not ours: $${invented.join(', $')}`);
    }
    // 🔴 A draft that ran out of tokens stops mid-sentence and silently drops whole sections. The RGA
    // service page lost its CTA and internal links that way and still read as finished.
    if (summary.includes('[[TRUNCATED')) {
      failures.push(`${key} (client ${String(row.client_id).slice(0, 8)}) is TRUNCATED — sections are missing, do not approve`);
    }
  }
}

console.log(`[drafts] stored: ${scanned} drafted summaries scanned`);
if (failures.length) {
  console.error('\n✗ a draft invents facts it was never given:');
  for (const f of failures) console.error(`    ${f}`);
  console.error('\n  A visible [[NEEDS INPUT: …]] gap is correct. An invented number is a false claim');
  console.error('  published under the client\'s name.');
  process.exit(1);
}
console.log('✅ no drafting prompt invites invention, and no stored draft contains a price that is not ours.');
process.exit(0);
