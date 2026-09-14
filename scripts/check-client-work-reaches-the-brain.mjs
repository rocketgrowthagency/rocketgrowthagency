#!/usr/bin/env node
/**
 * check-client-work-reaches-the-brain.mjs — client work must make us smarter, or it was just work.
 *
 * ─── WHY (2026-09-14) ────────────────────────────────────────────────────────────────────────────
 * Chris: *"all the work we do on client work also has its own brain and memory as we will use this
 * for all the work we do for all clients, so it's not mixed with normal memory."*
 *
 * The audit was already producing 12 surfaces of real measurement per client into
 * `client_state_snapshots`. **None of it ever became knowledge.** `brain_knowledge` held three seeded
 * industry playbooks with `client_count: 0`, and the one real client audit we had done lived in a
 * markdown memory file — invisible to the product and unusable on client #2.
 *
 * 🔑 THE BOUNDARY THIS ENFORCES:
 *   CLIENT BRAIN (Supabase) = what we learn DOING THE WORK. Per-client measurements, benchmarks.
 *   OPS MEMORY   (markdown) = how the AGENCY'S OWN SYSTEMS work. Gates, defects, deploy rules.
 * A client fact never goes in ops memory; an ops fact never goes in the brain.
 *
 * ─── WHAT IT ASSERTS ─────────────────────────────────────────────────────────────────────────────
 *   1. Every client with audit snapshots has a `brain_knowledge(type='client_audit')` row.
 *   2. That row is not STALE — not older than the newest snapshot it claims to summarise.
 *   3. Benchmarks exist once 1+ client is recorded, and every benchmark states its own reliability
 *      (a median drawn from one client must never read like a norm).
 *
 * The brain write is deliberately best-effort inside the audit step — it must never fail a client's
 * audit. This is the check that stops "best-effort" from quietly meaning "never happened".
 *
 * Exit 0 = every audited client is in the brain · 1 = knowledge is stranded · 2 = could not tell.
 */
import 'dotenv/config';

const SELF_TEST = process.argv.includes('--self-test');
const REF = 'jetgayimvfeslqnkbfdq';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

// Pure so the fixtures exercise the SAME logic the live pass uses.
export function verdict(clients, brainRows) {
  const byKey = new Map(brainRows.filter((b) => b.type === 'client_audit').map((b) => [b.key, b]));
  const problems = [];
  for (const c of clients) {
    const row = byKey.get(c.client_id);
    if (!row) { problems.push(`${c.name || c.client_id} has ${c.surfaces} audit surface(s) but NO brain row — its audit taught us nothing`); continue; }
    const recorded = row.data?.recorded_at;
    // 🔴 A row that predates the newest snapshot is summarising an audit that has since moved on.
    if (recorded && c.newest && String(recorded) < String(c.newest)) {
      problems.push(`${c.name || c.client_id} brain row is STALE — recorded ${String(recorded).slice(0, 10)}, newest snapshot ${String(c.newest).slice(0, 10)}`);
    }
  }
  const benchmarks = brainRows.filter((b) => b.type === 'audit_benchmark');
  if (byKey.size && !benchmarks.length) problems.push('clients are recorded but NO benchmarks exist — nothing is being learned across them');
  for (const b of benchmarks) {
    if (!b.data?.reliability) problems.push(`benchmark ${b.key} does not state its reliability — a median from one client would read like a norm`);
  }
  return problems;
}

if (SELF_TEST) {
  const cases = [
    ['audited client is recorded', [{ client_id: 'a', surfaces: 12, newest: '2026-09-12' }],
      [{ type: 'client_audit', key: 'a', data: { recorded_at: '2026-09-13' } }, { type: 'audit_benchmark', key: 'x', data: { reliability: 'usable' } }], 0],
    ['THE BUG: audited but never recorded', [{ client_id: 'a', surfaces: 12, newest: '2026-09-12' }], [], 1],
    ['stale brain row is caught', [{ client_id: 'a', surfaces: 12, newest: '2026-09-20' }],
      [{ type: 'client_audit', key: 'a', data: { recorded_at: '2026-09-01' } }, { type: 'audit_benchmark', key: 'x', data: { reliability: 'usable' } }], 1],
    ['recorded but nothing learned across them', [{ client_id: 'a', surfaces: 12, newest: '2026-09-12' }],
      [{ type: 'client_audit', key: 'a', data: { recorded_at: '2026-09-13' } }], 1],
    ['benchmark with no reliability statement', [{ client_id: 'a', surfaces: 1, newest: '2026-09-12' }],
      [{ type: 'client_audit', key: 'a', data: { recorded_at: '2026-09-13' } }, { type: 'audit_benchmark', key: 'x', data: {} }], 1],
    ['no audited clients yet is clean, not a failure', [], [], 0],
  ];
  let bad = 0;
  for (const [label, clients, rows, want] of cases) {
    const got = verdict(clients, rows).length;
    const ok = (got > 0) === (want === 1);
    if (!ok) bad++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label} (want ${want ? 'flagged' : 'clean'}, got ${got})`);
  }
  console.log(`\n[brain] self-test: ${cases.length - bad}/${cases.length}`);
  process.exit(bad ? 1 : 0);
}

if (!TOKEN) { console.error('[brain] INDETERMINATE — no SUPABASE_ACCESS_TOKEN'); process.exit(2); }

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

let clients, brainRows;
try {
  clients = await q(`
    select s.client_id, c.business_name as name, count(*)::int as surfaces, max(s.captured_at)::text as newest
    from public.client_state_snapshots s
    join public.clients c on c.id = s.client_id
    where c.archived_at is null
    group by s.client_id, c.business_name`);
  brainRows = await q(`select type, key, data from public.brain_knowledge`);
} catch (e) {
  console.error(`[brain] INDETERMINATE — could not read: ${String(e.message).slice(0, 140)}`);
  process.exit(2);
}

const problems = verdict(clients, brainRows);
const recorded = brainRows.filter((b) => b.type === 'client_audit').length;
const benchmarks = brainRows.filter((b) => b.type === 'audit_benchmark').length;
console.log(`[brain] ${clients.length} audited client(s) · ${recorded} in the brain · ${benchmarks} benchmark(s)`);

if (problems.length) {
  console.error('\n✗ client work is not reaching the brain:');
  for (const p of problems) console.error(`    ${p}`);
  console.error('\n  Run brain-record-audit for that client. Work that teaches us nothing is just work.');
  process.exit(1);
}
console.log('✅ every audited client is recorded, current, and contributing to the benchmarks.');
process.exit(0);
