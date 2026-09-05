#!/usr/bin/env node
/**
 * client-state.mjs — own the data: snapshot what IS, log what WE CHANGED.
 *
 * ─── WHY (2026-09-05) ────────────────────────────────────────────────────────────────────────────
 * Chris: "we must ALWAYS keep our data so we can grow and improve" — and record changes with dates
 * so work correlates to results.
 *
 * Two halves, and most systems build only the first:
 *   SNAPSHOT — what IS true right now, append-only, timestamped.
 *   CHANGE   — what WE DID, with before -> after.
 * Correlation falls out of joining them on date, and it is the answer to the objection that actually
 * closes deals: "I have no idea what's working."
 *
 * 🔑 It is also the verifier that makes automation trustworthy. On 2026-09-05 two delivery steps were
 * found to have REPORTED success while achieving nothing, for three weeks. The pattern this enforces:
 *   snapshot → act → snapshot → assert the field actually moved → mark verified.
 * An action is not done because code said so; it is done because a read-back proves it.
 *
 *   node scripts/client-state.mjs snapshot <clientId|slug> [--surface=gbp,rankings]
 *   node scripts/client-state.mjs log <clientId|slug> --surface=gbp --action=set_primary_category \
 *        --target="primaryCategory" --before='"Marketing agency"' --after='"Internet marketing service"'
 *   node scripts/client-state.mjs history <clientId|slug> [--days=90]
 *   node scripts/client-state.mjs unverified            # every change never confirmed by a read-back
 *
 * Exit 0 = ok · 1 = a real problem · 2 = could not reach Supabase (never reported as success).
 */
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SCRAPER = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
try { (await import('dotenv')).config({ path: path.join(SCRAPER, '.env') }); } catch {}

const U = process.env.SUPABASE_URL;
const K = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!U || !K) { console.error('✗ Supabase creds missing — refusing to report success.'); process.exit(2); }
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' };

const argv = process.argv.slice(2);
const cmd = argv[0];
const ident = argv[1];
const flag = (n, d = '') => { const a = argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };

const sb = async (p, init = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { headers: H, ...init });
  const txt = await r.text();
  let body; try { body = txt ? JSON.parse(txt) : null; } catch { body = txt; }
  if (!r.ok) throw new Error(`${r.status} ${String(typeof body === 'object' ? JSON.stringify(body) : body).slice(0, 160)}`);
  return body;
};

async function resolveClient(x) {
  if (!x) throw new Error('client id or slug required');
  const byId = /^[0-9a-f-]{36}$/i.test(x)
    ? await sb(`clients?id=eq.${x}&select=id,business_name,gbp_url,website_url,primary_market,workspace_id,archived_at`)
    : await sb(`clients?portal_slug=eq.${encodeURIComponent(x)}&select=id,business_name,gbp_url,website_url,primary_market,workspace_id,archived_at`);
  if (!byId.length) throw new Error(`no client matches "${x}"`);
  return byId[0];
}

const digest = (o) => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex').slice(0, 32);

/** Snapshot a surface. Returns {surface, changed} — `changed:false` means identical to the last one. */
async function snapshotSurface(client, surface) {
  let payload = null, source = '';

  if (surface === 'rankings') {
    source = 'client_keyword_rankings';
    const rows = await sb(`client_keyword_rankings?client_id=eq.${client.id}&select=keyword,market,map_rank,source,created_at&order=created_at.desc&limit=200`);
    payload = {
      count: rows.length,
      by_keyword: rows.reduce((a, r) => { (a[r.keyword] ||= []).push({ rank: r.map_rank, at: r.created_at }); return a; }, {}),
      best: rows.filter((r) => r.map_rank != null).reduce((m, r) => Math.min(m, r.map_rank), 999),
    };
  } else if (surface === 'gbp') {
    // No live GBP read yet (needs the manager add to actually work — fixed 2026-09-05, unproven).
    // Snapshot what we DO hold, so the series starts today rather than whenever that lands.
    source = 'clients+brain_rank_snapshots';
    const snaps = await sb(`brain_rank_snapshots?client_id=eq.${client.id}&select=snapshot_date,keyword,grid,competitors&order=snapshot_date.desc&limit=1`);
    payload = { gbp_url: client.gbp_url || null, market: client.primary_market || null, latest_grid: snaps[0] || null };
  } else if (surface === 'website') {
    source = 'live-fetch';
    const url = client.website_url;
    if (!url) return { surface, skipped: 'no website_url' };
    const t0 = Date.now();
    try {
      const r = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'RGA-StateSnapshot/1.0' } });
      const html = await r.text();
      payload = {
        url, status: r.status, ms: Date.now() - t0, bytes: html.length,
        https: url.startsWith('https'),
        has_localbusiness_schema: /"@type"\s*:\s*"(LocalBusiness|ProfessionalService|[A-Za-z]*Business)"/.test(html),
        has_viewport: /name=["']viewport["']/i.test(html),
        title: (html.match(/<title>([^<]*)<\/title>/i) || [])[1]?.trim().slice(0, 140) || null,
        h1: (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]?.replace(/<[^>]+>/g, '').trim().slice(0, 140) || null,
      };
    } catch (e) { payload = { url, error: String(e.message).slice(0, 120) }; }
  } else {
    return { surface, skipped: 'unknown surface' };
  }

  const d = digest(payload);
  const prev = await sb(`client_state_snapshots?client_id=eq.${client.id}&surface=eq.${surface}&select=digest&order=captured_at.desc&limit=1`);
  // Still record an unchanged observation: "we looked and it was the same on this date" is data.
  const changed = !prev.length || prev[0].digest !== d;
  await sb('client_state_snapshots', {
    method: 'POST',
    headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({ client_id: client.id, workspace_id: client.workspace_id, surface, source, payload, digest: d }),
  });
  return { surface, changed, digest: d };
}

try {
  if (cmd === 'snapshot') {
    const c = await resolveClient(ident);
    const surfaces = (flag('surface', 'gbp,rankings,website')).split(',').map((s) => s.trim()).filter(Boolean);
    console.log(`\n  ${c.business_name}${c.archived_at ? ' (ARCHIVED)' : ''}`);
    for (const s of surfaces) {
      const r = await snapshotSurface(c, s);
      console.log(`  ${r.skipped ? '⏭ ' : r.changed ? '🔄' : '✓ '} ${s.padEnd(10)} ${r.skipped || (r.changed ? 'changed since last' : 'unchanged')}`);
    }
    console.log('\n  Snapshots are append-only. An unchanged observation is still recorded — "we looked');
    console.log('  and it had not moved" is evidence too.');
  }

  else if (cmd === 'log') {
    const c = await resolveClient(ident);
    const parse = (v) => { if (!v) return null; try { return JSON.parse(v); } catch { return v; } };
    const before = parse(flag('before'));
    const action = flag('action');
    if (!action || !flag('surface')) throw new Error('--surface and --action are required');
    if (before === null && !argv.includes('--no-before')) {
      throw new Error('--before is required (pass --no-before only if genuinely unknowable).\n'
        + '  A change log without a before-state records ACTIVITY, not CAUSATION — and causation is the product.');
    }
    await sb('client_change_log', {
      method: 'POST',
      headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({
        client_id: c.id, workspace_id: c.workspace_id,
        surface: flag('surface'), action, target: flag('target') || null,
        value_before: before, value_after: parse(flag('after')),
        actor: flag('actor', 'chris'), automated: argv.includes('--automated'),
        source: flag('source', 'client-state.mjs'), notes: flag('notes') || null,
        verified: argv.includes('--verified') ? true : null,
      }),
    });
    console.log(`  ✅ logged: ${flag('surface')} · ${action}${flag('target') ? ' · ' + flag('target') : ''}`);
    if (!argv.includes('--verified')) console.log('  ⚠️  unverified — confirm with a read-back, then set verified=true.');
  }

  else if (cmd === 'history') {
    const c = await resolveClient(ident);
    const days = parseInt(flag('days', '90'), 10);
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const rows = await sb(`client_change_log?client_id=eq.${c.id}&occurred_at=gte.${since}&select=*&order=occurred_at.desc`);
    const snaps = await sb(`client_state_snapshots?client_id=eq.${c.id}&captured_at=gte.${since}&select=surface,captured_at,digest&order=captured_at.desc`);
    console.log(`\n  ${c.business_name} — last ${days} days`);
    console.log(`  ${rows.length} change(s) · ${snaps.length} snapshot(s)\n`);
    for (const r of rows) {
      const v = r.verified === true ? '✅' : r.verified === false ? '🔴' : '⚠️ ';
      console.log(`  ${v} ${String(r.occurred_at).slice(0, 10)} ${r.surface.padEnd(10)} ${r.action.slice(0, 30).padEnd(32)} ${r.automated ? '[auto]' : ''}`);
      if (r.value_before != null || r.value_after != null) {
        console.log(`        ${JSON.stringify(r.value_before).slice(0, 46)} → ${JSON.stringify(r.value_after).slice(0, 46)}`);
      }
    }
    if (!rows.length) console.log('  (no changes logged — every client action should appear here)');
  }

  else if (cmd === 'unverified') {
    const rows = await sb('client_change_log?verified=not.eq.true&select=client_id,occurred_at,surface,action,target&order=occurred_at.desc&limit=50');
    const cs = await sb('clients?select=id,business_name');
    const nm = (id) => cs.find((c) => c.id === id)?.business_name || id.slice(0, 8);
    console.log(`\n  ${rows.length} change(s) never confirmed by a read-back`);
    for (const r of rows) console.log(`  ⚠️  ${String(r.occurred_at).slice(0, 10)} ${nm(r.client_id).slice(0, 22).padEnd(24)} ${r.surface}/${r.action}`);
    if (rows.length) {
      console.log('\n  An action that reported success is not an action that happened. The 2026-09-05 GBP');
      console.log('  manager bug reported success for three weeks while changing nothing.');
    }
  }

  else {
    console.error('usage: client-state.mjs snapshot|log|history|unverified <clientId|slug> [flags]');
    process.exit(2);
  }
} catch (e) {
  console.error(`✗ ${String(e.message).slice(0, 300)}`);
  process.exit(/Supabase|fetch failed|ENOTFOUND/.test(String(e.message)) ? 2 : 1);
}
