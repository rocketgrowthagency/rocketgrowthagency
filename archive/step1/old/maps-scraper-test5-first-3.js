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
const OUTPUT_FILE = path.join(OUTPUT_DIR, `${DATE}-${CATEGORY}-${LOCATION}-[step-1].csv`);

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  });

  const page = await browser.newPage();

  try {
    console.log('🌍 Opening Google Maps...');
    await page.goto('https://www.google.com/maps', { waitUntil: 'domcontentloaded', timeout: 60000 });

    console.log('⏳ Giving the page 3 seconds to fully load...');
    await new Promise(res => setTimeout(res, 3000));

    console.log('⌛ Waiting for search input...');
    await page.waitForSelector('#searchboxinput', { visible: true, timeout: 20000 });

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
      const maxScrollDuration = 60000;

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

        if (stableScrolls >= 5) break;
      }
    });

    console.log('⏳ Waiting for loading spinner to disappear or timeout...');
    try {
      await page.waitForFunction(() => {
        const spinner = document.querySelector('[aria-label="Loading more results"]');
        return !spinner || spinner.offsetParent === null;
      }, { timeout: 15000 });
    } catch {
      console.warn('⚠️ Spinner still present after 15s — continuing anyway.');
    }

    const listingEls = (await page.$$('div.Nv2PK')).slice(0, 3);
    const detailsList = [];

    for (let i = 0; i < listingEls.length; i++) {
      try {
        await listingEls[i].click();
        await new Promise(res => setTimeout(res, 3000));

        const details = await page.evaluate(() => {
          const addressNode = document.querySelector('[data-item-id="address"]');
          const fullAddress = addressNode ? addressNode.textContent.trim().replace(/^[^\w\d]+/, '') : '';

          const websiteAnchor = Array.from(document.querySelectorAll('a')).find(a =>
            a.getAttribute('aria-label')?.toLowerCase().includes('website')
          );
          const website = websiteAnchor ? websiteAnchor.href : '';

          const imageEl = document.querySelector('.tAiQdd img') || document.querySelector('img[src^="https://lh3.googleusercontent.com"]');
          let imageUrl = imageEl?.src || '';
          imageUrl = imageUrl.replace(/=w\d+-h\d+-k-no/, '');

          const shareBtn = Array.from(document.querySelectorAll('button')).find(btn =>
            btn.getAttribute('aria-label')?.toLowerCase().includes('share')
          );
          const mapsUrl = shareBtn ? window.location.href : '';

          const coordsMatch = window.location.href.match(/@([-.\d]+),([-.\d]+),/);
          const latitude = coordsMatch ? coordsMatch[1] : '';
          const longitude = coordsMatch ? coordsMatch[2] : '';

          const categoryNode = document.querySelector('.DkEaL');
          const categoryUI = categoryNode ? categoryNode.textContent.trim() : '';

          // businessHours and ownershipTags removed

          return { fullAddress, website, imageUrl, mapsUrl, latitude, longitude, categoryUI };
        });

        detailsList.push(details);
      } catch {
        detailsList.push({ fullAddress: '', website: '', imageUrl: '', mapsUrl: '', latitude: '', longitude: '', categoryUI: '' });
      }
    }

    console.log('🔍 Extracting business listings...');
    const businesses = await page.evaluate((CATEGORY, LOCATION, detailsList) => {
      const results = [];
      const listings = Array.from(document.querySelectorAll('div.Nv2PK')).slice(0, 3);
      let index = 0;

      listings.forEach(listing => {
        let name = '';
        const possibleNameNodes = listing.querySelectorAll('span, h3, div');
        for (const el of possibleNameNodes) {
          const text = el.textContent.trim();
          if (text.length > 0 && text.length < 100 && !text.match(/^\d{3,}/) && !text.includes('(')) {
            name = text;
            break;
          }
        }

        const isSponsored = !!listing.innerHTML.toLowerCase().includes('sponsored');
        let { fullAddress, website, imageUrl, mapsUrl, latitude, longitude, categoryUI } = detailsList[index];
        let address = fullAddress;
        let city = '', state = '', zip = '';

        const match = address.match(/^(.+?),\s*(.*?),\s*([A-Z]{2})\s*(\d{5})$/);
        if (match) {
          address = match[1].trim();
          city = match[2].trim();
          state = match[3].trim();
          zip = match[4].trim();
        }

        let phone = '';
        const allEls = Array.from(listing.querySelectorAll('*'));
        for (const el of allEls) {
          for (const attr of el.getAttributeNames()) {
            const val = el.getAttribute(attr);
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
          const ratingText = ratingNode.textContent.trim();
          if (ratingText.match(/[\d.]+/)) {
            rating = ratingText.match(/[\d.]+/)[0];
          }
        }

        let reviews = '';
        const reviewsNode = listing.querySelector('.UY7F9');
        if (reviewsNode) {
          const match = reviewsNode.textContent.trim().match(/\d+/);
          if (match) {
            reviews = match[0];
          }
        }

        if (!name || name.length < 2 || name.includes('')) return;

        results.push({
          name,
          address,
          city,
          state,
          zip,
          phone,
          website,
          category: categoryUI || CATEGORY,
          rating,
          reviews,
          searchTerm: `${CATEGORY} near ${LOCATION.replace(/-/g, ' ')}`,
          rank: results.length + 1,
          searchSource: 'Google Maps',
          imageUrl,
          isSponsored,
          mapsUrl,
          latitude,
          longitude
        });

        index++;
      });

      return results;
    }, CATEGORY, LOCATION, detailsList);

    console.log(`✅ Found ${businesses.length} businesses.`);
    console.log('🧪 Sample data preview:');
    console.log(businesses);

    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

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
