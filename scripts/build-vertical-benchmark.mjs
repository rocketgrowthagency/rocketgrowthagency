#!/usr/bin/env node
// build-vertical-benchmark.mjs
//
// Generates a "Search Vertical Benchmark" JSON file for a given (search term).
// The benchmark is the empirical ground truth for that search — what categories,
// review counts, ratings, and engagement signals the top-ranked businesses
// actually have. step-6 reads this to gate findings, so we never tell a
// prospect "switch your category to X" when X is in fact what their successful
// competitors are NOT using.
//
// Build order:
//   1. Query Airtable Leads for this search term (rank 1-10 ideally).
//   2. Compute category distribution, review/rating distributions, engagement
//      benchmarks.
//   3. Decide which voiceover findings should be DISABLED for this search
//      based on what the top performers look like.
//   4. Write `data/vertical-benchmarks/<slug>.json` for step-6 to consume.
//
// Usage:
//   node scripts/build-vertical-benchmark.mjs "Garage door repair in Culver City, CA"
//   node scripts/build-vertical-benchmark.mjs --all       # rebuild every benchmark in Airtable
//
// Source:
//   - Default: Airtable Leads (must already contain ≥3 ranked records for the search)
//   - Future: SerpAPI fallback when Airtable empty (TODO)

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.dirname(__filename).replace(/\/scripts$/, '');
const OUT_DIR = path.join(REPO_ROOT, 'data', 'vertical-benchmarks');
fs.mkdirSync(OUT_DIR, { recursive: true });

const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID } = process.env;
if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error('AIRTABLE_API_KEY + AIRTABLE_BASE_ID required');
  process.exit(1);
}

// Vocabulary of category words that signal product-intent (supplier/dealer/store)
// vs service-intent (repair/service/installation). Used to detect when the
// `categoryServiceVsProduct` voiceover finding would give WRONG advice — i.e.
// when top performers use a "product" category despite a service-intent search.
const PRODUCT_CAT_WORDS = ['supplier', 'distributor', 'manufacturer', 'dealer', 'store', 'showroom', 'wholesaler'];
const SERVICE_CAT_WORDS = ['repair', 'service', 'installation', 'install', 'maintenance', 'replacement'];

function slugifySearch(searchTerm) {
  return String(searchTerm).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function percentile(arr, p) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.min(Math.floor(p * s.length), s.length - 1);
  return s[idx];
}

async function fetchAirtableLeads(searchTerm) {
  const formula = `AND({Search Term} = "${searchTerm.replace(/"/g, '\\"')}", {Map Rank} >= 1, {Map Rank} <= 10)`;
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Leads?filterByFormula=${encodeURIComponent(formula)}&sort[0][field]=Map Rank&sort[0][direction]=asc&maxRecords=20`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
  if (!res.ok) throw new Error(`Airtable lookup failed: ${res.status}`);
  const data = await res.json();
  return (data.records || []).map(r => r.fields);
}

function buildBenchmark(searchTerm, leads) {
  if (!leads.length) {
    return { searchTerm, error: 'No leads found in Airtable for this search', auditedDate: new Date().toISOString().slice(0, 10) };
  }

  // De-dupe by Map Rank (Airtable may have multiple records per rank from different scrape runs).
  // Keep the most-recent Date Scraped per rank.
  const byRank = new Map();
  for (const lead of leads) {
    const r = lead['Map Rank'];
    if (r == null) continue;
    const existing = byRank.get(r);
    const thisDate = lead['Date Scraped'] || '';
    if (!existing || thisDate > (existing['Date Scraped'] || '')) byRank.set(r, lead);
  }
  const top10 = [...byRank.entries()].sort((a, b) => a[0] - b[0]).map(([_, l]) => l).slice(0, 10);
  const top5 = top10.slice(0, 5);
  const top3 = top10.slice(0, 3);

  // Category distribution
  const catCountTop10 = {};
  for (const l of top10) {
    const c = (l['Category'] || '').trim() || '(none)';
    catCountTop10[c] = (catCountTop10[c] || 0) + 1;
  }
  const catCountTop5 = {};
  for (const l of top5) {
    const c = (l['Category'] || '').trim() || '(none)';
    catCountTop5[c] = (catCountTop5[c] || 0) + 1;
  }
  const catCountTop3 = {};
  for (const l of top3) {
    const c = (l['Category'] || '').trim() || '(none)';
    catCountTop3[c] = (catCountTop3[c] || 0) + 1;
  }
  function majority(catCount) {
    let best = null, n = 0;
    for (const [c, count] of Object.entries(catCount)) if (count > n) { best = c; n = count; }
    return best;
  }
  const majorityTop5 = majority(catCountTop5);
  const majorityTop3 = majority(catCountTop3);
  const majorityTop10 = majority(catCountTop10);

  // Review + rating distributions (top 10)
  const reviews = top10.map(l => l['Review Count']).filter(n => typeof n === 'number');
  const ratings = top10.map(l => l.Rating).filter(n => typeof n === 'number');
  const top3Reviews = top3.map(l => l['Review Count']).filter(n => typeof n === 'number');
  const top3Ratings = top3.map(l => l.Rating).filter(n => typeof n === 'number');

  // Decide which voiceover findings to disable for this search.
  // Rule 1: categoryServiceVsProduct
  //   The semantic finding fires when business category contains a PRODUCT word
  //   AND search term contains a SERVICE word. But if top-5 MAJORITY also uses
  //   a product-word category, then the semantic mismatch is industry-normal,
  //   not a real ranking issue. DISABLE the finding for that search.
  const findingsDisabled = [];
  const searchHasService = SERVICE_CAT_WORDS.some(w => searchTerm.toLowerCase().includes(w));
  const top5MajorityIsProduct = majorityTop5 ? PRODUCT_CAT_WORDS.some(w => majorityTop5.toLowerCase().includes(w)) : false;
  if (searchHasService && top5MajorityIsProduct) {
    findingsDisabled.push('categoryServiceVsProduct');
  }

  return {
    searchTerm,
    auditedDate: new Date().toISOString().slice(0, 10),
    source: 'airtable-leads',
    leadsAudited: top10.length,
    categoryDistributionTop10: catCountTop10,
    categoryDistributionTop5: catCountTop5,
    categoryDistributionTop3: catCountTop3,
    majorityCategoryTop10: majorityTop10,
    majorityCategoryTop5: majorityTop5,
    majorityCategoryTop3: majorityTop3,
    reviewsTop10: {
      min: reviews.length ? Math.min(...reviews) : null,
      max: reviews.length ? Math.max(...reviews) : null,
      median: median(reviews),
      p25: percentile(reviews, 0.25),
      p75: percentile(reviews, 0.75),
    },
    reviewsTop3Avg: top3Reviews.length ? Math.round(top3Reviews.reduce((a, b) => a + b, 0) / top3Reviews.length) : null,
    ratingTop10Median: median(ratings),
    ratingTop3Avg: top3Ratings.length ? Number((top3Ratings.reduce((a, b) => a + b, 0) / top3Ratings.length).toFixed(2)) : null,
    findingsDisabled,
    notes: findingsDisabled.includes('categoryServiceVsProduct')
      ? `"${majorityTop5}" is the dominant category in the top 5 of this search despite the search being service-intent. The semantic categoryServiceVsProduct finding is disabled to avoid giving prospects bad advice — telling them to switch categories that successful competitors actively use.`
      : null,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('Usage: node scripts/build-vertical-benchmark.mjs "<search term>"');
    console.error('   or: node scripts/build-vertical-benchmark.mjs --all');
    process.exit(1);
  }

  let searches = [];
  if (args[0] === '--all') {
    // Pull every distinct Search Term from Airtable Leads
    let offset = '';
    const all = new Set();
    while (true) {
      const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Leads?fields[]=Search Term&pageSize=100${offset ? `&offset=${offset}` : ''}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
      const d = await r.json();
      for (const rec of (d.records || [])) {
        const st = (rec.fields['Search Term'] || '').trim();
        if (st) all.add(st);
      }
      if (!d.offset) break;
      offset = d.offset;
    }
    searches = [...all];
  } else {
    searches = [args[0]];
  }

  for (const searchTerm of searches) {
    console.log(`\n=== ${searchTerm} ===`);
    try {
      const leads = await fetchAirtableLeads(searchTerm);
      const benchmark = buildBenchmark(searchTerm, leads);
      const slug = slugifySearch(searchTerm);
      const outPath = path.join(OUT_DIR, `${slug}.json`);
      fs.writeFileSync(outPath, JSON.stringify(benchmark, null, 2));
      console.log(`✓ Wrote ${outPath}`);
      console.log(`   leadsAudited=${benchmark.leadsAudited} majorityTop5="${benchmark.majorityCategoryTop5}" findingsDisabled=${JSON.stringify(benchmark.findingsDisabled)}`);
    } catch (e) {
      console.error(`✗ Failed: ${e.message}`);
    }
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
