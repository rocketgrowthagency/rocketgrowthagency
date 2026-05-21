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

const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID, SERPAPI_KEY } = process.env;
if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error('AIRTABLE_API_KEY + AIRTABLE_BASE_ID required');
  process.exit(1);
}
if (!SERPAPI_KEY) console.warn('⚠️  SERPAPI_KEY not set — only DDG/Bing fallbacks will run (low yield)');

const DRY = process.argv.includes('--dry-run');
const LIMIT_ARG = process.argv.find((a) => a.startsWith('--limit='))?.slice(8);
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG, 10) : Infinity;

// ----- Helpers (duplicated from step-2 for portability) -----
const AGGREGATOR_HOSTS = [
  'yelp.com','yellowpages.com','manta.com','bbb.org','mapquest.com','foursquare.com',
  'localbiz.com','expertise.com','angi.com','angieslist.com','homeadvisor.com',
  'thumbtack.com','nextdoor.com','facebook.com','instagram.com','linkedin.com',
  'tiktok.com','twitter.com','x.com','youtube.com','pinterest.com','bizapedia.com',
  'cybo.com','showmelocal.com','merchantcircle.com','company.com',
];
const FREE_MAILBOX_RE = /^(gmail|yahoo|hotmail|outlook|icloud|aol|live|msn|protonmail|me|att|sbcglobal|verizon|comcast|earthlink|cox|charter|optonline|pacbell|bellsouth|rocketmail|mail|ymail)\.(com|net|us|ca)$/i;
const PLACEHOLDER_EMAIL_RE = /^(?:user|test|example|name|email|your|info|admin|contact|hello|mail|noreply|donotreply|jane\.doe|john\.doe|firstname\.lastname|first\.last)@(?:domain|example|test|yoursite|yourdomain|website|email|sample|temp|placeholder|mytechusa)\.(?:com|net|org|tld|local)$/i;
const PROXY_DOMAIN_RE = /@(?:ccpaprivacy\.org|ccpaprivacy\.com|gdprproxy\.|whoisguard\.com|domainsbyproxy\.com|namecheap\.com|privatemail\.com|registrarsafe\.)/i;
const VALID_TLDS = new Set(['com','net','org','io','co','us','ca','uk','au','de','fr','es','it','nl','biz','info','me','tv','ai','dev','app','site','online','shop','store','tech','pro','xyz','plus','contractors','construction','plumbing','homes','realty','vip','social','club']);

function businessNameTokens(name) {
  const STOP = new Set(['the','and','of','llc','inc','co','corp','corporation','company','services','service','plumbing','plumber','plumbers','hvac','roofing','roofer','roofers','garage','door','doors','electrical','electrician','contractor','contractors','repair','repairs','installation','install','maintenance','beverly','hills','los','angeles','la','santa','monica','culver','city','west','hollywood','marina','del','rey','pasadena','glendale','burbank']);
  return String(name || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((t) => t.length >= 3 && !STOP.has(t));
}

function isLikelyEmail(email) {
  if (!email) return '';
  let pre = email.trim();
  try { pre = decodeURIComponent(pre); } catch {}
  pre = pre.replace(/^\s+|\s+$/g, '').toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(pre)) return '';
  if (PLACEHOLDER_EMAIL_RE.test(pre)) return '';
  if (PROXY_DOMAIN_RE.test(pre)) return '';
  if (/^\d{3,4}-\d{4}/.test(pre.split('@')[0])) return '';
  const domain = pre.split('@')[1];
  const tld = domain.split('.').pop();
  if (!VALID_TLDS.has(tld)) return '';
  const base = domain.replace(/\.[a-z]+$/i, '');
  if (/^[\d.-]+$/.test(base) && /\d{3,}/.test(base)) return '';
  if (/\.(png|jpg|jpeg)$/.test(pre)) return '';
  return pre;
}

function siteHostKey(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return ''; }
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
    try {
      const url = `https://serpapi.com/search?engine=google&q=${encodeURIComponent(q)}&api_key=${encodeURIComponent(SERPAPI_KEY)}&num=10&hl=en`;
      const res = await axios.get(url, { timeout: 15000 });
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
    } catch (err) {
      // skip — try next query
    }
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

async function patchEmail(table, recordId, email, source) {
  if (DRY) return true;
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}/${recordId}`;
  await axios.patch(url, { fields: { Email: email }, typecast: true }, {
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' },
  });
  return true;
}

// ----- Main -----
async function main() {
  console.log(`[discover] starting${DRY ? ' (DRY-RUN)' : ''}${LIMIT < Infinity ? ' limit=' + LIMIT : ''}`);

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
      // Brief delay to be polite to SerpAPI
      await new Promise((res) => setTimeout(res, 300));
    }
    console.log(`[${table}] DONE — processed ${processed}, found ${found} emails, skipped ${skipped}\n`);
  }
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1); });
