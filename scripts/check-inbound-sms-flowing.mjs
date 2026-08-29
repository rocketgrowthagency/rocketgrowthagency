#!/usr/bin/env node
/**
 * check-inbound-sms-flowing.mjs — inbound texts must reach the CRM, not just the Quo app.
 *
 * ─── WHY (2026-08-28) ────────────────────────────────────────────────────────────────────────────
 * Chris: "i just got a message from 747-240-0895 saying Test?". It was nowhere in Airtable — no
 * lead, no Outreach Log row. SMS handling shipped 2026-08-12 and had logged **zero rows in 16 days**.
 *
 * `quo-call-webhook.js` is not at fault: it matches `message.(received|delivered)` and dispatches to
 * handleMessage. The Netlify logs show why — in the same window it received **2 `call.completed`
 * events and 0 `message.*` events**. Quo simply never called it for a text, because the message
 * events are not ticked in Settings → Webhooks.
 *
 * The file even carried a comment asserting they were registered:
 *
 *     // Registered in Quo: Settings → Webhooks → events `call.completed`, `message.received`, …
 *
 * > **A comment describing third-party configuration is a claim, not a control.** Nothing verifies
 * > it, so it stays true-looking long after the config drifts or was never applied.
 * > ([[feedback-a-comment-is-not-an-interlock]])
 *
 * ─── WHAT THIS DETECTS ───────────────────────────────────────────────────────────────────────────
 * Not "no texts today" — that is normal and this must not cry wolf about it. It detects the
 * ASYMMETRY that proves a config gap: **inbound calls are arriving while inbound texts never have.**
 * Same webhook, same URL, same token. If the URL or token were wrong, calls would fail too.
 * ([[feedback-one-directional-error-is-never-noise]])
 *
 * Usage:  node scripts/check-inbound-sms-flowing.mjs [--json]
 * Exit 0 = flowing, or not enough evidence to accuse · 1 = calls arrive but texts never do · 2 = can't tell.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER = path.dirname(HERE);
const JSON_OUT = process.argv.includes('--json');

// SMS handling went live on this date; there is nothing to expect before it.
const SMS_SHIPPED = '2026-08-12';

try {
  const dotenv = await import('dotenv');
  dotenv.config({ path: path.join(SCRAPER, '.env') });
} catch {}

const KEY = process.env.AIRTABLE_API_KEY;
const BASE = process.env.AIRTABLE_BASE_ID;
if (!KEY || !BASE) { console.error('✗ Airtable creds missing — cannot check, refusing to report healthy.'); process.exit(2); }

const LOG_TABLE = 'Outreach Log';

async function count(formula) {
  const url = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(LOG_TABLE)}`
    + `?filterByFormula=${encodeURIComponent(formula)}&maxRecords=200`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 120)}`);
  const d = await r.json();
  if (d.error) throw new Error(JSON.stringify(d.error).slice(0, 120));
  return d.records.length;
}

let calls, sms;
try {
  calls = await count(`AND({Direction}="inbound",LOWER({Channel})="phone",IS_AFTER({Date},"${SMS_SHIPPED}"))`);
  sms   = await count(`AND(LOWER({Channel})="sms",IS_AFTER({Date},"${SMS_SHIPPED}"))`);
} catch (e) {
  // 4xx/5xx is INDETERMINATE, never "healthy" ([[feedback-indeterminate-is-not-a-finding]])
  console.error(`✗ Airtable query failed: ${String(e.message).slice(0, 110)} — refusing to judge.`);
  process.exit(2);
}

const days = Math.floor((Date.now() - Date.parse(SMS_SHIPPED)) / 86400000);
const broken = calls >= 3 && sms === 0;

if (JSON_OUT) {
  console.log(JSON.stringify({ since: SMS_SHIPPED, days, inboundCalls: calls, smsRows: sms, broken }, null, 2));
  process.exit(broken ? 1 : 0);
}

console.log(`\n===== INBOUND SMS -> CRM =====`);
console.log(`  window            since ${SMS_SHIPPED} (${days} days)`);
console.log(`  inbound calls     ${calls}`);
console.log(`  sms rows          ${sms}`);

if (!broken) {
  if (calls < 3) console.log(`\n✅ not enough inbound call traffic yet to draw a conclusion — not accusing.`);
  else console.log(`\n✅ inbound texts are reaching the CRM.`);
  process.exit(0);
}

console.error(`\n✗ inbound CALLS are arriving but inbound TEXTS never have, in ${days} days.`);
console.error(`   Same webhook, same URL, same token — so the endpoint is reachable and the handler`);
console.error(`   works. What is missing is the event subscription on Quo's side.`);
console.error(`\n   FIX: Quo → Settings → Webhooks → the rocketgrowthagency.com webhook → tick`);
console.error(`        'message.received' and 'message.delivered' (alongside 'call.completed').`);
console.error(`\n   Every text a prospect sends until then is invisible to the CRM: no lead, no log row,`);
console.error(`   no follow-up. It only exists in the Quo app.`);
process.exit(1);
