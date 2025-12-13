// step-2-email-scraper-test5.cjs

const fs = require('fs');
const path = require('path');
const csvParser = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const INPUT_CSV = path.join(__dirname, 'output', 'Step 1', '2025-08-04-Dentists-los-angeles-[step-1].csv');
const OUTPUT_CSV = path.join(__dirname, 'output', 'Step 2', `step-2-email-scraper-test5-output-${Date.now()}.csv`);

const basePaths = [
  '',
  '/contact',
  '/contact-us',
  '/contactus',
  '/contacts',
  '/customer-service',
  '/support',
  '/help',
  '/about',
  '/about-us'
];

const pathsToTry = [];
for (const basePath of basePaths) {
  pathsToTry.push(basePath);
  if (basePath) {
    pathsToTry.push(`${basePath}.html`);
    pathsToTry.push(`${basePath}.php`);
  }
}

function extractEmailsFromText(text) {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g;
  const matches = text.match(emailRegex);
  return matches ? [...new Set(matches)] : [];
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchEmailsWithPuppeteer(browser, baseUrl) {
  for (const pathSegment of pathsToTry) {
    let url = baseUrl;
    if (!url.startsWith('http')) url = 'http://' + url;
    if (pathSegment) {
      url = url.endsWith('/') ? url.slice(0, -1) + pathSegment : url + pathSegment;
    }

    try {
      const page = await browser.newPage();

      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      );

      page.setDefaultNavigationTimeout(20000);
      console.log(`Loading ${url}`);
      const response = await page.goto(url, { waitUntil: 'networkidle2' });

      if (!response || response.status() >= 400) {
        console.log(`Failed to load ${url} - Status: ${response ? response.status() : 'no response'}`);
        await page.close();
        continue;
      }

      // Extract JSON-LD emails
      const jsonLDEmails = await page.$$eval('script[type="application/ld+json"]', scripts => {
        let emails = [];
        for (const script of scripts) {
          try {
            const json = JSON.parse(script.textContent);
            const str = JSON.stringify(json);
            const matches = str.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g);
            if (matches) emails = emails.concat(matches);
          } catch {}
        }
        return [...new Set(emails)];
      });

      // Extract emails from visible text
      const visibleText = await page.evaluate(() => document.body.innerText);
      const visibleEmails = extractEmailsFromText(visibleText);

      // Extract emails from HTML source
      const htmlContent = await page.content();
      const htmlEmails = extractEmailsFromText(htmlContent);

      await page.close();

      const allEmails = [...new Set([...jsonLDEmails, ...visibleEmails, ...htmlEmails])];

      if (allEmails.length > 0) {
        console.log(`Found emails on ${url}: ${allEmails.join(', ')}`);
        return allEmails[0];
      } else {
        console.log(`No emails found on ${url}`);
      }

      // Random delay 1.5-4 seconds before next URL to avoid detection
      await delay(1500 + Math.random() * 2500);

    } catch (err) {
      console.log(`Error loading ${url}: ${err.message}`);
    }
  }

  return '';
}

async function processCsv() {
  if (!fs.existsSync(INPUT_CSV)) {
    console.error(`Input CSV not found: ${INPUT_CSV}`);
    process.exit(1);
  }

  const records = [];

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    await new Promise((resolve, reject) => {
      fs.createReadStream(INPUT_CSV)
        .pipe(csvParser({ quote: '"' }))
        .on('data', (data) => records.push(data))
        .on('end', resolve)
        .on('error', reject);
    });

    console.log(`Loaded ${records.length} records from CSV.`);

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const website = record.website || record.Website || record['Website'] || '';
      if (!website) {
        record.email = '';
        continue;
      }
      console.log(`Processing (${i + 1}/${records.length}): ${website}`);
      const email = await fetchEmailsWithPuppeteer(browser, website);
      record.email = email;
    }

    const headers = Object.keys(records[0]).map(key => ({ id: key, title: key }));
    if (!headers.find(h => h.id === 'email')) {
      headers.push({ id: 'email', title: 'email' });
    }

    const csvWriter = createCsvWriter({
      path: OUTPUT_CSV,
      header: headers,
    });

    await csvWriter.writeRecords(records);
    console.log(`Done! Output saved to ${OUTPUT_CSV}`);
  } catch (err) {
    console.error('Fatal error:', err);
  } finally {
    await browser.close();
  }
}

processCsv();
