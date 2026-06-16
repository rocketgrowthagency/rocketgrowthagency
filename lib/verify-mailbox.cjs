// lib/verify-mailbox.cjs
//
// Conservative SMTP mailbox verification — catches the "passes MX but the mailbox
// doesn't exist" hard bounces that the send-time MX check can't (a domain having a
// mail server says nothing about whether info@ exists). Added 2026-06-15 after the
// outreach auto-pause: 7 bounces / 134 sends = 5.2% > Gmail's 5% RED line.
//
// Design principle: FAIL OPEN. Only return 'invalid' on a DEFINITIVE 5xx mailbox
// rejection from a non-catch-all domain. Greylisting, timeouts, connection issues,
// 4xx, and catch-all domains all return 'unknown' — we never drop a possibly-good
// lead, we only drop a provably-bad one. Over-filtering loses real prospects;
// under-filtering just leaves the existing (now-cleaned) bounce path as backstop.
//
// Returns: { result: 'valid'|'invalid'|'unknown'|'catch-all', code, detail }
//   valid     — RCPT accepted (250) AND domain is not catch-all
//   invalid   — RCPT hard-rejected (550/551/553/5xx) → drop this email
//   catch-all — domain accepts ALL recipients → can't verify → treat as unknown
//   unknown   — greylist/timeout/conn/4xx/MX-missing → fail open, keep the lead

const net = require('net');
const dns = require('dns').promises;

const HELO_DOMAIN = process.env.VERIFY_HELO_DOMAIN || 'rocketgrowthagency.com';
const MAIL_FROM = process.env.VERIFY_MAIL_FROM || 'hello@rocketgrowthagency.com';
const SMTP_TIMEOUT_MS = Number(process.env.VERIFY_SMTP_TIMEOUT_MS || 8000);

const _catchAllCache = new Map(); // domain -> boolean (is catch-all)

function randomLocalPart() {
  // a mailbox that almost certainly does not exist, for catch-all detection
  return 'rga-verify-no-such-user-' + Math.abs(hashStr(MAIL_FROM + HELO_DOMAIN)).toString(36).slice(0, 8);
}
// deterministic (Math.random is unavailable in some sandboxes); varies by domain at call site
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return h; }

// Run one SMTP conversation against `host`, probing each address in `rcpts` in order.
// Returns array of { code } aligned to rcpts (code = first digit*100 bucket or raw).
function smtpProbe(host, rcpts) {
  return new Promise((resolve) => {
    const results = [];
    let stage = 'greet';
    let idx = 0;
    let buf = '';
    let done = false;
    const finish = (val) => { if (done) return; done = true; try { sock.destroy(); } catch (_) {} resolve(val); };
    const sock = net.createConnection({ host, port: 25, timeout: SMTP_TIMEOUT_MS });
    const send = (line) => { try { sock.write(line + '\r\n'); } catch (_) {} };

    sock.on('timeout', () => finish({ error: 'timeout', results }));
    sock.on('error', (e) => finish({ error: e.code || 'conn-error', results }));
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      // SMTP replies can be multiline: "250-foo\r\n250 bar\r\n". A line with a
      // space after the code (not a hyphen) terminates the reply.
      let nl;
      while ((nl = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 2);
        if (/^\d{3}-/.test(line)) continue; // continuation line — wait for the final
        const code = parseInt(line.slice(0, 3), 10);
        advance(code);
      }
    });

    function advance(code) {
      if (stage === 'greet') {
        if (code !== 220) return finish({ error: 'no-greeting:' + code, results });
        stage = 'helo'; send('EHLO ' + HELO_DOMAIN);
      } else if (stage === 'helo') {
        if (code >= 400) { stage = 'helo2'; send('HELO ' + HELO_DOMAIN); return; }
        stage = 'mailfrom'; send('MAIL FROM:<' + MAIL_FROM + '>');
      } else if (stage === 'helo2') {
        if (code >= 400) return finish({ error: 'helo-rejected:' + code, results });
        stage = 'mailfrom'; send('MAIL FROM:<' + MAIL_FROM + '>');
      } else if (stage === 'mailfrom') {
        if (code >= 400) return finish({ error: 'mailfrom-rejected:' + code, results });
        stage = 'rcpt'; send('RCPT TO:<' + rcpts[idx] + '>');
      } else if (stage === 'rcpt') {
        results.push({ rcpt: rcpts[idx], code });
        idx++;
        if (idx < rcpts.length) { send('RCPT TO:<' + rcpts[idx] + '>'); }
        else { stage = 'quit'; send('QUIT'); finish({ results }); }
      }
    }
  });
}

async function verifyMailbox(email) {
  const out = { result: 'unknown', code: null, detail: '' };
  const addr = String(email || '').trim().toLowerCase();
  const at = addr.lastIndexOf('@');
  if (at < 1) { out.detail = 'bad-syntax'; return out; }
  const domain = addr.slice(at + 1);

  let mxHost;
  try {
    const mx = await dns.resolveMx(domain);
    if (!mx || !mx.length) { out.detail = 'no-mx'; return out; } // unknown (fail open)
    mxHost = mx.sort((a, b) => a.priority - b.priority)[0].exchange;
  } catch (_) { out.detail = 'mx-lookup-failed'; return out; }

  // Probe the real address + a definitely-nonexistent one (catch-all detection),
  // in a single connection.
  const decoy = randomLocalPart() + Math.abs(hashStr(domain)).toString(36).slice(0, 6) + '@' + domain;
  const probe = await smtpProbe(mxHost, [addr, decoy]);
  if (probe.error || !probe.results.length) { out.detail = probe.error || 'no-result'; return out; } // unknown

  const real = probe.results.find((r) => r.rcpt === addr);
  const fake = probe.results.find((r) => r.rcpt === decoy);
  out.code = real ? real.code : null;

  if (!real) { out.detail = 'no-rcpt-result'; return out; }
  // Catch-all: the bogus decoy was ALSO accepted → server accepts everything →
  // we cannot prove the real one is good or bad. Fail open.
  if (fake && fake.code >= 200 && fake.code < 300) {
    _catchAllCache.set(domain, true);
    out.result = 'catch-all'; out.detail = 'domain-accepts-all'; return out;
  }
  if (real.code >= 200 && real.code < 300) { out.result = 'valid'; return out; }
  // Definitive hard rejection of the real mailbox → invalid. This is the only
  // case where we DROP the lead.
  if (real.code >= 500 && real.code < 600) { out.result = 'invalid'; out.detail = 'rcpt-5xx'; return out; }
  // 4xx (greylist/temporary) or anything else → unknown, fail open.
  out.detail = '4xx-or-other:' + real.code;
  return out;
}

module.exports = { verifyMailbox };
