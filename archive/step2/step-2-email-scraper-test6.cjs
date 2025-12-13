// step-2-email-scraper-test6.cjs

const fs = require('fs');
const path = require('path');
const csvParser = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const urlLib = require('url');

puppeteer.use(StealthPlugin());

const INPUT_CSV = path.join(__dirname, 'output', 'Step 1', '2025-08-04-Dentists-los-angeles-[step-1].csv');
const OUTPUT_CSV = path.join(__dirname, 'output', 'Step 2', `step-2-email-scraper-test6-output-${Date.now()}.csv`);

function extractEmailsFromText(text) {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g;
  const matches = text.match(emailRegex);
  return matches ? [...new Set(matches)] : [];
}

async function getLinksFromPage(page) {
  // Extract links only from header and footer elements
  return page.evaluate(() => {
    const links = new Set();
    const selectors = ['header a[href]', 'footer a[href]'];
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(a => {
        const href = a.getAttribute('href');
        if (href) links.add(href.trim());
      });
    });
    return Array.from(links);
  });
}

async function fetchEmailsFromUrl(page, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });

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

    // Extract visible text emails
    const visibleText = await page.evaluate(() => document.body.innerText);
    const visibleEmails = extractEmailsFromText(visibleText);

    // Extract emails from full HTML
    const htmlContent = await page.content();
    const htmlEmails = extractEmailsFromText(htmlContent);

    const allEmails = [...new Set([...jsonLDEmails, ...visibleEmails, ...htmlEmails])];
    return allEmails.length > 0 ? allEmails : [];
  } catch (err) {
    console.log(`Failed to fetch emails from ${url}: ${err.message}`);
    return [];
  }
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

      const page = await browser.newPage();
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      );
      page.setDefaultNavigationTimeout(20000);

      try {
        const response = await page.goto(website, { waitUntil: 'networkidle2' });
        if (!response || response.status() >= 400) {
          console.log(`Failed to load homepage ${website} - Status: ${response ? response.status() : 'no response'}`);
          record.email = '';
          await page.close();
          continue;
        }

        // First try homepage emails
        let emails = await fetchEmailsFromUrl(page, website);
        if (emails.length > 0) {
          record.email = emails[0];
          console.log(`Found emails on homepage: ${emails.join(', ')}`);
          await page.close();
          continue;
        }

        // Extract header and footer links
        let links = await getLinksFromPage(page);
        await page.close();

        // Normalize links to full URLs, filter same domain only, unique
        const domain = (new URL(website)).origin;
        links = links
          .map(link => {
            try {
              return new URL(link, domain).href;
            } catch {
              return null;
            }
          })
          .filter(link => link && link.startsWith(domain));

        const visited = new Set();

        let foundEmail = '';

        for (const linkUrl of links) {
          if (visited.has(linkUrl)) continue;
          visited.add(linkUrl);

          const linkPage = await browser.newPage();
          await linkPage.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
          );
          linkPage.setDefaultNavigationTimeout(20000);

          try {
            const resp = await linkPage.goto(linkUrl, { waitUntil: 'networkidle2' });
            if (!resp || resp.status() >= 400) {
              console.log(`Failed to load ${linkUrl} - Status: ${resp ? resp.status() : 'no response'}`);
              await linkPage.close();
              continue;
            }

            const linkEmails = await fetchEmailsFromUrl(linkPage, linkUrl);
            if (linkEmails.length > 0) {
              foundEmail = linkEmails[0];
              console.log(`Found emails on ${linkUrl}: ${linkEmails.join(', ')}`);
              await linkPage.close();
              break;
            }
          } catch (err) {
            console.log(`Error loading ${linkUrl}: ${err.message}`);
          }

          await linkPage.close();
        }

        record.email = foundEmail || '';
        if (!foundEmail) console.log(`No emails found on any header/footer links for ${website}`);

      } catch (err) {
        console.log(`Error processing ${website}: ${err.message}`);
        record.email = '';
        await page.close();
      }
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
