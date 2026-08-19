#!/usr/bin/env node
/**
 * check-site-reachable.mjs — is a prospect's own website reachable AT ALL? (2026-08-19)
 *
 * WHY: step-3 records three segments — Maps, desktop site, mobile site. If the site cannot be loaded by
 * ANY client, the lead can never produce 3/3 WebMs and can never pass the 6/6 gate. Retrying is pure
 * waste: ~6 minutes of capture and one of the lead's three lifetime attempts, every time.
 *
 * PROVEN CASE: davidostrovelaw.com serves ERR_SSL_VERSION_OR_CIPHER_MISMATCH in Chrome AND fails curl
 * with `sslv3 alert handshake failure` — an obsolete TLS config on THEIR server. It failed on 2026-08-10,
 * again on 08-19, and Chris confirmed it as a true fail. Nothing on our side can fix it.
 *
 * Distinguishes CANNOT-CONNECT from merely slow/blocking:
 *   • TLS handshake failure / DNS failure / connection refused  -> UNBUILDABLE (park it)
 *   • timeout, 403, 503, bot-block                              -> transient, keep retrying
 * A bot-blocked site still SERVES bytes to a real browser, so it is not the same thing.
 *
 * Usage: node scripts/check-site-reachable.mjs <url> [<url>...]     exit 0 always; prints one line each
 */
import { execFileSync } from 'node:child_process';

const tryOnce = (url) => {
  try {
    execFileSync('curl', ['-sS', '-o', '/dev/null', '--max-time', '15', '--retry', '0', url],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true };
  } catch (e) { return { ok: false, err: String(e.stderr || e.message || '') }; }
};

// 🔴 2026-08-19 — A REPEATED TIMEOUT IS A DEAD SITE, NOT A BLIP. (Chris: "mark as fail and move on,
// we never try to redo".) The first version classified any timeout as TRANSIENT, which produced
// inconsistent verdicts for the SAME host: http://jbslawoffice.com came back unbuildable while
// https://jbslawoffice.com came back transient — so the lead would still have been re-captured forever.
// A site that refuses to answer twice, 15s apart, will not answer for a browser either.
// One timeout can be a network blip, so it is retried once before the lead is parked.
const verdict = (url) => {
  if (!url) return { url, state: 'no-url' };
  const a = tryOnce(url);
  if (a.ok) return { url, state: 'reachable' };
  const err = a.err;
  // Hard, permanent failures — no client can negotiate a connection.
  if (/handshake failure|sslv3 alert|SSL routines|wrong version number|unsupported protocol|no alternative certificate/i.test(err))
    return { url, state: 'unbuildable', why: 'TLS handshake fails (obsolete/broken server config)' };
  if (/Could not resolve host|name lookup timed out/i.test(err))
    return { url, state: 'unbuildable', why: 'DNS does not resolve' };
  if (/Connection refused/i.test(err))
    return { url, state: 'unbuildable', why: 'connection refused' };
  if (/Failed to connect|Connection timed out|Operation timed out|Couldn't connect/i.test(err)) {
    const b = tryOnce(url);                    // one retry — a single timeout can be a blip
    if (b.ok) return { url, state: 'reachable' };
    return { url, state: 'unbuildable', why: 'unreachable on two attempts (no route / host down)' };
  }
  // 403 / 5xx / bot-block: the server ANSWERED, so a real browser may still render it. Keep capturing.
  return { url, state: 'transient', why: err.split('\n')[0].slice(0, 80) };
};

for (const url of process.argv.slice(2)) {
  const v = verdict(url);
  console.log(`${v.state}\t${v.url}\t${v.why || ''}`);
}
