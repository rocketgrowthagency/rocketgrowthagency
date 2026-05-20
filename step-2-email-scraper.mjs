import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import csvParser from 'csv-parser';
import { createObjectCsvWriter } from 'csv-writer';
import axios from 'axios';
import * as cheerio from 'cheerio';

const STEP1_DIR = path.join(process.cwd(), 'output', 'Step 1');
const STEP2_DIR = path.join(process.cwd(), 'output', 'Step 2');

function findLatestStep1Csv() {
  if (!fs.existsSync(STEP1_DIR)) {
    console.error(`Step 1 directory not found: ${STEP1_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(STEP1_DIR)
    .filter((f) => f.toLowerCase().endsWith('.csv') && f.includes('[step-1]'));

  if (!files.length) {
    console.error(`No Step 1 CSV files found in: ${STEP1_DIR}`);
    process.exit(1);
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

// Strip phone-number prefixes that get concatenated into scraped emails when
// source HTML has no space between a tel and a mailto (e.g. on a contact page
// "Tel: (XXX) 351-0978info@biz.com"). The greedy email regex would otherwise
// match "351-0978info@biz.com" as a valid address. Detected pattern: local
// part starts with 3+ digits + optional dashes + 1-4 digits, BEFORE the actual
// alphabetic local-part. Phone-fragment stripped only when alpha chars follow.
//
// 2026-05-18 — locked after the LA Garage Door Repair Wizards bad-email
// incident. See feedback_email_phone_concat_sanitizer.md in memory.
function sanitizeScrapedEmail(raw) {
  if (!raw) return raw;
  // Prefix must contain at least one phone separator (- space . ( ) +) so we
  // don't strip legit digit-only prefixes like "2024marketing@biz.com".
  const m = raw.match(/^[\d.()+\-\s]*[.()+\-\s][\d.()+\-\s]*([a-zA-Z][a-zA-Z0-9._%+-]*@.+)$/);
  if (m) return m[1];
  return raw;
}

// Dev/template placeholder emails — instant reject. Locked 2026-05-20 after
// Royale Plumbing's site exposed `user@domain.com` in source (template default).
const PLACEHOLDER_EMAIL_RE = /^(?:user|test|example|name|email|your|info|admin|contact|hello|mail|noreply|donotreply)@(?:domain|example|test|yoursite|yourdomain|website|email|domain1|domain2|sample|temp|placeholder)\.(?:com|net|org|tld|local)$/i;

// Allowlist of plausible TLDs — keeps the list inclusive but rejects obvious
// phone-concat artifacts like `661-257-9200.our`. Locked 2026-05-20 after
// Roto-Rooter scrape captured `line@661-257-9200.our` as "email".
const VALID_TLDS = new Set([
  'com','net','org','io','co','us','ca','uk','au','de','fr','es','it','nl',
  'biz','info','me','tv','ai','dev','app','site','online','shop','store',
  'tech','design','studio','agency','services','digital','marketing','solutions',
  'pro','xyz','space','live','life','works','works','expert','expert','plus','llc',
  'company','business','group','team','works','today','world','global','center',
  'partners','consulting','support','contractors','construction','plumbing',
  'edu','gov','mil','int','jobs','mobi','name','asia','tel','travel','museum',
  'church','health','care','fitness','clinic','dental','law','attorney','insurance',
  'realtor','homes','house','realty','rentals','vacations','holiday','school','academy',
  'app','blog','cloud','code','company','events','media','news','press','review',
  'reviews','tv','vip','social','community','club','team','team','zone',
  // ccTLDs commonly used
  'us','co.uk','com.au','co.nz',
]);

function isLikelyEmail(email) {
  if (!email) return '';
  // URL-decode + strip surrounding whitespace. Catches "%20office@biz.com" /
  // "&#32;contact@biz.com" patterns where a leading URL-encoded space slipped
  // into a mailto: href. Locked 2026-05-20 (Finest Heating & Air case).
  let pre = email.trim();
  try { pre = decodeURIComponent(pre); } catch { /* leave as-is on bad URI */ }
  pre = pre.replace(/^\s+|\s+$/g, '');
  const cleaned = sanitizeScrapedEmail(pre);
  const trimmed = cleaned.toLowerCase();
  const basic = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
  if (!basic.test(trimmed)) return '';
  // Reject dev/template placeholder emails (user@domain.com, test@test.com, etc.)
  if (PLACEHOLDER_EMAIL_RE.test(trimmed)) return '';
  // Reject local parts that look like a US phone fragment (3-4 digits + dash +
  // 4 digits + anything else) — defense in case sanitizeScrapedEmail missed a
  // variant. Keeps legitimate digit-prefixed emails like "2024marketing@biz".
  const localPart = trimmed.split('@')[0];
  if (/^\d{3,4}-\d{4}/.test(localPart)) return '';
  // Reject domains whose local part of the hostname (before the TLD) is mostly
  // digits + dashes — catches phone-concat artifacts like `661-257-9200.our`
  // where the "domain" is a phone number with a random word suffix.
  const domain = trimmed.split('@')[1];
  const tld = domain.split('.').pop();
  if (!VALID_TLDS.has(tld)) return '';
  const domainBase = domain.replace(/\.[a-z]+$/i, '');
  // If the entire registrable base is just digits + dashes/dots, it's a phone-num spoof
  if (/^[\d.-]+$/.test(domainBase) && /\d{3,}/.test(domainBase)) return '';
  if (trimmed.endsWith('.png') || trimmed.endsWith('.jpg') || trimmed.endsWith('.jpeg')) {
    return '';
  }
  return trimmed;
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

function extractFromHtml(html) {
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
    const text = $.root().text();
    const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (match) {
      const valid = isLikelyEmail(match[0]);
      if (valid) {
        email = valid;
      }
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

// Extract the registrable host from a website URL for email-domain matching.
// "https://www.californiahitechplumbing.com/" → "californiahitechplumbing.com"
function siteHostKey(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

// Rank an email candidate against the site's registrable host.
// Lower score = better. Used to pick the best email when multiple pages
// surface different candidates (e.g. a stray gmail in the homepage footer
// vs a real edna@biz.com on /contact). Locked 2026-05-20 after Cal Hi-Tech
// scrape picked up "califoniahitechplumbing@gmail.com" (typo'd gmail in
// homepage source) and missed "edna@californiahitechplumbing.com" on /contact.
function emailRank(email, siteHost) {
  if (!email) return 999;
  const at = email.toLowerCase().indexOf('@');
  if (at < 0) return 998;
  const localPart = email.slice(0, at).toLowerCase();
  const emailDomain = email.slice(at + 1).toLowerCase();
  // Tier 1: exact domain match (edna@californiahitechplumbing.com on californiahitechplumbing.com)
  if (siteHost && (emailDomain === siteHost || emailDomain.endsWith('.' + siteHost) || siteHost.endsWith('.' + emailDomain))) {
    // Slightly prefer named local-parts over generic catchalls within domain-matched tier
    return /^(info|contact|hello|admin|sales|support|service|office|hi)$/.test(localPart) ? 11 : 10;
  }
  // Tier 2: looks like a business address (named local-part) on any domain — usually owner's name
  if (/^(info|contact|hello|admin|sales|support|service|office|hi)$/.test(localPart)) return 20;
  // Tier 3: generic free-mailbox (gmail/yahoo/hotmail/outlook/icloud) — least trustworthy
  if (/^(gmail|yahoo|hotmail|outlook|icloud|aol|live|msn|protonmail|me)\.com$/.test(emailDomain)) return 40;
  // Tier 2.5: any other domain
  return 30;
}

// Strip common business-name boilerplate. Duplicated from step-1's same-named
// function so step-2 can do its own cross-reference checks without imports.
function businessNameTokens(name) {
  const STOP = new Set([
    'the','and','of','llc','inc','co','corp','corporation','company','services',
    'service','plumbing','plumber','plumbers','hvac','roofing','roofer','roofers',
    'garage','door','doors','electrical','electrician','contractor','contractors',
    'repair','repairs','installation','install','maintenance','maintenances',
    'beverly','hills','los','angeles','la','santa','monica','culver','city',
    'west','hollywood','marina','del','rey','pasadena','glendale','burbank',
  ]);
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

// LAST-RESORT email-discovery via open-web search. Called when every same-site
// scan path (mailto / JSON-LD / body-text / obfuscated / hidden-input / data-attr /
// form action / inline-script / CSS content / raw-HTML) returns no email.
//
// Locked 2026-05-20 — feedback_email_via_external_search.md.
// Caught: Mr. Speedy Plumbing (no email on site, Google AI Overview surfaced
// info@mrspeedyplumbing.com + local@mrspeedyplumbing.com + fred@mrspeedyplumbing.com).
//
// Cross-reference REQUIRED — Chris locked after LAX Affordable Plumbing case
// where AI Overview returned avner.gilboa@att.net (owner personal). Without
// cross-ref we'd send to unrelated people. Tiers:
//   1. AUTO-TRUST: email domain === site host (info@biz.com on biz.com search)
//   2. NAME-MATCH: email local-part contains a distinctive business-name token
//   3. PROXIMITY: email within ~300 chars of business name in response text
//   4. REJECT: free-mailbox with no context
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
        const res = await axios.get(url, { timeout: 15000 });
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
      const found = extractFromHtml(response.data);
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

  // Fetch in parallel batches of 5 — reduces total time ~5x vs sequential
  const BATCH = 5;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (record, j) => {
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
      })
    );
  }

  let headers = Object.keys(records[0]).map((key) => ({ id: key, title: key }));
  const ensureField = (id) => { if (!headers.find((h) => h.id === id)) headers.push({ id, title: id }); };
  ['email','facebook','instagram','linkedin','twitter','youtube','tiktok'].forEach(ensureField);

  const csvWriter = createObjectCsvWriter({ path: OUTPUT_CSV, header: headers });
  await csvWriter.writeRecords(records);
  console.log(`Done! Output saved to ${OUTPUT_CSV}`);
}

processCsv().catch((err) => {
  console.error('Fatal error in step-2-email-scraper:', err.message || err);
  process.exit(1);
});
