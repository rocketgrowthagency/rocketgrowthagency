#!/usr/bin/env node
/**
 * analytics-report.mjs — pulls a GSC + GA4 snapshot via ADC (Chris's gcloud login).
 * Doubles as the weekly report. Usage: node scripts/analytics-report.mjs [days=28]
 */
import { GoogleAuth } from 'google-auth-library';

const GA4 = '529089636';
const GSC = 'sc-domain:rocketgrowthagency.com';
const DAYS = Number(process.argv[2] || 28);
const iso = (d) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
const GSC_END = iso(3), GSC_START = iso(3 + DAYS);   // GSC lags ~2-3 days
const GA_START = `${DAYS}daysAgo`, GA_END = 'today';

async function tok(scopes) { const c = await new GoogleAuth({ scopes }).getClient(); return (await c.getAccessToken()).token; }
async function post(url, t, body) {
  const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})); return { ok: r.ok, status: r.status, j };
}
const pad = (s, n) => String(s).padEnd(n).slice(0, n);
const num = (n) => Number(n || 0).toLocaleString();

(async () => {
  console.log(`\n=== RGA ANALYTICS SNAPSHOT — last ${DAYS} days ===`);

  // ---------- SEARCH CONSOLE ----------
  const gt = await tok(['https://www.googleapis.com/auth/webmasters.readonly']);
  const gscUrl = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC)}/searchAnalytics/query`;
  const totals = await post(gscUrl, gt, { startDate: GSC_START, endDate: GSC_END, dimensions: [] });
  const t0 = (totals.j.rows || [])[0] || {};
  console.log(`\n── GOOGLE SEARCH CONSOLE (${GSC_START} → ${GSC_END}) ──`);
  console.log(`  Clicks: ${num(t0.clicks)}   Impressions: ${num(t0.impressions)}   CTR: ${((t0.ctr || 0) * 100).toFixed(1)}%   Avg position: ${(t0.position || 0).toFixed(1)}`);

  const queries = await post(gscUrl, gt, { startDate: GSC_START, endDate: GSC_END, dimensions: ['query'], rowLimit: 12 });
  console.log(`\n  Top queries (${(queries.j.rows || []).length}):`);
  console.log(`    ${pad('query', 40)} ${pad('impr', 7)} ${pad('clicks', 7)} pos`);
  for (const r of (queries.j.rows || [])) console.log(`    ${pad(r.keys[0], 40)} ${pad(num(r.impressions), 7)} ${pad(num(r.clicks), 7)} ${(r.position).toFixed(1)}`);

  const pages = await post(gscUrl, gt, { startDate: GSC_START, endDate: GSC_END, dimensions: ['page'], rowLimit: 12 });
  console.log(`\n  Top pages by impressions:`);
  for (const r of (pages.j.rows || [])) console.log(`    ${pad(r.keys[0].replace('https://www.rocketgrowthagency.com', ''), 48)} ${pad(num(r.impressions), 7)} clk ${num(r.clicks)} pos ${(r.position).toFixed(1)}`);
  if (!(pages.j.rows || []).length) console.log('    (no page-level impressions yet — new content not indexed/ranking yet)');

  // ---------- GA4 ----------
  const at = await tok(['https://www.googleapis.com/auth/analytics.readonly']);
  const runUrl = `https://analyticsdata.googleapis.com/v1beta/properties/${GA4}:runReport`;
  const chan = await post(runUrl, at, { dateRanges: [{ startDate: GA_START, endDate: GA_END }], dimensions: [{ name: 'sessionDefaultChannelGroup' }], metrics: [{ name: 'activeUsers' }, { name: 'sessions' }], orderBys: [{ metric: { metricName: 'sessions' }, desc: true }] });
  console.log(`\n── GA4 (last ${DAYS} days, ${GA_START} → today) ──`);
  const totU = (chan.j.rows || []).reduce((a, r) => a + Number(r.metricValues[0].value), 0);
  console.log(`  Active users: ${num(totU)}   (traffic by channel:)`);
  for (const r of (chan.j.rows || [])) console.log(`    ${pad(r.dimensionValues[0].value, 24)} users ${pad(num(r.metricValues[0].value), 6)} sessions ${num(r.metricValues[1].value)}`);
  if (chan.status !== 200) console.log('    GA4 error:', JSON.stringify(chan.j).slice(0, 200));

  const lp = await post(runUrl, at, { dateRanges: [{ startDate: GA_START, endDate: GA_END }], dimensions: [{ name: 'landingPage' }], metrics: [{ name: 'sessions' }], orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 10 });
  console.log(`\n  Top landing pages:`);
  for (const r of (lp.j.rows || [])) console.log(`    ${pad(r.dimensionValues[0].value, 52)} ${num(r.metricValues[0].value)}`);
  console.log('');
})().catch((e) => { console.error('report failed:', e.message); process.exit(1); });
