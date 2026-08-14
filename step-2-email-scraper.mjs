import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import csvParser from 'csv-parser';
import { createObjectCsvWriter } from 'csv-writer';
import axios from 'axios';
import * as cheerio from 'cheerio';
// Shared helpers — extracted 2026-05-20 EOD to lib/ to eliminate DRY drift.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  AGGREGATOR_HOSTS,
  FREE_MAILBOX_RE,
  PLACEHOLDER_EMAIL_RE,
  PROXY_DOMAIN_RE,
  VALID_TLDS,
  sanitizeScrapedEmail,
  isLikelyEmail,
  businessNameTokens,
  siteHost: siteHostKey,
  emailRank,
} = require('./lib/email-validation.cjs');
const { serpapiGetRateAware, serpapiHealthCheck } = require('./lib/serpapi-rate-aware.cjs');

const STEP1_DIR = path.join(process.cwd(), 'output', 'Step 1');
const STEP2_DIR = path.join(process.cwd(), 'output', 'Step 2');

function findLatestStep1Csv() {
  if (!fs.existsSync(STEP1_DIR)) {
    console.error(`Step 1 directory not found: ${STEP1_DIR}`);
    process.exit(1);
  }

  // `let`, not `const` — the search-scoping block below REASSIGNS this. Declared const on 2026-08-12
  // (623ab59) it threw "TypeError: Assignment to constant variable." on the first line of step-2 and
  // killed the 08-12 AND 08-13 nights outright: 0 leads, 0 videos, no report, twice.
  let files = fs
    .readdirSync(STEP1_DIR)
    .filter((f) => f.toLowerCase().endsWith('.csv') && f.includes('[step-1]'));

  if (!files.length) {
    console.error(`No Step 1 CSV files found in: ${STEP1_DIR}`);
    process.exit(1);
  }

  // 2026-08-11 — PREFER THE FILE THAT BELONGS TO THIS RUN'S SEARCH. Picking purely by mtime is the same
  // anti-pattern that cost a whole night on the overnight side: any stray step-1 CSV (a manual per-lead
  // run, another vertical) that happens to be newest silently becomes this scrape's input, and every
  // downstream stage then works on the wrong business. When the caller tells us the search (SEARCH_QUERY,
  // exported by overnight-pipeline.sh), narrow to files whose name carries that slug FIRST.
  // See feedback_pipeline_must_own_its_inputs.md.
  const _searchSlug = String(process.env.SEARCH_QUERY || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (_searchSlug) {
    // Also exclude PER-LEAD files ("<slug>-only-<search>-[step-1].csv"). They carry the search slug too,
    // so slug-scoping alone still lets a single-lead artifact masquerade as the night's master scrape —
    // which is exactly the file that hijacked 2026-08-11.
    const scoped = files.filter((f) => f.toLowerCase().includes(_searchSlug) && !f.toLowerCase().includes('-only-'));
    if (scoped.length) {
      files = scoped;
    } else {
      console.warn(`[step-2] no Step 1 CSV matches search "${process.env.SEARCH_QUERY}" — refusing to fall back to an unrelated newest file.`);
      process.exit(1);
    }
  }

  // Sort by file mtime so the TRUE most-recent scrape wins even when
  // multiple scrapes share the same date prefix (e.g. plumbers + hvac
  // same day — alpha sort would pick plumbers over hvac).
  files.sort((a, b) => {
    const aMtime = fs.statSync(path.join(STEP1_DIR, a)).mtimeMs;
    const bMtime = fs.statSync(path.join(STEP1_DIR, b)).mtimeMs;
    return aMtime - bMtime;
  });
  const latest = files[files.length - 1];
  const inputPath = path.join(STEP1_DIR, latest);
  const step2BaseName = latest.replace('[step-1]', '[step-2]');
  const outputPath = path.join(STEP2_DIR, step2BaseName);

  console.log(`Using Step 1 CSV: ${inputPath}`);
  console.log(`Will write Step 2 CSV: ${outputPath}`);

  return { inputPath, outputPath };
}

const { inputPath: INPUT_CSV, outputPath: OUTPUT_CSV } = findLatestStep1Csv();

function cleanUrl(url) {
  if (!url) return '';
  const trimmed = url.trim().replace(/^"|"$/g, '');
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (
    lower === 'nan' ||
    lower === 'undefined' ||
    lower === 'null' ||
    lower === '#ref!' ||
    lower === '#n/a'
  ) {
    return '';
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (/^mailto:/i.test(trimmed) || /^tel:/i.test(trimmed)) {
    return '';
  }
  if (/^www\./i.test(trimmed) || /^[a-z0-9.-]+\.[a-z]{2,}/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return '';
}


function extractEmailFromJsonLd($) {
  let email = '';

  function findEmailInObject(obj) {
    if (!obj || email) return;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (email) break;
        findEmailInObject(item);
      }
      return;
    }
    if (typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        if (email) break;
        if (typeof value === 'string' && key.toLowerCase() === 'email') {
          const maybe = isLikelyEmail(value);
          if (maybe) {
            email = maybe;
            break;
          }
        }
        if (value && (typeof value === 'object' || Array.isArray(value))) {
          findEmailInObject(value);
        }
      }
    }
  }

  $('script[type="application/ld+json"]').each((_, el) => {
    if (email) return;
    const raw = $(el).contents().text() || $(el).text();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      findEmailInObject(parsed);
    } catch {
      return;
    }
  });

  return email;
}

function extractObfuscatedEmailFromText(text) {
  if (!text) return '';
  let normalized = text;

  normalized = normalized.replace(/\s*\[\s*at\s*\]|\s*\(\s*at\s*\)\s*/gi, '@');
  normalized = normalized.replace(/\sat\s/gi, '@');

  normalized = normalized.replace(/\s*\[\s*dot\s*\]|\s*\(\s*dot\s*\)\s*/gi, '.');
  normalized = normalized.replace(/\sdot\s/gi, '.');

  const match = normalized.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (match) {
    const valid = isLikelyEmail(match[0]);
    if (valid) return valid;
  }
  return '';
}

function extractFromHtml(html, siteHost = '') {
  const $ = cheerio.load(html);
  let facebook = '';
  let instagram = '';
  let linkedin = '';
  let twitter = '';
  let youtube = '';
  let tiktok = '';
  let email = '';

  $('a[href]').each((_, el) => {
    const hrefRaw = $(el).attr('href');
    if (!hrefRaw) return;
    const href = hrefRaw.trim();

    if (!facebook && /facebook\.com\/[^/?#]/i.test(href) && !/facebook\.com\/sharer/i.test(href)) {
      facebook = href;
    }
    if (!instagram && /instagram\.com\/[^/?#]/i.test(href)) {
      instagram = href;
    }
    if (!linkedin && /linkedin\.com\/(company|in|school)\/[^/?#]/i.test(href)) {
      linkedin = href;
    }
    if (!twitter && /(twitter\.com|x\.com)\/[^/?#]/i.test(href) && !/intent\/tweet/i.test(href)) {
      twitter = href;
    }
    if (!youtube && /youtube\.com\/(channel|c|user|@)[^/?#]/i.test(href)) {
      youtube = href;
    }
    if (!tiktok && /tiktok\.com\/@[^/?#]/i.test(href)) {
      tiktok = href;
    }

    if (!email && href.toLowerCase().startsWith('mailto:')) {
      const mail = href.replace(/^mailto:/i, '').split('?')[0];
      const valid = isLikelyEmail(mail);
      if (valid) email = valid;
    }
  });

  if (!email) {
    const jsonLdEmail = extractEmailFromJsonLd($);
    if (jsonLdEmail) {
      email = jsonLdEmail;
    }
  }

  if (!email) {
    // Pull ALL emails from visible text + rank by domain preference vs siteHost.
    // Locked 2026-05-20 — Cool Choice HVAC homepage had both 'micah@micahrich.com'
    // (dev credit) AND 'service@coolchoicehvac.com' (real business email). First-
    // match-wins picked the dev. Now collect all, rank, prefer domain match.
    const text = $.root().text();
    const allMatches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
    const validList = [];
    for (const m of allMatches) {
      const v = isLikelyEmail(m);
      if (v && !validList.includes(v)) validList.push(v);
    }
    if (validList.length > 0) {
      validList.sort((a, b) => emailRank(a, siteHost) - emailRank(b, siteHost));
      email = validList[0];
    }
    if (!email) {
      const obfuscated = extractObfuscatedEmailFromText(text);
      if (obfuscated) {
        email = obfuscated;
      }
    }
  }

  // Deep-scan fallbacks (locked 2026-05-20 after Sunset West Plumbing case —
  // visible contact form with no email anywhere in body text, but some sites
  // still leak the address in hidden inputs, data-attributes, inline scripts,
  // form action URLs, or CSS content rules).
  if (!email) {
    // 1. Hidden form inputs — older WordPress / custom forms ship a
    //    `<input type="hidden" name="recipient_email" value="info@biz.com">`.
    $('input[type="hidden"], input[name*="email" i], input[name*="recipient" i], input[name*="mail" i]').each((_, el) => {
      if (email) return;
      const val = ($(el).attr('value') || '').trim();
      if (val && val.includes('@')) {
        const valid = isLikelyEmail(val);
        if (valid) email = valid;
      }
    });
  }
  if (!email) {
    // 2. data-* attributes on any element — `<button data-email="...">` etc.
    $('[data-email], [data-recipient], [data-contact-email], [data-mail], [data-to]').each((_, el) => {
      if (email) return;
      for (const attr of ['data-email', 'data-recipient', 'data-contact-email', 'data-mail', 'data-to']) {
        const v = ($(el).attr(attr) || '').trim();
        if (v && v.includes('@')) {
          const valid = isLikelyEmail(v);
          if (valid) { email = valid; return; }
        }
      }
    });
  }
  if (!email) {
    // 3. Form action="mailto:..." (rare but trivial)
    $('form[action^="mailto:" i], form[action*="mailto:" i]').each((_, el) => {
      if (email) return;
      const action = ($(el).attr('action') || '').trim();
      const m = action.match(/mailto:([^?]+)/i);
      if (m) {
        const valid = isLikelyEmail(m[1]);
        if (valid) email = valid;
      }
    });
  }
  if (!email) {
    // 4. Inline <script> content — JSON config blobs, JS variables, etc.
    //    Pull email-shaped strings from quoted contexts only (avoid arbitrary
    //    matches in minified libraries).
    $('script:not([src])').each((_, el) => {
      if (email) return;
      const code = $(el).html() || '';
      // Quoted email pattern: "info@biz.com" or 'info@biz.com'
      const m = code.match(/["']([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})["']/i);
      if (m) {
        const valid = isLikelyEmail(m[1]);
        if (valid) email = valid;
      }
    });
  }
  if (!email) {
    // 5. CSS `content:` rules — some sites obfuscate by rendering email
    //    via `.email::before { content: "info@biz.com" }`.
    $('style').each((_, el) => {
      if (email) return;
      const css = $(el).html() || '';
      const m = css.match(/content\s*:\s*["']([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})["']/i);
      if (m) {
        const valid = isLikelyEmail(m[1]);
        if (valid) email = valid;
      }
    });
  }
  if (!email) {
    // 6. RAW HTML "Ctrl+F" scan — last-resort fallback. Catches emails the
    //    parsed-DOM extractors miss: HTML comments, <noscript> blocks,
    //    HTML-entity escaped forms, exotic attribute combinations, etc.
    //    Locked 2026-05-20 (Chris's "command-F on source code" request).
    //
    //    Two passes: literal `@` pattern, then HTML-entity-decoded variant.
    let candidates = [];
    const literalRe = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
    let m;
    while ((m = literalRe.exec(html)) !== null) candidates.push(m[0]);
    // HTML-entity decode common forms (@ → &#64; / &#x40;, . → &#46; / &#x2e;)
    const decoded = String(html)
      .replace(/&#64;/g, '@')
      .replace(/&#x40;/gi, '@')
      .replace(/&#46;/g, '.')
      .replace(/&#x2e;/gi, '.')
      .replace(/&amp;/g, '&');
    if (decoded !== html) {
      while ((m = literalRe.exec(decoded)) !== null) candidates.push(m[0]);
    }
    // Pick the FIRST candidate that passes isLikelyEmail. Domain-rank logic
    // in fetchWebsiteData handles cross-page preference; here we just need
    // ANY valid email from this page's raw source.
    for (const c of candidates) {
      const valid = isLikelyEmail(c);
      if (valid) { email = valid; break; }
    }
  }

  return { facebook, instagram, linkedin, twitter, youtube, tiktok, email };
}

function buildFallbackUrls(baseUrl) {
  const urls = [];
  const clean = cleanUrl(baseUrl);
  if (!clean) return urls;
  try {
    const u = new URL(clean);
    const origin = u.origin.replace(/\/+$/, '');
    // Legal pages frequently expose privacy@/legal@/dpo@ contact emails due
    // to GDPR/CCPA compliance requirements. Added 2026-05-20.
    const paths = ['contact', 'contact-us', 'about', 'privacy', 'privacy-policy', 'terms', 'terms-of-service', 'legal'];
    for (const p of paths) {
      urls.push(`${origin}/${p}`);
    }
  } catch {
    return [];
  }
  return urls;
}

async function discoverEmailViaSearch(siteHost, businessName, phone = '', searchTerm = '') {
  if (!siteHost && !businessName) return '';
  const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  // Extract vertical + city from searchTerm (e.g. "HVAC in Beverly Hills CA" → "HVAC Beverly Hills")
  // Used for the parent-brand DBA query variant (Cool Choice HVAC, Green Future HVAC pattern).
  // Locked 2026-05-20 after Cool Choice + Green Heating BH cases where the GBP-listed
  // name is "<Brand> Heating & AC Repair <City>" but the website lives at `<brand>hvac.com`.
  const verticalCity = String(searchTerm || '')
    .replace(/\s+in\s+/i, ' ')
    .replace(/,?\s*CA\b/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  // First 2 words of business name — the "brand" portion before vertical descriptors.
  // For "Cool Choice Heating & AC Repair Beverly Hills" → "Cool Choice"
  const brandFirst2 = String(businessName || '')
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 2)
    .join(' ');

  // Build query list — try domain-anchored first (most precise), then brand+vertical, then full name.
  const queries = [];
  if (siteHost) queries.push(`"@${siteHost}"`);
  if (brandFirst2 && brandFirst2.length >= 3 && verticalCity) queries.push(`"${brandFirst2}" ${verticalCity}`);
  if (businessName) queries.push(`"${businessName}" email contact`);
  if (siteHost) queries.push(`"${siteHost}" email`);

  // Normalize the GBP phone for cross-reference matching (digits only, then with formatting variants).
  const phoneDigits = String(phone || '').replace(/\D/g, '');
  const phoneVariants = phoneDigits.length === 10 ? [
    phoneDigits,
    `(${phoneDigits.slice(0,3)}) ${phoneDigits.slice(3,6)}-${phoneDigits.slice(6)}`,
    `${phoneDigits.slice(0,3)}-${phoneDigits.slice(3,6)}-${phoneDigits.slice(6)}`,
    `${phoneDigits.slice(0,3)}.${phoneDigits.slice(3,6)}.${phoneDigits.slice(6)}`,
  ] : [];

  const tokens = businessNameTokens(businessName);
  const bizLower = String(businessName || '').toLowerCase();

  // Free-mailbox domains — personal addresses where local-part is the only
  // identifying signal. PROXIMITY tier accepts these (owner often uses gmail).
  // Other domains require domain-match or name-match (no proximity acceptance)
  // — locked 2026-05-20 after Royale Plumbing CA search returned the Canada
  // branch's info@royaleplumbing.ca (different business, would have been false-
  // positive under bare proximity logic).
  const FREE_MAILBOX_RE = /^(gmail|yahoo|hotmail|outlook|icloud|aol|live|msn|protonmail|me|att|sbcglobal|verizon|comcast|earthlink|cox|charter|optonline|pacbell|bellsouth|rocketmail|mail|ymail)\.(com|net|us|ca)$/i;

  // Cross-reference scoring against the raw response text
  function crossRef(email, responseText) {
    const localPart = email.split('@')[0].toLowerCase();
    const emailDomain = email.split('@')[1].toLowerCase();
    // AUTO-TRUST: domain match
    if (siteHost && (emailDomain === siteHost || emailDomain.endsWith('.' + siteHost))) {
      return { ok: true, tier: 'auto-trust', rank: 10 };
    }
    // PHONE-MATCH: same snippet contains the GBP phone (strongest non-domain signal).
    // Locked 2026-05-20 — Chris's manual verification flow proves phone is the
    // single most reliable disambiguator for parent-brand DBA cases like Green
    // Heating BH → Green Future HVAC (different brand, same phone confirms identity).
    if (phoneVariants.length) {
      const hasPhone = phoneVariants.some((v) => responseText.includes(v));
      if (hasPhone) return { ok: true, tier: 'phone-match', rank: 15 };
    }
    // NAME-MATCH: local-part contains a distinctive name token
    if (tokens.some((t) => localPart.includes(t))) {
      return { ok: true, tier: 'name-match', rank: 20 };
    }
    // PROXIMITY: business name within 300 chars of email AND email is a
    // free-mailbox (owner's personal). Refuses different-brand domains that
    // happen to be near the name (the Royale Plumbing .ca branch case).
    if (bizLower && FREE_MAILBOX_RE.test(emailDomain)) {
      const txtLower = responseText.toLowerCase();
      const emailIdx = txtLower.indexOf(email.toLowerCase());
      const nameIdx = txtLower.indexOf(bizLower);
      if (emailIdx >= 0 && nameIdx >= 0 && Math.abs(emailIdx - nameIdx) < 300) {
        return { ok: true, tier: 'proximity-free-mailbox', rank: 60 };
      }
    }
    return { ok: false, tier: 'no-cross-ref', rank: 999 };
  }

  // Try SerpAPI first (preferred — returns structured organic_results + answer_box)
  const serpKey = process.env.SERPAPI_KEY;
  const candidates = []; // [{ email, tier, rank, source }]

  if (serpKey) {
    for (const q of queries) {
      try {
        const url = `https://serpapi.com/search?engine=google&q=${encodeURIComponent(q)}&api_key=${encodeURIComponent(serpKey)}&num=10&hl=en`;
        const res = await serpapiGetRateAware(url);
        if (!res) continue;
        // Build per-result snippet pool — each snippet is ~150-300 chars naturally,
        // so proximity check works correctly within a snippet (the att.net case).
        // Locked 2026-05-20: stringifying the whole JSON response broke proximity
        // because email + business name lived in DIFFERENT organic_results entries.
        const snippets = [];
        for (const o of res.data.organic_results || []) {
          const blob = [o.title || '', o.snippet || '', o.source || '', o.link || ''].join(' | ');
          if (blob.includes('@')) snippets.push(blob);
        }
        // AI Overview (when present) — separate text block
        const ao = res.data.ai_overview;
        if (ao) {
          let aoText = '';
          if (Array.isArray(ao.text_blocks)) {
            aoText = ao.text_blocks.map((b) => b.snippet || JSON.stringify(b)).join(' ');
          } else if (ao.snippet) {
            aoText = ao.snippet;
          }
          if (aoText && aoText.includes('@')) snippets.push(aoText);
        }
        // Answer box too
        const ab = res.data.answer_box;
        if (ab && JSON.stringify(ab).includes('@')) snippets.push(JSON.stringify(ab));

        for (const snippet of snippets) {
          const matches = snippet.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
          for (const raw of matches) {
            const valid = isLikelyEmail(raw);
            if (!valid) continue;
            const cr = crossRef(valid, snippet); // PER-SNIPPET proximity
            if (cr.ok) candidates.push({ email: valid, ...cr, source: `serpapi:${q.slice(0, 50)}` });
          }
        }
      } catch (err) {
        console.log(`   [email-search:serpapi] ${err.message || err}`);
      }
      if (candidates.length) break;
    }
  }

  // Fallback: DDG HTML + Bing HTML if SerpAPI didn't yield
  if (!candidates.length) {
    for (const q of queries) {
      for (const engine of ['ddg', 'bing']) {
        try {
          const url = engine === 'ddg'
            ? `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`
            : `https://www.bing.com/search?q=${encodeURIComponent(q)}`;
          const res = await axios.get(url, {
            timeout: 12000,
            headers: { 'User-Agent': ua, 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
            validateStatus: (s) => s >= 200 && s < 400,
          });
          if (res.status !== 200) continue;
          const html = String(res.data);
          const matches = html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
          for (const raw of matches) {
            const valid = isLikelyEmail(raw);
            if (!valid) continue;
            const cr = crossRef(valid, html);
            if (cr.ok) candidates.push({ email: valid, ...cr, source: `${engine}:${q.slice(0, 50)}` });
          }
          if (candidates.length) break;
        } catch (err) {
          console.log(`   [email-search:${engine}] ${err.message || err}`);
        }
      }
      if (candidates.length) break;
    }
  }

  if (!candidates.length) {
    console.log(`   [email-search] no cross-referenced email found for "${businessName}" (${siteHost})`);
    return '';
  }

  // Pick lowest rank (best cross-reference tier)
  candidates.sort((a, b) => a.rank - b.rank);
  const best = candidates[0];
  console.log(`   [email-search] discovered ${best.email} for "${businessName}" via ${best.source} — tier=${best.tier} (rank ${best.rank})`);
  return best.email;
}

async function fetchWebsiteData(url, businessName = '', ctxPhone = '', ctxSearchTerm = '') {
  const cleanWebsite = cleanUrl(url);
  const EMPTY = { facebook: '', instagram: '', linkedin: '', twitter: '', youtube: '', tiktok: '', email: '' };
  if (!cleanWebsite) return EMPTY;

  const siteHost = siteHostKey(cleanWebsite);
  const candidates = [cleanWebsite, ...buildFallbackUrls(cleanWebsite)];
  const seen = new Set();
  const combined = { ...EMPTY };
  // Collect ALL email candidates across pages — pick best at the end.
  // Locked 2026-05-20: never break early on first email hit; the homepage
  // commonly ships a stray free-mailbox email in JSON-LD or footer that
  // gets picked up before /contact's real business address loads.
  const emailCandidates = []; // [{ email, page }]

  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      const response = await axios.get(candidate, { timeout: 10000 });
      const found = extractFromHtml(response.data, siteHost);
      // Socials + non-email fields: first-hit-wins is fine.
      for (const k of Object.keys(EMPTY)) {
        if (k === 'email') continue;
        if (!combined[k] && found[k]) combined[k] = found[k];
      }
      if (found.email) emailCandidates.push({ email: found.email, page: candidate });
      const socials = ['facebook','instagram','linkedin','twitter','youtube','tiktok'].filter(s => found[s]).join(',');
      console.log(`Scanned ${candidate} -> Email: ${found.email || ''}, Socials: ${socials || 'none'}`);
    } catch (err) {
      console.log(`Failed to fetch ${candidate}: ${err.message}`);
    }
  }

  // Pick best email by rank — lower is better. Stable on ties (homepage first).
  if (emailCandidates.length) {
    emailCandidates.sort((a, b) => emailRank(a.email, siteHost) - emailRank(b.email, siteHost));
    combined.email = emailCandidates[0].email;
    if (emailCandidates.length > 1) {
      const losers = emailCandidates.slice(1).map((c) => `${c.email} (${c.page})`).join(', ');
      console.log(`[email-rank] picked ${combined.email} from ${emailCandidates[0].page} (rank ${emailRank(combined.email, siteHost)}); rejected: ${losers}`);
    }
  }

  // LAST-RESORT: external search-engine discovery when site-scrape yielded nothing.
  // Locked 2026-05-20 — feedback_email_via_external_search.md.
  // Catches emails surfaced from Facebook / Yelp / press releases / AI Overview
  // that don't appear on the brand site itself (Mr. Speedy Plumbing case).
  if (!combined.email && (siteHost || businessName)) {
    try {
      const discovered = await discoverEmailViaSearch(siteHost, businessName, ctxPhone, ctxSearchTerm);
      if (discovered) combined.email = discovered;
    } catch (err) {
      console.log(`   [email-search] uncaught: ${err.message || err}`);
    }
  }

  // 2026-06-15 — SMTP MAILBOX VERIFICATION. Catches "passes MX but the mailbox
  // doesn't exist" hard bounces — the gap that auto-paused outreach Jun 4 (7
  // bounces / 134 sends = 5.2% > Gmail's 5% RED line). FAIL OPEN: only DROP on a
  // definitive 5xx mailbox rejection; greylist / catch-all / timeout / no-MX all
  // keep the lead. Disable with VERIFY_MAILBOX=0. See lib/verify-mailbox.cjs +
  // feedback_email_mailbox_verification.md.
  if (combined.email && process.env.VERIFY_MAILBOX !== '0') {
    try {
      const { verifyMailbox } = await import('./lib/verify-mailbox.cjs');
      const v = await verifyMailbox(combined.email);
      if (v.result === 'invalid') {
        console.log(`   [verify-mailbox] DROP ${combined.email} — undeliverable mailbox (code ${v.code}); lead will not be emailed.`);
        combined.emailUndeliverable = combined.email;
        combined.emailSkipReason = `undeliverable-mailbox:${v.code}`;
        combined.email = '';
      } else {
        console.log(`   [verify-mailbox] ${v.result}${v.code ? ' (' + v.code + ')' : ''} — keeping ${combined.email}`);
      }
    } catch (err) {
      console.log(`   [verify-mailbox] check failed (non-fatal, keeping email): ${err.message}`);
    }
  }

  return combined;
}

async function processCsv() {
  if (!fs.existsSync(INPUT_CSV)) {
    console.error(`Input CSV file not found: ${INPUT_CSV}`);
    process.exit(1);
  }
  if (!fs.existsSync(STEP2_DIR)) fs.mkdirSync(STEP2_DIR, { recursive: true });

  // Load all records first — avoids the async-in-on('end') race condition
  const records = await new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(INPUT_CSV)
      .pipe(csvParser())
      .on('data', (d) => rows.push(d))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });

  console.log(`Loaded ${records.length} records from CSV.`);

  // 2026-06-03 — CROSS-SEARCH DEDUP. Preload all existing Airtable emails +
  // Place IDs. When step-2 discovers an email for a candidate, check against
  // the index — if already in Airtable from a PRIOR search, skip the entire
  // pipeline for that lead AND patch the existing record with the new
  // appearance (search term, city, rank, date). Captures regional-dominator
  // data without re-emailing the prospect.
  // Memory: feedback_dedup_by_email_with_intel_capture.md.
  let dedupIndex = null;
  let dedupHits = 0;
  try {
    const { preloadDedupIndex } = await import('./lib/dedup-by-email.mjs');
    dedupIndex = await preloadDedupIndex({ verbose: true });
  } catch (err) {
    console.warn(`[dedup] preload failed (non-fatal, continuing without dedup): ${err.message}`);
  }

  // 2026-06-02 — Airtable email cache. Before scraping, fetch all leads that
  // already have an Email + match this run's Business Name + Search Term.
  // For those, skip the entire scrape (saves site fetch + SerpAPI fallback).
  // Massive SerpAPI savings on re-runs of the same search.
  // Memory: feedback_serpapi_quota_protection.md
  const airtableCache = new Map(); // key: "biz|searchTerm" → email
  if (process.env.AIRTABLE_API_KEY && process.env.AIRTABLE_BASE_ID) {
    try {
      const tbl = process.env.AIRTABLE_TABLE_NAME || 'Leads';
      const searchTerms = [...new Set(records.map(r => (r['Search Term'] || r.searchTerm || '').trim()).filter(Boolean))];
      for (const sterm of searchTerms) {
        const q = encodeURIComponent(`AND({Search Term}='${sterm.replace(/'/g, "\\'")}', {Email}!='')`);
        let offset = '';
        while (true) {
          const url = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(tbl)}?filterByFormula=${q}&fields%5B%5D=Business%20Name&fields%5B%5D=Email&pageSize=100${offset ? '&offset=' + encodeURIComponent(offset) : ''}`;
          const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` } });
          if (!res.ok) break;
          const d = await res.json();
          for (const r of d.records || []) {
            const biz = (r.fields['Business Name'] || '').trim();
            const email = (r.fields.Email || '').trim();
            if (biz && email) airtableCache.set(`${biz}|${sterm}`, email);
          }
          if (!d.offset) break;
          offset = d.offset;
        }
      }
      console.log(`[airtable-cache] preloaded ${airtableCache.size} already-emailed leads (will skip re-scrape + SerpAPI fallback for these)`);
    } catch (err) {
      console.log(`[airtable-cache] preload failed (non-fatal): ${err.message}`);
    }
  }

  // Fetch in parallel batches of 5 — reduces total time ~5x vs sequential
  const BATCH = 5;
  let cacheHits = 0;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (record, j) => {
        // Airtable email cache — skip the entire scrape if we already have an
        // email for this business+search. Saves site fetch + SerpAPI fallback.
        const cacheKey = `${(record['Business Name'] || '').trim()}|${(record['Search Term'] || record.searchTerm || '').trim()}`;
        const cachedEmail = airtableCache.get(cacheKey);
        if (cachedEmail) {
          record.email = cachedEmail;
          ['facebook','instagram','linkedin','twitter','youtube','tiktok'].forEach(k => { if (!(k in record)) record[k] = ''; });
          console.log(`Processing (${i + j + 1}/${records.length}): ${record['Business Name']} → CACHE HIT (Airtable email: ${cachedEmail})`);
          cacheHits++;
          return;
        }
        // Prefer the discovered website (from step-1 Google Search fallback)
        // when present — that's the lead's real brand site, not the GBP-linked
        // aggregator. Locked 2026-05-20 (Richards Rooter case).
        const discovered = (record['Discovered Website'] || record.discoveredWebsite || '').trim();
        const gbpLinked = (record.website || record.Website || '').trim();
        const websiteRaw = discovered || gbpLinked;
        const website = cleanUrl(websiteRaw);
        if (discovered && discovered !== gbpLinked) {
          console.log(`Processing (${i + j + 1}/${records.length}): ${website} (DISCOVERED — GBP linked ${gbpLinked || '(none)'})`);
        } else {
          console.log(`Processing (${i + j + 1}/${records.length}): ${website || '(no website)'}`);
        }
        const SOCIAL_KEYS = ['email','facebook','instagram','linkedin','twitter','youtube','tiktok'];
        const bizName = (record['Business Name'] || record.businessName || '').trim();
        const bizPhone = (record.Phone || record.phone || '').trim();
        const bizSearchTerm = (record['Search Term'] || record.searchTerm || '').trim();
        if (!website) {
          for (const k of SOCIAL_KEYS) record[k] = '';
          // Even with no website, try the open-web search-fallback for email.
          // Catches Cool Choice / Green Heating style parent-brand DBA cases
          // where the GBP has no website but the brand-domain DOES exist + has email.
          // Locked 2026-05-20.
          if (bizName) {
            try {
              const discovered = await discoverEmailViaSearch('', bizName, bizPhone, bizSearchTerm);
              if (discovered) {
                record.email = discovered;
                console.log(`Processing (${i + j + 1}/${records.length}): (no website) → search-fallback found email: ${discovered}`);
              }
            } catch {}
          }
          return;
        }
        let result = { facebook: '', instagram: '', linkedin: '', twitter: '', youtube: '', tiktok: '', email: '' };
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            result = await fetchWebsiteData(website, bizName, bizPhone, bizSearchTerm);
            break;
          } catch (e) {
            if (attempt === 0) await new Promise(r => setTimeout(r, 1500));
            else console.warn(`  ⚠️ ${website}: ${e.message}`);
          }
        }
        for (const k of SOCIAL_KEYS) record[k] = result[k] || '';
        // Surface the mailbox-verification drop (email already cleared in result).
        if (result.emailSkipReason) record['Skip Reason'] = result.emailSkipReason;
      })
    );
  }

  // 2026-06-03 — CROSS-SEARCH DEDUP CHECK. For each record with a discovered
  // email OR Place ID, check the preloaded Airtable index. If hit:
  //   1. Patch the EXISTING record with the new appearance (search/city/rank).
  //   2. Mark this CSV row as duplicate-skip + clear the email field so
  //      step-2.5/step-3 skip it (they already skip rows without email).
  //   3. Log the dedup-hit for the morning report.
  if (dedupIndex) {
    const { checkDuplicate, appendAppearance } = await import('./lib/dedup-by-email.mjs');
    for (const record of records) {
      const email = (record.email || record.Email || '').trim();
      const placeId = (record['Place ID'] || record.placeId || '').trim();
      const bizName = (record['Business Name'] || record.businessName || '').trim();
      const city = (record.City || record.city || '').trim();
      const rank = parseInt(record['Map Rank'] || record.rank || '', 10);
      const searchTerm = (record['Search Term'] || record.searchTerm || '').trim();
      // 2026-07-11: website-domain dedup key (Chris — collapse same company/franchise across searches
      // even with a different Place ID / no email). Prefer the discovered brand site over the GBP-linked one.
      const website = (record['Discovered Website'] || record.discoveredWebsite || record.Website || record.website || '').trim();
      if (!email && !placeId && !website) continue;
      const { isDuplicate, matchedRecordId, matchedBy } = checkDuplicate({ email, placeId, website }, dedupIndex);
      if (!isDuplicate) continue;
      // An ARMED REDO matches itself here. Blocking it is exactly what kept the redo queue from ever
      // draining (0 of 10 healed, 2026-08-11) — the whole point of arming is that this lead SHOULD render
      // again. Let it through; the acceptance gate decides whether the rebuild is good enough to publish.
      if (dedupIndex.armedRedos?.has(matchedRecordId)) {
        console.log(`  [dedup] ${bizName}: matched an ARMED REDO (${matchedRecordId}) — allowing through to rebuild`);
        continue;
      }
      // It's a duplicate — append the new appearance to the existing record
      try {
        const out = await appendAppearance({
          recordId: matchedRecordId,
          searchTerm, city, rank,
          matchedBy,
        });
        if (out.skippedNoop) {
          console.log(`  [dedup] ${bizName}: noop (same search+rank already logged)`);
        } else {
          console.log(`  [dedup] ${bizName}: APPENDED appearance to ${matchedRecordId} (matched by ${matchedBy}); now ${out.appearanceCount} total appearances, best rank #${out.bestRank}, worst #${out.worstRank}`);
        }
      } catch (e) {
        console.warn(`  [dedup] ${bizName}: appendAppearance failed (non-fatal): ${e.message}`);
      }
      // Block downstream pipeline by clearing the email + flagging the row.
      // step-2.5 / step-3 already skip rows with empty email — this is enough
      // to prevent rendering + outreach without breaking the CSV schema.
      record.email = '';
      record['Skip Reason'] = `dedup:matched-by-${matchedBy}:record=${matchedRecordId}`;
      dedupHits++;
    }
    console.log(`[dedup] ${dedupHits} cross-search duplicate(s) detected → skipped from rendering, appearances captured on existing records.`);
  }

  let headers = Object.keys(records[0]).map((key) => ({ id: key, title: key }));
  const ensureField = (id) => { if (!headers.find((h) => h.id === id)) headers.push({ id, title: id }); };
  ['email','facebook','instagram','linkedin','twitter','youtube','tiktok','Skip Reason'].forEach(ensureField);

  const csvWriter = createObjectCsvWriter({ path: OUTPUT_CSV, header: headers });
  await csvWriter.writeRecords(records);
  console.log(`Done! Output saved to ${OUTPUT_CSV} (${cacheHits} cache-hits saved scrape+SerpAPI calls; ${dedupHits} cross-search duplicates captured + skipped)`);
}

processCsv().catch((err) => {
  console.error('Fatal error in step-2-email-scraper:', err.message || err);
  process.exit(1);
});
