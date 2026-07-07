// lib/verify-email-bouncer.cjs
//
// Bouncer (usebouncer.com) real-time email verification — the paid, reliable layer the SMTP
// probe (lib/verify-mailbox.cjs) can't match: catch-all detection, disposable + role + spam-trap
// databases, and it isn't blocked by Gmail/Microsoft the way port-25 probes are. Chosen in the
// 2026-07-03 deliverability research (see reference_deliverability_playbook). Flat $0.008/email,
// no charge for 'unknown'.
//
// Requires BOUNCER_API_KEY in the environment (from .env). If it's missing, verifyEmailBouncer()
// throws NO_BOUNCER_KEY so callers can fall back to the free SMTP verifier.
//
// verifyEmailBouncer(email) → {
//   result:  'valid' | 'invalid' | 'catch-all' | 'disposable' | 'role' | 'risky' | 'unknown',
//   status:  raw Bouncer status ('deliverable'|'undeliverable'|'risky'|'unknown'),
//   reason:  raw Bouncer reason,
//   cached:  boolean,
//   raw:     full Bouncer response (or null on error),
// }
//
// Normalized result → send/hold/drop is decided by the CALLER (see scripts/verify-sendable-mailboxes.mjs
// classify()), matching the playbook's table: valid/role→SEND, catch-all/risky/unknown→HOLD,
// invalid/disposable→DROP+suppress.

const fs = require('fs');
const path = require('path');

const API = 'https://api.usebouncer.com/v1.1/email/verify';
const CACHE_PATH = path.join(__dirname, '..', 'output', 'bouncer-cache.json');
const CACHE_TTL_MS = Number(process.env.BOUNCER_CACHE_TTL_DAYS || 30) * 24 * 60 * 60 * 1000;
const TIMEOUT_MS = Number(process.env.BOUNCER_TIMEOUT_MS || 12000);

function apiKey() {
  return process.env.BOUNCER_API_KEY || '';
}

// ---- on-disk cache (avoid re-charging for an address we already verified) ----
let _cache = null;
function loadCache() {
  if (_cache) return _cache;
  try { _cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')); } catch { _cache = {}; }
  return _cache;
}
function saveCache() {
  try {
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(_cache, null, 2));
  } catch (_) { /* cache is best-effort */ }
}

// ---- Bouncer status/reason → our normalized result ----
function normalize(d) {
  const status = d.status || 'unknown';
  const reason = d.reason || '';
  const dom = d.domain || {};
  const acct = d.account || {};
  const disposable = String(dom.disposable || '').toLowerCase() === 'yes';
  const acceptAll = String(dom.acceptAll || '').toLowerCase() === 'yes';
  const role = String(acct.role || '').toLowerCase() === 'yes';
  const toxic = String(d.toxic || '').toLowerCase() === 'yes';

  if (disposable) return 'disposable';                 // always drop
  if (toxic) return 'invalid';                          // spam-trap / abuse → drop
  if (status === 'undeliverable') return 'invalid';    // hard-bad mailbox → drop
  if (status === 'deliverable') return role ? 'role' : 'valid';
  if (status === 'risky') {
    if (acceptAll) return 'catch-all';                 // hold
    if (role) return 'role';                           // send deprioritized
    return 'risky';                                    // hold
  }
  return 'unknown';                                    // fail open
}

async function verifyEmailBouncer(email, opts = {}) {
  const addr = String(email || '').trim().toLowerCase();
  if (!addr || addr.indexOf('@') < 1) return { result: 'unknown', status: 'unknown', reason: 'bad-syntax', cached: false, raw: null };

  const key = apiKey();
  if (!key) { const e = new Error('BOUNCER_API_KEY not set'); e.code = 'NO_BOUNCER_KEY'; throw e; }

  // cache hit (fresh)?
  if (!opts.noCache) {
    const c = loadCache()[addr];
    if (c && (Date.now() - c.at) < CACHE_TTL_MS) {
      return { result: c.result, status: c.status, reason: c.reason, cached: true, raw: c.raw || null };
    }
  }

  const url = `${API}?email=${encodeURIComponent(addr)}&timeout=10`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let d;
  try {
    const r = await fetch(url, { headers: { 'x-api-key': key, Accept: 'application/json' }, signal: ctrl.signal });
    if (r.status === 401 || r.status === 403) { const e = new Error('Bouncer auth failed (' + r.status + ') — check BOUNCER_API_KEY'); e.code = 'BOUNCER_AUTH'; throw e; }
    if (r.status === 402) { const e = new Error('Bouncer credits exhausted (402) — top up account'); e.code = 'BOUNCER_CREDITS'; throw e; }
    if (r.status === 429) return { result: 'unknown', status: 'unknown', reason: 'rate-limited', cached: false, raw: null }; // fail open
    if (!r.ok) return { result: 'unknown', status: 'unknown', reason: 'http-' + r.status, cached: false, raw: null };
    d = await r.json();
  } catch (err) {
    if (err.code === 'BOUNCER_AUTH' || err.code === 'BOUNCER_CREDITS') throw err;
    return { result: 'unknown', status: 'unknown', reason: err.name === 'AbortError' ? 'timeout' : (err.code || 'fetch-error'), cached: false, raw: null };
  } finally { clearTimeout(t); }

  const result = normalize(d);
  // cache everything EXCEPT 'unknown' (Bouncer doesn't charge for unknown; re-verifying later may resolve it)
  if (result !== 'unknown') {
    loadCache()[addr] = { result, status: d.status, reason: d.reason, at: Date.now(), raw: d };
    saveCache();
  }
  return { result, status: d.status, reason: d.reason, cached: false, raw: d };
}

module.exports = { verifyEmailBouncer, normalize };
