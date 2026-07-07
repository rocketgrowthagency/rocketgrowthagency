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

const fs = require('fs');
const path = require('path');

// === Disposable/throwaway domains — FREE replacement for Bouncer's disposable detection ===
// Merged open-source blocklists (config/disposable-domains.txt, ~75k domains: mailinator, temp-mail,
// guerrillamail, etc.). A pure DB lookup — exactly what Bouncer does for disposables, at $0 and 0 latency.
// These never reach a real owner, so we DROP them (return '' from isLikelyEmail) at scrape time.
const DISPOSABLE_DOMAINS = (() => {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', 'config', 'disposable-domains.txt'), 'utf8');
    return new Set(raw.split('\n').map((d) => d.trim().toLowerCase()).filter(Boolean));
  } catch (_) { return new Set(); }
})();
function isDisposableDomain(domain) {
  if (!domain) return false;
  const d = String(domain).toLowerCase();
  if (DISPOSABLE_DOMAINS.has(d)) return true;
  // a subdomain of a disposable base counts too (mail.mailinator.com → mailinator.com)
  const parts = d.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    if (DISPOSABLE_DOMAINS.has(parts.slice(i).join('.'))) return true;
  }
  return false;
}

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
  // Listing/aggregator + SaaS-vendor domains: never the business's own mailbox.
  // Added 2026-07-01 after domain-reputation bounces (customercare@realtor.com,
  // support@windermere.com, bugreport@moatable.com scraped as "the business email").
  'realtor.com','realtor.ca','zillow.com','trulia.com','redfin.com','homes.com',
  'apartments.com','loopnet.com','moatable.com','godaddy.com','wixsite.com','wix.com',
  'squarespace.com','weebly.com','wordpress.com','shopify.com','constantcontact.com',
  // Directory/aggregator domains scraped as a business's "email" but not their own mailbox —
  // they hard-bounce. Added 2026-07-02 after centres@localgardencentres.net (a nursery's scraped
  // email) bounced "address not found" and nudged bounce-rate to AMBER.
  'localgardencentres.net','localgardencentres.com','yell.com','brownbook.net','hotfrog.com',
  // Mailing-list + SEO/marketing-vendor domains scraped as a business's "email" — never the
  // business's own reachable mailbox; they hard-bounce. Added 2026-07-03 from the bounce backtest
  // (peachhead2@yahoogroups.com, aksana@topposition.com both bounced).
  'yahoogroups.com','googlegroups.com','groups.io','topposition.com','topposition.net',
  // Order-fulfillment / marketing-vendor domains scraped as a business's "email" — the mailbox is the
  // VENDOR's (has MX, may even accept mail), never the business's own reachable inbox → wrong recipient
  // + reputation risk. Added 2026-07-07 after flawless@customerstatus.com (Fosdick fulfillment vendor)
  // was sent Email #1 for "Flawless pool leak detection". MX/SMTP can't catch these — only the denylist.
  'customerstatus.com','fosdickcorp.com','fosdickh.fosdickcorp.com',
];

// Risky role/guessed local parts that are almost never a reachable owner mailbox
// (they bounce or go unmonitored). NOTE: 'info','contact','office','admin','sales',
// 'hello' are intentionally NOT here — legit for small businesses. Added 2026-07-01
// after mail@venelson.com + bugreport@moatable.com bounced (domain-reputation risk).
const RISKY_ROLE_LOCAL_RE = /^(?:mail|mailer|webmaster|postmaster|abuse|noreply|no-reply|donotreply|do-not-reply|bounce|bounces|bugreport|mailer-daemon|root|nobody|unsubscribe)$/i;

const FREE_MAILBOX_RE = /^(gmail|yahoo|hotmail|outlook|icloud|aol|live|msn|protonmail|me|att|sbcglobal|verizon|comcast|earthlink|cox|charter|optonline|pacbell|bellsouth|rocketmail|mail|ymail)\.(com|net|us|ca)$/i;

const PLACEHOLDER_EMAIL_RE = /^(?:user|test|example|name|email|your|info|admin|contact|hello|mail|noreply|donotreply|jane\.doe|john\.doe|firstname\.lastname|first\.last)@(?:domain|example|test|yoursite|yourdomain|website|email|domain1|domain2|sample|temp|placeholder|mytechusa)\.(?:com|net|org|tld|local)$/i;

// Strict placeholder local parts — reject regardless of domain. These names
// are never real human business emails (vs "info", "admin", "contact" which
// CAN be legitimate). Added 2026-05-22 after Air-Tech (someone@example.com)
// + Aire Serv (jane.doe@aireserv.com) slipped past the legacy PLACEHOLDER_EMAIL_RE.
// See feedback_scraper_must_filter_placeholder_emails.md.
const STRICTLY_PLACEHOLDER_LOCAL_RE = /^(?:someone|anybody|nobody|somebody|placeholder|fake|dummy|notarealperson|jane\.doe|john\.doe|john\.smith|jane\.smith|firstname\.lastname|first\.last|first\.name|your\.name|your\.email|first|last|flast|flast\.name|ericjonesmyemail|eric\.jones\.myemail)$/i;

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
  let s = String(raw);
  const m = s.match(/^[\d.()+\-\s]*[.()+\-\s][\d.()+\-\s]*([a-zA-Z][a-zA-Z0-9._%+-]*@.+)$/);
  if (m) s = m[1];
  // Strip a stray "www." in the DOMAIN (gio@www.biz.com → gio@biz.com). The scraper
  // sometimes lifts a malformed address off a "www.<domain>" link; the www. host has
  // no mail server, so the address hard-bounces. Caught 2026-06-16 (Flood Brothers).
  s = s.replace(/@www\./i, '@');
  return s;
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
  // Reject RFC-invalid local parts: leading/trailing/consecutive dots (scrape artifacts that hard-bounce,
  // e.g. "stressful.@usjunkyards.com"). Bouncer flags these undeliverable; we catch them free.
  if (/^\.|\.$|\.\./.test(localPart)) return '';
  // Reject risky role/guessed prefixes (mail@, webmaster@, noreply@, bugreport@…) — bounce risk
  if (RISKY_ROLE_LOCAL_RE.test(localPart)) return '';
  // Reject phone-number mashed into the local part (scrape artifact, hard-bounces),
  // e.g. crs707-337-9629napahomes@… or …4242422040@… — catches a 3-3-4 phone or 6+ digit run.
  if (/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/.test(localPart) || /\d{6,}/.test(localPart)) return '';
  // Reject RFC 2606 reserved test domains (e.g. someone@example.com, foo@test.org)
  if (RFC2606_DOMAIN_RE.test(trimmed)) return '';
  // Reject privacy/scraping proxy domains
  if (PROXY_DOMAIN_RE.test(trimmed)) return '';
  // Reject phone-prefix local parts
  if (/^\d{3,4}-\d{4}/.test(trimmed.split('@')[0])) return '';
  // Validate TLD against allowlist
  const domain = trimmed.split('@')[1];
  // Reject listing-aggregator / SaaS-vendor domains (never the business's own mailbox)
  if (AGGREGATOR_HOSTS.includes(domain)) return '';
  // Reject disposable/throwaway domains (mailinator, temp-mail, …) — FREE, ~75k-domain DB lookup
  if (isDisposableDomain(domain)) return '';
  // Reject repeated-final-TLD typos (napalawoffice.com.com, biz.net.net) — scrape artifacts that bounce
  const _labels = domain.split('.');
  if (_labels.length >= 3 && _labels[_labels.length - 1] === _labels[_labels.length - 2]) return '';
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
  isDisposableDomain,
  DISPOSABLE_DOMAINS,
  businessNameTokens,
  siteHost,
  emailRank,
};
