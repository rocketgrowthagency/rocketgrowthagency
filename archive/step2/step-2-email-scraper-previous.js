const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const axios = require('axios');
const { JSDOM } = require('jsdom');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const INPUT_DIR = path.join(__dirname, 'output', 'Step 1');
const FINAL_DIR = path.join(__dirname, 'output', 'Final');
const STEP2_DIR = path.join(__dirname, 'output', 'Step 2');

const inputFile = fs.readdirSync(INPUT_DIR)
  .filter(f => f.endsWith('[step-1].csv'))
  .map(f => path.join(INPUT_DIR, f))
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];

if (!inputFile) {
  console.error('❌ No step-1 CSV found.');
  process.exit(1);
}

const baseName = path.basename(inputFile).replace('[step-1].csv', '');
const finalFile = path.join(FINAL_DIR, `${baseName}[FINAL].csv`);
const step2File = path.join(STEP2_DIR, `${baseName}[step-2].csv`);

if (!fs.existsSync(FINAL_DIR)) {
  fs.mkdirSync(FINAL_DIR, { recursive: true });
}
if (!fs.existsSync(STEP2_DIR)) {
  fs.mkdirSync(STEP2_DIR, { recursive: true });
}

(async () => {
  console.log('📥 Reading CSV...');
  const businesses = [];

  await new Promise((resolve) => {
    fs.createReadStream(inputFile)
      .pipe(csv())
      .on('data', (row) => {
        const rawName = row['Business Name'];
        const name = rawName ? rawName.trim() : '';

        if (!name || name.toLowerCase().includes('sponsored') || name.includes('')) {
          console.log('❌ Skipping:', name);
          return;
        }

        businesses.push(row);
      })
      .on('end', () => {
        console.log(`🔍 Loaded ${businesses.length} valid businesses...`);
        resolve();
      });
  });

  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: null,
    args: ['--no-sandbox'],
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  });
  const page = await browser.newPage();

  for (const biz of businesses) {
    const name = biz['Business Name'] || '';
    const address = biz['Address'] || '';
    let website = (biz['Website'] || '').trim();
    let email = '';

    if (website) {
      process.stdout.write(`🔗 ${website} → `);
      try {
        const { data: html } = await axios.get(website, { timeout: 10000 });
        const dom = new JSDOM(html);
        const text = dom.window.document.body.textContent;
        const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/);
        email = match ? match[0] : '';
      } catch {
        email = '';
      }
    } else {
      // 🔍 Google search fallback
      const query = `${name} ${address}`;
      process.stdout.write(`🔎 Searching Google for: ${query} → `);
      try {
        await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}`, { timeout: 20000 });
        await page.waitForSelector('a[href^="http"]', { timeout: 10000 });

        const firstLink = await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll('a[href^="http"]'));
          const clean = links.find(link => !link.href.includes('google.com'));
          return clean ? clean.href : '';
        });

        if (firstLink) {
          website = firstLink;
          const { data: html } = await axios.get(website, { timeout: 10000 });
          const dom = new JSDOM(html);
          const document = dom.window.document;

          const mailLink = document.querySelector('a[href^="mailto:"]');
          if (mailLink) {
            email = mailLink.href.replace('mailto:', '').trim();
          }

          if (!email) {
            const text = document.body.textContent;
            const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/);
            email = match ? match[0] : '';
          }
        }
      } catch (err) {
        console.log('⚠️ Google fallback failed');
        website = '';
        email = '';
      }
    }

    console.log(email ? `📧 ${email}` : '📧 Not found');
    biz['Website'] = website;
    biz['Email'] = email;
  }

  await browser.close();

  const headers = Object.keys(businesses[0]).map(key => ({ id: key, title: key }));
  const finalWriter = createCsvWriter({ path: finalFile, header: headers });
  await finalWriter.writeRecords(businesses);
  console.log(`✅ Done! Saved final enriched file to ${finalFile}`);

  const step2Writer = createCsvWriter({ path: step2File, header: headers });
  await step2Writer.writeRecords(businesses);
  console.log(`📝 Step 2 copy also saved to ${step2File}`);
})();
