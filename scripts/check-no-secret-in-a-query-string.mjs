#!/usr/bin/env node
// check-no-secret-in-a-query-string.mjs — A SECRET TRAVELS IN A HEADER, NEVER IN THE ADDRESS (security master #13, approved 11-11, S6/S9).
//
// 🔴 WHY: 14 website functions accepted QUO_WEBHOOK_TOKEN as `?token=` (audits, backfills, the Google description hand tool), and
// their callers (flow-execute, rankings-refresh, apply-plan-automatable, six Scraper scripts, daily-health-check.sh) put it in the URL.
// A URL is kept in access logs, shell history and at any third party that stores it; the same token sits in Quo's webhook address,
// and its live value was written into two Scraper scripts. Now every internal call carries INTERNAL_FN_SECRET in the
// `x-internal-secret` header, compared in constant time (_auth.js), and Quo's webhook is checked by Quo's own signature header once
// QUO_WEBHOOK_SIGNING_KEY is set (the URL token only until then: Chris's step 4 in website docs/supabase/PENDING_FOR_CHRIS.md).
// (a) STATIC: no website function reads a token from queryStringParameters (quo-call-webhook's legacy read only inside
//     quoCallAllowed, after the signature path); no website or Scraper caller builds `?token=`/`&token=` to an RGA function (Quo's own
//     webhook address excepted); every one of the 14 former token receivers calls requireInternalSecret(event); no Scraper script
//     carries a hardcoded fallback for QUO_WEBHOOK_TOKEN.
// (b) SELF-PROVING on the real files: _auth.js requireInternalSecret accepts the header, refuses a wrong one of the same length, a
//     ?token= alone, and fails closed with no secret set; quo-call-webhook's quoSignatureOk accepts a correctly signed body and
//     refuses a changed body, an old timestamp and a wrong key; with the key set, a right ?token= alone is refused.
// Exit 0 = no secret in an address · 1 = one is · 2 = INDETERMINATE.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SCR = process.env.SCRAPER_COPY_DIR || path.dirname(HERE);
const idk = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
const F = [];
const fail = (m) => F.push(m);
const read = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { idk(`cannot read ${p}`); } };
const code = (s) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|#)/.test(l)).join("\n");
const FN = path.join(SITE, "netlify/functions");

// ── (a) static ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const RECEIVERS = ["apply-plan-automatable", "build-recommendations-plan", "nap-and-review-audit", "citation-audit", "gbp-apply-change", "heal-onboarding-errors",
  "refresh-review-metrics", "ai-readiness-audit", "backfill-place-ids", "deep-assess-client", "validate-tracked-keyword", "social-presence-audit", "backfill-gbp-hours", "refresh-pagespeed-background"];
const fnFiles = fs.readdirSync(FN).filter((n) => n.endsWith(".js"));
if (fnFiles.length < 100) idk(`only ${fnFiles.length} functions under ${FN}`);
const TOKEN_READ = /\b(q|qs|query|params)\.token\b|queryStringParameters\s*(\|\|\s*\{\}\s*\))?\s*\??\.\s*token\b|body\.token\b/;
const OWN_CALL = /\.netlify\/functions\/(?!quo-call-webhook)[a-zA-Z0-9-${}]+\?[^`'"\n]*\btoken=/;
for (const n of fnFiles) {
  const src = code(read(path.join(FN, n)));
  if (n === "quo-call-webhook.js") {
    const allowed = /function quoCallAllowed\(event\) \{[\s\S]*?\n\}/.exec(src);
    if (!allowed) { fail("quo-call-webhook.js has no quoCallAllowed(event)"); continue; }
    if (!/const key = process\.env\.QUO_WEBHOOK_SIGNING_KEY \|\| "";\s*\n\s*if \(key\) return quoSignatureOk\(event, key\);/.test(allowed[0])) fail("quo-call-webhook doesn't check Quo's signature first when QUO_WEBHOOK_SIGNING_KEY is set");
    if (TOKEN_READ.test(src.replace(allowed[0], ""))) fail("quo-call-webhook reads ?token= outside quoCallAllowed");
    if (!/if \(!quoCallAllowed\(event\)\) return \{ statusCode: 401/.test(src)) fail("quo-call-webhook's handler doesn't start with quoCallAllowed");
    continue;
  }
  if (TOKEN_READ.test(src)) fail(`${n} reads a token from the address or the body`);
  if (OWN_CALL.test(src)) fail(`${n} calls an RGA function with the token in the address`);
}
for (const r of RECEIVERS) {
  const src = code(read(path.join(FN, `${r}.js`)));
  if (!/require\("\.\/_auth"\)\.requireInternalSecret\(event\)/.test(src)) fail(`${r}.js doesn't check the x-internal-secret header (requireInternalSecret)`);
  if (/QUO_WEBHOOK_TOKEN/.test(src)) fail(`${r}.js still reads QUO_WEBHOOK_TOKEN (Quo's address token is Quo's alone)`);
}
for (const d of ["admin", "portal", "shared"]) {
  let names = []; try { names = fs.readdirSync(path.join(SITE, d)); } catch { continue; }
  for (const n of names.filter((x) => /\.(js|html)$/.test(x))) if (OWN_CALL.test(code(read(path.join(SITE, d, n))))) fail(`${d}/${n} calls an RGA function with a token in the address`);
}
// the Scraper side: scripts and the flow playbooks (this gate and the gates' fixtures excepted)
const scrFiles = [];
const walk = (d, rel) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { if (e.isDirectory()) { if (!/^(node_modules|mutations|output|lib)$/.test(e.name)) walk(path.join(d, e.name), `${rel}/${e.name}`); } else if (/\.(mjs|js|sh)$/.test(e.name)) scrFiles.push([path.join(d, e.name), `${rel}/${e.name}`]); } };
// the mutation copy holds only the targeted Scraper files: walk the real repo, and read a file from the copy when the copy has it
const REAL = path.dirname(HERE);
walk(path.join(REAL, "scripts"), "scripts"); walk(path.join(REAL, "flow"), "flow");
if (scrFiles.length < 100) idk(`only ${scrFiles.length} Scraper scripts found under ${REAL}`);
for (const [p, rel] of scrFiles) {
  if (/check-no-secret-in-a-query-string\.mjs$/.test(rel)) continue;
  const copy = path.join(SCR, rel);
  const src = code(read(SCR !== REAL && fs.existsSync(copy) ? copy : p));
  if (OWN_CALL.test(src) || /functions\/(?!quo-call-webhook)[a-z0-9-]+\?token=\$\{/.test(src)) fail(`${rel} calls an RGA function with the token in the address`);
  if (/QUO_WEBHOOK_TOKEN\s*\|\|\s*['"][0-9a-f]{16,}['"]/.test(src)) fail(`${rel} carries a hardcoded QUO_WEBHOOK_TOKEN (a live secret in git)`);
}

// ── (b) self-proving on the real files ───────────────────────────────────────────────────────────────────────────────────
const require = createRequire(path.join(FN, "_auth.js"));
const saved = { s: process.env.INTERNAL_FN_SECRET, k: process.env.QUO_WEBHOOK_SIGNING_KEY, t: process.env.QUO_WEBHOOK_TOKEN };
let A, Q;
try { A = require("./_auth.js"); Q = require("./quo-call-webhook.js"); } catch (e) { idk(`a function won't load: ${String(e.message).slice(0, 140)}`); }
if (!/timingSafeEqual/.test(code(read(path.join(FN, "_auth.js"))))) fail("_auth.js compares the internal secret with !== (not constant time)");
process.env.INTERNAL_FN_SECRET = "s3cret-value-for-the-gate";
const st = (r) => (r.error ? r.error.statusCode : 200);
if (st(A.requireInternalSecret({ headers: { "x-internal-secret": "s3cret-value-for-the-gate" } })) !== 200) fail("the right x-internal-secret header is refused");
if (st(A.requireInternalSecret({ headers: { "x-internal-secret": "s3cret-value-for-the-gaTe" } })) !== 401) fail("a wrong secret of the same length is let in");
if (st(A.requireInternalSecret({ headers: {}, queryStringParameters: { token: "s3cret-value-for-the-gate" } })) !== 401) fail("the secret in the address is let in");
if (st(A.requireInternalSecret({ headers: {} })) !== 401) fail("no header is let in");
const ws = await A.requireWorkspaceForClientOrInternal({ headers: { "x-internal-secret": "s3cret-value-for-the-gate" } }, "c1");
if (!ws.internal) fail("requireWorkspaceForClientOrInternal no longer takes the header");
delete process.env.INTERNAL_FN_SECRET;
if (st(A.requireInternalSecret({ headers: { "x-internal-secret": "" } })) !== 503) fail("with no secret set, internal calls aren't refused (fails open)");
// Quo's signature
const key = crypto.randomBytes(32).toString("base64");
const body = JSON.stringify({ type: "call.completed", data: { object: { id: "AC1" } } });
const now = Date.now();
const sign = (b, ts = String(now), k = key) => `hmac;1;${ts};${crypto.createHmac("sha256", Buffer.from(k, "base64")).update(`${ts}.${b}`).digest("base64")}`;
const ev = (b, sig, qs) => ({ headers: sig ? { "openphone-signature": sig } : {}, body: b, queryStringParameters: qs || {} });
if (!Q.quoSignatureOk(ev(body, sign(body)), key, now)) fail("a correctly signed Quo call is refused");
if (Q.quoSignatureOk(ev(body.replace("AC1", "AC2"), sign(body)), key, now)) fail("a changed body passes Quo's signature check");
if (Q.quoSignatureOk(ev(body, sign(body, String(now - 3600e3))), key, now)) fail("an hour-old signature passes (a replay)");
if (Q.quoSignatureOk(ev(body, sign(body, String(now), crypto.randomBytes(32).toString("base64"))), key, now)) fail("a signature under another key passes");
if (Q.quoSignatureOk(ev(body, ""), key, now)) fail("no signature passes");
process.env.QUO_WEBHOOK_SIGNING_KEY = key; process.env.QUO_WEBHOOK_TOKEN = "addr-token-1234";
if (Q.quoCallAllowed(ev(body, "", { token: "addr-token-1234" }))) fail("with the signing key set, the address token alone still gets in");
delete process.env.QUO_WEBHOOK_SIGNING_KEY;
if (!Q.quoCallAllowed(ev(body, "", { token: "addr-token-1234" }))) fail("before the signing key is set, Quo's address token is refused (calls would stop logging)");
if (Q.quoCallAllowed(ev(body, "", { token: "addr-token-1235" }))) fail("a wrong address token gets in");
for (const [k, v] of [["INTERNAL_FN_SECRET", saved.s], ["QUO_WEBHOOK_SIGNING_KEY", saved.k], ["QUO_WEBHOOK_TOKEN", saved.t]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }

if (F.length) { console.error(`🔴 a secret can travel in an address:\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log(`✅ no secret in an address: ${RECEIVERS.length} internal functions take the x-internal-secret header (constant-time), ${fnFiles.length} functions and ${scrFiles.length} Scraper scripts build no ?token=, Quo's signature is checked once its key is set`);
