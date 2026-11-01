#!/usr/bin/env node
// check-google-keys-are-sealed.mjs — a Google sign-in key is never stored in the clear (approved pending_and_google_security_v1, Option A, 10-31).
// 🔴 WHY: `client_google_oauth.refresh_token` was plain text, so anyone with a copy of the table could act on a client's Google account. The contract promises reasonable security.
// HOLDS: sealing round-trips, a tampered value and a missing key refuse, plain values pass through for the switch; both places that save a key seal it; no function uses a stored key without revealing it, which would send sealed text to Google and break the sign-in; and every stored key really is sealed.
// Live read of one column, values never printed. Exit 0 = holds · 1 = broken · 2 = can't tell. → project_everything_queued
import fs from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FN = `${SITE}/netlify/functions`;
const F = [], fail = (m) => F.push(m);
const code = (s) => s.split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
const realKey = process.env.GOOGLE_TOKEN_KEY;
process.env.GOOGLE_TOKEN_KEY = crypto.randomBytes(32).toString("base64");
const C = createRequire(`${FN}/x.js`)("./_token-crypt.js");
const sealed = C.sealToken("1//sample");
if (!C.isSealed(sealed) || sealed.includes("sample")) fail("sealing leaves the key readable");
if (C.revealToken(sealed) !== "1//sample") fail("a sealed key doesn't come back");
if (C.sealToken("1//sample") === sealed) fail("two seals of one key match, so the IV isn't random");
if (C.revealToken("1//plain") !== "1//plain") fail("a key from before the switch stops working");
if (C.sealToken(sealed) !== sealed) fail("sealing twice breaks the key");
let threw = false; try { C.revealToken(sealed.slice(0, -4) + "AAAA"); } catch { threw = true; }
if (!threw) fail("a tampered key is accepted");
delete process.env.GOOGLE_TOKEN_KEY;
threw = false; try { C.sealToken("1//x"); } catch { threw = true; }
if (!threw) fail("with no unlock key, a sign-in would be stored in plain text");
threw = false; try { C.revealToken(sealed); } catch { threw = true; }
if (!threw) fail("a sealed key reads back with no unlock key");
if (realKey) process.env.GOOGLE_TOKEN_KEY = realKey;

const CB = code(fs.readFileSync(`${FN}/oauth-google-callback.js`, "utf8"));
if (!/refresh_token: require\("\.\/_token-crypt"\)\.sealToken\(refreshToken\)/.test(CB)) fail("a client's key is saved without sealing");
if (!/refresh_token: require\("\.\/_token-crypt"\)\.sealToken\(tokens\.refresh_token\)/.test(CB)) fail("RGA's own key is saved without sealing");
if (!/revealToken\(rows\[0\]\.refresh_token\)/.test(code(fs.readFileSync(`${FN}/oauth-google-disconnect.js`, "utf8")))) fail("disconnect sends sealed text to Google, so the key isn't revoked");
let wrapped = 0;
for (const f of fs.readdirSync(FN).filter((x) => x.endsWith(".js") && x !== "_token-crypt.js")) {
  const s = code(fs.readFileSync(`${FN}/${f}`, "utf8"));
  wrapped += (s.match(/revealToken\(/g) || []).length;
  for (const m of s.matchAll(/(?:\b(?:accessToken|refreshAccessToken|token)\(|refresh_token:\s*)(\w+\??\.refresh_token)/g)) fail(`${f} uses a stored key without revealing it: ${m[0]}`);
  if (/revealToken\(/.test(s) && !/_token-crypt/.test(s)) fail(`${f} calls revealToken without loading it`);
}
if (wrapped < 25) fail(`only ${wrapped} places reveal a key, so the scan has gone blind`);

const U = process.env.SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY;
let live = "not checked (no database settings)";
if (U && K && !process.env.APPROVAL_ARCHIVE_SITE_DIR) {
  try {
    let n = 0, open = 0;
    for (const t of ["client_google_oauth", "rga_google_credentials"]) {
      const r = await fetch(`${U}/rest/v1/${t}?select=refresh_token`, { headers: { apikey: K, Authorization: `Bearer ${K}` } });
      if (!r.ok) throw new Error(`${t} ${r.status}`);
      for (const row of await r.json()) { if (!row.refresh_token) continue; n++; if (!C.isSealed(row.refresh_token)) open++; }
    }
    if (open) fail(`${open} of ${n} stored Google keys are in plain text`);
    live = `${n} stored keys, all sealed`;
  } catch (e) { console.error(`⚠️  INDETERMINATE: can't read the stored keys: ${String(e.message).slice(0, 100)}`); process.exit(2); }
}
if (F.length) { console.error(`🔴 a Google key can be stored or used wrong — ${F.length}:\n${F.slice(0, 30).map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log(`✅ Google keys are sealed when saved and revealed only to use them (${wrapped} places); ${live}`);
