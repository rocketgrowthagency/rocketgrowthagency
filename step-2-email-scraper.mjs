import fs from 'fs';
import path from 'path';
import csvParser from 'csv-parser';
import { createObjectCsvWriter } from 'csv-writer';
import axios from 'axios';
import * as cheerio from 'cheerio';

const STEP1_DIR = path.join(process.cwd(), 'output', 'Step 1 (Maps Scraper)');
const STEP2_DIR = path.join(process.cwd(), 'output', 'Step 2 (Email Scraper)');

function findLatestStep1Csv() {
  if (!fs.existsSync(STEP1_DIR)) {
    console.error(`Step 1 directory not found: ${STEP1_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(STEP1_DIR)
    .filter(
      f =>
        f.toLowerCase().endsWith('.csv') &&
        f.includes('[step-1]')
    );

  if (!files.length) {
    console.error(`No Step 1 CSV files found in: ${STEP1_DIR}`);
    process.exit(1);
  }

  files.sort();
  const latest = files[files.length - 1];
  const inputPath = path.join(STEP1_DIR, latest);
  const step2BaseName = latest.replace('[step-1]', '[step-2]');
  const outputPath = path.join(STEP2_DIR, step2BaseName);

  console.log(`Using Step 1 CSV: ${inputPath}`);
  console.log(`Will write Step 2 CSV: ${outputPath}`);

  return { inputPath, outputPath };
}

const { inputPath: INPUT_CSV, outputPath: OUTPUT_CSV } = findLatestStep1Csv();

function cleanUrl(url) {
  if (!url) return '';
  const trimmed = url.trim().replace(/^"|"$/g, '');
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (
    lower === 'nan' ||
    lower === 'undefined' ||
    lower === 'null' ||
    lower === '#ref!' ||
    lower === '#n/a'
  ) {
    return '';
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (/^mailto:/i.test(trimmed) || /^tel:/i.test(trimmed)) {
    return '';
  }
  if (/^www\./i.test(trimmed) || /^[a-z0-9.-]+\.[a-z]{2,}/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return '';
}

function isLikelyEmail(email) {
  if (!email) return '';
  const trimmed = email.trim().toLowerCase();
  const basic = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
  if (!basic.test(trimmed)) return '';
  if (
    trimmed.endsWith('.png') ||
    trimmed.endsWith('.jpg') ||
    trimmed.endsWith('.jpeg')
  ) {
    return '';
  }
  return trimmed;
}

function extractEmailFromJsonLd($) {
  let email = '';

  function findEmailInObject(obj) {
    if (!obj || email) return;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (email) break;
        findEmailInObject(item);
      }
      return;
    }
    if (typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        if (email) break;
        if (typeof value === 'string' && key.toLowerCase() === 'email') {
          const maybe = isLikelyEmail(value);
          if (maybe) {
            email = maybe;
            break;
          }
        }
        if (value && (typeof value === 'object' || Array.isArray(value))) {
          findEmailInObject(value);
        }
      }
    }
  }

  $('script[type="application/ld+json"]').each((_, el) => {
    if (email) return;
    const raw = $(el).contents().text() || $(el).text();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      findEmailInObject(parsed);
    } catch {
      return;
    }
  });

  return email;
}

function extractObfuscatedEmailFromText(text) {
  if (!text) return '';
  let normalized = text;

  normalized = normalized.replace(
    /\s*\[\s*at\s*\]|\s*\(\s*at\s*\)\s*/gi,
    '@'
  );
  normalized = normalized.replace(/\sat\s/gi, '@');

  normalized = normalized.replace(
    /\s*\[\s*dot\s*\]|\s*\(\s*dot\s*\)\s*/gi,
    '.'
  );
  normalized = normalized.replace(/\sdot\s/gi, '.');

  const match = normalized.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (match) {
    const valid = isLikelyEmail(match[0]);
    if (valid) return valid;
  }
  return '';
}

function extractFromHtml(html) {
  const $ = cheerio.load(html);
  let facebook = '';
  let instagram = '';
  let email = '';

  $('a[href]').each((_, el) => {
    if (facebook && instagram && email) return;
    const hrefRaw = $(el).attr('href');
    if (!hrefRaw) return;
    const href = hrefRaw.trim();

    if (!facebook && /facebook\.com/i.test(href)) {
      facebook = href;
    }

    if (!instagram && /instagram\.com/i.test(href)) {
      instagram = href;
    }

    if (!email && href.toLowerCase().startsWith('mailto:')) {
      const mail = href.replace(/^mailto:/i, '').split('?')[0];
      const valid = isLikelyEmail(mail);
      if (valid) email = valid;
    }
  });

  if (!email) {
    const jsonLdEmail = extractEmailFromJsonLd($);
    if (jsonLdEmail) {
      email = jsonLdEmail;
    }
  }

  if (!email) {
    const text = $.root().text();
    const match = text.match(
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
    );
    if (match) {
      const valid = isLikelyEmail(match[0]);
      if (valid) {
        email = valid;
      }
    }
    if (!email) {
      const obfuscated = extractObfuscatedEmailFromText(text);
      if (obfuscated) {
        email = obfuscated;
      }
    }
  }

  return { facebook, instagram, email };
}

function buildFallbackUrls(baseUrl) {
  const urls = [];
  const clean = cleanUrl(baseUrl);
  if (!clean) return urls;
  try {
    const u = new URL(clean);
    const origin = u.origin.replace(/\/+$/, '');
    const paths = ['contact', 'contact-us', 'about'];
    for (const p of paths) {
      urls.push(`${origin}/${p}`);
    }
  } catch {
    return [];
  }
  return urls;
}

async function fetchWebsiteData(url) {
  const cleanWebsite = cleanUrl(url);
  if (!cleanWebsite) return { facebook: '', instagram: '', email: '' };

  const candidates = [cleanWebsite, ...buildFallbackUrls(cleanWebsite)];
  const seen = new Set();
  let facebookCombined = '';
  let instagramCombined = '';
  let emailFound = '';

  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      const response = await axios.get(candidate, { timeout: 10000 });
      const { facebook, instagram, email } = extractFromHtml(response.data);
      if (!facebookCombined && facebook) {
        facebookCombined = facebook;
      }
      if (!instagramCombined && instagram) {
        instagramCombined = instagram;
      }
      if (!emailFound && email) {
        emailFound = email;
      }
      console.log(
        `Scanned ${candidate} -> Email: ${email || ''}, Facebook: ${
          facebook || ''
        }, Instagram: ${instagram || ''}`
      );
      if (emailFound) {
        break;
      }
    } catch (err) {
      console.log(`Failed to fetch ${candidate}: ${err.message}`);
    }
  }

  return {
    facebook: facebookCombined,
    instagram: instagramCombined,
    email: emailFound
  };
}

async function processCsv() {
  if (!fs.existsSync(INPUT_CSV)) {
    console.error(`Input CSV file not found: ${INPUT_CSV}`);
    process.exit(1);
  }

  if (!fs.existsSync(STEP2_DIR)) {
    fs.mkdirSync(STEP2_DIR, { recursive: true });
  }

  const records = [];

  fs.createReadStream(INPUT_CSV)
    .pipe(csvParser())
    .on('data', data => {
      records.push(data);
    })
    .on('end', async () => {
      console.log(`Loaded ${records.length} records from CSV.`);

      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const websiteRaw =
          record.website || record.Website || record['Website'] || '';
        const website = cleanUrl(websiteRaw);
        console.log(`Processing (${i + 1}/${records.length}): ${website}`);

        if (!website) {
          record.email = '';
          record.facebook = '';
          record.instagram = '';
          continue;
        }

        const { facebook, instagram, email } = await fetchWebsiteData(website);
        record.email = email;
        record.facebook = facebook;
        record.instagram = instagram;
      }

      let headers = Object.keys(records[0]).map(key => ({
        id: key,
        title: key
      }));

      if (!headers.find(h => h.id === 'email')) {
        headers.push({ id: 'email', title: 'email' });
      }
      if (!headers.find(h => h.id === 'facebook')) {
        headers.push({ id: 'facebook', title: 'facebook' });
      }
      if (!headers.find(h => h.id === 'instagram')) {
        headers.push({ id: 'instagram', title: 'instagram' });
      }

      const csvWriter = createObjectCsvWriter({
        path: OUTPUT_CSV,
        header: headers
      });

      await csvWriter.writeRecords(records);
      console.log(`Done! Output saved to ${OUTPUT_CSV}`);
    });
}

processCsv();
