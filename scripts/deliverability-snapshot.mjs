#!/usr/bin/env node
/**
 * deliverability-snapshot.mjs — automated daily deliverability health check.
 * Computes bounce rate (7d/24h), new bounces, and unswept sendable-queue size straight from
 * Airtable (where the Apps Script writes all bounce data). Prints a snapshot + exits non-zero
 * if any metric is AMBER/RED so the daily guard / a human can react. Read-only; no writes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n').filter(Boolean).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const KEY = env.AIRTABLE_API_KEY, BASE = env.AIRTABLE_BASE_ID || 'appSKOMBz6OpGf3qu';
const H = { Authorization: `Bearer ${KEY}` };
const now = Date.now(), D = 864e5;
const TERM = /invalid|bounced|no-replacement|permanent|soft-bounced/i;

async function all(table, fields) {
  let recs = [], off = null;
  do {
    const u = new URL(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(table)}`);
    u.searchParams.set('pageSize', '100');
    (fields || []).forEach((f) => u.searchParams.append('fields[]', f));
    if (off) u.searchParams.set('offset', off);
    const r = await fetch(u, { headers: H }); const d = await r.json();
    if (d.error) throw new Error(JSON.stringify(d.error));
    recs = recs.concat(d.records || []); off = d.offset;
  } while (off);
  return recs;
}

const L = await all('Leads', ['Business Name', 'Email', 'Email Status', 'Suppressed', 'Email Sent Date', 'Video URL', 'Status', 'Draft Created', 'Replied']);
const f = (r, k) => r.fields[k];
const sentIn = (r, days) => { const d = f(r, 'Email Sent Date'); return d && Date.parse(d) >= now - days * D; };

const sent7 = L.filter((r) => sentIn(r, 7)), sent1 = L.filter((r) => sentIn(r, 1));
const bounced7 = sent7.filter((r) => TERM.test(f(r, 'Email Status') || ''));
const bounced1 = sent1.filter((r) => TERM.test(f(r, 'Email Status') || ''));
const rate7 = sent7.length ? (bounced7.length / sent7.length * 100) : 0;
const rate1 = sent1.length ? (bounced1.length / sent1.length * 100) : 0;
const sendable = L.filter((r) => { const s = String(f(r, 'Status') || 'new').toLowerCase(); return !f(r, 'Suppressed') && f(r, 'Email') && !TERM.test(f(r, 'Email Status') || '') && f(r, 'Video URL') && (s === 'new' || s === '') && !f(r, 'Draft Created') && !f(r, 'Replied'); });

const status = (v, red, amber) => v >= red ? 'RED' : v >= amber ? 'AMBER' : 'GREEN';
const s7 = status(rate7, 5, 2), s1 = status(rate1, 20, 10);
const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');

console.log(`[deliverability ${stamp}]`);
console.log(`  bounce 7d:  ${rate7.toFixed(2)}% (${bounced7.length}/${sent7.length})  ${s7}   [AMBER≥2%, RED≥5%]`);
console.log(`  bounce 24h: ${rate1.toFixed(2)}% (${bounced1.length}/${sent1.length})  ${s1}   [AMBER≥10%, RED≥20%]`);
console.log(`  sendable queue: ${sendable.length}`);
if (bounced7.length) {
  console.log('  recent bounces:');
  bounced7.forEach((r) => console.log(`    ⚠ ${f(r, 'Business Name')} <${f(r, 'Email')}> [${f(r, 'Email Status')}]`));
}
const worst = [s7, s1].includes('RED') ? 'RED' : [s7, s1].includes('AMBER') ? 'AMBER' : 'GREEN';
console.log(`  OVERALL: ${worst}`);
process.exit(worst === 'GREEN' ? 0 : worst === 'AMBER' ? 2 : 3);
