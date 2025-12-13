// step-2-email-scraper-test7.cjs

const fs = require('fs');
const path = require('path');
const csvParser = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const INPUT_CSV = path.join(__dirname, 'output', 'Step 1', '2025-08-04-Dentists-los-angeles-[step-1].csv');
const OUTPUT_CSV = path.join(__dirname, 'output', 'Step 2', `step-2-email-scraper-test7-output-${Date.now()}.csv`);

const SEARCH_QUERIES = [
  'site:{domain} email',
  'site:{domain} contact',
  'site:{domain} "@{domain}"',
];

function extractEmailsFromText(text) {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g;
  const matches = text.match(emailRegex);
  return matches ? [...new Set(matches)] : [];
}

async function googleSearchEmails(browser, domain) {
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
  );
  page.setDefaultNavigationTimeout(30000);

  for (const queryTemplate of SEARCH_QUERIES) {
    const query = queryTemplate.replace(/{domain}/g, domain);
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    console.log(`Google searching: ${query}`);

    try {
      await page.goto(searchUrl, { waitUntil: 'networkidle2' });

      // Extract emails from snippets & titles & descriptions
      const emailsFromResults = await page.evaluate(() => {
        const texts = [];
        // Select titles and snippets
        document.querySelectorAll('div.g').forEach(el => {
          texts.push(el.innerText);
        });
        return texts.join('\n');
      }).then(extractEmailsFromText);

      if (emailsFromResults.length > 0) {
        console.log(`Found emails in Google results: ${emailsFromResults.join(', ')}`);
        await page.close();
        return emailsFromResults[0]; // Return first email found
      }

      // If none found, try clicking first 2 result links to find emails on linked pages
      const resultLinks = await page.$$eval('div.g a[href]', links =>
        links.map(a => a.href).filter(href => href.startsWith('http')).slice(0, 2)
      );

      for (const link of resultLinks) {
        try {
          const linkedPage = await browser.newPage();
          await linkedPage.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
          );
          linkedPage.setDefaultNavigationTimeout(20000);
          await linkedPage.goto(link, { waitUntil: 'networkidle2' });
          const pageContent = await linkedPage.content();
          const emails = extractEmailsFromText(pageContent);
          await linkedPage.close();
          if (emails.length > 0) {
            console.log(`Found emails on linked page ${link}: ${emails.join(', ')}`);
            await page.close();
            return emails[0];
          }
        } catch (err) {
          console.log(`Error visiting Google result link ${link}: ${err.message}`);
        }
      }

    } catch (err) {
      console.log(`Error during Google search "${query}": ${err.message}`);
    }
  }
  await page.close();
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
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    await new Promise((resolve, reject) => {
      fs.createReadStream(INPUT_CSV)
        .pipe(csvParser({ quote: '"' }))
        .on('data', data => records.push(data))
        .on('end', resolve)
        .on('error', reject);
    });

    console.log(`Loaded ${records.length} records from CSV.`);

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      let website = record.website || record.Website || record['Website'] || '';
      if (!website) {
        record.email = '';
        continue;
      }

      // Extract domain from website
      try {
        const urlObj = new URL(website);
        const domain = urlObj.hostname;

        console.log(`Processing (${i + 1}/${records.length}): ${website} (domain: ${domain})`);
        const email = await googleSearchEmails(browser, domain);
        record.email = email;
      } catch {
        console.log(`Invalid URL: ${website}`);
        record.email = '';
      }
    }

    const headers = Object.keys(records[0]).map(k => ({ id: k, title: k }));
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
