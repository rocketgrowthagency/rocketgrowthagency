// backtest-verification-gate.mjs — would the free internal verification gate have caught our
// KNOWN bounces BEFORE we sent? Runs the FREE layers we can test off-network:
//   1. string layer  — current (strengthened) sanitizeScrapedEmail: placeholder/role/aggregator denylist
//   2. MX layer      — dns.resolveMx: no mail server = guaranteed bounce
// The SMTP-RCPT + catch-all layer needs outbound port 25 (blocked on this network; runs on the
// 6am-guard machine) so it is reported separately as "needs live SMTP layer" — NOT counted as a miss.
import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { isLikelyEmail } = require(path.join(ROOT, 'lib', 'email-validation.cjs'));
const resolveMx = dns.promises.resolveMx;

const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')
  .filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const K = env.AIRTABLE_API_KEY, B = env.AIRTABLE_BASE_ID;
const BOUNCE_STATUSES = ['bounced', 'permanent-bounce', 'soft-bounced', 'no-replacement-found', 'invalid', 'blocked'];

async function loadBounced() {
  let recs = [], offset = null;
  do {
    const u = new URL(`https://api.airtable.com/v0/${B}/Leads`);
    u.searchParams.set('pageSize', '100');
    ['Business Name', 'Email', 'Email Status'].forEach((f) => u.searchParams.append('fields[]', f));
    if (offset) u.searchParams.set('offset', offset);
    const r = await fetch(u, { headers: { Authorization: 'Bearer ' + K } });
    const d = await r.json();
    if (d.error) throw new Error(JSON.stringify(d.error));
    recs = recs.concat(d.records || []); offset = d.offset;
  } while (offset);
  return recs.filter((r) => r.fields.Email && BOUNCE_STATUSES.includes(String(r.fields['Email Status'] || '').toLowerCase()));
}

async function hasMx(email) {
  const domain = String(email).slice(String(email).lastIndexOf('@') + 1).toLowerCase();
  try { const mx = await resolveMx(domain); return !!(mx && mx.length); }
  catch { return false; }
}

(async () => {
  const bounced = await loadBounced();
  console.log(`\nKnown bounces pulled from Airtable: ${bounced.length}\n`);
  if (!bounced.length) { console.log('No bounced leads found (Email Status in ' + JSON.stringify(BOUNCE_STATUSES) + ').'); return; }

  const buckets = { string: [], mx: [], smtp: [] };
  for (const r of bounced) {
    const email = String(r.fields.Email).trim();
    const name = (r.fields['Business Name'] || '').slice(0, 34);
    if (!isLikelyEmail(email)) { buckets.string.push({ email, name }); continue; }   // denylist/role/placeholder
    if (!(await hasMx(email))) { buckets.mx.push({ email, name }); continue; }               // no mail server
    buckets.smtp.push({ email, name });                                                       // needs live SMTP/catch-all layer
  }

  const n = bounced.length;
  const caught = buckets.string.length + buckets.mx.length;
  const pct = (x) => ((100 * x) / n).toFixed(1) + '%';
  console.log('=== WHICH FREE LAYER WOULD HAVE CAUGHT EACH KNOWN BOUNCE (pre-send) ===');
  console.log(`  String layer (denylist/role/placeholder): ${buckets.string.length}  (${pct(buckets.string.length)})`);
  console.log(`  MX layer     (no mail server on domain):  ${buckets.mx.length}  (${pct(buckets.mx.length)})`);
  console.log(`  --> Caught by FREE off-network layers:    ${caught} / ${n}  (${pct(caught)})`);
  console.log(`  Needs live SMTP/catch-all layer (port 25, runs on guard machine): ${buckets.smtp.length}  (${pct(buckets.smtp.length)})`);
  console.log('\n--- caught by string layer (denylist/role) ---');
  buckets.string.forEach((x) => console.log(`  DROP  ${x.name.padEnd(34)} <${x.email}>`));
  console.log('\n--- caught by MX layer (no MX = guaranteed bounce) ---');
  buckets.mx.forEach((x) => console.log(`  DROP  ${x.name.padEnd(34)} <${x.email}>`));
  console.log('\n--- would need the live SMTP/catch-all layer (untestable here) ---');
  buckets.smtp.forEach((x) => console.log(`  ????  ${x.name.padEnd(34)} <${x.email}>`));
})();
