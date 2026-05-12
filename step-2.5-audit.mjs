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
    h1Count: 0,
    h1IncludesCategory: false,
    h1IncludesCity: false,
    hasMobileClickToCall: false,
    websitePhoneMatchesGbp: null,
    hasMetaDescription: false,
    renderBlockingHeadResources: 0,
    imagesWithoutLazy: 0,
    isHttps: false,
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
        h1Count: 0,
        phoneNumbers: [],
        clickToCallCount: 0,
        hasMetaDescription: false,
        renderBlockingHeadResources: 0,
        imagesWithoutLazy: 0,
        isHttps: location.protocol === 'https:',
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
      const h1s = document.querySelectorAll('h1');
      result.h1Count = h1s.length;
      const h1 = h1s[0];
      result.h1 = (h1?.innerText || h1?.textContent || '').trim().slice(0, 300);
      const tels = Array.from(document.querySelectorAll('a[href^="tel:"]'));
      result.clickToCallCount = tels.length;
      result.phoneNumbers = tels.map((a) => a.getAttribute('href').replace(/^tel:/, ''));

      // Meta description
      const md = document.querySelector('meta[name="description"]');
      result.hasMetaDescription = !!(md && (md.getAttribute('content') || '').trim().length > 10);

      // Render-blocking resources in <head> (exclude print/conditional media + async patterns)
      const headLinks = Array.from(document.head.querySelectorAll('link[rel="stylesheet"]'))
        .filter((l) => {
          const media = (l.getAttribute('media') || '').trim().toLowerCase();
          return (!media || media === 'all' || media === 'screen') && !l.getAttribute('onload');
        });
      const headSyncScripts = Array.from(document.head.querySelectorAll('script[src]'))
        .filter((s) => !s.async && !s.defer);
      result.renderBlockingHeadResources = headLinks.length + headSyncScripts.length;

      // Lazy loading on images
      const imgs = Array.from(document.querySelectorAll('img'));
      result.imagesWithoutLazy = imgs.filter((img) => img.loading !== 'lazy').length;

      return result;
    });

    findings.hasLocalBusinessSchema = data.schemaTypes.some((t) =>
      /LocalBusiness|HVACBusiness|Plumber|Electrician|Restaurant|Dentist|MedicalBusiness|Store|ProfessionalService/i.test(t)
    );
    findings.h1Text = data.h1;
    findings.h1Count = data.h1Count;
    findings.hasMetaDescription = data.hasMetaDescription;
    findings.renderBlockingHeadResources = data.renderBlockingHeadResources;
    findings.imagesWithoutLazy = data.imagesWithoutLazy;
    findings.isHttps = data.isHttps;

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

    findings.hasMobileClickToCall = data.clickToCallCount > 0;

    if (business.phone) {
      const gbpPhone = normalizePhone(business.phone);
      const sitePhones = (data.phoneNumbers || []).map(normalizePhone);
      // Only flag mismatch if we actually found tel: links — empty means unknown, not mismatch.
      if (sitePhones.length > 0) {
        findings.websitePhoneMatchesGbp = sitePhones.some((p) => p === gbpPhone);
      }
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
    pageWeightKb: null,
    isHttps: null,
    h1Count: null,
    renderBlockingHeadResources: null,
    imagesWithoutLazy: null,
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
        h1Count: 0,
        renderBlockingHeadResources: 0,
        imagesWithoutLazy: 0,
        isHttps: location.protocol === 'https:',
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
      // Track the largest (primary) CTA above fold — largest = most prominent call-to-action
      let largestVisibleH = null;
      for (const el of ctaCandidates) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && r.top >= 0 && r.top < foldHeight) {
          if (largestVisibleH === null || r.height > largestVisibleH) {
            largestVisibleH = r.height;
          }
        }
      }
      result.primaryCtaPx = largestVisibleH != null ? Math.round(largestVisibleH) : null;

      result.h1Count = document.querySelectorAll('h1').length;

      const headLinks = Array.from(document.head.querySelectorAll('link[rel="stylesheet"]'))
        .filter((l) => {
          const media = (l.getAttribute('media') || '').trim().toLowerCase();
          return (!media || media === 'all' || media === 'screen') && !l.getAttribute('onload');
        });
      const headSyncScripts = Array.from(document.head.querySelectorAll('script[src]'))
        .filter((s) => !s.async && !s.defer);
      result.renderBlockingHeadResources = headLinks.length + headSyncScripts.length;

      const imgs = Array.from(document.querySelectorAll('img'));
      result.imagesWithoutLazy = imgs.filter((img) => img.loading !== 'lazy').length;

      return result;
    });

    findings.hasViewportMeta = data.hasViewportMeta;
    findings.clickToCallAboveFold = data.clickToCallAboveFold;
    findings.primaryCtaTapTargetPx = data.primaryCtaPx;
    findings.pageWeightKb = Math.round(totalBytes / 1024);
    findings.h1Count = data.h1Count;
    findings.renderBlockingHeadResources = data.renderBlockingHeadResources;
    findings.imagesWithoutLazy = data.imagesWithoutLazy;
    findings.isHttps = data.isHttps;
  } catch (err) {
    findings.error = err.message || String(err);
  } finally {
    if (page) await page.close().catch(() => {});
  }
  return findings;
}

async function auditGbp(_, gbpUrl, business) {
  const findings = {
    gbpUrl,
    categoriesCount: null,
    primaryCategory: null,
    primaryCategoryMatchesSearch: null,
    reviewCount: null,
    photoCount: null,
    daysSinceLastReview: null,
    reviewsLast30Days: null,
    reviewsLast90Days: null,
    ownerResponseCount: null,
    hasBusinessHours: null,
    error: null,
  };
  if (!gbpUrl) return findings;

  // Non-headless browser for GBP — Google Maps serves stripped content to headless Chrome
  const gbpBrowser = await puppeteer.launch({
    headless: false,
    executablePath: CHROME_PATH,
    userDataDir: CHROME_PROFILE_DIR + '-gbp',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--window-size=1280,900'],
  });

  let page;
  try {
    page = await gbpBrowser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );
    // Bare name URLs (/maps/place/Name+Only with no coordinates) load a stub, not the full card.
    // Use a search URL instead so the full results panel renders.
    const isBareNameUrl = /\/maps\/place\/[^/@?]+$/.test(gbpUrl.replace(/\/$/, ''));
    const navUrl = isBareNameUrl
      ? `https://www.google.com/maps/search/${encodeURIComponent((business.name || '') + ' ' + (business.city || ''))}`
      : gbpUrl;
    await page.goto(navUrl, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });

    // Dismiss consent / cookie dialog if present
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const accept = buttons.find((b) => /accept all|reject all|i agree/i.test(b.textContent || ''));
      if (accept) accept.click();
    }).catch(() => {});

    // Wait for either a business card or a search-results feed
    const CARD_SELECTOR = 'div.F7nice, span.MW4etd, button[jsaction*="pane.rating"], div[data-item-id="oh"], h1.DUwDvf';
    await Promise.race([
      page.waitForSelector(CARD_SELECTOR, { timeout: 15000 }),
      page.waitForSelector('div[role="feed"]', { timeout: 15000 }),
    ]).catch(() => {});

    // If we landed on a search-results page (bare name URL redirect), click the first listing
    const isSearchResults = await page.evaluate((cardSel) => {
      return !!document.querySelector('div[role="feed"]') && !document.querySelector(cardSel);
    }, CARD_SELECTOR);

    if (isSearchResults) {
      const firstLink = await page.$('a[href*="/maps/place/"]');
      if (firstLink) {
        await firstLink.click();
        await Promise.race([
          page.waitForSelector(CARD_SELECTOR, { timeout: 15000 }),
          new Promise((r) => setTimeout(r, 10000)),
        ]).catch(() => {});
      }
    }

    await new Promise((r) => setTimeout(r, 1500));

    const data = await page.evaluate((cardSel) => {
      const txt = document.body?.innerText || '';

      // Review count: prefer aria-label on rating button, fall back to text
      let reviewCount = null;
      const ratingBtn = document.querySelector('button[jsaction*="pane.rating.moreReviews"], button[aria-label*="review"]');
      if (ratingBtn) {
        const m = (ratingBtn.getAttribute('aria-label') || '').match(/([\d,]+)\s+review/i);
        if (m) reviewCount = Number(m[1].replace(/,/g, ''));
      }
      if (reviewCount === null) {
        const m = txt.match(/\(([\d,]{1,7})\)/) || txt.match(/([\d,]{1,7})\s+(?:Google\s+)?reviews?/i);
        if (m) reviewCount = Number(m[1].replace(/,/g, ''));
      }

      // Photo count: prefer aria-label on photo button
      let photoCount = null;
      const photoBtn = document.querySelector('button[aria-label*="photo"], a[aria-label*="photo"]');
      if (photoBtn) {
        const m = (photoBtn.getAttribute('aria-label') || '').match(/([\d,]+)/);
        if (m) photoCount = Number(m[1].replace(/,/g, ''));
      }
      if (photoCount === null) {
        const m = txt.match(/([\d,]{1,7})\s+photos?\b/i);
        if (m) photoCount = Number(m[1].replace(/,/g, ''));
      }

      // Review recency + velocity: scan up to 40 age-stamps
      const recencyMatches = [...txt.matchAll(/(\d+)\s+(day|week|month|year)s?\s+ago/gi)].slice(0, 40);
      let minDays = null;
      let reviewsLast30 = 0;
      let reviewsLast90 = 0;
      for (const m of recencyMatches) {
        const n = Number(m[1]);
        const u = m[2].toLowerCase();
        const mult = u === 'day' ? 1 : u === 'week' ? 7 : u === 'month' ? 30 : 365;
        const days = n * mult;
        if (minDays === null || days < minDays) minDays = days;
        if (days <= 30) reviewsLast30++;
        if (days <= 90) reviewsLast90++;
      }

      // Owner response count
      const ownerResponseCount = [...txt.matchAll(/Response from the owner/gi)].length;

      // Business hours: prefer specific hours element
      const hoursEl = document.querySelector('div[data-item-id="oh"]');
      const hasBusinessHours = hoursEl
        ? true
        : /\b(open now|open \d|closes at|open 24|monday|hours)\b/i.test(txt);

      // Category: specific GBP selectors first, then heuristic fallback
      let primaryCategory = null;
      const catEl = document.querySelector('button.DkEaL, span.YhemCb');
      if (catEl) {
        primaryCategory = (catEl.textContent || '').trim() || null;
      }
      if (!primaryCategory) {
        const categoryRegex = /\b(contractor|service|repair|company|plumber|plumbing|hvac|electrician|dentist|restaurant|store|shop|salon|attorney|lawyer|agency|cleaner|cleaning|consultant|specialist|installer|installation|roofing|landscaping|moving|pest|door|garage|locksmith|handyman|carpenter|painter|flooring|remodeling)\b/i;
        const catCandidates = Array.from(document.querySelectorAll('button, span[jsaction]'))
          .map((el) => (el.textContent || '').trim())
          .filter((t) => t && t.length > 3 && t.length < 40 && !/^\d/.test(t));
        primaryCategory = catCandidates.find((t) => categoryRegex.test(t)) || null;
      }

      // Categories count
      const catSnippet = txt.slice(0, 2000);
      const distinctCats = new Set();
      for (const m of catSnippet.matchAll(/\b\w+(?:\s+\w+){0,2}\s+(?:contractor|service|repair|company|plumber|plumbing|hvac|electrician|cleaner|specialist|installer|installation|roofing|landscaping|moving|pest|door|garage|locksmith)\b/gi)) {
        distinctCats.add(m[0].toLowerCase().trim());
      }
      const categoriesCount = distinctCats.size > 0 ? distinctCats.size : null;

      return { reviewCount, photoCount, minDays, reviewsLast30, reviewsLast90, ownerResponseCount, hasBusinessHours, primaryCategory, categoriesCount };
    }, CARD_SELECTOR);

    findings.reviewCount = data.reviewCount;
    findings.photoCount = data.photoCount;
    findings.daysSinceLastReview = data.minDays;
    findings.reviewsLast30Days = data.reviewsLast30;
    findings.reviewsLast90Days = data.reviewsLast90;
    findings.ownerResponseCount = data.ownerResponseCount;
    findings.hasBusinessHours = data.hasBusinessHours;
    findings.primaryCategory = data.primaryCategory;
    findings.categoriesCount = data.categoriesCount;

    // Primary GBP category vs search intent — #1 local ranking factor
    if (data.primaryCategory && (business.category || business.searchTerm)) {
      const searchWords = (business.category || business.searchTerm || '').toLowerCase();
      const catLower = data.primaryCategory.toLowerCase();
      findings.primaryCategoryMatchesSearch =
        catLower.split(/\s+/).some((w) => w.length > 3 && searchWords.includes(w)) ||
        searchWords.split(/\s+/).some((w) => w.length > 3 && catLower.includes(w));
    }
  } catch (err) {
    findings.error = err.message || String(err);
  } finally {
    if (page) await page.close().catch(() => {});
    await gbpBrowser.close().catch(() => {});
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

  const visible = process.env.AUDIT_VISIBLE === '1' || process.env.AUDIT_VISIBLE === 'true';
  const browser = await puppeteer.launch({
    headless: !visible,
    executablePath: CHROME_PATH,
    userDataDir: CHROME_PROFILE_DIR,
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
      };

      console.log(`\n[${i + 1}/${rows.length}] Auditing: ${name}`);
      const websiteFindings = await auditWebsite(browser, website, business);
      console.log(`  website: load=${websiteFindings.pageLoadSeconds}s schema=${websiteFindings.hasLocalBusinessSchema} h1cat=${websiteFindings.h1IncludesCategory} h1city=${websiteFindings.h1IncludesCity} c2c=${websiteFindings.hasMobileClickToCall} napMatch=${websiteFindings.websitePhoneMatchesGbp} blocking=${websiteFindings.renderBlockingHeadResources}`);

      const mobileFindings = await auditMobile(browser, website, business);
      console.log(`  mobile:  load=${mobileFindings.pageLoadSeconds}s viewport=${mobileFindings.hasViewportMeta} c2cAboveFold=${mobileFindings.clickToCallAboveFold} ctaPx=${mobileFindings.primaryCtaTapTargetPx} weightKb=${mobileFindings.pageWeightKb}`);

      const gbpFindings = await auditGbp(browser, gbpUrl, business);
      console.log(`  gbp:     photos=${gbpFindings.photoCount} reviews=${gbpFindings.reviewCount} last30=${gbpFindings.reviewsLast30Days} daysSinceReview=${gbpFindings.daysSinceLastReview} responses=${gbpFindings.ownerResponseCount} cat=${gbpFindings.primaryCategory}`);

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
