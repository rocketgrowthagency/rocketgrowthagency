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

// ── Quo models calls and messages as SEPARATE webhook resources ─────────────────────────────────
// POST /v1/webhooks/calls  and  POST /v1/webhooks/messages  create DIFFERENT objects. A call webhook
// cannot carry message.received — which is why ticking it in the UI never stuck. Both point at the
// same URL; our handler dispatches on the event type.
const RESOURCES = [
  { kind: 'calls',    path: '/webhooks/calls',    want: ['call.completed'] },
  { kind: 'messages', path: '/webhooks/messages', want: ['message.received', 'message.delivered'] },
];

const list = await api('GET', '/webhooks');
if (!list.ok) {
  console.error(`✗ could not list webhooks: HTTP ${list.status} ${list.text.slice(0, 160)}`);
  console.error(`   If this is 401 the key is wrong or lacks scope. Refusing to guess.`);
  process.exit(2);
}
const hooks = list.json?.data || list.json || [];
const ours = hooks.filter((h) => String(h.url || '').includes('quo-call-webhook'));

console.log(`\n===== QUO WEBHOOK SUBSCRIPTION =====`);
console.log(`  webhooks on the account: ${hooks.length}  (ours: ${ours.length})`);
for (const h of ours) {
  console.log(`\n  ${h.id || '(no id)'}  ${h.status || ''}`);
  console.log(`      url    ${String(h.url).replace(/token=[^&]+/, 'token=***')}`);
  console.log(`      events ${(h.events || []).join(', ') || '(none)'}`);
}

const covered = new Set(ours.flatMap((h) => h.events || []));
const gaps = RESOURCES.filter((r) => r.want.some((e) => !covered.has(e)));

if (!gaps.length) {
  console.log(`\n✅ every needed event is subscribed: ${RESOURCES.flatMap(r=>r.want).join(', ')}`);
  process.exit(0);
}
for (const g of gaps) {
  console.error(`\n✗ no webhook carries ${g.kind} events — missing: ${g.want.filter(e=>!covered.has(e)).join(', ')}`);
}
if (!APPLY) {
  console.error(`\n   Re-run with --apply to create them:  node scripts/quo-webhook-sync.mjs --apply`);
  process.exit(1);
}

// ── create the missing resource(s) ───────────────────────────────────────────────────────────────
for (const g of gaps) {
  console.log(`\n  creating ${g.kind} webhook → ${g.want.join(', ')}`);
  const res = await api('POST', g.path, { url: TARGET_URL, events: g.want, status: 'enabled', label: `RGA ${g.kind}` });
  if (!res.ok) {
    console.error(`  ✗ rejected: HTTP ${res.status} ${res.text.slice(0, 200)}`);
    process.exit(1);
  }
  console.log(`  ✅ created ${res.json?.data?.id || res.json?.id || ''}`);
}

// ── read back — a 200 on the write is not proof the server agrees ───────────────────────────────
const after = await api('GET', '/webhooks');
const now = (after.json?.data || after.json || []).filter((h) => String(h.url || '').includes('quo-call-webhook'));
const have = new Set(now.flatMap((h) => h.events || []));
const missing = RESOURCES.flatMap((r) => r.want).filter((e) => !have.has(e));
console.log(`\n  re-read from the API: ${[...have].join(', ') || '(none)'}`);
if (missing.length) {
  console.error(`✗ still missing: ${missing.join(', ')} — the plan may not permit SMS webhooks.`);
  process.exit(1);
}
console.log(`\n✅ verified against the API. Text the number; it should log within seconds.`);
process.exit(0);
