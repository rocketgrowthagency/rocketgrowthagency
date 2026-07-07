#!/usr/bin/env node
// scripts/daily-send-audit.mjs
//
// The self-improving daily audit of the email-verification system (locked 2026-07-07). Runs in
// daily-deliverability-guard.sh. Three jobs, all with the FREE verifier (0 Bouncer credits):
//
//   A. LEAK CHECK (safety) — re-verify addresses emailed in the last 2 days. If our layers now say
//      DROP, an unverified/bad address slipped out (e.g. scraped + sent same-day before the 6am gate).
//      → auto-suppress it + raise an alert. This is the production proof suppression is holding.
//
//   B. BOUNCE GAP-LEARNING (self-improvement) — for every NEW bounce, ask: would our FREE layer have
//      caught it? If YES it's already closed; if NO it's a gap. A non-free domain that bounced across
//      ≥2 leads → AUTO-LEARN (append to config/learned-bad-domains.txt, permanently closing the gap).
//      A single bounce on a normal domain → FLAG for human review (never auto-denylist one bounce).
//
//   C. TREND — append today's free-vs-Bouncer scorecard (agreement/gap/false-pos) to a trend CSV so
//      the "safe to drop Bouncer?" decision is data-driven over time.
//
// Writes reports/send-audit/send-audit-<date>.md. DRY_RUN=1 = report only (no suppress, no learn).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

process.env.VERIFY_ENGINE = 'free'; // whole audit is free — never spends a Bouncer credit
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { verifyEmailLayered } = require(path.join(ROOT, 'lib', 'verify-pipeline.cjs'));
const { isLikelyEmail, isDisposableDomain, FREE_MAILBOX_RE, LEARNED_BAD_DOMAINS } = require(path.join(ROOT, 'lib', 'email-validation.cjs'));

const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')
  .filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const K = env.AIRTABLE_API_KEY, B = env.AIRTABLE_BASE_ID;
const DRY = process.env.DRY_RUN === '1';
const TODAY = new Date().toISOString().slice(0, 10);
const domainOf = (e) => String(e || '').toLowerCase().slice(String(e).lastIndexOf('@') + 1);

async function airtable(formula, fields) {
  let recs = [], offset = null;
  do {
    const u = new URL(`https://api.airtable.com/v0/${B}/Leads`);
    u.searchParams.set('pageSize', '100');
    if (formula) u.searchParams.set('filterByFormula', formula);
    (fields || []).forEach((f) => u.searchParams.append('fields[]', f));
    if (offset) u.searchParams.set('offset', offset);
    const r = await fetch(u, { headers: { Authorization: 'Bearer ' + K } });
    const d = await r.json();
    if (d.error) throw new Error(JSON.stringify(d.error));
    recs = recs.concat(d.records || []); offset = d.offset;
  } while (offset);
  return recs;
}
async function patchLeads(updates) {
  for (let i = 0; i < updates.length; i += 10) {
    const r = await fetch(`https://api.airtable.com/v0/${B}/Leads`, { method: 'PATCH',
      headers: { Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: updates.slice(i, i + 10), typecast: true }) });
    const d = await r.json(); if (d.error) throw new Error(JSON.stringify(d.error));
  }
}

(async () => {
  const report = [`# Send-verification audit — ${TODAY}${DRY ? '  (DRY RUN)' : ''}`, ''];
  let alert = false;

  // ---------- A. LEAK CHECK ----------
  const sent = await airtable(
    `AND(NOT({Suppressed}), {Email}!="", IS_AFTER({Latest Sent Date}, DATEADD(TODAY(), -2, 'days')))`,
    ['Business Name', 'Email', 'Latest Sent Date']);
  const leaks = [];
  for (const r of sent) {
    const d = await verifyEmailLayered(r.fields.Email);
    if (d.decision === 'drop') leaks.push({ id: r.id, email: r.fields.Email, biz: r.fields['Business Name'], why: `${d.tier}:${d.result}` });
  }
  report.push(`## A. Leak check — ${sent.length} recently-sent re-verified`);
  if (leaks.length) {
    alert = true;
    report.push(`⚠️ **${leaks.length} LEAK(S)** — bad address(es) got sent (same-day-send before the gate?):`);
    leaks.forEach((l) => report.push(`  - ${l.biz} <${l.email}> — ${l.why}`));
    if (!DRY) { await patchLeads(leaks.map((l) => ({ id: l.id, fields: { Suppressed: true, 'Email Status': 'leak-suppressed' } }))); report.push(`  → auto-suppressed ${leaks.length}.`); }
  } else report.push('✅ no leaks — every recently-sent address still passes the verifier.');
  report.push('');

  // ---------- B. BOUNCE GAP-LEARNING ----------
  const ledgerPath = path.join(ROOT, 'output', 'bounce-gap-processed.json');
  let ledger; try { ledger = new Set(JSON.parse(fs.readFileSync(ledgerPath, 'utf8'))); } catch { ledger = new Set(); }
  const bounced = await airtable(
    `AND({Email}!="", OR({Email Status}="bounced",{Email Status}="permanent-bounce",{Email Status}="soft-bounced"))`,
    ['Business Name', 'Email', 'Email Status']);
  const fresh = bounced.filter((r) => !ledger.has(r.id));
  const gapDomains = {};   // domain → count of NEW bounces our free layer would MISS
  let wouldCatch = 0;
  for (const r of fresh) {
    const email = r.fields.Email, dom = domainOf(email);
    const d = await verifyEmailLayered(email);
    if (d.decision === 'drop') wouldCatch++;                       // free already catches this pattern
    else if (!FREE_MAILBOX_RE.test(dom) && !isDisposableDomain(dom) && !LEARNED_BAD_DOMAINS.has(dom)) {
      (gapDomains[dom] = gapDomains[dom] || { count: 0, samples: [] }).count++;
      if (gapDomains[dom].samples.length < 3) gapDomains[dom].samples.push(email);
    }
    ledger.add(r.id);
  }
  // ≥2 bounces on a non-free domain → auto-learn; single → flag
  const toLearn = Object.entries(gapDomains).filter(([, v]) => v.count >= 2).map(([d]) => d);
  const toFlag = Object.entries(gapDomains).filter(([, v]) => v.count < 2);
  report.push(`## B. Bounce gap-learning — ${fresh.length} new bounce(s) analyzed`);
  report.push(`  free layer would already catch: ${wouldCatch}`);
  report.push(`  genuine gaps (free missed): ${Object.keys(gapDomains).length} domain(s)`);
  if (toLearn.length) {
    report.push(`  🔧 AUTO-LEARNED (≥2 bounces, added to free denylist): ${toLearn.join(', ')}`);
    if (!DRY) {
      fs.appendFileSync(path.join(ROOT, 'config', 'learned-bad-domains.txt'),
        toLearn.map((d) => `${d}  # auto-learned ${TODAY} (${gapDomains[d].count} bounces)`).join('\n') + '\n');
    }
  }
  if (toFlag.length) {
    report.push(`  🔎 FLAGGED for review (1 bounce — NOT auto-denylisted; could be a real domain):`);
    toFlag.forEach(([d, v]) => report.push(`    - ${d}  (${v.samples.join(', ')})`));
  }
  if (!toLearn.length && !toFlag.length) report.push('  ✅ no new gaps — free layer caught everything that bounced.');
  if (!DRY) fs.writeFileSync(ledgerPath, JSON.stringify([...ledger]));
  report.push('');

  // ---------- C. SCORECARD TREND ----------
  let scLine = '';
  try {
    const out = execFileSync('node', [path.join(ROOT, 'scripts', 'compare-free-vs-bouncer.mjs')], { encoding: 'utf8' });
    const agree = (out.match(/Agreement:\s+\d+\/\d+\s+\(([\d.]+)%\)/) || [])[1];
    const gap = (out.match(/GAP \(free MISSES\):\s+(\d+)/) || [])[1];
    const fp = (out.match(/FALSE POSITIVES:\s+(\d+)/) || [])[1];
    scLine = `${TODAY},${agree},${gap},${fp}`;
    const csv = path.join(ROOT, 'reports', 'verification-scorecard-trend.csv');
    if (!DRY) { if (!fs.existsSync(csv)) fs.mkdirSync(path.dirname(csv), { recursive: true }), fs.writeFileSync(csv, 'date,agreement_pct,gap,false_positives\n'); fs.appendFileSync(csv, scLine + '\n'); }
    report.push(`## C. Free-vs-Bouncer scorecard: agreement ${agree}%, gap ${gap}, false-pos ${fp}`);
  } catch (e) { report.push(`## C. Scorecard: (skipped — ${e.message})`); }
  report.push('');

  // ---------- write report + alert ----------
  const outDir = path.join(ROOT, 'reports', 'send-audit');
  if (!DRY) { fs.mkdirSync(outDir, { recursive: true }); fs.writeFileSync(path.join(outDir, `send-audit-${TODAY}.md`), report.join('\n')); }
  console.log(report.join('\n'));
  if (alert && !DRY) {
    const msg = `RGA send-audit ${TODAY}: ${leaks.length} leak(s) auto-suppressed. See reports/send-audit/send-audit-${TODAY}.md`;
    try { fs.writeFileSync(path.join(process.env.HOME || ROOT, `rga-ALERT-send-audit-${TODAY}.log`), msg + '\n'); } catch (_) {}
    try { execFileSync('osascript', ['-e', `display notification "${msg}" with title "RGA Send Audit"`]); } catch (_) {}
  }
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
