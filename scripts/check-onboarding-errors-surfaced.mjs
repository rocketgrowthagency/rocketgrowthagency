#!/usr/bin/env node
/**
 * check-onboarding-errors-surfaced.mjs — a caught error stored on a record is an outage nobody knows about.
 *
 * ─── WHY (2026-09-05) ────────────────────────────────────────────────────────────────────────────
 * `oauth-google-callback.js` auto-adds RGA as a MANAGER on a client's Google Business Profile right
 * after they connect. It sent a field name that does not exist (`adminEmail` instead of `admin`), so
 * Google returned 400 and the step NEVER ONCE WORKED.
 *
 * The code caught the failure and wrote it to `client_onboarding_records.data.gbp_manager_auto_add_error`.
 * Then nothing. No alert, no report line, no dashboard. It sat there from 2026-08-12 and was only found
 * by reading the record by hand three weeks later.
 *
 * > **A swallowed error is an outage nobody has noticed yet.** Catching an error and storing it is only
 * > half a handler — the other half is making sure a human sees it.
 *
 * This scans every client onboarding record for stored error/failure fields and fails if any is
 * non-empty, so the next one surfaces the morning after it happens instead of in three weeks.
 *
 * Usage:  node scripts/check-onboarding-errors-surfaced.mjs [--json]
 * Exit 0 = no stored errors · 1 = a client carries a silent failure · 2 = could not check.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRAPER = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
try { (await import('dotenv')).config({ path: path.join(SCRAPER, '.env') }); } catch {}

const JSON_OUT = process.argv.includes('--json');
const U = process.env.SUPABASE_URL;
const K = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!U || !K) { console.error('✗ Supabase creds missing — cannot check. NOT healthy.'); process.exit(2); }
const h = { apikey: K, Authorization: `Bearer ${K}` };

// Any key whose NAME says it holds a failure. Deliberately name-based: a new failure field added
// later is caught automatically, without anyone remembering to update this list.
const ERRORY = /(error|failure|failed|exception|denied)(_|$)/i;

let clients, records;
try {
  clients = await (await fetch(`${U}/rest/v1/clients?select=id,business_name,status`, { headers: h })).json();
  records = await (await fetch(`${U}/rest/v1/client_onboarding_records?select=client_id,data,template_version`, { headers: h })).json();
  if (!Array.isArray(clients) || !Array.isArray(records)) throw new Error('unexpected response shape');
} catch (e) {
  console.error(`✗ could not read Supabase (${String(e.message).slice(0, 70)}) — indeterminate, NOT healthy.`);
  process.exit(2);
}
if (!records.length) { console.error('✗ zero onboarding records — refusing to judge over an empty set.'); process.exit(2); }

const nameOf = (id) => clients.find((c) => c.id === id)?.business_name || id.slice(0, 8);
const found = [];

// Walk nested objects — the failures live inside `data`, sometimes one level down inside `tasks`.
const walk = (obj, clientId, trail = []) => {
  if (!obj || typeof obj !== 'object') return;
  for (const [k, v] of Object.entries(obj)) {
    if (ERRORY.test(k) && v !== null && v !== '' && v !== false) {
      found.push({ client: nameOf(clientId), field: [...trail, k].join('.'), value: String(typeof v === 'object' ? JSON.stringify(v) : v).replace(/\s+/g, ' ').slice(0, 130) });
    } else if (v && typeof v === 'object' && trail.length < 3) {
      walk(v, clientId, [...trail, k]);
    }
  }
};
for (const r of records) walk(r.data || {}, r.client_id);

if (JSON_OUT) { console.log(JSON.stringify({ records: records.length, found }, null, 2)); process.exit(found.length ? 1 : 0); }

console.log('\n===== ONBOARDING ERRORS SURFACED =====');
console.log(`  onboarding records scanned  ${records.length}`);

if (!found.length) { console.log('\n✅ no client carries a stored, unsurfaced failure.'); process.exit(0); }

console.error(`\n✗ ${found.length} stored failure(s) that nobody has been told about:`);
for (const f of found) console.error(`     ${f.client.slice(0, 26).padEnd(28)} ${f.field.padEnd(34)} ${f.value}`);
console.error('\n   These were CAUGHT and WRITTEN DOWN, then never shown to anyone. Fix the underlying');
console.error('   step, then clear the field — leaving it set keeps this red and that is correct.');
process.exit(1);
