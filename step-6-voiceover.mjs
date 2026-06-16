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
      // NEW 2026-05-15: preserve the per-rank records so consumers can compute
      // RANK-AWARE comparison subsets. The aggregated *Avg fields above include
      // the lead itself when the lead is rank 1-3, biasing the comparison.
      // Consumers should use pickComparisonSubset(picked, leadRank) for honest
      // comparatives.
      picked,
      _source: `Airtable (Source Run ${preferredRun?.slice(0, 8) || '?'})`
    };
    console.log(`[top3] from Airtable: ${stats._source} → reviewsAvg=${stats.reviewsAvg} ratingAvg=${stats.ratingAvg.toFixed(2)} cat="${stats.majorityCategory}"`);
    return stats;
  } catch (e) {
    console.warn(`[top3] Airtable lookup failed: ${e.message || e}`);
    return null;
  }
}

// Rank-aware comparison subset: for a lead at rank N, what's the "peer set"
// they should be compared to?
//
//   Rank 1 → average of #2 + #3 ("the chasers" — defense framing)
//   Rank 2 → just #1 ("the leader" — catch-up)
//   Rank 3 → average of #1 + #2 ("the leaders ahead" — catch-up)
//   Rank 4+ → all top 3 (current behavior — climb)
//
// Returns an overlay { reviewsAvg, ratingAvg, comparisonLabel, comparisonRanks }
// or null if picked records aren't available.
function pickComparisonSubset(picked, leadRank) {
  if (!Array.isArray(picked) || picked.length === 0 || !Number.isFinite(leadRank)) return null;
  let subset = [];
  let label = null;
  if (leadRank === 1) {
    subset = picked.filter((p) => p.rank === 2 || p.rank === 3);
    label = 'your closest competitors';
  } else if (leadRank === 2) {
    subset = picked.filter((p) => p.rank === 1);
    label = 'the #1 in your search';
  } else if (leadRank === 3) {
    subset = picked.filter((p) => p.rank === 1 || p.rank === 2);
    label = 'the two ranked above you';
  } else {
    // Rank 4+ uses the full top-3 average — same as before. Return null so
    // consumers fall back to top3Stats.reviewsAvg / ratingAvg.
    return null;
  }
  if (subset.length === 0) return null;
  const reviews = subset.map((p) => p.reviewsNum).filter((n) => typeof n === 'number');
  const ratings = subset.map((p) => p.ratingNum).filter((n) => typeof n === 'number');
  return {
    reviewsAvg: reviews.length ? Math.round(reviews.reduce((a, b) => a + b, 0) / reviews.length) : null,
    ratingAvg: ratings.length ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2)) : null,
    comparisonLabel: label,
    comparisonRanks: subset.map((p) => p.rank),
  };
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
const MOBILE_CONTRACT  = ['pageLoadSeconds','hasViewportMeta','clickToCallAboveFold','primaryCtaTapTargetPx','pageWeightKb','isHttps','h1Count','renderBlockingHeadResources','imagesWithoutLazy','totalImages','primaryCtaText','phoneVisibleAboveFold','socialProofAboveFold','hasChatWidget','chatWidgetHasPhoneCta'];

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
//
// 2026-06-12 STALE-SUSPECT GUARD (brandTokenInDomain + clearStaleSuspect):
// step-1 flags a lead suspect (empty / aggregator / name-mismatch) against the
// GBP-LINKED website, then a search-discovery fallback frequently finds and
// substitutes the real first-party brand site — and step-2.5 audits that
// discovered site. The step-1 suspect flag then rode along STALE, so step-6
// fired false "you don't have a real website" / "your domain doesn't match your
// business name" claims against a domain that DOES carry the brand. Chris caught
// this across many videos. Confirmed false positives: Richards Rooter
// (richardsrooterandplumbing.com flagged name-mismatch:richards,rooter — both
// tokens literally in the domain), Advanced HVAC (advanced-hvac.com flagged
// "empty"), Murphy Plumbing, Top LA Plumbers, Reliance Home Service. We re-validate
// against the ACTUALLY-AUDITED url so the false claim never ships. Operates on the
// cached audit too, so the held re-render batch is fixed without re-auditing.
const STALE_SUSPECT_STOPWORDS = new Set([
  'the','and','for','llc','inc','ltd','co','corp','of','at','your','best','top','our',
  'garage','door','doors','repair','repairs','service','services','company','companies',
  'shop','store','center','centers','solution','solutions','group','team','home',
  'professional','professionals','expert','experts','specialist','specialists','pro','pros',
  'plumbing','plumber','plumbers','hvac','heating','cooling','air','conditioning','comfort',
  'roofing','roofer','roofers','locksmith','locksmiths','dentist','dentists','dental',
  'auto','automotive','car','cars','vehicle','vehicles','water','rooter','rooters',
  'painting','painters','painter','cleaning','cleaners','cleaner',
  'landscaping','landscape','lawn','tree','trees',
  'pest','control','exterminator','exterminators',
  'electric','electrician','electricians','contractor','contractors','construction','remodel','remodeling',
  'los','angeles','beverly','hills','santa','monica','city','county','ca',
]);
const STALE_SUSPECT_AGG_HOSTS = [
  'yelp.com','facebook.com','instagram.com','linkedin.com','nextdoor.com','mapquest.com',
  'yellowpages.com','bbb.org','angi.com','angieslist.com','thumbtack.com','houzz.com',
  'manta.com','foursquare.com','tripadvisor.com','superpages.com','citysearch.com',
];
function brandTokenInDomain(businessName, websiteUrl) {
  if (!businessName || !websiteUrl) return false;
  let host = '';
  try { host = new URL(websiteUrl).hostname.toLowerCase().replace(/^www\./, ''); } catch { return false; }
  const domainRoot = host.replace(/\.[a-z]+$/i, '').replace(/[^a-z0-9]/g, '');
  if (!domainRoot) return false;
  const tokens = String(businessName).toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter(t => t.length >= 3 && !STALE_SUSPECT_STOPWORDS.has(t));
  return tokens.some(t => domainRoot.includes(t));
}
function scoreWebsiteFindings(audit, businessName) {
  if (!audit?.website) return [];
  const w = { ...audit.website, businessNameForCheck: businessName || '' };
  const out = [];
  // STALE-SUSPECT GUARD — re-validate the step-1 suspect flag against the URL we
  // actually audited. If that flag is stale (discovery substituted a real site),
  // clear it so the "no website" / "domain mismatch" findings below never fire falsely.
  if (w.suspectWebsiteMismatch && w.websiteUrl) {
    const reason = (w.websiteSuspectReason || '').toLowerCase();
    const auditRan = w.pageLoadSeconds != null || w.title != null || w.hasLocalBusinessSchema != null;
    let host = '';
    try { host = new URL(w.websiteUrl).hostname.toLowerCase().replace(/^www\./, ''); } catch (_) {}
    const isAggHost = STALE_SUSPECT_AGG_HOSTS.some(a => host === a || host.endsWith('.' + a));
    const brandPresent = brandTokenInDomain(businessName, w.websiteUrl);
    let stale = false;
    if (reason.startsWith('name-mismatch')) {
      // "domain doesn't match" is legit ONLY if the audited domain truly lacks the
      // brand (e.g. Alvin Garage Door → sswhitegaragedoors.com). If the brand IS in
      // the audited domain, the flag is stale → clear. Richards Rooter, etc.
      stale = brandPresent;
    } else if (reason.startsWith('empty') || reason.startsWith('aggregator') || reason.startsWith('unparseable') || reason === '') {
      // "you don't have a real website" is false if we actually audited a real,
      // non-aggregator first-party site (discovery only returns brand-matched sites).
      stale = auditRan && !isAggHost && (brandPresent || true);
    }
    if (stale) {
      w.suspectWebsiteMismatch = false;
      w.websiteSuspectReason = '';
    }
  }
  // Master verification flag — true when the website audit ran end-to-end.
  // Every absence-claim website finding gates on this. If the audit failed
  // (network error, timeout, parked-site detection skipped the scan), we
  // CAN'T claim "you don't have X" because we don't actually know.
  // See feedback_verification_gates_must_be_strict.md + project_audit_finding_gate_audit_2026-05-21.md.
  const webVerified = w?.websiteAuditVerified === true;

  // P0 — "no own website" finding. Fires when GBP has no website (TJ Plumbing
  // case), captured website is an aggregator/social/squatter (Benjamin Family
  // Plumbing → roofmasterroofing.site), or step-2.5 detected a parked/empty
  // install (Pro Plumber Beverly Hills → WP default). Suppresses all other
  // website + mobile findings — this is the headline insight.
  //
  // Memory: feedback_no_website_is_top_finding.md (locked 2026-05-20).
  const noUrl = !w.websiteUrl || !String(w.websiteUrl).trim();
  const isSuspect = w.suspectWebsiteMismatch === true || !!w.websiteSuspectReason;
  const isParked = w.siteLooksParked === true;
  // 2026-05-29: split the three sub-cases. The original lumped all three
  // under one "you don't have a real first-party website" message, which
  // was WRONG for the name-mismatch case (A-1 Performance Rooter & Plumbing
  // has a real plumbing site at fast24hrplumber.com — they DO have a
  // website, it just doesn't match their business name).
  if (noUrl || isParked) {
    out.push({
      key: 'noOwnWebsite',
      score: 0,
      reason: noUrl ? 'no-website' : `parked:${w.parkedReason || 'unknown'}`,
      finding: 'the single biggest blocker on your local SEO ranking right now is that you don\'t actually have a real first-party website. Your Google Business Profile is either missing a website link or pointing at a placeholder, but Google needs a real homepage to build your category relevance, schema markup, and NAP citations from. Without it you\'re handing twenty-five percent of your Maps ranking weight to competitors who do, and all your organic leads have to flow through Yelp and directory sites that take a cut',
    });
    // Hard-suppress every other website + mobile finding when this fires —
    // they'd be noise about a non-existent page. Caller checks for this
    // key and uses out as-is.
    return out;
  }
  // 2026-06-03 — WAF/error-page OVERRIDE. Locked after Chris caught Black Cat
  // Plumbing Co video: step-3 recording captured Cloudways "403 Website
  // Unavailable" page in the website segment. step-2.5 audit had seen the real
  // site (audit happens at different time / pattern than recording). step-3's
  // WAF detector writes `recordingShowedError=true` to audit-findings.json when
  // it sees Cloudways/Cloudflare/Sucuri/Wordfence/etc. error content during
  // recording. step-6 reads that flag here and fires a SINGLE override finding
  // — Chris's words: "website bad period". HARD-SUPPRESSES all other website
  // + mobile findings.
  if (w.recordingShowedError === true) {
    out.push({
      key: 'websiteUnreachable',
      score: 0,
      reason: `recording-waf:${w.recordingErrorSignature || 'unknown'}`,
      finding: `your website is currently being blocked by your hosting provider's security layer, so visitors clicking through from Maps see an error page instead of your homepage, and Google's crawler can't index your content at all. This single issue overrides every other ranking factor on your site — fixing the WAF or hosting configuration to allow normal traffic is the #1 priority, because none of your other SEO work matters if Google literally cannot read your pages`,
    });
    return out; // HARD SUPPRESS — same pattern as noOwnWebsite
  }
  if (isSuspect) {
    const reason = w.websiteSuspectReason || '';
    if (/^name-mismatch:/i.test(reason)) {
      // A-1 Performance case — real plumbing site, wrong-domain. Don't
      // claim "no website"; instead say what's actually wrong: your
      // domain doesn't match your business name. Do NOT return early —
      // let the rest of the website checks run too, so we surface NAP
      // mismatch, schema, etc. The domainNameMismatch check at the
      // brand-token level below will also fire and provide a second
      // angle on the same issue if the host has no brand tokens.
      let host = '';
      try { host = new URL(w.websiteUrl).hostname.toLowerCase().replace(/^www\./, ''); } catch (_) {}
      const hostFrag = host ? ` — ${host} —` : '';
      out.push({
        key: 'noOwnWebsiteSuspect',
        score: 0.2,
        reason,
        finding: `your business website${hostFrag} doesn't carry your business name in the domain — Google reads brand-to-domain consistency as a citation trust signal, and prospects see an unfamiliar URL on click-through`,
      });
      // Fall through to the regular website checks (no early return).
    } else {
      // Aggregator / social / squatter case — keep the original wording,
      // it's accurate here ("no real first-party website").
      out.push({
        key: 'noOwnWebsite',
        score: 0,
        reason: `suspect:${reason || 'unknown'}`,
        finding: 'the single biggest blocker on your local SEO ranking right now is that you don\'t actually have a real first-party website. Your Google Business Profile is either missing a website link or pointing at a placeholder, but Google needs a real homepage to build your category relevance, schema markup, and NAP citations from. Without it you\'re handing twenty-five percent of your Maps ranking weight to competitors who do, and all your organic leads have to flow through Yelp and directory sites that take a cut',
      });
      return out;
    }
  }

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
  // PRIORITY 1.5 (NEW): No local-trust signal visible in the hero — neither
  // phone NOR address visible above the fold. Relaxed 2026-05-21 from
  // requiring BOTH to requiring EITHER (per Chris design question).
  // 2026-05-27 TIGHTENED: only fire when we ALSO couldn't find ANY phone on
  // the page (distinctSitePhoneCount === 0). The viewport-based above-fold
  // detection (step-2.5 line 369-392) is unreliable for sites with absolute-
  // positioned headers, lazy-loaded heroes, or unusual nav structures —
  // Chris caught a false claim on New Systems Exterminating where the phone
  // was clearly in the header (visible in browser) but the scraper said
  // above-fold=false. If we found a phone anywhere on the page, suppress
  // this finding rather than risk a false absence claim.
  // CROSS-GATED 2026-06-03 after ABC Plumber Service false negative (DOM walker
  // missed phones in builder-rendered content). Don't fire napAboveFold absence
  // claim when any of these positive signals shows there IS a phone on the page:
  //   - hasTelLinkAnywhere: any <a href="tel:"> link exists
  //   - telLinkAboveFold: tel: link in the first viewport
  //   - phoneFoundInSource: phone pattern found in raw HTML source
  // Memory: feedback_audit_only_observable_claims.md (cross-gate corollary).
  if (webVerified
      && w.napAboveFold === false
      && (w.distinctSitePhoneCount || 0) === 0
      && w.hasTelLinkAnywhere !== true
      && w.telLinkAboveFold !== true
      && w.phoneFoundInSource !== true) {
    out.push({ key: 'napAboveFold', score: 1.5, finding: `neither your phone number nor your address is visible above the fold — visitors and Google's local trust signals look for at least one NAP element in the hero, not buried in the footer` });
  }
  // PRIORITY 1.3 (NEW 2026-05-14): Domain doesn't match business BRAND name.
  // Filter out industry/service stopwords from the business name so we only check the
  // unique brand tokens against the domain. Otherwise "Alvin Garage Door" would match
  // sswhitegaragedoors.com just because the domain contains "garage" + "door".
  //
  // 2026-06-03: BROADENED + CROSS-GATED. Caught false positive on DX Plumbing
  // and Hydro Jetting Inc — the 2-letter brand "DX" was filtered out by the
  // length >= 3 rule, so "hydro" + "jetting" became the brand tokens, neither
  // present in dxplumbing.com, fired false claim. Two changes:
  //   1. Lower length filter to >= 2 (allow 2-letter brand acronyms: DX, JR,
  //      AC, etc.). Single-letter tokens still filtered (too noisy).
  //   2. ALSO check if any INDUSTRY-token that appears in BOTH the business
  //      name AND the domain (e.g., "plumbing" in both "DX Plumbing" and
  //      "dxplumbing.com") indicates partial alignment — suppress the mismatch
  //      claim. The original Alvin Garage Door / sswhitegaragedoors.com case
  //      still fires because Alvin's brand ("alvin") is in neither domain.
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
      const allTokens = w.businessNameForCheck.toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(t => t.length >= 2);
      const brandTokens = allTokens.filter(t => !INDUSTRY_STOPWORDS.has(t));
      const industryTokensInName = allTokens.filter(t => INDUSTRY_STOPWORDS.has(t) && t.length >= 4);
      const hasBrandMatch = brandTokens.length > 0 && brandTokens.some(t => domainRoot.includes(t));
      // Cross-gate: at least one industry word from the name also in the domain
      // (e.g., "plumbing" in both "DX Plumbing" and "dxplumbing.com") indicates
      // partial alignment — suppress the mismatch claim.
      const hasIndustryAlignment = industryTokensInName.some(t => domainRoot.includes(t));
      if (brandTokens.length && !hasBrandMatch && !hasIndustryAlignment) {
        out.push({
          key: 'domainNameMismatch',
          score: 1.3,
          finding: `your website domain — ${host} — doesn't match your business name. Google reads brand-to-domain consistency as a citation trust signal, and prospects clicking through from search see an unfamiliar URL, which costs both ranking weight and conversion confidence`
        });
      }
    } catch (_) {}
  }
  // PRIORITY 2: No LocalBusiness schema (GATED 2026-05-21: requires webVerified)
  if (webVerified && w.hasLocalBusinessSchema === false) {
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
  // PRIORITY 25 (DEMOTED 2026-06-02): Slow page load — frame as Maps-click abandonment.
  // Demoted from P3 to P25 alongside the mobile rescore. Tech-spec findings only fire
  // when local-SEO levers don't fill the 3-finding slot. See feedback_audit_focus_local_seo_over_tech_specs.md.
  if (w.pageLoadSeconds != null && w.pageLoadSeconds > 2.5) {
    out.push({ key: 'pageLoad', score: 25, finding: `your homepage loads in ${w.pageLoadSeconds.toFixed(1)} seconds — slow enough that visitors clicking through from Maps abandon and dial the next listing before your page renders` });
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
  // PRIORITY 28 (DEMOTED 2026-06-02): Multi-H1 — minor on-page hygiene, not a local-SEO lever.
  if (w.h1Count != null && w.h1Count > 1) {
    out.push({ key: 'multiH1', score: 28, finding: `your page has ${w.h1Count} H1 tags — Google reads one H1 as your page's primary topic, and stacking them dilutes the local-keyword relevance signal` });
  }
  // PRIORITY 8: Missing meta description (GATED 2026-05-21)
  if (webVerified && w.hasMetaDescription === false) {
    out.push({ key: 'metaDesc', score: 8, finding: `your homepage is missing a meta description, weakening how it appears in search snippets` });
  }
  // PRIORITY 26 (DEMOTED 2026-06-02): Render-blocking resources — tech-spec.
  if (w.renderBlockingHeadResources != null && w.renderBlockingHeadResources > 3) {
    out.push({ key: 'renderBlock', score: 26, finding: `you have ${w.renderBlockingHeadResources} render-blocking resources in your head — the first paint stalls long enough that Maps visitors abandon before your hero loads` });
  }
  // PRIORITY 27 (DEMOTED 2026-06-02): Lazy-loading missing — tech-spec.
  if (w.imagesWithoutLazy != null && w.totalImages > 5 && (w.imagesWithoutLazy / w.totalImages) > 0.4) {
    out.push({ key: 'lazyImg', score: 27, finding: `${w.imagesWithoutLazy} of your ${w.totalImages} images don't have lazy loading enabled, dragging out the load time Maps visitors are willing to wait through` });
  }

  // TIER 2 — conversion signals (scores 11-16, fill in when Tier 1 doesn't reach 3 findings)
  // PRIORITY 11: Generic CTA text
  if (w.primaryCtaText != null) {
    const isGeneric = /^(contact|learn more|more|click here|submit|send|read more|see more|view more|get started|find out|discover)$/i.test(w.primaryCtaText.trim());
    if (isGeneric) {
      out.push({ key: 'ctaText', score: 11, finding: `your main call-to-action says "${w.primaryCtaText.trim()}" — action-specific buttons like "Call Now" or "Get Free Quote" convert 2–3x better` });
    }
  }
  // PRIORITY 12: No reviews or testimonials on the page (GATED 2026-05-21)
  if (webVerified && w.hasReviewsOnPage === false) {
    out.push({ key: 'noReviews', score: 12, finding: `your website doesn't show any customer reviews or testimonials — visitors can't verify your reputation without leaving the page to check Google` });
  }
  // Social profile check lives in scoreSocialProfilesFinding (called from buildScript)
  // — it has access to the record. Don't duplicate it here.
  // PRIORITY 12.5 (CROSS-GATED 2026-06-03): Few or no dedicated service-area pages.
  //
  // Cross-gate added 2026-06-03 after Chris caught Santa Monica Drain Co. false
  // negative: serviceAreaPagesCount=0 (URL regex missed /areas-served/) BUT
  // hasServiceAreaListed=true (text detector found city mentions). Same class of
  // bug as noServiceArea — narrow detector + positive contradicting signal in
  // same audit. Suppress the absence claim when ANY positive signal of service-
  // area content exists. Memory: feedback_audit_only_observable_claims.md
  // (cross-gate-against-contradicting-positive corollary).
  if (w.serviceAreaPagesCount != null
      && w.serviceAreaPagesCount <= 1
      && w.hasServiceAreaListed !== true) {
    const msg = w.serviceAreaPagesCount === 0
      ? `you don't have any dedicated city or service-area pages — top performers rank in multiple cities by publishing a focused landing page per location they serve`
      : `you only have one service-area page — top performers stack rankings across cities by publishing a dedicated landing page per location they serve`;
    out.push({ key: 'serviceAreaPages', score: 12.5, finding: msg });
  }
  // PRIORITY 13: No service area listed (GATED 2026-05-21 + CROSS-GATED 2026-06-03)
  // Cross-gate added 2026-06-03 after Chris caught a false negative on Prodigy
  // Plumbing: hasServiceAreaListed=false (text regex required "City, CA" adjacent
  // string) but serviceAreaPagesCount=6 (we found 6 dedicated service-area pages).
  // Our own audit data contradicted itself. Per only-observable-claims rule:
  // if we have ANY positive signal of service-area content (>=1 dedicated page),
  // do NOT fire the absence claim.
  if (webVerified && w.hasServiceAreaListed === false && (w.serviceAreaPagesCount || 0) < 1) {
    out.push({ key: 'noServiceArea', score: 13, finding: `your website doesn't list a service area — mentioning specific cities and neighborhoods you serve is a strong local SEO signal` });
  }

  // PRIORITY 13.5 (NEW 2026-05-15): Weak AI Search Visibility readiness.
  // Whitespark 2026 NEW category — on-page weights 24% in AI search (TOP lever
  // vs GBP only 12%). Businesses ranking in Maps may be invisible in AI search
  // (Google AI Overviews, Perplexity, ChatGPT) if they're missing entity
  // recognition signals: thin word count, no FAQ schema, no Organization
  // schema, single-page websites.
  // Fires when ≤1 of 4 AI-readiness signals are present (word count ≥500,
  // FAQ schema, Organization schema, service pages ≥2).
  if (webVerified && w.wordCount != null) {
    const aiSignals = [];
    if (w.wordCount >= 500) aiSignals.push('word count');
    if (w.hasFaqSchema) aiSignals.push('FAQ schema');
    if (w.hasOrganizationSchema) aiSignals.push('Organization schema');
    if ((w.serviceAreaPagesCount || 0) >= 2) aiSignals.push('service-area pages');
    if (aiSignals.length <= 1) {
      const missing = ['homepage word count', 'FAQ schema', 'Organization schema', 'service-area pages'];
      out.push({
        key: 'weakOnPageForAi',
        score: 13.5,
        finding: `your website is missing the on-page signals AI search engines like Google AI Overviews, Perplexity, and ChatGPT use to recognize you as an entity. Whitespark 2026 NEW category: AI Search Visibility weighs on-page content 24 percent — that's the top lever for AI search, ahead of GBP at only 12 percent. You're at ${aiSignals.length} out of 4 readiness signals; adding ${missing.slice(0, 2).join(' and ')} is the fastest path to AI-search visibility`,
      });
    }
  }

  return out.sort((a, b) => a.score - b.score);
}

// PRIORITY 11-12: Social profiles — checks BOTH website-linked socials (step-2)
// AND GBP-linked socials (step-2.5 audit). NEW 2026-05-14 evening: GBP social
// detection added because the old check was website-only and produced false-
// alarm claims for businesses with GBP socials but no website socials.
//
// Three-tier severity over the COMBINED de-duped set:
//   0 socials anywhere    → P11  socialProfilesNone   (high — major trust gap)
//   1 social total        → P12  socialProfilesLow    (medium — needs diversity)
//   2+                    → no fire (baseline ok)
//
// Plus cross-source mismatch bonus (P14, lower) when combined ≥ 2:
//   website has socials, GBP doesn't  → socialProfilesGbpDisconnected
//   GBP has socials, website doesn't  → socialProfilesSiteDisconnected
//
// GBP source is gated by audit.gbp.gbpSocialProfilesVerified — if extractor
// couldn't confirm we were on a place panel, GBP socials are treated as
// "unknown" and we fall back to website-only (preserves the prior behavior).
function scoreSocialProfilesFinding(record, audit) {
  const SOCIAL_FIELDS = ['facebook','instagram','linkedin','twitter','youtube','tiktok','pinterest'];

  // Website-linked socials (from step-2)
  const siteSet = new Set();
  for (const platform of SOCIAL_FIELDS) {
    const val = normalizeField(record, platform);
    if (val && /^https?:\/\//i.test(val)) siteSet.add(platform);
  }

  // GBP-linked socials (from step-2.5) — only trusted when verified
  const gbpVerified = !!(audit && audit.gbp && audit.gbp.gbpSocialProfilesVerified);
  const gbpList = (audit && audit.gbp && Array.isArray(audit.gbp.gbpSocialProfiles)) ? audit.gbp.gbpSocialProfiles : [];
  const gbpSet = new Set(gbpList.map((s) => (s.platform || '').toLowerCase()).filter(Boolean));

  const combined = new Set([...siteSet, ...(gbpVerified ? gbpSet : [])]);
  const combinedCount = combined.size;
  const siteCount = siteSet.size;
  const gbpCount = gbpSet.size;

  // Tier 1: nothing anywhere → highest severity
  // GATED 2026-05-21: only fire when GBP socials were verified — otherwise a
  // failed gbpSocialProfiles scrape (gbpSet=empty, gbpVerified=false) combined
  // with an empty site-side scrape (could be step-2 false negative on
  // JS-rendered socials) would produce a "no socials anywhere" false claim.
  // Better to skip than fabricate. See feedback_verification_gates_must_be_strict.md.
  if (combinedCount === 0 && gbpVerified) {
    return { key: 'socialProfilesNone', score: 11, finding: `you have no social media profiles connected anywhere — neither your website nor your Google Business Profile. Google's local trust signal weights connected Facebook, Instagram, LinkedIn, and YouTube as identity verification, and prospects checking if your business is real get a thin picture without them` };
  }

  // Tier 2: only one profile total (GATED 2026-05-21: requires gbpVerified)
  if (combinedCount === 1 && gbpVerified) {
    const only = [...combined][0];
    return { key: 'socialProfilesLow', score: 12, finding: `you only have one social profile connected (${only}) — Google's local trust signal weights diversity across Facebook, Instagram, LinkedIn, and YouTube, and adding even one more tightens your local-trust footprint` };
  }

  // Tier 3 (cross-source bonus) — only fire when GBP socials are verified,
  // so we never claim a GBP gap we couldn't actually verify.
  if (gbpVerified) {
    if (siteCount >= 1 && gbpCount === 0) {
      return { key: 'socialProfilesGbpDisconnected', score: 14, finding: `your website links to social profiles but they're not connected to your Google Business Profile — Google treats GBP-linked socials as a separate trust signal from website-linked socials, so connecting them on your GBP unlocks both` };
    }
    if (gbpCount >= 1 && siteCount === 0) {
      return { key: 'socialProfilesSiteDisconnected', score: 14, finding: `your Google Business Profile lists social profiles but your website doesn't link to them — Google's local-trust footprint wants both sources, so adding the same social links to your website footer is a quick win` };
    }
  }

  return null;
}

// PRIORITY-BASED MOBILE SCORING (1 = most important, 10 = least)
function scoreMobileFindings(audit) {
  if (!audit?.mobile) return [];
  const m = audit.mobile;
  const out = [];
  // Master verification flag — true when mobile audit ran end-to-end.
  // Gates absence claims (phoneNotVisible, noSocialProof, stickyCta) so
  // a failed audit doesn't produce false "you don't have X" claims.
  const mobVerified = m?.mobileAuditVerified === true;

  // PRIORITY ORDER REWORKED 2026-06-02 — local-SEO conversion levers FIRST,
  // tech-spec findings (load time, page weight, render-blocking) DEMOTED to
  // tail of the list. Reason: we sell local SEO (Maps clicks → phone calls),
  // not website-developer services. Every minute of voiceover should be a
  // conversion lever, not a Core Web Vitals lecture.
  // Memory: feedback_audit_focus_local_seo_over_tech_specs.md.

  // PRIORITY 1: No sticky call/text CTA on scroll — top mobile conversion lever.
  // GATED 2026-05-21 (round 2): requires mobVerified AND stickyCtaVerified
  // (= page actually has fixed/sticky elements we could examine). If the page
  // has zero fixed elements, our detector likely didn't see widgets that
  // load late (cross-origin iframes, post-2.5s injected pills).
  if (mobVerified && m.stickyCtaVerified === true && m.hasStickyCta === false) {
    out.push({ key: 'stickyCta', score: 1, finding: `there's no sticky call-or-text button on mobile — once a visitor from Maps scrolls past your hero, they lose the conversion path, and most local prospects only spend ten to fifteen seconds on a service site before bouncing back to call the next listing` });
  } else if (mobVerified && m.stickyCtaVerified !== true && m.hasStickyCta === false) {
    console.log('[step-6 unverified-skip] stickyCta finding suppressed: page had no fixed/sticky elements detectable — likely async-loaded widgets.');
  }
  // PRIORITY 2: Tap-to-call NOT above fold — every Maps-to-site visitor has to scroll to call.
  // Skip if the phone number itself is visible above the fold — modern mobile
  // browsers auto-link phone numbers as tap-to-call, so visible phone === tap-to-call available
  // even if the DOM extractor missed an image/JS-styled button.
  if (m.clickToCallAboveFold === false && m.phoneVisibleAboveFold !== true) {
    // Chat-widget gate (2026-05-19) — if the site uses a chat widget /
    // popup that contains the phone CTA, the audit's above-the-fold check
    // misses it. Reframe the finding when widget+CTA detected; SUPPRESS
    // when widget present but CTA contents unclear (safer than firing a
    // potentially-false claim). Memory: feedback_audit_chat_widget_detection.md.
    if (m.hasChatWidget === true && m.chatWidgetHasPhoneCta === true) {
      out.push({ key: 'c2cBuriedInChatWidget', score: 2, finding: `your tap-to-call number is buried inside a chat widget — a visitor coming from Maps has to open the widget before they can call, and most don't bother — they back out and call the next result instead` });
    } else if (m.hasChatWidget === false) {
      out.push({ key: 'c2cFold', score: 2, finding: `your tap-to-call button isn't visible above the fold on mobile — every Maps-to-website visitor has to scroll just to call you, and most local prospects won't` });
    }
  }
  // PRIORITY 3: No tap-to-text option — free conversion path most competitors miss.
  // Chat-widget gate — suppress if a chat widget is detected (we can't be sure
  // the widget doesn't offer SMS; safer than firing a potentially-false claim).
  if (mobVerified && m.hasClickToText === false && m.hasChatWidget === false) {
    out.push({ key: 'clickToText', score: 3, finding: `your mobile site has no tap-to-text option — local customers increasingly default to SMS for quick questions like pricing or availability, and adding a single sms link is a free conversion path most of your competitors are missing` });
  }
  // PRIORITY 4: Phone digits not visible above fold (only hidden tel: link).
  // GATED 2026-05-21: requires mobVerified AND no obvious CALL CTA visible.
  // If a "Call" / "Call Now" / "Tap to Call" labeled button exists above fold,
  // the conversion path is clear and we don't fire.
  if (mobVerified && m.phoneVisibleAboveFold === false && m.clickToCallAboveFold === true && m.hasObviousCallCta !== true) {
    out.push({ key: 'phoneNotVisible', score: 4, finding: `your phone number isn't visible as text above the fold on mobile — visitors coming from Maps want to see the digits they're about to dial, not tap a button and hope it's the right line` });
  }
  // PRIORITY 5: No social proof in the hero — Maps visitors arrive trusting the listing's star rating but they need to see it reinforced.
  if (mobVerified && m.socialProofAboveFold === false) {
    out.push({ key: 'noSocialProof', score: 5, finding: `there's no star rating or review count visible in your mobile hero — Maps visitors already trust your listing's stars, but the moment your site doesn't echo that signal in the hero, they doubt they're on the right page` });
  }
  // PRIORITY 6: Tap target too small — failed call button.
  if (m.primaryCtaTapTargetPx != null && m.primaryCtaTapTargetPx < 48) {
    out.push({ key: 'tapTarget', score: 6, finding: `your primary call-to-action button is only ${m.primaryCtaTapTargetPx} pixels tall on mobile — Google's local-business guideline is 48, and below that, mis-taps cost real conversions on thumb-driven mobile traffic` });
  }
  // PRIORITY 7: No responsive viewport meta — site shrinks instead of adapting.
  if (m.hasViewportMeta === false) {
    out.push({ key: 'viewport', score: 7, finding: `there's no responsive viewport tag, so your site shrinks the desktop layout on mobile instead of adapting — every Maps-to-mobile visitor sees tap targets that are too small to use` });
  }
  // PRIORITY 8: Generic CTA text on mobile.
  if (m.primaryCtaText != null) {
    const isGeneric = /^(contact|learn more|more|click here|submit|send|read more|see more|view more|get started|find out|discover)$/i.test(m.primaryCtaText.trim());
    if (isGeneric) {
      out.push({ key: 'ctaText', score: 8, finding: `your main mobile button says "${m.primaryCtaText.trim()}" — action-specific labels like "Call Now" or "Get Free Quote" tied to your Maps conversion path significantly outperform generic verbs` });
    }
  }
  // PRIORITY 9: No HTTPS — local-trust signal failure.
  if (m.isHttps === false) {
    out.push({ key: 'https', score: 9, finding: `your site isn't on HTTPS — modern browsers warn visitors with a "Not Secure" badge, and Google demotes non-secure pages in local rankings` });
  }
  // PRIORITY 10: Multiple H1 tags — confused on-page signal.
  if (m.h1Count != null && m.h1Count > 1) {
    out.push({ key: 'multiH1', score: 10, finding: `your mobile page has ${m.h1Count} H1 tags — Google reads one H1 as your page's primary topic, and stacking them dilutes the local-keyword relevance signal` });
  }

  // ============================================================
  // TIER 3 — DEMOTED tech-spec findings (load time, page weight, render-blocking).
  // These are website-vendor concerns, not local-SEO levers. They only fire
  // when the local-SEO findings above don't fill the 3-finding slot.
  // Reframed wording: tie every claim back to Maps clicks / abandonment.
  // ============================================================

  // PRIORITY 25 (DEMOTED): Mobile load > 3s — frame as Maps-click abandonment.
  if (m.pageLoadSeconds != null && m.pageLoadSeconds > 3) {
    out.push({ key: 'mobileLoad', score: 25, finding: `your mobile site takes ${m.pageLoadSeconds.toFixed(1)} seconds to load — more than half of the visitors Maps is sending you abandon before the page renders and call the next listing instead` });
  }
  // PRIORITY 26 (DEMOTED): Page weight too heavy.
  if (m.pageWeightKb != null && m.pageWeightKb > 4000) {
    out.push({ key: 'pageWeight', score: 26, finding: `your mobile page loads ${(m.pageWeightKb / 1024).toFixed(1)} megabytes — heavy enough that Maps visitors on cellular data lose the page before it loads and dial a competitor instead` });
  }
  // PRIORITY 27 (DEMOTED): Render-blocking resources.
  if (m.renderBlockingHeadResources != null && m.renderBlockingHeadResources > 3) {
    out.push({ key: 'renderBlock', score: 27, finding: `you have ${m.renderBlockingHeadResources} render-blocking resources in your head — the first paint stalls long enough that Maps visitors switch back to the search results before your hero appears` });
  }
  // PRIORITY 28 (DEMOTED): Images missing lazy loading.
  if (m.imagesWithoutLazy != null && m.totalImages > 5 && (m.imagesWithoutLazy / m.totalImages) > 0.4) {
    out.push({ key: 'lazyImg', score: 28, finding: `${m.imagesWithoutLazy} of your ${m.totalImages} images don't have lazy loading enabled, dragging out the mobile load time that Maps visitors are willing to wait through` });
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

// 2026-06-12 DUPLICATE-LISTING SAME-BUSINESS GUARD. step-2.5's SerpAPI duplicate
// lookup matched any listing sharing 2+ name tokens, so genuinely DIFFERENT
// competitors with similar names were counted as "duplicates of you" — e.g. Doctor
// Pipe | Los Angeles Plumbing Specialist falsely flagged "Pipe Doctor Rooter &
// Plumbing Company" (reversed word order, different address 3312 Floyd Terrace,
// different Place ID + phone, 55 vs 13 reviews) as a duplicate. A REAL duplicate is
// the SAME business listed twice, so its title must contain the target's ORDERED
// brand phrase ("doctor pipe"), which "pipe doctor rooter…" does not. trueDuplicateCount()
// recomputes from the stored duplicateListings, correcting the CACHED audit at render
// time (no SerpAPI re-call). Chris caught this on the Doctor Pipe video. Conservative:
// if the brand is too generic to form a phrase, no duplicate is counted.
const DUP_STOPWORDS = new Set([
  'the','and','for','llc','inc','ltd','co','corp','of','at','your','best','top','our','dba',
  'garage','door','doors','repair','repairs','service','services','company','companies',
  'shop','store','center','centers','solution','solutions','group','team','home',
  'professional','professionals','expert','experts','specialist','specialists','pro','pros',
  'plumbing','plumber','plumbers','hvac','heating','cooling','air','conditioning','comfort',
  'roofing','roofer','roofers','rooter','rooters','locksmith','locksmiths','dentist','dental',
  'auto','automotive','car','cars','painting','painters','cleaning','cleaners','water',
  'landscaping','landscape','lawn','tree','trees','pest','control','exterminator',
  'electric','electrician','electricians','contractor','contractors','construction','remodeling',
  'los','angeles','beverly','hills','santa','monica','city','county','ca',
]);
function dupBrandPhrase(name) {
  const tokens = String(name || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const phrase = [];
  for (const t of tokens) {
    if (t.length < 2 || DUP_STOPWORDS.has(t)) { if (phrase.length) break; else continue; }
    phrase.push(t);
  }
  return phrase.join(' ');
}
function isSameListedBusiness(targetName, candidateTitle) {
  const bp = dupBrandPhrase(targetName);
  if (!bp) return false; // brand too generic to confirm — don't count (conservative)
  const cand = String(candidateTitle || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  return cand.includes(bp);
}
function trueDuplicateCount(audit) {
  const g = audit?.gbp || {};
  // No detailed list to re-validate against → trust the stored count as-is.
  if (!Array.isArray(g.duplicateListings) || !g.duplicateListings.length) {
    return Number.isFinite(g.duplicateListingCount) ? g.duplicateListingCount : 0;
  }
  const target = audit.businessName || '';
  const same = g.duplicateListings.filter((d) => isSameListedBusiness(target, d.title));
  const distinct = new Set(same.map((d) => d.placeId).filter(Boolean));
  // subtract the target's own listing — count only EXTRA same-business listings.
  return Math.max(0, distinct.size - 1);
}
function scoreMapsFindings(audit, top3Stats, record) {
  const out = [];
  const rating = parseFloat(normalizeField(record, 'Rating') || '');
  const reviews = parseInt(normalizeField(record, 'Reviews') || '', 10);

  // RANK-AWARE comparison (2026-05-15): for ranks 1-3, the lead is IN the top-3
  // set so the avg is biased. Use pickComparisonSubset to compute against the
  // honest peer set (rank 1 → #2+#3, rank 2 → #1, rank 3 → #1+#2). Rank 4+ uses
  // the full top-3 avg as before.
  const leadRank = parseInt(normalizeField(record, 'Map Rank') || '', 10);
  const compare = top3Stats?.picked ? pickComparisonSubset(top3Stats.picked, leadRank) : null;
  const compareLabel = compare?.comparisonLabel || 'the top 3 in this search';
  const compareReviewsAvg = compare?.reviewsAvg != null ? compare.reviewsAvg
    : (top3Stats?.reviewsAvg ?? Math.round((top3Stats?.reviewsMin + top3Stats?.reviewsMax) / 2));
  const compareRatingAvg = compare?.ratingAvg != null ? compare.ratingAvg
    : (top3Stats?.ratingAvg ?? (top3Stats?.ratingMin + top3Stats?.ratingMax) / 2);

  // Review count vs peer-set average (rank-aware)
  const isTop3 = Number.isFinite(leadRank) && leadRank >= 1 && leadRank <= 3;
  if (top3Stats && Number.isFinite(reviews) && compareReviewsAvg > 0) {
    if (reviews < compareReviewsAvg * 0.6) {
      const ratio = reviews / compareReviewsAvg;
      const labelClause = compare ? `${compareLabel} average around ${compareReviewsAvg}`
        : `the top 3 in this search average around ${compareReviewsAvg}`;
      out.push({
        key: 'reviewCount',
        score: ratio < 0.3 ? 15 : 35,
        finding: `you have ${reviews} Google reviews; ${labelClause} — Google weighs total review volume heavily for Maps ranking, and that gap of about ${Math.max(1, compareReviewsAvg - reviews)} reviews is one of the most direct levers you have`,
      });
    } else if (compare && leadRank === 1 && reviews > compareReviewsAvg * 2) {
      // Defense framing for rank #1 — show the review-count BUFFER over chasers.
      out.push({
        key: 'reviewBufferLeader',
        score: 60,
        finding: `you have ${reviews} Google reviews to your closest competitors' ${compareReviewsAvg} — a buffer of about ${reviews - compareReviewsAvg}. Maintain that lead with steady review velocity or they'll close the gap`,
      });
    } else if (isTop3 && compare && (leadRank === 2 || leadRank === 3) && reviews < compareReviewsAvg) {
      // 2026-05-27 NEW — top-3 defense lever for rank #2/#3 when behind the
      // leader by ANY margin (not just <60%). The existing reviewCount finding
      // only fires at <60% of peer avg — too conservative for top-3 leads where
      // even a small review gap to #1 is a real competitive vulnerability.
      // For Fenn (rank #2, 106 reviews vs #1 at 112), this fires the right
      // vulnerability framing instead of leaving Maps empty.
      out.push({
        key: 'reviewGapToLeader',
        score: 45,
        finding: `you have ${reviews} Google reviews vs ${compareLabel} at ${compareReviewsAvg} — closing that ${compareReviewsAvg - reviews}-review gap is the most direct lever for ${leadRank === 2 ? 'pushing into #1' : 'climbing past #2'}, since review volume is one of the highest-weighted Maps ranking signals`,
      });
    } else if (!isTop3 && reviews < compareReviewsAvg) {
      // 2026-06-12 — climb lever for rank 4+ leads behind on review VOLUME but not
      // below the <60% threshold above (Doctor Pipe: 13 reviews vs the top-3's 20).
      // Review volume is a more material + actionable Maps lever than a sub-0.3-star
      // rating gap, so this is scored (25) to OUTRANK ratingGap (30) and take the slot.
      // Chris flagged the weak "even a small rating gap" finding while the lead had
      // only 13 reviews. Mirrors reviewGapToLeader but for the rank-4+ climb case.
      out.push({
        key: 'reviewGapToTop3',
        score: 25,
        finding: `you have ${reviews} Google reviews; the top 3 in this search average around ${compareReviewsAvg} — closing that ${Math.max(1, compareReviewsAvg - reviews)}-review gap with steady, recent reviews is one of the most direct levers to climb toward the top 3`,
      });
    }
  }

  // Rating vs peer-set average (rank-aware)
  // 2026-06-12: require a MATERIAL gap (>= 0.3 stars) for the general climb finding.
  // A 0.2-star gap (e.g. 4.7 vs 4.9) is within review noise — especially at low review
  // counts — and shouldn't take a Maps finding slot over a more material lever like
  // review volume. Chris flagged a 4.7-vs-4.9 finding firing on a 13-review business.
  // Top-3 #2/#3 defense still fires at ANY margin via ratingGapToLeader below.
  if (top3Stats && Number.isFinite(rating) && compareRatingAvg > 0) {
    if (rating <= compareRatingAvg - 0.3) {
      const labelClause = compare ? `${compareLabel} average around ${compareRatingAvg.toFixed(1)} stars`
        : `the top 3 average around ${compareRatingAvg.toFixed(1)}`;
      out.push({
        key: 'ratingGap',
        score: 30,
        finding: `you're at ${rating} stars; ${labelClause} — that rating gap costs you Maps ranking position`,
      });
    } else if (isTop3 && compare && (leadRank === 2 || leadRank === 3) && rating < compareRatingAvg) {
      // 2026-05-27 NEW — top-3 defense lever for rank #2/#3 when rating is below
      // the leader by ANY margin (not just 0.15). For Fenn at 4.7 vs #1's 4.8,
      // even a 0.1 gap is a real toss-up factor at the top-3 boundary.
      out.push({
        key: 'ratingGapToLeader',
        score: 28,
        finding: `your rating sits at ${rating} stars vs ${compareLabel} at ${compareRatingAvg.toFixed(1)} — Google's review-signals carry roughly 20 percent of local-pack ranking weight, and a 0.${Math.round((compareRatingAvg - rating) * 10)}-star delta can decide the #${leadRank === 2 ? '1 vs #2' : '2 vs #3'} toss-up`,
      });
    }
  }

  // 2026-05-27 REMOVED — secondaryCategoriesTop3 finding violated the locked
  // verification-gate rule (feedback_verification_gates_must_be_strict.md).
  // The wording "Adding 2-3 secondary categories" implies the lead doesn't
  // already have them — an absence claim we can't verify. categoriesCount is
  // null in our audit (extractor was disabled per project_video_data_accuracy.md
  // because it inflated phrase variants), so we have no way to confirm.
  // Caught 2026-05-27 on Fenn Termite — Chris flagged the finding because a
  // 70+ year established business almost certainly has 2-3 secondaries set
  // already. Re-enable only when a reliable categoriesCount extractor ships
  // AND we gate the finding on `categoriesCount < N`.

  // NOTE: NAP is intentionally NOT in Maps findings.
  // It's a website-vs-listing comparison, so it belongs in the Website section
  // (mentioning "phone on website" while video is still showing Maps is confusing).

  // GBP audit data (if available)
  // GATED 2026-05-21: requires reviewsParsedCount > 0 — proves the review-card
  // scraper actually saw cards. daysSinceLastReview from a missed scrape could
  // be stale or null. Same class of false-claim risk as the gbpPosts bug.
  const _rvScraped = audit?.gbp?.reviewsParsedCount;
  if (audit?.gbp?.daysSinceLastReview != null && audit.gbp.daysSinceLastReview > 30 && Number.isFinite(_rvScraped) && _rvScraped > 0) {
    out.push({
      key: 'reviewVelocity',
      score: audit.gbp.daysSinceLastReview > 90 ? 20 : 40,
      finding: `your last Google review was about ${audit.gbp.daysSinceLastReview} days ago — review velocity (how recent your reviews are) weighs heavily in Maps ranking`,
    });
  } else if (audit?.gbp?.daysSinceLastReview != null && audit.gbp.daysSinceLastReview > 30 && !(Number.isFinite(_rvScraped) && _rvScraped > 0)) {
    console.log('[step-6 unverified-skip] reviewVelocity finding suppressed: daysSinceLastReview set but reviewsParsedCount=0 (cards not actually scraped).');
  }

  // photoCount + categoriesCount findings — re-activated 2026-06-01 with
  // strict verification gates. Both extractors got new high-confidence
  // selectors in step-2.5 and now write *Verified flags. Findings fire
  // ONLY when (a) the value is numeric AND (b) Verified=true. This prevents
  // the "false claim" failure mode that got these disabled originally.
  // Memory: feedback_verification_gates_must_be_strict.md
  if (audit?.gbp?.photoCountVerified === true
      && Number.isFinite(audit.gbp.photoCount)
      && audit.gbp.photoCount >= 2
      && audit.gbp.photoCount < 30) {
    out.push({
      key: 'photoGap',
      score: 7,
      finding: `your Google Business Profile shows only ${audit.gbp.photoCount} photo${audit.gbp.photoCount === 1 ? '' : 's'} — top performers in this search average 50 or more. Photo count is a measured Maps-ranking signal Google reads on the profile`,
    });
  }
  // 2026-06-03 — REMOVED secondaryCategoriesGap finding entirely.
  //
  // History: shipped 2026-06-01 with "your GBP has only a primary category set"
  // wording. Chris flagged 2026-06-02 that we can't actually know the count
  // because secondaries live in the owner-only admin dashboard. We reframed
  // the wording to "Google is only surfacing one category" — but Chris pushed
  // back again 2026-06-03: Google doesn't publicly display secondary categories
  // for ANY listing — that's a structural property of Google Maps, not a
  // ranking failure. The "top performers show multiple category labels publicly"
  // implication was empirically false (no one does — Google doesn't show it).
  //
  // Result: cut the finding entirely. We can't observe secondaries, can't
  // truthfully compare to competitors, and any wording invites the prospect
  // to verify a claim that won't hold up.
  //
  // What survives elsewhere:
  // - primaryCategoryMatchesSearch (we CAN observe the public primary)
  // - mismatchedPrimaryCategory finding (still valid — public + observable)
  //
  // Memory: feedback_audit_only_observable_claims.md.
  // (no-op block — finding cut)

  // GBP primary category doesn't match the search term — only fire if we confirmed what the category actually is.
  // PRIORITY UPGRADE 2026-05-15: Whitespark 2026 ranks incorrect primary category as the
  // #2 worst NEGATIVE local-pack ranking factor with penalty score 214 — was P18, now P3.
  if (audit?.gbp?.primaryCategoryMatchesSearch === false && audit?.gbp?.primaryCategory) {
    out.push({
      key: 'categoryMismatch',
      score: 3,
      finding: `your Google Business Profile primary category is "${audit.gbp.primaryCategory}" — a mismatched primary category directly limits your visibility in this search`,
    });
  }

  // NEW (2026-05-14): semantic mismatch — category is PRODUCT-intent ("supplier" /
  // "manufacturer" / "dealer") but search is SERVICE-intent ("repair" / "service" /
  // "installation"). Token match passes (e.g. "garage door" in both) but Google's
  // category-match algorithm weights service-vs-product semantics. Common pattern
  // for businesses that picked "supplier" early but mostly do repair/install.
  if (audit?.gbp?.primaryCategory) {
    const cat = audit.gbp.primaryCategory.toLowerCase();
    const searchTerm = (normalizeField(record, 'Search Term') || '').toLowerCase();
    const PRODUCT_WORDS = ['supplier', 'distributor', 'manufacturer', 'dealer', 'store', 'showroom', 'wholesaler'];
    const SERVICE_WORDS = ['repair', 'service', 'installation', 'install', 'replacement', 'maintenance'];
    const catHasProduct = PRODUCT_WORDS.some(w => cat.includes(w));
    const searchHasService = SERVICE_WORDS.some(w => searchTerm.includes(w));
    const catHasService = SERVICE_WORDS.some(w => cat.includes(w));
    // PRIORITY UPGRADE 2026-05-15: same Whitespark 2026 #2-negative basis as
    // categoryMismatch — was P17, now P3. Gated by vertical_benchmarks DB so
    // it won't fire when the search-vertical's top performers actually use a
    // product-word category (e.g., "Garage door supplier" dominates garage
    // door repair).
    if (catHasProduct && searchHasService && !catHasService) {
      out.push({
        key: 'categoryServiceVsProduct',
        score: 3,
        finding: `your Google Business Profile primary category is "${audit.gbp.primaryCategory}" — but the search "${normalizeField(record, 'Search Term')}" is for a service, not a product. Google ranks by category match: if repair and installation are your core business, switching your primary category to a service-focused option, like "Garage door repair service", and moving "${audit.gbp.primaryCategory}" to a secondary slot, is one of the highest-leverage moves you can make for this query`,
      });
    }
  }

  // PRIORITY 19 (NEW 2026-05-14): Category vs top-3 majority comparative finding.
  // Catches the case where business's category technically contains the search keyword but
  // the top-3 ranked competitors use a different, more service-aligned category.
  // E.g. Alvin's "Garage door supplier" vs top-3 "Garage door repair service".
  if (top3Stats?.majorityCategory && audit?.gbp?.primaryCategory) {
    const yourCat = audit.gbp.primaryCategory.trim().toLowerCase();
    const majCat = top3Stats.majorityCategory.trim().toLowerCase();
    // PRIORITY UPGRADE 2026-05-15: this is the EMPIRICAL category check —
    // strongest version because it's grounded in what top performers in this
    // search actually use, not a semantic rule. Was P19, now P2. Whitespark
    // 2026: wrong primary category = #2 negative ranking factor.
    if (yourCat !== majCat && !out.some(f => f.key === 'categoryMismatch')) {
      out.push({
        key: 'categoryVsTop3',
        score: 2,
        finding: `your Google Business Profile primary category is "${audit.gbp.primaryCategory}" — but the top 3 ranked businesses in your search use "${top3Stats.majorityCategory}". Switching to match the category Google associates with this search intent is one of the highest-impact moves for local rank`,
      });
    }
  }

  // No business hours set on GBP.
  // PRIORITY UPGRADE 2026-05-15: Whitespark 2026 flags missing/outdated hours
  // as a top-tier negative — was P22, now P10. "Rankings begin to degrade in
  // the final hour a business is open each day" per Whitespark.
  //
  // GATED 2026-05-21: requires hoursVerified === true. The Maps panel hours
  // section can be lazy-loaded or behind a click; firing on hasBusinessHours=false
  // alone risks the same class of false claim as the gbpPosts bug.
  // See feedback_verification_gates_must_be_strict.md.
  if (audit?.gbp?.hoursVerified === true && audit?.gbp?.hasBusinessHours === false) {
    out.push({
      key: 'businessHours',
      score: 10,
      finding: `your Google Business Profile has no business hours set — Google suppresses incomplete profiles in local pack results, and rankings degrade in the final hour a business is open each day if hours aren't current`,
    });
  } else if (audit?.gbp?.hasBusinessHours === false && audit?.gbp?.hoursVerified !== true) {
    console.log('[step-6 unverified-skip] businessHours finding suppressed: hasBusinessHours=false but hoursVerified !== true.');
  }

  // GBP business status — NEW 2026-05-15. Whitespark 2026: incorrect status
  // flag is a top-tier negative ranking factor. A live business reading as
  // "closed permanently" or "closed temporarily" in Google data hurts
  // visibility even if hours look open. Gracefully no-ops when status field
  // not populated by step-2.5 (current state: businessStatus extractor is
  // optional in step-2.5).
  if (audit?.gbp?.businessStatus && String(audit.gbp.businessStatus).toUpperCase() !== 'OPERATIONAL') {
    out.push({
      key: 'gbpClosedFlag',
      score: 4,
      finding: `your Google Business Profile shows a status of "${audit.gbp.businessStatus}" — Whitespark 2026 lists incorrect business status as a top-tier negative ranking factor. If you're operating, Google needs the status corrected immediately`,
    });
  }

  // Hours staleness — NEW 2026-05-15. Different from "hasBusinessHours" check
  // above. Fires only when audit captures hours-last-updated metadata
  // (currently null in all extractors; activates when step-2.5 adds the
  // extractor). Whitespark 2026: hours degradation is a top-tier negative;
  // "rankings begin to degrade in the final hour open" if hours stale.
  if (audit?.gbp?.hoursLastUpdatedDaysAgo != null && audit.gbp.hoursLastUpdatedDaysAgo > 180) {
    out.push({
      key: 'businessHoursStale',
      score: 11,
      finding: `your Google Business Profile hours haven't been updated in ${audit.gbp.hoursLastUpdatedDaysAgo} days — Whitespark 2026 says rankings degrade in the final open hour if hours are inaccurate, and Google deprioritizes profiles that look stale`,
    });
  }

  // Duplicate listings — activated 2026-06-01. Whitespark 2026: duplicate /
  // conflicting listings split authority + confuse algorithm. Gated on
  // duplicateListingCountVerified=true (SerpAPI lookup succeeded). A-1
  // Performance Rooter & Plumbing case: 2 listings → fires correctly.
  // 2026-06-01: tightened wording to ≤20 words to fit Maps segment budget.
  // Recount against stored listings so similarly-named DIFFERENT competitors
  // (Pipe Doctor Rooter vs Doctor Pipe) don't get counted as duplicates of you.
  const dupCount = trueDuplicateCount(audit);
  if (audit?.gbp?.duplicateListingCountVerified === true && dupCount > 0) {
    out.push({
      key: 'duplicateListing',
      score: 5,
      finding: `Google shows ${dupCount} other listing${dupCount === 1 ? '' : 's'} under your business name — Whitespark 2026 flags duplicates as a top-tier negative that splits your ranking authority`,
    });
  }

  // Very low recent review velocity — only fire when daysSinceLastReview has NOT already fired
  // (avoids saying the same thing twice). Catches active businesses getting very few recent reviews.
  //
  // GATED 2026-05-21: requires reviewsParsedCount > 0 so we know the review-card
  // scraper actually saw something. reviewsLast30Days=0 with parsedCount=0 means
  // "we couldn't read the reviews tab," NOT "you have no recent reviews."
  const velocityAlreadyFired = out.some(f => f.key === 'reviewVelocity');
  const _reviewsScraped = audit?.gbp?.reviewsParsedCount;
  const _reviewsScrapeOk = Number.isFinite(_reviewsScraped) && _reviewsScraped > 0;
  if (!velocityAlreadyFired && audit?.gbp?.reviewsLast30Days != null && audit.gbp.reviewsLast30Days <= 1 && _reviewsScrapeOk) {
    const recentText = audit.gbp.reviewsLast30Days === 0
      ? `you haven't received any new Google reviews in the last 30 days`
      : `you received only 1 new Google review in the last 30 days`;
    // PRIORITY UPGRADE 2026-05-15: review signals grew 16%→20% in Whitespark
    // 2026; recency now outweighs raw count. Was P32, now P10.
    out.push({
      key: 'reviewVelocityRecent',
      score: 10,
      finding: `${recentText} — Whitespark 2026 confirms review recency outweighs raw count: a business with 200 lifetime reviews + none recent ranks BELOW a business with 80 + a steady weekly flow`,
    });
  }

  // Zero owner responses (only flag when there are enough reviews to respond to).
  // PRIORITY UPGRADE 2026-05-15: Google's own data says respondents are 1.7x
  // more trustworthy; reviews are 20% of local-pack weight. Was P45, now P30.
  //
  // GATED 2026-05-21: requires reviewsParsedCount > 0 — proves the review-card
  // scraper actually saw reviews and could detect responses. Without that,
  // ownerResponseCount=0 could just mean "we didn't parse any cards" rather
  // than "they don't respond." Same class of false claim as gbpPosts bug.
  const reviewsScraped = audit?.gbp?.reviewsParsedCount;
  if (audit?.gbp?.ownerResponseCount === 0 && (audit?.gbp?.reviewCount || 0) > 5 && Number.isFinite(reviewsScraped) && reviewsScraped > 0) {
    out.push({
      key: 'ownerResponse',
      score: 30,
      finding: `you have ${audit.gbp.reviewCount} reviews but haven't responded to any — Google's own data says businesses that respond are 1.7x more trustworthy, and Maps ranking weighs owner response rate inside the review-signal block`,
    });
  } else if (audit?.gbp?.ownerResponseCount === 0 && (audit?.gbp?.reviewCount || 0) > 5 && !(Number.isFinite(reviewsScraped) && reviewsScraped > 0)) {
    console.log('[step-6 unverified-skip] ownerResponse finding suppressed: ownerResponseCount=0 but reviewsParsedCount missing/zero (cards not actually scraped).');
  }

  // 2026-05-28 NEW: ownerResponseRateGap — fires when the owner DOES respond
  // to some reviews but the response rate is below the top-performer threshold
  // (Whitespark 2026: top 10% of GBP profiles respond to 80%+ of reviews).
  // Complements the count=0 finding above — that one fires for "never
  // responded", this fires for "responds sometimes but not enough".
  //
  // GATED on reviewsParsedCount >= 3 so we're computing a meaningful rate (not
  // 0/1 or 1/2 noise). Same verification family as ownerResponse: requires
  // actual review cards scraped before claiming anything about response rate.
  const _rrParsed = audit?.gbp?.reviewsParsedCount;
  const _rrResponses = audit?.gbp?.ownerResponseCount;
  if (
    Number.isFinite(_rrParsed) && _rrParsed >= 3 &&
    Number.isFinite(_rrResponses) && _rrResponses > 0
  ) {
    const responseRate = _rrResponses / _rrParsed;
    if (responseRate < 0.7) {
      const pct = Math.round(responseRate * 100);
      out.push({
        key: 'ownerResponseRateGap',
        score: 25,
        finding: `you've responded to roughly ${pct} percent of your recent reviews — Whitespark 2026 found top performers respond to 80 percent or more, and review-response rate is a measurable signal Google reads inside the review-quality block`,
      });
    }
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

  // PRIORITY 30: Google Posts inactive or absent (M2) — VERIFICATION REQUIRED.
  //
  // History:
  //  - 2026-05-13: original detector disabled (Express returned hasPosts=false
  //    when GBP actually had a post from 1 day ago — Maps DOM label regex miss)
  //  - 2026-05-20 EOD: re-enabled without verification gate so Cool Choice's
  //    no-posts case would fire even when Search KP CAPTCHA blocked verification
  //  - 2026-05-21: REVERSED again after Monkey Wrench Plumbing's audit returned
  //    hasPosts=false even though their GBP clearly has posts from Mar 18 + Mar 10
  //    (visible in Search KP). Firing the finding produced a false claim in the
  //    cold-outreach video — immediate trust-killer if sent to a prospect.
  //
  // LOCKED RULE: never fire "no Google Posts" unless we verified via Search KP
  // scrape (postsVerified === true). The Maps-panel hasPosts detector is unreliable
  // (intermittent false negatives on legit accounts). Better to skip a true
  // positive than fabricate one. See feedback_no_hardcoded_stats.md +
  // feedback_self_diagnose_audit.md.
  const postsVerifiedFalse = audit?.gbp?.postsVerified === true && audit?.gbp?.hasPosts === false;
  const postsUnverified = audit?.gbp?.hasPosts === false && audit?.gbp?.postsVerified !== true;
  if (postsUnverified) {
    console.log('[step-6 unverified-skip] gbpPosts finding suppressed: hasPosts=false but postsVerified !== true (Search KP scrape failed / CAPTCHA / network). Better to skip than ship a false claim.');
  }
  if (postsVerifiedFalse) {
    out.push({
      key: 'gbpPosts',
      score: 30,
      finding: `you don't have any active Google Posts on your profile — businesses that publish weekly updates get a measurable ranking boost from the engagement signal`,
    });
  } else if (audit?.gbp?.postsVerified === true && audit?.gbp?.lastPostDaysAgo != null && audit.gbp.lastPostDaysAgo > 90) {
    // PRIORITY UPGRADE 2026-05-15: posts contribute to GBP-32% block;
    // "abandoned profiles" = top-tier negative per Whitespark 2026. Was P30, now P15.
    out.push({
      key: 'gbpPosts',
      score: 15,
      finding: `your last Google Post was about ${audit.gbp.lastPostDaysAgo} days ago — posting at least monthly signals active engagement, and Google ranks active listings higher than dormant ones`,
    });
  }

  // noSocialProfiles: when GBP shows 0 linked social profiles, fire.
  // Most legit local businesses have at least one social. Locked 2026-05-20 EOD.
  if (audit?.gbp?.gbpSocialProfilesVerified === true && audit?.gbp?.gbpSocialProfileCount === 0) {
    out.push({
      key: 'noSocialProfiles',
      score: 35,
      finding: `your Google Business Profile doesn't link to any social media profiles — Facebook, Instagram, LinkedIn, or YouTube. Each linked social adds a citation signal and a customer-discovery path, and the absence is a missed signal Google uses to assess business legitimacy`,
    });
  }

  // NEW 2026-05-15: dormantProfile composite finding. Whitespark 2026 lists
  // "abandoned/inactive profiles" as a top-tier negative ranking factor. This
  // composite fires when MULTIPLE staleness signals combine — stronger than
  // any single stale-signal finding alone because it indicates the GBP isn't
  // being maintained at all (top performers refresh weekly).
  //
  // Suppress if individual findings already fire to avoid double-counting:
  // only fires when conditions cluster but no single finding has already
  // pushed the prospect on staleness.
  const staleSignals = [];
  if (audit?.gbp?.daysSinceLastReview != null && audit.gbp.daysSinceLastReview > 90) staleSignals.push('reviews');
  // Verified posts only — never count unverified hasPosts=false toward staleness.
  if ((audit?.gbp?.postsVerified === true && audit?.gbp?.hasPosts === false) ||
      (audit?.gbp?.lastPostDaysAgo != null && audit.gbp.lastPostDaysAgo > 90)) staleSignals.push('posts');
  if (audit?.gbp?.descriptionVerified === true && audit?.gbp?.descriptionLength === 0) staleSignals.push('description');
  if (audit?.gbp?.hasBusinessHours === false) staleSignals.push('hours');
  if (staleSignals.length >= 3 && !out.some(f => f.key === 'reviewVelocity' || f.key === 'gbpPosts')) {
    out.push({
      key: 'dormantProfile',
      score: 8,
      finding: `your Google Business Profile shows ${staleSignals.length} signs of dormancy — ${staleSignals.join(', ')} are all stale or missing. Whitespark 2026 flags abandoned profiles as a top negative ranking factor; Google deprioritizes listings that look unmaintained`,
    });
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
  // 2026-06-02 — REORDERED: local-SEO conversion-lever positives first;
  // tech-spec positives (mobile load time) demoted. Drops the "X seconds,
  // under the 3-second threshold" line as a primary positive because it
  // reads tech-spec, not local-SEO, and contradicts a heavy-pageWeight
  // negative when both fire on the same segment.
  if (m.clickToCallAboveFold === true) {
    out.push({ key: 'c2cFoldGood', score: 100, finding: `your tap-to-call button is visible above the fold on mobile — direct Maps-to-call conversion path is wide open` });
  }
  if (m.phoneVisibleAboveFold === true) {
    out.push({ key: 'phoneVisibleGood', score: 101, finding: `your phone number is visible as text above the fold on mobile — visitors from Maps can see the digits they're about to dial before they even tap` });
  }
  if (m.hasStickyCta === true) {
    out.push({ key: 'stickyCtaGood', score: 102, finding: `you have a sticky call-or-text button that stays visible during mobile scroll — Maps visitors keep the conversion path in view no matter how far they read` });
  }
  if (m.hasClickToText === true) {
    out.push({ key: 'clickToTextGood', score: 103, finding: `you have tap-to-text set up on mobile — a free SMS conversion path most competitors are missing` });
  }
  if (m.primaryCtaTapTargetPx != null && m.primaryCtaTapTargetPx >= 48) {
    out.push({ key: 'tapTargetGood', score: 104, finding: `your primary call-to-action tap target is ${m.primaryCtaTapTargetPx} pixels — meets Google's 48-pixel mobile accessibility guideline, so no mis-taps on thumb-driven traffic` });
  }
  if (m.hasViewportMeta === true) {
    out.push({ key: 'viewportGood', score: 105, finding: `your responsive viewport meta tag is properly configured — site adapts cleanly for the 70 percent of local-search traffic that arrives on mobile` });
  }
  // TIER 3 (DEMOTED): mobile-load-time positive. Only fires when no local-SEO
  // mobile positives match — avoids contradicting a heavy pageWeight negative
  // and stops the mobile segment from sounding like a PageSpeed report.
  if (m.pageLoadSeconds != null && m.pageLoadSeconds <= 3) {
    out.push({ key: 'mobileLoadGood', score: 125, finding: `your mobile load comes in at ${m.pageLoadSeconds.toFixed(1)} seconds, under the 3-second mobile abandonment threshold` });
  }
  return out;
}

function scoreMapsConfirmedGood(audit, top3Stats, record) {
  const out = [];
  const rating = parseFloat(normalizeField(record, 'Rating') || '');
  const reviews = parseInt(normalizeField(record, 'Reviews') || '', 10);
  // Rank-aware: use peer-subset for ranks 1-3, full top-3 for rank 4+.
  const leadRank = parseInt(normalizeField(record, 'Map Rank') || '', 10);
  const compare = top3Stats?.picked ? pickComparisonSubset(top3Stats.picked, leadRank) : null;
  const compareLabel = compare?.comparisonLabel || 'the top 3';
  const avgReviews = compare?.reviewsAvg != null ? compare.reviewsAvg
    : (top3Stats?.reviewsAvg ?? Math.round((top3Stats?.reviewsMin + top3Stats?.reviewsMax) / 2));
  const avgRating = compare?.ratingAvg != null ? compare.ratingAvg
    : (top3Stats?.ratingAvg ?? (top3Stats?.ratingMin + top3Stats?.ratingMax) / 2);

  if (top3Stats && Number.isFinite(reviews)) {
    if (avgReviews > 0 && reviews >= avgReviews * 0.9) {
      out.push({ key: 'reviewCountGood', score: 100, finding: `your review count holds up against your competition — ${reviews} reviews against ${compareLabel} at around ${avgReviews}` });
    }
  }
  if (top3Stats && Number.isFinite(rating)) {
    if (rating >= avgRating - 0.05) {
      out.push({ key: 'ratingGood', score: 101, finding: `your rating at ${rating} stars is on par with ${compareLabel} around ${avgRating.toFixed(1)} — trust signal is solid` });
    }
  }
  if (audit?.gbp?.primaryCategoryMatchesSearch === true && audit?.gbp?.primaryCategory) {
    out.push({ key: 'categoryGood', score: 102, finding: `your Google Business Profile primary category — "${audit.gbp.primaryCategory}" — matches the search intent, which is the strongest category signal Google uses` });
  }
  // 2026-06-11: hoursGood CUT — "your hours are set" is a useless point to voice
  // to a prospect (it tells them nothing actionable + makes the video feel like
  // we found nothing). Chris flagged it on the American Plumber review. Hours
  // presence is table-stakes, not a selling point.
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

// Search-vertical benchmark DB loader. Reads `data/vertical-benchmarks/<slug>.json`
// produced by `scripts/build-vertical-benchmark.mjs`. The benchmark is the
// empirical ground truth for what top-ranked businesses in this search look
// like — used to gate voiceover findings so we never give advice that
// contradicts what successful competitors actually do.
//
// Returns the parsed benchmark object or null if missing. step-6 merges
// `findingsDisabled` from the benchmark into the run's disabledKeys list.
function loadVerticalBenchmark(searchTerm) {
  if (!searchTerm) return null;
  const slug = String(searchTerm).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const benchPath = path.join(process.cwd(), 'data', 'vertical-benchmarks', `${slug}.json`);
  if (!fs.existsSync(benchPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(benchPath, 'utf-8'));
  } catch (_) {
    return null;
  }
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
  // Vertical benchmark DB: load empirical ground-truth for this search and
  // merge its `findingsDisabled` into disabledKeys. Prevents script from
  // firing semantic findings that contradict what top-ranked businesses
  // actually do in this market (e.g., "switch from supplier to repair
  // service" advice when supplier is the dominant category among top 5).
  const searchTermRaw = normalizeField(record, 'Search Term') || normalizeField(record, 'searchTerm') || '';
  const benchmark = loadVerticalBenchmark(searchTermRaw);
  if (benchmark) {
    // Stale-benchmark check (NEW 2026-05-15): warn if >90 days old, hard-block
    // if >180 days. Local rankings shift; outdated benchmarks lead to outdated
    // advice. Emergency override: VERTICAL_DB_BYPASS_STALE=1.
    if (benchmark.auditedDate) {
      const auditMs = new Date(benchmark.auditedDate).getTime();
      const ageDays = Math.floor((Date.now() - auditMs) / (1000 * 60 * 60 * 24));
      if (ageDays > 180 && process.env.VERTICAL_DB_BYPASS_STALE !== '1') {
        throw new Error(
          `\n\n🛑 [vertical-db] HARD BLOCK: benchmark for "${benchmark.searchTerm}" is ${ageDays} days old (>180d).\n` +
          `   Refresh it before rendering:\n` +
          `   node scripts/build-vertical-benchmark.mjs "${benchmark.searchTerm}"\n\n` +
          `   Override for emergencies: VERTICAL_DB_BYPASS_STALE=1\n`
        );
      } else if (ageDays > 90) {
        console.warn(`   [vertical-db] ⚠️  benchmark is ${ageDays} days old (>90d) — consider refreshing: node scripts/build-vertical-benchmark.mjs "${benchmark.searchTerm}"`);
      }
    }
    console.log(`   [vertical-db] benchmark loaded for "${benchmark.searchTerm}" (audited ${benchmark.auditedDate}, majorityTop5="${benchmark.majorityCategoryTop5}")`);
    if (Array.isArray(benchmark.findingsDisabled) && benchmark.findingsDisabled.length) {
      for (const k of benchmark.findingsDisabled) {
        if (!disabledKeys.includes(k)) disabledKeys.push(k);
      }
      console.log(`   [vertical-db] disabling findings per benchmark: ${benchmark.findingsDisabled.join(', ')}`);
    }
  } else {
    // HARD BLOCK per Chris's locked rule 2026-05-14: NO render without a
    // benchmark for the search term. The benchmark is the empirical ground
    // truth that gates bad semantic findings; rendering without one risks
    // shipping the categoryServiceVsProduct-style bad advice we just removed.
    // Opt-out for emergencies: set VERTICAL_DB_BYPASS=1 (logs a loud warning
    // and falls back to semantic rules).
    if (process.env.VERTICAL_DB_BYPASS === '1') {
      console.warn(`   [vertical-db] ⚠️  BYPASS ACTIVE: no benchmark for "${searchTermRaw}" — proceeding under VERTICAL_DB_BYPASS=1. Findings will fire from semantic rules only. THIS IS NOT SAFE FOR PROSPECT SENDS.`);
    } else {
      throw new Error(
        `\n\n🛑 [vertical-db] HARD BLOCK: no benchmark for search "${searchTermRaw}".\n` +
        `   Build one before rendering:\n` +
        `   node scripts/build-vertical-benchmark.mjs "${searchTermRaw}"\n\n` +
        `   Then re-run this step. Override only for emergencies with VERTICAL_DB_BYPASS=1.\n`
      );
    }
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

  // Strip GBP " - <Category>" suffix from the business name for use inside the
  // intro voiceover only. Scraped business names sometimes carry an appended
  // category ("Confirmed Roofing Experts - Roofing Contractor") that bloats
  // the intro past the 55-word cap. Other uses of `name` (Maps overlay, outro,
  // logs) keep the full form. Locked 2026-05-18 after Confirmed Roofing
  // Experts hit the cap at 56 words.
  const categoryRaw =
    normalizeField(record, 'Detected Category') ||
    normalizeField(record, 'Category') ||
    normalizeField(record, 'category') ||
    '';
  let nameForIntro = name;
  if (categoryRaw) {
    const escaped = categoryRaw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    nameForIntro = name.replace(new RegExp(`\\s*[-–—]\\s*${escaped}\\s*$`, 'i'), '');
  }

  // Intro target: 13-15s. Locked 2026-05-18 — re-tightened after regression
  // to ~25s. Memory: project_outreach_machine.md (intro length decision).
  //
  // Truncate verbose GBP names to first 3 words for the intro — keeps verbose
  // multi-location-style names (Cool Choice Heating & AC Repair Beverly Hills,
  // Green Heating & AC Repair Beverly Hills) under the 55-word intro cap.
  // Locked 2026-05-20 EOD after Cool Choice failed the intro guardrail at 58
  // words. Trim happens only for intro — full name stays elsewhere.
  let nameForIntroDisplay = nameForIntro;
  const introNameWords = nameForIntro.replace(/[^A-Za-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim().split(' ');
  if (introNameWords.length > 3) {
    nameForIntroDisplay = introNameWords.slice(0, 3).join(' ');
  }
  const intro = isTop3
    ? `Hey, this is Chris with Rocket Growth Agency — local SEO experts. I ran a quick audit on ${nameForIntroDisplay}'s Google Business Profile, website, and mobile site. Next 2 minutes I'll cover where you're vulnerable to losing your top 3 spot — plus how to get the full report at the end.`
    : `Hey, this is Chris with Rocket Growth Agency — local SEO experts. I ran a quick audit on ${nameForIntroDisplay}'s Google Business Profile, website, and mobile site. Next 2 minutes I'll cover the top issues keeping you from the top 3 — plus how to get the full report at the end.`;

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
  // "No own website" short-circuits both website + mobile sections — there's
  // no real page to evaluate so every other finding would be noise.
  // Memory: feedback_no_website_is_top_finding.md (locked 2026-05-20).
  const noOwnWebsiteFired = rawWebsite.length === 1 && rawWebsite[0].key === 'noOwnWebsite';
  // Inject social-profiles finding (uses step-2 social URL fields, not audit-findings)
  // — skip when noOwnWebsite fires; social presence is moot without a homepage.
  if (!noOwnWebsiteFired) {
    const socialFinding = scoreSocialProfilesFinding(record, audit);
    if (socialFinding && !disabledKeys.includes(socialFinding.key)) {
      rawWebsite.push(socialFinding);
      rawWebsite.sort((a, b) => a.score - b.score);
    }
  }
  const rawMobile = noOwnWebsiteFired
    ? []
    : applyValidationFilter(scoreMobileFindings(audit), disabledKeys);
  const { maps: mapsFindings, website: websiteFindings, mobile: mobileFindings } = dedupAcrossSections(rawMaps, rawWebsite, rawMobile);

  // HARD RULE diagnostic — Chris-locked 2026-05-20 EOD. Every section should
  // surface 3 errors from the 51 active audit checks. Log when under-firing
  // so we can audit which checks are too tight / dead / suppressed.
  // Memory: feedback_3_errors_no_eager_positives.md.
  for (const [secName, secFindings] of [['Maps', mapsFindings], ['Website', websiteFindings], ['Mobile', mobileFindings]]) {
    const errorCount = secFindings.length;
    if (errorCount < 3) {
      // Diagnostic only. Fill-to-3 rule (locked 2026-05-21): we always TRY
      // to ship 3 items per section. Errors come first (up to 3), then
      // VERIFIED-true positives backfill any remaining slots. Falsehoods are
      // never used. See feedback_3_errors_no_eager_positives.md.
      console.log(`[step-6 ${secName}] ${errorCount} verified error finding(s) — will backfill to 3 with verified positives.`);
    }
  }
  const mapsGood = scoreMapsConfirmedGood(audit, top3Stats, record);
  const websiteGood = scoreWebsiteConfirmedGood(audit);
  const mobileGood = scoreMobileConfirmedGood(audit);

  // Fill-to-3 positives rule — locked 2026-05-21 (Chris re-clarified):
  // "WE DO ALL WE CAN to find truthful and real and accurate errors and if
  //  there is not 3 then we add a positive or 2 to get to the full 3 per
  //  maps, website, mobile. ... so if we truly find 2 issues and nothing
  //  else we add 1 filler which is also a truth and not fake or false."
  //
  // Each section ships exactly 3 findings (or as many as we have if real+
  // positives < 3 — never pad with fabrications).
  //   - real errors:    up to 3 (top scored)
  //   - positives:      backfill to reach 3 total, drawn from confirmed-good
  //                     scorers (only fire when the actual measurement
  //                     supports the positive — e.g., pageLoadGood fires
  //                     only when pageLoadSeconds < 2.5).
  //
  // Positives MUST be true claims about the site. They're not filler — they're
  // verified strengths. Mixing errors + positives is fine because both are
  // accurate. Falsehoods are never candidates either way.
  //
  // Memory: feedback_3_errors_no_eager_positives.md (sharpened 2026-05-21).
  //
  // 2026-05-29 — Tier-3 suspect-but-unverified pool added. When fewer than
  // `max` real errors clear strict verification gates, the script previously
  // padded straight to verified positives. The problem: real-but-suspect
  // findings (e.g., suspectWebsiteMismatch, iframe-gated absence claims)
  // got pushed out by positives, so the video never mentioned them. The
  // suspect tier slots between real and positive — when present, it's a
  // truthful "we observed X but couldn't fully verify because of Y" claim,
  // worded carefully to avoid false certainty. Memory:
  // project_dormant_pipeline_items_2026-05-28.md §B for the catalog.
  function renderWithPositives(real, positives, max = 3, suspect = []) {
    const realPicked = real.slice(0, max);
    let need = max - realPicked.length;
    const suspectPicked = need > 0 ? suspect.slice(0, need) : [];
    need -= suspectPicked.length;
    const posPicked = need > 0 ? positives.slice(0, need) : [];
    const combined = [...realPicked, ...suspectPicked, ...posPicked];
    const list = combined.length ? numberedJoin(combined, max) : '';
    return {
      list,
      tail: '',
      realCount: realPicked.length,
      suspectCount: suspectPicked.length,
      hasPositives: posPicked.length > 0,
      posCount: posPicked.length,
      totalCount: combined.length,
    };
  }

  // 2026-05-29 — Suspect-tier scorers. Return findings the audit DETECTED
  // but couldn't fully verify, worded to be truthful about uncertainty.
  // Only used as backfill when real-error count < 3 — never replaces a
  // real error. Memory: project_dormant_pipeline_items_2026-05-28.md §B.
  function scoreWebsiteSuspectFindings(audit) {
    const w = audit?.website;
    if (!w) return [];
    const out = [];
    // iframe-gated reviews. Worded tight (≤10s spoken) to fit the 47s website-segment budget.
    if (w.hasReviewsOnPage === null && (w.iframeCount || 0) > 0 && w._reviewsMentionedInSource) {
      out.push({
        key: 'noReviewsSuspect',
        score: 50,
        finding: 'your homepage references reviews but they\'re inside a third-party widget search engines can\'t read — those reviews aren\'t counting as on-page trust signals',
      });
    }
    return out;
  }
  function scoreMobileSuspectFindings(audit) {
    const m = audit?.mobile;
    if (!m) return [];
    const out = [];
    // iframe-gated social-proof above the fold
    if (m.socialProofAboveFold === null && (m.iframeCount || 0) > 0) {
      out.push({
        key: 'noSocialProofSuspect',
        score: 50,
        finding: 'we couldn\'t confirm review stars in your mobile hero — iframes blocked the check. If they\'re missing, first-time visitors have no trust signal before they scroll',
      });
    }
    // CTA tap target couldn't be measured
    if (m.primaryCtaTapTargetPx === null) {
      out.push({
        key: 'tapTargetSuspect',
        score: 51,
        finding: 'your primary mobile call-to-action button is rendered by a JavaScript widget so we couldn\'t measure it — worth confirming it meets Google\'s 48-pixel tap target guideline',
      });
    }
    return out;
  }

  // -------- MAPS --------
  let mapsSegment;
  if (isTop3) {
    const baseLine = `When a customer is looking for ${searchTerm}, ${name} ranks #${rankNum} — already in the top 3, which captures 70 percent of all local leads from this search. That's the most valuable real estate.`;
    const { list, realCount, totalCount } = renderWithPositives(mapsFindings, mapsGood, 3);
    if (realCount >= 3) {
      mapsSegment = `${baseLine} But here's where you're vulnerable on your Maps listing: ${list}`;
    } else if (totalCount >= 1) {
      mapsSegment = `${baseLine} Here's what stood out on your Maps listing: ${list}`;
    } else {
      mapsSegment = `${baseLine} Your Maps fundamentals look solid — the bigger leverage point for defending your top 3 is your website and mobile experience, which we'll cover next.`;
    }
  } else {
    const baseLine = `When a customer is looking for ${searchTerm}, ${name} ranks #${rankRaw} — which is outside of the top 3, which accounts for 70 percent of all local leads.`;
    const { list, realCount, totalCount } = renderWithPositives(mapsFindings, mapsGood, 3);
    if (realCount >= 3) {
      mapsSegment = `${baseLine} Here are the top issues we found on your Maps listing: ${list}`;
    } else if (totalCount >= 1) {
      mapsSegment = `${baseLine} Here's what we found on your Maps listing: ${list}`;
    } else {
      mapsSegment = `${baseLine} Your Maps profile is in decent shape — the leverage to climb is on your website and mobile, which we'll cover next.`;
    }
  }

  // -------- WEBSITE --------
  const websiteSegment = (() => {
    const websiteSuspect = noOwnWebsiteFired ? [] : applyValidationFilter(scoreWebsiteSuspectFindings(audit), disabledKeys);
    const { list, realCount, totalCount } = renderWithPositives(websiteFindings, websiteGood, 3, websiteSuspect);
    const opener = `After reviewing your website — Google's primary trust signal for validating Maps ranking.`;
    if (isTop3) {
      if (realCount >= 3) return `${opener} Here are the website signals worth tightening to hold your top 3 spot: ${list}`;
      if (totalCount >= 1) return `${opener} Here's what stood out on your website: ${list}`;
      return `${opener} Your website fundamentals are clean — solid foundation for holding your top 3 spot.`;
    }
    if (realCount >= 3) return `${opener} Here are the top issues we found: ${list}`;
    if (totalCount >= 1) return `${opener} Here's what stood out on your website: ${list}`;
    return `${opener} Your site signals are clean — no major issues stood out.`;
  })();

  // -------- MOBILE --------
  const mobileSegment = (() => {
    const mobileSuspect = noOwnWebsiteFired ? [] : applyValidationFilter(scoreMobileSuspectFindings(audit), disabledKeys);
    const opener = `And then on mobile — where 70 percent of local-search traffic actually comes from.`;
    // 2026-06-15: word-budget pre-trim. The post-TTS SEGMENT_MAX caps mobile at 42s;
    // 3 verbose mobile findings can marginally overrun (American Drain came in at
    // 42.72s and HARD-FAILED the whole lead). Rather than fail on a fraction of a
    // second, drop the lowest-priority (3rd) finding when the 3-finding text would
    // exceed the budget (~3.2 words/sec ⇒ ~118-word ceiling incl. opener). Tight
    // videos preserved; everyone else still gets 3.
    const MOBILE_WORD_BUDGET = 118;
    const wc = (txt) => `${opener} ${txt}`.trim().split(/\s+/).length;
    let { list, realCount, totalCount } = renderWithPositives(mobileFindings, mobileGood, 3, mobileSuspect);
    if (list && wc(list) > MOBILE_WORD_BUDGET) {
      const trimmed = renderWithPositives(mobileFindings, mobileGood, 2, mobileSuspect);
      if (trimmed.list && wc(trimmed.list) < wc(list)) {
        console.warn(`[step-6 WARN] mobile segment ~${wc(list)} words > ${MOBILE_WORD_BUDGET}; trimmed 3→2 findings to fit the 42s cap.`);
        ({ list, realCount, totalCount } = trimmed);
      }
    }
    if (isTop3) {
      if (realCount >= 3) return `${opener} Here are the gaps a competitor could exploit: ${list}`;
      if (totalCount >= 1) return `${opener} Here's what stood out on mobile: ${list}`;
      return `${opener} Your mobile fundamentals look clean — no major gaps stood out.`;
    }
    if (realCount >= 3) return `${opener} Here are the top mobile issues we found: ${list}`;
    if (totalCount >= 1) return `${opener} Here's what stood out on mobile: ${list}`;
    return `${opener} On the mobile side, no major issues stood out.`;
  })();

  const outroText = isTop3
    ? `That was the surface-level audit. The full Free Growth Audit goes deeper — citation profile, competitor comparison, geo-grid visibility, and the exact execution plan. We're local SEO experts who'll defend your top 3 spot, push for #1, then expand into more keywords and locations — so you can grow your leads and your business. Tap the button below to claim yours. Free, no call required.`
    : `That was the surface-level audit. The full Free Growth Audit goes deeper — citation profile, competitor comparison, geo-grid visibility, and the exact execution plan. We're local SEO experts who fix what's holding you back, get you into the top 3 for this search, then expand into more keywords and locations — so you can grow your leads and your business. Tap the button below to claim yours. Free, no call required.`;
  // Intro + outro reframed 2026-05-14 to honest partial-audit framing — change only with explicit user request.

  // ============================================================
  // HARD GUARDRAIL: intro length must stay 13-15s. Memory rule:
  // feedback_intro_voiceover_13_15_seconds.md. Don't relax this without
  // explicit Chris approval — every regression past 16s costs us prospect
  // attention before they see Maps content.
  // ============================================================
  const INTRO_MAX_WORDS = 55;          // ~16s at TTS pace (3 wps + buffer)
  const INTRO_TARGET_WORDS = 48;        // ~14s — the locked target
  const introWordCount = intro.trim().split(/\s+/).length;
  if (introWordCount > INTRO_MAX_WORDS) {
    throw new Error(
      `[step-6 GUARDRAIL] Intro voiceover is ${introWordCount} words (max ${INTRO_MAX_WORDS} ≈ 16s). ` +
      `Locked target ${INTRO_TARGET_WORDS} words ≈ 14s. Cut the intro before re-running. ` +
      `See memory: feedback_intro_voiceover_13_15_seconds.md`
    );
  }
  if (introWordCount > INTRO_TARGET_WORDS + 4) {
    console.warn(
      `[step-6 WARN] Intro is ${introWordCount} words (locked target ${INTRO_TARGET_WORDS}). Still within max but trending long.`
    );
  }

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
    // Use concat AUDIO FILTER (not -f concat demuxer) because TTS segments often have
    // tiny leading-silence variations. The demuxer respects per-file timing exactly,
    // which can manifest as a quiet/muddied moment at segment joins (e.g. mobile
    // segment opener "And then on mobile" getting cut to "...den on mobile"). The
    // concat filter resamples and re-times each input through one filter graph, so
    // boundaries always sound clean. Also trims leading/trailing silence > 0.1s per
    // segment to eliminate TTS warm-up dips.
    const inputs = segmentNames.map((n) => path.join(segmentDir, n + '.mp3'));
    const args = ['-y'];
    inputs.forEach((p) => args.push('-i', p));
    // Per-input: trim leading silence so each segment starts at first word.
    // Then concat all through the audio filter.
    const filters = inputs.map((_, i) =>
      `[${i}:a]silenceremove=start_periods=1:start_silence=0.1:start_threshold=-50dB,asetpts=N/SR/TB[a${i}]`
    ).join(';');
    const concatChain = inputs.map((_, i) => `[a${i}]`).join('') + `concat=n=${inputs.length}:v=0:a=1[outa]`;
    args.push(
      '-filter_complex', `${filters};${concatChain}`,
      '-map', '[outa]',
      '-c:a', 'libmp3lame',
      '-b:a', '128k',
      '-ar', '24000',
      '-ac', '1',
      outPath,
    );
    const ff = spawn('ffmpeg', args, { stdio: 'ignore' });
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

async function ttsToFile(text, outPath, attempt = 1) {
  // OpenAI TTS occasionally times out or returns a truncated stream — when
  // that happens the resulting MP3 is a few KB and ffprobe reports 0.2-2s for
  // what should be a 20-30s segment. Step-4 then chokes when slicing a 25s
  // webm down to 0.3s ("Conversion failed!" in libx264). Symptom seen in
  // AN Integrity's first batch run 2026-05-15. Mitigation: retry up to 3x,
  // verify the resulting mp3 duration is plausible (≥80% of word-count-based
  // expectation), and bail loudly if all attempts produce short audio.
  const MAX_ATTEMPTS = 3;
  const expectedSecondsMin = Math.max(2, text.split(/\s+/).length / 6); // ~6 wps lower bound
  try {
    const response = await openai.audio.speech.create({
      model: 'gpt-4o-mini-tts',
      voice: 'echo',
      input: sanitizeForTTS(text),
      format: 'mp3',
      speed: 1.2,
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(outPath, buffer);
    // Verify the result isn't a truncated/error mp3. ffprobe duration vs
    // word-count-based minimum.
    const dur = await getMp3DurationSeconds(outPath);
    if (dur < expectedSecondsMin) {
      if (attempt < MAX_ATTEMPTS) {
        console.warn(`     ⚠️  TTS produced ${dur.toFixed(2)}s for ${text.split(/\s+/).length}-word input (expected ≥${expectedSecondsMin.toFixed(1)}s) — retrying (attempt ${attempt + 1}/${MAX_ATTEMPTS})`);
        await new Promise((r) => setTimeout(r, 1500 * attempt));
        return ttsToFile(text, outPath, attempt + 1);
      }
      throw new Error(`TTS truncated after ${MAX_ATTEMPTS} attempts (got ${dur.toFixed(2)}s, expected ≥${expectedSecondsMin.toFixed(1)}s)`);
    }
    return outPath;
  } catch (e) {
    if (attempt < MAX_ATTEMPTS) {
      console.warn(`     ⚠️  TTS error attempt ${attempt}/${MAX_ATTEMPTS}: ${e.message} — retrying`);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      return ttsToFile(text, outPath, attempt + 1);
    }
    throw e;
  }
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

  // Sync from Airtable as a GAP-FILLER only — CSV wins when CSV has a value.
  // Reversed 2026-05-21 from the prior "Airtable canonical" rule after three
  // overnight videos shipped with WRONG ranks in the voiceover (Santa Monica
  // Drain Co. said "#34" instead of #1, Enviro said "#21" instead of #3, Oasis
  // said "#44" instead of #4). Root cause: Airtable held stale Map Rank from
  // a prior scrape (different city), and step-8-publish runs AFTER step-6 so
  // Airtable wasn't updated until after the voiceover was generated.
  //
  // CSV represents THIS scrape session — it's the freshest authoritative
  // source. Airtable is the catch-up source for fields the scraper didn't
  // capture (e.g. legacy rows from before the step-1 extractor fix on
  // 2026-05-14). For Map Rank/Reviews/Rating/Category, CSV is canonical.
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
        const f = data.records?.[0]?.fields || {};
        const syncs = [
          { airtable: 'Map Rank', csv: 'Map Rank' },
          { airtable: 'Review Count', csv: 'Reviews' },
          { airtable: 'Rating', csv: 'Rating' },
          { airtable: 'Category', csv: 'Detected Category' },
        ];
        const filled = [];
        for (const { airtable, csv } of syncs) {
          const csvVal = record[csv];
          const hasCsv = csvVal != null && String(csvVal).trim() !== '';
          if (hasCsv) continue; // CSV wins
          const v = f[airtable];
          if (v != null && v !== '') {
            record[csv] = String(v);
            filled.push(`${csv}: (empty) → ${v}`);
          }
        }
        if (filled.length) {
          console.log(`   ⚡ Airtable gap-fill (CSV was empty): ${filled.join('; ')}`);
        }
      }
    }
  } catch (_e) {}

  const segments = buildScript(record, top3Stats, audit);

  // Generate one MP3 per segment + combined for backward compat
  const segmentNames = ['intro', 'maps', 'website', 'mobile', 'outro'];
  const manifest = { businessName: name, slug, segments: {} };

  // Tier 2 #8 (locked 2026-05-27) — parallel TTS. The 5 segments are
  // independent (no shared state, no order dependency until concat). Running
  // them sequentially burned ~80s/lead × 48 leads = ~64 min/run waste. Parallel
  // = ~20s/lead total. Same guardrails (per-segment max duration) run after
  // all 5 complete; first violation throws and the lead fails fast (current
  // sequential behavior also threw on first violation; ordering of error vs
  // file-on-disk doesn't matter since concat hasn't happened yet).
  //
  // OpenAI rate limit: gpt-4o-mini-tts default = 500 RPM tier 1+; 5 parallel
  // requests per lead is well below. If you ever process multiple leads
  // concurrently (future Tier 3), revisit this.
  console.log(`   → Generating ${segmentNames.length} segments in parallel`);
  const results = await Promise.all(segmentNames.map(async (segName) => {
    const segPath = path.join(segmentDir, `${segName}.mp3`);
    await ttsToFile(segments[segName], segPath);
    const duration = await getMp3DurationSeconds(segPath);
    console.log(`     ✓ ${segName} = ${duration.toFixed(2)}s`);
    return { segName, segPath, duration };
  }));

  // ============================================================
  // POST-TTS DURATION GUARDRAILS (per-segment + total)
  // Each cap mirrors the locked decision in memory. Pipeline halts on
  // violation. NEVER relax without explicit Chris approval + memory update.
  // ============================================================
  // Per-segment audio length caps. Each cap = locked-design upper bound +
  // ~2s buffer for natural OpenAI TTS pacing variance. Word-count guard at
  // script-build time enforces the design target; this is the post-TTS
  // safety net for runaway durations.
  // 2026-05-18: intro raised 16→18s after LA Roof Masters intro came in
  // at 16.78s and tripped the guard, silently failing 6 of 12 Roofers renders.
  const SEGMENT_MAX = { intro: 18, maps: 52, website: 47, mobile: 42, outro: 32 };
  for (const { segName, segPath, duration } of results) {
    manifest.segments[segName] = {
      file: path.basename(segPath),
      durationSeconds: duration,
      text: segments[segName],
    };
    if (SEGMENT_MAX[segName] && duration > SEGMENT_MAX[segName]) {
      throw new Error(
        `[step-6 GUARDRAIL] ${segName} audio is ${duration.toFixed(2)}s (max ${SEGMENT_MAX[segName]}s). ` +
        `Cut ${segName} text in step-6-voiceover.mjs and re-run. ` +
        `Locked rules: feedback_intro_voiceover_13_15_seconds.md, project_video_pipeline_protocol.md`
      );
    }
  }

  // Build combined.mp3 by concatenating segment MP3s — ensures total duration = sum of segments
  const combinedPath = path.join(AUDIO_DIR, `${indexStr}_${slug}.mp3`);
  console.log(`   → Concatenating segments → ${combinedPath}`);
  await concatMp3Segments(segmentDir, segmentNames, combinedPath);
  manifest.combinedFile = path.basename(combinedPath);
  manifest.combinedDurationSeconds = await getMp3DurationSeconds(combinedPath);

  // Total combined duration guardrail — sum target is ~120-150s.
  // Cap at 165s so we don't ship 3+ min videos that lose cold-outreach attention.
  const TOTAL_MAX = 165;
  if (manifest.combinedDurationSeconds > TOTAL_MAX) {
    throw new Error(
      `[step-6 GUARDRAIL] Combined audio is ${manifest.combinedDurationSeconds.toFixed(2)}s (max ${TOTAL_MAX}s). ` +
      `Trim findings or shorten segment templates. ` +
      `Per-segment durations: ${Object.entries(manifest.segments).map(([n, d]) => `${n}=${d.durationSeconds.toFixed(1)}s`).join(', ')}`
    );
  }

  // Pipeline-freshness stamp — step-4 + step-5 read this to detect when audio
  // was regenerated without re-running combine + branding (a known pitfall —
  // see project_video_pipeline_protocol.md note 15). Wrote alongside manifest.
  manifest.pipelineStamp = {
    voiceoverGeneratedAt: new Date().toISOString(),
    voiceoverEpochMs: Date.now(),
    note: 'step-4 and step-5 MUST run AFTER this timestamp. step-6-voiceover-only re-runs break A/V sync.',
  };

  // Verification-state snapshot. Per feedback_verification_gates_must_be_strict.md
  // every absence-claim finding is gated on a verified flag. This snapshot
  // records what was/wasn't verified for this lead so the morning report
  // (and downstream consumers) can flag thin audits at a glance.
  manifest.verificationState = {
    website: {
      verified: audit?.website?.websiteAuditVerified === true,
      error: audit?.website?.error || null,
    },
    mobile: {
      verified: audit?.mobile?.mobileAuditVerified === true,
      error: audit?.mobile?.error || null,
    },
    gbp: {
      postsVerified: audit?.gbp?.postsVerified === true,
      descriptionVerified: audit?.gbp?.descriptionVerified === true,
      hoursVerified: audit?.gbp?.hoursVerified === true,
      socialProfilesVerified: audit?.gbp?.gbpSocialProfilesVerified === true,
      reviewsParsedCount: audit?.gbp?.reviewsParsedCount ?? 0,
    },
  };
  const totalSignals = 6;
  const verifiedCount = [
    manifest.verificationState.website.verified,
    manifest.verificationState.mobile.verified,
    manifest.verificationState.gbp.postsVerified,
    manifest.verificationState.gbp.descriptionVerified,
    manifest.verificationState.gbp.hoursVerified,
    manifest.verificationState.gbp.socialProfilesVerified,
  ].filter(Boolean).length;
  manifest.verificationState.summary = `${verifiedCount}/${totalSignals} signals verified`;
  console.log(`[step-6 verification-state] ${name}: ${verifiedCount}/${totalSignals} verified — ${JSON.stringify(manifest.verificationState)}`);

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

  const failures = [];
  for (let i = 0; i < limitedRows.length; i++) {
    try {
      await generateVoiceover(limitedRows[i], i, top3Stats, STEP2_BASENAME);
    } catch (err) {
      const leadName =
        normalizeField(limitedRows[i], 'businessName') ||
        normalizeField(limitedRows[i], 'slug') ||
        `row-${i + 1}`;
      console.error(`   ❌ Error generating voiceover ${i + 1} (${leadName}):`, err.message);
      failures.push({ lead: leadName, error: err.message });
    }
  }

  console.log('✅ Done generating test voiceover(s).');

  if (failures.length > 0) {
    console.error(`\n[step-6] ${failures.length} of ${limitedRows.length} lead(s) FAILED:`);
    for (const f of failures) {
      console.error(`   - ${f.lead}: ${f.error}`);
    }
    console.error(
      `\n[step-6] Exiting non-zero so the batch wrapper sees the failure ` +
      `(see memory: feedback_step6_must_propagate_failures.md).`,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error in step-6-voiceover:', err);
  process.exit(1);
});
