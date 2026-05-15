// step-2.6-freshness-check.mjs
//
// Pre-render fact-check. Re-scrapes the live Google Business Profile for each
// lead in the Step 2 CSV and PATCHes Airtable with current reviewCount, rating,
// and category. Must run BEFORE step-3 (video recording) + step-6 (voiceover)
// so the visual + audio claims match what's actually on Google right now.
//
// Why this exists: between when step-1 scrapes a lead (Airtable says 24
// reviews) and when step-3 video-records the live Maps panel (Google now
// shows 25 reviews), Alvin can get a new review. Without this check, the
// video says "24 reviews" while the visible Maps panel shows "(25)".
//
// Usage:
//   node step-2.6-freshness-check.mjs
//     → uses latest Step 2 CSV
//   STEP2_CSV="output/Step 2/<file>.csv" node step-2.6-freshness-check.mjs
//     → targets specific CSV
//   STEP2_CSV="..." TARGET_SLUG="alvin-garage-door" node step-2.6-freshness-check.mjs
//     → single-lead refresh
//
// Outputs:
//   - Patches Airtable Leads row for each lead where data drifted
//   - Updates the in-memory CSV with fresh values + rewrites the CSV file
//   - Logs every drift to console for audit trail

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import csvParser from 'csv-parser';
import { createObjectCsvWriter } from 'csv-writer';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import slugify from 'slugify';

puppeteerExtra.use(StealthPlugin());

const STEP2_DIR = path.join(process.cwd(), 'output', 'Step 2');
const STEP2_CSV_OVERRIDE = process.env.STEP2_CSV || '';
const TARGET_SLUG = (process.env.TARGET_SLUG || '').trim().toLowerCase();

function findLatestStep2Csv() {
  if (STEP2_CSV_OVERRIDE) {
    if (!fs.existsSync(STEP2_CSV_OVERRIDE)) {
      console.error(`Step 2 CSV override not found: ${STEP2_CSV_OVERRIDE}`);
      process.exit(1);
    }
    return STEP2_CSV_OVERRIDE;
  }
  if (!fs.existsSync(STEP2_DIR)) {
    console.error(`Step 2 directory not found: ${STEP2_DIR}`);
    process.exit(1);
  }
  const files = fs
    .readdirSync(STEP2_DIR)
    .filter((f) => f.toLowerCase().endsWith('.csv') && f.includes('[step-2]'))
    .map((name) => ({ name, fullPath: path.join(STEP2_DIR, name), mtimeMs: fs.statSync(path.join(STEP2_DIR, name)).mtimeMs }))
    .sort((a, b) => a.mtimeMs - b.mtimeMs);
  if (!files.length) {
    console.error('No Step 2 CSVs found.');
    process.exit(1);
  }
  return files[files.length - 1].fullPath;
}

const CSV_PATH = findLatestStep2Csv();
console.log(`Using Step 2 CSV: ${CSV_PATH}`);

async function loadCsv() {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(CSV_PATH)
      .pipe(csvParser())
      .on('data', (d) => rows.push(d))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

function buildBusinessSlug(name) {
  return slugify(String(name || ''), { lower: true, strict: true });
}

// Build a reliable Maps URL. Priority: (1) lat/lng coord-anchored URL,
// (2) search URL with name+address (auto-lands on the matching panel),
// (3) raw CSV URL as last resort. Bare /maps/place/<Name> URLs redirect
// to a generic stub when there's no coord context.
function buildMapsUrl(row) {
  const name = (row['Business Name'] || '').trim();
  const address = (row['Address'] || '').trim();
  const lat = parseFloat(row['Latitude'] || '');
  const lng = parseFloat(row['Longitude'] || '');
  if (name && Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps/place/${encodeURIComponent(name)}/@${lat},${lng},17z`;
  }
  if (name && address) {
    return `https://www.google.com/maps/search/${encodeURIComponent(`${name} ${address}`)}`;
  }
  return row['Google Maps URL'] || '';
}

async function extractLivePanel(page) {
  return await page.evaluate(() => {
    const textOf = (el) => (el ? (el.innerText || el.textContent || '').trim() : '');

    // Rating
    let rating = '';
    const ratingEl = document.querySelector('div.F7nice span[aria-hidden="true"]');
    const ratingTxt = textOf(ratingEl);
    if (/^\d\.\d$/.test(ratingTxt)) rating = ratingTxt;
    if (!rating) {
      const f7 = document.querySelector('div.F7nice');
      if (f7) {
        for (const sp of f7.querySelectorAll('span')) {
          const t = (sp.textContent || '').trim();
          if (/^[0-5]\.\d$/.test(t)) { rating = t; break; }
        }
      }
    }

    // Reviews
    const patterns = [
      /\(([\d,]+)\)/,
      /([\d,]+)\s*Google\s*reviews?\b/i,
      /([\d,]+)\s*reviews?\b/i,
      /based on ([\d,]+) reviews?/i,
      /Rated [\d.]+ stars? based on ([\d,]+)/i,
    ];
    const tryPatterns = (text) => {
      for (const p of patterns) {
        const m = text.match(p);
        if (m) {
          const n = parseInt(m[1].replace(/,/g, ''), 10);
          if (n >= 1 && n <= 999999) return String(n);
        }
      }
      return '';
    };
    let reviews = '';
    const f7 = document.querySelector('div.F7nice');
    if (f7) {
      for (const sp of f7.querySelectorAll('span, button, a')) {
        const t = (sp.getAttribute('aria-label') || '') + ' ' + (sp.textContent || '');
        const hit = tryPatterns(t);
        if (hit) { reviews = hit; break; }
      }
      if (!reviews) {
        reviews = tryPatterns((f7.textContent || '') + ' ' + (f7.outerHTML || ''));
      }
    }
    // Final fallback — scan ANY aria-label on the page that mentions reviews.
    // Google sometimes puts the count on the rating button's aria-label only,
    // e.g. aria-label="4.9 stars 25 Reviews".
    if (!reviews) {
      const all = document.querySelectorAll('[aria-label*="review" i], [aria-label*="star" i]');
      for (const el of all) {
        const hit = tryPatterns(el.getAttribute('aria-label') || '');
        if (hit) { reviews = hit; break; }
      }
    }

    // Category — primary category button
    let category = '';
    const catEl = document.querySelector('button[jsaction*="category"]') || document.querySelector('[role="button"][jsaction*="category"]');
    category = textOf(catEl);
    if (!category) {
      // Fallback: any button text that looks category-shaped (Title Case, no digits)
      const candidates = Array.from(document.querySelectorAll('button, span')).map((e) => textOf(e));
      category = candidates.find((t) => /^[A-Z][a-z]+(\s+[A-Za-z][a-z]+)*$/.test(t) && t.length >= 5 && t.length <= 60) || '';
    }

    // Verify we're on the right business — h1 must exist
    const h1 = textOf(document.querySelector('h1.DUwDvf') || document.querySelector('h1'));

    // Diagnostic: capture F7nice raw text + any sibling that might contain (N)
    const f7Text = f7 ? (f7.textContent || '').slice(0, 300) : '';
    const f7Html = f7 ? (f7.outerHTML || '').slice(0, 600) : '';

    return { rating, reviews, category, h1, f7Text, f7Html };
  });
}

async function refreshOne(browser, row) {
  const name = row['Business Name'] || '';
  const slug = buildBusinessSlug(name);
  if (TARGET_SLUG && slug !== TARGET_SLUG) return null;

  const mapsUrl = buildMapsUrl(row);
  if (!mapsUrl) {
    console.warn(`  ⚠️  ${name}: no Maps URL — skipping`);
    return null;
  }

  const page = await browser.newPage();
  try {
    console.log(`  → navigating to: ${mapsUrl}`);
    await page.goto(mapsUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // Wait for results to render so we can grab an a.hfpxzc href.
    await page.waitForSelector('a.hfpxzc, h1.DUwDvf', { timeout: 45000 }).catch(() => null);
    // ALWAYS prefer the a.hfpxzc href if available — that gives the canonical
    // place panel (with review count badge). The "direct-hit" panel that
    // Google sometimes shows from a /maps/search/ URL is a stripped-down
    // variant that often omits the (N) review count next to the rating.
    const hrefData = await page.evaluate(() => {
      const a = document.querySelector('a.hfpxzc');
      return a ? a.getAttribute('href') : null;
    });
    if (hrefData) {
      console.log(`  → click-through href: ${hrefData.slice(0, 80)}...`);
      await page.goto(hrefData, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForSelector('h1.DUwDvf, div.F7nice', { timeout: 30000 }).catch(() => null);
    }
    // Settle for lazy-loaded reviewCount. F7nice often renders rating first,
    // then injects "(N)" review count after a beat. Wait specifically for
    // F7nice to contain either "(N)" or "N review".
    await page.waitForFunction(() => {
      const f7 = document.querySelector('div.F7nice');
      if (!f7) return false;
      const t = (f7.textContent || '') + ' ' + (f7.outerHTML || '');
      return /\(\d+\)/.test(t) || /\d+\s*review/i.test(t);
    }, { timeout: 20000 }).catch(() => null);
    await new Promise((r) => setTimeout(r, 2000));

    const live = await extractLivePanel(page);
    console.log(`  → live: reviews="${live.reviews || '(unavail)'}" rating="${live.rating}" category="${live.category}" h1="${live.h1}"`);
    // KNOWN LIMITATION: review count is NOT reliably available from the
    // auto-opened panel reached via /maps/search/. Google strips the (N)
    // badge from that variant. To extract review count, we'd need to run
    // step-1's full search-and-click flow (or re-run step-1 in single-lead
    // mode). Until that's wired, step-2.6 leaves Review Count alone — the
    // Airtable value from step-1 stays in force.

    // Sanity: h1 should contain at least one word from the business name.
    const nameWords = name.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
    const h1Lower = (live.h1 || '').toLowerCase();
    const hitRate = nameWords.length ? nameWords.filter((w) => h1Lower.includes(w)).length / nameWords.length : 0;
    if (hitRate < 0.4) {
      console.warn(`  ⚠️  ${name}: panel h1 ("${live.h1}") doesn't match — aborting refresh, no data written`);
      return { skipped: true, name };
    }

    const drift = {};
    if (live.reviews && live.reviews !== String(row['Reviews'] || '')) {
      drift['Reviews'] = { from: row['Reviews'] || '', to: live.reviews };
      row['Reviews'] = live.reviews;
    }
    if (live.rating && live.rating !== String(row['Rating'] || '')) {
      drift['Rating'] = { from: row['Rating'] || '', to: live.rating };
      row['Rating'] = live.rating;
    }
    if (live.category && live.category !== String(row['Detected Category'] || '')) {
      drift['Detected Category'] = { from: row['Detected Category'] || '', to: live.category };
      row['Detected Category'] = live.category;
    }

    const driftKeys = Object.keys(drift);
    if (driftKeys.length === 0) {
      console.log(`  = ${name}: no drift (reviews=${live.reviews} rating=${live.rating} cat=${live.category})`);
      return { drifted: false };
    }

    console.log(`  ⚡ ${name}: drift detected:`);
    for (const k of driftKeys) console.log(`     ${k}: "${drift[k].from}" → ${drift[k].to}`);

    // PATCH Airtable
    const apiKey = process.env.AIRTABLE_API_KEY;
    const baseId = process.env.AIRTABLE_BASE_ID;
    if (apiKey && baseId) {
      const escaped = name.replace(/"/g, '\\"');
      const lookupUrl = `https://api.airtable.com/v0/${baseId}/Leads?filterByFormula=${encodeURIComponent(`LOWER({Business Name}) = LOWER("${escaped}")`)}&maxRecords=1`;
      const r1 = await fetch(lookupUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (r1.ok) {
        const data = await r1.json();
        const recId = data.records?.[0]?.id;
        if (recId) {
          const fields = {};
          if (drift['Reviews']) fields['Review Count'] = parseInt(drift['Reviews'].to, 10);
          if (drift['Rating']) fields['Rating'] = parseFloat(drift['Rating'].to);
          if (drift['Detected Category']) fields['Category'] = drift['Detected Category'].to;
          const patchUrl = `https://api.airtable.com/v0/${baseId}/Leads/${recId}`;
          const r2 = await fetch(patchUrl, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields }),
          });
          if (r2.ok) {
            console.log(`     ✓ Airtable PATCH: ${Object.keys(fields).join(', ')}`);
          } else {
            const errBody = await r2.text();
            console.warn(`     ⚠️  Airtable PATCH failed (${r2.status}): ${errBody.slice(0, 200)}`);
          }
        } else {
          console.warn(`     ⚠️  Lead not found in Airtable for "${name}"`);
        }
      }
    }

    return { drifted: true, drift };
  } catch (e) {
    console.warn(`  ⚠️  ${name}: refresh failed — ${e.message}`);
    return { error: e.message };
  } finally {
    await page.close();
  }
}

async function main() {
  const rows = await loadCsv();
  console.log(`Loaded ${rows.length} rows`);
  if (TARGET_SLUG) console.log(`Filtering to slug: ${TARGET_SLUG}`);

  // Headful + system Chrome — Maps SPA is hostile to headless detection,
  // matches step-1's launch config.
  const browser = await puppeteerExtra.launch({
    headless: false,
    defaultViewport: null,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
    ],
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });

  let processed = 0, drifted = 0;
  for (const row of rows) {
    const slug = buildBusinessSlug(row['Business Name'] || '');
    if (TARGET_SLUG && slug !== TARGET_SLUG) continue;
    processed++;
    const result = await refreshOne(browser, row);
    if (result?.drifted) drifted++;
  }

  await browser.close();

  // Rewrite CSV if anything drifted
  if (drifted > 0 && !TARGET_SLUG) {
    const headers = Object.keys(rows[0]).map((id) => ({ id, title: id }));
    const writer = createObjectCsvWriter({ path: CSV_PATH, header: headers });
    await writer.writeRecords(rows);
    console.log(`Rewrote ${CSV_PATH} with drifted values.`);
  }

  console.log(`\nDone. Processed ${processed}, drifted ${drifted}.`);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
