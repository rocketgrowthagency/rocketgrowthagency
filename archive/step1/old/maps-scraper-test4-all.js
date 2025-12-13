const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

puppeteer.use(StealthPlugin());

const SEARCH_QUERY = 'Dentists near Los Angeles';
const OUTPUT_DIR = path.join(__dirname, 'output', 'Step 1');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const today = new Date().toISOString().slice(0, 10);
const filename = `${today}-Dentists-los angeles-[step-1].csv`;
const OUTPUT_FILE = path.join(OUTPUT_DIR, filename);

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });

  const page = await browser.newPage();

  try {
    console.log('🌍 Opening Google Maps...');
    await page.goto('https://www.google.com/maps', { waitUntil: 'domcontentloaded' });

    console.log('⏳ Giving the page 3 seconds to fully load...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('✅ Waiting for search input...');
    await page.waitForSelector('input[aria-label*="Search"]', { visible: true, timeout: 20000 });

    console.log('⌨️ Typing query...');
    await page.type('input[aria-label*="Search"]', SEARCH_QUERY);
    await page.keyboard.press('Enter');

    console.log('⏳ Waiting for results...');
    await page.waitForSelector('.hfpxzc', { timeout: 20000 });

    // Scroll logic based on # of listings instead of scroll height
    console.log('🔄 Scrolling the feed until all results are loaded...');
    const scrollContainerSelector = '.m6QErb[aria-label]';
    let previousCount = 0;
    const startTime = Date.now();

    while (Date.now() - startTime < 60000) {
      const listings = await page.$$('.Nv2PK');
      const currentCount = listings.length;

      if (currentCount === previousCount) {
        console.log('✅ No new listings loaded. Stopping scroll.');
        break;
      }

      previousCount = currentCount;
      console.log(`↕️ Listings loaded: ${currentCount}`);
      await page.evaluate((selector) => {
        const el = document.querySelector(selector);
        el.scrollBy(0, el.scrollHeight);
      }, scrollContainerSelector);

      await new Promise(res => setTimeout(res, 2000));
    }

    console.log('⏳ Waiting for loading spinner to disappear or timeout...');
    await new Promise(res => setTimeout(res, 2000));

    console.log('🔍 Extracting business listings...');
    const listings = await page.$$('.Nv2PK');

    const finalData = [];
    let rank = 1;

    for (const listing of listings) {
      const name = await listing.$eval('div[role="article"]', el => el.getAttribute('aria-label')).catch(() => '');
      const isSponsored = await listing.evaluate(el => el.innerText.includes('Sponsored'));
      const rawText = await listing.evaluate(el => el.innerText);

      const phoneMatch = rawText.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
      const phone = phoneMatch ? phoneMatch[0] : '';

      const websiteAnchor = await listing.$('a[aria-label="Website"]');
      const website = websiteAnchor ? await websiteAnchor.evaluate(el => el.href) : '';

      const categoryMatch = rawText.match(/\b(Dentist|Dental\s\w+|Cosmetic dentist|Orthodontist)\b/i);
      const category = categoryMatch ? categoryMatch[0] : '';

      const ratingMatch = rawText.match(/(\d\.\d)\s?★/);
      const rating = ratingMatch ? ratingMatch[1] : '';

      const reviewsMatch = rawText.match(/(\d+(,\d+)?)(?=\s+reviews?)/i);
      const reviews = reviewsMatch ? reviewsMatch[1].replace(',', '') : '';

      const addressMatch = rawText.match(/(\d{3,5}[^,\n]+\b(?:Blvd|Ave|Street|St|Dr|Road|Rd|Way|Lane|Ln|Boulevard|Place|Pl)[^\n,]*)/);
      const address = addressMatch ? addressMatch[0].replace(/^·\s*/, '').trim() : '';

      const zipMatch = rawText.match(/\b\d{5}\b/);
      const zip = zipMatch ? zipMatch[0] : '';

      const city = 'Los Angeles';
      const state = 'CA';

      const latitude = '';
      const longitude = '';

      const imageUrlMatch = await listing.$eval('img', img => img.src).catch(() => '');

      const mapUrl = name
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`
        : '';

      const business = {
        name: name && !name.includes('Sponsored') ? name : '',
        address,
        city,
        state,
        zip,
        phone,
        website,
        category,
        rating,
        reviews,
        searchTerm: SEARCH_QUERY,
        rank: rank++,
        searchSource: 'Google Maps',
        imageUrl: imageUrlMatch,
        isSponsored,
        latitude,
        longitude,
        mapUrl,
      };

      finalData.push(business);
    }

    console.log(`🧪 Sample data preview:\n`, finalData.slice(0, 3));

    const csvWriter = createCsvWriter({
      path: OUTPUT_FILE,
      header: Object.keys(finalData[0]).map(field => ({ id: field, title: field }))
    });

    await csvWriter.writeRecords(finalData);
    console.log(`📁 Done! Saved ${finalData.length} listings to ${OUTPUT_FILE}`);
    await browser.close();

  } catch (err) {
    console.error('❌ Uncaught script error:', err);
    await browser.close();
  }
})();
