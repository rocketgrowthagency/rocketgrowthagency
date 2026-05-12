// step-6-voiceover.mjs

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import csvParser from 'csv-parser';
import OpenAI from 'openai';
import slugify from 'slugify';
import { spawn } from 'child_process';

const STEP1_DIR = path.join(process.cwd(), 'output', 'Step 1');
const STEP2_DIR = path.join(process.cwd(), 'output', 'Step 2');
const VIDEOS_ROOT = path.join(process.cwd(), 'output', 'Step 3 (Video Recorder - Raw WebM)');
const AUDIO_ROOT = path.join(process.cwd(), 'output', 'Step 6 (Voiceover MP3)');
const AUDIT_ROOT = path.join(process.cwd(), 'output', 'Step 2.5 (Audit)');
const STEP2_CSV_OVERRIDE = process.env.STEP2_CSV || '';

const MAX_RECORDINGS = Number(process.env.MAX_RECORDINGS || 1);

function findLatestStep2Csv() {
  if (STEP2_CSV_OVERRIDE) {
    if (!fs.existsSync(STEP2_CSV_OVERRIDE)) {
      console.error(`Step 2 CSV override not found: ${STEP2_CSV_OVERRIDE}`);
      process.exit(1);
    }
    const csvPath = STEP2_CSV_OVERRIDE;
    const baseName = path.basename(csvPath).replace(/\.csv$/i, '');
    console.log(`Using Step 2 CSV override: ${csvPath}`);
    return { csvPath, baseName };
  }

  if (!fs.existsSync(STEP2_DIR)) {
    console.error(`Step 2 directory not found: ${STEP2_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(STEP2_DIR)
    .filter((f) => f.toLowerCase().endsWith('.csv') && f.includes('[step-2]'))
    .map((name) => {
      const fullPath = path.join(STEP2_DIR, name);
      return { name, fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs };
    })
    .sort((a, b) => a.mtimeMs - b.mtimeMs || a.name.localeCompare(b.name));

  if (!files.length) {
    console.error(`No Step 2 CSV files found in: ${STEP2_DIR}`);
    process.exit(1);
  }

  const latest = files[files.length - 1];
  const csvPath = latest.fullPath;
  const baseName = latest.name.replace(/\.csv$/i, '');

  return { csvPath, baseName };
}

const { csvPath: STEP2_CSV, baseName: STEP2_BASENAME } = findLatestStep2Csv();

const VIDEOS_DIR = path.join(VIDEOS_ROOT, STEP2_BASENAME);
const AUDIO_DIR = path.join(AUDIO_ROOT, STEP2_BASENAME);

if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

console.log(`Using Step 2 CSV: ${STEP2_CSV}`);
console.log(`Videos directory (unused here, for reference): ${VIDEOS_DIR}`);
console.log(`Audio will be saved under: ${AUDIO_DIR}`);

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY not set. Check your .env file.');
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const FIELD_ALIASES = {
  'Business Name': ['name'],
  'business name': ['name'],
  'Map Rank': ['rank'],
  'map rank': ['rank'],
  'Search Term': ['searchTerm'],
  'search term': ['searchTerm'],
};

const PLACEHOLDER_EMAIL_PATTERNS = [
  /^user@domain\.com$/i,
  /^email@domain\.com$/i,
  /^example@example\./i,
  /^example@gmail\.com$/i,
  /^you@/i,
  /^your@/i,
  /^yourname@/i,
  /^test@test\./i,
  /^noreply@/i,
  /^no-reply@/i,
  /^donotreply@/i,
  /^info@yourdomain\./i,
  /^email@example\./i,
  /@localhost$/i,
  /\.(gif|jpg|png|jpeg|svg|webp|css|js|woff|ttf)$/i,
  /@sentry\.io$/i,
  /@sentry-next\.wixpress\.com$/i,
  /@sentry\.wixpress\.com$/i,
  /@wixpress\.com$/i,
  /@wix\.com$/i,
  /@cdn\./i,
  /@static\./i,
  /@google-analytics\./i,
  /@googletagmanager\./i,
  /@facebook\.com$/i,
  /@instagram\.com$/i,
  /@twitter\.com$/i,
  /@tiktok\.com$/i
];

function normalizeField(record, key) {
  const direct =
    record[key] !== undefined && record[key] !== null ? record[key] : record[key.toLowerCase()];
  if (direct !== undefined && direct !== null && direct !== '') {
    return direct.toString().trim();
  }

  const aliases = FIELD_ALIASES[key] || FIELD_ALIASES[key.toLowerCase()] || [];
  for (const alias of aliases) {
    if (record[alias] !== undefined && record[alias] !== null && record[alias] !== '') {
      return record[alias].toString().trim();
    }
  }

  return '';
}

function parseNumber(val) {
  if (!val) return null;
  const num = Number(String(val).replace(/,/g, '').trim());
  return Number.isFinite(num) ? num : null;
}

function extractValidEmail(raw) {
  const candidates = String(raw || '').split(/[;,\s]/).filter((value) => value.includes('@'));
  for (const candidate of candidates) {
    const email = candidate.trim().toLowerCase().replace(/^mailto:/i, '').split('?')[0].replace(/[.,;:'")>]+$/, '');
    if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) continue;
    if (PLACEHOLDER_EMAIL_PATTERNS.some((pattern) => pattern.test(email))) continue;
    const local = email.split('@')[0] || '';
    if (/^[0-9a-f]{24,}$/i.test(local)) continue;
    return email;
  }
  return '';
}

async function loadTop3Stats(baseName) {
  const step1BaseName = baseName.replace('[step-2]', '[step-1]');
  const step1CsvPath = path.join(STEP1_DIR, `${step1BaseName}.csv`);

  let csvToRead = null;
  if (fs.existsSync(step1CsvPath)) {
    csvToRead = step1CsvPath;
  } else {
    console.warn(`Step 1 CSV not found: ${step1CsvPath} — scanning for most recent batch step-1 CSV`);
    if (fs.existsSync(STEP1_DIR)) {
      const candidates = fs.readdirSync(STEP1_DIR)
        .filter(f => f.includes('[step-1]') && f.endsWith('.csv'))
        .sort().reverse();
      if (candidates.length) {
        csvToRead = path.join(STEP1_DIR, candidates[0]);
        console.log(`Using fallback Step 1 CSV for top-3 stats: ${csvToRead}`);
      }
    }
    if (!csvToRead) {
      console.warn('No Step 1 CSV found anywhere — top-3 stats unavailable.');
      return null;
    }
  }

  const rows = [];

  await new Promise((resolve, reject) => {
    fs.createReadStream(csvToRead)
      .pipe(csvParser())
      .on('data', (row) => rows.push(row))
      .on('end', resolve)
      .on('error', reject);
  });

  const top3Rows = rows.filter((row) => {
    const rankRaw = row['Map Rank'] || row.rank;
    const rankNum = parseNumber(rankRaw);
    return rankNum && rankNum >= 1 && rankNum <= 3;
  });

  if (!top3Rows.length) {
    console.warn('No top-3 rows found in Step 1 CSV for stats.');
    return null;
  }

  const ratings = [];
  const reviews = [];

  for (const row of top3Rows) {
    const ratingNum = parseNumber(row['Rating'] || row.rating);
    const reviewsNum = parseNumber(row['Reviews'] || row.reviews);

    if (ratingNum != null) ratings.push(ratingNum);
    if (reviewsNum != null) reviews.push(reviewsNum);
  }

  if (!ratings.length || !reviews.length) {
    console.warn('Top-3 stats missing rating or reviews data.');
    return null;
  }

  const ratingMin = Math.min(...ratings);
  const ratingMax = Math.max(...ratings);
  const reviewsMin = Math.min(...reviews);
  const reviewsMax = Math.max(...reviews);

  const stats = {
    ratingMin,
    ratingMax,
    reviewsMin,
    reviewsMax,
  };

  console.log('Top-3 stats from Step 1:', stats);
  return stats;
}

function loadAuditFindings(baseName, slug) {
  // Primary: exact baseName directory
  const auditPath = path.join(AUDIT_ROOT, baseName, 'audit-findings.json');
  if (fs.existsSync(auditPath)) {
    try {
      const all = JSON.parse(fs.readFileSync(auditPath, 'utf-8'));
      if (all[slug]) return all[slug];
    } catch {}
  }
  // Fallback: scan all audit batch dirs (newest first) for a file containing this slug.
  // Handles single-lead filtered CSVs that don't have their own audit run.
  if (fs.existsSync(AUDIT_ROOT)) {
    const dirs = fs.readdirSync(AUDIT_ROOT).sort().reverse();
    for (const dir of dirs) {
      if (dir === baseName) continue;
      const p = path.join(AUDIT_ROOT, dir, 'audit-findings.json');
      if (!fs.existsSync(p)) continue;
      try {
        const all = JSON.parse(fs.readFileSync(p, 'utf-8'));
        if (all[slug]) {
          console.log(`   → Audit findings found in fallback batch: ${dir}`);
          return all[slug];
        }
      } catch {}
    }
  }
  return null;
}

// Schema contract: every field step-6 reads must exist in current step-2.5 output.
// Logs a WARNING (not error) if a field is missing — prevents stale data silently producing wrong findings.
const WEBSITE_CONTRACT = ['hasLocalBusinessSchema','pageLoadSeconds','h1Text','h1IncludesCategory','h1IncludesCity','isHttps','h1Count','hasMetaDescription','renderBlockingHeadResources','imagesWithoutLazy','totalImages','websitePhoneMatchesGbp'];
const MOBILE_CONTRACT  = ['pageLoadSeconds','hasViewportMeta','clickToCallAboveFold','primaryCtaTapTargetPx','pageWeightKb','isHttps','h1Count','renderBlockingHeadResources','imagesWithoutLazy','totalImages'];

function validateAuditContract(audit, slug) {
  if (!audit) return;
  for (const field of WEBSITE_CONTRACT) {
    if (audit.website && !(field in audit.website)) {
      console.warn(`[audit-contract] MISSING website.${field} for ${slug} — finding skipped if it reads this field`);
    }
  }
  for (const field of MOBILE_CONTRACT) {
    if (audit.mobile && !(field in audit.mobile)) {
      console.warn(`[audit-contract] MISSING mobile.${field} for ${slug} — finding skipped if it reads this field`);
    }
  }
}

// PRIORITY-BASED SCORING:
// Each finding has a fixed priority (1-10, lower = more important).
// Audit picks the top 3 lowest-priority findings that triggered.
// "score" field == priority for sorting compatibility.
function scoreWebsiteFindings(audit) {
  if (!audit?.website) return [];
  const w = audit.website;
  const out = [];

  // PRIORITY 1: NAP mismatch — step-2.5 only sets websitePhoneMatchesGbp=false when tel: links were found AND mismatched
  if (w.websitePhoneMatchesGbp === false) {
    out.push({ key: 'nap', score: 1, finding: `your phone number on the site doesn't match your Google Business Profile, which weakens citation consistency` });
  }
  // PRIORITY 2: No LocalBusiness schema
  if (w.hasLocalBusinessSchema === false) {
    out.push({ key: 'schema', score: 2, finding: `there's no LocalBusiness schema markup, one of the top 5 Maps ranking signals` });
  }
  // PRIORITY 3: Slow page load
  if (w.pageLoadSeconds != null && w.pageLoadSeconds > 2.5) {
    out.push({ key: 'pageLoad', score: 3, finding: `your homepage loads in ${w.pageLoadSeconds.toFixed(1)} seconds — Google flags anything over 2.5` });
  }
  // PRIORITY 4: H1 missing both category AND city
  if (w.h1Text && !w.h1IncludesCategory && !w.h1IncludesCity) {
    out.push({ key: 'h1', score: 4, finding: `your headline doesn't include your primary service category or your city, missing a key on-page signal` });
  }
  // PRIORITY 6: H1 has category but missing city (city alone is a strong local signal)
  else if (w.h1Text && w.h1IncludesCategory && !w.h1IncludesCity) {
    out.push({ key: 'h1City', score: 6, finding: `your headline includes your service type but not your city — adding the city name is a key on-page signal for local search ranking` });
  }
  // PRIORITY 5: No HTTPS
  if (w.isHttps === false) {
    out.push({ key: 'https', score: 5, finding: `your site isn't on HTTPS — Google penalizes non-secure pages` });
  }
  // PRIORITY 7: Multiple H1 tags
  if (w.h1Count != null && w.h1Count > 1) {
    out.push({ key: 'multiH1', score: 7, finding: `your page has ${w.h1Count} H1 tags — Google recommends one H1 per page for clear hierarchy` });
  }
  // PRIORITY 8: Missing meta description
  if (w.hasMetaDescription === false) {
    out.push({ key: 'metaDesc', score: 8, finding: `your homepage is missing a meta description, weakening how it appears in search snippets` });
  }
  // PRIORITY 9: Render-blocking CSS/JS in head
  if (w.renderBlockingHeadResources != null && w.renderBlockingHeadResources > 3) {
    out.push({ key: 'renderBlock', score: 9, finding: `you have ${w.renderBlockingHeadResources} render-blocking resources in your head, delaying first paint` });
  }
  // PRIORITY 10: Images missing lazy loading — only flag if >40% of images are missing it (ratio avoids false positives)
  if (w.imagesWithoutLazy != null && w.totalImages > 5 && (w.imagesWithoutLazy / w.totalImages) > 0.4) {
    out.push({ key: 'lazyImg', score: 10, finding: `${w.imagesWithoutLazy} of your ${w.totalImages} images don't have lazy loading enabled, slowing your initial page load` });
  }

  return out.sort((a, b) => a.score - b.score);
}

// PRIORITY-BASED MOBILE SCORING (1 = most important, 10 = least)
function scoreMobileFindings(audit) {
  if (!audit?.mobile) return [];
  const m = audit.mobile;
  const out = [];

  // PRIORITY 1: Mobile load > 3s
  if (m.pageLoadSeconds != null && m.pageLoadSeconds > 3) {
    out.push({ key: 'mobileLoad', score: 1, finding: `your site takes ${m.pageLoadSeconds.toFixed(1)} seconds to load on mobile — 53 percent of visitors abandon at 3 seconds` });
  }
  // PRIORITY 2: No HTTPS
  if (m.isHttps === false) {
    out.push({ key: 'https', score: 2, finding: `your site isn't on HTTPS — Google penalizes non-secure pages on mobile` });
  }
  // PRIORITY 3: No responsive viewport meta
  if (m.hasViewportMeta === false) {
    out.push({ key: 'viewport', score: 3, finding: `there's no responsive viewport tag, so the site just shrinks the desktop layout instead of adapting for mobile` });
  }
  // PRIORITY 4: Click-to-call NOT above fold
  if (m.clickToCallAboveFold === false) {
    out.push({ key: 'c2cFold', score: 4, finding: `your tap-to-call button isn't visible above the fold on mobile, so a visitor has to scroll to find it` });
  }
  // PRIORITY 5: Tap target < 48px
  if (m.primaryCtaTapTargetPx != null && m.primaryCtaTapTargetPx < 48) {
    out.push({ key: 'tapTarget', score: 5, finding: `your primary call-to-action button is only ${m.primaryCtaTapTargetPx} pixels tall on mobile — Google's guideline is 48` });
  }
  // PRIORITY 6: Page weight > 4 MB (threshold raised from 3 MB to account for unavoidable third-party scripts like analytics/maps)
  if (m.pageWeightKb != null && m.pageWeightKb > 4000) {
    out.push({ key: 'pageWeight', score: 6, finding: `your mobile page loads ${(m.pageWeightKb / 1024).toFixed(1)} megabytes of resources — Google recommends keeping mobile pages under 3 megabytes to avoid slow load times` });
  }
  // PRIORITY 8: Multiple H1 tags
  if (m.h1Count != null && m.h1Count > 1) {
    out.push({ key: 'multiH1', score: 8, finding: `your mobile page has ${m.h1Count} H1 tags — Google recommends one H1 per page for clear hierarchy` });
  }
  // PRIORITY 9: Render-blocking CSS/JS in head
  if (m.renderBlockingHeadResources != null && m.renderBlockingHeadResources > 3) {
    out.push({ key: 'renderBlock', score: 9, finding: `you have ${m.renderBlockingHeadResources} render-blocking resources in your head, delaying first paint on mobile` });
  }
  // PRIORITY 10: Images missing lazy loading — only flag if >40% of images are missing it
  if (m.imagesWithoutLazy != null && m.totalImages > 5 && (m.imagesWithoutLazy / m.totalImages) > 0.4) {
    out.push({ key: 'lazyImg', score: 10, finding: `${m.imagesWithoutLazy} of your ${m.totalImages} images don't have lazy loading enabled, slowing your mobile load` });
  }

  return out.sort((a, b) => a.score - b.score);
}

function joinFindings(findings, max = 3) {
  const picked = findings.slice(0, max).map((f) => f.finding);
  if (!picked.length) return '';
  if (picked.length === 1) return picked[0];
  return picked.slice(0, -1).join('; ') + '; and ' + picked[picked.length - 1];
}

const WEBSITE_KEY_TO_PHRASE = {
  pageLoad: 'site speed',
  schema: 'structured data',
  nap: 'citation consistency',
  h1: 'on-page signals',
  locations: 'page structure for service-area coverage',
};

function joinPhrases(phrases) {
  if (!phrases.length) return '';
  if (phrases.length === 1) return phrases[0];
  if (phrases.length === 2) return phrases[0] + ' and ' + phrases[1];
  return phrases.slice(0, -1).join(', ') + ', and ' + phrases[phrases.length - 1];
}

function scoreMapsFindings(audit, top3Stats, record) {
  const out = [];
  const rating = parseFloat(normalizeField(record, 'Rating') || '');
  const reviews = parseInt(normalizeField(record, 'Reviews') || '', 10);

  // Review count vs top 3 average
  if (top3Stats && Number.isFinite(reviews)) {
    const avgReviews = Math.round((top3Stats.reviewsMin + top3Stats.reviewsMax) / 2);
    if (avgReviews > 0 && reviews < avgReviews * 0.6) {
      const ratio = reviews / avgReviews;
      out.push({
        key: 'reviewCount',
        score: ratio < 0.3 ? 15 : 35,
        finding: `you have ${reviews} Google reviews; the top 3 in this search average around ${avgReviews} — Google weighs total review volume heavily for Maps ranking`,
      });
    }
  }

  // Rating vs top 3
  if (top3Stats && Number.isFinite(rating)) {
    const avgRating = (top3Stats.ratingMin + top3Stats.ratingMax) / 2;
    if (rating < avgRating - 0.15) {
      out.push({
        key: 'ratingGap',
        score: 30,
        finding: `you're at ${rating} stars; the top 3 average around ${avgRating.toFixed(1)} — even a small rating gap costs you Maps ranking position`,
      });
    }
  }

  // NOTE: NAP is intentionally NOT in Maps findings.
  // It's a website-vs-listing comparison, so it belongs in the Website section
  // (mentioning "phone on website" while video is still showing Maps is confusing).

  // GBP audit data (if available)
  if (audit?.gbp?.daysSinceLastReview != null && audit.gbp.daysSinceLastReview > 30) {
    out.push({
      key: 'reviewVelocity',
      score: audit.gbp.daysSinceLastReview > 90 ? 20 : 40,
      finding: `your last Google review was about ${audit.gbp.daysSinceLastReview} days ago — review velocity (how recent your reviews are) weighs heavily in Maps ranking`,
    });
  }

  if (audit?.gbp?.photoCount != null && audit.gbp.photoCount >= 2 && audit.gbp.photoCount < 30) {
    out.push({
      key: 'photoCount',
      score: audit.gbp.photoCount < 10 ? 25 : 50,
      finding: `you have only ${audit.gbp.photoCount} photos on your Google Business Profile — top performers in your category typically have 50 or more`,
    });
  }

  if (audit?.gbp?.categoriesCount != null && audit.gbp.categoriesCount < 3) {
    out.push({
      key: 'categoriesCount',
      score: 35,
      finding: `you have only ${audit.gbp.categoriesCount} category listed on your Google Business Profile — top performers list 3 to 5 to capture more search variations`,
    });
  }

  // GBP primary category doesn't match the search term — only fire if we confirmed what the category actually is
  if (audit?.gbp?.primaryCategoryMatchesSearch === false && audit?.gbp?.primaryCategory) {
    out.push({
      key: 'categoryMismatch',
      score: 18,
      finding: `your Google Business Profile primary category is "${audit.gbp.primaryCategory || 'a generic category'}" — a mismatched primary category directly limits your visibility in this search`,
    });
  }

  // No business hours set on GBP
  if (audit?.gbp?.hasBusinessHours === false) {
    out.push({
      key: 'businessHours',
      score: 22,
      finding: `your Google Business Profile has no business hours set — Google suppresses incomplete profiles in local pack results`,
    });
  }

  // Very low recent review velocity — only fire when daysSinceLastReview has NOT already fired
  // (avoids saying the same thing twice). Catches active businesses getting very few recent reviews.
  const velocityAlreadyFired = out.some(f => f.key === 'reviewVelocity');
  if (!velocityAlreadyFired && audit?.gbp?.reviewsLast30Days != null && audit.gbp.reviewsLast30Days <= 1) {
    const recentText = audit.gbp.reviewsLast30Days === 0
      ? `you haven't received any new Google reviews in the last 30 days`
      : `you received only 1 new Google review in the last 30 days`;
    out.push({
      key: 'reviewVelocityRecent',
      score: 32,
      finding: `${recentText} — Google's algorithm weighs recent review velocity when ranking in the local pack`,
    });
  }

  // Zero owner responses (only flag when there are enough reviews to respond to)
  if (audit?.gbp?.ownerResponseCount === 0 && (audit?.gbp?.reviewCount || 0) > 5) {
    out.push({
      key: 'ownerResponse',
      score: 45,
      finding: `you have ${audit.gbp.reviewCount} reviews but haven't responded to any — Google treats owner response rate as a trust and engagement signal for Maps ranking`,
    });
  }

  return out.sort((a, b) => a.score - b.score);
}

function buildScript(record, top3Stats, audit) {
  const name =
    normalizeField(record, 'Business Name') || normalizeField(record, 'name') || 'your business';
  validateAuditContract(audit, slugify(name, { lower: true, strict: true }));
  const city = normalizeField(record, 'City') || normalizeField(record, 'city') || '';
  const rankRaw =
    normalizeField(record, 'Map Rank') || normalizeField(record, 'rank') || 'your current position';
  const rankNum = parseInt(String(rankRaw), 10);
  const rating = normalizeField(record, 'Rating') || normalizeField(record, 'rating');
  const reviews = normalizeField(record, 'Reviews') || normalizeField(record, 'reviews');
  const searchTerm =
    normalizeField(record, 'Search Term') ||
    normalizeField(record, 'searchTerm') ||
    'your type of business near you';
  // Don't append "in {city}" if the searchTerm already has an "in <somewhere>" clause —
  // that would produce awkward "in Culver City, CA in Los Angeles".
  const searchTermHasInClause = /\s+in\s+/i.test(searchTerm);
  const inCity = !searchTermHasInClause && city ? ` in ${city}` : '';

  const isTop3 = Number.isFinite(rankNum) && rankNum >= 1 && rankNum <= 3;

  const intro = isTop3
    ? `Hey, this is Chris with Rocket Growth Agency — local SEO experts who help businesses rank higher on Google Maps to gain more leads. We just analyzed ${name}'s current Google Maps, website, and mobile, and you're already in the top 3 — but here's where you're vulnerable to losing that position.`
    : `Hey, this is Chris with Rocket Growth Agency — local SEO experts who help businesses rank higher on Google Maps to gain more leads. We just analyzed ${name}'s current Google Maps, website, and mobile, and found the top issues that are keeping you from ranking in the top position.`;

  function numberedJoin(findings, max = 3) {
    const picked = findings.slice(0, max).map((f) => f.finding);
    if (!picked.length) return '';
    const labels = ['First', 'Second', 'Third'];
    return picked.map((p, i) => `${labels[i]}: ${p}.`).join(' ');
  }

  let mapsSegment;
  if (isTop3) {
    const mapsFindingsT3 = scoreMapsFindings(audit, top3Stats, record);
    const count = mapsFindingsT3.length;
    const mapsListT3 = numberedJoin(mapsFindingsT3, 3);
    const baseLine = `When a customer is looking for ${searchTerm}, ${name} ranks #${rankNum} — already in the top 3, which captures 70 percent of all local leads from this search. That's the most valuable real estate.`;
    if (count >= 3) {
      mapsSegment = `${baseLine} But here's where you're vulnerable on your Maps listing: ${mapsListT3}`;
    } else if (count === 2) {
      mapsSegment = `${baseLine} But here's where you're vulnerable on your Maps listing: ${numberedJoin(mapsFindingsT3, 2)}`;
    } else if (count === 1) {
      mapsSegment = `${baseLine} But one vulnerability stood out on your Maps listing: ${mapsFindingsT3[0].finding}.`;
    } else {
      mapsSegment = `${baseLine} Your Maps signals are clean — no obvious vulnerabilities, but that just means you're at risk from review velocity and newer competitors.`;
    }
  } else {
    const mapsFindings = scoreMapsFindings(audit, top3Stats, record);
    const mapsList = numberedJoin(mapsFindings, 3);
    if (mapsList) {
      mapsSegment = `When a customer is looking for ${searchTerm}, ${name} ranks #${rankRaw} — which is outside of the top 3 ranking, which accounts for 70 percent of all local leads. Here are the top issues we found on your Maps listing: ${mapsList}`;
    } else {
      mapsSegment = `When a customer is looking for ${searchTerm}, ${name} ranks #${rankRaw} — which is outside of the top 3 ranking, which accounts for 70 percent of all local leads.`;
    }
  }

  const websiteFindings = scoreWebsiteFindings(audit);
  const websiteList = numberedJoin(websiteFindings, 3);
  const websiteSegment = isTop3
    ? (() => {
        const count = websiteFindings.length;
        if (count >= 3) {
          return `After reviewing your website — Google's primary trust signal for validating Maps ranking. Here are the website signals worth tightening to hold your top 3 spot: ${websiteList}`;
        }
        if (count === 2) {
          return `After reviewing your website — Google's primary trust signal for validating Maps ranking. Here are the website signals worth tightening to hold your top 3 spot: ${numberedJoin(websiteFindings, 2)}`;
        }
        if (count === 1) {
          return `After reviewing your website — Google's primary trust signal for validating Maps ranking. One website signal worth tightening to hold your top 3 spot: ${websiteFindings[0].finding}.`;
        }
        return `After reviewing your website — Google's primary trust signal for validating Maps ranking. Your site signals are clean — solid foundation for holding your top 3 spot.`;
      })()
    : (() => {
        const count = websiteFindings.length;
        if (count >= 3) {
          return `After reviewing your website — Google's primary trust signal for validating Maps ranking. Here are the top issues we found: ${websiteList}`;
        }
        if (count === 2) {
          const list = numberedJoin(websiteFindings, 2);
          return `After reviewing your website — Google's primary trust signal for validating Maps ranking. We found 2 issues to flag: ${list}`;
        }
        if (count === 1) {
          return `After reviewing your website — Google's primary trust signal for validating Maps ranking. Just 1 issue stood out: ${websiteFindings[0].finding}.`;
        }
        return `After reviewing your website — Google's primary trust signal for validating Maps ranking. Your site signals are clean — no major issues stood out.`;
      })();

  const mobileFindings = scoreMobileFindings(audit);
  const mobileList = numberedJoin(mobileFindings, 3);
  const mobileSegment = isTop3
    ? (() => {
        const count = mobileFindings.length;
        if (count >= 3) {
          return `And then on mobile — where 70 percent of local-search traffic actually comes from. Here are the gaps a competitor could exploit: ${mobileList}`;
        }
        if (count === 2) {
          return `And then on mobile — where 70 percent of local-search traffic actually comes from. We found 2 gaps a competitor could exploit: ${numberedJoin(mobileFindings, 2)}`;
        }
        if (count === 1) {
          return `And then on mobile — where 70 percent of local-search traffic actually comes from. One gap a competitor could exploit: ${mobileFindings[0].finding}.`;
        }
        return `And then on mobile — where 70 percent of local-search traffic actually comes from. Your mobile signals are clean — fast load, clean structure, responsive layout.`;
      })()
    : (() => {
        const count = mobileFindings.length;
        if (count >= 3) {
          return `And then on mobile — where 70 percent of local-search traffic actually comes from. Here are the top issues we found: ${mobileList}`;
        }
        if (count === 2) {
          const list = numberedJoin(mobileFindings, 2);
          return `And then on mobile — where 70 percent of local-search traffic actually comes from. We found 2 mobile issues to flag: ${list}`;
        }
        if (count === 1) {
          return `And then on mobile — where 70 percent of local-search traffic actually comes from. Just 1 mobile issue stood out: ${mobileFindings[0].finding}.`;
        }
        return `And then on mobile — where 70 percent of local-search traffic actually comes from. Your mobile signals are solid — fast load, clean structure, responsive layout.`;
      })();

  const outroText = isTop3
    ? `This was a brief look at some of the vulnerabilities we found on your Google Maps, website, and mobile. To get the full audit with every signal you need to defend your top 3 spot — and the exact plan to push for #1 — tap the button below for your free growth audit. Free, no call required.`
    : `This was a brief look at some of the issues we found on your Google Maps, website, and mobile. To get the full audit with every issue keeping you from the top 3 — and the exact plan to capture more leads — tap the button below for your free growth audit. Free, no call required.`;
  // NOTE: both outros locked 2026-04-25 — DO NOT EDIT without explicit user request.

  return {
    intro,
    maps: mapsSegment,
    website: websiteSegment,
    mobile: mobileSegment,
    outro: outroText,
    combined: [intro, mapsSegment, websiteSegment, mobileSegment, outroText].join(' '),
  };
}

function getMp3DurationSeconds(filePath) {
  return new Promise((resolve) => {
    const ff = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', filePath]);
    let out = '';
    ff.stdout.on('data', (d) => (out += d.toString()));
    ff.on('close', () => resolve(Number(out.trim()) || 0));
  });
}

function concatMp3Segments(segmentDir, segmentNames, outPath) {
  return new Promise((resolve, reject) => {
    const concatList = path.join(segmentDir, 'concat.txt');
    const lines = segmentNames.map((n) => `file '${path.join(segmentDir, n + '.mp3').replace(/'/g, "\\'")}'`).join('\n');
    fs.writeFileSync(concatList, lines);
    // Re-encode (not -c copy) so segment boundaries don't produce pitch/codec
    // glitches when MP3 frames don't perfectly align between segments.
    // Force consistent sample rate (24000 Hz matches OpenAI TTS default) + bitrate.
    const ff = spawn('ffmpeg', [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatList,
      '-c:a', 'libmp3lame',
      '-b:a', '128k',
      '-ar', '24000',
      '-ac', '1',
      outPath,
    ], { stdio: 'ignore' });
    ff.on('close', (code) => (code === 0 ? resolve(outPath) : reject(new Error(`ffmpeg concat failed code ${code}`))));
  });
}

async function ttsToFile(text, outPath) {
  const response = await openai.audio.speech.create({
    model: 'gpt-4o-mini-tts',
    voice: 'echo',
    input: text,
    format: 'mp3',
    speed: 1.2,
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outPath, buffer);
  return outPath;
}

async function generateVoiceover(record, index, top3Stats, baseName) {
  const name =
    normalizeField(record, 'Business Name') || normalizeField(record, 'name') || 'business';
  const email = extractValidEmail(normalizeField(record, 'email'));

  if (!email) {
    return null;
  }

  const slug = slugify(name, { lower: true, strict: true }) || `contact-${index + 1}`;
  const indexStr = String(index + 1).padStart(2, '0');
  const segmentDir = path.join(AUDIO_DIR, `${indexStr}_${slug}_segments`);
  if (!fs.existsSync(segmentDir)) fs.mkdirSync(segmentDir, { recursive: true });

  console.log(`▶ Voiceover ${index + 1}: ${name} (email: ${email})`);

  const audit = loadAuditFindings(baseName, slug);
  if (audit) console.log(`   → Audit findings loaded for ${slug}`);
  const segments = buildScript(record, top3Stats, audit);

  // Generate one MP3 per segment + combined for backward compat
  const segmentNames = ['intro', 'maps', 'website', 'mobile', 'outro'];
  const manifest = { businessName: name, slug, segments: {} };

  for (const segName of segmentNames) {
    const segPath = path.join(segmentDir, `${segName}.mp3`);
    console.log(`   → Generating ${segName}: ${segPath}`);
    await ttsToFile(segments[segName], segPath);
    const duration = await getMp3DurationSeconds(segPath);
    manifest.segments[segName] = {
      file: path.basename(segPath),
      durationSeconds: duration,
      text: segments[segName],
    };
    console.log(`     ✓ ${segName} = ${duration.toFixed(2)}s`);
  }

  // Build combined.mp3 by concatenating segment MP3s — ensures total duration = sum of segments
  const combinedPath = path.join(AUDIO_DIR, `${indexStr}_${slug}.mp3`);
  console.log(`   → Concatenating segments → ${combinedPath}`);
  await concatMp3Segments(segmentDir, segmentNames, combinedPath);
  manifest.combinedFile = path.basename(combinedPath);
  manifest.combinedDurationSeconds = await getMp3DurationSeconds(combinedPath);

  const manifestPath = path.join(segmentDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`   ✓ Wrote manifest: ${manifestPath}`);

  return combinedPath;
}

async function main() {
  const rows = [];

  if (!fs.existsSync(STEP2_CSV)) {
    console.error(`Step 2 CSV not found: ${STEP2_CSV}`);
    process.exit(1);
  }

  const top3Stats = await loadTop3Stats(STEP2_BASENAME);

  await new Promise((resolve, reject) => {
    fs.createReadStream(STEP2_CSV)
      .pipe(csvParser())
      .on('data', (row) => {
        rows.push(row);
      })
      .on('end', resolve)
      .on('error', reject);
  });

  console.log(`Loaded ${rows.length} rows from Step 2 CSV.`);

  const rowsWithEmail = rows.filter((r) => extractValidEmail(normalizeField(r, 'email')));
  if (!rowsWithEmail.length) {
    console.log('No rows with email found. Nothing to do.');
    return;
  }

  const limitedRows = rowsWithEmail.slice(0, MAX_RECORDINGS);

  for (let i = 0; i < limitedRows.length; i++) {
    try {
      await generateVoiceover(limitedRows[i], i, top3Stats, STEP2_BASENAME);
    } catch (err) {
      console.error(`   ❌ Error generating voiceover ${i + 1}:`, err.message);
    }
  }

  console.log('✅ Done generating test voiceover(s).');
}

main().catch((err) => {
  console.error('Fatal error in step-6-voiceover:', err);
});
