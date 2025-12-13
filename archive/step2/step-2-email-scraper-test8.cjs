// step-2-email-scraper-test8.cjs

const fs = require('fs');
const path = require('path');
const csvParser = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const INPUT_CSV = path.join(__dirname, 'output', 'Step 1', '2025-08-04-Dentists-los-angeles-[step-1].csv');
const OUTPUT_CSV = path.join(__dirname, 'output', 'Step 2', `step-2-email-scraper-test8-output-${Date.now()}.csv`);

function extractEmailsFromText(text) {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g;
  const matches = text.match(emailRegex);
  return matches ? [...new Set(matches)] : [];
}

// Updated function: scan entire page HTML for social media URLs
async function findSocialLinksOnPage(page) {
  const html = await page.content();

  const facebookRegex = /https?:\/\/(www\.)?facebook\.com\/[^\s"'<>]+/gi;
  const instagramRegex = /https?:\/\/(www\.)?instagram\.com\/[^\s"'<>]+/gi;

  const facebookMatches = html.match(facebookRegex) || [];
  const instagramMatches = html.match(instagramRegex) || [];

  return {
    facebook: facebookMatches.length > 0 ? facebookMatches[0] : '',
    instagram: instagramMatches.length > 0 ? instagramMatches[0] : ''
  };
}

async function scrapeEmailsFromUrl(page, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle2' });
    const text = await page.evaluate(() => document.body.innerText);
    return extractEmailsFromText(text);
  } catch {
    return [];
  }
}

async function processCsv() {
  if (!fs.existsSync(INPUT_CSV)) {
    console.error(`Input CSV not found: ${INPUT_CSV}`);
    process.exit(1);
  }

  const records = [];
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });

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
      const website = record.website || record.Website || record['Website'] || '';
      if (!website) {
        record.email = '';
        record.facebook = '';
        record.instagram = '';
        continue;
      }

      console.log(`Processing (${i + 1}/${records.length}): ${website}`);
      const page = await browser.newPage();
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      );
      page.setDefaultNavigationTimeout(20000);

      try {
        await page.goto(website, { waitUntil: 'networkidle2' });

        // Extract social links by scanning entire HTML
        const socialLinks = await findSocialLinksOnPage(page);
        console.log(`Found social links: Facebook: ${socialLinks.facebook}, Instagram: ${socialLinks.instagram}`);

        record.facebook = socialLinks.facebook;
        record.instagram = socialLinks.instagram;

        // Optional: scrape emails from homepage content
        // const emails = await scrapeEmailsFromUrl(page, website);
        // record.email = emails.length > 0 ? emails[0] : '';

      } catch (err) {
        console.log(`Error visiting ${website}: ${err.message}`);
        record.facebook = '';
        record.instagram = '';
      }

      await page.close();
    }

    // Prepare CSV headers, add facebook & instagram if missing
    const headers = Object.keys(records[0]).map(k => ({ id: k, title: k }));
    if (!headers.find(h => h.id === 'facebook')) {
      headers.push({ id: 'facebook', title: 'facebook' });
    }
    if (!headers.find(h => h.id === 'instagram')) {
      headers.push({ id: 'instagram', title: 'instagram' });
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
