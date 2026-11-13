// totp.mjs — the 6-digit, 30-second code an authenticator app shows (RFC 6238, HMAC-SHA1), for the checks' robot staff account.
// 🔒 The secret is read from the environment by the caller and NEVER printed or logged (feedback_never_print_a_secret_value).
import crypto from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32Decode(s) {
  const clean = String(s || "").toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  let bits = "", out = [];
  for (const ch of clean) { const v = B32.indexOf(ch); if (v < 0) throw new Error("not base32"); bits += v.toString(2).padStart(5, "0"); }
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}
/** The code for `secret` (base32) at `atMs`; `step` seconds per code, `digits` long. */
export function totp(secret, atMs = Date.now(), { step = 30, digits = 6 } = {}) {
  const counter = Math.floor(atMs / 1000 / step), msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 0x0f;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** digits).padStart(digits, "0");
}
// RFC 6238 appendix B, SHA-1, secret "12345678901234567890": the self-test a caller runs before trusting a code
export function totpSelfTest() {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";   // base32 of "12345678901234567890"
  const cases = [[59, "94287082"], [1111111109, "07081804"], [1234567890, "89005924"], [2000000000, "69279037"]];
  return cases.every(([t, want]) => totp(secret, t * 1000, { digits: 8 }) === want);
}
