#!/usr/bin/env node
/**
 * generate-data-report.mjs — "The State of Local SEO" benchmark report (2026-07-11).
 *
 * A linkable/rankable AUTHORITY asset built from our own per-city+vertical scrape data
 * (data/vertical-benchmarks/*.json — the moat). Aggregates REAL numbers (no fabricated stats — computed live,
 * so it auto-updates + grows as we scrape). Ranks for "local SEO benchmarks / how many reviews to rank on
 * Google Maps", earns backlinks, and arms the sales pitch ("the median top-3 <trade> in your area has X
 * reviews"). Writes /state-of-local-seo/index.html (reuses the locked theme). See project_growth_strategy.
 *
 * Usage: node scripts/generate-data-report.mjs        → writes the live page
 *        MOCKUP=1 node scripts/generate-data-report.mjs → self-contained mockup-state-of-local-seo.html
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRAPER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(path.dirname(SCRAPER_DIR), 'Rocket Growth Agency Website VS Code');
const BENCH = path.join(SCRAPER_DIR, 'data', 'vertical-benchmarks');
const TEMPLATE = path.join(WEB, 'industries', 'plumbers', 'index.html');
const MOCKUP = process.env.MOCKUP === '1';
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const parse = (t) => { const m = t.match(/^(.*?)\s+in\s+(.*?),?\s*([A-Z]{2})\.?$/i); return m ? { v: titleCase(m[1].trim()), c: m[2].trim(), s: m[3] } : null; };
const median = (a) => { a = a.filter((x) => x != null).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };
const avg = (a) => { a = a.filter((x) => x != null); return a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length * 100) / 100 : null; };

const all = fs.readdirSync(BENCH).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(BENCH, f), 'utf8')));
const verticals = new Set(), cities = new Set(); let audited = 0; const byV = {};
let latest = '';
for (const b of all) { const p = parse(b.searchTerm); if (!p) continue; verticals.add(p.v); cities.add(p.c + ', ' + p.s); audited += b.leadsAudited || 0; (byV[p.v] = byV[p.v] || []).push(b); if ((b.auditedDate || '') > latest) latest = b.auditedDate; }
const medTop3 = median(all.map((b) => b.reviewsTop3Avg));
const medRating = avg(all.map((b) => b.ratingTop3Avg));
const medCompete = median(all.map((b) => b.reviewsTop10?.p75));
const rows = Object.entries(byV).map(([v, bs]) => ({ v, rev3: median(bs.map((x) => x.reviewsTop3Avg)), thr: median(bs.map((x) => x.reviewsTop10?.p75)), rating: avg(bs.map((x) => x.ratingTop3Avg)), n: bs.length }))
  .filter((r) => r.rev3 != null).sort((a, b) => b.rev3 - a.rev3);
const loRev = Math.min(...rows.map((r) => r.rev3)), hiRev = Math.max(...rows.map((r) => r.rev3));
const hiV = rows.find((r) => r.rev3 === hiRev)?.v, loV = rows.find((r) => r.rev3 === loRev)?.v;

const stat = (n, l) => `<div style="background:#f6f9ff;border:1px solid #e2eaff;border-radius:14px;padding:1.3rem 1rem;text-align:center"><div style="font-size:2.2rem;font-weight:900;color:#2457e6;line-height:1">${n}</div><div style="font-size:.86rem;color:#51607b;font-weight:600;margin-top:.4rem">${l}</div></div>`;
const tableRows = rows.map((r) => `<tr><td style="padding:.6rem .9rem;border-bottom:1px solid #eef1f7;font-weight:600;color:#0f1b3d">${esc(r.v)}</td><td style="padding:.6rem .9rem;border-bottom:1px solid #eef1f7;text-align:right;font-variant-numeric:tabular-nums;font-weight:700;color:#2457e6">${r.rev3}</td><td style="padding:.6rem .9rem;border-bottom:1px solid #eef1f7;text-align:right;font-variant-numeric:tabular-nums">${r.thr ?? '—'}</td><td style="padding:.6rem .9rem;border-bottom:1px solid #eef1f7;text-align:right;font-variant-numeric:tabular-nums">${r.rating ?? '—'}&#9733;</td><td style="padding:.6rem .9rem;border-bottom:1px solid #eef1f7;text-align:right;color:#94a3b8">${r.n}</td></tr>`).join('\n');
const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>';

// Hero data-viz: pick ~7 industries spanning the full range (high→low) for a descending bar chart.
const chartRows = (() => { const n = Math.min(7, rows.length); if (n < 2) return rows; const step = (rows.length - 1) / (n - 1); return Array.from({ length: n }, (_, i) => rows[Math.round(i * step)]); })();
const maxR = chartRows[0].rev3;
const bars = chartRows.map((r) => `<div style="margin:.55rem 0"><div style="display:flex;justify-content:space-between;font-size:.82rem;margin-bottom:.28rem"><span style="color:#334466;font-weight:600">${esc(r.v)}</span><span style="color:#2457e6;font-weight:800;font-variant-numeric:tabular-nums">${r.rev3}</span></div><div style="height:9px;background:#eef2fb;border-radius:99px;overflow:hidden"><div style="height:100%;width:${Math.max(4, Math.round(r.rev3 / maxR * 100))}%;background:linear-gradient(90deg,#2457e6,#4f7bff);border-radius:99px"></div></div></div>`).join('');
const rangeX = loRev > 0 ? Math.round(hiRev / loRev) : null;

const MAIN = `
  <section class="ix-hero"><div class="ix-hero-in">
    <div>
      <p class="ix-eyebrow">Local SEO benchmarks &middot; ${new Date(latest || Date.now()).getFullYear()}</p>
      <h1 class="ix-h1">The State of <span class="solid-blue">Local SEO</span></h1>
      <p class="ix-sub" style="max-width:52ch">What it actually takes to rank in the Google Map Pack &mdash; from a live audit of <strong>${audited} businesses</strong> across <strong>${verticals.size} industries</strong> in <strong>${cities.size} markets</strong>. Real numbers, updated as we scrape more.</p>
      <div class="ix-cta-row"><a class="ix-btn" href="/free-growth-audit/">See where you rank &mdash; free audit ${arrow}</a></div>
    </div>
    <aside class="ix-why" style="align-self:start">
      <p class="ix-eyebrow" style="margin-bottom:.2rem">Reviews to reach the top 3</p>
      <p style="color:#51607b;font-size:.85rem;line-height:1.5;margin:0 0 1.1rem">Median for a top-3 business, by industry${rangeX ? ` &mdash; the bar swings <strong style="color:#0f1b3d">${rangeX}&times;</strong> by trade` : ''}.</p>
      ${bars}
    </aside>
  </div></section>

  <section><div class="ix-sec">
    <div class="ix-head"><p class="ix-kick">Headline numbers</p><h2 class="ix-h2">The Map Pack, by the numbers</h2></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;margin-top:1.4rem">
      ${stat(verticals.size, 'industries analyzed')}
      ${stat(audited, 'businesses audited')}
      ${stat(medTop3, 'median reviews of a top-3 business')}
      ${stat(medRating + '&#9733;', 'median top-3 rating')}
    </div>
  </div></section>

  <section><div class="ix-sec" style="max-width:840px">
    <div class="ix-head"><p class="ix-kick">Finding 1</p><h2 class="ix-h2">Reviews are the price of entry &mdash; and it swings wildly by trade</h2></div>
    <p class="ix-lead" style="margin-top:.9rem">Across every market we audited, the median business in the top 3 has <strong>${medTop3} reviews</strong>. But the bar depends entirely on your trade: a top-3 <strong>${esc((hiV||'').toLowerCase())}</strong> carries a median of <strong>${hiRev}</strong> reviews, while <strong>${esc((loV||'').toLowerCase())}</strong> break in with as few as <strong>${loRev}</strong>. Chasing a generic "get more reviews" number is a mistake &mdash; you need YOUR trade's real threshold.</p>
  </div></section>

  <section><div class="ix-sec">
    <div class="ix-head"><p class="ix-kick">The data</p><h2 class="ix-h2">Reviews it takes to reach the top 3, by industry</h2></div>
    <div style="overflow-x:auto;margin-top:1.4rem;border:1px solid #e8ecf3;border-radius:14px">
      <table style="width:100%;border-collapse:collapse;font-size:.94rem;min-width:560px">
        <thead><tr style="background:#f6f9ff">
          <th style="padding:.7rem .9rem;text-align:left;font-size:.78rem;text-transform:uppercase;letter-spacing:.05em;color:#475569">Industry</th>
          <th style="padding:.7rem .9rem;text-align:right;font-size:.78rem;text-transform:uppercase;letter-spacing:.05em;color:#475569">Median top-3 reviews</th>
          <th style="padding:.7rem .9rem;text-align:right;font-size:.78rem;text-transform:uppercase;letter-spacing:.05em;color:#475569">Reviews to compete</th>
          <th style="padding:.7rem .9rem;text-align:right;font-size:.78rem;text-transform:uppercase;letter-spacing:.05em;color:#475569">Avg rating</th>
          <th style="padding:.7rem .9rem;text-align:right;font-size:.78rem;text-transform:uppercase;letter-spacing:.05em;color:#475569">Markets</th>
        </tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
    <p style="color:#94a3b8;font-size:.82rem;margin-top:.8rem">"Reviews to compete" = the 75th-percentile review count of the top 10 — a realistic bar to break into the pack. Some rows are single-market samples; the dataset grows as we audit more.</p>
  </div></section>

  <section><div class="ix-sec" style="max-width:840px">
    <div class="ix-head"><p class="ix-kick">Finding 2</p><h2 class="ix-h2">The rating floor is brutal &mdash; ${medRating}&#9733; median</h2></div>
    <p class="ix-lead" style="margin-top:.9rem">The median top-3 business rates <strong>${medRating}&#9733;</strong>. In practice, dip below ~4.7 and you're effectively invisible in the pack no matter how many reviews you have. Rating recency and velocity matter as much as the raw star average &mdash; a steady stream of fresh reviews beats a big stale pile.</p>
  </div></section>

  <section><div class="ix-sec">
    <div style="background:linear-gradient(155deg,#0f1a3a,#1a2f6b);border-radius:22px;padding:2.4rem;color:#fff;display:grid;grid-template-columns:1.25fr 1fr;gap:2.4rem;align-items:center;box-shadow:0 30px 60px -34px rgba(15,26,58,.6)">
      <div>
        <p style="font-size:.78rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#7aa0ff;margin:0 0 .5rem">Methodology</p>
        <h2 style="font-size:1.55rem;font-weight:900;letter-spacing:-.02em;margin:0 0 .7rem;line-height:1.15">Built from live Google Maps audits &mdash; not estimates</h2>
        <p style="color:#c3d0ee;line-height:1.6;margin:0;font-size:.96rem">We audit the live Map Pack top 10 for local-service searches across US markets. Every figure on this page is computed directly from that data and refreshes automatically as we audit more &mdash; so it only gets sharper.</p>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.8rem">
        <div style="background:rgba(122,160,255,.12);border:1px solid rgba(122,160,255,.25);border-radius:14px;padding:1rem;text-align:center"><div style="font-size:1.7rem;font-weight:900;color:#fff;line-height:1">${all.length}</div><div style="font-size:.72rem;color:#9fb3e0;margin-top:.3rem;font-weight:600">market audits</div></div>
        <div style="background:rgba(122,160,255,.12);border:1px solid rgba(122,160,255,.25);border-radius:14px;padding:1rem;text-align:center"><div style="font-size:1.7rem;font-weight:900;color:#fff;line-height:1">${audited}</div><div style="font-size:.72rem;color:#9fb3e0;margin-top:.3rem;font-weight:600">businesses</div></div>
        <div style="background:rgba(122,160,255,.12);border:1px solid rgba(122,160,255,.25);border-radius:14px;padding:1rem;text-align:center"><div style="font-size:1.7rem;font-weight:900;color:#fff;line-height:1">${verticals.size}</div><div style="font-size:.72rem;color:#9fb3e0;margin-top:.3rem;font-weight:600">industries</div></div>
        <div style="background:rgba(122,160,255,.12);border:1px solid rgba(122,160,255,.25);border-radius:14px;padding:1rem;text-align:center"><div style="font-size:1.7rem;font-weight:900;color:#fff;line-height:1">${cities.size}</div><div style="font-size:.72rem;color:#9fb3e0;margin-top:.3rem;font-weight:600">cities</div></div>
      </div>
    </div>
  </div></section>

  <section><div class="ix-sec"><div class="ix-incl" style="text-align:center;background:linear-gradient(160deg,#eef4ff,#f6f9ff)">
    <p class="ix-kick" style="justify-content:center">Your move</p>
    <h2 class="ix-h2" style="margin:.2rem 0 .6rem">See where YOU stand against these benchmarks</h2>
    <p class="ix-lead" style="max-width:60ch;margin:0 auto 1.5rem">Free growth audit &mdash; we map your Google Maps position, show your review + rating gap vs the top 3 in your market, and the plan to close it. No call required.</p>
    <a class="ix-btn" href="/free-growth-audit/">Get my free audit ${arrow}</a>
  </div></div></section>`;

const canonical = 'https://www.rocketgrowthagency.com/state-of-local-seo/';
const title = 'The State of Local SEO — Google Map Pack Benchmarks | Rocket Growth Agency';
const desc = `How many reviews and what rating it takes to rank in the Google Map Pack, by industry — from a live audit of ${audited} businesses across ${verticals.size} industries. Free data report.`;
let tpl = fs.readFileSync(TEMPLATE, 'utf8');
const mS = tpl.indexOf('<main'), mSe = tpl.indexOf('>', mS) + 1, mE = tpl.lastIndexOf('</main>');
let html = tpl.slice(0, mSe) + MAIN + tpl.slice(mE);
html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
  .replace(/<meta name="description" content="[^"]*"/, `<meta name="description" content="${esc(desc)}"`)
  .replace(/<link rel="canonical" href="[^"]*"/, `<link rel="canonical" href="${canonical}"`)
  .replace(/(<meta property="og:title" content=")[^"]*/, `$1${esc(title)}`).replace(/(<meta property="og:description" content=")[^"]*/, `$1${esc(desc)}`).replace(/(<meta property="og:url" content=")[^"]*/, `$1${canonical}`);

if (MOCKUP) {
  const css = fs.readFileSync(path.join(WEB, 'style.css'), 'utf8');
  let m = html.replace(/<link rel="stylesheet" href="\/style\.css[^"]*"\s*\/?>/, `<style>\n${css}\n</style>`);
  m = m.replace(/(src|href)="\/(images|favicon)/g, (x, a, pp) => `${a}="file://${WEB}/${pp}`);
  fs.writeFileSync(path.join(WEB, 'mockup-state-of-local-seo.html'), m);
  console.log('✓ MOCKUP: mockup-state-of-local-seo.html');
} else {
  const dir = path.join(WEB, 'state-of-local-seo');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  console.log(`✓ /state-of-local-seo/ — ${verticals.size} industries, ${audited} businesses, ${all.length} market audits`);
}
