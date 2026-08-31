#!/usr/bin/env node
/**
 * check-quo-webhooks-live.mjs — the Quo webhook subscription must still exist.
 *
 * ─── WHY (2026-08-31) ────────────────────────────────────────────────────────────────────────────
 * Inbound texts never reached the CRM for 19 days. When an API key finally made the account
 * readable, the cause was worse than a missing event: **the account had ZERO webhooks.** Not a
 * wrong event list — none at all. So inbound CALLS were silently broken too, and would have stayed
 * broken until somebody happened to notice a missed call.
 *
 * Quo models calls and messages as SEPARATE webhook resources (`POST /v1/webhooks/calls` and
 * `/v1/webhooks/messages`), so a call webhook can never carry `message.received`. That is why
 * ticking the box in the UI three times changed nothing.
 *
 * > **A third-party subscription is state you do not control and cannot see.** It can be deleted by
 * > a UI action, a plan change, or a support fix, and NOTHING in our system notices — the failure
 * > mode is silence. Check it, on a schedule, against their API.
 *
 * The existing `check-inbound-sms-flowing.mjs` catches the *consequence* (calls arriving while texts
 * never do) but needs ≥3 inbound calls of evidence and only fires after damage. This checks the
 * *cause* directly and fires immediately.
 *
 * Usage:  node scripts/check-quo-webhooks-live.mjs [--json]
 * Exit 0 = subscription intact · 1 = missing/incomplete · 2 = cannot tell.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRAPER = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const JSON_OUT = process.argv.includes('--json');
try { (await import('dotenv')).config({ path: path.join(SCRAPER, '.env') }); } catch {}

const KEY = process.env.QUO_API_KEY;
if (!KEY) {
  // Not a pass. Without the key this is unknowable, and "unknown" must never read as "fine".
  console.error('✗ QUO_API_KEY not set — cannot verify the webhook subscription. Refusing to report healthy.');
  console.error('  Set it in the Scraper .env; see scripts/quo-webhook-sync.mjs.');
  process.exit(2);
}

const WANT = ['call.completed', 'message.received', 'message.delivered'];
const OURS = 'quo-call-webhook';

let hooks;
try {
  const r = await fetch('https://api.openphone.com/v1/webhooks', { headers: { Authorization: KEY } });
  if (!r.ok) {
    console.error(`✗ Quo API returned ${r.status} — indeterminate, not healthy. ${(await r.text()).slice(0, 120)}`);
    process.exit(2);
  }
  const j = await r.json();
  hooks = j.data || j || [];
} catch (e) {
  console.error(`✗ could not reach the Quo API: ${String(e.message).slice(0, 100)} — refusing to judge.`);
  process.exit(2);
}

const ours = hooks.filter((h) => String(h.url || '').includes(OURS));
const events = new Set(ours.flatMap((h) => h.events || []));
const missing = WANT.filter((e) => !events.has(e));
const disabled = ours.filter((h) => h.status && String(h.status).toLowerCase() !== 'enabled');

if (JSON_OUT) {
  console.log(JSON.stringify({ total: hooks.length, ours: ours.length, events: [...events], missing,
    disabled: disabled.map((h) => h.id) }, null, 2));
  process.exit(missing.length || disabled.length ? 1 : 0);
}

console.log(`\n===== QUO WEBHOOK SUBSCRIPTION =====`);
console.log(`  webhooks on the account   ${hooks.length}`);
console.log(`  pointing at our endpoint  ${ours.length}`);
console.log(`  events subscribed         ${[...events].join(', ') || '(none)'}`);

if (!missing.length && !disabled.length) {
  console.log(`\n✅ subscription intact — calls and texts will both reach the CRM.`);
  process.exit(0);
}
if (!ours.length) {
  console.error(`\n✗ NO webhook points at our endpoint. Inbound calls AND texts are being dropped`);
  console.error(`   silently right now — Quo is not calling us at all.`);
} else if (missing.length) {
  console.error(`\n✗ subscription incomplete — missing: ${missing.join(', ')}`);
  console.error(`   Remember: calls and messages are SEPARATE webhook resources in Quo. Missing`);
  console.error(`   message.* means there is no MESSAGE webhook, not a wrong tick on the call one.`);
}
if (disabled.length) console.error(`\n✗ ${disabled.length} of our webhook(s) are not 'enabled'.`);
console.error(`\n   FIX: node scripts/quo-webhook-sync.mjs --apply   (creates whatever is missing,`);
console.error(`        then re-reads it from the API to confirm the server agrees)`);
process.exit(1);
