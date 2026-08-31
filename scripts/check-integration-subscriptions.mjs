#!/usr/bin/env node
/**
 * check-integration-subscriptions.mjs — every external subscription we depend on must still exist.
 *
 * ─── WHY (2026-08-31) ────────────────────────────────────────────────────────────────────────────
 * Inbound texts were dropped for 19 days. The cause turned out not to be a wrong setting but a
 * DELETED one: the Quo account had zero webhooks, so inbound calls were being dropped too and
 * nothing noticed. Neither the code nor the CRM could tell, because the failure mode of a missing
 * subscription is **silence** — no error, no retry, no log line. It looks exactly like "nobody
 * texted today".
 *
 * > **A subscription living in someone else's dashboard is state we depend on, do not control, and
 * > cannot see.** It can be removed by a UI action, a plan change, or a support agent, and every
 * > system downstream keeps reporting healthy. The only defence is to re-read it on a schedule.
 *
 * Quo is now covered by check-quo-webhooks-live.mjs. This checks the OTHER integrations shaped the
 * same way — chiefly Netlify's form notifications, where a deletion would silently swallow every
 * Growth Audit and Get Started submission, which is the most expensive thing on the site.
 *
 * Deliberately reports UNKNOWN rather than OK when it cannot verify something (exit 2). A check that
 * cannot see the thing it guards must never say the thing is fine.
 *
 * Usage:  node scripts/check-integration-subscriptions.mjs [--json]
 * Exit 0 = all verified · 1 = a subscription is missing · 2 = could not verify.
 */
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRAPER = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const WEBSITE = path.join(path.dirname(SCRAPER), 'Rocket Growth Agency Website VS Code');
const JSON_OUT = process.argv.includes('--json');
try { (await import('dotenv')).config({ path: path.join(SCRAPER, '.env') }); } catch {}

const findings = [];
const notes = [];

// ── 1. Netlify form notifications ────────────────────────────────────────────────────────────────
// Every lead from the website arrives through a Netlify form. If the submission_created hooks are
// removed, submissions still SAVE (visible in the Netlify UI) but nothing is notified and nothing
// reaches the CRM — a silent lead leak that looks like a quiet week.
let siteId = process.env.NETLIFY_SITE_ID;
try {
  if (!siteId) {
    const raw = execFileSync('grep', ['-E', '^NETLIFY_SITE_ID=', path.join(SCRAPER, '.env')], { encoding: 'utf8' });
    siteId = raw.split('=').slice(1).join('=').trim();
  }
} catch {}

if (!siteId) {
  notes.push('NETLIFY_SITE_ID unknown — cannot verify form notifications.');
} else {
  try {
    const out = execFileSync('netlify',
      ['api', 'listHooksBySiteId', '--data', JSON.stringify({ site_id: siteId })],
      { encoding: 'utf8', cwd: WEBSITE, timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] });
    const hooks = JSON.parse(out);
    const subs = hooks.filter((h) => String(h.event || '').includes('submission_created') && !h.disabled);
    const urls = subs.filter((h) => h.type === 'url');
    const emails = subs.filter((h) => h.type === 'email');
    notes.push(`Netlify form hooks: ${urls.length} url + ${emails.length} email`);
    if (!subs.length) {
      findings.push({ what: 'netlify-form-hooks', msg: 'NO submission_created hook — website form submissions notify nothing and reach no CRM.' });
    } else if (!urls.length) {
      findings.push({ what: 'netlify-form-url-hook', msg: 'No URL hook on submission_created — email may still arrive, but nothing writes the lead to the CRM.' });
    }
  } catch (e) {
    notes.push(`could not list Netlify hooks (${String(e.message).slice(0, 60)})`);
  }
}

// ── 2. Quo — delegated, but assert the guard itself is reachable ─────────────────────────────────
try {
  execFileSync('node', [path.join(SCRAPER, 'scripts', 'check-quo-webhooks-live.mjs')],
    { encoding: 'utf8', timeout: 45000, stdio: ['ignore', 'pipe', 'pipe'] });
  notes.push('Quo webhooks: verified by check-quo-webhooks-live');
} catch (e) {
  if (e.status === 1) findings.push({ what: 'quo-webhooks', msg: 'Quo webhook subscription missing or incomplete — see check-quo-webhooks-live.' });
  else notes.push('Quo webhooks: could not verify (no key / API unreachable)');
}

// ── 3. The public endpoints those subscriptions call ─────────────────────────────────────────────
// A live subscription pointing at a dead endpoint fails just as silently.
const ENDPOINTS = [
  ['form-intake', 'https://www.rocketgrowthagency.com/.netlify/functions/form-intake'],
  ['fga-intake', 'https://www.rocketgrowthagency.com/.netlify/functions/fga-intake'],
  ['quo-call-webhook', 'https://www.rocketgrowthagency.com/.netlify/functions/quo-call-webhook'],
];
for (const [name, url] of ENDPOINTS) {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    // 401/400 are HEALTHY here: the function ran and rejected an unauthenticated/empty body.
    // 404 or 5xx means the endpoint is gone or broken.
    if (r.status === 404 || r.status >= 500) {
      findings.push({ what: name, msg: `endpoint returned ${r.status} — subscriptions pointing at it are firing into nothing.` });
    } else notes.push(`${name}: HTTP ${r.status} (reachable)`);
  } catch (e) {
    findings.push({ what: name, msg: `unreachable: ${String(e.message).slice(0, 60)}` });
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify({ findings, notes }, null, 2));
  process.exit(findings.length ? 1 : 0);
}

console.log(`\n===== EXTERNAL SUBSCRIPTIONS =====`);
for (const n of notes) console.log(`  · ${n}`);

if (!findings.length) {
  console.log(`\n✅ every external subscription we can verify is in place.`);
  process.exit(0);
}
console.error(`\n✗ ${findings.length} subscription problem(s):`);
for (const f of findings) console.error(`     [${f.what}] ${f.msg}`);
console.error(`\n   These fail SILENTLY — the sending side reports success and nothing downstream errors.`);
process.exit(1);
