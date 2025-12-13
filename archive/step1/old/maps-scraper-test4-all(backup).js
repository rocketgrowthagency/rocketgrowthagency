// FULL SCRIPT SAME AS PROVIDED EARLIER
// (just save it as maps-scraper-test4-all.js instead of maps-scraper-test4.js)

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

puppeteer.use(StealthPlugin());

const CATEGORY = 'Dentists';
const LOCATION = 'los angeles';
const SEARCH_QUERY = `${CATEGORY} near ${LOCATION}`;
const OUTPUT_DIR = path.join(__dirname, 'output', 'Step 1');
const DATE = new Date().toISOString().split('T')[0];
const OUTPUT_FILE = path.join(OUTPUT_DIR, `${DATE}-${CATEGORY}-${LOCATION}-[step-1].csv`);

(async () => {
  try {
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    });

    const page = await browser.newPage();

    console.log('🌍 Opening Google Maps...');
    await page.goto('https://www.google.com/maps?hl=en', { waitUntil: 'networkidle2' });

    console.log('⏳ Giving the page 3 seconds to fully load...');
    await new Promise(res => setTimeout(res, 3000));

    let inputEl = null;
    for (let i = 0; i < 10; i++) {
      try {
        inputEl = await page.waitForSelector(
          'input[role="combobox"], input[aria-label*="Search"], input[jsaction*="input"]',
          { visible: true, timeout: 1000 }
        );
        if (inputEl) break;
      } catch {
        console.log(`⏳ Still waiting for search input... [${i + 1}/10]`);
      }
    }

    if (!inputEl) throw new Error('❌ Search input not found after 10 seconds.');

    console.log('✅ Search input found, typing query...');
    await inputEl.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.keyboard.type(SEARCH_QUERY, { delay: 120 });
    await page.keyboard.press('Enter');

    console.log('⏳ Waiting for results...');
    await page.waitForSelector('.Nv2PK', { timeout: 15000 });

    const scrollableSelector = '.m6QErb[aria-label][role="feed"]';
    await page.waitForSelector(scrollableSelector, { visible: true });
    console.log('🔄 Scrolling the feed until all results are loaded...');

    let lastHeight = 0;
    let sameCount = 0;
    for (let i = 0; i < 20; i++) {
      const height = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return 0;
        el.scrollBy(0, el.scrollHeight);
        return el.scrollHeight;
      }, scrollableSelector);

      console.log(`↕️ Scroll attempt ${i + 1}: height = ${height}`);
      if (height === lastHeight) {
        sameCount++;
        if (sameCount >= 5) break;
      } else {
        sameCount = 0;
        lastHeight = height;
      }

      await new Promise((r) => setTimeout(r, 1000));
    }

    console.log('⏳ Waiting for loading spinner to disappear or timeout...');
    await new Promise(res => setTimeout(res, 2000));

    console.log('🔍 Extracting business listings...');
    const detailsList = [];
    const listingEls = await page.$$('.Nv2PK');

    for (let i = 0; i < listingEls.length; i++) {
      try {
        await listingEls[i].click();
        await new Promise(res => setTimeout(res, 3000));

        const details = await page.evaluate(() => {
          try {
            const addressNode = document.querySelector('[data-item-id="address"]');
            let fullAddress = addressNode?.textContent?.trim() || '';
            fullAddress = fullAddress.replace(/^[^\w]+/, '').trim();

            const websiteAnchor = Array.from(document.querySelectorAll('a')).find(a =>
              a.getAttribute('aria-label')?.toLowerCase().includes('website')
            );
            const website = websiteAnchor ? websiteAnchor.href : '';

            const imageEl = document.querySelector('.tAiQdd img') || document.querySelector('img[src^="https://lh3.googleusercontent.com"]');
            let imageUrl = imageEl?.src || '';
            imageUrl = imageUrl.replace(/=w\d+-h\d+-k-no/, '');

            const phoneNode = Array.from(document.querySelectorAll('button, span')).find(el =>
              el.textContent?.match(/\(\d{3}\)\s?\d{3}-\d{4}/)
            );
            const phone = phoneNode ? phoneNode.textContent.replace(/[^\d()\-+\s]/g, '').trim() : '';

            const coordsMatch = window.location.href.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
            const latitude = coordsMatch ? coordsMatch[1] : '';
            const longitude = coordsMatch ? coordsMatch[2] : '';

            const categoryNode = document.querySelector('.DkEaL');
            const category = categoryNode ? categoryNode.textContent.trim() : '';

            const linkEl = Array.from(document.querySelectorAll('a')).find(a =>
              a.href.includes('/maps/place/')
            );
            const mapUrl = linkEl?.href || window.location.href;

            return { fullAddress, website, imageUrl, phone, latitude, longitude, category, mapUrl };
          } catch (err) {
            return {
              fullAddress: '', website: '', imageUrl: '', phone: '', latitude: '', longitude: '', category: '', mapUrl: ''
            };
          }
        });

        detailsList.push(details);
      } catch (err) {
        console.error(`❌ Error extracting listing ${i + 1}:`, err.message);
        detailsList.push({
          fullAddress: '', website: '', imageUrl: '', phone: '', latitude: '', longitude: '', category: '', mapUrl: ''
        });
      }
    }

    const finalData = await page.evaluate((CATEGORY, LOCATION, detailsList) => {
      return Array.from(document.querySelectorAll('div.Nv2PK')).map((listing, i) => {
        try {
          const textNodes = listing.querySelectorAll('span, h3, div');
          const possibleNameNodes = Array.from(textNodes).filter(el =>
            el.textContent && el.textContent.trim().length > 0 &&
            el.textContent.length < 100 &&
            !el.textContent.match(/\d{3,}/) &&
            !el.textContent.toLowerCase().includes('reviews') &&
            !el.textContent.includes('$')
          );
          const name = possibleNameNodes[0]?.textContent?.trim() || '';
          const rating = listing.querySelector('.MW4etd')?.textContent?.trim() || '';
          const reviews = listing.querySelector('.UY7F9')?.textContent?.trim().replace(/[^\d]/g, '') || '';
          const isSponsored = listing.innerHTML.toLowerCase().includes('sponsored');

          const { fullAddress, website, imageUrl, phone, latitude, longitude, category, mapUrl } = detailsList[i];

          const addressParts = fullAddress.split(',');
          const address = addressParts[0]?.trim() || '';
          const city = addressParts[1]?.trim() || '';
          const stateZip = addressParts[2]?.trim() || '';
          const state = stateZip.split(' ')[0] || '';
          const zip = stateZip.split(' ')[1] || '';

          return {
            name,
            address,
            city,
            state,
            zip,
            phone,
            website,
            category: category || CATEGORY,
            rating,
            reviews,
            searchTerm: `${CATEGORY} near ${LOCATION}`,
            rank: i + 1,
            searchSource: 'Google Maps',
            imageUrl,
            isSponsored,
            latitude,
            longitude,
            mapUrl
          };
        } catch (err) {
          return {};
        }
      });
    }, CATEGORY, LOCATION, detailsList);

    console.log('🧪 Sample data preview:\n', finalData);

    const csvWriter = createCsvWriter({
      path: OUTPUT_FILE,
      header: Object.keys(finalData[0]).map(field => ({ id: field, title: field }))
    });

    await csvWriter.writeRecords(finalData);
    console.log(`📁 Done! Saved ${finalData.length} listings to ${OUTPUT_FILE}`);

    await new Promise(res => setTimeout(res, 10000));
    await browser.close();

  } catch (err) {
    console.error('❌ Uncaught script error:', err);
  }
})();
