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
    totalImages: null,
    isHttps: false,
    // New checks added 2026-05-13:
    title: '',                       // <title> text
    titleIncludesCategory: false,    // does title contain service category?
    titleIncludesCity: false,        // does title contain city?
    titleLength: null,               // for "too long, truncated in SERP" check
    napAboveFold: null,              // phone AND address visible above fold (desktop)
    canonicalUrl: '',                // <link rel="canonical"> value
    canonicalMatches: null,          // canonical points to current page?
    serviceAreaPagesCount: null,     // count of internal /location/ or /city/ pages linked
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
      result.totalImages = imgs.length;
      result.imagesWithoutLazy = imgs.filter((img) => img.loading !== 'lazy').length;

      // Tier 2: CTA text quality — primary above-fold button. Exclude generic
      // nav/menu buttons (mobile hamburger was being detected as primary CTA).
      const foldH = window.innerHeight;
      const ctaEls = Array.from(document.querySelectorAll(
        'a[class*="cta" i], a[class*="button" i], a[class*="btn" i], button, a[href*="contact"], a[href*="quote"], a[href*="schedule"], a[href*="call"], a[href^="tel:"]'
      ));
      const NAV_LIKE_DESKTOP = /^(?:toggle\s*menu|menu|open\s*menu|close\s*menu|navigation|hamburger|skip\s*to\s*content|×|☰|≡|search)$/i;
      let primaryCtaText = null;
      let primaryCtaH = 0;
      for (const el of ctaEls) {
        const r = el.getBoundingClientRect();
        if (r.width > 20 && r.height > 20 && r.top >= 0 && r.top < foldH) {
          const txt = ((el.innerText || el.textContent || '') + '').trim();
          if (!txt || NAV_LIKE_DESKTOP.test(txt)) continue;
          if (r.height > primaryCtaH) { primaryCtaH = r.height; primaryCtaText = txt.slice(0, 60); }
        }
      }
      result.primaryCtaText = primaryCtaText;

      // Tier 2: reviews/testimonials on page — aggregateRating schema OR visible review section
      const ldBlocks = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      const hasRatingSchema = ldBlocks.some(s => { try { const d = JSON.parse(s.textContent||''); return JSON.stringify(d).includes('aggregateRating'); } catch { return false; } });
      const reviewSection = document.querySelector('[class*="review" i], [class*="testimonial" i], [id*="review" i], [id*="testimonial" i]');
      const starText = (document.body?.innerText || '').match(/★|☆|⭐|\d+(\.\d+)?\s*(out of|\/)\s*5/i);
      result.hasReviewsOnPage = hasRatingSchema || !!(reviewSection && (reviewSection.innerText||'').trim().length > 30) || !!starText;

      // Tier 2: service area — does body mention at least 2 distinct city/neighborhood names beyond the H1?
      const bodyTxt = (document.body?.innerText || '').toLowerCase();
      const h1Txt = ((document.querySelector('h1')?.innerText||'')).toLowerCase();
      const serviceAreaPattern = /\b([a-z][a-z\s]{3,20}),?\s*(ca|california|ny|new york|tx|texas|fl|florida|il|illinois|wa|washington)\b/gi;
      const areaMentions = new Set();
      for (const m of (bodyTxt.matchAll ? bodyTxt.matchAll(serviceAreaPattern) : [])) {
        const place = m[1].trim();
        if (!h1Txt.includes(place)) areaMentions.add(place);
      }
      result.hasServiceAreaListed = areaMentions.size >= 1;

      // Title tag — captured for "includes city + category" check (W1)
      const titleEl = document.querySelector('title');
      result.title = ((titleEl?.textContent || '').trim()).slice(0, 200);

      // NAP above fold — phone AND address visible as text above the fold (W2).
      // Strict: both must be present in viewport on first paint.
      const napFoldH = window.innerHeight;
      const phoneRegex = /\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/;
      const addrRegex = /\b\d{2,5}\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\s+(?:St|Ave|Blvd|Rd|Dr|Ln|Way|Pl|Ct|Pkwy|Highway|Hwy)\b/;
      const cityStateRegex = /\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?,?\s+(?:CA|California|TX|FL|NY|IL|WA|OR|NV|AZ|CO|GA|NC|VA|MA|PA|OH|MI|MN|UT)\b/;
      let napPhoneFound = false, napAddrFound = false;
      const napElsAll = Array.from(document.querySelectorAll('*'));
      for (const el of napElsAll) {
        if (el.children.length > 0) continue; // leaf nodes only
        const t = (el.innerText || el.textContent || '').trim();
        if (!t || t.length > 200) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.top < 0 || r.top >= napFoldH) continue;
        if (!napPhoneFound && phoneRegex.test(t)) napPhoneFound = true;
        if (!napAddrFound && (addrRegex.test(t) || cityStateRegex.test(t))) napAddrFound = true;
        if (napPhoneFound && napAddrFound) break;
      }
      result.napAboveFold = napPhoneFound && napAddrFound;

      // Canonical tag — points to a different URL? (W6 — silent ranking killer)
      const canonEl = document.querySelector('link[rel="canonical"]');
      result.canonicalUrl = canonEl?.getAttribute('href')?.trim() || '';
      if (result.canonicalUrl) {
        try {
          const canonAbs = new URL(result.canonicalUrl, location.href).href.replace(/\/$/, '');
          const currentAbs = location.href.split('#')[0].split('?')[0].replace(/\/$/, '');
          result.canonicalMatches = canonAbs === currentAbs;
        } catch { result.canonicalMatches = null; }
      } else {
        // No canonical — that's fine, treat as matching (don't flag)
        result.canonicalMatches = true;
      }

      // Service-area pages count (W4) — internal links to /location/, /service-area/,
      // /cities/, /areas-we-serve/, or any /<city-name>/ path under same hostname.
      const hostname = location.hostname;
      const locPath = /\/(?:locations?|service-areas?|cities|areas?-we-serve|service-locations?|where-we-work)(?:\/|$)/i;
      const cityNamePath = /\/(?:culver-city|los-angeles|santa-monica|beverly-hills|west-hollywood|marina-del-rey|venice|inglewood|el-segundo|playa-vista|hollywood|brentwood|westwood|mar-vista|palms|mid-city|burbank|glendale|pasadena|long-beach|torrance|redondo-beach|manhattan-beach|hermosa-beach|hawthorne|gardena|compton|carson|cerritos|orange-county|san-diego)(?:\/|$)/i;
      const locationLinks = new Set();
      const allLinks = Array.from(document.querySelectorAll('a[href]'));
      for (const a of allLinks) {
        let href = a.getAttribute('href') || '';
        if (!href) continue;
        // Resolve relative URLs against current
        try {
          const u = new URL(href, location.href);
          if (u.hostname && u.hostname !== hostname) continue;
          const path = u.pathname.replace(/\/$/, '');
          if (locPath.test(path) || cityNamePath.test(path)) {
            locationLinks.add(path);
          }
        } catch {}
      }
      result.serviceAreaPagesCount = locationLinks.size;

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
    findings.totalImages = data.totalImages;
    findings.isHttps = data.isHttps;
    findings.primaryCtaText = data.primaryCtaText || null;
    findings.hasReviewsOnPage = data.hasReviewsOnPage || false;
    findings.hasServiceAreaListed = data.hasServiceAreaListed || false;
    findings.title = data.title || '';
    findings.titleLength = data.title ? data.title.length : null;
    findings.napAboveFold = data.napAboveFold;
    findings.canonicalUrl = data.canonicalUrl || '';
    findings.canonicalMatches = data.canonicalMatches;
    findings.serviceAreaPagesCount = data.serviceAreaPagesCount;

    // H1 category check: use first 2 words of category for specificity (avoid single generic words)
    let category = String(business.category || '').toLowerCase().trim();
    if (!category && business.searchTerm) {
      const m = String(business.searchTerm).toLowerCase().match(/^([a-z\s]+?)(?:\s+in\s+|\s+near\s+|$)/);
      if (m) category = m[1].trim();
    }
    const city = String(business.city || '').toLowerCase();
    const h1Lower = data.h1.toLowerCase();
    const catPhrase = category ? category.split(/\s+/).slice(0, 2).join(' ') : '';
    findings.h1IncludesCategory = !!(catPhrase && catPhrase.length >= 4 && h1Lower.includes(catPhrase));
    findings.h1IncludesCity = !!(city && h1Lower.includes(city));

    // Same logic for title tag (W1)
    const titleLower = (data.title || '').toLowerCase();
    findings.titleIncludesCategory = !!(catPhrase && catPhrase.length >= 4 && titleLower.includes(catPhrase));
    findings.titleIncludesCity = !!(city && titleLower.includes(city));

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
    totalImages: null,
    // New checks added 2026-05-13:
    hasStickyCta: null,              // fixed/sticky CTA visible after scroll (Mo1)
    hasClickToText: null,            // <a href="sms:..."> present anywhere (Mo2)
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
      // Track the largest *real* CTA above fold. Exclude generic nav/menu buttons
      // (hamburger nav was being picked as "primary CTA" on Express mobile).
      const NAV_LIKE = /^(?:toggle\s*menu|menu|open\s*menu|close\s*menu|navigation|hamburger|skip\s*to\s*content|×|☰|≡|search)$/i;
      let largestVisibleH = null;
      for (const el of ctaCandidates) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && r.top >= 0 && r.top < foldHeight) {
          const txt = ((el.innerText || el.textContent || '') + '').trim();
          if (!txt || NAV_LIKE.test(txt)) continue;
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
      result.totalImages = imgs.length;
      result.imagesWithoutLazy = imgs.filter((img) => img.loading !== 'lazy').length;

      // Tier 2: CTA text quality (mobile) — exclude nav/menu buttons same as desktop
      const mobileFold = window.innerHeight;
      const mobileCtaEls = Array.from(document.querySelectorAll(
        'a[class*="cta" i], a[class*="button" i], a[class*="btn" i], button, a[href*="contact"], a[href*="quote"], a[href*="schedule"], a[href*="call"], a[href^="tel:"]'
      ));
      const NAV_LIKE_MOBILE = /^(?:toggle\s*menu|menu|open\s*menu|close\s*menu|navigation|hamburger|skip\s*to\s*content|×|☰|≡|search)$/i;
      let mobileCtaText = null;
      let mobileCtaH = 0;
      for (const el of mobileCtaEls) {
        const r = el.getBoundingClientRect();
        if (r.width > 20 && r.height > 20 && r.top >= 0 && r.top < mobileFold) {
          const txt = ((el.innerText || el.textContent || '') + '').trim();
          if (!txt || NAV_LIKE_MOBILE.test(txt)) continue;
          if (r.height > mobileCtaH) { mobileCtaH = r.height; mobileCtaText = txt.slice(0, 60); }
        }
      }
      result.primaryCtaText = mobileCtaText;

      // Tier 2: phone number visible as text above fold (not just hidden tel: link)
      const phoneRegex = /\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/;
      const allEls = Array.from(document.querySelectorAll('*'));
      let phoneVisibleAboveFold = false;
      for (const el of allEls) {
        if (el.children.length > 0) continue; // leaf nodes only
        const txt = (el.innerText || '').trim();
        if (phoneRegex.test(txt)) {
          const r = el.getBoundingClientRect();
          if (r.top >= 0 && r.top < mobileFold && r.width > 0 && r.height > 0) {
            phoneVisibleAboveFold = true;
            break;
          }
        }
      }
      result.phoneVisibleAboveFold = phoneVisibleAboveFold;

      // Tier 2: social proof above fold (star rating or review count visible in hero)
      let socialProofAboveFold = false;
      const spEls = Array.from(document.querySelectorAll('[class*="star" i], [class*="rating" i], [class*="review" i], [class*="testimonial" i]'));
      for (const el of spEls) {
        const r = el.getBoundingClientRect();
        if (r.top >= 0 && r.top < mobileFold && r.width > 0 && r.height > 0 && (el.innerText||'').trim().length > 0) {
          socialProofAboveFold = true;
          break;
        }
      }
      // Also check for star/rating text above fold
      if (!socialProofAboveFold) {
        const bodyText = document.body?.innerText || '';
        const firstScreenText = bodyText.slice(0, 500);
        if (/★|⭐|\d+(\.\d)?\s*stars?|\d+\s*reviews?/i.test(firstScreenText)) socialProofAboveFold = true;
      }
      result.socialProofAboveFold = socialProofAboveFold;

      // Click-to-text (Mo2) — `<a href="sms:">` anywhere on the page
      result.hasClickToText = !!document.querySelector('a[href^="sms:"]');

      return result;
    });

    findings.hasViewportMeta = data.hasViewportMeta;
    findings.clickToCallAboveFold = data.clickToCallAboveFold;
    findings.primaryCtaTapTargetPx = data.primaryCtaPx;
    findings.pageWeightKb = Math.round(totalBytes / 1024);
    findings.h1Count = data.h1Count;
    findings.renderBlockingHeadResources = data.renderBlockingHeadResources;
    findings.imagesWithoutLazy = data.imagesWithoutLazy;
    findings.totalImages = data.totalImages;
    findings.isHttps = data.isHttps;
    findings.primaryCtaText = data.primaryCtaText || null;
    findings.phoneVisibleAboveFold = data.phoneVisibleAboveFold || false;
    findings.socialProofAboveFold = data.socialProofAboveFold || false;
    findings.hasClickToText = data.hasClickToText || false;

    // Sticky CTA on scroll (Mo1) — scroll past initial fold then check whether
    // any fixed/sticky CTA stays visible. Done as a Node-side scroll then a
    // separate evaluate so the layout has time to settle.
    await page.evaluate(() => window.scrollTo({ top: 1000, behavior: 'instant' })).catch(() => {});
    await new Promise((r) => setTimeout(r, 400));
    findings.hasStickyCta = await page.evaluate(() => {
      const NAV_LIKE = /^(?:toggle\s*menu|menu|open\s*menu|close\s*menu|navigation|hamburger|skip\s*to\s*content|×|☰|≡|search|cart|account|sign\s*in|log\s*in)$/i;
      const candidates = Array.from(document.querySelectorAll(
        'a[href^="tel:"], a[href*="contact"], a[href*="quote"], a[href*="schedule"], a[href*="book"], a[href*="appointment"], a[class*="cta"], a[class*="button" i], a[class*="btn" i], button, div[class*="sticky" i] a, div[class*="fixed" i] a'
      ));
      for (const el of candidates) {
        const style = window.getComputedStyle(el);
        const pos = style.position;
        // Walk up to ancestor in case the element itself isn't fixed but a parent wrapper is
        let isFixed = (pos === 'fixed' || pos === 'sticky');
        if (!isFixed) {
          let p = el.parentElement;
          for (let i = 0; i < 5 && p; i++) {
            const ps = window.getComputedStyle(p);
            if (ps.position === 'fixed' || ps.position === 'sticky') { isFixed = true; break; }
            p = p.parentElement;
          }
        }
        if (!isFixed) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 50 || r.height < 20) continue;
        if (r.bottom <= 0 || r.top >= window.innerHeight) continue;
        const txt = ((el.innerText || el.textContent || '') + '').trim();
        if (!txt || NAV_LIKE.test(txt)) continue;
        return true;
      }
      return false;
    }).catch(() => null);
    // Scroll back to top to leave the page in a clean state
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })).catch(() => {});
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
    // New checks added 2026-05-13:
    description: '',                 // GBP "From the business" text (M1)
    descriptionLength: null,
    hasPosts: null,                  // GBP "Updates" / Posts section present (M2)
    lastPostDaysAgo: null,           // days since most recent post
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
    // Forward browser console messages with our diag prefixes back to Node
    // so [gbp-diag] / [gbp-eval] surface in the pipeline log.
    page.on('console', (msg) => {
      const t = msg.text();
      if (t.includes('[gbp-')) console.log('  ' + t);
    });
    // Bare name URLs (/maps/place/Name+Only with no coordinates) load a stub, not the full card.
    // Use name + address in the search query so the target business ranks first in results.
    const isBareNameUrl = /\/maps\/place\/[^/@?]+$/.test(gbpUrl.replace(/\/$/, ''));
    const navUrl = isBareNameUrl
      ? `https://www.google.com/maps/search/${encodeURIComponent((business.name || '') + ' ' + (business.address || business.city || ''))}`
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

    // If still on a search URL (including /maps/search/ used for bare-name fallback),
    // click the first listing to navigate to the full business card page.
    // The search panel shows a partial card with only visible thumbnails — unreliable for photo count.
    const currentUrl = page.url();
    const needsClickThrough = currentUrl.includes('/maps/search/') || (
      await page.evaluate((cardSel) => {
        return !!document.querySelector('div[role="feed"]') && !document.querySelector(cardSel);
      }, CARD_SELECTOR).catch(() => false)
    );

    if (needsClickThrough) {
      // Find the listing that best matches our target business name by aria-label.
      // Falling back to the first result picks the wrong business when ours isn't #1.
      await page.evaluate((targetName) => {
        const links = Array.from(document.querySelectorAll('a.hfpxzc'));
        if (!links.length) return;
        if (!targetName) { links[0].click(); return; }
        const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
        const target = norm(targetName);
        let best = links[0], bestScore = -1;
        for (const link of links) {
          const label = norm(link.getAttribute('aria-label') || '');
          // Score = number of target characters found consecutively in label
          let score = 0;
          for (let i = 0, j = 0; i < label.length && j < target.length; i++) {
            if (label[i] === target[j]) { score++; j++; }
          }
          if (score > bestScore) { bestScore = score; best = link; }
        }
        best.click();
      }, business.name || '').catch(() => {});
      await Promise.race([
        page.waitForSelector('h1.DUwDvf', { timeout: 15000 }),
        new Promise((r) => setTimeout(r, 10000)),
      ]).catch(() => {});
    }

    await new Promise((r) => setTimeout(r, 2000));

    // Verify we actually landed on the right business — h1 must overlap the
    // expected name. If not, abort cleanly with error set so the script
    // never makes claims about the wrong business.
    const h1Verification = await page.evaluate(() => {
      const h1 = document.querySelector('h1.DUwDvf');
      return { h1Text: (h1?.textContent || '').trim(), url: location.href };
    }).catch(() => ({ h1Text: '', url: '' }));
    const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const expected = norm(business.name || '');
    const actual = norm(h1Verification.h1Text);
    // Require at least 50% of the expected name chars to appear in order in h1.
    let overlap = 0;
    for (let i = 0, j = 0; i < actual.length && j < expected.length; i++) {
      if (actual[i] === expected[j]) { overlap++; j++; }
    }
    const overlapRatio = expected ? overlap / expected.length : 0;
    if (!h1Verification.h1Text || overlapRatio < 0.5) {
      const errMsg = `wrong business panel — expected "${business.name}", got h1="${h1Verification.h1Text}" (overlap=${(overlapRatio * 100).toFixed(0)}%) — aborting GBP scrape to prevent false data`;
      console.warn(`  ⚠️ ${errMsg}`);
      findings.error = errMsg;
      return findings;
    }
    console.log(`  [gbp-nav] confirmed panel: h1="${h1Verification.h1Text}" (overlap=${(overlapRatio * 100).toFixed(0)}%)`);

    // Scroll down to load review responses (lazy-loaded by Maps)
    await page.evaluate(() => window.scrollBy(0, 800)).catch(() => {});
    await new Promise((r) => setTimeout(r, 1000));
    await page.evaluate(() => window.scrollBy(0, 800)).catch(() => {});
    await new Promise((r) => setTimeout(r, 500));

    const data = await page.evaluate((cardSel) => {
      const txt = document.body?.innerText || '';

      // Review count: read from the F7nice rating widget span — this is the element
      // Google Maps renders next to the stars (e.g. "(5)"). Its text content is the
      // exact display value, matching what the video screenshot shows.
      let reviewCount = null;

      // Strategy 1: div.F7nice span[role="img"][aria-label*="review"] — direct hit
      const reviewSpan = document.querySelector('div.F7nice span[role="img"][aria-label*="review"]');
      if (reviewSpan) {
        const t = (reviewSpan.textContent || '').trim();
        // textContent is "(N)" — strip parens
        const m = t.match(/^\(?([\d,]{1,7})\)?$/);
        if (m) reviewCount = Number(m[1].replace(/,/g, ''));
      }

      // Strategy 2: any span inside div.F7nice whose full textContent is exactly "(N)"
      if (reviewCount === null) {
        const f7 = document.querySelector('div.F7nice');
        if (f7) {
          for (const el of Array.from(f7.querySelectorAll('span'))) {
            const t = (el.textContent || '').trim();
            if (/^\([\d,]{1,7}\)$/.test(t)) {
              reviewCount = Number(t.slice(1, -1).replace(/,/g, ''));
              break;
            }
          }
        }
      }

      // Strategy 3: aria-label on the F7nice span (same element, different read path)
      if (reviewCount === null && reviewSpan) {
        const m = (reviewSpan.getAttribute('aria-label') || '').match(/([\d,]+)\s+review/i);
        if (m) reviewCount = Number(m[1].replace(/,/g, ''));
      }

      // Photo count: Google does NOT display a total count anywhere on the business
      // panel (verified by exhaustive aria-label dump 2026-05-13 — only matches are
      // "Photo of <Business>", "Next Photo", "Add photos & videos", and per-reviewer
      // thumbnails). The old text-regex fallback was catching arbitrary "N photos"
      // strings from review snippets (Express had 47+ photos, scraper returned 9).
      // For now we explicitly return null — better to skip the photoCount finding
      // than make a false claim. A reliable extractor would need to navigate into
      // the photos grid + count thumbnails, which is slow and fragile.
      const photoCount = null;
      console.log(`  [gbp-diag] photoCount = null (no reliable selector on panel; see comments)`);

      // Review recency + velocity: scope STRICTLY to review cards (must have
      // data-review-id). Removed the broad body-text fallback because it was
      // catching owner-response timestamps ("Response from owner 3 months ago")
      // and Q&A timestamps, producing false minDays values.
      // Take the FIRST timestamp inside each card (skip owner-response sub-blocks).
      const reviewCards = Array.from(document.querySelectorAll('div[data-review-id]'))
        .filter(el => el.innerText && el.innerText.trim().length > 20);
      let minDays = null;
      let reviewsLast30 = 0;
      let reviewsLast90 = 0;
      let cardsScanned = 0;
      for (const card of reviewCards.slice(0, 40)) {
        // Find the first time-ago text inside the card, scoped to the top-level
        // header (not nested owner-response blocks which also have "X ago" text).
        // Owner-response blocks are typically wrapped in a child with class
        // CDe7pd or similar; remove them before scanning.
        const cardClone = card.cloneNode(true);
        cardClone.querySelectorAll('.CDe7pd, [class*="ownerResponse"], [class*="OwnerResponse"]').forEach(n => n.remove());
        const text = (cardClone.innerText || '').trim();
        const m = text.match(/(\d+)\s+(day|week|month|year)s?\s+ago/i);
        if (!m) continue;
        cardsScanned++;
        const n = Number(m[1]);
        const u = m[2].toLowerCase();
        const mult = u === 'day' ? 1 : u === 'week' ? 7 : u === 'month' ? 30 : 365;
        const days = n * mult;
        if (minDays === null || days < minDays) minDays = days;
        if (days <= 30) reviewsLast30++;
        if (days <= 90) reviewsLast90++;
      }
      console.log(`  [gbp-diag] review cards found: ${reviewCards.length}, parsed: ${cardsScanned}, minDays: ${minDays}, last30: ${reviewsLast30}, last90: ${reviewsLast90}`);

      // Owner response count
      const ownerResponseCount = [...txt.matchAll(/Response from the owner/gi)].length;

      // Business hours: check multiple selectors (Google Maps DOM changes frequently)
      // and fall back to text patterns that cover "Open · Closes 7PM", "Closes at 5PM", etc.
      const hoursEl = document.querySelector(
        'div[data-item-id="oh"], [aria-label*="hour" i], [aria-label*="open" i], [data-tooltip*="hour" i]'
      );
      const hasBusinessHours = hoursEl
        ? true
        : /\b(open now|open\s*·|closes?\s+\d|closes?\s+at|open\s+\d|open 24|monday|tuesday|wednesday|thursday|friday|saturday|sunday|hours|\d+\s*(am|pm))\b/i.test(txt);

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

      // Categories count: the old regex-on-body-text approach counted phrase variants
      // (e.g. "garage door repair", "garage door installation", "garage door company"
      // all matched), inflating Express to 18 when real GBP categories are 1-3. Until
      // we have a DOM selector that targets the actual category list (Google folds
      // secondary categories under "More categories" expansion), set null.
      const categoriesCount = null;
      console.log(`  [gbp-diag] categoriesCount = null (regex was inflating phrase variants)`);

      // GBP description (M1) — "From the business" section. Try several selector
      // patterns then fall back to scanning for the heading text.
      let description = '';
      const descSel = [
        'div.WeS02d.fontBodyMedium',                 // common GBP description container
        'div[data-attrid*="description"]',
        'div.PYvSYb',                                // alternative description container
      ];
      for (const s of descSel) {
        const el = document.querySelector(s);
        if (el) {
          const t = (el.textContent || '').trim();
          if (t.length > 30 && t.length < 2000) { description = t; break; }
        }
      }
      if (!description) {
        // Fallback: find "From the business" heading and grab next text block
        const allEls = Array.from(document.querySelectorAll('*'));
        for (const el of allEls) {
          if (el.children.length > 4) continue;
          const t = (el.textContent || '').trim();
          if (/^from\s+the\s+business$/i.test(t) || /^description$/i.test(t)) {
            let sib = el.nextElementSibling || el.parentElement?.nextElementSibling;
            for (let i = 0; sib && i < 3; i++) {
              const dt = (sib.textContent || '').trim();
              if (dt.length > 30 && dt.length < 2000) { description = dt; break; }
              sib = sib.nextElementSibling;
            }
            if (description) break;
          }
        }
      }
      console.log(`  [gbp-diag] description = ${description ? description.length + ' chars' : 'EMPTY'}`);

      // Posts / Updates (M2) — Google Posts appear under an "Updates" or "Posts"
      // section heading. Detect presence + extract most-recent timestamp.
      let hasPosts = false;
      let lastPostDaysAgo = null;
      const postHeadings = Array.from(document.querySelectorAll('h2, h3, [role="heading"], button, span'))
        .filter(el => /^(?:updates?|posts?|from the owner)$/i.test((el.textContent || '').trim()));
      if (postHeadings.length > 0) {
        // Find the section container after the heading
        const heading = postHeadings[0];
        const region = heading.closest('div[role="region"]') || heading.parentElement?.parentElement;
        const scopeText = (region?.innerText || '').slice(0, 3000);
        const m = scopeText.match(/(\d+)\s+(day|week|month|year)s?\s+ago/i);
        if (m) {
          hasPosts = true;
          const n = Number(m[1]);
          const u = m[2].toLowerCase();
          const mult = u === 'day' ? 1 : u === 'week' ? 7 : u === 'month' ? 30 : 365;
          lastPostDaysAgo = n * mult;
        } else if (region && region.querySelector('img, [data-src]')) {
          // Posts section visible with imagery but no timestamp parsed — still posts exist
          hasPosts = true;
        }
      }
      console.log(`  [gbp-diag] hasPosts=${hasPosts} lastPostDaysAgo=${lastPostDaysAgo}`);

      return { reviewCount, photoCount, minDays, reviewsLast30, reviewsLast90, ownerResponseCount, hasBusinessHours, primaryCategory, categoriesCount, description, hasPosts, lastPostDaysAgo };
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
    findings.description = data.description || '';
    findings.descriptionLength = data.description ? data.description.length : null;
    findings.hasPosts = data.hasPosts;
    findings.lastPostDaysAgo = data.lastPostDaysAgo;

    // Primary GBP category vs search intent — #1 local ranking factor
    if (data.primaryCategory && (business.category || business.searchTerm)) {
      const searchWords = (business.category || business.searchTerm || '').toLowerCase();
      const catLower = data.primaryCategory.toLowerCase();
      findings.primaryCategoryMatchesSearch =
        catLower.split(/\s+/).some((w) => w.length > 3 && searchWords.includes(w)) ||
        searchWords.split(/\s+/).some((w) => w.length > 3 && catLower.includes(w));
    }

    // Final per-field summary — surfaces every value we'll feed into the script,
    // so wrong claims like "9 photos" can never ship unnoticed again.
    console.log(`  [gbp-summary] ${business.name || 'unknown'}: reviewCount=${findings.reviewCount} | photoCount=${findings.photoCount} | daysSinceLastReview=${findings.daysSinceLastReview} | last30=${findings.reviewsLast30Days} | last90=${findings.reviewsLast90Days} | ownerResponses=${findings.ownerResponseCount} | hasHours=${findings.hasBusinessHours} | primaryCategory=${JSON.stringify(findings.primaryCategory)} | matchesSearch=${findings.primaryCategoryMatchesSearch} | description=${findings.descriptionLength}chars | hasPosts=${findings.hasPosts} | lastPostDaysAgo=${findings.lastPostDaysAgo}`);
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
        address: row.Address || '',
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
