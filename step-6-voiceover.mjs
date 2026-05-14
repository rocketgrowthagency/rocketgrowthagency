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

// Strategy 0: Airtable Leads grouped by Search Term + Map Rank 1-3 (most recent).
// This is the PREFERRED source — single source of truth, populated by step-1 + healed
// by step-2.5 write-back. Falls back to CSV strategies if Airtable creds missing or
// the search has no top-3 records yet. Aligns with Chris's "Source Run grouping"
// design — no denormalized Competitor 1/2/3 fields needed.
async function loadTop3FromAirtable(searchTerm) {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey || !baseId || !searchTerm) return null;
  const tableName = process.env.AIRTABLE_LEADS_TABLE || 'Leads';
  const escaped = String(searchTerm).replace(/"/g, '\\"');
  // Pull all rank-1/2/3 records for the search, sort by Date Scraped descending,
  // take the most-recent 3 (i.e., latest scrape's top-3).
  const formula = `AND({Search Term} = "${escaped}", OR({Map Rank}=1,{Map Rank}=2,{Map Rank}=3))`;
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}?filterByFormula=${encodeURIComponent(formula)}&sort[0][field]=Date Scraped&sort[0][direction]=desc&maxRecords=20`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) return null;
    const data = await res.json();
    const recs = data.records || [];
    // Group by Source Run, take the run whose records collectively cover ranks 1-3 most recently.
    // Walk records (already in Date Scraped DESC) and pick the first 3 ranks we encounter,
    // preferring records from the SAME source run.
    const seenRanks = new Set();
    const picked = [];
    let preferredRun = null;
    for (const r of recs) {
      const f = r.fields || {};
      const rank = f['Map Rank'];
      const sr = Array.isArray(f['Source Run']) ? f['Source Run'][0] : f['Source Run'];
      if (preferredRun && sr !== preferredRun) continue;
      if (!preferredRun) preferredRun = sr;
      if (!seenRanks.has(rank) && rank >= 1 && rank <= 3) {
        seenRanks.add(rank);
        picked.push({ rank, ratingNum: f.Rating, reviewsNum: f['Review Count'], cat: (f.Category || '').trim() });
      }
      if (picked.length === 3) break;
    }
    if (!picked.length) return null;
    const ratings = picked.map(p => p.ratingNum).filter(n => typeof n === 'number');
    const reviews = picked.map(p => p.reviewsNum).filter(n => typeof n === 'number');
    const categories = picked.map(p => p.cat).filter(Boolean);
    if (!ratings.length || !reviews.length) {
      console.warn(`[top3] Airtable hit but Reviews/Rating missing for top-3 of "${searchTerm}" — falling back to CSV`);
      return null;
    }
    const catCount = {};
    for (const c of categories) catCount[c] = (catCount[c] || 0) + 1;
    let majorityCategory = null, majorityCount = 0;
    for (const [c, n] of Object.entries(catCount)) if (n > majorityCount) { majorityCategory = c; majorityCount = n; }
    const stats = {
      ratingMin: Math.min(...ratings),
      ratingMax: Math.max(...ratings),
      ratingAvg: ratings.reduce((a, b) => a + b, 0) / ratings.length,
      reviewsMin: Math.min(...reviews),
      reviewsMax: Math.max(...reviews),
      reviewsAvg: Math.round(reviews.reduce((a, b) => a + b, 0) / reviews.length),
      majorityCategory,
      categories,
      _source: `Airtable (Source Run ${preferredRun?.slice(0, 8) || '?'})`
    };
    console.log(`[top3] from Airtable: ${stats._source} → reviewsAvg=${stats.reviewsAvg} ratingAvg=${stats.ratingAvg.toFixed(2)} cat="${stats.majorityCategory}"`);
    return stats;
  } catch (e) {
    console.warn(`[top3] Airtable lookup failed: ${e.message || e}`);
    return null;
  }
}

async function loadTop3Stats(baseName, step2CsvPath) {
  // Strategy 0: Airtable by Search Term (preferred, single source of truth).
  // Read Search Term from step-2 CSV first row.
  if (step2CsvPath && fs.existsSync(step2CsvPath)) {
    let searchTerm = null;
    await new Promise((resolve) => {
      const rows = [];
      fs.createReadStream(step2CsvPath).pipe(csvParser())
        .on('data', (row) => rows.push(row))
        .on('end', () => { if (rows[0]) searchTerm = rows[0]['Search Term'] || rows[0].searchTerm || null; resolve(); })
        .on('error', resolve);
    });
    if (searchTerm) {
      const atStats = await loadTop3FromAirtable(searchTerm);
      if (atStats) return atStats;
    }
  }

  // Strategy 1: exact match step-1 base name (single-business pipeline) — CSV fallback
  const step1BaseName = baseName.replace('[step-2]', '[step-1]');
  const step1CsvPath = path.join(STEP1_DIR, `${step1BaseName}.csv`);
  let csvToRead = fs.existsSync(step1CsvPath) ? step1CsvPath : null;

  // Strategy 2: peek at step-2 CSV to get searchTerm, then find batch step-1
  // whose filename matches the slugified search term. Critical for single-business
  // step-2 files (e.g. alvin-garage-door-single) that were promoted out of a batch —
  // the batch step-1 file has the correct top-3 for that lead's search context.
  if (!csvToRead && step2CsvPath && fs.existsSync(step2CsvPath)) {
    let searchTerm = null;
    await new Promise((resolve) => {
      const rows = [];
      fs.createReadStream(step2CsvPath)
        .pipe(csvParser())
        .on('data', (row) => rows.push(row))
        .on('end', () => {
          if (rows[0]) searchTerm = rows[0]['Search Term'] || rows[0].searchTerm || null;
          resolve();
        })
        .on('error', resolve);
    });
    if (searchTerm && fs.existsSync(STEP1_DIR)) {
      const searchSlug = searchTerm.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const matches = fs.readdirSync(STEP1_DIR)
        .filter(f => f.includes('[step-1]') && f.endsWith('.csv') && f.toLowerCase().includes(searchSlug));
      if (matches.length) {
        const newest = matches
          .map(f => ({ path: path.join(STEP1_DIR, f), mtime: fs.statSync(path.join(STEP1_DIR, f)).mtimeMs }))
          .sort((a, b) => b.mtime - a.mtime)[0];
        csvToRead = newest.path;
        console.log(`Top-3 stats: matched batch step-1 by search-term slug "${searchSlug}" → ${path.basename(csvToRead)}`);
      }
    }
  }

  // Strategy 3: most-recent fallback (legacy behavior — last resort)
  if (!csvToRead && fs.existsSync(STEP1_DIR)) {
    const candidates = fs.readdirSync(STEP1_DIR)
      .filter(f => f.includes('[step-1]') && f.endsWith('.csv'))
      .sort().reverse();
    if (candidates.length) {
      csvToRead = path.join(STEP1_DIR, candidates[0]);
      console.warn(`Top-3 stats: no search-term match; using fallback ${path.basename(csvToRead)} — comparisons may be inaccurate`);
    }
  }

  if (!csvToRead) {
    console.warn('No Step 1 CSV found anywhere — top-3 stats unavailable.');
    return null;
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
  const categories = [];

  for (const row of top3Rows) {
    const ratingNum = parseNumber(row['Rating'] || row.rating);
    const reviewsNum = parseNumber(row['Reviews'] || row.reviews);
    const cat = (row['Category'] || row.category || '').trim();
    if (ratingNum != null) ratings.push(ratingNum);
    if (reviewsNum != null) reviews.push(reviewsNum);
    if (cat) categories.push(cat);
  }

  if (!ratings.length || !reviews.length) {
    console.warn('Top-3 stats missing rating or reviews data.');
    return null;
  }

  // Compute majority primary category among top-3
  const catCount = {};
  for (const c of categories) catCount[c] = (catCount[c] || 0) + 1;
  let majorityCategory = null;
  let majorityCount = 0;
  for (const [c, n] of Object.entries(catCount)) {
    if (n > majorityCount) { majorityCategory = c; majorityCount = n; }
  }

  const stats = {
    ratingMin: Math.min(...ratings),
    ratingMax: Math.max(...ratings),
    ratingAvg: ratings.reduce((a, b) => a + b, 0) / ratings.length,
    reviewsMin: Math.min(...reviews),
    reviewsMax: Math.max(...reviews),
    reviewsAvg: Math.round(reviews.reduce((a, b) => a + b, 0) / reviews.length),
    majorityCategory,
    categories,
  };

  console.log('Top-3 stats from Step 1:', { ...stats, categories: categories.join(' | ') });
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
const WEBSITE_CONTRACT = ['hasLocalBusinessSchema','pageLoadSeconds','h1Text','h1IncludesCategory','h1IncludesCity','isHttps','h1Count','hasMetaDescription','renderBlockingHeadResources','imagesWithoutLazy','totalImages','websitePhoneMatchesGbp','primaryCtaText','hasReviewsOnPage','hasServiceAreaListed'];
const MOBILE_CONTRACT  = ['pageLoadSeconds','hasViewportMeta','clickToCallAboveFold','primaryCtaTapTargetPx','pageWeightKb','isHttps','h1Count','renderBlockingHeadResources','imagesWithoutLazy','totalImages','primaryCtaText','phoneVisibleAboveFold','socialProofAboveFold'];

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
function scoreWebsiteFindings(audit, businessName) {
  if (!audit?.website) return [];
  const w = { ...audit.website, businessNameForCheck: businessName || '' };
  const out = [];

  // PRIORITY 1: NAP mismatch — strict (prominent-phone semantics) + toll-free / call-tracker detection.
  // Differentiate: toll-free prefix (call-tracker), multi-phone mismatch, multi-phone existence, simple mismatch.
  if (w.websitePhoneMatchesGbp === false) {
    const fmt = (s) => s && s.length === 10 ? `${s.slice(0,3)}-${s.slice(3,6)}-${s.slice(6)}` : s;
    const TOLL_FREE_PREFIXES = /^(?:800|833|844|855|866|877|888)/;
    const prominent = (w.prominentSitePhone || '').replace(/\D/g, '');
    const isTollFree = prominent && TOLL_FREE_PREFIXES.test(prominent);
    if (isTollFree && w.prominentPhoneMatchesGbp === false) {
      out.push({ key: 'nap', score: 1, finding: `your website's main phone is ${fmt(prominent)} — a toll-free number that routes through a call-tracking line. Your Google Business Profile lists a different local number, which means Google can't tie those tracked calls back to your listing, weakening the engagement signal that drives local rank` });
    } else if (w.distinctSitePhoneCount > 1 && w.prominentPhoneMatchesGbp === false && w.prominentSitePhone) {
      out.push({ key: 'nap', score: 1, finding: `your website shows ${w.distinctSitePhoneCount} different phone numbers — the main header lists ${fmt(prominent)}, but your Google Business Profile lists a different number. Visitors and Google's local algorithm both see this NAP inconsistency` });
    } else if (w.distinctSitePhoneCount > 1) {
      out.push({ key: 'nap', score: 1, finding: `your website shows ${w.distinctSitePhoneCount} different phone numbers — pick one and use it everywhere, so visitors and Google see consistent NAP signals` });
    } else {
      out.push({ key: 'nap', score: 1, finding: `your phone number on the site doesn't match your Google Business Profile, which weakens citation consistency` });
    }
  }
  // PRIORITY 1.5 (NEW): NAP not visible above the fold — phone AND address as visible text in the hero
  if (w.napAboveFold === false) {
    out.push({ key: 'napAboveFold', score: 1.5, finding: `your phone number and address aren't both visible above the fold — visitors and Google's local trust signals look for NAP in the hero, not buried in the footer` });
  }
  // PRIORITY 1.3 (NEW 2026-05-14): Domain doesn't match business BRAND name.
  // Filter out industry/service stopwords from the business name so we only check the
  // unique brand tokens against the domain. Otherwise "Alvin Garage Door" would match
  // sswhitegaragedoors.com just because the domain contains "garage" + "door".
  if (w.websiteUrl && w.businessNameForCheck) {
    try {
      const host = new URL(w.websiteUrl).hostname.toLowerCase().replace(/^www\./, '');
      const domainRoot = host.replace(/\.(com|net|org|co|us|biz|info|io|me|shop|store)$/i, '');
      const INDUSTRY_STOPWORDS = new Set([
        'the','and','for','llc','inc','ltd','co','corp','of','at','your',
        'garage','door','doors','repair','repairs','service','services','company','companies',
        'shop','store','center','centers','solution','solutions','group','team',
        'professional','professionals','expert','experts','specialist','specialists','pro','pros',
        'plumbing','plumber','plumbers','hvac','heating','cooling','air','conditioning',
        'roofing','roofer','roofers','locksmith','locksmiths','dentist','dentists','dental',
        'auto','automotive','car','cars','vehicle','vehicles',
        'painting','painters','painter','cleaning','cleaners','cleaner',
        'landscaping','landscape','lawn','tree','trees',
        'pest','control','exterminator','exterminators',
        'electric','electrician','electricians','contractor','contractors','construction','remodel','remodeling'
      ]);
      const brandTokens = w.businessNameForCheck.toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(t => t.length >= 3 && !INDUSTRY_STOPWORDS.has(t));
      const hasBrandMatch = brandTokens.length > 0 && brandTokens.some(t => domainRoot.includes(t));
      if (brandTokens.length && !hasBrandMatch) {
        out.push({
          key: 'domainNameMismatch',
          score: 1.3,
          finding: `your website domain — ${host} — doesn't match your business name. Google reads brand-to-domain consistency as a citation trust signal, and prospects clicking through from search see an unfamiliar URL, which costs both ranking weight and conversion confidence`
        });
      }
    } catch (_) {}
  }
  // PRIORITY 2: No LocalBusiness schema
  if (w.hasLocalBusinessSchema === false) {
    out.push({ key: 'schema', score: 2, finding: `there's no LocalBusiness schema markup, one of the top 5 Maps ranking signals` });
  }
  // PRIORITY 2.5 (NEW): Title tag missing city or category — #1 on-page local signal
  if (w.title) {
    if (!w.titleIncludesCity && !w.titleIncludesCategory) {
      out.push({ key: 'title', score: 2.5, finding: `your page title is "${w.title.slice(0, 80)}" — it doesn't include your service category or your city, which are the strongest on-page signals Google uses for local ranking` });
    } else if (!w.titleIncludesCity) {
      out.push({ key: 'titleCity', score: 2.5, finding: `your page title doesn't include your city — adding the city name to the title is one of the easiest on-page wins for ranking in local search` });
    } else if (!w.titleIncludesCategory) {
      out.push({ key: 'titleCategory', score: 2.5, finding: `your page title doesn't include your service category — Google reads the title first when matching a query to your page` });
    }
  }
  // PRIORITY 2.7 (NEW): Canonical points to a different URL — silent ranking killer
  if (w.canonicalMatches === false && w.canonicalUrl) {
    out.push({ key: 'canonical', score: 2.7, finding: `your canonical tag points to a different URL than this page — Google may be indexing the wrong version, which fragments your ranking signals` });
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

  // TIER 2 — conversion signals (scores 11-16, fill in when Tier 1 doesn't reach 3 findings)
  // PRIORITY 11: Generic CTA text
  if (w.primaryCtaText != null) {
    const isGeneric = /^(contact|learn more|more|click here|submit|send|read more|see more|view more|get started|find out|discover)$/i.test(w.primaryCtaText.trim());
    if (isGeneric) {
      out.push({ key: 'ctaText', score: 11, finding: `your main call-to-action says "${w.primaryCtaText.trim()}" — action-specific buttons like "Call Now" or "Get Free Quote" convert 2–3x better` });
    }
  }
  // PRIORITY 12: No reviews or testimonials on the page
  if (w.hasReviewsOnPage === false) {
    out.push({ key: 'noReviews', score: 12, finding: `your website doesn't show any customer reviews or testimonials — visitors can't verify your reputation without leaving the page to check Google` });
  }
  // PRIORITY 12.5 (NEW): Few or no dedicated service-area / location pages
  if (w.serviceAreaPagesCount != null && w.serviceAreaPagesCount <= 1) {
    const msg = w.serviceAreaPagesCount === 0
      ? `you don't have any dedicated city or service-area pages — top performers rank in multiple cities by publishing a focused landing page per location they serve`
      : `you only have one service-area page — top performers stack rankings across cities by publishing a dedicated landing page per location they serve`;
    out.push({ key: 'serviceAreaPages', score: 12.5, finding: msg });
  }
  // PRIORITY 13: No service area listed
  if (w.hasServiceAreaListed === false) {
    out.push({ key: 'noServiceArea', score: 13, finding: `your website doesn't list a service area — mentioning specific cities and neighborhoods you serve is a strong local SEO signal` });
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
  // PRIORITY 6.5 (NEW): No sticky CTA on scroll — major mobile conversion factor
  if (m.hasStickyCta === false) {
    out.push({ key: 'stickyCta', score: 6.5, finding: `there's no sticky call-to-action that stays visible when visitors scroll on mobile — top performers keep a Call or Quote button always reachable, so visitors don't have to scroll back up to convert` });
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
  // PRIORITY 10.5 (NEW): No click-to-text (sms:) support
  if (m.hasClickToText === false) {
    out.push({ key: 'clickToText', score: 10.5, finding: `your mobile site has no tap-to-text option — modern local customers default to SMS for quick questions, and adding a single sms link is a free conversion path most competitors are missing` });
  }

  // TIER 2 — conversion signals (scores 11-16, fill in when Tier 1 doesn't reach 3 findings)
  // PRIORITY 11: Generic CTA text on mobile
  if (m.primaryCtaText != null) {
    const isGeneric = /^(contact|learn more|more|click here|submit|send|read more|see more|view more|get started|find out|discover)$/i.test(m.primaryCtaText.trim());
    if (isGeneric) {
      out.push({ key: 'ctaText', score: 11, finding: `your main button says "${m.primaryCtaText.trim()}" — on mobile, action-specific buttons like "Call Now" or "Get Free Quote" convert significantly better` });
    }
  }
  // PRIORITY 12: Phone number not visible as text above fold (only hidden tel: link)
  if (m.phoneVisibleAboveFold === false && m.clickToCallAboveFold === true) {
    out.push({ key: 'phoneNotVisible', score: 12, finding: `your phone number isn't visible as text above the fold on mobile — visitors shouldn't have to tap a button just to see your number` });
  }
  // PRIORITY 13: No social proof visible above fold
  if (m.socialProofAboveFold === false) {
    out.push({ key: 'noSocialProof', score: 13, finding: `there's no star rating or review count visible in your mobile hero — first-time visitors have no trust signal before they scroll` });
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

  // Review count vs top 3 average (uses true average now, not midpoint of min/max)
  if (top3Stats && Number.isFinite(reviews)) {
    const avgReviews = top3Stats.reviewsAvg || Math.round((top3Stats.reviewsMin + top3Stats.reviewsMax) / 2);
    if (avgReviews > 0 && reviews < avgReviews * 0.6) {
      const ratio = reviews / avgReviews;
      out.push({
        key: 'reviewCount',
        score: ratio < 0.3 ? 15 : 35,
        finding: `you have ${reviews} Google reviews; the top 3 in this search average around ${avgReviews} — Google weighs total review volume heavily for Maps ranking, and that gap of about ${Math.max(1, avgReviews - reviews)} reviews is one of the most direct levers you have`,
      });
    }
  }

  // Rating vs top 3 (uses true average now)
  if (top3Stats && Number.isFinite(rating)) {
    const avgRating = top3Stats.ratingAvg || (top3Stats.ratingMin + top3Stats.ratingMax) / 2;
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
      finding: `your Google Business Profile primary category is "${audit.gbp.primaryCategory}" — a mismatched primary category directly limits your visibility in this search`,
    });
  }

  // PRIORITY 19 (NEW 2026-05-14): Category vs top-3 majority comparative finding.
  // Catches the case where business's category technically contains the search keyword but
  // the top-3 ranked competitors use a different, more service-aligned category.
  // E.g. Alvin's "Garage door supplier" vs top-3 "Garage door repair service".
  if (top3Stats?.majorityCategory && audit?.gbp?.primaryCategory) {
    const yourCat = audit.gbp.primaryCategory.trim().toLowerCase();
    const majCat = top3Stats.majorityCategory.trim().toLowerCase();
    if (yourCat !== majCat && !out.some(f => f.key === 'categoryMismatch')) {
      out.push({
        key: 'categoryVsTop3',
        score: 19,
        finding: `your Google Business Profile primary category is "${audit.gbp.primaryCategory}" — but the top 3 ranked businesses in your search use "${top3Stats.majorityCategory}". Switching to match the category Google associates with this search intent is one of the highest-impact moves for local rank`,
      });
    }
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

  // PRIORITY 26 (NEW): GBP description missing or thin (M1) — DISABLED 2026-05-13
  // Initial extractor produced false negatives — Express returned descriptionLength=0
  // when the GBP actually had a multi-sentence description. Needs ground-truth
  // diagnostic to identify the right selectors against current Maps DOM before
  // any claim ships. Keep code in place but gate it behind audit.gbp.descriptionVerified
  // (a flag we'll set when the extractor is proven).
  if (audit?.gbp?.descriptionVerified === true && audit?.gbp?.descriptionLength != null) {
    if (audit.gbp.descriptionLength === 0) {
      out.push({
        key: 'gbpDescription',
        score: 26,
        finding: `your Google Business Profile description is empty — that's a free 750-character field Google reads to match queries to your listing, and skipping it leaves a ranking signal on the table`,
      });
    } else if (audit.gbp.descriptionLength < 100) {
      out.push({
        key: 'gbpDescription',
        score: 26,
        finding: `your Google Business Profile description is only ${audit.gbp.descriptionLength} characters — Google gives you 750 to describe your services and service area, and a short description weakens your relevance signal for local queries`,
      });
    }
  }

  // PRIORITY 30 (NEW): Google Posts inactive or absent (M2) — DISABLED 2026-05-13
  // Same reason: Express returned hasPosts=false when GBP had a post from 1 day ago.
  // Heading regex `/^(?:updates?|posts?|from the owner)$/i` likely doesn't match
  // the actual Maps DOM label for the posts section. Needs diagnostic before re-enabling.
  if (audit?.gbp?.postsVerified === true) {
    if (audit?.gbp?.hasPosts === false) {
      out.push({
        key: 'gbpPosts',
        score: 30,
        finding: `you don't have any active Google Posts on your profile — businesses that publish weekly updates get a measurable ranking boost from the engagement signal`,
      });
    } else if (audit?.gbp?.lastPostDaysAgo != null && audit.gbp.lastPostDaysAgo > 90) {
      out.push({
        key: 'gbpPosts',
        score: 30,
        finding: `your last Google Post was about ${audit.gbp.lastPostDaysAgo} days ago — posting at least monthly signals active engagement, and Google ranks active listings higher than dormant ones`,
      });
    }
  }

  return out.sort((a, b) => a.score - b.score);
}

// ============================================================
// Confirmed-good positive findings (Tier framework — 2026-05-14)
// ============================================================
// When a section yields <3 real issues, we fill the gap with checks that PASSED.
// Order each list by "what typically breaks" — a passing page-speed check is
// notable because most sites fail it; a passing viewport-meta tag is table-stakes
// and not worth mentioning. Each positive carries its own wording template.
// Cross-section dedup runs BEFORE section-fill, so a confirmed-good is only used
// when the section is genuinely short — not as padding.

function scoreWebsiteConfirmedGood(audit) {
  if (!audit?.website) return [];
  const w = audit.website;
  const out = [];
  if (w.pageLoadSeconds != null && w.pageLoadSeconds <= 2.5) {
    out.push({ key: 'pageLoadGood', score: 100, finding: `we also checked your page load — ${w.pageLoadSeconds.toFixed(1)} seconds, well under Google's 2.5-second threshold` });
  }
  if (w.hasLocalBusinessSchema === true) {
    out.push({ key: 'schemaGood', score: 101, finding: `your LocalBusiness schema markup is present and properly formatted — one of the top Maps ranking signals already in place` });
  }
  if (w.websitePhoneMatchesGbp === true && w.distinctSitePhoneCount === 1) {
    out.push({ key: 'napGood', score: 102, finding: `your phone number matches between your website and Google Business Profile — clean NAP consistency` });
  }
  if (w.napAboveFold === true) {
    out.push({ key: 'napFoldGood', score: 103, finding: `your phone and address are visible above the fold — strong local trust signal` });
  }
  if (w.titleIncludesCity === true && w.titleIncludesCategory === true) {
    out.push({ key: 'titleGood', score: 104, finding: `your page title includes both your service category and your city — strong on-page local signals` });
  }
  if (w.isHttps === true) {
    out.push({ key: 'httpsGood', score: 105, finding: `your site is properly served over HTTPS` });
  }
  if (w.hasMetaDescription === true) {
    out.push({ key: 'metaDescGood', score: 106, finding: `your meta description is in place for search snippets` });
  }
  if (w.canonicalMatches === true) {
    out.push({ key: 'canonicalGood', score: 107, finding: `your canonical tag correctly points to this page — Google indexes the right URL` });
  }
  if (w.serviceAreaPagesCount != null && w.serviceAreaPagesCount >= 3) {
    out.push({ key: 'serviceAreaGood', score: 108, finding: `you have ${w.serviceAreaPagesCount} dedicated service-area pages — that's the multi-location structure top performers use` });
  }
  return out;
}

function scoreMobileConfirmedGood(audit) {
  if (!audit?.mobile) return [];
  const m = audit.mobile;
  const out = [];
  if (m.pageLoadSeconds != null && m.pageLoadSeconds <= 3) {
    out.push({ key: 'mobileLoadGood', score: 100, finding: `we also checked your mobile load — ${m.pageLoadSeconds.toFixed(1)} seconds, under the 3-second mobile abandonment threshold` });
  }
  if (m.clickToCallAboveFold === true) {
    out.push({ key: 'c2cFoldGood', score: 101, finding: `your tap-to-call button is visible above the fold on mobile — direct conversion path is set` });
  }
  if (m.primaryCtaTapTargetPx != null && m.primaryCtaTapTargetPx >= 48) {
    out.push({ key: 'tapTargetGood', score: 102, finding: `your primary call-to-action tap target is ${m.primaryCtaTapTargetPx} pixels — meets Google's 48-pixel mobile accessibility guideline` });
  }
  if (m.hasStickyCta === true) {
    out.push({ key: 'stickyCtaGood', score: 103, finding: `you have a sticky call-to-action that stays visible during mobile scroll — top performers do this` });
  }
  if (m.hasViewportMeta === true) {
    out.push({ key: 'viewportGood', score: 104, finding: `your responsive viewport meta tag is properly configured` });
  }
  if (m.phoneVisibleAboveFold === true) {
    out.push({ key: 'phoneVisibleGood', score: 105, finding: `your phone number is visible as text above the fold on mobile — no extra tap needed` });
  }
  if (m.hasClickToText === true) {
    out.push({ key: 'clickToTextGood', score: 106, finding: `you have tap-to-text set up on mobile — a conversion path most competitors are missing` });
  }
  return out;
}

function scoreMapsConfirmedGood(audit, top3Stats, record) {
  const out = [];
  const rating = parseFloat(normalizeField(record, 'Rating') || '');
  const reviews = parseInt(normalizeField(record, 'Reviews') || '', 10);
  if (top3Stats && Number.isFinite(reviews)) {
    const avgReviews = Math.round((top3Stats.reviewsMin + top3Stats.reviewsMax) / 2);
    if (avgReviews > 0 && reviews >= avgReviews * 0.9) {
      out.push({ key: 'reviewCountGood', score: 100, finding: `your review count holds up against your competition — ${reviews} reviews against a top-3 average of around ${avgReviews}` });
    }
  }
  if (top3Stats && Number.isFinite(rating)) {
    const avgRating = (top3Stats.ratingMin + top3Stats.ratingMax) / 2;
    if (rating >= avgRating - 0.05) {
      out.push({ key: 'ratingGood', score: 101, finding: `your rating at ${rating} stars is on par with the top 3 average around ${avgRating.toFixed(1)} — trust signal is solid` });
    }
  }
  if (audit?.gbp?.primaryCategoryMatchesSearch === true && audit?.gbp?.primaryCategory) {
    out.push({ key: 'categoryGood', score: 102, finding: `your Google Business Profile primary category — "${audit.gbp.primaryCategory}" — matches the search intent, which is the strongest category signal Google uses` });
  }
  if (audit?.gbp?.hasBusinessHours === true) {
    out.push({ key: 'hoursGood', score: 103, finding: `your business hours are set on your profile — completeness signal Google rewards` });
  }
  if (audit?.gbp?.daysSinceLastReview != null && audit.gbp.daysSinceLastReview <= 30) {
    out.push({ key: 'reviewRecencyGood', score: 104, finding: `your last Google review was ${audit.gbp.daysSinceLastReview} days ago — solid review velocity` });
  }
  if (audit?.gbp?.ownerResponseCount != null && (audit?.gbp?.reviewCount || 0) > 5 && audit.gbp.ownerResponseCount > 0) {
    out.push({ key: 'ownerResponseGood', score: 105, finding: `you respond to reviews on your profile — engagement signal Google reads` });
  }
  return out;
}

// ============================================================
// Cross-section deduplication (no duplicate audio reads)
// ============================================================
// Same finding key (e.g. multiH1, https, lazyImg, renderBlock) can appear in
// BOTH website and mobile scoring. The voiceover should speak each finding
// ONCE — pick the section with higher priority (lower score) for that key
// and drop it from other sections. Walk sections in this order: maps (highest
// priority surface), website, mobile (so cross-cutting findings prefer website
// which is where SEO-impact is felt most).
function dedupAcrossSections(mapsFindings, websiteFindings, mobileFindings) {
  const seen = new Set();
  const filterUnseen = (arr) => {
    const out = [];
    for (const f of arr) {
      if (seen.has(f.key)) continue;
      seen.add(f.key);
      out.push(f);
    }
    return out;
  };
  return {
    maps: filterUnseen(mapsFindings),
    website: filterUnseen(websiteFindings),
    mobile: filterUnseen(mobileFindings),
  };
}

// ============================================================
// Section-fill — top up findings with confirmed-good items if <3 issues
// ============================================================
// Returns up to `max` items by appending confirmed-good positives to the
// real-issue findings. If real issues already meet `max`, no positives surface.
// If real issues are zero, the section becomes all-positives — caller may
// switch to deflection wording.
function fillSection(realFindings, confirmedGood, max = 3) {
  if (realFindings.length >= max) return realFindings.slice(0, max);
  const needed = max - realFindings.length;
  return [...realFindings, ...confirmedGood.slice(0, needed)];
}

// Filter out any finding whose key is in the auto-disabled list (populated by
// validate-audit.mjs when a captured value deviates from the verified baseline).
// This is the SELF-DIAGNOSIS layer: if a scrape goes sideways, we silently drop
// the affected findings instead of shipping wrong claims.
function applyValidationFilter(findings, disabledKeys) {
  if (!Array.isArray(disabledKeys) || disabledKeys.length === 0) return findings;
  const filtered = findings.filter((f) => !disabledKeys.includes(f.key));
  const removed = findings.length - filtered.length;
  if (removed > 0) {
    console.log(`   [self-diag] Dropped ${removed} finding(s) due to baseline deviations: ${findings.filter(f => disabledKeys.includes(f.key)).map(f => f.key).join(', ')}`);
  }
  return filtered;
}

function buildScript(record, top3Stats, audit) {
  const name =
    normalizeField(record, 'Business Name') || normalizeField(record, 'name') || 'your business';
  validateAuditContract(audit, slugify(name, { lower: true, strict: true }));
  // Self-diagnosis: read the _validation block written by validate-audit.mjs
  // and pull out any finding keys that should be auto-disabled this run.
  const disabledKeys = (audit && audit._validation && audit._validation.disabledFindings) || [];
  if (disabledKeys.length) {
    console.log(`   [self-diag] Validation deviations detected; auto-disabling findings: ${disabledKeys.join(', ')}`);
  }
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
    ? `Hey, this is Chris with Rocket Growth Agency — local SEO experts. We just ran a surface-level audit on ${name} across your Google Business Profile, website, and mobile experience. You're already in the top 3 — here's where you're vulnerable to losing that position.`
    : `Hey, this is Chris with Rocket Growth Agency — local SEO experts. We just ran a surface-level audit on ${name} across your Google Business Profile, website, and mobile experience. Here are the top issues keeping you from the top position.`;

  function numberedJoin(findings, max = 3) {
    const picked = findings.slice(0, max).map((f) => f.finding);
    if (!picked.length) return '';
    const labels = ['First', 'Second', 'Third'];
    return picked.map((p, i) => `${labels[i]}: ${p}.`).join(' ');
  }

  // ============================================================
  // Score + filter + dedup all 3 sections at once (2026-05-14)
  // ============================================================
  // Each finding is spoken in EXACTLY ONE section. Cross-section dedup walks
  // maps → website → mobile so cross-cutting findings (multiH1, https, etc.)
  // prefer the section where they have highest SEO impact (website > mobile).
  const rawMaps = applyValidationFilter(scoreMapsFindings(audit, top3Stats, record), disabledKeys);
  const rawWebsite = applyValidationFilter(scoreWebsiteFindings(audit, name), disabledKeys);
  const rawMobile = applyValidationFilter(scoreMobileFindings(audit), disabledKeys);
  const { maps: mapsFindings, website: websiteFindings, mobile: mobileFindings } = dedupAcrossSections(rawMaps, rawWebsite, rawMobile);
  const mapsGood = scoreMapsConfirmedGood(audit, top3Stats, record);
  const websiteGood = scoreWebsiteConfirmedGood(audit);
  const mobileGood = scoreMobileConfirmedGood(audit);

  // Helper: append confirmed-good positives when real-issue count < 3.
  // Returns the section's main list (numbered) + an optional positive-tail string.
  function renderWithPositives(real, positives, max = 3) {
    const realPicked = real.slice(0, max);
    const need = max - realPicked.length;
    const posPicked = need > 0 ? positives.slice(0, Math.min(need, 2)) : [];
    const list = realPicked.length ? numberedJoin(realPicked, max) : '';
    let tail = '';
    if (posPicked.length === 1) {
      tail = ` On the positive side, ${posPicked[0].finding}.`;
    } else if (posPicked.length >= 2) {
      const phrases = posPicked.slice(0, 2).map(p => p.finding);
      tail = ` On the positive side, ${phrases[0]}, and ${phrases[1]}.`;
    }
    return { list, tail, realCount: realPicked.length, hasPositives: posPicked.length > 0 };
  }

  // -------- MAPS --------
  let mapsSegment;
  if (isTop3) {
    const baseLine = `When a customer is looking for ${searchTerm}, ${name} ranks #${rankNum} — already in the top 3, which captures 70 percent of all local leads from this search. That's the most valuable real estate.`;
    const { list, tail, realCount, hasPositives } = renderWithPositives(mapsFindings, mapsGood, 3);
    if (realCount >= 3) {
      mapsSegment = `${baseLine} But here's where you're vulnerable on your Maps listing: ${list}`;
    } else if (realCount >= 1) {
      mapsSegment = `${baseLine} Here's what stood out on your Maps listing: ${list}${tail}`;
    } else if (hasPositives) {
      mapsSegment = `${baseLine} Your Maps fundamentals look solid —${tail.replace(/^ On the positive side,/, '').trim()} The bigger leverage point for defending your top 3 is your website and mobile experience, which we'll cover next.`;
    } else {
      mapsSegment = `${baseLine} Your Maps fundamentals look solid — the bigger leverage point for defending your top 3 is your website and mobile experience, which we'll cover next.`;
    }
  } else {
    const baseLine = `When a customer is looking for ${searchTerm}, ${name} ranks #${rankRaw} — which is outside of the top 3, which accounts for 70 percent of all local leads.`;
    const { list, tail, realCount, hasPositives } = renderWithPositives(mapsFindings, mapsGood, 3);
    if (realCount >= 3) {
      mapsSegment = `${baseLine} Here are the top issues we found on your Maps listing: ${list}`;
    } else if (realCount >= 1) {
      mapsSegment = `${baseLine} Here's what we found on your Maps listing: ${list}${tail}`;
    } else if (hasPositives) {
      mapsSegment = `${baseLine} Your Maps profile is in decent shape —${tail.replace(/^ On the positive side,/, '').trim()} The leverage to climb is on your website and mobile, which we'll cover next.`;
    } else {
      mapsSegment = `${baseLine} Your Maps profile is in decent shape — the leverage to climb is on your website and mobile, which we'll cover next.`;
    }
  }

  // -------- WEBSITE --------
  const websiteSegment = (() => {
    const { list, tail, realCount, hasPositives } = renderWithPositives(websiteFindings, websiteGood, 3);
    const opener = `After reviewing your website — Google's primary trust signal for validating Maps ranking.`;
    if (isTop3) {
      if (realCount >= 3) return `${opener} Here are the website signals worth tightening to hold your top 3 spot: ${list}`;
      if (realCount >= 1) return `${opener} Here's what we found worth tightening to hold your top 3 spot: ${list}${tail}`;
      if (hasPositives) return `${opener} Your website fundamentals are in great shape —${tail.replace(/^ On the positive side,/, '').trim()} The leverage point for defending top 3 is on the mobile side, which we'll cover next.`;
      return `${opener} Your website fundamentals are clean — solid foundation for holding your top 3 spot.`;
    }
    if (realCount >= 3) return `${opener} Here are the top issues we found: ${list}`;
    if (realCount >= 1) return `${opener} Here's what we found: ${list}${tail}`;
    if (hasPositives) return `${opener} Your website fundamentals are in good shape —${tail.replace(/^ On the positive side,/, '').trim()} The bigger leverage is on the mobile side, which we'll cover next.`;
    return `${opener} Your site signals are clean — no major issues stood out.`;
  })();

  // -------- MOBILE --------
  const mobileSegment = (() => {
    const { list, tail, realCount, hasPositives } = renderWithPositives(mobileFindings, mobileGood, 3);
    const opener = `And then on mobile — where 70 percent of local-search traffic actually comes from.`;
    if (isTop3) {
      if (realCount >= 3) return `${opener} Here are the gaps a competitor could exploit: ${list}`;
      if (realCount >= 1) return `${opener} Here's what stood out on mobile: ${list}${tail}`;
      if (hasPositives) return `${opener} Your mobile experience is solid —${tail.replace(/^ On the positive side,/, '').trim()} The growth play from your top 3 spot is in your full Free Growth Audit.`;
      return `${opener} Your mobile fundamentals look clean — no major gaps stood out.`;
    }
    if (realCount >= 3) return `${opener} Here are the top mobile issues we found: ${list}`;
    if (realCount >= 1) return `${opener} Here's what stood out on mobile: ${list}${tail}`;
    if (hasPositives) return `${opener} Your mobile experience is solid —${tail.replace(/^ On the positive side,/, '').trim()} The bigger ranking leverage is in your Maps and website work above.`;
    return `${opener} On the mobile side, no major issues stood out.`;
  })();

  const outroText = isTop3
    ? `That was the surface-level audit. Your full Free Growth Audit goes much deeper — complete citation profile, backlink graph, competitor delta, geo-grid blind spots, and the exact plan to defend your top 3 spot and push for #1. Tap the button below to claim yours. Free, no call required.`
    : `That was the surface-level audit. Your full Free Growth Audit goes much deeper — complete citation profile, backlink graph, competitor delta, geo-grid blind spots, and the exact plan to break into the top 3 and capture more leads. Tap the button below to claim yours. Free, no call required.`;
  // Intro + outro reframed 2026-05-14 to honest partial-audit framing — change only with explicit user request.

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

// Conservative state-code regex — only matches ", XX" pattern (comma + space + 2-letter code).
// Skips common English-word collisions: OR (Oregon), OK (Oklahoma), IN (Indiana), ME (Maine), HI (Hawaii),
// AL (Alabama), AS (American Samoa) — these can match the pattern only when explicitly after a comma,
// which in practice is always a city/state context.
const STATE_AFTER_COMMA = /,\s+(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY|DC)\b/g;

// Sanitize text for OpenAI TTS so 2-letter state codes are pronounced as letters
// (e.g. "Culver City, CA" → "Culver City, C.A." → TTS reads "C, A").
// OpenAI tts-1 / gpt-4o-mini-tts don't support SSML, so we use the periods-between-letters
// pattern which reliably cues initialism pronunciation.
function sanitizeForTTS(text) {
  if (!text) return text;
  return text.replace(STATE_AFTER_COMMA, (_, state) => `, ${state.split('').join('.')}.`);
}

async function ttsToFile(text, outPath) {
  const response = await openai.audio.speech.create({
    model: 'gpt-4o-mini-tts',
    voice: 'echo',
    input: sanitizeForTTS(text),
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

  // Sync Map Rank from Airtable (canonical source) — prevents the bug where
  // step-2 CSV had stale rank (e.g. 6) while landing-page eyebrow showed
  // current rank (e.g. 5) from Airtable. Both must reflect the same value.
  try {
    const apiKey = process.env.AIRTABLE_API_KEY;
    const baseId = process.env.AIRTABLE_BASE_ID;
    if (apiKey && baseId) {
      const escapedName = String(name).replace(/"/g, '\\"');
      const url = `https://api.airtable.com/v0/${baseId}/Leads?` +
        `filterByFormula=${encodeURIComponent(`LOWER({Business Name}) = LOWER("${escapedName}")`)}` +
        `&maxRecords=1`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (res.ok) {
        const data = await res.json();
        const airtableRank = data.records?.[0]?.fields?.['Map Rank'];
        if (airtableRank != null) {
          const csvRank = record['Map Rank'] || record.rank;
          if (String(airtableRank) !== String(csvRank)) {
            console.log(`   ⚡ Rank sync: CSV had ${csvRank}, Airtable has ${airtableRank} — using Airtable (canonical)`);
            record['Map Rank'] = String(airtableRank);
          }
        }
      }
    }
  } catch (_e) {}

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

  const top3Stats = await loadTop3Stats(STEP2_BASENAME, STEP2_CSV);

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
