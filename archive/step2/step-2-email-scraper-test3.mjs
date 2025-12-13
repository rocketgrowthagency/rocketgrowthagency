// step-2-email-scraper-test3.cjs

import fs from 'fs';
import path from 'path';
import csvParser from 'csv-parser';
import { createObjectCsvWriter } from 'csv-writer';
import puppeteer from 'puppeteer';

const INPUT_CSV = path.join(process.cwd(), 'output', 'Step 1', '2025-08-04-Dentists-los-angeles-[step-1].csv');
const OUTPUT_CSV = path.join(process.cwd(), 'output', 'Step 2', `step-2-email-scraper-test3-output-${Date.now()}.csv`);

const pathsToTry = [
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

function extractEmailsFromText(text) {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g;
  const matches = text.match(emailRegex);
  return matches ? [...new Set(matches)] : [];
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
      page.setDefaultNavigationTimeout(15000);
      console.log(`Loading ${url}`);
      const response = await page.goto(url, { waitUntil: 'networkidle2' });
      if (!response || response.status() >= 400) {
        console.log(`Failed to load ${url} - Status: ${response ? response.status() : 'no response'}`);
        await page.close();
        continue;
      }

      // Extract page content
      const pageContent = await page.content();

      // Extract JSON-LD structured data emails if any
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

      // Extract emails from full HTML
      const htmlEmails = extractEmailsFromText(pageContent);

      await page.close();

      // Combine all found emails, deduplicate
      const allEmails = [...new Set([...jsonLDEmails, ...visibleEmails, ...htmlEmails])];

      if (allEmails.length > 0) {
        console.log(`Found emails on ${url}: ${allEmails.join(', ')}`);
        return allEmails[0]; // Return first email found
      } else {
        console.log(`No emails found on ${url}`);
      }
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
  const csvWriter = createObjectCsvWriter({
    path: OUTPUT_CSV,
    header: [], // Will be set later dynamically
  });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    await new Promise((resolve, reject) => {
      fs.createReadStream(INPUT_CSV)
        .pipe(csvParser({ quote: '"' }))
        .on('data', (data) => {
          records.push(data);
        })
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

    // Setup CSV headers dynamically based on first record keys + email
    const headers = Object.keys(records[0]).map((key) => ({ id: key, title: key }));
    if (!headers.find(h => h.id === 'email')) {
      headers.push({ id: 'email', title: 'email' });
    }

    // Update csvWriter with correct headers
    csvWriter.header = headers;

    await csvWriter.writeRecords(records);
    console.log(`Done! Output saved to ${OUTPUT_CSV}`);
  } catch (err) {
    console.error('Fatal error:', err);
  } finally {
    await browser.close();
  }
}

processCsv();
