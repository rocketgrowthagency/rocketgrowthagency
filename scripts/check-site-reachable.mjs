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

// `-w %{http_code}` so the STATUS is available, not just "did curl connect". Without it a server
// answering 404 looks identical to one serving the real site — see the status rules in verdict().
// Exported so the gate can test the REAL classification without a network. The sandbox blocks curl to
// both external hosts and localhost, so any fixture-server test would report the sandbox's rules as
// our regression. Pure logic, testable directly — the alternative is a gate that asserts a COPY of
// this table and therefore passes after the real one drifts.
//
// 🔒 4xx/5xx codes NOT listed here are deliberately transient: 403/429/5xx mean the server is fending
// off a bot but still serves a real browser. Parking those would drop good prospects.
export const permanentReason = (code) => ({
  402: 'payment required (site suspended)',
  404: 'page not found',
  410: 'gone',
  451: 'unavailable for legal reasons',
}[code] || null);

const tryOnce = (url) => {
  try {
    const code = execFileSync('curl',
      ['-sS', '-L', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '15', '--retry', '0', url],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    return { ok: true, code: Number(code) || 0 };
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
  // 🔴 A MALFORMED value must never PARK a lead. A bad CSV field ("not-a-url", a truncated string) makes
  // curl fail DNS resolution, which the rules below would read as "permanently unbuildable" — parking a
  // lead whose real site may be perfectly fine. Only judge things that are actually URLs.
  let host = '';
  try { host = new URL(url).hostname; } catch { return { url, state: 'invalid-url' }; }
  if (!host || !host.includes('.')) return { url, state: 'invalid-url' };
  const a = tryOnce(url);
  if (a.ok) {
    // 🔴 2026-08-25 — REACHABLE IS NOT AUDITABLE. This check only ever asked "can a client connect?",
    // so a live server handing back an error page counted as reachable. Measured on the solar batch:
    //   gosolarwithaugust.com    402  (Payment Required — site suspended)
    //   www.bruinsolar.com       404
    //   bestlosangelessolarpanels.com  timeout
    // All three were called "reachable", so each paid a full step-2.5 audit, a step-3 capture and a
    // step-6 voiceover before dying at `missing: website` — 6 of the 9 failures that night.
    //
    // A PERMANENT status can never become a website audit, and filming it would show a prospect their
    // own broken page. Park those. The transient list below is unchanged and deliberate: 403/503/429
    // mean the server is fending off a bot but still serves a real browser.
    const why = permanentReason(a.code);
    if (why) return { url, state: 'unbuildable', why: `HTTP ${a.code} — ${why}` };
    return { url, state: 'reachable', why: a.code ? `HTTP ${a.code}` : '' };
  }
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
