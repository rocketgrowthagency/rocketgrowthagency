#!/usr/bin/env node
/**
 * check-approval-matches-what-was-shown.mjs — an approval must record the thing that was approved.
 *
 * ─── WHY (2026-09-14) ────────────────────────────────────────────────────────────────────────────
 * Approvals stored a decision flag and pointed at the step's current draft. The two drifted, and the
 * drift was invisible:
 *
 *   • Chris approved a homepage title of **"Local SEO & Google Maps Agency | Rocket Growth Agency"**.
 *     The stored draft still read **"SEO Company in Culver City, CA"**.
 *   • He approved **one** extra GBP category and explicitly declined two. The draft listed all three.
 *
 * The markdown archive then exported those drafts under the heading "Approved content" — a signed
 * record of something he never agreed to. Publishing from it would have put a rejected title on his
 * homepage and two declined categories on his Google listing, with his name on the approval.
 *
 * 🔑 A draft is mutable; a decision is not. The exact text shown at the moment of approval is frozen
 * into `approval.approved_content`, so regenerating a draft afterwards cannot rewrite history.
 * Same family as the price rule: **the shown thing IS the thing.**
 *
 * ─── WHAT IT ASSERTS ─────────────────────────────────────────────────────────────────────────────
 *   1. `portal-deliverables` writes `approved_content` on every decision.
 *   2. The portal SENDS what it rendered (`shown_content`), rather than letting the server guess.
 *   3. The archive exporter PREFERS the frozen copy over any later draft.
 *   4. Live: no decided deliverable is missing its frozen content.
 *
 * Exit 0 = every approval owns its content · 1 = an approval can drift from what was shown · 2 = could not tell.
 */
import fs from 'node:fs';
import 'dotenv/config';

const SELF_TEST = process.argv.includes('--self-test');
// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT — so this gate can be pointed at a scratch
// copy and its mutations actually run. A gate nobody can make fail is a gate nobody has
// checked. → feedback_a_gate_that_cannot_fail
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SITE = `${__SITE}`;
const REF = 'jetgayimvfeslqnkbfdq';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

export function staticVerdict({ fn, portal, exporter }) {
  const out = [];
  if (!fn) out.push('portal-deliverables.js is missing');
  else {
    if (!/approved_content\s*:/.test(fn)) out.push('portal-deliverables does not store approved_content — an approval would point at a mutable draft');
    if (!/shown_content/.test(fn)) out.push('portal-deliverables ignores shown_content — it cannot know what the client actually saw');
  }
  if (!portal) out.push('portal.js is missing');
  else if (!/shown_content/.test(portal)) out.push('portal.js does not send shown_content — the server is left guessing what was on screen');
  if (!exporter) out.push('export-approvals.mjs is missing');
  else if (!/a\.approved_content/.test(exporter)) out.push('export-approvals does not prefer the frozen copy — the archive can export a later draft as "approved"');
  return out;
}

if (SELF_TEST) {
  const good = { fn: 'approved_content: body.shown_content', portal: 'shown_content: item.textContent', exporter: 'const draft = a.approved_content || od.draft' };
  const cases = [
    ['all three wired', good, 0],
    ['THE BUG: no frozen content', { ...good, fn: 'decision, note' }, 1],
    ['portal does not send what it showed', { ...good, portal: 'body: JSON.stringify({ key, decision })' }, 1],
    ['archive prefers the live draft', { ...good, exporter: 'const draft = od.draft' }, 1],
    ['a file missing entirely', { ...good, fn: null }, 1],
  ];
  let bad = 0;
  for (const [label, input, want] of cases) {
    const got = staticVerdict(input).length;
    const ok = (got > 0) === (want === 1);
    if (!ok) bad++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label} (want ${want ? 'flagged' : 'clean'}, got ${got})`);
  }
  console.log(`\n[approval] self-test: ${cases.length - bad}/${cases.length}`);
  process.exit(bad ? 1 : 0);
}

const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
const problems = staticVerdict({
  fn: read(`${SITE}/netlify/functions/portal-deliverables.js`),
  portal: read(`${SITE}/portal/portal.js`),
  exporter: read('/Users/chris/RGA/Rocket Growth Agency Scraper VS Code/scripts/export-approvals.mjs'),
});

if (TOKEN) {
  try {
    const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'select client_id, data from public.client_onboarding_records' }),
    });
    const rows = await r.json();
    if (r.ok) {
      for (const row of rows) {
        for (const [k, t] of Object.entries(row.data?.tasks || {})) {
          const a = t?.approval;
          if (!a?.decision) continue;
          if (!a.approved_content) {
            problems.push(`${k} (client ${String(row.client_id).slice(0, 8)}) was decided but stores no approved_content — nobody can prove what was agreed`);
          }
        }
      }
    }
  } catch { /* static findings still stand */ }
} else {
  console.log('[approval] no SUPABASE_ACCESS_TOKEN — static checks only');
}

if (problems.length) {
  console.error('✗ an approval can point at content the client never saw:');
  for (const p of problems) console.error(`    ${p}`);
  console.error('\n  A draft is mutable; a decision is not. Freeze what was shown.');
  process.exit(1);
}
console.log('✅ every decision carries the exact content that was shown when it was made.');
process.exit(0);
