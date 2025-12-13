import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import csvParser from 'csv-parser';
import OpenAI from 'openai';
import slugify from 'slugify';

const STEP1_DIR = path.join(process.cwd(), 'output', 'Step 1 (Maps Scraper)');
const STEP2_DIR = path.join(process.cwd(), 'output', 'Step 2 (Email Scraper)');
const VIDEOS_ROOT = path.join(process.cwd(), 'output', 'Step 3 (Video Recorder - Raw WebM)');
const AUDIO_ROOT = path.join(process.cwd(), 'output', 'Step 6 (Voiceover MP3)');

const MAX_RECORDINGS = 1;

function findLatestStep2Csv() {
  if (!fs.existsSync(STEP2_DIR)) {
    console.error(`Step 2 directory not found: ${STEP2_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(STEP2_DIR)
    .filter(f => f.toLowerCase().endsWith('.csv') && f.includes('[step-2]'));

  if (!files.length) {
    console.error(`No Step 2 CSV files found in: ${STEP2_DIR}`);
    process.exit(1);
  }

  files.sort();
  const latest = files[files.length - 1];
  const csvPath = path.join(STEP2_DIR, latest);
  const baseName = latest.replace(/\.csv$/i, '');

  return { csvPath, baseName };
}

const { csvPath: STEP2_CSV, baseName: STEP2_BASENAME } = findLatestStep2Csv();

const VIDEOS_DIR = path.join(VIDEOS_ROOT, STEP2_BASENAME);
const AUDIO_DIR = path.join(AUDIO_ROOT, STEP2_BASENAME);

if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

console.log(`Using Step 2 CSV: ${STEP2_CSV}`);
console.log(`Videos directory: ${VIDEOS_DIR}`);
console.log(`Audio will be saved under: ${AUDIO_DIR}`);

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY not set. Check your .env file.');
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

function normalizeField(record, key) {
  return (record[key] || record[key.toLowerCase()] || '').toString().trim();
}

function parseNumber(val) {
  if (!val) return null;
  const num = Number(String(val).replace(/,/g, '').trim());
  return Number.isFinite(num) ? num : null;
}

async function loadTop3Stats(baseName) {
  const step1BaseName = baseName.replace('[step-2]', '[step-1]');
  const step1CsvPath = path.join(STEP1_DIR, `${step1BaseName}.csv`);

  if (!fs.existsSync(step1CsvPath)) {
    console.warn(`Step 1 CSV not found for top-3 stats: ${step1CsvPath}`);
    return null;
  }

  const rows = [];

  await new Promise((resolve, reject) => {
    fs.createReadStream(step1CsvPath)
      .pipe(csvParser())
      .on('data', row => rows.push(row))
      .on('end', resolve)
      .on('error', reject);
  });

  const top3Rows = rows.filter(row => {
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
    reviewsMax
  };

  console.log('Top-3 stats from Step 1:', stats);
  return stats;
}

function buildScript(record, top3Stats) {
  const name = normalizeField(record, 'Business Name') || 'your business';
  const city = normalizeField(record, 'City') || '';
  const rankRaw =
    normalizeField(record, 'Map Rank') || normalizeField(record, 'rank');
  const rating = normalizeField(record, 'Rating');
  const reviews = normalizeField(record, 'Reviews');
  const searchTerm =
    normalizeField(record, 'Search Term') || 'your type of business near you';

  let top3Sentence = '';
  if (top3Stats) {
    const { ratingMin, ratingMax, reviewsMin, reviewsMax } = top3Stats;
    top3Sentence = `In the same search, the top 3 map results are around ${ratingMin.toFixed(
      1
    )}–${ratingMax.toFixed(1)} stars with roughly ${reviewsMin}–${reviewsMax} reviews.`;
  }

  const parts = [
    `Hey, this is Chris from Rocket Growth Agency.`,
    `I recorded this short walkthrough for ${name} to highlight where you may be losing potential leads (and more revenue) because you’re not fully optimized on Google Maps and on your website, and to show you the key improvements we’d make to fix that.`,
    `On screen, you’re seeing exactly what a potential customer sees when they look you up on Google — first your Google Maps listing, then your website.`,
    `Right now, when we search “${searchTerm}” in the ${city || 'local'} area, you’re showing up around number ${rankRaw ||
      'your current position'} in the Google Maps results. In most markets, the top three “map pack” positions grab a majority of the attention — often around 40–60% of the clicks and calls from local searches.`,
    `You’re currently at about ${rating || 'your current'} stars with roughly ${reviews ||
      'your current'} reviews.${top3Sentence ? ` ${top3Sentence}` : ''}`,
    `From there, we also look at your website, because Google uses your website as one of the signals it considers when deciding where to rank your business in Maps.`,
    `For an optimized website, Google looks at things like how quickly the site loads, what a new visitor sees immediately above the fold, how visible and clickable your main call-to-action is, and whether your name, address, phone number, and service area match your Google Business Profile.`,
    `If you’d like a fuller audit that scores these areas, including an additional channel and lead-mix overview, and shows every key place you can improve — along with what we’d actually do to fix them — you can request our Free Growth Audit Report.`
  ];

  return parts.join(' ');
}

async function generateVoiceover(record, index, top3Stats) {
  const name = normalizeField(record, 'Business Name') || 'business';
  const email = normalizeField(record, 'email');

  if (!email) {
    return null;
  }

  const slug =
    slugify(name, { lower: true, strict: true }) || `contact-${index + 1}`;
  const fileName = `${String(index + 1).padStart(2, '0')}_${slug}.mp3`;
  const outPath = path.join(AUDIO_DIR, fileName);

  console.log(`▶ Voiceover ${index + 1}: ${name} (email: ${email})`);
  console.log(`   → Generating audio: ${outPath}`);

  const script = buildScript(record, top3Stats);

  const response = await openai.audio.speech.create({
    model: 'gpt-4o-mini-tts',
    voice: 'echo',
    input: script,
    format: 'mp3',
    speed: 1.2
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outPath, buffer);
  console.log(`   ✓ Saved audio: ${outPath}`);

  return outPath;
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
      .on('data', row => {
        rows.push(row);
      })
      .on('end', resolve)
      .on('error', reject);
  });

  console.log(`Loaded ${rows.length} rows from Step 2 CSV.`);

  const rowsWithEmail = rows.filter(r => normalizeField(r, 'email'));
  if (!rowsWithEmail.length) {
    console.log('No rows with email found. Nothing to do.');
    return;
  }

  const limitedRows = rowsWithEmail.slice(0, MAX_RECORDINGS);

  for (let i = 0; i < limitedRows.length; i++) {
    try {
      await generateVoiceover(limitedRows[i], i, top3Stats);
    } catch (err) {
      console.error(`   ❌ Error generating voiceover ${i + 1}:`, err.message);
    }
  }

  console.log('✅ Done generating test voiceover(s).');
}

main().catch(err => {
  console.error('Fatal error in step-4-voiceover:', err);
});
