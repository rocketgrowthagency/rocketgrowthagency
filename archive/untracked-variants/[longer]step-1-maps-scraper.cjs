// step-1-maps-scraper.cjs

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const { createObjectCsvWriter } = require('csv-writer');

puppeteer.use(StealthPlugin());

const RAW_QUERY =
  process.argv.slice(2).join(' ') || process.env.SEARCH_QUERY || 'Dentists near Los Angeles CA';

const SEARCH_QUERY = RAW_QUERY.trim();

function slugify(str) {
  return (str || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '');
}

const parts = SEARCH_QUERY.split(' near ');
const CATEGORY = (parts[0] || '').trim() || 'Dentists';
const LOCATION_RAW = (parts[1] || 'Los Angeles CA').trim();

const CATEGORY_SLUG = slugify(CATEGORY);
const LOCATION_SLUG = slugify(LOCATION_RAW);

const now = new Date();
const yyyy = now.getFullYear();
const mm = String(now.getMonth() + 1).padStart(2, '0');
const dd = String(now.getDate()).padStart(2, '0');
const DATE_PREFIX = `${yyyy}-${mm}-${dd}`;

const OUTPUT_DIR = path.join(process.cwd(), 'output', 'Step 1');
const OUTPUT_FILE = path.join(
  OUTPUT_DIR,
  `${DATE_PREFIX}_${CATEGORY_SLUG}-${LOCATION_SLUG}-[step-1].csv`
);

const TARGET_UNIQUE_PLACES = Number(process.env.TARGET_UNIQUE_PLACES || 55);
const SCROLL_MAX_ITERS = Number(process.env.SCROLL_MAX_ITERS || 70);
const SCROLL_STABLE_ITERS = Number(process.env.SCROLL_STABLE_ITERS || 14);
const NAV_TIMEOUT_MS = Number(process.env.NAV_TIMEOUT_MS || 90000);
const RESULTS_READY_TIMEOUT_MS = Number(process.env.RESULTS_READY_TIMEOUT_MS || 70000);

async function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });

  const page = await browser.newPage();

  try {
    console.log('🌍 Opening Google Maps search...');
    await page.goto('https://www.google.com/maps', {
      waitUntil: 'domcontentloaded',
      timeout: NAV_TIMEOUT_MS,
    });

    console.log('⏳ Giving the page 3 seconds to fully load...');
    await delay(3000);

    console.log('⌛ Waiting for search input...');
    await page.waitForSelector('#searchboxinput', {
      visible: true,
      timeout: 20000,
    });

    console.log('✅ Search input found, entering query...');
    await page.click('#searchboxinput', { clickCount: 3 });
    await page.type('#searchboxinput', SEARCH_QUERY);
    await page.keyboard.press('Enter');

    console.log('⏳ Waiting for results feed...');
    await page.waitForSelector('div[role="feed"]', {
      timeout: RESULTS_READY_TIMEOUT_MS,
    });

    console.log('🔄 Scrolling the feed and collecting results...');
    let prevCount = 0;
    let stable = 0;

    for (let iter = 1; iter <= SCROLL_MAX_ITERS; iter++) {
      const count = await page.evaluate(() => {
        const feed = document.querySelector('div[role="feed"]');
        if (!feed) return 0;
        const cards = feed.querySelectorAll('div.Nv2PK');
        return cards.length;
      });

      if (count === prevCount) {
        stable += 1;
      } else {
        stable = 0;
        prevCount = count;
      }

      console.log(`🔄 Scroll: iter=${iter} collected=${count} stable=${stable}`);

      if (count >= TARGET_UNIQUE_PLACES) {
        console.log(
          `✅ Reached target count ${count} (>= ${TARGET_UNIQUE_PLACES}). Stopping scroll.`
        );
        break;
      }

      if (stable >= SCROLL_STABLE_ITERS) {
        console.log(
          `✅ No new results after ${SCROLL_STABLE_ITERS} stable iterations; stopping at ${count} cards.`
        );
        break;
      }

      await page.evaluate(() => {
        const feed = document.querySelector('div[role="feed"]');
        if (feed) {
          feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
        }
      });

      await delay(1500);
    }

    const listingEls = await page.$$('div.Nv2PK');
    console.log(`📋 Cards in feed: ${listingEls.length}`);

    const businesses = [];
    const seenMapsUrls = new Set();

    for (let i = 0; i < listingEls.length; i++) {
      const card = listingEls[i];
      const index = i + 1;

      try {
        await card.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
        await delay(400);

        const basic = await card.evaluate((listing) => {
          const cleanup = (str) => (str || '').replace(/\s+/g, ' ').trim();

          const link = listing.querySelector('a[aria-label]');
          let name = cleanup(link ? link.getAttribute('aria-label') : '');

          if (!name) {
            const titleEl =
              listing.querySelector('.fontHeadlineSmall') ||
              listing.querySelector('h3 span') ||
              listing.querySelector('h3');
            if (titleEl) name = cleanup(titleEl.textContent);
          }

          const isSponsored = listing.innerHTML.toLowerCase().includes('sponsored');

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
          let reviews = '';

          // Rating from inline rating element
          const ratingNode = listing.querySelector('.MW4etd');
          if (ratingNode) {
            const ratingText = cleanup(ratingNode.textContent);
            const match = ratingText.match(/[\d.]+/);
            if (match) rating = match[0];
          }

          // Reviews: use all digits (handles "1,234 reviews" correctly)
          const reviewsNode = listing.querySelector('.UY7F9');
          if (reviewsNode) {
            const text = cleanup(reviewsNode.textContent);
            const digits = text.replace(/[^\d]/g, '');
            if (digits) reviews = digits;
          }

          // Fallback rating via aria-label "X.X stars"
          if (!rating) {
            const spanWithStars = Array.from(listing.querySelectorAll('span[aria-label]')).find(
              (el) => (el.getAttribute('aria-label') || '').toLowerCase().includes('stars')
            );
            if (spanWithStars) {
              const text = spanWithStars.getAttribute('aria-label') || '';
              const m = text.match(/([\d.]+)\s*out of/);
              if (m) rating = m[1];
            }
          }

          // Fallback reviews: find any span mentioning "review" and strip all non-digits
          if (!reviews) {
            const spanWithReviews = Array.from(listing.querySelectorAll('span')).find((el) =>
              (el.textContent || '').toLowerCase().includes('review')
            );
            if (spanWithReviews) {
              const text = (spanWithReviews.textContent || '').replace(/\s+/g, ' ').trim();
              const digits = text.replace(/[^\d]/g, '');
              if (digits) reviews = digits;
            }
          }

          return { name, isSponsored, phone, rating, reviews };
        });

        if (!basic.name) {
          console.log(`Skipping listing #${index} due to missing/invalid name from card.`);
          continue;
        }

        let details = null;

        for (let attempt = 1; attempt <= 3; attempt++) {
          console.log(
            `[${index}/${listingEls.length}] scraping rank=${index} ${basic.name} (attempt ${attempt})`
          );

          const prevPaneName = await page.evaluate(() => {
            const cleanup = (str) => (str || '').replace(/\s+/g, ' ').trim();
            const titleEl = document.querySelector('.DUwDvf') || document.querySelector('h1 span');
            return cleanup(titleEl ? titleEl.textContent : '');
          });

          await card.click();

          const maxWaitMs = 8000;
          const stepMs = 350;
          const start = Date.now();
          let paneChanged = false;

          while (Date.now() - start < maxWaitMs) {
            const currentPaneName = await page.evaluate(() => {
              const cleanup = (str) => (str || '').replace(/\s+/g, ' ').trim();
              const titleEl =
                document.querySelector('.DUwDvf') || document.querySelector('h1 span');
              return cleanup(titleEl ? titleEl.textContent : '');
            });

            if (currentPaneName && currentPaneName !== prevPaneName) {
              paneChanged = true;
              break;
            }
            await delay(stepMs);
          }

          if (!paneChanged) {
            console.warn(
              `Listing #${index} attempt ${attempt}: pane title did not change from "${basic.name}".`
            );
            continue;
          }

          details = await page.evaluate(() => {
            const cleanup = (str) => (str || '').replace(/\s+/g, ' ').trim();

            const titleEl = document.querySelector('.DUwDvf') || document.querySelector('h1 span');
            const detailName = cleanup(titleEl ? titleEl.textContent : '');

            const addressNode = document.querySelector('[data-item-id="address"]');
            let fullAddress = cleanup(addressNode ? addressNode.textContent : '');
            fullAddress = fullAddress.replace(/^[^\w\d]+/, '');

            const websiteAnchor = Array.from(document.querySelectorAll('a')).find((a) =>
              (a.getAttribute('aria-label') || '').toLowerCase().includes('website')
            );
            const website = cleanup(websiteAnchor ? websiteAnchor.href : '');

            const imageEl =
              document.querySelector('.tAiQdd img') ||
              document.querySelector('button[jsaction*="pane.heroHeaderImage"] img') ||
              document.querySelector('img[src^="https://lh3.googleusercontent.com"]');
            let imageUrl = cleanup(imageEl ? imageEl.src : '');
            imageUrl = imageUrl.replace(/=w\d+-h\d+-k-no/, '');

            const categoryNode = document.querySelector('.DkEaL');
            const categoryUI = cleanup(categoryNode ? categoryNode.textContent : '');

            const mapsUrl = window.location.href;
            const coordsMatch = mapsUrl.match(/@([-.\d]+),([-.\d]+),/);
            const latitude = coordsMatch ? coordsMatch[1] : '';
            const longitude = coordsMatch ? coordsMatch[2] : '';

            return {
              detailName,
              fullAddress,
              website,
              imageUrl,
              categoryUI,
              mapsUrl,
              latitude,
              longitude,
            };
          });

          if (details && details.fullAddress) {
            break;
          } else {
            console.warn(
              `Listing #${index} attempt ${attempt}: missing address in pane; retrying.`
            );
            details = null;
          }
        }

        if (!details || !details.fullAddress) {
          console.warn(
            `Skipping listing #${index} (${basic.name}) due to missing address/failed pane load.`
          );
          continue;
        }

        if (details.mapsUrl && seenMapsUrls.has(details.mapsUrl)) {
          console.warn(`Skipping duplicate mapsUrl for listing #${index} (${basic.name}).`);
          continue;
        }
        if (details.mapsUrl) {
          seenMapsUrls.add(details.mapsUrl);
        }

        let address = details.fullAddress || '';
        let city = '';
        let state = '';
        let zip = '';

        const addrMatch = address.match(/^(.+?),\s*(.*?),\s*([A-Z]{2})\s*(\d{5})$/);
        if (addrMatch) {
          address = addrMatch[1].trim();
          city = addrMatch[2].trim();
          state = addrMatch[3].trim();
          zip = addrMatch[4].trim();
        }

        const finalName = details.detailName || basic.name;

        businesses.push({
          name: finalName,
          address,
          city,
          state,
          zip,
          phone: basic.phone,
          website: details.website,
          category: details.categoryUI || CATEGORY,
          rating: basic.rating,
          reviews: basic.reviews,
          searchTerm: SEARCH_QUERY,
          rank: businesses.length + 1,
          searchSource: 'Google Maps',
          imageUrl: details.imageUrl,
          isSponsored: basic.isSponsored,
          mapsUrl: details.mapsUrl,
          latitude: details.latitude,
          longitude: details.longitude,
        });

        console.log(
          `[${index}/${listingEls.length}] ✅ saved: ${finalName} (written=${businesses.length})`
        );
      } catch (err) {
        console.error(`❌ Error on listing #${i + 1}:`, err && err.message ? err.message : err);
      }
    }

    console.log(`✅ Final count written: ${businesses.length} businesses.`);
    console.log('🧪 Sample preview:', businesses.slice(0, 5));

    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const csvWriter = createObjectCsvWriter({
      path: OUTPUT_FILE,
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
    console.log(`📁 Done! Saved ${businesses.length} listings to ${OUTPUT_FILE}`);

    await delay(3000);
    await browser.close();
  } catch (error) {
    console.error('❌ Fatal error during scraping:', error);
    await browser.close();
  }
})();
