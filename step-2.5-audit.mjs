// step-2.5-audit.mjs
// Audits each lead's website + GBP page so step-6 voiceover can name real
// observable issues. Outputs JSON keyed by business slug.
//
// Usage:
//   node step-2.5-audit.mjs                          # picks latest Step 2 CSV
//   STEP2_CSV=output/Step\ 2/...csv node step-2.5-audit.mjs

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import csvParser from 'csv-parser';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import slugify from 'slugify';

puppeteer.use(StealthPlugin());

const STEP2_DIR = path.join(process.cwd(), 'output', 'Step 2');
const AUDIT_ROOT = path.join(process.cwd(), 'output', 'Step 2.5 (Audit)');
const STEP2_CSV_OVERRIDE = process.env.STEP2_CSV || '';
const CHROME_PATH =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME_PROFILE_DIR = path.join(process.cwd(), 'output', 'chrome-profile-step3');
const NAV_TIMEOUT = 45000;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function findLatestStep2Csv() {
  if (STEP2_CSV_OVERRIDE) {
    if (!fs.existsSync(STEP2_CSV_OVERRIDE)) throw new Error(`Override CSV not found: ${STEP2_CSV_OVERRIDE}`);
    return { inputPath: STEP2_CSV_OVERRIDE, baseName: path.basename(STEP2_CSV_OVERRIDE, '.csv') };
  }
  const files = fs.readdirSync(STEP2_DIR)
    .filter((f) => f.endsWith('.csv') && f.includes('[step-2]'))
    .map((f) => ({ f, mtime: fs.statSync(path.join(STEP2_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (!files.length) throw new Error('No Step 2 CSV found');
  return {
    inputPath: path.join(STEP2_DIR, files[0].f),
    baseName: path.basename(files[0].f, '.csv'),
  };
}

function loadCsv(inputPath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(inputPath)
      .pipe(csvParser())
      .on('data', (r) => rows.push(r))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

function digitsOnly(s) {
  return String(s || '').replace(/\D+/g, '');
}

function normalizePhone(phone) {
  const d = digitsOnly(phone);
  return d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
}

async function auditWebsite(browser, websiteUrl, business) {
  const findings = {
    websiteUrl,
    pageLoadSeconds: null,
    hasLocalBusinessSchema: false,
    h1Text: '',
    h1IncludesCategory: false,
    h1IncludesCity: false,
    locationsListedCount: 0,
    locationsMatchService: false,
    hasMobileClickToCall: false,
    websitePhoneMatchesGbp: null,
    error: null,
  };

  if (!websiteUrl) return findings;

  let page;
  try {
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    const start = Date.now();
    await page.goto(websiteUrl, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    findings.pageLoadSeconds = Number(((Date.now() - start) / 1000).toFixed(2));

    const data = await page.evaluate(() => {
      const result = {
        schemaTypes: [],
        h1: '',
        bodyText: '',
        phoneNumbers: [],
        clickToCallCount: 0,
      };
      const ldScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      for (const s of ldScripts) {
        try {
          const parsed = JSON.parse(s.textContent || '');
          const flat = Array.isArray(parsed) ? parsed : [parsed];
          for (const item of flat) {
            if (item && item['@type']) {
              const t = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
              result.schemaTypes.push(...t.map(String));
            }
          }
        } catch {}
      }
      const h1 = document.querySelector('h1');
      result.h1 = (h1?.innerText || h1?.textContent || '').trim().slice(0, 300);
      result.bodyText = (document.body?.innerText || '').slice(0, 8000);
      const tels = Array.from(document.querySelectorAll('a[href^="tel:"]'));
      result.clickToCallCount = tels.length;
      result.phoneNumbers = tels.map((a) => a.getAttribute('href').replace(/^tel:/, ''));
      return result;
    });

    findings.hasLocalBusinessSchema = data.schemaTypes.some((t) =>
      /LocalBusiness|HVACBusiness|Plumber|Electrician|Restaurant|Dentist|MedicalBusiness|Store|ProfessionalService/i.test(t)
    );
    findings.h1Text = data.h1;

    let category = String(business.category || '').toLowerCase().trim();
    if (!category && business.searchTerm) {
      const m = String(business.searchTerm).toLowerCase().match(/^([a-z\s]+?)(?:\s+in\s+|\s+near\s+|$)/);
      if (m) category = m[1].trim();
    }
    const city = String(business.city || '').toLowerCase();
    const h1Lower = data.h1.toLowerCase();
    const catFirstWord = category ? category.split(/\s+/)[0] : '';
    findings.h1IncludesCategory = !!(catFirstWord && h1Lower.includes(catFirstWord));
    findings.h1IncludesCity = !!(city && h1Lower.includes(city));

    const bodyLower = data.bodyText.toLowerCase();
    const knownNeighbors = (business.knownNeighbors || []).map((c) => c.toLowerCase());
    let count = 0;
    for (const c of knownNeighbors) {
      if (bodyLower.includes(c)) count += 1;
    }
    findings.locationsListedCount = count;
    findings.locationsMatchService = count >= 2;
    findings.hasMobileClickToCall = data.clickToCallCount > 0;

    if (business.phone) {
      const gbpPhone = normalizePhone(business.phone);
      const sitePhones = data.phoneNumbers.map(normalizePhone);
      findings.websitePhoneMatchesGbp = sitePhones.some((p) => p === gbpPhone);
    }
  } catch (err) {
    findings.error = err.message || String(err);
  } finally {
    if (page) await page.close().catch(() => {});
  }
  return findings;
}

async function auditMobile(browser, websiteUrl, business) {
  const findings = {
    pageLoadSeconds: null,
    hasViewportMeta: false,
    clickToCallAboveFold: false,
    primaryCtaTapTargetPx: null,
    requiredFormFieldCount: null,
    pageWeightKb: null,
    error: null,
  };

  if (!websiteUrl) return findings;

  let page;
  try {
    page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
        '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    );

    let totalBytes = 0;
    page.on('response', async (res) => {
      try {
        const buf = await res.buffer();
        totalBytes += buf.length;
      } catch {}
    });

    const start = Date.now();
    await page.goto(websiteUrl, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    findings.pageLoadSeconds = Number(((Date.now() - start) / 1000).toFixed(2));

    const data = await page.evaluate(() => {
      const result = {
        hasViewportMeta: false,
        viewportContent: '',
        clickToCallAboveFold: false,
        primaryCtaPx: null,
        requiredFieldCount: null,
      };

      const vp = document.querySelector('meta[name="viewport"]');
      if (vp) {
        result.hasViewportMeta = true;
        result.viewportContent = vp.getAttribute('content') || '';
      }

      const foldHeight = window.innerHeight;
      const tels = Array.from(document.querySelectorAll('a[href^="tel:"]'));
      for (const a of tels) {
        const r = a.getBoundingClientRect();
        if (r.top >= 0 && r.top < foldHeight && r.width > 0 && r.height > 0) {
          result.clickToCallAboveFold = true;
          break;
        }
      }

      const ctaCandidates = Array.from(
        document.querySelectorAll(
          'a[class*="cta" i], a[class*="button" i], a[class*="btn" i], button, a[href*="contact"], a[href*="quote"], a[href*="schedule"]'
        )
      );
      let smallestVisibleH = null;
      for (const el of ctaCandidates) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && r.top >= 0 && r.top < foldHeight) {
          if (smallestVisibleH === null || r.height < smallestVisibleH) {
            smallestVisibleH = r.height;
          }
        }
      }
      result.primaryCtaPx = smallestVisibleH != null ? Math.round(smallestVisibleH) : null;

      const forms = Array.from(document.querySelectorAll('form'));
      let totalRequired = null;
      for (const f of forms) {
        const required = f.querySelectorAll('input[required], textarea[required], select[required]');
        if (required.length) {
          if (totalRequired === null || required.length < totalRequired) {
            totalRequired = required.length;
          }
        }
      }
      if (totalRequired === null) {
        const anyForm = forms.find((f) => f.querySelectorAll('input, textarea, select').length > 0);
        if (anyForm) {
          totalRequired = anyForm.querySelectorAll('input, textarea, select').length;
        }
      }
      result.requiredFieldCount = totalRequired;

      return result;
    });

    findings.hasViewportMeta = data.hasViewportMeta;
    findings.clickToCallAboveFold = data.clickToCallAboveFold;
    findings.primaryCtaTapTargetPx = data.primaryCtaPx;
    findings.requiredFormFieldCount = data.requiredFieldCount;
    findings.pageWeightKb = Math.round(totalBytes / 1024);
  } catch (err) {
    findings.error = err.message || String(err);
  } finally {
    if (page) await page.close().catch(() => {});
  }
  return findings;
}

async function auditGbp(browser, gbpUrl, business) {
  const findings = {
    gbpUrl,
    categoriesCount: null,
    primaryCategory: null,
    reviewCount: null,
    photoCount: null,
    daysSinceLastReview: null,
    error: null,
  };
  if (!gbpUrl) return findings;

  let page;
  try {
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );
    await page.goto(gbpUrl, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    await new Promise((r) => setTimeout(r, 6000));

    // Try to dismiss the Google consent dialog if present
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const accept = buttons.find((b) => /accept all|reject all|i agree/i.test(b.textContent || ''));
      if (accept) accept.click();
    }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1500));

    const data = await page.evaluate(() => {
      const txt = document.body?.innerText || '';

      // Review count: e.g. "(234)" near rating, or "234 reviews"
      const reviewMatch =
        txt.match(/\(([\d,]{1,7})\)/) || txt.match(/([\d,]{1,7})\s+(?:Google\s+)?reviews?/i);
      const reviewCount = reviewMatch ? Number(reviewMatch[1].replace(/,/g, '')) : null;

      // Photo count: only single photos number e.g. "1,247 photos"
      const photoMatch = txt.match(/([\d,]{1,7})\s+photos?\b/i);
      const photoCount = photoMatch ? Number(photoMatch[1].replace(/,/g, '')) : null;

      // Recent review: scan first 12 occurrences of "X <unit> ago"
      const recencyMatches = [...txt.matchAll(/(\d+)\s+(day|week|month|year)s?\s+ago/gi)].slice(0, 12);
      let minDays = null;
      for (const m of recencyMatches) {
        const n = Number(m[1]);
        const u = m[2].toLowerCase();
        const mult = u === 'day' ? 1 : u === 'week' ? 7 : u === 'month' ? 30 : 365;
        const days = n * mult;
        if (minDays === null || days < minDays) minDays = days;
      }

      // Category: look for the primary category badge, often near the rating
      // Heuristic: take the first short text-only button/link that matches common cat patterns
      const catCandidates = Array.from(
        document.querySelectorAll('button, span[jsaction]')
      )
        .map((el) => (el.textContent || '').trim())
        .filter((t) => t && t.length > 3 && t.length < 40 && !/^\d/.test(t));
      const categoryRegex = /\b(contractor|service|repair|company|business|plumber|plumbing|hvac|electrician|dentist|restaurant|store|shop|salon|attorney|lawyer|agency|cleaner|cleaning|consultant|specialist|installer|installation|roofing|landscaping|moving|pest)\b/i;
      const primaryCategory = catCandidates.find((t) => categoryRegex.test(t)) || null;

      // Categories count: rough — count distinct category-looking strings in first 1500 chars
      const catSnippet = txt.slice(0, 2000);
      const distinctCats = new Set();
      for (const m of catSnippet.matchAll(/\b\w+(?:\s+\w+){0,2}\s+(?:contractor|service|repair|company|plumber|plumbing|hvac|electrician|cleaner|specialist|installer|installation|roofing|landscaping|moving|pest)\b/gi)) {
        distinctCats.add(m[0].toLowerCase().trim());
      }
      const categoriesCount = distinctCats.size > 0 ? distinctCats.size : null;

      return { reviewCount, photoCount, minDays, primaryCategory, categoriesCount };
    });

    findings.reviewCount = data.reviewCount;
    findings.photoCount = data.photoCount;
    findings.daysSinceLastReview = data.minDays;
    findings.primaryCategory = data.primaryCategory;
    findings.categoriesCount = data.categoriesCount;
  } catch (err) {
    findings.error = err.message || String(err);
  } finally {
    if (page) await page.close().catch(() => {});
  }
  return findings;
}

async function main() {
  const { inputPath, baseName } = findLatestStep2Csv();
  const rows = await loadCsv(inputPath);
  console.log(`Loaded ${rows.length} rows from ${path.basename(inputPath)}`);

  ensureDir(AUDIT_ROOT);
  const outDir = path.join(AUDIT_ROOT, baseName);
  ensureDir(outDir);
  const outFile = path.join(outDir, 'audit-findings.json');

  const knownNeighbors = Array.from(
    new Set(rows.map((r) => String(r.City || '').trim()).filter(Boolean))
  );

  const visible = process.env.AUDIT_VISIBLE === '1' || process.env.AUDIT_VISIBLE === 'true';
  const browser = await puppeteer.launch({
    headless: !visible,
    executablePath: CHROME_PATH,
    userDataDir: CHROME_PROFILE_DIR + '-audit',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  const audits = {};
  try {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const name = row['Business Name'] || row.name;
      const slug = slugify(name || `business-${i + 1}`, { lower: true, strict: true });
      const website = row.Website || row.website || '';
      const gbpUrl = row['Google Maps URL'] || '';
      const business = {
        name,
        category: row['Detected Category'] || row.category,
        city: row.City,
        phone: row.Phone,
        searchTerm: row['Search Term'],
        knownNeighbors,
      };

      console.log(`\n[${i + 1}/${rows.length}] Auditing: ${name}`);
      const websiteFindings = await auditWebsite(browser, website, business);
      console.log(`  website: load=${websiteFindings.pageLoadSeconds}s schema=${websiteFindings.hasLocalBusinessSchema} h1cat=${websiteFindings.h1IncludesCategory} h1city=${websiteFindings.h1IncludesCity} locs=${websiteFindings.locationsListedCount} c2c=${websiteFindings.hasMobileClickToCall} napMatch=${websiteFindings.websitePhoneMatchesGbp}`);

      const mobileFindings = await auditMobile(browser, website, business);
      console.log(`  mobile:  load=${mobileFindings.pageLoadSeconds}s viewport=${mobileFindings.hasViewportMeta} c2cAboveFold=${mobileFindings.clickToCallAboveFold} ctaPx=${mobileFindings.primaryCtaTapTargetPx} reqFields=${mobileFindings.requiredFormFieldCount} weightKb=${mobileFindings.pageWeightKb}`);

      const gbpFindings = await auditGbp(browser, gbpUrl, business);
      console.log(`  gbp:     photos=${gbpFindings.photoCount} daysSinceReview=${gbpFindings.daysSinceLastReview}`);

      audits[slug] = {
        businessName: name,
        rank: row['Map Rank'],
        rating: row.Rating,
        reviews: row.Reviews,
        category: row['Detected Category'],
        city: row.City,
        searchTerm: row['Search Term'],
        website: websiteFindings,
        mobile: mobileFindings,
        gbp: gbpFindings,
      };
    }
  } finally {
    await browser.close().catch(() => {});
  }

  fs.writeFileSync(outFile, JSON.stringify(audits, null, 2));
  console.log(`\n✅ Wrote audit findings: ${outFile}`);
}

main().catch((err) => {
  console.error('Fatal in step-2.5-audit:', err);
  process.exit(1);
});
