// maps-scraper-test5-all.cjs

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

puppeteer.use(StealthPlugin());

const SEARCH_QUERY = 'Dentists near Los Angeles CA';
const CATEGORY = SEARCH_QUERY.split(' near ')[0].trim();
const LOCATION = 'los-angeles';
const DATE = new Date().toISOString().split('T')[0];
const OUTPUT_DIR = path.join(__dirname, 'output', 'Step 1');
const OUTPUT_FILE = path.join(
  OUTPUT_DIR,
  `${DATE}-${CATEGORY}-${LOCATION}-[step-1]-all.csv`
);

function normalizeName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(
      /\b(dentist|dentistry|dental|clinic|center|care|family|smile|smiles|dds|dmd|office|group|practice|inc|llc|cosmetic|general|orthodontics|orthodontist|implant|implants)\b/g,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ],
    executablePath:
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  });

  const page = await browser.newPage();

  try {
    console.log('🌍 Opening Google Maps...');
    await page.goto('https://www.google.com/maps', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    console.log('⏳ Giving the page 3 seconds to fully load...');
    await new Promise(res => setTimeout(res, 3000));

    console.log('⌛ Waiting for search input...');
    await page.waitForSelector('#searchboxinput', {
      visible: true,
      timeout: 20000
    });

    console.log('✅ Search input found, entering query...');
    await page.type('#searchboxinput', SEARCH_QUERY);
    await page.keyboard.press('Enter');

    console.log('⏳ Waiting for results...');
    await new Promise(res => setTimeout(res, 5000));

    console.log('🔄 Scrolling the feed until all results are loaded...');
    await page.waitForSelector('div[role="feed"]');
    await page.evaluate(async () => {
      const delay = ms => new Promise(res => setTimeout(res, ms));
      const feed = document.querySelector('div[role="feed"]');
      let prevCount = 0;
      let stableScrolls = 0;
      const startTime = Date.now();
      const maxScrollDuration = 120000;

      while (Date.now() - startTime < maxScrollDuration) {
        feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
        await delay(1500);
        const cards = feed.querySelectorAll('div.Nv2PK');
        const newCount = cards.length;

        if (newCount === prevCount) {
          stableScrolls++;
        } else {
          stableScrolls = 0;
          prevCount = newCount;
        }

        if (stableScrolls >= 10) break;
      }
    });

    console.log('⏳ Waiting for loading spinner to disappear or timeout...');
    try {
      await page.waitForFunction(
        () => {
          const spinner = document.querySelector(
            '[aria-label="Loading more results"]'
          );
          return !spinner || spinner.offsetParent === null;
        },
        { timeout: 15000 }
      );
    } catch {
      console.warn('⚠️ Spinner still present after 15s — continuing anyway.');
    }

    const listingEls = await page.$$('div.Nv2PK');
    console.log(`🔍 Extracting ${listingEls.length} listings in single pass...`);

    const businesses = [];

    for (let i = 0; i < listingEls.length; i++) {
      const card = listingEls[i];

      try {
        await card.evaluate(el =>
          el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        );
        await new Promise(res => setTimeout(res, 500));

        // BASIC INFO FROM CARD ONLY
        const basic = await card.evaluate(listing => {
          const cleanup = str =>
            (str || '')
              .replace(/\s+/g, ' ')
              .trim();

          const link = listing.querySelector('a[aria-label]');
          let name = cleanup(link ? link.getAttribute('aria-label') : '');

          if (!name) {
            const titleEl =
              listing.querySelector('.fontHeadlineSmall') ||
              listing.querySelector('h3 span') ||
              listing.querySelector('h3');
            if (titleEl) name = cleanup(titleEl.textContent);
          }

          const isSponsored = listing.innerHTML
            .toLowerCase()
            .includes('sponsored');

          let phone = '';
          const allEls = Array.from(listing.querySelectorAll('*'));
          for (const el of allEls) {
            const attrs = el.getAttributeNames ? el.getAttributeNames() : [];
            for (const attr of attrs) {
              const val = el.getAttribute(attr) || '';
              const digits = val.replace(/\D/g, '');
              if (digits.length >= 10) {
                const last10 = digits.slice(-10);
                phone = `(${last10.slice(0, 3)}) ${last10.slice(
                  3,
                  6
                )}-${last10.slice(6)}`;
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

          return { name, isSponsored, phone, rating, reviews };
        });

        if (!basic.name) {
          console.log(
            `Skipping listing #${i + 1} due to missing/invalid name.`
          );
          continue;
        }

        const basicNorm = normalizeName(basic.name);
        if (!basicNorm || basicNorm.length < 2) {
          console.log(
            `Skipping listing #${i + 1} due to weak normalized name "${basicNorm}".`
          );
          continue;
        }

        let details = null;
        let matched = false;

        for (let attempt = 1; attempt <= 2; attempt++) {
          await card.click();
          await new Promise(res => setTimeout(res, 3000));

          details = await page.evaluate(() => {
            const cleanup = str =>
              (str || '')
                .replace(/\s+/g, ' ')
                .trim();

            const titleEl =
              document.querySelector('.DUwDvf') ||
              document.querySelector('h1 span');
            const detailName = cleanup(titleEl ? titleEl.textContent : '');

            const addressNode = document.querySelector(
              '[data-item-id="address"]'
            );
            let fullAddress = cleanup(addressNode ? addressNode.textContent : '');
            fullAddress = fullAddress.replace(/^[^\w\d]+/, '');

            const websiteAnchor = Array.from(
              document.querySelectorAll('a')
            ).find(a =>
              (a.getAttribute('aria-label') || '')
                .toLowerCase()
                .includes('website')
            );
            const website = cleanup(websiteAnchor ? websiteAnchor.href : '');

            const imageEl =
              document.querySelector('.tAiQdd img') ||
              document.querySelector(
                'button[jsaction*="pane.heroHeaderImage"] img'
              ) ||
              document.querySelector(
                'img[src^="https://lh3.googleusercontent.com"]'
              );
            let imageUrl = cleanup(imageEl ? imageEl.src : '');
            imageUrl = imageUrl.replace(/=w\d+-h\d+-k-no/, '');

            const categoryNode = document.querySelector('.DkEaL');
            const categoryUI = cleanup(
              categoryNode ? categoryNode.textContent : ''
            );

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
              longitude
            };
          });

          const detailNorm = normalizeName(details.detailName);
          if (!detailNorm || detailNorm.length < 2) {
            console.warn(
              `Listing #${i + 1} attempt ${attempt}: weak detail name "${detailNorm}".`
            );
            continue;
          }

          const namesMatch =
            basicNorm === detailNorm ||
            basicNorm.includes(detailNorm) ||
            detailNorm.includes(basicNorm);

          if (namesMatch) {
            matched = true;
            break;
          } else {
            console.warn(
              `Listing #${i + 1} attempt ${attempt}: name mismatch card="${basic.name}" pane="${details.detailName}" (cardNorm="${basicNorm}" paneNorm="${detailNorm}")`
            );
          }
        }

        if (!matched || !details) {
          console.warn(
            `Skipping listing #${i + 1} due to persistent name mismatch.`
          );
          continue;
        }

        let address = details.fullAddress || '';
        let city = '';
        let state = '';
        let zip = '';

        const addrMatch = address.match(
          /^(.+?),\s*(.*?),\s*([A-Z]{2})\s*(\d{5})$/
        );
        if (addrMatch) {
          address = addrMatch[1].trim();
          city = addrMatch[2].trim();
          state = addrMatch[3].trim();
          zip = addrMatch[4].trim();
        }

        businesses.push({
          name: basic.name,
          address,
          city,
          state,
          zip,
          phone: basic.phone,
          website: details.website,
          category: details.categoryUI || CATEGORY,
          rating: basic.rating,
          reviews: basic.reviews,
          searchTerm: `${CATEGORY} near ${LOCATION.replace(/-/g, ' ')}`,
          rank: businesses.length + 1,
          searchSource: 'Google Maps',
          imageUrl: details.imageUrl,
          isSponsored: basic.isSponsored,
          mapsUrl: details.mapsUrl,
          latitude: details.latitude,
          longitude: details.longitude
        });
      } catch (err) {
        console.error(`❌ Error on listing #${i + 1}:`, err.message);
      }
    }

    console.log(`✅ Final count: ${businesses.length} businesses.`);
    console.log('🧪 Sample preview:', businesses.slice(0, 3));

    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const csvWriter = createCsvWriter({
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
        { id: 'longitude', title: 'Longitude' }
      ]
    });

    await csvWriter.writeRecords(businesses);
    console.log(`📁 Done! Saved ${businesses.length} listings to ${OUTPUT_FILE}`);

    await new Promise(res => setTimeout(res, 5000));
    await browser.close();
  } catch (error) {
    console.error('❌ Error during scraping:', error);
    await browser.close();
  }
})();

