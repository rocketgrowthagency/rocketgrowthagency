// lib/email-validation.cjs
// Shared email validation + ranking logic used across step-1, step-2,
// step-2.5, and scripts/discover-no-email-leads.mjs. Extracted 2026-05-20
// EOD to eliminate DRY drift risk after isLikelyEmail rules were edited in
// 3 different places throughout the day.
//
// Consumers:
//   const { isLikelyEmail, emailRank, businessNameTokens } = require('./lib/email-validation.cjs');
// From ESM:
//   import { createRequire } from 'node:module';
//   const require = createRequire(import.meta.url);
//   const { isLikelyEmail } = require('./lib/email-validation.cjs');

// === Aggregator + free-mailbox + placeholder + proxy + TLD allowlists ===

const AGGREGATOR_HOSTS = [
  'yelp.com','yellowpages.com','manta.com','bbb.org','mapquest.com',
  'foursquare.com','localbiz.com','expertise.com','angi.com',
  'angieslist.com','homeadvisor.com','thumbtack.com','nextdoor.com',
  'facebook.com','instagram.com','linkedin.com','tiktok.com',
  'twitter.com','x.com','youtube.com','pinterest.com',
  'bizapedia.com','cybo.com','showmelocal.com','merchantcircle.com',
  'whereoware.com','company.com','cityrating.com','mybusinesslistingmanager.com',
  'sites.google.com',
];

const FREE_MAILBOX_RE = /^(gmail|yahoo|hotmail|outlook|icloud|aol|live|msn|protonmail|me|att|sbcglobal|verizon|comcast|earthlink|cox|charter|optonline|pacbell|bellsouth|rocketmail|mail|ymail)\.(com|net|us|ca)$/i;

const PLACEHOLDER_EMAIL_RE = /^(?:user|test|example|name|email|your|info|admin|contact|hello|mail|noreply|donotreply|jane\.doe|john\.doe|firstname\.lastname|first\.last)@(?:domain|example|test|yoursite|yourdomain|website|email|domain1|domain2|sample|temp|placeholder|mytechusa)\.(?:com|net|org|tld|local)$/i;

// Strict placeholder local parts — reject regardless of domain. These names
// are never real human business emails (vs "info", "admin", "contact" which
// CAN be legitimate). Added 2026-05-22 after Air-Tech (someone@example.com)
// + Aire Serv (jane.doe@aireserv.com) slipped past the legacy PLACEHOLDER_EMAIL_RE.
// See feedback_scraper_must_filter_placeholder_emails.md.
const STRICTLY_PLACEHOLDER_LOCAL_RE = /^(?:someone|anybody|nobody|somebody|placeholder|fake|dummy|notarealperson|jane\.doe|john\.doe|firstname\.lastname|first\.last|first\.name|your\.name|your\.email|first|last)$/i;

// RFC 2606 reserved test domains — never real, regardless of local part.
// Catches *@example.com, *@example.org, *@test.com, *@invalid.*, *@localhost.
const RFC2606_DOMAIN_RE = /@(?:example|test|invalid|localhost)\.(?:com|net|org|info|biz|local|tld|edu|example|test)$/i;

const PROXY_DOMAIN_RE = /@(?:ccpaprivacy\.org|ccpaprivacy\.com|gdprproxy\.|whoisguard\.com|domainsbyproxy\.com|namecheap\.com|privatemail\.com|registrarsafe\.)/i;

const VALID_TLDS = new Set([
  'com','net','org','io','co','us','ca','uk','au','de','fr','es','it','nl',
  'biz','info','me','tv','ai','dev','app','site','online','shop','store',
  'tech','design','studio','agency','services','digital','marketing','solutions',
  'pro','xyz','space','live','life','works','expert','plus','llc',
  'company','business','group','team','today','world','global','center',
  'partners','consulting','support','contractors','construction','plumbing',
  'edu','gov','mil','int','jobs','mobi','name','asia','tel','travel','museum',
  'church','health','care','fitness','clinic','dental','law','attorney','insurance',
  'realtor','homes','house','realty','rentals','vacations','holiday','school','academy',
  'blog','cloud','code','events','media','news','press','review','reviews',
  'vip','social','community','club','zone',
  // Added 2026-05-22: missing real gTLDs that legitimate businesses use.
  // Caught when backfill scan flagged customercare@mds.email as invalid
  // (Mike Diamond Plumbing — real biz, real .email gTLD).
  'email','phone','contact','direct','one','two','three','some','any',
]);

// === Phone-prefix sanitizer ===

function sanitizeScrapedEmail(raw) {
  if (!raw) return raw;
  // Phone-prefix concat: "(310) 555-1234info@biz.com" → "info@biz.com",
  // "351-0978info@biz.com" → "info@biz.com". Prefix must contain at least one
  // phone separator (- space . ( ) +) so we don't strip legit digit-only
  // prefixes like "2024marketing@biz.com".
  const m = String(raw).match(/^[\d.()+\-\s]*[.()+\-\s][\d.()+\-\s]*([a-zA-Z][a-zA-Z0-9._%+-]*@.+)$/);
  if (m) return m[1];
  return raw;
}

// === Main validator ===

function isLikelyEmail(email) {
  if (!email) return '';
  // URL-decode (catches "%20office@biz.com" → " office@biz.com" → "office@biz.com")
  let pre = String(email).trim();
  try { pre = decodeURIComponent(pre); } catch { /* leave as-is on bad URI */ }
  pre = pre.replace(/^\s+|\s+$/g, '');
  const cleaned = sanitizeScrapedEmail(pre);
  const trimmed = cleaned.toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(trimmed)) return '';
  // Reject placeholders (legacy: both local + domain match generic-ish)
  if (PLACEHOLDER_EMAIL_RE.test(trimmed)) return '';
  // Reject strict-placeholder local parts regardless of domain (e.g. jane.doe@aireserv.com)
  const localPart = trimmed.split('@')[0];
  if (STRICTLY_PLACEHOLDER_LOCAL_RE.test(localPart)) return '';
  // Reject RFC 2606 reserved test domains (e.g. someone@example.com, foo@test.org)
  if (RFC2606_DOMAIN_RE.test(trimmed)) return '';
  // Reject privacy/scraping proxy domains
  if (PROXY_DOMAIN_RE.test(trimmed)) return '';
  // Reject phone-prefix local parts
  if (/^\d{3,4}-\d{4}/.test(trimmed.split('@')[0])) return '';
  // Validate TLD against allowlist
  const domain = trimmed.split('@')[1];
  const tld = domain.split('.').pop();
  if (!VALID_TLDS.has(tld)) return '';
  // Reject digit-heavy domain bases (phone-concat artifacts)
  const base = domain.replace(/\.[a-z]+$/i, '');
  if (/^[\d.-]+$/.test(base) && /\d{3,}/.test(base)) return '';
  // Reject image extensions
  if (trimmed.endsWith('.png') || trimmed.endsWith('.jpg') || trimmed.endsWith('.jpeg')) return '';
  return trimmed;
}

// === Business-name token extraction ===

const STOP_WORDS = new Set([
  'the','and','of','llc','inc','co','corp','corporation','company','services',
  'service','plumbing','plumber','plumbers','hvac','roofing','roofer','roofers',
  'garage','door','doors','electrical','electrician','contractor','contractors',
  'repair','repairs','installation','install','maintenance','maintenances',
  'beverly','hills','los','angeles','la','santa','monica','culver','city',
  'west','hollywood','marina','del','rey','pasadena','glendale','burbank',
]);

function businessNameTokens(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}

// === Site host extraction ===

function siteHost(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return ''; }
}

// === Email ranking (for cross-page domain preference) ===

function emailRank(email, siteHost) {
  if (!email) return 999;
  const at = email.toLowerCase().indexOf('@');
  if (at < 0) return 998;
  const localPart = email.slice(0, at).toLowerCase();
  const emailDomain = email.slice(at + 1).toLowerCase();
  // Tier 1: exact domain match (best — domain-matched business email)
  if (siteHost && (emailDomain === siteHost || emailDomain.endsWith('.' + siteHost) || siteHost.endsWith('.' + emailDomain))) {
    return /^(info|contact|hello|admin|sales|support|service|office|hi)$/.test(localPart) ? 11 : 10;
  }
  // Tier 2: named local-part on any domain (likely business address)
  if (/^(info|contact|hello|admin|sales|support|service|office|hi)$/.test(localPart)) return 20;
  // Tier 3: free mailbox — least trustworthy
  if (FREE_MAILBOX_RE.test(emailDomain)) return 40;
  // Tier 2.5: any other domain
  return 30;
}

module.exports = {
  AGGREGATOR_HOSTS,
  FREE_MAILBOX_RE,
  PLACEHOLDER_EMAIL_RE,
  STRICTLY_PLACEHOLDER_LOCAL_RE,
  RFC2606_DOMAIN_RE,
  PROXY_DOMAIN_RE,
  VALID_TLDS,
  sanitizeScrapedEmail,
  isLikelyEmail,
  businessNameTokens,
  siteHost,
  emailRank,
};
