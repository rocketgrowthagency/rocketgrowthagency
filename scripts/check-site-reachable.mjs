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

const verdict = (url) => {
  if (!url) return { url, state: 'no-url' };
  try {
    execFileSync('curl', ['-sS', '-o', '/dev/null', '--max-time', '15', '--retry', '0', url],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { url, state: 'reachable' };
  } catch (e) {
    const err = String(e.stderr || e.message || '');
    // Hard, permanent failures — the server cannot negotiate a connection with any client.
    if (/handshake failure|sslv3 alert|SSL routines|wrong version number|unsupported protocol|no alternative certificate/i.test(err))
      return { url, state: 'unbuildable', why: 'TLS handshake fails (obsolete/broken server config)' };
    if (/Could not resolve host|name lookup timed out/i.test(err))
      return { url, state: 'unbuildable', why: 'DNS does not resolve' };
    if (/Connection refused|Failed to connect/i.test(err))
      return { url, state: 'unbuildable', why: 'connection refused' };
    // Everything else (timeout, 403, 5xx, bot-block) is TRANSIENT — a real browser may still succeed.
    return { url, state: 'transient', why: err.split('\n')[0].slice(0, 80) };
  }
};

for (const url of process.argv.slice(2)) {
  const v = verdict(url);
  console.log(`${v.state}\t${v.url}\t${v.why || ''}`);
}
