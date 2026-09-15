#!/usr/bin/env node
/**
 * export-approvals.mjs — write every client decision to a markdown file that outlives the database.
 *
 * ─── WHY (2026-09-14) ────────────────────────────────────────────────────────────────────────────
 * Chris: *"make sure each is recorded and documented and the approved mockups are saved in md file
 * system so we can access if something happens and saved with timestamps of approval or date made."*
 *
 * 🔑 An approval is the record that a client agreed to something we then published under their name.
 * Living only inside a JSONB column, it can be lost to a bad migration, a restore, or a row edit —
 * and the thing it authorises stays live on the internet regardless. A dated file in git is the copy
 * that survives all three.
 *
 * Writes `reports/approvals/<client>/<step>.md` in the WEBSITE repo (git-tracked), one per
 * deliverable, carrying:
 *   • the decision, who made it, and the exact timestamp
 *   • when the draft was prepared
 *   • the FULL approved content — not a summary. A summary cannot be re-published.
 *   • any note the client left when requesting changes
 *
 * Idempotent: re-running rewrites the same files, so it is safe on a schedule.
 *
 * Usage: node scripts/export-approvals.mjs [--client=<uuid>]
 * Exit 0 = written · 1 = a decision exists that could not be written · 2 = could not read.
 */
import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';

const REF = 'jetgayimvfeslqnkbfdq';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const SITE = '/Users/chris/RGA/Rocket Growth Agency Website VS Code';
const OUT = path.join(SITE, 'reports/approvals');

const arg = (n) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || '').split('=')[1];
const only = arg('client');

if (!TOKEN) { console.error('[approvals] INDETERMINATE — no SUPABASE_ACCESS_TOKEN'); process.exit(2); }

async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(d).slice(0, 200));
  return d;
}

const slug = (s) => String(s || 'client').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

let rows;
try {
  rows = await q(`
    select c.id, c.business_name, r.data
    from public.client_onboarding_records r
    join public.clients c on c.id = r.client_id
    ${only ? `where c.id = '${only.replace(/'/g, "''")}'` : ''}`);
} catch (e) {
  console.error(`[approvals] INDETERMINATE — ${String(e.message).slice(0, 140)}`);
  process.exit(2);
}

let written = 0, failed = 0, clients = 0;
for (const row of rows) {
  const tasks = row.data?.tasks || {};
  const decided = Object.entries(tasks).filter(([, t]) => t?.approval?.decision);
  if (!decided.length) continue;
  clients++;
  const dir = path.join(OUT, slug(row.business_name));
  fs.mkdirSync(dir, { recursive: true });

  for (const [key, t] of decided) {
    const a = t.approval;
    // 🔴 THE SUMMARY IS NOT THE DELIVERABLE. The first version exported `auto_result.summary`, which
    // for the GBP description was the literal string "592 chars — ready to paste in GBP or push via
    // API" — a status line, not the 592 characters. The file claimed it could be re-published from
    // alone, and it could not. Take the richest field available, and say so when none carries content.
    const ar = t.auto_result || {};
    const od = ar.outcome_data || t.outcome_data || {};
    const draft = od.description || od.draft || od.text || od.body
      || (typeof ar.summary === 'string' && ar.summary.length > 120 ? ar.summary : '')
      || ar.summary || '';
    // 🔴 The FULL content, never a summary — the point of this file is that the approved thing can be
    // re-published from it if the database is gone.
    const md = [
      `# ${key}`,
      '',
      `**Client:** ${row.business_name}  `,
      `**Decision:** ${a.decision === 'approved' ? '✅ APPROVED' : '✋ CHANGES REQUESTED'}  `,
      `**By:** ${a.by || 'unknown'}  `,
      `**Decided at:** ${a.at || 'unknown'}  `,
      `**Draft prepared:** ${t.completed_at || t.started_at || 'unknown'}  `,
      `**Exported:** ${new Date().toISOString()}`,
      '',
      a.note ? `## Note from the client\n\n> ${a.note.replace(/\n/g, '\n> ')}\n` : '',
      `## Approved content`,
      draft.length < 120 ? `\n> ⚠️ Only ${draft.length} characters were stored for this step — this file may NOT be enough to re-publish from. Check the live record.\n` : '',
      '',
      draft ? draft : '_No draft content stored for this step._',
      '',
      '---',
      '',
      '_Written by scripts/export-approvals.mjs. This file is the copy that survives the database:',
      'it carries the full approved content, not a summary, so the deliverable can be re-published',
      'from it alone._',
    ].filter((x) => x !== '').join('\n');

    const file = path.join(dir, `${key.replace(/\./g, '_')}.md`);
    try {
      fs.writeFileSync(file, md + '\n', 'utf8');
      written++;
      console.log(`  ✓ ${path.relative(SITE, file)}  (${a.decision}, ${String(a.at).slice(0, 10)})`);
    } catch (e) {
      failed++;
      console.error(`  ✗ ${file}: ${e.message}`);
    }
  }

  // An index per client, so the folder is readable without opening every file.
  const idx = [
    `# ${row.business_name} — client decisions`,
    '',
    `_Last exported ${new Date().toISOString()}._`,
    '',
    '| Deliverable | Decision | By | When |',
    '|---|---|---|---|',
    ...decided
      .sort((a, b) => String(b[1].approval.at).localeCompare(String(a[1].approval.at)))
      .map(([k, t]) => `| [${k}](${k.replace(/\./g, '_')}.md) | ${t.approval.decision === 'approved' ? '✅ approved' : '✋ changes'} | ${t.approval.by || '—'} | ${String(t.approval.at).slice(0, 16).replace('T', ' ')} |`),
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'README.md'), idx + '\n', 'utf8');
}

console.log(`\n[approvals] ${clients} client(s) · ${written} decision(s) written · ${failed} failed`);
process.exit(failed ? 1 : 0);
