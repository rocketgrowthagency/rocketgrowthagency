// lib/verify-pipeline.cjs
//
// THE canonical layered email verifier — one source of truth for the pre-send gate, the CLI, and any
// future caller. Runs the CHEAPEST checks first and SHORT-CIRCUITS on a definitive drop, so a Bouncer
// credit is only ever spent on an address the free layers genuinely can't resolve.
//
//   Layer 1  FREE   syntax / placeholder / aggregator+vendor denylist / disposable / malformed  (isLikelyEmail)
//   Layer 2  FREE   MX lookup — no mail server = guaranteed bounce
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

async function hasMx(domain) {
  try { const mx = await dns.resolveMx(domain); return !!(mx && mx.length); }
  catch (e) { return (e.code === 'ENOTFOUND' || e.code === 'ENODATA') ? false : null; } // null = DNS error → fail open
}

async function verifyEmailLayered(email, opts = {}) {
  const P = policy();
  const addr = String(email || '').trim().toLowerCase();
  const domain = addr.slice(addr.lastIndexOf('@') + 1);
  const mk = (decision, tier, result, reason, creditSpent = false) => ({ decision, tier, result, reason, creditSpent });

  // Layer 1 — FREE denylist + disposable + malformed (0 cost, instant)
  if (isDisposableDomain(domain)) return mk('drop', 'free-disposable', 'disposable', 'disposable-domain');
  if (!isLikelyEmail(addr))       return mk('drop', 'free-denylist', 'invalid', 'syntax/placeholder/aggregator/vendor/malformed');

  // Layer 2 — FREE MX (no mail server = guaranteed bounce; DNS error fails open)
  const mx = await hasMx(domain);
  if (mx === false) return mk('drop', 'free-mx', 'no-mx', 'no-mail-server');

  // Layer 3 — PAID Bouncer, only for what survived the free layers
  const useBouncer = opts.useBouncer !== false && !!process.env.BOUNCER_API_KEY && process.env.VERIFY_ENGINE !== 'free';
  if (useBouncer) {
    try {
      const b = await verifyEmailBouncer(addr);
      return mk(P[b.result] || 'hold', 'bouncer', b.result, (b.reason || '') + (b.cached ? ' (cached)' : ''), !b.cached);
    } catch (e) {
      // key/credit/transient error → fail open. The free layers already removed the worst; better to
      // send than to bench a good lead. The credit/auth error is surfaced to the caller's logs.
      return mk('send', 'bouncer-unavailable', 'unknown', e.code || e.message);
    }
  }
  // Free-only mode (no key, or VERIFY_ENGINE=free) — send what survived the free layers.
  return mk('send', 'free-only', 'unknown', 'no-bouncer');
}

module.exports = { verifyEmailLayered, policy };
