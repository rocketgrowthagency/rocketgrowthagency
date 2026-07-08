// quarantine-report.mjs — the durable NOTE of every email we deliberately DON'T send, so nothing
// is lost and we can later run these through a dedicated strategy (e.g. a 2nd/test warm-up domain).
//
// Buckets (set by verify-sendable-mailboxes.mjs):
//   held-catch-all — domain accepts all recipients; can't confirm the mailbox → held, retrievable
//   held-unknown   — greylist/timeout/blocked-probe (often Gmail/MS-hosted) → held, re-verifiable
//   no-mx / invalid — permanently undeliverable (shown for completeness; NOT candidates for resend)
//
// Writes reports/quarantine/quarantine-<YYYY-MM-DD>.md and prints a summary. Read-only on Airtable.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')
  .filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const K = env.AIRTABLE_API_KEY, B = env.AIRTABLE_BASE_ID;
const DATE = process.env.DATE || new Date().toISOString().slice(0, 10);

const HELD = ['held-catch-all', 'held-unknown'];      // retrievable — the 2nd-domain candidates
const DEAD = ['no-mx', 'invalid'];                    // permanently undeliverable — for completeness

async function load() {
  let recs = [], offset = null;
  do {
    const u = new URL(`https://api.airtable.com/v0/${B}/Leads`);
    u.searchParams.set('pageSize', '100');
    ['Business Name', 'Email', 'Email Status', 'Search Term', 'City'].forEach((f) => u.searchParams.append('fields[]', f));
    if (offset) u.searchParams.set('offset', offset);
    const r = await fetch(u, { headers: { Authorization: 'Bearer ' + K } });
    const d = await r.json(); if (d.error) throw new Error(JSON.stringify(d.error));
    recs = recs.concat(d.records || []); offset = d.offset;
  } while (offset);
  return recs;
}

(async () => {
  const all = await load();
  const byStatus = {};
  for (const r of all) {
    const s = String(r.fields['Email Status'] || '').toLowerCase();
    if (HELD.includes(s) || DEAD.includes(s)) (byStatus[s] ||= []).push(r.fields);
  }
  const heldCount = HELD.reduce((n, s) => n + (byStatus[s]?.length || 0), 0);
  const deadCount = DEAD.reduce((n, s) => n + (byStatus[s]?.length || 0), 0);

  let md = `# Quarantine report — emails held (not sent)\n\n`;
  md += `Generated ${DATE}. **${heldCount} retrievable held** (2nd-domain candidates) · ${deadCount} permanently undeliverable.\n\n`;
  md += `Held addresses are NOT deleted — they're retained (Suppressed + Email Status) for a future send strategy (e.g. a dedicated warm-up/test domain). Permanently-undeliverable (no-mx/invalid) are shown for completeness only; do not resend.\n\n`;
  for (const s of [...HELD, ...DEAD]) {
    const rows = byStatus[s] || [];
    md += `## ${s} — ${rows.length}\n\n`;
    if (!rows.length) { md += `_none_\n\n`; continue; }
    md += `| Business | Email | Search | City |\n|---|---|---|---|\n`;
    for (const f of rows) md += `| ${(f['Business Name'] || '').replace(/\|/g, '/')} | ${f.Email || ''} | ${f['Search Term'] || ''} | ${f.City || ''} |\n`;
    md += `\n`;
  }

  const dir = path.join(ROOT, 'reports', 'quarantine');
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `quarantine-${DATE}.md`);
  fs.writeFileSync(out, md);
  console.log(`Held (retrievable): ${heldCount}  [${HELD.map((s) => `${s}=${byStatus[s]?.length || 0}`).join(', ')}]`);
  console.log(`Permanently undeliverable: ${deadCount}  [${DEAD.map((s) => `${s}=${byStatus[s]?.length || 0}`).join(', ')}]`);
  console.log(`Report → ${path.relative(ROOT, out)}`);
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
