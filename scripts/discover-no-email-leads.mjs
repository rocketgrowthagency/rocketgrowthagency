#!/usr/bin/env node
// scripts/discover-no-email-leads.mjs
//
// One-off discovery pass: scan Airtable Leads + Leads No Email tables for
// records with no Email, run the step-2 search-fallback (SerpAPI + DDG + Bing
// with cross-reference scoring) on each, patch records that yield an email,
// and move "Leads No Email" → "Leads" when an email is found.
//
// Usage:
//   node scripts/discover-no-email-leads.mjs                 # process all
//   node scripts/discover-no-email-leads.mjs --limit 20      # cap at 20
//   node scripts/discover-no-email-leads.mjs --dry-run       # log only
//
// Env: AIRTABLE_API_KEY, AIRTABLE_BASE_ID, SERPAPI_KEY (required for full power)

import 'dotenv/config';
import axios from 'axios';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  AGGREGATOR_HOSTS, FREE_MAILBOX_RE,
  isLikelyEmail, businessNameTokens,
  siteHost: siteHostKey,
} = require('../lib/email-validation.cjs');
const { serpapiGetRateAware, serpapiHealthCheck } = require('../lib/serpapi-rate-aware.cjs');

const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID, SERPAPI_KEY } = process.env;
if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error('AIRTABLE_API_KEY + AIRTABLE_BASE_ID required');
  process.exit(1);
}
if (!SERPAPI_KEY) console.warn('⚠️  SERPAPI_KEY not set — only DDG/Bing fallbacks will run (low yield)');

const DRY = process.argv.includes('--dry-run');
const LIMIT_ARG = process.argv.find((a) => a.startsWith('--limit='))?.slice(8);
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG, 10) : Infinity;

// Resume-state file — script writes its last-processed recordId after each
// lead so a crash + re-run picks up where it left off. Save SerpAPI budget
// on long batches.
const STATE_FILE = path.join(process.cwd(), '.discover-state.json');
const RESUME_FROM_ARG = process.argv.find((a) => a.startsWith('--resume-from='))?.slice(14);
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { lastProcessedId: '', completedAt: null }; }
}
function saveState(lastId) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify({ lastProcessedId: lastId, updatedAt: new Date().toISOString() }, null, 2)); }
  catch {}
}

async function discoverEmail(siteHost, businessName, phone = '', searchTerm = '') {
  if (!siteHost && !businessName) return null;

  // Build query list — same as step-2
  const verticalCity = String(searchTerm || '').replace(/\s+in\s+/i, ' ').replace(/,?\s*CA\b/i, '').replace(/\s+/g, ' ').trim();
  const brandFirst2 = String(businessName || '').replace(/[^A-Za-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 2).join(' ');
  const queries = [];
  if (siteHost) queries.push(`"@${siteHost}"`);
  if (brandFirst2 && brandFirst2.length >= 3 && verticalCity) queries.push(`"${brandFirst2}" ${verticalCity}`);
  if (businessName) queries.push(`"${businessName}" email contact`);
  if (siteHost) queries.push(`"${siteHost}" email`);

  const phoneDigits = String(phone || '').replace(/\D/g, '');
  const phoneVariants = phoneDigits.length === 10 ? [
    phoneDigits,
    `(${phoneDigits.slice(0,3)}) ${phoneDigits.slice(3,6)}-${phoneDigits.slice(6)}`,
    `${phoneDigits.slice(0,3)}-${phoneDigits.slice(3,6)}-${phoneDigits.slice(6)}`,
  ] : [];

  const tokens = businessNameTokens(businessName);
  const bizLower = String(businessName || '').toLowerCase();

  function crossRef(email, responseText) {
    const local = email.split('@')[0].toLowerCase();
    const dom = email.split('@')[1].toLowerCase();
    if (siteHost && (dom === siteHost || dom.endsWith('.' + siteHost))) return { tier: 'auto-trust', rank: 10 };
    if (phoneVariants.length && phoneVariants.some((v) => responseText.includes(v))) return { tier: 'phone-match', rank: 15 };
    if (tokens.some((t) => local.includes(t))) return { tier: 'name-match', rank: 20 };
    if (bizLower && FREE_MAILBOX_RE.test(dom)) {
      const tl = responseText.toLowerCase();
      const eIdx = tl.indexOf(email.toLowerCase());
      const nIdx = tl.indexOf(bizLower);
      if (eIdx >= 0 && nIdx >= 0 && Math.abs(eIdx - nIdx) < 300) return { tier: 'proximity-free-mailbox', rank: 60 };
    }
    return null;
  }

  if (!SERPAPI_KEY) return null;
  const candidates = [];
  for (const q of queries) {
    const url = `https://serpapi.com/search?engine=google&q=${encodeURIComponent(q)}&api_key=${encodeURIComponent(SERPAPI_KEY)}&num=10&hl=en`;
    const res = await serpapiGetRateAware(url); // handles rate-limit + auto-resume
    if (!res) continue; // skip on transient errors
    const snippets = [];
    for (const o of res.data.organic_results || []) {
      const blob = [o.title || '', o.snippet || '', o.source || '', o.link || ''].join(' | ');
      if (blob.includes('@')) snippets.push(blob);
    }
    const ao = res.data.ai_overview;
    if (ao) {
      let aoText = '';
      if (Array.isArray(ao.text_blocks)) aoText = ao.text_blocks.map((b) => b.snippet || JSON.stringify(b)).join(' ');
      else if (ao.snippet) aoText = ao.snippet;
      if (aoText && aoText.includes('@')) snippets.push(aoText);
    }
    for (const snippet of snippets) {
      const matches = snippet.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
      for (const raw of matches) {
        const valid = isLikelyEmail(raw);
        if (!valid) continue;
        const cr = crossRef(valid, snippet);
        if (cr) candidates.push({ email: valid, ...cr });
      }
    }
    if (candidates.length) break;
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.rank - b.rank);
  return candidates[0];
}

// ----- Airtable helpers -----
async function fetchAirtablePage(table, params) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}?${new URLSearchParams(params).toString()}`;
  const res = await axios.get(url, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
  return res.data;
}

async function fetchAllNoEmail(table) {
  const formula = `OR({Email}='',{Email}=BLANK())`;
  let all = [];
  let offset;
  while (true) {
    const params = { filterByFormula: formula, pageSize: 100 };
    if (offset) params.offset = offset;
    const data = await fetchAirtablePage(table, params);
    all = all.concat(data.records || []);
    offset = data.offset;
    if (!offset) break;
  }
  return all;
}

async function patchEmail(table, recordId, email, tier) {
  if (DRY) return true;
  // Map tier → Email Source enum value (matches the singleSelect options created
  // 2026-05-20 EOD so the Airtable view can filter riskier proximity matches).
  const sourceMap = {
    'auto-trust': 'search-auto-trust',
    'phone-match': 'search-phone-match',
    'name-match': 'search-name-match',
    'proximity-free-mailbox': 'search-proximity',
  };
  const fields = { Email: email };
  if (tier && sourceMap[tier]) fields['Email Source'] = sourceMap[tier];
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}/${recordId}`;
  await axios.patch(url, { fields, typecast: true }, {
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' },
  });
  return true;
}

// ----- Main -----
async function main() {
  console.log(`[discover] starting${DRY ? ' (DRY-RUN)' : ''}${LIMIT < Infinity ? ' limit=' + LIMIT : ''}`);

  // SerpAPI plan visibility + early-bail if account exhausted
  await serpapiHealthCheck(SERPAPI_KEY, 'discover-no-email-leads');

  // Resume cursor — skip leads up to and including this ID
  const state = loadState();
  const resumeFromId = RESUME_FROM_ARG || state.lastProcessedId || '';
  let skipUntilFound = !!resumeFromId;
  if (resumeFromId) {
    console.log(`[discover] resume cursor: skipping leads up to and including ${resumeFromId}`);
  }

  // Skip leads marked terminal — don't reprocess permanently-excluded ones
  const SKIP_FUNNEL = new Set([
    'closed_deceased_owner', 'closed_bounced', 'closed_replied_no_interest',
    'no_website_no_email', 'closed_unsubscribed', 'converted',
  ]);

  for (const table of ['Leads', 'Leads No Email']) {
    let recs;
    try {
      recs = await fetchAllNoEmail(table);
    } catch (err) {
      console.warn(`[${table}] fetch failed (table may not have expected fields): ${err.message}`);
      continue;
    }
    console.log(`\n[${table}] ${recs.length} no-email records`);
    const eligible = recs.filter((r) => {
      const fs = r.fields['Funnel State'];
      return !fs || !SKIP_FUNNEL.has(fs);
    });
    console.log(`[${table}] ${eligible.length} eligible for discovery (after filter)`);

    let found = 0, skipped = 0, processed = 0;
    for (const r of eligible) {
      // Resume cursor — skip records until we pass the saved checkpoint
      if (skipUntilFound) {
        if (r.id === resumeFromId) { skipUntilFound = false; }
        continue;
      }
      if (processed >= LIMIT) break;
      processed++;
      const f = r.fields;
      const name = f['Business Name'] || '';
      const phone = f['Phone'] || '';
      const website = f['Discovered Website'] || f['Website'] || '';
      const searchTerm = f['Search Term'] || '';
      const siteHost = siteHostKey(website);

      const result = await discoverEmail(siteHost, name, phone, searchTerm);
      if (result) {
        found++;
        console.log(`  ✓ [${processed}/${eligible.length}] ${name.slice(0, 50).padEnd(50)} → ${result.email} (${result.tier})`);
        if (!DRY) await patchEmail(table, r.id, result.email, result.tier);
      } else {
        skipped++;
        if (processed % 20 === 0) console.log(`  · [${processed}/${eligible.length}] scanned ${processed}, found ${found}, no email yet`);
      }
      // Save resume state after every lead
      if (!DRY) saveState(r.id);
      // Brief delay to be polite to SerpAPI
      await new Promise((res) => setTimeout(res, 300));
    }
    console.log(`[${table}] DONE — processed ${processed}, found ${found} emails, skipped ${skipped}\n`);
  }
  // Clear resume state on successful completion
  if (!DRY) {
    try { fs.unlinkSync(STATE_FILE); } catch {}
  }
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1); });
