import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { parse } from 'csv-parse/sync';

const INPUT_DIR = './output/Step 1/';
const OUTPUT_DIR = './output/Final/';

function getLatestCsvFile(dir) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.csv'));
  if (files.length === 0) throw new Error(`No CSV files found in ${dir}`);
  files.sort((a, b) => {
    const aTime = fs.statSync(path.join(dir, a)).mtime.getTime();
    const bTime = fs.statSync(path.join(dir, b)).mtime.getTime();
    return bTime - aTime;
  });
  return path.join(dir, files[0]);
}

async function extractEmailWithPuppeteer(url, browser) {
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

    // Extract visible emails from page text content
    const pageText = await page.evaluate(() => document.body.innerText);
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g;
    const emails = pageText.match(emailRegex);
    await page.close();

    if (emails && emails.length > 0) {
      return emails[0]; // return first found email
    }
    return null;
  } catch (err) {
    return null;
  }
}

async function main() {
  try {
    const inputFile = getLatestCsvFile(INPUT_DIR);
    console.log(`[${new Date().toLocaleTimeString()}] Reading CSV: ${inputFile}`);

    const csvContent = fs.readFileSync(inputFile, 'utf8');

    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
    });

    console.log(`[${new Date().toLocaleTimeString()}] Loaded ${records.length} valid businesses...`);

    const browser = await puppeteer.launch({ headless: true });

    for (const record of records) {
      const websiteRaw = record.Website || '';
      const website = websiteRaw.trim();
      if (!website) {
        record.email = '';
        continue;
      }

      process.stdout.write(`🔗 ${website} → `);
      const email = await extractEmailWithPuppeteer(website, browser);

      if (email) {
        console.log(`📧 ${email}`);
        record.email = email;
      } else {
        console.log('📧 Not found');
        record.email = '';
      }
    }

    await browser.close();

    // Prepare CSV output
    const headers = Object.keys(records[0]);
    const outputCsv = [
      headers.join(','),
      ...records.map(r =>
        headers.map(h => `"${(r[h] || '').toString().replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const timestamp = new Date().toISOString().slice(0, 10);
    const outputFile = path.join(OUTPUT_DIR, `${timestamp}-output-[FINAL].csv`);
    fs.writeFileSync(outputFile, outputCsv, 'utf8');

    console.log(`[${new Date().toLocaleTimeString()}] ✅ Done! Saved final enriched file to ${outputFile}`);

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

main();
