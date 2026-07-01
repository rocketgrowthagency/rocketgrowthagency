#!/usr/bin/env node
/**
 * analytics-weekly.mjs — weekly GSC + GA4 snapshot, emailed to Chris via Gmail (ADC).
 * Scheduled by launchd com.rga.analytics-weekly. Also writes a dated file to the Website
 * repo's reports/analytics/ folder. Usage: node scripts/analytics-weekly.mjs [--no-email]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleAuth } from 'google-auth-library';

const SCRAPER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_DIR = path.join(path.dirname(SCRAPER_DIR), 'Rocket Growth Agency Website VS Code', 'reports', 'analytics');
const GA4 = '529089636';
const GSC = 'sc-domain:rocketgrowthagency.com';
const TO = 'hello@rocketgrowthagency.com';
const NO_EMAIL = process.argv.includes('--no-email');
const DAYS = 28;
const iso = (d) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);

async function tok(scopes) { const c = await new GoogleAuth({ scopes }).getClient(); return (await c.getAccessToken()).token; }
async function post(url, t, body) { const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { s: r.status, j: await r.json().catch(() => ({})) }; }

(async () => {
  const rows = [];
  const line = (s) => rows.push(s);

  // ---- GSC ----
  const gt = await tok(['https://www.googleapis.com/auth/webmasters.readonly']);
  const gu = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC)}/searchAnalytics/query`;
  const gEnd = iso(3), gStart = iso(3 + DAYS);
  const tot = (await post(gu, gt, { startDate: gStart, endDate: gEnd, dimensions: [] })).j.rows?.[0] || {};
  const pages = (await post(gu, gt, { startDate: gStart, endDate: gEnd, dimensions: ['page'], rowLimit: 8 })).j.rows || [];
  const qs = (await post(gu, gt, { startDate: gStart, endDate: gEnd, dimensions: ['query'], rowLimit: 8 })).j.rows || [];
  line(`<h2>🔎 Search Console — ${gStart} → ${gEnd}</h2>`);
  line(`<p><b>${tot.clicks || 0}</b> clicks · <b>${tot.impressions || 0}</b> impressions · CTR ${((tot.ctr || 0) * 100).toFixed(1)}% · avg position <b>${(tot.position || 0).toFixed(1)}</b></p>`);
  line('<p><b>Top pages:</b><br>' + (pages.map((r) => `${r.keys[0].replace('https://www.rocketgrowthagency.com', '')} — ${r.impressions} impr, pos ${r.position.toFixed(1)}`).join('<br>') || '(none indexed yet)') + '</p>');
  line('<p><b>Top queries:</b><br>' + (qs.map((r) => `${r.keys[0]} — ${r.impressions} impr, pos ${r.position.toFixed(1)}`).join('<br>') || '(brand only)') + '</p>');

  // ---- GA4 ----
  const at = await tok(['https://www.googleapis.com/auth/analytics.readonly']);
  const ru = `https://analyticsdata.googleapis.com/v1beta/properties/${GA4}:runReport`;
  const chan = (await post(ru, at, { dateRanges: [{ startDate: `${DAYS}daysAgo`, endDate: 'today' }], dimensions: [{ name: 'sessionDefaultChannelGroup' }], metrics: [{ name: 'activeUsers' }, { name: 'sessions' }], orderBys: [{ metric: { metricName: 'sessions' }, desc: true }] })).j.rows || [];
  const lps = (await post(ru, at, { dateRanges: [{ startDate: `${DAYS}daysAgo`, endDate: 'today' }], dimensions: [{ name: 'landingPage' }], metrics: [{ name: 'sessions' }], orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 8 })).j.rows || [];
  const totU = chan.reduce((a, r) => a + Number(r.metricValues[0].value), 0);
  line(`<h2>📈 GA4 — last ${DAYS} days</h2>`);
  line(`<p><b>${totU}</b> active users. <b>Traffic by channel:</b><br>` + chan.map((r) => `${r.dimensionValues[0].value} — ${r.metricValues[1].value} sessions`).join('<br>') + '</p>');
  line('<p><b>Top landing pages:</b><br>' + lps.map((r) => `${r.dimensionValues[0].value} — ${r.metricValues[0].value}`).join('<br>') + '</p>');

  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:640px">${rows.join('\n')}<hr><p style="color:#888;font-size:12px">RGA weekly analytics · auto-generated ${iso(0)}</p></div>`;
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  // save dated file
  try { fs.mkdirSync(REPORT_DIR, { recursive: true }); fs.writeFileSync(path.join(REPORT_DIR, `weekly-${iso(0)}.html`), html); } catch (_) {}

  if (NO_EMAIL) { console.log(text); process.exit(0); }

  // email via Gmail API (ADC, gmail.send)
  const mt = await tok(['https://www.googleapis.com/auth/gmail.send']);
  const subject = `RGA weekly: ${tot.clicks || 0} search clicks · ${totU} users · pos ${(tot.position || 0).toFixed(1)}`;
  const mime = [`To: ${TO}`, `From: ${TO}`, `Subject: ${subject}`, 'MIME-Version: 1.0', 'Content-Type: text/html; charset=UTF-8', '', html].join('\r\n');
  const raw = Buffer.from(mime).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const send = await post('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', mt, { raw });
  console.log(send.s === 200 ? `✓ weekly report emailed to ${TO}` : `✗ email failed ${send.s}: ${JSON.stringify(send.j).slice(0, 200)}`);
})().catch((e) => { console.error('analytics-weekly failed:', e.message); process.exit(1); });
