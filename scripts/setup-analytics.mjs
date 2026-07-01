#!/usr/bin/env node
/**
 * setup-analytics.mjs — one-time analytics setup via service account (2026-06-30).
 *
 * Prereq: a Google service-account JSON key with GA4 Admin + Search Console access, path in
 * Scraper .env as GOOGLE_SA_KEY_FILE=/absolute/path/to/key.json (see the SA setup guide).
 *
 * Usage:
 *   node scripts/setup-analytics.mjs --check       # verify auth + list GA4 property + GSC sites
 *   node scripts/setup-analytics.mjs --dimensions  # register the 11 custom dimensions (idempotent)
 *   node scripts/setup-analytics.mjs --sitemap      # submit sitemap.xml to Search Console
 *   node scripts/setup-analytics.mjs                # run all of the above
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JWT, GoogleAuth } from 'google-auth-library';

const SCRAPER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(fs.readFileSync(path.join(SCRAPER_DIR, '.env'), 'utf8').split('\n').filter(Boolean).map((l) => { const i = l.indexOf('='); return i < 0 ? [l, ''] : [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));

const KEY_FILE = env.GOOGLE_SA_KEY_FILE;
const GA4_PROPERTY = env.GA4_PROPERTY_ID || '514075067';           // keeper property
const GSC_SITE = process.env.GSC_SITE_URL || env.GSC_SITE_URL || 'sc-domain:rocketgrowthagency.com';
const SITEMAP = 'https://www.rocketgrowthagency.com/sitemap.xml';
const ARGS = process.argv.slice(2);
const RUN = (f) => ARGS.length === 0 || ARGS.includes(f);

// AUTH: prefer a service-account key file if present; otherwise fall back to Application Default
// Credentials (ADC) — i.e. the user's own gcloud login. ADC is what we use here because the org
// policy `iam.disableServiceAccountKeyCreation` blocks downloadable SA keys. Chris runs once:
//   gcloud auth application-default login --scopes=openid,\
//     https://www.googleapis.com/auth/analytics.edit,https://www.googleapis.com/auth/webmasters
// Since Chris already owns GA4 + Search Console, ADC-as-Chris has all needed access (no SA grant).
const USE_ADC = !KEY_FILE || !fs.existsSync(KEY_FILE);
const key = USE_ADC ? null : JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
async function token(scopes) {
  if (USE_ADC) {
    const client = await new GoogleAuth({ scopes }).getClient();
    const t = await client.getAccessToken();
    if (!t || !t.token) throw new Error('No ADC token — run: gcloud auth application-default login --scopes=openid,https://www.googleapis.com/auth/analytics.edit,https://www.googleapis.com/auth/webmasters');
    return t.token;
  }
  const client = new JWT({ email: key.client_email, key: key.private_key, scopes });
  const { access_token } = await client.authorize();
  return access_token;
}
async function api(url, tok, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  const text = await res.text();
  let body; try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  return { ok: res.ok, status: res.status, body };
}

// 11 custom dimensions for the cold-outreach funnel (Event scope). parameterName must match the
// params our tracking sends (email_day, cta_type, lead_id, business_name, business_slug, channel,
// sequence_step) + video engagement + conversion params.
const DIMENSIONS = [
  ['email_day', 'Email Day'], ['cta_type', 'CTA Type'], ['lead_id', 'Lead ID'],
  ['business_name', 'Business Name'], ['business_slug', 'Business Slug'], ['channel', 'Channel'],
  ['sequence_step', 'Sequence Step'], ['video_percent', 'Video Percent'], ['map_rank', 'Map Rank'],
  ['search_term', 'Search Term'], ['variant', 'Email Variant'],
];

(async () => {
  console.log(`[setup-analytics] auth: ${USE_ADC ? 'ADC (your gcloud login)' : 'service-account key ' + key.client_email}\n  GA4 property: ${GA4_PROPERTY} | GSC site: ${GSC_SITE}\n`);

  if (RUN('--check')) {
    const t = await token(['https://www.googleapis.com/auth/analytics.readonly', 'https://www.googleapis.com/auth/webmasters.readonly']);
    const g = await api(`https://analyticsadmin.googleapis.com/v1beta/properties/${GA4_PROPERTY}`, t);
    console.log(g.ok ? `  ✓ GA4 reachable: ${g.body.displayName}` : `  ✗ GA4 error ${g.status}: ${JSON.stringify(g.body).slice(0, 160)}`);
    const s = await api('https://www.googleapis.com/webmasters/v3/sites', t);
    console.log(s.ok ? `  ✓ GSC reachable: ${(s.body.siteEntry || []).map((x) => x.siteUrl).join(', ') || '(no sites — grant the SA access in Search Console)'}` : `  ✗ GSC error ${s.status}: ${JSON.stringify(s.body).slice(0, 160)}`);
  }

  if (RUN('--dimensions')) {
    console.log('\n[dimensions] registering (idempotent)…');
    const t = await token(['https://www.googleapis.com/auth/analytics.edit']);
    const existing = await api(`https://analyticsadmin.googleapis.com/v1beta/properties/${GA4_PROPERTY}/customDimensions`, t);
    const have = new Set(((existing.body || {}).customDimensions || []).map((d) => d.parameterName));
    for (const [param, name] of DIMENSIONS) {
      if (have.has(param)) { console.log(`  = ${param} (exists)`); continue; }
      const r = await api(`https://analyticsadmin.googleapis.com/v1beta/properties/${GA4_PROPERTY}/customDimensions`, t, { method: 'POST', body: JSON.stringify({ parameterName: param, displayName: name, scope: 'EVENT' }) });
      console.log(r.ok ? `  + ${param} → "${name}"` : `  ✗ ${param}: ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
    }
  }

  if (RUN('--sitemap')) {
    console.log('\n[sitemap] submitting to Search Console…');
    const t = await token(['https://www.googleapis.com/auth/webmasters']);
    const r = await api(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE)}/sitemaps/${encodeURIComponent(SITEMAP)}`, t, { method: 'PUT' });
    console.log(r.ok ? `  ✓ submitted ${SITEMAP}` : `  ✗ ${r.status}: ${JSON.stringify(r.body).slice(0, 160)}`);
  }
  console.log('\n[setup-analytics] done.');
})().catch((e) => { console.error('[setup-analytics] FAILED:', e.message); process.exit(1); });
