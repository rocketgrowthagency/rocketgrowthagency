const fs = require('fs');
const path = require('path');
const csvParser = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const INPUT_CSV = path.join(__dirname, 'output', 'Step 1', '2025-08-04-Dentists-los-angeles-[step-1].csv');
const OUTPUT_CSV = path.join(__dirname, 'output', 'Step 2', `step-2-email-scraper-test9-output-${Date.now()}.csv`);

const pagesToTry = ['/', '/contact', '/contact-us', '/about', '/about-us'];

function cleanLink(url) {
  if (!url) return '';
  // Remove all occurrences of &quot; anywhere in the string
  url = url.replace(/&quot;/gi, '');
  // Remove trailing HTML entities like &amp; or other &xxx;
  url = url.replace(/&[a-z]+;$/i, '');
  // Remove trailing quotes, commas, brackets, spaces
  url = url.replace(/["'\],\s]+$/g, '');
  // Trim whitespace
  url = url.trim();
  return url;
}

function extractEmailsFromText(text) {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g;
  const matches = text.match(emailRegex);
  return matches ? [...new Set(matches)] : [];
}

async function findSocialLinksOnPage(page) {
  const html = await page.content();

  const facebookRegex = /https?:\/\/(www\.)?facebook\.com\/[^\s"'<>#,]+/gi;
  const instagramRegex = /https?:\/\/(www\.)?instagram\.com\/[^\s"'<>#,]+/gi;

  const facebookMatches = (html.match(facebookRegex) || []).filter(link => link && link !== '#');
  const instagramMatches = (html.match(instagramRegex) || []).filter(link => link && link !== '#');

  return {
    facebook: cleanLink(facebookMatches.length > 0 ? facebookMatches[0] : ''),
    instagram: cleanLink(instagramMatches.length > 0 ? instagramMatches[0] : '')
  };
}

async function scrapeSocialLinksFromMultiplePages(page, baseUrl) {
  for (const p of pagesToTry) {
    const url = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) + p : baseUrl + p;
    try {
      await page.goto(url, { waitUntil: 'networkidle2' });
      const socialLinks = await findSocialLinksOnPage(page);
      if (socialLinks.facebook || socialLinks.instagram) {
        return socialLinks;
      }
    } catch {
      // ignore errors and try next page
      continue;
    }
  }
  return { facebook: '', instagram: '' };
}

async function processCsv() {
  if (!fs.existsSync(INPUT_CSV)) {
    console.error(`Input CSV not found: ${INPUT_CSV}`);
    process.exit(1);
  }

  const records = [];
  const seenWebsites = new Map();

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
      const website = (record.website || record.Website || record['Website'] || '').trim();
      if (!website) {
        record.facebook = '';
        record.instagram = '';
        continue;
      }

      if (seenWebsites.has(website)) {
        const cached = seenWebsites.get(website);
        record.facebook = cached.facebook;
        record.instagram = cached.instagram;
        console.log(`(Cached) Processing (${i + 1}/${records.length}): ${website}`);
        continue;
      }

      console.log(`Processing (${i + 1}/${records.length}): ${website}`);

      const page = await browser.newPage();
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      );
      page.setDefaultNavigationTimeout(20000);

      try {
        const socialLinks = await scrapeSocialLinksFromMultiplePages(page, website);
        console.log(`Found social links: Facebook: ${socialLinks.facebook}, Instagram: ${socialLinks.instagram}`);

        record.facebook = socialLinks.facebook;
        record.instagram = socialLinks.instagram;

        seenWebsites.set(website, socialLinks);

      } catch (err) {
        console.log(`Error processing ${website}: ${err.message}`);
        record.facebook = '';
        record.instagram = '';
      }

      await page.close();
    }

    const headers = Object.keys(records[0]).map(k => ({ id: k, title: k }));
    if (!headers.find(h => h.id === 'facebook')) headers.push({ id: 'facebook', title: 'facebook' });
    if (!headers.find(h => h.id === 'instagram')) headers.push({ id: 'instagram', title: 'instagram' });

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
