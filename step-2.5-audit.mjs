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
// 2026-05-27 (Tier 2 #7 prep): CHROME_PROFILE_DIR override via env var for
// cross-lead worker isolation. Defaults to legacy hardcoded path.
// The -gbp / -search-kp suffixes are appended below for the audit sub-profiles.
const CHROME_PROFILE_DIR = process.env.CHROME_PROFILE_DIR
  || path.join(process.cwd(), 'output', 'chrome-profile-step3');
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

// Detect "parked install" sites — domains pointing at a fresh WordPress / Wix
// / Squarespace / GoDaddy template with no real business content. Locked
// 2026-05-20 after Pro Plumber Beverly Hills had a domain pointing at an
// empty WP install (title "123", "Hello world!" / Sample Page).
// Returns the reason string (e.g. "wp-default-install") or '' if not parked.
function detectParkedInstall({ title, bodyTextSample, wordCount, businessName }) {
  const t = String(title || '').trim();
  const tLower = t.toLowerCase();
  const body = String(bodyTextSample || '');
  const bodyLower = body.toLowerCase();
  // Hard WordPress default-install signature
  if (bodyLower.includes('hello world!') && bodyLower.includes('welcome to wordpress')) {
    return 'wp-default-install:hello-world';
  }
  if (bodyLower.includes('this is your first post')) {
    return 'wp-default-install:first-post';
  }
  // Title-based default signatures
  if (tLower === 'sample page' || tLower === 'just another wordpress site' || tLower === 'my blog' || tLower === 'untitled') {
    return `default-title:${tLower}`;
  }
  // Generic numeric / placeholder titles like "123"
  if (/^\d+$/.test(t) && t.length <= 4) {
    return `placeholder-title:${t}`;
  }
  // Wix placeholder
  if (bodyLower.includes('this is the home page') && bodyLower.includes('start designing your site')) {
    return 'wix-default-install';
  }
  // Squarespace dev template
  if (bodyLower.includes('this site is currently in development') ||
      bodyLower.includes('this site is being built')) {
    return 'squarespace-dev-template';
  }
  // "Under Construction" / "Coming Soon" placeholder pages. Locked 2026-05-20
  // after Royale Plumbing (royaleplumbing.com) returned "ROYALE PLUMBING /
  // Website Under Construction / We Are Fixing a Few Leaks" + 2 buttons.
  // Page renders the logo + status but has no actual business content.
  if (/\b(website|site)\s+(is\s+)?under\s+construction\b/i.test(body) ||
      /\bcoming\s+soon\b/i.test(t) ||
      /\bcoming\s+soon\b/i.test(body.slice(0, 300)) ||
      /\bunder\s+construction\b/i.test(t)) {
    return 'under-construction';
  }
  // Registrar parking pages — title typically contains "GoDaddy" / "Hostinger" / "Bluehost"
  // or body contains "domain is registered with"
  if (/\b(godaddy|hostinger|bluehost|namecheap|hostgator|domain is for sale|parked free|parking page)\b/i.test(t) ||
      /\b(this domain is parked|domain may be for sale)\b/i.test(bodyLower)) {
    return 'registrar-parking';
  }
  // Body too short + no business name in body + no contact info — likely
  // empty / unfinished. Threshold tuned to catch the Pro Plumber case
  // (Hello world + Sample Page menu = ~40 visible words).
  if (wordCount !== null && wordCount < 50) {
    const businessTokens = String(businessName || '').toLowerCase().split(/\s+/).filter((t) => t.length >= 4);
    const anyTokenInBody = businessTokens.some((tok) => bodyLower.includes(tok));
    const hasContact = /\(\d{3}\)|\d{3}[-.\s]\d{3}[-.\s]\d{4}|@[a-z0-9.-]+\./.test(body);
    if (!anyTokenInBody && !hasContact) {
      return `empty-site:wordCount=${wordCount}`;
    }
  }
  return '';
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
    // "No own website" detection — locked 2026-05-20 (Pro Plumber WP parked install)
    siteLooksParked: false,
    parkedReason: '',
    error: null,
  };

  if (!websiteUrl) return findings;

  let page;
  try {
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    const start = Date.now();
    const response = await page.goto(websiteUrl, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    findings.pageLoadSeconds = Number(((Date.now() - start) / 1000).toFixed(2));

    // 2026-06-03 — HTTP error gate. Caught on Safe Gas Services Inc whose
    // safegasservices.com returned HTTP 403 ("Access Denied") to our crawler.
    // The video shipped showing the error page in the website segment.
    //
    // Key insight: a 403/404/5xx from OUR crawler doesn't mean the prospect
    // has no website — they likely have a real site with WAF/Cloudflare/bot
    // protection blocking headless Playwright. Real visitors see a working
    // page. So we CAN'T claim "you don't have a website" (that's false), AND
    // we CAN'T ship a video showing the error page (that's worse).
    //
    // Right call: ABANDON the lead. The per-lead loop catches the throw,
    // marks the lead as failed, moves on. No video created, no false claim.
    // Memory: feedback_audit_only_observable_claims.md.
    const httpStatus = response?.status() || 0;
    findings.httpStatus = httpStatus;
    if (httpStatus >= 400) {
      const err = new Error(
        `[step-2.5 ABANDON] Website ${websiteUrl} returned HTTP ${httpStatus} ` +
        `— likely WAF/bot-block, prospect has a real site but our crawler can't reach it. ` +
        `Abandoning lead to avoid shipping a video that shows an error page or makes a false "no website" claim.`
      );
      err.skipLead = true;
      err.httpStatus = httpStatus;
      throw err;
    }

    const data = await page.evaluate(() => {
      const result = {
        schemaTypes: [],
        h1: '',
        h1Count: 0,
        phoneNumbers: [],
        clickToCallCount: 0,
        prominentPhone: null,           // largest visible phone above fold (the one a visitor SEES)
        uniqueSitePhones: [],           // every distinct normalized phone on the page
        hasMetaDescription: false,
        renderBlockingHeadResources: 0,
        imagesWithoutLazy: 0,
        isHttps: location.protocol === 'https:',
        // AI Search Visibility readiness signals (NEW 2026-05-15 — Whitespark
        // 2026 NEW category, on-page weights 24% in AI search top lever).
        wordCount: 0,
        hasFaqSchema: false,
        hasOrganizationSchema: false,
      };
      // Visible word count
      try {
        const visibleText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
        result.wordCount = visibleText ? visibleText.split(/\s+/).filter(w => w.length > 2).length : 0;
        // First 1500 chars of body text for parked-install detection. Locked
        // 2026-05-20 — feedback_no_website_is_top_finding.md (Pro Plumber
        // Beverly Hills WP placeholder case).
        result.bodyTextSample = visibleText.slice(0, 1500);
      } catch {}
      const ldScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      for (const s of ldScripts) {
        try {
          const parsed = JSON.parse(s.textContent || '');
          const flat = Array.isArray(parsed) ? parsed : [parsed];
          for (const item of flat) {
            if (item && item['@type']) {
              const t = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
              result.schemaTypes.push(...t.map(String));
              // AI Search Visibility readiness — FAQ + Organization schema
              // are key entity-recognition signals for AI search engines.
              for (const type of t) {
                const typeStr = String(type).toLowerCase();
                if (typeStr.includes('faqpage')) result.hasFaqSchema = true;
                if (typeStr === 'organization' || typeStr.endsWith('/organization')) result.hasOrganizationSchema = true;
              }
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

      // === Prominent phone + unique-phone tracking (NAP strict) ===
      // The OLD `websitePhoneMatchesGbp` returned true if ANY tel: link matched
      // GBP. That hides the case where the HEADER shows a different number
      // (lead aggregator, call tracking, etc.) — a real NAP mismatch the visitor
      // and Google both see. Capture every distinct phone + identify which one
      // is most prominent (largest visible above fold).
      const phoneRegexAll = /(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})/g;
      const digits = (s) => (s || '').replace(/\D/g, '');
      const normalize10 = (s) => {
        const d = digits(s);
        return d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
      };
      const foldY = window.innerHeight;
      const uniqueSet = new Set();

      // Include all tel: hrefs as known phones
      for (const a of tels) {
        const n = normalize10(a.getAttribute('href') || '');
        if (n.length === 10) uniqueSet.add(n);
      }
      // Also scan visible text on the page for phone patterns
      const textNodes = Array.from(document.querySelectorAll('*'))
        .filter((el) => el.children.length === 0);
      let prominentBest = null; // {phone, area, aboveFold}
      for (const el of textNodes) {
        const txt = (el.innerText || el.textContent || '').trim();
        if (!txt || txt.length > 200) continue;
        const matches = txt.match(phoneRegexAll);
        if (!matches) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const area = r.width * r.height;
        const aboveFold = r.top >= 0 && r.top < foldY;
        for (const m of matches) {
          const n = normalize10(m);
          if (n.length !== 10) continue;
          uniqueSet.add(n);
          // Prefer above-fold + largest area; fall back to first non-fold finding
          const better = !prominentBest
            || (aboveFold && !prominentBest.aboveFold)
            || (aboveFold === prominentBest.aboveFold && area > prominentBest.area);
          if (better) prominentBest = { phone: n, area, aboveFold };
        }
      }
      result.uniqueSitePhones = Array.from(uniqueSet);
      result.prominentPhone = prominentBest ? prominentBest.phone : null;

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
      // 2026-06-11: also exclude back-to-top / scroll-to-top controls — "Top"
      // was being detected as the primary CTA (Ford's + others), producing a
      // false "your CTA says Top" finding. These are nav chrome, not CTAs.
      const NAV_LIKE_DESKTOP = /^(?:toggle\s*menu|menu|open\s*menu|close\s*menu|navigation|hamburger|skip\s*to\s*content|×|☰|≡|search|top|back\s*to\s*top|scroll\s*to\s*top|go\s*to\s*top|↑|⬆|\^)$/i;
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

      // Tier 2: reviews/testimonials on page (broadened 2026-05-21 after Enviro
      // false-claim — "813 reviews / 4.6 Rated OUTSTANDING" widget visible but
      // detector missed it because the rating widget uses SVG stars and shows
      // numeric rating + "X reviews" in separate elements):
      //  1. aggregateRating schema in LD+JSON
      //  2. Section with class/id containing review/testimonial
      //  3. Review-widget vendor classes (trustpilot/yotpo/birdeye/etc.)
      //  4. Body text matches a rating pattern: unicode star, "X.X stars",
      //     "X reviews/ratings", "X.X / 5", "X.X out of 5", "rated outstanding/
      //     excellent/great", "X-star".
      //  5. SVG <svg> elements with class/id matching "star"/"rating".
      const ldBlocks = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      const hasRatingSchema = ldBlocks.some(s => { try { const d = JSON.parse(s.textContent||''); return JSON.stringify(d).includes('aggregateRating'); } catch { return false; } });
      const reviewSection = document.querySelector('[class*="review" i], [class*="testimonial" i], [id*="review" i], [id*="testimonial" i]');
      const reviewWidget = document.querySelector('[class*="trustpilot" i], [class*="yotpo" i], [class*="trustindex" i], [class*="birdeye" i], [class*="podium" i], [class*="swell" i], [class*="rating-widget" i], [class*="stars-widget" i]');
      const bodyText = (document.body?.innerText || '');
      const reviewPattern = /★|☆|⭐|\d+(\.\d+)?\s*(?:out\s*of|\/)\s*5|\d+(\.\d+)?\s*stars?\b|\b\d{2,}\s*(?:reviews?|ratings?)\b|\brated\s*(?:outstanding|excellent|great|good|\d+(\.\d+)?)/i;
      const matchesReviewPattern = reviewPattern.test(bodyText);
      const svgStar = !!document.querySelector('svg[class*="star" i], svg[class*="rating" i], i[class*="fa-star" i]');
      result.hasReviewsOnPage = hasRatingSchema
        || !!(reviewSection && (reviewSection.innerText||'').trim().length > 30)
        || !!reviewWidget
        || matchesReviewPattern
        || svgStar;
      // Last-resort: if the page SOURCE HTML contains review/rating keywords
      // (anywhere — including hidden elements, attributes, scripts), capture
      // that signal as `reviewsMentionedInSource`. step-2.5 will use it to
      // null out hasReviewsOnPage when the visible detectors found nothing —
      // a page that talks about reviews in source likely HAS a review widget
      // we couldn't see (shadow DOM, lazy-load, JS-injected after eval).
      // Locked 2026-05-21 after Enviro Plumbing's "4.6 / 813 reviews" widget
      // was invisible to ALL our visible-DOM detection methods.
      const htmlSrc = (document.body?.outerHTML || '').toLowerCase().slice(0, 80000);
      result.reviewsMentionedInSource = /\b(reviews?|ratings?|testimonials?|rated\s+(?:outstanding|excellent|great)|aggregaterating|trustpilot|yotpo|birdeye)\b/.test(htmlSrc);

      // Tier 2: service area — three layered checks, ANY positive sets the flag.
      // Locked 2026-06-03 after Prodigy Plumbing false negative: the original
      // text-pattern detector required "City, CA" adjacent strings, but Prodigy's
      // site displays cities as standalone button chips (Cerritos / Compton /
      // Lakewood / etc.) with no ", CA" suffix on each. Regex missed every one.
      // Memory: feedback_audit_only_observable_claims.md.
      const bodyTxt = (document.body?.innerText || '').toLowerCase();
      const h1Txt = ((document.querySelector('h1')?.innerText||'')).toLowerCase();

      // Layer 1: existing regex — "City, CA" / "City, California" adjacency.
      const serviceAreaPattern = /\b([a-z][a-z\s]{3,20}),?\s*(ca|california|ny|new york|tx|texas|fl|florida|il|illinois|wa|washington)\b/gi;
      const areaMentions = new Set();
      for (const m of (bodyTxt.matchAll ? bodyTxt.matchAll(serviceAreaPattern) : [])) {
        const place = m[1].trim();
        if (!h1Txt.includes(place)) areaMentions.add(place);
      }

      // Layer 2 (NEW 2026-06-03): explicit "Areas served / Service areas / We serve"
      // section heading + a cluster of links or capitalized place-name spans
      // following it. Catches the standalone-city-button pattern.
      const SECTION_HEADING_RE = /\b(areas?\s+(?:we\s+)?serv\w*|service\s+areas?|we\s+(?:serve|service)|cities\s+(?:we\s+)?(?:serve|service)|locations?\s+(?:we\s+)?(?:serve|service))\b/i;
      let hasSectionHeading = false;
      for (const h of document.querySelectorAll('h1, h2, h3, h4, h5, h6, [class*="title" i], [class*="heading" i], [class*="header" i]')) {
        if (SECTION_HEADING_RE.test((h.innerText || h.textContent || '').trim())) {
          hasSectionHeading = true;
          break;
        }
      }

      // Layer 3 (NEW 2026-06-03): cluster of city-name LINKS or buttons. If 5+
      // anchors or buttons have short (1-3 word), title-cased text that looks
      // like a place name (no verbs, no generic UI words), it's a service-area
      // list. Distinguishes from navigation menus by requiring the cluster to
      // be siblings or near-siblings (not spread across the page).
      const UI_NOISE_RE = /^(home|about|services?|contact|menu|book|call|quote|reviews?|gallery|blog|faq|login|sign\s*in|search|cart|account|more|next|prev|previous|close|open)$/i;
      const placeLikeTexts = [];
      for (const el of document.querySelectorAll('a, button, li, span, [class*="city" i], [class*="area" i], [class*="location" i]')) {
        const t = ((el.innerText || el.textContent || '').trim());
        if (!t || t.length > 40 || t.length < 3) continue;
        if (UI_NOISE_RE.test(t)) continue;
        // Title-cased, 1-3 words, only letters + spaces + apostrophe + period.
        if (!/^[A-Z][A-Za-z'.\s-]{2,39}$/.test(t)) continue;
        const wordCount = t.split(/\s+/).length;
        if (wordCount > 3) continue;
        placeLikeTexts.push(t);
      }
      const hasCityCluster = placeLikeTexts.length >= 5;

      result.hasServiceAreaListed = areaMentions.size >= 1 || hasSectionHeading || hasCityCluster;
      result.serviceAreaSignals = {
        regexMatches: areaMentions.size,
        sectionHeading: hasSectionHeading,
        cityClusterCount: placeLikeTexts.length,
      };

      // Title tag — captured for "includes city + category" check (W1)
      const titleEl = document.querySelector('title');
      result.title = ((titleEl?.textContent || '').trim()).slice(0, 200);

      // NAP above fold — phone OR address visible as text above the fold (W2).
      // 2026-06-03: BROADENED. Original walker only checked leaf-node innerText
      // which missed phones rendered through website-builder frameworks (caught
      // on ABC Plumber Service at abcwi.org — phone visible in both top bar and
      // orange CTA, but distinctSitePhoneCount=0 and napAboveFold=false). Adds
      // 3 supplementary positive signals as cross-gates:
      //   1. hasTelLinkAnywhere — any <a href="tel:"> link on the page
      //   2. phoneFoundInSource — regex against full HTML source (catches text
      //      inside non-leaf containers, builder-rendered content, deeply nested
      //      styled spans where leaf-node walker would split the digits)
      //   3. telLinkAboveFold — tel: link with a bounding rect inside the
      //      first-viewport region
      //
      // Step-6 uses these as cross-gates: any positive signal blocks the
      // napAboveFold absence claim. Memory: feedback_audit_only_observable_claims.md.
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

      // SUPPLEMENTARY SIGNAL 1: any tel: link anywhere on the page.
      const telLinks = Array.from(document.querySelectorAll('a[href^="tel:"], a[href^="TEL:"]'));
      result.hasTelLinkAnywhere = telLinks.length > 0;

      // SUPPLEMENTARY SIGNAL 2: tel: link with bounding rect inside first viewport.
      let telLinkAboveFold = false;
      for (const a of telLinks) {
        const r = a.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.top >= 0 && r.top < napFoldH) { telLinkAboveFold = true; break; }
      }
      result.telLinkAboveFold = telLinkAboveFold;

      // SUPPLEMENTARY SIGNAL 3: phone pattern found anywhere in the raw HTML
      // source. Catches builder content, deeply nested styled spans, JSON-LD
      // schema phone fields, etc. — anything the leaf-node walker would miss.
      const rawSrc = (document.documentElement?.outerHTML || '').slice(0, 200000);
      result.phoneFoundInSource = phoneRegex.test(rawSrc) || /\btel:\+?[\d\-().\s]{7,}/i.test(rawSrc);

      result.napAboveFold = napPhoneFound || napAddrFound;

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
      //
      // 2026-06-03: Broadened pattern after Chris caught Santa Monica Drain Co.
      // false negative — their nav had "AREAS SERVED" button linking to /areas-
      // served/, which the prior regex didn't match. Added: areas-served,
      // areas-of-service, our-service-area, serving, coverage-area, service-map,
      // and the standalone "/area-served/" / "/areas-serviced/" variants.
      const hostname = location.hostname;
      const locPath = /\/(?:locations?|service-areas?|service-area-map|service-maps?|cities|areas?-we-(?:serve|service)|areas?-(?:we-)?served|areas?-serviced|areas?-of-service|service-locations?|where-we-(?:work|serve|service)|our-service-areas?|coverage-areas?|cities-served|cities-we-serve|service-map)(?:\/|$)/i;
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
    findings._reviewsMentionedInSource = !!data.reviewsMentionedInSource;
    findings.iframeCount = await page.evaluate(() => document.querySelectorAll('iframe').length).catch(() => 0);
    findings.hasServiceAreaListed = data.hasServiceAreaListed || false;
    findings.title = data.title || '';
    findings.titleLength = data.title ? data.title.length : null;
    findings.napAboveFold = data.napAboveFold;
    findings.canonicalUrl = data.canonicalUrl || '';
    findings.canonicalMatches = data.canonicalMatches;
    findings.serviceAreaPagesCount = data.serviceAreaPagesCount;
    // AI Search Visibility readiness fields (Whitespark 2026 NEW category).
    // On-page content weights 24% in AI search (top lever). Step-6 uses these
    // to fire the weakOnPageForAi finding.
    findings.wordCount = data.wordCount || 0;
    findings.hasFaqSchema = !!data.hasFaqSchema;
    findings.hasOrganizationSchema = !!data.hasOrganizationSchema;

    // Parked-install detection (locked 2026-05-20 — Pro Plumber Beverly Hills case).
    findings.parkedReason = detectParkedInstall({
      title: data.title,
      bodyTextSample: data.bodyTextSample || '',
      wordCount: data.wordCount,
      businessName: business.businessName || business.name || '',
    });
    findings.siteLooksParked = !!findings.parkedReason;
    if (findings.siteLooksParked) {
      console.log(`    [parked-install] ${findings.parkedReason} on ${websiteUrl} — site has no real content`);
    }

    // 2026-06-03 — EMPTY-AUDIT ABANDON GATE. Caught on Palisades Plumbing CO:
    // their domain palisadesplumbinginc.com expired and now serves a JS-rendered
    // GoDaddy parking page. Our page.goto returned in 0.43s before the parking
    // content rendered, so the audit captured title="", h1Text="", wordCount=null
    // — TOTALLY EMPTY. The existing detectParkedInstall regex needs body text
    // to fire, so it returned false. Result: video rendered showing the GoDaddy
    // parking page in the website segment. Same hard-fail as the 4xx case.
    //
    // Fix: when audit returns empty across title + h1 + wordCount, abandon
    // the lead. The cause might be:
    //   - JS-rendered parking page (Palisades case)
    //   - Site requires user-agent we don't send
    //   - Site bot-blocked us before content rendered
    //   - Site actually has no content
    // ANY of these → can't record a useful website segment → skip the lead.
    const titleEmpty = !data.title || !data.title.trim();
    const h1Empty = !data.h1 || !data.h1.trim();
    const wordCountVeryLow = !Number.isFinite(data.wordCount) || data.wordCount < 30;
    if (titleEmpty && h1Empty && wordCountVeryLow && !findings.siteLooksParked) {
      const err = new Error(
        `[step-2.5 ABANDON] Empty audit for ${websiteUrl} ` +
        `(title="${(data.title || '').slice(0, 40)}" h1="${(data.h1 || '').slice(0, 40)}" wordCount=${data.wordCount}). ` +
        `Likely JS-rendered parking page, bot-blocked, or empty site. ` +
        `Abandoning lead to avoid shipping a video with a blank/parked website segment.`
      );
      err.skipLead = true;
      err.emptyAudit = true;
      throw err;
    }

    // H1 category check: use first 2 words of category for specificity (avoid single generic words)
    let category = String(business.category || '').toLowerCase().trim();
    if (!category && business.searchTerm) {
      const m = String(business.searchTerm).toLowerCase().match(/^([a-z\s]+?)(?:\s+in\s+|\s+near\s+|$)/);
      if (m) category = m[1].trim();
    }
    const city = String(business.city || '').toLowerCase();
    const h1Lower = data.h1.toLowerCase();
    const catPhrase = category ? category.split(/\s+/).slice(0, 2).join(' ') : '';
    // Stem-based category match (locked 2026-05-21): "Plumber" should also
    // match "Plumbing" in a title/h1. The old exact-match check fired false
    // claims on Monkey Wrench (title "Plumbing, Heating, Air, Electric" but
    // CSV category "Plumber" → didn't match → finding fired falsely).
    // Strategy: derive a stem by stripping common verbal suffixes, then check
    // either the original phrase OR the stem. Plus a small canonical-stem map
    // for irregular verticals (hvac/electrician/etc.).
    const SERVICE_STEM_MAP = {
      plumber: ['plumb'], plumbing: ['plumb'],
      roofer: ['roof'], roofing: ['roof'],
      electrician: ['electric'], electric: ['electric'],
      hvac: ['hvac', 'heating', 'cooling', 'air conditioning', 'heat', 'a/c'],
      'garage door': ['garage door', 'garage-door'],
      locksmith: ['lock', 'locksmith'],
      dentist: ['dent', 'dentist'],
      landscaper: ['landscap'], landscaping: ['landscap'],
      mover: ['mov'], moving: ['mov'],
      cleaner: ['clean'], cleaning: ['clean'],
      painter: ['paint'], painting: ['paint'],
      contractor: ['contract'], construction: ['construct'],
    };
    function stemMatch(haystack, catLower) {
      if (!catLower || catLower.length < 3) return false;
      if (haystack.includes(catLower)) return true;
      // Per-category synonym/stem list
      const stems = SERVICE_STEM_MAP[catLower] || [];
      for (const s of stems) if (haystack.includes(s)) return true;
      // Generic suffix strip: -er, -ers, -or, -ors, -ing
      const stripped = catLower.replace(/(ers?|ors?|ing)$/, '');
      if (stripped.length >= 4 && stripped !== catLower && haystack.includes(stripped)) return true;
      return false;
    }
    // LA-area city tokens — RGA's target market. Title containing ANY of these
    // is a valid local signal (a business may HQ in Los Angeles but service
    // Santa Monica or vice-versa). Locked 2026-05-21 after Monkey Wrench title
    // "Los Angeles" was falsely flagged for missing the CSV "Santa Monica".
    const CITY_TOKENS = [
      'los angeles', 'l.a.', 'la county',
      'beverly hills', 'santa monica', 'culver city', 'west hollywood',
      'hollywood', 'pasadena', 'burbank', 'glendale', 'long beach',
      'inglewood', 'manhattan beach', 'redondo beach', 'hermosa beach',
      'el segundo', 'torrance', 'venice', 'marina del rey', 'westwood',
      'brentwood', 'pacific palisades', 'malibu', 'studio city',
      'sherman oaks', 'encino', 'tarzana', 'woodland hills', 'van nuys',
      'north hollywood', 'silver lake', 'echo park', 'mid-wilshire',
      'koreatown', 'downtown la', 'dtla', 'mid-city',
    ];
    function cityIncluded(haystack, csvCity) {
      if (csvCity && haystack.includes(csvCity)) return true;
      return CITY_TOKENS.some(c => haystack.includes(c));
    }
    findings.h1IncludesCategory = !!(catPhrase && stemMatch(h1Lower, catPhrase));
    findings.h1IncludesCity = cityIncluded(h1Lower, city);

    // Same logic for title tag (W1)
    const titleLower = (data.title || '').toLowerCase();
    findings.titleIncludesCategory = !!(catPhrase && stemMatch(titleLower, catPhrase));
    findings.titleIncludesCity = cityIncluded(titleLower, city);

    findings.hasMobileClickToCall = data.clickToCallCount > 0;

    if (business.phone) {
      const gbpPhone = normalizePhone(business.phone);
      const sitePhones = (data.phoneNumbers || []).map(normalizePhone);
      const anyMatch = sitePhones.some((p) => p === gbpPhone);
      const prominent = data.prominentPhone || null;
      const prominentMatches = prominent ? prominent === gbpPhone : null;
      const distinctCount = (data.uniqueSitePhones || []).length;

      findings.prominentSitePhone = prominent;
      findings.prominentPhoneMatchesGbp = prominentMatches;
      findings.distinctSitePhoneCount = distinctCount;
      findings.uniqueSitePhones = data.uniqueSitePhones || [];

      // STRICT semantics: NAP "matches" only when the visitor-prominent phone
      // matches GBP AND there's only one distinct number on the site. Any header
      // CTA showing a different number (call tracker, lead aggregator) is a
      // real NAP issue Google and visitors both see.
      if (prominentMatches === false || distinctCount > 1) {
        findings.websitePhoneMatchesGbp = false;
      } else if (sitePhones.length > 0) {
        findings.websitePhoneMatchesGbp = anyMatch;
      }
    }
  } catch (err) {
    findings.error = err.message || String(err);
  } finally {
    if (page) await page.close().catch(() => {});
  }
  // Master verification flag: true when website audit ran successfully end-to-end.
  // Used by step-6 to gate every absence-claim website finding (schema, noReviews,
  // noServiceArea, napAboveFold etc.) — if audit failed, all "X is missing" claims
  // are suppressed because we don't actually know.
  findings.websiteAuditVerified = !findings.error && findings.pageLoadSeconds != null;
  // Source-aware review-widget override (locked 2026-05-21 round 2/3).
  // When the visible-DOM detectors found NO reviews but the page SOURCE
  // mentions reviews/ratings (anywhere — hidden elements, attributes,
  // scripts, lazy-loaded widget setup code), the absence is unknowable.
  // Set to null so step-6 suppresses the noReviews finding.
  //
  // Caught on Enviro Plumbing: iframeCount=0 but visible "4.6 / 813 reviews"
  // widget exists — likely shadow DOM or JS-injected post-eval. Source HTML
  // mentions "reviews" multiple times → confidence the widget exists.
  if (findings.hasReviewsOnPage === false) {
    if (findings.iframeCount > 0) {
      findings.hasReviewsOnPage = null;
      console.log('  [audit-diag] hasReviewsOnPage: page has iframes — absence unverifiable, set to null (suppresses noReviews finding).');
    } else if (findings._reviewsMentionedInSource) {
      findings.hasReviewsOnPage = null;
      console.log('  [audit-diag] hasReviewsOnPage: source HTML mentions reviews/ratings but visible widget not detected — absence unverifiable, set to null (suppresses noReviews finding).');
    }
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
    // New checks added 2026-06-19 (Google mobile-friendly criteria):
    baseFontPx: null,                // computed body font-size in px (legible-font check)
    contentWiderThanViewport: null,  // horizontal-scroll / content wider than screen
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
    // Give async third-party scripts (chat widgets, sticky-CTA bars, social
    // proof injectors) time to render before evaluating. Most chat widgets
    // (Tidio/Drift/Intercom/Tawk and custom builds) inject between 500ms-2.5s.
    // 2026-05-28 BUMPED 2500 → 5000ms: AI chatbot widgets like Chatbase
    // inject their DOM elements at ~3-4s after domcontentloaded. Caught on
    // Royal Moving Marina Del Rey — Chatbase elements (#chatbase-bubble-button,
    // #chatbase-message-bubbles, #chatbase-bubble-window) were absent at 2.5s
    // but present at 4s, leading to a false "no tap-to-text" voiceover claim.
    await new Promise((r) => setTimeout(r, 5000));

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
        baseFontPx: null,
        contentWiderThanViewport: false,
      };

      // Mobile legibility: computed body font-size (Google guideline ~16px; <12px fails).
      try {
        const bf = parseFloat(getComputedStyle(document.body).fontSize);
        if (Number.isFinite(bf)) result.baseFontPx = Math.round(bf);
      } catch (_) {}
      // Content wider than the mobile viewport → horizontal scroll (8px tolerance for scrollbars).
      try {
        result.contentWiderThanViewport = document.documentElement.scrollWidth > (window.innerWidth + 8);
      } catch (_) {}

      const vp = document.querySelector('meta[name="viewport"]');
      if (vp) {
        result.hasViewportMeta = true;
        result.viewportContent = vp.getAttribute('content') || '';
      }

      const foldHeight = window.innerHeight;
      // Path 1: native <a href="tel:..."> link above fold
      const tels = Array.from(document.querySelectorAll('a[href^="tel:"]'));
      for (const a of tels) {
        const r = a.getBoundingClientRect();
        if (r.top >= 0 && r.top < foldHeight && r.width > 0 && r.height > 0) {
          result.clickToCallAboveFold = true;
          break;
        }
      }
      // Path 2 (fallback): button-shaped element above fold containing a visible
      // US phone number. Catches styled CTAs that wrap tel: dialing in JS or
      // use image/div buttons (e.g. XP Garage & Gate Experts orange CTA bar
      // showing "(818) 337-2533" — caught 2026-05-18 review).
      if (!result.clickToCallAboveFold) {
        const PHONE_RX = /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
        const clickables = Array.from(document.querySelectorAll(
          'button, a, [role="button"], [onclick], [class*="btn" i], [class*="button" i], [class*="phone" i], [class*="call" i]'
        ));
        for (const el of clickables) {
          const r = el.getBoundingClientRect();
          if (r.top >= 0 && r.top < foldHeight && r.width > 0 && r.height > 0) {
            const text = (el.innerText || el.textContent || '').trim();
            const ariaLabel = (el.getAttribute('aria-label') || '').trim();
            if (PHONE_RX.test(text) || PHONE_RX.test(ariaLabel)) {
              result.clickToCallAboveFold = true;
              break;
            }
          }
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
      // 2026-06-11: exclude back-to-top / scroll-to-top controls (see desktop note).
      const NAV_LIKE_MOBILE = /^(?:toggle\s*menu|menu|open\s*menu|close\s*menu|navigation|hamburger|skip\s*to\s*content|×|☰|≡|search|top|back\s*to\s*top|scroll\s*to\s*top|go\s*to\s*top|↑|⬆|\^)$/i;
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
      // Search both leaf nodes (most common) AND small wrapper elements
      // (catches button containers with icon+text children — XP's orange CTA bar
      // was missed by leaf-only scan, 2026-05-18 review).
      const phoneRegex = /\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/;
      const phoneCandidates = Array.from(document.querySelectorAll(
        'span, p, div, a, button, [role="button"], h1, h2, h3, h4, h5, h6, li, td'
      ));
      let phoneVisibleAboveFold = false;
      for (const el of phoneCandidates) {
        const txt = (el.innerText || el.textContent || '').trim();
        // Limit length so we don't match phones buried in large page sections
        // (a body wrapping everything would always match). 280 chars is enough
        // for a button caption, a heading, a sidebar phone line, etc.
        if (txt.length > 280 || !phoneRegex.test(txt)) continue;
        const r = el.getBoundingClientRect();
        if (r.top >= 0 && r.top < mobileFold && r.width > 0 && r.height > 0) {
          phoneVisibleAboveFold = true;
          break;
        }
      }
      result.phoneVisibleAboveFold = phoneVisibleAboveFold;

      // Detect an obvious CALL CTA above the fold. ANY of:
      //   (a) tel: link with "Call" / "Call Now" / "Tap to Call" / etc. label
      //       on self, ancestors, aria-label, title, alt
      //   (b) tel: link that's button-sized (≥30×30 px) and visible above fold
      //       — mobile users universally recognize phone-icon buttons as call
      //       actions, even without text labels
      //   (c) tel: link that contains an icon child (svg / i.fa-phone / img)
      //
      // Locked 2026-05-21 after Monkey Wrench's mobile hero had a phone-icon
      // CALL button (no "Call" text label, just the icon). step-6's
      // phoneNotVisible finding fires only when none of the above hit AND no
      // digits visible — preventing false "number not visible" claims when
      // the call-action affordance is unmistakable.
      let hasObviousCallCta = false;
      const callTextRe = /\b(call\s*now|tap\s*to\s*call|call\s*us|call\s*today|click\s*to\s*call|\bcall\b|\bphone\b)/i;
      const telLinks = Array.from(document.querySelectorAll('a[href^="tel:" i]'));
      for (const el of telLinks) {
        const r = el.getBoundingClientRect();
        if (!(r.top >= 0 && r.top < mobileFold && r.width > 0 && r.height > 0)) continue;
        // (a) Label match — text on self or up to 2 ancestors
        const labelSources = [];
        let cursor = el;
        for (let i = 0; i < 3 && cursor; i++) {
          labelSources.push(cursor.getAttribute && (cursor.getAttribute('aria-label') || ''));
          labelSources.push(cursor.getAttribute && (cursor.getAttribute('title') || ''));
          labelSources.push(cursor.getAttribute && (cursor.getAttribute('alt') || ''));
          labelSources.push((cursor.innerText || cursor.textContent || '').trim());
          cursor = cursor.parentElement;
        }
        if (labelSources.some(s => s && callTextRe.test(s))) {
          hasObviousCallCta = true;
          break;
        }
        // (b) Button-sized icon-only tel: link
        const isButtonSized = r.width >= 30 && r.height >= 30;
        // (c) Contains a phone icon (svg, i.fa-*, img) — strong UI affordance
        const hasIconChild = !!el.querySelector('svg, i[class*="phone" i], i[class*="fa-phone" i], img');
        if (isButtonSized && (hasIconChild || el.classList.length > 0 || el.querySelector('button'))) {
          hasObviousCallCta = true;
          break;
        }
      }
      result.hasObviousCallCta = hasObviousCallCta;

      // Tier 2: social proof above fold (star rating or review count visible
      // in hero). Broadened 2026-05-21 after Enviro Plumbing false-claim —
      // "4.6 Rated OUTSTANDING / 813 reviews" widget IS in hero but detector
      // missed it because the rating widget uses SVG stars + numeric values
      // in separate elements; the OLD class-only scan only matched empty
      // wrapper divs OR text was longer than 500 chars when joined.
      const SOCIAL_PROOF_RE = /★|☆|⭐|\d+(\.\d+)?\s*stars?\b|\b\d{2,}\s*(?:reviews?|ratings?)\b|\d+(\.\d+)?\s*(?:out\s*of|\/)\s*5|\brated\s*(?:outstanding|excellent|great|good)/i;
      let socialProofAboveFold = false;
      // Class/id match — any visible element above fold with a review/rating
      // class. Allow empty inner text (the widget may render its number/stars
      // in shadow DOM or SVG children).
      const spEls = Array.from(document.querySelectorAll(
        '[class*="star" i], [class*="rating" i], [class*="review" i], [class*="testimonial" i], [class*="trustpilot" i], [class*="yotpo" i], [class*="trustindex" i], [class*="birdeye" i], [class*="podium" i]'
      ));
      for (const el of spEls) {
        const r = el.getBoundingClientRect();
        if (r.top >= 0 && r.top < mobileFold && r.width >= 20 && r.height >= 20) {
          socialProofAboveFold = true;
          break;
        }
      }
      // Text match — scan all visible elements above the mobile fold for
      // rating/review patterns. Was failing because the OLD scan only checked
      // the FIRST 500 chars of body.innerText, missing widgets rendered later
      // in source order even if they're visually high on the page.
      if (!socialProofAboveFold) {
        const allEls = Array.from(document.querySelectorAll('*'));
        for (const el of allEls) {
          const r = el.getBoundingClientRect();
          if (r.width < 20 || r.height < 15) continue;
          if (r.top < 0 || r.top >= mobileFold) continue;
          const txt = (el.innerText || el.textContent || '').trim();
          if (txt.length === 0 || txt.length > 600) continue;
          if (SOCIAL_PROOF_RE.test(txt)) {
            socialProofAboveFold = true;
            break;
          }
        }
      }
      // SVG star detection — many modern review widgets use SVG stars
      // (yotpo, birdeye, trustindex, custom). Check if any SVG with a
      // star/rating class/id is visible above fold.
      if (!socialProofAboveFold) {
        const svgs = Array.from(document.querySelectorAll('svg[class*="star" i], svg[class*="rating" i], i[class*="fa-star" i]'));
        for (const el of svgs) {
          const r = el.getBoundingClientRect();
          if (r.top >= 0 && r.top < mobileFold && r.width > 0 && r.height > 0) {
            socialProofAboveFold = true;
            break;
          }
        }
      }
      result.socialProofAboveFold = socialProofAboveFold;
      // Source-aware fallback (same pattern as auditWebsite). If we found no
      // visible social proof but the page source mentions reviews/ratings,
      // we can't be sure the widget isn't above-fold — set to null later.
      result._reviewsMentionedInSource = /\b(reviews?|ratings?|testimonials?|rated\s+(?:outstanding|excellent|great)|aggregaterating)\b/i.test((document.body?.outerHTML || '').slice(0, 80000));

      // Click-to-text (Mo2) — `<a href="sms:">` anywhere on the page
      result.hasClickToText = !!document.querySelector('a[href^="sms:"]');

      // Chat-widget / popup detection (2026-05-19). When a site uses a
      // third-party chat widget OR custom popup that contains the phone/sms
      // CTAs, our above-the-fold checks miss those CTAs and fire false-
      // negatives. Two signals captured:
      //   - hasChatWidget: known widget signature OR generic popup detected
      //   - chatWidgetHasPhoneCta: a tel:/sms: link OR phone-number text found
      //     inside the widget DOM. step-6 reframes the c2cFold/clickToText
      //     findings to "buried in chat widget" when this is true, and
      //     suppresses them when widget present but CTA presence unclear.
      // Memory: feedback_audit_chat_widget_detection.md.
      const CHAT_WIDGET_SELECTORS = [
        // Classic chat widget vendors
        'iframe[name*="intercom" i]', 'iframe[id*="intercom" i]',
        'iframe[id*="drift" i]', 'iframe[id*="tawk" i]',
        'iframe[id*="tidio" i]', 'iframe[id*="hubspot-conv" i]',
        'iframe[id*="crisp" i]', 'iframe[id*="livechat" i]',
        'iframe[src*="chat" i]', 'iframe[src*="messenger" i]',
        '[class*="intercom-launcher" i]', '[class*="drift-conductor" i]',
        '[class*="drift-widget" i]', '[class*="tawk-min" i]',
        '[class*="tidio-chat" i]', '[class*="olark" i]',
        '[class*="crisp-client" i]', '[id*="livechat-widget" i]',
        '[class*="chat-widget" i]', '[id*="chat-widget" i]',
        '[class*="chatbot" i]', '[class*="chat-button" i]',
        '[class*="hs-shadow" i]',
        // 2026-05-28 — AI chatbot widgets caught missing from Royal Moving
        // (chatbase) and similar Gen-AI providers increasingly common on
        // local-business sites. The clickToText finding was firing on Royal
        // Moving because we didn't detect their chatbase widget; Chris
        // caught the false claim.
        'iframe[src*="chatbase.co" i]', '[id*="chatbase" i]', '[class*="chatbase" i]',
        'iframe[src*="voiceflow" i]', '[id*="voiceflow" i]',
        'iframe[src*="botpress" i]', '[id*="botpress" i]',
        'iframe[src*="landbot" i]', '[id*="landbot" i]',
        'iframe[src*="botsonic" i]', '[id*="botsonic" i]',
        'iframe[src*="manychat" i]', '[id*="manychat" i]',
        'iframe[src*="servicebell" i]', '[id*="servicebell" i]',
        'iframe[src*="kommunicate" i]', '[id*="kommunicate" i]',
        'iframe[src*="chaport" i]', '[id*="chaport" i]',
        'iframe[src*="jivosite" i]', '[id*="jivosite" i]', '[class*="jivosite" i]',
        'iframe[src*="smartsupp" i]', '[id*="smartsupp" i]',
        'iframe[src*="userlike" i]', '[id*="userlike" i]',
        'iframe[src*="freshchat" i]', '[class*="freshchat" i]',
        'iframe[src*="zendesk" i]', '[id*="zendesk" i]', '[id*="zE-widget" i]',
        'iframe[src*="gorgias" i]', '[id*="gorgias" i]',
        'iframe[src*="liveperson" i]', '[class*="lp-widget" i]',
        'iframe[src*="chatra" i]', '[id*="chatra" i]',
        // Generic launcher/bubble patterns used by many AI chatbots
        '[id*="chat-launcher" i]', '[class*="chat-launcher" i]',
        '[id*="chat-bubble" i]', '[class*="chat-bubble" i]',
        '[id*="chat-frame" i]', '[class*="chat-frame" i]',
      ];
      let chatWidgetEl = null;
      for (const sel of CHAT_WIDGET_SELECTORS) {
        const el = document.querySelector(sel);
        if (el) { chatWidgetEl = el; break; }
      }
      // 2026-05-28: many AI chatbot widgets (Chatbase, Voiceflow, Botpress,
      // Botsonic, etc.) inject their iframe asynchronously after their embed
      // script loads. Puppeteer may scan the DOM before the iframe is
      // attached, so the iframe selectors above miss them. Use the presence
      // of the <script> tag from a known chatbot vendor's CDN as a reliable
      // proxy — if the script is loaded, the widget IS configured on this
      // site regardless of whether the iframe has hydrated yet.
      if (!chatWidgetEl) {
        const CHATBOT_SCRIPT_HOSTS = [
          'chatbase.co', 'voiceflow.com', 'botpress.com', 'botpress.cloud',
          'landbot.io', 'botsonic.com', 'manychat.com', 'servicebell.com',
          'kommunicate.io', 'chaport.com', 'jivosite.com', 'jivo.chat',
          'smartsupp.com', 'userlike.com', 'freshchat.com', 'freshworks.com',
          'zendesk.com', 'zopim.com', 'gorgias.chat', 'liveperson.net',
          'chatra.io', 'tidio.co', 'drift.com', 'intercom.io', 'tawk.to',
          'crisp.chat', 'olark.com', 'hubspot.com',
        ];
        const scripts = Array.from(document.querySelectorAll('script[src]'));
        for (const s of scripts) {
          const src = (s.getAttribute('src') || '').toLowerCase();
          if (CHATBOT_SCRIPT_HOSTS.some((h) => src.includes(h))) {
            chatWidgetEl = s;
            break;
          }
        }
      }
      // Generic popup catch — covers custom widgets like the Santa Monica
      // Roofing Company "Kevin Price - Owner / Need Help?" panel that doesn't
      // use a known chat framework.
      //
      // Tightened 2026-05-21: previously matched any element with a class
      // containing "widget"/"popup"/"modal"/"floating" that had a phone link
      // inside — that false-positived on most CMS templates (GoDaddy, Wix,
      // and others use "widget" / "popup" classes for layout components that
      // are NOT chat widgets). The false positive killed the "no tap-to-text"
      // finding in step-6, which is gated on hasChatWidget !== true.
      //
      // Now requires BOTH a popup-ish container AND explicit chat-indicator
      // text inside it (chat / help / message / support / "ask us" / "let's
      // talk"). Without those keywords, a popup with a phone link is more
      // likely a contact card / banner than a chat widget.
      // Generic catch — tightened 2026-05-21, then re-broadened same day after
      // Monkey Wrench's "Let's chat" widget was missed.
      //
      // Two-pass:
      //   Pass 1 — class-based candidate scan (existing). Matches widgets with
      //     class names like "chat-button", "floating-launcher", etc.
      //   Pass 2 — text-based fallback. Any visible element under 80 chars
      //     whose innerText matches a chat phrase ("Let's chat", "Chat with
      //     us", etc.) counts as a chat widget — even without telltale class
      //     names. Common for hand-built chat triggers and bottom-bar pills.
      //
      // CRITICAL: don't require an inner phone/sms link. Pure chat widgets
      // (chat-only, no phone) are still chat widgets — they're a valid text
      // conversion path and gate the noSMS finding. The phone-CTA detection
      // (chatWidgetHasPhoneCta) is a SEPARATE downstream flag.
      if (!chatWidgetEl) {
        const CHAT_TEXT_RE = /\b(chat\b|chat with|live\s*chat|need\s*help|can\s*we\s*help|how\s*can\s*we\s*help|message\s*us|text\s*us|ask\s*us|let'?s\s*chat|let'?s\s*talk|talk\s*to\s*us|support|customer\s*service|24\/?7\s*help)/i;
        const candidates = Array.from(document.querySelectorAll(
          '[role="dialog"], [class*="popup" i], [class*="floating" i], [class*="chat" i], [class*="bubble" i], [class*="launcher" i]'
        ));
        for (const el of candidates) {
          const txt = (el.innerText || '').trim();
          if (!txt) continue;
          if (!CHAT_TEXT_RE.test(txt)) continue;
          chatWidgetEl = el;
          break;
        }
      }
      // Text-based fallback: visible button-sized element whose entire short
      // text matches a chat phrase. Catches hand-built chat pills like the
      // Monkey Wrench "Let's chat" button (class doesn't include "chat").
      if (!chatWidgetEl) {
        const SHORT_CHAT_RE = /^(?:let'?s\s*chat|chat|chat with us|live\s*chat|need\s*help\??|message\s*us|text\s*us|ask\s*us|talk\s*to\s*us|support)$/i;
        const visibleEls = Array.from(document.querySelectorAll('button, a, div, span')).filter((el) => {
          const r = el.getBoundingClientRect();
          if (r.width < 40 || r.height < 20 || r.width > 400) return false;
          const cs = window.getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.3) return false;
          return true;
        });
        for (const el of visibleEls) {
          const txt = (el.innerText || el.textContent || '').trim();
          if (!txt || txt.length > 30) continue;
          if (SHORT_CHAT_RE.test(txt)) { chatWidgetEl = el; break; }
        }
      }
      result.hasChatWidget = !!chatWidgetEl;
      result.chatWidgetHasPhoneCta = false;
      if (chatWidgetEl) {
        const widgetText = (chatWidgetEl.innerText || '').trim();
        const hasTelLink = !!chatWidgetEl.querySelector('a[href^="tel:" i], a[href^="sms:" i]');
        const hasPhoneText = phoneRegex.test(widgetText);
        result.chatWidgetHasPhoneCta = hasTelLink || hasPhoneText;
      }

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
    findings.baseFontPx = data.baseFontPx ?? null;
    findings.contentWiderThanViewport = data.contentWiderThanViewport ?? null;
    findings.primaryCtaText = data.primaryCtaText || null;
    findings.phoneVisibleAboveFold = data.phoneVisibleAboveFold || false;
    findings.hasObviousCallCta = data.hasObviousCallCta || false;
    findings.socialProofAboveFold = data.socialProofAboveFold || false;
    findings._reviewsMentionedInSource = !!data._reviewsMentionedInSource;
    findings.hasClickToText = data.hasClickToText || false;
    findings.hasChatWidget = !!data.hasChatWidget;
    findings.chatWidgetHasPhoneCta = !!data.chatWidgetHasPhoneCta;

    // Sticky CTA on scroll (Mo1) — scroll past initial fold then check whether
    // any fixed/sticky CTA stays visible. Done as a Node-side scroll then a
    // separate evaluate so the layout has time to settle.
    await page.evaluate(() => window.scrollTo({ top: 1000, behavior: 'instant' })).catch(() => {});
    await new Promise((r) => setTimeout(r, 400));
    // Verification context for widget detection. Captures:
    //   - fixedElementCount: how many fixed/sticky DOM nodes exist (proves
    //     our position-based detector saw something to check)
    //   - iframeCount: how many iframes are on the page (proxy for third-
    //     party widgets we can't introspect — chat, social, maps embeds).
    //     When iframes exist AND our detector finds nothing, the absence is
    //     UNKNOWABLE from headless DOM, not actually empty.
    //
    // Locked 2026-05-21 (round 2): caught when Monkey Wrench's "Let's chat"
    // + "SHOP" sticky pills are visible in a real browser but invisible to
    // headless Playwright (likely iframe-rendered or bot-blocked).
    const widgetContext = await page.evaluate(() => {
      const fixedEls = Array.from(document.querySelectorAll('*')).filter((el) => {
        try {
          const cs = window.getComputedStyle(el);
          return (cs.position === 'fixed' || cs.position === 'sticky');
        } catch { return false; }
      });
      return {
        fixedElementCount: fixedEls.length,
        iframeCount: document.querySelectorAll('iframe').length,
      };
    }).catch(() => ({ fixedElementCount: 0, iframeCount: 0 }));
    findings.stickyCtaVerified = widgetContext.fixedElementCount > 0;
    findings.iframeCount = widgetContext.iframeCount;

    findings.hasStickyCta = await page.evaluate(() => {
      // FAST PATH (locked 2026-05-21 round 3): if ANY visible above-fold
      // tel: link is at y < 120 after scroll (i.e., positioned at the top of
      // the viewport regardless of page scroll position), treat as sticky.
      // Catches JS-driven sticky navs where the position:fixed style is on
      // an ancestor more than 5 levels up OR is set programmatically via
      // scroll listeners (computed-style returns 'static' but visually the
      // bar follows the viewport top). Enviro Plumbing's navbar fits this.
      const fastTels = Array.from(document.querySelectorAll('a[href^="tel:" i]'));
      for (const el of fastTels) {
        const r = el.getBoundingClientRect();
        const cs = window.getComputedStyle(el);
        if (r.width < 20 || r.height < 15) continue;
        if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.1) continue;
        // r.top < 120 means the link is in the top ~120px of the viewport
        // after our y=1000 scroll. Hard-fixed or JS-stuck — either way
        // it's visually persistent as a call CTA.
        if (r.top >= 0 && r.top < 120 && r.right > 0 && r.left < window.innerWidth) {
          return true;
        }
      }
      const NAV_LIKE = /^(?:toggle\s*menu|menu|open\s*menu|close\s*menu|navigation|hamburger|skip\s*to\s*content|×|☰|≡|search|cart|account|sign\s*in|log\s*in|home|about|services|areas\s*served|resources|gallery|portfolio|blog|news|faq|locations?|reviews)$/i;
      // Recognized CTA verbs — sticky pill/bar must contain one of these to
      // count as a conversion-path button (not just any fixed element).
      // Locked 2026-05-21: broadened from call/contact-only to include shop,
      // book, chat, quote, buy, order, schedule, appointment, message, get,
      // start. Caught when Monkey Wrench's sticky "SHOP" + "Let's chat"
      // buttons were both missed by the narrow original list.
      const CTA_VERB_RE = /\b(call(?:\s*now)?|tap\s*to\s*call|click\s*to\s*call|contact|reach\s*out|chat|let'?s\s*chat|message|text\s*us|quote|book(?:\s*now)?|schedule|appointment|shop|buy|order|get\s*(?:started|quote|estimate)|start|estimate|consult|talk\s*to\s*us)\b/i;
      // Hamburger-drawer detection — if the fixed ancestor IS a closed mobile
      // nav drawer (off-screen-left, holds the site nav), every link in it is
      // a nav item, NOT a sticky CTA. Detect by ancestor class names.
      const DRAWER_RE = /\b(drawer|sidebar|side-?menu|nav-?(menu|drawer|panel)|mobile-?(nav|menu)|off-?canvas|hamburger-?panel|menu-?panel|overlay-?menu)\b/i;
      const candidates = Array.from(document.querySelectorAll(
        'a[href^="tel:"], a[href*="contact"], a[href*="quote"], a[href*="schedule"], a[href*="book"], a[href*="appointment"], a[href*="shop"], a[href*="chat"], a[class*="cta"], a[class*="button" i], a[class*="btn" i], a[class*="chat" i], a[class*="shop" i], button, div[class*="sticky" i] a, div[class*="fixed" i] a, div[class*="sticky" i] button, div[class*="fixed" i] button'
      ));
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      for (const el of candidates) {
        const style = window.getComputedStyle(el);
        const pos = style.position;
        // Walk up to ancestor in case the element itself isn't fixed but a parent wrapper is
        let isFixed = (pos === 'fixed' || pos === 'sticky');
        let fixedAncestor = null;
        if (!isFixed) {
          let p = el.parentElement;
          for (let i = 0; i < 5 && p; i++) {
            const ps = window.getComputedStyle(p);
            if (ps.position === 'fixed' || ps.position === 'sticky') {
              isFixed = true;
              fixedAncestor = p;
              break;
            }
            p = p.parentElement;
          }
        }
        if (!isFixed) continue;
        // Skip if the link or its fixed ancestor itself is hidden / transparent.
        if (style.visibility === 'hidden' || style.display === 'none' || parseFloat(style.opacity) < 0.1) continue;
        if (fixedAncestor) {
          const as = window.getComputedStyle(fixedAncestor);
          if (as.visibility === 'hidden' || as.display === 'none' || parseFloat(as.opacity) < 0.1) continue;
          // If the fixed ancestor looks like a hamburger drawer by class name OR
          // is positioned outside the horizontal viewport (off-screen-left/right
          // hamburger pattern), the links inside are nav items, not a sticky CTA.
          const ar = fixedAncestor.getBoundingClientRect();
          if (ar.right <= 0 || ar.left >= vw) continue;
          const acls = (fixedAncestor.className?.toString() || '');
          if (DRAWER_RE.test(acls)) continue;
        }
        const r = el.getBoundingClientRect();
        if (r.width < 40 || r.height < 20) continue;
        // BOTH-axis viewport check (was Y-only — let an off-screen-left hamburger
        // drawer pass on Santa Monica Drain Co.'s mobile 2026-05-21).
        if (r.bottom <= 0 || r.top >= vh) continue;
        if (r.right <= 0 || r.left >= vw) continue;
        // Text-or-attribute identity. Some sites render the phone number inside
        // a child <span> that's animated/hidden, leaving the link's innerText
        // empty. Fall back to aria-label, title, alt, and href value itself
        // (tel:+14245337776 → treat as "call"). Locked 2026-05-21 after Enviro
        // Plumbing's fixed navbar tel: link was missed because innerText="".
        let txt = ((el.innerText || el.textContent || '') + '').trim();
        if (!txt) {
          txt = (el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('alt') || '').trim();
        }
        if (!txt && el.tagName === 'A') {
          const href = (el.getAttribute('href') || '').toLowerCase();
          if (href.startsWith('tel:') || href.startsWith('sms:')) txt = 'call';
        }
        if (!txt || NAV_LIKE.test(txt)) continue;
        return true;
      }
      // SECOND PASS (locked 2026-05-21): broad sweep — ANY visible fixed/sticky
      // button-sized element whose text matches a CTA verb (call/shop/chat/
      // book/quote/etc.). Catches sticky pills that don't match the narrow
      // anchor/class candidate selector above (e.g., MW's "SHOP" / "Let's chat"
      // floating pills that are custom JS buttons with no href or recognized
      // class). Memory: feedback_sticky_cta_off_screen_drawer_false_positive.md.
      const allEls = Array.from(document.querySelectorAll('a, button, div, span, [role="button"]'));
      for (const el of allEls) {
        const style = window.getComputedStyle(el);
        let isFixed = (style.position === 'fixed' || style.position === 'sticky');
        let fixedAncestor = null;
        if (!isFixed) {
          let p = el.parentElement;
          for (let i = 0; i < 4 && p; i++) {
            const ps = window.getComputedStyle(p);
            if (ps.position === 'fixed' || ps.position === 'sticky') { isFixed = true; fixedAncestor = p; break; }
            p = p.parentElement;
          }
        }
        if (!isFixed) continue;
        if (style.visibility === 'hidden' || style.display === 'none' || parseFloat(style.opacity) < 0.1) continue;
        if (fixedAncestor) {
          const ar = fixedAncestor.getBoundingClientRect();
          if (ar.right <= 0 || ar.left >= vw) continue;
          if (DRAWER_RE.test(fixedAncestor.className?.toString() || '')) continue;
        }
        const r = el.getBoundingClientRect();
        if (r.width < 40 || r.height < 20 || r.width > 400) continue; // pill-sized only
        if (r.bottom <= 0 || r.top >= vh) continue;
        if (r.right <= 0 || r.left >= vw) continue;
        const txt = (el.innerText || el.textContent || '').trim();
        if (!txt || txt.length > 40 || NAV_LIKE.test(txt)) continue;
        if (!CTA_VERB_RE.test(txt)) continue; // must say a CTA verb
        return true;
      }
      return false;
    }).catch(() => null);
    // Scroll back to top to leave the page in a clean state
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })).catch(() => {});

    // Iframe-aware override (locked 2026-05-21 round 2, REFINED 2026-06-02):
    // The original Monkey Wrench fix blanket-converted false → null whenever
    // ANY iframes existed. Too broad — Maps embeds, YouTube players, social
    // embeds, etc. all triggered the safety even on sites where no widget-style
    // iframe (chat, sticky pill, social proof widget) was present.
    //
    // BHRC case 2026-06-02: site has iframes (Maps embed + media) but visually
    // NO sticky CTA. Our blanket null conversion suppressed a legitimate finding.
    //
    // Refined: only convert false → null when at least one iframe matches a
    // KNOWN WIDGET pattern (chat/sticky/review providers we can't introspect
    // cross-origin). If all iframes are content embeds, trust the DOM scan.
    const WIDGET_IFRAME_SRC_RE = /\b(intercom|drift\.com|tawk\.to|freshchat|livechat|zoho|hubspot|crisp\.chat|olark|tidio|zendesk|smartsupp|messenger\.com|m\.me|trustpilot|yotpo|birdeye|reviewfilter|grade\.us|podium|nicejob|reviewbuzz|chatbase|signaling|chat-widget|sticky)\b/i;
    const widgetIframeCount = await page.evaluate((reStr) => {
      const re = new RegExp(reStr, 'i');
      return Array.from(document.querySelectorAll('iframe'))
        .filter((f) => re.test((f.src || '') + ' ' + (f.title || '') + ' ' + (f.className || ''))).length;
    }, WIDGET_IFRAME_SRC_RE.source).catch(() => 0);
    if (widgetIframeCount > 0) {
      if (findings.hasStickyCta === false) {
        findings.hasStickyCta = null;
        console.log(`  [audit-diag] hasStickyCta: page has ${widgetIframeCount} widget-pattern iframe(s) — absence unverifiable, set to null.`);
      }
      if (findings.hasChatWidget === false) {
        findings.hasChatWidget = null;
        console.log(`  [audit-diag] hasChatWidget: page has ${widgetIframeCount} widget-pattern iframe(s) — absence unverifiable, set to null.`);
      }
    } else if (findings.iframeCount > 0) {
      console.log(`  [audit-diag] page has ${findings.iframeCount} iframe(s) but none match widget patterns — trusting DOM scan (hasStickyCta=${findings.hasStickyCta}, hasChatWidget=${findings.hasChatWidget}).`);
    }
    // OLD blanket override removed — preserved below for the social-proof case
    // which is still iframe-blanket (review widgets are ubiquitous).
    if (findings.iframeCount > 0) {
      // Same pattern for social proof — review/rating widgets commonly render
      // in cross-origin iframes (Trustpilot, Yotpo, Birdeye, Google reviews
      // embed). If we found no above-fold social proof AND the page has
      // iframes, we can't be sure. Locked 2026-05-21 after Enviro Plumbing's
      // "4.6 / 813 reviews" widget was visible to users but invisible to
      // headless Playwright.
      if (findings.socialProofAboveFold === false) {
        findings.socialProofAboveFold = null;
        console.log('  [audit-diag] socialProofAboveFold: page has iframes — absence unverifiable, set to null (suppresses noSocialProof finding).');
      }
    }
    // Source-aware override for socialProofAboveFold (same pattern as
    // hasReviewsOnPage). Fires even when iframeCount=0 — Enviro Plumbing case.
    if (findings.socialProofAboveFold === false && findings._reviewsMentionedInSource) {
      findings.socialProofAboveFold = null;
      console.log('  [audit-diag] socialProofAboveFold: source mentions reviews/ratings but visible widget not detected — set to null (suppresses noSocialProof finding).');
    }
  } catch (err) {
    findings.error = err.message || String(err);
  } finally {
    if (page) await page.close().catch(() => {});
  }
  // Master verification flag for mobile audit — same role as websiteAuditVerified.
  // Gates step-6 mobile absence findings (phoneNotVisible, noSocialProof, etc.).
  findings.mobileAuditVerified = !findings.error && findings.pageLoadSeconds != null;
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

      // Photo count — re-enabled 2026-06-01 with a NEW high-confidence
      // selector that targets the photo carousel thumbnails specifically.
      // Strategy: count distinct buttons inside the photos carousel container.
      // Each photo thumbnail is a button with aria-label "Photo X" (1-indexed),
      // OR an img/role=img inside `div[aria-label*="Photos of"]` strip. Both
      // patterns are robust to Google's panel A/B layouts.
      //
      // SAFETY: if we get an obviously-wrong count (e.g. > 500 or = 1 with no
      // clear photo strip), we set null instead of guessing. Better to skip
      // the photoGap finding than make a false claim.
      // Memory: feedback_verification_gates_must_be_strict.md
      let photoCount = null;
      let photoCountVerified = false;
      try {
        // Strategy A: aria-label "Photo N of M" or "Photo N" pattern on carousel
        // buttons inside the photo strip. Most reliable.
        const photoButtons = Array.from(document.querySelectorAll('button[aria-label^="Photo "], [role="img"][aria-label^="Photo "]'))
          .filter((el) => /^Photo\s+\d/i.test(el.getAttribute('aria-label') || ''));
        if (photoButtons.length >= 2) {
          // The "Photo N of M" pattern is the gold standard — extract M.
          for (const el of photoButtons) {
            const m = (el.getAttribute('aria-label') || '').match(/^Photo\s+\d+\s+of\s+(\d+)/i);
            if (m) {
              photoCount = Number(m[1]);
              photoCountVerified = true;
              break;
            }
          }
          // Fallback: count distinct photo buttons (lower confidence)
          if (photoCount === null) {
            photoCount = photoButtons.length;
            photoCountVerified = photoCount >= 3 && photoCount <= 500;
          }
        }
      } catch (_) {}
      console.log(`  [gbp-diag] photoCount = ${photoCount} (verified=${photoCountVerified})`);

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
      // hoursVerified: true when we either found the hours element OR detected
      // a hours-section text marker (one of: "Hours", "Open now", "Open 24",
      // weekday names, time format). Without one of those markers we can't
      // claim absence — Maps panel hours section may be lazy-loaded.
      // Gates the step-6 businessHours finding per
      // feedback_verification_gates_must_be_strict.md.
      const HOURS_SECTION_MARKERS = /\b(open now|open\s*·|closed\s*·|hours|monday|tuesday|wednesday|thursday|friday|saturday|sunday|closes?\s+(?:at\s+)?\d|opens?\s+(?:at\s+)?\d|open 24)\b/i;
      const hoursSectionVisible = !!hoursEl || HOURS_SECTION_MARKERS.test(txt);
      const hasBusinessHours = hoursEl
        ? true
        : /\b(open now|open\s*·|closes?\s+\d|closes?\s+at|open\s+\d|open 24|monday|tuesday|wednesday|thursday|friday|saturday|sunday|hours|\d+\s*(am|pm))\b/i.test(txt);
      const hoursVerified = hoursSectionVisible;

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

      // Categories count — re-enabled 2026-06-01 with a high-confidence DOM
      // selector. Strategy: the primary category sits in button.DkEaL /
      // span.YhemCb. Secondary categories appear in a sibling/adjacent
      // "More categories" or aria-label list near the same container. We
      // count distinct category-button elements (NOT phrase matches in body
      // text, which inflated phrase variants like the old approach did).
      //
      // SAFETY: only emit a verified count when we found AT LEAST 1 specific
      // category button. If the primary category extractor (above) didn't
      // find one, we return null. This prevents claiming "you only have 1
      // category" when we actually couldn't read the section at all.
      // Memory: feedback_verification_gates_must_be_strict.md
      let categoriesCount = null;
      let categoriesCountVerified = false;
      try {
        // Count distinct category-pattern buttons. The primary uses DkEaL;
        // secondaries often appear inside aria-label="Categories" container
        // or as siblings of the primary button.
        const catButtons = Array.from(document.querySelectorAll('button.DkEaL, span.YhemCb'));
        const distinct = new Set();
        for (const el of catButtons) {
          const t = (el.textContent || '').trim();
          if (t && t.length >= 3 && t.length < 40 && !/^\d/.test(t)) distinct.add(t.toLowerCase());
        }
        if (distinct.size >= 1) {
          categoriesCount = distinct.size;
          // Only verified if primary category was also found (sanity gate).
          categoriesCountVerified = !!primaryCategory && categoriesCount >= 1 && categoriesCount <= 10;
        }
      } catch (_) {}
      console.log(`  [gbp-diag] categoriesCount = ${categoriesCount} (verified=${categoriesCountVerified})`);

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
      // Heading text now includes the business name suffix in many panels:
      // "Updates from Alvin Garage Door" instead of just "Updates". Match the
      // prefix so we catch both styles.
      const postHeadings = Array.from(document.querySelectorAll('h2, h3, [role="heading"], button, span'))
        .filter(el => {
          const t = (el.textContent || '').trim();
          return /^updates?(?:\s+from\s+\S|$)/i.test(t)
              || /^posts?(?:\s+from\s+\S|$)/i.test(t)
              || /^from\s+the\s+owner$/i.test(t);
        });
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

      // GBP social profiles (NEW 2026-05-14, TIGHTENED 2026-05-21) — GBP added
      // a "Social profiles" section; icons render as small <a> tags in the panel.
      // Scope strictly to the panel root (div[role="main"]) so we don't catch
      // Google's own footer social links. Filter to canonical social hosts only.
      //
      // gbpSocialProfilesVerified is the trust gate for step-6's noSocialProfiles
      // finding. Setting it on "h1+category present" is NOT enough — the Maps
      // panel doesn't always render the Social Profiles section in the initial
      // view (sometimes lazy-loaded behind a tab or below the fold).
      //
      // 2026-05-21: Caught on Monkey Wrench Plumbing — verified=true but count=0,
      // yet the business clearly has Instagram/Facebook/YouTube linked (visible
      // in their Search KP). Firing the no-socials finding produced a false claim.
      //
      // LOCKED RULE: verified=true ONLY when we either (a) actually found at
      // least one social link OR (b) detected a "Profiles" / "Social profiles"
      // heading proving the section was rendered. If neither, the absence claim
      // can't be trusted — skip the finding rather than fabricate it.
      let gbpSocialProfiles = [];
      let gbpSocialProfilesVerified = false;
      try {
        const panelRoot = document.querySelector('div[role="main"]');
        const onPanel = !!(panelRoot && panelRoot.querySelector('h1') && (primaryCategory || panelRoot.querySelector('button.DkEaL, span.YhemCb')));
        if (onPanel) {
          const SOCIAL_HOSTS = {
            'facebook.com': 'facebook',
            'instagram.com': 'instagram',
            'linkedin.com': 'linkedin',
            'twitter.com': 'twitter',
            'x.com': 'twitter',
            'youtube.com': 'youtube',
            'youtu.be': 'youtube',
            'tiktok.com': 'tiktok',
            'pinterest.com': 'pinterest',
          };
          const seen = new Set();
          const anchors = Array.from(panelRoot.querySelectorAll('a[href]'));
          for (const a of anchors) {
            const href = (a.getAttribute('href') || '').trim();
            if (!href || !/^https?:/i.test(href)) continue;
            // Skip Google's own utility links
            if (/(?:^|\.)google\.[a-z.]+\//i.test(href) || /(?:^|\.)goo\.gl\//i.test(href)) continue;
            // Skip share/login URLs
            if (/\/(sharer|share|login|signin|intent\/tweet)/i.test(href)) continue;
            let matched = null;
            for (const [host, name] of Object.entries(SOCIAL_HOSTS)) {
              if (href.toLowerCase().includes(host)) { matched = name; break; }
            }
            if (matched && !seen.has(matched)) {
              seen.add(matched);
              gbpSocialProfiles.push({ platform: matched, url: href });
            }
          }
          // Verified=true only if (a) we found at least one social, OR
          // (b) the panel clearly rendered a "Profiles" / "Social profiles"
          // section heading. Otherwise count=0 is unreliable (section may be
          // lazy-loaded or behind a tab we didn't open).
          if (gbpSocialProfiles.length > 0) {
            gbpSocialProfilesVerified = true;
          } else {
            const panelText = (panelRoot.innerText || '').toLowerCase();
            const SECTION_RE = /\b(?:social\s*profiles?|profiles\s*on\s*(?:google|the\s*web)|linked\s*(?:social|profiles?))\b/;
            if (SECTION_RE.test(panelText)) {
              gbpSocialProfilesVerified = true;
            }
          }
        }
      } catch (_e) {}
      console.log(`  [gbp-diag] gbpSocialProfiles=${gbpSocialProfiles.length} verified=${gbpSocialProfilesVerified} (${gbpSocialProfiles.map(s => s.platform).join(',') || 'none'})`);

      return { reviewCount, photoCount, photoCountVerified, minDays, reviewsLast30, reviewsLast90, ownerResponseCount, hasBusinessHours, hoursVerified, reviewsParsedCount: cardsScanned, primaryCategory, categoriesCount, categoriesCountVerified, description, hasPosts, lastPostDaysAgo, gbpSocialProfiles, gbpSocialProfilesVerified };
    }, CARD_SELECTOR);

    findings.reviewCount = data.reviewCount;
    findings.photoCount = data.photoCount;
    findings.photoCountVerified = !!data.photoCountVerified;
    findings.daysSinceLastReview = data.minDays;
    findings.reviewsLast30Days = data.reviewsLast30;
    findings.reviewsLast90Days = data.reviewsLast90;
    findings.ownerResponseCount = data.ownerResponseCount;
    findings.hasBusinessHours = data.hasBusinessHours;
    findings.hoursVerified = !!data.hoursVerified;
    findings.reviewsParsedCount = Number.isFinite(data.reviewsParsedCount) ? data.reviewsParsedCount : 0;
    findings.primaryCategory = data.primaryCategory;
    findings.categoriesCount = data.categoriesCount;
    findings.categoriesCountVerified = !!data.categoriesCountVerified;
    findings.description = data.description || '';
    findings.descriptionLength = typeof data.description === 'string' ? data.description.length : null;
    findings.hasPosts = data.hasPosts;
    findings.lastPostDaysAgo = data.lastPostDaysAgo;
    findings.gbpSocialProfiles = Array.isArray(data.gbpSocialProfiles) ? data.gbpSocialProfiles : [];
    findings.gbpSocialProfileCount = findings.gbpSocialProfiles.length;
    findings.gbpSocialProfilesVerified = !!data.gbpSocialProfilesVerified;

    // Multi-GBP detection (locked 2026-06-01). Whitespark 2026 ranks
    // duplicate listings as a top-tier negative — splits ranking authority
    // + confuses Google's algorithm. Detection strategy: SerpAPI Maps
    // search for the EXACT business name (quoted), then count distinct
    // place_ids returned. Filter to listings within ~10km of the audited
    // lead's coordinates so unrelated namesakes in other cities don't
    // false-positive.
    //
    // A-1 Performance Rooter & Plumbing 2026-05-28 case: 2 listings (one
    // open, one closed at a sibling address) — both pointing to the same
    // website. We were only auditing the open one + missing the gap.
    //
    // Cost: ~$0.005 per audit via SerpAPI. With 24hr audit cache this is
    // effectively pennies. Memory: project_dormant_pipeline_items_2026-05-28.md
    findings.duplicateListingCount = null;
    findings.duplicateListingCountVerified = false;
    findings.duplicateListings = [];
    // 2026-06-02: gated behind STEP25_ENABLE_DUPLICATE_LISTING=1 env var
    // (default ON now that Developer plan has 5000 quota; can disable for
    // cost-sensitive runs). Also 30-day local file cache — duplicate
    // listings don't change daily, so we save ~90% of SerpAPI calls on
    // repeat audits of the same lead.
    // Cache: output/.cache/duplicate-listings/<biz-slug>.json
    // Memory: feedback_serpapi_quota_protection.md
    const enableDup = process.env.STEP25_ENABLE_DUPLICATE_LISTING !== '0'; // default ON
    if (enableDup && process.env.SERPAPI_KEY && business.name) {
      // Cache check first (30-day TTL)
      const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const cacheDir = path.join(process.cwd(), 'output', '.cache', 'duplicate-listings');
      const cacheKey = `${slugify(business.name)}__${slugify(business.searchTerm || '')}`;
      const cachePath = path.join(cacheDir, `${cacheKey}.json`);
      const CACHE_TTL_DAYS = 30;
      let usedCache = false;
      try {
        if (fs.existsSync(cachePath)) {
          const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
          const ageDays = (Date.now() - new Date(cached.checkedAt).getTime()) / (24 * 3600 * 1000);
          if (ageDays >= 0 && ageDays < CACHE_TTL_DAYS) {
            findings.duplicateListingCount = cached.duplicateListingCount;
            findings.duplicateListingCountVerified = true;
            findings.duplicateListings = cached.duplicateListings || [];
            usedCache = true;
            console.log(`  [gbp-diag] duplicateListingCount = ${cached.duplicateListingCount} (cached, age=${ageDays.toFixed(1)}d)`);
          }
        }
      } catch (_) {}
      if (usedCache) {
        // Skip SerpAPI block entirely
      } else try {
        const { serpapiGetRateAware } = await import('./lib/serpapi-rate-aware.cjs');
        const q = encodeURIComponent(`"${business.name}"`);
        const ll = (business.lat && business.lon) ? `&ll=@${business.lat},${business.lon},14z` : '';
        const sUrl = `https://serpapi.com/search?engine=google_maps&type=search&q=${q}${ll}&api_key=${process.env.SERPAPI_KEY}`;
        const res = await serpapiGetRateAware(sUrl);
        if (res && res.data) {
          const local = Array.isArray(res.data.local_results) ? res.data.local_results : [];
          // Filter to listings whose normalized business name overlaps strongly
          // with target, then dedupe by place_id.
          // 2026-06-12: a REAL duplicate is the SAME business listed twice, not a
          // similarly-named competitor. Old logic counted any 2-token name overlap,
          // so "Pipe Doctor Rooter & Plumbing Company" was flagged a duplicate of
          // "Doctor Pipe | Los Angeles Plumbing Specialist" (reversed words, different
          // address/phone/Place ID). Now require BOTH: the candidate title contains the
          // target's ORDERED brand phrase, AND — when phones are available — the same
          // phone (different phone = different business). step-6 carries a matching
          // recount guard that corrects cached audits. See feedback_audit_duplicate_listing_same_business.md.
          const DUP_STOP = new Set(['the','and','for','llc','inc','ltd','co','corp','of','at','your','best','top','our','dba','garage','door','doors','repair','repairs','service','services','company','companies','shop','store','center','centers','solution','solutions','group','team','home','professional','professionals','expert','experts','specialist','specialists','pro','pros','plumbing','plumber','plumbers','hvac','heating','cooling','air','conditioning','comfort','roofing','roofer','roofers','rooter','rooters','locksmith','locksmiths','dentist','dental','auto','automotive','car','cars','painting','painters','cleaning','cleaners','water','landscaping','landscape','lawn','tree','trees','pest','control','exterminator','electric','electrician','electricians','contractor','contractors','construction','remodeling','los','angeles','beverly','hills','santa','monica','city','county','ca']);
          const brandPhrase = (name) => {
            const toks = String(name || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
            const phrase = [];
            for (const t of toks) { if (t.length < 2 || DUP_STOP.has(t)) { if (phrase.length) break; else continue; } phrase.push(t); }
            return phrase.join(' ');
          };
          const tgtPhrase = brandPhrase(business.name);
          const tgtPhone = normalizePhone(business.phone || '');
          const matches = local.filter((r) => {
            if (!tgtPhrase) return false; // brand too generic to confirm — skip (conservative)
            const n = String(r.title || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
            if (!n.includes(tgtPhrase)) return false; // must carry the target's ordered brand phrase
            // If both phones known, they must match (different phone = different business).
            const cPhone = normalizePhone(r.phone || '');
            if (tgtPhone && cPhone && tgtPhone !== cPhone) return false;
            return true;
          });
          const distinctIds = new Set(matches.map((m) => m.place_id).filter(Boolean));
          findings.duplicateListingCount = Math.max(0, distinctIds.size - 1);
          findings.duplicateListingCountVerified = true;
          findings.duplicateListings = matches.slice(0, 5).map((m) => ({
            title: m.title,
            address: m.address,
            phone: m.phone || '',
            placeId: m.place_id,
            rating: m.rating,
            reviews: m.reviews,
            permanently_closed: !!m.permanently_closed,
          }));
          console.log(`  [gbp-diag] duplicateListingCount = ${findings.duplicateListingCount} (${distinctIds.size} total places matching "${business.name}")`);
          // Write 30-day cache for future runs (saves a SerpAPI call per repeat audit).
          try {
            if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
            fs.writeFileSync(cachePath, JSON.stringify({
              checkedAt: new Date().toISOString(),
              businessName: business.name,
              searchTerm: business.searchTerm,
              duplicateListingCount: findings.duplicateListingCount,
              duplicateListings: findings.duplicateListings,
            }, null, 2));
          } catch (_) {}
        }
      } catch (err) {
        console.log(`  [gbp-diag] duplicateListingCount lookup failed: ${err.message}`);
      }
    }

    // Primary GBP category vs search intent — #1 local ranking factor.
    //
    // 2026-05-28: previously this used naive word-overlap between the GBP
    // primary category and the SerpAPI listing's category text. That fired
    // false positives like "Contractor matches Plumbers" for Target Plumbers
    // (their SerpAPI category was "Plumbing contractor" → "contractor"
    // substring overlap → wrong match).
    //
    // The correct comparison is against the vertical_benchmarks DB —
    // categoryDistributionTop3 / majorityCategoryTop3 for that exact search.
    // That's the empirical ground truth (what top-3 ranking businesses
    // actually use). If the benchmark row is missing, fall back to the
    // naive check (better than skipping the finding entirely).
    //
    // Memory: [[feedback-use-vertical-benchmarks-db-for-category-check]]
    if (data.primaryCategory && (business.category || business.searchTerm)) {
      const catLower = data.primaryCategory.toLowerCase().trim();
      const searchTerm = business.searchTerm || '';
      let matched = null;
      try {
        const slug = String(searchTerm).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        const benchPath = slug ? path.join(process.cwd(), 'data', 'vertical-benchmarks', `${slug}.json`) : null;
        if (benchPath && fs.existsSync(benchPath)) {
          const bench = JSON.parse(fs.readFileSync(benchPath, 'utf-8'));
          const topCats = Object.keys(bench.categoryDistributionTop3 || bench.categoryDistributionTop5 || {});
          if (topCats.length) {
            const topCatsLower = topCats.map((c) => c.toLowerCase().trim());
            matched = topCatsLower.includes(catLower);
            findings.primaryCategoryBenchmarkSource = 'verticalBenchmark';
            findings.primaryCategoryBenchmarkTop = topCats;
          }
        }
      } catch (_) {}
      if (matched === null) {
        // Fallback: naive word-overlap against SerpAPI category text
        const searchWords = (business.category || searchTerm || '').toLowerCase();
        matched =
          catLower.split(/\s+/).some((w) => w.length > 3 && searchWords.includes(w)) ||
          searchWords.split(/\s+/).some((w) => w.length > 3 && catLower.includes(w));
        findings.primaryCategoryBenchmarkSource = 'naive-fallback';
      }
      findings.primaryCategoryMatchesSearch = matched;
    }

    // === Google SEARCH knowledge panel pass (for description + posts) ===
    // Maps panel doesn't reliably surface description text or Google Posts on
    // every business. Search knowledge panel (google.com/search?q=...) does.
    // Use a SEPARATE browser instance — reusing the Maps gbpBrowser/page caused
    // Google to serve a different layout (kp-wholepage missing on the second
    // request from the same session). Clean session is required.
    let kpBrowser = null;
    let kpPage = null;
    try {
      const kpQuery = `${business.name || ''} ${business.city || ''} ${business.state || ''}`.trim();
      if (kpQuery) {
        kpBrowser = await puppeteer.launch({
          headless: false,
          executablePath: CHROME_PATH,
          userDataDir: CHROME_PROFILE_DIR + '-search-kp',
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--window-size=1280,900'],
        });
        kpPage = await kpBrowser.newPage();
        await kpPage.setViewport({ width: 1280, height: 900 });
        await kpPage.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
        kpPage.on('console', (msg) => { const t = msg.text(); if (t.includes('[kp-')) console.log('  ' + t); });

        // Pre-warm: visit Google homepage first to seed cookies/consent before
        // the actual query. Reduces CAPTCHA likelihood vs. cold-hitting a search URL.
        await kpPage.goto('https://www.google.com/', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        await kpPage.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const accept = buttons.find((b) => /accept all|reject all|i agree/i.test(b.textContent || ''));
          if (accept) accept.click();
        }).catch(() => {});
        await new Promise((r) => setTimeout(r, 1500));

        const kpUrl = `https://www.google.com/search?q=${encodeURIComponent(kpQuery)}`;
        await kpPage.goto(kpUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        // Consent on search.google.com if needed
        await kpPage.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const accept = buttons.find((b) => /accept all|reject all|i agree/i.test(b.textContent || ''));
          if (accept) accept.click();
        }).catch(() => {});

        // Wait for kp-wholepage with retry. Some loads render the knowledge panel
        // late, especially on first visit. Also detect CAPTCHA challenge.
        let kpFound = false;
        let captchaDetected = false;
        for (let attempt = 0; attempt < 3 && !kpFound; attempt++) {
          await new Promise((r) => setTimeout(r, 2500 + attempt * 1500));
          const state = await kpPage.evaluate(() => {
            const kp = !!document.querySelector('div.kp-wholepage');
            const captchaHints = [
              document.querySelector('form[action*="sorry"]'),
              document.querySelector('div#captcha-form'),
              document.body && /unusual traffic|verify you'?re a human|i'm not a robot/i.test((document.body.innerText || '').slice(0, 500)),
            ];
            return { kp, captcha: captchaHints.some(Boolean) };
          }).catch(() => ({ kp: false, captcha: false }));
          if (state.captcha) { captchaDetected = true; break; }
          if (state.kp) { kpFound = true; break; }
        }
        if (captchaDetected) {
          console.warn(`  [kp-diag] Search CAPTCHA detected — Search KP scrape aborted (back off 6-24h before retry)`);
          throw new Error('search-captcha');
        }
        if (!kpFound) {
          console.warn(`  [kp-diag] kp-wholepage didn't load after 3 attempts — moving on without description/posts`);
        }

        const kpData = await kpPage.evaluate((expectedName) => {
          const kp = document.querySelector('div.kp-wholepage');
          if (!kp) return { onPanel: false, reason: 'no kp-wholepage' };

          // Verify the knowledge panel is for the right business (avoid scraping
          // a competitor's panel if Search served a different result first).
          const titleEl = document.querySelector('div[data-attrid="title"]');
          const titleText = (titleEl?.textContent || '').trim();
          const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const exp = norm(expectedName);
          const got = norm(titleText);
          let overlap = 0;
          for (let i = 0, j = 0; i < got.length && j < exp.length; i++) {
            if (got[i] === exp[j]) { overlap++; j++; }
          }
          const overlapRatio = exp ? overlap / exp.length : 0;
          if (overlapRatio < 0.5) return { onPanel: false, reason: `title mismatch: "${titleText}" vs "${expectedName}"`, titleText, overlapRatio };

          // Description: longest non-structural text node in kp-wholepage.
          // Filter out review snippets, structural labels, and tab text.
          const skipPrefixes = /^(review|see all|see photos|directions|hours|call now|website|menu|address|phone|located in|service options|payment|accessibility|amenities|appointment|crowd|highlights|popular times|questions|sponsor|from the|opens|closes|open\s|closed)/i;
          const reviewSnippet = /^\d+\s*(google )?reviews?/i;
          const candidates = Array.from(kp.querySelectorAll('span, div, p'))
            .filter((el) => el.children.length === 0)
            .map((el) => (el.textContent || '').trim())
            .filter((t) => t.length > 80 && t.length < 1500)
            .filter((t) => !skipPrefixes.test(t.slice(0, 30)))
            .filter((t) => !reviewSnippet.test(t.slice(0, 30)));
          // Deduplicate exact matches, then sort longest-first
          const seen = new Set();
          const unique = [];
          for (const t of candidates) {
            if (seen.has(t)) continue;
            seen.add(t);
            unique.push(t);
          }
          unique.sort((a, b) => b.length - a.length);
          const description = unique[0] || '';

          // Post timestamps. Old: only .Ufkx2c with relative "N ago" format.
          // Google now renders ABSOLUTE dates ("Oct 23, 2023") for posts older
          // than ~6 months. Scan the KP body text for both formats and return
          // every match as a {text, daysAgo} pair so the caller can pick the
          // most recent.
          function relativeToDays(txt) {
            const m = txt.match(/^(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago$/i);
            if (!m) return null;
            const n = Number(m[1]);
            const u = m[2].toLowerCase();
            return u === 'minute' ? n / 1440
              : u === 'hour' ? n / 24
              : u === 'day' ? n
              : u === 'week' ? n * 7
              : u === 'month' ? n * 30
              : n * 365;
          }
          function absoluteToDays(txt) {
            // "Oct 23, 2023" / "October 23, 2023" / "Oct 23" (current year)
            const m = txt.match(/^([A-Z][a-z]+)\s+(\d{1,2})(?:,\s+(\d{4}))?$/);
            if (!m) return null;
            const monthIdx = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m[1].slice(0,3).toLowerCase());
            if (monthIdx < 0) return null;
            const day = Number(m[2]);
            const year = m[3] ? Number(m[3]) : new Date().getFullYear();
            const postDate = new Date(year, monthIdx, day);
            const days = (Date.now() - postDate.getTime()) / (1000 * 60 * 60 * 24);
            return days > 0 ? days : null;
          }
          // Scan EVERY text node in the panel + the global modal (Recent updates
          // modal renders outside the .kp-wholepage scope when opened).
          const allTextEls = Array.from(document.querySelectorAll('span, div, time, .Ufkx2c'));
          const timestamps = [];
          for (const el of allTextEls) {
            const t = (el.textContent || '').trim();
            if (!t || t.length > 30) continue;
            let d = relativeToDays(t);
            if (d == null) d = absoluteToDays(t);
            if (d != null && d >= 0 && d <= 3650) {
              timestamps.push({ text: t, daysAgo: d });
            }
          }

          // 2026-05-27 Detect whether Google's KP rendered a Posts/Updates
          // section heading. If present BUT timestamps=0, our extractor likely
          // missed the date format (don't claim absence). If absent AND no
          // timestamps, we can verify no-posts.
          const pageText = (document.body && document.body.innerText || '').toLowerCase();
          const POSTS_HEADING_RE = /\b(?:recent updates from|updates from|google posts|latest posts|see all posts|by owner)\b/;
          const postsSectionDetected = POSTS_HEADING_RE.test(pageText);

          return { onPanel: true, titleText, overlapRatio, description, timestamps, postsSectionDetected };
        }, business.name || '');

        if (kpData.onPanel) {
          // Description (TIGHTENED 2026-05-21)
          // The Search KP description scraper can grab Google UI boilerplate
          // when the actual description selector is missed. Monkey Wrench
          // returned "Providers are listed in random order. However, if the
          // business has specified a preferred provider, it will appear first."
          // as the description — clearly Google's own panel chrome, not the
          // business's description.
          //
          // Filter: any text matching known Google UI boilerplate phrases is
          // treated as MISSING (descriptionLength=0). Verified=true only when
          // we either (a) extracted real text or (b) confirmed via length-of-0
          // that there was no description text at all.
          const GOOGLE_UI_PHRASES = [
            /providers are listed in random order/i,
            /if the business has specified a preferred provider/i,
            /^claim this business$/i,
            /this place'?s information is provided by/i,
            /add a description for this business/i,
            /\bdata from third parties\b/i,
            /^reviews from the web$/i,
            /\bsuggest an edit\b/i,
            /\bappointments?:\s/i,
            /^know this place\?/i,
          ];
          const looksLikeBoilerplate = (txt) => GOOGLE_UI_PHRASES.some(re => re.test(txt));
          if (kpData.description && !looksLikeBoilerplate(kpData.description)) {
            // We extracted a non-boilerplate string — trust it as the real
            // GBP description. descriptionVerified=true means step-6 can fire
            // the "empty description" finding only when length is genuinely 0.
            findings.description = kpData.description;
            findings.descriptionLength = kpData.description.length;
            findings.descriptionVerified = true;
          } else if (kpData.description && looksLikeBoilerplate(kpData.description)) {
            // KP returned text but it's Google UI boilerplate, NOT the business
            // description. We don't actually know what the real description is
            // (the scraper's heuristic picked the wrong element). Mark
            // descriptionVerified=false so step-6 won't claim "empty description".
            // Caught 2026-05-21 on Monkey Wrench Plumbing — KP returned
            // "Providers are listed in random order..." (120 chars) instead of
            // the real "Experienced plumbers with a track record..." (~110 chars).
            // Memory: feedback_verification_gates_must_be_strict.md.
            findings.description = '';
            findings.descriptionLength = 0;
            findings.descriptionVerified = false;
            console.log('[kp-diag] description scrape unreliable — got Google UI boilerplate:', kpData.description.slice(0, 100), '— marking descriptionVerified=false to suppress potentially-false absence finding.');
          } else {
            // 2026-05-27 FIX: when the KP scrape returns NO description text
            // at all, we can't tell whether (a) the business genuinely has
            // empty description OR (b) our extraction heuristic missed it.
            // Per feedback_verification_gates_must_be_strict.md, treat this
            // as UN-verified (descriptionVerified=false) so step-6 won't fire
            // the "GBP description is empty" absence finding. Confirmed
            // 2026-05-27 on Fenn Termite — Chris caught a false claim of
            // empty description when Fenn's GBP does have one.
            findings.description = '';
            findings.descriptionLength = 0;
            findings.descriptionVerified = false;
            console.log('[kp-diag] no description text extracted from KP — marking descriptionVerified=false to suppress potentially-false absence finding.');
          }

          // Posts — timestamps arrive as [{text, daysAgo}] supporting both
          // relative ("3 weeks ago") and absolute ("Oct 23, 2023") formats.
          // 2026-05-27 TIGHTENED (same class as description fix): only mark
          // postsVerified=true when EITHER (a) we extracted at least one
          // timestamp, OR (b) we did NOT detect a posts section heading (i.e.
          // KP genuinely has no Posts area = verified absence). If a Posts
          // section IS detected but no timestamps extracted, our extractor
          // missed the date format — suppress the absence finding.
          findings.hasPosts = kpData.timestamps.length > 0;
          if (kpData.timestamps.length > 0) {
            // We found timestamps → posts exist, verified true.
            findings.postsVerified = true;
            const minDays = Math.min(...kpData.timestamps.map((t) => t.daysAgo));
            findings.lastPostDaysAgo = Math.round(minDays);
          } else if (kpData.postsSectionDetected) {
            // Posts section exists but we couldn't parse any timestamp →
            // extractor is unreliable for this lead. Suppress the finding.
            findings.postsVerified = false;
            console.log('[kp-diag] posts section detected but 0 timestamps extracted — marking postsVerified=false to suppress potentially-false absence finding.');
          } else {
            // No timestamps AND no posts section → verified absence.
            findings.postsVerified = true;
          }
          console.log(`  [kp-diag] Search KP confirmed for "${kpData.titleText}" (overlap=${(kpData.overlapRatio * 100).toFixed(0)}%): description=${findings.descriptionLength}chars, posts=${kpData.timestamps.length} (sectionDetected=${kpData.postsSectionDetected}, verified=${!!findings.postsVerified}, mostRecent=${findings.lastPostDaysAgo}d)`);
        } else {
          console.warn(`  [kp-diag] Search knowledge panel skipped: ${kpData.reason || 'unknown'}`);
        }
      }
    } catch (kpErr) {
      console.warn(`  [kp-diag] Search knowledge panel scrape failed: ${kpErr.message || kpErr}`);
    } finally {
      if (kpPage) await kpPage.close().catch(() => {});
      if (kpBrowser) await kpBrowser.close().catch(() => {});
    }

    // Final per-field summary — surfaces every value we'll feed into the script,
    // so wrong claims like "9 photos" can never ship unnoticed again.
    console.log(`  [gbp-summary] ${business.name || 'unknown'}: reviewCount=${findings.reviewCount} | photoCount=${findings.photoCount} | daysSinceLastReview=${findings.daysSinceLastReview} | last30=${findings.reviewsLast30Days} | last90=${findings.reviewsLast90Days} | ownerResponses=${findings.ownerResponseCount} | hasHours=${findings.hasBusinessHours} | primaryCategory=${JSON.stringify(findings.primaryCategory)} | matchesSearch=${findings.primaryCategoryMatchesSearch} | description=${findings.descriptionLength}chars (verified=${!!findings.descriptionVerified}) | hasPosts=${findings.hasPosts} (verified=${!!findings.postsVerified}) | lastPostDaysAgo=${findings.lastPostDaysAgo}`);
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
    // acceptInsecureCerts (2026-07-02): a bad/expired SSL cert is a config quirk, not a dead site —
    // the site content is real and auditable. Without this we falsely marked cert-quirk sites
    // unverified (ERR_CERT_DATE_INVALID / ERR_CERT_COMMON_NAME_INVALID), losing accurate audits.
    // Does NOT rescue genuinely dead domains (ERR_NAME_NOT_RESOLVED) — those correctly stay failed.
    acceptInsecureCerts: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  const audits = {};
  try {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const name = row['Business Name'] || row.name;
      const slug = slugify(name || `business-${i + 1}`, { lower: true, strict: true });
      // Prefer step-1's discovered website (from search fallback) when present;
      // otherwise fall back to the GBP-linked website. Locked 2026-05-20.
      const website = (row['Discovered Website'] || '').trim() || row.Website || row.website || '';
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

      // 2026-05-27 Tier 2.6 — parallelize the three audits. They're
      // independent:
      //   - auditGbp launches its OWN browser (Google Maps needs non-
      //     headless; see line ~1228). Fully independent of the others.
      //   - auditWebsite + auditMobile share the main `browser` instance
      //     but each opens its own page and navigates to the business
      //     website. Running concurrent on different pages is safe;
      //     concurrent navigation to the same URL hits Cloudflare/WAF
      //     softer than separate browser windows would.
      // Sequential ~85s/lead; parallel ~50s/lead. Saves ~35s × 30 = ~17min.
      let websiteFindings, mobileFindings, gbpFindings;
      try {
        [websiteFindings, mobileFindings, gbpFindings] = await Promise.all([
          auditWebsite(browser, website, business),
          auditMobile(browser, website, business),
          auditGbp(browser, gbpUrl, business),
        ]);
      } catch (auditErr) {
        // 2026-06-03 — lead-abandon path. step-2.5 (auditWebsite) throws with
        // err.skipLead=true on HTTP 4xx/5xx from the prospect's site (Safe Gas
        // Services Inc case). Caught here so the entire lead is skipped from
        // downstream rendering — no video, no landing, no false claim.
        if (auditErr.skipLead) {
          console.warn(`  ⚠️ SKIP LEAD: ${name} — ${auditErr.message}`);
          audits[slug] = {
            businessName: name,
            skipReason: auditErr.message,
            httpStatus: auditErr.httpStatus,
            skipped: true,
          };
          continue; // skip to next lead in the for-loop
        }
        throw auditErr; // unrelated error — re-throw
      }

      // Propagate step-1 suspect flags into audit findings so step-6 can fire
      // noOwnWebsite without re-reading the step-1 CSV. Locked 2026-05-20.
      const suspectReason = (row['Website Suspect Reason'] || '').trim();
      // 2026-06-12: don't propagate the step-1 suspect flag when the search-discovery
      // fallback substituted a real first-party brand site (row['Discovered Website']).
      // step-1 computed the flag against the OLD GBP-linked url; the discovered site
      // already passed the brand-token filter (pickQualifyingResult), so the flag is
      // STALE. Propagating it made step-6 fire false "no website / domain doesn't match"
      // claims (Richards Rooter, Advanced HVAC, Murphy, etc. — Chris caught these). The
      // url we actually audit here is the discovered site (line ~2316). step-6 carries a
      // matching stale-suspect guard so already-cached audits are fixed without re-auditing.
      const usedDiscoveredSite = !!(row['Discovered Website'] || '').trim();
      if (suspectReason && !usedDiscoveredSite) {
        websiteFindings.suspectWebsiteMismatch = true;
        websiteFindings.websiteSuspectReason = suspectReason;
      }
      console.log(`  website: load=${websiteFindings.pageLoadSeconds}s schema=${websiteFindings.hasLocalBusinessSchema} h1cat=${websiteFindings.h1IncludesCategory} h1city=${websiteFindings.h1IncludesCity} c2c=${websiteFindings.hasMobileClickToCall} napMatch=${websiteFindings.websitePhoneMatchesGbp} blocking=${websiteFindings.renderBlockingHeadResources}${websiteFindings.siteLooksParked ? ' PARKED=' + websiteFindings.parkedReason : ''}${websiteFindings.suspectWebsiteMismatch ? ' SUSPECT=' + websiteFindings.websiteSuspectReason : ''}`);
      console.log(`  mobile:  load=${mobileFindings.pageLoadSeconds}s viewport=${mobileFindings.hasViewportMeta} c2cAboveFold=${mobileFindings.clickToCallAboveFold} ctaPx=${mobileFindings.primaryCtaTapTargetPx} weightKb=${mobileFindings.pageWeightKb}`);
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

  // === Self-diagnosis pass — validate against per-slug baselines if any exist.
  // Auto-disables any voiceover finding whose backing field deviates from the
  // verified baseline. Writes `_validation` into each lead's findings block so
  // step-6 can read it and skip the affected findings.
  try {
    const { validateAudit } = await import('./validate-audit.mjs');
    const baselineDir = path.join(process.cwd(), 'data');
    let anyChanged = false;
    for (const slug of Object.keys(audits)) {
      const baselinePath = path.join(baselineDir, `audit-baseline-${slug}.json`);
      if (!fs.existsSync(baselinePath)) continue;
      const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
      const result = validateAudit(audits[slug], baseline);
      audits[slug]._validation = result;
      anyChanged = true;
      console.log(`\n[self-diag] ${slug}: ${result.passed ? '✅ PASS' : '❌ FAIL'} | ${result.passCount} match, ${result.failCount} deviation(s)`);
      if (result.failures.length) {
        for (const f of result.failures.slice(0, 8)) {
          console.log(`   • ${f.path}: ${f.reason}`);
        }
        if (result.failures.length > 8) console.log(`   ... and ${result.failures.length - 8} more`);
      }
      if (result.disabledFindings.length) {
        console.log(`   → Auto-disabling voiceover findings: ${result.disabledFindings.join(', ')}`);
      }
    }
    if (anyChanged) {
      fs.writeFileSync(outFile, JSON.stringify(audits, null, 2));
      console.log(`[self-diag] Updated audit-findings.json with _validation blocks`);
    } else {
      console.log(`[self-diag] No baseline files found for any audited slug — skipping`);
    }
  } catch (vErr) {
    console.warn(`[self-diag] Validation pass failed (non-fatal): ${vErr.message || vErr}`);
  }

  // === Airtable write-back — patch each audited lead's Airtable Leads row with the
  // captured reviewCount + primaryCategory. Heals the systemic step-1 data gap where
  // these fields don't get captured by the search-results scraper. Self-healing:
  // every business we audit now permanently fixes its own Airtable row.
  try {
    const apiKey = process.env.AIRTABLE_API_KEY;
    const baseId = process.env.AIRTABLE_BASE_ID;
    const tableName = process.env.AIRTABLE_LEADS_TABLE || 'Leads';
    if (!apiKey || !baseId) {
      console.warn('[airtable-writeback] AIRTABLE_API_KEY or AIRTABLE_BASE_ID not set — skipping');
    } else {
      let patched = 0;
      let skipped = 0;
      for (const slug of Object.keys(audits)) {
        const a = audits[slug];
        if (!a || !a.businessName) { skipped++; continue; }
        const reviewCount = a.gbp?.reviewCount;
        const primaryCategory = a.gbp?.primaryCategory;
        // Search KP fields (gated behind _verified flags — only write if scrape succeeded)
        const description = a.gbp?.descriptionVerified === true ? a.gbp?.description : null;
        const hasPosts = a.gbp?.postsVerified === true ? a.gbp?.hasPosts : null;
        // "No own website" signals from step-2.5's parked-install detection. Locked 2026-05-20.
        const siteLooksParked = a.website?.siteLooksParked === true;
        const parkedReason = a.website?.parkedReason || '';
        const suspectMismatch = a.website?.suspectWebsiteMismatch === true;
        const suspectReason = a.website?.websiteSuspectReason || '';
        if (reviewCount == null && !primaryCategory && !description && hasPosts == null && !siteLooksParked && !suspectMismatch) { skipped++; continue; }
        // Look up the Lead in Airtable by Business Name (canonical match)
        const escapedName = String(a.businessName).replace(/"/g, '\\"');
        const filterFormula = `LOWER({Business Name}) = LOWER("${escapedName}")`;
        const searchUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}?filterByFormula=${encodeURIComponent(filterFormula)}&maxRecords=1`;
        try {
          const searchRes = await fetch(searchUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
          if (!searchRes.ok) { skipped++; continue; }
          const searchData = await searchRes.json();
          const match = searchData.records?.[0];
          if (!match) { skipped++; continue; }
          const fields = {};
          if (typeof reviewCount === 'number' && reviewCount > 0) fields['Review Count'] = reviewCount;
          if (primaryCategory && typeof primaryCategory === 'string') fields['Category'] = primaryCategory;
          if (typeof description === 'string' && description.trim()) fields['GBP Description'] = description.trim();
          if (typeof hasPosts === 'boolean') fields['GBP Has Posts'] = hasPosts;
          if (siteLooksParked) {
            fields['Site Looks Parked'] = true;
            if (parkedReason) fields['Parked Reason'] = parkedReason;
          }
          if (suspectMismatch) {
            fields['Website Suspect'] = true;
            if (suspectReason) fields['Website Suspect Reason'] = suspectReason;
          }
          if (!Object.keys(fields).length) { skipped++; continue; }
          const patchRes = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${match.id}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields, typecast: true })
          });
          if (patchRes.ok) {
            patched++;
            console.log(`[airtable-writeback] ✓ ${a.businessName} — patched Review Count=${fields['Review Count'] ?? '-'} Category="${fields['Category'] ?? '-'}"`);
          } else {
            skipped++;
            console.warn(`[airtable-writeback] PATCH failed for ${a.businessName}: ${patchRes.status}`);
          }
        } catch (lookupErr) {
          skipped++;
          console.warn(`[airtable-writeback] Lookup error for ${a.businessName}: ${lookupErr.message || lookupErr}`);
        }
      }
      console.log(`[airtable-writeback] Patched ${patched} lead(s), skipped ${skipped}.`);
    }
  } catch (wbErr) {
    console.warn(`[airtable-writeback] Pass failed (non-fatal): ${wbErr.message || wbErr}`);
  }
}

main().catch((err) => {
  console.error('Fatal in step-2.5-audit:', err);
  process.exit(1);
});
