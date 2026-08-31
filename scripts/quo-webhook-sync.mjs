#!/usr/bin/env node
/**
 * quo-webhook-sync.mjs — make Quo's webhook subscription correct, in code.
 *
 * ─── WHY ─────────────────────────────────────────────────────────────────────────────────────────
 * Inbound texts never reached the CRM. Not our fault and not fixable from our side:
 *
 *   our endpoint       ✅ live, authed, and PROVEN — a synthetic `message.received` POST created the
 *                         Outreach Log row, auto-created the lead and linked them (2026-08-31)
 *   inbound calls      ✅ arrive on this exact webhook and log correctly
 *   inbound messages   ❌ Quo never calls us — `message.received` is not subscribed
 *
 * Chris ticked the boxes in the Quo UI twice; the events still did not fire. Rather than keep asking
 * him to click, this does it over the API, where the result is verifiable instead of assumed.
 *
 * > **A config you cannot read back is a config you cannot trust.** The UI said the events were on.
 * > A comment in quo-call-webhook.js said the same. Both were wrong for 19 days.
 *
 * ─── SETUP (once) ────────────────────────────────────────────────────────────────────────────────
 * Quo/OpenPhone → Settings → API → create a key, then:
 *
 *   echo 'QUO_API_KEY=<the key>' >> .env
 *   node scripts/quo-webhook-sync.mjs            # show what exists
 *   node scripts/quo-webhook-sync.mjs --apply    # create/repair the subscription
 *
 * After --apply it re-reads the webhook from the API and prints the events it actually has, so a
 * green result means the server agrees — not that a request returned 200.
 *
 * Exit 0 = subscription correct · 1 = wrong and --apply not given · 2 = cannot tell.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER = path.dirname(HERE);
const APPLY = process.argv.includes('--apply');

try { (await import('dotenv')).config({ path: path.join(SCRAPER, '.env') }); } catch {}

const KEY = process.env.QUO_API_KEY;
const WEBHOOK_TOKEN = process.env.QUO_WEBHOOK_TOKEN
  || 'c7c76352b117e69f98cd74cd7afd8833ef886529ad36b6e8';
const TARGET_URL = `https://www.rocketgrowthagency.com/.netlify/functions/quo-call-webhook?token=${WEBHOOK_TOKEN}`;
const WANT = ['call.completed', 'message.received', 'message.delivered'];

if (!KEY) {
  console.error(`\n✗ QUO_API_KEY is not set — cannot read or change the subscription.`);
  console.error(`\n  This is the ONLY step that needs a human, and it is needed once:`);
  console.error(`    1. Quo/OpenPhone → Settings → API → create a key`);
  console.error(`    2. echo 'QUO_API_KEY=<key>' >> "${path.join(SCRAPER, '.env')}"`);
  console.error(`    3. node scripts/quo-webhook-sync.mjs --apply`);
  console.error(`\n  After that the subscription is managed here and re-checked automatically,`);
  console.error(`  instead of depending on checkboxes holding in a UI.`);
  process.exit(2);
}

const API = 'https://api.openphone.com/v1';
const H = { Authorization: KEY, 'Content-Type': 'application/json' };

async function api(method, pathname, body) {
  const res = await fetch(API + pathname, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, json, text };
}

// ── read what exists ─────────────────────────────────────────────────────────────────────────────
const list = await api('GET', '/webhooks');
if (!list.ok) {
  console.error(`✗ could not list webhooks: HTTP ${list.status} ${list.text.slice(0, 160)}`);
  console.error(`   If this is 401, the key is wrong or lacks scope. Refusing to guess.`);
  process.exit(2);
}
const hooks = list.json?.data || list.json || [];
console.log(`\n===== QUO WEBHOOK SUBSCRIPTION =====`);
console.log(`  webhooks on the account: ${hooks.length}`);
for (const h of hooks) {
  const url = h.url || '';
  const mine = url.includes('quo-call-webhook');
  console.log(`\n  ${mine ? '▶' : ' '} ${h.id || '(no id)'}  ${h.status || ''}`);
  console.log(`      url    ${url.replace(/token=[^&]+/, 'token=***')}`);
  console.log(`      events ${(h.events || []).join(', ') || '(none)'}`);
}

const mine = hooks.filter((h) => String(h.url || '').includes('quo-call-webhook'));
const missingFrom = (h) => WANT.filter((e) => !(h.events || []).includes(e));

if (mine.length > 1) {
  console.error(`\n⚠ ${mine.length} webhooks point at our endpoint. Duplicates split delivery and make`);
  console.error(`   behaviour depend on which one fires. Only the first is repaired below; delete the rest.`);
}

let broken = false;
if (!mine.length) {
  broken = true;
  console.error(`\n✗ no webhook points at our endpoint — that is why nothing arrives.`);
} else {
  const miss = missingFrom(mine[0]);
  if (miss.length) { broken = true; console.error(`\n✗ subscribed, but missing: ${miss.join(', ')}`); }
  else console.log(`\n✅ subscription already correct — all of: ${WANT.join(', ')}`);
}

if (!broken) process.exit(0);
if (!APPLY) {
  console.error(`\n   Re-run with --apply to fix it:  node scripts/quo-webhook-sync.mjs --apply`);
  process.exit(1);
}

// ── repair ───────────────────────────────────────────────────────────────────────────────────────
let res;
if (mine.length) {
  const h = mine[0];
  const events = [...new Set([...(h.events || []), ...WANT])];
  console.log(`\n  patching ${h.id} → events: ${events.join(', ')}`);
  res = await api('PATCH', `/webhooks/${h.id}`, { events, url: h.url, status: 'enabled' });
  if (!res.ok && res.status === 404) {
    console.log(`  PATCH unsupported here; recreating instead.`);
    await api('DELETE', `/webhooks/${h.id}`);
    res = await api('POST', '/webhooks/messages', { url: TARGET_URL, events: WANT, status: 'enabled' });
  }
} else {
  console.log(`\n  creating a webhook → ${WANT.join(', ')}`);
  res = await api('POST', '/webhooks/messages', { url: TARGET_URL, events: WANT, status: 'enabled' });
}
if (!res.ok) {
  console.error(`\n✗ change rejected: HTTP ${res.status} ${res.text.slice(0, 200)}`);
  process.exit(1);
}

// ── read it BACK — a 200 on the write is not proof the server agrees ─────────────────────────────
const after = await api('GET', '/webhooks');
const now = (after.json?.data || after.json || []).filter((h) => String(h.url || '').includes('quo-call-webhook'));
const stillMissing = now.length ? missingFrom(now[0]) : WANT;
console.log(`\n  re-read from the API: events = ${(now[0]?.events || []).join(', ') || '(none)'}`);
if (stillMissing.length) {
  console.error(`✗ still missing after apply: ${stillMissing.join(', ')} — the account may not permit SMS events.`);
  process.exit(1);
}
console.log(`\n✅ subscription verified against the API. Text the number; it should log within seconds.`);
process.exit(0);
