const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

puppeteer.use(StealthPlugin());

const SEARCH_QUERY = 'Dentists near Los Angeles CA';
const OUTPUT_DIR = path.join(__dirname, 'output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'dentists-los-angeles.csv');

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  });

  const page = await browser.newPage();

  console.log('🌍 Opening Google Maps...');
  await page.goto('https://www.google.com/maps', { waitUntil: 'networkidle2' });

  console.log('🔎 Waiting for search input (robust)...');

try {
  await page.waitForFunction(() => {
    const el = document.querySelector('input[aria-label="Search Google Maps"]');
    return el && el.offsetParent !== null;
  }, { timeout: 90000 });

  await page.type('input[aria-label="Search Google Maps"]', SEARCH_QUERY);
  await page.keyboard.press('Enter');

} catch (err) {
  console.error('❌ Failed to find search input:', err.message);
  await page.screenshot({ path: 'debug_search_input_error.png' });
  await browser.close();
  process.exit(1);
}

  console.log('🕵️ Waiting for search results...');
  await page.waitForSelector('.m6QErb[aria-label]', { timeout: 60000 });
  await page.waitForTimeout(5000);

  console.log('📜 Scrolling results...');
  const scrollSelector = '.m6QErb[aria-label]';
  for (let i = 0; i < 10; i++) {
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) el.scrollBy(0, el.scrollHeight);
    }, scrollSelector);
    await page.waitForTimeout(2000);
  }

  console.log('📝 Extracting data...');
  const businesses = await page.evaluate(() => {
    const cards = document.querySelectorAll('.Nv2PK');
    const results = [];

    cards.forEach(card => {
      const name = card.querySelector('.qBF1Pd')?.innerText || '';
      const address = card.querySelector('.rllt__details div:nth-child(2)')?.innerText || '';
      const phone = card.querySelector('.UsdlK')?.innerText || '';
      const website = Array.from(card.querySelectorAll('a')).find(a => a.href.includes('http'))?.href || '';
      const category = card.querySelector('.rllt__details div:first-child')?.innerText || '';
      if (name) {
        results.push({ name, address, phone, website, category });
      }
    });

    return results;
  });

  console.log(`✅ Found ${businesses.length} businesses.`);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
  }

  const csvWriter = createCsvWriter({
    path: OUTPUT_FILE,
    header: [
      { id: 'name', title: 'Business Name' },
      { id: 'address', title: 'Address' },
      { id: 'phone', title: 'Phone' },
      { id: 'website', title: 'Website' },
      { id: 'category', title: 'Category' },
    ]
  });

  await csvWriter.writeRecords(businesses);
  console.log(`💾 Done! Saved ${businesses.length} businesses to ${OUTPUT_FILE}`);

  await new Promise(res => setTimeout(res, 5000));
  await browser.close();
})();
