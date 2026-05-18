import fs from 'fs';
import path from 'path';
import csvParser from 'csv-parser';
import { createObjectCsvWriter } from 'csv-writer';
import axios from 'axios';
import * as cheerio from 'cheerio';

const STEP1_DIR = path.join(process.cwd(), 'output', 'Step 1');
const STEP2_DIR = path.join(process.cwd(), 'output', 'Step 2');

function findLatestStep1Csv() {
  if (!fs.existsSync(STEP1_DIR)) {
    console.error(`Step 1 directory not found: ${STEP1_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(STEP1_DIR)
    .filter((f) => f.toLowerCase().endsWith('.csv') && f.includes('[step-1]'));

  if (!files.length) {
    console.error(`No Step 1 CSV files found in: ${STEP1_DIR}`);
    process.exit(1);
  }

  // Sort by file mtime so the TRUE most-recent scrape wins even when
  // multiple scrapes share the same date prefix (e.g. plumbers + hvac
  // same day — alpha sort would pick plumbers over hvac).
  files.sort((a, b) => {
    const aMtime = fs.statSync(path.join(STEP1_DIR, a)).mtimeMs;
    const bMtime = fs.statSync(path.join(STEP1_DIR, b)).mtimeMs;
    return aMtime - bMtime;
  });
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

// Strip phone-number prefixes that get concatenated into scraped emails when
// source HTML has no space between a tel and a mailto (e.g. on a contact page
// "Tel: (XXX) 351-0978info@biz.com"). The greedy email regex would otherwise
// match "351-0978info@biz.com" as a valid address. Detected pattern: local
// part starts with 3+ digits + optional dashes + 1-4 digits, BEFORE the actual
// alphabetic local-part. Phone-fragment stripped only when alpha chars follow.
//
// 2026-05-18 — locked after the LA Garage Door Repair Wizards bad-email
// incident. See feedback_email_phone_concat_sanitizer.md in memory.
function sanitizeScrapedEmail(raw) {
  if (!raw) return raw;
  // Prefix must contain at least one phone separator (- space . ( ) +) so we
  // don't strip legit digit-only prefixes like "2024marketing@biz.com".
  const m = raw.match(/^[\d.()+\-\s]*[.()+\-\s][\d.()+\-\s]*([a-zA-Z][a-zA-Z0-9._%+-]*@.+)$/);
  if (m) return m[1];
  return raw;
}

function isLikelyEmail(email) {
  if (!email) return '';
  const cleaned = sanitizeScrapedEmail(email.trim());
  const trimmed = cleaned.toLowerCase();
  const basic = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
  if (!basic.test(trimmed)) return '';
  // Reject local parts that look like a US phone fragment (3-4 digits + dash +
  // 4 digits + anything else) — defense in case sanitizeScrapedEmail missed a
  // variant. Keeps legitimate digit-prefixed emails like "2024marketing@biz".
  const localPart = trimmed.split('@')[0];
  if (/^\d{3,4}-\d{4}/.test(localPart)) return '';
  if (trimmed.endsWith('.png') || trimmed.endsWith('.jpg') || trimmed.endsWith('.jpeg')) {
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

  normalized = normalized.replace(/\s*\[\s*at\s*\]|\s*\(\s*at\s*\)\s*/gi, '@');
  normalized = normalized.replace(/\sat\s/gi, '@');

  normalized = normalized.replace(/\s*\[\s*dot\s*\]|\s*\(\s*dot\s*\)\s*/gi, '.');
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
  let linkedin = '';
  let twitter = '';
  let youtube = '';
  let tiktok = '';
  let email = '';

  $('a[href]').each((_, el) => {
    const hrefRaw = $(el).attr('href');
    if (!hrefRaw) return;
    const href = hrefRaw.trim();

    if (!facebook && /facebook\.com\/[^/?#]/i.test(href) && !/facebook\.com\/sharer/i.test(href)) {
      facebook = href;
    }
    if (!instagram && /instagram\.com\/[^/?#]/i.test(href)) {
      instagram = href;
    }
    if (!linkedin && /linkedin\.com\/(company|in|school)\/[^/?#]/i.test(href)) {
      linkedin = href;
    }
    if (!twitter && /(twitter\.com|x\.com)\/[^/?#]/i.test(href) && !/intent\/tweet/i.test(href)) {
      twitter = href;
    }
    if (!youtube && /youtube\.com\/(channel|c|user|@)[^/?#]/i.test(href)) {
      youtube = href;
    }
    if (!tiktok && /tiktok\.com\/@[^/?#]/i.test(href)) {
      tiktok = href;
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
    const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
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

  return { facebook, instagram, linkedin, twitter, youtube, tiktok, email };
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
  const EMPTY = { facebook: '', instagram: '', linkedin: '', twitter: '', youtube: '', tiktok: '', email: '' };
  if (!cleanWebsite) return EMPTY;

  const candidates = [cleanWebsite, ...buildFallbackUrls(cleanWebsite)];
  const seen = new Set();
  const combined = { ...EMPTY };

  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      const response = await axios.get(candidate, { timeout: 10000 });
      const found = extractFromHtml(response.data);
      for (const k of Object.keys(EMPTY)) {
        if (!combined[k] && found[k]) combined[k] = found[k];
      }
      const socials = ['facebook','instagram','linkedin','twitter','youtube','tiktok'].filter(s => found[s]).join(',');
      console.log(`Scanned ${candidate} -> Email: ${found.email || ''}, Socials: ${socials || 'none'}`);
      if (combined.email) break;
    } catch (err) {
      console.log(`Failed to fetch ${candidate}: ${err.message}`);
    }
  }

  return combined;
}

async function processCsv() {
  if (!fs.existsSync(INPUT_CSV)) {
    console.error(`Input CSV file not found: ${INPUT_CSV}`);
    process.exit(1);
  }
  if (!fs.existsSync(STEP2_DIR)) fs.mkdirSync(STEP2_DIR, { recursive: true });

  // Load all records first — avoids the async-in-on('end') race condition
  const records = await new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(INPUT_CSV)
      .pipe(csvParser())
      .on('data', (d) => rows.push(d))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });

  console.log(`Loaded ${records.length} records from CSV.`);

  // Fetch in parallel batches of 5 — reduces total time ~5x vs sequential
  const BATCH = 5;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (record, j) => {
        const websiteRaw = record.website || record.Website || '';
        const website = cleanUrl(websiteRaw);
        console.log(`Processing (${i + j + 1}/${records.length}): ${website || '(no website)'}`);
        const SOCIAL_KEYS = ['email','facebook','instagram','linkedin','twitter','youtube','tiktok'];
        if (!website) {
          for (const k of SOCIAL_KEYS) record[k] = '';
          return;
        }
        let result = { facebook: '', instagram: '', linkedin: '', twitter: '', youtube: '', tiktok: '', email: '' };
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            result = await fetchWebsiteData(website);
            break;
          } catch (e) {
            if (attempt === 0) await new Promise(r => setTimeout(r, 1500));
            else console.warn(`  ⚠️ ${website}: ${e.message}`);
          }
        }
        for (const k of SOCIAL_KEYS) record[k] = result[k] || '';
      })
    );
  }

  let headers = Object.keys(records[0]).map((key) => ({ id: key, title: key }));
  const ensureField = (id) => { if (!headers.find((h) => h.id === id)) headers.push({ id, title: id }); };
  ['email','facebook','instagram','linkedin','twitter','youtube','tiktok'].forEach(ensureField);

  const csvWriter = createObjectCsvWriter({ path: OUTPUT_CSV, header: headers });
  await csvWriter.writeRecords(records);
  console.log(`Done! Output saved to ${OUTPUT_CSV}`);
}

processCsv().catch((err) => {
  console.error('Fatal error in step-2-email-scraper:', err.message || err);
  process.exit(1);
});
