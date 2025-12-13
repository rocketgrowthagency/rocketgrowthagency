// step-2-email-scraper-test2.cjs

const fs = require('fs');
const path = require('path');
const csvParser = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const axios = require('axios');

const INPUT_CSV = path.join(__dirname, 'output', 'Step 1', '2025-08-04-Dentists-los-angeles-[step-1].csv');

const OUTPUT_CSV = path.join(
  __dirname,
  'output',
  'Step 2',
  `step-2-email-scraper-test2-output-${Date.now()}.csv`
);

async function fetchEmailsFromUrls(baseUrl) {
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

  for (const pathSegment of pathsToTry) {
    let url;  // Declare here for catch block

    try {
      url = baseUrl;
      if (!url.startsWith('http')) url = 'http://' + url;
      if (pathSegment) {
        url = url.endsWith('/') ? url.slice(0, -1) + pathSegment : url + pathSegment;
      }
      console.log(`Fetching: ${url}`);
      const response = await axios.get(url, { timeout: 10000 });
      const emails = extractEmailsFromHtml(response.data);
      if (emails.length > 0) {
        console.log(`Found emails: ${emails.join(', ')}`);
        return emails[0]; // Return first found email
      } else {
        console.log('No emails found on this page.');
      }
    } catch (err) {
      console.log(`Failed to fetch ${url}: ${err.message}`);
      continue;
    }
  }
  return '';
}

function extractEmailsFromHtml(html) {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g;
  const matches = html.match(emailRegex);
  if (!matches) return [];
  return [...new Set(matches)];
}

async function processCsv() {
  if (!fs.existsSync(INPUT_CSV)) {
    console.error(`Input CSV file not found: ${INPUT_CSV}`);
    process.exit(1);
  }

  const records = [];
  fs.createReadStream(INPUT_CSV)
    .pipe(csvParser({ quote: '"' }))
    .on('data', (data) => {
      console.log('Parsed record:', data);
      records.push(data);
    })
    .on('end', async () => {
      console.log(`Read ${records.length} records from input CSV.`);

      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const website = record.website || record.Website || record['Website'] || '';
        if (!website) {
          record.email = ''; // No website to check
          continue;
        }
        console.log(`Processing (${i + 1}/${records.length}): ${website}`);
        const email = await fetchEmailsFromUrls(website);
        record.email = email;
      }

      const headers = Object.keys(records[0]).map((key) => ({ id: key, title: key }));
      if (!headers.find((h) => h.id === 'email')) {
        headers.push({ id: 'email', title: 'email' });
      }

      const csvWriter = createCsvWriter({
        path: OUTPUT_CSV,
        header: headers,
      });

      await csvWriter.writeRecords(records);
      console.log(`Finished! Output saved to ${OUTPUT_CSV}`);
    });
}

processCsv().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
