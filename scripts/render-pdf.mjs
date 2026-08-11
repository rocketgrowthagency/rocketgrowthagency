#!/usr/bin/env node
/**
 * render-pdf.mjs — the html→pdf service the client-facing docs have been missing.
 *
 * WHY: every "PDF" in the product is really a print dialog — contracts, invoices and the monthly
 * report all say "Cmd+P → Save as PDF" (project_client_onboarding_design.md: "True download-as-PDF
 * would need html→pdf service"; both playbooks ask for "PDF + portal-friendly HTML"). That puts a
 * manual step in front of the client, and a print dialog is not something the pipeline can attach to
 * an email. This renders a REAL PDF file from any of those pages with the puppeteer we already ship.
 *
 * It renders with print CSS and background graphics ON, so the output matches what the page's own
 * print stylesheet was designed to produce — the same thing Cmd+P would give, without a human.
 *
 * Usage:
 *   node scripts/render-pdf.mjs --url https://…/portal/report/ --out report.pdf
 *   node scripts/render-pdf.mjs --html ./contract.html --out contract.pdf
 *   node scripts/render-pdf.mjs --url … --cookie "sb-access-token=…; other=…"   # authed pages
 *
 * Options:
 *   --url <u> | --html <file>   the source (exactly one)
 *   --out <file>                output path (default: alongside the input / ./output.pdf)
 *   --format <Letter|A4>        page size (default Letter — US clients)
 *   --margin <css>              page margin (default 0.5in)
 *   --landscape                 landscape orientation
 *   --cookie "<k=v; k=v>"       cookies for an authenticated page (portal/admin)
 *   --wait <ms>                 extra settle time after load (default 1200)
 *   --scale <n>                 0.1–2 CSS scale (default 1)
 * Exit: 0 = wrote a valid PDF, 1 = failed (nothing written).
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const argv = process.argv.slice(2);
const flag = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const has = (n) => argv.includes(n);

const URL_IN = flag('--url');
const HTML_IN = flag('--html');
const FORMAT = flag('--format', 'Letter');
const MARGIN = flag('--margin', '0.5in');
const COOKIE = flag('--cookie');
const WAIT_MS = parseInt(flag('--wait', '1200'), 10);
const SCALE = parseFloat(flag('--scale', '1'));
const LANDSCAPE = has('--landscape');

function die(msg) { console.error(`[render-pdf] ${msg}`); process.exit(1); }
if (!URL_IN && !HTML_IN) die('give exactly one source: --url <u> or --html <file>');
if (URL_IN && HTML_IN) die('--url and --html are mutually exclusive');
if (HTML_IN && !fs.existsSync(HTML_IN)) die(`no such file: ${HTML_IN}`);

const OUT = path.resolve(flag('--out') || (HTML_IN ? HTML_IN.replace(/\.html?$/i, '') + '.pdf' : 'output.pdf'));

/** A PDF that exists but has no pages is a silent failure — verify what we wrote. */
function verifyPdf(file) {
  if (!fs.existsSync(file)) return { ok: false, why: 'no file written' };
  const buf = fs.readFileSync(file);
  if (buf.length < 1000) return { ok: false, why: `suspiciously small (${buf.length} bytes)` };
  if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') return { ok: false, why: 'not a PDF (bad magic bytes)' };
  const pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  if (pages < 1) return { ok: false, why: 'PDF contains no pages' };
  return { ok: true, pages, bytes: buf.length };
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1600, deviceScaleFactor: 2 });

    if (COOKIE && URL_IN) {
      const { hostname } = new URL(URL_IN);
      const cookies = COOKIE.split(';').map((p) => p.trim()).filter(Boolean).map((p) => {
        const i = p.indexOf('=');
        return { name: p.slice(0, i).trim(), value: p.slice(i + 1).trim(), domain: hostname, path: '/' };
      });
      if (cookies.length) await page.setCookie(...cookies);
    }

    const target = URL_IN || `file://${path.resolve(HTML_IN)}`;
    const res = await page.goto(target, { waitUntil: 'networkidle0', timeout: 60000 });
    if (URL_IN && res && !res.ok() && res.status() !== 304) {
      // A 401/403 here means the page needed a session — say so plainly instead of writing a PDF of a login screen.
      die(`page returned HTTP ${res.status()}${res.status() === 401 || res.status() === 403 ? ' — this page needs --cookie with a valid session' : ''}`);
    }

    // Print stylesheet + web fonts, then a settle window for anything that renders on load (charts, counters).
    await page.emulateMediaType('print');
    try { await page.evaluate(() => document.fonts && document.fonts.ready); } catch { /* not fatal */ }
    if (WAIT_MS > 0) await new Promise((r) => setTimeout(r, WAIT_MS));

    await page.pdf({
      path: OUT,
      format: FORMAT,
      landscape: LANDSCAPE,
      scale: Math.min(2, Math.max(0.1, SCALE)),
      printBackground: true,                 // brand colour, letterhead and KPI tiles must survive
      preferCSSPageSize: false,
      margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
    });

    const v = verifyPdf(OUT);
    if (!v.ok) { try { fs.unlinkSync(OUT); } catch { /* */ } die(`render produced an unusable PDF: ${v.why}`); }
    console.log(`[render-pdf] ✓ ${OUT} — ${v.pages} page(s), ${(v.bytes / 1024).toFixed(0)} KB`);
  } catch (err) {
    die(err.message || String(err));
  } finally {
    await browser.close().catch(() => {});
  }
})();
