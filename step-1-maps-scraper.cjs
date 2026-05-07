require('dotenv').config();

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const slugify = require('slugify');

const stealth = StealthPlugin();
stealth.enabledEvasions.delete('user-agent-override');
stealth.enabledEvasions.delete('sourceurl');
puppeteer.use(stealth);

// CLI args (filtered out of SEARCH_QUERY assembly)
const CLI_ARGS = process.argv.slice(2);
const FORCE = CLI_ARGS.includes('--force');
const SKIP_FRESHNESS = CLI_ARGS.includes('--skip-freshness');
const QUERY_ARGS = CLI_ARGS.filter((a) => !a.startsWith('--'));

const SEARCH_QUERY =
  process.env.SEARCH_QUERY || QUERY_ARGS.join(' ') || 'Dentists near Los Angeles CA';

// Pre-flight: block re-running the same query within FRESH_DAYS.
// Override with --force. Bypass entirely (e.g. dev) with --skip-freshness.
const FRESH_DAYS = Number(process.env.FRESH_DAYS || 180);
const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID } = process.env;
const RUNS_TABLE_NAME = process.env.AIRTABLE_RUNS_TABLE || 'Scrape Runs';

async function checkScrapeRunFreshness(query) {
  if (SKIP_FRESHNESS) return { proceed: true, reason: 'skipped' };
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.warn('[freshness] AIRTABLE_API_KEY/AIRTABLE_BASE_ID not set — skipping pre-flight check');
    return { proceed: true, reason: 'no-creds' };
  }
  // Case-insensitive match on Query field
  const formula = `LOWER({Query}) = LOWER("${String(query).replace(/"/g, '\\"')}")`;
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(RUNS_TABLE_NAME)}?filterByFormula=${encodeURIComponent(formula)}&sort[0][field]=Date Run&sort[0][direction]=desc&maxRecords=1`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
    if (!res.ok) {
      console.warn(`[freshness] Airtable lookup failed (${res.status}) — proceeding anyway`);
      return { proceed: true, reason: 'lookup-failed' };
    }
    const data = await res.json();
    const last = data.records?.[0];
    if (!last) return { proceed: true, reason: 'never-run' };
    const dateRun = last.fields?.['Date Run'];
    if (!dateRun) return { proceed: true, reason: 'no-date' };
    const daysAgo = Math.floor((Date.now() - new Date(dateRun).getTime()) / (1000 * 60 * 60 * 24));
    if (daysAgo < FRESH_DAYS) {
      return {
        proceed: !!FORCE,
        reason: 'too-recent',
        daysAgo,
        lastDate: dateRun,
        listings: last.fields?.['Listings Scraped'],
        emails: last.fields?.['Emails Found'],
      };
    }
    return { proceed: true, reason: 'stale-enough', daysAgo, lastDate: dateRun };
  } catch (e) {
    console.warn(`[freshness] Airtable error: ${e.message} — proceeding anyway`);
    return { proceed: true, reason: 'error' };
  }
}

const TARGET_UNIQUE_PLACES = Number(process.env.TARGET_UNIQUE_PLACES || 55);
const SCROLL_MAX_ITERS = Number(process.env.SCROLL_MAX_ITERS || 55);
const SCROLL_STABLE_ITERS = Number(process.env.SCROLL_STABLE_ITERS || 14);

const NAV_TIMEOUT_MS = Number(process.env.NAV_TIMEOUT_MS || 90000);
const RESULTS_READY_TIMEOUT_MS = Number(process.env.RESULTS_READY_TIMEOUT_MS || 70000);
const PLACE_READY_TIMEOUT_MS = Number(process.env.PLACE_READY_TIMEOUT_MS || 65000);

const OUTPUT_DIR = path.join(process.cwd(), 'output');
const STEP1_DIR = path.join(OUTPUT_DIR, 'Step 1');
const DEBUG_DIR = path.join(OUTPUT_DIR, 'debug');

fs.mkdirSync(STEP1_DIR, { recursive: true });
fs.mkdirSync(DEBUG_DIR, { recursive: true });

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function todayISO() {
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function safeSlug(s) {
  return (
    slugify(String(s || ''), { lower: true, strict: true, trim: true }).slice(0, 80) || 'query'
  );
}

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseUSAddress(full) {
  const out = { address: '', city: '', state: '', zip: '' };
  const s = String(full || '').trim();
  if (!s) return out;

  const cleaned = s
    .replace(/^[\s\uE000-\uF8FF]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  out.address = cleaned;

  // Service-area listings: skip city/state/zip extraction (the string isn't a real address)
  if (/^(service area|serves\b|located in)/i.test(cleaned)) return out;

  const parts = cleaned
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length >= 3) {
    const city = parts[parts.length - 2];
    const stZip = parts[parts.length - 1];
    const m = stZip.match(/^([A-Z]{2})\s+(\d{5})(?:-\d{4})?$/);
    if (m) {
      out.city = city;
      out.state = m[1];
      out.zip = m[2];
    } else {
      const m2 = stZip.match(/^([A-Z]{2})\b/);
      if (m2) out.state = m2[1];
      out.city = city;
    }
  }
  return out;
}

function simplifyPlaceUrl(u) {
  const s = String(u || '');
  const i = s.indexOf('/data=');
  if (i > -1) return s.slice(0, i);
  const j = s.indexOf('?authuser=');
  if (j > -1) return s.slice(0, j);
  return s;
}

function placeKeysFromUrl(u) {
  const s = String(u || '');
  const keys = [];
  const m1 = s.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i);
  if (m1 && m1[1]) keys.push(m1[1]);
  const m2 = s.match(/!19s([^!&?]+)/i);
  if (m2 && m2[1]) keys.push(m2[1]);
  const m3 = s.match(/ChIJ[0-9A-Za-z_-]+/);
  if (m3 && m3[0]) keys.push(m3[0]);
  const base = simplifyPlaceUrl(s);
  if (base) keys.push(base);
  return Array.from(new Set(keys));
}

function latLngFromAnyUrl(u) {
  const s = String(u || '');
  const m = s.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (!m) return { lat: '', lng: '' };
  return { lat: m[1] || '', lng: m[2] || '' };
}

async function saveDebug(page, label) {
  const ts = Date.now();
  const png = path.join(DEBUG_DIR, `${label}_${ts}.png`);
  const html = path.join(DEBUG_DIR, `${label}_${ts}.html`);
  try {
    await page.screenshot({ path: png, fullPage: true });
  } catch {}
  try {
    const content = await page.content();
    fs.writeFileSync(html, content, 'utf8');
  } catch {}
  console.log(`🧩 saved debug: ${png}`);
  console.log(`🧩 saved debug: ${html}`);
}

async function waitForAny(page, selectors, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const sel of selectors) {
      const ok = await page
        .$(sel)
        .then((h) => !!h)
        .catch(() => false);
      if (ok) return sel;
    }
    await delay(350);
  }
  return null;
}

async function waitForResultsUI(page) {
  const ok = await waitForAny(
    page,
    ['div[role="feed"]', 'div.Nv2PK', 'a[href*="/maps/place/"]'],
    RESULTS_READY_TIMEOUT_MS
  );
  return ok;
}

async function openSearch(page, query) {
  const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
  console.log('🌍 Opening Google Maps search...');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });

  const ok = await waitForResultsUI(page);
  if (!ok) {
    await saveDebug(page, 'fatal_results_results_timeout');
    throw new Error('Results UI not ready: results_timeout');
  }
}

async function getFeedHandle(page) {
  const feed = await page.$('div[role="feed"]').catch(() => null);
  if (feed) return feed;
  const alt = await page.$('.m6QErb.DxyBCb.kA9KIf.dS8AEf').catch(() => null);
  if (alt) return alt;
  return null;
}

async function countResults(page) {
  return await page
    .evaluate(() => {
      const cards = document.querySelectorAll('div.Nv2PK').length;
      const placeLinks = document.querySelectorAll('a[href*="/maps/place/"]').length;
      return { cards, placeLinks };
    })
    .catch(() => ({ cards: 0, placeLinks: 0 }));
}

async function collectPlaceEntries(page, max = 800) {
  return await page
    .evaluate((maxN) => {
      const out = [];
      const seen = new Set();

      const anchors = Array.from(document.querySelectorAll('a[href*="/maps/place/"]'));
      function abs(href) {
        if (!href) return '';
        let u = href;
        if (u.startsWith('/')) u = location.origin + u;
        return u;
      }

      for (const a of anchors) {
        const href = abs(a.getAttribute('href') || '');
        if (!href || !href.includes('google.com/maps/place/')) continue;

        const key = href;
        if (seen.has(key)) continue;
        seen.add(key);

        const card = a.closest('div.Nv2PK');
        const cardText = card ? card.innerText || card.textContent || '' : '';
        const isSponsored = /sponsored/i.test(cardText);

        out.push({ placeUrl: href, isSponsored });
        if (out.length >= maxN) break;
      }

      return out;
    }, max)
    .catch(() => []);
}

async function scrollUntilLoaded(page) {
  console.log('🔄 Scrolling the feed until all results are loaded...');
  const feed = await getFeedHandle(page);
  if (!feed) {
    await saveDebug(page, 'fatal_no_feed');
    throw new Error('Could not find results feed container');
  }

  let stable = 0;
  let lastPlaceLinks = 0;

  for (let iter = 1; iter <= SCROLL_MAX_ITERS; iter++) {
    await page
      .evaluate((feedEl) => {
        feedEl.scrollTop = feedEl.scrollHeight;
      }, feed)
      .catch(() => {});

    try {
      const box = await feed.boundingBox().catch(() => null);
      if (box) {
        await page.mouse.move(
          box.x + Math.min(40, box.width - 2),
          box.y + Math.min(40, box.height - 2)
        );
        await page.mouse.wheel({ deltaY: 1200 }).catch(() => {});
      }
    } catch {}

    await delay(1250);

    const { cards, placeLinks } = await countResults(page);

    if (placeLinks <= lastPlaceLinks) stable++;
    else stable = 0;

    lastPlaceLinks = placeLinks;

    console.log(`🔄 Scroll: iter=${iter} cards=${cards} placeLinks=${placeLinks} stable=${stable}`);

    if (placeLinks >= TARGET_UNIQUE_PLACES && stable >= 2) break;
    if (stable >= SCROLL_STABLE_ITERS) break;
  }

  console.log('✅ Scroll complete.');
}

async function isBlankLike(page) {
  return await page
    .evaluate(() => {
      const txt = (document.body?.innerText || '').trim();
      const nodes = document.querySelectorAll('*').length;
      const title = (document.title || '').trim();
      const looksLikeMaps = /google maps/i.test(title);
      if (txt.length >= 5) return false;
      if (nodes >= 30) return false;
      if (!looksLikeMaps && nodes < 10) return true;
      return nodes < 20 && txt.length === 0;
    })
    .catch(() => false);
}

async function extractPlaceDetails(page) {
  return await page
    .evaluate(() => {
      function textFrom(el) {
        if (!el) return '';
        return (el.innerText || el.textContent || '').trim();
      }

      function firstText(selectors) {
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          const t = textFrom(el);
          if (t) return t;
        }
        return '';
      }

      function byDataItemIdExact(id) {
        const el =
          document.querySelector(`[data-item-id="${id}"]`) ||
          document.querySelector(`button[data-item-id="${id}"]`) ||
          document.querySelector(`a[data-item-id="${id}"]`);
        return textFrom(el);
      }

      function byDataItemIdPrefix(prefix) {
        const el =
          document.querySelector(`[data-item-id^="${prefix}"]`) ||
          document.querySelector(`button[data-item-id^="${prefix}"]`) ||
          document.querySelector(`a[data-item-id^="${prefix}"]`);
        return textFrom(el);
      }

      function hrefByDataItemId(id) {
        const el = document.querySelector(`a[data-item-id="${id}"]`) || null;
        const href = el ? (el.getAttribute('href') || '').trim() : '';
        return href;
      }

      function findRating() {
        const el = document.querySelector('div.F7nice span[aria-hidden="true"]');
        return textFrom(el);
      }

      function findReviews() {
        const btn = Array.from(document.querySelectorAll('button, a')).find((x) =>
          /reviews/i.test((x.getAttribute('aria-label') || '') + ' ' + (x.textContent || ''))
        );
        const t = textFrom(btn);
        const m = t.match(/([\d,]+)\s*reviews?/i);
        if (m) return m[1].replace(/,/g, '');
        const m2 = (btn && (btn.getAttribute('aria-label') || '')).match(/([\d,]+)\s*reviews?/i);
        if (m2) return m2[1].replace(/,/g, '');
        return '';
      }

      function findCategory() {
        const sel = [
          'button[jsaction*="pane.rating.category"]',
          'button[jsaction*="pane.rating.more"]',
          'button[aria-label*="Category"]',
          'button[aria-label*="category"]',
        ];
        for (const s of sel) {
          const el = document.querySelector(s);
          const t = textFrom(el);
          if (t && t.length < 80) return t;
        }
        return '';
      }

      function findHeroImageUrl() {
        const candidates = [];

        const og = document.querySelector('meta[property="og:image"]');
        if (og) {
          const c = (og.getAttribute('content') || '').trim();
          if (c) candidates.push(c);
        }

        const heroImgs = Array.from(document.querySelectorAll('img[src]'));
        for (const img of heroImgs) {
          const src = (img.getAttribute('src') || '').trim();
          if (!src) continue;
          if (
            /googleusercontent\.com\/p\//i.test(src) ||
            /lh\d\.googleusercontent\.com/i.test(src)
          ) {
            candidates.push(src);
          }
        }

        const uniq = Array.from(new Set(candidates));
        if (!uniq.length) return '';
        uniq.sort((a, b) => b.length - a.length);
        return uniq[0];
      }

      function findBestMapsUrl() {
        const ogUrl = document.querySelector('meta[property="og:url"]');
        const ogu = ogUrl ? (ogUrl.getAttribute('content') || '').trim() : '';
        if (ogu) return ogu;
        return location.href;
      }

      // For service-area-only businesses, Google Maps shows no street address.
      // Look for a "Service area" / "Serves" element and surface that text so the
      // Address column is never blank — useful context for direct-mail / outreach.
      function findServiceArea() {
        // Scan visible buttons for "Service area" / "Serves [city]" / "Located in"
        const candidates = Array.from(document.querySelectorAll('button, [role="button"], div[aria-label]'));
        for (const el of candidates) {
          const aria = (el.getAttribute('aria-label') || '').trim();
          const text = ((el.textContent || '').trim()).slice(0, 200);
          // Common GBP labels for service-area listings
          if (/^(service area|serves\b|located in)/i.test(aria)) return aria;
          if (/^(service area|serves\b|located in)/i.test(text)) return text;
        }
        // Fallback: scan all paragraphs/spans with short text
        const blocks = Array.from(document.querySelectorAll('div, span, p'));
        for (const b of blocks) {
          const t = (b.textContent || '').trim();
          if (t.length > 0 && t.length < 120 && /^(service area|serves\b)/i.test(t)) return t;
        }
        return '';
      }

      // --- New GBP detail extractors (don't affect video pipeline) ---

      function findBusinessStatus() {
        const body = document.body.innerText || '';
        if (/permanently closed/i.test(body)) return 'closed_permanently';
        if (/temporarily closed/i.test(body)) return 'closed_temporarily';
        return 'operational';
      }

      function findSecondaryCategories() {
        const sels = [
          'button[jsaction*="pane.rating.category"]',
          'button[jsaction*="pane.rating.more"]',
          'button[aria-label*="Category"]',
          'button[aria-label*="category"]',
        ];
        const cats = [];
        for (const s of sels) {
          document.querySelectorAll(s).forEach(el => {
            const t = textFrom(el);
            if (t && t.length < 80 && !cats.includes(t)) cats.push(t);
          });
        }
        // First element is primary; rest are secondary
        return cats.slice(1).join(', ');
      }

      function findPhotoCount() {
        const all = Array.from(document.querySelectorAll('button, a, [role="button"]'));
        for (const el of all) {
          const combined = (el.textContent || '') + ' ' + (el.getAttribute('aria-label') || '');
          const m = combined.match(/([\d,]+)\s+photos?/i);
          if (m) return m[1].replace(/,/g, '');
        }
        return '';
      }

      function findHours() {
        // data-item-id="oh" is the operating hours button
        const ohEl = document.querySelector('[data-item-id="oh"]');
        if (ohEl) return textFrom(ohEl).slice(0, 300);
        // Fallback: aria-label containing "hours"
        const hoursEl = Array.from(document.querySelectorAll('[aria-label]'))
          .find(el => /\bhours\b/i.test(el.getAttribute('aria-label') || ''));
        if (hoursEl) return textFrom(hoursEl).slice(0, 300);
        return '';
      }

      function findHasPosts() {
        // Google Posts appear under an "Updates" section heading
        const headings = Array.from(document.querySelectorAll('h2, h3, [role="heading"], button'));
        return headings.some(el => /^updates?$/i.test(textFrom(el)));
      }

      function findDescription() {
        // "From the business" description block
        const headings = Array.from(document.querySelectorAll('h2, h3, [role="heading"]'));
        for (const h of headings) {
          const t = textFrom(h);
          if (/from the business|about this business/i.test(t)) {
            let sib = h.nextElementSibling;
            while (sib) {
              const txt = textFrom(sib).trim();
              if (txt.length > 20) return txt.slice(0, 600);
              sib = sib.nextElementSibling;
            }
          }
        }
        return '';
      }

      const name = firstText(['h1.DUwDvf', 'h1']);
      let address = byDataItemIdExact('address');
      if (!address) {
        const sa = findServiceArea();
        if (sa) address = sa.startsWith('Service area') || sa.startsWith('Serves') ? sa : `Service area: ${sa}`;
      }
      const phone = byDataItemIdExact('phone') || byDataItemIdPrefix('phone:tel');
      const website = hrefByDataItemId('authority');
      const rating = findRating();
      const reviews = findReviews();
      const category = findCategory();
      const imageUrl = findHeroImageUrl();
      const mapsUrl = findBestMapsUrl();
      const businessStatus = findBusinessStatus();
      const secondaryCategories = findSecondaryCategories();
      const photoCount = findPhotoCount();
      const hours = findHours();
      const hasPosts = findHasPosts();
      const description = findDescription();

      return { name, address, phone, website, rating, reviews, category, imageUrl, mapsUrl, businessStatus, secondaryCategories, photoCount, hours, hasPosts, description };
    })
    .catch(() => ({
      name: '',
      address: '',
      phone: '',
      website: '',
      rating: '',
      reviews: '',
      category: '',
      imageUrl: '',
      mapsUrl: '',
      businessStatus: '',
      secondaryCategories: '',
      photoCount: '',
      hours: '',
      hasPosts: false,
      description: '',
    }));
}

async function goBackToResults(page, query) {
  const isPlace = await page
    .evaluate(
      () => location.href.includes('/maps/place/') || location.pathname.includes('/maps/place/')
    )
    .catch(() => false);

  if (!isPlace) return true;

  const clicked = await page
    .evaluate(() => {
      const btn =
        document.querySelector('button[aria-label="Back"]') ||
        document.querySelector('button[aria-label*="Back"]') ||
        document.querySelector('button[jsaction*="pane.back"]') ||
        document.querySelector('button[jsaction="pane.back"]');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    })
    .catch(() => false);

  if (!clicked) {
    try {
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: 25000 });
    } catch {
      try {
        await page.evaluate(() => history.back());
      } catch {}
    }
  }

  const ok = await waitForAny(
    page,
    ['div[role="feed"]', 'div.Nv2PK', 'a[href*="/maps/place/"]'],
    25000
  );
  if (ok) return true;

  try {
    await openSearch(page, query);
    await delay(1200);
    return true;
  } catch {
    return false;
  }
}

async function ensureOnResults(page, query) {
  const ok = await waitForAny(
    page,
    ['div[role="feed"]', 'div.Nv2PK', 'a[href*="/maps/place/"]'],
    6000
  );
  if (ok) return;
  await openSearch(page, query);
  await delay(1200);
}

async function openPlaceByClick(page, placeUrl) {
  const keys = placeKeysFromUrl(placeUrl);

  const clicked = await page
    .evaluate((keysIn) => {
      const anchors = Array.from(document.querySelectorAll('a[href*="/maps/place/"]'));
      function norm(h) {
        if (!h) return '';
        let u = h;
        if (u.startsWith('/')) u = location.origin + u;
        return u;
      }

      for (const a of anchors) {
        const href = norm(a.getAttribute('href') || '');
        if (!href) continue;

        for (const k of keysIn) {
          if (!k) continue;
          if (href.includes(k) || href === k) {
            try {
              a.scrollIntoView({ block: 'center' });
            } catch {}
            try {
              a.click();
              return true;
            } catch {}
          }
        }
      }
      return false;
    }, keys)
    .catch(() => false);

  if (!clicked) return false;

  const ok = await waitForAny(
    page,
    [
      'h1.DUwDvf',
      '[data-item-id="address"]',
      'a[data-item-id="authority"]',
      'button[data-item-id="phone"]',
    ],
    PLACE_READY_TIMEOUT_MS
  );

  const onPlace = await page
    .evaluate(
      () => location.href.includes('/maps/place/') || location.pathname.includes('/maps/place/')
    )
    .catch(() => false);

  return !!ok && onPlace;
}

async function gotoPlaceSameTab(page, placeUrl) {
  const tryUrls = [placeUrl, simplifyPlaceUrl(placeUrl)].filter(Boolean);
  let lastErr = null;

  for (const u of tryUrls) {
    try {
      const t0 = Date.now();
      await page.goto(u, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`✅ place loaded in ${dt}s`);

      const blank1 = await isBlankLike(page);
      if (blank1) {
        console.log('⚠️ blank place page detected; reloading once...');
        await page
          .reload({ waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS })
          .catch(() => {});
        await delay(500);
      }

      const ok = await waitForAny(
        page,
        [
          'h1.DUwDvf',
          '[data-item-id="address"]',
          'a[data-item-id="authority"]',
          'button[data-item-id="phone"]',
        ],
        PLACE_READY_TIMEOUT_MS
      );

      const onPlace = await page
        .evaluate(
          () => location.href.includes('/maps/place/') || location.pathname.includes('/maps/place/')
        )
        .catch(() => false);

      if (!ok || !onPlace) throw new Error('Place UI not ready');
      return true;
    } catch (e) {
      lastErr = e;
    }
  }

  if (lastErr) throw lastErr;
  return false;
}

async function openPlaceRobust(page, placeUrl) {
  try {
    const ok = await gotoPlaceSameTab(page, placeUrl);
    if (!ok) return false;

    await delay(350);

    const details = await extractPlaceDetails(page);
    const name = (details.name || '').trim();

    if (!name || /^results$/i.test(name)) throw new Error(`Bad place name after goto: "${name}"`);
    return true;
  } catch {
    try {
      await ensureOnResults(page, SEARCH_QUERY);
      const clicked = await openPlaceByClick(page, placeUrl);
      if (!clicked) return false;

      await delay(450);

      const blank2 = await isBlankLike(page);
      if (blank2) {
        await page
          .reload({ waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS })
          .catch(() => {});
        await delay(500);
      }

      const details = await extractPlaceDetails(page);
      const name = (details.name || '').trim();
      if (!name || /^results$/i.test(name)) return false;

      return true;
    } catch {
      return false;
    }
  }
}

async function main() {
  // Pre-flight: have we scraped this exact query in the last FRESH_DAYS?
  console.log(`[step-1] checking freshness for "${SEARCH_QUERY}" (FRESH_DAYS=${FRESH_DAYS})`);
  const fresh = await checkScrapeRunFreshness(SEARCH_QUERY);
  if (fresh.reason === 'too-recent') {
    const msg = `[step-1] ⚠️  "${SEARCH_QUERY}" was last scraped ${fresh.daysAgo} day(s) ago on ${fresh.lastDate} (${fresh.listings || '?'} listings, ${fresh.emails || '?'} emails).`;
    if (!FORCE) {
      console.error(msg);
      console.error(`[step-1] Refusing to re-run within ${FRESH_DAYS}-day freshness window. Pass --force to override.`);
      process.exit(2);
    }
    console.warn(msg + '  Re-running anyway because --force was passed.');
  } else if (fresh.reason === 'stale-enough') {
    console.log(`[step-1] last run was ${fresh.daysAgo} day(s) ago on ${fresh.lastDate} — past freshness window, proceeding.`);
  } else if (fresh.reason === 'never-run') {
    console.log(`[step-1] never scraped this query before — proceeding.`);
  }

  const browser = await puppeteer.launch({
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

  let mainPage = null;

  try {
    const pages = await browser.pages().catch(() => []);
    const page = pages && pages.length ? pages[0] : await browser.newPage();
    mainPage = page;

    page.on('popup', async (p) => {
      try {
        await p.close();
      } catch {}
    });

    browser.on('targetcreated', async (target) => {
      try {
        if (target.type() !== 'page') return;
        const opener = target.opener && (await target.opener().catch(() => null));
        if (!opener) return;
        const p = await target.page().catch(() => null);
        if (!p) return;
        if (mainPage && p === mainPage) return;
        await p.close().catch(() => {});
      } catch {}
    });

    await page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
    await page.setDefaultTimeout(Math.max(45000, Math.floor(NAV_TIMEOUT_MS * 0.8)));

    await openSearch(page, SEARCH_QUERY);
    await delay(1800);

    const initialResultsOk = await waitForResultsUI(page);
    if (!initialResultsOk) {
      await saveDebug(page, 'fatal_results_first_render');
      throw new Error('Results UI not ready after openSearch');
    }

    await scrollUntilLoaded(page);

    const rawEntries = await collectPlaceEntries(page, 800);
    const entriesUniq = [];
    const seenEntry = new Set();

    for (const e of rawEntries) {
      const u = e && e.placeUrl ? String(e.placeUrl) : '';
      if (!u) continue;
      const key = simplifyPlaceUrl(u);
      if (seenEntry.has(key)) continue;
      seenEntry.add(key);
      entriesUniq.push({ placeUrl: u, isSponsored: !!e.isSponsored });
      if (entriesUniq.length >= 500) break;
    }

    console.log(
      `📋 Cards with usable place URLs: ${entriesUniq.length} (these are what we’ll scrape).`
    );

    const date = todayISO();
    const querySlug = safeSlug(SEARCH_QUERY.replace(/\bnear\b/i, '').trim());
    const outFile = path.join(STEP1_DIR, `${date}_${querySlug}-[step-1].csv`);

    const header = [
      'Business Name',
      'Address',
      'City',
      'State',
      'ZIP Code',
      'Phone',
      'Website',
      'Detected Category',
      'Rating',
      'Reviews',
      'Search Term',
      'Map Rank',
      'Search Source',
      'Image URL',
      'Sponsored?',
      'Google Maps URL',
      'Latitude',
      'Longitude',
      'GBP Status',
      'GBP Secondary Categories',
      'GBP Photo Count',
      'GBP Hours',
      'GBP Has Posts',
      'GBP Description',
    ];

    const ws = fs.createWriteStream(outFile, { flags: 'w' });
    ws.write(header.join(',') + '\n');

    const seenPlaces = new Set();
    let written = 0;

    for (let i = 0; i < entriesUniq.length; i++) {
      const mapRank = i + 1;
      const placeUrl = entriesUniq[i].placeUrl;
      const sponsored = entriesUniq[i].isSponsored ? 'Yes' : 'No';

      const dedupeKey = simplifyPlaceUrl(placeUrl);
      if (seenPlaces.has(dedupeKey)) continue;
      seenPlaces.add(dedupeKey);

      await goBackToResults(page, SEARCH_QUERY);
      await ensureOnResults(page, SEARCH_QUERY);

      console.log(
        `[${mapRank}/${entriesUniq.length}] scraping: ${
          placeUrl.split('/maps/place/')[1]
            ? decodeURIComponent(placeUrl.split('/maps/place/')[1].split('/')[0])
            : 'place'
        }`
      );
      console.log(`   ↳ opening place: ${placeUrl}`);

      try {
        const opened = await openPlaceRobust(page, placeUrl);
        if (!opened) throw new Error('Could not open place robustly');

        await delay(350);

        const details = await extractPlaceDetails(page);

        const name = (details.name || '').trim();
        if (!name || /^results$/i.test(name)) throw new Error(`Bad name extracted: "${name}"`);

        const addrRaw = (details.address || '')
          .trim()
          .replace(/^[\s\uE000-\uF8FF]+/g, '')
          .trim();

        const parsed = parseUSAddress(addrRaw);

        const mapsUrl =
          simplifyPlaceUrl(details.mapsUrl || page.url() || placeUrl) || simplifyPlaceUrl(placeUrl);

        const llFromMaps = latLngFromAnyUrl(mapsUrl);
        const llFromPage = latLngFromAnyUrl(page.url());
        const lat = llFromMaps.lat || llFromPage.lat || '';
        const lng = llFromMaps.lng || llFromPage.lng || '';

        const rowOut = [
          name,
          parsed.address,
          parsed.city,
          parsed.state,
          parsed.zip,
          (details.phone || '').trim(),
          (details.website || '').trim(),
          (details.category || '').trim(),
          (details.rating || '').trim(),
          (details.reviews || '').trim(),
          SEARCH_QUERY,
          String(mapRank),
          'Google Maps',
          (details.imageUrl || '').trim(),
          sponsored,
          mapsUrl,
          lat,
          lng,
          (details.businessStatus || '').trim(),
          (details.secondaryCategories || '').trim(),
          (details.photoCount || '').trim(),
          (details.hours || '').replace(/\n/g, ' | ').trim(),
          details.hasPosts ? 'Yes' : '',
          (details.description || '').replace(/\n/g, ' ').trim(),
        ];

        ws.write(rowOut.map(csvEscape).join(',') + '\n');

        written++;
        console.log(
          `[${mapRank}/${entriesUniq.length}] ✅ saved: ${name || '(no name)'} (written=${written})`
        );

        await goBackToResults(page, SEARCH_QUERY);

        if (written >= TARGET_UNIQUE_PLACES) break;

        await delay(450 + Math.floor(Math.random() * 450));
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        console.log(`   ❌ error loading place ${placeUrl}: ${msg}`);
        await saveDebug(page, `place_error_${mapRank}`);
        try {
          await goBackToResults(page, SEARCH_QUERY);
        } catch {}
      }
    }

    ws.end();
    console.log(`📁 Done! Saved ${written} listings to ${outFile}`);
  } catch (e) {
    console.error('❌ Error during scraping:', e);
  } finally {
    await browser.close().catch(() => {});
  }
}

main();
