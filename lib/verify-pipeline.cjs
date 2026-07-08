// lib/verify-pipeline.cjs
//
// THE canonical layered email verifier — one source of truth for the pre-send gate, the CLI, and any
// future caller. Runs the CHEAPEST checks first and SHORT-CIRCUITS on a definitive drop, so a Bouncer
// credit is only ever spent on an address the free layers genuinely can't resolve.
//
//   Layer 1  FREE   syntax / placeholder / aggregator+vendor denylist / disposable / malformed  (isLikelyEmail)
//   Layer 2  FREE   MX lookup — no mail server, OR an MX aimed at a CDN/web proxy (no SMTP) = guaranteed bounce
//   Layer 3  PAID   Bouncer (cached; catch-all/disposable/role/spam-trap via their IP fleet + DBs)
//
// verifyEmailLayered(email) → {
//   decision: 'send' | 'hold' | 'drop',
//   tier:     which layer decided ('free-disposable'|'free-denylist'|'free-mx'|'bouncer'|'bouncer-unavailable'|'free-only'),
//   result:   normalized result ('valid'|'role'|'catch-all'|'risky'|'unknown'|'invalid'|'disposable'|'no-mx'),
//   reason:   short detail,
//   creditSpent: true only when Bouncer was actually called AND charged (cache hits + free tiers = false)
// }
//
// POLICY (result → decision) — recommended defaults, tunable by env:
//   send: valid, role, catch-all, unknown      hold: risky      drop: invalid, disposable, no-mx
//   • catch-all SENDS by default (those domains mostly deliver; holding them wastes scarce lead supply).
//     Set VERIFY_HOLD_CATCHALL=1 to hold them (strict).
//   • unknown SENDS by default and RE-VERIFIES every round (Bouncer never caches 'unknown'), so a
//     transient greylist resolves next run instead of permanently benching a good lead.
//     Set VERIFY_HOLD_UNKNOWN=1 to hold instead.
//     EXCEPTION (locked 2026-07-08): an 'unknown' whose reason is an UNREACHABLE MAIL SERVER
//     (connect timeout / refused / no-connect / failed-mx) is NOT "probably fine" — it's a likely
//     bounce, so it HOLDS regardless. See bouncerUnknownIsUnreachable() + the Playa Cleaning miss
//     (order@playacleaning.com — MX pointed at Cloudflare's web proxy, SMTP timed out on every IP).
//   • risky HOLDS by default (Bouncer's explicit low-deliverability signal). Set VERIFY_SEND_RISKY=1 to send.

const dns = require('dns').promises;
const { isLikelyEmail, isDisposableDomain } = require('./email-validation.cjs');
const { verifyEmailBouncer } = require('./verify-email-bouncer.cjs');

function policy() {
  return {
    valid: 'send',
    role: 'send',
    'catch-all': process.env.VERIFY_HOLD_CATCHALL === '1' ? 'hold' : 'send',
    unknown: process.env.VERIFY_HOLD_UNKNOWN === '1' ? 'hold' : 'send',
    risky: process.env.VERIFY_SEND_RISKY === '1' ? 'send' : 'hold',
    invalid: 'drop',
    disposable: 'drop',
    'no-mx': 'drop',
  };
}

// ---- CDN / web-proxy IP ranges that never run SMTP ------------------------------------------------
// A domain's MX must point at a real mail server. When it instead points at a CDN/web-proxy IP (the
// classic misconfig: owner aimed the MX record at their proxied website), the "mail server" answers
// only HTTP, so every SMTP connection TIMES OUT → guaranteed bounce. DNS says the MX "exists", so the
// naive resolveMx() existence check passes it. We resolve the MX host and reject if it lands wholly in
// these ranges. Cloudflare is the observed + overwhelmingly common case; list is extensible.
// (Legit Cloudflare Email Routing uses *.mx.cloudflare.net — real mail IPs — allowlisted below.)
const CF_V4 = ['173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
  '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22',
  '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13', '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22'];
const CF_V6_PREFIXES = ['2400:cb00', '2606:4700', '2803:f800', '2405:b500', '2405:8100', '2a06:98c', '2c0f:f248'];
// MX hostnames that are REAL mail servers even if hosted on a CDN ASN — never flag these.
const MAIL_HOST_ALLOW = /(\.mx\.cloudflare\.net|\.protection\.outlook\.com|\.google\.com|\.googlemail\.com|aspmx|\.zoho\.|\.mailgun\.|\.sendgrid\.|\.amazonaws\.com|\.pphosted\.com|\.mimecast\.|\.messagingengine\.com|\.improvmx\.com|\.forwardemail\.net)$/i;

function ipToInt(ip) { return ip.split('.').reduce((a, o) => ((a << 8) + (+o)) >>> 0, 0); }
function v4InCidr(ip, cidr) {
  const [net, bitsStr] = cidr.split('/'); const bits = +bitsStr;
  const mask = bits === 0 ? 0 : (0xFFFFFFFF << (32 - bits)) >>> 0;
  return (ipToInt(ip) & mask) === (ipToInt(net) & mask);
}
// Is this IP in a known CDN/web-proxy range (i.e. not a real mail server)?
function isProxyIp(ip) {
  if (!ip) return false;
  if (ip.includes(':')) { const p = ip.toLowerCase().replace(/^::ffff:/, ''); return CF_V6_PREFIXES.some((pre) => p.startsWith(pre)); }
  try { return CF_V4.some((c) => v4InCidr(ip, c)); } catch { return false; }
}

// Is this MX host inside the sender's OWN domain (self-hosted mail), vs a third-party provider?
// Only a self-hosted MX can be the "I aimed my MX at my own proxied website" misconfig. A third-party
// provider MX (mx1.hostinger.com for garagegurus.net) is presumed legit — critically, big hosts like
// Hostinger legitimately front SMTP through Cloudflare Spectrum, so their MX resolves INTO Cloudflare
// ranges yet accepts mail fine. A CDN IP alone is therefore NOT proof of "no mail"; self-hosted + CDN is.
function isSelfHostedMx(host, domain) {
  const h = String(host || '').toLowerCase().replace(/\.$/, '');
  const d = String(domain || '').toLowerCase();
  return !!d && (h === d || h.endsWith('.' + d));
}

// resolveMx with retries — a SINGLE ENOTFOUND/ENODATA must NOT permanently drop a lead. Parking/budget
// DNS (dns-parking.com etc.) intermittently returns NXDOMAIN for domains that actually have MX; retry
// before concluding no-mx. Non-NXDOMAIN errors (SERVFAIL/timeout) fail open immediately.
async function resolveMxRetry(domain, tries = 3) {
  let lastCode = null;
  for (let i = 0; i < tries; i++) {
    try { const mx = await dns.resolveMx(domain); return { mx: mx || [] }; }
    catch (e) {
      if (e.code !== 'ENOTFOUND' && e.code !== 'ENODATA') return { err: e.code }; // transient infra error → fail open
      lastCode = e.code; // NXDOMAIN/NODATA — could be flaky parking DNS; retry
    }
  }
  return { noMx: true, code: lastCode };
}

// Classify a domain's MX: 'no-mx' (no records after retries), 'proxy-mx' (a SELF-HOSTED MX that resolves
// only to CDN proxies — can't do SMTP), 'ok' (real/third-party mail host, or unresolvable → fail open),
// or null (transient DNS error → fail open).
async function classifyMx(domain) {
  const dom = String(domain || '').toLowerCase();
  const res = await resolveMxRetry(dom);
  if (res.err) return null;        // transient DNS error → fail open
  if (res.noMx) return 'no-mx';    // ENOTFOUND/ENODATA on every retry → genuinely no MX
  const mx = res.mx;
  if (!mx.length) return 'no-mx';
  let anyReal = false, anyProxy = false;
  for (const rec of mx) {
    const host = String(rec.exchange || '').toLowerCase().replace(/\.$/, '');
    if (!host) continue;
    // Third-party provider MX OR an allowlisted mail host → presumed real (never flag on IP alone).
    if (MAIL_HOST_ALLOW.test(host) || !isSelfHostedMx(host, dom)) { anyReal = true; continue; }
    // Self-hosted MX: only THIS can be the proxied-website misconfig. Check its IPs.
    let ips = [];
    try { ips = ips.concat(await dns.resolve4(host)); } catch { /* no A */ }
    try { ips = ips.concat(await dns.resolve6(host)); } catch { /* no AAAA */ }
    if (!ips.length) continue;                 // couldn't resolve this host — don't judge on it
    if (ips.every(isProxyIp)) anyProxy = true;  // self-hosted MX resolving ONLY to CDN proxies = no SMTP
    else anyReal = true;                        // at least one real (non-proxy) mail IP
  }
  if (anyReal) return 'ok';                     // a real/third-party mail host exists → not our problem
  if (anyProxy) return 'proxy-mx';              // self-hosted MX resolves ONLY to CDN proxies → dead
  return 'ok';                                  // nothing resolvable / ambiguous → fail open (don't over-drop)
}

// Back-compat: boolean-ish MX existence (true/false/null). Kept for any external caller.
async function hasMx(domain) {
  const c = await classifyMx(domain);
  if (c === null) return null;
  return c !== 'no-mx';
}

// Does a Bouncer 'unknown' actually mean "the mail server is unreachable" (a likely bounce) rather than
// a benign transient (greylist / their infra hiccup)? Unreachable → we must HOLD, never send.
// Matches Bouncer raw reasons (no_connect, unavailable_smtp, timeout, failed_mx_check, dns_error, …).
// Deliberately EXCLUDES 'greylist' — greylisting resolves on retry, so it keeps the send+re-verify path.
function bouncerUnknownIsUnreachable(reason) {
  const r = String(reason || '').toLowerCase();
  if (/greylist/.test(r)) return false;
  return /no.?connect|unreach|unavailable|timeout|timed.?out|failed.?mx|no.?mx|dns.?error|refus|reset|\bdead\b|host.?not.?found/.test(r);
}

async function verifyEmailLayered(email, opts = {}) {
  const P = policy();
  const addr = String(email || '').trim().toLowerCase();
  const domain = addr.slice(addr.lastIndexOf('@') + 1);
  const mk = (decision, tier, result, reason, creditSpent = false) => ({ decision, tier, result, reason, creditSpent });

  // Layer 1 — FREE denylist + disposable + malformed (0 cost, instant)
  if (isDisposableDomain(domain)) return mk('drop', 'free-disposable', 'disposable', 'disposable-domain');
  if (!isLikelyEmail(addr))       return mk('drop', 'free-denylist', 'invalid', 'syntax/placeholder/aggregator/vendor/malformed');

  // Layer 2 — FREE MX. No mail server OR an MX aimed at a CDN/web proxy = guaranteed bounce.
  //           DNS error / unresolvable / ambiguous fails OPEN (better to let Bouncer decide than over-drop).
  const mxClass = await classifyMx(domain);
  if (mxClass === 'no-mx')    return mk('drop', 'free-mx', 'no-mx', 'no-mail-server');
  if (mxClass === 'proxy-mx') return mk('drop', 'free-mx', 'no-mx', 'mx-is-cdn-proxy-no-smtp');

  // Layer 3 — PAID Bouncer, only for what survived the free layers
  const useBouncer = opts.useBouncer !== false && !!process.env.BOUNCER_API_KEY && process.env.VERIFY_ENGINE !== 'free';
  if (useBouncer) {
    try {
      const b = await verifyEmailBouncer(addr);
      let decision = P[b.result] || 'hold';
      // An 'unknown' caused by an UNREACHABLE mail server is a likely bounce, not a maybe-good lead → HOLD.
      if (b.result === 'unknown' && bouncerUnknownIsUnreachable(b.reason)) decision = 'hold';
      return mk(decision, 'bouncer', b.result, (b.reason || '') + (b.cached ? ' (cached)' : ''), !b.cached);
    } catch (e) {
      // key/credit/transient error → fail open. The free layers already removed the worst; better to
      // send than to bench a good lead. The credit/auth error is surfaced to the caller's logs.
      return mk('send', 'bouncer-unavailable', 'unknown', e.code || e.message);
    }
  }
  // Free-only mode (no key, or VERIFY_ENGINE=free) — send what survived the free layers.
  return mk('send', 'free-only', 'unknown', 'no-bouncer');
}

module.exports = { verifyEmailLayered, policy, classifyMx, hasMx, isProxyIp, v4InCidr, isSelfHostedMx, bouncerUnknownIsUnreachable };
