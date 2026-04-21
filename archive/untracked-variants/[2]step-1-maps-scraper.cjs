const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const slugify = require('slugify');
const { createObjectCsvWriter } = require('csv-writer');

puppeteer.use(StealthPlugin());

const SEARCH_QUERY =
  process.env.SEARCH_QUERY || process.argv.slice(2).join(' ') || 'Dentists near Los Angeles CA';

const TARGET_UNIQUE_PLACES = Number(process.env.TARGET_UNIQUE_PLACES || 55);
const SCROLL_MAX_ITERS = Number(process.env.SCROLL_MAX_ITERS || 70);
const SCROLL_STABLE_ITERS = Number(process.env.SCROLL_STABLE_ITERS || 14);

const NAV_TIMEOUT_MS = Number(process.env.NAV_TIMEOUT_MS || 90000);
const RESULTS_READY_TIMEOUT_MS = Number(process.env.RESULTS_READY_TIMEOUT_MS || 70000);
const OPEN_PLACE_TIMEOUT_MS = Number(process.env.OPEN_PLACE_TIMEOUT_MS || 25000);
const PLACE_READY_TIMEOUT_MS = Number(process.env.PLACE_READY_TIMEOUT_MS || 25000);

const MAX_OPEN_ATTEMPTS = Number(process.env.MAX_OPEN_ATTEMPTS || 6);
const MAX_CONSEC_FAILS = Number(process.env.MAX_CONSEC_FAILS || 12);

const SLOW_MO_MS = Number(process.env.SLOW_MO_MS || 0);
const ACTION_DELAY_MS = Number(process.env.ACTION_DELAY_MS || 650);
const OPEN_SETTLE_MS = Number(process.env.OPEN_SETTLE_MS || 900);
const BACK_SETTLE_MS = Number(process.env.BACK_SETTLE_MS || 750);

const CHROME_PATH =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const OUTPUT_DIR = path.join(process.cwd(), 'output');
const STEP1_DIR = path.join(OUTPUT_DIR, 'Step 1');
const DEBUG_DIR = path.join(OUTPUT_DIR, 'debug');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function dateStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function safeSlug(s) {
  return slugify(String(s || 'x'), { lower: true, strict: true }).slice(0, 90) || 'x';
}

function normalizeName(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(dentist|dentistry|dental|clinic|center|office|group|practice|inc|llc)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(str) {
  if (!str) return [];
  const parts = str.split(' ').filter(Boolean);
  const unique = [];
  for (const p of parts) if (!unique.includes(p)) unique.push(p);
  return unique;
}

function namesRoughMatch(cardNorm, paneNorm) {
  if (!cardNorm || !paneNorm) return false;
  if (cardNorm === paneNorm) return true;

  const tokensA = tokenize(cardNorm);
  const tokensB = tokenize(paneNorm);
  if (!tokensA.length || !tokensB.length) return false;

  const smaller = tokensA.length <= tokensB.length ? tokensA : tokensB;
  const larger = tokensA.length <= tokensB.length ? tokensB : tokensA;

  let intersect = 0;
  for (const t of smaller) if (larger.includes(t)) intersect++;
  if (intersect === 0) return false;

  return intersect / smaller.length >= 0.6;
}

function extract1sToken(url) {
  const s = String(url || '');
  const m = s.match(/!1s([^!]+)/);
  return m ? m[1].trim() : '';
}

function parseAddressParts(full) {
  const raw = String(full || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return { address: '', city: '', state: '', zip: '' };

  const m = raw.match(/^(.+?),\s*(.*?),\s*([A-Z]{2})\s*(\d{5})(?:-\d{4})?$/);
  if (m) return { address: m[1].trim(), city: m[2].trim(), state: m[3].trim(), zip: m[4].trim() };

  return { address: raw, city: '', state: '', zip: '' };
}

function extractLatLng(url) {
  const m = String(url || '').match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (!m) return { latitude: '', longitude: '' };
  return { latitude: m[1], longitude: m[2] };
}

async function saveDebug(page, label) {
  try {
    ensureDir(DEBUG_DIR);
    const base = `${dateStamp()}_${safeSlug(label)}_${Date.now()}`;
    await page.screenshot({ path: path.join(DEBUG_DIR, `${base}.png`), fullPage: true });
    fs.writeFileSync(path.join(DEBUG_DIR, `${base}.html`), await page.content());
  } catch (_) {}
}

async function disableNewTabs(page) {
  try {
    await page.evaluate(() => {
      for (const a of document.querySelectorAll('a[target]')) a.removeAttribute('target');
      if (typeof window !== 'undefined') window.open = () => null;
    });
  } catch (_) {}
}

async function clickConsentIfPresent(page) {
  try {
    const clicked = await page.evaluate(() => {
      const patterns = [/accept all/i, /i agree/i, /^accept$/i, /accept/i];
      const els = Array.from(document.querySelectorAll("button, [role='button']"));
      for (const re of patterns) {
        const el = els.find((b) => re.test((b.textContent || '').trim()));
        if (el) {
          el.click();
          return true;
        }
      }
      return false;
    });
    if (clicked) await sleep(900);
  } catch (_) {}
}

async function waitForFeed(page) {
  await page.waitForSelector('div[role="feed"]', { timeout: RESULTS_READY_TIMEOUT_MS });
}

async function waitForResultsMode(page) {
  await page.waitForFunction(
    () => {
      const feed = document.querySelector('div[role="feed"]');
      if (!feed) return false;
      const cards = feed.querySelectorAll('div.Nv2PK');
      return cards && cards.length > 0;
    },
    { timeout: RESULTS_READY_TIMEOUT_MS }
  );
}

async function scrollFeedToTop(page) {
  for (let i = 0; i < 18; i++) {
    await page.evaluate(() => {
      const feed = document.querySelector('div[role="feed"]');
      if (feed) feed.scrollTo(0, 0);
    });
    await sleep(180);
    const top = await page.evaluate(() => {
      const feed = document.querySelector('div[role="feed"]');
      return feed ? feed.scrollTop || 0 : 0;
    });
    if (top === 0) return;
  }
}

async function collectCandidates(page) {
  const seen = new Set();
  const out = [];

  let stable = 0;
  let prevCount = 0;

  for (let iter = 1; iter <= SCROLL_MAX_ITERS; iter++) {
    const batch = await page.evaluate(() => {
      const cleanup = (str) => (str || '').replace(/\s+/g, ' ').trim();
      const feed = document.querySelector('div[role="feed"]');
      if (!feed) return [];

      const cards = Array.from(feed.querySelectorAll('div.Nv2PK'));
      return cards
        .map((listing) => {
          const a = listing.querySelector('a[href*="/maps/place/"]');
          const href = a ? a.href : '';

          const linkAria = listing.querySelector('a[aria-label]');
          let name = cleanup(linkAria ? linkAria.getAttribute('aria-label') : '');
          if (!name) {
            const titleEl =
              listing.querySelector('.fontHeadlineSmall') ||
              listing.querySelector('h3 span') ||
              listing.querySelector('h3') ||
              listing.querySelector('.qBF1Pd') ||
              listing.querySelector('div[role="heading"]');
            if (titleEl) name = cleanup(titleEl.textContent);
          }

          const isSponsored = (listing.innerText || '').toLowerCase().includes('sponsored');

          let phone = '';
          const allEls = Array.from(listing.querySelectorAll('*'));
          for (const el of allEls) {
            const attrs = el.getAttributeNames ? el.getAttributeNames() : [];
            for (const attr of attrs) {
              const val = el.getAttribute(attr) || '';
              const digits = val.replace(/\D/g, '');
              if (digits.length >= 10) {
                const last10 = digits.slice(-10);
                phone = `(${last10.slice(0, 3)}) ${last10.slice(3, 6)}-${last10.slice(6)}`;
                break;
              }
            }
            if (phone) break;
          }

          let rating = '';
          const ratingNode = listing.querySelector('.MW4etd');
          if (ratingNode) {
            const ratingText = cleanup(ratingNode.textContent);
            const match = ratingText.match(/[\d.]+/);
            if (match) rating = match[0];
          }

          let reviews = '';
          const reviewsNode = listing.querySelector('.UY7F9');
          if (reviewsNode) {
            const match = cleanup(reviewsNode.textContent).match(/\d+/);
            if (match) reviews = match[0];
          }

          return { name, href, isSponsored, phone, rating, reviews };
        })
        .filter((x) => x.href);
    });

    for (const b of batch) {
      const token = extract1sToken(b.href);
      const key = token ? `1s:${token}` : `href:${b.href}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ ...b, token, key });
      }
    }

    console.log(`🔄 Scroll: iter=${iter} collected=${out.length} stable=${stable}`);

    if (out.length >= TARGET_UNIQUE_PLACES) break;

    await page.evaluate(() => {
      const feed = document.querySelector('div[role="feed"]');
      if (!feed) return;
      feed.scrollBy(0, Math.max(700, Math.floor(feed.clientHeight * 0.9)));
    });
    await sleep(1100);

    if (out.length === prevCount) stable++;
    else stable = 0;
    prevCount = out.length;

    if (stable >= SCROLL_STABLE_ITERS) break;
  }

  return out;
}

async function findCardForToken(page, token) {
  if (!token) return null;

  const safe = token.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const sel = `div[role="feed"] a[href*="${safe}"]`;

  for (let seek = 0; seek < 50; seek++) {
    const a = await page.$(sel);
    if (a) {
      const cardHandle = await a.evaluateHandle((el) => el.closest('div.Nv2PK'));
      const card = cardHandle.asElement();
      if (card) return card;
    }

    await page.evaluate(() => {
      const feed = document.querySelector('div[role="feed"]');
      if (!feed) return;
      feed.scrollBy(0, Math.max(620, Math.floor(feed.clientHeight * 0.85)));
    });
    await sleep(260);
  }

  return null;
}

async function clickCardCenter(page, card) {
  const box = await card.boundingBox();
  if (!box) return false;
  const x = box.x + box.width / 2;
  const y = box.y + Math.min(box.height / 2, 35);
  await page.mouse.move(x, y);
  await page.mouse.click(x, y, { delay: 35 });
  return true;
}

async function waitForPaneStable(page, expectedToken, expectedNameNorm) {
  const start = Date.now();
  let lastSig = '';

  while (Date.now() - start < PLACE_READY_TIMEOUT_MS) {
    const sig = await page.evaluate(() => {
      const h1 = document.querySelector('h1.DUwDvf') || document.querySelector('h1');
      const name = (h1 ? h1.textContent : '').replace(/\s+/g, ' ').trim();
      const url = location.href;
      const addr = document.querySelector('[data-item-id="address"]');
      const addrText = (addr ? addr.textContent : '').replace(/\s+/g, ' ').trim();
      return JSON.stringify({ name, url, addrText });
    });

    const parsed = JSON.parse(sig);

    if (!parsed.url.includes('/maps/place/')) {
      await sleep(180);
      continue;
    }

    if (expectedToken && !parsed.url.includes(expectedToken)) {
      await sleep(180);
      continue;
    }

    const paneNorm = normalizeName(parsed.name);
    if (!paneNorm) {
      await sleep(180);
      continue;
    }

    if (expectedNameNorm && !namesRoughMatch(expectedNameNorm, paneNorm)) {
      await sleep(180);
      continue;
    }

    if (!parsed.addrText) {
      await sleep(180);
      continue;
    }

    if (sig === lastSig) {
      await sleep(OPEN_SETTLE_MS);
      return true;
    }

    lastSig = sig;
    await sleep(260);
  }

  return false;
}

async function extractDetails(page) {
  return await page.evaluate(() => {
    const cleanup = (str) => (str || '').replace(/\s+/g, ' ').trim();

    const titleEl =
      document.querySelector('h1.DUwDvf') ||
      document.querySelector('h1 span') ||
      document.querySelector('h1');
    const detailName = cleanup(titleEl ? titleEl.textContent : '');

    const addressNode = document.querySelector('[data-item-id="address"]');
    let fullAddress = cleanup(addressNode ? addressNode.textContent : '');
    fullAddress = fullAddress.replace(/^[^\w\d]+/, '');

    const websiteAnchor =
      document.querySelector('a[data-item-id="authority"]') ||
      Array.from(document.querySelectorAll('a')).find((a) =>
        (a.getAttribute('aria-label') || '').toLowerCase().includes('website')
      );
    const website = cleanup(websiteAnchor ? websiteAnchor.href : '');

    const imageEl =
      document.querySelector("button[jsaction*='pane.heroHeaderImage'] img") ||
      document.querySelector('.tAiQdd img') ||
      document.querySelector('img[src^="https://lh3.googleusercontent.com"]');
    let imageUrl = cleanup(imageEl ? imageEl.currentSrc || imageEl.src : '');
    imageUrl = imageUrl.replace(/=w\d+-h\d+-k-no.*/i, '');

    const categoryNode = document.querySelector('.DkEaL');
    const categoryUI = cleanup(categoryNode ? categoryNode.textContent : '');

    const mapsUrl = window.location.href;

    return { detailName, fullAddress, website, imageUrl, categoryUI, mapsUrl };
  });
}

async function backToResults(page) {
  const sels = [
    'button[aria-label="Back"]',
    'button[jsaction*="pane.place.backToList"]',
    'button[jsaction*="pane.back"]',
  ];

  for (const sel of sels) {
    try {
      const btn = await page.$(sel);
      if (btn) {
        await btn.click({ delay: 25 });
        await sleep(BACK_SETTLE_MS);
        return;
      }
    } catch (_) {}
  }

  try {
    await page.keyboard.press('Escape');
    await sleep(BACK_SETTLE_MS);
  } catch (_) {}
}

async function openPlaceByClick(page, candidate, rank) {
  const token = candidate.token || extract1sToken(candidate.href);
  const expectedNameNorm = normalizeName(candidate.name);

  for (let attempt = 1; attempt <= MAX_OPEN_ATTEMPTS; attempt++) {
    await disableNewTabs(page);

    const card = await findCardForToken(page, token);
    if (!card) {
      await saveDebug(page, `open_no_card_r${rank}_a${attempt}`);
      continue;
    }

    try {
      await card.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
      await sleep(ACTION_DELAY_MS);

      const clicked = await clickCardCenter(page, card);
      if (!clicked) {
        await saveDebug(page, `open_no_click_r${rank}_a${attempt}`);
        continue;
      }

      await sleep(ACTION_DELAY_MS);

      const ok = await Promise.race([
        (async () => {
          const stable = await waitForPaneStable(page, token, expectedNameNorm);
          return stable;
        })(),
        (async () => {
          await sleep(OPEN_PLACE_TIMEOUT_MS);
          return false;
        })(),
      ]);

      if (!ok) {
        await saveDebug(page, `open_timeout_r${rank}_a${attempt}`);
        try {
          await backToResults(page);
          await waitForResultsMode(page);
        } catch (_) {}
        continue;
      }

      const details = await extractDetails(page);

      const paneNorm = normalizeName(details.detailName);
      if (!details.detailName || !paneNorm) {
        await saveDebug(page, `open_empty_title_r${rank}_a${attempt}`);
        await backToResults(page);
        await waitForResultsMode(page);
        continue;
      }

      if (expectedNameNorm && !namesRoughMatch(expectedNameNorm, paneNorm)) {
        await saveDebug(page, `open_name_mismatch_r${rank}_a${attempt}`);
        await backToResults(page);
        await waitForResultsMode(page);
        continue;
      }

      if (token && details.mapsUrl && !details.mapsUrl.includes(token)) {
        await saveDebug(page, `open_token_mismatch_r${rank}_a${attempt}`);
        await backToResults(page);
        await waitForResultsMode(page);
        continue;
      }

      if (!details.fullAddress) {
        await saveDebug(page, `open_no_address_r${rank}_a${attempt}`);
        await backToResults(page);
        await waitForResultsMode(page);
        continue;
      }

      await sleep(OPEN_SETTLE_MS);
      return { ok: true, details };
    } catch (_) {
      await saveDebug(page, `open_exception_r${rank}_a${attempt}`);
      try {
        await backToResults(page);
        await waitForResultsMode(page);
      } catch (_) {}
    }
  }

  return { ok: false, details: null };
}

async function main() {
  ensureDir(STEP1_DIR);
  ensureDir(DEBUG_DIR);

  const parts = SEARCH_QUERY.split(' near ');
  const CATEGORY = (parts[0] || 'businesses').trim();
  const LOCATION = (parts[1] || 'unknown').trim();

  const outputFile = path.join(
    STEP1_DIR,
    `${dateStamp()}_${safeSlug(CATEGORY)}-${safeSlug(LOCATION)}-[step-1].csv`
  );

  const browser = await puppeteer.launch({
    headless: false,
    slowMo: SLOW_MO_MS,
    defaultViewport: null,
    executablePath: CHROME_PATH,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(NAV_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);

  try {
    console.log('🌍 Opening Google Maps search...');
    const searchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      SEARCH_QUERY
    )}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });

    await sleep(1400);
    await clickConsentIfPresent(page);
    await sleep(900);

    await waitForFeed(page);
    await disableNewTabs(page);

    console.log('🔄 Scrolling the feed and collecting results...');
    const candidates = await collectCandidates(page);

    console.log(`✅ Scroll complete. Candidates collected: ${candidates.length}`);
    console.log(`📋 Candidates: ${candidates.length}`);

    await scrollFeedToTop(page);
    await waitForResultsMode(page);

    const businesses = [];
    const seenMapsUrl = new Set();
    let consecFails = 0;

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      const rank = i + 1;

      console.log(`[${rank}/${candidates.length}] scraping rank=${rank} ${c.name || '(no name)'}`);
      console.log(`   ↳ opening place (click): ${c.href}`);

      const opened = await openPlaceByClick(page, c, rank);

      if (!opened.ok || !opened.details) {
        console.log(`   ❌ open failed (rank=${rank})`);
        consecFails++;
        if (consecFails >= MAX_CONSEC_FAILS) {
          console.log(`❌ Stopping early: MAX_CONSEC_FAILS reached (${MAX_CONSEC_FAILS})`);
          break;
        }
        continue;
      }

      consecFails = 0;

      const details = opened.details;

      if (details.mapsUrl && seenMapsUrl.has(details.mapsUrl)) {
        await backToResults(page);
        await waitForResultsMode(page);
        await disableNewTabs(page);
        continue;
      }
      if (details.mapsUrl) seenMapsUrl.add(details.mapsUrl);

      const addr = parseAddressParts(details.fullAddress);
      const ll = extractLatLng(details.mapsUrl);

      businesses.push({
        name: details.detailName,
        address: addr.address,
        city: addr.city,
        state: addr.state,
        zip: addr.zip,
        phone: c.phone || '',
        website: details.website || '',
        category: details.categoryUI || CATEGORY,
        rating: c.rating || '',
        reviews: c.reviews || '',
        searchTerm: SEARCH_QUERY,
        rank: rank,
        searchSource: 'Google Maps',
        imageUrl: details.imageUrl || '',
        isSponsored: c.isSponsored ? 'true' : 'false',
        mapsUrl: details.mapsUrl || '',
        latitude: ll.latitude,
        longitude: ll.longitude,
      });

      console.log(
        `[${rank}/${candidates.length}] ✅ saved: ${details.detailName} (written=${businesses.length})`
      );

      await sleep(ACTION_DELAY_MS);
      await backToResults(page);
      await waitForResultsMode(page);
      await disableNewTabs(page);
      await sleep(BACK_SETTLE_MS);

      if (businesses.length >= TARGET_UNIQUE_PLACES) break;
    }

    const csvWriter = createObjectCsvWriter({
      path: outputFile,
      header: [
        { id: 'name', title: 'Business Name' },
        { id: 'address', title: 'Address' },
        { id: 'city', title: 'City' },
        { id: 'state', title: 'State' },
        { id: 'zip', title: 'ZIP Code' },
        { id: 'phone', title: 'Phone' },
        { id: 'website', title: 'Website' },
        { id: 'category', title: 'Detected Category' },
        { id: 'rating', title: 'Rating' },
        { id: 'reviews', title: 'Reviews' },
        { id: 'searchTerm', title: 'Search Term' },
        { id: 'rank', title: 'Map Rank' },
        { id: 'searchSource', title: 'Search Source' },
        { id: 'imageUrl', title: 'Image URL' },
        { id: 'isSponsored', title: 'Sponsored?' },
        { id: 'mapsUrl', title: 'Google Maps URL' },
        { id: 'latitude', title: 'Latitude' },
        { id: 'longitude', title: 'Longitude' },
      ],
    });

    await csvWriter.writeRecords(businesses);
    console.log(`📁 Done! Saved ${businesses.length} listings to ${outputFile}`);

    await sleep(1200);
    await browser.close();
  } catch (err) {
    console.error('❌ Fatal error:', err);
    try {
      await saveDebug(page, 'fatal');
    } catch (_) {}
    await browser.close();
    process.exitCode = 1;
  }
}

main();
